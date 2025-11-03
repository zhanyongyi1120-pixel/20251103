/*
  p5.js Quiz System (fullscreen + math questions + countdown + shuffled options)
  - 選項會在載入時隨機排列，正確索引保存在 question.correctIndex
*/

let state = 'start';
let questions = [];
let currentIndex = 0;
let score = 0;
let allowInput = true;

let startBtn = { x: 100, y: 200, w: 200, h: 60 };
let restartBtn = { x: 100, y: 260, w: 200, h: 50 };

let optionRects = [];
let optionHover = -1;
let optionPressAnim = -1;
let pressAnimTimer = 0;

let particles = [];
let shakeTimer = 0;
let flashTimer = 0;

let cursorTrail = [];
const TRAIL_MAX = 16;

// countdown settings
const QUESTION_TIME_SEC = 15; // 每題秒數
let questionEnd = 0; // millis() 到期時間

// flashy background data
let bgStars = [];
let bgBlobs = [];
let bgRingTimer = 0;
const STAR_COUNT = 120;
const BLOB_COUNT = 4;

// CSV 資料改為簡單數學題 (question,A,B,C,D,answer)
const csvText = `question,A,B,C,D,answer
5 + 7 = ?,12,10,13,11,A
9 - 4 = ?,5,4,6,3,A
3 × 4 = ?,12,7,9,14,A
16 ÷ 4 = ?,2,4,6,8,B
`;

// parseCSV to questions array with shuffled options
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  lines.shift(); // remove header
  const arr = lines.map(line => {
    const parts = line.split(',').map(s => s.trim());
    const qtext = parts[0];
    const opts = [parts[1], parts[2], parts[3], parts[4]];
    const answerLetter = (parts[5] || 'A').toUpperCase();
    const correctText = opts[Math.max(0, Math.min(3, answerLetter.charCodeAt(0) - 65))];

    // build option objects and shuffle
    const optObjs = opts.map((t, idx) => ({ text: t, isCorrect: t === correctText }));
    shuffleArray(optObjs);

    // find new correctIndex
    const correctIndex = optObjs.findIndex(o => o.isCorrect);

    return {
      question: qtext,
      options: optObjs.map(o => o.text),
      correctIndex: correctIndex // index 0..3 after shuffle
    };
  });
  return arr;
}

// Fisher-Yates shuffle
function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(0, i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  textFont('Arial');
  questions = parseCSV(csvText);
  if (questions.length > 4) questions = questions.slice(0, 4);
  layoutButtonsAndOptions();
  noCursor();
  frameRate(60);

  initBackground();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layoutButtonsAndOptions();
  initBackground();
}

function layoutButtonsAndOptions() {
  // buttons centered horizontally, vertical positions relative to height
  startBtn.w = min(400, width * 0.4);
  startBtn.h = max(48, height * 0.08);
  startBtn.x = (width - startBtn.w) / 2;
  startBtn.y = height * 0.42;

  restartBtn.w = startBtn.w;
  restartBtn.h = startBtn.h * 0.9;
  restartBtn.x = startBtn.x;
  restartBtn.y = startBtn.y + startBtn.h + 20;

  // options: stacked, relative spacing
  optionRects = [];
  const startY = height * 0.32;
  const h = max(44, height * 0.08);
  const gap = max(10, height * 0.02);
  const w = width * 0.7;
  const x = (width - w) / 2;
  for (let i = 0; i < 4; i++) {
    optionRects.push({
      x: x,
      y: startY + i * (h + gap),
      w: w,
      h: h
    });
  }
}

function initBackground() {
  // stars
  bgStars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    bgStars.push({
      x: random(width),
      y: random(height),
      z: random(0.3, 1),
      twinkle: random(0.4, 1),
      speed: random(0.02, 0.6)
    });
  }
  // glowing blobs
  bgBlobs = [];
  for (let i = 0; i < BLOB_COUNT; i++) {
    bgBlobs.push({
      xoff: random(1000),
      yoff: random(2000),
      size: random(width * 0.25, width * 0.6),
      hue: random(0, 360),
      xMul: random(0.15, 0.6),
      yMul: random(0.05, 0.2),
      speed: random(0.0005, 0.002)
    });
  }
  bgRingTimer = 0;
}

function draw() {
  // screen shake
  push();
  if (shakeTimer > 0) {
    const s = map(shakeTimer, 0, 12, 0, min(18, width * 0.02));
    translate(random(-s, s), random(-s, s));
    shakeTimer--;
  }

  // flashy background (replaces simple background)
  drawBackground();

  // draw state
  if (state === 'start') {
    drawStart();
  } else if (state === 'quiz') {
    // timeout check: 若還允許輸入且時間到，視為錯誤並跳下一題
    if (allowInput && questionEnd > 0 && millis() > questionEnd) {
      handleTimeout();
    }
    drawQuiz();
  } else if (state === 'end') {
    drawEnd();
  }

  // draw particles and overlays (after main content)
  drawParticles();

  if (flashTimer > 0) {
    push();
    fill(255, 0, 0, map(flashTimer, 0, 18, 0, 140));
    rect(0, 0, width, height);
    pop();
    flashTimer--;
  }

  pop(); // pop shake
  // draw custom cursor on top
  drawCursor();
}

