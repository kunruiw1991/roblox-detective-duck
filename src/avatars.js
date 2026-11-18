/**
 * Detective Duck Hero Rig (4 unlockable skins + waddling walk cycle + QUACK beak animation)
 * AND Authentic Blocky Roblox R6 Suspect Avatars (standing & seated) + 96x96 HUD Portraits.
 * - Low draw calls: 6 meshes for Detective Duck, 6 meshes per Roblox R6 Suspect.
 * - Strict PBR compliance: metalness <= 0.22, roughness >= 0.28, zero pitch-black.
 */

import * as THREE from '../vendor/three.module.min.js';
import { DUCK_SKINS, SKIN_BY_ID } from './config.js';
import { GeomBatcher, safeStdMat } from './geom_utils.js';

let _sharedBodyMat = null;
function getSharedBodyMat() {
  if (!_sharedBodyMat) {
    _sharedBodyMat = safeStdMat({
      vertexColors: true,
      roughness: 0.56,
      metalness: 0.08,
    });
  }
  return _sharedBodyMat;
}

const _duckSkinGeoCache = new Map();
const _duckPortraitCache = new Map();
const _suspectCache = new Map();
const _suspectPortraitCache = new Map();
const _nametagCache = new Map();

// ---------------- DETECTIVE DUCK RIG ----------------

