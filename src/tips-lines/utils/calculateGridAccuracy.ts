import type {
  DataFileWithResult,
  GridBet,
  GridBetResult,
  GridBetsResult,
  GridAccuracyResult,
  GridCell,
  GridLine,
  Outcome,
} from "../types";
import { DEFAULT_GRID_CELLS, STANDARD_LINES, selectBestMatches, GRID_MATCH_COUNT } from "../constants";
import { resultToOutcome, outcomeToResult } from "./selectOutcome";

/**
 * Calculates the maximum possible winnings for a round if all predictions were perfect.
 * This is the theoretical maximum if you bet on all correct outcomes.
 */
export function calculateMaxPossibleWinnings(
  dataFile: DataFileWithResult,
  gridCells: GridCell[] = DEFAULT_GRID_CELLS,
  lines: GridLine[] = STANDARD_LINES
): number {
  const matchMapping = createMatchMapping(dataFile);
  
  // Create a "perfect" bet using the actual results
  const perfectPredictions: (Outcome | null)[] = gridCells.map((cell) => {
    if (cell.isFree) return null;
    const actualMatchIndex = matchMapping.get(cell.position);
    if (actualMatchIndex === undefined || actualMatchIndex >= dataFile.result.length) {
      return null;
    }
    return resultToOutcome(dataFile.result[actualMatchIndex]);
  });

  const perfectBet: GridBet = { predictions: perfectPredictions };
  
  // Calculate total winnings if all lines are correct
  let totalWinnings = 0;
  for (const line of lines) {
    totalWinnings += calculateLinePayout(dataFile, perfectBet, line, gridCells, matchMapping);
  }
  
  return totalWinnings;
}

/**
 * Creates a mapping from grid positions to actual match indices
 * by selecting the best matches from all available.
 */
