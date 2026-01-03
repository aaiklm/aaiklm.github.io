/**
 * Test Team Intelligence Strategy
 * Iterates on parameters to find the best configuration
 *
 * Run with: node scripts/testTeamIntelligence.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Load Data
// ============================================================================

const dataDir = path.join(__dirname, "../src/assets/data");
const teamsDir = path.join(dataDir, "teams");

// Load team data
const teamDataMap = new Map();
const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith('.json') && !f.includes('all-'));

for (const file of teamFiles) {
  const content = JSON.parse(fs.readFileSync(path.join(teamsDir, file), "utf-8"));
  if (content.teamName) {
    const normalized = normalizeTeamName(content.teamName);
    teamDataMap.set(normalized, content);
  }
}

console.log(`Loaded ${teamDataMap.size} teams`);

// Load game data
const files = fs.readdirSync(dataDir)
  .filter(f => f.endsWith(".json") && !f.includes("teams"));

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
  .map(file => {
    const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : file.replace(".json", "");
    const probabilities = calculateProbabilities(content.odds);
    return { ...content, date, probabilities };
  })
  .filter(d => d.result !== undefined)
  .sort((a, b) => a.date.localeCompare(b.date));

console.log(`Loaded ${data.length} rounds of game data\n`);

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeTeamName(name) {
  let normalized = name.toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(" fc", "")
    .replace(" city", "")
    .replace(" united", "")
    .replace("queens park r", "qpr")
    .replace("sheffield w", "sheffield weds")
    .replace("west bromwich", "west brom")
    .replace("bristol c", "bristol city");

  const aliases = {
    wolverhampton: "wolves",
    "tottenham hotspur": "tottenham",
    newcastle: "newcastle",
  };

  return aliases[normalized] || normalized;
}

function findTeamData(teamName) {
  const normalized = normalizeTeamName(teamName);
  
  if (teamDataMap.has(normalized)) return teamDataMap.get(normalized);
  
  for (const [key, data] of teamDataMap.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) return data;
    const teamNormalized = normalizeTeamName(data.teamName);
    if (teamNormalized.includes(normalized) || normalized.includes(teamNormalized)) return data;
  }
  
  return null;
}

function calculateTeamForm(team, beforeDate, opponent) {
  const relevantMatches = team.matches.filter(m => m.date < beforeDate);
  
  if (relevantMatches.length === 0) {
    return { recentForm: 0.5, homeForm: 0.5, awayForm: 0.5, drawRate: 0.25, goalDiff: 0, headToHead: 0.5 };
  }

  const last5 = relevantMatches.slice(0, 5);
  const last5Wins = last5.filter(m => m.result === "W").length;
  const recentForm = last5.length > 0 ? last5Wins / last5.length : 0.5;

  const homeMatches = relevantMatches.filter(m => m.isHome).slice(0, 10);
  const homeWins = homeMatches.filter(m => m.result === "W").length;
  const homeForm = homeMatches.length > 0 ? homeWins / homeMatches.length : 0.5;

  const awayMatches = relevantMatches.filter(m => !m.isHome).slice(0, 10);
  const awayWins = awayMatches.filter(m => m.result === "W").length;
  const awayForm = awayMatches.length > 0 ? awayWins / awayMatches.length : 0.5;

  const last10 = relevantMatches.slice(0, 10);
  const draws = last10.filter(m => m.result === "D").length;
  const drawRate = last10.length > 0 ? draws / last10.length : 0.25;

  const goalDiff = last5.reduce((acc, m) => acc + (m.goalsFor - m.goalsAgainst), 0) / Math.max(last5.length, 1);

  let headToHead = 0.5;
  if (opponent) {
    const normalizedOpponent = normalizeTeamName(opponent);
    const h2hMatches = relevantMatches
      .filter(m => normalizeTeamName(m.opponent).includes(normalizedOpponent) || 
                   normalizedOpponent.includes(normalizeTeamName(m.opponent)))
      .slice(0, 6);
    
    if (h2hMatches.length > 0) {
      headToHead = h2hMatches.filter(m => m.result === "W").length / h2hMatches.length;
    }
  }

  return { recentForm, homeForm, awayForm, drawRate, goalDiff, headToHead };
}

function createSeededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function resultToOutcome(result) {
  if (result === "0") return "1";
  if (result === "1") return "X";
  return "2";
}

// Grid constants
const GRID_SIZE = 9;
const STANDARD_LINES = [];
const COL1 = [0, 3, 6], COL2 = [1, 4, 7], COL3 = [2, 5, 8];
for (const c1 of COL1) for (const c2 of COL2) for (const c3 of COL3) STANDARD_LINES.push({ positions: [c1, c2, c3] });

// ============================================================================
// Strategy Implementations
// ============================================================================

// Ultra Conservative (baseline to beat)
function ultraConservativeStrategy(betsCount = 50) {
  const params = { homeBoost: 1.8, drawPenalty: 0.1, awayAdjust: 0.9, upsetChance: 0.02 };
  
  return data.map(dataFile => {
    const dateHash = dataFile.date.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(42 + dateHash);
    
    const bets = [];
    const usedKeys = new Set();
    
    // Get adjusted probs for selected matches (first 9)
    const matchProbs = [];
    for (let i = 0; i < Math.min(GRID_SIZE, dataFile.probabilities.length); i++) {
      const probs = dataFile.probabilities[i];
      const adjusted = [
        probs[0] * params.homeBoost,
        probs[1] * params.drawPenalty,
        probs[2] * params.awayAdjust
      ];
      const sum = adjusted.reduce((a, b) => a + b, 0);
      matchProbs.push(adjusted.map(p => p / sum));
    }
    
    // Pure favorite bet
    const favPredictions = matchProbs.map(probs => {
      const maxIdx = probs.indexOf(Math.max(...probs));
      return ["1", "X", "2"][maxIdx];
    });
    bets.push({ predictions: favPredictions });
    usedKeys.add(favPredictions.join(","));
    
    // Generate more bets
    let attempts = 0;
    while (bets.length < betsCount && attempts < betsCount * 50) {
      const predictions = matchProbs.map(probs => {
        const maxIdx = probs.indexOf(Math.max(...probs));
        const favorite = ["1", "X", "2"][maxIdx];
        
        if (random() < params.upsetChance) {
          const r = random();
          if (r < probs[0]) return "1";
          if (r < probs[0] + probs[1]) return "X";
          return "2";
        }
        return favorite;
      });
      
      const key = predictions.join(",");
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        bets.push({ predictions });
      }
      attempts++;
    }
    
    while (bets.length < betsCount) bets.push({ predictions: favPredictions });
    
    return { date: dataFile.date, bets };
  });
}

/**
 * NEW APPROACH: Use team data to make SMART OVERRIDES
 * 
 * Base strategy: Pure favorites (no upset chance)
 * Team data identifies specific situations where we override the favorite pick
 * 
 * Override conditions (must be VERY confident):
 * 1. HOME FORTRESS: Home team dominant at home + weak away opposition → pick "1"
 * 2. AWAY VALUE: Away team much better form AND odds undervalue them → pick "2" 
 * 3. DRAW TRAP: Both teams high draw rates + odds close → consider keeping draw
 */

