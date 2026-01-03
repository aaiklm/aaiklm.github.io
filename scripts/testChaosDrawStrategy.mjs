/**
 * Chaos Draw Strategy Testing Script
 *
 * Tests the new Chaos Draw strategies against existing ones
 * Run with: node scripts/testChaosDrawStrategy.mjs
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
const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.endsWith(".json") && !f.includes("teams"));

// Load team data
const allTeamData = {};
const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith(".json"));
for (const file of teamFiles) {
  const filename = file.replace(".json", "");
  if (filename.includes("-all") || filename === "all-leagues") continue;
  const content = JSON.parse(fs.readFileSync(path.join(teamsDir, file), "utf-8"));
  allTeamData[filename] = content;
}

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

console.log(`\n📊 Loaded ${data.length} rounds of historical data\n`);

// ============================================================================
// GRID CONSTANTS
// ============================================================================

const GRID_MATCH_COUNT = 9;
const COL1 = [0, 3, 6];
const COL2 = [1, 4, 7];
const COL3 = [2, 5, 8];

const STANDARD_LINES = [];
for (const c1 of COL1) {
  for (const c2 of COL2) {
    for (const c3 of COL3) {
      STANDARD_LINES.push({ positions: [c1, c2, c3] });
    }
  }
}

function resultToOutcome(result) {
  if (result === "0") return "1";
  if (result === "1") return "X";
  return "2";
}

// Mulberry32 - same algorithm as the UI uses
function createSeededRandom(seed) {
  let state = seed;
  return function mulberry32() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function selectBestMatches(probabilities, count = 9) {
  return probabilities
    .map((probs, index) => ({
      index,
      confidence: Math.max(...probs),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
    .map((m) => m.index);
}

// ============================================================================
// TEAM ANALYSIS (Replicated for Node.js)
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

function getTeamData(teamName) {
  const normalized = normalizeTeamName(teamName);
  return allTeamData[normalized];
}

function getMatchesBefore(team, beforeDate, count) {
  if (!team) return [];
  const matches = [];
  for (const match of team.matches || []) {
    if (match.date < beforeDate) {
      matches.push(match);
      if (matches.length >= count) break;
    }
  }
  return matches;
}

function calculateDrawRate(matches) {
  if (matches.length === 0) return 0.28;
  const draws = matches.filter(m => m.result === "D").length;
  return draws / matches.length;
}

function calculateChaosIndex(matches) {
  if (matches.length < 5) return 0.5;
  
  let transitions = 0;
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].result !== matches[i-1].result) {
      transitions++;
    }
  }
  
  const goals = matches.map(m => m.goalsFor);
  const avgGoals = goals.reduce((a, b) => a + b, 0) / goals.length;
  const variance = goals.reduce((sum, g) => sum + Math.pow(g - avgGoals, 2), 0) / goals.length;
  
  const transitionRate = transitions / (matches.length - 1);
  const normalizedVariance = Math.min(variance / 4, 1);
  
  return (transitionRate * 0.6 + normalizedVariance * 0.4);
}

function analyzeTeamProfile(teamName, isHome, beforeDate, matchWindow = 15) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, matchWindow);
  
  if (matches.length < 3) {
    return {
      name: teamName,
      hasData: false,
      drawRate: 0.28,
      chaosIndex: 0.5,
      avgGoalsFor: 1.3,
      avgGoalsAgainst: 1.2,
      recentForm: 50,
      venuePerformance: 0.4,
      upsetPotential: 0.3,
    };
  }
  
  const drawRate = calculateDrawRate(matches);
  const chaosIndex = calculateChaosIndex(matches);
  const avgGoalsFor = matches.reduce((s, m) => s + m.goalsFor, 0) / matches.length;
  const avgGoalsAgainst = matches.reduce((s, m) => s + m.goalsAgainst, 0) / matches.length;
  
  let formScore = 0;
  let totalWeight = 0;
  for (let i = 0; i < Math.min(matches.length, 10); i++) {
    const weight = Math.pow(0.8, i);
    const points = matches[i].result === "W" ? 3 : matches[i].result === "D" ? 1 : 0;
    formScore += points * weight;
    totalWeight += 3 * weight;
  }
  const recentForm = (formScore / totalWeight) * 100;
  
  const venueMatches = matches.filter(m => m.isHome === isHome);
  const venueWins = venueMatches.filter(m => m.result === "W").length;
  const venuePerformance = venueMatches.length >= 3 
    ? venueWins / venueMatches.length 
    : isHome ? 0.45 : 0.30;
  
  const upsets = matches.filter(m => !m.isHome && m.result === "W").length;
  const awayGames = matches.filter(m => !m.isHome).length;
  const upsetPotential = awayGames >= 3 ? upsets / awayGames : 0.25;
  
  return {
    name: teamName,
    hasData: true,
    drawRate,
    chaosIndex,
    avgGoalsFor,
    avgGoalsAgainst,
    recentForm,
    venuePerformance,
    upsetPotential,
  };
}

function analyzeMatch(homeTeam, awayTeam, odds, matchDate) {
  const homeProfile = analyzeTeamProfile(homeTeam, true, matchDate);
  const awayProfile = analyzeTeamProfile(awayTeam, false, matchDate);
  
  // Draw score calculation
  let drawScore = 0;
  const combinedDrawRate = (homeProfile.drawRate + awayProfile.drawRate) / 2;
  drawScore += combinedDrawRate * 0.25;
  
  const formDiff = Math.abs(homeProfile.recentForm - awayProfile.recentForm);
  const formSimilarity = 1 - (formDiff / 100);
  drawScore += formSimilarity * 0.20;
  
  const combinedGoals = (homeProfile.avgGoalsFor + awayProfile.avgGoalsFor) / 2;
  if (combinedGoals < 1.2) drawScore += 0.15;
  else if (combinedGoals < 1.5) drawScore += 0.08;
  
  if (odds[1] >= 3.8) drawScore += 0.12;
  else if (odds[1] >= 3.5) drawScore += 0.08;
  else if (odds[1] >= 3.3) drawScore += 0.04;
  
  // Chaos score
  const chaosScore = (homeProfile.chaosIndex + awayProfile.chaosIndex) / 2;
  
  // Upset score
  let upsetScore = 0;
  upsetScore += awayProfile.upsetPotential * 0.3;
  upsetScore += (1 - homeProfile.venuePerformance) * 0.2;
  if (awayProfile.recentForm > homeProfile.recentForm) {
    upsetScore += Math.min((awayProfile.recentForm - homeProfile.recentForm) / 50, 0.25);
  }
  if (odds[2] >= 4.0) upsetScore += 0.12;
  else if (odds[2] >= 3.0) upsetScore += 0.06;
  
  return { homeProfile, awayProfile, drawScore: Math.min(drawScore, 1), chaosScore, upsetScore: Math.min(upsetScore, 1) };
}

// ============================================================================
// STRATEGIES
// ============================================================================

const CHAOS_DRAW_PARAMS = {
  drawBoostThreshold: 0.35,
  drawBoostMultiplier: 2.8,
  drawBaseMultiplier: 0.7,
  chaosThreshold: 0.55,
  upsetBoostThreshold: 0.40,
  upsetBoostMultiplier: 1.8,
  homeBaseBoost: 1.3,
  homeFormBonus: 0.3,
  minDrawOddsForBoost: 3.2,
  minAwayOddsForUpset: 2.8,
  diversityFactor: 0.15,
};

function calculateChaosDrawProbs(homeTeam, awayTeam, odds, impliedProbs, matchDate, params) {
  const analysis = analyzeMatch(homeTeam, awayTeam, odds, matchDate);
  
  let probs = [...impliedProbs];
  
  // Home adjustment
  let homeMultiplier = params.homeBaseBoost;
  if (analysis.homeProfile.hasData) {
    if (analysis.homeProfile.venuePerformance > 0.5) {
      homeMultiplier += params.homeFormBonus;
    }
    if (analysis.homeProfile.venuePerformance < 0.35) {
      homeMultiplier *= 0.8;
    }
  }
  probs[0] *= homeMultiplier;
  
  // Draw adjustment
  let drawMultiplier = params.drawBaseMultiplier;
  if (analysis.drawScore >= params.drawBoostThreshold && odds[1] >= params.minDrawOddsForBoost) {
    drawMultiplier = params.drawBoostMultiplier;
    if (analysis.drawScore >= 0.50) {
      drawMultiplier *= 1.3;
    }
  } else if (analysis.chaosScore >= params.chaosThreshold) {
    drawMultiplier = 1.2;
  }
  probs[1] *= drawMultiplier;
  
  // Away adjustment
  let awayMultiplier = 0.9;
  if (analysis.upsetScore >= params.upsetBoostThreshold && odds[2] >= params.minAwayOddsForUpset) {
    awayMultiplier = params.upsetBoostMultiplier;
    if (analysis.upsetScore >= 0.55) {
      awayMultiplier *= 1.2;
    }
  } else if (analysis.chaosScore >= params.chaosThreshold) {
    awayMultiplier = 1.1;
  }
  probs[2] *= awayMultiplier;
  
  // Evenly matched bonus
  if (analysis.homeProfile.hasData && analysis.awayProfile.hasData) {
    const formDiff = Math.abs(analysis.homeProfile.recentForm - analysis.awayProfile.recentForm);
    if (formDiff < 10) {
      probs[1] *= 1.3;
    }
  }
  
  const sum = probs.reduce((a, b) => a + b, 0);
  return [probs[0] / sum, probs[1] / sum, probs[2] / sum];
}

// Comparison strategies
const VALUE_EDGE_PARAMS = {
  homeBoostBase: 2.0,
  homeUnderdogBoost: 0.4,
  drawPenalty: 0.30,
  awayPenalty: 0.75,
};

function calculateValueEdgeProbs(odds, impliedProbs) {
  let adjusted = [...impliedProbs];
  adjusted[0] *= VALUE_EDGE_PARAMS.homeBoostBase;
  if (odds[0] > Math.min(odds[1], odds[2])) {
    adjusted[0] *= (1 + VALUE_EDGE_PARAMS.homeUnderdogBoost);
  }
  adjusted[1] *= VALUE_EDGE_PARAMS.drawPenalty;
  adjusted[2] *= VALUE_EDGE_PARAMS.awayPenalty;
  
  const sum = adjusted.reduce((a, b) => a + b, 0);
  return [adjusted[0] / sum, adjusted[1] / sum, adjusted[2] / sum];
}

// ============================================================================
// BET GENERATION
// ============================================================================

function generateBet(matchProbs, random, diversityFactor = 0) {
  const predictions = matchProbs.map(probs => {
    let adjusted = probs.map(p => p * (1 + (random() - 0.5) * diversityFactor));
    const sum = adjusted.reduce((a, b) => a + b, 0);
    adjusted = adjusted.map(p => p / sum);
    
    const r = random();
    if (r < adjusted[0]) return "1";
    if (r < adjusted[0] + adjusted[1]) return "X";
    return "2";
  });
  return { predictions };
}

function generateFavoriteBet(matchProbs) {
  const predictions = matchProbs.map(probs => {
    const maxIdx = probs.indexOf(Math.max(...probs));
    return ["1", "X", "2"][maxIdx];
  });
  return { predictions };
}

function generateDrawHunterBet(matchProbs, random) {
  const predictions = matchProbs.map(probs => {
    const drawBoosted = [probs[0] * 0.7, probs[1] * 2.5, probs[2] * 0.7];
    const sum = drawBoosted.reduce((a, b) => a + b, 0);
    const normalized = drawBoosted.map(p => p / sum);
    
    const r = random();
    if (r < normalized[0]) return "1";
    if (r < normalized[0] + normalized[1]) return "X";
    return "2";
  });
  return { predictions };
}

function generateStrategy(dataFile, calculateProbs, betsCount, seed, params = {}) {
  const dateHash = dataFile.date
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const effectiveSeed = seed + dateHash;
  const random = createSeededRandom(effectiveSeed);
  
  const selectedMatchIndices = selectBestMatches(dataFile.probabilities, GRID_MATCH_COUNT);
  
  const matchProbs = selectedMatchIndices.map(matchIndex => {
    if (matchIndex >= dataFile.teams.length || !dataFile.teams[matchIndex]) {
      return [0.4, 0.35, 0.25];
    }
    
    const homeTeam = dataFile.teams[matchIndex]["1"];
    const awayTeam = dataFile.teams[matchIndex]["2"];
    const oddsIdx = matchIndex * 3;
    const odds = [
      dataFile.odds[oddsIdx] ?? 2.5,
      dataFile.odds[oddsIdx + 1] ?? 3.4,
      dataFile.odds[oddsIdx + 2] ?? 3.0,
    ];
    const impliedProbs = dataFile.probabilities[matchIndex] ?? [0.40, 0.30, 0.30];
    
    return calculateProbs(homeTeam, awayTeam, odds, impliedProbs, dataFile.date, params);
  });
  
  const bets = [];
  const usedKeys = new Set();
  
  // Favorite bet
  const favBet = generateFavoriteBet(matchProbs);
  bets.push(favBet);
  usedKeys.add(favBet.predictions.join(","));
  
  // Draw hunter bets (10%)
  for (let i = 0; i < Math.ceil(betsCount * 0.10) && bets.length < betsCount; i++) {
    const bet = generateDrawHunterBet(matchProbs, random);
    const key = bet.predictions.join(",");
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      bets.push(bet);
    }
  }
  
  // Regular bets
  let attempts = 0;
  while (bets.length < betsCount && attempts < betsCount * 30) {
    const bet = generateBet(matchProbs, random, params.diversityFactor || 0);
    const key = bet.predictions.join(",");
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      bets.push(bet);
    }
    attempts++;
  }
  
  return { date: dataFile.date, bets };
}

// ============================================================================
// EVALUATION
// ============================================================================

const DEFAULT_LINE_PAYOUTS = {
  0: 0, 1: 2, 2: 5, 3: 10, 4: 20, 5: 40, 6: 80, 7: 150, 8: 300, 9: 600,
  10: 1200, 11: 2500, 12: 5000, 13: 10000, 14: 20000, 15: 40000,
  16: 80000, 17: 150000, 18: 300000, 19: 500000, 20: 750000,
  21: 1000000, 22: 1500000, 23: 2000000, 24: 3000000, 25: 4000000, 26: 5000000, 27: 10000000,
};

function evaluateStrategy(strategyName, betsResults) {
  let totalBets = 0;
  let totalWinnings = 0;
  let totalCost = 0;
  const lineHits = new Array(28).fill(0);
  let drawPicks = 0;
  let awayPicks = 0;
  let homePicks = 0;
  let drawWins = 0;
  let awayWins = 0;
  let homeWins = 0;
  
  for (const result of betsResults) {
    const dataFile = data.find((d) => d.date === result.date);
    if (!dataFile) continue;
    
    // Create mapping from grid position to actual match index
    const selectedMatchIndices = selectBestMatches(dataFile.probabilities, GRID_MATCH_COUNT);
    
    // Get actual outcomes for each grid position
    const actualResults = selectedMatchIndices.map((matchIdx) =>
      resultToOutcome(dataFile.result[matchIdx])
    );
    
    for (const bet of result.bets) {
      totalBets++;
      totalCost += 27; // 27 lines per bet
      
      // Count pick distribution
      for (let i = 0; i < bet.predictions.length; i++) {
        const pick = bet.predictions[i];
        const actual = actualResults[i];
        if (pick === "1") {
          homePicks++;
          if (pick === actual) homeWins++;
        }
        if (pick === "X") {
          drawPicks++;
          if (pick === actual) drawWins++;
        }
        if (pick === "2") {
          awayPicks++;
          if (pick === actual) awayWins++;
        }
      }
      
      // Check lines - calculate actual odds-based payout
      let correctLines = 0;
      let linePayout = 0;
      
      for (const line of STANDARD_LINES) {
        let allCorrect = true;
        let payout = 1;
        
        for (const pos of line.positions) {
          const prediction = bet.predictions[pos];
          const actual = actualResults[pos];
          
          if (prediction === actual) {
            // Get the original match index for this grid position
            const matchIdx = selectedMatchIndices[pos];
            // Get the odds for the predicted outcome
            const oddsIdx = matchIdx * 3 + (prediction === "1" ? 0 : prediction === "X" ? 1 : 2);
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
    }
  }
  
  const profit = totalWinnings - totalCost;
  const roi = ((profit / totalCost) * 100).toFixed(2);
  
  const totalPicks = homePicks + drawPicks + awayPicks;
  
  return {
    strategyName,
    totalBets,
    totalCost,
    totalWinnings,
    profit,
    roi,
    lineHits,
    pickDistribution: {
      home: ((homePicks / totalPicks) * 100).toFixed(1),
      draw: ((drawPicks / totalPicks) * 100).toFixed(1),
      away: ((awayPicks / totalPicks) * 100).toFixed(1),
    },
    pickAccuracy: {
      home: homePicks > 0 ? ((homeWins / homePicks) * 100).toFixed(1) : "N/A",
      draw: drawPicks > 0 ? ((drawWins / drawPicks) * 100).toFixed(1) : "N/A",
      away: awayPicks > 0 ? ((awayWins / awayPicks) * 100).toFixed(1) : "N/A",
    },
  };
}

// ============================================================================
// RUN TESTS
// ============================================================================

console.log("🎲 CHAOS DRAW STRATEGY TEST");
console.log("=".repeat(60));
console.log("");

// Test different parameter configurations
const configurations = [
  // Grid search over key parameters
  {
    name: "🧠 Intel H1.9 D0.35 (Tuned)",
    params: {
      ...CHAOS_DRAW_PARAMS,
      homeBaseBoost: 1.9,
      homeFormBonus: 0.35,
      drawBaseMultiplier: 0.35,
      drawBoostThreshold: 0.50,
      drawBoostMultiplier: 2.0,
      minDrawOddsForBoost: 3.4,
    },
    calculateProbs: (home, away, odds, implied, date, params) => 
      calculateChaosDrawProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🧠 Intel H2.0 D0.30",
    params: {
      ...CHAOS_DRAW_PARAMS,
      homeBaseBoost: 2.0,
      homeFormBonus: 0.30,
      drawBaseMultiplier: 0.30,
      drawBoostThreshold: 0.55,
      drawBoostMultiplier: 1.8,
      minDrawOddsForBoost: 3.5,
    },
    calculateProbs: (home, away, odds, implied, date, params) => 
      calculateChaosDrawProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🎯 Selective Value H1.85 D0.38",
    params: {
      ...CHAOS_DRAW_PARAMS,
      homeBaseBoost: 1.85,
      homeFormBonus: 0.25,
      drawBaseMultiplier: 0.38,
      drawBoostThreshold: 0.48,
      drawBoostMultiplier: 2.2,
      minDrawOddsForBoost: 3.3,
      upsetBoostThreshold: 0.52,
      upsetBoostMultiplier: 1.4,
      minAwayOddsForUpset: 3.5,
    },
    calculateProbs: (home, away, odds, implied, date, params) => 
      calculateChaosDrawProbs(home, away, odds, implied, date, params),
  },
  {
    name: "⚡ High Risk H1.6 D0.45",
    params: {
      ...CHAOS_DRAW_PARAMS,
      homeBaseBoost: 1.6,
      homeFormBonus: 0.4,
      drawBaseMultiplier: 0.45,
      drawBoostThreshold: 0.42,
      drawBoostMultiplier: 2.5,
      minDrawOddsForBoost: 3.2,
      upsetBoostThreshold: 0.45,
      upsetBoostMultiplier: 1.6,
      minAwayOddsForUpset: 3.0,
      diversityFactor: 0.18,
    },
    calculateProbs: (home, away, odds, implied, date, params) => 
      calculateChaosDrawProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🏠 Pure Home H2.1 D0.28",
    params: {
      ...CHAOS_DRAW_PARAMS,
      homeBaseBoost: 2.1,
      homeFormBonus: 0.3,
      drawBaseMultiplier: 0.28,
      drawBoostThreshold: 0.60,
      drawBoostMultiplier: 1.5,
      minDrawOddsForBoost: 3.6,
    },
    calculateProbs: (home, away, odds, implied, date, params) => 
      calculateChaosDrawProbs(home, away, odds, implied, date, params),
  },
  {
    name: "📈 Value Edge (Baseline)",
    params: { diversityFactor: 0 },
    calculateProbs: (home, away, odds, implied, date, params) => 
      calculateValueEdgeProbs(odds, implied),
  },
];

const results = [];

for (const config of configurations) {
  const betsResults = data.map(df => 
    generateStrategy(df, config.calculateProbs, 50, 42, config.params)
  );
  const evaluation = evaluateStrategy(config.name, betsResults);
  results.push(evaluation);
}

// Sort by ROI
results.sort((a, b) => parseFloat(b.roi) - parseFloat(a.roi));

// Print results
console.log("\n📊 STRATEGY COMPARISON");
console.log("=".repeat(80));
console.log("");

for (const result of results) {
  const roiNum = parseFloat(result.roi);
  const roiColor = roiNum >= 0 ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  
  console.log(`${result.strategyName}`);
  console.log(`  ROI: ${roiColor}${result.roi}%${reset}`);
  console.log(`  Profit: ${result.profit.toLocaleString()} kr (from ${result.totalCost.toLocaleString()} kr wagered)`);
  console.log(`  Pick Distribution: Home ${result.pickDistribution.home}% | Draw ${result.pickDistribution.draw}% | Away ${result.pickDistribution.away}%`);
  console.log(`  Pick Accuracy: Home ${result.pickAccuracy.home}% | Draw ${result.pickAccuracy.draw}% | Away ${result.pickAccuracy.away}%`);
  console.log(`  Line Hits: 0-lines: ${result.lineHits[0]} | 1-line: ${result.lineHits[1]} | 2-lines: ${result.lineHits[2]} | 3+: ${result.lineHits.slice(3).reduce((a,b)=>a+b,0)}`);
  console.log("");
}

// Summary
console.log("\n🏆 SUMMARY");
console.log("=".repeat(60));
const best = results[0];
console.log(`Best Strategy: ${best.strategyName}`);
console.log(`ROI: ${best.roi}%`);
console.log(`Draw Pick Rate: ${best.pickDistribution.draw}% (vs Value Edge: ${results.find(r => r.strategyName.includes("Baseline"))?.pickDistribution.draw || "N/A"}%)`);