/* ---------- flashy background ---------- */
function drawBackground() {
  // animated vertical gradient (RGB)
  const t = millis() * 0.00012;
  colorMode(RGB, 255);
  const c1 = color(
    constrain(18 + 40 * sin(t * 1.3), 0, 255),
    constrain(28 + 30 * sin(t * 1.1 + 0.5), 0, 255),
    constrain(60 + 40 * cos(t * 0.8), 0, 255)
  );
  const c2 = color(
    constrain(90 + 50 * sin(t * 0.9 + 1.2), 0, 255),
    constrain(12 + 60 * cos(t * 0.6), 0, 255),
    constrain(120 + 40 * sin(t * 1.5), 0, 255)
  );
  noStroke();
  for (let y = 0; y < height; y += 12) {
    const lerpAmt = y / height;
    fill(lerpColor(c1, c2, lerpAmt));
    rect(0, y, width, 12);
  }

  // moving stars (parallax)
  push();
  noStroke();
  for (let s of bgStars) {
    const tw = map(s.twinkle * sin(millis() * 0.002 * s.twinkle) + 1, -1, 1, 0.4, 1.2);
    const size = s.z * tw * 2;
    const alpha = map(s.z, 0.3, 1, 80, 220) * tw;
    fill(255, 240, 220, alpha);
    const sx = (s.x + millis() * 0.02 * s.speed) % width;
    const sy = (s.y + millis() * 0.01 * s.speed) % height;
    circle(sx < 0 ? sx + width : sx, sy < 0 ? sy + height : sy, size);
  }
  pop();

  // glowing blobs (use HSB for nicer hues)
  push();
  blendMode(ADD);
  colorMode(HSB, 360, 100, 100, 255);
  for (let b of bgBlobs) {
    b.xoff += b.speed;
    b.yoff += b.speed * 0.7;
    const cx = width * (0.5 + (noise(b.xoff) - 0.5) * b.xMul);
    const cy = height * (0.5 + (noise(b.yoff + millis() * 0.00008) - 0.5) * b.yMul);
    const baseHue = b.hue;
    for (let j = 0; j < 6; j++) {
      const hue = (baseHue + j * 12) % 360;
      const sat = 70 - j * 8;
      const bri = 90 - j * 10;
      const a = map(j, 0, 5, 60, 8);
      fill(hue, sat, bri, a);
      const sz = b.size * (0.6 + j * 0.15);
      ellipse(cx + sin(b.xoff * 2 + j) * 40, cy + cos(b.yoff * 1.5 + j) * 30, sz, sz * 0.7);
    }
  }
  pop();
  colorMode(RGB, 255);
  blendMode(BLEND);

  // subtle circular rings pulse (overlay)
  bgRingTimer += 0.01;
  if (frameCount % 120 < 90) {
    push();
    noFill();
    stroke(200, 120, 255, 24);
    strokeWeight(2);
    translate(width * 0.5, height * 0.5);
    for (let r = 1; r < 4; r++) {
      const rad = (sin(bgRingTimer + r) * 0.5 + 1) * min(width, height) * 0.35 * (r / 3);
      stroke(200, 120, 255, 10 + r * 6);
      ellipse(0, 0, rad, rad);
    }
    pop();
  }

  // vignette - radial subtle darkening at edges (avoid full black overlay)
  push();
  noStroke();
  for (let i = 0; i < 12; i++) {
    const alpha = map(i, 0, 11, 0, 140);
    fill(0, 0, 0, alpha * 0.06); // keep very subtle
    const w = width * (0.6 + i * 0.06);
    const h = height * (0.6 + i * 0.06);
    ellipse(width / 2, height / 2, w, h);
  }
  pop();
}
/* ---------- end background ---------- */

function drawStart() {
  push();
  fill(245);
  textAlign(CENTER, CENTER);
  textSize(min(48, width * 0.05));
  text('p5.js 互動測驗', width / 2, height * 0.18);

  textSize(min(18, width * 0.018));
  text('按下開始測驗來作答 4 題簡單數學題（每題 15 秒）', width / 2, height * 0.24);

  // Start button
  const hover = mouseInRect(startBtn);
  fill(hover ? color(100, 200, 120) : color(80, 180, 100));
  rect(startBtn.x, startBtn.y, startBtn.w, startBtn.h, 10);
  fill(20);
  textSize(min(22, width * 0.02));
  text('開始測驗', startBtn.x + startBtn.w / 2, startBtn.y + startBtn.h / 2);
  pop();
}

