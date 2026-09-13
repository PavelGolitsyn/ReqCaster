export const REQUIREMENT_ID_PATTERNS = Object.freeze({
  business: /^BR-[0-9]{6}$/,
  software: /^SR-[0-9]{6}$/,
});

export const RELATIONSHIP_ID_PATTERN = /^RL-[0-9]{6}$/;
export const MAX_IDENTIFIER_NUMBER = 999999;

/**
 * Parses a canonical requirement identifier. It deliberately accepts no
 * labels, slugs, whitespace, or case variants.
 */
export function parseRequirementId(value) {
  if (typeof value !== "string") return null;
  if (REQUIREMENT_ID_PATTERNS.business.test(value)) {
    return Object.freeze({ value, level: "business", number: Number(value.slice(3)) });
  }
  if (REQUIREMENT_ID_PATTERNS.software.test(value)) {
    return Object.freeze({ value, level: "software", number: Number(value.slice(3)) });
  }
  return null;
}

export function assertRequirementId(value) {
  const parsed = parseRequirementId(value);
  if (!parsed) {
    throw new TypeError("Requirement ID must match BR-000000 or SR-000000 exactly");
  }
  return parsed;
}

export function parseRelationshipId(value) {
  if (typeof value !== "string" || !RELATIONSHIP_ID_PATTERN.test(value)) return null;
  return Object.freeze({ value, number: Number(value.slice(3)) });
}

export function formatRequirementId(level, number) {
  if (!(level in REQUIREMENT_ID_PATTERNS)) throw new TypeError(`Unknown requirement level: ${level}`);
  return formatIdentifier(level === "business" ? "BR" : "SR", number);
}

export function formatRelationshipId(number) {
  return formatIdentifier("RL", number);
}

function formatIdentifier(prefix, number) {
  if (!Number.isInteger(number) || number < 1 || number > MAX_IDENTIFIER_NUMBER) {
    throw new RangeError(`${prefix} identifier number must be between 1 and ${MAX_IDENTIFIER_NUMBER}`);
  }
  return `${prefix}-${String(number).padStart(6, "0")}`;
}
