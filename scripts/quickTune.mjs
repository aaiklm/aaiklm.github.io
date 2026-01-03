/**
 * Quick Refined Team Intelligence Tuning
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

// Team analysis
function normalizeTeamName(n) { return n.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-").replace(/\./g, "").replace(/fc$/i, "").replace(/-+$/, "").trim(); }
function getMatchesBefore(td, before, c) { if (!td) return []; const m = []; for (const x of td.matches) { if (x.date < before) { m.push(x); if (m.length >= c) break; } } return m; }
function calculateFormScore(m) { if (m.length === 0) return 50; let s = 0, t = 0; for (let i = 0; i < m.length; i++) { const w = Math.pow(0.85, i); s += (m[i].result === "W" ? 3 : m[i].result === "D" ? 1 : 0) * w; t += 3 * w; } return (s / t) * 100; }
function detectMomentum(m) { if (m.length < 6) return 0; const r = m.slice(0, 3).reduce((s, x) => s + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0), 0); const o = m.slice(3, 6).reduce((s, x) => s + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0), 0); return (r - o) / 9; }
function getStreak(m) { if (m.length === 0) return { type: null, length: 0 }; const f = m[0].result; let l = 0; for (const x of m) { if (x.result === f) l++; else break; } return { type: f, length: l }; }
function analyzeTeam(name, isHome, before, win = 12) {
  const k = normalizeTeamName(name), td = allTeamData[k];
  if (!td) return { formScore: 50, venueWinRate: 0.33, momentum: 0, streak: { type: null, length: 0 }, hasData: false };
  const rec = getMatchesBefore(td, before, win), venue = rec.filter(x => x.isHome === isHome);
  let vWin = 0.33; if (venue.length >= 3) vWin = venue.filter(x => x.result === "W").length / venue.length;
  return { formScore: calculateFormScore(rec), venueWinRate: vWin, momentum: detectMomentum(rec), streak: getStreak(rec), hasData: rec.length >= 5 };
}

const GRID = 9, BETS = 50, LINES = [];
for (const a of [0, 3, 6]) for (const b of [1, 4, 7]) for (const c of [2, 5, 8]) LINES.push([a, b, c]);
function toOC(r) { return r === "0" ? "1" : r === "1" ? "X" : "2"; }
function rng(s) { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }

function test(bets) {
  let w = 0, c = 0, d = 0;
  for (const r of bets) {
    const df = data.find(x => x.date === r.date); if (!df) continue;
    let dw = 0;
    for (const b of r.bets) {
      for (const l of LINES) { let ok = true, p = 1; for (const pos of l) { const pr = b.predictions[pos], ac = toOC(df.result[pos]); if (pr === ac) p *= df.odds[pos * 3 + (pr === "1" ? 0 : pr === "X" ? 1 : 2)]; else ok = false; } if (ok) { dw += p; w += p; } } c += 27;
    }
    if (dw > r.bets.length * 27) d++;
  }
  return { roi: c > 0 ? ((w - c) / c) * 100 : 0, profit: w - c, days: d };
}

function run(p) {
  return data.map(df => {
    const r = rng(df.date.split("").reduce((a, x) => a + x.charCodeAt(0), 0) + 42);
    const probs = [];
    for (let i = 0; i < df.teams.length; i++) {
      const hT = df.teams[i]["1"], aT = df.teams[i]["2"], imp = df.probabilities[i];
      const hI = analyzeTeam(hT, true, df.date, p.matchWindow || 12), aI = analyzeTeam(aT, false, df.date, p.matchWindow || 12);
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
        const s = adj.reduce((a, b) => a + b, 0); pr = [adj[0] / s, adj[1] / s, adj[2] / s];
      } else {
        const adj = [imp[0] * p.homeBoost, imp[1] * p.drawPenalty, imp[2] * (p.awayPenalty || 1.0)];
        const s = adj.reduce((a, b) => a + b, 0); pr = [adj[0] / s, adj[1] / s, adj[2] / s];
      }
      probs.push({ i, probs: pr, conf: Math.max(...pr) });
    }
    probs.sort((a, b) => b.conf - a.conf);
    const sel = probs.slice(0, GRID), bets = [], used = new Set();
    const fav = sel.map(m => ["1", "X", "2"][m.probs.indexOf(Math.max(...m.probs))]);
    bets.push({ predictions: fav }); used.add(fav.join(","));
    while (bets.length < BETS) { const pr = sel.map(m => { const x = r(); return x < m.probs[0] ? "1" : x < m.probs[0] + m.probs[1] ? "X" : "2"; }); const k = pr.join(","); if (!used.has(k)) { used.add(k); bets.push({ predictions: pr }); } }
    return { date: df.date, bets };
  });
}

console.log("=".repeat(70));
console.log("        QUICK TEAM INTELLIGENCE TUNING");
console.log("=".repeat(70));

const results = [];

// Focused search around best params with some extra variations
const formWeights = [0.25, 0.30, 0.35, 0.40];
const venueWeights = [0.25, 0.30, 0.35];
const momentumWeights = [0.15, 0.20, 0.25];
const streakBonuses = [0.06, 0.07, 0.08, 0.09];
const homeBoosts = [1.55, 1.60, 1.65, 1.70, 1.75];
const drawPenalties = [0.45, 0.50, 0.55];
const blendFactors = [0.20, 0.25, 0.30];
const awayPenalties = [0.9, 1.0, 1.1];
const matchWindows = [10, 12, 15];

const total = formWeights.length * venueWeights.length * momentumWeights.length * streakBonuses.length * homeBoosts.length * drawPenalties.length * blendFactors.length * awayPenalties.length * matchWindows.length;
console.log(`\nTesting ${total} combinations...\n`);

let count = 0;
for (const fw of formWeights)
for (const vw of venueWeights)
for (const mw of momentumWeights)
for (const sb of streakBonuses)
for (const hb of homeBoosts)
for (const dp of drawPenalties)
for (const bf of blendFactors)
for (const ap of awayPenalties)
for (const mW of matchWindows) {
  count++; if (count % 5000 === 0) console.log(`Progress: ${count}/${total}`);
  const p = { formWeight: fw, venueWeight: vw, momentumWeight: mw, streakBonus: sb, homeBoost: hb, drawPenalty: dp, blendFactor: bf, awayPenalty: ap, matchWindow: mW };
  results.push({ params: p, ...test(run(p)) });
}

results.sort((a, b) => b.roi - a.roi);

console.log("\n" + "=".repeat(70));
console.log("TOP 20 CONFIGURATIONS");
console.log("=".repeat(70));

for (let i = 0; i < Math.min(20, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(`${medal} #${i + 1}: ROI: ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(2)}% | Profit: ${r.profit.toFixed(0)} | Days: ${r.days}/84`);
}

const best = results[0];
console.log("\n" + "=".repeat(70));
console.log("BEST CONFIGURATION");
console.log("=".repeat(70));
console.log(`\n🏆 ROI: +${best.roi.toFixed(2)}%, Profit: ${best.profit.toFixed(0)}, Days: ${best.days}/84`);
console.log(`📋 PARAMS: ${JSON.stringify(best.params)}`);

// Diverse strategies
const diverse = [best];
for (const r of results) {
  if (diverse.length >= 3) break;
  if (diverse.every(d => Math.abs(d.roi - r.roi) > 0.3)) diverse.push(r);
}

console.log("\n" + "=".repeat(70));
console.log("DIVERSE TOP STRATEGIES");
console.log("=".repeat(70));
diverse.forEach((r, i) => {
  console.log(`\n${["🥇", "🥈", "🥉"][i]} Strategy ${i + 1}: ROI: +${r.roi.toFixed(2)}%, Profit: ${r.profit.toFixed(0)}, Days: ${r.days}/84`);
  console.log(`   ${JSON.stringify(r.params)}`);
});

console.log("\n");

