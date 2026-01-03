/**
 * Feature Extraction Module
 * 
 * Extracts and computes features for each match that are useful for betting decisions.
 */

import type { DataFileWithResult, Outcome, Probability } from "../types";
import type { CalibrationData, MatchFeatures } from "./types";
import { calibrateProbabilities, calculateExpectedValue } from "./calibration";

/**
 * Calculates Shannon entropy of a probability distribution
 * Higher entropy = more uncertainty
 */
export function calculateEntropy(probs: Probability): number {
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * Finds the best outcome based on expected value
 */
function findBestOutcome(ev: [number, number, number]): Outcome {
  const maxIdx = ev.indexOf(Math.max(...ev));
  return (["1", "X", "2"] as Outcome[])[maxIdx];
}

/**
 * Extracts features for all matches in a data file
 */
export function extractMatchFeatures(
  dataFile: DataFileWithResult,
  calibration: CalibrationData
): MatchFeatures[] {
  const features: MatchFeatures[] = [];
  
  for (let i = 0; i < dataFile.teams.length; i++) {
    const homeTeam = dataFile.teams[i]["1"];
    const awayTeam = dataFile.teams[i]["2"];
    
    // Get odds
    const oddsIndex = i * 3;
    const odds: [number, number, number] = [
      dataFile.odds[oddsIndex],
      dataFile.odds[oddsIndex + 1],
      dataFile.odds[oddsIndex + 2],
    ];
    
    // Calculate implied probabilities
    const rawProbs = odds.map(o => 1 / o);
    const sum = rawProbs.reduce((a, b) => a + b, 0);
    const impliedProbs: Probability = [
      rawProbs[0] / sum,
      rawProbs[1] / sum,
      rawProbs[2] / sum,
    ];
    
    // Apply calibration to get adjusted probabilities
    const calibratedProbs = calibrateProbabilities(impliedProbs, calibration);
    
    // Calculate expected value for each outcome
    const expectedValue = calculateExpectedValue(calibratedProbs, odds);
    
    // Find best outcome
    const bestOutcome = findBestOutcome(expectedValue);
    const bestEV = Math.max(...expectedValue);
    
    // Calculate entropy (uncertainty)
    const entropy = calculateEntropy(calibratedProbs);
    
    // Maximum probability (confidence)
    const maxProb = Math.max(...calibratedProbs);
    
    features.push({
      matchIndex: i,
      homeTeam,
      awayTeam,
      odds,
      impliedProbs,
      calibratedProbs,
      expectedValue,
      bestOutcome,
      bestEV,
      entropy,
      maxProb,
    });
  }
  
  return features;
}

/**
 * Ranks matches by betting value
 * Uses a combination of expected value and confidence
 */
export function rankMatchesByValue(features: MatchFeatures[]): MatchFeatures[] {
  return [...features].sort((a, b) => {
    // Primary: Best expected value
    const evDiff = b.bestEV - a.bestEV;
    if (Math.abs(evDiff) > 0.01) return evDiff;
    
    // Secondary: Lower entropy (more predictable)
    return a.entropy - b.entropy;
  });
}

/**
 * Selects the top N matches for the grid based on various criteria
 */
export function selectGridMatches(
  features: MatchFeatures[],
  count: number = 9
): MatchFeatures[] {
  // Strategy: Mix of high EV and high confidence matches
  const sorted = [...features].sort((a, b) => {
    // Combined score: EV + confidence bonus
    const scoreA = a.bestEV + a.maxProb * 0.1;
    const scoreB = b.bestEV + b.maxProb * 0.1;
    return scoreB - scoreA;
  });
  
  return sorted.slice(0, count);
}

/**
 * For a given match, returns probabilities for selecting each outcome
 * Biased towards outcomes with positive expected value
 */
export function getOutcomeSelectionProbs(
  features: MatchFeatures,
  evWeight: number = 0.5
): Probability {
  const { calibratedProbs, expectedValue } = features;
  
  // Base probabilities from calibration
  const baseProbs = [...calibratedProbs] as [number, number, number];
  
  // EV-boosted probabilities (favor positive EV outcomes)
  const evBoost = expectedValue.map(ev => Math.max(0, ev + 0.5));
  const evSum = evBoost.reduce((a, b) => a + b, 0);
  const evProbs = evSum > 0 
    ? evBoost.map(e => e / evSum) as [number, number, number]
    : baseProbs;
  
  // Blend base and EV-boosted probabilities
  const blended: Probability = [
    baseProbs[0] * (1 - evWeight) + evProbs[0] * evWeight,
    baseProbs[1] * (1 - evWeight) + evProbs[1] * evWeight,
    baseProbs[2] * (1 - evWeight) + evProbs[2] * evWeight,
  ];
  
  // Normalize
  const sum = blended.reduce((a, b) => a + b, 0);
  return [blended[0] / sum, blended[1] / sum, blended[2] / sum];
}

