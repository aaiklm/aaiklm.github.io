/**
 * ML Strategy Types
 * 
 * Types for the machine learning-inspired betting strategy that learns
 * from historical data to calibrate probabilities and optimize bets.
 */

import type { DataFileWithResult, GridBet, GridBetsResult, Outcome, Probability } from "../types";

/**
 * A calibration bucket for a specific probability range
 */
export type CalibrationBucket = {
  /** Lower bound of the probability range (inclusive) */
  lower: number;
  /** Upper bound of the probability range (exclusive) */
  upper: number;
  /** Number of predictions in this bucket */
  count: number;
  /** Number of correct predictions */
  correct: number;
  /** Observed hit rate (correct / count) */
  hitRate: number;
  /** Calibration factor: hitRate / midpoint of range */
  calibrationFactor: number;
};

/**
 * Complete calibration data learned from historical results
 */
export type CalibrationData = {
  /** Calibration buckets for home wins */
  homeBuckets: CalibrationBucket[];
  /** Calibration buckets for draws */
  drawBuckets: CalibrationBucket[];
  /** Calibration buckets for away wins */
  awayBuckets: CalibrationBucket[];
  /** Total matches analyzed */
  totalMatches: number;
  /** Last date included in calibration */
  lastDate: string;
};

/**
 * Calibrated probabilities for a single match
 */
export type CalibratedProbabilities = {
  /** Original probabilities from odds */
  original: Probability;
  /** Calibrated probabilities based on historical data */
  calibrated: Probability;
  /** Expected value for each outcome: (calibrated prob * odds) */
  expectedValue: [number, number, number];
  /** Confidence score (0-1) based on sample size in calibration */
  confidence: number;
};

/**
 * Match features extracted for analysis
 */
export type MatchFeatures = {
  /** Original match index in the data */
  matchIndex: number;
  /** Team names */
  homeTeam: string;
  awayTeam: string;
  /** Original odds [home, draw, away] */
  odds: [number, number, number];
  /** Implied probabilities from odds */
  impliedProbs: Probability;
  /** Calibrated probabilities */
  calibratedProbs: Probability;
  /** Expected value for betting each outcome */
  expectedValue: [number, number, number];
  /** Best outcome to bet on based on EV */
  bestOutcome: Outcome;
  /** EV of the best outcome */
  bestEV: number;
  /** Entropy of probability distribution (higher = more uncertain) */
  entropy: number;
  /** Maximum probability (confidence in most likely outcome) */
  maxProb: number;
};

/**
 * A scored bet combination for ranking
 */
export type ScoredBet = {
  /** The grid bet */
  bet: GridBet;
  /** Expected value score */
  evScore: number;
  /** Probability of hitting at least 1 line */
  lineProbability: number;
  /** Unique key for deduplication */
  key: string;
};

/**
 * Configuration for the ML strategy
 */
export type MLStrategyConfig = {
  /** Number of bets to generate per round */
  betsCount?: number;
  /** Optional seed for reproducible results */
  seed?: number;
  /** Minimum sample size for calibration bucket to be used */
  minSampleSize?: number;
  /** Number of calibration buckets per outcome */
  bucketCount?: number;
  /** Weight for expected value vs probability in scoring */
  evWeight?: number;
  /** How much to favor diversity in bet selection */
  diversityBonus?: number;
};

/**
 * Strategy function type
 */
export type MLStrategy = (
  data: DataFileWithResult[],
  config?: MLStrategyConfig
) => GridBetsResult[];

/**
 * Historical match with outcome for calibration
 */
export type HistoricalMatch = {
  date: string;
  matchIndex: number;
  homeTeam: string;
  awayTeam: string;
  odds: [number, number, number];
  impliedProbs: Probability;
  actualOutcome: Outcome;
};

