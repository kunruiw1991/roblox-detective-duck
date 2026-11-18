/**
 * 3D Crime Scene Worlds for [UPDT] Detective Duck:
 *  - Case 1: Penthouse Safe Heist (Checkerboard marble, mahogany panels, floral painting + safe, flooded bathroom + plunger)
 *  - Case 2: Precinct Interrogation Room (Round wooden table, hanging spotlight cone, chalkboard, mop bucket, potted fern, evidence locker)
 *  - Case 3: Jewelry Store Smash-and-Grab (Red velvet carpets, shattered glass cases, crowbar, blue paint trail, security door, White Getaway Van crashed through rear brick wall!)
 * All 3 rooms are pre-built once and toggled via `.visible` (zero leaks, <= 60 draw calls!).
 */

import * as THREE from '../vendor/three.module.min.js';
import { CASES } from './config.js';
import { GeomBatcher, safeStdMat } from './geom_utils.js';
import { getWorldTextures } from './textures.js';

function makeClueRing(x, z, color = 0xfacc15) {
  const geo = new THREE.RingGeometry(0.52, 0.72, 24);
  geo.rotateX(-Math.PI * 0.5);
  const mat = safeStdMat({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    roughness: 0.45,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0.04, z);
  return m;
}

function buildBrassPadlockMesh() {
  const b = new GeomBatcher();
  // Shackle U-loop
  b.torus(0.16, 0.045, 8, 16, 0, 0.22, 0, 0xcbd5e1);
  // Brass lock body
  b.box(0.46, 0.42, 0.18, 0, 0, 0, 0xf59e0b);
  b.box(0.42, 0.34, 0.20, 0, -0.02, 0, 0xd97706);
  // 4 little dial bands
  for (let i = 0; i < 4; i++) {
    b.box(0.075, 0.14, 0.22, -0.135 + i * 0.09, -0.03, 0, 0xfef3c7);
  }
  const mesh = new THREE.Mesh(
    b.build(),
    safeStdMat({ vertexColors: true, roughness: 0.34, metalness: 0.22 })
  );
  mesh.castShadow = true;
  return mesh;
}

/** Room collision resolver (simple AABB obstacles + room perimeter clamping) */
function resolveRoomCollision(x, z, radius, bounds, boxes) {
  let rx = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, x));
  let rz = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, z));

  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(b.maxX, rx));
      const cz = Math.max(b.minZ, Math.min(b.maxZ, rz));
      const dx = rx - cx;
      const dz = rz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          rx += (dx / d) * push;
          rz += (dz / d) * push;
        } else {
          // Inside box: push out along shallowest axis
          const dl = Math.abs(rx - b.minX);
          const dr = Math.abs(b.maxX - rx);
          const dt = Math.abs(rz - b.minZ);
          const db = Math.abs(b.maxZ - rz);
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) rx = b.minX - radius;
          else if (m === dr) rx = b.maxX + radius;
          else if (m === dt) rz = b.minZ - radius;
          else rz = b.maxZ + radius;
        }
      }
    }
    rx = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, rx));
    rz = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, rz));
  }
  return { x: rx, z: rz };
}

