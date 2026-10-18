import * as THREE from 'three';

const STORAGE = { highScore: 'er_high_score', totalGold: 'er_total_gold', audioOn: 'er_audio_on' };
function loadNum(key) { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } }
function saveNum(key, v) { try { localStorage.setItem(key, String(v)); } catch {} }
function loadBool(key, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === '1' || value === 'true';
  } catch {
    return fallback;
  }
}
function saveBool(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch {} }

const $ = (id) => document.getElementById(id);
const startMenu = $('start-menu');
const gameOverScreen = $('game-over');
const hud = $('hud');
const controlsModal = $('controls-modal');
const pauseModal = $('pause-modal');
const newRecordBadge = $('new-record-badge');
const touchPad = $('touch-pad');
const audioToggleButton = $('btn-audio-toggle');
const pauseButton = $('btn-pause-game');

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const isMobile = isTouch || window.matchMedia('(max-width: 900px)').matches;
const LOW = isMobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
let audioEnabled = loadBool(STORAGE.audioOn, true);

function updateAudioButtonUI() {
  if (!audioToggleButton) return;
  const isOn = audioEnabled;
  audioToggleButton.innerHTML = `<span class="btn-icon">${isOn ? '🔊' : '🔇'}</span> ${isOn ? 'SOUND ON' : 'SOUND OFF'}`;
  audioToggleButton.setAttribute('aria-pressed', String(isOn));
}

$('menu-high-score').textContent = loadNum(STORAGE.highScore);
$('menu-total-coins').textContent = '🪙 ' + loadNum(STORAGE.totalGold);
updateAudioButtonUI();

let audioCtx = null;
function ensureAudio() {
  if (!audioEnabled) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function noiseBurst(dur = 0.12, vol = 0.1) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(ctx.destination);
  src.start();
}
const SFX = {
  jump: () => { tone(320, 0.12, 'square', 0.07, 520); },
  slide: () => { tone(180, 0.1, 'triangle', 0.06, 90); },
  coin: () => { tone(880, 0.08, 'sine', 0.07); setTimeout(() => tone(1320, 0.1, 'sine', 0.06), 40); },
  hit: () => { noiseBurst(0.18, 0.14); tone(120, 0.25, 'sawtooth', 0.1, 40); },
  start: () => { tone(440, 0.1, 'sine', 0.06); setTimeout(() => tone(660, 0.12, 'sine', 0.06), 80); },
};

const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance', alpha: false });
const maxPR = LOW ? 1.25 : 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = !LOW;
if (!LOW) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
scene.fog = new THREE.Fog(0x0a0a0c, LOW ? 14 : 18, LOW ? 50 : 70);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.2, 8);
camera.lookAt(0, 1.5, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffe6a0, 1.1);
sun.position.set(6, 14, 4);
if (!LOW) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
}
scene.add(sun);
const rim = new THREE.DirectionalLight(0x6080ff, 0.3);
rim.position.set(-4, 3, -6);
scene.add(rim);
const goldLight = new THREE.PointLight(0xf5c518, 0.5, 18);
goldLight.position.set(0, 3, 2);
scene.add(goldLight);

const matPath = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.9 });
const matPathEdge = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.4, metalness: 0.7, emissive: 0x3a2a00, emissiveIntensity: 0.3 });
const matRock = new THREE.MeshStandardMaterial({ color: 0x4a453c, roughness: 0.95 });
const matCoin = new THREE.MeshStandardMaterial({ color: 0xf5c518, metalness: 0.9, roughness: 0.25, emissive: 0x5a4000, emissiveIntensity: 0.4 });
const matShield = new THREE.MeshStandardMaterial({ color: 0x55dfff, metalness: 0.45, roughness: 0.25, emissive: 0x087b9a, emissiveIntensity: 0.8 });
const matMagnet = new THREE.MeshStandardMaterial({ color: 0xff65d4, metalness: 0.4, roughness: 0.25, emissive: 0x9a176f, emissiveIntensity: 0.8 });
const powerUpOrb = new THREE.SphereGeometry(0.38, LOW ? 10 : 16, LOW ? 8 : 12);
const powerUpRing = new THREE.TorusGeometry(0.52, 0.07, 6, LOW ? 12 : 20);
const matSkin = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.65 });
const matShirt = new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.7 });
const matPants = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.8 });
const matHair = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 });
const matShoe = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