function createMatchMapping(
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
 * Gets the actual outcome for a specific cell position.
 * Returns null for free cells (which always count as correct).
 */
function getActualOutcome(
  dataFile: DataFileWithResult,
  cell: GridCell,
  matchMapping: Map<number, number>
): Outcome | null {
  if (cell.isFree) {
    return null;
  }

  // Get the actual match index from the mapping
  const actualMatchIndex = matchMapping.get(cell.position);
  if (actualMatchIndex === undefined || actualMatchIndex === null) {
    return null;
  }

  // Bounds check
  if (actualMatchIndex >= dataFile.result.length) {
    return null;
  }

  const resultChar = dataFile.result[actualMatchIndex];
  return resultToOutcome(resultChar);
}

/**
 * Gets the odds for a specific prediction in a cell.
 * Returns 1 for free cells (neutral multiplier).
 */
function getOddsForPrediction(
  dataFile: DataFileWithResult,
  cell: GridCell,
  prediction: Outcome | null,
  matchMapping: Map<number, number>
): number {
  if (cell.isFree || prediction === null) {
    return 1; // Free cells have neutral odds
  }

  // Get the actual match index from the mapping
  const actualMatchIndex = matchMapping.get(cell.position);
  if (actualMatchIndex === undefined || actualMatchIndex === null) {
    return 1;
  }

  // Bounds check
  if (actualMatchIndex >= dataFile.teams.length) {
    return 1;
  }

  const oddsIndex = actualMatchIndex * 3;
  const resultIndex = parseInt(outcomeToResult(prediction), 10);

  // Bounds check for odds array
  if (oddsIndex + resultIndex >= dataFile.odds.length) {
    return 1;
  }

  return dataFile.odds[oddsIndex + resultIndex];
}

/**
 * Calculates the payout for a correct line based on the odds of each cell.
 * Payout = product of odds for all cells in the line.
 */
function calculateLinePayout(
  dataFile: DataFileWithResult,
  bet: GridBet,
  line: GridLine,
  gridCells: GridCell[],
  matchMapping: Map<number, number>
): number {
  let payout = 1;

  for (const pos of line.positions) {
    const cell = gridCells[pos];
    const prediction = bet.predictions[pos];
    const odds = getOddsForPrediction(dataFile, cell, prediction, matchMapping);
    payout *= odds;
  }

  return payout;
}

/**
 * Evaluates a single grid bet against actual results.
 * Each line costs 1. Winnings are calculated from odds.
 */
export function evaluateGridBet(
  dataFile: DataFileWithResult,
  bet: GridBet,
  gridCells: GridCell[] = DEFAULT_GRID_CELLS,
  lines: GridLine[] = STANDARD_LINES,
  matchMapping?: Map<number, number>
): GridBetResult {
  // Create match mapping if not provided
  const mapping = matchMapping ?? createMatchMapping(dataFile);

  // Determine which cells are correct
  const correctCells: boolean[] = gridCells.map((cell, index) => {
    // Free cells are always correct
    if (cell.isFree) {
      return true;
    }

    // If prediction is null (out of bounds), treat as free cell
    const predictedOutcome = bet.predictions[index];
    if (predictedOutcome === null) {
      return true;
    }

    const actualOutcome = getActualOutcome(dataFile, cell, mapping);
    // If actual outcome is null (out of bounds), treat as correct
    if (actualOutcome === null) {
      return true;
    }

    return actualOutcome === predictedOutcome;
  });

  // Check which lines are fully correct and calculate winnings
  const correctLines: string[] = [];
  let totalWinnings = 0;

  for (const line of lines) {
    const allCorrect = line.positions.every((pos) => correctCells[pos]);
    if (allCorrect) {
      correctLines.push(line.id);
      // Payout is the product of odds for all cells in the line
      const linePayout = calculateLinePayout(dataFile, bet, line, gridCells, mapping);
      totalWinnings += linePayout;
    }
  }

  // Cost per bet = number of lines (each line costs 1)
  const cost = lines.length;

  return {
    bet,
    correctCells,
    correctLines,
    winnings: totalWinnings,
    cost,
  };
}

/**
 * Calculates accuracy and winnings across all bets for each date.
 */
export function calculateGridAccuracy(
  data: DataFileWithResult[],
  betsResults: GridBetsResult[],
  gridCells: GridCell[] = DEFAULT_GRID_CELLS,
  lines: GridLine[] = STANDARD_LINES
): GridAccuracyResult[] {
  const betsByDate = new Map(betsResults.map((b) => [b.date, b.bets]));

  return data.map((dataFile) => {
    const bets = betsByDate.get(dataFile.date) ?? [];
    const lineHits = new Array<number>(lines.length + 1).fill(0);
    let totalWinnings = 0;
    let totalCost = 0;
    let bestBet: GridBetResult | null = null;

    // Create match mapping once per date
    const matchMapping = createMatchMapping(dataFile);

    for (const bet of bets) {
      const result = evaluateGridBet(dataFile, bet, gridCells, lines, matchMapping);

      const lineCount = result.correctLines.length;
      lineHits[lineCount]++;
      totalWinnings += result.winnings;
      totalCost += result.cost;

      if (
        !bestBet ||
        result.winnings - result.cost > bestBet.winnings - (bestBet.cost ?? 0)
      ) {
        bestBet = result;
      }
    }

    // Calculate max possible winnings for this round (sum of all line payouts if all correct)
    const maxPossibleWinnings = calculateMaxPossibleWinnings(dataFile, gridCells, lines);

    return {
      date: dataFile.date,
      lineHits,
      totalBets: bets.length,
      totalWinnings,
      totalCost,
      profit: totalWinnings - totalCost,
      bestBet,
      maxPossibleWinnings,
    };
  });
}

/**
 * Summarizes accuracy across all dates.
 */
export function summarizeAccuracy(results: GridAccuracyResult[]): {
  totalBets: number;
  totalWinnings: number;
  totalCost: number;
  profit: number;
  roi: number;
  avgWinningsPerBet: number;
  avgCostPerBet: number;
  avgProfitPerBet: number;
  lineHitsDistribution: number[];
  bestOverallBet: GridBetResult | null;
  profitableDates: number;
  totalDates: number;
  totalMaxPossibleWinnings: number;
} {
  let totalBets = 0;
  let totalWinnings = 0;
  let totalCost = 0;
  let totalMaxPossibleWinnings = 0;
  const lineHitsDistribution: number[] = [];
  let bestOverallBet: GridBetResult | null = null;
  let profitableDates = 0;

  for (const result of results) {
    totalBets += result.totalBets;
    totalWinnings += result.totalWinnings;
    totalCost += result.totalCost;
    totalMaxPossibleWinnings += result.maxPossibleWinnings;

    if (result.profit > 0) {
      profitableDates++;
    }

    // Aggregate line hits
    result.lineHits.forEach((count, index) => {
      lineHitsDistribution[index] = (lineHitsDistribution[index] ?? 0) + count;
    });

    if (result.bestBet) {
      const bestProfit = result.bestBet.winnings - (result.bestBet.cost ?? 0);
      const currentBestProfit = bestOverallBet
        ? bestOverallBet.winnings - (bestOverallBet.cost ?? 0)
        : -Infinity;
      if (bestProfit > currentBestProfit) {
        bestOverallBet = result.bestBet;
      }
    }
  }

  const profit = totalWinnings - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return {
    totalBets,
    totalWinnings,
    totalCost,
    profit,
    roi,
    avgWinningsPerBet: totalBets > 0 ? totalWinnings / totalBets : 0,
    avgCostPerBet: totalBets > 0 ? totalCost / totalBets : 0,
    avgProfitPerBet: totalBets > 0 ? profit / totalBets : 0,
    lineHitsDistribution,
    bestOverallBet,
    profitableDates,
    totalDates: results.length,
    totalMaxPossibleWinnings,
  };
}
