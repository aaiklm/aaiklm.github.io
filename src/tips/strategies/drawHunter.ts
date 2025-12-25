import type { DataFileWithResult, Probability } from "../types";

export type DrawHunterOptions = {
  /** Array of data files with results and probabilities */
  data: DataFileWithResult[];
  /**
   * Bias factor to apply to draws (0.0 - 1.0).
   * Higher values = stronger draw preference.
   * Default: 0.15
   */
  drawBias?: number;
  /**
   * Only apply draw bias when match is "even" (odds within this range).
   * If the difference between lowest and highest odd is within this range,
   * the match is considered even and draw bias is applied.
   * Set to Infinity to always apply draw bias.
   * Default: Infinity (always apply)
   */
  evenMatchThreshold?: number;
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
 * Draw Hunter Strategy
 *
 * Draws are historically undervalued by bookmakers. This strategy
 * biases the probabilities towards draws, especially effective in
 * evenly matched games where neither team is a clear favorite.
 *
 * The strategy works by reducing draw odds (making draws appear more likely)
 * which increases the probability of selecting draws in the random bet generation.
 *
 * @param options - Configuration with data array and optional bias settings
 * @returns Array of data files with adjusted odds favoring draws
 */
export function drawHunter({
  data,
  drawBias = 0.15,
  evenMatchThreshold = Infinity,
}: DrawHunterOptions): DataFileWithResult[] {
  return data.map((dataFile) => {
    const adjustedOdds: number[] = [];

    // Process odds in triplets (home, draw, away)
    for (let i = 0; i < dataFile.odds.length; i += 3) {
      const homeOdd = dataFile.odds[i];
      const drawOdd = dataFile.odds[i + 1];
      const awayOdd = dataFile.odds[i + 2];

      // Check if match is "even" (odds are close together)
      const minOdd = Math.min(homeOdd, drawOdd, awayOdd);
      const maxOdd = Math.max(homeOdd, drawOdd, awayOdd);
      const isEvenMatch = maxOdd - minOdd <= evenMatchThreshold;

      if (isEvenMatch) {
        // Apply draw bias - lower odds = higher implied probability
        adjustedOdds.push(homeOdd, drawOdd * (1 - drawBias), awayOdd);
      } else {
        // Keep original odds for uneven matches
        adjustedOdds.push(homeOdd, drawOdd, awayOdd);
      }
    }

    const probabilities = calculateProbabilities(adjustedOdds);

    return {
      ...dataFile,
      odds: adjustedOdds,
      probabilities,
    };
  });
}
