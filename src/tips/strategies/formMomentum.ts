import type { DataFileWithResult, Probability } from "../types";

/**
 * Team match data structure from team JSON files
 */
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

export type FormMomentumOptions = {
  /** Array of data files with results and probabilities */
  data: DataFileWithResult[];
  /** Team data files keyed by normalized team name */
  teamData: Record<string, TeamData>;
  /**
   * Factor to control how much form affects the odds.
   * - 0.1 = up to 10% odds adjustment
   * - 0.2 = up to 20% odds adjustment
   * Positive = trust form (good form → more likely to win)
   * Negative = expect regression (good form → bet against)
   * Default: 0.1
   */
  formFactor?: number;
};

/**
 * Normalize team name to match JSON file naming convention.
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\s+/g, "-")
    .replace(/\./g, "")
    .trim();
}

/**
 * Get matches before a specific date (up to N matches).
 */
function getMatchesBefore(
  matches: TeamMatch[],
  beforeDate: string,
  count: number
): TeamMatch[] {
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].date < beforeDate) {
      return matches.slice(i, i + count);
    }
  }
  return [];
}

/**
 * Calculate base strength for all teams using iterative refinement.
 *
 * This is similar to PageRank - a team's strength depends on:
 * 1. Their results (W/D/L)
 * 2. The strength of teams they played
 *
 * We iterate until strengths converge, giving us a more accurate
 * measure than simple win counting.
 */
function calculateTeamStrengths(
  teamData: Record<string, TeamData>,
  beforeDate: string,
  matchWindow: number = 15
): Map<string, number> {
  const teamKeys = Object.keys(teamData);

  // Initialize all teams with strength 50 (neutral)
  let strengths = new Map<string, number>();
  for (const key of teamKeys) {
    strengths.set(key, 50);
  }

  // Iterate to refine strengths (3 iterations is usually enough)
  for (let iter = 0; iter < 3; iter++) {
    const newStrengths = new Map<string, number>();

    for (const teamKey of teamKeys) {
      const matches = getMatchesBefore(
        teamData[teamKey]?.matches ?? [],
        beforeDate,
        matchWindow
      );

      if (matches.length === 0) {
        newStrengths.set(teamKey, 50);
        continue;
      }

      let totalPoints = 0;
      let totalWeight = 0;

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const opponentKey = normalizeTeamName(match.opponent);
        const opponentStrength = strengths.get(opponentKey) ?? 50;

        // Recency weight: exponential decay
        const recencyWeight = Math.pow(0.9, i);

        // Points based on result and opponent strength
        let points: number;
        if (match.result === "W") {
          // Win: gain points scaled by opponent strength
          // Beat strong team (80) = +80, beat weak team (30) = +30
          points = opponentStrength;
        } else if (match.result === "D") {
          // Draw: gain half of opponent strength
          points = opponentStrength * 0.5;
        } else {
          // Loss: lose points inversely scaled by opponent strength
          // Lose to strong team (80) = -20, lose to weak team (30) = -70
          points = -(100 - opponentStrength);
        }

        totalPoints += points * recencyWeight;
        totalWeight += recencyWeight;
      }

      // Normalize and clamp to 0-100 range
      const avgPoints = totalPoints / totalWeight;
      // Convert from roughly -100..+100 to 0..100
      const normalizedStrength = Math.max(
        0,
        Math.min(100, 50 + avgPoints * 0.5)
      );
      newStrengths.set(teamKey, normalizedStrength);
    }

    strengths = newStrengths;
  }

  return strengths;
}

/**
 * Calculate momentum: is the team improving or declining?
 * Compares last 3 matches to previous matches.
 * Returns value from -1 (declining) to +1 (improving)
 */
function calculateMomentum(
  matches: TeamMatch[],
  beforeDate: string,
  strengths: Map<string, number>
): number {
  const recentMatches = getMatchesBefore(matches, beforeDate, 10);
  if (recentMatches.length < 5) return 0;

  const getMatchScore = (match: TeamMatch): number => {
    const oppStrength = strengths.get(normalizeTeamName(match.opponent)) ?? 50;
    if (match.result === "W") return oppStrength;
    if (match.result === "D") return oppStrength * 0.3;
    return -(100 - oppStrength) * 0.5;
  };

  // Last 3 matches
  const recent3 = recentMatches.slice(0, 3);
  const recent3Score =
    recent3.reduce((sum, m) => sum + getMatchScore(m), 0) / 3;

  // Previous matches (4-10)
  const older = recentMatches.slice(3);
  if (older.length === 0) return 0;
  const olderScore =
    older.reduce((sum, m) => sum + getMatchScore(m), 0) / older.length;

  // Momentum = difference, normalized to roughly -1 to +1
  const rawMomentum = (recent3Score - olderScore) / 50;
  return Math.max(-1, Math.min(1, rawMomentum));
}

/**
 * Calculate home/away specific form.
 * Some teams are much stronger at home vs away.
 */
function calculateVenueForm(
  matches: TeamMatch[],
  beforeDate: string,
  isHome: boolean,
  strengths: Map<string, number>
): number {
  const recentMatches = getMatchesBefore(matches, beforeDate, 20);
  const venueMatches = recentMatches
    .filter((m) => m.isHome === isHome)
    .slice(0, 6);

  if (venueMatches.length < 2) return 0;

  let score = 0;
  for (const match of venueMatches) {
    const oppStrength = strengths.get(normalizeTeamName(match.opponent)) ?? 50;
    if (match.result === "W") {
      score += oppStrength / 100;
    } else if (match.result === "D") {
      score += (oppStrength / 100) * 0.3;
    } else {
      score -= ((100 - oppStrength) / 100) * 0.5;
    }
  }

  // Normalize by match count
  return score / venueMatches.length;
}

