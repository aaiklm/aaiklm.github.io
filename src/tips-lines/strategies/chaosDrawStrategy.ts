/**
 * 🎲 Chaos Draw Strategy
 * 
 * PHILOSOPHY: Hunt for value in draws and chaos matches.
 * 
 * Current strategies over-penalize draws, but draws at 3.3+ odds 
 * can be extremely valuable when we identify the right conditions:
 * 
 * KEY INNOVATIONS:
 * 1. Draw Hunter - Find teams with high draw propensity
 * 2. Chaos Detection - Teams with erratic results (beating top teams, losing to weak ones)
 * 3. Evenly Matched Finder - Similar form = higher draw chance
 * 4. Head-to-Head History - Some matchups historically produce draws
 * 5. Goal Profile Analysis - Low-scoring teams = more draws
 * 6. Upset Detector - Find high-value away wins
 * 
 * Unlike other strategies that blindly favor home/favorites, this strategy
 * identifies SPECIFIC situations where draws or upsets have higher value.
 */

import type { DataFileWithResult, GridBet, GridBetsResult, Outcome, Probability } from "../types";
import { createSeededRandom } from "../utils/seededRandom";
import { GRID_MATCH_COUNT, selectBestMatches } from "../constants";

// Team data types
type TeamMatch = {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "L" | "D";
  league: string;
};

type TeamData = {
  teamName: string;
  matches: TeamMatch[];
};

// ============================================================================
// TEAM DATA LOADING
// ============================================================================

const teamModules = import.meta.glob<{ default: TeamData }>(
  "../../assets/data/teams/*.json",
  { eager: true }
);

const allTeamData: Record<string, TeamData> = {};
for (const [path, module] of Object.entries(teamModules)) {
  const filename = path.split("/").pop()?.replace(".json", "") ?? "";
  if (filename.includes("-all") || filename === "all-leagues") continue;
  allTeamData[filename] = module.default;
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\s+/g, "-")
    .replace(/\./g, "")
    .replace(/fc$/i, "")
    .replace(/-+$/, "")
    .trim();
}

function getTeamData(teamName: string): TeamData | undefined {
  const normalized = normalizeTeamName(teamName);
  return allTeamData[normalized];
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

interface TeamProfile {
  name: string;
  hasData: boolean;
  drawRate: number;           // 0-1, how often this team draws
  chaosIndex: number;         // 0-1, how unpredictable this team is
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  recentForm: number;         // 0-100
  venuePerformance: number;   // Win rate at this venue
  upsetPotential: number;     // Tendency to cause upsets
}

function getMatchesBefore(team: TeamData | undefined, beforeDate: string, count: number): TeamMatch[] {
  if (!team) return [];
  const matches: TeamMatch[] = [];
  for (const match of team.matches) {
    if (match.date < beforeDate) {
      matches.push(match);
      if (matches.length >= count) break;
    }
  }
  return matches;
}

/**
 * Calculates how often a team draws
 */
function calculateDrawRate(matches: TeamMatch[]): number {
  if (matches.length === 0) return 0.28; // League average
  const draws = matches.filter(m => m.result === "D").length;
  return draws / matches.length;
}

/**
 * Calculates chaos index - how unpredictable a team is.
 * High chaos = beats stronger teams, loses to weaker ones.
 * Uses result variance and unexpected outcomes.
 */
function calculateChaosIndex(matches: TeamMatch[]): number {
  if (matches.length < 5) return 0.5;
  
  // Look for pattern breaks - wins after losses, losses after wins
  let transitions = 0;
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].result !== matches[i-1].result) {
      transitions++;
    }
  }
  
  // Calculate goal variance
  const goals = matches.map(m => m.goalsFor);
  const avgGoals = goals.reduce((a, b) => a + b, 0) / goals.length;
  const variance = goals.reduce((sum, g) => sum + Math.pow(g - avgGoals, 2), 0) / goals.length;
  
  // Chaos = high transitions + high goal variance
  const transitionRate = transitions / (matches.length - 1);
  const normalizedVariance = Math.min(variance / 4, 1); // Cap at variance of 4
  
  return (transitionRate * 0.6 + normalizedVariance * 0.4);
}

/**
 * Finds head-to-head history between two teams
 */
