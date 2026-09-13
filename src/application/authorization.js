import { ApplicationError } from "./errors.js";

export const ROLES = Object.freeze([
  "requirements-manager",
  "tester",
  "implementer",
  "reviewer",
]);

export const PERMISSIONS = Object.freeze({
  READ: "requirements:read",
  VALIDATE_DRAFT: "requirements:validate-draft",
  MUTATE: "requirements:mutate",
  DECIDE: "requirements:decide",
  BASELINE: "requirements:baseline",
  IMPORT: "requirements:import",
  CONFIGURE: "requirements:configure",
  AUDIT: "requirements:audit",
});

const readOnly = Object.freeze([PERMISSIONS.READ, PERMISSIONS.VALIDATE_DRAFT]);
export const ROLE_PERMISSIONS = Object.freeze({
  "requirements-manager": Object.freeze([
    ...readOnly,
    PERMISSIONS.MUTATE,
    PERMISSIONS.DECIDE,
    PERMISSIONS.BASELINE,
    PERMISSIONS.IMPORT,
    PERMISSIONS.CONFIGURE,
    PERMISSIONS.AUDIT,
  ]),
  tester: readOnly,
  implementer: readOnly,
  reviewer: readOnly,
});

function stableList(values) {
  return Array.isArray(values) ? [...new Set(values)].sort() : [];
}

function validScope(value) {
  return value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0));
}

function expirationIsValid(identity, now) {
  const expiresAt = identity?.authentication?.expiresAt;
  if (expiresAt === undefined) return true;
  const expiry = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > new Date(now).getTime();
}

export class AuthorizationPolicyEvaluator {
  constructor(options = {}) {
    this.policyVersion = options.policyVersion ?? "1";
    this.repositoryId = options.repositoryId ?? "default";
    this.rolePermissions = options.rolePermissions ?? ROLE_PERMISSIONS;
  }

  evaluate(identity, permission, options = {}) {
    const now = options.now ?? new Date().toISOString();
    let reason = "allowed";
    if (!identity || !ROLES.includes(identity.role)) reason = "unknown-role";
    else if (!identity.agentId || !identity.principal?.id || !identity.authentication?.issuer) reason = "untrusted-identity";
    else if (!expirationIsValid(identity, now)) reason = "expired-identity";
    else if (!(this.rolePermissions[identity.role] ?? []).includes(permission)) reason = "missing-permission";
    else if (![identity?.authorization?.repositories, identity?.authorization?.components, identity?.authorization?.fields].every(validScope)) reason = "invalid-scope";
    const repositories = identity?.authorization?.repositories;
    if (reason === "allowed" && repositories !== undefined && !repositories.includes(this.repositoryId)) reason = "repository-scope";

    const fields = stableList(identity?.authorization?.fields);
    const components = stableList(identity?.authorization?.components);
    const componentRestricted = identity?.authorization?.components !== undefined;
    const fieldRestricted = identity?.authorization?.fields !== undefined;
    const scopeKey = JSON.stringify({
      componentRestricted,
      components,
      fieldRestricted,
      fields,
      permission,
      policyVersion: this.policyVersion,
      principal: identity?.principal?.id ?? "unknown",
      repositories: stableList(repositories),
      role: identity?.role ?? "unknown",
    });
    return Object.freeze({
      allowed: reason === "allowed",
      componentRestricted,
      components,
      fieldRestricted,
      fields,
      permission,
      policyVersion: this.policyVersion,
      principalId: identity?.principal?.id,
      reason,
      repositoryId: this.repositoryId,
      role: identity?.role,
      scopeKey,
    });
  }

  canReadItem(decision, item) {
    if (!decision?.allowed) return false;
    if (!decision.componentRestricted) return true;
    const allocations = item?.allocation ?? item?.customAttributes?.allocation ?? [];
    const values = Array.isArray(allocations) ? allocations : [allocations];
    return values.some((value) => decision.components.includes(value));
  }

  allowedFields(decision, requestedFields) {
    if (!decision?.fieldRestricted) return requestedFields;
    return requestedFields.filter((field) => field === "id" || decision.fields.includes(field));
  }
}

export const DEFAULT_AUTHORIZATION_POLICY = new AuthorizationPolicyEvaluator();

export function authorize(identity, permission, options = {}) {
  const evaluator = options.evaluator ?? DEFAULT_AUTHORIZATION_POLICY;
  const decision = evaluator.evaluate(identity, permission, options);
  if (!decision.allowed) {
    const message = decision.reason === "expired-identity"
      ? "Caller identity has expired"
      : "Caller is not authorized for this operation";
    throw new ApplicationError("FORBIDDEN", message, { securityDecision: decision });
  }
  return decision;
}
