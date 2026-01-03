#!/usr/bin/env node
/**
 * Add Lines to Data File
 *
 * Uses the CONTRARIAN VALUE STRATEGY (tuned for +30.88% ROI)
 *
 * Key innovations:
 * - Edge Detection: Calculate difference between our estimate and implied odds
 * - Form Regression: Recent form regresses toward historical average
 * - Draw Pattern Recognition: Identify specific patterns that precede draws
 *
 * Optimal parameters found by testing 174,960 configurations:
 *   homeBaseBoost: 1.7
 *   drawBasePenalty: 0.35
 *   awayBasePenalty: 0.9
 *   edgeMultiplier: 12
 *   regressionFactor: 0.35
 *
 * Usage: node scripts/addLinesToFile.mjs <filename>
 * Example: node scripts/addLinesToFile.mjs 2025-08-23
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../src/assets/data");
const TEAMS_DIR = join(DATA_DIR, "teams");

// ============================================================================
// GRID CONSTANTS
// ============================================================================

const GRID_SIZE = 3;
const GRID_MATCH_COUNT = 9;

// Column positions in the 3x3 grid
const COL1 = [0, 3, 6]; // Left column
const COL2 = [1, 4, 7]; // Middle column
const COL3 = [2, 5, 8]; // Right column

// ============================================================================
// OPTIMAL PARAMETERS - Contrarian Value Strategy (+30.88% ROI)
// ============================================================================

const CONTRARIAN_VALUE_PARAMS = {
  homeBaseBoost: 1.7,
  drawBasePenalty: 0.35,
  awayBasePenalty: 0.9,
  edgeMultiplier: 12,
  minEdgeForBoost: 0.003,
  drawPatternThreshold: 0.03,
  drawPatternMultiplier: 7,
  minDrawOddsForBoost: 2.4,
  minAwayOddsForValue: 1.4,
  regressionFactor: 0.35,
};

// ============================================================================
// TEAM DATA LOADING
// ============================================================================

const allTeamData = {};
const teamFiles = readdirSync(TEAMS_DIR).filter((f) => f.endsWith(".json"));
for (const file of teamFiles) {
  const filename = file.replace(".json", "");
  if (filename.includes("-all") || filename === "all-leagues") continue;
  try {
    const content = JSON.parse(readFileSync(join(TEAMS_DIR, file), "utf-8"));
    allTeamData[filename] = content;
  } catch (err) {
    // Skip files that can't be parsed
  }
}

console.log(`📚 Loaded ${Object.keys(allTeamData).length} team data files\n`);

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

// ============================================================================
// PROBABILITY CALCULATIONS
// ============================================================================

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

function selectBestMatches(probabilities, count = GRID_MATCH_COUNT) {
  const ranked = probabilities
    .map((probs, index) => ({
      index,
      confidence: Math.max(...probs),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return ranked.slice(0, count).map((m) => m.index);
}

// ============================================================================
// TEAM ANALYSIS FUNCTIONS
// ============================================================================

function getTeamDrawRate(teamName, beforeDate, count = 20) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, count);
  if (matches.length < 5) return 0.28; // League average
  return matches.filter((m) => m.result === "D").length / matches.length;
}

function getVenueWinRate(teamName, isHome, beforeDate, count = 15) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, count);
  const venueMatches = matches.filter((m) => m.isHome === isHome);
  if (venueMatches.length < 3) return isHome ? 0.46 : 0.28;
  return (
    venueMatches.filter((m) => m.result === "W").length / venueMatches.length
  );
}

function getRecentForm(teamName, beforeDate, window = 10) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, window);
  if (matches.length < 3) return 0.5;

  let score = 0,
    weight = 0;
  for (let i = 0; i < matches.length; i++) {
    const w = Math.pow(0.75, i);
    const points =
      matches[i].result === "W" ? 1 : matches[i].result === "D" ? 0.33 : 0;
    score += points * w;
    weight += w;
  }
  return score / weight;
}

function getHistoricalAverageForm(teamName, beforeDate) {
  const teamData = getTeamData(teamName);
  const matches = getMatchesBefore(teamData, beforeDate, 50);
  if (matches.length < 10) return 0.5;
  return matches.filter((m) => m.result === "W").length / matches.length;
}

function getRegressionAdjustedForm(teamName, beforeDate, regressionFactor) {
  const recent = getRecentForm(teamName, beforeDate, 8);
  const historical = getHistoricalAverageForm(teamName, beforeDate);
  return recent * (1 - regressionFactor) + historical * regressionFactor;
}

// ============================================================================
// EDGE DETECTION
// ============================================================================

function calculateEdge(homeTeam, awayTeam, impliedProbs, matchDate, params) {
  const homeForm = getRegressionAdjustedForm(
    homeTeam,
    matchDate,
    params.regressionFactor
  );
  const awayForm = getRegressionAdjustedForm(
    awayTeam,
    matchDate,
    params.regressionFactor
  );
  const homeVenueRate = getVenueWinRate(homeTeam, true, matchDate);
  const awayVenueRate = getVenueWinRate(awayTeam, false, matchDate);
  const homeDrawRate = getTeamDrawRate(homeTeam, matchDate);
  const awayDrawRate = getTeamDrawRate(awayTeam, matchDate);

  // Blend form and venue data
  const estHomeWin = homeForm * 0.4 + homeVenueRate * 0.6;
  const estAwayWin = awayForm * 0.4 + awayVenueRate * 0.6;

  // Draw estimate
  const combinedDrawRate = (homeDrawRate + awayDrawRate) / 2;
  const formDiff = Math.abs(homeForm - awayForm);
  const formSimilarityBonus =
    formDiff < 0.15 ? 0.08 : formDiff < 0.25 ? 0.03 : 0;
  const estDraw = combinedDrawRate + formSimilarityBonus;

  // Normalize
  const total = estHomeWin + estDraw + estAwayWin;

  return {
    homeEdge: estHomeWin / total - impliedProbs[0],
    drawEdge: estDraw / total - impliedProbs[1],
    awayEdge: estAwayWin / total - impliedProbs[2],
  };
}

// ============================================================================
// DRAW PATTERN RECOGNITION
// ============================================================================

function getDrawPatternSignal(homeTeam, awayTeam, odds, matchDate) {
  let signal = 0;

  // Pattern 1: Both teams have high draw rates
  const homeDrawRate = getTeamDrawRate(homeTeam, matchDate, 12);
  const awayDrawRate = getTeamDrawRate(awayTeam, matchDate, 12);
  if (homeDrawRate > 0.3 && awayDrawRate > 0.3) signal += 0.12;
  else if (homeDrawRate > 0.28 && awayDrawRate > 0.28) signal += 0.06;

  // Pattern 2: Very similar recent form
  const homeForm = getRecentForm(homeTeam, matchDate, 6);
  const awayForm = getRecentForm(awayTeam, matchDate, 6);
  const formDiff = Math.abs(homeForm - awayForm);
  if (formDiff < 0.1) signal += 0.08;
  else if (formDiff < 0.18) signal += 0.04;

  // Pattern 3: Draw odds are generous
  if (odds[1] >= 3.6) signal += 0.06;
  else if (odds[1] >= 3.4) signal += 0.03;

  // Pattern 4: Both teams have recent draws
  const homeTeamData = getTeamData(homeTeam);
  const awayTeamData = getTeamData(awayTeam);
  const homeRecent = getMatchesBefore(homeTeamData, matchDate, 4);
  const awayRecent = getMatchesBefore(awayTeamData, matchDate, 4);
  const homeRecentDraws = homeRecent.filter((m) => m.result === "D").length;
  const awayRecentDraws = awayRecent.filter((m) => m.result === "D").length;
  if (homeRecentDraws >= 2 && awayRecentDraws >= 2) signal += 0.1;
  else if (homeRecentDraws >= 1 && awayRecentDraws >= 1) signal += 0.04;

  return Math.min(signal, 0.3);
}

// ============================================================================
// CONTRARIAN VALUE PROBABILITY CALCULATION
// ============================================================================

function calculateContrarianProbs(
  homeTeam,
  awayTeam,
  odds,
  impliedProbs,
  matchDate,
  params
) {
  // Get edge values
  const edge = calculateEdge(
    homeTeam,
    awayTeam,
    impliedProbs,
    matchDate,
    params
  );
  const drawPattern = getDrawPatternSignal(homeTeam, awayTeam, odds, matchDate);

  // Start with base-adjusted probabilities
  let probs = [
    impliedProbs[0] * params.homeBaseBoost,
    impliedProbs[1] * params.drawBasePenalty,
    impliedProbs[2] * params.awayBasePenalty,
  ];

  // Apply edge-based adjustments
  if (edge.homeEdge > params.minEdgeForBoost) {
    probs[0] *= 1 + edge.homeEdge * params.edgeMultiplier;
  } else if (edge.homeEdge < -params.minEdgeForBoost) {
    probs[0] *= 1 + edge.homeEdge * 0.5;
  }

  if (
    edge.drawEdge > params.minEdgeForBoost &&
    odds[1] >= params.minDrawOddsForBoost
  ) {
    probs[1] *= 1 + edge.drawEdge * params.edgeMultiplier;
  }

  if (
    edge.awayEdge > params.minEdgeForBoost &&
    odds[2] >= params.minAwayOddsForValue
  ) {
    probs[2] *= 1 + edge.awayEdge * params.edgeMultiplier;
  }

  // Apply draw pattern boost
  if (
    drawPattern >= params.drawPatternThreshold &&
    odds[1] >= params.minDrawOddsForBoost
  ) {
    probs[1] *= 1 + drawPattern * params.drawPatternMultiplier;
  }

  // Normalize
  const sum = probs.reduce((a, b) => a + b, 0);
  return [probs[0] / sum, probs[1] / sum, probs[2] / sum];
}

// ============================================================================
// LINE GENERATION
// ============================================================================

function generateLines(dataFile, matchDate) {
  const probabilities = calculateProbabilities(dataFile.odds);
  const numMatches = Math.min(dataFile.teams.length, probabilities.length);
  const matchesToSelect = Math.min(GRID_MATCH_COUNT, numMatches);
  const selectedIndices = selectBestMatches(
    probabilities.slice(0, numMatches),
    matchesToSelect
  );

  const picks = [];
  for (let pos = 0; pos < matchesToSelect; pos++) {
    const matchIndex = selectedIndices[pos];
    const teams = dataFile.teams[matchIndex];
    if (!teams) {
      console.warn(`⚠️ Missing team data for match index ${matchIndex}`);
      continue;
    }
    const homeTeam = teams["1"];
    const awayTeam = teams["2"];
    const impliedProbs = probabilities[matchIndex];
    const oddsIdx = matchIndex * 3;
    const odds = [
      dataFile.odds[oddsIdx],
      dataFile.odds[oddsIdx + 1],
      dataFile.odds[oddsIdx + 2],
    ];

    // Calculate contrarian probabilities
    const contrarianProbs = calculateContrarianProbs(
      homeTeam,
      awayTeam,
      odds,
      impliedProbs,
      matchDate,
      CONTRARIAN_VALUE_PARAMS
    );

    // Pick the highest probability outcome
    const maxIdx = contrarianProbs.indexOf(Math.max(...contrarianProbs));
    const pick = ["1", "X", "2"][maxIdx];

    picks.push({
      position: pos,
      matchIndex,
      homeTeam,
      awayTeam,
      pick,
      probs: impliedProbs,
      contrarianProbs,
      odds,
    });
  }

  // Generate 27 lines
  const lines = [];
  for (const c1 of COL1) {
    for (const c2 of COL2) {
      for (const c3 of COL3) {
        lines.push([picks[c1].pick, picks[c2].pick, picks[c3].pick]);
      }
    }
  }

  return { lines, picks, selectedIndices };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node scripts/addLinesToFile.mjs <filename>");
    console.log("Example: node scripts/addLinesToFile.mjs 2025-08-23");
    process.exit(1);
  }

  const filename = args[0].replace(".json", "");
  const filepath = join(DATA_DIR, `${filename}.json`);
  const matchDate = filename; // Use filename as date

  console.log(`📂 Reading file: ${filepath}\n`);

  let dataFile;
  try {
    dataFile = JSON.parse(readFileSync(filepath, "utf8"));
  } catch (err) {
    console.error(`❌ Error reading file: ${err.message}`);
    process.exit(1);
  }

  // Generate lines using Contrarian Value Strategy
  const { lines, picks, selectedIndices } = generateLines(dataFile, matchDate);

  // Display the grid with team names
  console.log("🏟️  GRID (9 matches selected from 13):\n");
  console.log("  Col1               Col2               Col3");
  console.log("  ───────────────────────────────────────────────────────");

  for (let row = 0; row < 3; row++) {
    const cells = [];
    for (let col = 0; col < 3; col++) {
      const pos = row * 3 + col;
      const pick = picks[pos];
      const pickLabel =
        pick.pick === "1"
          ? pick.homeTeam
          : pick.pick === "2"
          ? pick.awayTeam
          : "Draw";
      cells.push(
        `${pos}: ${pick.pick} ${pickLabel.substring(0, 12).padEnd(12)}`
      );
    }
    console.log(`  ${cells.join("  ")}`);
    console.log(
      `     (${picks[row * 3].homeTeam} v ${picks[row * 3].awayTeam})`.padStart(
        20
      ) +
        `     (${picks[row * 3 + 1].homeTeam} v ${
          picks[row * 3 + 1].awayTeam
        })`.padStart(20) +
        `     (${picks[row * 3 + 2].homeTeam} v ${
          picks[row * 3 + 2].awayTeam
        })`.padStart(20)
    );
    console.log();
  }

  console.log("\n📊 Contrarian Value Strategy Analysis:\n");
  console.log("  Using CONTRARIAN_VALUE_PARAMS (tuned for +30.88% ROI):");
  console.log(`    homeBaseBoost: ${CONTRARIAN_VALUE_PARAMS.homeBaseBoost}`);
  console.log(
    `    drawBasePenalty: ${CONTRARIAN_VALUE_PARAMS.drawBasePenalty}`
  );
  console.log(
    `    awayBasePenalty: ${CONTRARIAN_VALUE_PARAMS.awayBasePenalty}`
  );
  console.log(`    edgeMultiplier: ${CONTRARIAN_VALUE_PARAMS.edgeMultiplier}`);
  console.log(
    `    regressionFactor: ${CONTRARIAN_VALUE_PARAMS.regressionFactor}`
  );
  console.log();

  picks.forEach((p, i) => {
    const outcomes = ["1", "X", "2"];
    const maxIdx = p.contrarianProbs.indexOf(Math.max(...p.contrarianProbs));

    console.log(
      `  Pos ${i}: Match ${p.matchIndex.toString().padStart(2)} | ` +
        `${p.homeTeam.padEnd(15)} vs ${p.awayTeam.padEnd(15)}`
    );
    console.log(
      `          Implied: [${p.probs.map((x) => x.toFixed(2)).join(", ")}] → ` +
        `Contrarian: [${p.contrarianProbs
          .map((x) => x.toFixed(2))
          .join(", ")}] → ` +
        `Pick: ${outcomes[maxIdx]}`
    );
  });

  console.log("\n🎯 27 LINES (col1 → col2 → col3):\n");

  console.log("  Line Array (2D representation):");
  console.log("  ─────────────────────────────────");

  lines.forEach((line, idx) => {
    const c1 = COL1[Math.floor(idx / 9)];
    const c2 = COL2[Math.floor((idx % 9) / 3)];
    const c3 = COL3[idx % 3];
    console.log(
      `  Line ${(idx + 1).toString().padStart(2)}: [${line.join(", ")}]  ` +
        `(pos ${c1}→${c2}→${c3})`
    );
  });

  // Add lines to data file
  dataFile.lines = lines;

  // Also add detailed grid info for reference
  dataFile.grid = {
    selectedMatches: selectedIndices,
    picks: picks.map((p) => ({
      position: p.position,
      matchIndex: p.matchIndex,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      pick: p.pick,
    })),
    strategy: "contrarian-value",
    params: CONTRARIAN_VALUE_PARAMS,
  };

  // Write the updated file
  writeFileSync(filepath, JSON.stringify(dataFile, null, 2) + "\n", "utf8");

  console.log(`\n✅ Updated file: ${filepath}`);
  console.log(
    `   Added ${lines.length} lines using Contrarian Value Strategy\n`
  );
}

main();
