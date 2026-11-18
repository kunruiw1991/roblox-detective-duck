import * as THREE from '../vendor/three.module.min.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finalizeTex(canvas, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function hashNoise(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Penthouse black-and-white checkerboard marble floor (dark charcoal + warm ivory, never pitch-black!) */
function buildCheckerMarbleTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const half = size / 2;

  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < 2; col++) {
      const dark = (r + col) % 2 === 0;
      const x0 = col * half;
      const y0 = r * half;
      ctx.fillStyle = dark ? '#262d3b' : '#ebe7df';
      ctx.fillRect(x0, y0, half, half);

      // Subtle marble veins
      ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.14)';
      ctx.lineWidth = 1.6;
      for (let v = 0; v < 3; v++) {
        const s = r * 17 + col * 31 + v * 7;
        ctx.beginPath();
        ctx.moveTo(x0 + hashNoise(s + 1) * half, y0);
        ctx.bezierCurveTo(
          x0 + hashNoise(s + 2) * half,
          y0 + half * 0.35,
          x0 + hashNoise(s + 3) * half,
          y0 + half * 0.7,
          x0 + hashNoise(s + 4) * half,
          y0 + half
        );
        ctx.stroke();
      }

      // Tile bevel & grout seam
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, y0 + 1, half - 2, half - 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 3, y0 + 3, half - 6, half - 6);
    }
  }
  return finalizeTex(c, true);
}

/** Penthouse rich mahogany wood-panel wall wainscoting */
function buildMahoganyPanelTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  // Rich warm mahogany base
  ctx.fillStyle = '#5c2d1f';
  ctx.fillRect(0, 0, size, size);

  // Fine vertical wood grain
  for (let i = 0; i < 65; i++) {
    const x = hashNoise(i * 5 + 1) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(128, 68, 42, 0.22)' : 'rgba(42, 18, 12, 0.20)';
    ctx.fillRect(x, 0, 2 + hashNoise(i * 5 + 2) * 3, size);
  }

  // Upper recessed wainscoting panel
  ctx.fillStyle = '#6c3625';
  ctx.fillRect(18, 22, size - 36, 108);
  ctx.strokeStyle = '#3b1910';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 22, size - 36, 108);
  ctx.strokeStyle = 'rgba(218, 150, 102, 0.34)';
  ctx.lineWidth = 2;
  ctx.strokeRect(23, 27, size - 46, 98);

  // Chair rail molding
  ctx.fillStyle = '#7c412d';
  ctx.fillRect(0, 144, size, 12);
  ctx.fillStyle = '#38170e';
  ctx.fillRect(0, 156, size, 4);

  // Lower wainscoting panel
  ctx.fillStyle = '#643222';
  ctx.fillRect(18, 170, size - 36, 62);
  ctx.strokeStyle = '#3b1910';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 170, size - 36, 62);
  ctx.strokeStyle = 'rgba(218, 150, 102, 0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(23, 175, size - 46, 52);

  // Baseboard trim
  ctx.fillStyle = '#3d1c13';
  ctx.fillRect(0, 240, size, 16);

  return finalizeTex(c, true);
}

