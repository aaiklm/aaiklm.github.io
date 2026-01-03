#!/usr/bin/env node
/**
 * Script to download upcoming Premier League match data from Flashscore.dk
 * Source: https://www.flashscore.dk/fodbold/england/premier-league/kommende/
 * 
 * Usage:
 *   node scripts/downloadFlashscoreMatches.mjs [options]
 *   npm run download:matches -- [options]
 * 
 * Options:
 *   --limit N    Only fetch first N matches (default: 10 for one round)
 *   --all        Fetch all upcoming matches
 * 
 * Output: Saves to src/assets/data/YYYY-MM-DD.json using today's date
 */

import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../src/assets/data");

const FLASHSCORE_URL = "https://www.flashscore.dk/fodbold/england/premier-league/kommende/";

// Parse command line args
const args = process.argv.slice(2);
const fetchAll = args.includes('--all');
const limitIndex = args.indexOf('--limit');
const matchLimit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : (fetchAll ? 999 : 10);

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Team name mapping from Flashscore to our format
const TEAM_NAME_MAP = {
  "Aston Villa": "Aston Villa",
  "Arsenal": "Arsenal",
  "Bournemouth": "Bournemouth",
  "Brentford": "Brentford",
  "Brighton": "Brighton",
  "Burnley": "Burnley",
  "Chelsea": "Chelsea",
  "Crystal Palace": "Crystal Palace",
  "Everton": "Everton",
  "Fulham": "Fulham",
  "Leeds": "Leeds",
  "Leicester": "Leicester",
  "Liverpool": "Liverpool",
  "Luton": "Luton",
  "Manchester City": "Manchester City",
  "Man City": "Manchester City",
  "Manchester Utd": "Manchester United",
  "Man Utd": "Manchester United",
  "Manchester United": "Manchester United",
  "Newcastle": "Newcastle",
  "Nottingham": "Nottingham Forest",
  "Nott'm Forest": "Nottingham Forest",
  "Nottingham Forest": "Nottingham Forest",
  "Sheffield Utd": "Sheffield United",
  "Sheffield United": "Sheffield United",
  "Southampton": "Southampton",
  "Sunderland": "Sunderland",
  "Tottenham": "Tottenham",
  "West Ham": "West Ham",
  "Wolves": "Wolverhampton",
  "Wolverhampton": "Wolverhampton",
  "Ipswich": "Ipswich",
  "Ipswich Town": "Ipswich",
};

function normalizeTeamName(name) {
  const trimmed = name.trim();
  return TEAM_NAME_MAP[trimmed] || trimmed;
}

async function acceptCookies(page) {
  try {
    await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
    await page.click('#onetrust-accept-btn-handler');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("  ✓ Accepted cookies");
  } catch (e) {
    // Cookie banner might not appear
  }
}

async function getMatchList(page) {
  console.log("📋 Getting list of upcoming matches...\n");
  
  await page.goto(FLASHSCORE_URL, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await acceptCookies(page);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Extract match data and URLs from the main page
  const matches = await page.evaluate(() => {
    const results = [];
    let currentDate = null;
    
    // Get all elements - look at all divs in the leagues container
    const container = document.querySelector('.leagues--static, .sportName, [class*="leagues"]');
    if (!container) return results;
    
    // Get all child divs - iterate through all of them
    const allDivs = container.querySelectorAll('div');
    
    for (const el of allDivs) {
      const className = el.className || '';
      const id = el.id || '';
      
      // Look for date headers - they have various class names
      if (className.includes('event__header') || className.includes('event__round')) {
        // Get all text content and look for date pattern DD.MM.
        const text = el.textContent || '';
        const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\./);
        if (dateMatch) {
          currentDate = dateMatch[0];
        }
      }
      
      // Match rows have id starting with g_1_
      if (id.startsWith('g_1_') && className.includes('event__match')) {
        // Get the match link
        const linkEl = el.querySelector('a.eventRowLink, a[class*="eventRow"]');
        const matchUrl = linkEl?.href || null;
        
        // Get team names
        let homeTeam = null;
        let awayTeam = null;
        
        // Look for participant elements - try multiple patterns
        const homeEl = el.querySelector('.event__participant--home, [class*="homeParticipant"]');
        const awayEl = el.querySelector('.event__participant--away, [class*="awayParticipant"]');
        
        if (homeEl) homeTeam = homeEl.textContent?.trim();
        if (awayEl) awayTeam = awayEl.textContent?.trim();
        
        // Get time from match row
        const timeEl = el.querySelector('.event__time, [class*="event__time"]');
        const time = timeEl?.textContent?.trim();
        
        // Get match ID
        const matchId = id.replace('g_1_', '');
        
        if (homeTeam && awayTeam && matchId) {
          results.push({
            homeTeam,
            awayTeam,
            date: currentDate,
            time,
            matchId,
            matchUrl,
          });
        }
      }
    }
    
    return results;
  });

  console.log(`  Found ${matches.length} upcoming matches`);
  
  // Show first few matches
  for (let i = 0; i < Math.min(5, matches.length); i++) {
    const m = matches[i];
    console.log(`    ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} (${m.date || 'unknown date'})`);
  }
  if (matches.length > 5) {
    console.log(`    ... and ${matches.length - 5} more`);
  }
  console.log("");
  
  return matches;
}

