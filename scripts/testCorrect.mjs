/**
 * CORRECTED Test Script - Uses same match selection as UI
 * 
 * The UI uses selectBestMatches() which picks the 9 matches with highest
 * max(probability) from the original odds. We must use the same selection.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../src/assets/data");
const teamsDir = path.join(dataDir, "teams");

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

const allTeamData = {};
const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith(".json") && !f.includes("-all"));
for (const file of teamFiles) {
  allTeamData[file.replace(".json", "")] = JSON.parse(fs.readFileSync(path.join(teamsDir, file), "utf-8"));
}

console.log(`\n📊 Loaded ${data.length} rounds, ${Object.keys(allTeamData).length} teams\n`);

// ============================================================================
// MATCH SELECTION - SAME AS UI
// ============================================================================

/**
 * Selects matches exactly like the UI does - by highest max probability
 */
function selectBestMatches(probabilities, count = 9) {
  const ranked = probabilities
    .map((probs, index) => ({ index, confidence: Math.max(...probs) }))
    .sort((a, b) => b.confidence - a.confidence);
  return ranked.slice(0, count).map(m => m.index);
}

// ============================================================================
// TEAM ANALYSIS
// ============================================================================

function normalizeTeamName(n) { 
  return n.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-").replace(/\./g, "")
    .replace(/fc$/i, "").replace(/-+$/, "").trim(); 
}

function getMatchesBefore(td, before, c) { 
  if (!td) return []; 
  const m = []; 
  for (const x of td.matches) { if (x.date < before) { m.push(x); if (m.length >= c) break; } } 
  return m; 
}

function calculateFormScore(m) { 
  if (m.length === 0) return 50; 
  let s = 0, t = 0; 
  for (let i = 0; i < m.length; i++) { 
    const w = Math.pow(0.85, i); 
    s += (m[i].result === "W" ? 3 : m[i].result === "D" ? 1 : 0) * w; 
    t += 3 * w; 
  } 
  return (s / t) * 100; 
}

function detectMomentum(m) { 
  if (m.length < 6) return 0; 
  const r = m.slice(0, 3).reduce((s, x) => s + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0), 0); 
  const o = m.slice(3, 6).reduce((s, x) => s + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0), 0); 
  return (r - o) / 9; 
}

function getStreak(m) { 
  if (m.length === 0) return { type: null, length: 0 }; 
  const f = m[0].result; 
  let l = 0; 
  for (const x of m) { if (x.result === f) l++; else break; } 
  return { type: f, length: l }; 
}

function analyzeTeam(name, isHome, before, win = 12) {
  const k = normalizeTeamName(name), td = allTeamData[k];
  if (!td) return { formScore: 50, venueWinRate: 0.33, momentum: 0, streak: { type: null, length: 0 }, hasData: false };
  const rec = getMatchesBefore(td, before, win), venue = rec.filter(x => x.isHome === isHome);
  let vWin = 0.33; if (venue.length >= 3) vWin = venue.filter(x => x.result === "W").length / venue.length;
  return { formScore: calculateFormScore(rec), venueWinRate: vWin, momentum: detectMomentum(rec), streak: getStreak(rec), hasData: rec.length >= 5 };
}

// ============================================================================
// STRATEGY - CORRECTED TO MATCH UI
// ============================================================================

const GRID = 9, BETS = 50, LINES = [];
for (const a of [0, 3, 6]) for (const b of [1, 4, 7]) for (const c of [2, 5, 8]) LINES.push([a, b, c]);

function toOC(r) { return r === "0" ? "1" : r === "1" ? "X" : "2"; }
function rng(s) { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }

function test(betsResults) {
  let w = 0, c = 0, d = 0;
  for (const r of betsResults) {
    const df = data.find(x => x.date === r.date); 
    if (!df) continue;
    
    // CRITICAL: Use same match selection as UI
    const selectedIndices = selectBestMatches(df.probabilities, GRID);
    
    let dw = 0;
    for (const bet of r.bets) {
      for (const line of LINES) { 
        let ok = true, pay = 1; 
        for (const pos of line) { 
          const matchIdx = selectedIndices[pos];
          const pred = bet.predictions[pos];
          const actual = toOC(df.result[matchIdx]);
          if (pred === actual) {
            pay *= df.odds[matchIdx * 3 + (pred === "1" ? 0 : pred === "X" ? 1 : 2)];
          } else {
            ok = false;
          }
        } 
        if (ok) { dw += pay; w += pay; } 
      } 
      c += 27;
    }
    if (dw > r.bets.length * 27) d++;
  }
  return { roi: c > 0 ? ((w - c) / c) * 100 : 0, profit: w - c, days: d };
}