// =========================================================================
// CASE 1: PENTHOUSE SAFE HEIST
// =========================================================================
function buildPenthouseRoom(tex) {
  const group = new THREE.Group();
  group.name = 'Room_Penthouse';
  const colliders = [];
  const clueRings = new Map();
  const clueProps = new Map();

  // 1. Checkerboard Marble Floor (main salon + bathroom floor)
  const floorTex = tex.checkerMarble.clone();
  floorTex.needsUpdate = true;
  floorTex.repeat.set(9, 7.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(23.2, 18.8),
    safeStdMat({ map: floorTex, roughness: 0.36, metalness: 0.08 })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  group.add(floor);

  // 2. Mahogany Wood-Panel Perimeter Walls + Open-Archway Bathroom Partition
  const wallTexN = tex.mahoganyPanel.clone();
  wallTexN.needsUpdate = true;
  wallTexN.repeat.set(7, 1.5);
  const wallMat = safeStdMat({ map: wallTexN, roughness: 0.56, metalness: 0.06 });

  const walls = new GeomBatcher();
  // North, West, East full walls (height 5.2) + low South cutaway wainscot (height 1.1) so camera sees in cleanly!
  walls.box(23.6, 5.2, 0.5, 0, 2.6, -9.15, 0xffffff, 0, 0, 0, 0.28);
  walls.box(0.5, 5.2, 18.8, -11.55, 2.6, 0, 0xffffff, 0, 0, 0, 0.28);
  walls.box(0.5, 5.2, 18.8, 11.55, 2.6, 0, 0xffffff, 0, 0, 0, 0.28);
  walls.box(23.6, 0.9, 0.4, 0, 0.45, 9.15, 0xffffff, 0, 0, 0, 0.28);
  // Bathroom divider wall with wide doorway archway (x = -5.0, z from -9.0 to -4.6)
  walls.box(0.35, 4.4, 4.4, -5.0, 2.2, -6.8, 0xffffff, 0, 0, 0, 0.28);
  const wallMesh = new THREE.Mesh(walls.build(), wallMat);
  wallMesh.receiveShadow = true;
  group.add(wallMesh);
  colliders.push({ minX: -5.3, maxX: -4.7, minZ: -9.0, maxZ: -4.5 });

  // 3. Merged Penthouse Props & Furniture (1 single vertex-colored mesh!)
  const props = new GeomBatcher();
  // Gold crown molding along top of walls
  props.box(23.2, 0.22, 0.35, 0, 5.15, -8.85, 0xd4a146);
  props.box(0.35, 0.22, 18.4, -11.25, 5.15, 0, 0xd4a146);
  props.box(0.35, 0.22, 18.4, 11.25, 5.15, 0, 0xd4a146);

  // Recessed Cracked Wall Safe on North Wall behind floral painting (0, 2.0, -8.72)
  props.box(1.9, 1.55, 0.30, 0, 2.05, -8.74, 0x3b4454);
  props.box(1.55, 1.2, 0.24, 0, 2.05, -8.66, 0x1e2430); // Dark looted interior
  // Dropped glittering gold coin still inside cracked safe
  props.cyl(0.14, 0.14, 0.05, 12, 0.25, 1.55, -8.58, 0xfacc15);

  // Flooded Side Bathroom fixtures (left side: x in [-11.0, -5.2])
  // Porcelain bathtub along West wall
  props.box(2.1, 0.85, 3.6, -10.1, 0.425, -6.8, 0xf1f5f9);
  props.box(1.65, 0.42, 3.1, -10.1, 0.68, -6.8, 0x38bdf8); // Overflowing bath water!
  props.cyl(0.08, 0.08, 0.45, 10, -10.8, 1.02, -8.1, 0xcbd5e1);
  // Pedestal sink on North bathroom wall
  props.cyl(0.24, 0.28, 0.92, 12, -7.2, 0.46, -8.25, 0xf8fafc);
  props.box(1.15, 0.26, 0.72, -7.2, 0.98, -8.25, 0xf8fafc);
  props.box(0.85, 0.08, 0.52, -7.2, 1.12, -8.25, 0x38bdf8);
  // Bathroom mirror
  props.box(1.3, 1.5, 0.10, -7.2, 2.45, -8.84, 0xbae6fd);
  props.box(1.44, 1.64, 0.08, -7.2, 2.45, -8.88, 0xb45309);
  colliders.push({ minX: -11.3, maxX: -8.9, minZ: -8.7, maxZ: -4.9 });
  colliders.push({ minX: -7.9, maxX: -6.5, minZ: -8.8, maxZ: -7.8 });

  // Blue water puddles across bathroom floor (hop over them!)
  props.cyl(1.45, 1.55, 0.03, 16, -7.8, 0.02, -5.1, 0x38bdf8);
  props.cyl(0.95, 1.05, 0.03, 14, -6.2, 0.02, -3.5, 0x60a5fa);
  props.cyl(0.82, 0.88, 0.03, 14, -8.4, 0.02, -2.9, 0x38bdf8);

  // Muddy Footprints leading from Cracked Safe toward Bathroom & Tyler!
  const mudPts = [
    [-0.3, -6.6], [0.2, -5.8], [-0.4, -4.9], [-1.0, -4.1],
    [-1.7, -3.3], [-2.8, -2.9], [-4.2, -3.1], [-5.6, -3.8],
  ];
  for (let i = 0; i < mudPts.length; i++) {
    const [mx, mz] = mudPts[i];
    props.box(0.28, 0.025, 0.44, mx, 0.02, mz, 0x78350f, 0, i * 0.25, 0);
  }

  // Study Cabinet with Brass Padlock (East-North corner: x=7.4, z=-7.8)
  props.box(2.6, 2.5, 1.15, 7.4, 1.25, -8.1, 0x5c2e1c);
  props.box(2.74, 0.16, 1.28, 7.4, 2.55, -8.1, 0x7c412d);
  props.box(1.12, 2.05, 0.08, 6.76, 1.24, -7.50, 0x6f3823);
  props.box(1.12, 2.05, 0.08, 8.04, 1.24, -7.50, 0x6f3823);
  props.box(0.14, 0.14, 0.12, 7.26, 1.35, -7.42, 0xf59e0b);
  props.box(0.14, 0.14, 0.12, 7.54, 1.35, -7.42, 0xf59e0b);
  colliders.push({ minX: 6.0, maxX: 8.8, minZ: -8.8, maxZ: -7.4 });

  // Plush Crimson Penthouse Armchair + Mahogany Side Table (East lounge)
  props.box(1.75, 0.65, 1.65, 9.2, 0.36, 1.5, 0x8e1b2a);
  props.box(0.32, 1.45, 1.65, 9.95, 0.85, 1.5, 0x781522);
  props.box(1.65, 0.92, 0.30, 9.2, 0.56, 0.78, 0x781522);
  props.box(1.65, 0.92, 0.30, 9.2, 0.56, 2.22, 0x781522);
  colliders.push({ minX: 8.2, maxX: 10.3, minZ: 0.5, maxZ: 2.5 });

  // Ornate Coffee Table & Lamp (West-South parlor)
  props.box(2.6, 0.16, 1.5, -8.0, 0.68, 3.6, 0x6e3b25);
  for (const [lx, lz] of [[-9.1, 3.0], [-6.9, 3.0], [-9.1, 4.2], [-6.9, 4.2]]) {
    props.box(0.16, 0.68, 0.16, lx, 0.34, lz, 0x4b2617);
  }
  props.cyl(0.28, 0.34, 0.42, 12, -8.5, 1.0, 3.6, 0xfef3c7);
  props.cyl(0.10, 0.16, 0.32, 10, -8.5, 0.84, 3.6, 0xd97706);
  colliders.push({ minX: -9.4, maxX: -6.6, minZ: 2.7, maxZ: 4.5 });

  // Warm wall sconces on North wall
  for (const sx of [-3.4, 3.4]) {
    props.box(0.28, 0.45, 0.22, sx, 3.2, -8.78, 0xd4a146);
    props.sphere(0.20, 10, 8, sx, 3.55, -8.68, 0xfef08a);
  }

  const propMesh = new THREE.Mesh(
    props.build(),
    safeStdMat({ vertexColors: true, roughness: 0.52, metalness: 0.14 })
  );
  propMesh.castShadow = true;
  propMesh.receiveShadow = true;
  group.add(propMesh);

  // 4. Hinged Safe Door (swings open cleanly once painting slides!) + Sliding Framed Floral Painting
  const safeDoorPivot = new THREE.Group();
  safeDoorPivot.position.set(-0.78, 2.05, -8.56);
  const doorB = new GeomBatcher();
  doorB.box(1.48, 1.22, 0.12, 0.74, 0, 0, 0x64748b);
  doorB.cyl(0.20, 0.20, 0.12, 14, 0.88, 0, 0.10, 0xeab308, Math.PI * 0.5, 0, 0);
  const safeDoorMesh = new THREE.Mesh(
    doorB.build(),
    safeStdMat({ vertexColors: true, roughness: 0.45, metalness: 0.20 })
  );
  safeDoorPivot.add(safeDoorMesh);
  group.add(safeDoorPivot);

  const paintingMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 1.75, 0.12),
    safeStdMat({ map: tex.floralPainting, roughness: 0.48, metalness: 0.08 })
  );
  paintingMesh.position.set(0.0, 2.08, -8.42);
  paintingMesh.name = 'FloralPainting';
  group.add(paintingMesh);

  // 5. Physical Evidence Props (Plunger, Room Key, Padlock)
  // Plunger in flooded bathroom
  const plungerB = new GeomBatcher();
  plungerB.cyl(0.055, 0.055, 1.05, 10, 0, 0.68, 0, 0xc28a53);
  plungerB.cyl(0.08, 0.26, 0.28, 14, 0, 0.14, 0, 0xdc2626);
  plungerB.torus(0.25, 0.04, 8, 14, 0, 0.03, 0, 0x991b1b, Math.PI * 0.5, 0, 0);
  const plungerMesh = new THREE.Mesh(
    plungerB.build(),
    safeStdMat({ vertexColors: true, roughness: 0.46, metalness: 0.06 })
  );
  plungerMesh.position.set(-7.9, 0.02, -4.8);
  plungerMesh.rotation.z = 0.22;
  plungerMesh.castShadow = true;
  group.add(plungerMesh);
  clueProps.set('plunger', plungerMesh);

  // Dropped Golden Room Key
  const keyB = new GeomBatcher();
  keyB.torus(0.18, 0.045, 8, 14, -0.22, 0.08, 0, 0xfacc15, Math.PI * 0.5, 0, 0);
  keyB.box(0.54, 0.07, 0.09, 0.18, 0.08, 0, 0xfacc15);
  keyB.box(0.08, 0.07, 0.16, 0.30, 0.08, 0.09, 0xeab308);
  keyB.box(0.08, 0.07, 0.14, 0.42, 0.08, 0.08, 0xeab308);
  // Bright blue hotel key tag
  keyB.box(0.28, 0.05, 0.18, -0.46, 0.08, 0.08, 0x3b82f6, 0, 0.35, 0);
  const keyMesh = new THREE.Mesh(
    keyB.build(),
    safeStdMat({ vertexColors: true, roughness: 0.34, metalness: 0.22 })
  );
  keyMesh.position.set(4.1, 0.06, 3.1);
  keyMesh.scale.set(1.25, 1.25, 1.25);
  keyMesh.castShadow = true;
  group.add(keyMesh);
  clueProps.set('room_key', keyMesh);

  // Brass Padlock on Study Cabinet
  const padlockMesh = buildBrassPadlockMesh();
  padlockMesh.position.set(7.4, 1.38, -7.32);
  group.add(padlockMesh);

  // Glowing clue beacon rings
  for (const clue of CASES[0].clues) {
    const r = makeClueRing(clue.x, clue.z, 0xfacc15);
    group.add(r);
    clueRings.set(clue.id, r);
  }
  const lockRing = makeClueRing(CASES[0].padlock.x, CASES[0].padlock.z, 0xf97316);
  group.add(lockRing);

  return {
    group,
    colliders,
    clueRings,
    clueProps,
    lockRing,
    padlockMesh,
    paintingMesh,
    updateAnim(t, state) {
      // Slide floral painting smoothly to the right & swing cracked safe door open once wall_safe is inspected!
      const revealed = state.foundClues.has('wall_safe');
      const targetX = revealed ? 2.18 : 0.0;
      const targetRotZ = revealed ? -0.14 : 0.04; // Slight crooked mystery tilt before opening!
      const targetDoorY = revealed ? -2.05 : 0.0;
      paintingMesh.position.x += (targetX - paintingMesh.position.x) * 0.14;
      paintingMesh.rotation.z += (targetRotZ - paintingMesh.rotation.z) * 0.14;
      safeDoorPivot.rotation.y += (targetDoorY - safeDoorPivot.rotation.y) * 0.14;
      // Gentle hover on room key if unfound
      if (!state.foundClues.has('room_key')) {
        keyMesh.rotation.y = t * 1.4;
        keyMesh.position.y = 0.12 + Math.sin(t * 3.0) * 0.05;
      }
      padlockMesh.visible = !state.padlockUnlocked;
    },
  };
}

