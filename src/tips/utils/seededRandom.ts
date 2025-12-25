/**
 * Creates a deterministic seeded random number generator.
 * Uses the mulberry32 algorithm - a fast, high-quality 32-bit PRNG.
 *
 * @param seed - The seed value for reproducible random numbers
 * @returns A function that returns a random number between 0 and 1
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed;

  return function mulberry32(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a deterministic random number between 0 and 1 for a given seed.
 * For a single random value, use this. For multiple values, use createSeededRandom.
 *
 * @param seed - The seed value for reproducible random numbers
 * @returns A random number between 0 and 1
 */
export function seededRandom(seed: number): number {
  return createSeededRandom(seed)();
}

