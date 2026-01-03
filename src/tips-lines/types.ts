/**
 * Types for the Tips Lines 3x3 grid betting system
 */

export type Team = { "1": string; "2": string };

export type DataFile = {
  teams: Team[];
  odds: number[];
  matches?: unknown[];
  result?: string;
  penge?: Record<string, number>;
  fav?: number[];
  bets?: string[];
};

export type Probability = [number, number, number];

export type DataFileWithResult = DataFile & {
  result: string;
  date: string;
  probabilities: Probability[];
};

/**
 * Outcome for a single match: '1' = home, 'X' = draw, '2' = away
 * Or a free cell marker
 */
export type Outcome = "1" | "X" | "2";

/**
 * A cell in the 3x3 grid
 */
export type GridCell = {
  /** Position in the grid (0-8) */
  position: number;
  /** Match index in the data (0-8 after selection), or null if free cell */
  matchIndex: number | null;
  /** True if this is a free/joker cell that always counts as correct */
  isFree: boolean;
};

/**
 * A line definition (row, column, or diagonal)
 *
 * Lines flow from column 1 → column 2 → column 3
 * Each line connects 3 cells (one from each column)
 */
export type GridLine = {
  /** Unique identifier for the line */
  id: string;
  /** Human readable name */
  name: string;
  /** Cell positions that make up this line (length 3) */
  positions: number[];
  /** Multiplier for winnings (higher = harder lines) */
  multiplier: number;
};

/**
 * A single grid bet (9 cells)
 */
export type GridBet = {
  /** The predicted outcomes for each cell (length 9) */
  predictions: (Outcome | null)[];
};

/**
 * Result of a grid bet evaluation
 */
export type GridBetResult = {
  /** The bet that was evaluated */
  bet: GridBet;
  /** Which cells were correct (length 9) */
  correctCells: boolean[];
  /** Which lines were fully correct */
  correctLines: string[];
  /** Total winnings for this bet (from odds) */
  winnings: number;
  /** Cost of this bet (number of lines × 1) */
  cost: number;
};

/**
 * Generated grid bets for a specific date
 */
export type GridBetsResult = {
  /** The date of the data file */
  date: string;
  /** Generated bets for this date */
  bets: GridBet[];
};

/**
 * Accuracy result for historical testing
 */
export type GridAccuracyResult = {
  /** The date of the data file */
  date: string;
  /** Number of bets that hit each line count (index = number of lines correct) */
  lineHits: number[];
  /** Total bets evaluated */
  totalBets: number;
  /** Total winnings across all bets (from odds) */
  totalWinnings: number;
  /** Total cost across all bets */
  totalCost: number;
  /** Net profit (winnings - cost) */
  profit: number;
  /** Best single bet result */
  bestBet: GridBetResult | null;
  /** Maximum possible winnings if all predictions were perfect (per single bet) */
  maxPossibleWinnings: number;
};

/**
 * Strategy function signature for generating grid bets
 */
export type GridStrategy = (
  data: DataFileWithResult[],
  config?: GridStrategyConfig
) => GridBetsResult[];

/**
 * Configuration for grid strategy
 */
export type GridStrategyConfig = {
  /** Number of bets to generate per round */
  betsCount?: number;
  /** Optional seed for reproducible results */
  seed?: number;
  /** Custom parameters for specific strategies */
  params?: Record<string, unknown>;
};
