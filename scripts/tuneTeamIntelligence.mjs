/**
 * Team Intelligence Strategy Tuning
 * 
 * Tests the innovative team-based strategy that uses actual match history
 * rather than just bookmaker odds.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// DATA LOADING
// ============================================================================

const dataDir = path.join(__dirname, "../src/assets/data");
const teamsDir = path.join(dataDir, "teams");

// Load match data
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

// Load team data
const allTeamData = {};
const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith(".json") && !f.includes("-all"));

for (const file of teamFiles) {
  const teamName = file.replace(".json", "");
  allTeamData[teamName] = JSON.parse(fs.readFileSync(path.join(teamsDir, file), "utf-8"));
}

console.log(`\n📊 Loaded ${data.length} rounds of match data`);
console.log(`👥 Loaded ${Object.keys(allTeamData).length} team histories\n`);

// ============================================================================
// TEAM ANALYSIS FUNCTIONS
// ============================================================================

function normalizeTeamName(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\s+/g, "-")
    .replace(/\./g, "")
    .replace(/fc$/i, "")
    .replace(/-+$/, "")
    .trim();
}

function getMatchesBefore(teamData, beforeDate, count) {
  if (!teamData) return [];
  const matches = [];
  for (const match of teamData.matches) {
    if (match.date < beforeDate) {
      matches.push(match);
      if (matches.length >= count) break;
    }
  }
  return matches;
}

function calculateFormScore(matches) {
  if (matches.length === 0) return 50;
  let score = 0, totalWeight = 0;
  for (let i = 0; i < matches.length; i++) {
    const weight = Math.pow(0.85, i);
    const points = matches[i].result === "W" ? 3 : matches[i].result === "D" ? 1 : 0;
    score += points * weight;
    totalWeight += 3 * weight;
  }
  return (score / totalWeight) * 100;
}

function detectMomentum(matches) {
  if (matches.length < 6) return 0;
  const recentPoints = matches.slice(0, 3).reduce((s, m) => s + (m.result === "W" ? 3 : m.result === "D" ? 1 : 0), 0);
  const olderPoints = matches.slice(3, 6).reduce((s, m) => s + (m.result === "W" ? 3 : m.result === "D" ? 1 : 0), 0);
  return (recentPoints - olderPoints) / 9;
}

function getStreak(matches) {
  if (matches.length === 0) return { type: null, length: 0 };
  const firstResult = matches[0].result;
  let streak = 0;
  for (const match of matches) {
    if (match.result === firstResult) streak++;
    else break;
  }
  return { type: firstResult, length: streak };
}

function analyzeTeam(teamName, isHome, beforeDate, matchWindow = 10) {
  const teamKey = normalizeTeamName(teamName);
  const teamData = allTeamData[teamKey];
  
  if (!teamData) {
    return { formScore: 50, venueWinRate: 0.33, venueDrawRate: 0.33, momentum: 0, streak: { type: null, length: 0 }, hasData: false };
  }
  
  const recentMatches = getMatchesBefore(teamData, beforeDate, matchWindow);
  const venueMatches = recentMatches.filter(m => m.isHome === isHome);
  
  let venueWinRate = 0.33, venueDrawRate = 0.33;
  if (venueMatches.length >= 3) {
    venueWinRate = venueMatches.filter(m => m.result === "W").length / venueMatches.length;
    venueDrawRate = venueMatches.filter(m => m.result === "D").length / venueMatches.length;
  }
  
  return {
    formScore: calculateFormScore(recentMatches),
    venueWinRate,
    venueDrawRate,
    momentum: detectMomentum(recentMatches),
    streak: getStreak(recentMatches),
    hasData: recentMatches.length >= 5,
  };
}

// ============================================================================
// STRATEGY GENERATOR
// ============================================================================

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
  return { roi: cost > 0 ? ((wins - cost) / cost) * 100 : 0, profit: wins - cost, days, cost, wins };
}

const BETS = 50;

function runTeamIntelligence(params) {
  const { 
    formWeight = 0.3,
    venueWeight = 0.4,
    momentumWeight = 0.1,
    streakBonus = 0.04,
    homeBoost = 1.3,
    drawPenalty = 0.7,
    awayPenalty = 0.9,
    blendFactor = 0.35,
  } = params;
  
  return data.map((df) => {
    const rnd = createRandom(df.date.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + 42);
    
    // Calculate intelligent probabilities
    const intelligentProbs = [];
    
    for (let i = 0; i < df.teams.length; i++) {
      const homeTeam = df.teams[i]["1"];
      const awayTeam = df.teams[i]["2"];
      const impliedProbs = df.probabilities[i];
      
      const homeIntel = analyzeTeam(homeTeam, true, df.date, 12);
      const awayIntel = analyzeTeam(awayTeam, false, df.date, 12);
      
      let probs;
      
      if (homeIntel.hasData || awayIntel.hasData) {
        // Team-intelligence based calculation
        const formDiff = (homeIntel.formScore - awayIntel.formScore) / 100;
        
        let homeProb = 0.35 + formDiff * formWeight;
        let awayProb = 0.30 - formDiff * formWeight;
        
        if (homeIntel.hasData) homeProb = homeProb * (1 - venueWeight) + homeIntel.venueWinRate * venueWeight;
        if (awayIntel.hasData) awayProb = awayProb * (1 - venueWeight) + awayIntel.venueWinRate * venueWeight;
        
        homeProb += homeIntel.momentum * momentumWeight;
        awayProb += awayIntel.momentum * momentumWeight;
        
        if (homeIntel.streak.type === "W" && homeIntel.streak.length >= 2) {
          homeProb += homeIntel.streak.length * streakBonus;
        }
        if (awayIntel.streak.type === "W" && awayIntel.streak.length >= 2) {
          awayProb += awayIntel.streak.length * streakBonus;
        }
        if (homeIntel.streak.type === "L" && homeIntel.streak.length >= 2) {
          homeProb -= homeIntel.streak.length * streakBonus;
        }
        if (awayIntel.streak.type === "L" && awayIntel.streak.length >= 2) {
          awayProb -= awayIntel.streak.length * streakBonus;
        }
        
        homeProb = Math.max(0.08, Math.min(0.85, homeProb));
        awayProb = Math.max(0.05, Math.min(0.75, awayProb));
        let drawProb = Math.max(0.1, 1 - homeProb - awayProb);
        
        // Blend with implied odds
        const blended = [
          homeProb * blendFactor + impliedProbs[0] * (1 - blendFactor),
          drawProb * blendFactor + impliedProbs[1] * (1 - blendFactor),
          awayProb * blendFactor + impliedProbs[2] * (1 - blendFactor),
        ];
        
        // Apply static adjustments
        const adj = [blended[0] * homeBoost, blended[1] * drawPenalty, blended[2] * awayPenalty];
        const sum = adj.reduce((a, b) => a + b, 0);
        probs = [adj[0] / sum, adj[1] / sum, adj[2] / sum];
      } else {
        // Fallback
        const adj = [impliedProbs[0] * homeBoost, impliedProbs[1] * drawPenalty, impliedProbs[2] * awayPenalty];
        const sum = adj.reduce((a, b) => a + b, 0);
        probs = [adj[0] / sum, adj[1] / sum, adj[2] / sum];
      }
      
      intelligentProbs.push({ index: i, probs, confidence: Math.max(...probs) });
    }
    
    // Select best matches
    intelligentProbs.sort((a, b) => b.confidence - a.confidence);
    const selected = intelligentProbs.slice(0, GRID_SIZE);
    
    // Generate bets
    const bets = [], used = new Set();
    
    // Favorite bet
    const fav = selected.map(m => ["1", "X", "2"][m.probs.indexOf(Math.max(...m.probs))]);
    bets.push({ predictions: fav }); used.add(fav.join(","));
    
    while (bets.length < BETS) {
      const pred = selected.map(m => {
        const r = rnd();
        return r < m.probs[0] ? "1" : r < m.probs[0] + m.probs[1] ? "X" : "2";
      });
      const k = pred.join(",");
      if (!used.has(k)) { used.add(k); bets.push({ predictions: pred }); }
    }
    
    return { date: df.date, bets };
  });
}

function runRandom() {
  return data.map((df) => {
    const rnd = createRandom(df.date.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + 42);
    const bets = [], used = new Set();
    while (bets.length < BETS) {
      const pred = df.probabilities.slice(0, GRID_SIZE).map(p => { 
        const r = rnd(); return r < p[0] ? "1" : r < p[0] + p[1] ? "X" : "2"; 
      });
      const k = pred.join(",");
      if (!used.has(k)) { used.add(k); bets.push({ predictions: pred }); }
    }
    return { date: df.date, bets };
  });
}

// ============================================================================
// PARAMETER SEARCH
// ============================================================================

console.log("=".repeat(70));
console.log("         TEAM INTELLIGENCE STRATEGY TUNING");
console.log("=".repeat(70));

const results = [];

// Baseline
results.push({ name: "Random (Baseline)", ...test(runRandom()) });

// Grid search
const formWeights = [0.2, 0.3, 0.4, 0.5];
const venueWeights = [0.3, 0.4, 0.5];
const momentumWeights = [0.1, 0.15, 0.2];
const streakBonuses = [0.03, 0.05, 0.07];
const homeBoosts = [1.3, 1.4, 1.5, 1.6];
const drawPenalties = [0.5, 0.6, 0.7];
const blendFactors = [0.25, 0.35, 0.45, 0.55];

let count = 0;
const total = formWeights.length * venueWeights.length * momentumWeights.length * 
              streakBonuses.length * homeBoosts.length * drawPenalties.length * blendFactors.length;

console.log(`\nTesting ${total} parameter combinations...\n`);

for (const fw of formWeights) {
  for (const vw of venueWeights) {
    for (const mw of momentumWeights) {
      for (const sb of streakBonuses) {
        for (const hb of homeBoosts) {
          for (const dp of drawPenalties) {
            for (const bf of blendFactors) {
              count++;
              if (count % 500 === 0) console.log(`Progress: ${count}/${total}`);
              
              const params = { formWeight: fw, venueWeight: vw, momentumWeight: mw, 
                               streakBonus: sb, homeBoost: hb, drawPenalty: dp, blendFactor: bf };
              const r = test(runTeamIntelligence(params));
              results.push({ 
                name: `F${fw}_V${vw}_M${mw}_S${sb}_H${hb}_D${dp}_B${bf}`, 
                params,
                ...r 
              });
            }
          }
        }
      }
    }
  }
}

// Sort by ROI
results.sort((a, b) => b.roi - a.roi);
const baseline = results.find(r => r.name.includes("Baseline"));

console.log("\n" + "=".repeat(70));
console.log("TOP 15 CONFIGURATIONS");
console.log("=".repeat(70));

for (let i = 0; i < Math.min(15, results.length); i++) {
  const r = results[i];
  const imp = r.roi - baseline.roi;
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(`${medal} #${i + 1}: ROI: ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(2)}% | Profit: ${r.profit.toFixed(0)} | Days: ${r.days}/84 | +${imp.toFixed(1)}pp`);
  if (r.params) console.log(`      ${JSON.stringify(r.params)}`);
}

const baselineIdx = results.indexOf(baseline);
console.log(`\n📊 Random baseline is at position #${baselineIdx + 1}`);

// Best result
const best = results[0];
console.log("\n" + "=".repeat(70));
console.log("BEST TEAM INTELLIGENCE CONFIGURATION");
console.log("=".repeat(70));
console.log(`\n🏆 ${best.name}`);
console.log(`   ROI: ${best.roi >= 0 ? "+" : ""}${best.roi.toFixed(2)}%`);
console.log(`   Profit: ${best.profit.toFixed(0)} units`);
console.log(`   Profitable Days: ${best.days}/84 (${(best.days/84*100).toFixed(0)}%)`);
console.log(`   Improvement: +${(best.roi - baseline.roi).toFixed(2)}pp (${((best.roi - baseline.roi) / Math.abs(baseline.roi) * 100).toFixed(0)}% better)`);

if (best.params) {
  console.log(`\n📋 OPTIMAL PARAMETERS:`);
  console.log(JSON.stringify(best.params, null, 2));
}

console.log("\n");

