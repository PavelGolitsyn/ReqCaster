import assert from "node:assert/strict";
import test from "node:test";

import { canonicalHash, canonicalStringify, parseStrictJson } from "../../src/adapters/repository/index.js";

test("canonical serialization is stable across insertion orders", () => {
  const left = { z: [3, { b: true, a: "é" }], a: 1 };
  const right = { a: 1, z: [3, { a: "é", b: true }] };
  const golden = "{\n  \"a\": 1,\n  \"z\": [\n    3,\n    {\n      \"a\": \"é\",\n      \"b\": true\n    }\n  ]\n}\n";
  assert.equal(canonicalStringify(left), golden);
  assert.equal(canonicalStringify(right), golden);
  assert.equal(canonicalHash(left), canonicalHash(right));
});

test("strict JSON rejects duplicate keys and ambiguous representations", () => {
  assert.throws(() => parseStrictJson('{"id":1,"id":2}\n'), /Duplicate object key/);
  assert.throws(() => parseStrictJson('{"text":"é"}\n'), /non-NFC/);
  assert.throws(() => parseStrictJson('{"number":1}\r\n'), /LF line endings/);
  assert.throws(() => parseStrictJson('{"number":1e999}\n'), /finite JSON number/);
  assert.throws(() => parseStrictJson('{"text":"\\ud800"}\n'), /unpaired Unicode surrogate/);
  assert.throws(() => parseStrictJson('{"number":1}\u2003'), /trailing content/);
  assert.throws(() => canonicalStringify({ number: Number.NaN }), /finite JSON number/);
  assert.throws(() => canonicalStringify({ number: Number.POSITIVE_INFINITY }), /finite JSON number/);
});

test("strict JSON enforces an input byte bound", () => {
  assert.throws(() => parseStrictJson('{"value":"123456"}\n', { maximumBytes: 10 }), /exceeds 10 bytes/);
});
