import * as THREE from 'three';
import '../src/visuals/placeholders.js';
import { Fight, EMPTY_INPUT } from '../src/game/fight.js';
import { stockLoadout } from '../src/data.js';
function rngOf(a){return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const casual = { pauseMin: 0.8, pauseMax: 1.4, dodge: 0.15, skill: 0.3 };
const loadout = { ...stockLoadout('pipo'), arm_r: 'kanazuchi_arm_r' };
const agg = { wins:0, n:0, t:0, pTaken:{}, rTaken:{}, rBlocks:0, pHits:{}, rHits:{}, pAttempts:0, rHeadEnd:0, pHeadEnd:0 };
const add=(o,k,v)=>o[k]=(o[k]||0)+v;
for (let s=1;s<=100;s++){
  const f = new Fight({ scene:new THREE.Scene(), rivalId:'popgun', playerLoadout:loadout, playerPaints:{}, rng:rngOf(s), playerAI:casual });
  let g=0; while(!f.done && g++<60*200) f.update(1/60,{...EMPTY_INPUT,move:new THREE.Vector2()});
  agg.n++; if(f.result.won) agg.wins++; agg.t+=f.result.timeUsed;
  for(const [k,v] of Object.entries(f.player.stats.takenBySlot)) add(agg.pTaken,k,v);
  for(const [k,v] of Object.entries(f.rival.stats.takenBySlot)) add(agg.rTaken,k,v);
  agg.rBlocks+=f.rival.stats.blocks; agg.pAttempts+=f.player.stats.attacksStarted;
  for(const [k,v] of Object.entries(f.player.stats.hits)) add(agg.pHits,k,v.hits);
  for(const [k,v] of Object.entries(f.rival.stats.hits)) add(agg.rHits,k,v.hits);
  agg.rHeadEnd+=f.rival.parts.head.hp/f.rival.parts.head.max; agg.pHeadEnd+=f.player.parts.head.hp/f.player.parts.head.max;
}
const per=(o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,+(v/agg.n).toFixed(1)]));
console.log(JSON.stringify({winRate:agg.wins/agg.n, avgTime:(agg.t/agg.n).toFixed(1), playerAttacksStarted:(agg.pAttempts/agg.n).toFixed(1), playerHitsLanded:per(agg.pHits), popgunBlocks:(agg.rBlocks/agg.n).toFixed(1), popgunDamageTakenBySlot:per(agg.rTaken), popgunHits:per(agg.rHits), pipoDamageTakenBySlot:per(agg.pTaken), popgunHeadLeftAvg:(agg.rHeadEnd/agg.n).toFixed(2), pipoHeadLeftAvg:(agg.pHeadEnd/agg.n).toFixed(2)},null,1));
