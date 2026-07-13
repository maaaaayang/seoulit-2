const cvs = document.getElementById('board');
const ctx = cvs.getContext('2d');
const nextCvs = document.getElementById('next');
const nextCtx = nextCvs.getContext('2d');
const holdCvs = document.getElementById('hold');
const holdCtx = holdCvs.getContext('2d');

const COLS = 10, ROWS = 20;
const CELL = cvs.width / COLS;
const NEXT_COUNT = 3;

const SHAPES = {
  I: { color: '#00e0ff', blocks: [[1, 1, 1, 1]] },
  O: { color: '#ffe04a', blocks: [[1, 1], [1, 1]] },
  T: { color: '#b56cff', blocks: [[0, 1, 0], [1, 1, 1]] },
  S: { color: '#5eea84', blocks: [[0, 1, 1], [1, 1, 0]] },
  Z: { color: '#ff4a6e', blocks: [[1, 1, 0], [0, 1, 1]] },
  J: { color: '#4287ff', blocks: [[1, 0, 0], [1, 1, 1]] },
  L: { color: '#ff8a3e', blocks: [[0, 0, 1], [1, 1, 1]] },
};
const KEYS = Object.keys(SHAPES);

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('overlay');
const ovT = document.getElementById('ovT');
const ovP = document.getElementById('ovP');
const startBtn = document.getElementById('startBtn');

const BEST_KEY = 'tetris-best';
let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
bestEl.textContent = best;

let grid, current, currentX, currentY, queue, hold, holdLock;
let score, lines, level;
let running = false, paused = false;
let dropTimer = 0, lastTime = 0, animId = null;

function emptyGrid() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }

function spawnQueue() {
  const bag = [...KEYS].sort(() => Math.random() - 0.5);
  return bag;
}

function nextPiece() {
  if (queue.length < 7) queue.push(...spawnQueue());
  const key = queue.shift();
  return { key, blocks: SHAPES[key].blocks.map((r) => [...r]), color: SHAPES[key].color };
}

function reset() {
  grid = emptyGrid();
  queue = [];
  hold = null;
  holdLock = false;
  score = 0; lines = 0; level = 1;
  scoreEl.textContent = 0; linesEl.textContent = 0; levelEl.textContent = 1;
  spawn();
}

function spawn() {
  current = nextPiece();
  currentX = Math.floor((COLS - current.blocks[0].length) / 2);
  currentY = -current.blocks.length + 1;
  if (collides(currentX, currentY, current.blocks)) {
    gameOver();
  }
}

function collides(x, y, blocks) {
  for (let r = 0; r < blocks.length; r++) {
    for (let c = 0; c < blocks[r].length; c++) {
      if (!blocks[r][c]) continue;
      const nx = x + c, ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && grid[ny][nx]) return true;
    }
  }
  return false;
}

function rotate(blocks) {
  const N = blocks.length, M = blocks[0].length;
  const out = Array.from({ length: M }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) for (let c = 0; c < M; c++) out[c][N - 1 - r] = blocks[r][c];
  return out;
}

function tryRotate() {
  const rot = rotate(current.blocks);
  // 간단한 wall-kick
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(currentX + dx, currentY, rot)) {
      current.blocks = rot;
      currentX += dx;
      return;
    }
  }
}

function move(dx, dy) {
  if (!collides(currentX + dx, currentY + dy, current.blocks)) {
    currentX += dx; currentY += dy;
    return true;
  }
  return false;
}

function lock() {
  current.blocks.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v && currentY + r >= 0) grid[currentY + r][currentX + c] = current.color;
    });
  });
  clearLines();
  holdLock = false;
  spawn();
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r].every((v) => v)) {
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(null));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const points = [0, 100, 300, 500, 800][cleared] * level;
    score += points;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    scoreEl.textContent = score.toLocaleString('ko-KR');
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > best) { best = score; localStorage.setItem(BEST_KEY, best); bestEl.textContent = best; }
  }
}

function hardDrop() {
  let drops = 0;
  while (move(0, 1)) drops++;
  score += drops * 2;
  scoreEl.textContent = score.toLocaleString('ko-KR');
  lock();
}

function holdPiece() {
  if (holdLock) return;
  holdLock = true;
  if (hold) {
    const tmp = hold;
    hold = { key: current.key, blocks: SHAPES[current.key].blocks.map((r) => [...r]), color: current.color };
    current = { key: tmp.key, blocks: SHAPES[tmp.key].blocks.map((r) => [...r]), color: tmp.color };
    currentX = Math.floor((COLS - current.blocks[0].length) / 2);
    currentY = -current.blocks.length + 1;
  } else {
    hold = { key: current.key, blocks: SHAPES[current.key].blocks.map((r) => [...r]), color: current.color };
    spawn();
  }
}

function getGhostY() {
  let y = currentY;
  while (!collides(currentX, y + 1, current.blocks)) y++;
  return y;
}

