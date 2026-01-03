/**
 * Tune Contrarian Value Strategy
 * 
 * Tests many parameter combinations to find optimal settings.
 * Uses deterministic bets (all identical) like successful strategies.
 * 
 * Run with: node scripts/tuneContrarianValue.mjs
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

// Load game data
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

console.log(`Loaded ${Object.keys(allTeamData).length} teams`);
console.log(`Loaded ${data.length} rounds of game data\n`);

// ============================================================================
// CONSTANTS
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

function selectBestMatches(probabilities, count = 9) {
  return probabilities
    .map((probs, index) => ({ index, confidence: Math.max(...probs) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
    .map((m) => m.index);
}

// ============================================================================
// TEAM ANALYSIS
// ============================================================================

function normalizeTeamName(name) {
  return name.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-").replace(/\./g, "")
    .replace(/fc$/i, "").replace(/-+$/, "").trim();
}

function getTeamData(teamName) {
  return allTeamData[normalizeTeamName(teamName)];
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
  
  let score = 0, weight = 0;
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
  return matches.filter(m => m.result === "W").length / matches.length;
}

function getRegressionAdjustedForm(teamName, beforeDate, regressionFactor) {
  const recent = getRecentForm(teamName, beforeDate, 8);
  const historical = getHistoricalAverageForm(teamName, beforeDate);
  return recent * (1 - regressionFactor) + historical * regressionFactor;
}

function calculateEdge(homeTeam, awayTeam, impliedProbs, matchDate, regressionFactor) {
  const homeForm = getRegressionAdjustedForm(homeTeam, matchDate, regressionFactor);
  const awayForm = getRegressionAdjustedForm(awayTeam, matchDate, regressionFactor);
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
  return {
    homeEdge: (estHomeWin / total) - impliedProbs[0],
    drawEdge: (estDraw / total) - impliedProbs[1],
    awayEdge: (estAwayWin / total) - impliedProbs[2],
  };
}

function getDrawPatternSignal(homeTeam, awayTeam, odds, matchDate) {
  let signal = 0;
  
  const homeDrawRate = getTeamDrawRate(homeTeam, matchDate, 12);
  const awayDrawRate = getTeamDrawRate(awayTeam, matchDate, 12);
  if (homeDrawRate > 0.30 && awayDrawRate > 0.30) signal += 0.12;
  else if (homeDrawRate > 0.28 && awayDrawRate > 0.28) signal += 0.06;
  
  const homeForm = getRecentForm(homeTeam, matchDate, 6);
  const awayForm = getRecentForm(awayTeam, matchDate, 6);
  const formDiff = Math.abs(homeForm - awayForm);
  if (formDiff < 0.10) signal += 0.08;
  else if (formDiff < 0.18) signal += 0.04;
  
  if (odds[1] >= 3.6) signal += 0.06;
  else if (odds[1] >= 3.4) signal += 0.03;
  
  const homeTeamData = getTeamData(homeTeam);
  const awayTeamData = getTeamData(awayTeam);
  const homeRecent = getMatchesBefore(homeTeamData, matchDate, 4);
  const awayRecent = getMatchesBefore(awayTeamData, matchDate, 4);
  const homeRecentDraws = homeRecent.filter(m => m.result === "D").length;
  const awayRecentDraws = awayRecent.filter(m => m.result === "D").length;
  if (homeRecentDraws >= 2 && awayRecentDraws >= 2) signal += 0.10;
  else if (homeRecentDraws >= 1 && awayRecentDraws >= 1) signal += 0.04;
  
  return Math.min(signal, 0.30);
}

// ============================================================================
// STRATEGY
// ============================================================================

function calculateContrarianProbs(homeTeam, awayTeam, odds, impliedProbs, matchDate, params) {
  const edge = calculateEdge(homeTeam, awayTeam, impliedProbs, matchDate, params.regressionFactor);
  const drawPattern = getDrawPatternSignal(homeTeam, awayTeam, odds, matchDate);
  
  let probs = [
    impliedProbs[0] * params.homeBaseBoost,
    impliedProbs[1] * params.drawBasePenalty,
    impliedProbs[2] * params.awayBasePenalty,
  ];
  
  // Edge adjustments
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
  
  // Draw pattern boost
  if (drawPattern >= params.drawPatternThreshold && odds[1] >= params.minDrawOddsForBoost) {
    probs[1] *= (1 + drawPattern * params.drawPatternMultiplier);
  }
  
  const sum = probs.reduce((a, b) => a + b, 0);
  return [probs[0] / sum, probs[1] / sum, probs[2] / sum];
}

function generateBets(dataFile, betsCount, params) {
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
    
    return calculateContrarianProbs(homeTeam, awayTeam, odds, impliedProbs, dataFile.date, params);
  });
  
  // Deterministic lock bet
  const predictions = matchProbs.map(probs => {
    const maxIdx = probs.indexOf(Math.max(...probs));
    return ["1", "X", "2"][maxIdx];
  });
  
  // All identical bets
  const bets = [];
  for (let i = 0; i < betsCount; i++) {
    bets.push({ predictions: [...predictions] });
  }
  
  return { date: dataFile.date, bets };
}

// ============================================================================
// EVALUATION
// ============================================================================

function evaluateStrategy(betsResults) {
  let totalWinnings = 0;
  let totalCost = 0;
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
      totalCost += 27;
      dayCost += 27;
      
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
          totalWinnings += payout;
          dayWinnings += payout;
        }
      }
    }
    
    if (dayWinnings > dayCost) profitableDays++;
  }
  
  const profit = totalWinnings - totalCost;
  const roi = (profit / totalCost) * 100;
  
  return { roi, profit, profitableDays, totalDays: betsResults.length };
}

// ============================================================================
// PARAMETER GRID SEARCH
// ============================================================================

console.log("=".repeat(80));
console.log("CONTRARIAN VALUE STRATEGY TUNING");
console.log("=".repeat(80));
console.log("");

// Fine-tuning around best params: H:1.8 D:0.3 A:0.8 E:10 R:0.4
const parameterGrid = {
  homeBaseBoost: [1.6, 1.7, 1.8, 1.9, 2.0],
  drawBasePenalty: [0.25, 0.30, 0.35, 0.40],
  awayBasePenalty: [0.7, 0.8, 0.9, 1.0],
  edgeMultiplier: [8, 10, 12],
  minEdgeForBoost: [0.003, 0.005, 0.007],
  drawPatternThreshold: [0.03, 0.04, 0.05],
  drawPatternMultiplier: [5, 6, 7],
  minDrawOddsForBoost: [2.4, 2.6, 2.8],
  minAwayOddsForValue: [1.4, 1.5, 1.6],
  regressionFactor: [0.35, 0.40, 0.45],
};

// Generate all combinations
function* generateCombinations(grid) {
  const keys = Object.keys(grid);
  const values = Object.values(grid);
  const indices = new Array(keys.length).fill(0);
  
  while (true) {
    const combo = {};
    for (let i = 0; i < keys.length; i++) {
      combo[keys[i]] = values[i][indices[i]];
    }
    yield combo;
    
    // Increment indices
    let i = keys.length - 1;
    while (i >= 0) {
      indices[i]++;
      if (indices[i] < values[i].length) break;
      indices[i] = 0;
      i--;
    }
    if (i < 0) break;
  }
}

const results = [];
let tested = 0;
const totalCombinations = Object.values(parameterGrid).reduce((a, b) => a * b.length, 1);

console.log(`Testing ${totalCombinations} parameter combinations...\n`);

for (const params of generateCombinations(parameterGrid)) {
  const betsResults = data.map(df => generateBets(df, 50, params));
  const evaluation = evaluateStrategy(betsResults);
  
  results.push({
    params,
    ...evaluation,
  });
  
  tested++;
  if (tested % 1000 === 0) {
    console.log(`  Tested ${tested}/${totalCombinations}...`);
  }
}

// Sort by ROI
results.sort((a, b) => b.roi - a.roi);

console.log(`\nTested ${tested} parameter combinations\n`);

// Print top 15 results
console.log("TOP 15 CONFIGURATIONS:");
console.log("=".repeat(80));

for (let i = 0; i < Math.min(15, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(
    `${medal} #${String(i + 1).padStart(2)}: ROI ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(2)}% | ` +
    `Profit: ${r.profit >= 0 ? "+" : ""}${r.profit.toFixed(0)} | ` +
    `Days: ${r.profitableDays}/${r.totalDays}`
  );
  console.log(
    `     H:${r.params.homeBaseBoost} D:${r.params.drawBasePenalty} A:${r.params.awayBasePenalty} ` +
    `E:${r.params.edgeMultiplier} PT:${r.params.drawPatternThreshold} PM:${r.params.drawPatternMultiplier} ` +
    `R:${r.params.regressionFactor}`
  );
}

// Best config
const best = results[0];
console.log("\n" + "=".repeat(80));
console.log("🏆 BEST CONFIGURATION");
console.log("=".repeat(80));
console.log(`\nROI: ${best.roi >= 0 ? "+" : ""}${best.roi.toFixed(2)}%`);
console.log(`Profit: ${best.profit >= 0 ? "+" : ""}${best.profit.toFixed(0)}`);
console.log(`Profitable Days: ${best.profitableDays}/${best.totalDays}`);
console.log(`\nOptimal Parameters:`);
console.log(JSON.stringify(best.params, null, 2));

