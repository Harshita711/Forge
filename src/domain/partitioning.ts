// FNV-1a — fast, deterministic, non-cryptographic; exactly what a stable
// insert-time partition assignment needs (Section 11.2 explicitly does not
// require cryptographic hashing, just an even, stable split).
export function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function partitionKeyForJobId(jobId: string, partitionCount: number): number | undefined {
  if (partitionCount <= 1) return undefined;
  return fnv1aHash(jobId) % partitionCount;
}
