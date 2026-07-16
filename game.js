const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = canvas.width, VH = canvas.height;

const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
const MM_W = mmCanvas.width, MM_H = mmCanvas.height;

let WORLD_W = 2600, WORLD_H = 1900;

const healthBar = document.getElementById('healthBar');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const stageEl = document.getElementById('stage');
const remainingEl = document.getElementById('remaining');
const biomeEl = document.getElementById('biome');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const restartBtn = document.getElementById('restartBtn');

const bossBar = document.getElementById('bossBar');
const bossBarFill = document.getElementById('bossBarFill');

const menuOverlay = document.getElementById('menuOverlay');
const levelButtons = document.querySelectorAll('.levelBtn');
const continueBtn = document.getElementById('continueBtn');
const continueInfo = document.getElementById('continueInfo');

const pauseBtn = document.getElementById('pauseBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');
const exitBtn = document.getElementById('exitBtn');
let paused = false;

const SAVE_KEY = 'lostInForest_save_v2';

const DIFFICULTY = {
  easy:   { name: 'easy',   monsterCount: 16, monsterSpeedMul: 0.8,  playerMaxHp: 130, monsterDamage: 7  },
  medium: { name: 'medium', monsterCount: 22, monsterSpeedMul: 1.0,  playerMaxHp: 100, monsterDamage: 10 },
  hard:   { name: 'hard',   monsterCount: 28, monsterSpeedMul: 1.25, playerMaxHp: 80,  monsterDamage: 14 }
};
let currentDifficulty = DIFFICULTY.medium;

// --- Biomes: visuals + a bit of flavor cycle every stage ---
const BIOMES = [
  { name: 'Hutan',  bg: '#16210f', ground: 'rgba(255,255,255,0.015)', trunk: '#3a2a1a', leafA: '#2c4a1e', leafB: '#3e6329', fog: 'rgba(0,0,0,0.88)', accent: '#bfffb0', particle: '#8fae55' },
  { name: 'Rawa',   bg: '#101c19', ground: 'rgba(140,255,210,0.02)',  trunk: '#24382f', leafA: '#1c4438', leafB: '#276050', fog: 'rgba(3,15,10,0.9)',  accent: '#8dffd2', particle: '#5fae94' },
  { name: 'Salju',  bg: '#182129', ground: 'rgba(255,255,255,0.04)',  trunk: '#544437', leafA: '#dfe9ef', leafB: '#c3d6e0', fog: 'rgba(6,10,16,0.86)', accent: '#bfe0ff', particle: '#e6f2ff' },
  { name: 'Gunung', bg: '#211a15', ground: 'rgba(255,220,180,0.02)',  trunk: '#3d2c20', leafA: '#5c5044', leafB: '#6e6252', fog: 'rgba(10,7,5,0.88)',  accent: '#e0c48a', particle: '#c9b285' }
];
function getBiome(stage) { return BIOMES[(stage - 1) % BIOMES.length]; }
let biome = BIOMES[0];

let keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- Touch controls (Android/mobile) ---
let touchVec = { x: 0, y: 0 };
let touchAttack = false;

const joystickZone = document.getElementById('joystickZone');
const joystickKnob = document.getElementById('joystickKnob');
const attackBtnTouch = document.getElementById('attackBtnTouch');

let joyActiveId = null;
let joyCenter = { x: 0, y: 0 };
const JOY_RADIUS = 32;

function joyStart(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  joyActiveId = touch.identifier;
  const rect = joystickZone.getBoundingClientRect();
  joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  joyMove(e);
}

function joyMove(e) {
  if (joyActiveId === null) return;
  e.preventDefault();
  const touch = Array.from(e.changedTouches).find(t => t.identifier === joyActiveId) ||
                Array.from(e.touches || []).find(t => t.identifier === joyActiveId);
  if (!touch) return;
  let dx = touch.clientX - joyCenter.x;
  let dy = touch.clientY - joyCenter.y;
  const len = Math.hypot(dx, dy);
  if (len > JOY_RADIUS) {
    dx = dx / len * JOY_RADIUS;
    dy = dy / len * JOY_RADIUS;
  }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const norm = Math.hypot(dx, dy) / JOY_RADIUS;
  if (norm < 0.15) {
    touchVec.x = 0; touchVec.y = 0;
  } else {
    touchVec.x = dx / JOY_RADIUS;
    touchVec.y = dy / JOY_RADIUS;
  }
}

