// Builds the animated SVG artwork used in README.md (no dependencies).
//
//   node scripts/build-assets.mjs
//
// Inputs:  assets/avatar.jpg, assets/projects/*.jpg, assets/icons/*.svg (skillicons.dev),
//          assets/emoji/*.png (Microsoft Fluent Emoji, MIT)
// Output:  assets/svg/*.svg
//
// Everything is plain SVG + CSS/SMIL animation so it renders inside GitHub's <img> sandbox.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const OUT = join(ASSETS, 'svg');

const SANS = `'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Ubuntu, Roboto, Arial, sans-serif`;
const MONO = `'Cascadia Code', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace`;
const MONO_EM = 0.6; // advance width of one monospace glyph, in em

const C = {
  ink: '#050816', navy: '#0B1229', navy2: '#111C3D',
  cyan: '#22D3EE', sky: '#7DD3FC', blue: '#3B82F6', violet: '#8B5CF6', lilac: '#A78BFA',
  pink: '#F472B6', fuchsia: '#D946EF', gold: '#FBBF24', green: '#22C55E',
  text: '#E2E8F0', muted: '#94A3B8', dim: '#64748B',
};

const D2R = Math.PI / 180;
const n = (v) => Number(v.toFixed(2));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ease = 'calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"';

// Deterministic PRNG so rebuilding gives identical files (mulberry32).
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(join(ASSETS, file)).toString('base64')}`;

// skillicons.dev wraps each icon in an outer <svg>; lift the inner one into a <symbol>
// and prefix its ids so several icons can share one document.
function iconSymbol(name) {
  const raw = readFileSync(join(ASSETS, 'icons', `${name}.svg`), 'utf8');
  const inner = raw.match(/<g transform="translate\(0, 0\)">\s*(<svg[\s\S]*<\/svg>)\s*<\/g>/);
  if (!inner) throw new Error(`Unexpected icon format: ${name}`);
  const [, open, body] = inner[1].match(/^<svg([^>]*)>([\s\S]*)<\/svg>$/);
  if (/<script|<foreignObject|\son[a-z]+\s*=/i.test(body)) throw new Error(`Refusing unsafe icon markup: ${name}`);
  const viewBox = open.match(/viewBox="([^"]+)"/)[1];
  const ns = (id) => `ic-${name}-${id}`;
  const scoped = body
    .replace(/\sid="([^"]+)"/g, (_, id) => ` id="${ns(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${ns(id)})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${ns(id)}"`);
  return `<symbol id="ic-${name}" viewBox="${viewBox}">${scoped}</symbol>`;
}

const BASE_CSS = `
.sans{font-family:${SANS}}
.mono{font-family:${MONO};white-space:pre}
.tw{animation:tw 3s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}
.rise{animation:rise 1s cubic-bezier(.2,.8,.2,1) backwards}
@keyframes rise{from{opacity:0;transform:translateY(18px)}}
.fl{animation:fl 7s ease-in-out infinite}
@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.blink{animation:blink 1.05s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

function svgDoc({ width, height, title, defs = '', css = '', body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
<defs>${defs}</defs>
${body}
</svg>
`;
}

// ───────────────────────────── shared building blocks ─────────────────────────────

function stars(rand, count, { x0, y0, x1, y1 }) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<circle class="tw" cx="${n(x0 + rand() * (x1 - x0))}" cy="${n(y0 + rand() * (y1 - y0))}" r="${n(0.5 + rand() * 1.2)}" fill="#fff" style="animation-delay:-${n(rand() * 5)}s;animation-duration:${n(2.2 + rand() * 3)}s"/>`;
  }
  return out;
}

// Synthwave floor: lines fan out from a vanishing point, cross-lines rush toward the viewer.
function gridFloor({ id, width, horizon, bottom, vpX, color, spacing = 90, lines = 8, dur = 2.6 }) {
  const h = bottom - horizon;
  const defs = `<linearGradient id="${id}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="${horizon}" x2="0" y2="${bottom}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff" stop-opacity="1"/></linearGradient>
<mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="${horizon}" width="${width}" height="${h}"><rect x="0" y="${horizon}" width="${width}" height="${h}" fill="url(#${id}-fade)"/></mask>`;

  let body = `<g mask="url(#${id}-mask)" stroke="${color}" stroke-opacity=".6" stroke-width="1.2">`;
  const kMin = Math.ceil((-width - vpX) / spacing), kMax = Math.floor((2 * width - vpX) / spacing);
  for (let k = kMin; k <= kMax; k++) body += `<line x1="${vpX}" y1="${horizon}" x2="${vpX + k * spacing}" y2="${bottom}"/>`;
  body += '</g>';

  // y = horizon + h / z, with z sliding linearly from far to just past the viewer.
  const steps = 16, zFar = 14, zNear = 0.9;
  const ys = [], hs = [], ops = [];
  for (let i = 0; i <= steps; i++) {
    const z = zFar + (zNear - zFar) * (i / steps);
    ys.push(n(horizon + h / z));
    hs.push(n(0.6 + 1.8 * (i / steps)));
    ops.push(n(Math.min(1, i / (steps * 0.35))));
  }
  body += `<g mask="url(#${id}-mask)" fill="${color}">`;
  for (let j = 0; j < lines; j++) {
    const begin = `-${n((dur * j) / lines)}s`;
    body += `<rect x="0" y="${ys[Math.round((steps * j) / lines)]}" width="${width}" height="1.2"><animate attributeName="y" values="${ys.join(';')}" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="height" values="${hs.join(';')}" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/><animate attributeName="opacity" values="${ops.join(';')}" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/></rect>`;
  }
  body += '</g>';
  return { defs, body };
}

// A tilted elliptical orbit. Items travel along it; each is drawn twice — once behind the
// centre object and once in front, with the front copy shown only on the near half — and
// shrinks/dims on the far side, which sells the depth.
function orbit({ id, cx, cy, rx, ry, tilt, dur, reverse = false, items, far = 0.62, stroke, strokeWidth = 1.6, phase = 0, showPath = true }) {
  const t = tilt * D2R;
  const P = (a) => `${n(cx + rx * Math.cos(a) * Math.cos(t) - ry * Math.sin(a) * Math.sin(t))} ${n(cy + rx * Math.cos(a) * Math.sin(t) + ry * Math.sin(a) * Math.cos(t))}`;
  const sweep = reverse ? 0 : 1;
  const motion = `M${P(Math.PI / 2)}A${rx} ${ry} ${tilt} 0 ${sweep} ${P(1.5 * Math.PI)}A${rx} ${ry} ${tilt} 0 ${sweep} ${P(Math.PI / 2)}`;
  const half = (from, to, opacity) => (showPath ? `<path d="M${P(from)}A${rx} ${ry} ${tilt} 0 1 ${P(to)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}"/>` : '');
  const backPath = half(Math.PI, 2 * Math.PI, 0.35);
  const frontPath = half(0, Math.PI, 0.9);

  const copy = (item, i, front) => {
    const timing = `dur="${dur}s" begin="-${n((dur * i) / items.length + phase)}s" repeatCount="indefinite"`;
    const content = item.href
      ? `<use xlink:href="#${item.href}" x="${-item.size / 2}" y="${-item.size / 2}" width="${item.size}" height="${item.size}"/>`
      : item.raw;
    return `<g>${front ? `<animate attributeName="opacity" values="1;0;1" keyTimes="0;0.25;0.75" calcMode="discrete" ${timing}/>` : ''}<animateMotion path="${motion}" ${timing}/><g><animateTransform attributeName="transform" type="scale" values="1;${far};1" keyTimes="0;0.5;1" ${ease} ${timing}/><animate attributeName="opacity" values="1;0.5;1" keyTimes="0;0.5;1" ${ease} ${timing}/>${content}</g></g>`;
  };
  return {
    back: `<g id="${id}-back">${backPath}${items.map((it, i) => copy(it, i, false)).join('')}</g>`,
    front: `<g id="${id}-front">${frontPath}${items.map((it, i) => copy(it, i, true)).join('')}</g>`,
  };
}

function chipRow(chips, x, y, { h = 34, fs = 15, gap = 10, pad = 15, charW = 0.58, delay = 0.6, stroke = 'url(#chipStroke)' } = {}) {
  let cursor = x, out = '';
  chips.forEach((chip, i) => {
    const { label, dot } = typeof chip === 'string' ? { label: chip } : chip;
    const dotW = dot ? 16 : 0;
    const w = Math.round(label.length * fs * charW + pad * 2 + dotW);
    out += `<g class="rise" style="animation-delay:${n(delay + i * 0.08)}s"><rect x="${cursor}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#fff" fill-opacity=".05" stroke="${stroke}" stroke-width="1.2"/>`;
    if (dot) out += `<circle cx="${cursor + pad + 4}" cy="${y + h / 2}" r="4.5" fill="${dot}"/>`;
    out += `<text class="sans" x="${n(cursor + (w + dotW) / 2)}" y="${n(y + h / 2 + fs * 0.35)}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="${C.text}">${esc(label)}</text></g>`;
    cursor += w + gap;
  });
  return out;
}

// Chunky "3D" headline: a stack of darker copies behind a shimmering face.
function extrudedText({ x, y, text, size, fill, depth = 6, from = '#1E1B4B', to = '#5B21B6', anchor = 'start', glow = true }) {
  const attrs = `class="sans" font-size="${size}" font-weight="800" letter-spacing="-1" text-anchor="${anchor}"`;
  let out = glow ? `<text ${attrs} x="${x}" y="${y}" fill="${C.cyan}" opacity=".35" filter="url(#softGlow)">${esc(text)}</text>` : '';
  for (let k = depth; k >= 1; k--) {
    out += `<text ${attrs} x="${n(x + k * 0.9)}" y="${n(y + k * 1.1)}" fill="${mix(from, to, 1 - (k - 1) / Math.max(1, depth - 1))}">${esc(text)}</text>`;
  }
  return out + `<text ${attrs} x="${x}" y="${y}" fill="${fill}">${esc(text)}</text>`;
}

const SHIMMER = (id, x1, x2, dur = 6) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="0" x2="${x2}" y2="0" spreadMethod="repeat"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".25" stop-color="#A5F3FC"/><stop offset=".5" stop-color="#C4B5FD"/><stop offset=".75" stop-color="#F9A8D4"/><stop offset="1" stop-color="#FFFFFF"/><animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${x2 - x1} 0" dur="${dur}s" repeatCount="indefinite"/></linearGradient>`;

const COMMON_DEFS = `<filter id="softGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
<linearGradient id="chipStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".7"/><stop offset="1" stop-color="${C.fuchsia}" stop-opacity=".7"/></linearGradient>
<linearGradient id="orbitStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}"/><stop offset=".5" stop-color="${C.lilac}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient>
<linearGradient id="cardBorder" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".55"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="${C.fuchsia}" stop-opacity=".55"/></linearGradient>`;

function card(W, H, rx = 28) {
  return {
    defs: `<clipPath id="card"><rect width="${W}" height="${H}" rx="${rx}"/></clipPath>`,
    border: `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="${rx}" fill="none" stroke="url(#cardBorder)" stroke-width="1.5"/>`,
  };
}

// ─────────────────────────────────── hero ───────────────────────────────────

function hero() {
  const W = 1200, H = 500, HZ = 392;
  const cx = 905, cy = 210, R = 96;
  const rand = rng(11);
  const frame = card(W, H);
  const floor = gridFloor({ id: 'hf', width: W, horizon: HZ, bottom: H, vpX: cx, color: C.fuchsia });
  const icons = (names, size) => names.map((name) => ({ href: `ic-${name}`, size }));
  // Rings sit a little below centre so the near side passes in front of the shoulders, not the face.
  const ringY = cy + 40;
  const orbitA = orbit({ id: 'oa', cx, cy: ringY, rx: 232, ry: 60, tilt: -13, dur: 22, stroke: 'url(#orbitStroke)', items: icons(['react', 'nextjs', 'nodejs', 'mongodb', 'ts', 'tailwind'], 52) });
  const orbitB = orbit({ id: 'ob', cx, cy: ringY, rx: 170, ry: 44, tilt: 21, dur: 16, reverse: true, far: 0.66, stroke: 'url(#orbitStroke)', items: icons(['express', 'js', 'redux', 'firebase'], 40) });
  const sparks = orbit({ id: 'os', cx, cy, rx: 140, ry: 30, tilt: -32, dur: 9, far: 0.5, showPath: false, items: [0, 1, 2].map(() => ({ raw: `<circle r="3.2" fill="${C.cyan}"/><circle r="7" fill="${C.cyan}" opacity=".25"/>` })) });

  const defs = `${COMMON_DEFS}${frame.defs}${floor.defs}
${['react', 'nextjs', 'nodejs', 'mongodb', 'ts', 'tailwind', 'express', 'js', 'redux', 'firebase'].map(iconSymbol).join('\n')}
${SHIMMER('nameGrad', 72, 572)}
<linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${HZ}"><stop offset="0" stop-color="${C.ink}"/><stop offset=".6" stop-color="#0E1338"/><stop offset="1" stop-color="#2B0F4C"/></linearGradient>
<linearGradient id="floorFill" gradientUnits="userSpaceOnUse" x1="0" y1="${HZ}" x2="0" y2="${H}"><stop offset="0" stop-color="#1A0B3B"/><stop offset="1" stop-color="${C.ink}"/></linearGradient>
<radialGradient id="sunGlow"><stop offset="0" stop-color="${C.pink}" stop-opacity=".45"/><stop offset=".45" stop-color="${C.violet}" stop-opacity=".18"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></radialGradient>
<linearGradient id="horizon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".55" stop-color="${C.cyan}"/><stop offset=".75" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.pink}" stop-opacity="0"/></linearGradient>
<radialGradient id="pool"><stop offset="0" stop-color="${C.pink}" stop-opacity=".6"/><stop offset="1" stop-color="${C.pink}" stop-opacity="0"/></radialGradient>
<linearGradient id="streak" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="-100" y2="-46"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
${avatarDefs(cx, cy, R)}`;

  const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" keyTimes="0;0.5;1" ${ease} dur="6s" repeatCount="indefinite"/>`;

  const body = `<g clip-path="url(#card)">
<rect width="${W}" height="${HZ}" fill="url(#sky)"/>
${stars(rand, 90, { x0: 10, y0: 10, x1: W - 10, y1: HZ - 30 })}
<circle cx="${cx}" cy="${cy + 20}" r="300" fill="url(#sunGlow)"/>
<g opacity="0"><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.03;0.14;1" dur="9s" begin="2s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="140 50;660 290;660 290" keyTimes="0;0.14;1" dur="9s" begin="2s" repeatCount="indefinite"/><line x1="0" y1="0" x2="-100" y2="-46" stroke="url(#streak)" stroke-width="2" stroke-linecap="round"/></g>
<rect y="${HZ}" width="${W}" height="${H - HZ}" fill="url(#floorFill)"/>
${floor.body}
<rect x="0" y="${HZ - 2}" width="${W}" height="4" fill="url(#horizon)" filter="url(#blur4)"/>
<rect x="0" y="${HZ - 0.6}" width="${W}" height="1.2" fill="url(#horizon)"/>
<g class="mono" font-size="22" fill="${C.lilac}" opacity=".35">
<text class="fl" x="604" y="70">&lt;/&gt;</text><text class="fl" x="1120" y="64" style="animation-delay:-3s">{ }</text><text class="fl" x="626" y="372" style="animation-delay:-5s">=&gt;</text>
</g>
<ellipse cx="${cx}" cy="${HZ + 16}" rx="200" ry="20" fill="url(#pool)"><animate attributeName="opacity" values="1;.55;1" keyTimes="0;0.5;1" ${ease} dur="6s" repeatCount="indefinite"/></ellipse>
<g>${bob}
${sparks.back}${orbitB.back}${orbitA.back}
${avatarBody(cx, cy, R)}
${orbitA.front}${orbitB.front}${sparks.front}
<g transform="translate(${cx + 18} ${cy + R - 12})"><rect width="146" height="32" rx="16" fill="${C.navy}" stroke="${C.green}" stroke-opacity=".6"/><circle cx="18" cy="16" r="5" fill="${C.green}"/><circle cx="18" cy="16" r="5" fill="none" stroke="${C.green}" stroke-width="2"><animate attributeName="r" values="5;13" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2s" repeatCount="indefinite"/></circle><text class="sans" x="32" y="21" font-size="14" font-weight="600" fill="#D1FAE5">Open to work</text></g>
</g>
<g class="rise" style="animation-delay:.1s"><text class="mono" x="74" y="132" font-size="19" fill="${C.cyan}">// Hello, World! I'm</text></g>
<g class="rise" style="animation-delay:.25s">${extrudedText({ x: 72, y: 210, text: 'Abdur Razzak', size: 74, fill: 'url(#nameGrad)' })}</g>
<g class="rise" style="animation-delay:.4s"><text class="sans" x="74" y="258" font-size="29" font-weight="700" fill="#F8FAFC">Full Stack Developer</text></g>
<g class="rise" style="animation-delay:.5s"><text class="sans" x="75" y="292" font-size="17" fill="${C.muted}"><tspan fill="${C.gold}">★</tspan> Top Rated on Upwork   ·   Dhaka, Bangladesh   ·   Coding since 2018</text></g>
${chipRow(['React', 'Next.js', 'Node.js', 'MongoDB', 'TypeScript'], 72, 318)}
</g>
${frame.border}`;

  return svgDoc({ width: W, height: H, title: 'Abdur Razzak — Full Stack Developer', defs, body });
}

function avatarDefs(cx, cy, R) {
  return `<clipPath id="avClip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
<radialGradient id="avShade" cx=".4" cy=".35" r=".72"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".6"/></radialGradient>
<radialGradient id="avSpec"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="avHalo"><stop offset=".6" stop-color="${C.cyan}" stop-opacity=".45"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
<linearGradient id="avRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.cyan}"/><stop offset=".5" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.pink}"/></linearGradient>`;
}

// The photo is shaded like a sphere (dark rim + specular highlight) and wrapped in spinning rings.
function avatarBody(cx, cy, R) {
  const spin = (from, to, dur) => `<animateTransform attributeName="transform" type="rotate" from="${from} ${cx} ${cy}" to="${to} ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${R + 46}" fill="url(#avHalo)"><animate attributeName="opacity" values=".5;1;.5" dur="4s" repeatCount="indefinite"/></circle>
<circle cx="${cx}" cy="${cy}" r="${R + 2}" fill="${C.navy}"/>
<image xlink:href="${dataUri('avatar.jpg', 'image/jpeg')}" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avClip)"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#avShade)"/>
<ellipse cx="${n(cx - R * 0.34)}" cy="${n(cy - R * 0.52)}" rx="${n(R * 0.4)}" ry="${n(R * 0.18)}" fill="url(#avSpec)" transform="rotate(-28 ${n(cx - R * 0.34)} ${n(cy - R * 0.52)})"/>
<circle cx="${cx}" cy="${cy}" r="${R + 9}" fill="none" stroke="url(#avRing)" stroke-width="4" stroke-linecap="round" stroke-dasharray="190 145">${spin(0, 360, 7)}</circle>
<circle cx="${cx}" cy="${cy}" r="${R + 21}" fill="none" stroke="${C.cyan}" stroke-opacity=".5" stroke-width="1.3" stroke-dasharray="2 9">${spin(360, 0, 28)}</circle>`;
}

// ─────────────────────────────────── terminal ───────────────────────────────────

function highlightJson(line) {
  const segs = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|(\s+)|([^\s"])/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) {
      segs.push([m[1], m[2] ? C.sky : '#86EFAC']);
      if (m[2]) segs.push([m[2], C.muted]);
    } else if (m[3]) segs.push([m[3], C.pink]);
    else if (m[4]) segs.push([m[4], '#FDBA74']);
    else segs.push([m[5] ?? m[6], C.muted]);
  }
  return segs;
}

function terminal() {
  const W = 1200, X0 = 20, Y0 = 24, WW = 1160;
  const FS = 22, CW = FS * MONO_EM, LH = 34, PADX = 64;
  const prompt = [['➜ ', C.green], ['~ ', C.cyan]];
  const json = {
    location: 'Dhaka, Bangladesh',
    codingSince: 2018,
    upwork: 'Top Rated Freelancer',
    clients: ['USA', 'UK', 'Canada', 'Germany', 'Australia'],
    focus: ['React', 'Next.js', 'Node.js', 'MongoDB', 'TypeScript'],
    learning: ['Advanced TypeScript', 'Cloud platforms'],
    openToWork: true,
  };
  const jsonLines = ['{', ...Object.entries(json).map(([k, v], i, all) => `  "${k}": ${JSON.stringify(v).replace(/","/g, '", "')}${i < all.length - 1 ? ',' : ''}`), '}'];
  const lines = [
    { cmd: 'whoami' },
    { segs: [['Abdur Razzak', '#F8FAFC'], [' — Full Stack Developer (MERN · Next.js · TypeScript)', C.text]] },
    { cmd: 'cat profile.json' },
    ...jsonLines.map((l) => ({ segs: highlightJson(l) })),
    { cmd: 'npm run hire-me' },
    { segs: [['✔ ', C.green], ['Ready', '#F8FAFC'], [' — let\'s build something amazing together!', C.text]] },
    { cmd: '', last: true },
  ];

  const TOP = Y0 + 52 + 40; // first baseline
  const WH = 52 + 40 + lines.length * LH + 12;
  const H = Y0 + WH + 24;
  const len = (segs) => [...segs.map((s) => s[0]).join('')].length;
  const promptW = len(prompt) * CW;

  let t = 0.9, clips = '', text = '', cursors = '';
  const events = [];
  lines.forEach((line, i) => {
    const y = TOP + i * LH;
    const segs = line.cmd !== undefined ? [...prompt, [line.cmd, '#F8FAFC']] : line.segs;
    const chars = len(segs);
    const fullW = n(chars * CW);
    if (line.cmd !== undefined) {
      const steps = [...line.cmd].length;
      events.push({ i, kind: 'cmd', start: t, steps, y });
      t += 0.35 + steps * 0.065 + (line.last ? 0 : 0.45);
    } else {
      events.push({ i, kind: 'out', start: t, y });
      t += 0.07;
      if (lines[i + 1]?.cmd !== undefined) t += 0.75;
    }
    text += `<text class="mono" xml:space="preserve" x="${PADX}" y="${y}" font-size="${FS}"${chars ? ` textLength="${fullW}" lengthAdjust="spacing"` : ''} clip-path="url(#tl${i})">${segs.map(([s, c]) => `<tspan fill="${c}">${esc(s)}</tspan>`).join('')}</text>`;
    events.at(-1).fullW = fullW;
  });
  const T = Math.ceil(t + 4);
  const kt = (sec) => (sec / T).toFixed(4); // typing steps are ~0.2% of the loop apart

  for (const ev of events) {
    const clipY = ev.y - 26;
    let keyTimes, values;
    if (ev.kind === 'cmd') {
      // Prompt appears at once, then the command is typed one character at a time.
      keyTimes = ['0', kt(ev.start)];
      values = ['0', n(promptW + 4)];
      const caretX = [n(PADX + promptW), n(PADX + promptW)];
      for (let s = 1; s <= ev.steps; s++) {
        keyTimes.push(kt(ev.start + 0.35 + s * 0.065));
        values.push(n(promptW + s * CW + 4));
        caretX.push(n(PADX + promptW + s * CW));
      }
      if (lines[ev.i].last) {
        cursors += `<g opacity="0"><animate attributeName="opacity" values="0;1" keyTimes="0;${kt(ev.start)}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"/><rect class="blink" x="${n(PADX + promptW)}" y="${ev.y - 20}" width="${n(CW)}" height="25" fill="${C.text}"/></g>`;
      } else {
        // Caret rides the reveal edge and hides just before the output lands.
        const caretEnd = ev.start + 0.35 + ev.steps * 0.065 + 0.4;
        cursors += `<rect x="${caretX[0]}" y="${ev.y - 20}" width="${n(CW)}" height="25" fill="${C.text}" opacity="0"><animate attributeName="x" values="${caretX.join(';')}" keyTimes="${keyTimes.join(';')}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" keyTimes="0;${kt(ev.start)};${kt(caretEnd)}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"/></rect>`;
      }
    } else {
      keyTimes = ['0', kt(ev.start)];
      values = ['0', n(ev.fullW + 8)];
    }
    clips += `<clipPath id="tl${ev.i}"><rect x="${PADX - 4}" y="${clipY}" width="${n(ev.fullW + 8)}" height="${LH}"><animate attributeName="width" values="${values.join(';')}" keyTimes="${keyTimes.join(';')}" calcMode="discrete" dur="${T}s" repeatCount="indefinite"/></rect></clipPath>`;
  }

  const defs = `${COMMON_DEFS}
<linearGradient id="termBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D1117"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>
<linearGradient id="termGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.fuchsia}"/></linearGradient>
<linearGradient id="termBorder" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(0 .5 .5)"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".8"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="${C.fuchsia}" stop-opacity=".8"/><animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="8s" repeatCount="indefinite"/></linearGradient>
<filter id="blur24" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="18"/></filter>
<clipPath id="win"><rect x="${X0}" y="${Y0}" width="${WW}" height="${WH}" rx="16"/></clipPath>
${clips}`;

  const body = `<rect x="${X0 + 30}" y="${Y0 + 30}" width="${WW - 60}" height="${WH - 40}" rx="24" fill="url(#termGlow)" opacity=".28" filter="url(#blur24)"/>
<g clip-path="url(#win)">
<rect x="${X0}" y="${Y0}" width="${WW}" height="${WH}" fill="url(#termBg)"/>
<rect x="${X0}" y="${Y0}" width="${WW}" height="52" fill="#161B22"/>
<line x1="${X0}" y1="${Y0 + 52}" x2="${X0 + WW}" y2="${Y0 + 52}" stroke="#fff" stroke-opacity=".08"/>
<circle cx="${X0 + 28}" cy="${Y0 + 26}" r="7.5" fill="#FF5F57"/><circle cx="${X0 + 52}" cy="${Y0 + 26}" r="7.5" fill="#FEBC2E"/><circle cx="${X0 + 76}" cy="${Y0 + 26}" r="7.5" fill="#28C840"/>
<text class="mono" x="${X0 + WW / 2}" y="${Y0 + 32}" text-anchor="middle" font-size="15" fill="#8B949E">abdur@razzak: ~/portfolio — zsh</text>
<g><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${kt(T - 1.3)};${kt(T - 0.7)};1" dur="${T}s" repeatCount="indefinite"/>
${text}
${cursors}
</g>
</g>
<rect x="${X0 + 0.75}" y="${Y0 + 0.75}" width="${WW - 1.5}" height="${WH - 1.5}" rx="16" fill="none" stroke="url(#termBorder)" stroke-width="1.5"/>`;

  return svgDoc({ width: W, height: H, title: 'Terminal: whoami — Abdur Razzak, Full Stack Developer', defs, body });
}

// ─────────────────────────────────── services ───────────────────────────────────

const GLYPHS = {
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};

function services() {
  const items = [
    { glyph: 'code', title: 'Frontend Development', lines: ['Fast, responsive React and', 'Next.js apps with clean,', 'reusable components.'], colors: ['#22D3EE', '#3B82F6'] },
    { glyph: 'server', title: 'Backend & APIs', lines: ['Secure REST APIs with Node.js,', 'Express, MongoDB / MySQL', 'and JWT authentication.'], colors: ['#34D399', '#059669'] },
    { glyph: 'layers', title: 'Full Stack MERN Apps', lines: ['Dashboards, auth, role-based', 'access and payments —', 'built end to end.'], colors: ['#A78BFA', '#7C3AED'] },
    { glyph: 'pen', title: 'Figma → Code', lines: ['Pixel-perfect design builds', 'with smooth GSAP and', 'Framer Motion animations.'], colors: ['#F472B6', '#DB2777'] },
    { glyph: 'layout', title: 'WordPress Websites', lines: ['Business and marketing sites', 'your team can update', 'without touching code.'], colors: ['#60A5FA', '#1D4ED8'] },
    { glyph: 'zap', title: 'Performance & SEO', lines: ['Fast, accessible builds', 'tuned for Core Web Vitals', 'and search rankings.'], colors: ['#FBBF24', '#F97316'] },
  ];
  const W = 1200, CWd = 368, CH = 250, GAP = 22, X0 = (W - 3 * CWd - 2 * GAP) / 2, Y0 = 18;
  const H = Y0 * 2 + CH * 2 + GAP;
  let defs = COMMON_DEFS + `<linearGradient id="svcBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.navy2}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>`;
  let body = '';

  items.forEach((it, i) => {
    const x = X0 + (i % 3) * (CWd + GAP), y = Y0 + Math.floor(i / 3) * (CH + GAP);
    const [c1, c2] = it.colors;
    defs += `<linearGradient id="sb${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset=".45" stop-color="${c1}" stop-opacity="0"/><stop offset=".55" stop-color="${c2}" stop-opacity="0"/><stop offset="1" stop-color="${c2}"/><animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="${7 + i}s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="st${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="sg${i}" cx=".2" cy="0" r="1"><stop offset="0" stop-color="${c1}" stop-opacity=".22"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>`;
    const tx = x + 30, ty = y + 30;
    const float = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" keyTimes="0;0.5;1" ${ease} dur="4s" begin="-${n(i * 0.6)}s" repeatCount="indefinite"/>`;
    body += `<g class="rise" style="animation-delay:${n(0.1 + i * 0.1)}s">
<rect x="${x}" y="${y}" width="${CWd}" height="${CH}" rx="22" fill="url(#svcBg)"/>
<rect x="${x}" y="${y}" width="${CWd}" height="${CH}" rx="22" fill="url(#sg${i})"/>
<rect x="${x + 0.75}" y="${y + 0.75}" width="${CWd - 1.5}" height="${CH - 1.5}" rx="22" fill="none" stroke="url(#sb${i})" stroke-width="1.6"/>
<text class="mono" x="${x + CWd - 28}" y="${y + 44}" text-anchor="end" font-size="16" fill="${C.dim}">0${i + 1}</text>
<ellipse cx="${tx + 34}" cy="${ty + 84}" rx="30" ry="6" fill="${c1}" opacity=".3"><animate attributeName="rx" values="30;22;30" keyTimes="0;0.5;1" ${ease} dur="4s" begin="-${n(i * 0.6)}s" repeatCount="indefinite"/></ellipse>
<g>${float}
<rect x="${tx}" y="${ty + 7}" width="68" height="68" rx="18" fill="${c2}" opacity=".55"/>
<rect x="${tx}" y="${ty}" width="68" height="68" rx="18" fill="url(#st${i})"/>
<rect x="${tx + 3}" y="${ty + 3}" width="62" height="28" rx="14" fill="#fff" opacity=".18"/>
<g transform="translate(${tx + 17} ${ty + 17}) scale(1.4)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[it.glyph]}</g>
</g>
<text class="sans" x="${x + 30}" y="${y + 146}" font-size="25" font-weight="700" fill="#F8FAFC">${esc(it.title)}</text>
${it.lines.map((l, j) => `<text class="sans" x="${x + 30}" y="${y + 180 + j * 25}" font-size="18" fill="${C.muted}">${esc(l)}</text>`).join('')}
</g>`;
  });

  return svgDoc({ width: W, height: H, title: 'What I offer: frontend, backend & APIs, full stack MERN, Figma to code, WordPress, performance & SEO', defs, body });
}

// ─────────────────────────────────── tech stack ───────────────────────────────────

function techStack() {
  const rows = [
    ['Languages', ['html', 'css', 'sass', 'js', 'ts']],
    ['Frontend', ['react', 'nextjs', 'redux', 'tailwind', 'mui', 'bootstrap', 'styledcomponents']],
    ['Backend & Data', ['nodejs', 'express', 'mongodb', 'mysql', 'firebase', 'wordpress']],
    ['Tools & Cloud', ['git', 'github', 'docker', 'postman', 'vscode', 'figma', 'vercel', 'netlify']],
  ];
  const W = 1200, ROW = 112, TOP = 26, SIZE = 72, STEP = 92, IX = 318;
  const H = TOP * 2 + rows.length * ROW - 6;
  const frame = card(W, H);
  const names = [...new Set(rows.flatMap((r) => r[1]))];
  const defs = `${COMMON_DEFS}${frame.defs}${names.map(iconSymbol).join('\n')}
<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#fff" opacity=".07"/></pattern>
<linearGradient id="tsBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navy2}"/><stop offset="1" stop-color="${C.ink}"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".5" stop-color="${C.cyan}" stop-opacity=".18"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></linearGradient>`;

  let body = `<g clip-path="url(#card)"><rect width="${W}" height="${H}" fill="url(#tsBg)"/><rect width="${W}" height="${H}" fill="url(#dots)"/>
<rect x="-300" y="0" width="300" height="${H}" fill="url(#beam)" transform="skewX(-18)"><animate attributeName="x" values="-300;${W + 300}" dur="7s" repeatCount="indefinite"/></rect>`;
  rows.forEach(([label, icons], r) => {
    const cy = TOP + r * ROW + ROW / 2 - 6;
    body += `<g class="rise" style="animation-delay:${n(0.1 + r * 0.12)}s">
<rect x="30" y="${cy - 29}" width="252" height="58" rx="16" fill="#fff" fill-opacity=".04" stroke="url(#chipStroke)" stroke-width="1.2"/>
<text class="sans" x="54" y="${cy + 8}" font-size="21" font-weight="700" fill="#F8FAFC">${esc(label)}</text>
<text class="mono" x="258" y="${cy + 7}" text-anchor="end" font-size="15" fill="${C.dim}">${String(icons.length).padStart(2, '0')}</text>`;
    icons.forEach((name, c) => {
      const x = IX + c * STEP, begin = `-${n(c * 0.22 + r * 0.55)}s`;
      body += `<ellipse cx="${x + SIZE / 2}" cy="${cy + SIZE / 2 + 12}" rx="26" ry="5" fill="${C.cyan}" opacity=".22"><animate attributeName="rx" values="26;18;26" keyTimes="0;0.5;1" ${ease} dur="3.2s" begin="${begin}" repeatCount="indefinite"/></ellipse>
<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" keyTimes="0;0.5;1" ${ease} dur="3.2s" begin="${begin}" repeatCount="indefinite"/><use xlink:href="#ic-${name}" x="${x}" y="${cy - SIZE / 2}" width="${SIZE}" height="${SIZE}"/></g>`;
    });
    body += '</g>';
  });
  body += `</g>${frame.border}`;
  return svgDoc({ width: W, height: H, title: 'Tech stack: ' + rows.map(([l, i]) => `${l} — ${i.join(', ')}`).join('; '), defs, body });
}

// ─────────────────────────────────── projects ───────────────────────────────────

const PROJECTS = [
  { slug: 'addax-gfrp', host: 'addex-frontend.vercel.app' },
  { slug: 'taxisafar', host: 'vicky-cabs-teal.vercel.app' },
  { slug: 'parcel-management', host: 'parcel-management-app-d81f7.web.app' },
  { slug: 'recommendhub', host: 'queries-b074f.web.app' },
  { slug: 'dhri-robust', host: 'dhrirobust.vercel.app' },
  { slug: 'kt-matrimony', host: 'kt-matrimony.vercel.app' },
];

// A floating browser window with a light sweep across the glass.
function projectCard({ slug, host }, i) {
  const W = 820, H = 520, X = 10, Y = 10, BW = 800, BAR = 46, VH = 420;
  const BH = BAR + VH;
  const defs = `<clipPath id="win"><rect x="${X}" y="${Y}" width="${BW}" height="${BH}" rx="16"/></clipPath>
<clipPath id="view"><rect x="${X}" y="${Y + BAR}" width="${BW}" height="${VH}"/></clipPath>
<linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".45"/></linearGradient>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="${C.fuchsia}" stop-opacity=".7"/></linearGradient>
<filter id="shadow" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="10"/></filter>`;
  const float = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" keyTimes="0;0.5;1" ${ease} dur="6s" begin="-${i}s" repeatCount="indefinite"/>`;
  const body = `<ellipse cx="${W / 2}" cy="${H - 22}" rx="350" ry="12" fill="#000" opacity=".45" filter="url(#shadow)"><animate attributeName="rx" values="350;320;350" keyTimes="0;0.5;1" ${ease} dur="6s" begin="-${i}s" repeatCount="indefinite"/></ellipse>
<g>${float}
<g clip-path="url(#win)">
<rect x="${X}" y="${Y}" width="${BW}" height="${BH}" fill="${C.navy}"/>
<g clip-path="url(#view)"><image xlink:href="${dataUri(`projects/${slug}.jpg`, 'image/jpeg')}" x="${X}" y="${Y + BAR}" width="${BW}" height="${VH}" preserveAspectRatio="xMidYMin slice"/>
<rect x="${X}" y="${Y + BAR}" width="${BW}" height="${VH}" fill="url(#fade)"/></g>
<rect x="${X}" y="${Y}" width="${BW}" height="${BAR}" fill="#1E293B"/>
<line x1="${X}" y1="${Y + BAR}" x2="${X + BW}" y2="${Y + BAR}" stroke="#fff" stroke-opacity=".08"/>
<circle cx="${X + 26}" cy="${Y + 23}" r="7" fill="#FF5F57"/><circle cx="${X + 48}" cy="${Y + 23}" r="7" fill="#FEBC2E"/><circle cx="${X + 70}" cy="${Y + 23}" r="7" fill="#28C840"/>
<rect x="${X + 100}" y="${Y + 10}" width="560" height="26" rx="13" fill="${C.navy}"/>
<g transform="translate(${X + 114} ${Y + 15})" fill="none" stroke="${C.green}" stroke-width="1.8" stroke-linecap="round"><rect x="0" y="7" width="11" height="9" rx="2" fill="${C.green}" stroke="none"/><path d="M2.5 7V4.5a3 3 0 0 1 6 0V7"/></g>
<text class="mono" x="${X + 136}" y="${Y + 29}" font-size="16" fill="${C.muted}">${esc(host)}</text>
<g transform="translate(${X + BW - 108} ${Y + 10})"><rect width="92" height="26" rx="13" fill="${C.green}" fill-opacity=".14" stroke="${C.green}" stroke-opacity=".55"/><circle cx="17" cy="13" r="4.5" fill="${C.green}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle><text class="sans" x="56" y="18" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="1.5" fill="#4ADE80">LIVE</text></g>
<rect x="-260" y="${Y}" width="220" height="${BH}" fill="url(#shine)" transform="skewX(-20)"><animate attributeName="x" values="-260;-260;${W + 300};${W + 300}" keyTimes="0;0.55;0.8;1" dur="7s" begin="-${n(i * 1.1)}s" repeatCount="indefinite"/></rect>
</g>
<rect x="${X + 0.75}" y="${Y + 0.75}" width="${BW - 1.5}" height="${BH - 1.5}" rx="16" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
</g>`;
  return svgDoc({ width: W, height: H, title: `${host} — live project preview`, defs, body });
}

// ─────────────────────────────────── globe ───────────────────────────────────

function globe() {
  const W = 1200, H = 440, cx = 292, cy = 228, R = 148, TILT = 22 * D2R, SPIN = 36;
  const rand = rng(5);
  const frame = card(W, H);
  const HOME = { name: 'Dhaka', lat: 23.8, lon: 90.4, color: C.gold };
  const PLACES = [
    { name: 'United States', lat: 39.8, lon: -98.6, color: C.cyan },
    { name: 'United Kingdom', lat: 54.0, lon: -2.0, color: C.pink },
    { name: 'Canada', lat: 56.1, lon: -106.3, color: C.lilac },
    { name: 'Germany', lat: 51.2, lon: 10.4, color: '#34D399' },
    { name: 'Australia', lat: -25.3, lon: 133.8, color: '#60A5FA' },
  ];

  const toVec = (lat, lon) => [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)];
  const view = ([X, Y, Z], rot, r = R) => {
    const a = rot * D2R;
    const x1 = X * Math.cos(a) + Z * Math.sin(a), z1 = Z * Math.cos(a) - X * Math.sin(a);
    const y2 = Y * Math.cos(TILT) - z1 * Math.sin(TILT), z2 = Y * Math.sin(TILT) + z1 * Math.cos(TILT);
    const x = cx + x1 * r, y = cy - y2 * r;
    return { x, y, z: z2, vis: z2 >= 0 || Math.hypot(x - cx, y - cy) > R + 0.5 };
  };
  const toPath = (pts) => 'M' + pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L');
  // Keep the point count fixed (so SMIL can morph between frames) by pinning hidden
  // points onto the ends of the longest visible run.
  const visibleOnly = (pts) => {
    let best = null;
    for (let i = 0, start = -1; i <= pts.length; i++) {
      if (i < pts.length && pts[i].vis) { if (start < 0) start = i; }
      else if (start >= 0) { if (!best || i - start > best[1] - best[0]) best = [start, i]; start = -1; }
    }
    if (!best) return pts.map(() => pts[0]);
    return pts.map((p, i) => (i < best[0] ? pts[best[0]] : i >= best[1] ? pts[best[1] - 1] : p));
  };

  // Latitude rings never move, so their visible halves are static.
  let back = '', front = '';
  for (const lat of [-60, -30, 0, 30, 60]) {
    back += `<ellipse cx="${cx}" cy="${n(cy - R * Math.sin(lat * D2R) * Math.cos(TILT))}" rx="${n(R * Math.cos(lat * D2R))}" ry="${n(R * Math.cos(lat * D2R) * Math.sin(TILT))}"/>`;
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 5) pts.push(view(toVec(lat, lon), 0));
    front += `<path d="${toPath(visibleOnly(pts.map((p) => ({ ...p, vis: p.z >= 0 }))))}"/>`;
  }
  // Meridians: 12 slots, each animates through one 30° step, so the whole lattice loops seamlessly.
  const SLOTS = 12, STEP = 360 / SLOTS, FRAMES = 10;
  for (let k = 0; k < SLOTS; k++) {
    const backD = [], frontD = [];
    for (let f = 0; f <= FRAMES; f++) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 10) pts.push(view(toVec(lat, k * STEP), (f * STEP) / FRAMES));
      backD.push(toPath(pts));
      frontD.push(toPath(visibleOnly(pts.map((p) => ({ ...p, vis: p.z >= 0 })))));
    }
    const anim = (d) => `<animate attributeName="d" values="${d.join(';')}" dur="${SPIN / SLOTS}s" repeatCount="indefinite"/>`;
    back += `<path d="${backD[0]}">${anim(backD)}</path>`;
    front += `<path d="${frontD[0]}">${anim(frontD)}</path>`;
  }

  // Cities and flight arcs ride along with the rotation.
  const NODE_F = 48, ARC_F = 30, ARC_PTS = 14;
  const node = (p) => {
    const xs = [], ops = [];
    for (let f = 0; f <= NODE_F; f++) {
      const v = view(toVec(p.lat, p.lon), (f * 360) / NODE_F);
      xs.push(`${n(v.x)} ${n(v.y)}`);
      ops.push(n(Math.min(1, Math.max(0, (v.z + 0.05) / 0.2))));
    }
    const big = p === HOME;
    return `<g transform="translate(${xs[0]})" opacity="${ops[0]}"><animateTransform attributeName="transform" type="translate" values="${xs.join(';')}" dur="${SPIN}s" repeatCount="indefinite"/><animate attributeName="opacity" values="${ops.join(';')}" dur="${SPIN}s" repeatCount="indefinite"/>
<circle r="5" fill="none" stroke="${p.color}" stroke-width="2"><animate attributeName="r" values="${big ? '6;20' : '4;14'}" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="2s" repeatCount="indefinite"/></circle>
<circle r="${big ? 6 : 4.5}" fill="${p.color}" stroke="#fff" stroke-width="1.5"/></g>`;
  };
  const arc = (to, idx) => {
    const a = toVec(HOME.lat, HOME.lon), b = toVec(to.lat, to.lon);
    const omega = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const lift = 0.06 + 0.13 * (omega / Math.PI);
    const ds = [];
    for (let f = 0; f <= ARC_F; f++) {
      const pts = [];
      for (let s = 0; s <= ARC_PTS; s++) {
        const u = s / ARC_PTS, wa = Math.sin((1 - u) * omega) / Math.sin(omega), wb = Math.sin(u * omega) / Math.sin(omega);
        const v = [0, 1, 2].map((j) => wa * a[j] + wb * b[j]);
        pts.push(view(v, (f * 360) / ARC_F, R * (1 + lift * Math.sin(Math.PI * u))));
      }
      ds.push(toPath(visibleOnly(pts)));
    }
    return `<path d="${ds[0]}" fill="none" stroke="${to.color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 8"><animate attributeName="d" values="${ds.join(';')}" dur="${SPIN}s" repeatCount="indefinite"/><animate attributeName="stroke-dashoffset" values="0;-28" dur="${1 + idx * 0.15}s" repeatCount="indefinite"/></path>`;
  };

  const sat = orbit({ id: 'gs', cx, cy, rx: R + 54, ry: 34, tilt: -16, dur: 10, far: 0.55, stroke: 'url(#orbitStroke)', strokeWidth: 1.2, items: [{ raw: `<circle r="5" fill="#fff"/><circle r="11" fill="${C.cyan}" opacity=".35"/>` }] });

  const defs = `${COMMON_DEFS}${frame.defs}${SHIMMER('globeTitle', 560, 1160, 7)}
<radialGradient id="gBg" cx=".25" cy=".5" r=".8"><stop offset="0" stop-color="#13204A"/><stop offset="1" stop-color="${C.ink}"/></radialGradient>
<radialGradient id="atmo"><stop offset=".78" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".86" stop-color="${C.cyan}" stop-opacity=".3"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
<radialGradient id="sphere" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#2563EB" stop-opacity=".55"/><stop offset=".55" stop-color="#1E3A8A" stop-opacity=".6"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".95"/></radialGradient>
<radialGradient id="spec"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

  const chipsHtml = chipRow(PLACES.slice(0, 3).map((p) => ({ label: p.name, dot: p.color })), 560, 262, { fs: 16, delay: 0.5 })
    + chipRow(PLACES.slice(3).map((p) => ({ label: p.name, dot: p.color })), 560, 308, { fs: 16, delay: 0.75 });

  const body = `<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="url(#gBg)"/>
