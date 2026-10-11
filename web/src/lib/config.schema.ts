import { z } from "zod";

/**
 * Configuration schema. Kept separate from `config.ts` (which carries the
 * `server-only` guard) so unit tests can call `parseConfig` with a synthetic
 * environment without pulling in the server-only runtime constraint.
 */

const DEFAULT_LANGFLOW_BASE_URL = "http://host.docker.internal:7860";
const DEFAULT_LANGFLOW_TIMEOUT_MS = 15000;

export const configSchema = z.object({
  // Required.
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string({ required_error: "SESSION_SECRET is required" })
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  HASH_PEPPER: z
    .string({ required_error: "HASH_PEPPER is required" })
    .min(32, "HASH_PEPPER must be at least 32 characters"),
  APP_BASE_URL: z
    .string({ required_error: "APP_BASE_URL is required" })
    .url("APP_BASE_URL must be a valid URL"),

  // Optional with defaults.
  LANGFLOW_BASE_URL: z
    .string()
    .url("LANGFLOW_BASE_URL must be a valid URL")
    .default(DEFAULT_LANGFLOW_BASE_URL),
  LANGFLOW_API_KEY: z.string().optional(),
  LANGFLOW_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_LANGFLOW_TIMEOUT_MS),
  INTERNAL_API_TOKEN: z.string().optional(),
  SEED_NURSE_EMAIL: z.string().email().optional(),
  SEED_NURSE_PASSWORD: z.string().optional(),
});

/** Every environment variable the application reads. Kept in one place so the
 * `.env.example` parity test can compare against it. */
export const CONFIG_KEYS = Object.keys(configSchema.shape) as Array<
  keyof typeof configSchema.shape
>;

export type AppConfig = z.infer<typeof configSchema> & {
  /** True when no Langflow API key is configured: the system runs in
   * rules-only mode and never calls the LLM. */
  rulesOnly: boolean;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parses and validates configuration. Throws a {@link ConfigError} naming the
 * offending variable(s) and never echoing their values.
 */
export function parseConfig(
  env: Record<string, string | undefined>,
): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.message)
      .join("; ");
    throw new ConfigError(`Invalid configuration: ${names}`);
  }
  const parsed = result.data;
  return {
    ...parsed,
    rulesOnly: !parsed.LANGFLOW_API_KEY || parsed.LANGFLOW_API_KEY.length === 0,
  };
}