function buildDuckSkinGeos(skin) {
  if (_duckSkinGeoCache.has(skin.id)) return _duckSkinGeoCache.get(skin.id);

  // 1. Body + Belted Detective Trenchcoat + White Neck Ring + Tufted Duck Tail (y: 0.28..1.20)
  const body = new GeomBatcher();
  // Plump rounded-blocky duck trenchcoat torso
  body.box(0.84, 0.76, 0.72, 0, 0.72, 0.0, skin.coatColor);
  // Flared coat skirt bottom
  body.box(0.90, 0.22, 0.78, 0, 0.42, 0.0, skin.coatColor);
  // Trenchcoat lapels & collar
  body.box(0.24, 0.36, 0.06, -0.18, 0.90, 0.36, skin.coatAccent, 0, 0, -0.22);
  body.box(0.24, 0.36, 0.06, 0.18, 0.90, 0.36, skin.coatAccent, 0, 0, 0.22);
  body.box(0.62, 0.14, 0.62, 0, 1.09, -0.02, skin.coatAccent);
  // Crisp inner detective shirt & tie V
  body.box(0.26, 0.30, 0.04, 0, 0.91, 0.355, 0xf8fafc);
  body.box(0.09, 0.26, 0.05, 0, 0.88, 0.37, 0xdc2626);
  // Trenchcoat waist belt & brass buckle
  body.box(0.88, 0.11, 0.76, 0, 0.62, 0.0, 0x3b281c);
  body.box(0.16, 0.13, 0.06, 0, 0.62, 0.375, 0xeab308);
  // Coat double-breasted buttons
  body.box(0.06, 0.06, 0.04, -0.12, 0.76, 0.37, 0x3b281c);
  body.box(0.06, 0.06, 0.04, 0.12, 0.76, 0.37, 0x3b281c);
  // Iconic crisp Mallard White Neck Ring!
  body.cyl(0.27, 0.30, 0.12, 14, 0, 1.18, 0.04, skin.neckRing);
  // Cute jaunty duck tail feathers poking out the rear (-Z)
  body.box(0.36, 0.24, 0.34, 0, 0.56, -0.46, skin.tailColor, 0.42, 0, 0);
  body.box(0.24, 0.16, 0.24, 0, 0.68, -0.58, skin.coatColor, 0.65, 0, 0);

  // 2. Green Mallard Head + Glossy Eyes + Jaunty Black Fedora (+ Optional Brass Monocle!)
  const head = new GeomBatcher();
  // Head block + slightly rounded crown (local y: 0.0..0.52)
  head.box(0.56, 0.48, 0.56, 0, 0.26, 0.0, skin.headColor);
  head.cyl(0.25, 0.29, 0.10, 14, 0, 0.50, 0.0, skin.headColor);
  // Upper bright yellow duck bill (fixed to head; lower jaw pivots separately for QUACK!)
  head.box(0.34, 0.11, 0.38, 0, 0.22, 0.40, skin.billColor);
  head.box(0.30, 0.06, 0.32, 0, 0.27, 0.38, skin.billColor);
  // Cute bill nostrils
  head.box(0.04, 0.03, 0.05, -0.07, 0.295, 0.38, 0xb45309);
  head.box(0.04, 0.03, 0.05, 0.07, 0.295, 0.38, 0xb45309);
  // Expressive cartoon duck eyes (dark slate + crisp white highlight dot)
  head.box(0.11, 0.13, 0.05, -0.17, 0.34, 0.285, 0x1e2430);
  head.box(0.11, 0.13, 0.05, 0.17, 0.34, 0.285, 0x1e2430);
  head.box(0.045, 0.045, 0.055, -0.15, 0.365, 0.295, 0xf8fafc);
  head.box(0.045, 0.045, 0.055, 0.19, 0.365, 0.295, 0xf8fafc);
  // Cheek tufts
  head.box(0.60, 0.14, 0.24, 0, 0.18, 0.04, skin.headColor);

  // Jaunty Black Detective Fedora tilted slightly rakishly!
  head.cyl(0.46, 0.49, 0.045, 16, 0, 0.54, 0.01, skin.hatColor, -0.09, 0, 0.06);
  head.cyl(0.28, 0.30, 0.09, 16, 0, 0.60, 0.0, skin.hatBand, -0.09, 0, 0.06);
  head.cyl(0.22, 0.28, 0.21, 16, 0, 0.74, -0.01, skin.hatColor, -0.09, 0, 0.06);
  head.box(0.14, 0.05, 0.36, 0, 0.84, -0.02, skin.hatColor, -0.09, 0, 0.06);

  if (skin.monocle) {
    // Gleaming brass detective monocle over right eye!
    head.torus(0.095, 0.018, 8, 16, 0.17, 0.34, 0.315, 0xfacc15);
    head.cyl(0.085, 0.085, 0.015, 12, 0.17, 0.34, 0.31, 0xbae6fd, Math.PI * 0.5, 0, 0);
    head.box(0.02, 0.16, 0.02, 0.27, 0.24, 0.30, 0xf59e0b, 0, 0, 0.18);
  }

  // 3. Lower jaw bill (pivots open during QUACK!)
  const jaw = new GeomBatcher();
  jaw.box(0.29, 0.075, 0.31, 0, -0.03, 0.16, skin.billColor);

  // 4. Wing (left/right mirror cleanly via pivot x)
  const wing = new GeomBatcher();
  wing.box(0.16, 0.50, 0.46, 0, -0.22, -0.02, skin.wingColor);
  wing.box(0.17, 0.11, 0.48, 0, -0.42, -0.02, skin.coatAccent);

  // 5. Webbed Orange Duck Foot (hip pivot at y = 0.28, sole rests cleanly at y = 0!)
  const foot = new GeomBatcher();
  foot.cyl(0.065, 0.065, 0.22, 10, 0, -0.11, 0, skin.feetColor);
  // Wide flat webbed foot pad + 3 cute front toes!
  foot.box(0.28, 0.06, 0.36, 0, -0.25, 0.08, skin.feetColor);
  foot.box(0.09, 0.055, 0.12, -0.10, -0.255, 0.28, skin.feetColor, 0, -0.22, 0);
  foot.box(0.09, 0.055, 0.14, 0.0, -0.255, 0.30, skin.feetColor);
  foot.box(0.09, 0.055, 0.12, 0.10, -0.255, 0.28, skin.feetColor, 0, 0.22, 0);

  const geos = {
    body: body.build(),
    head: head.build(),
    jaw: jaw.build(),
    wing: wing.build(),
    foot: foot.build(),
  };
  _duckSkinGeoCache.set(skin.id, geos);
  return geos;
}