function teamDataStrategy(config = {}) {
  const {
    betsCount = 50,
    // Override thresholds (when to deviate from pure favorites)
    homeFortressHomeForm = 0.65,
    homeFortressAwayForm = 0.35,
    awayValueFormDiff = 0.3,
    awayValueMinOdds = 0.35,
  } = config;
  
  return data.map(dataFile => {
    const dateHash = dataFile.date.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = createSeededRandom(42 + dateHash);
    
    const matchPicks = [];
    for (let i = 0; i < Math.min(GRID_SIZE, dataFile.probabilities.length); i++) {
      const probs = dataFile.probabilities[i];
      const teams = dataFile.teams?.[i];
      
      // Base: Ultra conservative pick (pure favorite with home boost, no upset)
      const adjusted = [probs[0] * 1.8, probs[1] * 0.1, probs[2] * 0.9];
      const sum = adjusted.reduce((a, b) => a + b, 0);
      const normalized = adjusted.map(p => p / sum);
      const maxIdx = normalized.indexOf(Math.max(...normalized));
      let pick = ["1", "X", "2"][maxIdx];
      
      // Check for team data overrides
      if (teams) {
        const homeTeamData = findTeamData(teams["1"]);
        const awayTeamData = findTeamData(teams["2"]);
        
        if (homeTeamData && awayTeamData) {
          const homeForm = calculateTeamForm(homeTeamData, dataFile.date, teams["2"]);
          const awayForm = calculateTeamForm(awayTeamData, dataFile.date, teams["1"]);
          
          // OVERRIDE 1: Home Fortress
          // Home team excellent at home AND away team poor away → pick home
          if (homeForm.homeForm >= homeFortressHomeForm && 
              awayForm.awayForm <= homeFortressAwayForm &&
              pick !== "1") {
            pick = "1";
          }
          
          // OVERRIDE 2: Away Value
          // Away team significantly better recent form AND odds don't crush away
          const formDiff = awayForm.recentForm - homeForm.recentForm;
          if (formDiff >= awayValueFormDiff && 
              probs[2] >= awayValueMinOdds &&
              awayForm.awayForm >= 0.4 &&
              pick === "1") {
            pick = "2";
          }
          
          // OVERRIDE 3: Strong H2H override
          // If home team dominates H2H (70%+) and we picked away, switch to home
          if (homeForm.headToHead >= 0.7 && pick === "2" && probs[0] >= 0.35) {
            pick = "1";
          }
        }
      }
      
      matchPicks.push({ pick, normalized });
    }
    
    const bets = [];
    const usedKeys = new Set();
    
    // First bet: smart picks
    const smartBet = { predictions: matchPicks.map(m => m.pick) };
    bets.push(smartBet);
    usedKeys.add(smartBet.predictions.join(","));
    
    // Fill remaining bets (no variation - pure strategy)
    while (bets.length < betsCount) {
      bets.push({ predictions: [...smartBet.predictions] });
    }
    
    return { date: dataFile.date, bets };
  });
}

