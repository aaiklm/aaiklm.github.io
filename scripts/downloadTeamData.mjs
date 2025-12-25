#!/usr/bin/env node
/**
 * Script to download football match data from FBref using Puppeteer
 * Source: https://fbref.com/en/comps/9/schedule/Premier-League-Scores-and-Fixtures
 * Run with: node scripts/downloadTeamData.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../src/assets/data/teams");

// Historical seasons URLs (FBref format)
const SEASON_URLS = [
  {
    year: "2025-26",
    url: "https://fbref.com/en/comps/9/schedule/Premier-League-Scores-and-Fixtures",
  },
  {
    year: "2024-25",
    url: "https://fbref.com/en/comps/9/2024-2025/schedule/2024-2025-Premier-League-Scores-and-Fixtures",
  },
  {
    year: "2023-24",
    url: "https://fbref.com/en/comps/9/2023-2024/schedule/2023-2024-Premier-League-Scores-and-Fixtures",
  },
  {
    year: "2022-23",
    url: "https://fbref.com/en/comps/9/2022-2023/schedule/2022-2023-Premier-League-Scores-and-Fixtures",
  },
  {
    year: "2021-22",
    url: "https://fbref.com/en/comps/9/2021-2022/schedule/2021-2022-Premier-League-Scores-and-Fixtures",
  },
  {
    year: "2020-21",
    url: "https://fbref.com/en/comps/9/2020-2021/schedule/2020-2021-Premier-League-Scores-and-Fixtures",
  },
];

/**
 * Parse FBref HTML to extract match data
 * Only extracts matches that have been played (have scores)
 */
function parseFBrefHTML(html) {
  const matches = [];

  // Split by table rows
  const rows = html.split(/<tr[^>]*>/);

  for (const row of rows) {
    // Skip rows without score data
    if (!row.includes('data-stat="score"')) continue;

    // Extract gameweek
    const weekMatch = row.match(
      /<th[^>]*data-stat="gameweek"[^>]*>(\d+)<\/th>/
    );
    const week = weekMatch ? weekMatch[1] : null;

    // Extract date - look for the date inside an anchor tag or as text
    const dateMatch = row.match(
      /<td[^>]*data-stat="date"[^>]*>(?:<a[^>]*>)?(\d{4}-\d{2}-\d{2})(?:<\/a>)?<\/td>/
    );
    const dateStr = dateMatch ? dateMatch[1].trim() : null;

    // Extract home team from anchor tag
    const homeMatch = row.match(
      /<td[^>]*data-stat="home_team"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/
    );
    const homeTeam = homeMatch ? homeMatch[1].trim() : null;

    // Extract away team from anchor tag
    const awayMatch = row.match(
      /<td[^>]*data-stat="away_team"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/
    );
    const awayTeam = awayMatch ? awayMatch[1].trim() : null;

    // Extract score - only matches with actual scores (format: "2–1" with en-dash or "2-1" with hyphen)
    const scoreMatch = row.match(
      /<td[^>]*data-stat="score"[^>]*>(?:<a[^>]*>)?(\d+)[–\-](\d+)(?:<\/a>)?<\/td>/
    );

    // Skip if no score (future/unplayed match)
    if (!scoreMatch) continue;

    const homeGoals = parseInt(scoreMatch[1]);
    const awayGoals = parseInt(scoreMatch[2]);

    // Skip if we don't have all required data
    if (!dateStr || !homeTeam || !awayTeam) continue;

    // Determine result
    let result;
    if (homeGoals > awayGoals) result = "H";
    else if (homeGoals < awayGoals) result = "A";
    else result = "D";

    matches.push({
      date: dateStr,
      homeTeam: cleanTeamName(homeTeam),
      awayTeam: cleanTeamName(awayTeam),
      homeGoals,
      awayGoals,
      result,
      round: week ? `Matchday ${week}` : null,
    });
  }

  return matches;
}

