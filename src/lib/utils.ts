/**
 * Generate a URL-safe slug for a trip.
 * Format: <sanitized-name>-<random-4-char-hex>
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'trip'
  const suffix = Math.random().toString(16).slice(2, 6)
  return `${base}-${suffix}`
}

/**
 * Parse a comma-separated list of names into clean participant names.
 */
export function parseNames(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
}
