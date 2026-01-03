import type {
  DataFileWithResult,
  GridBet,
  GridBetsResult,
  GridStrategyConfig,
  Outcome,
} from "../types";
import {
  DEFAULT_GRID_CELLS,
  GRID_MATCH_COUNT,
  selectBestMatches,
} from "../constants";
import { createSeededRandom } from "../utils/seededRandom";
import { selectOutcome } from "../utils/selectOutcome";

const DEFAULT_BETS_COUNT = 50;

/**
 * Creates a mapping from grid positions to actual match indices
 * by selecting the best matches from all available.
 */
export function createMatchMapping(
  dataFile: DataFileWithResult
): Map<number, number> {
  const selectedIndices = selectBestMatches(
    dataFile.probabilities,
    GRID_MATCH_COUNT
  );

  // Map grid position -> original match index
  const mapping = new Map<number, number>();
  selectedIndices.forEach((matchIndex, gridPosition) => {
    mapping.set(gridPosition, matchIndex);
  });

  return mapping;
}

/**
 * Generates a single grid bet based on probabilities.
 * Uses the match mapping to select from the best 9 matches.
 */
export function generateRandomGridBet(
  dataFile: DataFileWithResult,
  random: () => number,
  matchMapping?: Map<number, number>
): GridBet {
  // If no mapping provided, create one
  const mapping = matchMapping ?? createMatchMapping(dataFile);

  const predictions: (Outcome | null)[] = DEFAULT_GRID_CELLS.map((cell) => {
    if (cell.isFree) {
      return null; // Free cell
    }

    // Get the actual match index from the mapping
    const actualMatchIndex = mapping.get(cell.position);
    if (actualMatchIndex === undefined || actualMatchIndex === null) {
      return null;
    }

    // Bounds check - if matchIndex exceeds available probabilities, treat as free
    if (actualMatchIndex >= dataFile.probabilities.length) {
      return null;
    }

    const probabilities = dataFile.probabilities[actualMatchIndex];
    return selectOutcome(probabilities, random());
  });

  return { predictions };
}

/**
 * Base random strategy for generating grid bets.
 * Uses probability distribution to weight selections.
 * Automatically selects the best 9 matches from 13 available.
 */
export function randomGridStrategy(
  data: DataFileWithResult[],
  config: GridStrategyConfig = {}
): GridBetsResult[] {
  const { betsCount = DEFAULT_BETS_COUNT, seed } = config;

  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const effectiveSeed = seed !== undefined ? seed + dateHash : dateHash;

    const random = createSeededRandom(effectiveSeed);

    // Create match mapping once per date
    const matchMapping = createMatchMapping(dataFile);

    const betsSet = new Set<string>();
    const bets: GridBet[] = [];

    // Generate unique bets
    let attempts = 0;
    const maxAttempts = betsCount * 10;

    while (bets.length < betsCount && attempts < maxAttempts) {
      const bet = generateRandomGridBet(dataFile, random, matchMapping);
      const betKey = bet.predictions.join(",");

      if (!betsSet.has(betKey)) {
        betsSet.add(betKey);
        bets.push(bet);
      }
      attempts++;
    }

    return {
      date: dataFile.date,
      bets,
    };
  });
}

/**
 * Converts a modified DataFileWithResult back to bets.
 * Used after applying bias strategies.
 */
export function dataToGridBets(
  data: DataFileWithResult[],
  config: GridStrategyConfig = {}
): GridBetsResult[] {
  return randomGridStrategy(data, config);
}

/**
 * Export the match mapping creation for use in other strategies
 */
export { createMatchMapping as getMatchMapping };
