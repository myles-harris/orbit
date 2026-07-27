/**
 * Maps raw ApiClient error messages (e.g. "HTTP 403: {\"error\":\"You are not a member\"}")
 * into human-readable strings suitable for displaying in Alert.alert().
 */
export declare function parseApiError(error: unknown): string;