export function createDetectiveDuckRig(skinId = 'mallard') {
  const skin = SKIN_BY_ID[skinId] || DUCK_SKINS[0];
  const geos = buildDuckSkinGeos(skin);
  const mat = getSharedBodyMat();

  const group = new THREE.Group();
  group.name = 'DetectiveDuck';

  // Inner waddle pivot so comical side-to-side duck roll stays centered on feet
  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const bodyMesh = new THREE.Mesh(geos.body, mat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyPivot.add(bodyMesh);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.22, 0.04);
  const headMesh = new THREE.Mesh(geos.head, mat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headPivot.add(headMesh);

  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, 0.16, 0.22);
  const jawMesh = new THREE.Mesh(geos.jaw, mat);
  jawMesh.castShadow = false;
  jawPivot.add(jawMesh);
  headPivot.add(jawPivot);
  bodyPivot.add(headPivot);

  const leftWingPivot = new THREE.Group();
  leftWingPivot.position.set(-0.48, 0.96, 0.0);
  const leftWingMesh = new THREE.Mesh(geos.wing, mat);
  leftWingMesh.castShadow = true;
  leftWingPivot.add(leftWingMesh);
  bodyPivot.add(leftWingPivot);

  const rightWingPivot = new THREE.Group();
  rightWingPivot.position.set(0.48, 0.96, 0.0);
  const rightWingMesh = new THREE.Mesh(geos.wing, mat);
  rightWingMesh.castShadow = true;
  rightWingPivot.add(rightWingMesh);
  bodyPivot.add(rightWingPivot);

  const leftFootPivot = new THREE.Group();
  leftFootPivot.position.set(-0.22, 0.28, 0.02);
  const leftFootMesh = new THREE.Mesh(geos.foot, mat);
  leftFootMesh.castShadow = true;
  leftFootPivot.add(leftFootMesh);
  group.add(leftFootPivot);

  const rightFootPivot = new THREE.Group();
  rightFootPivot.position.set(0.22, 0.28, 0.02);
  const rightFootMesh = new THREE.Mesh(geos.foot, mat);
  rightFootMesh.castShadow = true;
  rightFootPivot.add(rightFootMesh);
  group.add(rightFootPivot);

  return {
    group,
    bodyPivot,
    bodyMesh,
    headPivot,
    headMesh,
    jawPivot,
    jawMesh,
    leftWingPivot,
    leftWingMesh,
    rightWingPivot,
    rightWingMesh,
    leftFootPivot,
    leftFootMesh,
    rightFootPivot,
    rightFootMesh,
    skinId: skin.id,
    _waddlePhase: 0,
    _lastStepHalf: 0,
  };
}

/** Zero-allocation skin swap using pre-cached skin BufferGeometries */
export function applyDuckSkin(rig, skinId) {
  const skin = SKIN_BY_ID[skinId] || DUCK_SKINS[0];
  const geos = buildDuckSkinGeos(skin);
  rig.bodyMesh.geometry = geos.body;
  rig.headMesh.geometry = geos.head;
  rig.jawMesh.geometry = geos.jaw;
  rig.leftWingMesh.geometry = geos.wing;
  rig.rightWingMesh.geometry = geos.wing;
  rig.leftFootMesh.geometry = geos.foot;
  rig.rightFootMesh.geometry = geos.foot;
  rig.skinId = skin.id;
}

/**
 * Comical side-to-side Mallard Duck waddle animation!
 * Calls `onFootstep(alt)` on every webbed-foot slap for *flap-flap-flap* SFX.
 */
export function animateDetectiveDuck(
  rig,
  { speed = 0, airborne = false, quackTimer = 0, celebrateTimer = 0, dt = 0.016, time = 0, onFootstep = null } = {}
) {
  const cdt = Math.min(Math.max(dt || 0.016, 0), 0.1);
  const moveFrac = Math.min(1, Math.max(0, speed / 7.5));

  if (moveFrac > 0.05 && !airborne) {
    rig._waddlePhase += cdt * (9.0 + moveFrac * 6.5);
    const halfIdx = Math.floor(rig._waddlePhase / Math.PI);
    if (halfIdx !== rig._lastStepHalf) {
      rig._lastStepHalf = halfIdx;
      if (onFootstep) onFootstep(halfIdx % 2 === 0);
    }
  } else {
    rig._waddlePhase *= Math.max(0, 1 - cdt * 9);
    rig._lastStepHalf = Math.floor(rig._waddlePhase / Math.PI);
  }

  const p = rig._waddlePhase;
  const waddleRoll = Math.sin(p) * 0.17 * moveFrac;
  const waddleBob = Math.abs(Math.sin(p)) * 0.09 * moveFrac;
  const idleBob = Math.sin(time * 2.6) * 0.015;
  const cheerHop = celebrateTimer > 0 ? Math.abs(Math.sin(time * 10.0)) * 0.24 : 0;

  // Body side-to-side comical duck waddle!
  rig.bodyPivot.rotation.z = waddleRoll;
  rig.bodyPivot.position.y = waddleBob + idleBob + cheerHop;

  // Webbed feet slap
  if (airborne) {
    rig.leftFootPivot.rotation.x = 0.45;
    rig.rightFootPivot.rotation.x = -0.35;
  } else if (celebrateTimer > 0) {
    rig.leftFootPivot.rotation.x = Math.sin(time * 12) * 0.35;
    rig.rightFootPivot.rotation.x = -Math.sin(time * 12) * 0.35;
  } else {
    rig.leftFootPivot.rotation.x = Math.sin(p) * 0.85 * moveFrac;
    rig.rightFootPivot.rotation.x = -Math.sin(p) * 0.85 * moveFrac;
  }
  rig.leftFootPivot.position.y = 0.28 + cheerHop;
  rig.rightFootPivot.position.y = 0.28 + cheerHop;

  // Wings flap excitedly during QUACK, Jump, Celebrate, or gentle waddle swing
  const quackFrac = Math.min(1, quackTimer / 0.32);
  if (airborne || quackFrac > 0.05 || celebrateTimer > 0) {
    const flap = Math.sin(time * 24) * 0.45 + 0.65;
    rig.leftWingPivot.rotation.z = -flap;
    rig.rightWingPivot.rotation.z = flap;
    rig.leftWingPivot.rotation.x = 0;
    rig.rightWingPivot.rotation.x = 0;
  } else {
    rig.leftWingPivot.rotation.z = -(0.08 + Math.abs(Math.sin(p)) * 0.24 * moveFrac);
    rig.rightWingPivot.rotation.z = 0.08 + Math.abs(Math.sin(p)) * 0.24 * moveFrac;
    rig.leftWingPivot.rotation.x = -Math.sin(p) * 0.38 * moveFrac;
    rig.rightWingPivot.rotation.x = Math.sin(p) * 0.38 * moveFrac;
  }

  // Head jaunty counter-tilt & open yellow bill on QUACK!
  rig.headPivot.rotation.z = -waddleRoll * 0.55;
  rig.headPivot.rotation.x = quackFrac > 0 ? -0.18 * quackFrac : Math.sin(p * 2) * 0.05 * moveFrac;
  rig.headPivot.rotation.y = Math.sin(time * 1.4) * 0.08 * (1 - moveFrac);
  rig.jawPivot.rotation.x = quackFrac > 0 ? 0.55 * Math.sin(quackFrac * Math.PI) : 0;
}