const LANES = [-2.2, 0, 2.2];
const pathGroup = new THREE.Group();
scene.add(pathGroup);

function makePathSegment(z) {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 20), matPath);
  floor.position.y = -0.15;
  if (!LOW) floor.receiveShadow = true;
  g.add(floor);
  [-4.1, 4.1].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 20), matPathEdge);
    rail.position.set(x, 0.05, 0); g.add(rail);
  });
  [-4.5, 4.5].forEach((x) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 20), matRock);
    wall.position.set(x, 1, 0); g.add(wall);
  });
  g.position.z = z; return g;
}
const segments = [];
for (let i = 0; i < (LOW ? 6 : 8); i++) {
  const seg = makePathSegment(-i * 20);
  pathGroup.add(seg); segments.push(seg);
}

function createRunner() {
  const root = new THREE.Group();
  const seg = LOW ? 6 : 12;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, seg), matShirt);
  torso.position.y = 1.15; if (!LOW) torso.castShadow = true; root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, seg, seg), matSkin);
  head.position.y = 1.72; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), matHair);
  hair.position.y = 1.78; hair.rotation.x = -0.15; root.add(hair);
  const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat); leftEye.position.set(-0.07, 1.74, 0.18); root.add(leftEye);
  const rightEye = leftEye.clone(); rightEye.position.x = 0.07; root.add(rightEye);
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.4, 3, 6);
  const leftArm = new THREE.Mesh(armGeo, matSkin); leftArm.position.set(-0.4, 1.25, 0); root.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, matSkin); rightArm.position.set(0.4, 1.25, 0); root.add(rightArm);
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.45, 3, 6);
  const leftLeg = new THREE.Mesh(legGeo, matPants); leftLeg.position.set(-0.14, 0.45, 0); root.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, matPants); rightLeg.position.set(0.14, 0.45, 0); root.add(rightLeg);
  const shoeGeo = new THREE.BoxGeometry(0.16, 0.1, 0.28);
  const leftShoe = new THREE.Mesh(shoeGeo, matShoe); leftShoe.position.set(-0.14, 0.08, 0.04); root.add(leftShoe);
  const rightShoe = new THREE.Mesh(shoeGeo, matShoe); rightShoe.position.set(0.14, 0.08, 0.04); root.add(rightShoe);
  root.userData = { leftArm, rightArm, leftLeg, rightLeg, leftShoe, rightShoe, torso, head };
  return root;
}
const runner = createRunner();
scene.add(runner);

const BASE_SPEED = 10;
const MAX_SPEED = 28;
function speedFromDistance(d) {
  const t = d / 400;
  return Math.min(MAX_SPEED, BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-t)));
}
function spawnGap(d) {
  return Math.max(6.5, 14 - d * 0.012);
}

const state = {
  playing: false, speed: BASE_SPEED, lane: 1, targetX: 0, y: 0, vy: 0,
  jumping: false, sliding: false, slideTimer: 0, distance: 0, score: 0, coins: 0,
  combo: 1, comboTimer: 0, clock: 0, obstacles: [], coins3d: [], powerUps: [],
  shieldActive: false, magnetTimer: 0, dead: false,
  nextSpawnZ: -30, lastLane: 1, paused: false
};

function clearWorld() {
  [...state.obstacles, ...state.coins3d, ...state.powerUps].forEach((o) => scene.remove(o.mesh));
  state.obstacles = []; state.coins3d = []; state.powerUps = [];
}

function createPowerUp(type, lane, z) {
  const mesh = new THREE.Group();
  const material = type === 'shield' ? matShield : matMagnet;
  const orb = new THREE.Mesh(powerUpOrb, material);
  const ring = new THREE.Mesh(powerUpRing, material);
  ring.rotation.x = Math.PI / 2;
  mesh.add(orb, ring);
  mesh.position.set(LANES[lane], 1.15, z);
  scene.add(mesh);
  state.powerUps.push({ mesh, type, z });
}

