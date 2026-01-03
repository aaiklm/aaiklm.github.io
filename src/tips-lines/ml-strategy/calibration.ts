/**
 * Calibration Module
 * 
 * Learns how well bookmaker odds predict actual outcomes.
 * Uses only historical data (before the target date) to avoid data leakage.
 * 
 * Key insight: Bookmaker odds often have systematic biases:
 * - Favorites may be undervalued (public loves betting underdogs)
 * - Draws are often underestimated in certain probability ranges
 * - Away wins at certain odds may hit more/less than expected
 */

import type { DataFileWithResult, Probability } from "../types";
import type { CalibrationBucket, CalibrationData, HistoricalMatch } from "./types";
import { resultToOutcome } from "../utils/selectOutcome";

const DEFAULT_BUCKET_COUNT = 10;
const MIN_SAMPLE_SIZE = 5;

/**
 * Creates calibration buckets for a probability range [0, 1]
 */
function createEmptyBuckets(count: number): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [];
  const step = 1 / count;
  
  for (let i = 0; i < count; i++) {
    buckets.push({
      lower: i * step,
      upper: (i + 1) * step,
      count: 0,
      correct: 0,
      hitRate: 0,
      calibrationFactor: 1,
    });
  }
  
  return buckets;
}

/**
 * Finds the bucket index for a probability value
 */
function findBucketIndex(prob: number, bucketCount: number): number {
  const index = Math.floor(prob * bucketCount);
  return Math.min(index, bucketCount - 1);
}

/**
 * Extracts all historical matches from data files before a given date
 */
export function extractHistoricalMatches(
  data: DataFileWithResult[],
  beforeDate: string
): HistoricalMatch[] {
  const matches: HistoricalMatch[] = [];
  
  for (const dataFile of data) {
    // Only use data from before the target date
    if (dataFile.date >= beforeDate) continue;
    
    for (let i = 0; i < dataFile.teams.length; i++) {
      // Get result character
      const resultChar = dataFile.result[i];
      if (resultChar === undefined) continue;
      
      const actualOutcome = resultToOutcome(resultChar);
      const homeTeam = dataFile.teams[i]["1"];
      const awayTeam = dataFile.teams[i]["2"];
      
      // Get odds for this match
      const oddsIndex = i * 3;
      const odds: [number, number, number] = [
        dataFile.odds[oddsIndex],
        dataFile.odds[oddsIndex + 1],
        dataFile.odds[oddsIndex + 2],
      ];
      
      // Calculate implied probabilities (normalized)
      const rawProbs = odds.map(o => 1 / o);
      const sum = rawProbs.reduce((a, b) => a + b, 0);
      const impliedProbs: Probability = [
        rawProbs[0] / sum,
        rawProbs[1] / sum,
        rawProbs[2] / sum,
      ];
      
      matches.push({
        date: dataFile.date,
        matchIndex: i,
        homeTeam,
        awayTeam,
        odds,
        impliedProbs,
        actualOutcome,
      });
    }
  }
  
  return matches;
}

/**
 * Builds calibration data from historical matches
 */
export function buildCalibration(
  historicalMatches: HistoricalMatch[],
  bucketCount: number = DEFAULT_BUCKET_COUNT,
  minSampleSize: number = MIN_SAMPLE_SIZE
): CalibrationData {
  const homeBuckets = createEmptyBuckets(bucketCount);
  const drawBuckets = createEmptyBuckets(bucketCount);
  const awayBuckets = createEmptyBuckets(bucketCount);
  
  // Populate buckets with historical data
  for (const match of historicalMatches) {
    const [homeProb, drawProb, awayProb] = match.impliedProbs;
    
    // Home win
    const homeIdx = findBucketIndex(homeProb, bucketCount);
    homeBuckets[homeIdx].count++;
    if (match.actualOutcome === "1") {
      homeBuckets[homeIdx].correct++;
    }
    
    // Draw
    const drawIdx = findBucketIndex(drawProb, bucketCount);
    drawBuckets[drawIdx].count++;
    if (match.actualOutcome === "X") {
      drawBuckets[drawIdx].correct++;
    }
    
    // Away win
    const awayIdx = findBucketIndex(awayProb, bucketCount);
    awayBuckets[awayIdx].count++;
    if (match.actualOutcome === "2") {
      awayBuckets[awayIdx].correct++;
    }
  }
  
  // Calculate hit rates and calibration factors
  const finalizeBuckets = (buckets: CalibrationBucket[]) => {
    for (const bucket of buckets) {
      if (bucket.count >= minSampleSize) {
        bucket.hitRate = bucket.correct / bucket.count;
        const midpoint = (bucket.lower + bucket.upper) / 2;
        bucket.calibrationFactor = midpoint > 0 ? bucket.hitRate / midpoint : 1;
      } else {
        // Not enough data, assume odds are accurate
        bucket.hitRate = (bucket.lower + bucket.upper) / 2;
        bucket.calibrationFactor = 1;
      }
    }
  };
  
  finalizeBuckets(homeBuckets);
  finalizeBuckets(drawBuckets);
  finalizeBuckets(awayBuckets);
  
  return {
    homeBuckets,
    drawBuckets,
    awayBuckets,
    totalMatches: historicalMatches.length,
    lastDate: historicalMatches.length > 0 
      ? historicalMatches[historicalMatches.length - 1].date 
      : "",
  };
}

