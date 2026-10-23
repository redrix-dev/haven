/** The error's own message when it has one, otherwise the fallback. For user-facing load errors. */
export function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
