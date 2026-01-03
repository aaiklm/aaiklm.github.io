/**
 * Refine Team Intelligence Strategy - Fine-tuning around optimal params
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// DATA LOADING
// ============================================================================

const dataDir = path.join(__dirname, "../src/assets/data");
const teamsDir = path.join(dataDir, "teams");

const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.endsWith(".json") && !f.includes("teams"));

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

const data = files
  .map((file) => {
    const content = JSON.parse(
      fs.readFileSync(path.join(dataDir, file), "utf-8")
    );
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : file.replace(".json", "");
    return {
      ...content,
      date,
      probabilities: calculateProbabilities(content.odds),
    };
  })
  .filter((d) => d.result !== undefined)
  .sort((a, b) => a.date.localeCompare(b.date));

const allTeamData = {};
const teamFiles = fs
  .readdirSync(teamsDir)
  .filter((f) => f.endsWith(".json") && !f.includes("-all"));
for (const file of teamFiles) {
  const teamName = file.replace(".json", "");
  allTeamData[teamName] = JSON.parse(
    fs.readFileSync(path.join(teamsDir, file), "utf-8")
  );
}

console.log(
  `\n📊 Loaded ${data.length} rounds, ${
    Object.keys(allTeamData).length
  } teams\n`
);

// ============================================================================
// TEAM ANALYSIS FUNCTIONS
// ============================================================================

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

function getMatchesBefore(teamData, beforeDate, count) {
  if (!teamData) return [];
  const matches = [];
  for (const m of teamData.matches) {
    if (m.date < beforeDate) {
      matches.push(m);
      if (matches.length >= count) break;
    }
  }
  return matches;
}

function calculateFormScore(matches) {
  if (matches.length === 0) return 50;
  let score = 0,
    total = 0;
  for (let i = 0; i < matches.length; i++) {
    const w = Math.pow(0.85, i);
    score +=
      (matches[i].result === "W" ? 3 : matches[i].result === "D" ? 1 : 0) * w;
    total += 3 * w;
  }
  return (score / total) * 100;
}

function detectMomentum(matches) {
  if (matches.length < 6) return 0;
  const r = matches
    .slice(0, 3)
    .reduce((s, m) => s + (m.result === "W" ? 3 : m.result === "D" ? 1 : 0), 0);
  const o = matches
    .slice(3, 6)
    .reduce((s, m) => s + (m.result === "W" ? 3 : m.result === "D" ? 1 : 0), 0);
  return (r - o) / 9;
}

function getStreak(matches) {
  if (matches.length === 0) return { type: null, length: 0 };
  const first = matches[0].result;
  let len = 0;
  for (const m of matches) {
    if (m.result === first) len++;
    else break;
  }
  return { type: first, length: len };
}

function analyzeTeam(teamName, isHome, beforeDate, matchWindow = 12) {
  const teamKey = normalizeTeamName(teamName);
  const td = allTeamData[teamKey];
  if (!td)
    return {
      formScore: 50,
      venueWinRate: 0.33,
      venueDrawRate: 0.33,
      momentum: 0,
      streak: { type: null, length: 0 },
      hasData: false,
    };

  const recent = getMatchesBefore(td, beforeDate, matchWindow);
  const venue = recent.filter((m) => m.isHome === isHome);

  let vWin = 0.33,
    vDraw = 0.33;
  if (venue.length >= 3) {
    vWin = venue.filter((m) => m.result === "W").length / venue.length;
    vDraw = venue.filter((m) => m.result === "D").length / venue.length;
  }

  return {
    formScore: calculateFormScore(recent),
    venueWinRate: vWin,
    venueDrawRate: vDraw,
    momentum: detectMomentum(recent),
    streak: getStreak(recent),
    hasData: recent.length >= 5,
  };
}

// ============================================================================
// STRATEGY
// ============================================================================

const GRID_SIZE = 9,
  BETS = 50;
const LINES = [];
for (const c1 of [0, 3, 6])
  for (const c2 of [1, 4, 7])
    for (const c3 of [2, 5, 8]) LINES.push([c1, c2, c3]);

function resultToOutcome(r) {
  return r === "0" ? "1" : r === "1" ? "X" : "2";
}

function createRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function test(betsResults) {
  let wins = 0,
    cost = 0,
    days = 0;
  for (const result of betsResults) {
    const df = data.find((d) => d.date === result.date);
    if (!df) continue;
    let dayWin = 0;
    for (const bet of result.bets) {
      for (const line of LINES) {
        let ok = true,
          pay = 1;
        for (const pos of line) {
          const pred = bet.predictions[pos],
            actual = resultToOutcome(df.result[pos]);
          if (pred === actual)
            pay *= df.odds[pos * 3 + (pred === "1" ? 0 : pred === "X" ? 1 : 2)];
          else ok = false;
        }
        if (ok) {
          dayWin += pay;
          wins += pay;
        }
      }
      cost += 27;
    }
    if (dayWin > result.bets.length * 27) days++;
  }
  return {
    roi: cost > 0 ? ((wins - cost) / cost) * 100 : 0,
    profit: wins - cost,
    days,
    cost,
    wins,
  };
}

function runTeamIntelligence(params) {
  const {
    formWeight,
    venueWeight,
    momentumWeight,
    streakBonus,
    homeBoost,
    drawPenalty,
    blendFactor,
    awayPenalty = 1.0,
    matchWindow = 12,
  } = params;

  return data.map((df) => {
    const rnd = createRandom(
      df.date.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + 42
    );

    const intelligentProbs = [];

    for (let i = 0; i < df.teams.length; i++) {
      const homeTeam = df.teams[i]["1"],
        awayTeam = df.teams[i]["2"];
      const impliedProbs = df.probabilities[i];

      const homeIntel = analyzeTeam(homeTeam, true, df.date, matchWindow);
      const awayIntel = analyzeTeam(awayTeam, false, df.date, matchWindow);

      let probs;

      if (homeIntel.hasData || awayIntel.hasData) {
        const formDiff = (homeIntel.formScore - awayIntel.formScore) / 100;

        let homeProb = 0.35 + formDiff * formWeight;
        let awayProb = 0.3 - formDiff * formWeight;

        if (homeIntel.hasData)
          homeProb =
            homeProb * (1 - venueWeight) + homeIntel.venueWinRate * venueWeight;
        if (awayIntel.hasData)
          awayProb =
            awayProb * (1 - venueWeight) + awayIntel.venueWinRate * venueWeight;

        homeProb += homeIntel.momentum * momentumWeight;
        awayProb += awayIntel.momentum * momentumWeight;

        if (homeIntel.streak.type === "W" && homeIntel.streak.length >= 2)
          homeProb += homeIntel.streak.length * streakBonus;
        if (awayIntel.streak.type === "W" && awayIntel.streak.length >= 2)
          awayProb += awayIntel.streak.length * streakBonus;
        if (homeIntel.streak.type === "L" && homeIntel.streak.length >= 2)
          homeProb -= homeIntel.streak.length * streakBonus;
        if (awayIntel.streak.type === "L" && awayIntel.streak.length >= 2)
          awayProb -= awayIntel.streak.length * streakBonus;

        homeProb = Math.max(0.08, Math.min(0.85, homeProb));
        awayProb = Math.max(0.05, Math.min(0.75, awayProb));
        let drawProb = Math.max(0.1, 1 - homeProb - awayProb);

        const blended = [
          homeProb * blendFactor + impliedProbs[0] * (1 - blendFactor),
          drawProb * blendFactor + impliedProbs[1] * (1 - blendFactor),
          awayProb * blendFactor + impliedProbs[2] * (1 - blendFactor),
        ];

        const adj = [
          blended[0] * homeBoost,
          blended[1] * drawPenalty,
          blended[2] * awayPenalty,
        ];
        const sum = adj.reduce((a, b) => a + b, 0);
        probs = [adj[0] / sum, adj[1] / sum, adj[2] / sum];
      } else {
        const adj = [
          impliedProbs[0] * homeBoost,
          impliedProbs[1] * drawPenalty,
          impliedProbs[2] * awayPenalty,
        ];
        const sum = adj.reduce((a, b) => a + b, 0);
        probs = [adj[0] / sum, adj[1] / sum, adj[2] / sum];
      }

      intelligentProbs.push({
        index: i,
        probs,
        confidence: Math.max(...probs),
      });
    }

    intelligentProbs.sort((a, b) => b.confidence - a.confidence);
    const selected = intelligentProbs.slice(0, GRID_SIZE);

    const bets = [],
      used = new Set();
    const fav = selected.map(
      (m) => ["1", "X", "2"][m.probs.indexOf(Math.max(...m.probs))]
    );
    bets.push({ predictions: fav });
    used.add(fav.join(","));

    while (bets.length < BETS) {
      const pred = selected.map((m) => {
        const r = rnd();
        return r < m.probs[0] ? "1" : r < m.probs[0] + m.probs[1] ? "X" : "2";
      });
      const k = pred.join(",");
      if (!used.has(k)) {
        used.add(k);
        bets.push({ predictions: pred });
      }
    }

    return { date: df.date, bets };
  });
}

// ============================================================================
// REFINED SEARCH
// ============================================================================

console.log("=".repeat(70));
console.log("        REFINED TEAM INTELLIGENCE TUNING");
console.log("=".repeat(70));

const results = [];

// Fine-tuned search around best params:
// formWeight=0.3, venueWeight=0.3, momentumWeight=0.2, streakBonus=0.07, homeBoost=1.6, drawPenalty=0.5, blendFactor=0.25

const formWeights = [0.25, 0.28, 0.3, 0.32, 0.35];
const venueWeights = [0.25, 0.28, 0.3, 0.32, 0.35];
const momentumWeights = [0.15, 0.18, 0.2, 0.22, 0.25];
const streakBonuses = [0.06, 0.07, 0.08, 0.09];
const homeBoosts = [1.55, 1.58, 1.6, 1.62, 1.65, 1.7];
const drawPenalties = [0.45, 0.48, 0.5, 0.52, 0.55];
const blendFactors = [0.2, 0.22, 0.25, 0.28, 0.3];
const awayPenalties = [0.9, 0.95, 1.0, 1.05];
const matchWindows = [10, 12, 14];

let count = 0;
const total =
  formWeights.length *
  venueWeights.length *
  momentumWeights.length *
  streakBonuses.length *
  homeBoosts.length *
  drawPenalties.length *
  blendFactors.length *
  awayPenalties.length *
  matchWindows.length;

console.log(`\nTesting ${total} refined parameter combinations...\n`);

for (const fw of formWeights) {
  for (const vw of venueWeights) {
    for (const mw of momentumWeights) {
      for (const sb of streakBonuses) {
        for (const hb of homeBoosts) {
          for (const dp of drawPenalties) {
            for (const bf of blendFactors) {
              for (const ap of awayPenalties) {
                for (const mWin of matchWindows) {
                  count++;
                  if (count % 2000 === 0)
                    console.log(`Progress: ${count}/${total}`);

                  const params = {
                    formWeight: fw,
                    venueWeight: vw,
                    momentumWeight: mw,
                    streakBonus: sb,
                    homeBoost: hb,
                    drawPenalty: dp,
                    blendFactor: bf,
                    awayPenalty: ap,
                    matchWindow: mWin,
                  };
                  const r = test(runTeamIntelligence(params));
                  results.push({ params, ...r });
                }
              }
            }
          }
        }
      }
    }
  }
}

results.sort((a, b) => b.roi - a.roi);

console.log("\n" + "=".repeat(70));
console.log("TOP 20 REFINED CONFIGURATIONS");
console.log("=".repeat(70));

for (let i = 0; i < Math.min(20, results.length); i++) {
  const r = results[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(
    `${medal} #${i + 1}: ROI: ${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(
      2
    )}% | Profit: ${r.profit.toFixed(0)} | Days: ${r.days}/84`
  );
}

// Best result
const best = results[0];
console.log("\n" + "=".repeat(70));
console.log("BEST REFINED CONFIGURATION");
console.log("=".repeat(70));
console.log(`\n🏆 ROI: +${best.roi.toFixed(2)}%`);
console.log(`   Profit: ${best.profit.toFixed(0)} units`);
console.log(`   Profitable Days: ${best.days}/84`);
console.log(`\n📋 OPTIMAL PARAMETERS:`);
console.log(JSON.stringify(best.params, null, 2));

// Find diverse top strategies (different by at least 0.5pp)
const diverse = [best];
for (const r of results) {
  if (diverse.length >= 3) break;
  const isDifferent = diverse.every((d) => Math.abs(d.roi - r.roi) > 0.2);
  if (isDifferent) diverse.push(r);
}

console.log("\n" + "=".repeat(70));
console.log("DIVERSE TOP STRATEGIES (for UI)");
console.log("=".repeat(70));
diverse.forEach((r, i) => {
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
  console.log(`\n${medal} Strategy ${i + 1}:`);
  console.log(
    `   ROI: +${r.roi.toFixed(2)}%, Profit: ${r.profit.toFixed(0)}, Days: ${
      r.days
    }/84`
  );
  console.log(`   Params: ${JSON.stringify(r.params)}`);
});

console.log("\n");
