/**
 * Value Edge Strategy Testing Script
 *
 * Run with: node scripts/testValueEdge.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all data files
const dataDir = path.join(__dirname, "../src/assets/data");
const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.endsWith(".json") && !f.includes("teams"));

function calculateProbabilities(odds) {
  const probabilities = [];
  for (let i = 0; i < odds.length; i += 3) {
    const rawProbs = [1 / odds[i], 1 / odds[i + 1], 1 / odds[i + 2]];
    const sum = rawProbs[0] + rawProbs[1] + rawProbs[2];
    probabilities.push([rawProbs[0] / sum, rawProbs[1] / sum, rawProbs[2] / sum]);
  }
  return probabilities;
}

const data = files
  .map((file) => {
    const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : file.replace(".json", "");
    const probabilities = calculateProbabilities(content.odds);
    return { ...content, date, probabilities };
  })
  .filter((d) => d.result !== undefined)
  .sort((a, b) => a.date.localeCompare(b.date));

console.log(`\nLoaded ${data.length} rounds of data\n`);

// Result string to outcome mapping
function resultToOutcome(result) {
  if (result === "0") return "1";
  if (result === "1") return "X";
  return "2";
}

// Grid constants
const GRID_SIZE = 9;
const STANDARD_LINES = [];
const COL1 = [0, 3, 6];
const COL2 = [1, 4, 7];
const COL3 = [2, 5, 8];

for (const c1 of COL1) {
  for (const c2 of COL2) {
    for (const c3 of COL3) {
      STANDARD_LINES.push({ positions: [c1, c2, c3] });
    }
  }
}

// Seeded random
function createSeededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Select best matches (by confidence)
function selectBestMatches(probabilities, count = 9) {
  const ranked = probabilities
    .map((probs, index) => ({ index, confidence: Math.max(...probs) }))
    .sort((a, b) => b.confidence - a.confidence);
  return ranked.slice(0, count).map((m) => m.index);
}

// Calculate accuracy for a strategy
function calculateAccuracy(betsResults) {
  let totalBets = 0;
  let totalWinnings = 0;
  let totalCost = 0;
  let profitableDays = 0;
  const lineHits = new Array(28).fill(0);

  for (const result of betsResults) {
    const dataFile = data.find((d) => d.date === result.date);
    if (!dataFile) continue;

    // Get selected matches for this round
    const selectedIndices = selectBestMatches(dataFile.probabilities, GRID_SIZE);
    
    let dayWinnings = 0;
    const dayCost = result.bets.length * 27;

    for (const bet of result.bets) {
      let correctLines = 0;
      let linePayout = 0;

      for (const line of STANDARD_LINES) {
        let allCorrect = true;
        let payout = 1;

        for (const pos of line.positions) {
          const prediction = bet.predictions[pos];
          const matchIndex = selectedIndices[pos];
          const actual = resultToOutcome(dataFile.result[matchIndex]);

          if (prediction === actual) {
            const oddsIdx = matchIndex * 3 + (prediction === "1" ? 0 : prediction === "X" ? 1 : 2);
            payout *= dataFile.odds[oddsIdx];
          } else {
            allCorrect = false;
          }
        }

        if (allCorrect) {
          correctLines++;
          linePayout += payout;
        }
      }

      lineHits[correctLines]++;
      totalWinnings += linePayout;
      dayWinnings += linePayout;
      totalCost += 27;
      totalBets++;
    }

    if (dayWinnings > dayCost) profitableDays++;
  }

  const profit = totalWinnings - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return {
    totalBets,
    totalWinnings,
    totalCost,
    profit,
    roi,
    profitableDays,
    totalDays: betsResults.length,
    lineHits,
  };
}

// ============================================================================
// VALUE EDGE STRATEGY IMPLEMENTATION
// ============================================================================

const VALUE_EDGE_PARAMS = {
  strongFavoriteOdds: 1.45,
  trapZoneMin: 1.45,
  trapZoneMax: 2.30,
  trapZoneValueThreshold: 1.15,
  homeBoostBase: 1.8,
  homeUnderdogBoost: 0.4,
  drawPenalty: 0.25,
  drawHighOddsThreshold: 4.0,
  awayPenalty: 0.75,
  favoriteBoost: 2.5,
  confidenceThreshold: 0.55,
  upsetChanceBase: 0.08,
  maxUpsets: 2,
};

function classifyMatch(odds) {
  const minOdds = Math.min(...odds);
  const favoriteIdx = odds.indexOf(minOdds);
  return {
    favoriteIdx,
    favoriteOdds: minOdds,
    isStrongFavorite: minOdds < VALUE_EDGE_PARAMS.strongFavoriteOdds,
    isInTrapZone: minOdds >= VALUE_EDGE_PARAMS.trapZoneMin && minOdds <= VALUE_EDGE_PARAMS.trapZoneMax,
  };
}

function calculateEV(probs, odds) {
  return [probs[0] * odds[0], probs[1] * odds[1], probs[2] * odds[2]];
}

function applyValueEdgeAdjustments(probs, odds, params) {
  const classification = classifyMatch(odds);
  const ev = calculateEV(probs, odds);
  let adjusted = [...probs];

  // Home boost
  adjusted[0] *= params.homeBoostBase;
  if (odds[0] > Math.min(odds[1], odds[2])) {
    adjusted[0] *= 1 + params.homeUnderdogBoost;
  }

  // Draw penalty
  if (odds[1] >= params.drawHighOddsThreshold && ev[1] > 1.0) {
    adjusted[1] *= 0.6;
  } else {
    adjusted[1] *= params.drawPenalty;
  }

  // Away penalty
  adjusted[2] *= params.awayPenalty;

  // Favorite handling
  if (classification.isStrongFavorite) {
    adjusted[classification.favoriteIdx] *= 4.0;
  } else if (classification.isInTrapZone) {
    const favoriteEV = ev[classification.favoriteIdx];
    if (favoriteEV >= params.trapZoneValueThreshold) {
      adjusted[classification.favoriteIdx] *= params.favoriteBoost;
    } else {
      adjusted[classification.favoriteIdx] *= 0.8;
    }
  } else {
    const maxProb = Math.max(...adjusted);
    const maxIdx = adjusted.indexOf(maxProb);
    if (adjusted[maxIdx] / adjusted.reduce((a, b) => a + b, 0) > params.confidenceThreshold) {
      adjusted[maxIdx] *= params.favoriteBoost;
    }
  }

  // Value edge detection
  for (let i = 0; i < 3; i++) {
    if (ev[i] > 1.05) {
      adjusted[i] *= 1 + (ev[i] - 1) * 0.5;
    }
  }

  // Normalize
  const sum = adjusted.reduce((a, b) => a + b, 0);
  return [adjusted[0] / sum, adjusted[1] / sum, adjusted[2] / sum];
}

function valueEdgeStrategy(betsCount = 50, params = VALUE_EDGE_PARAMS) {
  return data.map((dataFile) => {
    const dateHash = dataFile.date.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash + 42);

    const selectedIndices = selectBestMatches(dataFile.probabilities, GRID_SIZE);

    const matchProbs = selectedIndices.map((matchIndex) => {
      const oddsIdx = matchIndex * 3;
      const odds = [
        dataFile.odds[oddsIdx] ?? 2.5,
        dataFile.odds[oddsIdx + 1] ?? 3.5,
        dataFile.odds[oddsIdx + 2] ?? 3.0,
      ];
      const impliedProbs = dataFile.probabilities[matchIndex] ?? [0.4, 0.3, 0.3];
      return applyValueEdgeAdjustments(impliedProbs, odds, params);
    });

    const bets = [];
    const usedKeys = new Set();

    // Lock bet
    const lockPredictions = matchProbs.map((probs) => {
      const maxIdx = probs.indexOf(Math.max(...probs));
      return ["1", "X", "2"][maxIdx];
    });
    bets.push({ predictions: lockPredictions });
    usedKeys.add(lockPredictions.join(","));

    // Generate diverse bets
    let attempts = 0;
    while (bets.length < betsCount && attempts < betsCount * 30) {
      let upsetCount = 0;
      const allowUpsets = bets.length > 5 && random() < 0.3;

      const predictions = matchProbs.map((probs) => {
        const maxProb = Math.max(...probs);
        const favoriteIdx = probs.indexOf(maxProb);

        if (allowUpsets && upsetCount < params.maxUpsets && random() < params.upsetChanceBase) {
          upsetCount++;
          const nonFavoriteProbs = probs.map((p, i) => (i === favoriteIdx ? 0 : p));
          const sum = nonFavoriteProbs.reduce((a, b) => a + b, 0);
          const normalized = nonFavoriteProbs.map((p) => p / sum);
          const r = random();
          if (r < normalized[0]) return "1";
          if (r < normalized[0] + normalized[1]) return "X";
          return "2";
        }

        const r = random();
        if (r < probs[0]) return "1";
        if (r < probs[0] + probs[1]) return "X";
        return "2";
      });

      const key = predictions.join(",");
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        bets.push({ predictions });
      }
      attempts++;
    }

    return { date: dataFile.date, bets };
  });
}

// Random strategy for comparison
function randomStrategy(betsCount = 50) {
  return data.map((dataFile) => {
    const dateHash = dataFile.date.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);
    const selectedIndices = selectBestMatches(dataFile.probabilities, GRID_SIZE);

    const bets = [];
    const usedKeys = new Set();

    while (bets.length < betsCount) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[selectedIndices[i]];
        const r = random();
        if (r < probs[0]) predictions.push("1");
        else if (r < probs[0] + probs[1]) predictions.push("X");
        else predictions.push("2");
      }
      const key = predictions.join(",");
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        bets.push({ predictions });
      }
    }

    return { date: dataFile.date, bets };
  });
}

// ============================================================================
// PARAMETER OPTIMIZATION
// ============================================================================

console.log("=".repeat(80));
console.log("VALUE EDGE STRATEGY TESTING");
console.log("=".repeat(80));

const BETS = 50;

// Test baseline
console.log("\nTesting Random baseline...");
const randomBets = randomStrategy(BETS);
const randomResult = calculateAccuracy(randomBets);
console.log(`Random ROI: ${randomResult.roi.toFixed(2)}%`);

// Test default Value Edge
console.log("\nTesting Value Edge (default params)...");
const valueEdgeBets = valueEdgeStrategy(BETS);
const valueEdgeResult = calculateAccuracy(valueEdgeBets);
console.log(`Value Edge ROI: ${valueEdgeResult.roi.toFixed(2)}%`);

// Parameter sweep to find optimal
console.log("\n" + "=".repeat(80));
console.log("PARAMETER OPTIMIZATION");
console.log("=".repeat(80));

const results = [];

// Test variations
const homeBoosts = [1.5, 1.7, 1.8, 1.9, 2.0, 2.2];
const drawPenalties = [0.15, 0.20, 0.25, 0.30, 0.35];
const favoriteBoosts = [2.0, 2.5, 3.0, 3.5];
const upsetBases = [0.05, 0.08, 0.10, 0.12];

let best = { roi: -Infinity, params: null };
let tested = 0;

for (const homeBoost of homeBoosts) {
  for (const drawPenalty of drawPenalties) {
    for (const favoriteBoost of favoriteBoosts) {
      for (const upsetBase of upsetBases) {
        const params = {
          ...VALUE_EDGE_PARAMS,
          homeBoostBase: homeBoost,
          drawPenalty,
          favoriteBoost,
          upsetChanceBase: upsetBase,
        };

        const bets = valueEdgeStrategy(BETS, params);
        const result = calculateAccuracy(bets);
        tested++;

        results.push({
          params: { homeBoost, drawPenalty, favoriteBoost, upsetBase },
          roi: result.roi,
          profit: result.profit,
          profitableDays: result.profitableDays,
        });

        if (result.roi > best.roi) {
          best = { roi: result.roi, params, result };
        }
      }
    }
  }
}

console.log(`\nTested ${tested} parameter combinations\n`);

// Sort by ROI
results.sort((a, b) => b.roi - a.roi);

console.log("TOP 10 CONFIGURATIONS:");
console.log("-".repeat(80));
for (let i = 0; i < Math.min(10, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(
    `${medal} #${String(i + 1).padStart(2)}: ROI ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(2)}% | ` +
      `Profit: ${r.profit >= 0 ? "+" : ""}${r.profit.toFixed(0)} | Days: ${r.profitableDays}/${data.length} | ` +
      `H:${r.params.homeBoost} D:${r.params.drawPenalty} F:${r.params.favoriteBoost} U:${r.params.upsetBase}`
  );
}

console.log("\n" + "=".repeat(80));
console.log("BEST CONFIGURATION");
console.log("=".repeat(80));

if (best.params) {
  console.log(`\nROI: ${best.roi >= 0 ? "+" : ""}${best.roi.toFixed(2)}%`);
  console.log(`Profit: ${best.result.profit >= 0 ? "+" : ""}${best.result.profit.toFixed(0)}`);
  console.log(`Profitable Days: ${best.result.profitableDays}/${data.length}`);
  console.log(`\nOptimal Parameters:`);
  console.log(`  homeBoostBase: ${best.params.homeBoostBase}`);
  console.log(`  drawPenalty: ${best.params.drawPenalty}`);
  console.log(`  favoriteBoost: ${best.params.favoriteBoost}`);
  console.log(`  upsetChanceBase: ${best.params.upsetChanceBase}`);
  console.log(`\nImprovement vs Random: +${(best.roi - randomResult.roi).toFixed(2)}pp`);
}

console.log("\n");