${stars(rand, 70, { x0: 10, y0: 10, x1: W - 10, y1: H - 10 })}
<circle cx="${cx}" cy="${cy}" r="${R + 34}" fill="url(#atmo)"/>
${sat.back}
<g fill="none" stroke="${C.sky}" stroke-opacity=".2" stroke-width="1">${back}</g>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sphere)"/>
<g fill="none" stroke="${C.sky}" stroke-opacity=".55" stroke-width="1.1">${front}</g>
${PLACES.map(arc).join('\n')}
${[...PLACES, HOME].map(node).join('\n')}
<ellipse cx="${n(cx - R * 0.38)}" cy="${n(cy - R * 0.5)}" rx="${n(R * 0.42)}" ry="${n(R * 0.22)}" fill="url(#spec)" transform="rotate(-30 ${n(cx - R * 0.38)} ${n(cy - R * 0.5)})"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.sky}" stroke-opacity=".7" stroke-width="1.5"/>
${sat.front}
<g class="rise" style="animation-delay:.1s"><text class="mono" x="562" y="112" font-size="18" fill="${C.cyan}">// clients worldwide</text></g>
<g class="rise" style="animation-delay:.2s">${extrudedText({ x: 560, y: 170, text: 'Building products for', size: 44, fill: 'url(#globeTitle)', depth: 4, glow: false })}</g>
<g class="rise" style="animation-delay:.3s">${extrudedText({ x: 560, y: 224, text: 'clients around the globe', size: 44, fill: 'url(#globeTitle)', depth: 4, glow: false })}</g>
${chipsHtml}
<g class="rise" style="animation-delay:.9s"><circle cx="568" cy="383" r="6" fill="${C.gold}"/><circle cx="568" cy="383" r="6" fill="none" stroke="${C.gold}" stroke-width="2"><animate attributeName="r" values="6;14" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2s" repeatCount="indefinite"/></circle>
<text class="sans" x="586" y="389" font-size="18" fill="${C.muted}">Based in <tspan fill="#F8FAFC" font-weight="600">Dhaka, Bangladesh</tspan>  ·  Usually replies within 24 hours</text></g>
</g>
${frame.border}`;

  return svgDoc({ width: W, height: H, title: 'Rotating globe linking Dhaka to clients in the US, UK, Canada, Germany and Australia', defs, body });
}

// ─────────────────────────────────── small pieces ───────────────────────────────────

function divider() {
  const W = 1200, H = 28;
  const defs = `<linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".25" stop-color="${C.cyan}" stop-opacity=".6"/><stop offset=".5" stop-color="${C.lilac}" stop-opacity=".6"/><stop offset=".75" stop-color="${C.pink}" stop-opacity=".6"/><stop offset="1" stop-color="${C.pink}" stop-opacity="0"/></linearGradient>