/** Framed botanical floral painting (hides the Penthouse cracked wall safe!) */
function buildFloralPaintingTex() {
  const w = 256;
  const h = 192;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');

  // Soft cream-sage museum canvas background
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f4ede0');
  bg.addColorStop(1, '#dfd2bc');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Vintage ceramic vase
  ctx.fillStyle = '#3b6ea5';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.78, 30, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(w * 0.5 - 14, h * 0.56, 28, 16);

  // Green stems & leaves
  ctx.strokeStyle = '#2d6a4f';
  ctx.lineWidth = 4;
  const stems = [
    [128, 112, 82, 54],
    [128, 112, 128, 36],
    [128, 112, 176, 56],
    [128, 112, 100, 80],
    [128, 112, 162, 84],
  ];
  for (const [x1, y1, x2, y2] of stems) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) * 0.5, y1 - 24, x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = '#40916c';
  for (const [lx, ly, r] of [[95, 92, -0.5], [160, 94, 0.5], [112, 68, -0.3], [148, 70, 0.4]]) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(r);
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Colorful blossoms
  const flowers = [
    { x: 128, y: 40, col: '#e11d48', cen: '#fde047', rad: 16 },
    { x: 82, y: 56, col: '#f59e0b', cen: '#7c2d12', rad: 14 },
    { x: 176, y: 58, col: '#ec4899', cen: '#fef08a', rad: 14 },
    { x: 100, y: 80, col: '#8b5cf6', cen: '#fde047', rad: 12 },
    { x: 162, y: 84, col: '#ef4444', cen: '#fef08a', rad: 12 },
  ];
  for (const fl of flowers) {
    ctx.fillStyle = fl.col;
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fl.x + Math.cos(a) * fl.rad * 0.65, fl.y + Math.sin(a) * fl.rad * 0.65, fl.rad * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = fl.cen;
    ctx.beginPath();
    ctx.arc(fl.x, fl.y, fl.rad * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner gilded frame accent
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = '#fcd34d';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  return finalizeTex(c, false);
}

/** Precinct cinderblock / concrete wall texture */
function buildPrecinctWallTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#566170';
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rh = size / rows;
  const cw = size / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (cw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const bx = col * cw + off;
      const by = r * rh;
      const shade = 78 + Math.floor(hashNoise(r * 19 + col * 11) * 18);
      ctx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 18})`;
      ctx.fillRect(bx + 2, by + 2, cw - 4, rh - 4);
    }
  }
  // Gritty speckle
  for (let i = 0; i < 450; i++) {
    const x = hashNoise(i * 3 + 1) * size;
    const y = hashNoise(i * 3 + 2) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(226, 232, 240, 0.08)' : 'rgba(20, 26, 36, 0.14)';
    ctx.fillRect(x, y, 2, 2);
  }
  return finalizeTex(c, true);
}

/** Precinct tiled slate concrete floor */
function buildPrecinctFloorTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#47515f';
  ctx.fillRect(0, 0, size, size);

  const step = size / 4;
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) {
      const v = 64 + Math.floor(hashNoise(r * 13 + col * 29) * 16);
      ctx.fillStyle = `rgb(${v}, ${v + 6}, ${v + 14})`;
      ctx.fillRect(col * step + 2, r * step + 2, step - 4, step - 4);
    }
  }
  return finalizeTex(c, true);
}

/** Precinct Detective Evidence Chalkboard with suspect sketch + [7][1] code hint! */
function buildChalkboardTex() {
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');

  // Deep dusty chalkboard green-slate
  ctx.fillStyle = '#1f362d';
  ctx.fillRect(0, 0, w, h);

  // Subtle chalk smudge clouds
  for (let i = 0; i < 90; i++) {
    const x = hashNoise(i * 7 + 1) * w;
    const y = hashNoise(i * 7 + 2) * h;
    ctx.fillStyle = 'rgba(226, 240, 234, 0.04)';
    ctx.beginPath();
    ctx.arc(x, y, 10 + hashNoise(i) * 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title banner
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 28px system-ui, sans-serif';
  ctx.fillText('PRECINCT CASE BOARD', 26, 42);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(26, 52);
  ctx.lineTo(350, 52);
  ctx.stroke();

  // Pinned polaroid card on left
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(36, 74, 118, 134);
  ctx.fillStyle = '#334155';
  ctx.fillRect(46, 84, 98, 92);
  // Blocky Tyler sketch inside card
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(72, 134, 46, 38);
  ctx.fillStyle = '#f0c294';
  ctx.fillRect(79, 104, 32, 30);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(77, 94, 36, 14);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.fillText('TYLER?!', 64, 198);

  // Red mystery string connecting photo to code circle
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(148, 128);
  ctx.lineTo(256, 150);
  ctx.lineTo(372, 114);
  ctx.stroke();

  // Big clear chalk digits [7][1] for 5-6 yr olds!
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(216, 88, 124, 92, 14);
  ctx.stroke();

  ctx.fillStyle = '#fde047';
  ctx.font = '900 54px system-ui, sans-serif';
  ctx.fillText('7  1', 236, 152);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.fillText('CODE START!', 218, 212);

  // Spray can sketch on right
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(386, 106, 44, 72);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(398, 90, 20, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillText('GREEN SPRAY', 362, 204);

  return finalizeTex(c, false);
}

/** Jewelry store plush crimson velvet carpet with gold border trim */
function buildRedVelvetTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#8e1b2a';
  ctx.fillRect(0, 0, size, size);

  // Subtle woven velvet plush nap
  for (let i = 0; i < 800; i++) {
    const x = hashNoise(i * 5 + 3) * size;
    const y = hashNoise(i * 5 + 7) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(225, 29, 72, 0.16)' : 'rgba(69, 10, 18, 0.22)';
    ctx.fillRect(x, y, 2.5, 2.5);
  }

  // Subtle gold diamond weave pattern
  ctx.strokeStyle = 'rgba(245, 196, 81, 0.22)';
  ctx.lineWidth = 2;
  const step = 64;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + step / 2, y + 6);
      ctx.lineTo(x + step - 6, y + step / 2);
      ctx.lineTo(x + step / 2, y + step - 6);
      ctx.lineTo(x + 6, y + step / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
  return finalizeTex(c, true);
}

/** Jewelry store rear red-brick wall texture */
function buildBrickWallTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#b7ada2';
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rh = size / rows;
  const cw = size / cols;
  const pal = ['#8c3730', '#7e2e28', '#984038', '#752923', '#a3483f'];
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (cw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const bx = col * cw + off + 1.5;
      const by = r * rh + 1.5;
      ctx.fillStyle = pal[Math.floor(hashNoise(r * 23 + (col + 3) * 13) * pal.length)];
      ctx.fillRect(bx, by, cw - 3, rh - 3);
      ctx.fillStyle = 'rgba(255, 230, 210, 0.12)';
      ctx.fillRect(bx, by, cw - 3, 2.5);
    }
  }
  return finalizeTex(c, true);
}

/** Jewelry store warm ivory-cream perimeter tile */
function buildStoreMarbleTex() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dcd4c6';
  ctx.fillRect(0, 0, size, size);
  const step = size / 2;
  ctx.strokeStyle = 'rgba(100, 90, 78, 0.25)';
  ctx.lineWidth = 2;
  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < 2; col++) {
      ctx.strokeRect(col * step + 1, r * step + 1, step - 2, step - 2);
    }
  }
  return finalizeTex(c, true);
}

/** Clean sign plaque generator (e.g., EMPLOYEES ONLY, VAN-8641) */
export function makeSignTex(text, bg = '#1e293b', fg = '#f8fafc', border = '#f59e0b') {
  const w = 256;
  const h = 80;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = fg;
  ctx.font = '900 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1, w - 24);
  return finalizeTex(c, false);
}

let _texCache = null;

export function getWorldTextures() {
  if (_texCache) return _texCache;
  _texCache = {
    checkerMarble: buildCheckerMarbleTex(),
    mahoganyPanel: buildMahoganyPanelTex(),
    floralPainting: buildFloralPaintingTex(),
    precinctWall: buildPrecinctWallTex(),
    precinctFloor: buildPrecinctFloorTex(),
    chalkboard: buildChalkboardTex(),
    redVelvet: buildRedVelvetTex(),
    brickWall: buildBrickWallTex(),
    storeMarble: buildStoreMarbleTex(),
    signEmployees: makeSignTex('EMPLOYEES ONLY', '#7f1d1d', '#fef2f2', '#facc15'),
    signVanPlate: makeSignTex('VAN-8641', '#f8fafc', '#1e3a8a', '#2563eb'),
    signLuxe: makeSignTex('LUXE JEWELS', '#3b0764', '#fde047', '#f59e0b'),
  };
  return _texCache;
}