// ---------------- BLOCKY ROBLOX R6 SUSPECTS ----------------

const SUSPECT_PRESETS = {
  butler: {
    id: 'butler',
    skin: 0xf4cfa8,
    skinCss: '#f4cfa8',
    torso: 0x262f3f,
    accent: 0xf8fafc,
    pants: 0x1e2532,
    shoes: 0x2c3444,
    hat: 'tophat',
    hatColor: '#252c3b',
    hatBand: '#dc2626',
    hair: 'gray_side',
    hairColor: '#94a3b8',
    face: 'mustache',
  },
  chef: {
    id: 'chef',
    skin: 0xf1c295,
    skinCss: '#f1c295',
    torso: 0xf8fafc,
    accent: 0xe2e8f0,
    pants: 0x334155,
    shoes: 0x283140,
    hat: 'chef',
    hatColor: '#f8fafc',
    hatBand: '#dc2626',
    hair: 'none',
    hairColor: '#5c3d2e',
    face: 'friendly',
  },
  tyler: {
    id: 'tyler',
    skin: 0xebb98a,
    skinCss: '#ebb98a',
    torso: 0x16a34a,
    accent: 0x15803d,
    pants: 0x334155,
    shoes: 0x78350f, // Muddy brown boots!
    muddyBoots: true,
    hat: 'beanie',
    hatColor: '#273142',
    hatBand: '#22c55e',
    hair: 'none',
    hairColor: '#334155',
    face: 'smirk',
  },
  janitor: {
    id: 'janitor',
    skin: 0xe2b184,
    skinCss: '#e2b184',
    torso: 0x0284c7,
    accent: 0x0369a1,
    pants: 0x1e3a8a,
    shoes: 0x3b2f26,
    hat: 'cap',
    hatColor: '#0284c7',
    hatBand: '#facc15',
    hair: 'none',
    hairColor: '#6b4f3a',
    face: 'friendly',
  },
  witness: {
    id: 'witness',
    skin: 0xf5cfb0,
    skinCss: '#f5cfb0',
    torso: 0xeab308,
    accent: 0xca8a04,
    pants: 0x3b82f6,
    shoes: 0x334155,
    hat: 'none',
    hatColor: '#eab308',
    hatBand: '#f8fafc',
    hair: 'bob',
    hairColor: '#5c3a21',
    face: 'surprised',
  },
  jeweler: {
    id: 'jeweler',
    skin: 0xf3cba5,
    skinCss: '#f3cba5',
    torso: 0x9333ea,
    accent: 0xf8fafc,
    pants: 0x3b0764,
    shoes: 0x262d3d,
    hat: 'none',
    hatColor: '#9333ea',
    hatBand: '#facc15',
    hair: 'bob',
    hairColor: '#eab308',
    face: 'surprised',
  },
  guard: {
    id: 'guard',
    skin: 0xd9a273,
    skinCss: '#d9a273',
    torso: 0x1d4ed8,
    accent: 0xfacc15,
    pants: 0x1e293b,
    shoes: 0x252c3b,
    hat: 'cap',
    hatColor: '#1e3a8a',
    hatBand: '#facc15',
    hair: 'none',
    hairColor: '#242933',
    face: 'stern',
  },
  viper: {
    id: 'viper',
    skin: 0xedc298,
    skinCss: '#edc298',
    torso: 0x374151,
    accent: 0xef4444,
    pants: 0x262f3f,
    shoes: 0x2563eb, // Blue paint on shoes & gloves!
    blueGloves: true,
    hat: 'beanie',
    hatColor: '#991b1b',
    hatBand: '#3b82f6',
    hair: 'none',
    hairColor: '#252b36',
    face: 'smirk',
  },
};

