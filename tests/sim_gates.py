#!/usr/bin/env python3
"""Comprehensive 7-Gate E2E, Visual, Responsive, Persistence, Soak & Real CDP iPad Touch Suite
for [UPDT] Detective Duck (/tmp/roblox-detective-duck).
"""

import asyncio
import base64
import functools
import http.server
import json
import math
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

from PIL import Image
import websockets

ROOT = Path('/tmp/roblox-detective-duck')
CAP_DIR = ROOT / 'tests' / 'captures'
PORT = 8863
CDP_PORT = 9263
CHROME_PROFILE = '/tmp/chrome_rbx_duck'
URL = f'http://127.0.0.1:{PORT}/index.html'

CJK_RE = re.compile(r'[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]')
CDN_RE = re.compile(r'https?://(cdn\.|unpkg\.|cdnjs\.|fonts\.googleapis|esm\.sh)', re.I)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    bad_requests = []

    def log_message(self, fmt, *args):
        pass

    def send_response(self, code, message=None):
        if code >= 400:
            QuietHandler.bad_requests.append((code, self.path))
        super().send_response(code, message)


def start_http_server():
    QuietHandler.bad_requests = []
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def start_chrome():
    shutil.rmtree(CHROME_PROFILE, ignore_errors=True)
    chrome_home = os.path.join(CHROME_PROFILE, 'home')
    os.makedirs(os.path.join(chrome_home, '.config'), exist_ok=True)
    os.makedirs(os.path.join(chrome_home, '.cache'), exist_ok=True)
    chrome_env = {
        'PATH': '/usr/local/bin:/usr/bin:/bin',
        'HOME': chrome_home,
        'TMPDIR': CHROME_PROFILE,
        'XDG_CONFIG_HOME': os.path.join(chrome_home, '.config'),
        'XDG_CACHE_HOME': os.path.join(chrome_home, '.cache'),
        'LANG': 'en_US.UTF-8',
    }
    cmd = [
        '/usr/bin/google-chrome',
        '--headless=new',
        '--ozone-platform=headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-proxy-server',
        '--disable-background-networking',
        '--disable-extensions',
        '--disable-sync',
        '--mute-audio',
        '--autoplay-policy=no-user-gesture-required',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--remote-allow-origins=*',
        f'--user-data-dir={CHROME_PROFILE}',
        f'--remote-debugging-port={CDP_PORT}',
        '--window-size=1280,800',
        'about:blank',
    ]
    proc = subprocess.Popen(cmd, env=chrome_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 15.0
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.time() < deadline:
        try:
            with opener.open(f'http://127.0.0.1:{CDP_PORT}/json/list', timeout=2) as r:
                pages = json.loads(r.read().decode())
                for p in pages:
                    if p.get('type') == 'page' and p.get('webSocketDebuggerUrl'):
                        return proc, p['webSocketDebuggerUrl']
        except Exception:
            time.sleep(0.15)
    proc.kill()
    raise RuntimeError('Chrome CDP failed to start')


class CDPClient:
    def __init__(self, ws):
        self.ws = ws
        self._id = 0
        self._pending = {}
        self.console_errors = []
        self.js_exceptions = []
        self.failed_requests = []
        self._reader_task = asyncio.create_task(self._reader())

    async def _reader(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if 'id' in msg:
                    fut = self._pending.pop(msg['id'], None)
                    if fut and not fut.done():
                        if 'error' in msg:
                            fut.set_exception(RuntimeError(str(msg['error'])))
                        else:
                            fut.set_result(msg.get('result', {}))
                else:
                    method = msg.get('method', '')
                    params = msg.get('params', {})
                    if method == 'Runtime.exceptionThrown':
                        ex = params.get('exceptionDetails', {})
                        txt = ex.get('text', '') + ' ' + str(ex.get('exception', {}).get('description', ''))
                        self.js_exceptions.append(txt.strip())
                    elif method == 'Runtime.consoleAPICalled':
                        if params.get('type') == 'error':
                            args = ' '.join(str(a.get('value', a.get('description', ''))) for a in params.get('args', []))
                            self.console_errors.append(args)
                    elif method == 'Log.entryAdded':
                        ent = params.get('entry', {})
                        if ent.get('level') == 'error':
                            self.console_errors.append(ent.get('text', ''))
                    elif method == 'Network.loadingFailed':
                        self.failed_requests.append(params.get('errorText', 'failed'))
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def send(self, method, params=None):
        self._id += 1
        cid = self._id
        fut = asyncio.get_running_loop().create_future()
        self._pending[cid] = fut
        await self.ws.send(json.dumps({'id': cid, 'method': method, 'params': params or {}}))
        return await asyncio.wait_for(fut, timeout=20.0)

    async def eval(self, expr):
        res = await self.send('Runtime.evaluate', {
            'expression': expr,
            'returnByValue': True,
            'awaitPromise': True,
        })
        if 'exceptionDetails' in res:
            raise RuntimeError(f"Eval exception: {res['exceptionDetails']}")
        return res.get('result', {}).get('value')

    async def screenshot(self, out_path, fmt='png', quality=90):
        params = {'format': fmt}
        if fmt == 'jpeg':
            params['quality'] = quality
        res = await self.send('Page.captureScreenshot', params)
        raw = base64.b64decode(res['data'])
        Path(out_path).write_bytes(raw)
        return out_path

    async def dispatch_touch(self, event_type, touch_points):
        await self.send('Input.dispatchTouchEvent', {
            'type': event_type,
            'touchPoints': touch_points,
        })

    async def set_viewport(self, w, h, mobile=False, touch=None):
        use_touch = mobile if touch is None else touch
        await self.send('Emulation.setDeviceMetricsOverride', {
            'width': w,
            'height': h,
            'deviceScaleFactor': 1,
            'mobile': mobile,
        })
        if use_touch:
            await self.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
        else:
            await self.send('Emulation.setTouchEmulationEnabled', {'enabled': False})
        await self.eval('''(() => {
            const g = window.__ROBLOX_DUCK__._game;
            if (!''' + ('true' if use_touch else 'false') + ''') {
                g.ui._seenTouchPointer = false;
                g.ui.touchMode = 'auto';
            }
            window.dispatchEvent(new Event("resize"));
            window.__ROBLOX_DUCK__.render();
        })()''')
        await asyncio.sleep(0.10)

    async def close(self):
        self._reader_task.cancel()


def gate_1_static_forensics():
    print('[G1] Static Forensics (0 CJK, 0 speechSynthesis, 0 renderer.compile, 0 CDN, 0 /google/)...')
    files = [ROOT / 'index.html', ROOT / 'css' / 'style.css'] + sorted((ROOT / 'src').glob('*.js'))
    assert len(files) >= 9, f'Expected >=9 source files, got {len(files)}'
    for f in files:
        txt = f.read_text(encoding='utf-8')
        assert not CJK_RE.search(txt), f'CJK found in {f}'
        assert 'speechSynthesis' not in txt, f'speechSynthesis found in {f}'
        assert 'renderer.compile' not in txt, f'renderer.compile found in {f}'
        assert not CDN_RE.search(txt), f'CDN URL found in {f}'
        assert '/google/' not in txt, f'/google/ string found in {f}'
    assert (ROOT / 'vendor' / 'three.module.min.js').exists(), 'Vendored Three.js r170 missing!'
    print(f'  PASS ({len(files)} source files + vendored Three.js clean)')


async def wait_ready(cdp):
    for _ in range(80):
        if cdp.js_exceptions or cdp.console_errors:
            raise RuntimeError(
                f'Boot error: js={cdp.js_exceptions} console={cdp.console_errors} net={cdp.failed_requests} http={QuietHandler.bad_requests}'
            )
        ok = await cdp.eval('Boolean(window.__ROBLOX_DUCK__ && window.__ROBLOX_DUCK__.getState)')
        if ok:
            return
        await asyncio.sleep(0.1)
    raise RuntimeError('window.__ROBLOX_DUCK__ did not initialize')


async def run_all_gates():
    gate_1_static_forensics()
    os.makedirs(CAP_DIR, exist_ok=True)
    server = start_http_server()
    proc, ws_url = start_chrome()

    try:
        async with websockets.connect(ws_url, max_size=20 * 1024 * 1024) as ws:
            cdp = CDPClient(ws)
            await cdp.send('Runtime.enable')
            await cdp.send('Log.enable')
            await cdp.send('Page.enable')
            await cdp.send('Network.enable')

            # ---------------- G2: Boot, API Surface, Materials & Draw Calls ----------------
            print('[G2] Boot, API Surface, Material Compliance & Draw Calls...')
            await cdp.send('Page.navigate', {'url': URL})
            await wait_ready(cdp)
            await cdp.eval('window.__ROBLOX_DUCK__.resetSave(); window.__ROBLOX_DUCK__.step(1/60, 10); window.__ROBLOX_DUCK__.render();')
            await asyncio.sleep(0.12)

            missing_api = await cdp.eval('''(() => {
                const a = window.__ROBLOX_DUCK__;
                const req = [
                    'getState','step','render','setInput','setCameraOrbit','setCameraZoom',
                    'triggerInteract','triggerQuack','queueJump','inspectClue','openPadlock',
                    'spinTumbler','revealPadlockHint','talkSuspect','openAccuseModal',
                    'accuseSuspect','selectCase','equipSkin','skipSubtitle','resetSave',
                    'audio','rendererInfo'
                ];
                return req.filter(k => !(k in a));
            })()''')
            assert missing_api == [], f'Missing __ROBLOX_DUCK__ keys: {missing_api}'

            mat_audit = await cdp.eval('''(() => {
                const scene = window.__ROBLOX_DUCK__._scene;
                let maxMetal = 0, minRough = 1, count = 0;
                const bad = [];
                scene.traverse(o => {
                    if (!o.isMesh || !o.material) return;
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of mats) {
                        if (!m.isMeshStandardMaterial) continue;
                        count++;
                        if (m.metalness > maxMetal) maxMetal = m.metalness;
                        if (m.roughness < minRough) minRough = m.roughness;
                        if (m.metalness > 0.2201 || m.roughness < 0.2799) {
                            bad.push({ name: o.name, metal: m.metalness, rough: m.roughness });
                        }
                    }
                });
                return { count, maxMetal, minRough, bad };
            })()''')
            assert mat_audit['bad'] == [], f'Material violations: {mat_audit["bad"]}'
            st0 = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert st0['drawCalls'] <= 85, f'Initial drawCalls too high: {st0["drawCalls"]}'
            assert abs(st0['cameraRotZ']) < 1e-4, f'Camera roll non-zero: {st0["cameraRotZ"]}'
            await cdp.screenshot(CAP_DIR / '01_case1_penthouse_boot.png')
            print(f"  PASS (mats={mat_audit['count']}, maxMetal={mat_audit['maxMetal']:.2f}, minRough={mat_audit['minRough']:.2f}, calls={st0['drawCalls']})")

            # ---------------- G3: Full Gameplay Loop Across ALL 3 Cases + Skins + QUACK! ----------------
            print('[G3] Full Gameplay Loop Across All 3 Cases (Penthouse -> Interrogation -> Jewelry Store + Padlocks + Skins + QUACK!)...')
            # Case 1 Penthouse: Collect Plunger, Room Key, Wall Safe -> verify painting slides & code digits revealed
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.inspectClue('plunger');
                api.inspectClue('room_key');
                api.inspectClue('wall_safe');
                api.step(1/30, 30);
                api.render();
            })()''')
            st_c1 = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert set(st_c1['foundClues']) == {'plunger', 'room_key', 'wall_safe'}, f'Clues missing: {st_c1["foundClues"]}'
            assert st_c1['revealedMask'] == [True, True, True, True], f'Code digits not revealed: {st_c1["revealedMask"]}'
            painting_x = await cdp.eval('window.__ROBLOX_DUCK__._game.world.rooms[0].paintingMesh.position.x')
            assert painting_x > 1.5, f'Floral painting did not slide aside to reveal safe: x={painting_x}'

            # Open 4-digit Padlock & spin tumblers to [4][3][2][2]!
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.openPadlock();
                for (let k = 0; k < 4; k++) api.spinTumbler(0, 1);
                for (let k = 0; k < 3; k++) api.spinTumbler(1, 1);
                for (let k = 0; k < 2; k++) api.spinTumbler(2, 1);
                for (let k = 0; k < 1; k++) api.spinTumbler(3, 1); // Stop 1 shy to screenshot padlock!
                api.render();
            })()''')
            await cdp.screenshot(CAP_DIR / '02_padlock_4322.png')
            unlocked1 = await cdp.eval('window.__ROBLOX_DUCK__.spinTumbler(3, 1)')
            assert unlocked1 is True, 'Case 1 padlock [4][3][2][2] did not unlock!'
            st_lock = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert st_lock['padlockDigits'] == [4, 3, 2, 2] and st_lock['padlockUnlocked'] is True

            # Interrogate suspect + test gentle wrong accusation + accuse culprit Tyler The Vandal -> Star 1 + Rubber Duck skin!
            await cdp.eval('window.__ROBLOX_DUCK__.talkSuspect("barnaby"); window.__ROBLOX_DUCK__.openAccuseModal(); window.__ROBLOX_DUCK__.render();')
            await cdp.screenshot(CAP_DIR / '03_accuse_modal.png')
            wrong_res = await cdp.eval('window.__ROBLOX_DUCK__.accuseSuspect("barnaby")')
            assert wrong_res is False, 'Innocent suspect should return false with gentle hint!'
            right_res = await cdp.eval('window.__ROBLOX_DUCK__.accuseSuspect("tyler_p")')
            assert right_res is True, 'Correct culprit Tyler The Vandal failed!'
            st_win1 = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert st_win1['stars'] == 1, f'Expected 1 star after Case 1, got {st_win1["stars"]}'
            eq_rubber = await cdp.eval('window.__ROBLOX_DUCK__.equipSkin("rubber")')
            assert eq_rubber is True, 'Failed to equip unlocked Rubber Duck skin!'

            # Case 2: Precinct Interrogation Room
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.selectCase(1);
                api.step(1/30, 12);
                api.render();
            })()''')
            st_c2_boot = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert st_c2_boot['caseId'] == 'interrogation' and st_c2_boot['drawCalls'] <= 85, f'Case 2 boot failed: {st_c2_boot}'
            await cdp.screenshot(CAP_DIR / '04_case2_interrogation.png')
            c2_ok = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.inspectClue('chalkboard');
                api.inspectClue('mop_bucket');
                api.inspectClue('case_files');
                api.openPadlock();
                const code = [7, 1, 5, 9];
                for (let i = 0; i < 4; i++) {
                    for (let k = 0; k < code[i]; k++) api.spinTumbler(i, 1);
                }
                const unlocked = api.getState().padlockUnlocked;
                const accused = api.accuseSuspect('tyler_i');
                const golden = api.equipSkin('golden');
                return { unlocked, accused, golden, stars: api.getState().stars };
            })()''')
            assert c2_ok['unlocked'] and c2_ok['accused'] and c2_ok['golden'] and c2_ok['stars'] == 2, f'Case 2 failed: {c2_ok}'

            # Case 3: Jewelry Store Smash-and-Grab w/ Crashed White Getaway Van + QUACK! clue pulse!
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.equipSkin('mallard');
                api.selectCase(2);
                api.step(1/30, 12);
                api.triggerQuack();
                api.step(1/30, 5);
                api.render();
            })()''')
            st_c3 = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert st_c3['caseId'] == 'jewelry' and st_c3['drawCalls'] <= 85, f'Case 3 boot failed: {st_c3}'
            assert st_c3['quackCount'] >= 1 and st_c3['activeFxCount'] >= 10, f'QUACK! clue sparkle pulse failed: {st_c3}'
            await cdp.screenshot(CAP_DIR / '05_case3_jewelry_van_quack.png')

            c3_ok = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.inspectClue('crowbar');
                api.inspectClue('paint_splatter');
                api.inspectClue('getaway_van');
                api.openPadlock();
                const code = [8, 6, 4, 1];
                for (let i = 0; i < 4; i++) {
                    for (let k = 0; k < code[i]; k++) api.spinTumbler(i, 1);
                }
                const unlocked = api.getState().padlockUnlocked;
                const accused = api.accuseSuspect('viper');
                const monocle = api.equipSkin('monocle');
                return { unlocked, accused, monocle, stars: api.getState().stars };
            })()''')
            assert c3_ok['unlocked'] and c3_ok['accused'] and c3_ok['monocle'] and c3_ok['stars'] == 3, f'Case 3 failed: {c3_ok}'
            print('  PASS (All 3 cases solved, padlocks [4322]/[7159]/[8641] unlocked, Rubber/Golden/Monocle skins equipped, QUACK! sparkle pulse verified)')

            # ---------------- G4: Persistence Across Page.reload() ----------------
            print('[G4] Persistence Across Page.reload()...')
            pre = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            await cdp.send('Page.reload', {'ignoreCache': True})
            await wait_ready(cdp)
            await cdp.eval('window.__ROBLOX_DUCK__.step(1/60, 5); window.__ROBLOX_DUCK__.render();')
            post = await cdp.eval('window.__ROBLOX_DUCK__.getState()')
            assert post['stars'] == pre['stars'] == 3, f'Stars mismatch: {post["stars"]} vs {pre["stars"]}'
            assert post['equippedSkin'] == 'monocle', f'Skin not persisted: {post["equippedSkin"]}'
            assert post['caseIndex'] == pre['caseIndex'], f'Case index not persisted: {post["caseIndex"]}'
            assert post['padlockUnlocked'] is True, 'Padlock state not persisted!'
            print(f"  PASS (stars={post['stars']}, skin={post['equippedSkin']}, case={post['caseId']}, padlockUnlocked=True)")

            # ---------------- G5: 2,000-Frame Leak Soak ----------------
            print('[G5] 2,000-Frame Leak Soak (geos/texs/dom flat, drawCalls <= 85)...')
            soak = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.resetSave();
                // Warm lazy WebGL uploads across all 3 cases & 4 skins once
                for (let idx = 0; idx < 3; idx++) {
                    api.selectCase(idx);
                    api.step(1/60, 3);
                    api.render();
                }
                api.selectCase(0);
                api.render();
                const before = {
                    geos: api.rendererInfo.geometries,
                    texs: api.rendererInfo.textures,
                    dom: document.querySelectorAll('*').length,
                };
                let peakCalls = 0;
                for (let i = 0; i < 40; i++) {
                    api.setInput(Math.sin(i * 0.5), Math.cos(i * 0.5));
                    if (i % 10 === 0) api.triggerQuack();
                    api.step(1/60, 50); // 40 * 50 = 2,000 frames!
                    if (i % 8 === 0) {
                        api.render();
                        peakCalls = Math.max(peakCalls, api.rendererInfo.calls);
                    }
                }
                api.setInput(0, 0);
                api.step(1/60, 120); // Let FX & bubbles clear cleanly
                api.render();
                const after = {
                    geos: api.rendererInfo.geometries,
                    texs: api.rendererInfo.textures,
                    dom: document.querySelectorAll('*').length,
                    calls: api.rendererInfo.calls,
                };
                return { before, after, peakCalls };
            })()''')
            assert soak['after']['geos'] - soak['before']['geos'] <= 1, f'Geometry leak: {soak}'
            assert soak['after']['texs'] - soak['before']['texs'] <= 1, f'Texture leak: {soak}'
            assert soak['after']['dom'] - soak['before']['dom'] <= 6, f'DOM leak: {soak}'
            assert soak['peakCalls'] <= 85, f'Peak draw calls > 85: {soak["peakCalls"]}'
            print(f"  PASS (2,000 frames: geos {soak['before']['geos']}->{soak['after']['geos']}, texs {soak['before']['texs']}->{soak['after']['texs']}, dom {soak['before']['dom']}->{soak['after']['dom']}, peakCalls={soak['peakCalls']})")

            # ---------------- G6: 6-Viewport Responsive Overlap & Zero-Scrollbar Audit ----------------
            print('[G6] 6-Viewport Responsive Overlap & Zero-Scrollbar Audit...')
            viewports = [
                (1280, 800, False, False, '1280x800'),
                (1024, 768, False, True, 'ipad_1024x768'),
                (1180, 820, False, True, 'ipad_1180x820'),
                (768, 1024, False, True, 'ipad_768x1024'),
                (844, 390, True, True, '844x390'),
                (390, 844, True, True, '390x844'),
            ]
            overlap_js = '''(() => {
                const W = window.innerWidth, H = window.innerHeight;
                const sels = [
                    '#top-left-hud', '#top-right-hud', '#clue-log-panel',
                    '#subtitle-wrap', '#touch-stick-zone', '#touch-right-btns'
                ];
                const boxes = [];
                for (const sel of sels) {
                    const el = document.querySelector(sel);
                    if (!el) continue;
                    const cs = getComputedStyle(el);
                    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                    if (el.offsetParent === null && cs.position !== 'fixed') continue;
                    const r = el.getBoundingClientRect();
                    if (r.width < 2 || r.height < 2) continue;
                    boxes.push({ sel, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height });
                }
                const overlaps = [];
                for (let i = 0; i < boxes.length; i++) {
                    const a = boxes[i];
                    if (a.l < -2 || a.t < -2 || a.r > W + 2 || a.b > H + 2) {
                        overlaps.push(`OFFSCREEN ${a.sel} (${a.l.toFixed(0)},${a.t.toFixed(0)},${a.r.toFixed(0)},${a.b.toFixed(0)}) in ${W}x${H}`);
                    }
                    for (let j = i + 1; j < boxes.length; j++) {
                        const b = boxes[j];
                        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
                        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
                        if (ox > 2 && oy > 2) {
                            overlaps.push(`OVERLAP ${a.sel} x ${b.sel} (${ox.toFixed(0)}x${oy.toFixed(0)})`);
                        }
                    }
                }
                return {
                    overlaps,
                    sw: document.documentElement.scrollWidth,
                    iw: window.innerWidth,
                    sh: document.documentElement.scrollHeight,
                    ih: window.innerHeight,
                };
            })()'''

            for w, h, mob, touch, tag in viewports:
                await cdp.set_viewport(w, h, mob, touch)
                await cdp.eval('''(() => {
                    const api = window.__ROBLOX_DUCK__;
                    api.resetSave();
                    // Stand near Room Key so dynamic INSPECT button + Clue Log + Subtitle + Heartbeat are ALL active!
                    const g = api._game;
                    g.player.x = 3.2; g.player.z = 3.5;
                    g.ui.pushClueLog('🪠', 'Detective Duck found a Plunger!');
                    api.step(1/60, 4);
                    api.render();
                })()''')
                res = await cdp.eval(overlap_js)
                assert res['overlaps'] == [], f'{tag} HUD overlaps: {res["overlaps"]}'
                assert res['sw'] <= res['iw'] + 1 and res['sh'] <= res['ih'] + 1, f'{tag} scrollbars: {res}'
                if tag in ('1280x800', 'ipad_1024x768', 'ipad_1180x820', 'ipad_768x1024'):
                    pill_h = await cdp.eval('''(() => {
                        const els = Array.from(document.querySelectorAll('#roblox-topbar button'));
                        return Math.min(...els.map(e => e.getBoundingClientRect().height));
                    })()''')
                    assert pill_h >= 44, f'{tag} top-bar button height < 44px: {pill_h}'
                if tag in ('ipad_1024x768', 'ipad_768x1024', '390x844'):
                    await cdp.screenshot(CAP_DIR / f'06_resp_{tag}.png')

            print('  PASS (0 overlaps, 0 offscreen, 0 scrollbars across all 6 desktop/iPad/phone viewports!)')

            # ---------------- G7: Real CDP Input.dispatchTouchEvent iPad Multi-Touch & Zero-Runaway Gate ----------------
            print('[G7] Real CDP Input.dispatchTouchEvent iPad Touch, Multi-Touch, Zero-Runaway & Padlock Touch...')
            await cdp.set_viewport(1024, 768, False, True)
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.resetSave();
                const g = api._game;
                g.player.x = 0.0; g.player.z = 3.2;
                api.step(1/60, 4);
                api.render();
            })()''')

            # Verify touch auto-detected & large iPad targets
            ui_sizes = await cdp.eval('''(() => {
                const tcVis = !document.getElementById('touch-controls').classList.contains('hidden');
                const sr = document.getElementById('touch-stick-zone').getBoundingClientRect();
                const qr = document.getElementById('btn-touch-quack').getBoundingClientRect();
                const jr = document.getElementById('btn-touch-jump').getBoundingClientRect();
                return {
                    tcVis,
                    stick: { x: sr.left + sr.width/2, y: sr.top + sr.height/2, w: sr.width, r: sr.right },
                    quack: { x: qr.left + qr.width/2, y: qr.top + qr.height/2, w: qr.width },
                    jump:  { x: jr.left + jr.width/2, y: jr.top + jr.height/2, w: jr.width },
                };
            })()''')
            assert ui_sizes['tcVis'] is True, 'Touch controls did not auto-show on iPad 1024x768!'
            assert ui_sizes['stick']['w'] >= 130, f'iPad stick too small: {ui_sizes["stick"]}'
            assert ui_sizes['quack']['w'] >= 68 and ui_sizes['jump']['w'] >= 68, f'iPad buttons < 68px: {ui_sizes}'

            # 7a. Real CDP touchStart on stick pushed hard right + hold 4s -> 0.00 camera yaw drift!
            sx, sy = ui_sizes['stick']['x'], ui_sizes['stick']['y']
            qx, qy = ui_sizes['quack']['x'], ui_sizes['quack']['y']
            await cdp.dispatch_touch('touchStart', [{'x': sx, 'y': sy, 'id': 0}])
            await cdp.dispatch_touch('touchMove', [{'x': sx + 48, 'y': sy, 'id': 0}])
            cam_walk = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                const g = api._game;
                const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
                let camDrift = 0, prev = g.camYaw;
                const startX = g.player.x;
                for (let i = 0; i < 240; i++) {
                    api.step(1/60, 1);
                    camDrift += Math.abs(wrap(g.camYaw - prev));
                    prev = g.camYaw;
                }
                return { camDrift, movedX: Math.abs(g.player.x - startX), stickMag: Math.hypot(g.touchInput.x, g.touchInput.z) };
            })()''')
            assert cam_walk['stickMag'] > 0.7 and cam_walk['movedX'] > 2.0, f'Thumbstick did not move duck: {cam_walk}'
            assert cam_walk['camDrift'] < 0.001, f'Camera yaw drifted while walking sideways: {cam_walk["camDrift"]}'

            # 7b. REAL MULTI-TOUCH: While finger #0 STILL holds the stick, finger #1 taps QUACK!
            q_before = (await cdp.eval('window.__ROBLOX_DUCK__.getState()'))['quackCount']
            await cdp.dispatch_touch('touchStart', [
                {'x': sx + 48, 'y': sy, 'id': 0},
                {'x': qx, 'y': qy, 'id': 1},
            ])
            await cdp.dispatch_touch('touchEnd', [{'x': sx + 48, 'y': sy, 'id': 0}])
            q_after = (await cdp.eval('window.__ROBLOX_DUCK__.getState()'))['quackCount']
            assert q_after == q_before + 1, f'Second-finger QUACK! did not fire while holding thumbstick: {q_before}->{q_after}'

            # Release finger #0 -> duck stops cleanly with 0.00 drift!
            await cdp.dispatch_touch('touchEnd', [])
            stop_chk = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                const g = api._game;
                api.step(1/60, 10);
                const x0 = g.player.x, z0 = g.player.z;
                api.step(1/60, 60);
                return {
                    stickMag: Math.hypot(g.touchInput.x, g.touchInput.z),
                    speed: g.player.speed,
                    drift: Math.hypot(g.player.x - x0, g.player.z - z0),
                };
            })()''')
            assert stop_chk['stickMag'] == 0 and stop_chk['speed'] == 0 and stop_chk['drift'] < 0.001, f'Duck drifted after stick release: {stop_chk}'

            # 7c. touchCancel on canvas NEVER triggers tap-to-walk, and cancelled auto-walk drifts 0.00!
            await cdp.eval('''(() => {
                const g = window.__ROBLOX_DUCK__._game;
                g.player.x = 0.0; g.player.z = 5.5;
                g.setCameraOrbit(Math.PI, 0.36);
                g._updateCamera(1.0);
                window.__ROBLOX_DUCK__.render();
            })()''')
            key_pt = await cdp.eval('''(() => {
                const g = window.__ROBLOX_DUCK__._game;
                const r = g.canvas.getBoundingClientRect();
                const v = g._tapProjVec.set(4.1, 0.9, 3.1).project(g.camera);
                return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
            })()''')
            await cdp.dispatch_touch('touchStart', [{'x': key_pt['x'], 'y': key_pt['y'], 'id': 2}])
            await cdp.dispatch_touch('touchCancel', [])
            walk_after_cancel = (await cdp.eval('window.__ROBLOX_DUCK__.getState()'))['hasWalkTarget']
            assert walk_after_cancel is False, 'touchCancel wrongly triggered tap-to-walk!'

            # Real tap -> starts walkTarget -> new pointerdown cancels immediately with 0.00 drift!
            await cdp.dispatch_touch('touchStart', [{'x': key_pt['x'], 'y': key_pt['y'], 'id': 3}])
            await cdp.dispatch_touch('touchEnd', [])
            started_walk = (await cdp.eval('window.__ROBLOX_DUCK__.getState()'))['hasWalkTarget']
            assert started_walk is True, 'Direct tap on Room Key did not start tap-to-walk!'
            await cdp.eval('window.__ROBLOX_DUCK__.step(1/60, 8);')
            # Tap empty center-top to cancel auto-walk!
            await cdp.dispatch_touch('touchStart', [{'x': 512, 'y': 220, 'id': 4}])
            await cdp.dispatch_touch('touchEnd', [])
            cancel_drift = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                const g = api._game;
                const wt = Boolean(g.walkTarget);
                const x0 = g.player.x, z0 = g.player.z;
                api.step(1/60, 60);
                return { wt, drift: Math.hypot(g.player.x - x0, g.player.z - z0) };
            })()''')
            assert cancel_drift['wt'] is False and cancel_drift['drift'] < 0.001, f'Cancelled auto-walk kept drifting: {cancel_drift}'

            # 7d. Real CDP touch on Padlock tumblers (>=56px) unlocks [4][3][2][2]!
            await cdp.eval('window.__ROBLOX_DUCK__.openPadlock(); window.__ROBLOX_DUCK__.render();')
            tumbler_pts = await cdp.eval('''(() => {
                const btns = Array.from(document.querySelectorAll('.tumbler-up'));
                return btns.map(b => {
                    const r = b.getBoundingClientRect();
                    return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
                });
            })()''')
            assert len(tumbler_pts) == 4 and all(p['w'] >= 56 and p['h'] >= 56 for p in tumbler_pts), f'Tumbler arrows < 56px: {tumbler_pts}'
            code_c1 = [4, 3, 2, 2]
            for idx, taps in enumerate(code_c1):
                pt = tumbler_pts[idx]
                for t in range(taps):
                    tid = 20 + idx * 10 + t
                    await cdp.dispatch_touch('touchStart', [{'x': round(pt['x']), 'y': round(pt['y']), 'id': tid}])
                    await cdp.dispatch_touch('touchEnd', [])
            touch_state = await cdp.eval(f'''(() => {{
                const st = window.__ROBLOX_DUCK__.getState();
                const el0 = document.elementFromPoint({round(tumbler_pts[0]['x'])}, {round(tumbler_pts[0]['y'])});
                return {{ digits: st.padlockDigits, unlocked: st.padlockUnlocked, modal: st.activeModal, hitTag: el0 ? el0.className : null }};
            }})()''')
            assert touch_state['unlocked'] is True, f'Real CDP touch taps on padlock tumblers did not unlock [4][3][2][2]: {touch_state} pts={tumbler_pts}'
            await cdp.screenshot(CAP_DIR / '07_ipad_padlock_unlocked.png')

            # 7e. Slow-press (650ms hold) on top-bar modal buttons & UNLOCK must NEVER self-close on release!
            await cdp.eval('window.__ROBLOX_DUCK__._game.ui.closeModals(); window.__ROBLOX_DUCK__.render();')
            for btn_id, expected_modal in [
                ('btn-cases', 'cases'),
                ('btn-notebook', 'notebook'),
                ('btn-accuse-top', 'accuse'),
                ('btn-wardrobe', 'wardrobe'),
            ]:
                pt = await cdp.eval(f'''(() => {{
                    const r = document.getElementById("{btn_id}").getBoundingClientRect();
                    return {{ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }};
                }})()''')
                await cdp.dispatch_touch('touchStart', [{'x': pt['x'], 'y': pt['y'], 'id': 80}])
                await asyncio.sleep(0.65)
                await cdp.dispatch_touch('touchEnd', [])
                await asyncio.sleep(0.08)
                st_m = await cdp.eval('window.__ROBLOX_DUCK__.getState().activeModal')
                assert st_m == expected_modal, f'650ms slow press on {btn_id} self-closed modal! got={st_m}'
                # Tap backdrop intentionally after >450ms -> must close cleanly!
                await cdp.dispatch_touch('touchStart', [{'x': 24, 'y': 380, 'id': 81}])
                await cdp.dispatch_touch('touchEnd', [])
                await asyncio.sleep(0.05)
                st_closed = await cdp.eval('window.__ROBLOX_DUCK__.getState().activeModal')
                assert st_closed is None, f'Backdrop pointerdown failed to close {expected_modal}: {st_closed}'

            # Slow press on touch UNLOCK button next to padlock
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                const g = api._game;
                api.resetSave();
                g.player.x = 7.4; g.player.z = -5.4;
                api.step(1/60, 4);
                api.render();
            })()''')
            act_pt = await cdp.eval('''(() => {
                const r = document.getElementById('btn-touch-action').getBoundingClientRect();
                return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
            })()''')
            await cdp.dispatch_touch('touchStart', [{'x': act_pt['x'], 'y': act_pt['y'], 'id': 82}])
            await asyncio.sleep(0.65)
            await cdp.dispatch_touch('touchEnd', [])
            await asyncio.sleep(0.08)
            st_pl = await cdp.eval('window.__ROBLOX_DUCK__.getState().activeModal')
            assert st_pl == 'padlock', f'650ms slow press on UNLOCK button self-closed padlock! got={st_pl}'
            await cdp.eval('window.__ROBLOX_DUCK__._game.ui.closeModals();')

            # 7f. Rendered camera yaw drift < 0.001 rad across ALL 3 cases (default & orbited views!)
            rendered_yaw_chk = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                const g = api._game;
                const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
                const getRenderedYaw = () => {
                    const fwd = new window.__ROBLOX_DUCK__._camera.position.constructor();
                    g.camera.getWorldDirection(fwd);
                    return Math.atan2(fwd.x, fwd.z);
                };
                const results = [];
                for (let cIdx = 0; cIdx < 3; cIdx++) {
                    for (const yawOff of [0, 0.85, -1.1]) {
                        api.selectCase(cIdx);
                        api.setCameraOrbit(g.camYaw + yawOff, 0.36);
                        g.touchInput.x = 1.0; g.touchInput.z = 0.0;
                        let maxDrift = 0;
                        const initYaw = getRenderedYaw();
                        for (let i = 0; i < 240; i++) {
                            api.step(1/60, 1);
                            const ry = getRenderedYaw();
                            maxDrift = Math.max(maxDrift, Math.abs(wrap(ry - initYaw)), Math.abs(wrap(ry - g.camYaw)));
                        }
                        g.touchInput.x = 0; g.touchInput.z = 0;
                        results.push({ cIdx, yawOff, maxDrift });
                    }
                }
                return results;
            })()''')
            max_ry_drift = max(r['maxDrift'] for r in rendered_yaw_chk)
            assert max_ry_drift < 0.001, f'Rendered camera yaw drifted >= 0.001 rad: {rendered_yaw_chk}'

            # 7g. Case 2 tap-to-walk obstacle detour around round table -> Chalkboard & seated Tyler!
            c2_detour = await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                const g = api._game;
                api.selectCase(1);
                g.setCameraOrbit(Math.PI, 0.38);
                g._updateCamera(1.0);
                api.render();
                const rect = g.canvas.getBoundingClientRect();
                const proj = (x, y, z) => {
                    const v = g._tapProjVec.set(x, y, z).project(g.camera);
                    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
                };

                // Tap Evidence Chalkboard (0, 2.45, -7.4) directly across center round table!
                const cp = proj(0.0, 2.45, -7.4);
                g.handleCanvasClick(cp.x, cp.y);
                for (let i = 0; i < 240; i++) {
                    api.step(1/60, 1);
                    if (api.getState().foundClues.includes('chalkboard')) break;
                }
                const foundChalk = api.getState().foundClues.includes('chalkboard');

                // Reset to spawn and tap seated Tyler The Vandal (0, 1.35, -1.65) across center round table!
                api.selectCase(1);
                g.setCameraOrbit(Math.PI, 0.38);
                g._updateCamera(1.0);
                api.render();
                const tp = proj(0.0, 1.35, -1.65);
                g.handleCanvasClick(tp.x, tp.y);
                for (let i = 0; i < 240; i++) {
                    api.step(1/60, 1);
                    if (api.getState().activeModal === 'suspect') break;
                }
                const talkedTyler = api.getState().activeModal === 'suspect';
                g.ui.closeModals();
                return { foundChalk, talkedTyler };
            })()''')
            assert c2_detour['foundChalk'] and c2_detour['talkedTyler'], f'Case 2 obstacle detour failed: {c2_detour}'

            print(f'  PASS (CDP stick hold 4s 0.00 cam drift, renderedYawDrift={max_ry_drift:.6f}<0.001 across all 3 cases, 2nd-finger QUACK!, 650ms slow-press modals stay open, Case 2 table detour OK, 56px padlock touch unlock!)')

            # ---------------- Hero 1280x800 screenshot.jpg ----------------
            await cdp.set_viewport(1280, 800, False, False)
            await cdp.eval('''(() => {
                const api = window.__ROBLOX_DUCK__;
                api.resetSave();
                const g = api._game;
                // Hero composition: Detective Duck waddling on Penthouse checkerboard floor near cracked safe, floral painting, plunger & suspects!
                g.inspectClue('plunger');
                g.inspectClue('wall_safe');
                g.ui.clearFloatPops();
                g.player.x = -0.8; g.player.z = 2.6; g.player.yaw = 0.35;
                g.setCameraOrbit(Math.PI + 0.16, 0.34);
                g._updateCamera(1.0);
                api.step(1/30, 35);
                g.setSubtitle('Someone cracked the safe. Inspect the room closely!');
                api.render();
            })()''')
            await asyncio.sleep(0.10)
            hero_png = CAP_DIR / 'hero_1280x800.png'
            await cdp.screenshot(hero_png)
            Image.open(hero_png).convert('RGB').save(ROOT / 'screenshot.jpg', quality=92)
            # Clean fresh save for players
            await cdp.eval('window.__ROBLOX_DUCK__.resetSave();')

            assert cdp.js_exceptions == [], f'JS exceptions: {cdp.js_exceptions}'
            assert cdp.console_errors == [], f'Console errors: {cdp.console_errors}'
            assert cdp.failed_requests == [], f'Failed requests: {cdp.failed_requests}'
            assert QuietHandler.bad_requests == [], f'HTTP >=400 requests: {QuietHandler.bad_requests}'

            await cdp.close()
            print('\nALL 7 GATES PASSED WITH 0 ERRORS!')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        server.shutdown()
        shutil.rmtree(CHROME_PROFILE, ignore_errors=True)


if __name__ == '__main__':
    asyncio.run(run_all_gates())
