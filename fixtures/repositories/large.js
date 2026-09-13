export function makeLargeRepository(count = 10000) {
  return {
    fixtureType: "large",
    schemaVersion: "1.0.0",
    business: Array.from({ length: count }, (_, index) => ({
      id: `BR-${String(index + 1).padStart(6, "0")}`,
      version: 1,
      statement: `Generated bounded fixture requirement ${index + 1}`,
    })),
    software: [],
    relationships: [],
  };
}

export function projectedCurrentStateFixture(size = 100_000, repositoryRevision = 1) {
  if (!Number.isInteger(size) || size < 1 || size > 200_000) throw new RangeError("size must be between 1 and 200000");
  const businessCount = Math.ceil(size / 2);
  const softwareCount = size - businessCount;
  const requirement = (level, number) => ({
    category: number % 10 === 0 ? "safety" : "functional",
    criticality: number % 10 === 0 ? "safety-critical" : "none",
    id: `${level === "business" ? "BR" : "SR"}-${String(number).padStart(6, "0")}`,
    level,
    priority: number % 4 === 0 ? "high" : "medium",
    provenance: { updatedAt: `2026-01-${String((number % 28) + 1).padStart(2, "0")}T00:00:00.000Z` },
    statement: `The ${level} system shall provide deterministic bounded search behavior for projected item ${number}.`,
    status: number % 5 === 0 ? "approved" : "draft",
    verificationMethods: number % 3 === 0 ? ["test"] : [],
    version: 1,
  });
  const document = (level, count) => ({
    documentType: level,
    relationships: [],
    repositoryRevision,
    requirements: Array.from({ length: count }, (_, index) => requirement(level, index + 1)),
    schemaVersion: "1.0.0",
  });
  return { business: document("business", businessCount), software: document("software", softwareCount) };
}
