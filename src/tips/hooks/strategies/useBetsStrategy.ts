import { useMemo } from "react";
import type { BetsResult, DataFileWithResult } from "../../types";
import { createSeededRandom } from "../../utils/seededRandom";

export type BetsStrategyOptions = {
  /** Array of data files with results and probabilities */
  data: DataFileWithResult[];
  /** Number of bets to generate per data file */
  count: number;
  /** Optional base seed for reproducible results (combined with each date) */
  seed?: number;
};

export type BetGenerator = (
  dataFile: DataFileWithResult,
  random: () => number
) => string;

/**
 * Base hook for generating bets using a custom strategy.
 * Handles the common logic of seeding, iteration, and memoization.
 *
 * @param options - Configuration with data array, count, and optional seed
 * @param generateBet - Strategy-specific function to generate a single bet
 * @returns Array of results, each containing the date and generated bets
 */
export function useBetsStrategy(
  { data, count, seed }: BetsStrategyOptions,
  generateBet: BetGenerator
): BetsResult[] {
  return useMemo(() => {
    return data.map((dataFile) => {
      // Generate seed from date, optionally combined with provided seed
      const dateHash = dataFile.date
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const effectiveSeed = seed !== undefined ? seed + dateHash : dateHash;

      const random = createSeededRandom(effectiveSeed);
      const bets: string[] = [];

      for (let i = 0; i < count; i++) {
        bets.push(generateBet(dataFile, random));
      }

      return {
        date: dataFile.date,
        bets,
      };
    });
  }, [data, count, seed, generateBet]);
}
