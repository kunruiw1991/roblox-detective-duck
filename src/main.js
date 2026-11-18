import { DetectiveUI } from './ui.js';
import { DetectiveDuckGame } from './game.js';

const canvas = document.getElementById('game-canvas');
let game = null;

const ui = new DetectiveUI({
  onInteract: () => game && game.triggerInteract(),
  onQuack: () => game && game.triggerQuack(),
  onJump: () => game && game.queueJump(),
  onSkipSubtitle: () => game && game.skipSubtitle(),
  onOpenCases: () => {
    if (!game) return;
    game.audio.unlock();
    if (ui.activeModal === 'cases') ui.closeModals();
    else ui.openCasesModal(game.caseIndex, game.solvedCases, game.audio.getState());
  },
  onSelectCase: (idx) => game && game.selectCase(idx),
  onOpenWardrobe: () => {
    if (!game) return;
    game.audio.unlock();
    if (ui.activeModal === 'wardrobe') ui.closeModals();
    else ui.openWardrobeModal(game.getStars(), game.equippedSkin);
  },
  onEquipSkin: (skinId) => game && game.equipSkin(skinId),
  onOpenNotebook: () => {
    if (!game) return;
    game.audio.unlock();
    if (ui.activeModal === 'notebook') {
      ui.closeModals();
    } else {
      const c = game.getActiveCase();
      const st = game.getActiveCaseState();
      ui.openNotebookModal(c, st.foundClues, st.revealedMask, st.padlockUnlocked);
    }
  },
  onOpenAccuse: () => {
    if (!game) return;
    game.audio.unlock();
    if (ui.activeModal === 'accuse') ui.closeModals();
    else game.openAccuseModal();
  },
  onAccuseSuspect: (suspectId) => game && game.accuseSuspect(suspectId),
  onSpinTumbler: (idx, delta) => game && game.spinTumbler(idx, delta),
  onPadlockHint: () => game && game.revealPadlockHint(),
  onNextCase: () => game && game.advanceToNextCase(),
  onQuickToggleAudio: () => {
    if (!game) return;
    game.audio.unlock();
    const next = !(game.audio.musicOn || game.audio.sfxOn);
    game.audio.setMusicOn(next);
    game.audio.setSfxOn(next);
    game._save();
  },
  onToggleMusic: () => {
    if (!game) return;
    game.audio.unlock();
    game.audio.setMusicOn(!game.audio.musicOn);
    ui.syncCasesModal(game.caseIndex, game.solvedCases, game.audio.getState());
    game._save();
  },
  onToggleSfx: () => {
    if (!game) return;
    game.audio.unlock();
    game.audio.setSfxOn(!game.audio.sfxOn);
    ui.syncCasesModal(game.caseIndex, game.solvedCases, game.audio.getState());
    game._save();
  },
  onResetSave: () => game && game.resetSave(),
  onTouchMove: (x, z) => {
    if (!game) return;
    game.touchInput.x = x;
    game.touchInput.z = z;
    if (Math.hypot(x, z) > 0.08) {
      game.cancelAutoWalk();
    }
  },
  onModalChange: (modal) => {
    if (game && modal) {
      game.keys.clear();
      game.touchInput.x = 0;
      game.touchInput.z = 0;
      game.cancelAutoWalk();
    }
  },
});

game = new DetectiveDuckGame(canvas, ui);

// ---------------- ZERO-RUNAWAY IPAD / TOUCH & KEYBOARD GUARDS ----------------
window.addEventListener(
  'touchstart',
  () => {
    game.audio.unlock();
    ui.notifyTouchPointer();
  },
  { passive: true }
);

window.addEventListener(
  'pointerdown',
  (e) => {
    game.audio.unlock();
    // ANY new finger down cancels pending tap-to-walk immediately!
    game.cancelAutoWalk();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      ui.notifyTouchPointer();
    }
  },
  { passive: true, capture: true }
);

window.addEventListener('keydown', (e) => {
  game.audio.unlock();
  if (e.metaKey || e.altKey || e.ctrlKey) {
    game.keys.clear();
  }
  if (e.code === 'Escape') {
    if (ui.activeModal) {
      ui.closeModals();
    } else {
      ui.openCasesModal(game.caseIndex, game.solvedCases, game.audio.getState());
    }
    return;
  }

  if (ui.activeModal) return;

  if (
    e.code === 'Space' ||
    e.code === 'ArrowUp' ||
    e.code === 'ArrowDown' ||
    e.code === 'ArrowLeft' ||
    e.code === 'ArrowRight'
  ) {
    e.preventDefault();
  }

  game.keys.add(e.code);
  if (!e.repeat) game.cancelAutoWalk();
  if (e.repeat) return;

  if (e.code === 'KeyE') {
    game.triggerInteract();
  } else if (e.code === 'Space') {
    game.queueJump();
  } else if (e.code === 'KeyQ') {
    game.triggerQuack();
  } else if (e.code === 'Digit1') {
    game.selectCase(0);
  } else if (e.code === 'Digit2') {
    game.selectCase(1);
  } else if (e.code === 'Digit3') {
    game.selectCase(2);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'MetaLeft' || e.code === 'MetaRight') game.keys.clear();
  game.keys.delete(e.code);
});

const activePointers = new Map();
let singlePointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let lastPointerX = 0;
let lastPointerY = 0;
let dragMoved = false;
let pinchUsed = false;
let pinchPrevDist = 0;

function resetAllInputs() {
  game.resetMovementInputs();
  game.manualOrbitDragging = false;
  activePointers.clear();
  singlePointerId = null;
  pinchPrevDist = 0;
}