function runTeamIntelligence(p) {
  return data.map(df => {
    const r = rng(df.date.split("").reduce((a, x) => a + x.charCodeAt(0), 0) + 42);
    
    // CRITICAL: Use same match selection as UI
    const selectedIndices = selectBestMatches(df.probabilities, GRID);
    
    // Calculate intelligent probabilities for each SELECTED match
    const matchProbs = selectedIndices.map(matchIdx => {
      if (matchIdx >= df.teams.length) {
        // Fallback for out of bounds
        return [0.33, 0.33, 0.34];
      }
      const hT = df.teams[matchIdx]["1"], aT = df.teams[matchIdx]["2"];
      const imp = df.probabilities[matchIdx];
      const hI = analyzeTeam(hT, true, df.date, p.matchWindow || 12);
      const aI = analyzeTeam(aT, false, df.date, p.matchWindow || 12);
      
      let pr;
      if (hI.hasData || aI.hasData) {
        const fd = (hI.formScore - aI.formScore) / 100;
        let hP = 0.35 + fd * p.formWeight, aP = 0.30 - fd * p.formWeight;
        if (hI.hasData) hP = hP * (1 - p.venueWeight) + hI.venueWinRate * p.venueWeight;
        if (aI.hasData) aP = aP * (1 - p.venueWeight) + aI.venueWinRate * p.venueWeight;
        hP += hI.momentum * p.momentumWeight; aP += aI.momentum * p.momentumWeight;
        if (hI.streak.type === "W" && hI.streak.length >= 2) hP += hI.streak.length * p.streakBonus;
        if (aI.streak.type === "W" && aI.streak.length >= 2) aP += aI.streak.length * p.streakBonus;
        if (hI.streak.type === "L" && hI.streak.length >= 2) hP -= hI.streak.length * p.streakBonus;
        if (aI.streak.type === "L" && aI.streak.length >= 2) aP -= aI.streak.length * p.streakBonus;
        hP = Math.max(0.08, Math.min(0.85, hP)); aP = Math.max(0.05, Math.min(0.75, aP));
        let dP = Math.max(0.1, 1 - hP - aP);
        const bl = [hP * p.blendFactor + imp[0] * (1 - p.blendFactor), dP * p.blendFactor + imp[1] * (1 - p.blendFactor), aP * p.blendFactor + imp[2] * (1 - p.blendFactor)];
        const adj = [bl[0] * p.homeBoost, bl[1] * p.drawPenalty, bl[2] * (p.awayPenalty || 1.0)];
        const s = adj.reduce((a, b) => a + b, 0); 
        pr = [adj[0] / s, adj[1] / s, adj[2] / s];
      } else {
        const adj = [imp[0] * p.homeBoost, imp[1] * p.drawPenalty, imp[2] * (p.awayPenalty || 1.0)];
        const s = adj.reduce((a, b) => a + b, 0); 
        pr = [adj[0] / s, adj[1] / s, adj[2] / s];
      }
      return pr;
    });
    
    const bets = [], used = new Set();
    
    // Favorite bet
    const fav = matchProbs.map(p => ["1", "X", "2"][p.indexOf(Math.max(...p))]);
    bets.push({ predictions: fav }); 
    used.add(fav.join(","));
    
    while (bets.length < BETS) { 
      const pred = matchProbs.map(p => { const x = r(); return x < p[0] ? "1" : x < p[0] + p[1] ? "X" : "2"; }); 
      const k = pred.join(","); 
      if (!used.has(k)) { used.add(k); bets.push({ predictions: pred }); } 
    }
    
    return { date: df.date, bets };
  });
}

function runRandom() {
  return data.map(df => {
    const r = rng(df.date.split("").reduce((a, x) => a + x.charCodeAt(0), 0) + 42);
    
    // CRITICAL: Use same match selection as UI
    const selectedIndices = selectBestMatches(df.probabilities, GRID);
    
    const bets = [], used = new Set();
    while (bets.length < BETS) { 
      const pred = selectedIndices.map(idx => {
        const p = df.probabilities[idx];
        const x = r(); 
        return x < p[0] ? "1" : x < p[0] + p[1] ? "X" : "2"; 
      }); 
      const k = pred.join(","); 
      if (!used.has(k)) { used.add(k); bets.push({ predictions: pred }); } 
    }
    return { date: df.date, bets };
  });
}

