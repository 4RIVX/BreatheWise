export async function readJsonResponse<T extends Record<string, unknown>>(
  res: Response
): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(`Server returned an empty response (HTTP ${res.status}).`);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Unexpected response format from server.");
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Server returned a non-JSON response (HTTP ${res.status}). Please retry.`,
        { cause: err }
      );
    }
    throw err;
  }
}