function cleanTeamName(name) {
  return name
    .replace(/ FC$/, "")
    .replace(/ AFC$/, "")
    .replace(/^AFC /, "")
    .replace(/Utd$/, "United")
    .replace(/Nott'ham Forest/, "Nottingham Forest")
    .trim();
}

async function fetchSeasonData(browser, seasonInfo) {
  console.log(`  Fetching ${seasonInfo.year} from FBref...`);

  try {
    const page = await browser.newPage();

    // Set user agent to look like a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate to page and wait for table to load
    await page.goto(seasonInfo.url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Wait for the schedule table to be present
    await page.waitForSelector('table[id^="sched"]', { timeout: 30000 });

    // Get the full HTML
    const html = await page.content();

    await page.close();

    const matches = parseFBrefHTML(html);
    return matches;
  } catch (error) {
    console.log(`  ⚠️  Error: ${error.message}`);
    return [];
  }
}

function filterByTeam(matches, teamName) {
  const normalized = teamName.toLowerCase();

  const teamMatches = matches
    .filter(
      (m) =>
        m.homeTeam.toLowerCase().includes(normalized) ||
        m.awayTeam.toLowerCase().includes(normalized)
    )
    .map((m) => {
      const isHome = m.homeTeam.toLowerCase().includes(normalized);
      const goalsFor = isHome ? m.homeGoals : m.awayGoals;
      const goalsAgainst = isHome ? m.awayGoals : m.homeGoals;

      let result;
      if (m.result === "D") {
        result = "D";
      } else if (
        (isHome && m.result === "H") ||
        (!isHome && m.result === "A")
      ) {
        result = "W";
      } else {
        result = "L";
      }

      return {
        date: m.date,
        opponent: isHome ? m.awayTeam : m.homeTeam,
        isHome,
        goalsFor,
        goalsAgainst,
        result,
      };
    });

  const stats = {
    played: teamMatches.length,
    wins: teamMatches.filter((m) => m.result === "W").length,
    draws: teamMatches.filter((m) => m.result === "D").length,
    losses: teamMatches.filter((m) => m.result === "L").length,
    goalsFor: teamMatches.reduce((sum, m) => sum + m.goalsFor, 0),
    goalsAgainst: teamMatches.reduce((sum, m) => sum + m.goalsAgainst, 0),
  };

  return { teamName, matches: teamMatches, stats };
}

function getAllTeams(matches) {
  const teams = new Set();
  for (const m of matches) {
    teams.add(m.homeTeam);
    teams.add(m.awayTeam);
  }
  return Array.from(teams).sort();
}

async function main() {
  console.log("⚽ Football Data Downloader (FBref + Puppeteer)\n");
  console.log(
    "Source: fbref.com/en/comps/9/schedule/Premier-League-Scores-and-Fixtures\n"
  );

  // Create output directory
  mkdirSync(DATA_DIR, { recursive: true });

  // Launch browser
  console.log("🚀 Launching browser...\n");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // Fetch all Premier League data
  console.log("📥 Fetching Premier League data from FBref...\n");
  const allMatches = [];

  for (const season of SEASON_URLS) {
    const matches = await fetchSeasonData(browser, season);
    console.log(`  ✓ ${season.year}: ${matches.length} completed matches`);
    allMatches.push(...matches);

    // Add delay between requests to be respectful to FBref servers
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Close browser
  await browser.close();

  // Sort by date (newest first)
  allMatches.sort((a, b) => b.date.localeCompare(a.date));

  console.log(`\n📊 Total: ${allMatches.length} completed matches\n`);

  if (allMatches.length === 0) {
    console.log("❌ No matches found. Check if FBref HTML structure changed.");
    return;
  }

  // Save full season data
  const seasonData = {
    league: "Premier League",
    seasons: SEASON_URLS.map((s) => s.year),
    totalMatches: allMatches.length,
    matches: allMatches,
    fetchedAt: new Date().toISOString(),
  };

  const seasonFile = join(DATA_DIR, "premier-league-all.json");
  writeFileSync(seasonFile, JSON.stringify(seasonData, null, 2));
  console.log(`💾 Saved: ${seasonFile}`);

  // Get all teams
  const teams = getAllTeams(allMatches);
  console.log(`\n🏟️  Found ${teams.length} teams\n`);

  // Save individual team files
  console.log("📁 Saving individual team files...\n");

  for (const team of teams) {
    const teamHistory = filterByTeam(allMatches, team);
    const filename = team.replace(/\s+/g, "-").toLowerCase() + ".json";
    const filepath = join(DATA_DIR, filename);
    writeFileSync(filepath, JSON.stringify(teamHistory, null, 2));
    console.log(
      `  ✓ ${team}: ${teamHistory.stats.played}P ${teamHistory.stats.wins}W ${teamHistory.stats.draws}D ${teamHistory.stats.losses}L`
    );
  }

  console.log(`\n✅ Done! Files saved to ${DATA_DIR}`);
}

main().catch(console.error);
