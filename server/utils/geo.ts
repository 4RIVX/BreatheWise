export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sanitizeProviderErrorMessage(
  err: unknown,
  fallback = "Network error"
): string {
  const raw = err instanceof Error ? err.message : fallback;
  return raw
    .replace(/([?&]api[-_]?key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/Bearer\s+[0-9A-Za-z._-]+/gi, "Bearer [REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
