/**
 * Human-readable message for a failed API call. Reads RFC 9457 problem details from the API
 * (first validation error, then `detail`), then the demo API's `message`, else `fallback`.
 * Accepts an axios error or a response (the demo adapter resolves error statuses).
 */
export function apiErrorMessage(errOrResponse: unknown, fallback: string): string {
  const source = errOrResponse as { response?: { data?: unknown }; data?: unknown } | null | undefined;
  const data = (source?.response?.data ?? source?.data) as
    | { errors?: Record<string, string[] | string>; detail?: unknown; message?: unknown }
    | null
    | undefined;
  if (!data || typeof data !== 'object') return fallback;

  if (data.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors).flat().find((m) => typeof m === 'string' && m.trim());
    if (first) return first;
  }
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  return fallback;
}
