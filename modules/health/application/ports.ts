/**
 * Port: something the application needs in order to be considered ready (database, storage, ...).
 * `check` resolves if healthy and rejects otherwise. Implementations live in infrastructure.
 */
export interface InfrastructureProbe {
  readonly name: string;
  check(): Promise<void>;
}
