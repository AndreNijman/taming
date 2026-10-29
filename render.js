// Canvas renderer. Original outlined-cartoon art: everything is drawn from code
// with a thick dark outline, a flat fill, one lighter highlight and a soft drop shadow.
import { ITEM_BY_ID, PET_BY_ID, BOSS_BY_ID, TIERS, WORLD, BIOMES, BIOME_BY_ID, BIOME_GRID, BIOME_CELL, biomeAt } from './data.js';

const TAU = Math.PI * 2;
const OUTLINE = '#2b241d';
const SHADOW = 'rgba(20,14,8,.22)';

// Deterministic per-entity noise so shapes are stable between frames.
export function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function idSeed(id) {
  id = String(id);
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- primitive shapes ----------

function blobPath(c, x, y, r, seed, lumps = 7, wobble = .12) {
  c.beginPath();
  const pts = [];
  for (let i = 0; i < lumps; i++) {
    const a = i / lumps * TAU + seed * TAU;
    const rr = r * (1 - wobble + hash(seed * 1e6 + i) * wobble * 2);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  for (let i = 0; i < lumps; i++) {
    const p = pts[i], q = pts[(i + 1) % lumps];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) c.moveTo((pts[lumps - 1][0] + p[0]) / 2, (pts[lumps - 1][1] + p[1]) / 2);
    c.quadraticCurveTo(p[0], p[1], mx, my);
  }
  c.closePath();
}

function starPath(c, x, y, outer, inner, points, rot = 0, round = .35) {
  c.beginPath();
  const step = TAU / points;
  for (let i = 0; i < points; i++) {
    const a = rot + i * step;
    const tipX = x + Math.cos(a) * outer, tipY = y + Math.sin(a) * outer;
    const v1 = a - step / 2, v2 = a + step / 2;
    const in1x = x + Math.cos(v1) * inner, in1y = y + Math.sin(v1) * inner;
    const in2x = x + Math.cos(v2) * inner, in2y = y + Math.sin(v2) * inner;
    if (i === 0) c.moveTo(in1x, in1y);
    // rounded tip: approach, curve over the tip, leave
    const ax = in1x + (tipX - in1x) * (1 - round), ay = in1y + (tipY - in1y) * (1 - round);
    const bx = in2x + (tipX - in2x) * (1 - round), by = in2y + (tipY - in2y) * (1 - round);
    c.lineTo(ax, ay);
    c.quadraticCurveTo(tipX, tipY, bx, by);
    c.lineTo(in2x, in2y);
  }
  c.closePath();
}

function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }

function ink(c, fill, width = 4, stroke = OUTLINE) {
  c.fillStyle = fill; c.fill();
  c.lineWidth = width; c.strokeStyle = stroke; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}