function teamIntelligenceStrategy(config = {}) {
  return teamDataStrategy(config);
}

// ============================================================================
// Accuracy Calculation
// ============================================================================

function calculateAccuracy(betsResults) {
  let totalBets = 0, totalWinnings = 0, totalCost = 0, profitableDays = 0;
  
  for (const result of betsResults) {
    const dataFile = data.find(d => d.date === result.date);
    if (!dataFile) continue;
    
    let dayWinnings = 0;
    const dayCost = result.bets.length * 27;
    
    for (const bet of result.bets) {
      for (const line of STANDARD_LINES) {
        let allCorrect = true;
        let payout = 1;
        
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
        
        if (allCorrect) dayWinnings += payout;
      }
      
      totalCost += 27;
      totalBets++;
    }
    
    totalWinnings += dayWinnings;
    if (dayWinnings > dayCost) profitableDays++;
  }
  
  const profit = totalWinnings - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  
  return { totalBets, totalWinnings, totalCost, profit, roi, profitableDays, totalDays: betsResults.length };
}

// ============================================================================
// Run Tests
// ============================================================================

console.log("=".repeat(80));
console.log("TEAM INTELLIGENCE STRATEGY OPTIMIZATION");
console.log("=".repeat(80));

const results = [];

// Baseline: Ultra Conservative
console.log("\nTesting Ultra Conservative (baseline)...");
const ultraBets = ultraConservativeStrategy(50);
const ultraResult = calculateAccuracy(ultraBets);
results.push({ name: "Ultra Conservative (baseline)", ...ultraResult });