<linearGradient id="comet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".85" stop-color="${C.cyan}"/><stop offset="1" stop-color="#fff"/></linearGradient>`;
  const body = `<rect x="0" y="${H / 2 - 0.75}" width="${W}" height="1.5" fill="url(#line)"/>
<rect x="-240" y="${H / 2 - 1.5}" width="240" height="3" rx="1.5" fill="url(#comet)"><animate attributeName="x" values="-240;${W}" dur="3.6s" repeatCount="indefinite"/></rect>
${[-18, 0, 18].map((dx, i) => `<rect x="${W / 2 + dx - 4}" y="${H / 2 - 4}" width="8" height="8" fill="${[C.cyan, C.lilac, C.pink][i]}" transform="rotate(45 ${W / 2 + dx} ${H / 2})"><animate attributeName="opacity" values=".3;1;.3" dur="1.8s" begin="${i * 0.3}s" repeatCount="indefinite"/></rect>`).join('')}`;
  return svgDoc({ width: W, height: H, title: 'Section divider', defs, body });
}

function footer() {
  const W = 1200, H = 300, HZ = 206;
  const rand = rng(23);
  const frame = card(W, H);
  const floor = gridFloor({ id: 'ff', width: W, horizon: HZ, bottom: H, vpX: W / 2, color: C.fuchsia, spacing: 80, dur: 2.2 });
  // Retro sun: gradient disc with horizontal slits that drift downward.
  let slits = '';
  for (let i = 0; i < 6; i++) {
    const y0 = HZ - 70 + i * 13, h0 = n(1 + i * 1.4), h1 = n(1 + (i + 1) * 1.4);
    slits += `<rect x="${W / 2 - 120}" y="${y0}" width="240" height="${h0}" fill="#000"><animate attributeName="y" values="${y0};${y0 + 13}" dur="1.6s" repeatCount="indefinite"/><animate attributeName="height" values="${h0};${h1}" dur="1.6s" repeatCount="indefinite"/></rect>`;
  }
  const defs = `${COMMON_DEFS}${frame.defs}${floor.defs}${SHIMMER('footTitle', 330, 870, 6)}
<linearGradient id="fSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ink}"/><stop offset="1" stop-color="#2B0F4C"/></linearGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE047"/><stop offset=".5" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient>
<mask id="sunMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${HZ}"><rect width="${W}" height="${HZ}" fill="#fff"/>${slits}</mask>
<radialGradient id="sunGlowF"><stop offset="0" stop-color="${C.pink}" stop-opacity=".55"/><stop offset="1" stop-color="${C.pink}" stop-opacity="0"/></radialGradient>
<linearGradient id="horizonF" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".5" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></linearGradient>`;
  const body = `<g clip-path="url(#card)">
<rect width="${W}" height="${HZ}" fill="url(#fSky)"/>
${stars(rand, 60, { x0: 10, y0: 8, x1: W - 10, y1: HZ - 20 })}
<circle cx="${W / 2}" cy="${HZ}" r="200" fill="url(#sunGlowF)"/>
<g mask="url(#sunMask)"><circle cx="${W / 2}" cy="${HZ + 6}" r="96" fill="url(#sun)"/></g>
<rect y="${HZ}" width="${W}" height="${H - HZ}" fill="${C.ink}"/>
${floor.body}
<rect x="0" y="${HZ - 1}" width="${W}" height="2" fill="url(#horizonF)"/>
<g class="rise">${extrudedText({ x: W / 2, y: 62, text: 'Thanks for stopping by!', size: 44, fill: 'url(#footTitle)', depth: 4, anchor: 'middle', glow: false })}</g>
<g class="rise" style="animation-delay:.2s"><text class="sans" x="${W / 2}" y="98" text-anchor="middle" font-size="19" fill="${C.muted}">Let's build something amazing together  ·  <tspan fill="${C.cyan}">abdur-razzak.site</tspan></text></g>
</g>
${frame.border}`;
  return svgDoc({ width: W, height: H, title: "Thanks for stopping by! Let's build something amazing together.", defs, body });
}

