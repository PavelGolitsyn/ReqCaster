import { DEFAULT_AUTHORIZATION_POLICY, authorize } from "../authorization.js";
import { ApplicationError } from "../errors.js";
import { SCHEMAS } from "../../contracts/definitions.js";
import { validate } from "../../contracts/validator.js";
import { TOOL_BY_NAME } from "./catalog.js";

export class ApplicationDispatcher {
  constructor({ services, clock, authorization = DEFAULT_AUTHORIZATION_POLICY, audit }) {
    this.services = services;
    this.clock = clock;
    this.authorization = authorization;
    this.audit = audit;
  }

  async execute(toolName, envelope, identity, execution = {}) {
    const contract = TOOL_BY_NAME.get(toolName);
    if (!contract) throw new ApplicationError("NOT_FOUND", "Unknown operation");
    const now = this.clock.now();
    let decision;
    try {
      decision = authorize(identity, contract.permission, { evaluator: this.authorization, now });
    } catch (error) {
      await this.#auditSecurity(toolName, envelope, error.securityDecision, identity, "denied", now, error.code ?? "FORBIDDEN");
      throw error;
    }
    try {
      // Legacy in-process callers may omit an envelope. Every transport request
      // carries schemaVersion and is validated here after authorization.
      if (execution.validateRequest || envelope?.schemaVersion !== undefined || envelope?.correlationId !== undefined) {
        const issues = validate(SCHEMAS[contract.input], envelope);
        if (issues.length) throw new ApplicationError("SCHEMA_VIOLATION", "Request does not match the operation contract", { details: issues });
      }
      const service = this.services[contract.service];
      if (!service?.execute) throw new ApplicationError("INTERNAL_ERROR", "Operation is not implemented");
      const result = await service.execute(envelope, { authorization: this.authorization, identity, now, security: decision });
      await this.#auditSecurity(toolName, envelope, decision, identity, "allowed", now);
      return result;
    } catch (error) {
      await this.#auditSecurity(toolName, envelope, decision, identity, "allowed", now, error.code ?? "INTERNAL_ERROR");
      throw error;
    }
  }

  async #auditSecurity(toolName, envelope, decision, identity, outcome, now, errorCategory) {
    if (!this.audit?.append) return;
    const correlationId = typeof envelope?.correlationId === "string" && envelope.correlationId.length <= 128
      ? envelope.correlationId
      : "unavailable";
    await this.audit.append({
      agentId: identity?.agentId,
      correlationId,
      decision: outcome,
      ...(errorCategory ? { errorCategory } : {}),
      event: "authorization-decision",
      operation: toolName,
      policyVersion: decision?.policyVersion ?? this.authorization.policyVersion,
      principalId: decision?.principalId ?? identity?.principal?.id,
      role: decision?.role ?? identity?.role,
      timestamp: now,
    });
  }
}