// Also test ultra conservative with NO upset chance (new baseline)
function ultraConservativeNoUpset(betsCount = 50) {
  return data.map(dataFile => {
    const matchProbs = [];
    for (let i = 0; i < Math.min(GRID_SIZE, dataFile.probabilities.length); i++) {
      const probs = dataFile.probabilities[i];
      const adjusted = [probs[0] * 1.8, probs[1] * 0.1, probs[2] * 0.9];
      const sum = adjusted.reduce((a, b) => a + b, 0);
      matchProbs.push(adjusted.map(p => p / sum));
    }
    
    const favPredictions = matchProbs.map(probs => {
      const maxIdx = probs.indexOf(Math.max(...probs));
      return ["1", "X", "2"][maxIdx];
    });
    
    const bets = [];
    for (let i = 0; i < betsCount; i++) {
      bets.push({ predictions: [...favPredictions] });
    }
    
    return { date: dataFile.date, bets };
  });
}

// New baseline (no upset)
console.log("Testing Pure Favorites (new baseline)...");
results.push({ name: "Pure Favorites (new baseline)", ...calculateAccuracy(ultraConservativeNoUpset(50)) });

// Ultra fine-tune around winner (formDiff: 0.5, minOdds: 0.35)
const paramSets = [
  // Current winner
  { name: "Team Data (0.5/0.35)", awayValueFormDiff: 0.5, awayValueMinOdds: 0.35 },
  
  // Fine-tune formDiff
  { name: "Team Data (0.48/0.35)", awayValueFormDiff: 0.48, awayValueMinOdds: 0.35 },
  { name: "Team Data (0.52/0.35)", awayValueFormDiff: 0.52, awayValueMinOdds: 0.35 },
  { name: "Team Data (0.55/0.35)", awayValueFormDiff: 0.55, awayValueMinOdds: 0.35 },
  { name: "Team Data (0.6/0.35)", awayValueFormDiff: 0.6, awayValueMinOdds: 0.35 },
  
  // Fine-tune minOdds
  { name: "Team Data (0.5/0.30)", awayValueFormDiff: 0.5, awayValueMinOdds: 0.30 },
  { name: "Team Data (0.5/0.32)", awayValueFormDiff: 0.5, awayValueMinOdds: 0.32 },
  { name: "Team Data (0.5/0.33)", awayValueFormDiff: 0.5, awayValueMinOdds: 0.33 },
  { name: "Team Data (0.5/0.37)", awayValueFormDiff: 0.5, awayValueMinOdds: 0.37 },
  { name: "Team Data (0.5/0.38)", awayValueFormDiff: 0.5, awayValueMinOdds: 0.38 },
  
  // Combined fine-tuning
  { name: "Team Data (0.55/0.33)", awayValueFormDiff: 0.55, awayValueMinOdds: 0.33 },
  { name: "Team Data (0.55/0.35)", awayValueFormDiff: 0.55, awayValueMinOdds: 0.35 },
  { name: "Team Data (0.55/0.30)", awayValueFormDiff: 0.55, awayValueMinOdds: 0.30 },
];

for (const params of paramSets) {
  console.log(`Testing ${params.name}...`);
  const bets = teamIntelligenceStrategy(params);
  const result = calculateAccuracy(bets);
  results.push({ name: params.name, ...result, params });
}

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
  const isBaseline = r.name.includes("baseline");
  console.log(
    `${medal} #${String(i + 1).padStart(2)}: ${r.name.padEnd(35)} ROI: ${roiStr.padStart(9)} | Profit: ${profitStr.padStart(8)} | Days: ${r.profitableDays}/${r.totalDays}${isBaseline ? " ⬅️ BASELINE" : ""}`
  );
}

// If we beat baseline, show the winning params
const winner = results[0];
const baseline = results.find(r => r.name.includes("baseline"));

console.log("\n" + "=".repeat(80));
if (winner.roi > baseline.roi) {
  console.log("✅ BEAT BASELINE!");
  console.log(`\nWinner: ${winner.name}`);
  console.log(`ROI improvement: ${(winner.roi - baseline.roi).toFixed(2)} percentage points`);
  if (winner.params) {
    console.log("\nWinning parameters:");
    console.log(JSON.stringify(winner.params, null, 2));
  }
} else {
  console.log("❌ Baseline still best. Need more tuning...");
}

console.log("\n");

