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
  ]),
  tester: readOnly,
  implementer: readOnly,
  reviewer: readOnly,
});

export function authorize(identity, permission) {
  if (!identity || !ROLES.includes(identity.role)) {
    throw new ApplicationError("FORBIDDEN", "Caller is not assigned a recognized agent role");
  }
  if (!identity.agentId || !identity.principal?.id || !identity.authentication?.issuer) {
    throw new ApplicationError("FORBIDDEN", "Authenticated agent and accountable principal are required");
  }
  if (!ROLE_PERMISSIONS[identity.role].includes(permission)) {
    throw new ApplicationError("FORBIDDEN", "Caller is not authorized for this operation");
  }
}