function spawnStuffAt(z, forceObs = false) {
  let lane = Math.floor(Math.random() * 3);
  if (lane === state.lastLane && Math.random() < 0.55) lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
  state.lastLane = lane;
  const obsChance = Math.min(0.72, 0.35 + state.distance * 0.0004);
  const wantObs = forceObs || Math.random() < obsChance;
  if (wantObs) {
    const tall = Math.random() > 0.42;
    const geo = tall ? new THREE.BoxGeometry(1.1, 1.5, 1.1) : new THREE.BoxGeometry(1.2, 0.75, 1.2);
    const mesh = new THREE.Mesh(geo, matRock);
    mesh.position.set(LANES[lane], tall ? 0.75 : 0.38, z);
    scene.add(mesh);
    state.obstacles.push({ mesh, lane, type: tall ? 'high' : 'low', z });
    if (state.distance > 180 && Math.random() < 0.28) {
      let lane2 = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      const tall2 = Math.random() > 0.5;
      const geo2 = tall2 ? new THREE.BoxGeometry(1.1, 1.5, 1.1) : new THREE.BoxGeometry(1.2, 0.75, 1.2);
      const mesh2 = new THREE.Mesh(geo2, matRock);
      mesh2.position.set(LANES[lane2], tall2 ? 0.75 : 0.38, z - 2.5);
      scene.add(mesh2);
      state.obstacles.push({ mesh: mesh2, lane: lane2, type: tall2 ? 'high' : 'low', z: z - 2.5 });
    }
  } else if (Math.random() < 0.16) {
    createPowerUp(Math.random() < 0.5 ? 'shield' : 'magnet', lane, z);
  } else {
    const n = LOW ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, LOW ? 10 : 16), matCoin);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(LANES[lane], 1.15, z - i * 1.3);
      scene.add(mesh);
      state.coins3d.push({ mesh, lane, z: z - i * 1.3, taken: false });
    }
  }
}

function showTouchPad(show) {
  if (!touchPad) return;
  if (show && isTouch) {
    touchPad.classList.remove('hidden');
    touchPad.setAttribute('aria-hidden', 'false');
  } else {
    touchPad.classList.add('hidden');
    touchPad.setAttribute('aria-hidden', 'true');
  }
}

function setAudioEnabled(nextValue) {
  audioEnabled = !!nextValue;
  saveBool(STORAGE.audioOn, audioEnabled);
  updateAudioButtonUI();
  if (audioEnabled) ensureAudio();
}

function setPaused(paused) {
  if (!state.playing || state.dead) return;
  state.paused = !!paused;
  pauseModal.classList.toggle('hidden', !state.paused);
  if (state.paused) {
    hud.classList.add('hidden');
    showTouchPad(false);
  } else {
    hud.classList.remove('hidden');
    showTouchPad(true);
  }
}

function resetGame() {
  ensureAudio();
  SFX.start();
  state.playing = true; state.dead = false; state.paused = false;
  state.speed = BASE_SPEED;
  state.lane = 1; state.targetX = LANES[1]; state.y = 0; state.vy = 0;
  state.jumping = false; state.sliding = false; state.slideTimer = 0;
  state.distance = 0; state.score = 0; state.coins = 0; state.combo = 1; state.comboTimer = 0; state.clock = 0;
  state.shieldActive = false; state.magnetTimer = 0;
  state.nextSpawnZ = -28; state.lastLane = 1;
  runner.position.set(0, 0, 0); runner.scale.set(1, 1, 1); runner.rotation.x = 0;
  clearWorld();
  segments.forEach((s, i) => { s.position.z = -i * 20; });
  for (let i = 0; i < 5; i++) {
    spawnStuffAt(state.nextSpawnZ, i % 2 === 0);
    state.nextSpawnZ -= spawnGap(0);
  }
  pauseModal.classList.add('hidden');
  updateHud();
  showTouchPad(true);
}