// ============================================================================
// RUN TESTS
// ============================================================================

console.log("=".repeat(70));
console.log("   CORRECTED TEST - Using same match selection as UI");
console.log("=".repeat(70));

// Old best params
const oldParams = { formWeight: 0.4, venueWeight: 0.25, momentumWeight: 0.2, streakBonus: 0.09, homeBoost: 1.65, drawPenalty: 0.45, blendFactor: 0.2, awayPenalty: 0.9, matchWindow: 12 };

console.log("\n📊 Testing with corrected match selection...\n");

const randomResult = test(runRandom());
const teamResult = test(runTeamIntelligence(oldParams));

console.log("┌" + "─".repeat(60) + "┐");
console.log("│ STRATEGY                    │   ROI    │ PROFIT  │ DAYS  │");
console.log("├" + "─".repeat(60) + "┤");
console.log(`│ 🎯 Team Intelligence        │ ${(teamResult.roi >= 0 ? "+" : "") + teamResult.roi.toFixed(2) + "%"} │ ${teamResult.profit.toFixed(0).padStart(7)} │ ${teamResult.days}/84 │`);
console.log(`│ 📊 Random (Baseline)        │ ${(randomResult.roi >= 0 ? "+" : "") + randomResult.roi.toFixed(2) + "%"} │ ${randomResult.profit.toFixed(0).padStart(7)} │ ${randomResult.days}/84 │`);
console.log("└" + "─".repeat(60) + "┘");

const diff = teamResult.roi - randomResult.roi;
console.log(`\n📈 Improvement: ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}pp vs Random`);

if (teamResult.roi < 0) {
  console.log("\n⚠️  Still negative ROI - need to re-tune with correct match selection!\n");
}

// Now re-tune with correct match selection
console.log("\n" + "=".repeat(70));
console.log("   RE-TUNING WITH CORRECT MATCH SELECTION");
console.log("=".repeat(70));

const results = [];

// Grid search with correct implementation
const formWeights = [0.3, 0.4, 0.5];
const venueWeights = [0.2, 0.3, 0.4];
const momentumWeights = [0.15, 0.2, 0.25];
const streakBonuses = [0.05, 0.07, 0.09];
const homeBoosts = [1.4, 1.5, 1.6, 1.7];
const drawPenalties = [0.4, 0.5, 0.6];
const blendFactors = [0.2, 0.3, 0.4];
const awayPenalties = [0.8, 0.9, 1.0];

let count = 0;
const total = formWeights.length * venueWeights.length * momentumWeights.length * 
              streakBonuses.length * homeBoosts.length * drawPenalties.length * 
              blendFactors.length * awayPenalties.length;

console.log(`\nTesting ${total} combinations...\n`);

for (const fw of formWeights)
for (const vw of venueWeights)
for (const mw of momentumWeights)
for (const sb of streakBonuses)
for (const hb of homeBoosts)
for (const dp of drawPenalties)
for (const bf of blendFactors)
for (const ap of awayPenalties) {
  count++;
  if (count % 1000 === 0) console.log(`Progress: ${count}/${total}`);
  const p = { formWeight: fw, venueWeight: vw, momentumWeight: mw, streakBonus: sb, homeBoost: hb, drawPenalty: dp, blendFactor: bf, awayPenalty: ap, matchWindow: 12 };
  results.push({ params: p, ...test(runTeamIntelligence(p)) });
}

results.sort((a, b) => b.roi - a.roi);

console.log("\n" + "=".repeat(70));
console.log("TOP 10 CONFIGURATIONS (CORRECTED)");
console.log("=".repeat(70));

for (let i = 0; i < Math.min(10, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(`${medal} #${i + 1}: ROI: ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(2)}% | Profit: ${r.profit.toFixed(0)} | Days: ${r.days}/84`);
}

const best = results[0];
console.log("\n📋 BEST PARAMS:");
console.log(JSON.stringify(best.params, null, 2));
console.log(`\n✅ vs Random: ${(best.roi - randomResult.roi).toFixed(2)}pp improvement`);

console.log("\n");

