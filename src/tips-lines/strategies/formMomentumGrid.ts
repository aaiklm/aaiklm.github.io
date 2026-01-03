import type { DataFileWithResult, GridBetsResult, GridStrategyConfig } from "../types";
import { randomGridStrategy } from "./baseGridStrategy";

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

type Probability = [number, number, number];

export type FormMomentumGridOptions = GridStrategyConfig & {
  /** Team data files keyed by normalized team name */
  teamData: Record<string, TeamData>;
  /**
   * Factor to control how much form affects the odds.
   * Higher values = stronger adjustments based on form.
   * Default: 2.0
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
 * Calculate team strength from recent matches using iterative refinement.
 */
function calculateTeamStrengths(
  teamData: Record<string, TeamData>,
  beforeDate: string,
  matchWindow: number = 15
): Map<string, number> {
  const teamKeys = Object.keys(teamData);
  let strengths = new Map<string, number>();

  for (const key of teamKeys) {
    strengths.set(key, 50);
  }

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
        const recencyWeight = Math.pow(0.9, i);

        let points: number;
        if (match.result === "W") {
          points = opponentStrength;
        } else if (match.result === "D") {
          points = opponentStrength * 0.5;
        } else {
          points = -(100 - opponentStrength);
        }

        totalPoints += points * recencyWeight;
        totalWeight += recencyWeight;
      }

      const avgPoints = totalPoints / totalWeight;
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

  const recent3 = recentMatches.slice(0, 3);
  const recent3Score =
    recent3.reduce((sum, m) => sum + getMatchScore(m), 0) / 3;

  const older = recentMatches.slice(3);
  if (older.length === 0) return 0;
  const olderScore =
    older.reduce((sum, m) => sum + getMatchScore(m), 0) / older.length;

  const rawMomentum = (recent3Score - olderScore) / 50;
  return Math.max(-1, Math.min(1, rawMomentum));
}

/**
 * Calculate venue-specific form (home vs away).
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

  return score / venueMatches.length;
}

/**
 * Calculate comprehensive form rating.
 */
function calculateFormRating(
  teamKey: string,
  matches: TeamMatch[],
  beforeDate: string,
  isHome: boolean,
  strengths: Map<string, number>
): number {
  const baseStrength = strengths.get(teamKey) ?? 50;
  const momentum = calculateMomentum(matches, beforeDate, strengths);
  const momentumBonus = momentum * 10;
  const venueForm = calculateVenueForm(matches, beforeDate, isHome, strengths);
  const venueBonus = venueForm * 5;

  const recentMatches = getMatchesBefore(matches, beforeDate, 5);
  const avgGoalDiff =
    recentMatches.length > 0
      ? recentMatches.reduce(
          (sum, m) => sum + (m.goalsFor - m.goalsAgainst),
          0
        ) / recentMatches.length
      : 0;
  const goalBonus = Math.max(-5, Math.min(5, avgGoalDiff * 2));

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
 * Form Momentum Strategy for Grid Bets
 * 
 * Uses historical team performance data to adjust probabilities
 * before generating grid bets. Considers:
 * - Base team strength (iterative calculation)
 * - Recent momentum (improving vs declining)
 * - Venue-specific form (home vs away)
 * - Goal difference trends
 */
export function formMomentumGridStrategy(
  data: DataFileWithResult[],
  options: FormMomentumGridOptions
): GridBetsResult[] {
  const { teamData, formFactor = 2.0, ...config } = options;

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

  // Adjust probabilities based on form
  const adjustedData = data.map((dataFile) => {
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

      const ratingDiff = homeRating - awayRating;
      const normalizedDiff = Math.max(-1, Math.min(1, ratingDiff / 40));
      const matchBalance = Math.abs(normalizedDiff);

      const factor = formFactor * 0.1;
      const homeAdjustment = 1 - factor * normalizedDiff;
      const awayAdjustment = 1 + factor * normalizedDiff;
      const drawAdjustment = 1 - factor * (1 - matchBalance) * 0.3;

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

  return randomGridStrategy(adjustedData, config);
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

