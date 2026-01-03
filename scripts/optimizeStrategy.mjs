/**
 * Strategy Optimizer - Find the best parameters
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../src/assets/data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.includes('teams'));

const data = files.map(file => {
  const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
  const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : file.replace('.json', '');
  const odds = content.odds;
  const probs = [];
  for (let i = 0; i < odds.length; i += 3) {
    const raw = [1/odds[i], 1/odds[i+1], 1/odds[i+2]];
    const sum = raw[0] + raw[1] + raw[2];
    probs.push([raw[0]/sum, raw[1]/sum, raw[2]/sum]);
  }
  return { ...content, date, probs };
}).filter(d => d.result !== undefined);

console.log(`Data: ${data.length} rounds\n`);

const O = r => r === '0' ? '1' : r === '1' ? 'X' : '2';
const LINES = [];
for (const c1 of [0,3,6]) for (const c2 of [1,4,7]) for (const c3 of [2,5,8]) LINES.push([c1,c2,c3]);

function rand(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

// Test with more bets
function test(name, gen, betsPerRound = 50) {
  let win = 0, cost = 0, days = 0;
  for (const round of data) {
    const rng = rand(round.date.split('').reduce((a,c) => a + c.charCodeAt(0), 0));
    let dw = 0;
    const used = new Set();
    
    for (let attempt = 0; attempt < betsPerRound * 20 && used.size < betsPerRound; attempt++) {
      const bet = gen(round, rng);
      const k = bet.join('');
      if (used.has(k)) continue;
      used.add(k);
      
      for (const L of LINES) {
        let ok = true, pay = 1;
        for (const p of L) {
          const a = O(round.result[p]);
          if (bet[p] === a) { 
            pay *= round.odds[p*3 + (bet[p]==='1'?0:bet[p]==='X'?1:2)]; 
          } else { 
            ok = false; break; 
          }
        }
        if (ok) dw += pay;
      }
      cost += 27;
    }
    win += dw;
    if (dw > used.size * 27) days++;
  }
  return { name, roi: (win-cost)/cost*100, profit: win-cost, days, total: data.length };
}

console.log('='.repeat(70));
console.log('TESTING FAVORITE-BASED STRATEGIES');
console.log('='.repeat(70));

// Strategy 1: Pure favorites with controlled variation
const strategies1 = [];

// Pure favorite repeated (baseline)
strategies1.push(['Pure Favorite (1 bet)', (r, rng) => 
  r.probs.slice(0,9).map(p => ['1','X','2'][p.indexOf(Math.max(...p))])
, 1]);

// Favorites with very small upset chance
for (const upset of [0.02, 0.05, 0.08, 0.10, 0.12, 0.15]) {
  strategies1.push([`Fav ${(upset*100).toFixed(0)}% upset`, (r, rng) => 
    r.probs.slice(0,9).map(p => {
      const outcomes = ['1','X','2'];
      const fav = outcomes[p.indexOf(Math.max(...p))];
      if (rng() < upset) {
        const nonFav = outcomes.filter(o => o !== fav);
        return nonFav[Math.floor(rng() * 2)];
      }
      return fav;
    })
  , 50]);
}

console.log('\nFavorite variations:');
const results1 = strategies1.map(([n, fn, bets]) => test(n, fn, bets)).sort((a,b) => b.roi - a.roi);
results1.forEach((r,i) => {
  const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'  ';
  console.log(`${m} ${r.name.padEnd(25)} ROI: ${(r.roi>=0?'+':'')}${r.roi.toFixed(2).padStart(7)}% | Days: ${r.days}/${r.total}`);
});

console.log('\n' + '='.repeat(70));
console.log('TESTING DRAW STRATEGIES');
console.log('='.repeat(70));

// Strategy 2: Draw boosting with favorites
const strategies2 = [];

for (const boost of [1.1, 1.2, 1.3, 1.4, 1.5]) {
  strategies2.push([`Draw ${boost}x boost`, (r, rng) => 
    r.probs.slice(0,9).map(p => {
      const boosted = [p[0], p[1] * boost, p[2]];
      const sum = boosted.reduce((a,b) => a+b, 0);
      const norm = boosted.map(x => x/sum);
      // Pick highest after boosting
      return ['1','X','2'][norm.indexOf(Math.max(...norm))];
    })
  , 50]);
}

console.log('\nDraw boost (pick max):');
const results2 = strategies2.map(([n, fn, bets]) => test(n, fn, bets || 50)).sort((a,b) => b.roi - a.roi);
results2.forEach((r,i) => {
  const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'  ';
  console.log(`${m} ${r.name.padEnd(25)} ROI: ${(r.roi>=0?'+':'')}${r.roi.toFixed(2).padStart(7)}% | Days: ${r.days}/${r.total}`);
});

console.log('\n' + '='.repeat(70));
console.log('TESTING SMART VARIATION STRATEGIES');
console.log('='.repeat(70));

// Strategy 3: Smart upset selection - only upset on matches where favorite isn't strong
const strategies3 = [];

for (const threshold of [0.45, 0.50, 0.55, 0.60]) {
  strategies3.push([`Upset if fav<${(threshold*100).toFixed(0)}%`, (r, rng) => 
    r.probs.slice(0,9).map(p => {
      const outcomes = ['1','X','2'];
      const maxP = Math.max(...p);
      const fav = outcomes[p.indexOf(maxP)];
      
      // Only upset if favorite probability is below threshold
      if (maxP < threshold && rng() < 0.3) {
        const nonFav = outcomes.filter(o => o !== fav);
        return nonFav[Math.floor(rng() * 2)];
      }
      return fav;
    })
  , 50]);
}

// Strategy: Target 2nd most likely when close
for (const gap of [0.05, 0.08, 0.10, 0.12, 0.15]) {
  strategies3.push([`2nd choice if gap<${(gap*100).toFixed(0)}%`, (r, rng) => 
    r.probs.slice(0,9).map(p => {
      const outcomes = ['1','X','2'];
      const sorted = [...p].sort((a,b) => b-a);
      const maxP = sorted[0];
      const secondP = sorted[1];
      const favIdx = p.indexOf(maxP);
      
      // If gap between 1st and 2nd is small, sometimes pick 2nd
      if (maxP - secondP < gap && rng() < 0.4) {
        const secondIdx = p.indexOf(secondP);
        return outcomes[secondIdx];
      }
      return outcomes[favIdx];
    })
  , 50]);
}

console.log('\nSmart upset strategies:');
const results3 = strategies3.map(([n, fn, bets]) => test(n, fn, bets || 50)).sort((a,b) => b.roi - a.roi);
results3.forEach((r,i) => {
  const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'  ';
  console.log(`${m} ${r.name.padEnd(25)} ROI: ${(r.roi>=0?'+':'')}${r.roi.toFixed(2).padStart(7)}% | Days: ${r.days}/${r.total}`);
});

console.log('\n' + '='.repeat(70));
console.log('TESTING HYBRID STRATEGIES');
console.log('='.repeat(70));

// Strategy 4: Combine best elements
const strategies4 = [];

// Hybrid: Favorites with draw boost on uncertain matches
strategies4.push(['Hybrid: Fav + Draw boost', (r, rng) => 
  r.probs.slice(0,9).map(p => {
    const outcomes = ['1','X','2'];
    const maxP = Math.max(...p);
    
    // If match is uncertain (max < 45%), boost draw
    if (maxP < 0.45) {
      const boosted = [p[0], p[1] * 1.3, p[2]];
      const sum = boosted.reduce((a,b) => a+b, 0);
      const norm = boosted.map(x => x/sum);
      return outcomes[norm.indexOf(Math.max(...norm))];
    }
    return outcomes[p.indexOf(maxP)];
  })
, 50]);

// Hybrid: Strong favorites, small random upset
strategies4.push(['Hybrid: StrongFav 5% upset', (r, rng) => 
  r.probs.slice(0,9).map(p => {
    const outcomes = ['1','X','2'];
    const maxP = Math.max(...p);
    const fav = outcomes[p.indexOf(maxP)];
    
    // Only upset on less certain matches
    if (maxP < 0.50 && rng() < 0.05) {
      const nonFav = outcomes.filter(o => o !== fav);
      return nonFav[Math.floor(rng() * 2)];
    }
    return fav;
  })
, 50]);

// Hybrid: Systematic variation - upset exactly 1 position
strategies4.push(['Hybrid: Exactly 1 upset', (r, rng) => {
  const outcomes = ['1','X','2'];
  const base = r.probs.slice(0,9).map(p => outcomes[p.indexOf(Math.max(...p))]);
  
  // Pick one random position to upset
  const upsetPos = Math.floor(rng() * 9);
  const p = r.probs[upsetPos];
  const fav = base[upsetPos];
  const nonFav = outcomes.filter(o => o !== fav);
  base[upsetPos] = nonFav[Math.floor(rng() * 2)];
  
  return base;
}, 50]);

// Hybrid: Smart single upset on weakest favorite
strategies4.push(['Hybrid: Upset weakest fav', (r, rng) => {
  const outcomes = ['1','X','2'];
  const base = r.probs.slice(0,9).map(p => outcomes[p.indexOf(Math.max(...p))]);
  
  // Find position with lowest max probability
  let weakestPos = 0;
  let weakestProb = Math.max(...r.probs[0]);
  for (let i = 1; i < 9; i++) {
    const maxP = Math.max(...r.probs[i]);
    if (maxP < weakestProb) {
      weakestPos = i;
      weakestProb = maxP;
    }
  }
  
  // 50% chance to upset the weakest position
  if (rng() < 0.5) {
    const p = r.probs[weakestPos];
    const fav = base[weakestPos];
    const nonFav = outcomes.filter(o => o !== fav);
    base[weakestPos] = nonFav[Math.floor(rng() * 2)];
  }
  
  return base;
}, 50]);

console.log('\nHybrid strategies:');
const results4 = strategies4.map(([n, fn, bets]) => test(n, fn, bets || 50)).sort((a,b) => b.roi - a.roi);
results4.forEach((r,i) => {
  const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'  ';
  console.log(`${m} ${r.name.padEnd(25)} ROI: ${(r.roi>=0?'+':'')}${r.roi.toFixed(2).padStart(7)}% | Days: ${r.days}/${r.total}`);
});

// Collect all results and find the overall winner
console.log('\n' + '='.repeat(70));
console.log('FINAL RANKINGS (ALL STRATEGIES)');
console.log('='.repeat(70));

const allResults = [...results1, ...results2, ...results3, ...results4];
allResults.sort((a,b) => b.roi - a.roi);

console.log('');
allResults.slice(0, 10).forEach((r,i) => {
  const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'  ';
  console.log(`${m} ${r.name.padEnd(25)} ROI: ${(r.roi>=0?'+':'')}${r.roi.toFixed(2).padStart(7)}% | Profit: ${(r.profit>=0?'+':'')}${r.profit.toFixed(0).padStart(7)} | Days: ${r.days}/${r.total}`);
});

const winner = allResults[0];
const randomBaseline = test('Random', (r, rng) => 
  r.probs.slice(0,9).map(p => { const x=rng(); return x<p[0]?'1':x<p[0]+p[1]?'X':'2'; })
, 50);

console.log('\n' + '='.repeat(70));
console.log(`WINNER: ${winner.name}`);
console.log(`ROI: ${winner.roi.toFixed(2)}% | Profit: ${winner.profit.toFixed(0)}`);
console.log(`vs Random (${randomBaseline.roi.toFixed(2)}%): ${(winner.roi - randomBaseline.roi).toFixed(2)} pp better`);
console.log('='.repeat(70));