/**
 * Calculate comprehensive form rating combining:
 * 1. Base strength (iterative, opponent-quality-aware)
 * 2. Recent momentum (improving vs declining)
 * 3. Venue-specific form (home vs away)
 * 4. Goal difference trend
 */
function calculateFormRating(
  teamKey: string,
  matches: TeamMatch[],
  beforeDate: string,
  isHome: boolean,
  strengths: Map<string, number>
): number {
  const baseStrength = strengths.get(teamKey) ?? 50;

  // Get momentum bonus (-10 to +10)
  const momentum = calculateMomentum(matches, beforeDate, strengths);
  const momentumBonus = momentum * 10;

  // Get venue form bonus (-5 to +5)
  const venueForm = calculateVenueForm(matches, beforeDate, isHome, strengths);
  const venueBonus = venueForm * 5;

  // Goal difference trend from last 5 matches
  const recentMatches = getMatchesBefore(matches, beforeDate, 5);
  const avgGoalDiff =
    recentMatches.length > 0
      ? recentMatches.reduce(
          (sum, m) => sum + (m.goalsFor - m.goalsAgainst),
          0
        ) / recentMatches.length
      : 0;
  const goalBonus = Math.max(-5, Math.min(5, avgGoalDiff * 2));

  // Combine: base 0-100, bonuses can push to -20 to +120
  const totalRating = baseStrength + momentumBonus + venueBonus + goalBonus;

  return Math.max(0, Math.min(100, totalRating));
}

/**
 * Recalculates probabilities from odds.
 */
function calculateProbabilities(odds: number[]): Probability[] {
  const probabilities: Probability[] = [];
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

/**
 * Form Momentum Strategy v2
 *
 * Uses iterative strength calculation (like ELO/PageRank) to properly
 * value opponent quality. Key insight: beating a team that beats good
 * teams is worth more than beating a team that only beats weak teams.
 *
 * Components:
 * 1. Base Strength: Iteratively calculated from results against rated opponents
 * 2. Momentum: Is the team improving or declining? (last 3 vs previous 7)
 * 3. Venue Form: Home vs away specific performance
 * 4. Goal Trend: Recent goal difference
 *
 * The form rating is compared between teams to adjust odds:
 * - Higher rated team gets lower odds (more likely to win)
 * - Similar ratings push towards draw
 */
export function formMomentum({
  data,
  teamData,
  formFactor = 0.1,
}: FormMomentumOptions): DataFileWithResult[] {
  // Pre-calculate team strengths for each unique date
  const strengthsByDate = new Map<string, Map<string, number>>();

  const getStrengths = (date: string): Map<string, number> => {
    let strengths = strengthsByDate.get(date);
    if (!strengths) {
      strengths = calculateTeamStrengths(teamData, date);
      strengthsByDate.set(date, strengths);
    }
    return strengths;
  };

  return data.map((dataFile) => {
    const strengths = getStrengths(dataFile.date);
    const adjustedOdds: number[] = [];

    for (let i = 0; i < dataFile.teams.length; i++) {
      const homeTeam = dataFile.teams[i]["1"];
      const awayTeam = dataFile.teams[i]["2"];
      const oddsIndex = i * 3;

      const homeOdd = dataFile.odds[oddsIndex];
      const drawOdd = dataFile.odds[oddsIndex + 1];
      const awayOdd = dataFile.odds[oddsIndex + 2];

      const homeKey = normalizeTeamName(homeTeam);
      const awayKey = normalizeTeamName(awayTeam);

      const homeMatches = teamData[homeKey]?.matches ?? [];
      const awayMatches = teamData[awayKey]?.matches ?? [];

      // Calculate comprehensive form ratings (0-100)
      const homeRating = calculateFormRating(
        homeKey,
        homeMatches,
        dataFile.date,
        true,
        strengths
      );
      const awayRating = calculateFormRating(
        awayKey,
        awayMatches,
        dataFile.date,
        false,
        strengths
      );

      // Rating difference: positive = home is stronger
      // Range roughly -100 to +100, typically -40 to +40
      const ratingDiff = homeRating - awayRating;

      // Normalize to roughly -1 to +1
      const normalizedDiff = Math.max(-1, Math.min(1, ratingDiff / 40));

      // How evenly matched are they? (0 = identical, 1 = very different)
      const matchBalance = Math.abs(normalizedDiff);

      // Adjust odds:
      // - If home is rated higher (+), reduce home odds, increase away odds
      // - formFactor controls the magnitude
      const homeAdjustment = 1 - formFactor * normalizedDiff;
      const awayAdjustment = 1 + formFactor * normalizedDiff;

      // Draw adjustment: evenly matched teams = more likely draw
      // Reduce draw odds when teams are similar
      const drawAdjustment = 1 - formFactor * (1 - matchBalance) * 0.3;

      adjustedOdds.push(
        homeOdd * homeAdjustment,
        drawOdd * drawAdjustment,
        awayOdd * awayAdjustment
      );
    }

    const probabilities = calculateProbabilities(adjustedOdds);

    return {
      ...dataFile,
      odds: adjustedOdds,
      probabilities,
    };
  });
}

// ============================================================
// Preload team data at build time (Vite eager import)
// ============================================================

const teamModules = import.meta.glob<{ default: TeamData }>(
  "../../assets/data/teams/*.json",
  { eager: true }
);

/**
 * Pre-loaded team data indexed by normalized team name
 */
export const allTeamData: Record<string, TeamData> = Object.entries(
  teamModules
).reduce((acc, [path, module]) => {
  const filename = path.split("/").pop()?.replace(".json", "") ?? "";
  if (filename.includes("-all") || filename === "all-leagues") {
    return acc;
  }
  acc[filename] = module.default;
  return acc;
}, {} as Record<string, TeamData>);
