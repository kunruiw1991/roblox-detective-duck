import * as THREE from '../vendor/three.module.min.js';
import { CASES, DUCK_SKINS } from './config.js';
import { getDuckSkinPortrait, getSuspectPortrait } from './avatars.js';

/**
 * Multi-touch safe tap binder:
 * - Fires instantaneously on `pointerdown` (works cleanly with a second finger held on thumbstick,
 *   and allows rapid consecutive taps on padlock tumbler arrows).
 * - Still supports programmatic `.click()` or keyboard activation without ever double-firing!
 */
function bindTap(el, fn) {
  if (!el) return;
  let handledPointerDown = false;
  el.addEventListener('pointerdown', (e) => {
    handledPointerDown = true;
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  });
  el.addEventListener('pointercancel', () => {
    handledPointerDown = false;
  });
  el.addEventListener('keydown', () => {
    handledPointerDown = false;
  });
  el.addEventListener('click', (e) => {
    // Real mouse/touch/pen taps always fire pointerdown first — never double-fire regardless of press length!
    const isPointerClick =
      e.detail > 0 || (typeof e.pointerType === 'string' && e.pointerType !== '');
    if (isPointerClick || (handledPointerDown && e.isTrusted)) {
      handledPointerDown = false;
      e.stopPropagation();
      return;
    }
    handledPointerDown = false;
    e.stopPropagation();
    fn(e);
  });
}

export class DetectiveUI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.el = {
      topLeftHud: document.getElementById('top-left-hud'),
      topRightHud: document.getElementById('top-right-hud'),
      btnCases: document.getElementById('btn-cases'),
      topCaseLabel: document.getElementById('top-case-label'),
      btnWardrobe: document.getElementById('btn-wardrobe'),
      btnNotebook: document.getElementById('btn-notebook'),
      topClueCount: document.getElementById('top-clue-count'),
      btnAccuseTop: document.getElementById('btn-accuse-top'),
      btnSound: document.getElementById('btn-sound'),
      soundIcon: document.getElementById('sound-icon'),
      starCount: document.getElementById('star-count'),

      // Heartbeat Vital Monitor
      vitalBadge: document.getElementById('vital-badge'),
      ekgCanvas: document.getElementById('ekg-canvas'),

      // Clue Log & Subtitle
      clueLogPanel: document.getElementById('clue-log-panel'),
      clueLogList: document.getElementById('clue-log-list'),
      subtitleWrap: document.getElementById('subtitle-wrap'),
      subtitleBox: document.getElementById('subtitle-box'),
      subtitleSpeaker: document.getElementById('subtitle-speaker'),
      subtitleText: document.getElementById('subtitle-text'),
      btnSkip: document.getElementById('btn-skip'),

      // World overlays
      prompt: document.getElementById('proximity-prompt'),
      promptKeycap: document.getElementById('prompt-keycap'),
      promptAction: document.getElementById('prompt-action'),
      promptSub: document.getElementById('prompt-sub'),
      worldBubbles: document.getElementById('world-bubbles'),
      floatPops: document.getElementById('float-pops'),

      // Touch Controls
      touchControls: document.getElementById('touch-controls'),
      stickZone: document.getElementById('touch-stick-zone'),
      stickBase: document.getElementById('touch-stick-base'),
      stickKnob: document.getElementById('touch-stick-knob'),
      touchRightBtns: document.getElementById('touch-right-btns'),
      btnTouchAction: document.getElementById('btn-touch-action'),
      touchActionIco: document.getElementById('touch-action-ico'),
      touchActionLbl: document.getElementById('touch-action-lbl'),
      btnTouchQuack: document.getElementById('btn-touch-quack'),
      btnTouchJump: document.getElementById('btn-touch-jump'),

      // Backdrop & Modals
      backdrop: document.getElementById('modal-backdrop'),
      modalPadlock: document.getElementById('modal-padlock'),
      padlockShackle: document.getElementById('padlock-shackle'),
      padlockTitle: document.getElementById('padlock-title'),
      btnPadlockClose: document.getElementById('btn-padlock-close'),
      padlockHintChips: document.getElementById('padlock-hint-chips'),
      btnPadlockHint: document.getElementById('btn-padlock-hint'),
      padlockTumblers: document.getElementById('padlock-tumblers'),
      padlockStatus: document.getElementById('padlock-status'),

