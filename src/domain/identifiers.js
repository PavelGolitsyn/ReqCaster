export const REQUIREMENT_ID_PATTERNS = Object.freeze({
  business: /^BR-[0-9]{6}$/,
  software: /^SR-[0-9]{6}$/,
});

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
