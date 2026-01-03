/**
 * Deep Parameter Tuning - Find the absolute best parameters
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../src/assets/data");
const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json") && !f.includes("teams"));

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
    return { ...content, date, probabilities: calculateProbabilities(content.odds) };
  })
  .filter((d) => d.result !== undefined)
  .sort((a, b) => a.date.localeCompare(b.date));

console.log(`Loaded ${data.length} rounds\n`);

function resultToOutcome(r) { return r === "0" ? "1" : r === "1" ? "X" : "2"; }

const GRID_SIZE = 9;
const LINES = [];
for (const c1 of [0, 3, 6]) for (const c2 of [1, 4, 7]) for (const c3 of [2, 5, 8]) LINES.push([c1, c2, c3]);

function createRandom(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function test(betsResults) {
  let wins = 0, cost = 0, days = 0;
  for (const result of betsResults) {
    const df = data.find((d) => d.date === result.date);
    if (!df) continue;
    let dayWin = 0;
    for (const bet of result.bets) {
      for (const line of LINES) {
        let ok = true, pay = 1;
        for (const pos of line) {
          const pred = bet.predictions[pos], actual = resultToOutcome(df.result[pos]);
          if (pred === actual) pay *= df.odds[pos * 3 + (pred === "1" ? 0 : pred === "X" ? 1 : 2)];
          else ok = false;
        }
        if (ok) { dayWin += pay; wins += pay; }
      }
      cost += 27;
    }
    if (dayWin > result.bets.length * 27) days++;
  }
  return { roi: cost > 0 ? ((wins - cost) / cost) * 100 : 0, profit: wins - cost, days };
}

const BETS = 50;

// Test function with parameters
function runStrategy(params) {
  const { homeBoost = 1, drawPenalty = 1, awayPenalty = 1, favWeight = 0, confBoost = 0 } = params;
  
  return data.map((df) => {
    const rnd = createRandom(df.date.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    const bets = [], used = new Set();
    
    // Adjusted probs for each match
    const adjusted = df.probabilities.slice(0, GRID_SIZE).map(p => {
      let adj = [p[0] * homeBoost, p[1] * drawPenalty, p[2] * awayPenalty];
      if (favWeight > 0) { const m = adj.indexOf(Math.max(...adj)); adj[m] *= (1 + favWeight); }
      if (confBoost > 0) {
        const s = adj.reduce((a, b) => a + b, 0);
        const mx = Math.max(...adj) / s;
        if (mx > 0.5) { const m = adj.indexOf(Math.max(...adj)); adj[m] *= (1 + confBoost * (mx - 0.5)); }
      }
      const s = adj.reduce((a, b) => a + b, 0);
      return adj.map(x => x / s);
    });
    
    // Favorite bet
    const fav = adjusted.map(p => ["1", "X", "2"][p.indexOf(Math.max(...p))]);
    bets.push({ predictions: fav }); used.add(fav.join(","));
    
    // Random bets
    while (bets.length < BETS) {
      const pred = adjusted.map(p => { const r = rnd(); return r < p[0] ? "1" : r < p[0] + p[1] ? "X" : "2"; });
      const k = pred.join(",");
      if (!used.has(k)) { used.add(k); bets.push({ predictions: pred }); }
    }
    return { date: df.date, bets };
  });
}

// Grid search
console.log("=".repeat(60));
console.log("DEEP PARAMETER SEARCH");
console.log("=".repeat(60));

const results = [];

// Baseline
results.push({ name: "Random", ...test(runStrategy({ homeBoost: 1, drawPenalty: 1, favWeight: 0, confBoost: 0 })) });

// Extended grid search
const homeBoosts = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
const drawPenalties = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const awayPenalties = [0.8, 0.9, 1.0];
const favWeights = [0, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0];
const confBoosts = [0, 0.3, 0.5, 0.7, 1.0];

let count = 0;
const total = homeBoosts.length * drawPenalties.length * awayPenalties.length * favWeights.length * confBoosts.length;

for (const hb of homeBoosts) {
  for (const dp of drawPenalties) {
    for (const ap of awayPenalties) {
      for (const fw of favWeights) {
        for (const cb of confBoosts) {
          count++;
          if (count % 500 === 0) console.log(`Progress: ${count}/${total}`);
          
          const r = test(runStrategy({ homeBoost: hb, drawPenalty: dp, awayPenalty: ap, favWeight: fw, confBoost: cb }));
          results.push({ 
            name: `H${hb}_D${dp}_A${ap}_F${fw}_C${cb}`, 
            params: { homeBoost: hb, drawPenalty: dp, awayPenalty: ap, favWeight: fw, confBoost: cb },
            ...r 
          });
        }
      }
    }
  }
}

console.log(`\nTested ${results.length} configurations\n`);

// Sort and show top 20
results.sort((a, b) => b.roi - a.roi);

console.log("=".repeat(60));
console.log("TOP 20 CONFIGURATIONS");
console.log("=".repeat(60));

for (let i = 0; i < 20; i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(`${medal} #${i + 1}: ROI: ${r.roi.toFixed(2)}% | Profit: ${r.profit.toFixed(0)} | Days: ${r.days}/84`);
  if (r.params) console.log(`      ${JSON.stringify(r.params)}`);
}

// Find baseline position
const baselineIdx = results.findIndex(r => r.name === "Random");
console.log(`\n📊 Random baseline is at position #${baselineIdx + 1}`);

const best = results[0];
const baseline = results[baselineIdx];

console.log("\n" + "=".repeat(60));
console.log("BEST CONFIGURATION");
console.log("=".repeat(60));
console.log(`\n🏆 ${best.name}`);
console.log(`   ROI: ${best.roi.toFixed(2)}%`);
console.log(`   Improvement over Random: +${(best.roi - baseline.roi).toFixed(2)} percentage points`);
console.log(`   That's ${((best.roi - baseline.roi) / Math.abs(baseline.roi) * 100).toFixed(1)}% better!`);

if (best.params) {
  console.log(`\n📋 Parameters to use:`);
  console.log(JSON.stringify(best.params, null, 2));
}

// Also find some diverse good strategies for variety
console.log("\n" + "=".repeat(60));
console.log("DIVERSE TOP STRATEGIES (for variety in UI)");
console.log("=".repeat(60));

const diverse = [results[0]];
for (const r of results.slice(1)) {
  if (diverse.length >= 5) break;
  if (!r.params) continue;
  
  // Check if significantly different from existing
  const isDifferent = diverse.every(d => {
    if (!d.params) return true;
    const diff = Math.abs(d.params.homeBoost - r.params.homeBoost) +
                 Math.abs(d.params.drawPenalty - r.params.drawPenalty) +
                 Math.abs(d.params.favWeight - r.params.favWeight);
    return diff > 0.5;
  });
  
  if (isDifferent) diverse.push(r);
}

console.log("\nTop diverse strategies:");
for (let i = 0; i < diverse.length; i++) {
  const r = diverse[i];
  console.log(`\n${i + 1}. ROI: ${r.roi.toFixed(2)}%`);
  console.log(`   ${JSON.stringify(r.params)}`);
}

console.log("\n");

