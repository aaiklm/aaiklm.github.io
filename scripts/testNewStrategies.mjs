/**
 * New Strategies Test Script
 * 
 * Compares the novel Contrarian Value and Chaos Draw strategies
 * against existing Value Edge and Team Intelligence strategies.
 * 
 * Uses the same random function (mulberry32) as the UI.
 * 
 * Run with: node scripts/testNewStrategies.mjs
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

// Load team data
const allTeamData = {};
const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith(".json"));
for (const file of teamFiles) {
  const filename = file.replace(".json", "");
  if (filename.includes("-all") || filename === "all-leagues") continue;
  const content = JSON.parse(fs.readFileSync(path.join(teamsDir, file), "utf-8"));
  allTeamData[filename] = content;
}

console.log(`Loaded ${Object.keys(allTeamData).length} teams`);

// Load game data
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

console.log(`Loaded ${data.length} rounds of game data\n`);

// ============================================================================
// CONSTANTS & UTILITIES
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

// Mulberry32 - same algorithm as the UI
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
// TEAM ANALYSIS (Same logic as contrarianValueStrategy)
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

function getTeamDrawRate(teamName, beforeDate, count = 20) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, count);
  if (matches.length < 5) return 0.28;
  return matches.filter(m => m.result === "D").length / matches.length;
}

function getVenueWinRate(teamName, isHome, beforeDate, count = 15) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, count);
  const venueMatches = matches.filter(m => m.isHome === isHome);
  if (venueMatches.length < 3) return isHome ? 0.46 : 0.28;
  return venueMatches.filter(m => m.result === "W").length / venueMatches.length;
}

function getRecentForm(teamName, beforeDate, window = 10) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, window);
  if (matches.length < 3) return 0.5;
  
  let score = 0;
  let weight = 0;
  for (let i = 0; i < matches.length; i++) {
    const w = Math.pow(0.75, i);
    const points = matches[i].result === "W" ? 1 : matches[i].result === "D" ? 0.33 : 0;
    score += points * w;
    weight += w;
  }
  return score / weight;
}

function getHistoricalAverageForm(teamName, beforeDate) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, 50);
  if (matches.length < 10) return 0.5;
  const wins = matches.filter(m => m.result === "W").length;
  return wins / matches.length;
}

function getRegressionAdjustedForm(teamName, beforeDate) {
  const recent = getRecentForm(teamName, beforeDate, 8);
  const historical = getHistoricalAverageForm(teamName, beforeDate);
  return recent * 0.7 + historical * 0.3;
}

function calculateEdge(homeTeam, awayTeam, impliedProbs, matchDate) {
  const homeForm = getRegressionAdjustedForm(homeTeam, matchDate);
  const awayForm = getRegressionAdjustedForm(awayTeam, matchDate);
  const homeVenueRate = getVenueWinRate(homeTeam, true, matchDate);
  const awayVenueRate = getVenueWinRate(awayTeam, false, matchDate);
  const homeDrawRate = getTeamDrawRate(homeTeam, matchDate);
  const awayDrawRate = getTeamDrawRate(awayTeam, matchDate);
  
  const estHomeWin = homeForm * 0.4 + homeVenueRate * 0.6;
  const estAwayWin = awayForm * 0.4 + awayVenueRate * 0.6;
  
  const combinedDrawRate = (homeDrawRate + awayDrawRate) / 2;
  const formDiff = Math.abs(homeForm - awayForm);
  const formSimilarityBonus = formDiff < 0.15 ? 0.08 : formDiff < 0.25 ? 0.03 : 0;
  const estDraw = combinedDrawRate + formSimilarityBonus;
  
  const total = estHomeWin + estDraw + estAwayWin;
  const normHome = estHomeWin / total;
  const normDraw = estDraw / total;
  const normAway = estAwayWin / total;
  
  return {
    homeEdge: normHome - impliedProbs[0],
    drawEdge: normDraw - impliedProbs[1],
    awayEdge: normAway - impliedProbs[2],
  };
}

function getDrawPatternSignal(homeTeam, awayTeam, odds, matchDate) {
  let signal = 0;
  
  const homeDrawRate = getTeamDrawRate(homeTeam, matchDate, 12);
  const awayDrawRate = getTeamDrawRate(awayTeam, matchDate, 12);
  if (homeDrawRate > 0.30 && awayDrawRate > 0.30) {
    signal += 0.12;
  } else if (homeDrawRate > 0.28 && awayDrawRate > 0.28) {
    signal += 0.06;
  }
  
  const homeForm = getRecentForm(homeTeam, matchDate, 6);
  const awayForm = getRecentForm(awayTeam, matchDate, 6);
  const formDiff = Math.abs(homeForm - awayForm);
  if (formDiff < 0.10) {
    signal += 0.08;
  } else if (formDiff < 0.18) {
    signal += 0.04;
  }
  
  if (odds[1] >= 3.6) {
    signal += 0.06;
  } else if (odds[1] >= 3.4) {
    signal += 0.03;
  }
  
  const homeTeamData = getTeamData(homeTeam);
  const awayTeamData = getTeamData(awayTeam);
  const homeRecent = getMatchesBefore(homeTeamData, matchDate, 4);
  const awayRecent = getMatchesBefore(awayTeamData, matchDate, 4);
  const homeRecentDraws = homeRecent.filter(m => m.result === "D").length;
  const awayRecentDraws = awayRecent.filter(m => m.result === "D").length;
  if (homeRecentDraws >= 2 && awayRecentDraws >= 2) {
    signal += 0.10;
  } else if (homeRecentDraws >= 1 && awayRecentDraws >= 1) {
    signal += 0.04;
  }
  
  return Math.min(signal, 0.30);
}

// ============================================================================
// STRATEGY IMPLEMENTATIONS
// ============================================================================

// Contrarian Value Strategy
function contrarianValueProbs(homeTeam, awayTeam, odds, impliedProbs, matchDate, params) {
  const edge = calculateEdge(homeTeam, awayTeam, impliedProbs, matchDate);
  const drawPattern = getDrawPatternSignal(homeTeam, awayTeam, odds, matchDate);
  
  let probs = [
    impliedProbs[0] * params.homeBaseBoost,
    impliedProbs[1] * params.drawBasePenalty,
    impliedProbs[2] * params.awayBasePenalty,
  ];
  
  if (edge.homeEdge > params.minEdgeForBoost) {
    probs[0] *= (1 + edge.homeEdge * params.edgeMultiplier);
  } else if (edge.homeEdge < -params.minEdgeForBoost) {
    probs[0] *= (1 + edge.homeEdge * 0.5);
  }
  
  if (edge.drawEdge > params.minEdgeForBoost && odds[1] >= params.minDrawOddsForBoost) {
    probs[1] *= (1 + edge.drawEdge * params.edgeMultiplier);
  }
  
  if (edge.awayEdge > params.minEdgeForBoost && odds[2] >= params.minAwayOddsForValue) {
    probs[2] *= (1 + edge.awayEdge * params.edgeMultiplier);
  }
  
  if (drawPattern >= params.drawPatternThreshold && odds[1] >= params.minDrawOddsForBoost) {
    probs[1] *= (1 + drawPattern * params.drawPatternMultiplier);
  }
  
  const sum = probs.reduce((a, b) => a + b, 0);
  return [probs[0] / sum, probs[1] / sum, probs[2] / sum];
}

// Value Edge Strategy (baseline)
function valueEdgeProbs(odds, impliedProbs, params) {
  let adjusted = [...impliedProbs];
  adjusted[0] *= params.homeBoostBase;
  if (odds[0] > Math.min(odds[1], odds[2])) {
    adjusted[0] *= (1 + params.homeUnderdogBoost);
  }
  adjusted[1] *= params.drawPenalty;
  adjusted[2] *= params.awayPenalty;
  
  const sum = adjusted.reduce((a, b) => a + b, 0);
  return [adjusted[0] / sum, adjusted[1] / sum, adjusted[2] / sum];
}

// Team Intelligence (simplified)
function teamIntelligenceProbs(homeTeam, awayTeam, impliedProbs, matchDate, params) {
  const homeForm = getRegressionAdjustedForm(homeTeam, matchDate);
  const awayForm = getRegressionAdjustedForm(awayTeam, matchDate);
  const homeVenue = getVenueWinRate(homeTeam, true, matchDate);
  
  // Blend team data with implied probs
  const blendFactor = 0.4;
  let probs = [
    impliedProbs[0] * (1 - blendFactor) + (homeForm * 0.5 + homeVenue * 0.5) * blendFactor,
    impliedProbs[1] * params.drawPenalty,
    impliedProbs[2] * (1 - blendFactor) + awayForm * blendFactor,
  ];
  
  probs[0] *= params.homeBoost;
  probs[2] *= params.awayPenalty;
  
  const sum = probs.reduce((a, b) => a + b, 0);
  return [probs[0] / sum, probs[1] / sum, probs[2] / sum];
}

// ============================================================================
// BET GENERATION
// ============================================================================

function generateBet(matchProbs, random, diversityFactor = 0.1) {
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

function generateStrategy(dataFile, calculateProbs, betsCount, seed, params) {
  const dateHash = dataFile.date
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const effectiveSeed = seed + dateHash;
  const random = createSeededRandom(effectiveSeed);
  
  const selectedMatchIndices = selectBestMatches(dataFile.probabilities, GRID_MATCH_COUNT);
  
  const matchProbs = selectedMatchIndices.map(matchIndex => {
    if (matchIndex >= dataFile.teams.length || !dataFile.teams[matchIndex]) {
      return [0.45, 0.28, 0.27];
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
  
  const favBet = generateFavoriteBet(matchProbs);
  bets.push(favBet);
  usedKeys.add(favBet.predictions.join(","));
  
  let attempts = 0;
  while (bets.length < betsCount && attempts < betsCount * 30) {
    const bet = generateBet(matchProbs, random, params.diversityFactor || 0.1);
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

function evaluateStrategy(strategyName, betsResults) {
  let totalBets = 0;
  let totalWinnings = 0;
  let totalCost = 0;
  const lineHits = new Array(28).fill(0);
  let drawPicks = 0, awayPicks = 0, homePicks = 0;
  let drawWins = 0, awayWins = 0, homeWins = 0;
  let profitableDays = 0;
  
  for (const result of betsResults) {
    const dataFile = data.find((d) => d.date === result.date);
    if (!dataFile) continue;
    
    const selectedMatchIndices = selectBestMatches(dataFile.probabilities, GRID_MATCH_COUNT);
    const actualResults = selectedMatchIndices.map((matchIdx) =>
      resultToOutcome(dataFile.result[matchIdx])
    );
    
    let dayWinnings = 0;
    let dayCost = 0;
    
    for (const bet of result.bets) {
      totalBets++;
      totalCost += 27;
      dayCost += 27;
      
      for (let i = 0; i < bet.predictions.length; i++) {
        const pick = bet.predictions[i];
        const actual = actualResults[i];
        if (pick === "1") { homePicks++; if (pick === actual) homeWins++; }
        if (pick === "X") { drawPicks++; if (pick === actual) drawWins++; }
        if (pick === "2") { awayPicks++; if (pick === actual) awayWins++; }
      }
      
      let correctLines = 0;
      let linePayout = 0;
      
      for (const line of STANDARD_LINES) {
        let allCorrect = true;
        let payout = 1;
        
        for (const pos of line.positions) {
          const prediction = bet.predictions[pos];
          const actual = actualResults[pos];
          
          if (prediction === actual) {
            const matchIdx = selectedMatchIndices[pos];
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
      dayWinnings += linePayout;
    }
    
    if (dayWinnings > dayCost) profitableDays++;
  }
  
  const profit = totalWinnings - totalCost;
  const roi = ((profit / totalCost) * 100).toFixed(2);
  const totalPicks = homePicks + drawPicks + awayPicks;
  
  return {
    strategyName,
    totalBets,
    totalCost,
    totalWinnings: totalWinnings.toFixed(0),
    profit: profit.toFixed(0),
    roi,
    profitableDays,
    totalDays: betsResults.length,
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

console.log("=".repeat(80));
console.log("NEW STRATEGIES COMPARISON TEST");
console.log("=".repeat(80));
console.log("");

const strategies = [
  // Fine-tune around v12 sweet spot
  {
    name: "🏆 Edge v12 BEST (E:8.5 H:2.15 D:0.23)",
    params: {
      minEdgeForBoost: 0.006,
      edgeMultiplier: 8.5,
      homeBaseBoost: 2.15,
      drawBasePenalty: 0.23,
      awayBasePenalty: 0.58,
      drawPatternThreshold: 0.045,
      drawPatternMultiplier: 4.8,
      minDrawOddsForBoost: 2.75,
      minAwayOddsForValue: 1.6,
      diversityFactor: 0.10,
    },
    calculateProbs: (home, away, odds, implied, date, params) =>
      contrarianValueProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🔬 Tune A (E:8.3 H:2.12 D:0.24)",
    params: {
      minEdgeForBoost: 0.007,
      edgeMultiplier: 8.3,
      homeBaseBoost: 2.12,
      drawBasePenalty: 0.24,
      awayBasePenalty: 0.59,
      drawPatternThreshold: 0.048,
      drawPatternMultiplier: 4.6,
      minDrawOddsForBoost: 2.78,
      minAwayOddsForValue: 1.7,
      diversityFactor: 0.10,
    },
    calculateProbs: (home, away, odds, implied, date, params) =>
      contrarianValueProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🔬 Tune B (E:8.7 H:2.18 D:0.22)",
    params: {
      minEdgeForBoost: 0.005,
      edgeMultiplier: 8.7,
      homeBaseBoost: 2.18,
      drawBasePenalty: 0.22,
      awayBasePenalty: 0.56,
      drawPatternThreshold: 0.042,
      drawPatternMultiplier: 5.0,
      minDrawOddsForBoost: 2.72,
      minAwayOddsForValue: 1.55,
      diversityFactor: 0.10,
    },
    calculateProbs: (home, away, odds, implied, date, params) =>
      contrarianValueProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🔬 Tune C (E:8.4 H:2.17 D:0.21)",
    params: {
      minEdgeForBoost: 0.0055,
      edgeMultiplier: 8.4,
      homeBaseBoost: 2.17,
      drawBasePenalty: 0.21,
      awayBasePenalty: 0.57,
      drawPatternThreshold: 0.044,
      drawPatternMultiplier: 4.9,
      minDrawOddsForBoost: 2.73,
      minAwayOddsForValue: 1.58,
      diversityFactor: 0.10,
    },
    calculateProbs: (home, away, odds, implied, date, params) =>
      contrarianValueProbs(home, away, odds, implied, date, params),
  },
  {
    name: "🔬 Tune D (E:8.6 H:2.14 D:0.24)",
    params: {
      minEdgeForBoost: 0.0065,
      edgeMultiplier: 8.6,
      homeBaseBoost: 2.14,
      drawBasePenalty: 0.24,
      awayBasePenalty: 0.58,
      drawPatternThreshold: 0.046,
      drawPatternMultiplier: 4.7,
      minDrawOddsForBoost: 2.76,
      minAwayOddsForValue: 1.62,
      diversityFactor: 0.10,
    },
    calculateProbs: (home, away, odds, implied, date, params) =>
      contrarianValueProbs(home, away, odds, implied, date, params),
  },
  {
    name: "📈 Value Edge (Baseline)",
    params: {
      homeBoostBase: 2.0,
      homeUnderdogBoost: 0.4,
      drawPenalty: 0.30,
      awayPenalty: 0.75,
      diversityFactor: 0.10,
    },
    calculateProbs: (home, away, odds, implied, date, params) =>
      valueEdgeProbs(odds, implied, params),
  },
];

const results = [];

for (const strategy of strategies) {
  const betsResults = data.map(df =>
    generateStrategy(df, strategy.calculateProbs, 50, 42, strategy.params)
  );
  const evaluation = evaluateStrategy(strategy.name, betsResults);
  results.push(evaluation);
}

// Sort by ROI
results.sort((a, b) => parseFloat(b.roi) - parseFloat(a.roi));

// Print results
console.log("\n📊 STRATEGY COMPARISON (sorted by ROI)");
console.log("=".repeat(80));
console.log("");

for (const result of results) {
  const roiNum = parseFloat(result.roi);
  const roiColor = roiNum >= 0 ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  
  console.log(`${result.strategyName}`);
  console.log(`  ROI: ${roiColor}${result.roi}%${reset} | Profit: ${result.profit} kr | Profitable Days: ${result.profitableDays}/${result.totalDays}`);
  console.log(`  Pick Distribution: Home ${result.pickDistribution.home}% | Draw ${result.pickDistribution.draw}% | Away ${result.pickDistribution.away}%`);
  console.log(`  Pick Accuracy: Home ${result.pickAccuracy.home}% | Draw ${result.pickAccuracy.draw}% | Away ${result.pickAccuracy.away}%`);
  console.log(`  Line Hits: 0: ${result.lineHits[0]} | 1: ${result.lineHits[1]} | 2: ${result.lineHits[2]} | 3+: ${result.lineHits.slice(3).reduce((a,b)=>a+b,0)}`);
  console.log("");
}

// Summary
const best = results[0];
const baseline = results.find(r => r.strategyName.includes("Value Edge"));
console.log("=".repeat(80));
console.log("🏆 SUMMARY");
console.log("=".repeat(80));
console.log(`Best Strategy: ${best.strategyName}`);
console.log(`Best ROI: ${best.roi}%`);
if (baseline) {
  console.log(`Value Edge Baseline ROI: ${baseline.roi}%`);
  console.log(`Improvement: ${(parseFloat(best.roi) - parseFloat(baseline.roi)).toFixed(2)} percentage points`);
}
console.log("");