function buildSuspectFaceTex(p) {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  // Face band (top 96px)
  ctx.fillStyle = p.skinCss;
  ctx.fillRect(0, 0, w, 96);

  if (p.hair !== 'none') {
    ctx.fillStyle = p.hairColor;
    ctx.fillRect(0, 0, 84, 82);
    ctx.fillRect(172, 0, 84, 82);
    ctx.fillRect(84, 0, 88, 18);
  }

  const cx = 128;
  const eyeY = 44;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(cx - 14, eyeY, 5, 7, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 14, eyeY, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cx - 15.5, eyeY - 2, 1.8, 0, Math.PI * 2);
  ctx.arc(cx + 12.5, eyeY - 2, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  if (p.face === 'smirk') {
    ctx.beginPath();
    ctx.moveTo(cx - 21, eyeY - 12);
    ctx.lineTo(cx - 8, eyeY - 10);
    ctx.moveTo(cx + 8, eyeY - 13);
    ctx.lineTo(cx + 21, eyeY - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, 66);
    ctx.quadraticCurveTo(cx + 4, 70, cx + 13, 60);
    ctx.stroke();
  } else if (p.face === 'mustache') {
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.ellipse(cx - 7, 61, 8, 3.5, -0.15, 0, Math.PI * 2);
    ctx.ellipse(cx + 7, 61, 8, 3.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 7, 68);
    ctx.lineTo(cx + 7, 68);
    ctx.stroke();
  } else if (p.face === 'surprised') {
    ctx.beginPath();
    ctx.arc(cx, 66, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.face === 'stern') {
    ctx.beginPath();
    ctx.moveTo(cx - 20, eyeY - 11);
    ctx.lineTo(cx - 8, eyeY - 9);
    ctx.moveTo(cx + 8, eyeY - 9);
    ctx.lineTo(cx + 20, eyeY - 11);
    ctx.moveTo(cx - 9, 65);
    ctx.lineTo(cx + 9, 65);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, 59, 10, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();
  }

  // Bottom strip: 4 solid swatches (skin, hat, band, hair)
  const sw = [p.skinCss, p.hatColor, p.hatBand, p.hairColor];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = sw[i];
    ctx.fillRect(i * 64, 96, 64, 32);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function getSuspectAssets(presetKey) {
  const key = SUSPECT_PRESETS[presetKey] ? presetKey : 'tyler';
  if (_suspectCache.has(key)) return _suspectCache.get(key);
  const p = SUSPECT_PRESETS[key];

  // Torso
  const torso = new GeomBatcher();
  torso.box(0.78, 0.78, 0.40, 0, 0, 0, p.torso);
  torso.box(0.24, 0.34, 0.03, 0, 0.18, 0.205, p.accent);
  torso.box(0.80, 0.08, 0.42, 0, -0.34, 0, 0x262d3c);

  // Arm
  const arm = new GeomBatcher();
  arm.box(0.36, 0.52, 0.36, 0, -0.22, 0, p.torso);
  arm.box(0.35, 0.18, 0.35, 0, -0.57, 0, p.blueGloves ? 0x2563eb : p.skin);

  // Leg
  const leg = new GeomBatcher();
  leg.box(0.36, 0.54, 0.36, 0, -0.27, 0, p.pants);
  leg.box(0.37, 0.18, 0.41, 0, -0.63, 0.02, p.shoes);
  if (p.muddyBoots) {
    // Mud splatters on Tyler's boots!
    leg.box(0.39, 0.09, 0.43, 0, -0.67, 0.02, 0x92400e);
  }

  // Head + hat/hair (UV mapped to bottom swatch strip + face cylinder)
  const chunks = [];
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);

  const pushPart = (raw, uvFn, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    raw.dispose();
    euler.set(rx, ry, rz);
    quat.setFromEuler(euler);
    pos.set(x, y, z);
    mat4.compose(pos, quat, scl);
    g.applyMatrix4(mat4);
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    const uvAttr = g.attributes.uv;
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const [u, v] = uvFn(uvAttr ? uvAttr.getX(i) : 0.5, uvAttr ? uvAttr.getY(i) : 0.5);
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
    chunks.push({ pos: g.attributes.position.array, norm: g.attributes.normal.array, uv: uvs, count });
    g.dispose();
  };
  const swUv = (idx) => () => [(idx + 0.5) / 4, 0.125];

  pushPart(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 10), swUv(0), 0, 0.03, 0);
  pushPart(new THREE.CylinderGeometry(0.26, 0.21, 0.06, 14), swUv(0), 0, 0.08, 0);
  pushPart(
    new THREE.CylinderGeometry(0.26, 0.26, 0.36, 16, 1, true, Math.PI, Math.PI * 2),
    (u, v) => [u, 0.27 + v * 0.71],
    0,
    0.29,
    0
  );
  const topSw = p.hair !== 'none' ? 3 : 0;
  pushPart(new THREE.CylinderGeometry(0.21, 0.26, 0.06, 14), swUv(topSw), 0, 0.50, 0);

  if (p.hair === 'bob') {
    pushPart(new THREE.BoxGeometry(0.56, 0.14, 0.54), swUv(3), 0, 0.52, -0.01);
    pushPart(new THREE.BoxGeometry(0.11, 0.40, 0.42), swUv(3), -0.26, 0.28, -0.04);
    pushPart(new THREE.BoxGeometry(0.11, 0.40, 0.42), swUv(3), 0.26, 0.28, -0.04);
    pushPart(new THREE.BoxGeometry(0.56, 0.42, 0.14), swUv(3), 0, 0.28, -0.22);
  }
  if (p.hat === 'tophat') {
    pushPart(new THREE.CylinderGeometry(0.40, 0.42, 0.04, 14), swUv(1), 0, 0.53, 0);
    pushPart(new THREE.CylinderGeometry(0.26, 0.26, 0.09, 14), swUv(2), 0, 0.59, 0);
    pushPart(new THREE.CylinderGeometry(0.27, 0.25, 0.36, 14), swUv(1), 0, 0.80, 0);
  } else if (p.hat === 'chef') {
    pushPart(new THREE.CylinderGeometry(0.27, 0.26, 0.16, 14), swUv(1), 0, 0.58, 0);
    pushPart(new THREE.SphereGeometry(0.28, 12, 8), swUv(1), 0, 0.76, 0);
    pushPart(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 14), swUv(2), 0, 0.52, 0);
  } else if (p.hat === 'beanie') {
    pushPart(new THREE.CylinderGeometry(0.29, 0.29, 0.11, 14), swUv(2), 0, 0.51, 0);
    pushPart(new THREE.CylinderGeometry(0.23, 0.28, 0.17, 14), swUv(1), 0, 0.63, -0.01);
  } else if (p.hat === 'cap') {
    pushPart(new THREE.CylinderGeometry(0.27, 0.28, 0.15, 14), swUv(1), 0, 0.54, 0);
    pushPart(new THREE.BoxGeometry(0.40, 0.04, 0.24), swUv(2), 0, 0.50, 0.27, 0.08, 0, 0);
  }

  let total = 0;
  for (const ch of chunks) total += ch.count;
  const posArr = new Float32Array(total * 3);
  const normArr = new Float32Array(total * 3);
  const uvArr = new Float32Array(total * 2);
  let off = 0;
  for (const ch of chunks) {
    posArr.set(ch.pos, off * 3);
    normArr.set(ch.norm, off * 3);
    uvArr.set(ch.uv, off * 2);
    off += ch.count;
  }
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  headGeo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  headGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  headGeo.computeBoundingSphere();

  const headMat = safeStdMat({
    map: buildSuspectFaceTex(p),
    roughness: 0.56,
    metalness: 0.06,
  });

  const assets = {
    preset: p,
    torsoGeo: torso.build(),
    armGeo: arm.build(),
    legGeo: leg.build(),
    headGeo,
    headMat,
  };
  _suspectCache.set(key, assets);
  return assets;
}