/**
 * Applies calibration to adjust probabilities based on historical performance
 */
export function calibrateProbabilities(
  impliedProbs: Probability,
  calibration: CalibrationData
): Probability {
  const bucketCount = calibration.homeBuckets.length;
  
  const homeIdx = findBucketIndex(impliedProbs[0], bucketCount);
  const drawIdx = findBucketIndex(impliedProbs[1], bucketCount);
  const awayIdx = findBucketIndex(impliedProbs[2], bucketCount);
  
  // Get calibration factors (how much does actual hit rate differ from expected)
  const homeFactor = calibration.homeBuckets[homeIdx].calibrationFactor;
  const drawFactor = calibration.drawBuckets[drawIdx].calibrationFactor;
  const awayFactor = calibration.awayBuckets[awayIdx].calibrationFactor;
  
  // Apply calibration
  const rawCalibrated = [
    impliedProbs[0] * homeFactor,
    impliedProbs[1] * drawFactor,
    impliedProbs[2] * awayFactor,
  ];
  
  // Normalize to sum to 1
  const sum = rawCalibrated.reduce((a, b) => a + b, 0);
  
  return [
    rawCalibrated[0] / sum,
    rawCalibrated[1] / sum,
    rawCalibrated[2] / sum,
  ];
}

/**
 * Calculates expected value for betting each outcome
 * EV = (probability of winning × odds) - 1
 * Positive EV means profitable bet in the long run
 */
export function calculateExpectedValue(
  calibratedProbs: Probability,
  odds: [number, number, number]
): [number, number, number] {
  return [
    calibratedProbs[0] * odds[0] - 1,
    calibratedProbs[1] * odds[1] - 1,
    calibratedProbs[2] * odds[2] - 1,
  ];
}

/**
 * Gets the confidence score based on sample sizes in calibration buckets
 */
export function getConfidence(
  impliedProbs: Probability,
  calibration: CalibrationData,
  minSampleSize: number = MIN_SAMPLE_SIZE
): number {
  const bucketCount = calibration.homeBuckets.length;
  
  const homeIdx = findBucketIndex(impliedProbs[0], bucketCount);
  const drawIdx = findBucketIndex(impliedProbs[1], bucketCount);
  const awayIdx = findBucketIndex(impliedProbs[2], bucketCount);
  
  const counts = [
    calibration.homeBuckets[homeIdx].count,
    calibration.drawBuckets[drawIdx].count,
    calibration.awayBuckets[awayIdx].count,
  ];
  
  // Average confidence based on sample sizes
  const avgCount = counts.reduce((a, b) => a + b, 0) / 3;
  
  // Sigmoid-like scaling: reaches ~0.9 confidence at 100 samples
  return 1 - Math.exp(-avgCount / (minSampleSize * 10));
}

/**
 * Builds incremental calibration for a specific date
 * Uses all data before that date
 */
export function buildCalibrationForDate(
  allData: DataFileWithResult[],
  targetDate: string,
  bucketCount: number = DEFAULT_BUCKET_COUNT
): CalibrationData {
  const historicalMatches = extractHistoricalMatches(allData, targetDate);
  return buildCalibration(historicalMatches, bucketCount);
}

/**
 * Pre-compute calibrations for all dates (for efficiency)
 */
export function precomputeCalibrations(
  data: DataFileWithResult[],
  bucketCount: number = DEFAULT_BUCKET_COUNT
): Map<string, CalibrationData> {
  const calibrations = new Map<string, CalibrationData>();
  
  // Sort data by date
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
  
  // Incrementally build calibrations
  const allMatches: HistoricalMatch[] = [];
  
  for (const dataFile of sortedData) {
    // Build calibration using all data BEFORE this date
    const calibration = buildCalibration(allMatches, bucketCount);
    calibrations.set(dataFile.date, calibration);
    
    // Add this date's matches for future calibrations
    for (let i = 0; i < dataFile.teams.length; i++) {
      const resultChar = dataFile.result[i];
      if (resultChar === undefined) continue;
      
      const actualOutcome = resultToOutcome(resultChar);
      const oddsIndex = i * 3;
      const odds: [number, number, number] = [
        dataFile.odds[oddsIndex],
        dataFile.odds[oddsIndex + 1],
        dataFile.odds[oddsIndex + 2],
      ];
      
      const rawProbs = odds.map(o => 1 / o);
      const sum = rawProbs.reduce((a, b) => a + b, 0);
      const impliedProbs: Probability = [
        rawProbs[0] / sum,
        rawProbs[1] / sum,
        rawProbs[2] / sum,
      ];
      
      allMatches.push({
        date: dataFile.date,
        matchIndex: i,
        homeTeam: dataFile.teams[i]["1"],
        awayTeam: dataFile.teams[i]["2"],
        odds,
        impliedProbs,
        actualOutcome,
      });
    }
  }
  
  return calibrations;
}

