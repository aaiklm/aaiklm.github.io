/**
 * Fast Strategy Test - 10 bets per round for speed
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

const O = r => r === '0' ? '1' : r === '1' ? 'X' : '2'; // result to outcome
const LINES = [];
for (const c1 of [0,3,6]) for (const c2 of [1,4,7]) for (const c3 of [2,5,8]) LINES.push([c1,c2,c3]);

function rand(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

function test(name, gen, bets = 10) {
  let win = 0, cost = 0, days = 0;
  for (const round of data) {
    const rng = rand(round.date.split('').reduce((a,c) => a + c.charCodeAt(0), 0));
    let dw = 0;
    const used = new Set();
    for (let b = 0; b < bets * 10 && used.size < bets; b++) {
      const bet = gen(round, rng);
      const k = bet.join('');
      if (used.has(k)) continue;
      used.add(k);
      for (const L of LINES) {
        let ok = true, pay = 1;
        for (const p of L) {
          const a = O(round.result[p]);
          if (bet[p] === a) { pay *= round.odds[p*3 + (bet[p]==='1'?0:bet[p]==='X'?1:2)]; }
          else { ok = false; break; }
        }
        if (ok) dw += pay;
      }
      cost += 27;
    }
    win += dw;
    if (dw > bets * 27) days++;
  }
  return { name, roi: (win-cost)/cost*100, profit: win-cost, days };
}

const S = [
  ['Random', (r, rng) => r.probs.slice(0,9).map(p => { const x=rng(); return x<p[0]?'1':x<p[0]+p[1]?'X':'2'; })],
  ['Favorite', (r, rng) => r.probs.slice(0,9).map(p => ['1','X','2'][p.indexOf(Math.max(...p))])],
  ['Fav 10% upset', (r, rng) => r.probs.slice(0,9).map(p => { const f=['1','X','2'][p.indexOf(Math.max(...p))]; if(rng()<0.1){const n=['1','X','2'].filter(o=>o!==f);return n[Math.floor(rng()*2)];} return f; })],
  ['Fav 20% upset', (r, rng) => r.probs.slice(0,9).map(p => { const f=['1','X','2'][p.indexOf(Math.max(...p))]; if(rng()<0.2){const n=['1','X','2'].filter(o=>o!==f);return n[Math.floor(rng()*2)];} return f; })],
  ['Fav 30% upset', (r, rng) => r.probs.slice(0,9).map(p => { const f=['1','X','2'][p.indexOf(Math.max(...p))]; if(rng()<0.3){const n=['1','X','2'].filter(o=>o!==f);return n[Math.floor(rng()*2)];} return f; })],
  ['Draw 1.5x', (r, rng) => r.probs.slice(0,9).map(p => { const b=[p[0],p[1]*1.5,p[2]]; const s=b[0]+b[1]+b[2]; const n=b.map(x=>x/s); const x=rng(); return x<n[0]?'1':x<n[0]+n[1]?'X':'2'; })],
  ['Draw 2.0x', (r, rng) => r.probs.slice(0,9).map(p => { const b=[p[0],p[1]*2.0,p[2]]; const s=b[0]+b[1]+b[2]; const n=b.map(x=>x/s); const x=rng(); return x<n[0]?'1':x<n[0]+n[1]?'X':'2'; })],
  ['Draw 2.5x', (r, rng) => r.probs.slice(0,9).map(p => { const b=[p[0],p[1]*2.5,p[2]]; const s=b[0]+b[1]+b[2]; const n=b.map(x=>x/s); const x=rng(); return x<n[0]?'1':x<n[0]+n[1]?'X':'2'; })],
  ['Draw 3.0x', (r, rng) => r.probs.slice(0,9).map(p => { const b=[p[0],p[1]*3.0,p[2]]; const s=b[0]+b[1]+b[2]; const n=b.map(x=>x/s); const x=rng(); return x<n[0]?'1':x<n[0]+n[1]?'X':'2'; })],
  ['Longshot 10%', (r, rng) => r.probs.slice(0,9).map(p => { if(rng()<0.1) return ['1','X','2'][p.indexOf(Math.min(...p))]; const x=rng(); return x<p[0]?'1':x<p[0]+p[1]?'X':'2'; })],
  ['Longshot 20%', (r, rng) => r.probs.slice(0,9).map(p => { if(rng()<0.2) return ['1','X','2'][p.indexOf(Math.min(...p))]; const x=rng(); return x<p[0]?'1':x<p[0]+p[1]?'X':'2'; })],
  ['Best EV', (r, rng) => r.probs.slice(0,9).map((p,i) => { const o=[r.odds[i*3],r.odds[i*3+1],r.odds[i*3+2]]; const ev=p.map((x,j)=>x*o[j]-1); return ['1','X','2'][ev.indexOf(Math.max(...ev))]; })],
  ['Best EV 10% var', (r, rng) => r.probs.slice(0,9).map((p,i) => { if(rng()<0.1){const x=rng();return x<p[0]?'1':x<p[0]+p[1]?'X':'2';} const o=[r.odds[i*3],r.odds[i*3+1],r.odds[i*3+2]]; const ev=p.map((x,j)=>x*o[j]-1); return ['1','X','2'][ev.indexOf(Math.max(...ev))]; })],
  ['Best EV 20% var', (r, rng) => r.probs.slice(0,9).map((p,i) => { if(rng()<0.2){const x=rng();return x<p[0]?'1':x<p[0]+p[1]?'X':'2';} const o=[r.odds[i*3],r.odds[i*3+1],r.odds[i*3+2]]; const ev=p.map((x,j)=>x*o[j]-1); return ['1','X','2'][ev.indexOf(Math.max(...ev))]; })],
  ['Best EV 30% var', (r, rng) => r.probs.slice(0,9).map((p,i) => { if(rng()<0.3){const x=rng();return x<p[0]?'1':x<p[0]+p[1]?'X':'2';} const o=[r.odds[i*3],r.odds[i*3+1],r.odds[i*3+2]]; const ev=p.map((x,j)=>x*o[j]-1); return ['1','X','2'][ev.indexOf(Math.max(...ev))]; })],
];

console.log('Testing...');
const R = S.map(([n, fn]) => test(n, fn)).sort((a,b) => b.roi - a.roi);

console.log('\n' + '='.repeat(60));
console.log('RESULTS');
console.log('='.repeat(60));
R.forEach((r,i) => {
  const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'  ';
  console.log(`${m} ${r.name.padEnd(20)} ROI: ${(r.roi>=0?'+':'')}${r.roi.toFixed(2).padStart(7)}% | Profit: ${(r.profit>=0?'+':'')}${r.profit.toFixed(0).padStart(6)} | Days: ${r.days}/${data.length}`);
});

const w = R[0];
const b = R.find(r => r.name === 'Random');
console.log('\n' + '='.repeat(60));
console.log(`WINNER: ${w.name} (ROI: ${w.roi.toFixed(2)}%)`);
if (b) console.log(`vs Random: ${(w.roi - b.roi).toFixed(2)} pp better`);
console.log('='.repeat(60));