function getHeadToHead(homeTeam: TeamData | undefined, awayTeamName: string, beforeDate: string): {
  draws: number;
  homeWins: number;
  awayWins: number;
  total: number;
} {
  const result = { draws: 0, homeWins: 0, awayWins: 0, total: 0 };
  if (!homeTeam) return result;
  
  const normalizedAway = normalizeTeamName(awayTeamName);
  
  for (const match of homeTeam.matches) {
    if (match.date >= beforeDate) continue;
    
    const opponent = normalizeTeamName(match.opponent);
    if (opponent.includes(normalizedAway) || normalizedAway.includes(opponent)) {
      result.total++;
      if (match.result === "D") result.draws++;
      else if (match.result === "W" && match.isHome) result.homeWins++;
      else if (match.result === "W" && !match.isHome) result.awayWins++;
      else if (match.result === "L" && match.isHome) result.awayWins++;
      else if (match.result === "L" && !match.isHome) result.homeWins++;
    }
  }
  
  return result;
}

/**
 * Analyzes a team's profile for predicting outcomes
 */
function analyzeTeamProfile(
  teamName: string,
  isHome: boolean,
  beforeDate: string,
  matchWindow: number = 15
): TeamProfile {
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
  
  // Draw rate
  const drawRate = calculateDrawRate(matches);
  
  // Chaos index
  const chaosIndex = calculateChaosIndex(matches);
  
  // Goals
  const avgGoalsFor = matches.reduce((s, m) => s + m.goalsFor, 0) / matches.length;
  const avgGoalsAgainst = matches.reduce((s, m) => s + m.goalsAgainst, 0) / matches.length;
  
  // Recent form (exponential decay weighted)
  let formScore = 0;
  let totalWeight = 0;
  for (let i = 0; i < Math.min(matches.length, 10); i++) {
    const weight = Math.pow(0.8, i);
    const points = matches[i].result === "W" ? 3 : matches[i].result === "D" ? 1 : 0;
    formScore += points * weight;
    totalWeight += 3 * weight;
  }
  const recentForm = (formScore / totalWeight) * 100;
  
  // Venue performance
  const venueMatches = matches.filter(m => m.isHome === isHome);
  const venueWins = venueMatches.filter(m => m.result === "W").length;
  const venuePerformance = venueMatches.length >= 3 
    ? venueWins / venueMatches.length 
    : isHome ? 0.45 : 0.30;
  
  // Upset potential - away wins against stronger opponents
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

// ============================================================================
// MATCH ANALYSIS
// ============================================================================

interface MatchAnalysis {
  homeProfile: TeamProfile;
  awayProfile: TeamProfile;
  drawScore: number;       // 0-1, likelihood this match ends in a draw
  chaosScore: number;      // 0-1, unpredictability of this match
  upsetScore: number;      // 0-1, likelihood of away upset
  headToHead: ReturnType<typeof getHeadToHead>;
  valueOpportunity: "home" | "draw" | "away" | "balanced";
}

function analyzeMatch(
  homeTeam: string,
  awayTeam: string,
  odds: [number, number, number],
  matchDate: string
): MatchAnalysis {
  const homeProfile = analyzeTeamProfile(homeTeam, true, matchDate);
  const awayProfile = analyzeTeamProfile(awayTeam, false, matchDate);
  const homeData = getTeamData(homeTeam);
  const headToHead = getHeadToHead(homeData, awayTeam, matchDate);
  
  // ===== DRAW SCORE =====
  // Higher when:
  // - Both teams have high draw rates
  // - Similar form
  // - Head-to-head history of draws
  // - Low scoring teams
  // - Draw odds are generous (>3.3)
  
  let drawScore = 0;
  
  // Combined draw propensity
  const combinedDrawRate = (homeProfile.drawRate + awayProfile.drawRate) / 2;
  drawScore += combinedDrawRate * 0.25;
  
  // Form similarity - closer form = higher draw chance
  const formDiff = Math.abs(homeProfile.recentForm - awayProfile.recentForm);
  const formSimilarity = 1 - (formDiff / 100);
  drawScore += formSimilarity * 0.20;
  
  // Head-to-head draw history
  if (headToHead.total >= 2) {
    const h2hDrawRate = headToHead.draws / headToHead.total;
    drawScore += h2hDrawRate * 0.15;
  }
  
  // Low scoring tendency
  const combinedGoals = (homeProfile.avgGoalsFor + awayProfile.avgGoalsFor) / 2;
  if (combinedGoals < 1.2) drawScore += 0.15;
  else if (combinedGoals < 1.5) drawScore += 0.08;
  
  // Defensive strength
  const defensiveStrength = 2 - (homeProfile.avgGoalsAgainst + awayProfile.avgGoalsAgainst);
  if (defensiveStrength > 0.5) drawScore += defensiveStrength * 0.1;
  
  // Draw odds value bonus
  if (odds[1] >= 3.8) drawScore += 0.12;
  else if (odds[1] >= 3.5) drawScore += 0.08;
  else if (odds[1] >= 3.3) drawScore += 0.04;
  
  // ===== CHAOS SCORE =====
  const chaosScore = (homeProfile.chaosIndex + awayProfile.chaosIndex) / 2;
  
  // ===== UPSET SCORE =====
  let upsetScore = 0;
  
  // Away team's upset potential
  upsetScore += awayProfile.upsetPotential * 0.3;
  
  // Home team's vulnerability (poor home form)
  upsetScore += (1 - homeProfile.venuePerformance) * 0.2;
  
  // Form difference favoring away
  if (awayProfile.recentForm > homeProfile.recentForm) {
    upsetScore += Math.min((awayProfile.recentForm - homeProfile.recentForm) / 50, 0.25);
  }
  
  // Away odds value (higher odds = more value if we predict upset)
  if (odds[2] >= 4.0) upsetScore += 0.12;
  else if (odds[2] >= 3.0) upsetScore += 0.06;
  
  // Head-to-head away wins
  if (headToHead.total >= 2) {
    const h2hAwayRate = headToHead.awayWins / headToHead.total;
    upsetScore += h2hAwayRate * 0.15;
  }
  
  // ===== VALUE OPPORTUNITY =====
  // Determine where the best value lies
  const impliedDrawProb = 1 / odds[1];
  const impliedAwayProb = 1 / odds[2];
  
  let valueOpportunity: "home" | "draw" | "away" | "balanced" = "home";
  
  if (drawScore > 0.45 && impliedDrawProb < 0.32) {
    valueOpportunity = "draw";
  } else if (upsetScore > 0.5 && impliedAwayProb < 0.30) {
    valueOpportunity = "away";
  } else if (drawScore > 0.35 && upsetScore > 0.35) {
    valueOpportunity = "balanced";
  }
  
  return {
    homeProfile,
    awayProfile,
    drawScore: Math.min(drawScore, 1),
    chaosScore,
    upsetScore: Math.min(upsetScore, 1),
    headToHead,
    valueOpportunity,
  };
}

// ============================================================================
// STRATEGY CONFIGURATION
// ============================================================================

export const CHAOS_DRAW_PARAMS = {
  // Draw hunting - Conservative defaults that boost draws only when very confident
  drawBoostThreshold: 0.50,    // Min draw score to boost draw probability
  drawBoostMultiplier: 2.0,    // How much to boost draw when conditions are right
  drawBaseMultiplier: 0.35,    // Base draw multiplier (aggressive penalty like others)
  
  // Chaos/Upset handling
  chaosThreshold: 0.55,        // Min chaos score to consider upsets
  upsetBoostThreshold: 0.50,   // Min upset score to boost away
  upsetBoostMultiplier: 1.5,   // Away boost for high upset potential
  
  // Home handling - Strong home bias is proven to work
  homeBaseBoost: 1.9,          // Strong home boost (proven optimal)
  homeFormBonus: 0.3,          // Bonus when home team has good venue form
  
  // Value targeting
  minDrawOddsForBoost: 3.4,    // Only hunt draws above this odds
  minAwayOddsForUpset: 3.2,    // Only target upsets above this odds
  
  // Bet diversity
  diversityFactor: 0.12,       // Add randomness to avoid over-convergence
};

export type ChaosDrawParams = typeof CHAOS_DRAW_PARAMS;

export type ChaosDrawConfig = {
  betsCount?: number;
  seed?: number;
  params?: Partial<ChaosDrawParams>;
};

// ============================================================================
// PROBABILITY CALCULATION
// ============================================================================

function calculateChaosDrawProbs(
  homeTeam: string,
  awayTeam: string,
  odds: [number, number, number],
  impliedProbs: Probability,
  matchDate: string,
  params: ChaosDrawParams
): Probability {
  const analysis = analyzeMatch(homeTeam, awayTeam, odds, matchDate);
  
  // Start with implied probabilities
  let probs: [number, number, number] = [...impliedProbs];
  
  // ===== HOME ADJUSTMENT =====
  // Less aggressive than other strategies - we believe in draws/upsets
  let homeMultiplier = params.homeBaseBoost;
  
  if (analysis.homeProfile.hasData) {
    // Bonus for strong home form
    if (analysis.homeProfile.venuePerformance > 0.5) {
      homeMultiplier += params.homeFormBonus;
    }
    // Penalty for weak home form
    if (analysis.homeProfile.venuePerformance < 0.35) {
      homeMultiplier *= 0.8;
    }
  }
  
  probs[0] *= homeMultiplier;
  
  // ===== DRAW ADJUSTMENT =====
  // This is where we differ from other strategies!
  let drawMultiplier = params.drawBaseMultiplier;
  
  if (analysis.drawScore >= params.drawBoostThreshold && odds[1] >= params.minDrawOddsForBoost) {
    // BOOST draw probability when conditions favor it
    drawMultiplier = params.drawBoostMultiplier;
    
    // Extra boost for very high draw scores
    if (analysis.drawScore >= 0.50) {
      drawMultiplier *= 1.3;
    }
  } else if (analysis.valueOpportunity === "draw") {
    drawMultiplier = 1.8;
  } else if (analysis.chaosScore >= params.chaosThreshold) {
    // In chaotic matches, draws happen more often
    drawMultiplier = 1.2;
  }
  
  probs[1] *= drawMultiplier;
  
  // ===== AWAY/UPSET ADJUSTMENT =====
  let awayMultiplier = 0.9; // Slight base penalty
  
  if (analysis.upsetScore >= params.upsetBoostThreshold && odds[2] >= params.minAwayOddsForUpset) {
    // BOOST away probability when upset conditions are right
    awayMultiplier = params.upsetBoostMultiplier;
    
    // Extra boost for very high upset scores
    if (analysis.upsetScore >= 0.55) {
      awayMultiplier *= 1.2;
    }
  } else if (analysis.valueOpportunity === "away") {
    awayMultiplier = 1.5;
  } else if (analysis.chaosScore >= params.chaosThreshold) {
    // Chaos = upsets more likely
    awayMultiplier = 1.1;
  }
  
  probs[2] *= awayMultiplier;
  
  // ===== SPECIAL CASES =====
  
  // Evenly matched teams - boost draw
  if (analysis.homeProfile.hasData && analysis.awayProfile.hasData) {
    const formDiff = Math.abs(analysis.homeProfile.recentForm - analysis.awayProfile.recentForm);
    if (formDiff < 10) {
      probs[1] *= 1.3;
    }
  }
  
  // Head-to-head history
  if (analysis.headToHead.total >= 3) {
    const h2hDrawRate = analysis.headToHead.draws / analysis.headToHead.total;
    if (h2hDrawRate > 0.4) {
      probs[1] *= 1.4;
    }
  }
  
  // Normalize
  const sum = probs.reduce((a, b) => a + b, 0);
  return [probs[0] / sum, probs[1] / sum, probs[2] / sum];
}

// ============================================================================
// BET GENERATION
// ============================================================================

function generateChaosBet(
  matchProbs: Probability[],
  random: () => number,
  diversityFactor: number
): GridBet {
  const predictions: Outcome[] = matchProbs.map(probs => {
    // Add some controlled randomness for diversity
    let adjusted = probs.map(p => p * (1 + (random() - 0.5) * diversityFactor)) as Probability;
    const sum = adjusted.reduce((a, b) => a + b, 0);
    adjusted = adjusted.map(p => p / sum) as Probability;
    
    const r = random();
    if (r < adjusted[0]) return "1";
    if (r < adjusted[0] + adjusted[1]) return "X";
    return "2";
  });
  
  return { predictions };
}

function generateFavoriteBet(matchProbs: Probability[]): GridBet {
  const predictions: Outcome[] = matchProbs.map(probs => {
    const maxIdx = probs.indexOf(Math.max(...probs));
    return (["1", "X", "2"] as Outcome[])[maxIdx];
  });
  return { predictions };
}

/**
 * Generates a "draw hunter" bet - actively prefers draws
 */
function generateDrawHunterBet(
  matchProbs: Probability[],
  random: () => number
): GridBet {
  const predictions: Outcome[] = matchProbs.map(probs => {
    // Boost draw probability for this bet
    const drawBoosted: Probability = [
      probs[0] * 0.7,
      probs[1] * 2.5,
      probs[2] * 0.7,
    ];
    const sum = drawBoosted.reduce((a, b) => a + b, 0);
    const normalized = drawBoosted.map(p => p / sum) as Probability;
    
    const r = random();
    if (r < normalized[0]) return "1";
    if (r < normalized[0] + normalized[1]) return "X";
    return "2";
  });
  
  return { predictions };
}

/**
 * Generates an "upset hunter" bet - actively prefers away wins
 */
function generateUpsetHunterBet(
  matchProbs: Probability[],
  random: () => number
): GridBet {
  const predictions: Outcome[] = matchProbs.map(probs => {
    // Boost away probability for this bet
    const awayBoosted: Probability = [
      probs[0] * 0.6,
      probs[1] * 0.8,
      probs[2] * 2.2,
    ];
    const sum = awayBoosted.reduce((a, b) => a + b, 0);
    const normalized = awayBoosted.map(p => p / sum) as Probability;
    
    const r = random();
    if (r < normalized[0]) return "1";
    if (r < normalized[0] + normalized[1]) return "X";
    return "2";
  });
  
  return { predictions };
}

function generateBets(
  dataFile: DataFileWithResult,
  betsCount: number,
  seed: number,
  params: ChaosDrawParams
): GridBetsResult {
  const dateHash = dataFile.date
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const effectiveSeed = seed + dateHash;
  const random = createSeededRandom(effectiveSeed);
  
  // Select best 9 matches
  const selectedMatchIndices = selectBestMatches(dataFile.probabilities, GRID_MATCH_COUNT);
  
  // Calculate chaos-draw adjusted probabilities
  const matchProbs: Probability[] = selectedMatchIndices.map(matchIndex => {
    if (matchIndex >= dataFile.teams.length || !dataFile.teams[matchIndex]) {
      return [0.4, 0.35, 0.25] as Probability; // More draw-friendly default
    }
    
    const homeTeam = dataFile.teams[matchIndex]["1"];
    const awayTeam = dataFile.teams[matchIndex]["2"];
    const oddsIdx = matchIndex * 3;
    const odds: [number, number, number] = [
      dataFile.odds[oddsIdx] ?? 2.5,
      dataFile.odds[oddsIdx + 1] ?? 3.4,
      dataFile.odds[oddsIdx + 2] ?? 3.0,
    ];
    const impliedProbs = dataFile.probabilities[matchIndex] ?? [0.40, 0.30, 0.30] as Probability;
    
    return calculateChaosDrawProbs(
      homeTeam,
      awayTeam,
      odds,
      impliedProbs,
      dataFile.date,
      params
    );
  });
  
  // Generate diverse bets
  const bets: GridBet[] = [];
  const usedKeys = new Set<string>();
  
  // 1. Always include the calculated favorite bet
  const favBet = generateFavoriteBet(matchProbs);
  bets.push(favBet);
  usedKeys.add(favBet.predictions.join(","));
  
  // 2. Include some draw hunter bets (10% of bets)
  const drawHunterCount = Math.ceil(betsCount * 0.10);
  for (let i = 0; i < drawHunterCount && bets.length < betsCount; i++) {
    const bet = generateDrawHunterBet(matchProbs, random);
    const key = bet.predictions.join(",");
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      bets.push(bet);
    }
  }
  
  // 3. Include some upset hunter bets (8% of bets)
  const upsetHunterCount = Math.ceil(betsCount * 0.08);
  for (let i = 0; i < upsetHunterCount && bets.length < betsCount; i++) {
    const bet = generateUpsetHunterBet(matchProbs, random);
    const key = bet.predictions.join(",");
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      bets.push(bet);
    }
  }
  
  // 4. Fill the rest with probability-based bets with diversity
  let attempts = 0;
  while (bets.length < betsCount && attempts < betsCount * 30) {
    const bet = generateChaosBet(matchProbs, random, params.diversityFactor);
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
// EXPORTED STRATEGIES
// ============================================================================

/**
 * 🎲 CHAOS DRAW STRATEGY - Value Hunter
 * Finds value in draws and upsets by analyzing team chaos profiles
 */
export function chaosDrawStrategy(
  data: DataFileWithResult[],
  config: ChaosDrawConfig = {}
): GridBetsResult[] {
  const { betsCount = 50, seed = 42, params = {} } = config;
  const finalParams = { ...CHAOS_DRAW_PARAMS, ...params };
  
  return data.map(df => generateBets(df, betsCount, seed, finalParams));
}

/**
 * 🎯 DRAW FOCUSED STRATEGY - Maximum draw hunting
 * Very aggressive on draws when conditions are right
 */
export function drawFocusedStrategy(
  data: DataFileWithResult[],
  config: ChaosDrawConfig = {}
): GridBetsResult[] {
  const { betsCount = 50, seed = 42 } = config;
  const drawFocusedParams: ChaosDrawParams = {
    ...CHAOS_DRAW_PARAMS,
    drawBoostThreshold: 0.30,     // Lower threshold
    drawBoostMultiplier: 3.5,     // Higher boost
    drawBaseMultiplier: 0.9,      // Less penalty
    homeBaseBoost: 1.1,           // Less home bias
    minDrawOddsForBoost: 3.0,     // Target more draws
  };
  
  return data.map(df => generateBets(df, betsCount, seed, drawFocusedParams));
}

/**
 * ⚡ UPSET HUNTER STRATEGY - Targets away wins with value
 * Looks for undervalued away teams with upset potential
 */
export function upsetHunterStrategy(
  data: DataFileWithResult[],
  config: ChaosDrawConfig = {}
): GridBetsResult[] {
  const { betsCount = 50, seed = 42 } = config;
  const upsetParams: ChaosDrawParams = {
    ...CHAOS_DRAW_PARAMS,
    upsetBoostThreshold: 0.35,    // Lower threshold
    upsetBoostMultiplier: 2.2,    // Higher boost
    chaosThreshold: 0.45,         // More chaos tolerance
    homeBaseBoost: 1.0,           // No home bias
    minAwayOddsForUpset: 2.5,     // Target more upsets
  };
  
  return data.map(df => generateBets(df, betsCount, seed, upsetParams));
}

/**
 * 🌀 PURE CHAOS STRATEGY - Maximum unpredictability
 * For chaotic match days where anything can happen
 */
export function pureChaosStrategy(
  data: DataFileWithResult[],
  config: ChaosDrawConfig = {}
): GridBetsResult[] {
  const { betsCount = 50, seed = 42 } = config;
  const chaosParams: ChaosDrawParams = {
    ...CHAOS_DRAW_PARAMS,
    chaosThreshold: 0.40,
    drawBoostMultiplier: 2.2,
    upsetBoostMultiplier: 2.0,
    homeBaseBoost: 1.1,
    diversityFactor: 0.25,        // High diversity
  };
  
  return data.map(df => generateBets(df, betsCount, seed, chaosParams));
}

/**
 * 🎰 VALUE BALANCED STRATEGY - Balanced value seeking
 * Moderate approach finding value in all outcomes
 */
export function valueBalancedStrategy(
  data: DataFileWithResult[],
  config: ChaosDrawConfig = {}
): GridBetsResult[] {
  const { betsCount = 50, seed = 42 } = config;
  const balancedParams: ChaosDrawParams = {
    ...CHAOS_DRAW_PARAMS,
    drawBoostThreshold: 0.38,
    drawBoostMultiplier: 2.4,
    upsetBoostThreshold: 0.42,
    upsetBoostMultiplier: 1.6,
    homeBaseBoost: 1.4,
    diversityFactor: 0.12,
  };
  
  return data.map(df => generateBets(df, betsCount, seed, balancedParams));
}

