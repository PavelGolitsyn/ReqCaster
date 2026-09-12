import { authorize } from "../authorization.js";
import { ApplicationError } from "../errors.js";
import { TOOL_BY_NAME } from "./catalog.js";

export class ApplicationDispatcher {
  constructor({ services, clock }) {
    this.services = services;
    this.clock = clock;
  }

  async execute(toolName, envelope, identity) {
    const contract = TOOL_BY_NAME.get(toolName);
    if (!contract) throw new ApplicationError("NOT_FOUND", "Unknown operation");
    authorize(identity, contract.permission);
    const service = this.services[contract.service];
    if (!service?.execute) throw new ApplicationError("INTERNAL_ERROR", "Operation is not implemented");
    return service.execute(envelope, { identity, now: this.clock.now() });
  }
}
