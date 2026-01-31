#!/usr/bin/env node
/**
 * Script to update game data files with result strings based on team match data
 * Result format: "0002022020000" where:
 *   0 = home victory
 *   1 = draw
 *   2 = away win
 * Run with: node scripts/updateResultStrings.mjs [filename]
 * Examples:
 *   node scripts/updateResultStrings.mjs 2025-09-13.json
 *   node scripts/updateResultStrings.mjs (updates all non-test files)
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../src/assets/data");
const TEAMS_DIR = join(DATA_DIR, "teams");

/**
 * Normalize team names to handle variations
 */
function normalizeTeamName(name) {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .replace(/'/g, "")
    .replace(/'/g, "");

  // Common team name mappings
  const mappings = {
    "wolves": "wolverhampton",
    "wolverhampton wanderers": "wolverhampton",
    "tottenham": "tottenham hotspur",
    "spurs": "tottenham hotspur",
    "west ham": "west ham united",
    "newcastle": "newcastle united",
    "nottingham forest": "nottingham forest",
    "notttm forest": "nottingham forest",
    "nott'ham forest": "nottingham forest",
    "brighton": "brighton",
    "brighton & hove albion": "brighton",
    "west bromwich": "west bromwich albion",
    "west brom": "west bromwich albion",
    "leeds": "leeds united",
    "sheffield w": "sheffield weds",
    "sheffield wednesday": "sheffield weds",
    "bristol c": "bristol city",
    "queens park r": "queens park rangers",
    "qpr": "queens park rangers",
    "crystal palace": "crystal palace",
    "aston villa": "aston villa",
    "man united": "manchester united",
    "man city": "manchester city",
    "coventry": "coventry city",
    "norwich": "norwich city",
    "stoke": "stoke city",
    "birmingham": "birmingham city",
    "swansea": "swansea city",
    "hull": "hull city",
    "derby": "derby county",
    "fullham": "fulham", // common typo
    "fulham": "fulham",
  };

  return mappings[normalized] || normalized;
}

/**
 * Load all team data into memory for faster lookups
 */
function loadTeamData() {
  const teamData = new Map();
  const files = readdirSync(TEAMS_DIR);

  for (const file of files) {
    if (!file.endsWith(".json") || file.includes("all")) {
      continue;
    }

    try {
      const filepath = join(TEAMS_DIR, file);
      const data = JSON.parse(readFileSync(filepath, "utf8"));
      
      if (data.teamName && data.matches) {
        const normalizedName = normalizeTeamName(data.teamName);
        teamData.set(normalizedName, data);
      }
    } catch (error) {
      console.warn(`  ⚠️  Could not load ${file}: ${error.message}`);
    }
  }

  return teamData;
}

/**
 * Check if a date is within range (±2 days)
 */
function isDateInRange(matchDate, targetDate, rangeDays = 2) {
  const match = new Date(matchDate);
  const target = new Date(targetDate);
  const diffMs = Math.abs(match - target);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= rangeDays;
}

/**
 * Find a match in team data
 * Returns the result from the perspective of the home team
 * Searches within ±2 days of the target date to handle date mismatches
 */
function findMatchResult(teamData, homeTeam, awayTeam, gameDate) {
  const normalizedHome = normalizeTeamName(homeTeam);
  const normalizedAway = normalizeTeamName(awayTeam);

  // Try to find the match in the home team's data
  const homeTeamData = teamData.get(normalizedHome);
  if (homeTeamData) {
    const match = homeTeamData.matches.find((m) => {
      const opponentNormalized = normalizeTeamName(m.opponent);
      return (
        isDateInRange(m.date, gameDate) &&
        m.isHome === true &&
        opponentNormalized === normalizedAway
      );
    });

    if (match) {
      if (match.result === "W") return "0"; // Home win
      if (match.result === "D") return "1"; // Draw
      if (match.result === "L") return "2"; // Away win
    }
  }

  // Try to find the match in the away team's data as a backup
  const awayTeamData = teamData.get(normalizedAway);
  if (awayTeamData) {
    const match = awayTeamData.matches.find((m) => {
      const opponentNormalized = normalizeTeamName(m.opponent);
      return (
        isDateInRange(m.date, gameDate) &&
        m.isHome === false &&
        opponentNormalized === normalizedHome
      );
    });

    if (match) {
      if (match.result === "L") return "0"; // Home win (away team lost)
      if (match.result === "D") return "1"; // Draw
      if (match.result === "W") return "2"; // Away win (away team won)
    }
  }

  return null; // Match not found
}

/**
 * Build result string for all matches in a game file
 */
function buildResultString(gameData, teamData, gameDate) {
  const teams = gameData.teams;
  const results = [];
  const notFound = [];

  for (let i = 0; i < teams.length; i++) {
    const match = teams[i];
    const homeTeam = match["1"];
    const awayTeam = match["2"];

    const result = findMatchResult(teamData, homeTeam, awayTeam, gameDate);

    if (result !== null) {
      results.push(result);
    } else {
      results.push("?");
      notFound.push({
        index: i,
        homeTeam,
        awayTeam,
      });
    }
  }

  return { resultString: results.join(""), notFound };
}

/**
 * Extract date from filename (e.g., "2025-09-13.json" -> "2025-09-13")
 */
function extractDate(filename) {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Update a single game file with result string
 */
function updateGameFile(filename, teamData) {
  const filepath = join(DATA_DIR, filename);
  
  console.log(`\n📄 Processing ${filename}...`);

  try {
    const gameData = JSON.parse(readFileSync(filepath, "utf8"));
    const gameDate = extractDate(filename);

    if (!gameDate) {
      console.log(`  ⚠️  Could not extract date from filename`);
      return false;
    }

    // Check if game date is today or in the future
    const today = new Date().toISOString().split("T")[0];
    if (gameDate >= today) {
      console.log(`  ⏭️  Skipped: Game date is ${gameDate >= today && gameDate === today ? "today" : "in the future"} (${gameDate})`);
      return false;
    }

    if (!gameData.teams || gameData.teams.length === 0) {
      console.log(`  ⚠️  No teams found in file`);
      return false;
    }

    const { resultString, notFound } = buildResultString(
      gameData,
      teamData,
      gameDate
    );

    // Add result to game data
    gameData.result = resultString;

    // Save updated file
    writeFileSync(filepath, JSON.stringify(gameData, null, 2));

    console.log(`  ✓ Result: ${resultString}`);
    
    if (notFound.length > 0) {
      console.log(`  ⚠️  ${notFound.length} match(es) not found (may be from leagues not in our data):`);
      for (const m of notFound) {
        console.log(`     - Match ${m.index}: ${m.homeTeam} vs ${m.awayTeam}`);
      }
    }

    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("⚽ Result String Updater\n");

  const args = process.argv.slice(2);
  const specificFile = args[0];

  // Load all team data
  console.log("📥 Loading team data...");
  const teamData = loadTeamData();
  console.log(`  ✓ Loaded ${teamData.size} teams`);

  if (specificFile) {
    // Update specific file
    updateGameFile(specificFile, teamData);
  } else {
    // Update all non-test files
    console.log("\n📁 Scanning for game files...");
    const files = readdirSync(DATA_DIR).filter(
      (f) => f.endsWith(".json") && !f.startsWith("test-")
    );

    console.log(`  ✓ Found ${files.length} game files\n`);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of files) {
      const success = updateGameFile(file, teamData);
      if (success) {
        updated++;
      } else {
        // Check if it was skipped due to future date
        const gameDate = extractDate(file);
        const today = new Date().toISOString().split("T")[0];
        if (gameDate && gameDate >= today) {
          skipped++;
        } else {
          failed++;
        }
      }
    }

    console.log(`\n✅ Done!`);
    console.log(`  Updated: ${updated}`);
    if (skipped > 0) {
      console.log(`  Skipped (future/today): ${skipped}`);
    }
    if (failed > 0) {
      console.log(`  Failed: ${failed}`);
    }
  }
}

main().catch(console.error);
