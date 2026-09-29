// Every piece of on-screen text, Japanese first, English second.
import { PARTS, ROBOTS, ATTACKS, SKILLS } from './data.js';

const STRINGS = {
  title: { ja: 'トイボックス・バウト', en: 'TOY BOX BOUT' },
  subtitle: { ja: 'おもちゃロボ　3番勝負', en: 'Three toy-robot bouts' },
  start: { ja: 'スタート', en: 'Start' },
  language: { ja: 'English', en: '日本語' },
  garage: { ja: 'ガレージ', en: 'Garage' },
  nextRival: { ja: '次の相手', en: 'Next rival' },
  bout: { ja: '第{n}戦', en: 'Bout {n}' },
  fight: { ja: 'ファイト！', en: 'FIGHT!' },
  ready: { ja: 'レディ…', en: 'Ready…' },
  part: { ja: 'パーツ', en: 'Part' },
  paint: { ja: 'カラー', en: 'Paint' },
  slot_head: { ja: 'ヘッド', en: 'Head' },
  slot_core: { ja: 'コア', en: 'Core' },
  slot_arm_r: { ja: '右腕', en: 'Right arm' },
  slot_arm_l: { ja: '左腕', en: 'Left arm' },
  slot_legs: { ja: 'レッグ', en: 'Legs' },
  paint_factory: { ja: 'ファクトリー', en: 'Factory' },
  paint_mechapop: { ja: 'メカポップ', en: 'Mecha Pop' },
  paint_wood: { ja: 'ウッド', en: 'Wood' },
  hp: { ja: 'HP', en: 'HP' },
  speed: { ja: '速度', en: 'Speed' },
  dash: { ja: 'ダッシュ', en: 'Dash' },
  damage: { ja: 'ダメージ', en: 'Damage' },
  win: { ja: '勝利！', en: 'YOU WIN!' },
  lose: { ja: '敗北…', en: 'DEFEATED…' },
  timeUp: { ja: 'タイムアップ！', en: 'TIME UP!' },
  pickPrize: { ja: 'パーツを1つもらおう', en: 'Take one part' },
  prizeTaken: { ja: '{part} を手に入れた！', en: 'Got {part}!' },
  champion: { ja: 'チャンピオン！', en: 'CHAMPION!' },
  championText: { ja: '3体のライバルに勝った！', en: 'You beat all three rivals!' },
  newRun: { ja: 'もう一度はじめから', en: 'New run' },
  retry: { ja: 'この試合をやり直す', en: 'Retry this bout' },
  toTitle: { ja: 'タイトルへ', en: 'Title' },
  pause: { ja: 'ポーズ', en: 'Paused' },
  resume: { ja: 'つづける', en: 'Resume' },
  broken: { ja: '破損', en: 'BROKEN' },
  headBroken: { ja: 'ヘッド破損！', en: 'Head broken!' },
  partBroke: { ja: '{part} 破損！', en: '{part} broke!' },
  controlsKeys: {
    ja: '移動 WASD ／ 左腕 左クリック・J ／ 右腕 右クリック・K ／ ダッシュ Space ／ ヘッド E ／ ポーズ Esc',
    en: 'Move WASD / Left arm LMB·J / Right arm RMB·K / Dash Space / Head E / Pause Esc',
  },
  btnL: { ja: '左', en: 'L' },
  btnR: { ja: '右', en: 'R' },
  btnDash: { ja: 'ダッシュ', en: 'DASH' },
  btnHead: { ja: 'ヘッド', en: 'HEAD' },
  rotateHint: { ja: '横向きがおすすめ', en: 'Landscape works best' },
  kind_melee: { ja: '格闘', en: 'Melee' },
  kind_shot: { ja: '射撃', en: 'Shooting' },
  kind_rocket: { ja: 'ミサイル', en: 'Missile' },
  kind_shield: { ja: 'ガード（長押し）', en: 'Block (hold)' },
  skill_repair: { ja: 'リペア：一番傷んだパーツを20回復', en: 'Repair: +20 HP to most-damaged part' },
  skill_guard: { ja: 'ガード：3秒間ダメージ半減', en: 'Guard: half damage for 3 s' },
  skill_focus: { ja: 'フォーカス：次の3発が1.5倍', en: 'Focus: next 3 shots ×1.5' },
  skill_charge: { ja: 'チャージ：前へ突進 10ダメージ', en: 'Charge: rush forward, 10 damage' },
  leg_biped: { ja: '二脚', en: 'Biped' },
  leg_treads: { ja: '戦車', en: 'Treads' },
  leg_hover: { ja: 'ホバー', en: 'Hover' },
  greybox: { ja: 'グレーボックス', en: 'Greybox' },
  viewModel: { ja: '表示：モデル（G）', en: 'View: models (G)' },
  viewGreybox: { ja: '表示：グレーボックス（G）', en: 'View: greybox (G)' },
  loadingModels: { ja: 'モデル読み込み中…', en: 'Loading models…' },
  loadingPaint: { ja: 'カラー読み込み中…', en: 'Loading paint…' },
  guard: { ja: 'ガード', en: 'GUARD' },
  tip: { ja: 'ヒント', en: 'Tip' },
  tip_kanazuchi: {
    ja: 'ハンマーは頭をねらう大ぶり。腕が黄色く光ったら離れよう。',
    en: 'Its hammer swings at your head. When its arm glows yellow, step away.',
  },
  tip_popgun: {
    ja: '盾が守るのは正面だけ。向かい合うと、こちらの左腕は相手の右腕（銃）に当たる。銃を先にこわせば撃てなくなる！',
    en: 'The shield only guards its front. Facing it, your left arm hits its right arm (the gun). Break the gun first and it cannot shoot!',
  },
  tip_hazama: {
    ja: '速いけれど打たれ弱い。ロケットは横にダッシュしてかわそう。',
    en: 'Fast but fragile. Dash sideways to dodge its rockets.',
  },
};

let lang = localStorage.getItem('tbb_lang') || 'ja';
const listeners = new Set();

export function getLang() {
  return lang;
}
export function setLang(l) {
  lang = l;
  localStorage.setItem('tbb_lang', l);
  document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}
export function toggleLang() {
  setLang(lang === 'ja' ? 'en' : 'ja');
}
export function onLang(fn) {
  listeners.add(fn);
}

export function t(key, vars = {}) {
  const s = STRINGS[key];
  let out = s ? s[lang] : key;
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}
export const partName = (id) => PARTS[id].name[lang];
export const robotName = (id) => ROBOTS[id].name[lang];

// One short line describing what a part does.
export function partInfo(id) {
  const p = PARTS[id];
  if (p.slot === 'core') return '';
  if (p.slot === 'head') return `${t('hp')} ${p.hp}　${t('skill_' + p.skill)}`;
  if (p.slot === 'legs') return `${t('hp')} ${p.hp}　${t('leg_' + p.legType)}　${t('speed')} ${p.speed} m/s　${t('dash')} ${p.dash} m`;
  const a = ATTACKS[p.attack];
  const dmg = a.damage ? `　${t('damage')} ${a.damage}${a.kind === 'shot' && a.fire.length > 1 ? '×' + a.fire.length : ''}` : '';
  return `${t('hp')} ${p.hp}　${t('kind_' + a.kind)}${dmg}`;
}
export { SKILLS };
