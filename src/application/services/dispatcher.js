import { DEFAULT_AUTHORIZATION_POLICY, authorize } from "../authorization.js";
import { ApplicationError } from "../errors.js";
import { SCHEMAS } from "../../contracts/definitions.js";
import { validate } from "../../contracts/validator.js";
import { TOOL_BY_NAME } from "./catalog.js";

export class ApplicationDispatcher {
  constructor({ services, clock, authorization = DEFAULT_AUTHORIZATION_POLICY, audit, executionGate, telemetry }) {
    this.services = services;
    this.clock = clock;
    this.authorization = authorization;
    this.audit = audit;
    this.executionGate = executionGate;
    this.telemetry = telemetry;
  }

  async execute(toolName, envelope, identity, execution = {}) {
    if (this.executionGate && !execution.admitted) {
      return this.executionGate.run(toolName, ({ deadline, signal }) => this.execute(toolName, envelope, identity, {
        ...execution,
        admitted: true,
        deadline,
        signal,
      }), { signal: execution.signal, timeoutMilliseconds: execution.timeoutMilliseconds });
    }
    const started = Date.now();
    try {
      const result = await this.#executeOnce(toolName, envelope, identity, execution);
      this.#observe(toolName, envelope, "success", started, result?.repositoryRevision);
      return result;
    } catch (error) {
      this.#observe(toolName, envelope, error?.code === "FORBIDDEN" ? "denied" : "error", started, undefined, error?.code ?? "INTERNAL_ERROR");
      throw error;
    }
  }

  async #executeOnce(toolName, envelope, identity, execution) {
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
      const result = await service.execute(envelope, { authorization: this.authorization, deadline: execution.deadline, identity, now, security: decision, signal: execution.signal });
      await this.#auditSecurity(toolName, envelope, decision, identity, "allowed", now);
      return result;
    } catch (error) {
      await this.#auditSecurity(toolName, envelope, decision, identity, "allowed", now, error.code ?? "INTERNAL_ERROR");
      throw error;
    }
  }

  #observe(operation, envelope, outcome, started, repositoryRevision, errorCategory) {
    try {
      if (errorCategory === "FORBIDDEN") this.telemetry?.increment?.("authorization.denials");
      if (errorCategory === "REPOSITORY_BUSY") this.telemetry?.increment?.("lock.contention");
      if (errorCategory === "INTEGRITY_FAILURE") this.telemetry?.increment?.("integrity.failures");
      this.telemetry?.recordOperation?.({
        correlationId: typeof envelope?.correlationId === "string" ? envelope.correlationId : "unavailable",
        durationMilliseconds: Date.now() - started,
        ...(errorCategory ? { errorCategory } : {}),
        operation,
        outcome,
        ...(Number.isInteger(repositoryRevision) ? { repositoryRevision } : {}),
      });
    } catch { /* operational telemetry cannot change an application outcome */ }
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
