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

const ADJECTIVES = [
  "swift", "bright", "calm", "bold", "keen",
  "wild", "cool", "fast", "wise", "warm",
  "sharp", "pure", "deep", "fair", "grand",
  "vivid", "noble", "rapid", "lucky", "agile",
];

const NOUNS = [
  "falcon", "coral", "river", "spark", "cedar",
  "tiger", "frost", "blaze", "orbit", "prism",
  "lotus", "storm", "ember", "ridge", "comet",
  "raven", "atlas", "nova", "pulse", "flint",
];

/**
 * Generate a random agent name like "swift-falcon".
 */
export function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}