async function getMatchOdds(browser, match) {
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Build the odds URL
    const oddsUrl = `https://www.flashscore.dk/kamp/${match.matchId}/#/odds-sammenligning/1x2-odds/fuld-tid`;

    await page.goto(oddsUrl, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    // Wait for odds to load - try waiting for specific elements
    try {
      await page.waitForSelector('.ui-table__row, .oddsCell, [class*="odds"]', { timeout: 5000 });
    } catch (e) {
      // Continue anyway
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract odds - look for the odds table
    const odds = await page.evaluate(() => {
      // Helper: validate odds look realistic (must have decimals for betting odds)
      function isValidOdds(home, draw, away) {
        // All must be >= 1.01 and < 50
        if (home < 1.01 || draw < 1.01 || away < 1.01) return false;
        if (home > 50 || draw > 50 || away > 50) return false;
        // All must be different
        if (home === draw || draw === away || home === away) return false;
        // Draw odds are typically between 2.5 and 5 for most matches
        if (draw < 2 || draw > 6) return false;
        return true;
      }
      
      // Method 1: Look for odds cells specifically in the comparison table
      // Flashscore uses classes like "oddsCell__odd" or similar
      const oddsCells = document.querySelectorAll('[class*="oddsCell"] a, [class*="oddsCell"] span');
      const cellValues = [];
      
      for (const cell of oddsCells) {
        const text = cell.textContent?.trim();
        // Match decimal odds like "1.85", "2.50", "4.5"
        if (/^\d+\.\d+$/.test(text)) {
          cellValues.push(parseFloat(text));
        }
      }
      
      // Take first 3 odds values (first bookmaker row)
      if (cellValues.length >= 3) {
        const home = cellValues[0];
        const draw = cellValues[1]; 
        const away = cellValues[2];
        if (isValidOdds(home, draw, away)) {
          return { home, draw, away };
        }
      }
      
      // Method 2: Look for the odds comparison table rows
      const rows = document.querySelectorAll('.ui-table__row');
      
      for (const row of rows) {
        // Get all anchor/span elements that might contain odds
        const cells = row.querySelectorAll('a, span');
        const oddsValues = [];
        
        for (const cell of cells) {
          const text = cell.textContent?.trim();
          // Only match decimal format like "1.85", "2.50"
          if (/^\d+\.\d{1,2}$/.test(text)) {
            const val = parseFloat(text);
            if (val >= 1.01 && val < 50) {
              oddsValues.push(val);
            }
          }
        }
        
        if (oddsValues.length >= 3) {
          const home = oddsValues[0];
          const draw = oddsValues[1];
          const away = oddsValues[2];
          if (isValidOdds(home, draw, away)) {
            return { home, draw, away };
          }
        }
      }
      
      // Method 3: Look for any element containing decimal odds pattern
      const allElements = document.querySelectorAll('a, span, div');
      const foundOdds = [];
      
      for (const el of allElements) {
        if (el.children.length > 0) continue; // Only leaf elements
        const text = el.textContent?.trim();
        if (/^\d+\.\d{1,2}$/.test(text)) {
          const val = parseFloat(text);
          if (val >= 1.01 && val < 50) {
            foundOdds.push(val);
          }
        }
        if (foundOdds.length >= 6) break; // Get first 6 values
      }
      
      // Try to find valid triplet
      for (let i = 0; i <= foundOdds.length - 3; i++) {
        const home = foundOdds[i];
        const draw = foundOdds[i + 1];
        const away = foundOdds[i + 2];
        if (isValidOdds(home, draw, away)) {
          return { home, draw, away };
        }
      }
      
      return null;
    });

    if (!odds) {
      // Debug: save page HTML to diagnose
      const html = await page.content();
      const debugPath = join(__dirname, `debug-odds-${match.matchId}.html`);
      writeFileSync(debugPath, html);
    }
    
    await page.close();
    return odds;
    
  } catch (error) {
    try { await page.close(); } catch (e) {}
    return null;
  }
}

async function main() {
  console.log("⚽ Flashscore Premier League Data Downloader\n");
  const todayDate = getTodayDate();
  console.log(`Source: ${FLASHSCORE_URL}`);
  console.log(`Match limit: ${matchLimit}`);
  console.log(`Output file: ${todayDate}.json\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--allow-running-insecure-content",
      "--disable-client-side-phishing-detection",
    ],
    ignoreHTTPSErrors: true,
  });

  try {
    const mainPage = await browser.newPage();
    await mainPage.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Get list of matches
    const allMatches = await getMatchList(mainPage);
    await mainPage.close();
    
    if (allMatches.length === 0) {
      console.log("❌ No matches found");
      await browser.close();
      return;
    }

    // Limit matches
    const matches = allMatches.slice(0, matchLimit);
    console.log(`\n💰 Fetching odds for ${matches.length} matches...\n`);

    // Fetch odds for each match
    const matchesWithOdds = [];
    const skippedMatches = [];
    const MAX_RETRIES = 3;
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      process.stdout.write(`  [${i + 1}/${matches.length}] ${match.homeTeam} vs ${match.awayTeam}... `);
      
      let odds = null;
      let attempts = 0;
      
      while (!odds && attempts < MAX_RETRIES) {
        attempts++;
        if (attempts > 1) {
          process.stdout.write(`retry ${attempts}... `);
        }
        odds = await getMatchOdds(browser, match);
        
        // Validate odds - all three should be different
        if (odds && (odds.home === odds.draw || odds.draw === odds.away)) {
          odds = null; // Invalid, retry
        }
        
        if (!odds && attempts < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (odds) {
        console.log(`✓ ${odds.home} / ${odds.draw} / ${odds.away}`);
        matchesWithOdds.push({ ...match, odds });
      } else {
        console.log(`⚠️ Skipped (no odds available)`);
        skippedMatches.push(`${match.homeTeam} vs ${match.awayTeam}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save to today's date file
    console.log("\n📁 Saving data...\n");

    const filePath = join(DATA_DIR, `${todayDate}.json`);
    const fileExists = existsSync(filePath);
    
    const data = {
      teams: matchesWithOdds.map(m => ({
        "1": normalizeTeamName(m.homeTeam),
        "2": normalizeTeamName(m.awayTeam)
      })),
      odds: matchesWithOdds.flatMap(m => [m.odds.home, m.odds.draw, m.odds.away]),
      matches: [],
      lines: Array(27).fill(null).map(() => ["1", "1", "1"]),
    };
    
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ${fileExists ? '📝 Updated' : '✨ Created'}: ${todayDate}.json (${data.teams.length} matches)`);

    if (skippedMatches.length > 0) {
      console.log(`\n⚠️ Skipped ${skippedMatches.length} match(es) without odds:`);
      for (const m of skippedMatches) {
        console.log(`   - ${m}`);
      }
    }

    console.log("\n✅ Done!");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
