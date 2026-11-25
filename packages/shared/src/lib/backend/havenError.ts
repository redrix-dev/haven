/**
 * The one error every backend client throws.
 *
 * The database refuses in one way (docs/architecture/DATABASE.md, "Errors"):
 * an HTTP status, a sentence for a person, and a stable reason word. This is
 * that refusal in TypeScript. Apps decide what to do from `reason` (or the
 * broader `kind`), and may show `message` as it is.
 */

export type HavenErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "invalid"
  /** Not a refusal: the network, the server, or something nobody planned for. */
  | "unavailable";

export class HavenError extends Error {
  readonly kind: HavenErrorKind;
  /** The database's reason word, for example `username_taken` or `cannot_send`. */
  readonly reason: string;

  constructor(
    kind: HavenErrorKind,
    reason: string,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "HavenError";
    // Set by hand: the shared build targets a library without ErrorOptions.
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
    this.kind = kind;
    this.reason = reason;
  }
}

/** True for a HavenError, and for one with this reason when a reason is given. */
export function isHavenError(
  error: unknown,
  reason?: string,
): error is HavenError {
  return (
    error instanceof HavenError &&
    (reason === undefined || error.reason === reason)
  );
}

const KIND_BY_CODE: Record<string, HavenErrorKind> = {
  PT401: "unauthenticated",
  "42501": "forbidden",
  PT404: "not_found",
  PT409: "conflict",
  PT429: "rate_limited",
  "22023": "invalid",
  // The API's own answers to a missing, expired or malformed token.
  PGRST301: "unauthenticated",
  PGRST302: "unauthenticated",
  PGRST303: "unauthenticated",
};

const KIND_BY_STATUS: Record<number, HavenErrorKind> = {
  400: "invalid",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "invalid",
  429: "rate_limited",
};

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const REASON_WORD = /^[a-z][a-z0-9_]*$/;

type DatabaseError = {
  code?: string;
  message: string;
  details?: string | null;
};

/** An error from an RPC or a table read. */
export function fromDatabaseError(error: DatabaseError): HavenError {
  const kind = KIND_BY_CODE[error.code ?? ""];
  if (!kind) {
    // Not one of ours: a bug, or the database is unreachable. Its text is for
    // a developer, not a person.
    return new HavenError("unavailable", "unavailable", GENERIC_MESSAGE, error);
  }
  // Our refusals put the reason word in `details`. Postgres's own refusals
  // (a table nobody may write, say) have none, and the kind stands in.
  const reason =
    error.details && REASON_WORD.test(error.details) ? error.details : kind;
  return new HavenError(
    kind,
    reason,
    reason === kind ? GENERIC_MESSAGE : error.message,
    error,
  );
}

/** An error from storage (uploading or signing a file). */
export function fromStorageError(error: {
  message: string;
  status?: number;
  statusCode?: string | number;
}): HavenError {
  const status = Number(error.status ?? error.statusCode);
  const kind = KIND_BY_STATUS[status] ?? "unavailable";
  return new HavenError(kind, `storage_${kind}`, GENERIC_MESSAGE, error);
}

/**
 * An error from an Edge Function. Haven's functions answer a refusal with
 * `{ reason, message }` and the matching status, the same as the database.
 */
export async function fromFunctionError(error: unknown): Promise<HavenError> {
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    const kind = KIND_BY_STATUS[response.status] ?? "unavailable";
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { reason?: unknown; message?: unknown } | null;
    if (typeof body?.reason === "string" && typeof body.message === "string") {
      return new HavenError(kind, body.reason, body.message, error);
    }
    return new HavenError(kind, kind, GENERIC_MESSAGE, error);
  }
  return new HavenError("unavailable", "unavailable", GENERIC_MESSAGE, error);
}