function drawQuiz() {
  const q = questions[currentIndex];

  // header
  push();
  fill(255);
  textSize(min(18, width * 0.018));
  textAlign(LEFT, CENTER);
  text(`第 ${currentIndex + 1} / ${questions.length} 題`, width * 0.06, height * 0.06);
  textAlign(RIGHT, CENTER);
  text(`分數：${score}`, width * 0.94, height * 0.06);
  pop();

  // question box
  push();
  fill(255);
  textAlign(CENTER, TOP);
  textSize(min(28, width * 0.035));
  text(q.question, width / 2, height * 0.12);
  pop();

  // draw timer bar and remaining seconds
  const remainingMs = max(0, questionEnd - millis());
  const pct = remainingMs / (QUESTION_TIME_SEC * 1000);
  const barX = width * 0.06;
  const barW = width * 0.88;
  const barY = height * 0.09;
  const barH = max(8, height * 0.01);

  // background bar
  push();
  noStroke();
  fill(80, 80, 90, 180);
  rect(barX, barY - barH / 2, barW, barH, 6);
  // change color when <=5s (閃爍)
  let fillCol;
  if (remainingMs <= 5000) {
    const blink = (frameCount % 30) < 15;
    fillCol = blink ? color(255, 70, 70) : color(220, 80, 80);
  } else {
    // gradient fill for bar
    fillCol = color(120, 220, 255);
  }
  fill(fillCol);
  rect(barX, barY - barH / 2, barW * pct, barH, 6);
  // glowing edge
  if (pct > 0) {
    push();
    blendMode(ADD);
    fill(red(fillCol), green(fillCol), blue(fillCol), 90);
    rect(barX, barY - barH / 2 - 2, barW * pct, barH + 4, 8);
    pop();
  }
  // remaining seconds text
  fill(255);
  textAlign(RIGHT, CENTER);
  textSize(min(14, width * 0.014));
  text(`${ceil(remainingMs / 1000)}s`, barX + barW - 6, barY - barH - 6);
  pop();

  // options hover detection
  optionHover = -1;
  for (let i = 0; i < optionRects.length; i++) {
    const r = optionRects[i];
    if (mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h) {
      optionHover = i;
    }
  }

  // draw options
  for (let i = 0; i < optionRects.length; i++) {
    const r = optionRects[i];
    push();
    const base = color(230, 240, 250, 220);
    let bg = base;
    if (i === optionHover) {
      bg = lerpColor(base, color(200, 230, 255), 0.9);
    }
    let s = 1;
    if (i === optionPressAnim) {
      s = 1 + 0.06 * sin((pressAnimTimer / 10) * PI);
    }
    translate(r.x + r.w / 2, r.y + r.h / 2);
    scale(s);
    fill(bg);
    rect(-r.w / 2, -r.h / 2, r.w, r.h, 10);
    fill(30);
    textAlign(LEFT, CENTER);
    textSize(min(20, width * 0.02));
    const label = String.fromCharCode(65 + i) + '. ';
    text(label + q.options[i], -r.w / 2 + 18, 0);
    pop();
  }

  // anim timer update
  if (optionPressAnim >= 0) {
    pressAnimTimer++;
    if (pressAnimTimer > 20) {
      optionPressAnim = -1;
      pressAnimTimer = 0;
    }
  }
}

function drawEnd() {
  push();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(min(40, width * 0.05));
  text('測驗完成', width / 2, height * 0.16);

  // 計算百分比（以 100 / 75 / 50 / 25 / 0 呈現）
  const percent = Math.round((score / questions.length) * 100); // 對於 4 題會是 0,25,50,75,100
  textSize(min(26, width * 0.03));
  text(`你的分數：${percent} %  (${score}/${questions.length})`, width / 2, height * 0.24);

  // 顯示對應評語：100 -> excellent, 75 -> great, 50/25/0 -> 再接再厲
  let remark = '再接再厲';
  if (percent === 100) remark = 'excellent';
  else if (percent === 75) remark = 'great';

  textSize(min(28, width * 0.04));
  fill(255, 240, 200);
  text(remark, width / 2, height * 0.32);

  // feedback particles based on percent
  if (percent === 100) {
    if (frameCount % 3 === 0) spawnParticles(width / 2 + random(-width * 0.08, width * 0.08), height * 0.36, color(100, 255, 160));
  } else if (percent === 75) {
    if (frameCount % 5 === 0) spawnParticles(width / 2 + random(-width * 0.04, width * 0.04), height * 0.36, color(180, 240, 255));
  } else {
    if (frameCount % 8 === 0) spawnParticles(width / 2 + random(-width * 0.03, width * 0.03), height * 0.36, color(255, 120, 120));
  }

  // Restart button
  const hover = mouseInRect(restartBtn);
  fill(hover ? color(120, 160, 255) : color(100, 140, 240));
  rect(restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h, 10);
  fill(255);
  textSize(min(20, width * 0.022));
  text('重新開始', restartBtn.x + restartBtn.w / 2, restartBtn.y + restartBtn.h / 2);
  pop();
}

