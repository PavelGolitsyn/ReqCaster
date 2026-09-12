/**
 * Transport-neutral port contracts. Implementations are supplied by later
 * stages; these guards make adapter mistakes fail early without a framework.
 */
const methods = Object.freeze({
  Repository: ["read", "execute", "revision"],
  Authorization: ["authorize"],
  Clock: ["now"],
  Identity: ["authenticate"],
  Audit: ["append", "verify"],
  Search: ["query", "rebuild"],
  ReportStorage: ["put", "get"],
});

export const PORT_METHODS = methods;

export function assertPort(name, implementation) {
  if (!methods[name]) throw new TypeError(`Unknown port: ${name}`);
  for (const method of methods[name]) {
    if (typeof implementation?.[method] !== "function") {
      throw new TypeError(`${name} port must implement ${method}()`);
    }
  }
  return implementation;
}
