/**
 * Strategy Testing Script
 *
 * Run with: node scripts/testStrategies.mjs
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
    probabilities.push([
      rawProbs[0] / sum,
      rawProbs[1] / sum,
      rawProbs[2] / sum,
    ]);
  }
  return probabilities;
}

const data = files
  .map((file) => {
    const content = JSON.parse(
      fs.readFileSync(path.join(dataDir, file), "utf-8")
    );
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

    for (const bet of result.bets) {
      // Check each line
      let correctLines = 0;
      let linePayout = 0;

      for (const line of STANDARD_LINES) {
        let allCorrect = true;
        let payout = 1;

        for (const pos of line.positions) {
          const prediction = bet.predictions[pos];
          const actual = resultToOutcome(dataFile.result[pos]);

          if (prediction === actual) {
            // Get odds for this prediction
            const oddsIdx =
              pos * 3 + (prediction === "1" ? 0 : prediction === "X" ? 1 : 2);
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
      totalCost += 27; // 27 lines per bet
      totalBets++;
    }

    // Check if day was profitable
    const dayBets = result.bets.length;
    const dayCost = dayBets * 27;
    let dayWinnings = 0;

    for (const bet of result.bets) {
      for (const line of STANDARD_LINES) {
        let allCorrect = true;
        let payout = 1;

        for (const pos of line.positions) {
          const prediction = bet.predictions[pos];
          const actual = resultToOutcome(dataFile.result[pos]);

          if (prediction === actual) {
            const oddsIdx =
              pos * 3 + (prediction === "1" ? 0 : prediction === "X" ? 1 : 2);
            payout *= dataFile.odds[oddsIdx];
          } else {
            allCorrect = false;
          }
        }

        if (allCorrect) {
          dayWinnings += payout;
        }
      }
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

// Strategy: Random based on probabilities
function randomStrategy(betsCount = 50) {
  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);

    const bets = [];
    const usedKeys = new Set();

    while (bets.length < betsCount) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[i];
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

// Strategy: Always pick favorites
function favoriteStrategy(betsCount = 50, upsetChance = 0.3) {
  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);

    const bets = [];
    const usedKeys = new Set();

    while (bets.length < betsCount) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[i];
        const outcomes = ["1", "X", "2"];
        const favorite = outcomes[probs.indexOf(Math.max(...probs))];

        if (random() < upsetChance) {
          // Pick non-favorite
          const nonFavs = outcomes.filter((o) => o !== favorite);
          predictions.push(nonFavs[Math.floor(random() * nonFavs.length)]);
        } else {
          predictions.push(favorite);
        }
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

// Strategy: Boost draw probability
function drawBoostStrategy(betsCount = 50, boost = 1.5) {
  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);

    const bets = [];
    const usedKeys = new Set();

    while (bets.length < betsCount) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[i];
        const boosted = [probs[0], probs[1] * boost, probs[2]];
        const sum = boosted.reduce((a, b) => a + b, 0);
        const normalized = boosted.map((p) => p / sum);

        const r = random();
        if (r < normalized[0]) predictions.push("1");
        else if (r < normalized[0] + normalized[1]) predictions.push("X");
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

// Strategy: Favor high odds (longshots)
function highOddsStrategy(betsCount = 50, bias = 0.2) {
  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);

    const bets = [];
    const usedKeys = new Set();

    while (bets.length < betsCount) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[i];
        const outcomes = ["1", "X", "2"];

        if (random() < bias) {
          // Pick lowest probability (highest odds)
          predictions.push(outcomes[probs.indexOf(Math.min(...probs))]);
        } else {
          // Normal probability-based selection
          const r = random();
          if (r < probs[0]) predictions.push("1");
          else if (r < probs[0] + probs[1]) predictions.push("X");
          else predictions.push("2");
        }
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

// Strategy: Value-based (look for positive EV based on calibration)
function calibratedStrategy(betsCount = 50) {
  // Build calibration from ALL historical data
  const buckets = { home: {}, draw: {}, away: {} };
  const BUCKET_SIZE = 0.1;

  // First pass: collect outcomes by probability bucket
  for (const dataFile of data) {
    for (
      let i = 0;
      i < Math.min(dataFile.result.length, dataFile.probabilities.length);
      i++
    ) {
      const probs = dataFile.probabilities[i];
      const actual = resultToOutcome(dataFile.result[i]);

      // Home
      const homeBucket = Math.floor(probs[0] / BUCKET_SIZE);
      if (!buckets.home[homeBucket])
        buckets.home[homeBucket] = { total: 0, correct: 0 };
      buckets.home[homeBucket].total++;
      if (actual === "1") buckets.home[homeBucket].correct++;

      // Draw
      const drawBucket = Math.floor(probs[1] / BUCKET_SIZE);
      if (!buckets.draw[drawBucket])
        buckets.draw[drawBucket] = { total: 0, correct: 0 };
      buckets.draw[drawBucket].total++;
      if (actual === "X") buckets.draw[drawBucket].correct++;

      // Away
      const awayBucket = Math.floor(probs[2] / BUCKET_SIZE);
      if (!buckets.away[awayBucket])
        buckets.away[awayBucket] = { total: 0, correct: 0 };
      buckets.away[awayBucket].total++;
      if (actual === "2") buckets.away[awayBucket].correct++;
    }
  }

  console.log("\n=== CALIBRATION ANALYSIS ===");
  console.log("\nHome win calibration:");
  for (const [bucket, data] of Object.entries(buckets.home).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    const expected = Number(bucket) * BUCKET_SIZE + BUCKET_SIZE / 2;
    const actual = data.correct / data.total;
    const factor = actual / expected;
    console.log(
      `  ${(Number(bucket) * BUCKET_SIZE * 100).toFixed(0)}-${(
        (Number(bucket) + 1) *
        BUCKET_SIZE *
        100
      ).toFixed(0)}%: expected ${(expected * 100).toFixed(0)}%, actual ${(
        actual * 100
      ).toFixed(1)}%, factor ${factor.toFixed(2)} (n=${data.total})`
    );
  }

  console.log("\nDraw calibration:");
  for (const [bucket, data] of Object.entries(buckets.draw).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    const expected = Number(bucket) * BUCKET_SIZE + BUCKET_SIZE / 2;
    const actual = data.correct / data.total;
    const factor = actual / expected;
    console.log(
      `  ${(Number(bucket) * BUCKET_SIZE * 100).toFixed(0)}-${(
        (Number(bucket) + 1) *
        BUCKET_SIZE *
        100
      ).toFixed(0)}%: expected ${(expected * 100).toFixed(0)}%, actual ${(
        actual * 100
      ).toFixed(1)}%, factor ${factor.toFixed(2)} (n=${data.total})`
    );
  }

  console.log("\nAway win calibration:");
  for (const [bucket, data] of Object.entries(buckets.away).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    const expected = Number(bucket) * BUCKET_SIZE + BUCKET_SIZE / 2;
    const actual = data.correct / data.total;
    const factor = actual / expected;
    console.log(
      `  ${(Number(bucket) * BUCKET_SIZE * 100).toFixed(0)}-${(
        (Number(bucket) + 1) *
        BUCKET_SIZE *
        100
      ).toFixed(0)}%: expected ${(expected * 100).toFixed(0)}%, actual ${(
        actual * 100
      ).toFixed(1)}%, factor ${factor.toFixed(2)} (n=${data.total})`
    );
  }

  // Calculate calibration factors
  const getCalibrationFactor = (type, prob) => {
    const bucket = Math.floor(prob / BUCKET_SIZE);
    const bucketData = buckets[type][bucket];
    if (!bucketData || bucketData.total < 10) return 1;
    const expected = bucket * BUCKET_SIZE + BUCKET_SIZE / 2;
    return bucketData.correct / bucketData.total / expected;
  };

  // Now generate bets using calibration
  return data.map((dataFile) => {
    const dateHash = dataFile.date
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(dateHash);

    const bets = [];
    const usedKeys = new Set();

    while (bets.length < betsCount) {
      const predictions = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const probs = dataFile.probabilities[i];
        const odds = [
          dataFile.odds[i * 3],
          dataFile.odds[i * 3 + 1],
          dataFile.odds[i * 3 + 2],
        ];

        // Calibrate probabilities
        const calibrated = [
          probs[0] * getCalibrationFactor("home", probs[0]),
          probs[1] * getCalibrationFactor("draw", probs[1]),
          probs[2] * getCalibrationFactor("away", probs[2]),
        ];
        const sum = calibrated.reduce((a, b) => a + b, 0);
        const normalized = calibrated.map((p) => p / sum);

        // Calculate expected value
        const ev = [
          normalized[0] * odds[0] - 1,
          normalized[1] * odds[1] - 1,
          normalized[2] * odds[2] - 1,
        ];

        // Blend: pick based on calibrated probs with EV boost
        const evBoost = ev.map((e) => Math.max(0, e + 0.3));
        const evSum = evBoost.reduce((a, b) => a + b, 0);
        const evProbs = evSum > 0 ? evBoost.map((e) => e / evSum) : normalized;

        const blend = normalized.map((p, j) => p * 0.5 + evProbs[j] * 0.5);
        const blendSum = blend.reduce((a, b) => a + b, 0);
        const final = blend.map((p) => p / blendSum);

        const r = random();
        if (r < final[0]) predictions.push("1");
        else if (r < final[0] + final[1]) predictions.push("X");
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

// Run all tests
console.log("=".repeat(80));
console.log("STRATEGY TESTING - Finding the Best Approach");
console.log("=".repeat(80));

const results = [];
const BETS = 50;

// Test baseline random
console.log("\nTesting Random...");
const randomBets = randomStrategy(BETS);
results.push({ name: "Random (baseline)", ...calculateAccuracy(randomBets) });

// Test favorites with different upset chances
for (const upset of [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
  console.log(`Testing Favorites (upset=${upset})...`);
  const bets = favoriteStrategy(BETS, upset);
  results.push({
    name: `Favorites (upset=${upset})`,
    ...calculateAccuracy(bets),
  });
}

// Test draw boost
for (const boost of [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5, 3.0]) {
  console.log(`Testing Draw Boost (${boost}x)...`);
  const bets = drawBoostStrategy(BETS, boost);
  results.push({ name: `Draw Boost (${boost}x)`, ...calculateAccuracy(bets) });
}

// Test high odds
for (const bias of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
  console.log(`Testing High Odds (bias=${bias})...`);
  const bets = highOddsStrategy(BETS, bias);
  results.push({
    name: `High Odds (bias=${bias})`,
    ...calculateAccuracy(bets),
  });
}

// Test calibrated
console.log("Testing Calibrated...");
const calibratedBets = calibratedStrategy(BETS);
results.push({ name: "Calibrated", ...calculateAccuracy(calibratedBets) });

// Sort by ROI
results.sort((a, b) => b.roi - a.roi);

// Print results
console.log("\n" + "=".repeat(80));
console.log("RESULTS (sorted by ROI)");
console.log("=".repeat(80));
console.log("");

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  const roiStr = (r.roi >= 0 ? "+" : "") + r.roi.toFixed(2) + "%";
  const profitStr = (r.profit >= 0 ? "+" : "") + r.profit.toFixed(0);
  console.log(
    `${medal} #${String(i + 1).padStart(2)}: ${r.name.padEnd(
      30
    )} ROI: ${roiStr.padStart(9)} | Profit: ${profitStr.padStart(8)} | Days: ${
      r.profitableDays
    }/${r.totalDays}`
  );
}

// Analysis
console.log("\n" + "=".repeat(80));
console.log("WINNER ANALYSIS");
console.log("=".repeat(80));

const winner = results[0];
const baseline = results.find((r) => r.name.includes("baseline"));

console.log(`\nBest Strategy: ${winner.name}`);
console.log(`ROI: ${winner.roi.toFixed(2)}%`);
console.log(
  `Total Profit: ${winner.profit.toFixed(0)} (from ${winner.totalCost.toFixed(
    0
  )} cost)`
);
console.log(
  `Profitable Days: ${winner.profitableDays}/${winner.totalDays} (${(
    (winner.profitableDays / winner.totalDays) *
    100
  ).toFixed(0)}%)`
);

if (baseline) {
  console.log(`\nImprovement over Random:`);
  console.log(
    `  ROI: ${(winner.roi - baseline.roi).toFixed(2)} percentage points`
  );
  console.log(
    `  Profit: ${(winner.profit - baseline.profit).toFixed(0)} units`
  );
}

console.log("\n");