function makeNametagSprite(labelText) {
  let tex = _nametagCache.get(labelText);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 56;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(18, 24, 36, 0.86)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(10, 8, 236, 40, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 128, 29, 216);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    _nametagCache.set(labelText, tex);
  }
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.65, 0.36, 1);
  return sp;
}

export function createSuspectAvatar(presetKey, labelText = '', seated = false) {
  const assets = getSuspectAssets(presetKey);
  const bodyMat = getSharedBodyMat();
  const group = new THREE.Group();
  group.name = `suspect_${presetKey}`;

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.20, 0.72, 0);
  const ll = new THREE.Mesh(assets.legGeo, bodyMat);
  ll.receiveShadow = true;
  leftLegPivot.add(ll);
  group.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.20, 0.72, 0);
  const rl = new THREE.Mesh(assets.legGeo, bodyMat);
  rl.receiveShadow = true;
  rightLegPivot.add(rl);
  group.add(rightLegPivot);

  const torso = new THREE.Mesh(assets.torsoGeo, bodyMat);
  torso.position.set(0, 1.11, 0);
  torso.receiveShadow = true;
  group.add(torso);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.57, 1.46, 0);
  const la = new THREE.Mesh(assets.armGeo, bodyMat);
  leftArmPivot.add(la);
  group.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.57, 1.46, 0);
  const ra = new THREE.Mesh(assets.armGeo, bodyMat);
  rightArmPivot.add(ra);
  group.add(rightArmPivot);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.50, 0);
  const hm = new THREE.Mesh(assets.headGeo, assets.headMat);
  headPivot.add(hm);
  group.add(headPivot);

  if (seated) {
    // Classic blocky Roblox seated pose (legs forward -Math.PI/2, sitting on interrogation chair!)
    leftLegPivot.rotation.x = -Math.PI * 0.48;
    rightLegPivot.rotation.x = -Math.PI * 0.48;
    leftLegPivot.position.y = 0.56;
    rightLegPivot.position.y = 0.56;
    torso.position.y = 0.94;
    leftArmPivot.position.y = 1.29;
    rightArmPivot.position.y = 1.29;
    leftArmPivot.rotation.x = -0.65;
    rightArmPivot.rotation.x = -0.65;
    headPivot.position.y = 1.33;
  }

  let nametagSprite = null;
  if (labelText) {
    nametagSprite = makeNametagSprite(labelText);
    nametagSprite.position.set(0, seated ? 2.48 : 2.66, 0);
    group.add(nametagSprite);
  }

  return {
    group,
    torso,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    nametagSprite,
    seated,
    reactTimer: 0,
  };
}

