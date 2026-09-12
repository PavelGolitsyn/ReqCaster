const knownKinds = new Set(["business", "software", "external:test", "external:component"]);
const knownPermissions = new Set(["requirements:read", "requirements:validate-draft", "requirements:mutate", "requirements:decide", "requirements:baseline", "requirements:import", "requirements:configure"]);

export function validatePolicy(policy) {
  const issues = [];
  const statuses = new Set(policy?.requirements?.statuses ?? []);
  const transitionKeys = new Set();
  for (const transition of policy?.transitions ?? []) {
    if (!statuses.has(transition.from)) issues.push(`transition source is unknown: ${transition.from}`);
    if (!statuses.has(transition.to)) issues.push(`transition target is unknown: ${transition.to}`);
    if (transition.from === transition.to) issues.push(`self transition is contradictory: ${transition.from}`);
    if (!knownPermissions.has(transition.permission)) issues.push(`transition permission is unknown: ${transition.permission}`);
    const key = `${transition.from}->${transition.to}`;
    if (transitionKeys.has(key)) issues.push(`duplicate transition: ${key}`);
    transitionKeys.add(key);
  }
  const relationshipTypes = new Set();
  for (const relationship of policy?.relationships ?? []) {
    if (relationshipTypes.has(relationship.type)) issues.push(`duplicate relationship rule: ${relationship.type}`);
    relationshipTypes.add(relationship.type);
    if (relationship.direction !== "source-to-target") issues.push(`relationship direction is invalid: ${relationship.type}`);
    if (![...(relationship.sourceKinds ?? []), ...(relationship.targetKinds ?? [])].every((kind) => knownKinds.has(kind))) {
      issues.push(`relationship has unknown endpoint kind: ${relationship.type}`);
    }
    if (!Number.isInteger(relationship.maxTargets) || relationship.maxTargets < 1) issues.push(`relationship limit must be positive: ${relationship.type}`);
  }
  for (const coverage of policy?.coverageRules ?? []) {
    if (!new Set(["business", "software"]).has(coverage.level)) issues.push(`coverage level is unknown: ${coverage.level}`);
    for (const status of coverage.statuses ?? []) if (!statuses.has(status)) issues.push(`coverage status is unknown: ${status}`);
    for (const type of coverage.requiredRelationshipTypes ?? []) if (!relationshipTypes.has(type)) issues.push(`coverage relationship is unknown: ${type}`);
  }
  for (const status of policy?.baselineReadiness?.allowedStatuses ?? []) {
    if (!statuses.has(status)) issues.push(`baseline status is unknown: ${status}`);
  }
  const limits = policy?.limits ?? {};
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) issues.push(`limit must be a positive integer: ${name}`);
  }
  if (limits.searchDefault > limits.searchMaximum) issues.push("searchDefault cannot exceed searchMaximum");
  return issues;
}