      modalCases: document.getElementById('modal-cases'),
      casesGrid: document.getElementById('cases-grid'),
      btnToggleMusic: document.getElementById('btn-toggle-music'),
      btnToggleSfx: document.getElementById('btn-toggle-sfx'),
      btnToggleTouch: document.getElementById('btn-toggle-touch'),
      btnResetSave: document.getElementById('btn-reset-save'),

      modalWardrobe: document.getElementById('modal-wardrobe'),
      wardrobeSub: document.getElementById('wardrobe-sub'),
      wardrobeGrid: document.getElementById('wardrobe-grid'),

      modalNotebook: document.getElementById('modal-notebook'),
      notebookTitle: document.getElementById('notebook-title'),
      nbCodeDigits: document.getElementById('nb-code-digits'),
      nbCluesList: document.getElementById('nb-clues-list'),
      btnNbAccuse: document.getElementById('btn-nb-accuse'),

      modalSuspect: document.getElementById('modal-suspect'),
      suspectModalTitle: document.getElementById('suspect-modal-title'),
      suspectPortrait: document.getElementById('suspect-portrait'),
      suspectRole: document.getElementById('suspect-role'),
      suspectBadges: document.getElementById('suspect-badges'),
      suspectQuote: document.getElementById('suspect-quote'),
      btnSuspectAccuse: document.getElementById('btn-suspect-accuse'),

      modalAccuse: document.getElementById('modal-accuse'),
      accuseHint: document.getElementById('accuse-hint'),
      accuseCards: document.getElementById('accuse-cards'),
      accuseFeedback: document.getElementById('accuse-feedback'),