function changeLane(dir) {
  if (!state.playing || state.paused || state.dead) return;
  const next = Math.max(0, Math.min(2, state.lane + dir));
  if (next === state.lane) return;
  state.lane = next; state.targetX = LANES[next];
}
function jump() {
  if (!state.playing || state.paused || state.dead) return;
  if (state.jumping || state.sliding) return;
  state.jumping = true; state.vy = 9.5;
  SFX.jump();
}
function slide() {
  if (!state.playing || state.paused || state.dead) return;
  if (state.jumping || state.sliding) return;
  state.sliding = true; state.slideTimer = 0.55;
  SFX.slide();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (state.playing && !state.dead) setPaused(!state.paused);
    return;
  }
  if (!state.playing || state.paused || state.dead) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') changeLane(-1);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') changeLane(1);
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') jump();
  if (e.code === 'ArrowDown' || e.code === 'KeyS') slide();
  e.preventDefault();
});

let touchStartX = 0, touchStartY = 0, touchStartT = 0;
function onTouchStart(e) {
  if (e.target.closest && e.target.closest('.touch-btn, button')) return;
  const t = e.changedTouches[0];
  touchStartX = t.clientX; touchStartY = t.clientY; touchStartT = performance.now();
}
function onTouchEnd(e) {
  if (!state.playing || state.paused || state.dead) return;
  if (e.target.closest && e.target.closest('.touch-btn, button')) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
  const dt = performance.now() - touchStartT;
  if (dt > 500) return;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if (absX < 24 && absY < 24) return;
  if (absX > absY) changeLane(dx > 0 ? 1 : -1);
  else if (dy < 0) jump(); else slide();
}
window.addEventListener('touchstart', onTouchStart, { passive: true });
window.addEventListener('touchend', onTouchEnd, { passive: true });

if (touchPad) {
  touchPad.querySelectorAll('.touch-btn').forEach((btn) => {
    const act = btn.dataset.action;
    const fire = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!state.playing || state.paused || state.dead) return;
      if (act === 'left') changeLane(-1);
      if (act === 'right') changeLane(1);
      if (act === 'jump') jump();
      if (act === 'slide') slide();
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('mousedown', fire);
  });
}

$('btn-play').addEventListener('click', () => {
  ensureAudio();
  startMenu.classList.remove('active'); startMenu.classList.add('hidden');
  gameOverScreen.classList.add('hidden'); hud.classList.remove('hidden'); resetGame();
});
$('btn-retry').addEventListener('click', () => {
  ensureAudio();
  gameOverScreen.classList.add('hidden'); hud.classList.remove('hidden'); resetGame();
});
$('btn-go-menu').addEventListener('click', () => {
  gameOverScreen.classList.add('hidden'); hud.classList.add('hidden');
  showTouchPad(false);
  pauseModal.classList.add('hidden');
  startMenu.classList.remove('hidden'); startMenu.classList.add('active');
  state.playing = false; state.paused = false; state.dead = false;
  $('menu-high-score').textContent = loadNum(STORAGE.highScore);
  $('menu-total-coins').textContent = '🪙 ' + loadNum(STORAGE.totalGold);
});
$('btn-controls').addEventListener('click', () => controlsModal.classList.remove('hidden'));
$('btn-close-controls').addEventListener('click', () => controlsModal.classList.add('hidden'));
$('btn-controls-ok').addEventListener('click', () => controlsModal.classList.add('hidden'));
$('btn-audio-toggle').addEventListener('click', () => {
  setAudioEnabled(!audioEnabled);
});
$('btn-pause-game').addEventListener('click', () => {
  setPaused(!state.paused);
});
$('btn-resume').addEventListener('click', () => setPaused(false));
$('btn-quit-menu').addEventListener('click', () => {
  setPaused(false);
  state.playing = false; state.dead = false; state.paused = false;
  hud.classList.add('hidden');
  showTouchPad(false);
  pauseModal.classList.add('hidden');
  startMenu.classList.remove('hidden'); startMenu.classList.add('active');
  $('menu-high-score').textContent = loadNum(STORAGE.highScore);
  $('menu-total-coins').textContent = '🪙 ' + loadNum(STORAGE.totalGold);
});

