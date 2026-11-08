import { Pool } from "pg";
import { readConfig, DeliveryConfig } from "./config";
import { createHandler, Operation } from "./http";
import { DeliveryService } from "./service";
import { DeliveryStore } from "./store";

let instance: { url: string; store: DeliveryStore } | undefined;
export function runtimeService(config: DeliveryConfig): DeliveryService {
  if (!instance || instance.url !== config.databaseUrl) {
    // No schema initialization or environment probing occurs here.
    if (instance) void instance.store.pool.end();
    const pool = new Pool({ connectionString: config.databaseUrl, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
      query_timeout: 5000, statement_timeout: 5000 });
    pool.on("error", () => { /* Requests return a redacted error; never log credentials. */ });
    instance = { url: config.databaseUrl, store: new DeliveryStore(pool) };
  }
  return new DeliveryService(instance.store, config);
}

export const handler = (operation: Operation) => createHandler(operation, () => readConfig(process.env), runtimeService);