      modalSolved: document.getElementById('modal-solved'),
      solvedCulprit: document.getElementById('solved-culprit'),
      solvedQuote: document.getElementById('solved-quote'),
      solvedUnlock: document.getElementById('solved-unlock'),
      btnNextCase: document.getElementById('btn-next-case'),
      btnSolvedWardrobe: document.getElementById('btn-solved-wardrobe'),
    };

    this.ekgCtx = this.el.ekgCanvas ? this.el.ekgCanvas.getContext('2d') : null;
    this.activeModal = null;
    this._modalOpenedAt = 0;
    this.touchMode = 'auto'; // 'auto' | 'on' | 'off'
    this._seenTouchPointer = false;
    this.stickPointerId = null;
    this.resetArmed = false;

    this._clueLogs = []; // { icon, text, timer }
    this._bubblePool = [];
    this._projVec = new THREE.Vector3();
    this._currentSuspectId = null;

    this._initBubblePool();
    this._initPadlockDom();
    this._bindEvents();
  }

  _initBubblePool() {
    for (let i = 0; i < 6; i++) {
      const div = document.createElement('div');
      div.className = 'world-bubble hidden';
      this.el.worldBubbles.appendChild(div);
      this._bubblePool.push(div);
    }
  }

  _initPadlockDom() {
    this.el.padlockTumblers.innerHTML = '';
    this._tumblerCols = [];
    this._tumblerDigits = [];
    for (let i = 0; i < 4; i++) {
      const col = document.createElement('div');
      col.className = 'tumbler-col';
      col.dataset.index = String(i);

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'tumbler-arrow tumbler-up';
      btnUp.dataset.index = String(i);
      btnUp.dataset.dir = '1';
      btnUp.textContent = '▲';
      btnUp.setAttribute('aria-label', `Dial ${i + 1} Up`);
      bindTap(btnUp, () => this.cb.onSpinTumbler(i, 1));

      const digit = document.createElement('div');
      digit.className = 'tumbler-digit';
      digit.id = `tumbler-digit-${i}`;
      digit.textContent = '0';

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'tumbler-arrow tumbler-down';
      btnDown.dataset.index = String(i);
      btnDown.dataset.dir = '-1';
      btnDown.textContent = '▼';
      btnDown.setAttribute('aria-label', `Dial ${i + 1} Down`);
      bindTap(btnDown, () => this.cb.onSpinTumbler(i, -1));

      col.appendChild(btnUp);
      col.appendChild(digit);
      col.appendChild(btnDown);
      this.el.padlockTumblers.appendChild(col);
      this._tumblerCols.push(col);
      this._tumblerDigits.push(digit);
    }
  }

  _bindEvents() {
    bindTap(this.el.btnCases, () => this.cb.onOpenCases());
    bindTap(this.el.btnWardrobe, () => this.cb.onOpenWardrobe());
    bindTap(this.el.btnNotebook, () => this.cb.onOpenNotebook());
    bindTap(this.el.btnAccuseTop, () => this.cb.onOpenAccuse());
    bindTap(this.el.btnSound, () => this.cb.onQuickToggleAudio());
    bindTap(this.el.btnSkip, () => this.cb.onSkipSubtitle());
    bindTap(this.el.prompt, () => this.cb.onInteract());

    // Padlock buttons
    bindTap(this.el.btnPadlockClose, () => this.closeModals());
    bindTap(this.el.btnPadlockHint, () => this.cb.onPadlockHint());

    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      bindTap(btn, () => this.closeModals());
    });

    // Close backdrop ONLY on its own pointerdown (NEVER click), so slow presses (600ms-1000ms+)
    // that opened a modal on pointerdown can never self-close the modal on finger release!
    this.el.backdrop.addEventListener('pointerdown', (e) => {
      if (e.target !== this.el.backdrop) return;
      if (performance.now() - this._modalOpenedAt < 450) return;
      e.preventDefault();
      e.stopPropagation();
      this.closeModals();
    });

    // Settings inside Case Select
    bindTap(this.el.btnToggleMusic, () => this.cb.onToggleMusic());
    bindTap(this.el.btnToggleSfx, () => this.cb.onToggleSfx());
    bindTap(this.el.btnToggleTouch, () => {
      this.touchMode = this.touchMode === 'auto' ? 'on' : this.touchMode === 'on' ? 'off' : 'auto';
      this._syncTouchToggleLabel();
    });
    bindTap(this.el.btnResetSave, () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.el.btnResetSave.textContent = 'Confirm Reset?';
        return;
      }
      this.resetArmed = false;
      this.el.btnResetSave.textContent = 'Reset Save';
      this.closeModals();
      this.cb.onResetSave();
    });

    // Notebook & Suspect & Solved modal actions
    bindTap(this.el.btnNbAccuse, () => this.cb.onOpenAccuse());
    bindTap(this.el.btnSuspectAccuse, () => {
      if (this._currentSuspectId) {
        this.cb.onAccuseSuspect(this._currentSuspectId);
      }
    });
    bindTap(this.el.btnNextCase, () => this.cb.onNextCase());
    bindTap(this.el.btnSolvedWardrobe, () => this.cb.onOpenWardrobe());

    // ---------------- UNLATCHABLE IPAD THUMBSTICK ----------------
    const stickZone = this.el.stickZone;
    const stickBase = this.el.stickBase;
    const knob = this.el.stickKnob;
    const updateStick = (clientX, clientY) => {
      const rect = stickBase.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = Math.max(24, rect.width * 0.36);
      let dx = clientX - cx;
      let dy = clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > maxR && len > 0.001) {
        dx = (dx / len) * maxR;
        dy = (dy / len) * maxR;
      }
      knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      const normLen = Math.min(1, len / maxR);
      if (normLen < 0.08) {
        this.cb.onTouchMove(0, 0);
      } else {
        const rescaled = (normLen - 0.08) / 0.92;
        const ux = dx / Math.max(0.001, Math.hypot(dx, dy));
        const uy = dy / Math.max(0.001, Math.hypot(dx, dy));
        this.cb.onTouchMove(ux * rescaled, uy * rescaled);
      }
    };

    stickZone.addEventListener('pointerdown', (e) => {
      // New finger always wins so stale pointerId can never latch movement!
      if (this.stickPointerId !== null) this.resetTouchStick();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this._seenTouchPointer = true;
      }
      this.stickPointerId = e.pointerId;
      stickBase.classList.add('active');
      try {
        stickZone.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateStick(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });

    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      updateStick(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });

    const endStick = (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      this.resetTouchStick();
      e.stopPropagation();
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);
    stickZone.addEventListener('lostpointercapture', endStick);

    const endStickGlobal = (e) => {
      if (this.stickPointerId !== null && e.pointerId === this.stickPointerId) {
        this.resetTouchStick();
      }
    };
    window.addEventListener('pointerup', endStickGlobal, true);
    window.addEventListener('pointercancel', endStickGlobal, true);

    // Right-side tactile buttons ALL wired on pointerdown for multi-touch while walking!
    bindTap(this.el.btnTouchAction, () => this.cb.onInteract());
    bindTap(this.el.btnTouchQuack, () => this.cb.onQuack());
    bindTap(this.el.btnTouchJump, () => this.cb.onJump());
  }

  _syncTouchToggleLabel() {
    if (!this.el.btnToggleTouch) return;
    this.el.btnToggleTouch.textContent = `📱 Touch: ${this.touchMode.toUpperCase()}`;
    this.el.btnToggleTouch.classList.toggle('on', this.touchMode === 'on');
  }

  notifyTouchPointer() {
    this._seenTouchPointer = true;
  }

  resetTouchStick() {
    this.stickPointerId = null;
    if (this.el.stickBase) this.el.stickBase.classList.remove('active');
    if (this.el.stickKnob) this.el.stickKnob.style.transform = 'translate(0px, 0px)';
    this.cb.onTouchMove(0, 0);
  }

  isTouchEnvironment() {
    if (this.touchMode === 'on') return true;
    if (this.touchMode === 'off') return false;
    const coarse =
      window.matchMedia &&
      (window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(any-pointer: coarse)').matches);
    const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    return Boolean(coarse || hasTouch || this._seenTouchPointer);
  }

  // ---------------- EVIDENCE CLUE LOG TOASTS ----------------
  pushClueLog(icon, text, duration = 6.5) {
    this._clueLogs.push({ icon, text, timer: duration });
    if (this._clueLogs.length > 3) this._clueLogs.shift();
    this._renderClueLogs();
  }

  clearClueLogs() {
    this._clueLogs = [];
    this._renderClueLogs();
  }

  clearFloatPops() {
    if (this.el.floatPops) this.el.floatPops.innerHTML = '';
  }

  _renderClueLogs() {
    this.el.clueLogList.innerHTML = '';
    const hasLogs = this._clueLogs.length > 0;
    this.el.clueLogPanel.classList.toggle('hidden', !hasLogs);
    for (const item of this._clueLogs) {
      const row = document.createElement('div');
      row.className = 'clue-toast';
      const ico = document.createElement('span');
      ico.className = 'clue-toast-ico';
      ico.textContent = item.icon;
      const txt = document.createElement('span');
      txt.textContent = item.text;
      row.appendChild(ico);
      row.appendChild(txt);
      this.el.clueLogList.appendChild(row);
    }
  }

  step(dt, simTime) {
    let changed = false;
    for (let i = this._clueLogs.length - 1; i >= 0; i--) {
      this._clueLogs[i].timer -= dt;
      if (this._clueLogs[i].timer <= 0) {
        this._clueLogs.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this._renderClueLogs();
    this._drawEkg(simTime);
  }

  _drawEkg(simTime) {
    const ctx = this.ekgCtx;
    if (!ctx) return;
    const w = this.el.ekgCanvas.width;
    const h = this.el.ekgCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle dark grid line
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.55);
    ctx.lineTo(w, h * 0.55);
    ctx.stroke();

    // Animated red EKG heartbeat waveform
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const speed = 34;
    for (let x = 0; x <= w; x += 2) {
      const phase = ((x + simTime * speed) % 56) / 56;
      let y = h * 0.56;
      if (phase > 0.36 && phase < 0.42) y = h * 0.42;
      else if (phase >= 0.42 && phase < 0.46) y = h * 0.78;
      else if (phase >= 0.46 && phase < 0.51) y = h * 0.12;
      else if (phase >= 0.51 && phase < 0.56) y = h * 0.86;
      else if (phase >= 0.56 && phase < 0.64) y = h * 0.44;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ---------------- MODALS ----------------
  _openModalBase(name, modalEl) {
    this.closeModals(true);
    this.activeModal = name;
    this._modalOpenedAt = performance.now();
    this.resetTouchStick();
    this.el.backdrop.classList.remove('hidden');
    modalEl.classList.remove('hidden');
    this.cb.onModalChange(name);
  }

  closeModals(silent = false) {
    this.activeModal = null;
    this.resetArmed = false;
    if (this.el.btnResetSave) this.el.btnResetSave.textContent = 'Reset Save';
    this.el.backdrop.classList.add('hidden');
    this.el.modalPadlock.classList.add('hidden');
    this.el.modalCases.classList.add('hidden');
    this.el.modalWardrobe.classList.add('hidden');
    this.el.modalNotebook.classList.add('hidden');
    this.el.modalSuspect.classList.add('hidden');
    this.el.modalAccuse.classList.add('hidden');
    this.el.modalSolved.classList.add('hidden');
    if (!silent) this.cb.onModalChange(null);
  }

  openPadlockModal(caseDef, digits, revealedMask, unlocked) {
    this._openModalBase('padlock', this.el.modalPadlock);
    this.syncPadlockModal(caseDef, digits, revealedMask, unlocked);
  }

  syncPadlockModal(caseDef, digits, revealedMask, unlocked) {
    this.el.padlockTitle.textContent = caseDef.padlock.name.toUpperCase();
    this.el.padlockShackle.classList.toggle('unlocked', unlocked);

    this.el.padlockHintChips.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const chip = document.createElement('span');
      const known = revealedMask[i];
      chip.className = `hint-chip${known ? ' known' : ''}`;
      chip.textContent = known ? String(caseDef.code[i]) : '?';
      this.el.padlockHintChips.appendChild(chip);
    }

    for (let i = 0; i < 4; i++) {
      this._tumblerDigits[i].textContent = String(digits[i]);
      const matched = digits[i] === caseDef.code[i];
      this._tumblerCols[i].classList.toggle('matched', matched);
    }

    this.el.padlockStatus.textContent = unlocked
      ? `SNICK! UNLOCKED! ${caseDef.padlock.rewardNote}`
      : 'Spin each brass dial to match the green digits!';
  }

  openCasesModal(activeCaseIdx, solvedCases, audioState) {
    this._openModalBase('cases', this.el.modalCases);
    this.syncCasesModal(activeCaseIdx, solvedCases, audioState);
  }

  syncCasesModal(activeCaseIdx, solvedCases, audioState) {
    this.el.casesGrid.innerHTML = '';
    for (const c of CASES) {
      const solved = solvedCases.includes(c.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `case-card${c.index === activeCaseIdx ? ' active' : ''}${solved ? ' solved' : ''}`;
      card.innerHTML = `
        <span class="case-badge${solved ? ' done' : ''}">${solved ? '★ SOLVED' : c.index === activeCaseIdx ? 'PLAYING' : 'OPEN CASE'}</span>
        <span class="case-card-title">${c.title}</span>
        <span class="case-card-sub">${c.locationTag} • Code Lock + 3 Suspects</span>
      `;
      bindTap(card, () => {
        this.closeModals();
        this.cb.onSelectCase(c.index);
      });
      this.el.casesGrid.appendChild(card);
    }
    this.el.btnToggleMusic.textContent = `🎵 Music: ${audioState.musicOn ? 'ON' : 'OFF'}`;
    this.el.btnToggleMusic.classList.toggle('on', audioState.musicOn);
    this.el.btnToggleSfx.textContent = `🔊 SFX: ${audioState.sfxOn ? 'ON' : 'OFF'}`;
    this.el.btnToggleSfx.classList.toggle('on', audioState.sfxOn);
    this._syncTouchToggleLabel();
  }

  openWardrobeModal(stars, activeSkinId) {
    this._openModalBase('wardrobe', this.el.modalWardrobe);
    this.syncWardrobeModal(stars, activeSkinId);
  }

  syncWardrobeModal(stars, activeSkinId) {
    this.el.wardrobeSub.textContent = `Detective Stars: ★ ${stars}/3 — Solve mystery cases to unlock every Detective Duck skin!`;
    this.el.wardrobeGrid.innerHTML = '';
    for (const skin of DUCK_SKINS) {
      const unlocked = stars >= skin.starsRequired;
      const equipped = activeSkinId === skin.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `skin-card${equipped ? ' equipped' : ''}${unlocked ? '' : ' locked'}`;
      card.dataset.skinId = skin.id;
      const badgeTxt = equipped
        ? '✓ EQUIPPED'
        : unlocked
          ? 'EQUIP'
          : `★ NEED ${skin.starsRequired} STAR${skin.starsRequired > 1 ? 'S' : ''}`;
      card.innerHTML = `
        <img class="skin-portrait" src="${getDuckSkinPortrait(skin.id)}" alt="${skin.name}" />
        <span class="case-badge${equipped ? ' done' : ''}">${badgeTxt}</span>
        <span class="skin-name">${skin.name}</span>
        <span class="skin-desc">${skin.desc}</span>
      `;
      if (unlocked) {
        bindTap(card, () => this.cb.onEquipSkin(skin.id));
      }
      this.el.wardrobeGrid.appendChild(card);
    }
  }

  openNotebookModal(caseDef, foundClues, revealedMask, padlockUnlocked) {
    this._openModalBase('notebook', this.el.modalNotebook);
    this.el.notebookTitle.textContent = `📓 ${caseDef.shortName.toUpperCase()} NOTEBOOK`;

    this.el.nbCodeDigits.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('span');
      const known = revealedMask[i] || padlockUnlocked;
      d.className = `nb-digit${known ? ' known' : ''}`;
      d.textContent = known ? String(caseDef.code[i]) : '?';
      this.el.nbCodeDigits.appendChild(d);
    }

    this.el.nbCluesList.innerHTML = '';
    for (const cl of caseDef.clues) {
      const found = foundClues.has(cl.id);
      const row = document.createElement('div');
      row.className = `nb-clue-row${found ? ' found' : ''}`;
      row.innerHTML = `
        <span class="nb-clue-ico">${found ? cl.icon : '❓'}</span>
        <span class="nb-clue-txt">${found ? cl.subtitle : `Unfound Clue: ${cl.shortLabel} (Tap QUACK! for sparkle trail!)`}</span>
        <span class="nb-clue-tag" style="background:${found ? cl.traitColor : '#334155'}">${found ? cl.traitTag : 'SEARCH'}</span>
      `;
      this.el.nbCluesList.appendChild(row);
    }
    const lockRow = document.createElement('div');
    lockRow.className = `nb-clue-row${padlockUnlocked ? ' found' : ''}`;
    lockRow.innerHTML = `
      <span class="nb-clue-ico">${padlockUnlocked ? caseDef.padlock.rewardIcon : '🔒'}</span>
      <span class="nb-clue-txt">${padlockUnlocked ? caseDef.padlock.rewardNote : `Locked: ${caseDef.padlock.name} (Needs 4-digit code!)`}</span>
      <span class="nb-clue-tag" style="background:${padlockUnlocked ? '#15803d' : '#b45309'}">${padlockUnlocked ? 'UNLOCKED' : 'PADLOCK'}</span>
    `;
    this.el.nbCluesList.appendChild(lockRow);
  }

  openSuspectModal(suspect) {
    this._openModalBase('suspect', this.el.modalSuspect);
    this._currentSuspectId = suspect.id;
    this.el.suspectModalTitle.textContent = `🗣️ ${suspect.name.toUpperCase()}`;
    this.el.suspectPortrait.src = getSuspectPortrait(suspect.avatarPreset);
    this.el.suspectRole.textContent = suspect.role;
    this.el.suspectBadges.innerHTML = suspect.badges
      .map((b) => `<span class="trait-badge" style="background:${b.color}">${b.icon} ${b.label}</span>`)
      .join('');
    this.el.suspectQuote.textContent = `"${suspect.alibi}"`;
  }

  openAccuseModal(caseDef, foundClues, padlockUnlocked) {
    this._openModalBase('accuse', this.el.modalAccuse);
    this.el.accuseFeedback.classList.add('hidden');
    const hintTags = [];
    for (const cl of caseDef.clues) {
      if (foundClues.has(cl.id)) hintTags.push(cl.traitTag);
    }
    this.el.accuseHint.textContent =
      hintTags.length > 0
        ? `Your clues point to: ${hintTags.join(' • ')}${padlockUnlocked ? ' • LOCK OPEN!' : ''}`
        : 'Match the visual clue badges on each suspect card!';

    this.el.accuseCards.innerHTML = '';
    for (const s of caseDef.suspects) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'accuse-card';
      btn.dataset.suspectId = s.id;
      const badgeHtml = s.badges
        .map((b) => `<span class="trait-badge" style="background:${b.color}">${b.icon} ${b.label}</span>`)
        .join('');
      btn.innerHTML = `
        <img src="${getSuspectPortrait(s.avatarPreset)}" alt="${s.name}" />
        <div class="accuse-card-name">${s.name}</div>
        <div class="accuse-card-role">${s.role}</div>
        <div class="suspect-badges">${badgeHtml}</div>
      `;
      bindTap(btn, () => this.cb.onAccuseSuspect(s.id));
      this.el.accuseCards.appendChild(btn);
    }
  }

  showAccuseGentleHint(msg) {
    this.el.accuseFeedback.textContent = msg;
    this.el.accuseFeedback.classList.remove('hidden');
  }

  openSolvedModal(culprit, newlyUnlockedSkin, hasNextCase) {
    this._openModalBase('solved', this.el.modalSolved);
    this.el.solvedCulprit.textContent = `${culprit.name} Confessed! (+1 ★ Star)`;
    this.el.solvedQuote.textContent = `"${culprit.guiltyLine}"`;
    if (newlyUnlockedSkin) {
      this.el.solvedUnlock.textContent = `🦆 NEW SKIN UNLOCKED: ${newlyUnlockedSkin.name}!`;
      this.el.solvedUnlock.classList.remove('hidden');
    } else {
      this.el.solvedUnlock.classList.add('hidden');
    }
    this.el.btnNextCase.textContent = hasNextCase ? 'NEXT CASE ▶' : 'PLAY AGAIN ▶';
  }

  // ---------------- FLOATING POPS & HUD SYNC ----------------
  spawnFloatPop(text, worldPos, camera, width, height, color = '#fde047') {
    if (this.el.floatPops.childElementCount >= 10) {
      this.el.floatPops.firstChild.remove();
    }
    this._projVec.set(worldPos.x, worldPos.y, worldPos.z).project(camera);
    if (this._projVec.z > 1) return;
    const sx = (this._projVec.x * 0.5 + 0.5) * width;
    const sy = (-this._projVec.y * 0.5 + 0.5) * height;
    const div = document.createElement('div');
    div.className = 'float-pop';
    div.textContent = text;
    div.style.color = color;
    div.style.left = `${Math.max(40, Math.min(width - 40, sx)).toFixed(0)}px`;
    div.style.top = `${Math.max(54, Math.min(height - 70, sy)).toFixed(0)}px`;
    div.addEventListener('animationend', () => div.remove(), { once: true });
    this.el.floatPops.appendChild(div);
  }

  updateHud(state) {
    this.el.topCaseLabel.textContent = `Case ${state.caseIndex + 1}`;
    this.el.topClueCount.textContent = `Clues ${state.foundCluesCount}/${state.totalClues}`;
    this.el.starCount.textContent = `${state.stars}/3`;
    this.el.soundIcon.textContent = state.musicOn || state.sfxOn ? '🔊' : '🔇';

    // Subtitle box
    const hasSub = Boolean(state.subtitleText) && !this.activeModal;
    this.el.subtitleWrap.classList.toggle('hidden', !hasSub);
    if (hasSub) {
      this.el.subtitleSpeaker.textContent = state.subtitleSpeaker || 'DETECTIVE DUCK';
      this.el.subtitleText.textContent = state.subtitleText;
    }

    // Touch controls visibility & dynamic action button
    const isTouch = this.isTouchEnvironment();
    const showTouch = isTouch && !this.activeModal;
    document.body.classList.toggle('touch-device', isTouch);
    document.body.classList.toggle('touch-active', showTouch);

    if (this.el.promptKeycap) {
      this.el.promptKeycap.textContent = isTouch ? 'TAP' : 'E';
    }

    const wasHidden = this.el.touchControls.classList.contains('hidden');
    this.el.touchControls.classList.toggle('hidden', !showTouch);
    if (!showTouch && !wasHidden && this.stickPointerId !== null) {
      this.resetTouchStick();
    }

    if (showTouch) {
      const act = state.touchAction;
      this.el.btnTouchAction.classList.toggle('hidden', !act);
      if (act) {
        this.el.touchActionIco.textContent = act.icon;
        this.el.touchActionLbl.textContent = act.label;
        this.el.btnTouchAction.classList.toggle('gold', Boolean(act.gold));
      }
    }
  }

  updateWorldOverlays(camera, width, height, { prompt, bubbles }) {
    const touchActive = !this.el.touchControls.classList.contains('hidden');
    const padX = touchActive ? 140 : 18;
    const bottomCap = this.el.subtitleWrap.classList.contains('hidden')
      ? height - 76
      : Math.min(height - 76, this.el.subtitleWrap.getBoundingClientRect().top - 14);

    // 1. Proximity Prompt
    if (prompt && !this.activeModal) {
      this._projVec.set(prompt.x, prompt.y, prompt.z).project(camera);
      if (this._projVec.z <= 1) {
        this.el.promptAction.textContent = prompt.action;
        this.el.promptSub.textContent = prompt.sub || '';
        this.el.prompt.classList.remove('hidden');
        const halfW = Math.max(60, Math.ceil(this.el.prompt.offsetWidth * 0.5) + 8);
        const promptH = Math.max(38, Math.ceil(this.el.prompt.offsetHeight));
        const effPad = Math.min(padX, Math.max(12, Math.floor((width - halfW * 2) * 0.5)));
        let sx = (this._projVec.x * 0.5 + 0.5) * width;
        let sy = (-this._projVec.y * 0.5 + 0.5) * height;
        sx = Math.max(halfW + effPad, Math.min(width - halfW - effPad, sx));
        sy = Math.max(promptH + 58, Math.min(bottomCap, sy));
        this.el.prompt.style.left = `${sx.toFixed(1)}px`;
        this.el.prompt.style.top = `${sy.toFixed(1)}px`;
      } else {
        this.el.prompt.classList.add('hidden');
      }
    } else {
      this.el.prompt.classList.add('hidden');
    }

    // 2. Comic Speech / QUACK Bubbles
    for (let i = 0; i < this._bubblePool.length; i++) {
      const el = this._bubblePool[i];
      const b = !this.activeModal && bubbles[i] ? bubbles[i] : null;
      if (!b) {
        el.classList.add('hidden');
        continue;
      }
      this._projVec.set(b.x, b.y, b.z).project(camera);
      if (this._projVec.z > 1) {
        el.classList.add('hidden');
        continue;
      }
      el.textContent = b.text;
      el.className = `world-bubble${b.quack ? ' quack' : ''}`;
      const halfW = Math.max(44, Math.ceil(el.offsetWidth * 0.5) + 10);
      const sx = Math.max(halfW, Math.min(width - halfW, (this._projVec.x * 0.5 + 0.5) * width));
      const sy = Math.max(66, Math.min(bottomCap, (-this._projVec.y * 0.5 + 0.5) * height));
      el.style.left = `${sx.toFixed(1)}px`;
      el.style.top = `${sy.toFixed(1)}px`;
    }
  }
}
