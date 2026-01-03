import type { GridCell, GridLine } from "./types";

/**
 * Grid dimensions - 3x3 grid
 */
export const GRID_SIZE = 3;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 9
export const MATCH_COUNT = 13; // Available matches
export const GRID_MATCH_COUNT = 9; // Matches used in the grid

/**
 * Default grid layout for 3x3
 * 9 matches fill all positions
 *
 * Visual layout (positions):
 *  Col1  Col2  Col3
 *   0     1     2    Row 0
 *   3     4     5    Row 1
 *   6     7     8    Row 2
 *
 * Lines flow: from col1 → through col2 → to col3
 * Each element in col1 connects to each in col2 (9 connections)
 * Each of those connects to each in col3 (27 total lines)
 */
export const DEFAULT_GRID_CELLS: GridCell[] = Array.from(
  { length: TOTAL_CELLS },
  (_, i) => ({
    position: i,
    matchIndex: i, // Will be remapped when selecting best 9 matches
    isFree: false,
  })
);

/**
 * Column positions in the 3x3 grid
 */
const COL1 = [0, 3, 6]; // Left column
const COL2 = [1, 4, 7]; // Middle column
const COL3 = [2, 5, 8]; // Right column

/**
 * Generate all 27 lines (paths from col1 → col2 → col3)
 *
 * Visual representation of all possible paths:
 *
 *   0 ─┬─ 1 ─┬─ 2
 *   │  ├───┼───┤
 *   │  └─┬─┼─┬─┘
 *   │    │ │ │
 *   3 ─┬─ 4 ─┬─ 5
 *   │  ├───┼───┤
 *   │  └─┬─┼─┬─┘
 *   │    │ │ │
 *   6 ─┬─ 7 ─┬─ 8
 *      └───┴───┘
 *
 * Each line is a 3-cell path: [col1_pos, col2_pos, col3_pos]
 * Total: 3 × 3 × 3 = 27 lines
 */
function generateAllLines(): GridLine[] {
  const lines: GridLine[] = [];

  for (const c1 of COL1) {
    for (const c2 of COL2) {
      for (const c3 of COL3) {
        const row1 = Math.floor(c1 / 3);
        const row2 = Math.floor(c2 / 3);
        const row3 = Math.floor(c3 / 3);

        // Determine multiplier based on path shape
        let multiplier = 1;
        if (row1 === row2 && row2 === row3) {
          // Straight horizontal line
          multiplier = 1;
        } else if (row1 !== row2 && row2 !== row3 && row1 !== row3) {
          // Zigzag (all different rows)
          multiplier = 1.5;
        } else {
          // Bent line (two same, one different)
          multiplier = 1.2;
        }

        lines.push({
          id: `path-${c1}-${c2}-${c3}`,
          name: `Path ${c1}→${c2}→${c3}`,
          positions: [c1, c2, c3],
          multiplier,
        });
      }
    }
  }

  return lines;
}

/**
 * All 27 lines representing paths through the 3x3 grid
 * from column 1 → column 2 → column 3
 */
export const STANDARD_LINES: GridLine[] = generateAllLines();

/**
 * Extended lines (same as standard for 3x3 grid with full paths)
 */
export const EXTENDED_LINES: GridLine[] = STANDARD_LINES;

/**
 * Default winnings structure based on number of correct lines
 * With 27 lines, payouts scale differently
 */
export const DEFAULT_LINE_PAYOUTS: Record<number, number> = {
  0: 0,
  1: 2,
  2: 5,
  3: 10,
  4: 20,
  5: 40,
  6: 80,
  7: 150,
  8: 300,
  9: 600,
  10: 1200,
  11: 2500,
  12: 5000,
  13: 10000,
  14: 20000,
  15: 40000,
  16: 80000,
  17: 150000,
  18: 300000,
  19: 500000,
  20: 750000,
  21: 1000000,
  22: 1500000,
  23: 2000000,
  24: 3000000,
  25: 4000000,
  26: 5000000,
  27: 10000000,
};

/**
 * Selects the best N matches from available matches based on ranking criteria.
 * Criteria: Matches with highest probability confidence (max probability)
 *
 * @param probabilities - Array of [home, draw, away] probabilities for each match
 * @param count - Number of matches to select (default: 9)
 * @returns Array of original match indices, sorted by selection order
 */
export function selectBestMatches(
  probabilities: [number, number, number][],
  count: number = GRID_MATCH_COUNT
): number[] {
  // Rank matches by confidence (highest max probability = most predictable)
  const ranked = probabilities
    .map((probs, index) => ({
      index,
      confidence: Math.max(...probs),
      probs,
    }))
    .sort((a, b) => b.confidence - a.confidence);

  // Take the top N matches
  return ranked.slice(0, count).map((m) => m.index);
}

/**
 * Alternative selection: Balanced approach - mix of confident and uncertain matches
 * This can create more interesting betting scenarios
 */
export function selectBalancedMatches(
  probabilities: [number, number, number][],
  count: number = GRID_MATCH_COUNT
): number[] {
  const ranked = probabilities
    .map((probs, index) => ({
      index,
      confidence: Math.max(...probs),
      uncertainty: 1 - Math.max(...probs), // Higher = more uncertain
    }))
    .sort((a, b) => b.confidence - a.confidence);

  // Take a mix: some confident, some uncertain
  const confident = ranked.slice(0, Math.ceil(count / 2));
  const uncertain = ranked.slice(-Math.floor(count / 2));

  const selected = [...confident, ...uncertain].slice(0, count);
  return selected.map((m) => m.index);
}