function drawCell(c, x, y, color, alpha = 1) {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  c.globalAlpha = alpha * 0.4;
  c.fillStyle = '#fff';
  c.fillRect(x + 1, y + 1, CELL - 2, 4);
  c.globalAlpha = 1;
}

function draw() {
  // 보드
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  // 그리드 라인
  ctx.strokeStyle = '#15152a';
  ctx.lineWidth = 1;
  for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, cvs.height); ctx.stroke(); }
  for (let i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(cvs.width, i * CELL); ctx.stroke(); }

  // 쌓인 블록
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) drawCell(ctx, c * CELL, r * CELL, grid[r][c]);
    }
  }

  if (current) {
    // 고스트
    const gy = getGhostY();
    current.blocks.forEach((row, r) => {
      row.forEach((v, c) => {
        if (v) drawCell(ctx, (currentX + c) * CELL, (gy + r) * CELL, current.color, 0.18);
      });
    });
    // 현재 블록
    current.blocks.forEach((row, r) => {
      row.forEach((v, c) => {
        if (v && currentY + r >= 0) drawCell(ctx, (currentX + c) * CELL, (currentY + r) * CELL, current.color);
      });
    });
  }

  drawPanel(nextCtx, nextCvs, queue.slice(0, NEXT_COUNT).map((k) => SHAPES[k]));
  drawPanel(holdCtx, holdCvs, hold ? [SHAPES[hold.key]] : []);
}

function drawPanel(c, canvas, pieces) {
  c.fillStyle = '#0a0a14';
  c.fillRect(0, 0, canvas.width, canvas.height);
  const cellSize = 18;
  pieces.forEach((p, i) => {
    const w = p.blocks[0].length, h = p.blocks.length;
    const offX = (canvas.width - w * cellSize) / 2;
    const offY = i * 90 + (canvas.height / pieces.length - h * cellSize) / 2 - (pieces.length > 1 ? 0 : 0);
    const startY = pieces.length > 1 ? i * 90 + 10 : (canvas.height - h * cellSize) / 2;
    p.blocks.forEach((row, r) => {
      row.forEach((v, cc) => {
        if (v) {
          c.fillStyle = p.color;
          c.fillRect(offX + cc * cellSize + 1, startY + r * cellSize + 1, cellSize - 2, cellSize - 2);
        }
      });
    });
  });
}

function tick(time) {
  if (!running) return;
  if (!paused) {
    if (!lastTime) lastTime = time;
    const delta = time - lastTime;
    lastTime = time;
    dropTimer += delta;
    const dropInterval = Math.max(80, 800 - (level - 1) * 60);
    if (dropTimer > dropInterval) {
      if (!move(0, 1)) lock();
      dropTimer = 0;
    }
    draw();
  }
  animId = requestAnimationFrame(tick);
}

function start() {
  reset();
  running = true;
  paused = false;
  dropTimer = 0; lastTime = 0;
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(tick);
  draw();
}

function gameOver() {
  running = false;
  cancelAnimationFrame(animId);
  ovT.textContent = '게임 오버';
  ovP.textContent = `점수 ${score.toLocaleString('ko-KR')} · ${lines}줄 · 레벨 ${level}${score === best && score > 0 ? ' 🏆 최고기록!' : ''}`;
  startBtn.textContent = '↻ 다시 시작';
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  if (paused) {
    ovT.textContent = '일시정지';
    ovP.textContent = 'P 또는 스페이스로 재개';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    lastTime = 0;
  }
}

startBtn.addEventListener('click', () => {
  if (paused) togglePause();
  else start();
});

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !running) { e.preventDefault(); start(); return; }
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (!running || paused) return;
  if (e.key === 'ArrowLeft')  { move(-1, 0); draw(); }
  else if (e.key === 'ArrowRight') { move(1, 0); draw(); }
  else if (e.key === 'ArrowDown')  { if (move(0, 1)) { score++; scoreEl.textContent = score; } draw(); }
  else if (e.key === 'ArrowUp')    { tryRotate(); draw(); }
  else if (e.key === ' ')          { e.preventDefault(); hardDrop(); draw(); }
  else if (e.key === 'c' || e.key === 'C' || e.key === 'Shift') { holdPiece(); draw(); }
});

document.querySelectorAll('.d').forEach((b) => {
  b.addEventListener('click', () => {
    if (!running || paused) return;
    const k = b.dataset.k;
    if (k === 'left') move(-1, 0);
    else if (k === 'right') move(1, 0);
    else if (k === 'down') { if (move(0, 1)) { score++; scoreEl.textContent = score; } }
    else if (k === 'rotate') tryRotate();
    else if (k === 'drop') hardDrop();
    else if (k === 'hold') holdPiece();
    draw();
  });
});

// 초기 그리기
grid = emptyGrid();
queue = spawnQueue();
draw();
