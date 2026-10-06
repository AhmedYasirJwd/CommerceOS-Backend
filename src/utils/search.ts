/** Reduce a free-text search term to characters that are safe inside a PostgREST filter. */
export function sanitizeSearchTerm(term: string): string {
  return term
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s@.+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/**
 * Build a PostgREST `or` filter that matches `term` (case-insensitive
 * substring) against several columns. Returns null for an empty term.
 */
export function buildSearchFilter(columns: string[], term: string): string | null {
  const safe = sanitizeSearchTerm(term);
  if (!safe) return null;
  return columns.map((column) => `${column}.ilike."%${safe}%"`).join(',');
}

/**
 * Combine several PostgREST `or` groups with AND semantics into one `or`
 * expression (PostgREST only applies a single `or` parameter reliably).
 */
export function combineOrGroups(groups: string[]): string | null {
  if (groups.length === 0) return null;
  if (groups.length === 1) return groups[0]!;
  return `and(${groups.map((group) => `or(${group})`).join(',')})`;
}
