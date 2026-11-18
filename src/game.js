/**
 * Core Game Simulation & State Controller for [UPDT] Detective Duck.
 * - Camera-relative waddling movement with ZERO automatic camera yaw rotation.
 * - Cancellable Tap-to-Walk & Inspect with strict time & stuck budgets.
 * - Full 3-Case progression, 4-digit brass padlock puzzles, suspect interrogation/accusation,
 *   Detective Stars & 4 unlockable duck skins, QUACK! clue-sparkle beacon, localStorage save.
 */

import * as THREE from '../vendor/three.module.min.js';
import { CASES, DUCK_SKINS, SAVE_KEY, SKIN_BY_ID } from './config.js';
import { createRng } from './rng.js';
import { DetectiveAudioManager } from './audio.js';
import {
  createDetectiveDuckRig,
  applyDuckSkin,
  animateDetectiveDuck,
  createSuspectAvatar,
  animateSuspectAvatar,
} from './avatars.js';
import { buildAllCrimeScenes } from './world.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a) {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * clamp(t, 0, 1);
}

export class DetectiveDuckGame {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;

    // WebGL Renderer (lazy shader compilation on first draw)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CASES[0].bgHex);

    this.camera = new THREE.PerspectiveCamera(
      54,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.2,
      140
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.up.set(0, 1, 0);

    // Atmospheric indoor murder-mystery lighting (clear, moody, zero pitch-black!)
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x4d5972, 1.08);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.25);
    keyLight.position.set(11, 18, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 48;
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    keyLight.shadow.bias = -0.001;
    this.scene.add(keyLight);

    this.roomAccentLight = new THREE.PointLight(0xffe7b3, 1.4, 24, 1.1);
    this.roomAccentLight.position.set(0, 4.4, -1.5);
    this.scene.add(this.roomAccentLight);

    // Audio & deterministic RNG
    this.audio = new DetectiveAudioManager();
    this.seed = 4322;
    this.rng = createRng(this.seed);

    // Build all 3 crime scene rooms once (zero leaks on case switching!)
    this.world = buildAllCrimeScenes(this.scene);

    // Build Star Character: Detective Duck!
    this.duckRig = createDetectiveDuckRig('mallard');
    this.scene.add(this.duckRig.group);

    // Pre-build Blocky Roblox R6 Suspects for all 3 cases (toggled cleanly per case)
    this.suspectGroups = [];
    this.suspectRigsByCase = [];
    for (const c of CASES) {
      const grp = new THREE.Group();
      grp.name = `Suspects_${c.id}`;
      grp.visible = c.index === 0;
      const list = [];
      for (const s of c.suspects) {
        const rig = createSuspectAvatar(s.avatarPreset, s.name, s.seated);
        rig.group.position.set(s.x, 0, s.z);
        rig.group.rotation.y = s.yaw;
        grp.add(rig.group);
        list.push({ def: s, rig });
      }
      this.scene.add(grp);
      this.suspectGroups.push(grp);
      this.suspectRigsByCase.push(list);
    }

    // Input & camera state
    this.keys = new Set();
    this.input = { x: 0, z: 0 };
    this.touchInput = { x: 0, z: 0 };
    this.walkTarget = null;
    this.jumpQueued = false;
    this.manualOrbitDragging = false;
    this.camYaw = CASES[0].defaultCam.yaw;
    this.camPitch = CASES[0].defaultCam.pitch;
    this.camZoomScale = 1.0;
    this.camCurrentPos = new THREE.Vector3(0, 6, 12);
    this.camLookTarget = new THREE.Vector3(0, 1.4, 0);
    this._camCurHoriz = 7.8;
    this._camCurVert = 3.0;
    this._tapProjVec = new THREE.Vector3();

    this.bubbles = [];
    this.fxParticles = [];

    this._initFreshState();
    this._loadSave();
    this._applyCaseScene(this.caseIndex, false);
    applyDuckSkin(this.duckRig, this.equippedSkin);
    this._updateCamera(1.0);
  }

  _makeFreshCaseState(caseDef) {
    return {
      foundClues: new Set(),
      revealedMask: [false, false, false, false],
      padlockDigits: [0, 0, 0, 0],
      padlockUnlocked: false,
      interrogated: new Set(),
    };
  }

  _initFreshState() {
    this.simTime = 0;
    this.caseIndex = 0;
    this.solvedCases = []; // array of solved case IDs
    this.equippedSkin = 'mallard';
    this.caseStates = CASES.map((c) => this._makeFreshCaseState(c));

    this.player = {
      x: CASES[0].spawn.x,
      y: 0,
      z: CASES[0].spawn.z,
      vy: 0,
      yaw: CASES[0].spawn.yaw,
      speed: 0,
      airborne: false,
      quackTimer: 0,
      celebrateTimer: 0,
    };
    this.quackCount = 0;
    this.quackCooldown = 0;
    this.activePrompt = null;
    this.subtitleQueue = [...CASES[0].introLines];
    this.subtitleSpeaker = 'DETECTIVE DUCK';
    this.subtitleText = this.subtitleQueue.shift() || '';
    this.bubbles = [];
    this.fxParticles = [];
    this.world.updateFxParticles(this.fxParticles);
    this.ui.clearClueLogs();
    this.ui.clearFloatPops();
  }

  getActiveCase() {
    return CASES[this.caseIndex] || CASES[0];
  }

  getActiveCaseState() {
    return this.caseStates[this.caseIndex];
  }

  getStars() {
    return this.solvedCases.length;
  }

  // ---------------- SAVE & LOAD ----------------
  _save() {
    try {
      const payload = {
        version: 1,
        caseIndex: this.caseIndex,
        solvedCases: this.solvedCases,
        equippedSkin: this.equippedSkin,
        caseStates: this.caseStates.map((st) => ({
          foundClues: Array.from(st.foundClues),
          revealedMask: st.revealedMask,
          padlockDigits: st.padlockDigits,
          padlockUnlocked: st.padlockUnlocked,
          interrogated: Array.from(st.interrogated),
        })),
        audio: {
          musicOn: this.audio.musicOn,
          sfxOn: this.audio.sfxOn,
        },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore private-mode quota issues
    }
  }

  _loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.version !== 1) return false;

      if (typeof d.caseIndex === 'number') {
        this.caseIndex = clamp(Math.floor(d.caseIndex), 0, CASES.length - 1);
      }
      if (Array.isArray(d.solvedCases)) {
        this.solvedCases = d.solvedCases.filter((id) => CASES.some((c) => c.id === id));
      }
      if (typeof d.equippedSkin === 'string' && SKIN_BY_ID[d.equippedSkin]) {
        const skin = SKIN_BY_ID[d.equippedSkin];
        this.equippedSkin = this.getStars() >= skin.starsRequired ? skin.id : 'mallard';
      }
      if (Array.isArray(d.caseStates) && d.caseStates.length === CASES.length) {
        for (let i = 0; i < CASES.length; i++) {
          const s = d.caseStates[i];
          if (!s) continue;
          this.caseStates[i] = {
            foundClues: new Set(Array.isArray(s.foundClues) ? s.foundClues : []),
            revealedMask:
              Array.isArray(s.revealedMask) && s.revealedMask.length === 4
                ? s.revealedMask.map(Boolean)
                : [false, false, false, false],
            padlockDigits:
              Array.isArray(s.padlockDigits) && s.padlockDigits.length === 4
                ? s.padlockDigits.map((n) => ((Number(n) || 0) % 10 + 10) % 10)
                : [0, 0, 0, 0],
            padlockUnlocked: Boolean(s.padlockUnlocked),
            interrogated: new Set(Array.isArray(s.interrogated) ? s.interrogated : []),
          };
        }
      }
      if (d.audio) {
        this.audio.setMusicOn(d.audio.musicOn !== false);
        this.audio.setSfxOn(d.audio.sfxOn !== false);
      }
      return true;
    } catch {
      return false;
    }
  }

  resetSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    this.rng = createRng(this.seed);
    this.ui.closeModals();
    this._initFreshState();
    applyDuckSkin(this.duckRig, this.equippedSkin);
    this._applyCaseScene(0, true);
    this._save();
  }

  // ---------------- CASE SWITCHING & WARDROBE ----------------
  selectCase(idx) {
    const targetIdx = clamp(Math.floor(idx), 0, CASES.length - 1);
    this.ui.closeModals();
    this.resetMovementInputs();
    this.caseIndex = targetIdx;
    this._applyCaseScene(targetIdx, true);
    this._save();
    return true;
  }

  _applyCaseScene(idx, showIntro = true) {
    const c = CASES[idx];
    this.scene.background.setHex(c.bgHex);
    this.world.setActiveCase(idx);
    for (let i = 0; i < this.suspectGroups.length; i++) {
      this.suspectGroups[i].visible = i === idx;
    }
    this.player.x = c.spawn.x;
    this.player.y = 0;
    this.player.z = c.spawn.z;
    this.player.vy = 0;
    this.player.yaw = c.spawn.yaw;
    this.player.speed = 0;
    this.player.airborne = false;
    this.walkTarget = null;
    this.camYaw = c.defaultCam.yaw;
    this.camPitch = c.defaultCam.pitch;
    this.camZoomScale = 1.0;

    // Tune accent light per case mood
    if (idx === 0) {
      this.roomAccentLight.color.setHex(0xffe8bd);
      this.roomAccentLight.position.set(0, 4.5, -2.0);
    } else if (idx === 1) {
      this.roomAccentLight.color.setHex(0xfef08a);
      this.roomAccentLight.position.set(0, 3.8, 0.0);
    } else {
      this.roomAccentLight.color.setHex(0xffe4e6);
      this.roomAccentLight.position.set(-0.5, 4.2, -3.5);
    }

    this.duckRig.group.position.set(this.player.x, 0, this.player.z);
    this.duckRig.group.rotation.y = this.player.yaw;
    this.bubbles = [];
    this.fxParticles = [];
    this.world.updateFxParticles(this.fxParticles);
    this.ui.clearClueLogs();
    this.ui.clearFloatPops();

    if (showIntro) {
      this.subtitleQueue = [...c.introLines];
      this.subtitleSpeaker = 'DETECTIVE DUCK';
      this.subtitleText = this.subtitleQueue.shift() || '';
    }
    this._updateCamera(1.0);
  }

  equipSkin(skinId) {
    const skin = SKIN_BY_ID[skinId];
    if (!skin || this.getStars() < skin.starsRequired) return false;
    this.equippedSkin = skin.id;
    applyDuckSkin(this.duckRig, skin.id);
    this.audio.playClick();
    if (this.ui.activeModal === 'wardrobe') {
      this.ui.syncWardrobeModal(this.getStars(), this.equippedSkin);
    }
    this._save();
    return true;
  }

  // ---------------- SUBTITLES & BUBBLES ----------------
  setSubtitle(text, speaker = 'DETECTIVE DUCK') {
    this.subtitleSpeaker = speaker;
    this.subtitleText = text;
    this.subtitleQueue = [];
  }

  skipSubtitle() {
    this.audio.playClick();
    if (this.subtitleQueue.length > 0) {
      this.subtitleText = this.subtitleQueue.shift();
    } else {
      this.subtitleText = '';
    }
  }

  _addBubble(x, y, z, text, dur = 2.0, quack = false) {
    this.bubbles.push({ x, y, z, text, timer: dur, quack });
    if (this.bubbles.length > 6) this.bubbles.shift();
  }

  // ---------------- MOVEMENT, JUMP & QUACK CLUE PULSE ----------------
  setInput(x, z) {
    this.input.x = clamp(Number(x) || 0, -1, 1);
    this.input.z = clamp(Number(z) || 0, -1, 1);
    if (Math.hypot(this.input.x, this.input.z) > 0.05) {
      this.walkTarget = null;
    }
  }

  resetMovementInputs() {
    this.keys.clear();
    this.input.x = 0;
    this.input.z = 0;
    this.touchInput.x = 0;
    this.touchInput.z = 0;
    this.walkTarget = null;
    this.player.speed = 0;
    this.ui.resetTouchStick();
  }

  cancelAutoWalk() {
    if (!this.walkTarget) return false;
    this.walkTarget = null;
    this.player.speed = 0;
    return true;
  }

  queueJump() {
    this.cancelAutoWalk();
    if (this.ui.activeModal) return;
    this.jumpQueued = true;
  }

  setCameraOrbit(yaw, pitch) {
    if (typeof yaw === 'number' && Number.isFinite(yaw)) this.camYaw = wrapAngle(yaw);
    if (typeof pitch === 'number' && Number.isFinite(pitch)) this.camPitch = clamp(pitch, 0.20, 0.84);
  }

  setCameraZoom(scale) {
    if (typeof scale === 'number' && Number.isFinite(scale)) {
      this.camZoomScale = clamp(scale, 0.72, 1.45);
    }
  }

  /** Find closest unfound clue or locked padlock so QUACK! guides kids cleanly! */
  _getClosestObjective() {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    let best = null;
    let bestD = Infinity;
    for (const cl of c.clues) {
      if (st.foundClues.has(cl.id)) continue;
      const d = Math.hypot(cl.x - this.player.x, cl.z - this.player.z);
      if (d < bestD) {
        bestD = d;
        best = { x: cl.x, y: cl.y + 0.4, z: cl.z, label: cl.name };
      }
    }
    if (!best && !st.padlockUnlocked) {
      best = { x: c.padlock.x, y: c.padlock.y, z: c.padlock.z, label: c.padlock.name };
    }
    if (!best) {
      const culp = c.suspects.find((s) => s.id === c.culpritId) || c.suspects[0];
      best = { x: culp.x, y: 1.4, z: culp.z, label: 'Accuse Suspect!' };
    }
    return best;
  }

  triggerQuack() {
    this.audio.unlock();
    if (this.ui.activeModal || this.quackCooldown > 0) return false;
    this.quackCount += 1;
    this.quackCooldown = 0.45;
    this.player.quackTimer = 0.36;
    if (!this.player.airborne) {
      this.player.vy = 4.6;
      this.player.airborne = true;
    }

    const isDouble = this.quackCount % 3 === 0;
    this.audio.playQuack(isDouble);
    this._addBubble(this.player.x, this.player.y + 2.25, this.player.z, isDouble ? 'QUACK QUACK! 🦆' : 'QUACK! 🦆', 1.6, true);

    // Make nearby suspects jump & react comically!
    const susList = this.suspectRigsByCase[this.caseIndex];
    let reacted = false;
    for (const s of susList) {
      const d = Math.hypot(s.def.x - this.player.x, s.def.z - this.player.z);
      if (d <= 9.5) {
        s.rig.reactTimer = 0.75;
        if (!reacted) {
          this._addBubble(s.def.x, s.def.seated ? 2.6 : 2.8, s.def.z, s.def.quackReact, 2.2, false);
          reacted = true;
        }
      }
    }

    // Launch a gleaming golden sparkle trail straight toward the closest unfound clue/objective!
    const obj = this._getClosestObjective();
    if (obj) {
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        if (this.fxParticles.length >= 52) this.fxParticles.shift();
        this.fxParticles.push({
          x: this.player.x + (obj.x - this.player.x) * f,
          y: 0.75 + Math.sin(f * Math.PI) * 1.15,
          z: this.player.z + (obj.z - this.player.z) * f,
          vx: (this.rng() - 0.5) * 0.35,
          vy: 0.65 + this.rng() * 0.4,
          vz: (this.rng() - 0.5) * 0.35,
          rx: i * 0.4,
          ry: i * 0.5,
          rz: 0,
          scale: 0.95 + (1 - Math.abs(f - 0.5)) * 0.45,
          age: 0,
          maxLife: 1.55 + f * 0.45,
          color: i % 2 === 0 ? 0xfacc15 : 0x38bdf8,
        });
      }
      this.world.updateFxParticles(this.fxParticles);
      this.setSubtitle(`Quack! Follow the golden sparkles toward: ${obj.label}!`);
    }
    return true;
  }

  _spawnCelebrationConfetti() {
    const colors = [0xfacc15, 0x22c55e, 0x38bdf8, 0xf43f5e, 0xa855f7, 0xf97316];
    for (let i = 0; i < 36; i++) {
      if (this.fxParticles.length >= 56) this.fxParticles.shift();
      const ang = this.rng() * Math.PI * 2;
      const spd = 1.6 + this.rng() * 3.4;
      this.fxParticles.push({
        x: this.player.x,
        y: this.player.y + 1.8,
        z: this.player.z,
        vx: Math.cos(ang) * spd,
        vy: 3.4 + this.rng() * 3.2,
        vz: Math.sin(ang) * spd,
        rx: this.rng() * Math.PI,
        ry: this.rng() * Math.PI,
        rz: this.rng() * Math.PI,
        scale: 0.85 + this.rng() * 0.55,
        age: 0,
        maxLife: 2.4 + this.rng() * 0.8,
        gravity: 4.5,
        color: colors[i % colors.length],
      });
    }
    this.world.updateFxParticles(this.fxParticles);
  }

  // ---------------- INTERACTIONS: CLUES, PADLOCK, SUSPECTS, ACCUSE ----------------
  inspectClue(clueId) {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    const cl = c.clues.find((x) => x.id === clueId);
    if (!cl) return false;

    const newlyFound = !st.foundClues.has(cl.id);
    st.foundClues.add(cl.id);
    for (const idx of cl.codeIndices) {
      st.revealedMask[idx] = true;
    }

    this.audio.playClueFound();
    this.ui.pushClueLog(cl.icon, cl.logText);
    this.setSubtitle(cl.subtitle);
    this.ui.spawnFloatPop(
      newlyFound ? `${cl.icon} CLUE FOUND!` : `${cl.icon} ${cl.name}`,
      { x: cl.x, y: cl.y + 1.2, z: cl.z },
      this.camera,
      window.innerWidth,
      window.innerHeight,
      '#4ade80'
    );
    this._save();
    return true;
  }

  openPadlock() {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    this.audio.playClick();
    this.ui.openPadlockModal(c, st.padlockDigits, st.revealedMask, st.padlockUnlocked);
    return true;
  }

  spinTumbler(idx, delta) {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    if (idx < 0 || idx > 3) return false;
    if (st.padlockUnlocked) return true;

    st.padlockDigits[idx] = (st.padlockDigits[idx] + delta + 10) % 10;
    const isMatched = st.padlockDigits[idx] === c.code[idx];
    this.audio.playTumblerClick(isMatched);

    const allMatch = c.code.every((digit, i) => st.padlockDigits[i] === digit);
    if (allMatch) {
      st.padlockUnlocked = true;
      st.revealedMask = [true, true, true, true];
      this.audio.playPadlockUnlock();
      this.ui.pushClueLog('🔓', c.padlock.toast);
      this.setSubtitle(c.padlock.rewardNote);
      this._spawnCelebrationConfetti();
      this._save();
    }
    this.ui.syncPadlockModal(c, st.padlockDigits, st.revealedMask, st.padlockUnlocked);
    return st.padlockUnlocked;
  }

  revealPadlockHint() {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    for (let i = 0; i < 4; i++) {
      if (!st.revealedMask[i]) {
        st.revealedMask[i] = true;
        this.audio.playClueFound();
        this.ui.syncPadlockModal(c, st.padlockDigits, st.revealedMask, st.padlockUnlocked);
        this._save();
        return true;
      }
    }
    // If all already revealed, gently snap first unmatching dial into place!
    for (let i = 0; i < 4; i++) {
      if (st.padlockDigits[i] !== c.code[i]) {
        const diff = (c.code[i] - st.padlockDigits[i] + 10) % 10;
        this.spinTumbler(i, diff);
        return true;
      }
    }
    return false;
  }

  talkSuspect(suspectId) {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    const s = c.suspects.find((x) => x.id === suspectId);
    if (!s) return false;
    st.interrogated.add(s.id);
    this.audio.playClick();
    this.ui.openSuspectModal(s);
    this._save();
    return true;
  }

  openAccuseModal() {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    this.audio.playClick();
    this.ui.openAccuseModal(c, st.foundClues, st.padlockUnlocked);
    return true;
  }

  accuseSuspect(suspectId) {
    const c = this.getActiveCase();
    const s = c.suspects.find((x) => x.id === suspectId);
    if (!s) return false;

    if (suspectId === c.culpritId) {
      const prevStars = this.getStars();
      if (!this.solvedCases.includes(c.id)) {
        this.solvedCases.push(c.id);
      }
      const newStars = this.getStars();
      const newlyUnlocked =
        DUCK_SKINS.find((sk) => sk.starsRequired > prevStars && sk.starsRequired <= newStars) || null;

      this.player.celebrateTimer = 3.0;
      this.audio.playCaseSolved();
      this._spawnCelebrationConfetti();
      this.ui.pushClueLog('⭐', `Case Solved! Caught ${s.name}!`);
      this.setSubtitle(`Quack-tastic! You caught ${s.name}!`);
      this._save();
      this.ui.openSolvedModal(s, newlyUnlocked, this.caseIndex < CASES.length - 1);
      return true;
    }

    // Wrong guess: gentle comedic feedback, zero punishment!
    this.audio.playGentleWrong();
    const msg = `Quack! ${s.name} looks innocent — check their badges and try another clue!`;
    if (this.ui.activeModal !== 'accuse') {
      this.openAccuseModal();
    }
    this.ui.showAccuseGentleHint(msg);
    this.setSubtitle(msg);
    return false;
  }

  advanceToNextCase() {
    const nextIdx = (this.caseIndex + 1) % CASES.length;
    return this.selectCase(nextIdx);
  }

  // ---------------- PROXIMITY PROMPT & TAP-TO-WALK ----------------
  _computeActivePrompt() {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    const px = this.player.x;
    const pz = this.player.z;

    let best = null;
    let bestD = 3.2;

    // Clues
    for (const cl of c.clues) {
      const d = Math.hypot(px - cl.x, pz - cl.z);
      if (d <= bestD) {
        bestD = d;
        best = {
          type: 'clue',
          clueId: cl.id,
          x: cl.x,
          y: cl.y + 1.15,
          z: cl.z,
          action: st.foundClues.has(cl.id) ? 'Re-Inspect' : 'Inspect',
          sub: cl.name,
          touchIcon: cl.icon,
          touchLabel: 'INSPECT',
          gold: !st.foundClues.has(cl.id),
        };
      }
    }

    // Padlock
    const dp = Math.hypot(px - c.padlock.x, pz - c.padlock.z);
    if (dp <= Math.max(bestD, 3.3)) {
      if (dp <= bestD || !best) {
        bestD = dp;
        best = {
          type: 'padlock',
          x: c.padlock.x,
          y: c.padlock.y + 0.9,
          z: c.padlock.z,
          action: st.padlockUnlocked ? 'Check Lock' : 'Unlock Padlock',
          sub: c.padlock.name,
          touchIcon: st.padlockUnlocked ? '🔓' : '🔒',
          touchLabel: 'UNLOCK',
          gold: !st.padlockUnlocked,
        };
      }
    }

    // Suspects
    for (const s of c.suspects) {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d <= 3.2 && d < bestD) {
        bestD = d;
        best = {
          type: 'suspect',
          suspectId: s.id,
          x: s.x,
          y: s.seated ? 2.3 : 2.5,
          z: s.z,
          action: 'Talk',
          sub: s.name,
          touchIcon: '🗣️',
          touchLabel: 'TALK',
          gold: false,
        };
      }
    }

    this.activePrompt = best;
  }

  triggerInteract() {
    this.audio.unlock();
    if (this.ui.activeModal) return false;
    const p = this.activePrompt;
    if (p) {
      if (p.type === 'clue') return this.inspectClue(p.clueId);
      if (p.type === 'padlock') return this.openPadlock();
      if (p.type === 'suspect') return this.talkSuspect(p.suspectId);
    }
    // If padlock is unlocked and no nearer target, right touch ACCUSE opens Accuse modal!
    const st = this.getActiveCaseState();
    if (st.padlockUnlocked || st.foundClues.size >= 2) {
      return this.openAccuseModal();
    }
    return false;
  }

  _executeTappedAction(t) {
    if (!t) return false;
    if (t.type === 'clue') return this.inspectClue(t.clueId);
    if (t.type === 'padlock') return this.openPadlock();
    if (t.type === 'suspect') return this.talkSuspect(t.suspectId);
    return false;
  }

  /** Cancellable deliberate Tap-to-Walk & Inspect on 3D clues, padlocks, suspects (within 46px & 16u!) */
  handleCanvasClick(clientX, clientY) {
    this.audio.unlock();
    if (this.ui.activeModal) return;

    const c = this.getActiveCase();
    const rect = this.canvas.getBoundingClientRect();
    const candidates = [];

    for (const cl of c.clues) {
      candidates.push({
        type: 'clue',
        clueId: cl.id,
        ax: cl.x,
        ay: cl.y + 0.55,
        az: cl.z,
        tx: cl.x,
        tz: cl.z,
        interactDist: 3.1,
        stopDist: 2.1,
      });
    }
    candidates.push({
      type: 'padlock',
      ax: c.padlock.x,
      ay: c.padlock.y,
      az: c.padlock.z,
      tx: c.padlock.x,
      tz: c.padlock.z,
      interactDist: 3.2,
      stopDist: 2.2,
    });
    for (const s of c.suspects) {
      // For seated suspects behind a table (Case 2 Tyler), walk cleanly beside their chair within interact range!
      let tx = s.x;
      let tz = s.z;
      let stopDist = 2.3;
      if (s.seated) {
        tx = this.player.x < s.x ? s.x - 1.75 : s.x + 1.75;
        tz = s.z - 0.85;
        stopDist = 1.0;
      }
      candidates.push({
        type: 'suspect',
        suspectId: s.id,
        ax: s.x,
        ay: 1.35,
        az: s.z,
        tx,
        tz,
        interactDist: 3.2,
        stopDist,
      });
    }

    let best = null;
    let bestPx = 46; // Strict 46px direct tap threshold!
    for (const cand of candidates) {
      const worldDist = Math.hypot(this.player.x - cand.ax, this.player.z - cand.az);
      if (worldDist > 16.0) continue; // Strict 16u range!
      this._tapProjVec.set(cand.ax, cand.ay, cand.az).project(this.camera);
      if (this._tapProjVec.z > 1 || this._tapProjVec.z < -1) continue;
      const sx = rect.left + (this._tapProjVec.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-this._tapProjVec.y * 0.5 + 0.5) * rect.height;
      const pxDist = Math.hypot(clientX - sx, clientY - sy);
      if (pxDist < bestPx) {
        bestPx = pxDist;
        best = { ...cand, worldDist };
      }
    }

    if (!best) return;
    if (best.worldDist <= best.interactDist) {
      this.walkTarget = null;
      this._executeTappedAction(best);
    } else {
      const waypoints = this._planWalkWaypoints(this.player.x, this.player.z, best.tx, best.tz);
      let pathLen = 0;
      let prevX = this.player.x;
      let prevZ = this.player.z;
      for (const wp of waypoints) {
        pathLen += Math.hypot(wp.x - prevX, wp.z - prevZ);
        prevX = wp.x;
        prevZ = wp.z;
      }
      // Strict time budget so auto-walk can never run away even with an obstacle detour!
      this.walkTarget = {
        waypoints,
        x: best.tx,
        z: best.tz,
        stopDist: best.stopDist,
        target: best,
        timeLeft: Math.min(5.5, 1.5 + pathLen / 6.8),
        stuckTime: 0,
        lastDist: pathLen,
      };
    }
  }

  _segmentHitsBox(x0, z0, x1, z1, b, pad) {
    const minX = b.minX - pad;
    const maxX = b.maxX + pad;
    const minZ = b.minZ - pad;
    const maxZ = b.maxZ + pad;
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-8) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    if (!clip(-dx, x0 - minX)) return false;
    if (!clip(dx, maxX - x0)) return false;
    if (!clip(-dz, z0 - minZ)) return false;
    if (!clip(dz, maxZ - z0)) return false;
    return t0 <= t1;
  }

  /** Computes clean 1-2 waypoint obstacle detour around room furniture (e.g. Case 2 round table, Case 1 divider) */
  _planWalkWaypoints(sx, sz, tx, tz) {
    const c = this.getActiveCase();
    const room = this.world.rooms[this.caseIndex];
    const colliders = room ? room.colliders : [];
    const pad = 0.56;

    // Case 1 flooded bathroom doorway clearance
    if (c.id === 'penthouse' && tx < -5.2 && sx > -4.6 && (sz < -4.2 || tz < -4.2)) {
      return [{ x: -4.2, z: -3.2 }, { x: -6.2, z: -3.2 }, { x: tx, z: tz }];
    }

    // Find first collider blocking the straight line (skipping colliders containing the destination)
    let blocker = null;
    for (const b of colliders) {
      const dstInside =
        tx >= b.minX - pad && tx <= b.maxX + pad && tz >= b.minZ - pad && tz <= b.maxZ + pad;
      if (dstInside) continue;
      if (this._segmentHitsBox(sx, sz, tx, tz, b, pad)) {
        blocker = b;
        break;
      }
    }
    if (!blocker) return [{ x: tx, z: tz }];

    // Choose the shorter clean left/right clearance lane around the blocker!
    const margin = 0.85;
    const leftX = clamp(blocker.minX - margin, c.bounds.minX + 0.7, c.bounds.maxX - 0.7);
    const rightX = clamp(blocker.maxX + margin, c.bounds.minX + 0.7, c.bounds.maxX - 0.7);
    const midZ = (blocker.minZ + blocker.maxZ) * 0.5;
    const farZ = sz > midZ ? blocker.minZ - margin : blocker.maxZ + margin;
    const nearZ = sz > midZ ? blocker.maxZ + margin : blocker.minZ - margin;
    const clampedFarZ = clamp(farZ, c.bounds.minZ + 0.7, c.bounds.maxZ - 0.7);
    const clampedNearZ = clamp(nearZ, c.bounds.minZ + 0.7, c.bounds.maxZ - 0.7);

    const dLeft = Math.hypot(leftX - sx, clampedNearZ - sz) + Math.hypot(tx - leftX, tz - clampedFarZ);
    const dRight = Math.hypot(rightX - sx, clampedNearZ - sz) + Math.hypot(tx - rightX, tz - clampedFarZ);
    const sideX = dLeft <= dRight ? leftX : rightX;

    return [
      { x: sideX, z: clampedNearZ },
      { x: sideX, z: clampedFarZ },
      { x: tx, z: tz },
    ];
  }

  // ---------------- MAIN STEP LOOP ----------------
  step(dt = 1 / 60, count = 1) {
    const steps = Math.max(1, Math.floor(count));
    const cdt = clamp(dt, 0.001, 0.05);
    for (let i = 0; i < steps; i++) {
      this._stepOnce(cdt);
    }
  }

  _stepOnce(dt) {
    this.simTime += dt;
    if (this.quackCooldown > 0) this.quackCooldown = Math.max(0, this.quackCooldown - dt);
    if (this.player.quackTimer > 0) this.player.quackTimer = Math.max(0, this.player.quackTimer - dt);
    if (this.player.celebrateTimer > 0) this.player.celebrateTimer = Math.max(0, this.player.celebrateTimer - dt);

    this.audio.stepMusic(dt);
    this.ui.step(dt, this.simTime);

    // Combine keyboard + touch + programmatic input
    let kbX = 0;
    let kbZ = 0;
    if (!this.ui.activeModal) {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kbX -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kbX += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kbZ -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kbZ += 1;
    }

    let moveX = this.input.x + this.touchInput.x + kbX;
    let moveZ = this.input.z + this.touchInput.z + kbZ;
    const magIn = Math.hypot(moveX, moveZ);
    if (magIn > 1) {
      moveX /= magIn;
      moveZ /= magIn;
    }
    if (magIn > 0.05 || this.ui.activeModal) {
      this.walkTarget = null;
    }

    if (!this.ui.activeModal) {
      this._stepWalking(dt, moveX, moveZ);
    } else {
      this.player.speed = 0;
      if (this.player.airborne || this.player.y > 0.005) {
        this.player.vy -= 25.0 * dt;
        this.player.y += this.player.vy * dt;
        if (this.player.y <= 0) {
          this.player.y = 0;
          this.player.vy = 0;
          this.player.airborne = false;
        }
        this.duckRig.group.position.set(this.player.x, this.player.y, this.player.z);
      }
    }

    // Animate Detective Duck with webbed-foot *flap-flap-flap* SFX callback!
    animateDetectiveDuck(this.duckRig, {
      speed: this.player.speed,
      airborne: this.player.airborne,
      quackTimer: this.player.quackTimer,
      celebrateTimer: this.player.celebrateTimer,
      dt,
      time: this.simTime,
      onFootstep: (alt) => this.audio.playDuckStep(alt),
    });

    // Animate active case suspects & room props
    const susList = this.suspectRigsByCase[this.caseIndex];
    for (let i = 0; i < susList.length; i++) {
      animateSuspectAvatar(susList[i].rig, { time: this.simTime + i * 1.3, dt });
    }
    this.world.updateCaseVisuals(this.caseIndex, this.simTime, this.getActiveCaseState());

    // Step Instanced FX particles (Quack sparkle trail & Case Solved confetti)
    if (this.fxParticles.length > 0) {
      for (let i = this.fxParticles.length - 1; i >= 0; i--) {
        const pt = this.fxParticles[i];
        pt.age += dt;
        if (pt.age >= pt.maxLife) {
          this.fxParticles.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        if (pt.gravity) pt.vy -= pt.gravity * dt;
        pt.y = Math.max(0.15, pt.y);
        pt.rx += dt * 3.5;
        pt.ry += dt * 4.2;
        const lifeFrac = pt.age / pt.maxLife;
        pt.scale = Math.max(0.05, (1 - lifeFrac) * 1.15);
      }
      this.world.updateFxParticles(this.fxParticles);
    }

    // Decay speech bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      this.bubbles[i].timer -= dt;
      if (this.bubbles[i].timer <= 0) this.bubbles.splice(i, 1);
    }

    this._computeActivePrompt();
    this._updateCamera(dt);
  }

  _stepWalking(dt, moveX, moveZ) {
    const walkSpeed = 8.0;
    // Pure camera-relative walking with ZERO automatic camera yaw rotation!
    const fwdX = Math.sin(this.camYaw);
    const fwdZ = Math.cos(this.camYaw);
    const rightX = -Math.cos(this.camYaw);
    const rightZ = Math.sin(this.camYaw);

    const wx = rightX * moveX - fwdX * moveZ;
    const wz = rightZ * moveX - fwdZ * moveZ;
    const mag = Math.hypot(wx, wz);

    if (mag > 0.02) {
      this.walkTarget = null;
      const nx = this.player.x + wx * walkSpeed * dt;
      const nz = this.player.z + wz * walkSpeed * dt;
      const res = this.world.resolveWalkCollision(this.caseIndex, nx, nz, 0.46);
      const moved = Math.hypot(res.x - this.player.x, res.z - this.player.z);
      this.player.x = res.x;
      this.player.z = res.z;
      this.player.speed = moved / Math.max(0.001, dt);
      this.player.yaw = lerpAngle(this.player.yaw, Math.atan2(wx, wz), dt * 15);
    } else if (this.walkTarget) {
      const wt = this.walkTarget;
      const wps = wt.waypoints && wt.waypoints.length > 0 ? wt.waypoints : [{ x: wt.x, z: wt.z }];
      // Pop intermediate waypoints once reached closely
      while (wps.length > 1 && Math.hypot(wps[0].x - this.player.x, wps[0].z - this.player.z) < 0.72) {
        wps.shift();
      }
      const cur = wps[0];
      const finalDist = Math.hypot(wt.x - this.player.x, wt.z - this.player.z);
      const dx = cur.x - this.player.x;
      const dz = cur.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      wt.timeLeft -= dt;
      if (wt.timeLeft <= 0) {
        this.walkTarget = null;
        this.player.speed = 0;
      } else if (wps.length === 1 && finalDist <= wt.stopDist) {
        const tgt = wt.target;
        this.walkTarget = null;
        this.player.speed = 0;
        this._executeTappedAction(tgt);
      } else {
        const stepLen = Math.min(dist, walkSpeed * dt);
        const dirX = dx / Math.max(0.001, dist);
        const dirZ = dz / Math.max(0.001, dist);
        const res = this.world.resolveWalkCollision(
          this.caseIndex,
          this.player.x + dirX * stepLen,
          this.player.z + dirZ * stepLen,
          0.46
        );
        const moved = Math.hypot(res.x - this.player.x, res.z - this.player.z);
        this.player.x = res.x;
        this.player.z = res.z;
        this.player.speed = moved / Math.max(0.001, dt);
        this.player.yaw = lerpAngle(this.player.yaw, Math.atan2(dirX, dirZ), dt * 14);

        const newCurDist = Math.hypot(cur.x - this.player.x, cur.z - this.player.z);
        if (moved < walkSpeed * dt * 0.22 && newCurDist > 0.5) {
          wt.stuckTime += dt;
          if (wt.stuckTime > 0.65) {
            this.walkTarget = null;
            this.player.speed = 0;
          }
        } else {
          wt.stuckTime = 0;
        }
        wt.lastDist = newCurDist;
      }
    } else {
      this.player.speed = 0;
    }

    // Bouncy jump over puddles & shattered glass
    if (this.jumpQueued && !this.player.airborne) {
      this.player.vy = 9.0;
      this.player.airborne = true;
      this.audio.playJump();
    }
    this.jumpQueued = false;

    if (this.player.airborne || this.player.y > 0.005) {
      this.player.vy -= 25.0 * dt;
      this.player.y += this.player.vy * dt;
      if (this.player.y <= 0) {
        this.player.y = 0;
        this.player.vy = 0;
        this.player.airborne = false;
      }
    } else {
      this.player.y = 0;
    }

    this.duckRig.group.position.set(this.player.x, this.player.y, this.player.z);
    this.duckRig.group.rotation.y = this.player.yaw;
  }

  _updateCamera(dt) {
    const c = this.getActiveCase();
    const targetX = this.player.x;
    const targetY = this.player.y + 1.35;
    const targetZ = this.player.z;

    const alpha = dt >= 0.9 ? 1.0 : 1 - Math.exp(-dt * 12);
    this.camLookTarget.x += (targetX - this.camLookTarget.x) * alpha;
    this.camLookTarget.y += (targetY - this.camLookTarget.y) * alpha;
    this.camLookTarget.z += (targetZ - this.camLookTarget.z) * alpha;

    // Shorten the camera boom along the EXACT camYaw ray against room walls (never clamping x/z independently!),
    // so the rendered camera yaw ALWAYS matches camYaw with 0.000000 rad drift in all 3 cases!
    const dist = clamp(8.4 * this.camZoomScale, 5.2, 13.0);
    const cosP = Math.max(0.15, Math.cos(this.camPitch));
    const sinP = Math.sin(this.camPitch);
    const dirX = -Math.sin(this.camYaw);
    const dirZ = -Math.cos(this.camYaw);

    const minCamX = c.bounds.minX + 0.15;
    const maxCamX = c.bounds.maxX - 0.15;
    const minCamZ = c.bounds.minZ + 0.05;
    const maxCamZ = c.bounds.maxZ + 3.2;

    let desiredHoriz = cosP * dist;
    const ox = this.camLookTarget.x;
    const oz = this.camLookTarget.z;
    if (dirX < -1e-6) {
      desiredHoriz = Math.min(desiredHoriz, (minCamX - ox) / dirX);
    } else if (dirX > 1e-6) {
      desiredHoriz = Math.min(desiredHoriz, (maxCamX - ox) / dirX);
    }
    if (dirZ < -1e-6) {
      desiredHoriz = Math.min(desiredHoriz, (minCamZ - oz) / dirZ);
    } else if (dirZ > 1e-6) {
      desiredHoriz = Math.min(desiredHoriz, (maxCamZ - oz) / dirZ);
    }
    desiredHoriz = Math.max(1.15, desiredHoriz);
    const desiredVert = clamp(sinP * (desiredHoriz / cosP), 1.35, 9.2);

    this._camCurHoriz += (desiredHoriz - this._camCurHoriz) * alpha;
    this._camCurVert += (desiredVert - this._camCurVert) * alpha;

    this.camCurrentPos.x = this.camLookTarget.x + dirX * this._camCurHoriz;
    this.camCurrentPos.y = clamp(this.camLookTarget.y + this._camCurVert, 2.2, 10.5);
    this.camCurrentPos.z = this.camLookTarget.z + dirZ * this._camCurHoriz;

    this.camera.position.copy(this.camCurrentPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLookTarget);
  }

  _getTouchAction() {
    if (this.activePrompt) {
      return {
        icon: this.activePrompt.touchIcon,
        label: this.activePrompt.touchLabel,
        gold: this.activePrompt.gold,
      };
    }
    const st = this.getActiveCaseState();
    if (st.padlockUnlocked || st.foundClues.size >= 2) {
      return { icon: '⚖️', label: 'ACCUSE', gold: true };
    }
    return null;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    this.ui.updateHud({
      caseIndex: this.caseIndex,
      caseName: c.shortName,
      foundCluesCount: st.foundClues.size,
      totalClues: c.clues.length,
      stars: this.getStars(),
      musicOn: this.audio.musicOn,
      sfxOn: this.audio.sfxOn,
      subtitleSpeaker: this.subtitleSpeaker,
      subtitleText: this.subtitleText,
      touchAction: this._getTouchAction(),
    });
    this.ui.updateWorldOverlays(this.camera, window.innerWidth, window.innerHeight, {
      prompt: this.activePrompt,
      bubbles: this.bubbles,
    });
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  getState() {
    const c = this.getActiveCase();
    const st = this.getActiveCaseState();
    return {
      caseId: c.id,
      caseIndex: this.caseIndex,
      caseTitle: c.title,
      stars: this.getStars(),
      solvedCases: [...this.solvedCases],
      equippedSkin: this.equippedSkin,
      foundClues: Array.from(st.foundClues),
      revealedMask: [...st.revealedMask],
      padlockDigits: [...st.padlockDigits],
      padlockCode: [...c.code],
      padlockUnlocked: st.padlockUnlocked,
      interrogated: Array.from(st.interrogated),
      playerPos: { x: this.player.x, y: this.player.y, z: this.player.z },
      playerYaw: this.player.yaw,
      playerSpeed: this.player.speed,
      camYaw: this.camYaw,
      camPitch: this.camPitch,
      camZoomScale: this.camZoomScale,
      cameraRotZ: this.camera.rotation.z,
      hasWalkTarget: Boolean(this.walkTarget),
      quackCount: this.quackCount,
      activeFxCount: this.fxParticles.length,
      hasPrompt: Boolean(this.activePrompt),
      promptAction: this.activePrompt ? this.activePrompt.action : null,
      activeModal: this.ui.activeModal,
      subtitleText: this.subtitleText,
      simTime: this.simTime,
      drawCalls: this.renderer.info.render.calls,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
}