export function animateSuspectAvatar(rig, { time = 0, dt = 0.016 } = {}) {
  if (!rig) return;
  if (rig.reactTimer > 0) {
    rig.reactTimer = Math.max(0, rig.reactTimer - dt);
  }
  const jumpFrac = rig.reactTimer > 0 ? Math.sin((rig.reactTimer / 0.75) * Math.PI) : 0;
  const breath = Math.sin(time * 2.1) * 0.012;
  const yOff = jumpFrac * (rig.seated ? 0.14 : 0.34);

  const baseTorsoY = rig.seated ? 0.94 : 1.11;
  const baseArmY = rig.seated ? 1.29 : 1.46;
  const baseHeadY = rig.seated ? 1.33 : 1.50;
  rig.torso.position.y = baseTorsoY + breath + yOff;
  rig.leftArmPivot.position.y = baseArmY + breath + yOff;
  rig.rightArmPivot.position.y = baseArmY + breath + yOff;
  rig.headPivot.position.y = baseHeadY + breath + yOff;
  if (!rig.seated) {
    rig.leftLegPivot.position.y = 0.72 + yOff;
    rig.rightLegPivot.position.y = 0.72 + yOff;
  }
  if (jumpFrac > 0.05) {
    rig.leftArmPivot.rotation.x = 2.4 * jumpFrac;
    rig.rightArmPivot.rotation.x = 2.4 * jumpFrac;
    rig.headPivot.rotation.z = Math.sin(time * 22) * 0.14;
  } else {
    rig.leftArmPivot.rotation.x = rig.seated ? -0.65 : 0;
    rig.rightArmPivot.rotation.x = rig.seated ? -0.65 : 0;
    rig.headPivot.rotation.z = 0;
    rig.headPivot.rotation.y = Math.sin(time * 1.1) * 0.14;
  }
}

// ---------------- 96x96 PORTRAITS FOR ACCUSE & WARDROBE ----------------