// Animated 3D emoji for section headings.
const EMOJI_MOTION = {
  wave: '<animateTransform attributeName="transform" type="rotate" values="0 64 100;18 64 100;-8 64 100;18 64 100;-4 64 100;0 64 100;0 64 100" keyTimes="0;.12;.24;.36;.48;.6;1" dur="2.6s" repeatCount="indefinite"/>',
  briefcase: `<animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" keyTimes="0;0.5;1" ${ease} dur="2.4s" repeatCount="indefinite"/>`,
  rocket: '<animateTransform attributeName="transform" type="translate" values="0 0;3 -5;0 -9;-3 -5;0 0" dur="1.8s" repeatCount="indefinite"/>',
  tools: '<animateTransform attributeName="transform" type="rotate" values="-10 60 60;10 60 60;-10 60 60" dur="2.4s" repeatCount="indefinite"/>',
  writing: '<animateTransform attributeName="transform" type="translate" values="0 0;6 2;12 0;6 2;0 0" dur="1.6s" repeatCount="indefinite"/>',
  chart: '<animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" keyTimes="0;0.5;1" dur="1.4s" repeatCount="indefinite"/>',
  globe: '<animateTransform attributeName="transform" type="rotate" values="-12 60 60;12 60 60;-12 60 60" dur="5s" repeatCount="indefinite"/>',
  speech: '<animateTransform attributeName="transform" type="rotate" values="0 60 90;-8 60 90;6 60 90;0 60 90;0 60 90" keyTimes="0;.15;.3;.45;1" dur="2.2s" repeatCount="indefinite"/>',
  handshake: '<animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0;0 -3;0 0;0 0" keyTimes="0;.12;.24;.36;.48;1" dur="1.8s" repeatCount="indefinite"/>',
};

function emoji(name) {
  const body = `<g>${EMOJI_MOTION[name]}<image xlink:href="${dataUri(`emoji/${name}.png`, 'image/png')}" x="12" y="12" width="96" height="96"/></g>`;
  return svgDoc({ width: 120, height: 120, title: `${name} emoji`, body });
}

// ─────────────────────────────────── main ───────────────────────────────────

mkdirSync(OUT, { recursive: true });
const files = {
  'hero.svg': hero(),
  'terminal.svg': terminal(),
  'services.svg': services(),
  'tech-stack.svg': techStack(),
  'globe.svg': globe(),
  'divider.svg': divider(),
  'footer.svg': footer(),
  ...Object.fromEntries(PROJECTS.map((p, i) => [`project-${p.slug}.svg`, projectCard(p, i)])),
  ...Object.fromEntries(Object.keys(EMOJI_MOTION).map((e) => [`emoji-${e}.svg`, emoji(e)])),
};
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`${name.padEnd(34)} ${(Buffer.byteLength(svg) / 1024).toFixed(1).padStart(7)} KB`);
}
