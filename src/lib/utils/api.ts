/**
 * Extract an error message from a failed API response.
 * Attempts to parse JSON and look for an `error` field; falls back to `fallback`.
 */
export async function extractError(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error || fallback
  } catch {
    return fallback
  }
}
