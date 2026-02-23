/**
 * Convert an agent name to a URL-safe slug.
 * Spaces become hyphens, special chars removed, lowercase.
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