function joyEnd(e) {
  if (joyActiveId === null) return;
  const stillDown = Array.from(e.changedTouches).some(t => t.identifier === joyActiveId);
  if (!stillDown) return;
  joyActiveId = null;
  touchVec.x = 0; touchVec.y = 0;
  joystickKnob.style.transform = 'translate(0px, 0px)';
}

joystickZone.addEventListener('touchstart', joyStart, { passive: false });
joystickZone.addEventListener('touchmove', joyMove, { passive: false });
joystickZone.addEventListener('touchend', joyEnd, { passive: false });
joystickZone.addEventListener('touchcancel', joyEnd, { passive: false });

attackBtnTouch.addEventListener('touchstart', e => { e.preventDefault(); touchAttack = true; }, { passive: false });
attackBtnTouch.addEventListener('touchend', e => { e.preventDefault(); touchAttack = false; }, { passive: false });
attackBtnTouch.addEventListener('touchcancel', e => { e.preventDefault(); touchAttack = false; }, { passive: false });

let player, trees, monsters, exitPortal, score, startTime, elapsed, running, attackCooldown, hitFlash, camera;
let stage = 1;
let stagePhase = 'play'; // play | clearText | fadeOut | fadeIn
let stageTimer = 0;
let fadeAlpha = 0;
let shakeTime = 0, shakeMag = 0;
let leaves = [];

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isBossStage(s) { return s % 5 === 0; }

function worldSizeForStage(s) {
  return {
    w: Math.min(2600 + (s - 1) * 220, 5600),
    h: Math.min(1900 + (s - 1) * 150, 3900)
  };
}

function shake(mag, time) {
  shakeMag = Math.max(shakeMag, mag);
  shakeTime = Math.max(shakeTime, time);
}

function spawnLeaves() {
  leaves = [];
  const count = 34;
  for (let i = 0; i < count; i++) {
    leaves.push({
      x: rand(0, VW), y: rand(0, VH),
      vx: rand(-0.3, -0.9), vy: rand(0.4, 1.1),
      rot: rand(0, Math.PI * 2), vr: rand(-0.03, 0.03),
      size: rand(3, 7), sway: rand(0, Math.PI * 2)
    });
  }
}

function updateLeaves() {
  for (const l of leaves) {
    l.sway += 0.03;
    l.x += l.vx + Math.sin(l.sway) * 0.4;
    l.y += l.vy;
    l.rot += l.vr;
    if (l.y > VH + 10) { l.y = -10; l.x = rand(0, VW); }
    if (l.x < -10) l.x = VW + 10;
    if (l.x > VW + 10) l.x = -10;
  }
}

function drawLeaves() {
  ctx.save();
  for (const l of leaves) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.fillStyle = biome.particle;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level: currentDifficulty.name,
      stage, score,
      hp: player ? player.hp : currentDifficulty.playerMaxHp,
      maxHp: player ? player.maxHp : currentDifficulty.playerMaxHp
    }));
  } catch (e) { /* localStorage unavailable, ignore */ }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearProgress() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

function refreshContinueButton() {
  const save = loadProgress();
  if (save && save.stage) {
    continueBtn.style.display = 'inline-block';
    continueInfo.textContent = `Lanjutkan (Stage ${save.stage}, ${save.score} terbasmi)`;
  } else {
    continueBtn.style.display = 'none';
  }
}

function monsterStatsForStage(diff, s) {
  return {
    count: Math.min(Math.round(diff.monsterCount + (s - 1) * 2), 66),
    speedMul: diff.monsterSpeedMul * Math.min(1 + (s - 1) * 0.018, 1.6),
    damage: Math.round(diff.monsterDamage + Math.floor((s - 1) / 3)),
    hp: 30 + Math.floor((s - 1) / 2) * 3
  };
}

function initGame(resumeFromSave) {
  const diff = currentDifficulty;
  score = 0;
  stage = 1;
  running = true;
  paused = false;
  overlay.style.display = 'none';
  pauseOverlay.style.display = 'none';

  let startHp = diff.playerMaxHp;
  if (resumeFromSave) {
    const save = loadProgress();
    if (save && save.level === diff.name) {
      stage = save.stage;
      score = save.score;
      startHp = clamp(save.hp, 1, diff.playerMaxHp);
    }
  }

  player = { x: 120, y: 0, r: 14, speed: 3, hp: startHp, maxHp: diff.playerMaxHp, dir: 0, invincible: 0 };
  attackCooldown = 0;
  hitFlash = 0;
  startTime = Date.now();
  camera = { x: 0, y: 0 };
  stagePhase = 'play';
  stageTimer = 0;
  fadeAlpha = 0;
  spawnLeaves();

  buildStage();
  saveProgress();
}