// =========================================================================
// CASE 2: PRECINCT INTERROGATION ROOM
// =========================================================================
function buildInterrogationRoom(tex) {
  const group = new THREE.Group();
  group.name = 'Room_Interrogation';
  const colliders = [];
  const clueRings = new Map();
  const clueProps = new Map();

  // 1. Slate Concrete Tile Floor
  const floorTex = tex.precinctFloor.clone();
  floorTex.needsUpdate = true;
  floorTex.repeat.set(8, 7);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(21.2, 18.0),
    safeStdMat({ map: floorTex, roughness: 0.72, metalness: 0.06 })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  group.add(floor);

  // 2. Precinct Cinderblock Walls
  const wallTex = tex.precinctWall.clone();
  wallTex.needsUpdate = true;
  wallTex.repeat.set(6, 1.6);
  const walls = new GeomBatcher();
  walls.box(21.6, 5.2, 0.5, 0, 2.6, -8.75, 0xffffff, 0, 0, 0, 0.28);
  walls.box(0.5, 5.2, 18.0, -10.55, 2.6, 0, 0xffffff, 0, 0, 0, 0.28);
  walls.box(0.5, 5.2, 18.0, 10.55, 2.6, 0, 0xffffff, 0, 0, 0, 0.28);
  walls.box(21.6, 0.9, 0.4, 0, 0.45, 8.75, 0xffffff, 0, 0, 0, 0.28);
  const wallMesh = new THREE.Mesh(
    walls.build(),
    safeStdMat({ map: wallTex, roughness: 0.78, metalness: 0.05 })
  );
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 3. Interrogation Table, Chairs, Potted Fern, Evidence Locker, Hanging Lamp (1 merged mesh!)
  const props = new GeomBatcher();
  // Central Round Wooden Interrogation Table (0, 0, 0)
  props.cyl(1.75, 1.75, 0.14, 22, 0, 0.94, 0, 0x8b5a2b);
  props.cyl(0.24, 0.34, 0.92, 14, 0, 0.46, 0, 0x5c3a1e);
  props.cyl(0.85, 0.92, 0.08, 16, 0, 0.04, 0, 0x4b2e16);
  colliders.push({ minX: -1.75, maxX: 1.75, minZ: -1.75, maxZ: 1.75 });

  // Interrogation Chair (where Tyler sits at (0, -1.75)) + Detective chair across
  props.box(0.85, 0.10, 0.82, 0, 0.54, -1.75, 0x6b4423);
  props.box(0.85, 0.85, 0.10, 0, 0.98, -2.12, 0x5c3a1e);
  for (const [cx, cz] of [[-0.36, -1.4], [0.36, -1.4], [-0.36, -2.1], [0.36, -2.1]]) {
    props.box(0.09, 0.54, 0.09, cx, 0.27, cz, 0x3b2616);
  }
  colliders.push({ minX: -0.65, maxX: 0.65, minZ: -2.4, maxZ: -1.2 });

  // Scattered Case Files on Round Wooden Table
  props.box(0.68, 0.05, 0.52, 0.42, 1.03, 0.68, 0xfde68a, 0, 0.28, 0);
  props.box(0.58, 0.04, 0.44, 0.44, 1.07, 0.66, 0xf8fafc, 0, 0.15, 0);
  props.box(0.45, 0.04, 0.36, -0.52, 1.03, 0.44, 0xfcd34d, 0, -0.35, 0);
  // Red "TOP SECRET" folder stamp
  props.box(0.24, 0.02, 0.12, 0.44, 1.10, 0.66, 0xdc2626, 0, 0.15, 0);

  // Hanging Lightbulb fixture above the round table
  props.cyl(0.03, 0.03, 1.8, 8, 0, 5.1, 0, 0x262d3c);
  props.cone(0.58, 0.34, 16, 0, 4.18, 0, 0x334155);
  props.sphere(0.18, 10, 8, 0, 3.96, 0, 0xfef08a);

  // Potted Fern in East-North corner (7.6, -6.4) — exact video prop!
  props.cyl(0.52, 0.38, 0.72, 12, 7.6, 0.36, -6.4, 0xb45309);
  props.cyl(0.48, 0.48, 0.08, 12, 7.6, 0.70, -6.4, 0x451a03);
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2;
    const fx = 7.6 + Math.cos(a) * 0.48;
    const fz = -6.4 + Math.sin(a) * 0.48;
    props.box(0.26, 0.07, 0.92, fx, 1.12 + (f % 2) * 0.18, fz, f % 2 === 0 ? 0x16a34a : 0x22c55e, 0.45, a, 0);
  }
  colliders.push({ minX: 6.9, maxX: 8.3, minZ: -7.1, maxZ: -5.7 });

  // Steel Evidence Locker against West wall (-9.2, 1.8)
  props.box(1.5, 3.0, 2.4, -9.45, 1.5, 1.8, 0x475569);
  props.box(1.56, 0.12, 2.5, -9.45, 3.04, 1.8, 0x334155);
  props.box(0.08, 2.6, 1.04, -8.68, 1.5, 1.22, 0x64748b);
  props.box(0.08, 2.6, 1.04, -8.68, 1.5, 2.38, 0x64748b);
  // Locker vent slats
  for (let s = 0; s < 3; s++) {
    props.box(0.10, 0.07, 0.72, -8.65, 2.45 - s * 0.16, 1.22, 0x1e293b);
    props.box(0.10, 0.07, 0.72, -8.65, 2.45 - s * 0.16, 2.38, 0x1e293b);
  }
  colliders.push({ minX: -10.3, maxX: -8.5, minZ: 0.5, maxZ: 3.1 });

  // One-way Observation Mirror on East wall
  props.box(0.14, 2.0, 4.8, 10.22, 2.4, 0.6, 0x334155);
  props.box(0.18, 1.75, 4.5, 10.16, 2.4, 0.6, 0x64748b);

  // Chalkboard wooden frame on North wall
  props.box(4.95, 2.55, 0.16, 0, 2.45, -8.44, 0x78350f);
  props.box(4.85, 0.14, 0.30, 0, 1.20, -8.32, 0x92400e); // Chalk ledge

  const propMesh = new THREE.Mesh(
    props.build(),
    safeStdMat({ vertexColors: true, roughness: 0.60, metalness: 0.12 })
  );
  propMesh.castShadow = true;
  propMesh.receiveShadow = true;
  group.add(propMesh);

  // 4. Detective Evidence Chalkboard Face
  const chalkMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.65, 2.25),
    safeStdMat({ map: tex.chalkboard, roughness: 0.76, metalness: 0.04 })
  );
  chalkMesh.position.set(0, 2.45, -8.34);
  group.add(chalkMesh);

  // 5. Warm Hanging Spotlight Cone over the Interrogation Table!
  const coneMesh = new THREE.Mesh(
    new THREE.ConeGeometry(2.8, 3.9, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  coneMesh.position.set(0, 2.05, 0);
  group.add(coneMesh);

  // 6. Janitor's Mop Bucket Clue Prop (-6.8, -4.4)
  const mopB = new GeomBatcher();
  mopB.box(0.92, 0.72, 0.78, 0, 0.42, 0, 0xfacc15); // Yellow janitor bucket!
  mopB.box(0.80, 0.08, 0.66, 0, 0.72, 0, 0x38bdf8); // Soapy water
  mopB.cyl(0.09, 0.09, 0.12, 10, -0.34, 0.07, -0.28, 0x262d3c, Math.PI * 0.5, 0, 0);
  mopB.cyl(0.09, 0.09, 0.12, 10, 0.34, 0.07, 0.28, 0x262d3c, Math.PI * 0.5, 0, 0);
  // Wooden mop handle + string mop head
  mopB.cyl(0.045, 0.045, 1.9, 8, 0.14, 1.15, 0.05, 0xc28a53, 0.15, 0, -0.20);
  mopB.box(0.42, 0.22, 0.36, 0.02, 0.78, 0.0, 0xe2e8f0);
  // Green paint-smudged clue note floating on top
  mopB.box(0.32, 0.04, 0.24, -0.18, 0.78, 0.12, 0x4ade80, 0, 0.3, 0);
  const mopMesh = new THREE.Mesh(
    mopB.build(),
    safeStdMat({ vertexColors: true, roughness: 0.5, metalness: 0.08 })
  );
  mopMesh.position.set(-6.8, 0, -4.4);
  mopMesh.castShadow = true;
  group.add(mopMesh);
  clueProps.set('mop_bucket', mopMesh);

  // Brass Padlock on Evidence Locker
  const padlockMesh = buildBrassPadlockMesh();
  padlockMesh.position.set(-8.55, 1.55, 1.8);
  padlockMesh.rotation.y = Math.PI * 0.5;
  group.add(padlockMesh);

  for (const clue of CASES[1].clues) {
    const r = makeClueRing(clue.x, clue.z, 0xfacc15);
    group.add(r);
    clueRings.set(clue.id, r);
  }
  const lockRing = makeClueRing(CASES[1].padlock.x, CASES[1].padlock.z, 0xf97316);
  group.add(lockRing);

  return {
    group,
    colliders,
    clueRings,
    clueProps,
    lockRing,
    padlockMesh,
    updateAnim(t, state) {
      coneMesh.material.opacity = 0.08 + Math.sin(t * 2.4) * 0.015;
      padlockMesh.visible = !state.padlockUnlocked;
    },
  };
}

// =========================================================================
// CASE 3: JEWELRY STORE SMASH-AND-GRAB (WITH CRASHED WHITE GETAWAY VAN!)
// =========================================================================
function buildJewelryRoom(tex) {
  const group = new THREE.Group();
  group.name = 'Room_Jewelry';
  const colliders = [];
  const clueRings = new Map();
  const clueProps = new Map();

  // 1. Store Marble Base Floor
  const marbleTex = tex.storeMarble.clone();
  marbleTex.needsUpdate = true;
  marbleTex.repeat.set(9, 7.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24.0, 19.6),
    safeStdMat({ map: marbleTex, roughness: 0.42, metalness: 0.08 })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  group.add(floor);

  // 2. Plush Red Velvet Carpets (grand center + side runners!)
  const velvetTex = tex.redVelvet.clone();
  velvetTex.needsUpdate = true;
  velvetTex.repeat.set(4, 6);
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(14.5, 14.2),
    safeStdMat({ map: velvetTex, roughness: 0.85, metalness: 0.04 })
  );
  carpet.rotation.x = -Math.PI * 0.5;
  carpet.position.set(0, 0.015, 0.6);
  carpet.receiveShadow = true;
  group.add(carpet);

  // 3. Weathered Red Brick Rear Wall with HUGE JAGGED SMASH HOLE for the Getaway Van!
  const brickTex = tex.brickWall.clone();
  brickTex.needsUpdate = true;
  brickTex.repeat.set(5, 1.8);
  const walls = new GeomBatcher();
  // Left & right segments of rear North wall leaving jagged hole around x in [-3.4, +1.6]!
  walls.box(8.8, 5.2, 0.6, -7.8, 2.6, -9.4, 0xffffff, 0, 0, 0, 0.30);
  walls.box(10.6, 5.2, 0.6, 6.9, 2.6, -9.4, 0xffffff, 0, 0, 0, 0.30);
  walls.box(5.4, 1.3, 0.6, -0.9, 4.55, -9.4, 0xffffff, 0, 0, 0, 0.30); // Jagged lintel above van roof
  // Jagged broken brick teeth around crash hole
  walls.box(0.85, 0.7, 0.64, -3.2, 3.65, -9.4, 0xffffff, 0, 0, -0.25, 0.3);
  walls.box(0.90, 0.8, 0.64, 1.5, 3.55, -9.4, 0xffffff, 0, 0, 0.28, 0.3);
  // West, East, and low South cutaway walls
  walls.box(0.55, 5.2, 19.4, -11.85, 2.6, 0, 0xffffff, 0, 0, 0, 0.30);
  walls.box(0.55, 5.2, 19.4, 11.85, 2.6, 0, 0xffffff, 0, 0, 0, 0.30);
  walls.box(24.0, 0.9, 0.4, 0, 0.45, 9.5, 0xffffff, 0, 0, 0, 0.30);
  const wallMesh = new THREE.Mesh(
    walls.build(),
    safeStdMat({ map: brickTex, roughness: 0.74, metalness: 0.05 })
  );
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 4. Merged Jewelry Store Cases, Gold Trim, Shattered Glass, Rubble, Blue Paint, Security Door, AND WHITE GETAWAY VAN!
  const props = new GeomBatcher();

  // Gold carpet border strips
  props.box(14.7, 0.025, 0.24, 0, 0.02, -6.5, 0xd4a146);
  props.box(14.7, 0.025, 0.24, 0, 0.02, 7.7, 0xd4a146);
  props.box(0.24, 0.025, 14.4, -7.25, 0.02, 0.6, 0xd4a146);
  props.box(0.24, 0.025, 14.4, 7.25, 0.02, 0.6, 0xd4a146);

  // 4 Upscale Jewelry Display Cases (2 intact on sides, 2 SMASHED in center-left & center-right!)
  const addCase = (cx, cz, ry, smashed) => {
    // Rich dark wood base + brass edge molding
    props.box(3.2, 0.96, 1.35, cx, 0.48, cz, 0x4a2518, 0, ry, 0);
    props.box(3.3, 0.08, 1.44, cx, 0.98, cz, 0xeab308, 0, ry, 0);
    // Velvet jewelry display pillow inside
    props.box(2.8, 0.08, 1.05, cx, 1.04, cz, 0x991b1b, 0, ry, 0);
    if (!smashed) {
      // Sparkling diamond & emerald rings still on display
      props.sphere(0.14, 8, 6, cx - 0.7, 1.22, cz, 0x38bdf8);
      props.sphere(0.14, 8, 6, cx, 1.24, cz, 0xfacc15);
      props.sphere(0.14, 8, 6, cx + 0.7, 1.22, cz, 0xec4899);
      // Brass glass frame pillars
      for (const dx of [-1.45, 1.45]) {
        for (const dz of [-0.58, 0.58]) {
          props.box(0.06, 0.68, 0.06, cx + dx, 1.36, cz + dz, 0xeab308);
        }
      }
    } else {
      // Knocked-over empty velvet ring cushion & tilted broken frame!
      props.box(0.45, 0.14, 0.36, cx + 0.55, 1.12, cz + 0.18, 0x7f1d1d, 0.25, 0.6, 0.2);
      props.box(0.08, 0.62, 0.08, cx - 1.38, 1.28, cz + 0.52, 0xeab308, 0.4, 0, 0.35);
      props.box(0.08, 0.55, 0.08, cx + 1.35, 1.22, cz - 0.50, 0xeab308, -0.35, 0, -0.28);
    }
    colliders.push({ minX: cx - 1.75, maxX: cx + 1.75, minZ: cz - 0.85, maxZ: cz + 0.85 });
  };
  addCase(-6.2, -1.6, 0.08, true);   // Smashed case next to Crowbar!
  addCase(4.6, 1.2, -0.10, true);    // Smashed case next to Blue Paint!
  addCase(-7.8, 3.0, 0, false);
  addCase(6.8, -5.8, 0, false);

  // Scattered Shattered Glass Shards on the carpet (bright icy blue-white crystals!)
  const glassPts = [
    [-4.8, -0.4], [-5.4, -0.1], [-6.1, -0.3], [-4.2, -0.9],
    [3.8, 0.1], [4.5, -0.2], [5.2, 0.3], [2.9, 0.2],
  ];
  for (let i = 0; i < glassPts.length; i++) {
    const [gx, gz] = glassPts[i];
    props.box(0.32, 0.03, 0.22, gx, 0.03, gz, 0xbae6fd, 0, i * 0.9, 0);
    props.box(0.18, 0.035, 0.16, gx + 0.22, 0.035, gz - 0.15, 0xe0f2fe, 0, i * 1.3, 0);
  }

  // Vivid Blue Paint Splatter & Footprints Trail!
  props.cyl(0.88, 0.96, 0.03, 14, 3.4, 0.025, -1.7, 0x2563eb);
  props.cyl(0.45, 0.52, 0.03, 12, 2.7, 0.025, -2.3, 0x3b82f6);
  // Tipped paint bucket beside splatter
  props.cyl(0.24, 0.22, 0.38, 12, 3.9, 0.22, -2.0, 0xcbd5e1, 0, 0, 1.35);
  const paintSteps = [[2.1, -2.8], [1.4, -3.5], [0.8, -4.2], [2.8, 0.8], [2.5, 2.4], [2.3, 3.6]];
  for (let i = 0; i < paintSteps.length; i++) {
    props.box(0.26, 0.025, 0.42, paintSteps[i][0], 0.025, paintSteps[i][1], 0x2563eb, 0, -0.3, 0);
  }

  // Employee-Only Steel Security Door on East Wall (11.4, -2.5)
  props.box(0.28, 3.2, 2.1, 11.45, 1.6, -2.5, 0x475569);
  props.box(0.34, 3.35, 0.18, 11.42, 1.67, -3.55, 0x334155);
  props.box(0.34, 3.35, 0.18, 11.42, 1.67, -1.45, 0x334155);
  props.box(0.34, 0.18, 2.3, 11.42, 3.25, -2.5, 0x334155);
  props.box(0.16, 0.12, 0.40, 11.24, 1.48, -1.85, 0xfacc15); // Door handle

  // DRAMATIC WHITE GETAWAY VAN CRASHED THROUGH THE REAR BRICK WALL (-1.0, -7.6, yaw = 0.22)!
  const vx = -1.0;
  const vz = -7.6;
  const vyaw = 0.22;
  const addVanBox = (w, h, d, lx, ly, lz, col) => {
    const cos = Math.cos(vyaw);
    const sin = Math.sin(vyaw);
    const wx = vx + lx * cos + lz * sin;
    const wz = vz - lx * sin + lz * cos;
    props.box(w, h, d, wx, ly, wz, col, 0, vyaw, 0);
  };
  // Main white cargo van hull & hood
  addVanBox(2.55, 2.05, 4.4, 0, 1.45, -0.8, 0xf1f5f9);
  addVanBox(2.48, 1.15, 1.55, 0, 1.0, 1.85, 0xe2e8f0); // Hood jutting right into jewelry store!
  // Tinted windshield
  addVanBox(2.26, 0.78, 0.14, 0, 1.92, 1.38, 0x334155);
  // Chrome front grille & dented bumper
  addVanBox(1.85, 0.42, 0.12, 0, 0.94, 2.66, 0x475569);
  addVanBox(2.62, 0.28, 0.26, 0, 0.56, 2.64, 0x94a3b8);
  // Blue stripe along van side (matching blue paint getaway!)
  addVanBox(2.62, 0.22, 4.1, 0, 1.02, -0.7, 0x2563eb);
  // Chunky wheels
  addVanBox(0.32, 0.78, 0.78, -1.32, 0.42, 1.55, 0x262d3c);
  addVanBox(0.32, 0.78, 0.78, 1.32, 0.42, 1.55, 0x262d3c);
  addVanBox(0.32, 0.78, 0.78, -1.32, 0.42, -1.5, 0x262d3c);
  addVanBox(0.32, 0.78, 0.78, 1.32, 0.42, -1.5, 0x262d3c);
  colliders.push({ minX: -2.9, maxX: 1.4, minZ: -9.5, maxZ: -4.9 });

  // Scattered Brick Rubble Chunks around crashed van!
  const rubblePts = [
    [-3.1, -6.2, 0.5], [-2.5, -5.0, 0.42], [1.4, -5.6, 0.48], [1.9, -6.4, 0.54],
    [-0.1, -4.7, 0.36], [-1.7, -4.6, 0.34], [0.8, -4.8, 0.38],
  ];
  for (let i = 0; i < rubblePts.length; i++) {
    const [rx, rz, sz] = rubblePts[i];
    props.box(sz, sz * 0.65, sz * 0.85, rx, sz * 0.32, rz, i % 2 === 0 ? 0x8c3730 : 0x9b453d, i * 0.3, i * 0.7, 0.15);
  }

  const propMesh = new THREE.Mesh(
    props.build(),
    safeStdMat({ vertexColors: true, roughness: 0.50, metalness: 0.14 })
  );
  propMesh.castShadow = true;
  propMesh.receiveShadow = true;
  group.add(propMesh);

  // 5. Signs: EMPLOYEES ONLY above Security Door, VAN-8641 License Plate on Van, LUXE JEWELS banner
  const empSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.55),
    safeStdMat({ map: tex.signEmployees, roughness: 0.48, metalness: 0.06 })
  );
  empSign.position.set(11.30, 3.65, -2.5);
  empSign.rotation.y = -Math.PI * 0.5;
  group.add(empSign);

  const vanPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.32),
    safeStdMat({ map: tex.signVanPlate, roughness: 0.4, metalness: 0.08 })
  );
  vanPlate.position.set(vx + 2.79 * Math.sin(vyaw), 0.72, vz + 2.79 * Math.cos(vyaw));
  vanPlate.rotation.y = vyaw;
  group.add(vanPlate);

  const luxeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 0.95),
    safeStdMat({ map: tex.signLuxe, roughness: 0.42, metalness: 0.14 })
  );
  luxeSign.position.set(6.8, 3.7, -9.06);
  group.add(luxeSign);

  // 6. Flickering Van Headlights (2 small emissive lenses!)
  const hlMat = safeStdMat({
    color: 0xfef08a,
    emissive: 0xfde047,
    emissiveIntensity: 1.2,
    roughness: 0.3,
    metalness: 0.1,
  });
  const hlGeo = new THREE.BoxGeometry(0.42, 0.24, 0.12);
  const hlL = new THREE.Mesh(hlGeo, hlMat);
  const hlR = new THREE.Mesh(hlGeo, hlMat);
  const cos = Math.cos(vyaw);
  const sin = Math.sin(vyaw);
  hlL.position.set(vx - 0.92 * cos + 2.66 * sin, 1.0, vz + 0.92 * sin + 2.66 * cos);
  hlR.position.set(vx + 0.92 * cos + 2.66 * sin, 1.0, vz - 0.92 * sin + 2.66 * cos);
  hlL.rotation.y = vyaw;
  hlR.rotation.y = vyaw;
  group.add(hlL, hlR);

  // 7. Discarded Red Crowbar Clue Prop (-5.6, 1.4)
  const crowB = new GeomBatcher();
  crowB.box(1.15, 0.08, 0.10, 0, 0.06, 0, 0xdc2626);
  crowB.box(0.28, 0.08, 0.12, 0.62, 0.09, 0.08, 0x94a3b8, 0, 0.55, 0);
  crowB.box(0.24, 0.09, 0.14, -0.58, 0.06, 0, 0x2563eb); // Blue paint smudge on grip!
  const crowMesh = new THREE.Mesh(
    crowB.build(),
    safeStdMat({ vertexColors: true, roughness: 0.42, metalness: 0.22 })
  );
  crowMesh.position.set(-5.6, 0.04, 1.4);
  crowMesh.rotation.y = 0.6;
  crowMesh.castShadow = true;
  group.add(crowMesh);
  clueProps.set('crowbar', crowMesh);

  // Brass Padlock on Employee Security Door
  const padlockMesh = buildBrassPadlockMesh();
  padlockMesh.position.set(11.12, 1.52, -2.5);
  padlockMesh.rotation.y = -Math.PI * 0.5;
  group.add(padlockMesh);

  for (const clue of CASES[2].clues) {
    const r = makeClueRing(clue.x, clue.z, 0xfacc15);
    group.add(r);
    clueRings.set(clue.id, r);
  }
  const lockRing = makeClueRing(CASES[2].padlock.x, CASES[2].padlock.z, 0xf97316);
  group.add(lockRing);

  return {
    group,
    colliders,
    clueRings,
    clueProps,
    lockRing,
    padlockMesh,
    updateAnim(t, state) {
      // Dramatic flickering crashed-van headlights!
      const flick = Math.sin(t * 17.0) * Math.sin(t * 7.3) > -0.35 ? 1.35 : 0.22;
      hlMat.emissiveIntensity = flick;
      padlockMesh.visible = !state.padlockUnlocked;
    },
  };
}

