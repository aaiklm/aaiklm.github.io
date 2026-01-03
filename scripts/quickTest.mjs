/**
 * Quick Strategy Test
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all data files
const dataDir = path.join(__dirname, '../src/assets/data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.includes('teams'));

function calculateProbabilities(odds) {
  const probabilities = [];
  for (let i = 0; i < odds.length; i += 3) {
    const rawProbs = [1 / odds[i], 1 / odds[i + 1], 1 / odds[i + 2]];
    const sum = rawProbs[0] + rawProbs[1] + rawProbs[2];
    probabilities.push([rawProbs[0] / sum, rawProbs[1] / sum, rawProbs[2] / sum]);
  }
  return probabilities;
}

const data = files.map(file => {
  const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
  const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : file.replace('.json', '');
  const probabilities = calculateProbabilities(content.odds);
  return { ...content, date, probabilities };
}).filter(d => d.result !== undefined);

console.log(`Loaded ${data.length} rounds\n`);

// Result to outcome
function resultToOutcome(r) {
  return r === '0' ? '1' : r === '1' ? 'X' : '2';
}

// Simple seeded random
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// GRID: 9 matches, 27 lines
const LINES = [];
for (const c1 of [0, 3, 6]) {
  for (const c2 of [1, 4, 7]) {
    for (const c3 of [2, 5, 8]) {
      LINES.push([c1, c2, c3]);
    }
  }
}

// Simple accuracy calculation
function testStrategy(name, generateBet, betsPerRound = 50) {
  let totalWinnings = 0;
  let totalCost = 0;
  let profitableDays = 0;
  
  for (const round of data) {
    const random = seededRandom(round.date.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
    let dayWinnings = 0;
    
    const usedBets = new Set();
    let generated = 0;
    
    while (generated < betsPerRound) {
      const bet = generateBet(round, random);
      const key = bet.join(',');
      if (usedBets.has(key)) continue;
      usedBets.add(key);
      generated++;
      
      // Check all 27 lines
      for (const line of LINES) {
        let allCorrect = true;
        let payout = 1;
        
        for (const pos of line) {
          const actual = resultToOutcome(round.result[pos]);
          if (bet[pos] === actual) {
            const oddsIdx = pos * 3 + (bet[pos] === '1' ? 0 : bet[pos] === 'X' ? 1 : 2);
            payout *= round.odds[oddsIdx];
          } else {
            allCorrect = false;
            break;
          }
        }
        
        if (allCorrect) {
          dayWinnings += payout;
        }
      }
      
      totalCost += 27;
    }
    
    totalWinnings += dayWinnings;
    if (dayWinnings > betsPerRound * 27) profitableDays++;
  }
  
  const profit = totalWinnings - totalCost;
  const roi = (profit / totalCost) * 100;
  
  return { name, roi, profit, profitableDays, total: data.length };
}

// Strategies
const strategies = [
  {
    name: 'Random',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const r = random();
        if (r < probs[0]) return '1';
        if (r < probs[0] + probs[1]) return 'X';
        return '2';
      });
    }
  },
  {
    name: 'Pure Favorites',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const outcomes = ['1', 'X', '2'];
        return outcomes[probs.indexOf(Math.max(...probs))];
      });
    }
  },
  {
    name: 'Favorites (10% upset)',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const outcomes = ['1', 'X', '2'];
        const fav = outcomes[probs.indexOf(Math.max(...probs))];
        if (random() < 0.1) {
          const nonFav = outcomes.filter(o => o !== fav);
          return nonFav[Math.floor(random() * 2)];
        }
        return fav;
      });
    }
  },
  {
    name: 'Favorites (20% upset)',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const outcomes = ['1', 'X', '2'];
        const fav = outcomes[probs.indexOf(Math.max(...probs))];
        if (random() < 0.2) {
          const nonFav = outcomes.filter(o => o !== fav);
          return nonFav[Math.floor(random() * 2)];
        }
        return fav;
      });
    }
  },
  {
    name: 'Favorites (30% upset)',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const outcomes = ['1', 'X', '2'];
        const fav = outcomes[probs.indexOf(Math.max(...probs))];
        if (random() < 0.3) {
          const nonFav = outcomes.filter(o => o !== fav);
          return nonFav[Math.floor(random() * 2)];
        }
        return fav;
      });
    }
  },
  {
    name: 'Draw Boost 1.5x',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const boosted = [probs[0], probs[1] * 1.5, probs[2]];
        const sum = boosted.reduce((a, b) => a + b, 0);
        const norm = boosted.map(p => p / sum);
        const r = random();
        if (r < norm[0]) return '1';
        if (r < norm[0] + norm[1]) return 'X';
        return '2';
      });
    }
  },
  {
    name: 'Draw Boost 2.0x',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const boosted = [probs[0], probs[1] * 2.0, probs[2]];
        const sum = boosted.reduce((a, b) => a + b, 0);
        const norm = boosted.map(p => p / sum);
        const r = random();
        if (r < norm[0]) return '1';
        if (r < norm[0] + norm[1]) return 'X';
        return '2';
      });
    }
  },
  {
    name: 'Draw Boost 2.5x',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const boosted = [probs[0], probs[1] * 2.5, probs[2]];
        const sum = boosted.reduce((a, b) => a + b, 0);
        const norm = boosted.map(p => p / sum);
        const r = random();
        if (r < norm[0]) return '1';
        if (r < norm[0] + norm[1]) return 'X';
        return '2';
      });
    }
  },
  {
    name: 'Longshots 10%',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const outcomes = ['1', 'X', '2'];
        if (random() < 0.1) {
          // Pick lowest probability
          return outcomes[probs.indexOf(Math.min(...probs))];
        }
        const r = random();
        if (r < probs[0]) return '1';
        if (r < probs[0] + probs[1]) return 'X';
        return '2';
      });
    }
  },
  {
    name: 'Longshots 20%',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map(probs => {
        const outcomes = ['1', 'X', '2'];
        if (random() < 0.2) {
          return outcomes[probs.indexOf(Math.min(...probs))];
        }
        const r = random();
        if (r < probs[0]) return '1';
        if (r < probs[0] + probs[1]) return 'X';
        return '2';
      });
    }
  },
  {
    name: 'Best EV',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map((probs, i) => {
        const odds = [round.odds[i*3], round.odds[i*3+1], round.odds[i*3+2]];
        const ev = probs.map((p, j) => p * odds[j] - 1);
        const outcomes = ['1', 'X', '2'];
        return outcomes[ev.indexOf(Math.max(...ev))];
      });
    }
  },
  {
    name: 'Best EV (10% random)',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map((probs, i) => {
        if (random() < 0.1) {
          const r = random();
          if (r < probs[0]) return '1';
          if (r < probs[0] + probs[1]) return 'X';
          return '2';
        }
        const odds = [round.odds[i*3], round.odds[i*3+1], round.odds[i*3+2]];
        const ev = probs.map((p, j) => p * odds[j] - 1);
        const outcomes = ['1', 'X', '2'];
        return outcomes[ev.indexOf(Math.max(...ev))];
      });
    }
  },
  {
    name: 'Best EV (20% random)',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map((probs, i) => {
        if (random() < 0.2) {
          const r = random();
          if (r < probs[0]) return '1';
          if (r < probs[0] + probs[1]) return 'X';
          return '2';
        }
        const odds = [round.odds[i*3], round.odds[i*3+1], round.odds[i*3+2]];
        const ev = probs.map((p, j) => p * odds[j] - 1);
        const outcomes = ['1', 'X', '2'];
        return outcomes[ev.indexOf(Math.max(...ev))];
      });
    }
  },
  {
    name: 'EV-weighted selection',
    fn: (round, random) => {
      return round.probabilities.slice(0, 9).map((probs, i) => {
        const odds = [round.odds[i*3], round.odds[i*3+1], round.odds[i*3+2]];
        const ev = probs.map((p, j) => p * odds[j] - 1);
        // Boost selection prob by positive EV
        const boost = ev.map(e => Math.max(0, e + 0.5));
        const sum = boost.reduce((a, b) => a + b, 0);
        const weighted = sum > 0 ? boost.map(b => b / sum) : probs;
        // Blend with original probs
        const final = probs.map((p, j) => p * 0.5 + weighted[j] * 0.5);
        const finalSum = final.reduce((a, b) => a + b, 0);
        const norm = final.map(f => f / finalSum);
        
        const r = random();
        if (r < norm[0]) return '1';
        if (r < norm[0] + norm[1]) return 'X';
        return '2';
      });
    }
  },
];

console.log('Testing strategies...\n');

const results = strategies.map(s => testStrategy(s.name, s.fn));
results.sort((a, b) => b.roi - a.roi);

console.log('='.repeat(70));
console.log('RESULTS (sorted by ROI)');
console.log('='.repeat(70));

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
  console.log(`${medal} #${String(i+1).padStart(2)}: ${r.name.padEnd(25)} ROI: ${(r.roi >= 0 ? '+' : '')}${r.roi.toFixed(2).padStart(7)}% | Profit: ${(r.profit >= 0 ? '+' : '')}${r.profit.toFixed(0).padStart(8)} | Days: ${r.profitableDays}/${r.total}`);
}

const winner = results[0];
const baseline = results.find(r => r.name === 'Random');

console.log('\n' + '='.repeat(70));
console.log(`WINNER: ${winner.name}`);
console.log(`ROI: ${winner.roi.toFixed(2)}%`);
if (baseline) {
  console.log(`Improvement over Random: ${(winner.roi - baseline.roi).toFixed(2)} percentage points`);
}
console.log('='.repeat(70) + '\n');