function mousePressed() {
  if (state === 'start') {
    if (mouseInRect(startBtn)) startQuiz();
  } else if (state === 'quiz' && allowInput) {
    for (let i = 0; i < optionRects.length; i++) {
      const r = optionRects[i];
      if (mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h) {
        chooseOption(i);
        break;
      }
    }
  } else if (state === 'end') {
    if (mouseInRect(restartBtn)) restart();
  }
}

function startQuiz() {
  // shuffle questions order too for extra randomness
  shuffleArray(questions);
  state = 'quiz';
  currentIndex = 0;
  score = 0;
  allowInput = true;
  questionEnd = millis() + QUESTION_TIME_SEC * 1000;
}

function chooseOption(i) {
  if (!allowInput) return;
  allowInput = false;
  optionPressAnim = i;
  pressAnimTimer = 0;

  const q = questions[currentIndex];
  const r = optionRects[i];
  if (i === q.correctIndex) {
    score++;
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, color(120, 255, 160));
  } else {
    flashTimer = 18;
    shakeTimer = 12;
    spawnParticles(r.x + r.w / 2, r.y + r.h / 2, color(255, 100, 100));
  }

  setTimeout(() => {
    currentIndex++;
    if (currentIndex >= questions.length) {
      state = 'end';
    } else {
      // reset timer for next question
      questionEnd = millis() + QUESTION_TIME_SEC * 1000;
    }
    allowInput = true;
  }, 800);
}

function handleTimeout() {
  // 當作錯誤處理
  if (!allowInput) return;
  allowInput = false;
  flashTimer = 18;
  shakeTimer = 12;
  // 在題目區域中央產生紅色特效
  const cx = width / 2;
  const cy = optionRects.length ? (optionRects[0].y + optionRects[optionRects.length - 1].y + optionRects[optionRects.length - 1].h) / 2 : height / 2;
  spawnParticles(cx, cy, color(255, 100, 100));

  setTimeout(() => {
    currentIndex++;
    if (currentIndex >= questions.length) {
      state = 'end';
    } else {
      questionEnd = millis() + QUESTION_TIME_SEC * 1000;
    }
    allowInput = true;
  }, 800);
}

function restart() {
  // re-parse and reshuffle options to re-randomize positions
  questions = parseCSV(csvText);
  if (questions.length > 4) questions = questions.slice(0, 4);
  state = 'start';
  currentIndex = 0;
  score = 0;
  allowInput = true;
  particles = [];
  questionEnd = 0;
}

function spawnParticles(x, y, col) {
  for (let i = 0; i < 20; i++) {
    const p = new Particle(x + random(-12, 12), y + random(-8, 8), col);
    particles.push(p);
  }
}

// Particle system
class Particle {
  constructor(x, y, col) {
    this.pos = createVector(x, y);
    const angle = random(-PI, PI);
    const speed = random(1, 5);
    this.vel = p5.Vector.fromAngle(angle).mult(speed);
    this.size = random(3, 8);
    this.life = random(30, 70);
    this.col = col;
  }
  update() {
    this.pos.add(this.vel);
    this.vel.mult(0.95);
    this.life -= 1;
  }
  draw() {
    push();
    noStroke();
    const alpha = map(this.life, 0, 70, 0, 255);
    fill(red(this.col), green(this.col), blue(this.col), alpha);
    circle(this.pos.x, this.pos.y, this.size);
    pop();
  }
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw();
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// utility: check if mouse in rect object
function mouseInRect(r) {
  return mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
}

// custom cursor with trailing effect
function drawCursor() {
  cursorTrail.push({ x: mouseX, y: mouseY, t: frameCount });
  if (cursorTrail.length > TRAIL_MAX) cursorTrail.shift();

  for (let i = 0; i < cursorTrail.length; i++) {
    const p = cursorTrail[i];
    push();
    noStroke();
    const alpha = map(i, 0, cursorTrail.length, 20, 200);
    fill(120, 200, 255, alpha);
    const s = map(i, 0, cursorTrail.length, 2, 14);
    circle(p.x, p.y, s);
    pop();
  }

  push();
  fill(255);
  stroke(50, 150, 255);
  strokeWeight(1.5);
  circle(mouseX, mouseY, 10);
  pop();
}

// keyboard Enter to start/restart
function keyPressed() {
  if (keyCode === ENTER) {
    if (state === 'start') startQuiz();
    else if (state === 'end') restart();
  }
}
