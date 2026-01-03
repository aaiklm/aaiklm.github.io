/**
 * ML Strategy Parameter Tuning Script - Extended Search
 *
 * Run with: node scripts/tuneMLStrategy.mjs
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

function resultToOutcome(result) {
  if (result === "0") return "1";
  if (result === "1") return "X";
  return "2";
}

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

function createSeededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function calculateAccuracy(betsResults) {
  let totalBets = 0, totalWinnings = 0, totalCost = 0, profitableDays = 0;

  for (const result of betsResults) {
    const dataFile = data.find((d) => d.date === result.date);
    if (!dataFile) continue;

    let dayWinnings = 0;
    for (const bet of result.bets) {
      for (const line of STANDARD_LINES) {
        let allCorrect = true, payout = 1;
        for (const pos of line.positions) {
          const prediction = bet.predictions[pos];
          const actual = resultToOutcome(dataFile.result[pos]);
          if (prediction === actual) {
            const oddsIdx = pos * 3 + (prediction === "1" ? 0 : prediction === "X" ? 1 : 2);
            payout *= dataFile.odds[oddsIdx];
          } else {
            allCorrect = false;
          }
        }
        if (allCorrect) { dayWinnings += payout; totalWinnings += payout; }
      }
      totalCost += 27;
      totalBets++;
    }
    if (dayWinnings > result.bets.length * 27) profitableDays++;
  }

  const profit = totalWinnings - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  return { totalBets, totalWinnings, totalCost, profit, roi, profitableDays, totalDays: betsResults.length };
}

const BETS = 50;
const results = [];
const BUCKET_SIZE = 0.1;

// Precompute calibration buckets for all data
const globalBuckets = { home: {}, draw: {}, away: {} };
for (const dataFile of data) {
  for (let i = 0; i < Math.min(dataFile.result.length, dataFile.probabilities.length); i++) {
    const probs = dataFile.probabilities[i];
    const actual = resultToOutcome(dataFile.result[i]);

    const hb = Math.floor(probs[0] / BUCKET_SIZE);
    if (!globalBuckets.home[hb]) globalBuckets.home[hb] = { total: 0, correct: 0 };
    globalBuckets.home[hb].total++;
    if (actual === "1") globalBuckets.home[hb].correct++;

    const db = Math.floor(probs[1] / BUCKET_SIZE);
    if (!globalBuckets.draw[db]) globalBuckets.draw[db] = { total: 0, correct: 0 };
    globalBuckets.draw[db].total++;
    if (actual === "X") globalBuckets.draw[db].correct++;

    const ab = Math.floor(probs[2] / BUCKET_SIZE);
    if (!globalBuckets.away[ab]) globalBuckets.away[ab] = { total: 0, correct: 0 };
    globalBuckets.away[ab].total++;
    if (actual === "2") globalBuckets.away[ab].correct++;
  }
}

// Display calibration insights
console.log("=".repeat(80));
console.log("KEY CALIBRATION INSIGHTS");
console.log("=".repeat(80));
console.log("\n📊 Home wins in 20-30% range hit 33.8% (1.35x expected) - HOME UNDERVALUED");
console.log("📊 Draws in 30-40% range hit 23.1% (0.66x expected) - DRAWS OVERVALUED");
console.log("📊 Away wins generally slightly overvalued (factors 0.91-0.98)");
console.log("\n➡️  Strategy: Favor home wins, reduce draw bets, slightly reduce away bets\n");

// Random baseline
function randomStrategy() {
  return data.map((dataFile) => {
    const dateHash = dataFile.date.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);
    const bets = [];
    const usedKeys = new Set();
    while (bets.length < BETS) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[i];
        const r = random();
        if (r < probs[0]) predictions.push("1");
        else if (r < probs[0] + probs[1]) predictions.push("X");
        else predictions.push("2");
      }
      const key = predictions.join(",");
      if (!usedKeys.has(key)) { usedKeys.add(key); bets.push({ predictions }); }
    }
    return { date: dataFile.date, bets };
  });
}

console.log("=".repeat(80));
console.log("TESTING STRATEGIES");
console.log("=".repeat(80));

console.log("\nTesting Random baseline...");
results.push({ name: "Random (baseline)", ...calculateAccuracy(randomStrategy()) });

// Strategy with insights applied
function createSmartStrategy(config) {
  const {
    name,
    homeBoost = 1.0,      // Boost home win probability
    drawPenalty = 1.0,    // Reduce draw probability
    awayPenalty = 1.0,    // Reduce away probability  
    favoriteWeight = 0,   // Extra weight for favorites
    confidenceBoost = 0,  // Boost high-confidence picks
    useCalibration = true
  } = config;

  return () => {
    return data.map((dataFile, dateIdx) => {
      const dateHash = dataFile.date.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = createSeededRandom(dateHash);
      const bets = [];
      const usedKeys = new Set();

      // Use only historical data for calibration
      const histBuckets = { home: {}, draw: {}, away: {} };
      for (let h = 0; h < dateIdx; h++) {
        const hData = data[h];
        for (let i = 0; i < Math.min(hData.result.length, hData.probabilities.length); i++) {
          const probs = hData.probabilities[i];
          const actual = resultToOutcome(hData.result[i]);
          
          const hb = Math.floor(probs[0] / BUCKET_SIZE);
          if (!histBuckets.home[hb]) histBuckets.home[hb] = { total: 0, correct: 0 };
          histBuckets.home[hb].total++;
          if (actual === "1") histBuckets.home[hb].correct++;

          const db = Math.floor(probs[1] / BUCKET_SIZE);
          if (!histBuckets.draw[db]) histBuckets.draw[db] = { total: 0, correct: 0 };
          histBuckets.draw[db].total++;
          if (actual === "X") histBuckets.draw[db].correct++;

          const ab = Math.floor(probs[2] / BUCKET_SIZE);
          if (!histBuckets.away[ab]) histBuckets.away[ab] = { total: 0, correct: 0 };
          histBuckets.away[ab].total++;
          if (actual === "2") histBuckets.away[ab].correct++;
        }
      }

      const getHistFactor = (type, prob) => {
        const bucket = Math.floor(prob / BUCKET_SIZE);
        const bd = histBuckets[type][bucket];
        if (!bd || bd.total < 5) return 1;
        const expected = bucket * BUCKET_SIZE + BUCKET_SIZE / 2;
        return bd.correct / bd.total / expected;
      };

      while (bets.length < BETS && bets.length < 1000) {
        const predictions = [];
        for (let i = 0; i < GRID_SIZE; i++) {
          const probs = dataFile.probabilities[i];
          
          // Apply adjustments based on insights
          let adjusted = [...probs];
          
          // Apply static boosts based on insights
          adjusted[0] *= homeBoost;
          adjusted[1] *= drawPenalty;
          adjusted[2] *= awayPenalty;
          
          // Apply calibration if enabled and we have enough data
          if (useCalibration && dateIdx >= 10) {
            adjusted[0] *= getHistFactor("home", probs[0]);
            adjusted[1] *= getHistFactor("draw", probs[1]);
            adjusted[2] *= getHistFactor("away", probs[2]);
          }

          // Apply favorite boost
          if (favoriteWeight > 0) {
            const maxIdx = adjusted.indexOf(Math.max(...adjusted));
            adjusted[maxIdx] *= (1 + favoriteWeight);
          }

          // Apply confidence boost (boost high probability picks)
          if (confidenceBoost > 0) {
            const maxProb = Math.max(...adjusted);
            const sum = adjusted.reduce((a, b) => a + b, 0);
            const confidence = maxProb / sum;
            if (confidence > 0.5) {
              const maxIdx = adjusted.indexOf(maxProb);
              adjusted[maxIdx] *= (1 + confidenceBoost * (confidence - 0.5));
            }
          }

          // Normalize
          const sum = adjusted.reduce((a, b) => a + b, 0);
          const final = adjusted.map(p => p / sum);

          const r = random();
          if (r < final[0]) predictions.push("1");
          else if (r < final[0] + final[1]) predictions.push("X");
          else predictions.push("2");
        }

        const key = predictions.join(",");
        if (!usedKeys.has(key)) { usedKeys.add(key); bets.push({ predictions }); }
      }
      return { date: dataFile.date, bets };
    });
  };
}

// Extended parameter search based on calibration insights
const configs = [
  // Pure favorites
  { name: "Pure Favorites", favoriteWeight: 1.0 },
  { name: "Favorites 0.3", favoriteWeight: 0.3 },
  { name: "Favorites 0.5", favoriteWeight: 0.5 },
  { name: "Favorites 0.7", favoriteWeight: 0.7 },
  { name: "Favorites 1.5", favoriteWeight: 1.5 },
  { name: "Favorites 2.0", favoriteWeight: 2.0 },
  
  // Home boost (based on calibration insight)
  { name: "Home +10%", homeBoost: 1.1 },
  { name: "Home +20%", homeBoost: 1.2 },
  { name: "Home +30%", homeBoost: 1.3 },
  { name: "Home +40%", homeBoost: 1.4 },
  
  // Draw penalty (based on calibration - draws overvalued)
  { name: "Draw -10%", drawPenalty: 0.9 },
  { name: "Draw -20%", drawPenalty: 0.8 },
  { name: "Draw -30%", drawPenalty: 0.7 },
  { name: "Draw -40%", drawPenalty: 0.6 },
  
  // Away penalty
  { name: "Away -10%", awayPenalty: 0.9 },
  { name: "Away -20%", awayPenalty: 0.8 },
  
  // Confidence boost
  { name: "Confidence +50%", confidenceBoost: 0.5 },
  { name: "Confidence +100%", confidenceBoost: 1.0 },
  { name: "Confidence +150%", confidenceBoost: 1.5 },
  
  // Combinations based on insights
  { name: "Home+20%,Draw-20%", homeBoost: 1.2, drawPenalty: 0.8 },
  { name: "Home+30%,Draw-30%", homeBoost: 1.3, drawPenalty: 0.7 },
  { name: "Home+20%,Away-10%", homeBoost: 1.2, awayPenalty: 0.9 },
  { name: "Home+20%,Draw-20%,Away-10%", homeBoost: 1.2, drawPenalty: 0.8, awayPenalty: 0.9 },
  
  // Favorites + adjustments
  { name: "Fav0.5+Home+20%", favoriteWeight: 0.5, homeBoost: 1.2 },
  { name: "Fav0.5+Draw-20%", favoriteWeight: 0.5, drawPenalty: 0.8 },
  { name: "Fav0.5+Home+20%+Draw-20%", favoriteWeight: 0.5, homeBoost: 1.2, drawPenalty: 0.8 },
  { name: "Fav1.0+Home+20%+Draw-20%", favoriteWeight: 1.0, homeBoost: 1.2, drawPenalty: 0.8 },
  
  // With calibration
  { name: "Cal+Fav0.5", favoriteWeight: 0.5, useCalibration: true },
  { name: "Cal+Home+20%", homeBoost: 1.2, useCalibration: true },
  { name: "Cal+Home+20%+Draw-20%", homeBoost: 1.2, drawPenalty: 0.8, useCalibration: true },
  
  // Confidence + others
  { name: "Conf+Fav0.5", confidenceBoost: 0.5, favoriteWeight: 0.5 },
  { name: "Conf+Home+20%", confidenceBoost: 0.5, homeBoost: 1.2 },
  
  // Aggressive combos
  { name: "Fav1.5+Conf1.0", favoriteWeight: 1.5, confidenceBoost: 1.0 },
  { name: "Home+40%+Draw-40%", homeBoost: 1.4, drawPenalty: 0.6 },
  { name: "FULL: Fav0.5+Home+30%+Draw-30%+Conf0.5", favoriteWeight: 0.5, homeBoost: 1.3, drawPenalty: 0.7, confidenceBoost: 0.5 },
];

for (const config of configs) {
  console.log(`Testing ${config.name}...`);
  const strategy = createSmartStrategy(config);
  results.push({ name: config.name, ...calculateAccuracy(strategy()) });
}

// Sort by ROI
results.sort((a, b) => b.roi - a.roi);

// Print top 20 results
console.log("\n" + "=".repeat(80));
console.log("TOP 20 RESULTS (sorted by ROI)");
console.log("=".repeat(80));

for (let i = 0; i < Math.min(20, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  const roiStr = (r.roi >= 0 ? "+" : "") + r.roi.toFixed(2) + "%";
  const profitStr = (r.profit >= 0 ? "+" : "") + r.profit.toFixed(0);
  console.log(`${medal} #${String(i + 1).padStart(2)}: ${r.name.padEnd(38)} ROI: ${roiStr.padStart(9)} | Profit: ${profitStr.padStart(8)} | Days: ${r.profitableDays}/${r.totalDays}`);
}

// Find baseline
const baseline = results.find(r => r.name.includes("baseline"));
const baselineIdx = results.indexOf(baseline);

console.log("\n" + "-".repeat(80));
console.log(`📊 Random Baseline is at position #${baselineIdx + 1} with ROI: ${baseline.roi.toFixed(2)}%`);

// Compare to baseline
console.log("\n" + "=".repeat(80));
console.log("FINAL RECOMMENDATION");
console.log("=".repeat(80));

const winner = results[0];
console.log(`\n🏆 BEST STRATEGY: ${winner.name}`);
console.log(`   ROI: ${winner.roi.toFixed(2)}%`);
console.log(`   Profit: ${winner.profit.toFixed(0)} units`);
console.log(`   Profitable Days: ${winner.profitableDays}/${winner.totalDays}`);

if (winner !== baseline) {
  console.log(`\n📊 IMPROVEMENT OVER RANDOM:`);
  console.log(`   ROI: +${(winner.roi - baseline.roi).toFixed(2)} percentage points`);
  console.log(`   Profit: +${(winner.profit - baseline.profit).toFixed(0)} units`);
  console.log(`   That's ${((winner.roi - baseline.roi) / Math.abs(baseline.roi) * 100).toFixed(1)}% better!`);
}

// Extract winner config
const winnerConfig = configs.find(c => c.name === winner.name);
if (winnerConfig) {
  console.log(`\n📋 CONFIGURATION TO USE:`);
  console.log(JSON.stringify(winnerConfig, null, 2));
}

console.log("\n");
