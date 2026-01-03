#!/usr/bin/env node
/**
 * Add Lines to Data File
 *
 * Takes a data file and adds 27 lines (3 bets each) using the
 * OPTIMAL_PARAMS from the ML optimizer (tested 4,411 configurations).
 *
 * Parameters used:
 *   homeBoost: 1.6  (home wins undervalued by bookmakers)
 *   drawPenalty: 0.5 (draws overvalued by bookmakers)
 *   awayPenalty: 0.8 (away wins slightly overvalued)
 *
 * Usage: node scripts/addLinesToFile.mjs <filename>
 * Example: node scripts/addLinesToFile.mjs 2025-08-23
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../src/assets/data");

// ============================================================================
// GRID CONSTANTS
// ============================================================================

const GRID_SIZE = 3;
const GRID_MATCH_COUNT = 9;

// Column positions in the 3x3 grid
const COL1 = [0, 3, 6]; // Left column
const COL2 = [1, 4, 7]; // Middle column
const COL3 = [2, 5, 8]; // Right column

// ============================================================================
// PROBABILITY CALCULATIONS
// ============================================================================

/**
 * Convert odds to normalized probabilities
 */
function calculateProbabilities(odds) {
  const probabilities = [];
  for (let i = 0; i < odds.length; i += 3) {
    const rawProbs = [1 / odds[i], 1 / odds[i + 1], 1 / odds[i + 2]];
    const sum = rawProbs[0] + rawProbs[1] + rawProbs[2];
    probabilities.push([rawProbs[0] / sum, rawProbs[1] / sum, rawProbs[2] / sum]);
  }
  return probabilities;
}

/**
 * Select the best 9 matches based on probability confidence
 */