function buildStage() {
  const diff = currentDifficulty;
  const size = worldSizeForStage(stage);
  WORLD_W = size.w; WORLD_H = size.h;
  biome = getBiome(stage);
  biomeEl.textContent = biome.name;

  player.x = 120;
  player.y = WORLD_H / 2;

  trees = [];
  const treeCount = Math.min(320 + Math.floor(stage * 6), 620);
  while (trees.length < treeCount) {
    const t = { x: rand(30, WORLD_W - 30), y: rand(30, WORLD_H - 30), r: rand(14, 28) };
    if (dist(t, player) < 110) continue;
    trees.push(t);
  }

  exitPortal = { x: WORLD_W - 90, y: rand(80, WORLD_H - 80), r: 28, pulse: 0, active: !isBossStage(stage) };
  trees = trees.filter(t => dist(t, exitPortal) > 50);

  const stats = monsterStatsForStage(diff, stage);
  monsters = [];
  const colors = ['#b35bd6', '#d65b8c', '#5bd6a0', '#d6a05b', '#7a5bd6'];

  if (isBossStage(stage)) {
    const bx = WORLD_W - 160, by = clamp(exitPortal.y + rand(-160, 160), 60, WORLD_H - 60);
    monsters.push({
      type: 'boss', x: bx, y: by, r: 46,
      hp: 260 + stage * 45, maxHp: 260 + stage * 45,
      speed: 0.85 * stats.speedMul, angle: rand(0, Math.PI * 2),
      color: '#e04a4a', state: 'wander', hitTimer: 0
    });
  }

  const normalCount = isBossStage(stage) ? Math.round(stats.count * 0.6) : stats.count;
  while (monsters.filter(m => m.type !== 'boss').length < normalCount) {
    const m = {
      type: 'normal',
      x: rand(220, WORLD_W - 120), y: rand(30, WORLD_H - 30),
      r: rand(12, 19), hp: stats.hp, maxHp: stats.hp,
      speed: rand(0.6, 1.4) * stats.speedMul, angle: rand(0, Math.PI * 2),
      color: colors[Math.floor(rand(0, colors.length))],
      state: 'wander', hitTimer: 0
    };
    if (dist(m, player) < 160 || dist(m, exitPortal) < 120) continue;
    monsters.push(m);
  }
}

function collideTrees(x, y, r) {
  for (const t of trees) {
    if (Math.hypot(x - t.x, y - t.y) < r + t.r) return true;
  }
  return false;
}

function beginStageClear() {
  stagePhase = 'clearText';
  stageTimer = 90;
  running = true; // keep loop alive, but update() will freeze gameplay motion
  shake(6, 20);
  saveProgress();
}

