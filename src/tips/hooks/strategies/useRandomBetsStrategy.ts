import { useCallback } from "react";
import type { BetsResult, DataFileWithResult, Probability } from "../../types";
import { useBetsStrategy, type BetsStrategyOptions } from "./useBetsStrategy";

/**
 * Selects an outcome (0, 1, or 2) based on probabilities and a random value.
 * The random value is compared against cumulative probabilities.
 *
 * @param probabilities - [P_home, P_draw, P_away] that sum to 1
 * @param randomValue - A random value between 0 and 1
 * @returns "0" for home, "1" for draw, "2" for away
 */
function selectOutcome(
  probabilities: Probability,
  randomValue: number
): string {
  const cumulative0 = probabilities[0];
  const cumulative1 = cumulative0 + probabilities[1];

  if (randomValue < cumulative0) {
    return "0"; // home win
  } else if (randomValue < cumulative1) {
    return "1"; // draw
  } else {
    return "2"; // away win
  }
}

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
 * Hook that generates random bets based on probability distribution.
 * Uses deterministic seeding for reproducible results.
 *
 * @param options - Configuration with data array, count, and optional seed
 * @returns Array of results, each containing the date and generated bets
 */
export function useRandomBetsStrategy(
  options: RandomBetsStrategyOptions
): BetsResult[] {
  const generateBet = useCallback(generateRandomBet, []);
  return useBetsStrategy(options, generateBet);
}