function selectBestMatches(probabilities, count = GRID_MATCH_COUNT) {
  const ranked = probabilities
    .map((probs, index) => ({
      index,
      confidence: Math.max(...probs),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return ranked.slice(0, count).map((m) => m.index);
}

// ============================================================================
// STRATEGY: OPTIMAL PARAMS (from ML optimizer - tested 4,411 configurations)
// ============================================================================

/**
 * These parameters were found by testing 4,411 different configurations
 * against historical data. Source: src/tips-lines/ml-strategy/optimizer.ts
 *
 * The adjustments reflect that:
 * - Home wins are undervalued by bookmakers (60% boost)
 * - Draws are overvalued by bookmakers (50% penalty)
 * - Away wins are slightly overvalued (20% penalty)
 */
const OPTIMAL_PARAMS = {
  homeBoost: 1.6,    // 60% boost to home wins
  drawPenalty: 0.5,  // 50% reduction to draws
  awayPenalty: 0.8,  // 20% reduction to away wins
};

/**
 * Get the favorite outcome after applying optimal adjustments
 */
function getFavorite(probs) {
  // Apply adjustments
  const adjusted = [
    probs[0] * OPTIMAL_PARAMS.homeBoost,
    probs[1] * OPTIMAL_PARAMS.drawPenalty,
    probs[2] * OPTIMAL_PARAMS.awayPenalty,
  ];

  // Find the max
  const maxValue = Math.max(...adjusted);
  const maxIdx = adjusted.indexOf(maxValue);

  return ["1", "X", "2"][maxIdx];
}

// ============================================================================
// LINE GENERATION
// ============================================================================

/**
 * Generate the 27 lines with picks
 *
 * Grid layout (positions):
 *  Col1  Col2  Col3
 *   0     1     2    Row 0
 *   3     4     5    Row 1
 *   6     7     8    Row 2
 *
 * Each line is a path: [col1_pos, col2_pos, col3_pos]
 * Total: 3 × 3 × 3 = 27 lines
 */
function generateLines(dataFile) {
  const probabilities = calculateProbabilities(dataFile.odds);

  // Select best 9 matches
  const selectedIndices = selectBestMatches(probabilities);

  // Get adjusted probabilities for selected matches
  // Position in grid → original match index → adjusted probability → pick
  const picks = [];
  for (let pos = 0; pos < GRID_MATCH_COUNT; pos++) {
    const matchIndex = selectedIndices[pos];
    const probs = probabilities[matchIndex];
    const pick = getFavorite(probs);

    const teams = dataFile.teams[matchIndex];
    picks.push({
      position: pos,
      matchIndex,
      homeTeam: teams["1"],
      awayTeam: teams["2"],
      pick,
      probs,
    });
  }

  // Generate 27 lines
  const lines = [];
  for (const c1 of COL1) {
    for (const c2 of COL2) {
      for (const c3 of COL3) {
        lines.push([picks[c1].pick, picks[c2].pick, picks[c3].pick]);
      }
    }
  }

  return { lines, picks, selectedIndices };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node scripts/addLinesToFile.mjs <filename>");
    console.log("Example: node scripts/addLinesToFile.mjs 2025-08-23");
    process.exit(1);
  }

  const filename = args[0].replace(".json", "");
  const filepath = join(DATA_DIR, `${filename}.json`);

  console.log(`\n📂 Reading file: ${filepath}\n`);

  // Read the data file
  let dataFile;
  try {
    dataFile = JSON.parse(readFileSync(filepath, "utf8"));
  } catch (err) {
    console.error(`❌ Error reading file: ${err.message}`);
    process.exit(1);
  }

  // Generate lines
  const { lines, picks, selectedIndices } = generateLines(dataFile);

  // Display the grid with team names
  console.log("🏟️  GRID (9 matches selected from 13):\n");
  console.log("  Col1               Col2               Col3");
  console.log("  ───────────────────────────────────────────────────────");

  for (let row = 0; row < 3; row++) {
    const cells = [];
    for (let col = 0; col < 3; col++) {
      const pos = row * 3 + col;
      const pick = picks[pos];
      const pickLabel =
        pick.pick === "1"
          ? pick.homeTeam
          : pick.pick === "2"
          ? pick.awayTeam
          : "Draw";
      cells.push(`${pos}: ${pick.pick} ${pickLabel.substring(0, 12).padEnd(12)}`);
    }
    console.log(`  ${cells.join("  ")}`);
    console.log(`     (${picks[row * 3].homeTeam} v ${picks[row * 3].awayTeam})`.padStart(20) +
      `     (${picks[row * 3 + 1].homeTeam} v ${picks[row * 3 + 1].awayTeam})`.padStart(20) +
      `     (${picks[row * 3 + 2].homeTeam} v ${picks[row * 3 + 2].awayTeam})`.padStart(20));
    console.log();
  }

  console.log("\n📊 Match selection (by probability confidence):\n");
  console.log("  Using OPTIMAL_PARAMS: homeBoost=1.6, drawPenalty=0.5, awayPenalty=0.8\n");
  picks.forEach((p, i) => {
    // Calculate adjusted values for display
    const adj = [
      p.probs[0] * 1.6,
      p.probs[1] * 0.5,
      p.probs[2] * 0.8,
    ];
    const maxIdx = adj.indexOf(Math.max(...adj));
    const outcomes = ["1", "X", "2"];
    
    console.log(
      `  Pos ${i}: Match ${p.matchIndex.toString().padStart(2)} | ` +
        `${p.homeTeam.padEnd(15)} vs ${p.awayTeam.padEnd(15)}`
    );
    console.log(
      `          Probs: [${p.probs.map((x) => x.toFixed(2)).join(", ")}] → ` +
        `Adjusted: [${adj.map((x) => x.toFixed(2)).join(", ")}] → ` +
        `Pick: ${outcomes[maxIdx]} (max=${adj[maxIdx].toFixed(2)})`
    );
  });

  console.log("\n🎯 27 LINES (col1 → col2 → col3):\n");

  // Create a nice 2D display
  console.log("  Line Array (2D representation):");
  console.log("  ─────────────────────────────────");

  lines.forEach((line, idx) => {
    const c1 = COL1[Math.floor(idx / 9)];
    const c2 = COL2[Math.floor((idx % 9) / 3)];
    const c3 = COL3[idx % 3];
    console.log(
      `  Line ${(idx + 1).toString().padStart(2)}: [${line.join(", ")}]  ` +
        `(pos ${c1}→${c2}→${c3})`
    );
  });

  // Add lines to data file
  dataFile.lines = lines;

  // Also add detailed grid info for reference
  dataFile.grid = {
    selectedMatches: selectedIndices,
    picks: picks.map((p) => ({
      position: p.position,
      matchIndex: p.matchIndex,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      pick: p.pick,
    })),
  };

  // Write the updated file
  writeFileSync(filepath, JSON.stringify(dataFile, null, 2) + "\n", "utf8");

  console.log(`\n✅ Updated file: ${filepath}`);
  console.log(`   Added ${lines.length} lines and grid info\n`);
}

main();

