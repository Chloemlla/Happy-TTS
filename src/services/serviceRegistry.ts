/**
 * ServiceRegistry — typed service lookup with lifecycle tracking.
 *
 * Replaces ad-hoc globalThis assignments (e.g. EMAIL_ENABLED, EMAIL_SERVICE_STATUS)
 * with a typed, traceable registry. Each service registers once during startup
 * and is read-only thereafter.
 *
 * Usage:
 *   ServiceRegistry.register("email", { enabled: true, status: { available: true } });
 *   const email = ServiceRegistry.get("email"); // EmailServiceState | undefined
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private readonly services = new Map<string, unknown>();
  private readonly frozen = new Set<string>();

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register a service. Each service name may be registered only once;
   * duplicate names throw to catch accidental overwrites.
   */
  register<T>(name: string, service: T): void {
    if (this.frozen.has(name)) {
      throw new Error(
        `ServiceRegistry: "${name}" is already registered and frozen. ` +
          "Use isRegistered() to check before registering.",
      );
    }
    this.services.set(name, service);
    this.frozen.add(name);
  }

  /**
   * Look up a previously registered service. Returns undefined when the
   * service has not been registered yet (caller should handle the missing
   * case — typically a startup ordering issue).
   */
  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Check whether a service name has been registered.
   */
  isRegistered(name: string): boolean {
    return this.frozen.has(name);
  }

  /**
   * Return all registered service names (for diagnostics / logging).
   */
  registeredNames(): string[] {
    return Array.from(this.frozen);
  }

  /** Reset the registry (test helper only). */
  _reset(): void {
    this.services.clear();
    this.frozen.clear();
  }
}

// Singleton convenience reference
export const serviceRegistry = ServiceRegistry.getInstance();