export function getSuspectPortrait(presetKey) {
  if (_suspectPortraitCache.has(presetKey)) return _suspectPortraitCache.get(presetKey);
  const p = SUSPECT_PRESETS[presetKey] || SUSPECT_PRESETS.tyler;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');

  const bg = ctx.createRadialGradient(48, 44, 6, 48, 48, 56);
  bg.addColorStop(0, '#334155');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 96, 96);

  // Shoulders
  ctx.fillStyle = `#${p.torso.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.roundRect(14, 66, 68, 34, [10, 10, 0, 0]);
  ctx.fill();
  ctx.fillStyle = `#${p.accent.toString(16).padStart(6, '0')}`;
  ctx.fillRect(42, 66, 12, 24);

  // Head
  ctx.fillStyle = p.skinCss;
  ctx.beginPath();
  ctx.roundRect(28, 28, 40, 38, 11);
  ctx.fill();

  if (p.hair === 'bob') {
    ctx.fillStyle = p.hairColor;
    ctx.beginPath();
    ctx.roundRect(24, 22, 48, 16, 6);
    ctx.fill();
    ctx.fillRect(24, 34, 7, 28);
    ctx.fillRect(65, 34, 7, 28);
  }
  if (p.hat === 'tophat') {
    ctx.fillStyle = p.hatColor;
    ctx.fillRect(32, 7, 32, 20);
    ctx.fillStyle = p.hatBand;
    ctx.fillRect(32, 22, 32, 5);
    ctx.fillStyle = p.hatColor;
    ctx.fillRect(20, 26, 56, 5);
  } else if (p.hat === 'chef') {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(48, 17, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(31, 20, 34, 11);
    ctx.fillStyle = p.hatBand;
    ctx.fillRect(31, 27, 34, 4);
  } else if (p.hat === 'beanie') {
    ctx.fillStyle = p.hatColor;
    ctx.beginPath();
    ctx.roundRect(27, 14, 42, 18, [14, 14, 2, 2]);
    ctx.fill();
    ctx.fillStyle = p.hatBand;
    ctx.fillRect(26, 26, 44, 6);
  } else if (p.hat === 'cap') {
    ctx.fillStyle = p.hatColor;
    ctx.beginPath();
    ctx.roundRect(27, 15, 42, 16, [12, 12, 2, 2]);
    ctx.fill();
    ctx.fillStyle = p.hatBand;
    ctx.fillRect(24, 27, 50, 5);
  }

  // Eyes & mouth
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(41, 45, 3.2, 0, Math.PI * 2);
  ctx.arc(55, 45, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (p.face === 'smirk') {
    ctx.moveTo(41, 56);
    ctx.quadraticCurveTo(50, 58, 56, 52);
  } else if (p.face === 'surprised') {
    ctx.arc(48, 55, 3.5, 0, Math.PI * 2);
  } else {
    ctx.arc(48, 52, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();

  const url = c.toDataURL('image/png');
  _suspectPortraitCache.set(presetKey, url);
  return url;
}

export function getDuckSkinPortrait(skinId) {
  if (_duckPortraitCache.has(skinId)) return _duckPortraitCache.get(skinId);
  const s = SKIN_BY_ID[skinId] || DUCK_SKINS[0];
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');

  const bg = ctx.createRadialGradient(48, 46, 6, 48, 48, 56);
  bg.addColorStop(0, '#334155');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 96, 96);

  // Trenchcoat shoulders
  ctx.fillStyle = s.coatCss;
  ctx.beginPath();
  ctx.roundRect(14, 66, 68, 34, [12, 12, 0, 0]);
  ctx.fill();
  // White neck ring
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(34, 62, 28, 7);
  // Duck head
  ctx.fillStyle = s.headCss;
  ctx.beginPath();
  ctx.roundRect(28, 28, 40, 36, 12);
  ctx.fill();
  // Fedora
  ctx.fillStyle = s.hatCss;
  ctx.beginPath();
  ctx.roundRect(30, 12, 36, 18, [8, 8, 2, 2]);
  ctx.fill();
  ctx.fillStyle = `#${s.hatBand.toString(16).padStart(6, '0')}`;
  ctx.fillRect(30, 23, 36, 5);
  ctx.fillStyle = s.hatCss;
  ctx.fillRect(18, 27, 60, 5);
  // Bright duck bill
  ctx.fillStyle = s.billCss;
  ctx.beginPath();
  ctx.roundRect(35, 48, 26, 12, 5);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(39, 41, 3.2, 0, Math.PI * 2);
  ctx.arc(57, 41, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(38, 40, 1.2, 0, Math.PI * 2);
  ctx.arc(56, 40, 1.2, 0, Math.PI * 2);
  ctx.fill();
  if (s.monocle) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(57, 41, 6.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const url = c.toDataURL('image/png');
  _duckPortraitCache.set(skinId, url);
  return url;
}
