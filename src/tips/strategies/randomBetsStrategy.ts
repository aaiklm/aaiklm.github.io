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

export type RandomBetsStrategyOptions = BetsStrategyOptions & {
  /**
   * Optional initial bets to start with.
   * Map of date -> array of bet strings.
   */
  initialBets?: Map<string, string[]>;
};

/**
 * Counts the number of underdog picks in a bet.
 * An underdog pick is when the selected outcome has probability <= threshold.
 *
 * @param bet - The bet string (e.g., "0102201001211")
 * @param dataFile - The data file containing odds
 * @param probabilityThreshold - Maximum probability to be considered an underdog (e.g., 0.25 = 25%)
 * @returns The count of underdog picks
 */
function countUnderdogPicks(
  bet: string,
  dataFile: DataFileWithResult,
  probabilityThreshold: number
): number {
  return bet.split("").reduce((count, outcome, matchIndex) => {
    const outcomeIndex = parseInt(outcome, 10);
    // odds array is flat: [home0, draw0, away0, home1, draw1, away1, ...]
    const oddsIndex = matchIndex * 3 + outcomeIndex;
    const odds = dataFile.odds[oddsIndex];
    // Convert odds to implied probability: probability = 1 / odds
    const probability = 1 / odds;
    return probability <= probabilityThreshold ? count + 1 : count;
  }, 0);
}

/**
 * Generates random bets based on probability distribution.
 * Uses deterministic seeding for reproducible results.
 * Ensures all generated bets are unique (no duplicates).
 *
 * @param options - Configuration with data array, count, optional seed, and optional initial bets
 * @returns Array of results, each containing the date and generated bets
 */
export function randomBetsStrategy({
  data,
  count,
  seed,
  initialBets,
}: RandomBetsStrategyOptions): BetsResult[] {
  return data.map((dataFile) => {
    // Generate seed from date, optionally combined with provided seed
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const effectiveSeed = seed !== undefined ? seed + dateHash : dateHash;

    let currentSeed = effectiveSeed;
    let random = createSeededRandom(currentSeed);
    // Initialize with existing bets if provided
    const existingBets = initialBets?.get(dataFile.date) ?? [];
    const betsSet = new Set<string>(existingBets);

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

export type LimitedUnderdogBetsStrategyOptions = BetsStrategyOptions & {
  /**
   * Maximum number of underdog picks allowed per bet.
   * Default: 3
   */
  maxUnderdogPicks?: number;
  /**
   * Probability threshold to be considered an underdog pick.
   * An outcome with probability <= this value is an underdog.
   * Example: 0.25 means 25% implied probability (equivalent to odds >= 4)
   * Default: 0.25
   */
  underdogProbabilityThreshold?: number;
};

/**
 * Generates random bets with a limit on underdog picks.
 * Rejects bets that have too many low-probability (underdog) selections.
 * Falls back to random bets if not enough valid bets are found.
 *
 * @param options - Configuration with data, count, seed, and underdog limits
 * @returns Array of results, each containing the date and generated bets
 */
export function limitedUnderdogBetsStrategy({
  data,
  count,
  seed,
  maxUnderdogPicks = 3,
  underdogProbabilityThreshold = 0.25,
}: LimitedUnderdogBetsStrategyOptions): BetsResult[] {
  const initialBets = new Map<string, string[]>();

  // First pass: try to find bets within underdog limit
  for (const dataFile of data) {
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
    let totalAttempts = 0;

    while (betsSet.size < count) {
      const previousSize = betsSet.size;
      const bet = generateRandomBet(dataFile, random);
      const underdogCount = countUnderdogPicks(
        bet,
        dataFile,
        underdogProbabilityThreshold
      );

      totalAttempts++;

      if (underdogCount <= maxUnderdogPicks) {
        betsSet.add(bet);
      }

      if (betsSet.size === previousSize) {
        iterationsAtCurrentSize++;

        if (iterationsAtCurrentSize >= maxIterationsPerSeed) {
          seedAttempts++;
          if (seedAttempts >= maxSeedAttempts) {
            console.warn(
              `[limitedUnderdogBetsStrategy] Hit limit for ${dataFile.date}: ` +
                `only found ${betsSet.size}/${count} bets with <= ${maxUnderdogPicks} underdogs (probability <= ${underdogProbabilityThreshold}) ` +
                `after ${totalAttempts} attempts. Falling back to random bets.`
            );
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

    initialBets.set(dataFile.date, Array.from(betsSet));
  }

  // Use randomBetsStrategy to fill any remaining slots
  return randomBetsStrategy({
    data,
    count,
    seed,
    initialBets,
  });
}
