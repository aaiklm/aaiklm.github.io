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
 * Counts the number of underdog picks in a bet.
 * An underdog pick is when the selected outcome has odds >= threshold.
 *
 * @param bet - The bet string (e.g., "0102201001211")
 * @param dataFile - The data file containing odds
 * @param oddsThreshold - Minimum odds to be considered an underdog
 * @returns The count of underdog picks
 */
function countUnderdogPicks(
  bet: string,
  dataFile: DataFileWithResult,
  oddsThreshold: number
): number {
  return bet.split("").reduce((count, outcome, matchIndex) => {
    const outcomeIndex = parseInt(outcome, 10);
    // odds array is flat: [home0, draw0, away0, home1, draw1, away1, ...]
    const oddsIndex = matchIndex * 3 + outcomeIndex;
    const odds = dataFile.odds[oddsIndex];
    return odds >= oddsThreshold ? count + 1 : count;
  }, 0);
}

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

export type LimitedUnderdogBetsStrategyOptions = BetsStrategyOptions & {
  /**
   * Maximum number of underdog picks allowed per bet.
   * Default: 3
   */
  maxUnderdogPicks?: number;
  /**
   * Odds threshold to be considered an underdog pick.
   * An outcome with odds >= this value is an underdog.
   * Default: 4
   */
  underdogOddsThreshold?: number;
};

/**
 * Generates random bets with a limit on underdog picks.
 * Rejects bets that have too many high-odds (underdog) selections.
 *
 * @param options - Configuration with data, count, seed, and underdog limits
 * @returns Array of results, each containing the date and generated bets
 */
export function limitedUnderdogBetsStrategy({
  data,
  count,
  seed,
  maxUnderdogPicks = 3,
  underdogOddsThreshold = 4,
}: LimitedUnderdogBetsStrategyOptions): BetsResult[] {
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
    let totalAttempts = 0;

    // Keep generating until we have enough unique bets within underdog limit
    while (betsSet.size < count) {
      const previousSize = betsSet.size;
      const bet = generateRandomBet(dataFile, random);
      const underdogCount = countUnderdogPicks(
        bet,
        dataFile,
        underdogOddsThreshold
      );

      totalAttempts++;

      // Only add bet if underdog count is within limit
      if (underdogCount <= maxUnderdogPicks) {
        betsSet.add(bet);
      }

      if (betsSet.size === previousSize) {
        iterationsAtCurrentSize++;

        if (iterationsAtCurrentSize >= maxIterationsPerSeed) {
          seedAttempts++;
          if (seedAttempts >= maxSeedAttempts) {
            console.warn(
              `[limitedUnderdogBetsStrategy] Hit break for ${dataFile.date}: ` +
                `only found ${betsSet.size}/${count} bets with <= ${maxUnderdogPicks} underdogs (odds >= ${underdogOddsThreshold}) ` +
                `after ${totalAttempts} attempts`
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

    return {
      date: dataFile.date,
      bets: Array.from(betsSet),
    };
  });
}