function updateHud() {
  $('hud-score-val').textContent = Math.floor(state.score);
  $('hud-coins-val').textContent = '🪙 ' + state.coins;
  $('hud-dist-val').textContent = Math.floor(state.distance) + 'm';
  const comboMultiplier = Math.max(1, Math.min(9, Math.floor(state.combo / 4) + 1));
  $('hud-combo-val').textContent = 'x' + comboMultiplier;
  const powerUpValue = $('hud-powerup-val');
  const powerUpHud = $('hud-powerup');
  const activePowerUps = [];
  if (state.shieldActive) activePowerUps.push('SHIELD');
  if (state.magnetTimer > 0) activePowerUps.push('MAGNET ' + Math.ceil(state.magnetTimer) + 's');
  powerUpValue.textContent = activePowerUps.length ? activePowerUps.join(' · ') : 'NONE';
  powerUpHud.classList.toggle('powerup-active', activePowerUps.length > 0);
}

function die(reason) {
  if (state.dead) return;
  state.dead = true; state.playing = false; state.paused = false;
  SFX.hit();
  hud.classList.add('hidden'); showTouchPad(false);
  const score = Math.floor(state.score);
  const high = loadNum(STORAGE.highScore);
  const isNew = score > high;
  if (isNew) saveNum(STORAGE.highScore, score);
  saveNum(STORAGE.totalGold, loadNum(STORAGE.totalGold) + state.coins);
  $('go-score').textContent = score;
  $('go-coins').textContent = '🪙 ' + state.coins;
  $('go-distance').textContent = Math.floor(state.distance) + 'm';
  $('game-over-reason').textContent = reason || 'You hit an obstacle';
  newRecordBadge.classList.toggle('hidden', !isNew);
  gameOverScreen.classList.remove('hidden');
}

function animateRunner() {
  const u = runner.userData;
  const runRate = 12 + (state.speed - BASE_SPEED) * 0.25;
  const runCycle = Math.sin(state.clock * runRate);
  if (state.sliding) {
    runner.scale.y = 0.55;
    u.leftArm.rotation.x = -0.8; u.rightArm.rotation.x = -0.8;
    u.leftLeg.rotation.x = 0.3; u.rightLeg.rotation.x = 0.3;
  } else {
    runner.scale.y = 1;
    const swing = runCycle * 0.7;
    u.leftArm.rotation.x = swing; u.rightArm.rotation.x = -swing;
    u.leftLeg.rotation.x = -swing * 0.9; u.rightLeg.rotation.x = swing * 0.9;
    u.torso.position.y = 1.15 + Math.abs(runCycle) * 0.03;
    u.head.position.y = 1.72 + Math.abs(runCycle) * 0.03;
  }
  runner.position.y = state.y;
  runner.rotation.z = -(state.targetX - runner.position.x) * 0.15;
}

