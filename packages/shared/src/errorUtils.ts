/**
 * Maps raw ApiClient error messages (e.g. "HTTP 403: {\"error\":\"You are not a member\"}")
 * into human-readable strings suitable for displaying in Alert.alert().
 */
export function parseApiError(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';

  const msg = error.message;

  // Pattern: "HTTP <status>: <body>"
  const match = msg.match(/^HTTP (\d+): (.*)$/s);
  if (!match) return 'Something went wrong. Please try again.';

  const status = parseInt(match[1], 10);
  let body = match[2];

  // Try to extract a structured error code from JSON body
  try {
    const parsed = JSON.parse(body);
    if (parsed.error) body = parsed.error;
  } catch {
    // body is plain text, use as-is
  }

  // Map known error codes/statuses to friendly messages
  if (status === 401 || body === 'session_expired') return 'Your session has expired. Please log in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return 'That item could not be found.';
  if (status === 409 || body === 'username_taken') return 'That username is already taken.';
  if (status >= 500) return 'Server error. Please try again later.';
  if (status === 400) return 'Invalid request. Please check your input.';

  return 'Something went wrong. Please try again.';
}
