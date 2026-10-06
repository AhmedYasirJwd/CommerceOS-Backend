/** Detects the public (anon / publishable) key being used where the secret key is required. */
export function looksLikePublicKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).role === 'anon';
  } catch {
    return false;
  }
}