function update() {
  if (!running || paused) return;
  elapsed = Date.now() - startTime;

  if (stagePhase !== 'play') {
    updateLeaves();
    if (shakeTime > 0) shakeTime--;
    stageTimer--;
    if (stagePhase === 'clearText' && stageTimer <= 0) {
      stagePhase = 'fadeOut'; stageTimer = 26;
    } else if (stagePhase === 'fadeOut') {
      fadeAlpha = 1 - stageTimer / 26;
      if (stageTimer <= 0) {
        stage++;
        buildStage();
        stagePhase = 'fadeIn'; stageTimer = 26;
      }
    } else if (stagePhase === 'fadeIn') {
      fadeAlpha = stageTimer / 26;
      if (stageTimer <= 0) { stagePhase = 'play'; fadeAlpha = 0; }
    }
    return;
  }

  let dx = 0, dy = 0, moveScale = 1;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  if (touchVec.x !== 0 || touchVec.y !== 0) {
    dx = touchVec.x;
    dy = touchVec.y;
    const rawMag = Math.min(1, Math.hypot(dx, dy));
    moveScale = Math.min(1, rawMag / 0.85);
  }
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    player.dir = Math.atan2(dy, dx);
    const nx = player.x + dx * player.speed * moveScale;
    const ny = player.y + dy * player.speed * moveScale;
    if (!collideTrees(nx, player.y, player.r)) player.x = clamp(nx, player.r, WORLD_W - player.r);
    if (!collideTrees(player.x, ny, player.r)) player.y = clamp(ny, player.r, WORLD_H - player.r);
  }

  if (attackCooldown > 0) attackCooldown--;
  if (player.invincible > 0) player.invincible--;
  if (hitFlash > 0) hitFlash--;
  if (shakeTime > 0) shakeTime--;

  if ((keys[' '] || touchAttack) && attackCooldown <= 0) {
    attackCooldown = 22;
    for (const m of monsters) {
      if (m.hp <= 0) continue;
      if (dist(player, m) < player.r + m.r + 30) {
        m.hp -= 15;
        m.hitTimer = 8;
        if (m.hp <= 0) {
          score++;
          shake(m.type === 'boss' ? 10 : 3, m.type === 'boss' ? 16 : 6);
          if (m.type === 'boss') exitPortal.active = true;
        } else if (m.type === 'boss') {
          shake(3, 6);
        }
      }
    }
  }

  const activeMonsters = monsters.filter(m => m.hp > 0);
  for (const m of activeMonsters) {
    if (m.hitTimer > 0) m.hitTimer--;
    const d = dist(m, player);
    const senseRange = m.type === 'boss' ? 320 : 180;
    const loseRange = m.type === 'boss' ? 420 : 240;
    if (d < senseRange) m.state = 'chase';
    else if (d > loseRange) m.state = 'wander';

    let mx, my;
    if (m.state === 'chase') {
      // Smarter chase: lead the target slightly and spread out from nearby packmates
      const leadX = player.x + Math.cos(player.dir) * 12;
      const leadY = player.y + Math.sin(player.dir) * 12;
      let ang = Math.atan2(leadY - m.y, leadX - m.x);

      let sepX = 0, sepY = 0;
      for (const other of activeMonsters) {
        if (other === m || other.type === 'boss') continue;
        const od = dist(m, other);
        if (od < 34 && od > 0) {
          sepX += (m.x - other.x) / od;
          sepY += (m.y - other.y) / od;
        }
      }
      const chaseSpeed = m.speed * (m.type === 'boss' ? 1.15 : 1.4);
      mx = Math.cos(ang) * chaseSpeed + sepX * 0.8;
      my = Math.sin(ang) * chaseSpeed + sepY * 0.8;
    } else {
      m.angle += rand(-0.2, 0.2);
      mx = Math.cos(m.angle) * m.speed;
      my = Math.sin(m.angle) * m.speed;
    }
    const nx = m.x + mx, ny = m.y + my;
    if (!collideTrees(nx, m.y, m.r)) m.x = clamp(nx, m.r, WORLD_W - m.r);
    if (!collideTrees(m.x, ny, m.r)) m.y = clamp(ny, m.r, WORLD_H - m.r);

    if (d < player.r + m.r && player.invincible <= 0) {
      const dmg = m.type === 'boss' ? Math.round(currentDifficulty.monsterDamage * 1.8) : monsterStatsForStage(currentDifficulty, stage).damage;
      player.hp -= dmg;
      player.invincible = 45;
      hitFlash = 10;
      shake(m.type === 'boss' ? 8 : 4, 14);
      if (player.hp <= 0) {
        player.hp = 0;
        endGame(false);
      }
    }
  }

  exitPortal.pulse += 0.06;
  updateLeaves();

  if (exitPortal.active && dist(player, exitPortal) < exitPortal.r) {
    beginStageClear();
  }

  camera.x = clamp(player.x - VW / 2, 0, Math.max(0, WORLD_W - VW));
  camera.y = clamp(player.y - VH / 2, 0, Math.max(0, WORLD_H - VH));

  healthBar.style.width = (player.hp / player.maxHp * 100) + '%';
  scoreEl.textContent = score;
  stageEl.textContent = stage;
  remainingEl.textContent = monsters.filter(m => m.hp > 0 && m.type !== 'boss').length;
  const secs = Math.floor(elapsed / 1000);
  timerEl.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');

  const activeBoss = monsters.find(m => m.type === 'boss' && m.hp > 0);
  if (activeBoss) {
    bossBar.style.display = 'block';
    bossBarFill.style.width = (activeBoss.hp / activeBoss.maxHp * 100) + '%';
  } else {
    bossBar.style.display = 'none';
  }
}