function checkCollisions() {
  const px = runner.position.x, py = state.y, sliding = state.sliding;
  for (const o of state.obstacles) {
    if (o.z < -1 || o.z > 2.2) continue;
    if (Math.abs(o.mesh.position.x - px) > 0.95) continue;
    const hitLowObstacle = o.type === 'low' && py < 0.85;
    const hitHighObstacle = o.type === 'high' && !sliding && py < 0.3;
    if (hitLowObstacle || hitHighObstacle) {
      if (!state.shieldActive) {
        die(hitLowObstacle ? 'Tripped over a rock' : 'Hit a barrier');
        return;
      }
      state.shieldActive = false;
      o.mesh.position.z = 13;
      o.z = 13;
      break;
    }
  }
  for (const c of state.coins3d) {
    if (c.taken) continue;
    if (c.z < -0.5 || c.z > 2) continue;
    if (Math.abs(c.mesh.position.x - px) < 0.75 && c.z > -0.3 && c.z < 1.8) {
      c.taken = true; state.coins += 1; state.combo += 1; state.comboTimer = 2.4; scene.remove(c.mesh);
      SFX.coin();
    }
  }
  for (const powerUp of state.powerUps) {
    if (powerUp.taken || powerUp.z < -0.5 || powerUp.z > 2) continue;
    if (Math.abs(powerUp.mesh.position.x - px) > 0.8) continue;
    powerUp.taken = true;
    scene.remove(powerUp.mesh);
    if (powerUp.type === 'shield') {
      state.shieldActive = true;
      tone(520, 0.16, 'sine', 0.07, 900);
    } else {
      state.magnetTimer = 8;
      tone(660, 0.16, 'sine', 0.07, 1040);
    }
  }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.playing && !state.dead) {
    if (state.paused) {
      animateRunner();
      renderer.render(scene, camera);
      return;
    }

    state.clock += dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 1;
    }
    if (state.magnetTimer > 0) state.magnetTimer = Math.max(0, state.magnetTimer - dt);
    state.speed = speedFromDistance(state.distance);
    state.distance += state.speed * dt;
    const comboMultiplier = Math.max(1, Math.min(9, Math.floor(state.combo / 4) + 1));
    state.score = state.distance * 2 + state.coins * 10 + (state.combo - 1) * 24 * comboMultiplier;
    const move = state.speed * dt;
    const loopLen = segments.length * 20;
    segments.forEach((s) => { s.position.z += move; if (s.position.z > 20) s.position.z -= loopLen; });
    runner.position.x += (state.targetX - runner.position.x) * Math.min(1, 12 * dt);
    if (state.jumping) {
      state.vy -= 28 * dt; state.y += state.vy * dt;
      if (state.y <= 0) { state.y = 0; state.vy = 0; state.jumping = false; }
    }
    if (state.sliding) { state.slideTimer -= dt; if (state.slideTimer <= 0) state.sliding = false; }
    animateRunner();
    for (const o of state.obstacles) { o.mesh.position.z += move; o.z = o.mesh.position.z; }
    for (const c of state.coins3d) {
      c.mesh.position.z += move;
      c.z = c.mesh.position.z;
      c.mesh.rotation.z += dt * 3;
      if (state.magnetTimer > 0 && c.z > -14 && c.z < 3) {
        c.mesh.position.x += (runner.position.x - c.mesh.position.x) * Math.min(1, 6 * dt);
      }
    }
    for (const powerUp of state.powerUps) {
      powerUp.mesh.position.z += move;
      powerUp.z = powerUp.mesh.position.z;
      powerUp.mesh.rotation.y += dt * 2.5;
      powerUp.mesh.position.y = 1.15 + Math.sin(state.clock * 3 + powerUp.z) * 0.08;
    }
    state.obstacles = state.obstacles.filter((o) => { if (o.z > 12) { scene.remove(o.mesh); return false; } return true; });
    state.coins3d = state.coins3d.filter((c) => { if (c.z > 12 || c.taken) { if (!c.taken) scene.remove(c.mesh); return false; } return true; });
    state.powerUps = state.powerUps.filter((p) => { if (p.z > 12 || p.taken) { if (!p.taken) scene.remove(p.mesh); return false; } return true; });
    state.nextSpawnZ += move;
    while (state.nextSpawnZ > -45) {
      const gap = spawnGap(state.distance);
      state.nextSpawnZ -= gap;
      spawnStuffAt(state.nextSpawnZ);
    }
    checkCollisions();
    updateHud();
    camera.position.x += (runner.position.x * 0.35 - camera.position.x) * 0.08;
    camera.position.y = 4.2 + state.y * 0.15;
    camera.lookAt(runner.position.x * 0.3, 1.2 + state.y * 0.3, -4);
  } else if (!state.playing) {
    state.clock += dt; animateRunner(); runner.position.y = Math.sin(state.clock * 2) * 0.05;
  }
  renderer.render(scene, camera);
}

for (let i = 0; i < 4; i++) spawnStuffAt(-22 - i * 14);
animateRunner();
tick();

document.body.addEventListener('touchmove', (e) => {
  if (state.playing) e.preventDefault();
}, { passive: false });
