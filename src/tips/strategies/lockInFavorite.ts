import type { DataFileWithResult, Probability } from "../types";

export type LockInFavoriteOptions = {
  /** Array of data files with results and probabilities */
  data: DataFileWithResult[];
  /**
   * Odds threshold below which the favorite is locked in.
   * If any odd is below this value, the other odds in the triplet are set to 9999.
   * Default: 1.25
   */
  threshold?: number;
};

/**
 * Recalculates probabilities from the given odds array.
 */
function calculateProbabilities(odds: number[]): Probability[] {
  const probabilities: Probability[] = [];
  for (let i = 0; i < odds.length; i += 3) {
    const rawProbs = [1 / odds[i], 1 / odds[i + 1], 1 / odds[i + 2]];
    const sum = rawProbs[0] + rawProbs[1] + rawProbs[2];
    probabilities.push([
      rawProbs[0] / sum,
      rawProbs[1] / sum,
      rawProbs[2] / sum,
    ]);
  }
  return probabilities;
}

/**
 * Locks in heavy favorites by setting competing odds to near-impossible values.
 * When any odd in a triplet (home/draw/away) is below the threshold,
 * the other two odds are set to 9999, effectively guaranteeing selection
 * of the favorite.
 *
 * @param options - Configuration with data array and optional threshold
 * @returns Array of data files with adjusted odds and recalculated probabilities
 */
export function lockInFavorite({
  data,
  threshold = 1.25,
}: LockInFavoriteOptions): DataFileWithResult[] {
  return data.map((dataFile) => {
    const adjustedOdds: number[] = [];

    // Process odds in triplets (home, draw, away)
    for (let i = 0; i < dataFile.odds.length; i += 3) {
      const homeOdd = dataFile.odds[i];
      const drawOdd = dataFile.odds[i + 1];
      const awayOdd = dataFile.odds[i + 2];

      // Check if any odd is below threshold
      if (homeOdd < threshold) {
        // Lock in home win
        adjustedOdds.push(homeOdd, 9999, 9999);
      } else if (drawOdd < threshold) {
        // Lock in draw (rare, but possible)
        adjustedOdds.push(9999, drawOdd, 9999);
      } else if (awayOdd < threshold) {
        // Lock in away win
        adjustedOdds.push(9999, 9999, awayOdd);
      } else {
        // No favorite below threshold, keep original odds
        adjustedOdds.push(homeOdd, drawOdd, awayOdd);
      }
    }

    // Recalculate probabilities with the adjusted odds
    const probabilities = calculateProbabilities(adjustedOdds);

    return {
      ...dataFile,
      odds: adjustedOdds,
      probabilities,
    };
  });
}

