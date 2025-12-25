import type { BetsResult, DataFileWithResult } from "../types";
import { selectOutcome } from "../utils";
import { createSeededRandom } from "../utils/seededRandom";
import type { BetsStrategyOptions } from "./betsStrategy";

/**
 * Generates a single bet string based on probabilities and a seeded random generator.
 * Uses probability distribution to weight the random selection.
 *
 * @param dataFile - The data file containing probabilities
 * @param random - Seeded random function
 * @returns A bet string (e.g., "0102201001211")
 */
function generateRandomBet(
  dataFile: DataFileWithResult,
  random: () => number
): string {
  return dataFile.probabilities
    .map((prob) => selectOutcome(prob, random()))
    .join("");
}

export type RandomBetsStrategyOptions = BetsStrategyOptions;

/**
 * Generates random bets based on probability distribution.
 * Uses deterministic seeding for reproducible results.
 * Ensures all generated bets are unique (no duplicates).
 *
 * @param options - Configuration with data array, count, and optional seed
 * @returns Array of results, each containing the date and generated bets
 */
export function randomBetsStrategy({
  data,
  count,
  seed,
}: RandomBetsStrategyOptions): BetsResult[] {
  return data.map((dataFile) => {
    // Generate seed from date, optionally combined with provided seed
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const effectiveSeed = seed !== undefined ? seed + dateHash : dateHash;

    let currentSeed = effectiveSeed;
    let random = createSeededRandom(currentSeed);
    const betsSet = new Set<string>();

    const maxIterationsPerSeed = 1000;
    const maxSeedAttempts = 100;
    let iterationsAtCurrentSize = 0;
    let seedAttempts = 0;

    // Keep generating until we have enough unique bets
    while (betsSet.size < count) {
      const previousSize = betsSet.size;
      betsSet.add(generateRandomBet(dataFile, random));

      if (betsSet.size === previousSize) {
        iterationsAtCurrentSize++;

        if (iterationsAtCurrentSize >= maxIterationsPerSeed) {
          seedAttempts++;
          if (seedAttempts >= maxSeedAttempts) {
            // Give up and return what we have
            break;
          }
          currentSeed++;
          random = createSeededRandom(currentSeed);
          iterationsAtCurrentSize = 0;
        }
      } else {
        iterationsAtCurrentSize = 0;
      }
    }

    return {
      date: dataFile.date,
      bets: Array.from(betsSet),
    };
  });
}
