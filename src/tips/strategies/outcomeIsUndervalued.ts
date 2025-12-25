import type { DataFileWithResult, Probability } from "../types";

export type Outcome = "home" | "draw" | "away";

export type OutcomeBiasOptions = {
  /** Array of data files with results and probabilities */
  data: DataFileWithResult[];
  /** Which outcome to bias: "home", "draw", or "away" */
  outcome: Outcome;
  /**
   * Factor to reduce odds by (0.0 - 1.0).
   * E.g., 0.1 means odds are reduced by 10%.
   * Default: 0.1
   */
  bias?: number;
};

const outcomeIndexMap: Record<Outcome, number> = {
  home: 0,
  draw: 1,
  away: 2,
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
 * Adjusts odds to favor a specified outcome slightly more.
 * Reduces the specified outcome's odds by the bias factor, making that outcome
 * appear more likely when probabilities are calculated.
 *
 * @param options - Configuration with data array, outcome to bias, and optional bias factor
 * @returns Array of data files with adjusted odds and recalculated probabilities
 */
export function outcomeIsUndervalued({
  data,
  outcome,
  bias = 0,
}: OutcomeBiasOptions): DataFileWithResult[] {
  const targetIndex = outcomeIndexMap[outcome];

  return data.map((dataFile) => {
    // Create new odds array with specified outcome odds reduced
    const adjustedOdds = dataFile.odds.map((odd, index) => {
      // Check if this is the target outcome position
      // Home: 0, 3, 6, 9... (index % 3 === 0)
      // Draw: 1, 4, 7, 10... (index % 3 === 1)
      // Away: 2, 5, 8, 11... (index % 3 === 2)
      const isTargetOutcome = index % 3 === targetIndex;
      if (isTargetOutcome) {
        // Lower the odds = higher implied probability
        return odd * (1 - bias);
      }
      return odd;
    });

    // Recalculate probabilities with the adjusted odds
    const probabilities = calculateProbabilities(adjustedOdds);

    return {
      ...dataFile,
      odds: adjustedOdds,
      probabilities,
    };
  });
}
