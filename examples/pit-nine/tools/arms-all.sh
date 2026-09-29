#!/bin/sh
# Runs the arm check for every animation stretch in parallel, then merges the tables into public/assets/player_armfix.json
cd "$(dirname "$0")/.."
rm -rf tools/out/armfix
for s in idle run shoot roll hurt knocked_down cheer; do
  node tools/lab-arms.mjs $s > tools/out/arms-$s.log 2>&1 &
done
wait
node -e "
const fs=require('fs');const d='tools/out/armfix';const t={},r={};
for(const f of fs.readdirSync(d)){const s=f.split('.')[0];const j=JSON.parse(fs.readFileSync(d+'/'+f));if(f.includes('.table'))t[s]=j;else r[s]=j;}
fs.writeFileSync('public/assets/player_armfix.json',JSON.stringify(t));
for(const [s,x] of Object.entries(r))console.log(s.padEnd(13),JSON.stringify(x));
"
