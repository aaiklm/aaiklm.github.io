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

export type DrawPropensityOptions = {
  /** Array of data files with results and probabilities */
  data: DataFileWithResult[];
  /** Team data files keyed by normalized team name */
  teamData: Record<string, TeamData>;
  /**
   * Multiplier for how aggressively to adjust based on draw rate.
   * - 1.0 = direct use of draw rate difference
   * - 2.0 = double the effect
   * - 3.0 = triple the effect
   * Default: 1.5
   */
  drawBiasFactor?: number;
  /**
   * Minimum matches required to consider draw propensity reliable.
   * If a team has fewer matches, we don't adjust for draws.
   * Default: 10
   */
  minMatchesRequired?: number;
  /**
   * Number of recent matches to analyze for draw propensity.
   * Default: 20
   */
  matchWindow?: number;
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
 * Calculate a team's draw propensity.
 * Returns { drawRate, isReliable, matchCount }
 */
function calculateDrawPropensity(
  matches: TeamMatch[],
  beforeDate: string,
  matchWindow: number,
  minMatchesRequired: number
): { drawRate: number; isReliable: boolean; matchCount: number } {
  const recentMatches = getMatchesBefore(matches, beforeDate, matchWindow);
  const matchCount = recentMatches.length;

  if (matchCount < minMatchesRequired) {
    return {
      drawRate: 0,
      isReliable: false,
      matchCount,
    };
  }

  const drawCount = recentMatches.filter((m) => m.result === "D").length;
  const drawRate = drawCount / matchCount;

  return {
    drawRate,
    isReliable: true,
    matchCount,
  };
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
 * Draw Propensity Strategy
 *
 * Key logic:
 * 1. Teams that draw a lot historically → more likely to draw
 * 2. Need minMatchesRequired matches of data to trust the pattern
 * 3. If not enough data → NO adjustment (we don't know either way)
 * 4. Both teams draw-prone → even stronger draw signal
 *
 * How it works:
 * - Calculate each team's draw rate from recent matches
 * - Compare to baseline (25% is average)
 * - Adjust draw probability based on deviation from baseline
 * - drawBiasFactor controls how aggressively we act on this signal
 */
export function drawPropensity({
  data,
  teamData,
  drawBiasFactor = 1.5,
  minMatchesRequired = 10,
  matchWindow = 20,
}: DrawPropensityOptions): DataFileWithResult[] {
  const BASELINE_DRAW_RATE = 0.25; // Expected average draw rate

  // Cache for draw propensity calculations
  const propensityCache = new Map<
    string,
    { drawRate: number; isReliable: boolean; matchCount: number }
  >();

  const getPropensity = (teamKey: string, date: string) => {
    const cacheKey = `${teamKey}:${date}`;
    let propensity = propensityCache.get(cacheKey);
    if (!propensity) {
      const matches = teamData[teamKey]?.matches ?? [];
      propensity = calculateDrawPropensity(
        matches,
        date,
        matchWindow,
        minMatchesRequired
      );
      propensityCache.set(cacheKey, propensity);
    }
    return propensity;
  };

  return data.map((dataFile) => {
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

      const homePropensity = getPropensity(homeKey, dataFile.date);
      const awayPropensity = getPropensity(awayKey, dataFile.date);

      let newHomeOdd = homeOdd;
      let newDrawOdd = drawOdd;
      let newAwayOdd = awayOdd;

      // Only adjust if we have reliable data for at least one team
      const homeHasData = homePropensity.isReliable;
      const awayHasData = awayPropensity.isReliable;

      if (homeHasData || awayHasData) {
        // Use actual draw rate if reliable, otherwise use baseline
        const homeDrawRate = homeHasData
          ? homePropensity.drawRate
          : BASELINE_DRAW_RATE;
        const awayDrawRate = awayHasData
          ? awayPropensity.drawRate
          : BASELINE_DRAW_RATE;

        // Combined draw rate from both teams
        const combinedDrawRate = (homeDrawRate + awayDrawRate) / 2;

        // Deviation from baseline: positive = more draws than normal
        // e.g., 0.35 combined rate vs 0.25 baseline = +0.10 deviation
        const drawDeviation = combinedDrawRate - BASELINE_DRAW_RATE;

        // Apply the bias factor
        // drawDeviation of 0.10 with factor 2.0 = 0.20 (20%) adjustment
        const adjustmentStrength = drawDeviation * drawBiasFactor;

        // Convert to odds multiplier:
        // Positive deviation (more draws) → lower draw odds → multiply by (1 - adjustment)
        // Negative deviation (fewer draws) → higher draw odds → multiply by (1 + |adjustment|)
        //
        // BUT: Only penalize low draw rate if BOTH teams have reliable data
        // (can't assume low draws from insufficient data)
        let drawMultiplier = 1.0;

        if (drawDeviation > 0) {
          // Teams draw more than average → make draw more likely
          // Cap at 0.5 to avoid extreme odds
          drawMultiplier = Math.max(0.5, 1 - adjustmentStrength);
        } else if (drawDeviation < 0 && homeHasData && awayHasData) {
          // Both teams draw less than average → make draw less likely
          // Only apply if we have data for BOTH teams
          // Cap at 1.5 to avoid extreme odds
          drawMultiplier = Math.min(1.5, 1 - adjustmentStrength);
        }

        // Apply draw adjustment
        newDrawOdd = drawOdd * drawMultiplier;

        // Compensate home/away to keep probability distribution sensible
        // If draw becomes more likely, home/away become proportionally less likely
        if (drawMultiplier !== 1.0) {
          // Calculate how much probability mass moved
          const originalDrawProb = 1 / drawOdd;
          const newDrawProb = 1 / newDrawOdd;
          const probShift = newDrawProb - originalDrawProb;

          // Distribute the shift to home/away proportionally
          const homeProb = 1 / homeOdd;
          const awayProb = 1 / awayOdd;
          const totalHomeAway = homeProb + awayProb;

          const homeShare = homeProb / totalHomeAway;
          const awayShare = awayProb / totalHomeAway;

          const newHomeProb = Math.max(0.05, homeProb - probShift * homeShare);
          const newAwayProb = Math.max(0.05, awayProb - probShift * awayShare);

          newHomeOdd = 1 / newHomeProb;
          newAwayOdd = 1 / newAwayProb;
        }
      }

      adjustedOdds.push(newHomeOdd, newDrawOdd, newAwayOdd);
    }

    const probabilities = calculateProbabilities(adjustedOdds);

    return {
      ...dataFile,
      odds: adjustedOdds,
      probabilities,
    };
  });
}
