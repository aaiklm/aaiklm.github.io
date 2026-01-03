#!/usr/bin/env node
/**
 * Verify Algorithm
 *
 * Tests the algorithm against historical data to find dates
 * with high correct line counts (12+) and verify the math.
 *
 * Usage: node scripts/verifyAlgorithm.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../src/assets/data");

// ============================================================================
// GRID CONSTANTS (same as addLinesToFile.mjs)
// ============================================================================

const GRID_MATCH_COUNT = 9;
const COL1 = [0, 3, 6];
const COL2 = [1, 4, 7];
const COL3 = [2, 5, 8];

// Generate all 27 lines
const STANDARD_LINES = [];
for (const c1 of COL1) {
  for (const c2 of COL2) {
    for (const c3 of COL3) {
      STANDARD_LINES.push({ positions: [c1, c2, c3] });
    }
  }
}

// ============================================================================
// PROBABILITY CALCULATIONS
// ============================================================================

function calculateProbabilities(odds) {
  const probabilities = [];
  for (let i = 0; i < odds.length; i += 3) {
    const rawProbs = [1 / odds[i], 1 / odds[i + 1], 1 / odds[i + 2]];
    const sum = rawProbs[0] + rawProbs[1] + rawProbs[2];
    probabilities.push([rawProbs[0] / sum, rawProbs[1] / sum, rawProbs[2] / sum]);
  }
  return probabilities;
}

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
// STRATEGY: OPTIMAL PARAMS (same as addLinesToFile.mjs)
// ============================================================================

const OPTIMAL_PARAMS = {
  homeBoost: 1.6,
  drawPenalty: 0.5,
  awayPenalty: 0.8,
};

function getFavorite(probs) {
  const adjusted = [
    probs[0] * OPTIMAL_PARAMS.homeBoost,
    probs[1] * OPTIMAL_PARAMS.drawPenalty,
    probs[2] * OPTIMAL_PARAMS.awayPenalty,
  ];
  const maxValue = Math.max(...adjusted);
  const maxIdx = adjusted.indexOf(maxValue);
  return ["1", "X", "2"][maxIdx];
}

// ============================================================================
// RESULT MAPPING
// ============================================================================

function resultToOutcome(resultChar) {
  if (resultChar === "0") return "1"; // Home win
  if (resultChar === "1") return "X"; // Draw
  return "2"; // Away win
}

// ============================================================================
// GENERATE PICKS AND CHECK LINES
// ============================================================================

function generatePicks(dataFile) {
  const probabilities = calculateProbabilities(dataFile.odds);
  const selectedIndices = selectBestMatches(probabilities);

  const picks = [];
  for (let pos = 0; pos < GRID_MATCH_COUNT; pos++) {
    const matchIndex = selectedIndices[pos];
    const probs = probabilities[matchIndex];
    const pick = getFavorite(probs);
    picks.push({
      position: pos,
      matchIndex,
      pick,
      probs,
    });
  }

  return { picks, selectedIndices };
}

function checkLines(dataFile, picks, selectedIndices) {
  // Get actual outcomes for selected matches
  const actualOutcomes = selectedIndices.map((matchIdx) =>
    resultToOutcome(dataFile.result[matchIdx])
  );

  // Check which picks are correct
  const correctPicks = picks.map((p, i) => p.pick === actualOutcomes[i]);

  // Count correct lines
  let correctLines = 0;
  for (const line of STANDARD_LINES) {
    const allCorrect = line.positions.every((pos) => correctPicks[pos]);
    if (allCorrect) {
      correctLines++;
    }
  }

  return { correctLines, correctPicks, actualOutcomes };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  // Load all data files with results
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !f.includes("teams"));

  const data = files
    .map((file) => {
      try {
        const content = JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8"));
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : file.replace(".json", "");
        return { ...content, date, filename: file };
      } catch {
        return null;
      }
    })
    .filter((d) => d && d.result !== undefined && d.odds && d.odds.length >= 27)
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`\n📊 ALGORITHM VERIFICATION`);
  console.log(`   Testing against ${data.length} rounds with results\n`);
  console.log(`   Using OPTIMAL_PARAMS: homeBoost=${OPTIMAL_PARAMS.homeBoost}, drawPenalty=${OPTIMAL_PARAMS.drawPenalty}, awayPenalty=${OPTIMAL_PARAMS.awayPenalty}\n`);

  // Test each round
  const results = [];
  for (const dataFile of data) {
    const { picks, selectedIndices } = generatePicks(dataFile);
    const { correctLines, correctPicks, actualOutcomes } = checkLines(
      dataFile,
      picks,
      selectedIndices
    );

    results.push({
      date: dataFile.date,
      filename: dataFile.filename,
      correctLines,
      correctPicks,
      picks,
      actualOutcomes,
      selectedIndices,
    });
  }

  // Sort by correct lines (descending)
  results.sort((a, b) => b.correctLines - a.correctLines);

  // Show top 10 results
  console.log("🏆 TOP 10 DATES BY CORRECT LINES:\n");
  console.log("   Date       | Lines | Correct Picks");
  console.log("   -----------|-------|---------------");

  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    const correctCount = r.correctPicks.filter(Boolean).length;
    console.log(
      `   ${r.date} |   ${r.correctLines.toString().padStart(2)} | ${correctCount}/9 picks correct`
    );
  }

  // Find dates with 12+ correct lines
  const highScoreDates = results.filter((r) => r.correctLines >= 12);
  
  console.log(`\n\n📈 DATES WITH 12+ CORRECT LINES: ${highScoreDates.length}\n`);

  if (highScoreDates.length > 0) {
    // Show detailed breakdown for the best one
    const best = highScoreDates[0];
    console.log(`\n🎯 BEST RESULT: ${best.date} (${best.correctLines} correct lines)\n`);
    console.log(`   File: ${best.filename}\n`);
    
    console.log("   Position | Match | Pick | Actual | Correct?");
    console.log("   ---------|-------|------|--------|----------");
    
    for (let i = 0; i < 9; i++) {
      const pick = best.picks[i];
      const actual = best.actualOutcomes[i];
      const correct = best.correctPicks[i] ? "✅" : "❌";
      console.log(
        `   ${i.toString().padStart(8)} | ${pick.matchIndex.toString().padStart(5)} | ${pick.pick.padStart(4)} | ${actual.padStart(6)} | ${correct}`
      );
    }

    console.log(`\n   Correct picks: ${best.correctPicks.filter(Boolean).length}/9`);
    console.log(`   Correct lines: ${best.correctLines}/27`);
    
    // Show which lines are correct
    console.log("\n   Correct line positions:");
    let lineIdx = 0;
    for (const line of STANDARD_LINES) {
      const allCorrect = line.positions.every((pos) => best.correctPicks[pos]);
      if (allCorrect) {
        console.log(`     Line ${lineIdx + 1}: positions [${line.positions.join(", ")}]`);
      }
      lineIdx++;
    }
  } else {
    console.log("   No dates found with 12+ correct lines.");
    console.log("\n   Best result was:", results[0].date, "with", results[0].correctLines, "lines");
  }

  // Summary stats
  const totalLines = results.reduce((sum, r) => sum + r.correctLines, 0);
  const avgLines = totalLines / results.length;
  
  console.log(`\n\n📊 SUMMARY STATISTICS:`);
  console.log(`   Total rounds tested: ${results.length}`);
  console.log(`   Average correct lines: ${avgLines.toFixed(2)}`);
  console.log(`   Best: ${results[0].correctLines} lines (${results[0].date})`);
  console.log(`   Worst: ${results[results.length - 1].correctLines} lines (${results[results.length - 1].date})`);
  console.log();
}

main();

