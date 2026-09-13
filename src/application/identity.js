import { ApplicationError } from "./errors.js";

function cloneIdentity(value) {
  return structuredClone(value);
}

/**
 * Maps an opaque, transport-verified credential to an application identity.
 * Credential contents are never copied into the returned identity or audit data.
 */
export class TrustedIdentityResolver {
  constructor({ lookup, audience, issuers = [] }) {
    if (typeof lookup !== "function") throw new TypeError("Identity lookup must be a function");
    this.lookup = lookup;
    this.audience = audience;
    this.issuers = new Set(issuers);
  }

  async authenticate(credential, context = {}) {
    if (credential === undefined || credential === null || credential === "") {
      throw new ApplicationError("FORBIDDEN", "Authentication is required");
    }
    const mapped = await this.lookup(credential, context);
    if (!mapped?.agentId || !mapped?.principal?.id || !mapped?.authentication?.issuer) {
      throw new ApplicationError("FORBIDDEN", "Authentication failed");
    }
    if (this.issuers.size && !this.issuers.has(mapped.authentication.issuer)) {
      throw new ApplicationError("FORBIDDEN", "Authentication failed");
    }
    if (this.audience && mapped.authentication.audience !== this.audience) {
      throw new ApplicationError("FORBIDDEN", "Authentication failed");
    }
    const expiry = mapped.authentication.expiresAt;
    if (expiry !== undefined) {
      const timestamp = typeof expiry === "number" ? expiry : Date.parse(expiry);
      const now = context.now === undefined ? Date.now() : new Date(context.now).getTime();
      if (!Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp <= now) {
        throw new ApplicationError("FORBIDDEN", "Authentication failed");
      }
    }
    const identity = cloneIdentity(mapped);
    delete identity.credential;
    delete identity.token;
    return Object.freeze(identity);
  }
}

export function staticIdentityLookup(entries) {
  const identities = new Map(entries);
  return async (credential) => identities.get(credential);
}
