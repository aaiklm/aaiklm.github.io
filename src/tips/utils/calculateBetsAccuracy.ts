import type { BetsResult, DataFileWithResult } from "../types";

export type AccuracyResult = {
  /** The date of the data file */
  date: string;
  /** Array where index i contains the count of bets with exactly i correct predictions */
  accuracy: number[];
};

/**
 * Calculates how many bets had 0 correct, 1 correct, 2 correct, etc.
 * Returns separate accuracy arrays for each data file.
 *
 * @param data - Array of data files containing the actual results
 * @param betsResults - Array of bets to evaluate
 * @returns Array of results, each containing the date and accuracy counts
 */
export function calculateBetsAccuracy(
  data: DataFileWithResult[],
  betsResults: BetsResult[]
): AccuracyResult[] {
  // Create a map of date -> bets for quick lookup
  const betsByDate = new Map(betsResults.map((b) => [b.date, b.bets]));

  return data.map((dataFile) => {
    const matchCount = dataFile.result.length;
    const accuracyCounts = new Array<number>(matchCount + 1).fill(0);

    const bets = betsByDate.get(dataFile.date);
    if (bets) {
      for (const bet of bets) {
        let correctCount = 0;

        for (let i = 0; i < matchCount; i++) {
          if (bet[i] === dataFile.result[i]) {
            correctCount++;
          }
        }

        accuracyCounts[correctCount]++;
      }
    }

    return {
      date: dataFile.date,
      accuracy: accuracyCounts,
    };
  });
}