function drawTree(t) {
  const x = t.x - camera.x, y = t.y - camera.y;
  ctx.beginPath();
  ctx.fillStyle = '#00000033';
  ctx.arc(x, y + t.r * 0.6, t.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = biome.trunk;
  ctx.arc(x, y + t.r * 0.6, t.r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = biome.leafA;
  ctx.arc(x, y, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = biome.leafB;
  ctx.arc(x - t.r * 0.3, y - t.r * 0.3, t.r * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawMonster(m) {
  if (m.hp <= 0) return;
  const x = m.x - camera.x, y = m.y - camera.y;
  if (x < -60 || x > VW + 60 || y < -60 || y > VH + 60) return;
  ctx.save();
  ctx.translate(x, y);
  const wob = Math.sin(Date.now() / 150 + m.x) * (m.type === 'boss' ? 3 : 2);
  ctx.fillStyle = m.hitTimer > 0 ? '#ffffff' : m.color;
  ctx.beginPath();
  const spikes = m.type === 'boss' ? 10 : 7;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const rr = m.r + (i % 2 === 0 ? (m.type === 'boss' ? 8 : 4) + wob : 0);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  if (m.type === 'boss') {
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-m.r * 0.3, -m.r * 0.15, m.type === 'boss' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(m.r * 0.3, -m.r * 0.15, m.type === 'boss' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(-m.r * 0.3, -m.r * 0.15, m.type === 'boss' ? 2.2 : 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(m.r * 0.3, -m.r * 0.15, m.type === 'boss' ? 2.2 : 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  if (m.type !== 'boss') {
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 15, y - m.r - 12, 30, 4);
    ctx.fillStyle = '#e05b5b';
    ctx.fillRect(x - 15, y - m.r - 12, 30 * (m.hp / m.maxHp), 4);
  }
}

function drawPlayer() {
  const x = player.x - camera.x, y = player.y - camera.y;
  ctx.save();
  ctx.translate(x, y);
  if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.rotate(player.dir);
  ctx.fillStyle = '#e0c46a';
  ctx.beginPath();
  ctx.arc(0, 0, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5c1e';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#7a5c1e';
  ctx.beginPath();
  ctx.arc(player.r * 0.7, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (attackCooldown > 15) {
    ctx.save();
    ctx.strokeStyle = 'rgba(230,240,200,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, player.r + 30, player.dir - 0.9, player.dir + 0.9);
    ctx.stroke();
    ctx.restore();
  }
}

function drawExit() {
  const x = exitPortal.x - camera.x, y = exitPortal.y - camera.y;
  if (x < -60 || x > VW + 60 || y < -60 || y > VH + 60) return;
  ctx.save();
  const glow = 18 + Math.sin(exitPortal.pulse) * 6;
  const col = exitPortal.active ? '180,255,150' : '150,150,150';
  const grad = ctx.createRadialGradient(x, y, 2, x, y, exitPortal.r + glow);
  grad.addColorStop(0, `rgba(${col},0.9)`);
  grad.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, exitPortal.r + glow, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = exitPortal.active ? '#bfffb0' : '#9a9a9a';
  ctx.beginPath();
  ctx.arc(x, y, exitPortal.r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  if (!exitPortal.active) {
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Kalahkan Boss', x, y - exitPortal.r - 14);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, VW, VH);
  ctx.save();

  let shakeX = 0, shakeY = 0;
  if (shakeTime > 0) {
    const power = shakeMag * (shakeTime / 20);
    shakeX = rand(-power, power);
    shakeY = rand(-power, power);
  } else {
    shakeMag = 0;
  }
  ctx.translate(shakeX, shakeY);

  ctx.fillStyle = biome.bg;
  ctx.fillRect(-10, -10, VW + 20, VH + 20);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = biome.ground;
    ctx.fillRect((i * 197 - camera.x * 0.3) % VW, (i * 331 - camera.y * 0.3) % VH, 2, 2);
  }

  drawExit();
  for (const t of trees) if (t.y < player.y) drawTree(t);
  for (const m of monsters) drawMonster(m);
  drawPlayer();
  for (const t of trees) if (t.y >= player.y) drawTree(t);

  const px = player.x - camera.x, py = player.y - camera.y;
  const fog = ctx.createRadialGradient(px, py, 60, px, py, 240);
  fog.addColorStop(0, 'rgba(0,0,0,0)');
  fog.addColorStop(1, biome.fog);
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, VW, VH);

  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(200,20,20,${hitFlash / 40})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  drawLeaves();

  ctx.restore();

  if (stagePhase === 'clearText') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = biome.accent;
    ctx.font = 'bold 42px "Trebuchet MS", sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
    ctx.fillText(`🌿 Stage ${stage} Selesai!`, VW / 2, VH / 2 - 10);
    ctx.font = '18px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#dfead0';
    ctx.fillText(`Bersiap memasuki Stage ${stage + 1}...`, VW / 2, VH / 2 + 28);
    ctx.restore();
  } else if (stagePhase === 'fadeOut' || stagePhase === 'fadeIn') {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  }

  drawMinimap();
}

function drawMinimap() {
  mmCtx.clearRect(0, 0, MM_W, MM_H);
  mmCtx.fillStyle = 'rgba(20,30,14,0.5)';
  mmCtx.fillRect(0, 0, MM_W, MM_H);
  const sx = MM_W / WORLD_W, sy = MM_H / WORLD_H;

  mmCtx.fillStyle = 'rgba(90,130,60,0.5)';
  for (const t of trees) {
    mmCtx.fillRect(t.x * sx, t.y * sy, 1.5, 1.5);
  }

  mmCtx.fillStyle = exitPortal.active ? '#7fffa0' : '#9a9a9a';
  mmCtx.beginPath();
  mmCtx.arc(exitPortal.x * sx, exitPortal.y * sy, 4, 0, Math.PI * 2);
  mmCtx.fill();

  for (const m of monsters) {
    if (m.hp <= 0) continue;
    mmCtx.fillStyle = m.type === 'boss' ? '#ffe08a' : '#ff6b6b';
    const s = m.type === 'boss' ? 3 : 1;
    mmCtx.fillRect(m.x * sx - s, m.y * sy - s, s * 2, s * 2);
  }

  mmCtx.fillStyle = '#ffe08a';
  mmCtx.beginPath();
  mmCtx.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
  mmCtx.fill();

  mmCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  mmCtx.strokeRect(camera.x * sx, camera.y * sy, VW * sx, VH * sy);
}

function loop() {
  if (paused) return;
  update();
  draw();
  if (running) requestAnimationFrame(loop);
}

function endGame(won) {
  running = false;
  overlay.style.display = 'flex';
  if (won) {
    overlayTitle.textContent = '🌿 Kamu Menemukan Jalan Keluar!';
    overlayText.textContent = `Berhasil kabur dari hutan luas ini dengan ${score} makhluk aneh berhasil dibasmi dalam waktu ${timerEl.textContent}.`;
  } else {
    overlayTitle.textContent = '💀 Kamu Tumbang di Hutan...';
    overlayText.textContent = `Kamu bertahan sampai Stage ${stage} dengan ${score} makhluk terbasmi. Coba lagi?`;
    clearProgress();
  }
}

function pauseGame() {
  if (!running || paused) return;
  paused = true;
  pauseOverlay.style.display = 'flex';
}

function resumeGame() {
  if (!running || !paused) return;
  paused = false;
  pauseOverlay.style.display = 'none';
  requestAnimationFrame(loop);
}

function exitToMenu() {
  paused = false;
  running = false;
  pauseOverlay.style.display = 'none';
  overlay.style.display = 'none';
  menuOverlay.style.display = 'flex';
  refreshContinueButton();
}

pauseBtn.addEventListener('click', () => {
  if (paused) resumeGame(); else pauseGame();
});
resumeBtn.addEventListener('click', resumeGame);
exitBtn.addEventListener('click', exitToMenu);
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (paused) resumeGame(); else pauseGame();
  }
});

restartBtn.addEventListener('click', () => {
  initGame(false);
  requestAnimationFrame(loop);
});

levelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentDifficulty = DIFFICULTY[btn.dataset.level];
    menuOverlay.style.display = 'none';
    initGame(false);
    requestAnimationFrame(loop);
  });
});

continueBtn.addEventListener('click', () => {
  const save = loadProgress();
  if (!save) return;
  currentDifficulty = DIFFICULTY[save.level] || DIFFICULTY.medium;
  menuOverlay.style.display = 'none';
  initGame(true);
  requestAnimationFrame(loop);
});

// Game only starts once the player picks a difficulty (or continues) from the menu.
running = false;
refreshContinueButton();