import { createHash } from "node:crypto";

import { IntegrityError } from "./errors.js";

function assertCanonicalValue(value, path, seen) {
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new TypeError(`${path} contains an unpaired Unicode surrogate`);
    if (value !== value.normalize("NFC")) throw new TypeError(`${path} is not NFC-normalized`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite JSON number`);
    if (Object.is(value, -0)) throw new TypeError(`${path} must not be negative zero`);
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
    seen.add(value);
    value.forEach((item, index) => assertCanonicalValue(item, `${path}/${index}`, seen));
    seen.delete(value);
    return;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
    seen.add(value);
    for (const key of Object.keys(value)) {
      assertCanonicalValue(key, `${path}/<key>`, seen);
      assertCanonicalValue(value[key], `${path}/${key}`, seen);
    }
    seen.delete(value);
    return;
  }
  throw new TypeError(`${path} contains a value that JSON cannot represent`);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

export function canonicalStringify(value) {
  assertCanonicalValue(value, "", new Set());
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalStringify(value), "utf8");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalHash(value) {
  return sha256(canonicalBytes(value));
}

// JSON.parse keeps the last duplicate key. This small recursive-descent parser
// rejects duplicates before an object can become ambiguous.
export function parseStrictJson(input, options = {}) {
  const maximumBytes = options.maximumBytes ?? 5_000_000;
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  if (bytes.length > maximumBytes) throw new IntegrityError(`JSON document exceeds ${maximumBytes} bytes`);
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new IntegrityError("JSON document is not valid UTF-8");
  }
  if (source.charCodeAt(0) === 0xfeff) throw new IntegrityError("JSON document must not contain a byte-order mark");
  if (source.includes("\r")) throw new IntegrityError("JSON document must use LF line endings");
  if (source !== source.normalize("NFC")) throw new IntegrityError("JSON document contains non-NFC Unicode");

  let cursor = 0;
  const fail = (reason) => { throw new IntegrityError(`${reason} at byte offset ${Buffer.byteLength(source.slice(0, cursor), "utf8")}`); };
  const whitespace = () => { while (source[cursor] === " " || source[cursor] === "\t" || source[cursor] === "\n") cursor += 1; };
  const string = () => {
    const start = cursor;
    if (source[cursor] !== '"') fail("Expected string");
    cursor += 1;
    let escaped = false;
    while (cursor < source.length) {
      const character = source[cursor];
      if (!escaped && character === '"') {
        cursor += 1;
        try { return JSON.parse(source.slice(start, cursor)); } catch { fail("Invalid JSON string"); }
      }
      if (!escaped && character.charCodeAt(0) < 0x20) fail("Unescaped control character");
      if (!escaped && character === "\\") escaped = true;
      else escaped = false;
      cursor += 1;
    }
    fail("Unterminated string");
  };
  const value = () => {
    whitespace();
    if (source[cursor] === '"') return string();
    if (source[cursor] === "{") return object();
    if (source[cursor] === "[") return array();
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]]) {
      if (source.startsWith(literal, cursor)) { cursor += literal.length; return result; }
    }
    const match = source.slice(cursor).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (match) {
      cursor += match[0].length;
      const result = Number(match[0]);
      if (!Number.isFinite(result) || Object.is(result, -0)) fail("Invalid finite JSON number");
      return result;
    }
    fail("Expected JSON value");
  };
  const object = () => {
    cursor += 1;
    const result = {};
    const keys = new Set();
    whitespace();
    if (source[cursor] === "}") { cursor += 1; return result; }
    while (true) {
      whitespace();
      const key = string();
      if (keys.has(key)) fail(`Duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace();
      if (source[cursor] !== ":") fail("Expected colon");
      cursor += 1;
      result[key] = value();
      whitespace();
      if (source[cursor] === "}") { cursor += 1; return result; }
      if (source[cursor] !== ",") fail("Expected comma or closing brace");
      cursor += 1;
    }
  };
  const array = () => {
    cursor += 1;
    const result = [];
    whitespace();
    if (source[cursor] === "]") { cursor += 1; return result; }
    while (true) {
      result.push(value());
      whitespace();
      if (source[cursor] === "]") { cursor += 1; return result; }
      if (source[cursor] !== ",") fail("Expected comma or closing bracket");
      cursor += 1;
    }
  };

  const result = value();
  whitespace();
  if (cursor !== source.length) fail("Unexpected trailing content");
  assertCanonicalValue(result, "", new Set());
  return result;
}