function shadowed(c, draw, dy = 7, alpha = SHADOW) {
  c.save(); c.translate(0, dy); draw(); c.fillStyle = alpha; c.fill(); c.restore();
}
function stroke2(c, w, inner, color = OUTLINE) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = w + 6; c.strokeStyle = color; c.stroke();
  c.lineWidth = w; c.strokeStyle = inner; c.stroke();
}
function shade(hex, amount) {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
export function mix(a, b, t) {
  const p = parseInt(a.slice(1, 7), 16), q = parseInt(b.slice(1, 7), 16);
  const ch = s => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  return `#${ch(p).map((v, i) => Math.round(v + (ch(q)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- resources ----------

const GOLD = ['#f3b52f', '#ffd965', '#7a4c0e'];

export function drawResource(c, node, season = BIOME_BY_ID[node.biome] || BIOMES[0], time = 0, hitAge = 9) {
  const s = idSeed(node.id) % 100000;
  const shake = hitAge < .2 ? Math.sin(hitAge * 70) * (1 - hitAge / .2) * 6 : 0;
  c.save();
  c.translate(node.x + shake * Math.cos(node.hitDir || 0), node.y + shake * Math.sin(node.hitDir || 0));
  const r = node.r;
  switch (node.type) {
    case 'tree': drawTree(c, r, s, season, time); break;
    case 'rock': drawRock(c, r, s, season.rock); break;
    case 'gold': drawRock(c, r, s, GOLD, true); break;
    case 'big-gold': drawBigGold(c, r, s, time); break;
    case 'bush': drawBush(c, r, s, season); break;
    case 'cactus': drawCactus(c, r, s); break;
    case 'log': drawLog(c, r, s); break;
    default: drawRock(c, r, s, season.rock);
  }
  c.restore();
}

function drawTree(c, r, s, b, time) {
  const pts = 5 + (s % 3);
  const rot = hash(s) * TAU;
  const [fill, light, line] = b.tree;
  if (b.treeStyle === 'snow') {
    shadowed(c, () => starPath(c, 0, 0, r, r * .55, pts, rot, .45), 10);
    starPath(c, 0, 0, r, r * .55, pts, rot, .45); ink(c, fill, 5, line);
    starPath(c, 0, 0, r * .62, r * .34, pts, rot + .3, .45); ink(c, light, 3.5, line);
    circle(c, 0, 0, r * .16); ink(c, fill, 3, line);
    return;
  }
  if (b.treeStyle === 'dead') {
    // branching dead tree seen from above
    const arms = 4 + (s % 2);
    const branch = (len, w, ang, depth) => {
      c.save(); c.rotate(ang);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(len, 0);
      c.lineWidth = w + 7; c.strokeStyle = line; c.lineCap = 'round'; c.stroke();
      c.lineWidth = w; c.strokeStyle = fill; c.stroke();
      if (depth) { c.translate(len, 0); branch(len * .55, w * .7, -.6, depth - 1); branch(len * .5, w * .7, .55, depth - 1); }
      c.restore();
    };
    for (let i = 0; i < arms; i++) branch(r * .62, r * .2, rot + i / arms * TAU, 1);
    circle(c, 0, 0, r * .28); ink(c, fill, 5, line);
    circle(c, -r * .06, -r * .06, r * .13); c.fillStyle = light; c.fill();
    return;
  }
  if (b.treeStyle === 'mushroom') {
    // giant glowing toadstool cap
    c.save(); c.globalAlpha = .25 + Math.sin(time * 2 + s) * .08;
    circle(c, 0, 0, r * 1.15); c.fillStyle = b.berry; c.fill(); c.restore();
    shadowed(c, () => blobPath(c, 0, 0, r * .92, hash(s), 9, .05), 12);
    blobPath(c, 0, 0, r * .92, hash(s), 9, .05); ink(c, fill, 5, line);
    circle(c, -r * .12, -r * .14, r * .6); c.fillStyle = light; c.fill();
    for (let i = 0; i < 6; i++) {
      const a = hash(s + i * 19) * TAU, d = r * (.25 + hash(s + i * 5) * .45);
      circle(c, Math.cos(a) * d, Math.sin(a) * d, r * (.08 + hash(s + i) * .07)); ink(c, '#f2ecff', 3, line);
    }
    return;
  }
  if (b.treeStyle === 'kelp') {
    // swaying kelp bundle with a coral base
    const blades = 6 + (s % 3);
    for (let i = 0; i < blades; i++) {
      const a = rot + i / blades * TAU, sway = Math.sin(time * 1.6 + i + s) * .18;
      c.save(); c.rotate(a + sway);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(r * .35, -r * .2, r * .6, r * .2, r * .98, 0);
      stroke2(c, r * .2, i % 2 ? fill : light, line);
      c.restore();
    }
    circle(c, 0, 0, r * .3); ink(c, '#e8664f', 5, '#4a1a12');
    circle(c, -r * .07, -r * .07, r * .13); c.fillStyle = '#ff9a7c'; c.fill();
    return;
  }
  shadowed(c, () => starPath(c, 0, 0, r, r * .58, pts, rot), 12);
  starPath(c, 0, 0, r, r * .58, pts, rot); ink(c, fill, 5, line);
  starPath(c, -r * .05, -r * .07, r * .66, r * .4, pts, rot + .12); c.fillStyle = light; c.fill();
  // leaf veins
  c.strokeStyle = shade(fill, -.25); c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < pts; i++) {
    const a = rot + i / pts * TAU;
    c.beginPath(); c.moveTo(Math.cos(a) * r * .18, Math.sin(a) * r * .18); c.lineTo(Math.cos(a) * r * .6, Math.sin(a) * r * .6); c.stroke();
  }
}

function drawRock(c, r, s, [fill, light, line], shiny = false) {
  // a cluster of 2-3 lumpy stones
  const parts = [[0, 0, 1]];
  const n = 1 + (s % 3);
  for (let i = 0; i < n; i++) {
    const a = hash(s + i * 13) * TAU;
    parts.push([Math.cos(a) * r * .62, Math.sin(a) * r * .55, .48 + hash(s + i * 7) * .2]);
  }
  parts.sort((p, q) => p[1] - q[1]);
  for (const [x, y, k] of parts) shadowed(c, () => blobPath(c, x, y, r * k, (s + x) % 1, 6, .14), 8);
  for (const [x, y, k] of parts) {
    const seed = ((s + x * 3.1) % 1 + 1) % 1;
    blobPath(c, x, y, r * k, seed, 6, .14); ink(c, fill, 4.5, line);
    blobPath(c, x - r * k * .18, y - r * k * .2, r * k * .62, seed + .3, 6, .2); c.fillStyle = light; c.fill();
    if (shiny) { circle(c, x - r * k * .35, y - r * k * .35, r * k * .12); c.fillStyle = '#fff6c8'; c.fill(); }
  }
}

function drawBigGold(c, r, s, time) {
  // the permanent gold heart at the world centre: a ring of nuggets round a big one
  shadowed(c, () => circle(c, 0, 0, r * 1.05), 12);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + .3, x = Math.cos(a) * r * .68, y = Math.sin(a) * r * .68;
    blobPath(c, x, y, r * .36, hash(s + i), 6, .14); ink(c, GOLD[0], 5, GOLD[2]);
    blobPath(c, x - r * .06, y - r * .07, r * .2, hash(s + i + 9), 6, .2); c.fillStyle = GOLD[1]; c.fill();
  }
  blobPath(c, 0, 0, r * .62, hash(s), 7, .1); ink(c, GOLD[0], 6, GOLD[2]);
  blobPath(c, -r * .12, -r * .14, r * .38, hash(s + 3), 7, .14); c.fillStyle = GOLD[1]; c.fill();
  // twinkles
  for (let i = 0; i < 3; i++) {
    const t = (time * .8 + i / 3) % 1, a = hash(s + i * 41 + Math.floor(time * .8 + i / 3)) * TAU;
    c.save(); c.translate(Math.cos(a) * r * .6, Math.sin(a) * r * .6); c.scale(Math.sin(t * Math.PI), Math.sin(t * Math.PI));
    starPath(c, 0, 0, 14, 3, 4, 0, .1); c.fillStyle = '#fffbe0'; c.fill(); c.restore();
  }
}

function drawBush(c, r, s, b) {
  const [fill, light, line] = b.bush;
  shadowed(c, () => blobPath(c, 0, 0, r, hash(s), 8, .1), 8);
  blobPath(c, 0, 0, r, hash(s), 8, .1); ink(c, fill, 4.5, line);
  blobPath(c, -r * .1, -r * .12, r * .7, hash(s + 1), 8, .12); c.fillStyle = light; c.fill();
  const berries = 4 + (s % 3);
  for (let i = 0; i < berries; i++) {
    const a = hash(s + i * 31) * TAU, d = r * (.2 + hash(s + i * 17) * .45);
    const bx = Math.cos(a) * d, by = Math.sin(a) * d;
    circle(c, bx, by, r * .17); ink(c, b.berry, 3, line);
    circle(c, bx - r * .05, by - r * .05, r * .05); c.fillStyle = '#ffffffaa'; c.fill();
  }
}

function drawCactus(c, r, s) {
  shadowed(c, () => circle(c, 0, 0, r), 8);
  const spikes = 14;
  for (let i = 0; i < spikes; i++) {
    const a = i / spikes * TAU + hash(s) * TAU;
    c.save(); c.rotate(a);
    c.beginPath(); c.moveTo(r * .9, -5); c.lineTo(r * 1.28, 0); c.lineTo(r * .9, 5); c.closePath();
    c.fillStyle = '#f4ead2'; c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 2; c.stroke();
    c.restore();
  }
  circle(c, 0, 0, r); ink(c, '#7f9a35', 4.5);
  circle(c, -r * .12, -r * .12, r * .66); c.fillStyle = '#9bb847'; c.fill();
  c.strokeStyle = '#647d27'; c.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); c.stroke(); }
  circle(c, r * .1, -r * .2, r * .2); ink(c, '#f28bb3', 3);
}

function drawLog(c, r, s) {
  // a fallen log: long rounded body, ring end-caps
  c.rotate(hash(s) * TAU);
  const L = r * 1.5, W = r * .62;
  shadowed(c, () => { c.beginPath(); c.roundRect(-L, -W, L * 2, W * 2, W); }, 8);
  c.beginPath(); c.roundRect(-L, -W, L * 2, W * 2, W); ink(c, '#8a5a2b', 5);
  c.beginPath(); c.roundRect(-L + 8, -W + 6, L * 1.6, W * .6, W * .3); c.fillStyle = '#a8743f'; c.fill();
  c.strokeStyle = '#6b4320'; c.lineWidth = 3;
  for (const x of [-L * .4, L * .1]) { c.beginPath(); c.moveTo(x, -W * .4); c.lineTo(x + L * .25, -W * .4); c.stroke(); }
  ellipse(c, L - W * .45, 0, W * .5, W * .88); ink(c, '#e2b878', 4);
  ellipse(c, L - W * .45, 0, W * .25, W * .45); c.strokeStyle = '#a8743f'; c.lineWidth = 2.5; c.stroke();
  circle(c, -L * .3, W * .5, 7); ink(c, '#76b53f', 2.5);
}

// ---------- items held in hand ----------

const HANDLE = '#8a5a2b';

export function drawTool(c, itemId, scale = 1) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return;
  const tier = TIERS[item.tier] || TIERS.wood;
  const head = tier.color, light = tier.light;
  c.save(); c.scale(scale, scale);
  const shaft = (len, w = 7, from = 0) => { c.beginPath(); c.moveTo(from, 0); c.lineTo(len, 0); stroke2(c, w, HANDLE); };
  switch (item.shape) {
    case 'axe':
      shaft(54);
      c.beginPath(); c.moveTo(34, -4); c.quadraticCurveTo(42, -32, 62, -26); c.quadraticCurveTo(56, -8, 54, 0); c.lineTo(40, 2); c.closePath(); ink(c, head, 4);
      c.beginPath(); c.moveTo(44, -8); c.quadraticCurveTo(48, -22, 58, -22); c.lineWidth = 3; c.strokeStyle = light; c.stroke();
      break;
    case 'labrys':
      shaft(58);
      for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(40, 0); c.quadraticCurveTo(36, side * 30, 54, side * 34); c.quadraticCurveTo(62, side * 16, 56, 0); c.closePath(); ink(c, head, 4);
      }
      circle(c, 48, 0, 6); ink(c, light, 3);
      break;
    case 'pickaxe':
      shaft(54);
      c.beginPath(); c.moveTo(48, -32); c.quadraticCurveTo(66, 0, 48, 32); c.lineTo(42, 27); c.quadraticCurveTo(56, 0, 42, -27); c.closePath(); ink(c, head, 4);
      break;
    case 'hammer':
      shaft(52);
      c.beginPath(); c.roundRect(38, -22, 24, 44, 6); ink(c, head, 4);
      c.beginPath(); c.roundRect(42, -17, 8, 34, 3); c.fillStyle = light; c.fill();
      break;
    case 'sword': case 'katana': {
      const kat = item.shape === 'katana', len = kat ? 82 : 68;
      shaft(16, 8);
      if (kat) { ellipse(c, 16, 0, 4, 10); ink(c, '#3a2f2a', 3); }
      else { c.beginPath(); c.roundRect(12, -13, 7, 26, 3); ink(c, '#5b4128', 3.5); }
      c.beginPath(); c.moveTo(19, -6); c.lineTo(len - 8, kat ? -9 : -6); c.quadraticCurveTo(len + 4, kat ? -10 : 0, len - 6, kat ? 1 : 6); c.lineTo(19, 6); c.closePath(); ink(c, head, 4);
      c.beginPath(); c.moveTo(22, -2); c.lineTo(len - 14, kat ? -4 : -2); c.lineWidth = 3; c.strokeStyle = light; c.stroke();
      break;
    }
    case 'spear':
      shaft(82, 6);
      c.beginPath(); c.moveTo(74, -10); c.lineTo(104, 0); c.lineTo(74, 10); c.lineTo(79, 0); c.closePath(); ink(c, head, 4);
      break;
    case 'naginata':
      shaft(84, 6);
      c.beginPath(); c.moveTo(78, -6); c.quadraticCurveTo(100, -14, 118, -2); c.quadraticCurveTo(102, 2, 80, 6); c.closePath(); ink(c, head, 4);
      c.beginPath(); c.roundRect(74, -9, 6, 18, 2); ink(c, '#3a2f2a', 2.5);
      break;
    case 'dagger':
      c.beginPath(); c.roundRect(-4, -5, 14, 10, 3); ink(c, HANDLE, 3.5);
      c.beginPath(); c.moveTo(10, -6); c.lineTo(36, 0); c.lineTo(10, 6); c.closePath(); ink(c, head, 3.5);
      break;
    case 'cleaver':
      c.beginPath(); c.roundRect(-4, -5, 16, 10, 3); ink(c, HANDLE, 3.5);
      c.beginPath(); c.moveTo(12, -6); c.lineTo(38, -8); c.lineTo(38, 12); c.lineTo(12, 7); c.closePath(); ink(c, head, 3.5);
      circle(c, 32, -2, 2.5); c.fillStyle = OUTLINE; c.fill();
      break;
    case 'bow':
      c.beginPath(); c.arc(-6, 0, 32, -1.1, 1.1); stroke2(c, 6, head);
      c.beginPath(); c.moveTo(-6 + Math.cos(-1.1) * 32, Math.sin(-1.1) * 32); c.lineTo(-6 + Math.cos(1.1) * 32, Math.sin(1.1) * 32); c.lineWidth = 2; c.strokeStyle = '#f2ead0'; c.stroke();
      break;
    case 'crossbow':
      shaft(44, 8, -6);
      c.beginPath(); c.arc(8, 0, 30, -1.2, 1.2); stroke2(c, 6, head);
      c.beginPath(); c.moveTo(8 + Math.cos(-1.2) * 30, Math.sin(-1.2) * 30); c.lineTo(8, 0); c.lineTo(8 + Math.cos(1.2) * 30, Math.sin(1.2) * 30); c.lineWidth = 2; c.strokeStyle = '#f2ead0'; c.stroke();
      break;
    case 'shield':
      c.beginPath(); c.arc(8, 0, 28, -1.35, 1.35); c.closePath(); ink(c, head, 4.5);
      c.beginPath(); c.arc(8, 0, 18, -1.25, 1.25); c.closePath(); c.fillStyle = light; c.fill();
      circle(c, 22, 0, 5); ink(c, shade(head, -.2), 3);
      break;
    case 'wrench':
      shaft(44, 7);
      c.beginPath(); c.arc(50, 0, 13, .7, TAU - .7); c.lineTo(58, -4); c.lineTo(58, 4); c.closePath(); ink(c, head, 4);
      break;
    case 'appletor':
      // a stubby launcher with an apple loaded in the mouth
      c.beginPath(); c.roundRect(-4, -10, 46, 20, 8); ink(c, item.tier === 'gold' ? head : '#c9813e', 4);
      c.beginPath(); c.roundRect(2, -6, 30, 6, 3); c.fillStyle = '#ffffff55'; c.fill();
      c.save(); c.translate(32, 0); drawFoodIcon(c, 'apple', .8); c.restore();
      break;
    case 'slingshot':
      c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 0); c.moveTo(22, 0); c.lineTo(38, -14); c.moveTo(22, 0); c.lineTo(38, 14);
      stroke2(c, 6, item.tier === 'gold' ? head : HANDLE);
      c.beginPath(); c.moveTo(38, -14); c.quadraticCurveTo(26, 0, 38, 14); c.lineWidth = 2.5; c.strokeStyle = '#e04a3d'; c.stroke();
      circle(c, 28, 0, 5); ink(c, '#a5a09a', 2.5);
      break;
    case 'food':
      drawFoodIcon(c, item.icon);
      break;
    default: break;
  }
  c.restore();
}

// Food icons are drawn centred on (16, 0) so they sit in the hand.
function drawFoodIcon(c, kind, k = 1) {
  c.save(); c.translate(16, 0); c.scale(k, k);
  switch (kind) {
    case 'cookie':
      circle(c, 0, 0, 13); ink(c, '#d49b52', 3.5);
      for (const [x, y] of [[-4, -4], [4, 2], [-2, 5], [5, -6]]) { circle(c, x, y, 2.4); c.fillStyle = '#5a3418'; c.fill(); }
      break;
    case 'waffle':
      c.beginPath(); c.roundRect(-13, -13, 26, 26, 6); ink(c, '#e4a94a', 3.5);
      c.strokeStyle = '#b77b28'; c.lineWidth = 2.5;
      for (const v of [-5, 4]) { c.beginPath(); c.moveTo(v, -11); c.lineTo(v, 11); c.moveTo(-11, v); c.lineTo(11, v); c.stroke(); }
      break;
    case 'sandwich':
      c.beginPath(); c.moveTo(-14, 10); c.lineTo(14, 10); c.lineTo(0, -14); c.closePath(); ink(c, '#f0d29a', 3.5);
      c.beginPath(); c.moveTo(-9, 6); c.lineTo(9, 6); c.lineWidth = 3; c.strokeStyle = '#6bbf4a'; c.stroke();
      c.beginPath(); c.moveTo(-6, 1); c.lineTo(6, 1); c.strokeStyle = '#e0533d'; c.stroke();
      break;
    case 'steak':
      blobPath(c, 0, 0, 13, .2, 6, .15); ink(c, '#b3473a', 3.5);
      ellipse(c, -3, -2, 6, 4); c.fillStyle = '#f2d6c8'; c.fill();
      c.beginPath(); c.moveTo(8, 4); c.lineTo(16, 10); stroke2(c, 3, '#f4ead2');
      break;
    case 'toffee':
      ellipse(c, 0, 0, 10, 8); ink(c, '#d77a2e', 3.5);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 9, 0); c.lineTo(s * 16, -6); c.lineTo(s * 16, 6); c.closePath(); ink(c, '#f2c94a', 2.5); }
      break;
    case 'cake':
      c.beginPath(); c.moveTo(-14, 10); c.lineTo(14, 10); c.lineTo(14, -2); c.lineTo(-14, -10); c.closePath(); ink(c, '#f5d7a8', 3.5);
      c.beginPath(); c.moveTo(-14, -4); c.lineTo(14, 4); c.lineWidth = 3; c.strokeStyle = '#f08aaa'; c.stroke();
      circle(c, -7, -12, 4); ink(c, '#e0463d', 2.5);
      break;
    case 'soup':
      circle(c, 0, 0, 14); ink(c, '#d9d2c4', 3.5);
      circle(c, 0, 0, 10); c.fillStyle = '#c27a3e'; c.fill();
      for (const [x, y] of [[-3, -3], [4, 2]]) { ellipse(c, x, y, 4, 3); ink(c, '#9d86ea', 2); }
      break;
    case 'meatballs':
      for (const [x, y] of [[-6, 4], [6, 4], [0, -6]]) { circle(c, x, y, 7.5); ink(c, '#8a4b2f', 3); circle(c, x - 2, y - 2, 2.5); c.fillStyle = '#c2785a'; c.fill(); }
      break;
    case 'roll':
      circle(c, 0, 0, 13); ink(c, '#f2c27a', 3.5);
      c.beginPath(); for (let i = 0; i < 26; i++) { const a = i * .5, rr = 2 + i * .35; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.lineWidth = 2.5; c.strokeStyle = '#a0522d'; c.stroke();
      break;
    default:
      circle(c, 0, 0, 12); ink(c, '#e0463d', 3.5);
      circle(c, -4, -4, 3.5); c.fillStyle = '#ff8f86'; c.fill();
      c.beginPath(); c.moveTo(0, -12); c.lineTo(2, -18); c.lineWidth = 3; c.strokeStyle = OUTLINE; c.stroke();
      ellipse(c, 7, -15, 5, 2.5, -.4); ink(c, '#76b53f', 2);
  }
  c.restore();
}

// ---------- players ----------

export const FURS = ['#e7c08f', '#c98d5a', '#f1dcc0', '#9c6b48', '#d9a46f', '#bfa38a', '#e9b77d', '#a77b5b'];
const TWO_HANDED = new Set(['spear', 'naginata', 'hammer', 'pickaxe', 'axe', 'labrys', 'katana']);
const RANGED = new Set(['bow', 'crossbow', 'appletor', 'slingshot']);
const DUAL = new Set(['dagger', 'cleaver']);

export function drawPlayer(c, p, time, opts = {}) {
  const fur = FURS[p.skin % FURS.length] || FURS[0];
  const line = OUTLINE;
  const R = p.r || 35;
  const swingT = time - (p.actionAt ?? -9);
  const item = ITEM_BY_ID.get(p.held);
  const shape = item?.shape;
  const ranged = RANGED.has(shape);
  const dur = Math.max(.16, Math.min(.36, (item?.reload || .4) * .7));
  const k = swingT >= 0 && swingT < dur ? swingT / dur : 1;
  // swing: wind back then sweep forward through the aim line
  const sweep = k < 1 ? (k < .3 ? -k / .3 * .9 : -.9 + ((k - .3) / .7) * 2.0) * (1 - k * .4) : 0;
  c.save();
  c.translate(p.x, p.y);
  if (opts.hurt) c.translate(Math.sin(time * 90) * 2.5, 0);
  if (opts.alpha !== undefined) c.globalAlpha = opts.alpha;
  ellipse(c, 0, 9, R * .95, R * .75); c.fillStyle = SHADOW; c.fill();
  c.rotate(p.angle);

  // ears sit behind the head
  for (const side of [-1, 1]) {
    circle(c, -R * .42, side * R * .64, R * .3); ink(c, fur, 4, line);
    circle(c, -R * .42, side * R * .64, R * .15); c.fillStyle = shade(fur, -.2); c.fill();
  }
  // body
  circle(c, 0, 0, R); ink(c, fur, 5, line);
  circle(c, -R * .1, -R * .12, R * .62); c.fillStyle = shade(fur, .18); c.fill();
  circle(c, 0, 0, R); c.lineWidth = 5; c.strokeStyle = line; c.stroke();
  // muzzle hint in front
  ellipse(c, R * .62, 0, R * .22, R * .3); c.fillStyle = shade(fur, .35); c.fill();
  circle(c, R * .78, 0, 4.5); c.fillStyle = line; c.fill();
  const handR = R * .32;
  if (opts.flash) { circle(c, 0, 0, R); c.fillStyle = 'rgba(255,60,40,.35)'; c.fill(); }

  // right hand + weapon
  c.save();
  if (!ranged && shape !== 'fist' && shape !== 'shield') c.rotate(sweep);
  if (item && shape !== 'food' && shape !== 'fist') {
    if (DUAL.has(shape)) {
      const jab = k < 1 ? Math.sin(k * Math.PI) * 14 : 0;
      c.save(); c.translate(R * .55 + jab, R * .78); drawTool(c, p.held); c.restore();
      c.save(); c.translate(R * .55 + (k < 1 ? Math.sin(Math.min(1, k * 1.4) * Math.PI) * 10 : 0), -R * .78); drawTool(c, p.held); c.restore();
    } else if (ranged) {
      c.save(); c.translate(R * 1.02, 0); drawTool(c, p.held); c.restore();
    } else if (shape === 'shield') {
      const bash = k < 1 ? Math.sin(k * Math.PI) * 12 : 0;
      c.save(); c.translate(R * .55 + bash, 0); drawTool(c, p.held); c.restore();
    } else {
      c.save(); c.translate(TWO_HANDED.has(shape) ? R * .25 : R * .45, R * .78); c.rotate(TWO_HANDED.has(shape) ? -.25 : -.55); drawTool(c, p.held); c.restore();
    }
  }
  const pull = ranged && k < 1 ? Math.sin(k * Math.PI) * 10 : 0;
  // bare fist: a straight punch
  const punch = shape === 'fist' && k < 1 ? Math.sin(k * Math.PI) * R * .7 : 0;
  circle(c, R * .7 - pull + punch, R * .72 - punch * .6, handR); ink(c, fur, 4, line);
  c.restore();
  // left hand (holds food when eating)
  c.save();
  if (shape === 'food') {
    const bite = k < 1 ? Math.sin(k * Math.PI) : 0;
    c.save(); c.translate(R * .55 - bite * 18, -R * .9 + bite * 22); drawTool(c, p.held, .95); c.restore();
  }
  const lift = k < 1 && !ranged && shape !== 'fist' ? Math.sin(k * Math.PI) * 6 : 0;
  circle(c, R * .7, -R * .72 + lift, handR); ink(c, fur, 4, line);
  c.restore();

  if (p.hat && p.hat !== 'none') drawHat(c, p.hat, R, time);
  c.restore();
  if (opts.shield) {
    c.save(); c.globalAlpha = .35 + Math.sin(time * 6) * .1;
    circle(c, p.x, p.y, R + 10); c.lineWidth = 4; c.strokeStyle = '#bfe8ff'; c.stroke(); c.restore();
  }
}

export function drawHat(c, hat, R, time = 0) {
  switch (hat) {
    case 'leaf':
      for (let i = 0; i < 3; i++) { c.save(); c.rotate(-.5 + i * .5); ellipse(c, -R * .25, 0, R * .55, R * .2); ink(c, '#7bc043', 3.5); c.restore(); }
      break;
    case 'crown':
      starPath(c, -R * .1, 0, R * .58, R * .36, 5, time * .3, .2); ink(c, '#f5c542', 3.5);
      circle(c, -R * .1, 0, R * .14); ink(c, '#e2405a', 3);
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; circle(c, -R * .1 + Math.cos(a) * 9, Math.sin(a) * 9, 7); ink(c, '#f28bb3', 3); }
      circle(c, -R * .1, 0, 6); ink(c, '#ffd54a', 3);
      break;
    case 'horns':
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(-R * .1, side * R * .4); c.quadraticCurveTo(R * .4, side * R * 1.1, R * .5, side * R * .55); stroke2(c, 5, '#efe2c2'); }
      break;
    case 'beanie':
      c.beginPath(); c.arc(0, 0, R * .9, Math.PI * .55, Math.PI * 1.45); c.closePath(); ink(c, '#3f7fd1', 4);
      circle(c, -R * .78, 0, 7); ink(c, '#f3f3f3', 3);
      break;
    case 'miner':
      c.beginPath(); c.arc(0, 0, R * .88, Math.PI * .5, Math.PI * 1.5); c.closePath(); ink(c, '#f2c230', 4);
      c.beginPath(); c.roundRect(R * .1, -R * .2, R * .3, R * .4, 4); ink(c, '#e6e6e6', 3);
      c.save(); c.globalAlpha = .35; c.beginPath(); c.moveTo(R * .4, -R * .15); c.lineTo(R * 1.6, -R * .6); c.lineTo(R * 1.6, R * .6); c.lineTo(R * .4, R * .15); c.closePath(); c.fillStyle = '#fff6b0'; c.fill(); c.restore();
      break;
    case 'tamer':
      ellipse(c, -R * .1, 0, R * .75, R * .8); ink(c, '#4f8a2f', 4);
      ellipse(c, R * .45, 0, R * .3, R * .6); ink(c, '#3d6f22', 3.5);
      circle(c, -R * .2, 0, R * .2); ink(c, '#f2d16b', 3);
      break;
    case 'knight':
      circle(c, 0, 0, R * .9); ink(c, '#b8c0c6', 4);
      c.beginPath(); c.roundRect(R * .3, -R * .5, R * .16, R, 3); c.fillStyle = '#4a5157'; c.fill();
      c.beginPath(); c.moveTo(-R * .9, 0); c.lineTo(-R * .1, 0); stroke2(c, 6, '#e2405a');
      break;
    default: break;
  }
}

// ---------- animals ----------

export function animalScale(a) { return (a.r || 40) / 27; }

export function drawAnimal(c, a, time, opts = {}) {
  if (a.boss) return drawBoss(c, a, time, opts);
  const def = PET_BY_ID.get(a.species);
  if (!def) return;
  const scale = animalScale(a);
  const walk = a.moving ? Math.sin(time * 14 + (idSeed(a.id) % 7)) : 0;
  c.save();
  c.translate(a.x, a.y);
  if (opts.hurt) c.translate(Math.sin(time * 90) * 2.5, 0);
  c.scale(scale, scale);
  ellipse(c, 0, 10, 30, 22); c.fillStyle = SHADOW; c.fill();
  if (a.angry && !a.owner) { circle(c, 0, 0, 36); c.lineWidth = 3; c.strokeStyle = 'rgba(226,65,59,.55)'; c.stroke(); }
  c.rotate(a.angle);
  drawCreature(c, def, a.sleep, walk, time - (a.attackAt ?? -9), time);
  if (opts.flash) { circle(c, 0, 0, 28); c.fillStyle = 'rgba(255,60,40,.3)'; c.fill(); }
  c.restore();
  if (a.sleep) {
    const t = time * 1.4 + (idSeed(a.id) % 10);
    c.save(); c.font = '800 18px "Baloo 2", sans-serif'; c.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const ph = (t + i * .5) % 1;
      c.globalAlpha = 1 - ph; c.lineWidth = 4; c.strokeStyle = OUTLINE; c.fillStyle = '#ffffff';
      const zx = a.x + 18 * scale + ph * 14, zy = a.y - 24 * scale - ph * 22;
      c.strokeText('z', zx, zy); c.fillText('z', zx, zy);
    }
    c.restore();
  }
}

const NO_LEGS = new Set(['bird', 'serpent', 'fish', 'insect', 'bat', 'seal', 'spider', 'crab', 'scorpion']);

// One generic chunky top-down creature, specialised by body template.
export function drawCreature(c, def, sleeping, walk = 0, attackT = 9, time = 0) {
  const { color: fill, accent, body } = def;
  const lunge = attackT >= 0 && attackT < .25 ? Math.sin(attackT / .25 * Math.PI) * 8 : 0;
  const light = shade(fill, .18), dark = shade(fill, -.22);
  const lw = 4;
  // legs
  if (!NO_LEGS.has(body)) {
    for (const [x, y, ph] of [[12, 15, 1], [12, -15, -1], [-13, 15, -1], [-13, -15, 1]]) {
      ellipse(c, x + walk * 3 * ph, y, 7, 6); ink(c, dark, 3.5);
    }
  }
  if (body === 'spider' || body === 'crab' || body === 'scorpion') {
    // jointed legs out to the sides
    for (let i = 0; i < (body === 'spider' ? 4 : 3); i++) {
      for (const side of [-1, 1]) {
        const x = 8 - i * 8, w = walk * 3 * (i % 2 ? 1 : -1) * side;
        c.beginPath(); c.moveTo(x, side * 8); c.lineTo(x + 4 + w, side * 22); c.lineTo(x - 2 + w, side * 30);
        stroke2(c, 3, body === 'crab' ? fill : dark);
      }
    }
  }
  // tail
  c.save();
  c.rotate(Math.sin(time * 3.3) * .2);
  if (body === 'fox' || body === 'canine') {
    ellipse(c, -30, 0, 16, 9); ink(c, fill, lw); ellipse(c, -40, 0, 6, 6); c.fillStyle = body === 'canine' ? accent : '#fff7ea'; c.fill();
  } else if (body === 'cat' || body === 'lizard' || body === 'rodent') {
    c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(-34, 10, -40, -4); stroke2(c, 5, body === 'rodent' ? '#e9a8a0' : fill);
  } else if (body === 'bird') {
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(-32, -9); c.lineTo(-32, 9); c.closePath(); ink(c, accent, lw);
  } else if (body === 'serpent') {
    c.beginPath(); c.moveTo(-10, 0); c.bezierCurveTo(-26, -16, -36, 16, -52, 0); stroke2(c, 13, fill);
  } else if (body === 'fish') {
    c.beginPath(); c.moveTo(-18, 0); c.lineTo(-36, -13); c.lineTo(-31, 0); c.lineTo(-36, 13); c.closePath(); ink(c, fill, lw);
  } else if (body === 'seal') {
    c.beginPath(); c.moveTo(-22, 0); c.lineTo(-34, -10); c.lineTo(-30, 0); c.lineTo(-34, 10); c.closePath(); ink(c, dark, lw);
  } else if (body === 'scorpion') {
    // segmented tail curling forward over the back
    c.restore(); c.save();
    const segs = [[-18, 0], [-28, 0], [-34, -8], [-30, -18], [-20, -22]];
    for (const [x, y] of segs) { circle(c, x, y, 6); ink(c, fill, 3); }
    c.beginPath(); c.moveTo(-20, -27); c.lineTo(-10, -26); c.lineTo(-18, -18); c.closePath(); ink(c, accent, 3);
  } else if (!['spider', 'crab', 'bat', 'insect'].includes(body)) {
    circle(c, -24, 0, 5); ink(c, fill, 3);
  }
  c.restore();
  // wings
  if (body === 'bird' || body === 'insect' || body === 'bat') {
    const flap = sleeping ? 0 : Math.sin(time * 11) * .25;
    for (const side of [-1, 1]) {
      c.save(); c.rotate(side * (.35 + flap));
      if (body === 'bat') {
        c.beginPath(); c.moveTo(0, side * 6); c.lineTo(-6, side * 34); c.lineTo(-12, side * 26); c.lineTo(-18, side * 32); c.lineTo(-16, side * 8); c.closePath(); ink(c, fill, 3.5);
      } else { ellipse(c, -4, side * 20, 15, 10); ink(c, body === 'insect' ? accent : accent, lw); }
      c.restore();
    }
  }
  if (body === 'seal') {
    for (const side of [-1, 1]) { ellipse(c, 4, side * 18, 10, 5, side * .6); ink(c, dark, 3.5); }
  }
  // body
  c.save(); c.translate(lunge, 0);
  if (body === 'turtle') {
    ellipse(c, 0, 0, 26, 22); ink(c, accent, lw);
    blobPath(c, -2, 0, 14, .3, 6, .05); c.fillStyle = shade(accent, .2); c.fill();
    c.strokeStyle = shade(accent, -.3); c.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) { const ang = i / 6 * TAU; c.beginPath(); c.moveTo(Math.cos(ang) * 14, Math.sin(ang) * 14); c.lineTo(Math.cos(ang) * 24, Math.sin(ang) * 20); c.stroke(); }
  } else if (body === 'hedgehog') {
    starPath(c, -4, 0, 28, 18, 14, 0, .05); ink(c, accent, 3.5);
    ellipse(c, -2, 0, 19, 16); ink(c, fill, lw);
    ellipse(c, -4, -3, 11, 7); c.fillStyle = light; c.fill();
  } else if (body === 'spider') {
    circle(c, -10, 0, 16); ink(c, fill, lw);
    for (const [x, y] of [[-12, -5], [-6, 5]]) { circle(c, x, y, 3.5); c.fillStyle = accent; c.fill(); }
  } else if (body === 'crab') {
    ellipse(c, -2, 0, 18, 24); ink(c, fill, lw);
    ellipse(c, -4, -4, 10, 12); c.fillStyle = light; c.fill();
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(8, side * 14); c.lineTo(20, side * 22); stroke2(c, 4, fill);
      c.save(); c.translate(26, side * 22); c.rotate(side * -.4);
      c.beginPath(); c.arc(0, 0, 9, .6, TAU - .6); c.lineTo(0, 0); c.closePath(); ink(c, fill, 3.5); c.restore();
    }
  } else if (body === 'scorpion') {
    ellipse(c, -4, 0, 18, 13); ink(c, fill, lw);
    c.strokeStyle = shade(fill, -.3); c.lineWidth = 2.5;
    for (const x of [-12, -4, 4]) { c.beginPath(); c.moveTo(x, -10); c.lineTo(x, 10); c.stroke(); }
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(10, side * 8); c.lineTo(22, side * 18); stroke2(c, 4, fill);
      c.save(); c.translate(28, side * 18); c.beginPath(); c.arc(0, 0, 7, .7, TAU - .7); c.lineTo(0, 0); c.closePath(); ink(c, accent, 3); c.restore();
    }
  } else {
    const big = body === 'bear' || body === 'boar';
    const bw = body === 'serpent' ? 18 : body === 'seal' ? 27 : big ? 25 : 22;
    const bh = body === 'serpent' ? 13 : body === 'seal' ? 16 : big ? 21 : 17;
    ellipse(c, -2, 0, bw, bh); ink(c, fill, lw);
    ellipse(c, -4, -3, bw * .65, bh * .5); c.fillStyle = light; c.fill();
    if (body === 'goat') { ellipse(c, -6, 0, 11, 10); ink(c, shade(fill, .1), 3); }
    if (body === 'fish') { c.beginPath(); c.moveTo(-6, 0); c.lineTo(-18, -4); c.lineTo(4, -2); c.closePath(); ink(c, dark, 3); }
    if (def.pattern === 'stripes') {
      c.strokeStyle = accent; c.lineWidth = 4;
      for (const x of [-12, -3, 6]) { c.beginPath(); c.moveTo(x, -bh * .7); c.lineTo(x + 2, bh * .7); c.stroke(); }
    } else if (def.pattern === 'spots') {
      for (const [x, y] of [[-10, 6], [2, -8], [6, 7]]) { circle(c, x, y, 4); c.fillStyle = accent; c.fill(); }
    } else if (def.pattern === 'flame') {
      for (let i = 0; i < 5; i++) { c.save(); c.rotate(Math.PI + (i - 2) * .45); c.beginPath(); c.moveTo(10, -6); c.quadraticCurveTo(30 + Math.sin(time * 8 + i) * 4, 0, 10, 6); c.closePath(); ink(c, i % 2 ? '#ffd23f' : '#ff8a2a', 3); c.restore(); }
    }
  }
  // head
  const hx = body === 'serpent' ? 18 : body === 'spider' ? 8 : body === 'crab' ? 12 : body === 'scorpion' ? 14 : 20;
  const hr = body === 'bird' ? 12 : body === 'bear' ? 15 : body === 'spider' ? 9 : body === 'crab' || body === 'scorpion' ? 0 : 14;
  // ears
  if (body === 'fox' || body === 'canine' || body === 'cat') {
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(hx - 6, side * 6); c.lineTo(hx - 12, side * 19); c.lineTo(hx + 2, side * 12); c.closePath(); ink(c, fill, 3.5); }
  } else if (body === 'rabbit') {
    for (const side of [-1, 1]) { ellipse(c, hx - 16, side * 9, 14, 6, side * .3); ink(c, fill, 3.5); ellipse(c, hx - 16, side * 9, 9, 2.5, side * .3); c.fillStyle = accent; c.fill(); }
  } else if (body === 'bear' || body === 'rodent' || body === 'boar' || body === 'hedgehog') {
    for (const side of [-1, 1]) { circle(c, hx - 6, side * 12, 6); ink(c, fill, 3.5); }
  } else if (body === 'deer') {
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(hx - 4, side * 5); c.lineTo(hx - 18, side * 18); c.lineTo(hx - 24, side * 12); c.moveTo(hx - 12, side * 12); c.lineTo(hx - 10, side * 24);
      stroke2(c, 4, accent);
    }
  } else if (body === 'bat') {
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(hx - 4, side * 5); c.lineTo(hx - 10, side * 16); c.lineTo(hx + 2, side * 9); c.closePath(); ink(c, fill, 3); }
  }
  if (hr) {
    circle(c, hx, 0, hr); ink(c, fill, lw);
    circle(c, hx - 2, -3, hr * .55); c.fillStyle = light; c.fill();
  }
  if (body === 'boar') {
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(hx + 8, side * 6); c.quadraticCurveTo(hx + 18, side * 12, hx + 14, side * 2); stroke2(c, 3, '#fff4dc'); }
  }
  if (body === 'bird') { c.beginPath(); c.moveTo(hx + 9, -5); c.lineTo(hx + 22, 0); c.lineTo(hx + 9, 5); c.closePath(); ink(c, '#f2a33a', 3); }
  else if (body === 'spider') { for (const side of [-1, 1]) { c.beginPath(); c.moveTo(hx + 6, side * 4); c.lineTo(hx + 14, side * 2); stroke2(c, 2, accent); } }
  else if (hr) { ellipse(c, hx + 9, 0, 6, 7); c.fillStyle = shade(fill, .3); c.fill(); circle(c, hx + 13, 0, 3); c.fillStyle = OUTLINE; c.fill(); }
  // eyes
  const ex = hr ? hx + 4 : hx + 2, ey = body === 'spider' ? 3.5 : 6, er = body === 'spider' ? 2.4 : 3.6;
  for (const side of [-1, 1]) {
    if (sleeping) {
      c.beginPath(); c.arc(ex, side * ey, er * .95, .2, Math.PI - .2); c.lineWidth = 2.6; c.strokeStyle = OUTLINE; c.stroke();
    } else {
      if (!hr) { circle(c, ex, side * ey, er + 2.5); ink(c, '#fff', 2.5); }
      circle(c, ex, side * ey, er); c.fillStyle = OUTLINE; c.fill();
      circle(c, ex + 1, side * ey - 1.2, er * .36); c.fillStyle = '#fff'; c.fill();
    }
  }
  c.restore();
}

// ---------- bosses ----------

export function drawBoss(c, a, time, opts = {}) {
  const def = BOSS_BY_ID.get(a.boss);
  if (!def) return;
  const R = a.r || 120;
  const t = time - (a.attackAt ?? -9);
  const slam = t >= 0 && t < .5 ? Math.sin(t / .5 * Math.PI) : 0;
  const s = idSeed(a.boss);
  c.save(); c.translate(a.x, a.y);
  if (opts.hurt) c.translate(Math.sin(time * 90) * 3, 0);
  ellipse(c, 0, 16, R * 1.05, R * .8); c.fillStyle = SHADOW; c.fill();
  // attack telegraph: the sweep arc lights up as it lands
  if (slam > 0) {
    c.save(); c.rotate(a.angle); c.globalAlpha = slam * .35;
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R + def.reach * .7, -1.3, 1.3); c.closePath(); c.fillStyle = '#ff5a3a'; c.fill(); c.restore();
  }
  c.rotate(a.angle);
  const fill = def.color, accent = def.accent, light = shade(fill, .2);
  const eyes = (x, gap, r) => {
    for (const side of [-1, 1]) {
      circle(c, x, side * gap, r); ink(c, '#fff', 4);
      circle(c, x + r * .3, side * gap, r * .5); c.fillStyle = OUTLINE; c.fill();
      c.beginPath(); c.moveTo(x - r * 1.1, side * (gap - r * 1.2)); c.lineTo(x + r * 1.1, side * (gap - r * .3)); stroke2(c, 4, fill);
    }
  };
  switch (def.body) {
    case 'treant': {
      for (let i = 0; i < 6; i++) {
        c.save(); c.rotate(i / 6 * TAU + Math.sin(time * 1.5 + i) * .06 + (i === 0 || i === 1 ? -slam * .4 : 0));
        c.beginPath(); c.moveTo(R * .4, 0); c.quadraticCurveTo(R * .9, R * .1, R * 1.2, -R * .05); stroke2(c, R * .14, fill);
        c.restore();
      }
      starPath(c, 0, 0, R * .95, R * .62, 7, hash(s) * TAU); ink(c, accent, 6, '#2f4a14');
      starPath(c, -R * .05, -R * .07, R * .6, R * .38, 7, hash(s) * TAU + .2); c.fillStyle = shade(accent, .2); c.fill();
      circle(c, R * .2, 0, R * .42); ink(c, fill, 6);
      eyes(R * .35, R * .16, R * .1);
      break;
    }
    case 'golem': {
      // each golem gets its own silhouette on top of the shared rock body
      if (a.boss === 'frost-golem') {
        for (let i = 0; i < 5; i++) {
          const ang = Math.PI * (.62 + i * .19), d = R * .7, h = R * (.42 + hash(s + i) * .25);
          c.save(); c.translate(Math.cos(ang) * d, Math.sin(ang) * d); c.rotate(ang);
          c.beginPath(); c.moveTo(-R * .1, -R * .11); c.lineTo(h, 0); c.lineTo(-R * .1, R * .11); c.closePath(); ink(c, '#d9f6ff', 5);
          c.beginPath(); c.moveTo(0, -R * .04); c.lineTo(h * .7, 0); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
          c.restore();
        }
      } else if (a.boss === 'sand-colossus') {
        for (const side of [-1, 1]) {
          c.beginPath(); c.moveTo(R * .2, side * R * .5); c.quadraticCurveTo(R * .3, side * R * 1.05, R * .85, side * R * .95);
          c.quadraticCurveTo(R * .5, side * R * .8, R * .45, side * R * .4); c.closePath(); ink(c, '#f3e2bd', 5);
        }
      } else if (a.boss === 'magma-titan') {
        c.save(); c.globalAlpha = .35 + Math.sin(time * 3) * .1; circle(c, 0, 0, R * 1.08); c.fillStyle = accent; c.fill(); c.restore();
        for (let i = 0; i < 4; i++) {
          const ang = Math.PI * (.75 + i * .17);
          c.save(); c.rotate(ang);
          c.beginPath(); c.moveTo(R * .6, -R * .12); c.lineTo(R * 1.05, 0); c.lineTo(R * .6, R * .12); c.closePath(); ink(c, shade(fill, -.15), 5);
          c.restore();
        }
      }
      for (const side of [-1, 1]) {
        const reach = side === 1 ? slam * R * .35 : 0;
        blobPath(c, R * .45 + reach, side * R * .78, R * .3, hash(s + side), 6, .12); ink(c, fill, 6);
        blobPath(c, R * .5 + reach, side * R * .74, R * .14, hash(s + side + 4), 5, .15); c.fillStyle = light; c.fill();
      }
      blobPath(c, 0, 0, R * .82, hash(s), 7, .1); ink(c, fill, 6);
      blobPath(c, -R * .12, -R * .14, R * .5, hash(s + 2), 7, .14); c.fillStyle = light; c.fill();
      if (a.boss === 'magma-titan') {
        c.save(); c.shadowColor = accent; c.shadowBlur = 14;
        c.strokeStyle = accent; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-R * .62, -R * .3); c.lineTo(-R * .25, -R * .05); c.lineTo(-R * .45, R * .35);
        c.moveTo(-R * .25, -R * .05); c.lineTo(R * .1, -R * .42); c.moveTo(-R * .1, R * .25); c.lineTo(R * .2, R * .5); c.stroke();
        c.restore();
      } else if (a.boss === 'sand-colossus') {
        c.strokeStyle = shade(fill, -.18); c.lineWidth = 5; c.lineCap = 'round';
        for (const k of [-.35, 0, .35]) { c.beginPath(); c.arc(-R * 1.4, 0, R * (1.2 + k * .5), -.5, .5); c.stroke(); }
        circle(c, R * .1, 0, R * .16); ink(c, '#3fc7d6', 4);
      } else {
        c.strokeStyle = accent; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-R * .5, -R * .2); c.lineTo(-R * .2, 0); c.lineTo(-R * .4, R * .3); c.stroke();
        for (let i = 0; i < 3; i++) { const ang = hash(s + i * 7) * TAU, d = R * (.2 + hash(s + i) * .4); starPath(c, Math.cos(ang) * d, Math.sin(ang) * d, R * .07, R * .03, 4, 0); c.fillStyle = '#fff'; c.fill(); }
      }
      eyes(R * .45, R * .2, R * .1);
      break;
    }
    case 'mushroom': {
      c.save(); c.globalAlpha = .3 + Math.sin(time * 2) * .1; circle(c, 0, 0, R * 1.25); c.fillStyle = accent; c.fill(); c.restore();
      blobPath(c, 0, 0, R * .95, hash(s), 10, .05); ink(c, fill, 6, '#1a1433');
      circle(c, -R * .12, -R * .14, R * .6); c.fillStyle = light; c.fill();
      for (let i = 0; i < 8; i++) { const ang = hash(s + i * 3) * TAU, d = R * (.3 + hash(s + i) * .5); circle(c, Math.cos(ang) * d, Math.sin(ang) * d, R * .1); ink(c, '#f2ecff', 3.5, '#1a1433'); }
      eyes(R * .5, R * .22, R * .11);
      break;
    }
    case 'kraken': {
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * TAU, wav = Math.sin(time * 3 + i) * .3 + (i < 2 ? slam * .6 : 0);
        c.save(); c.rotate(ang);
        c.beginPath(); c.moveTo(R * .4, 0); c.bezierCurveTo(R * .8, R * .3 * wav, R * 1.0, -R * .3 * wav, R * 1.35, R * .1 * wav); stroke2(c, R * .12, fill);
        c.restore();
      }
      ellipse(c, -R * .05, 0, R * .7, R * .62); ink(c, fill, 6);
      ellipse(c, -R * .15, -R * .1, R * .4, R * .32); c.fillStyle = accent; c.fill();
      eyes(R * .35, R * .22, R * .12);
      break;
    }
    default:
      circle(c, 0, 0, R); ink(c, fill, 6);
  }
  if (opts.flash) { circle(c, 0, 0, R); c.fillStyle = 'rgba(255,60,40,.25)'; c.fill(); }
  c.restore();
  // a sleeping boss snores big Zs until someone strikes it
  if (a.sleep) {
    const t = time * .9 + (s % 10);
    c.save(); c.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const ph = (t + i / 3) % 1, size = 26 + i * 8;
      c.font = `800 ${size}px "Baloo 2", sans-serif`;
      c.globalAlpha = Math.min(1, (1 - ph) * 1.6); c.lineWidth = 6; c.strokeStyle = OUTLINE; c.fillStyle = '#ffffff';
      const zx = a.x + R * .55 + ph * 34 + i * 10, zy = a.y - R * .7 - ph * 48 - i * 16;
      c.strokeText('Z', zx, zy); c.fillText('Z', zx, zy);
    }
    c.restore();
  }
}

// ---------- structures ----------

export function drawStructure(c, s, time, opts = {}) {
  const item = ITEM_BY_ID.get(s.item);
  const tier = TIERS[item?.tier] || TIERS.wood;
  const hit = time - (s.hitAt ?? -9);
  c.save(); c.translate(s.x, s.y);
  if (hit >= 0 && hit < .15) c.translate(Math.sin(hit * 90) * 3, 0);
  if (opts.alpha !== undefined) c.globalAlpha = opts.alpha;
  const r = s.r;
  switch (item?.kind) {
    case 'wall':
      shadowed(c, () => { c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 10); }, 7);
      c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 10); ink(c, tier.color, 5);
      if (item.tier === 'wood') {
        c.strokeStyle = shade(tier.color, -.3); c.lineWidth = 3;
        for (const x of [-r / 3, r / 3]) { c.beginPath(); c.moveTo(x, -r + 4); c.lineTo(x, r - 4); c.stroke(); }
        c.beginPath(); c.roundRect(-r + 6, -r + 6, r * .5, r * 2 - 12, 4); c.fillStyle = tier.light + '88'; c.fill();
      } else {
        c.strokeStyle = shade(tier.color, -.35); c.lineWidth = 3;
        c.beginPath(); c.moveTo(-r + 3, 0); c.lineTo(r - 3, 0); c.moveTo(0, -r + 3); c.lineTo(0, 0); c.moveTo(-r / 2, 0); c.lineTo(-r / 2, r - 3); c.moveTo(r / 2, 0); c.lineTo(r / 2, r - 3); c.stroke();
        c.beginPath(); c.roundRect(-r + 6, -r + 6, r - 10, r - 10, 4); c.fillStyle = tier.light; c.fill();
        if (item.tier !== 'stone') { starPath(c, r * .45, r * .5, 9, 3, 4, 0, .1); c.fillStyle = '#ffffffcc'; c.fill(); }
      }
      break;
    case 'door':
      shadowed(c, () => { c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 14); }, 7);
      c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 14); ink(c, shade(tier.color, -.15), 5);
      c.beginPath(); c.roundRect(-r * .7, -r * .7, r * 1.4, r * 1.4, 10); ink(c, tier.color, 3.5);
      c.strokeStyle = shade(tier.color, -.3); c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, -r * .7); c.lineTo(0, r * .7); c.stroke();
      circle(c, r * .25, 0, 5); ink(c, '#f2c230', 2.5);
      if (opts.mine) { c.beginPath(); c.roundRect(-r * .7, -r * .7, r * 1.4, r * 1.4, 10); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill(); }
      break;
    case 'spike': {
      const n = item.big ? 10 : 8;
      shadowed(c, () => starPath(c, 0, 0, r * 1.2, r * .78, n, s.rot || 0, .05), 7);
      starPath(c, 0, 0, r * 1.2, r * .78, n, s.rot || 0, .05); ink(c, item.tier === 'wood' ? '#e6e0d0' : tier.light, 4.5);
      circle(c, 0, 0, r * .78); ink(c, tier.color, 4.5);
      circle(c, -r * .12, -r * .12, r * .45); c.fillStyle = tier.light; c.fill();
      break;
    }
    case 'windmill': {
      circle(c, 0, 0, r * .7); ink(c, tier.color, 5);
      circle(c, 0, 0, r * .45); c.fillStyle = tier.light; c.fill();
      c.rotate(time * (1.5 + (item.gold || 10) * .05));
      for (let i = 0; i < 4; i++) {
        c.rotate(TAU / 4);
        c.beginPath(); c.moveTo(4, -4); c.lineTo(r * 1.15, -12); c.lineTo(r * 1.15, 6); c.lineTo(4, 4); c.closePath(); ink(c, '#f2ead0', 3.5);
      }
      circle(c, 0, 0, 8); ink(c, HANDLE, 3.5);
      break;
    }
    case 'trap':
      circle(c, 0, 0, r); ink(c, '#6e6a62', 4);
      for (let i = 0; i < 10; i++) { c.save(); c.rotate(i / 10 * TAU); c.beginPath(); c.moveTo(r * .55, -4); c.lineTo(r * .95, 0); c.lineTo(r * .55, 4); c.closePath(); ink(c, '#cfcac0', 2.5); c.restore(); }
      circle(c, 0, 0, r * .4); ink(c, '#9c968b', 3);
      break;
    case 'heal':
      c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 12); ink(c, item.tier === 'gold' ? '#f2d98a' : '#d7c7a6', 4.5);
      c.beginPath(); c.roundRect(-r * .2, -r * .62, r * .4, r * 1.24, 3); c.roundRect(-r * .62, -r * .2, r * 1.24, r * .4, 3); c.fillStyle = '#e34b4b'; c.fill();
      c.globalAlpha *= .4 + Math.sin(time * 4) * .2; circle(c, 0, 0, r * .9); c.lineWidth = 3; c.strokeStyle = '#ff9c9c'; c.stroke();
      break;
    case 'boost':
      c.rotate(s.rot || 0);
      c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 10); ink(c, '#4c5566', 4.5);
      for (let i = -1; i <= 1; i++) {
        c.globalAlpha = .55 + .45 * Math.max(0, Math.sin(time * 8 - i * 1.2));
        c.beginPath(); c.moveTo(-r * .35 + i * r * .5, -r * .45); c.lineTo(r * .1 + i * r * .5, 0); c.lineTo(-r * .35 + i * r * .5, r * .45); c.lineWidth = 6; c.strokeStyle = '#5be0ff'; c.stroke();
      }
      break;
    case 'turret': {
      const recoil = time - (s.shotAt ?? -9) < .15 ? 6 : 0;
      circle(c, 0, 0, r); ink(c, shade(tier.color, -.2), 5);
      circle(c, 0, 0, r * .62); c.fillStyle = tier.color; c.fill();
      c.rotate(s.aim || 0);
      c.beginPath(); c.roundRect(-recoil, -8, r * 1.2, 16, 4); ink(c, '#4f4a44', 4);
      circle(c, 0, 0, r * .4); ink(c, tier.light, 4);
      break;
    }
    case 'tower': {
      circle(c, 0, 0, r); ink(c, '#7a6a55', 5);
      circle(c, 0, 0, r * .62); c.fillStyle = '#5c4b47'; c.fill();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + time * 2, f = .8 + Math.sin(time * 9 + i) * .2;
        c.save(); c.rotate(a); c.beginPath(); c.moveTo(0, -8); c.quadraticCurveTo(r * .55 * f, 0, 0, 8); c.closePath(); ink(c, i % 2 ? '#ffd23f' : '#ff7a2e', 2.5); c.restore();
      }
      circle(c, 0, 0, r * .18); c.fillStyle = '#fff2b0'; c.fill();
      break;
    }
    default:
      circle(c, 0, 0, r); ink(c, tier.color, 4);
  }
  c.restore();
}

// ---------- projectiles & hazards ----------

export function drawProjectile(c, j, time) {
  c.save(); c.translate(j.x, j.y); c.rotate(Math.atan2(j.vy, j.vx));
  switch (j.kind) {
    case 'arrow':
      c.beginPath(); c.moveTo(-26, 0); c.lineTo(10, 0); stroke2(c, 3, HANDLE);
      c.beginPath(); c.moveTo(18, 0); c.lineTo(8, -6); c.lineTo(8, 6); c.closePath(); ink(c, '#c4cace', 2.5);
      c.beginPath(); c.moveTo(-26, 0); c.lineTo(-32, -6); c.moveTo(-26, 0); c.lineTo(-32, 6); c.lineWidth = 3; c.strokeStyle = '#f2ead0'; c.stroke();
      break;
    case 'apple': c.rotate(time * 10); c.translate(-16, 0); drawFoodIcon(c, 'apple'); break;
    case 'pebble': circle(c, 0, 0, 8); ink(c, '#a5a09a', 3); break;
    case 'thorn':
      c.beginPath(); c.moveTo(20, 0); c.lineTo(-10, -9); c.lineTo(-4, 0); c.lineTo(-10, 9); c.closePath(); ink(c, '#7a4a2b', 3);
      break;
    case 'fireball':
      for (let i = 3; i > 0; i--) { circle(c, -i * 9, 0, 6 + i); c.fillStyle = `rgba(255,${120 + i * 30},40,${.25 + .1 * (3 - i)})`; c.fill(); }
      circle(c, 0, 0, 14); ink(c, '#ff7a2e', 3.5); circle(c, 2, -2, 7); c.fillStyle = '#ffe07a'; c.fill();
      break;
    default: circle(c, 0, 0, 9); ink(c, '#4f4a44', 3);
  }
  c.restore();
}

export function drawHazard(c, h, time) {
  const left = h.at - time;
  c.save(); c.translate(h.x, h.y);
  // warning ring that fills as the meteor nears
  const k = Math.max(0, Math.min(1, 1 - left / 1.6));
  circle(c, 0, 0, h.r); c.fillStyle = `rgba(255,70,30,${.12 + k * .18})`; c.fill();
  c.lineWidth = 4; c.setLineDash([16, 12]); c.lineDashOffset = -time * 40; c.strokeStyle = 'rgba(255,120,60,.85)'; c.stroke(); c.setLineDash([]);
  circle(c, 0, 0, h.r * k); c.fillStyle = 'rgba(255,90,40,.18)'; c.fill();
  if (left < .6) {
    const d = left / .6 * 420;
    c.translate(d * .6, -d);
    circle(c, 0, 0, 30); ink(c, '#5c3b33', 5);
    circle(c, -6, -6, 12); c.fillStyle = '#ff7b2e'; c.fill();
  }
  c.restore();
}

// ---------- ground ----------

/**
 * The ground under the camera. Each biome square has its own colour and
 * decor with a hard edge between them; `only` paints one biome everywhere
 * (the landing backdrop).
 */
export function drawGround(c, cam, viewW, viewH, time, only = null) {
  const L = cam.x - viewW / 2, T = cam.y - viewH / 2;
  if (only) { c.fillStyle = only.ground; c.fillRect(L - 2, T - 2, viewW + 4, viewH + 4); }
  else {
    // outside the map takes the colour of the nearest square, then gets darkened below
    BIOME_GRID.forEach((row, j) => row.forEach((id, i) => {
      const x0 = i === 0 ? L - 2 : i * BIOME_CELL, x1 = i === 2 ? L + viewW + 2 : (i + 1) * BIOME_CELL;
      const y0 = j === 0 ? T - 2 : j * BIOME_CELL, y1 = j === 2 ? T + viewH + 2 : (j + 1) * BIOME_CELL;
      const ax = Math.max(x0, L - 2), bx = Math.min(x1, L + viewW + 2), ay = Math.max(y0, T - 2), by = Math.min(y1, T + viewH + 2);
      if (bx > ax && by > ay) { c.fillStyle = BIOME_BY_ID[id].ground; c.fillRect(ax, ay, bx - ax, by - ay); }
    }));
  }
  const cell = 400;
  const x0 = Math.floor(L / cell) * cell, y0 = Math.floor(T / cell) * cell;
  for (let x = x0; x < L + viewW + cell; x += cell) {
    for (let y = y0; y < T + viewH + cell; y += cell) {
      const s = idSeed(`${x},${y}`);
      for (let i = 0; i < 5; i++) {
        const px = x + hash(s + i) * cell, py = y + hash(s + i * 7 + 1) * cell;
        const kind = hash(s + i * 3 + 2);
        const season = only || biomeAt(px, py), decor = season.decor;
        // keep each splash of decor on its own side of a biome edge
        const edge = only ? 999 : Math.min(...[px, py].map(v => Math.abs(v - Math.round(v / BIOME_CELL) * BIOME_CELL)));
        if (edge < 60) continue;
        if (season.tuft === 'wave' && kind < .5) {
          c.strokeStyle = decor; c.lineWidth = 6; c.lineCap = 'round';
          const off = Math.sin(time * 1.2 + px * .01) * 8;
          c.beginPath(); c.moveTo(px - 30 + off, py); c.quadraticCurveTo(px + off, py - 12, px + 30 + off, py); c.stroke();
          continue;
        }
        if (kind < .45) {
          blobPath(c, px, py, 30 + hash(s + i * 5) * 50, hash(s + i * 9), 7, .25);
          c.fillStyle = decor; c.fill();
        } else if (kind < .8) {
          c.save(); c.translate(px, py); c.rotate(hash(s + i * 11) * TAU);
          c.strokeStyle = decor; c.fillStyle = decor; c.lineCap = 'round'; c.lineJoin = 'round';
          if (season.tuft === 'swirl') { c.beginPath(); c.moveTo(-26, 0); c.quadraticCurveTo(0, -18, 26, 0); c.lineWidth = 6; c.stroke(); }
          else if (season.tuft === 'flake') { c.lineWidth = 4; for (let k = 0; k < 3; k++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.stroke(); } }
          else if (season.tuft === 'crack') {
            c.beginPath(); c.moveTo(-24, 0); c.lineTo(-6, 6); c.lineTo(8, -4); c.lineTo(24, 4); c.lineWidth = 7; c.stroke();
            c.strokeStyle = `rgba(255,123,46,${.5 + Math.sin(time * 2 + px) * .3})`; c.lineWidth = 3; c.stroke();
          } else { c.beginPath(); c.moveTo(-10, 6); c.lineTo(-4, -10); c.lineTo(0, 4); c.lineTo(5, -12); c.lineTo(10, 6); c.closePath(); c.fill(); }
          c.restore();
        } else {
          circle(c, px, py, 5 + hash(s + i) * 5); c.fillStyle = season.pebble; c.fill(); c.lineWidth = 3; c.strokeStyle = decor; c.stroke();
        }
      }
    }
  }
  // world edge: darkened border outside the playable square
  c.fillStyle = 'rgba(25,20,15,.55)';
  const R = L + viewW, B = T + viewH;
  if (L < 0) c.fillRect(L, T, -L, viewH);
  if (R > WORLD.w) c.fillRect(WORLD.w, T, R - WORLD.w, viewH);
  if (T < 0) c.fillRect(Math.max(0, L), T, Math.min(WORLD.w, R) - Math.max(0, L), -T);
  if (B > WORLD.h) c.fillRect(Math.max(0, L), WORLD.h, Math.min(WORLD.w, R) - Math.max(0, L), B - WORLD.h);
}

// ---------- world-space labels ----------

export function drawNameplate(c, x, y, name, frac, color, extra, extraColor = '#7b4fc9') {
  c.save();
  c.font = '800 17px "Baloo 2", "Trebuchet MS", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 5; c.strokeStyle = OUTLINE; c.lineJoin = 'round';
  if (name) { c.strokeText(name, x, y - 16); c.fillStyle = '#fff'; c.fillText(name, x, y - 16); }
  if (extra) {
    const w = c.measureText(name || '').width;
    c.font = '800 13px "Baloo 2", sans-serif';
    const tw = c.measureText(extra).width + 10;
    c.fillStyle = OUTLINE; c.beginPath(); c.roundRect(x - w / 2 - tw - 8, y - 28, tw + 4, 24, 7); c.fill();
    c.fillStyle = extraColor; c.beginPath(); c.roundRect(x - w / 2 - tw - 6, y - 26, tw, 20, 6); c.fill();
    c.fillStyle = '#fff'; c.fillText(extra, x - w / 2 - tw / 2 - 6, y - 16);
  }
  if (frac !== null && frac !== undefined) {
    const w = 64;
    c.fillStyle = OUTLINE; c.beginPath(); c.roundRect(x - w / 2 - 3, y - 3, w + 6, 12, 6); c.fill();
    c.fillStyle = color; c.beginPath(); c.roundRect(x - w / 2, y, Math.max(6, w * Math.max(0, Math.min(1, frac))), 6, 3); c.fill();
  }
  c.restore();
}

export function drawFloater(c, f, now) {
  const t = (now - f.at) / f.life;
  if (t < 0 || t > 1) return;
  c.save();
  const pop = t < .15 ? .6 + t / .15 * .6 : 1.2 - (t - .15) * .25;
  c.translate(f.x + f.vx * t * 30, f.y - t * 50);
  c.scale(pop, pop);
  c.globalAlpha = t > .7 ? 1 - (t - .7) / .3 : 1;
  c.font = `800 ${f.size || 22}px "Baloo 2", "Trebuchet MS", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 6; c.strokeStyle = OUTLINE; c.lineJoin = 'round';
  c.strokeText(f.text, 0, 0); c.fillStyle = f.color; c.fillText(f.text, 0, 0);
  c.restore();
}

export function drawParticle(c, p, now) {
  const t = (now - p.at) / p.life;
  if (t < 0 || t > 1) return;
  c.save();
  c.globalAlpha = 1 - t;
  const x = p.x + p.vx * t, y = p.y + p.vy * t + (p.grav ?? 40) * t * t;
  c.translate(x, y); c.rotate(p.spin * t);
  if (p.shape === 'leaf') { ellipse(c, 0, 0, p.size, p.size * .5); ink(c, p.color, 2.5); }
  else if (p.shape === 'ring') { c.globalAlpha = (1 - t) * .8; circle(c, 0, 0, p.size * (0.4 + t)); c.lineWidth = 6 * (1 - t); c.strokeStyle = p.color; c.stroke(); }
  else if (p.shape === 'spark') { starPath(c, 0, 0, p.size, p.size * .3, 4, 0, .1); c.fillStyle = p.color; c.fill(); }
  else if (p.shape === 'heart') {
    c.beginPath(); c.moveTo(0, p.size * .4); c.bezierCurveTo(-p.size, -p.size * .3, -p.size * .4, -p.size, 0, -p.size * .35); c.bezierCurveTo(p.size * .4, -p.size, p.size, -p.size * .3, 0, p.size * .4); ink(c, p.color, 2.5);
  } else { blobPath(c, 0, 0, p.size, .3, 5, .2); ink(c, p.color, 2.5); }
  c.restore();
}

// ---------- HUD icons (rendered once to small canvases) ----------

const iconCache = new Map();
const TOOL_LEN = { spear: 106, naginata: 120, katana: 86, sword: 72, bow: 50, crossbow: 54, dagger: 38, cleaver: 40, shield: 44, wrench: 64, appletor: 56, slingshot: 44, labrys: 70, axe: 66, pickaxe: 68, hammer: 64 };
export function itemIcon(itemId, size = 64) {
  const key = `${itemId}:${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const item = ITEM_BY_ID.get(itemId);
  c.translate(size / 2, size / 2);
  if (item?.kind) {
    const k = size / (item.r * 2.9);
    c.scale(k, k);
    drawStructure(c, { item: itemId, x: 0, y: 0, r: item.r, rot: 0 }, .3);
  } else if (item?.shape === 'food') {
    c.scale(size / 40, size / 40); c.translate(-16, 0); drawFoodIcon(c, item.icon);
  } else if (item?.shape === 'fist') {
    c.scale(size / 64, size / 64);
    circle(c, 0, 0, 17); ink(c, FURS[0], 4);
    c.strokeStyle = shade(FURS[0], -.3); c.lineWidth = 2.5;
    for (const y of [-6, 0, 6]) { c.beginPath(); c.moveTo(4, y); c.lineTo(14, y); c.stroke(); }
  } else if (item) {
    const len = TOOL_LEN[item.shape] || 66;
    const k = size / (len * 1.15);
    const flat = ['bow', 'crossbow', 'shield', 'appletor', 'slingshot'].includes(item.shape);
    c.rotate(flat ? -Math.PI / 4 : -Math.PI / 4); c.scale(k, k); c.translate(item.shape === 'bow' ? 6 : -len / 2, 0);
    drawTool(c, itemId);
  }
  iconCache.set(key, cv);
  return cv;
}

export function petPortrait(species, size = 64, stage = 1) {
  const key = `pet:${species}:${size}:${stage}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const def = PET_BY_ID.get(species);
  if (def) {
    c.translate(size / 2 + size * .04, size / 2);
    c.scale(size / 92, size / 92);
    c.rotate(-Math.PI / 2);
    drawCreature(c, def, false);
  }
  iconCache.set(key, cv);
  return cv;
}

export function bossPortrait(bossId, size = 64) {
  const key = `boss:${bossId}:${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.translate(size / 2, size / 2); c.scale(size / 300, size / 300);
  drawBoss(c, { boss: bossId, x: 0, y: 0, angle: -Math.PI / 2, r: 110 }, 0);
  iconCache.set(key, cv);
  return cv;
}

export { OUTLINE, TAU, shade, starPath, blobPath, circle, ink };
