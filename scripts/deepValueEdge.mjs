/**
 * Deep Value Edge Strategy Optimization
 *
 * Run with: node scripts/deepValueEdge.mjs
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

function selectBestMatches(probabilities, count = 9) {
  const ranked = probabilities
    .map((probs, index) => ({ index, confidence: Math.max(...probs) }))
    .sort((a, b) => b.confidence - a.confidence);
  return ranked.slice(0, count).map((m) => m.index);
}

function calculateAccuracy(betsResults) {
  let totalBets = 0;
  let totalWinnings = 0;
  let totalCost = 0;
  let profitableDays = 0;

  for (const result of betsResults) {
    const dataFile = data.find((d) => d.date === result.date);
    if (!dataFile) continue;

    const selectedIndices = selectBestMatches(dataFile.probabilities, GRID_SIZE);
    let dayWinnings = 0;
    const dayCost = result.bets.length * 27;

    for (const bet of result.bets) {
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
          totalWinnings += payout;
          dayWinnings += payout;
        }
      }
      totalCost += 27;
      totalBets++;
    }

    if (dayWinnings > dayCost) profitableDays++;
  }

  const profit = totalWinnings - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return { totalBets, totalWinnings, totalCost, profit, roi, profitableDays };
}

function valueEdgeStrategy(betsCount, params) {
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
      
      // Classification
      const minOdds = Math.min(...odds);
      const favoriteIdx = odds.indexOf(minOdds);
      const isStrongFavorite = minOdds < params.strongFavoriteOdds;
      const isInTrapZone = minOdds >= params.trapZoneMin && minOdds <= params.trapZoneMax;
      const ev = [impliedProbs[0] * odds[0], impliedProbs[1] * odds[1], impliedProbs[2] * odds[2]];

      let adjusted = [...impliedProbs];

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
      if (isStrongFavorite) {
        adjusted[favoriteIdx] *= params.strongFavoriteBoost;
      } else if (isInTrapZone) {
        if (ev[favoriteIdx] >= params.trapZoneValueThreshold) {
          adjusted[favoriteIdx] *= params.favoriteBoost;
        } else {
          adjusted[favoriteIdx] *= params.trapPenalty;
        }
      } else {
        const sum = adjusted.reduce((a, b) => a + b, 0);
        const maxProb = Math.max(...adjusted) / sum;
        if (maxProb > params.confidenceThreshold) {
          const maxIdx = adjusted.indexOf(Math.max(...adjusted));
          adjusted[maxIdx] *= params.favoriteBoost;
        }
      }

      // Value edge detection
      for (let i = 0; i < 3; i++) {
        if (ev[i] > params.evThreshold) {
          adjusted[i] *= 1 + (ev[i] - 1) * params.evMultiplier;
        }
      }

      const sum = adjusted.reduce((a, b) => a + b, 0);
      return [adjusted[0] / sum, adjusted[1] / sum, adjusted[2] / sum];
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
        const favoriteIdx = probs.indexOf(Math.max(...probs));

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

console.log("=".repeat(80));
console.log("DEEP VALUE EDGE OPTIMIZATION");
console.log("=".repeat(80));

const BETS = 50;
const results = [];

// More granular search around the best params
const homeBoosts = [1.9, 2.0, 2.1, 2.2];
const drawPenalties = [0.25, 0.30, 0.35];
const favoriteBoosts = [2.3, 2.5, 2.7, 3.0];
const upsetBases = [0.10, 0.12, 0.14];
const strongFavoriteBoosts = [3.5, 4.0, 4.5, 5.0];
const trapPenalties = [0.7, 0.8, 0.9];
const evThresholds = [1.0, 1.05, 1.1];
const evMultipliers = [0.3, 0.5, 0.7];

let best = { roi: -Infinity, params: null };
let tested = 0;
const total = homeBoosts.length * drawPenalties.length * favoriteBoosts.length * 
              upsetBases.length * strongFavoriteBoosts.length * trapPenalties.length *
              evThresholds.length * evMultipliers.length;

console.log(`Testing ${total} parameter combinations...`);

for (const homeBoostBase of homeBoosts) {
  for (const drawPenalty of drawPenalties) {
    for (const favoriteBoost of favoriteBoosts) {
      for (const upsetChanceBase of upsetBases) {
        for (const strongFavoriteBoost of strongFavoriteBoosts) {
          for (const trapPenalty of trapPenalties) {
            for (const evThreshold of evThresholds) {
              for (const evMultiplier of evMultipliers) {
                const params = {
                  strongFavoriteOdds: 1.45,
                  trapZoneMin: 1.45,
                  trapZoneMax: 2.30,
                  trapZoneValueThreshold: 1.15,
                  homeBoostBase,
                  homeUnderdogBoost: 0.4,
                  drawPenalty,
                  drawHighOddsThreshold: 4.0,
                  awayPenalty: 0.75,
                  favoriteBoost,
                  strongFavoriteBoost,
                  trapPenalty,
                  confidenceThreshold: 0.55,
                  upsetChanceBase,
                  maxUpsets: 2,
                  evThreshold,
                  evMultiplier,
                };

                const bets = valueEdgeStrategy(BETS, params);
                const result = calculateAccuracy(bets);
                tested++;

                if (tested % 1000 === 0) {
                  process.stdout.write(`\rProgress: ${tested}/${total} (${((tested/total)*100).toFixed(1)}%) | Best: ${best.roi.toFixed(2)}%`);
                }

                results.push({
                  params: {
                    homeBoostBase,
                    drawPenalty,
                    favoriteBoost,
                    upsetChanceBase,
                    strongFavoriteBoost,
                    trapPenalty,
                    evThreshold,
                    evMultiplier,
                  },
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
      }
    }
  }
}

console.log(`\n\nTested ${tested} parameter combinations\n`);

results.sort((a, b) => b.roi - a.roi);

console.log("TOP 15 CONFIGURATIONS:");
console.log("-".repeat(100));
for (let i = 0; i < Math.min(15, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(
    `${medal} #${String(i + 1).padStart(2)}: ROI ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(2)}% | ` +
      `Profit: ${r.profit >= 0 ? "+" : ""}${r.profit.toFixed(0)} | Days: ${r.profitableDays}/${data.length}`
  );
  console.log(
    `       H:${r.params.homeBoostBase} D:${r.params.drawPenalty} F:${r.params.favoriteBoost} ` +
    `U:${r.params.upsetChanceBase} SF:${r.params.strongFavoriteBoost} TP:${r.params.trapPenalty} ` +
    `EV:${r.params.evThreshold}/${r.params.evMultiplier}`
  );
}

console.log("\n" + "=".repeat(80));
console.log("OPTIMAL CONFIGURATION FOR STRATEGY FILE");
console.log("=".repeat(80));

if (best.params) {
  console.log(`
// OPTIMAL PARAMETERS - ROI: +${best.roi.toFixed(2)}%
export const VALUE_EDGE_PARAMS = {
  strongFavoriteOdds: ${best.params.strongFavoriteOdds},
  trapZoneMin: ${best.params.trapZoneMin},
  trapZoneMax: ${best.params.trapZoneMax},
  trapZoneValueThreshold: ${best.params.trapZoneValueThreshold},
  homeBoostBase: ${best.params.homeBoostBase},
  homeUnderdogBoost: ${best.params.homeUnderdogBoost},
  drawPenalty: ${best.params.drawPenalty},
  drawHighOddsThreshold: ${best.params.drawHighOddsThreshold},
  awayPenalty: ${best.params.awayPenalty},
  favoriteBoost: ${best.params.favoriteBoost},
  strongFavoriteBoost: ${best.params.strongFavoriteBoost},
  trapPenalty: ${best.params.trapPenalty},
  confidenceThreshold: ${best.params.confidenceThreshold},
  upsetChanceBase: ${best.params.upsetChanceBase},
  maxUpsets: ${best.params.maxUpsets},
  evThreshold: ${best.params.evThreshold},
  evMultiplier: ${best.params.evMultiplier},
};
`);
}

console.log("\n");