window.addEventListener('blur', resetAllInputs);
window.addEventListener('pagehide', resetAllInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetAllInputs();
});

// Order-proof touchend/touchcancel guard so lost pointerup on iPadOS can never latch stick/orbit!
const releaseIfNoTouches = (e) => {
  if (e.touches && e.touches.length === 0) {
    ui.resetTouchStick();
    const stale = [...activePointers.keys()];
    setTimeout(() => {
      for (const id of stale) activePointers.delete(id);
      if (activePointers.size === 0) game.manualOrbitDragging = false;
    }, 0);
  }
};
window.addEventListener('touchend', releaseIfNoTouches, { passive: true });
window.addEventListener('touchcancel', releaseIfNoTouches, { passive: true });

// ---------------- 1-FINGER ORBIT, 2-FINGER PINCH ZOOM & DIRECT TAP ----------------
function getTwoPointerDistance() {
  if (activePointers.size < 2) return 0;
  const pts = Array.from(activePointers.values());
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    if (ui.activeModal) return;
    e.preventDefault();
    game.setCameraZoom(game.camZoomScale * (e.deltaY > 0 ? 1.07 : 0.93));
  },
  { passive: false }
);

canvas.addEventListener('pointerdown', (e) => {
  if (e.target !== canvas) return;
  game.audio.unlock();
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    ui.notifyTouchPointer();
  }
  game.cancelAutoWalk();
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}

  if (activePointers.size === 1) {
    singlePointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    dragMoved = false;
    pinchUsed = false;
    pinchPrevDist = 0;
    game.manualOrbitDragging = true;
  } else if (activePointers.size === 2) {
    singlePointerId = null;
    dragMoved = true;
    pinchUsed = true;
    pinchPrevDist = getTwoPointerDistance();
    game.manualOrbitDragging = true;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const tracked = activePointers.get(e.pointerId);
  if (!tracked) return;
  tracked.x = e.clientX;
  tracked.y = e.clientY;

  if (activePointers.size >= 2) {
    const dist = getTwoPointerDistance();
    if (pinchPrevDist > 12 && dist > 12 && !ui.activeModal) {
      game.setCameraZoom(game.camZoomScale * (pinchPrevDist / dist));
    }
    pinchPrevDist = dist;
    return;
  }

  if (e.pointerId === singlePointerId) {
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    const deadzone = e.pointerType === 'touch' ? 10 : 6;
    if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > deadzone) {
      dragMoved = true;
    }
    if (dragMoved && !ui.activeModal) {
      game.setCameraOrbit(game.camYaw - dx * 0.0066, game.camPitch + dy * 0.0045);
    }
  }
});

const endOrbit = (e) => {
  const wasTracked = activePointers.delete(e.pointerId);
  if (!wasTracked) return;
  if (activePointers.size === 0) {
    // pointercancel NEVER counts as a tap!
    const shouldTap = e.type === 'pointerup' && e.pointerId === singlePointerId && !dragMoved && !pinchUsed;
    singlePointerId = null;
    pinchPrevDist = 0;
    game.manualOrbitDragging = false;
    if (shouldTap) {
      game.handleCanvasClick(e.clientX, e.clientY);
    }
  } else if (activePointers.size === 1) {
    const [remId, remPt] = activePointers.entries().next().value;
    singlePointerId = remId;
    lastPointerX = remPt.x;
    lastPointerY = remPt.y;
    dragMoved = true;
    pinchPrevDist = 0;
  }
};
canvas.addEventListener('pointerup', endOrbit);
canvas.addEventListener('pointercancel', endOrbit);

window.addEventListener('resize', () => {
  game.resize();
  game.render();
});

// ---------------- DETERMINISTIC TEST SEAM ----------------
window.__ROBLOX_DUCK__ = {
  getState: () => game.getState(),
  step: (dt = 1 / 60, n = 1) => {
    game.step(dt, n);
    return game.getState();
  },
  render: () => game.render(),
  setInput: (x, z) => game.setInput(x, z),
  setCameraOrbit: (yaw, pitch) => {
    game.setCameraOrbit(yaw, pitch);
    game._updateCamera(1.0);
  },
  setCameraZoom: (s) => {
    game.setCameraZoom(s);
    game._updateCamera(1.0);
  },
  triggerInteract: () => game.triggerInteract(),
  triggerQuack: () => game.triggerQuack(),
  queueJump: () => game.queueJump(),
  inspectClue: (id) => game.inspectClue(id),
  openPadlock: () => game.openPadlock(),
  spinTumbler: (idx, delta) => game.spinTumbler(idx, delta),
  revealPadlockHint: () => game.revealPadlockHint(),
  talkSuspect: (id) => game.talkSuspect(id),
  openAccuseModal: () => game.openAccuseModal(),
  accuseSuspect: (id) => game.accuseSuspect(id),
  selectCase: (idx) => game.selectCase(idx),
  equipSkin: (skinId) => game.equipSkin(skinId),
  skipSubtitle: () => game.skipSubtitle(),
  resetSave: () => game.resetSave(),
  audio: game.audio,
  get rendererInfo() {
    return {
      calls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      geometries: game.renderer.info.memory.geometries,
      textures: game.renderer.info.memory.textures,
    };
  },
  _scene: game.scene,
  _camera: game.camera,
  _game: game,
};

// ---------------- MAIN LOOP ----------------
let lastTs = performance.now();
function loop(ts) {
  const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
  lastTs = ts;
  game.step(dt, 1);
  game.render();
  requestAnimationFrame(loop);
}

game.render();
requestAnimationFrame(loop);
