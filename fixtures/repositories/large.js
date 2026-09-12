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
