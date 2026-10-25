/**
 * Every failure the scaffolder reports. The full union for all specs is defined
 * here so later modules only add cases to `switch`es.
 */
export type ErrorCode =
  | "AXES_INVALID"
  | "LAYER_INVALID"
  | "UNKNOWN_LAYER"
  | "INCLUDE_CYCLE"
  | "AXIS_DISABLED"
  | "REQUIRES_UNMET"
  | "CONFLICT"
  | "ENGINE_UNSUPPORTED"
  | "AGENT_COLLISION"
  // render (02)
  | "FILE_COLLISION"
  | "VARIANT_FILE_COLLISION"
  | "STALE_OVERRIDE"
  | "PACKAGE_JSON_CONFLICT"
  | "MISSING_SCRIPT"
  | "PATCH_TARGET_MISSING"
  | "ANCHOR_NOT_IN_FOUNDATION"
  | "ANCHOR_MISSING"
  | "ANCHOR_DUPLICATE"
  | "UNKNOWN_PLACEHOLDER"
  | "UNKNOWN_SECTION"
  | "UNKNOWN_AGENT"
  | "UNKNOWN_MCP_SERVER"
  | "MCP_COLLISION"
  | "UNPINNED_PROVIDER"
  | "MISSING_RESOURCE"
  | "POSTINSTALL_UNPINNED"
  | "LEFTOVER_MARKER"
  // cli / install (03)
  | "NO_NAME"
  | "INVALID_NAME"
  | "TARGET_NOT_EMPTY"
  | "MISSING_FLAGS"
  | "PREFLIGHT_FAILED"
  | "STEP_FAILED";

/**
 * A user-facing failure: `message` says what failed and why, `fix` says the
 * exact flag or action that resolves it.
 */
export class BonesmithError extends Error {
  readonly code: ErrorCode;
  readonly fix: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, fix: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BonesmithError";
    this.code = code;
    this.fix = fix;
    this.details = details;
  }
}

export function isBonesmithError(value: unknown): value is BonesmithError {
  return value instanceof BonesmithError;
}
