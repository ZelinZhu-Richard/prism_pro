/** Node timers accept at most a signed 32-bit millisecond delay. */
export const MAX_COMPILE_TIMEOUT_MS = 2_147_483_647;
export interface CompilerLimits {
  /** null/omitted means no elapsed-time cutoff; Stop and owner-loss cleanup remain. */
  timeoutMs?: number | null;
}
export function compileTimeout(value: unknown): number | null {
  if (value === undefined || value === null || value === 0) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 100 ||
    value > MAX_COMPILE_TIMEOUT_MS
  )
    throw new Error(
      "Compiler deadline must be 0 (unlimited) or an integer between 100 and 2147483647 ms.",
    );
  return value;
}
/** Trusted launcher configuration only; imported projects and HTTP cannot set it. */
export function compilerLimitsFromEnvironment(
  environment: Record<string, string | undefined>,
): CompilerLimits {
  const raw = environment.LEAF_COMPILE_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return { timeoutMs: null };
  if (!/^(?:0|[1-9]\d*)$/.test(raw.trim()))
    throw new Error(
      "LEAF_COMPILE_TIMEOUT_MS must be 0 (unlimited) or an integer number of milliseconds.",
    );
  return { timeoutMs: compileTimeout(Number(raw.trim())) };
}
