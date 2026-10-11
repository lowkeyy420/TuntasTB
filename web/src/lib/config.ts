import "server-only";

import { parseConfig, type AppConfig } from "./config.schema";

/**
 * Typed, validated application configuration.
 *
 * Parsed lazily on first property access (not at import time) so that build
 * steps which merely import a route module do not fail when env is absent.
 * Importing this module from a client component fails the build because of the
 * `server-only` guard, so secrets never reach the browser.
 */
let cached: AppConfig | undefined;

function load(): AppConfig {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}

export const config: AppConfig = new Proxy({} as AppConfig, {
  get(_target, prop: string | symbol) {
    return load()[prop as keyof AppConfig];
  },
  has(_target, prop) {
    return prop in load();
  },
  ownKeys() {
    return Reflect.ownKeys(load() as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(load(), prop);
  },
});

export type { AppConfig } from "./config.schema";
export { CONFIG_KEYS } from "./config.schema";