// =========================================================================
// UNIFIED WORLD CONTROLLER (ZERO-LEAK ROOM SWITCHING + INSTANCED FX)
// =========================================================================

export function buildAllCrimeScenes(scene) {
  const tex = getWorldTextures();
  const rooms = [
    buildPenthouseRoom(tex),
    buildInterrogationRoom(tex),
    buildJewelryRoom(tex),
  ];

  for (let i = 0; i < rooms.length; i++) {
    rooms[i].group.visible = i === 0;
    scene.add(rooms[i].group);
  }

  // Single pre-allocated InstancedMesh (56 slots) for Quack Golden Clue Trail + Case Solved Confetti!
  const MAX_FX = 56;
  const fxGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  const fxMat = safeStdMat({
    color: 0xffffff,
    emissive: 0x332b00,
    emissiveIntensity: 0.35,
    roughness: 0.42,
    metalness: 0.12,
  });
  const fxMesh = new THREE.InstancedMesh(fxGeo, fxMat, MAX_FX);
  fxMesh.count = 0;
  fxMesh.visible = false;
  fxMesh.frustumCulled = false;
  scene.add(fxMesh);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();

  return {
    rooms,
    setActiveCase(caseIdx) {
      for (let i = 0; i < rooms.length; i++) {
        rooms[i].group.visible = i === caseIdx;
      }
    },
    resolveWalkCollision(caseIdx, x, z, radius = 0.46) {
      const c = CASES[caseIdx];
      const r = rooms[caseIdx];
      return resolveRoomCollision(x, z, radius, c.bounds, r.colliders);
    },
    updateCaseVisuals(caseIdx, time, caseState) {
      const r = rooms[caseIdx];
      if (!r) return;
      r.updateAnim(time, caseState);

      // Pulse glowing rings cleanly (gold = unfound, bright emerald = found!)
      const pulse = 0.92 + Math.sin(time * 4.2) * 0.12;
      for (const [clueId, ring] of r.clueRings.entries()) {
        const found = caseState.foundClues.has(clueId);
        ring.scale.set(found ? 0.78 : pulse, 1, found ? 0.78 : pulse);
        const col = found ? 0x22c55e : 0xfacc15;
        ring.material.color.setHex(col);
        ring.material.emissive.setHex(col);
        ring.material.opacity = found ? 0.42 : 0.88;
      }
      if (r.lockRing) {
        const unlocked = caseState.padlockUnlocked;
        r.lockRing.scale.set(unlocked ? 0.78 : pulse * 1.05, 1, unlocked ? 0.78 : pulse * 1.05);
        const col = unlocked ? 0x22c55e : 0xf97316;
        r.lockRing.material.color.setHex(col);
        r.lockRing.material.emissive.setHex(col);
        r.lockRing.opacity = unlocked ? 0.4 : 0.9;
      }
    },
    updateFxParticles(particles) {
      const n = Math.min(MAX_FX, particles.length);
      fxMesh.count = n;
      fxMesh.visible = n > 0;
      for (let i = 0; i < n; i++) {
        const pt = particles[i];
        _e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
        _q.setFromEuler(_e);
        _p.set(pt.x, pt.y, pt.z);
        _s.set(pt.sx || pt.scale || 1, pt.sy || pt.scale || 1, pt.sz || pt.scale || 1);
        _m.compose(_p, _q, _s);
        fxMesh.setMatrixAt(i, _m);
        _c.setHex(pt.color || 0xfacc15);
        fxMesh.setColorAt(i, _c);
      }
      if (n > 0) {
        fxMesh.instanceMatrix.needsUpdate = true;
        if (fxMesh.instanceColor) fxMesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
