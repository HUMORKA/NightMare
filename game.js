/* ============================================================
 * 梦魇猎食 —— 搜打撤恐怖 HD-2D 游戏
 * 框架沿用《曦光小镇》：像素精灵 × 3D 场景 × 景深模糊
 * 玩法：7 天内收集 100 灵魂，双结局 + 失败结局
 * ============================================================ */
(function () {
"use strict";

if (typeof THREE === "undefined") {
  document.body.innerHTML = "<div style='color:#fff;padding:40px;font-family:monospace'>无法加载 three.js，请检查网络连接后刷新页面。</div>";
  return;
}

/* ---------------- 基础工具 ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}
function ctex(c, repeat) {
  var t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

/* ---------------- 音效 ---------------- */
var AC = null, noiseBuf = null;
function audio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {}
  }
  return AC;
}
function beep(freq, dur, type, vol, slide) {
  var ac = audio(); if (!ac) return;
  var o = ac.createOscillator(), g = ac.createGain();
  o.type = type || "square";
  o.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) o.frequency.linearRampToValueAtTime(slide, ac.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.1, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur + 0.02);
}
function noise(dur, vol, freq) {
  var ac = audio(); if (!ac || !noiseBuf) return;
  var s = ac.createBufferSource(); s.buffer = noiseBuf;
  var g = ac.createGain();
  var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1600;
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination);
  s.start(); s.stop(ac.currentTime + dur + 0.02);
}
var sfx = {
  shotN:  function () { noise(0.14, 0.3, 2200); beep(180, 0.06, "square", 0.1, 60); },
  shotS:  function () { beep(920, 0.16, "square", 0.1, 180); noise(0.08, 0.1, 3000); },
  reload: function () { beep(300, 0.05, "square", 0.08); setTimeout(function () { beep(420, 0.05, "square", 0.08); }, 200); setTimeout(function () { beep(560, 0.06, "square", 0.08); }, 500); },
  empty:  function () { beep(220, 0.05, "square", 0.07); },
  hit:    function () { noise(0.08, 0.22, 700); },
  growl:  function () { beep(90, 0.3, "sawtooth", 0.09, 55); },
  zombie: function () { beep(120, 0.35, "sawtooth", 0.06, 70); },
  ghost:  function () { beep(660, 0.5, "sine", 0.045, 320); },
  soul:   function () { beep(740, 0.09, "triangle", 0.1, 1180); },
  pick:   function () { beep(520, 0.08, "triangle", 0.1, 780); },
  talk:   function () { beep(300, 0.05, "square", 0.06); },
  open:   function () { beep(392, 0.09, "triangle", 0.11); },
  hurt:   function () { noise(0.16, 0.3, 500); beep(140, 0.2, "sawtooth", 0.12, 80); },
  day:    function () { beep(523, 0.14, "triangle", 0.1); setTimeout(function () { beep(784, 0.2, "triangle", 0.1); }, 150); },
  night:  function () { beep(392, 0.3, "sine", 0.1, 180); },
  doom:   function () { [110, 82, 65, 55].forEach(function (f, i) { setTimeout(function () { beep(f, 0.7, "sawtooth", 0.16); }, i * 420); }); },
  peace:  function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { setTimeout(function () { beep(f, 0.3, "triangle", 0.12); }, i * 200); }); }
};

/* ============================================================
 * 一、程序化像素美术
 * ============================================================ */

/* ---- 猎人（16×20，含帽子） ---- */
function drawHunter(g, dir, frame, p) {
  var R = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
  var oy = frame === 0 ? 1 : 0;
  // 腿
  if (frame === 1) { R(5, 15 + oy, 2, 3, p.pants); R(5, 17 + oy, 2, 2, p.boots); }
  else             { R(5, 15 + oy, 2, 3, p.pants); R(5, 18 + oy, 2, 2, p.boots); }
  if (frame === 2) { R(9, 15 + oy, 2, 3, p.pants); R(9, 17 + oy, 2, 2, p.boots); }
  else             { R(9, 15 + oy, 2, 3, p.pants); R(9, 18 + oy, 2, 2, p.boots); }
  // 身体（橄榄绿猎装）
  R(4, 9 + oy, 8, 6, p.top);
  R(4, 13 + oy, 8, 1, p.topD);
  R(3, 10 + oy, 1, 3, p.topD); R(12, 10 + oy, 1, 3, p.topD);
  R(3, 13 + oy, 1, 1, p.skin); R(12, 13 + oy, 1, 1, p.skin);
  // 头
  if (dir === "up") {
    R(4, 5 + oy, 8, 4, p.hairD);
  } else if (dir === "side") {
    R(5, 5 + oy, 7, 4, p.skin);
    R(3, 5 + oy, 3, 4, p.hair);
    R(9, 6 + oy, 1, 2, p.eye);
  } else {
    R(4, 5 + oy, 8, 4, p.skin);
    R(3, 5 + oy, 1, 3, p.hair); R(12, 5 + oy, 1, 3, p.hair);
    R(5, 6 + oy, 1, 2, p.eye); R(10, 6 + oy, 1, 2, p.eye);
  }
  // 猎人帽
  R(4, 1 + oy, 8, 3, p.hat);
  R(3, 3 + oy, 10, 1, p.hatD);
  if (dir === "side") R(11, 3 + oy, 3, 1, p.hatD);
}

/* ---- 动物（侧视，含变异形态） ---- */
function drawAnimal(g, type, frame, mutant) {
  var R = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
  var lo = frame === 1 ? 1 : 0; // 抬腿
  var P = mutant ? {
    body: "#8a6052", bodyD: "#6a463a", patch: "#a02818", eye: "#ff3020",
    rib: "#e8e0d0", blood: "#7a1408", horn: "#4a3428"
  } : null;

  function legs(col, yTop, hgt, xs) {
    xs.forEach(function (x, i) {
      var lift = (frame % 2 === 1 && i % 2 === 0) ? 1 : (frame % 2 === 0 && i % 2 === 1 && frame !== 0 ? 1 : 0);
      if (frame === 0) lift = 0;
      R(x, yTop + lift, 2, hgt - lift, col);
    });
  }

  if (type === "cow") {
    var bodyC = mutant ? P.body : "#f2f2ee", patchC = mutant ? P.patch : "#2a2a2a";
    legs(mutant ? "#5e4038" : "#d8d8d0", 10, 3, [4, 7, 12, 15]);
    R(3, 4, 12, 6, bodyC);
    R(5, 5, 3, 2, patchC); R(10, 6, 3, 3, patchC);
    R(15, 3, 4, 5, bodyC);
    R(15, 3, 2, 2, patchC);
    R(17, 4, 1, 1, mutant ? P.eye : "#222");
    R(15, 2, 1, 1, mutant ? P.horn : "#d8c8a8"); R(18, 2, 1, 1, mutant ? P.horn : "#d8c8a8");
    R(2, 4, 1, 4, mutant ? "#5e4038" : "#d8d8d0");
    if (!mutant) { R(9, 10, 3, 2, "#e8b8c0"); }
  } else if (type === "sheep") {
    var wool = mutant ? "#6a4a44" : "#ece8dc", woolL = mutant ? "#7a5a50" : "#f8f4ea";
    legs(mutant ? "#4a302c" : "#3a3630", 10, 3, [5, 8, 12, 15]);
    R(3, 3, 13, 7, wool);
    R(4, 3, 3, 3, woolL); R(9, 6, 3, 3, woolL); R(13, 3, 2, 3, woolL);
    R(15, 5, 4, 4, mutant ? "#d8d0c0" : "#3a3630");
    R(17, 6, 1, 1, mutant ? P.eye : "#fff");
    if (mutant) { R(16, 8, 2, 1, P.blood); }
  } else if (type === "pig") {
    var pigC = mutant ? "#9a5a52" : "#e8a8b0";
    legs(mutant ? "#6a403a" : "#c88890", 9, 3, [4, 7, 10, 13]);
    R(3, 4, 11, 5, pigC);
    R(13, 4, 4, 4, pigC);
    R(16, 6, 2, 2, mutant ? "#5e3028" : "#d08890");
    R(16, 6, 1, 1, "#5a2830"); R(17, 7, 1, 1, "#5a2830");
    R(15, 5, 1, 1, mutant ? P.eye : "#222");
    R(13, 3, 1, 1, pigC);
    R(2, 4, 1, 1, pigC); R(1, 3, 1, 1, pigC); // 卷尾巴
    if (mutant) { R(16, 8, 2, 1, "#e8e0d0"); R(16, 8, 1, 2, "#e8e0d0"); }
  } else { // deer
    var deerC = mutant ? "#7a5a44" : "#b08858";
    legs(mutant ? "#5e4434" : "#907048", 11, 4, [5, 8, 11, 14]);
    R(4, 6, 11, 5, deerC);
    R(13, 3, 3, 4, deerC);
    R(15, 2, 4, 3, deerC);
    R(16, 5, 1, 1, mutant ? P.eye : "#222");
    R(16, 0, 1, 2, mutant ? P.horn : "#d8c8a8"); R(18, 0, 1, 2, mutant ? P.horn : "#d8c8a8");
    R(15, 0, 1, 1, mutant ? P.horn : "#d8c8a8"); R(19, 0, 1, 1, mutant ? P.horn : "#d8c8a8");
    R(3, 6, 1, 2, "#f2ece0");
    if (mutant) { R(17, 4, 2, 1, P.blood); }
  }
  // 变异共通：肋骨 + 血渍
  if (mutant) {
    R(6, 5, 1, 4, P.rib); R(8, 5, 1, 4, P.rib); R(10, 5, 1, 4, P.rib);
    R(5, 9, 1, 2, P.blood); R(9, 10, 1, 2, P.blood);
    R(4, 4, 12, 1, "#5e3a30");
  }
}

/* ---- 丧尸 ---- */
function drawZombie(g, frame) {
  var R = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
  var oy = frame === 0 ? 1 : 0;
  // 腿
  if (frame === 1) { R(5, 15 + oy, 2, 3, "#3a3a42"); R(5, 17 + oy, 2, 2, "#26262c"); }
  else             { R(5, 15 + oy, 2, 3, "#3a3a42"); R(5, 18 + oy, 2, 2, "#26262c"); }
  if (frame === 2) { R(9, 15 + oy, 2, 3, "#3a3a42"); R(9, 17 + oy, 2, 2, "#26262c"); }
  else             { R(9, 15 + oy, 2, 3, "#3a3a42"); R(9, 18 + oy, 2, 2, "#26262c"); }
  // 身体（破烂衬衫）
  R(4, 9 + oy, 8, 6, "#5a6a78");
  R(6, 11 + oy, 2, 2, "#4a5a68"); R(10, 9 + oy, 1, 2, "#4a5a68");
  R(5, 12 + oy, 2, 1, "#6a2018"); // 血渍
  // 前伸的手臂
  var armY = 10 + oy + (frame === 1 ? 1 : 0);
  R(12, armY, 4, 2, "#8aa878");
  R(15, armY, 1, 2, "#8aa878");
  // 头
  R(4, 5 + oy, 8, 4, "#8aa878");
  R(3, 5 + oy, 1, 3, "#6a8858"); R(12, 5 + oy, 1, 3, "#6a8858");
  R(5, 6 + oy, 1, 1, "#c8e0b0"); R(10, 6 + oy, 1, 1, "#c8e0b0");
  R(7, 8 + oy, 2, 1, "#4a5a38");
  R(4, 4 + oy, 8, 1, "#3a4a30"); // 乱发
}

/* ---- 鬼魂 ---- */
function drawGhost(g, frame) {
  var R = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(4, 2, 8, 9, "#d8f0ff");
  R(3, 4, 10, 5, "#d8f0ff");
  R(5, 1, 6, 2, "#e8f8ff");
  // 下摆波纹
  for (var i = 0; i < 5; i++) {
    var h = (i % 2 === frame % 2) ? 3 : 1;
    R(4 + i * 2, 11, 2, h, "#d8f0ff");
  }
  // 眼睛（空洞）
  R(5, 5, 2, frame ? 3 : 2, "#1a3448");
  R(9, 5, 2, frame ? 3 : 2, "#1a3448");
  // 手臂飘带
  R(2, 6, 2, frame ? 4 : 2, "#bce4f8");
  R(12, 6, 2, frame ? 2 : 4, "#bce4f8");
}

/* ---- 梦魇 ---- */
function drawNightmare(g, frame) {
  var R = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
  var dark = "#0c0812", dark2 = "#160e20";
  R(6, 4, 16, 6, dark);
  R(4, 8, 20, 22, dark);
  R(6, 28, 16, 4, dark2);
  // 触须
  for (var i = 0; i < 6; i++) {
    var h = ((i % 2 === frame % 2) ? 4 : 7);
    R(5 + i * 3, 30, 2, h, dark2);
  }
  // 眼睛（紫光）
  var eyeC = frame ? "#e090ff" : "#c060ff";
  R(8, 12, 3, 2, eyeC); R(17, 12, 3, 2, eyeC);
  R(9, 13, 1, 1, "#fff");
  // 嘴（锯齿）
  R(10, 18, 8, 3, "#2a0e3a");
  for (var j = 0; j < 4; j++) R(10 + j * 2, 18, 1, 1, "#c8b8d8");
  // 环绕暗雾
  R(2, 14, 2, 8, dark2); R(24, 10, 2, 10, dark2);
}

/* ---- 枯树 / 白骨 / 墓碑 ---- */
function deadTreeCanvas(seed) {
  var c = mkCanvas(32, 40), g = c[1];
  var rnd = mulberry32(seed);
  var R = function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(14, 8, 4, 32, "#4a4038");
  R(14, 8, 1, 32, "#5a5048");
  // 分枝
  var branches = 4 + ((rnd() * 3) | 0);
  for (var i = 0; i < branches; i++) {
    var by = 8 + ((rnd() * 18) | 0);
    var dir = rnd() < 0.5 ? -1 : 1;
    var bx = 16, len = 4 + ((rnd() * 6) | 0);
    for (var j = 0; j < len; j++) {
      R(bx + dir * j, by - j, 2, 2, "#4a4038");
    }
  }
  return c[0];
}
function boneCanvas(seed) {
  var c = mkCanvas(16, 8), g = c[1];
  var rnd = mulberry32(seed);
  var R = function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(2, 2, 8, 1, "#d8d4c8"); R(2, 4, 8, 1, "#d8d4c8"); R(1, 1, 2, 2, "#d8d4c8"); R(1, 4, 2, 2, "#d8d4c8");
  if (rnd() < 0.5) { R(11, 2, 4, 3, "#e0dcd0"); R(12, 3, 1, 1, "#8a8478"); } // 颅骨
  else { R(11, 3, 4, 1, "#d8d4c8"); R(15, 2, 1, 3, "#d8d4c8"); }
  return c[0];
}
function tombstoneCanvas(seed) {
  var c = mkCanvas(14, 18), g = c[1];
  var rnd = mulberry32(seed);
  var R = function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(2, 4, 10, 14, "#78786e");
  R(3, 2, 8, 3, "#78786e");
  R(3, 3, 8, 1, "#8a8a80");
  R(5, 7, 4, 1, "#5a5a52"); R(6, 6, 2, 3, "#5a5a52"); // 十字
  R(4, 12, 6, 1, "#5a5a52");
  if (rnd() < 0.5) R(2, 8, 1, 5, "#5a5a52"); // 裂纹
  return c[0];
}

/* ---- 地表贴图 ---- */
function jungleGrassCanvas() {
  var c = mkCanvas(32, 32), g = c[1];
  var rnd = mulberry32(7);
  g.fillStyle = "#3a5230"; g.fillRect(0, 0, 32, 32);
  for (var i = 0; i < 300; i++) {
    var r = rnd();
    g.fillStyle = r < 0.4 ? "#2e4226" : r < 0.78 ? "#466238" : "#527045";
    g.fillRect((rnd() * 32) | 0, (rnd() * 32) | 0, 1, 1);
  }
  for (var j = 0; j < 20; j++) {
    g.fillStyle = "#28381f";
    var gx = (rnd() * 30) | 0, gy = (rnd() * 28) | 0;
    g.fillRect(gx, gy, 1, 3);
  }
  return c[0];
}
function deadGrassCanvas() {
  var c = mkCanvas(32, 32), g = c[1];
  var rnd = mulberry32(17);
  g.fillStyle = "#5a4c38"; g.fillRect(0, 0, 32, 32);
  for (var i = 0; i < 260; i++) {
    var r = rnd();
    g.fillStyle = r < 0.4 ? "#4c4030" : r < 0.78 ? "#685842" : "#75634a";
    g.fillRect((rnd() * 32) | 0, (rnd() * 32) | 0, 1, 1);
  }
  for (var j = 0; j < 10; j++) {
    g.fillStyle = "#6e5a3e";
    g.fillRect((rnd() * 30) | 0, (rnd() * 30) | 0, 2, 1);
  }
  return c[0];
}
function dirtPathCanvas() {
  var c = mkCanvas(32, 32), g = c[1];
  var rnd = mulberry32(27);
  g.fillStyle = "#6a5844"; g.fillRect(0, 0, 32, 32);
  for (var i = 0; i < 200; i++) {
    var r = rnd();
    g.fillStyle = r < 0.5 ? "#5c4c3a" : r < 0.85 ? "#78644e" : "#4c4032";
    g.fillRect((rnd() * 32) | 0, (rnd() * 32) | 0, 1, 1);
  }
  for (var j = 0; j < 8; j++) {
    g.fillStyle = "#7e7468";
    g.fillRect((rnd() * 29) | 0, (rnd() * 29) | 0, 2, 2);
  }
  return c[0];
}
function stoneWallCanvas() {
  var c = mkCanvas(32, 32), g = c[1];
  var rnd = mulberry32(37);
  g.fillStyle = "#6e6e66"; g.fillRect(0, 0, 32, 32);
  for (var y = 0; y < 32; y += 8) {
    for (var x = 0; x < 32; x += 8) {
      var off = (y / 8) % 2 * 4;
      g.fillStyle = rnd() < 0.5 ? "#7a7a72" : "#62625a";
      g.fillRect(x + off, y, 7, 7);
      g.fillStyle = "#52524a";
      g.fillRect(x + off, y + 6, 7, 1);
    }
  }
  // 苔痕
  for (var i = 0; i < 26; i++) {
    g.fillStyle = "#4e5c42";
    g.fillRect((rnd() * 32) | 0, (rnd() * 32) | 0, 1, 1);
  }
  return c[0];
}
function woodCanvas() {
  var c = mkCanvas(16, 16), g = c[1];
  g.fillStyle = "#5e4630"; g.fillRect(0, 0, 16, 16);
  g.fillStyle = "#6e543a";
  g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1);
  g.fillStyle = "#4a3624";
  g.fillRect(0, 4, 16, 1); g.fillRect(0, 12, 16, 1);
  g.fillStyle = "#3a2a1c"; g.fillRect(7, 0, 1, 8); g.fillRect(3, 8, 1, 8);
  return c[0];
}

/* ---- 丛林树冠 ---- */
function jungleFoliageCanvas(seed) {
  var c = mkCanvas(40, 40), g = c[1];
  var rnd = mulberry32(seed);
  for (var y = 0; y < 40; y++) {
    for (var x = 0; x < 40; x++) {
      var dx = x - 20, dy = y - 20;
      if (dx * dx + dy * dy < 324 - rnd() * 50) {
        if (rnd() < 0.04) continue;
        var col;
        if (y < 13 && x < 24) col = rnd() < 0.6 ? "#4a7a3a" : "#3e6c30";
        else if (y > 27)      col = rnd() < 0.6 ? "#1e3418" : "#28401e";
        else                  col = rnd() < 0.55 ? "#2e4e24" : "#365a2a";
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c[0];
}

/* ---- 枪 / 子弹 / 发光 ---- */
function rifleCanvas() {
  var c = mkCanvas(20, 6), g = c[1];
  var R = function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(0, 2, 6, 3, "#6a4a2c");            // 枪托
  R(5, 1, 12, 3, "#3a3a42");           // 机匣
  R(17, 2, 3, 1, "#3a3a42");           // 枪管
  R(8, 4, 2, 2, "#2a2a30");            // 扳机护圈
  R(6, 0, 6, 1, "#8a8a92");            // 瞄具
  return c[0];
}
function glowCanvas(color, inner) {
  var c = mkCanvas(64, 64), g = c[1];
  var gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, inner || "rgba(255,255,255,1)");
  gr.addColorStop(0.35, color);
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c[0];
}
function softDot(color) {
  var c = mkCanvas(32, 32), g = c[1];
  var gr = g.createRadialGradient(16, 16, 1, 16, 16, 14);
  gr.addColorStop(0, color);
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c[0];
}

/* ============================================================
 * 二、场景
 * ============================================================ */
var canvas = document.getElementById("game");
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

var scene = new THREE.Scene();
var skyColor = new THREE.Color(0x6e8672);
scene.background = skyColor;
scene.fog = new THREE.Fog(0x6e8672, 38, 95);

var camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 22, 34);

var hemi = new THREE.HemisphereLight(0xbcd0e8, 0x3a4a32, 0.5);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xffe8c0, 0.95);
sun.position.set(26, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

var T = {
  grass: ctex(jungleGrassCanvas(), true),
  dead: ctex(deadGrassCanvas(), true),
  path: ctex(dirtPathCanvas(), true),
  stone: ctex(stoneWallCanvas(), true),
  wood: ctex(woodCanvas(), true),
  glowWarm: ctex(glowCanvas("rgba(255,190,110,0.7)")),
  glowCyan: ctex(glowCanvas("rgba(140,240,255,0.75)")),
  glowPurple: ctex(glowCanvas("rgba(190,110,255,0.8)")),
  glowRed: ctex(glowCanvas("rgba(255,80,50,0.8)")),
  dot: ctex(softDot("rgba(255,255,255,0.9)")),
  dotRed: ctex(softDot("rgba(200,40,20,0.9)")),
  rifle: ctex(rifleCanvas())
};

var colliders = [];
function addCollider(x, z, hw, hd) { colliders.push({ x: x, z: z, hw: hw, hd: hd }); }

/* ---- 地面（110×110 大地图） ---- */
var MAP = 55; // 半径
{
  var gt = T.grass.clone(); gt.needsUpdate = true; gt.repeat.set(55, 55);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshLambertMaterial({ map: gt }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 悬空岛底座
  var bt = T.stone.clone(); bt.needsUpdate = true; bt.repeat.set(26, 1);
  var base = new THREE.Mesh(new THREE.BoxGeometry(110.4, 4, 110.4), new THREE.MeshLambertMaterial({ map: bt }));
  base.position.y = -2.02;
  scene.add(base);
}

/* ---- 祭坛空地（南方圆形） ---- */
var ALTAR = { x: 0, z: 19 };
{
  var dt = T.dead.clone(); dt.needsUpdate = true; dt.repeat.set(6, 6);
  var clearing = new THREE.Mesh(new THREE.CircleGeometry(9.6, 36), new THREE.MeshLambertMaterial({ map: dt }));
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.set(ALTAR.x, 0.015, ALTAR.z);
  clearing.receiveShadow = true;
  scene.add(clearing);
}

/* ---- 道路（小地图同步记录） ---- */
var mmPaths = [];
function addPath(x, z, w, l, ry) {
  var pt = T.path.clone(); pt.needsUpdate = true; pt.repeat.set(w / 1.6, l / 1.6);
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshLambertMaterial({ map: pt }));
  m.rotation.x = -Math.PI / 2;
  if (ry) m.rotation.z = ry;
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  scene.add(m);
  mmPaths.push({ x: x, z: z, w: w, l: l, ry: ry });
}
addPath(0, 9, 2.2, 26);                // 空地 → 中心
addPath(0, -22, 2.2, 46);              // 中心 → 北方密林
addPath(-14, 0, 2, 24, Math.PI / 2);   // 中心 → 别墅区（西）
addPath(12, -1, 2, 24, Math.PI / 2);   // 中心 → 墓园（东）
addPath(-32, -18, 2, 16, Math.PI / 2); // 别墅深处
addPath(24, -22, 2, 14, Math.PI / 2);  // 墓园深处

/* ---- 世界边界 ---- */
var WORLD = { minX: -54, maxX: 54, minZ: -54, maxZ: 54 };

/* ---- 古堡选址（主世界随机 3 座，几何体稍后构建） ---- */
var castles = [];
{
  var cRnd = mulberry32(20260901);
  var anchors = [[-38, 12], [36, 18], [-12, -44], [26, 40], [-44, -46], [42, -44], [16, -44]];
  var cNames = ["血月古堡", "灰鸦古堡", "遗落古堡", "荆棘古堡", "雾隐古堡", "寒鸦古堡", "腐朽古堡"];
  for (var si = anchors.length - 1; si > 0; si--) {
    var sj = (cRnd() * (si + 1)) | 0;
    var tmp = anchors[si]; anchors[si] = anchors[sj]; anchors[sj] = tmp;
    tmp = cNames[si]; cNames[si] = cNames[sj]; cNames[sj] = tmp;
  }
  for (var sc = 0; sc < 3; sc++) {
    castles.push({
      x: anchors[sc][0], z: anchors[sc][1],
      name: cNames[sc], seed: 900 + sc * 17,
      interior: null
    });
  }
}

/* ---- 树（丛林）与枯树（空地） ---- */
var foliageShared = [];
for (var fi = 0; fi < 4; fi++) foliageShared.push(ctex(jungleFoliageCanvas(fi * 29 + 11)));

function inClearing(x, z, r) {
  return Math.hypot(x - ALTAR.x, z - ALTAR.z) < (r || 10.2);
}
function inVillaZone(x, z) {
  return x < -4 && x > -40 && z < -6 && z > -34;
}
function inGraveyard(x, z) {
  return x > 10 && x < 36 && z < -8 && z > -32;
}
function onPath(x, z) {
  if (Math.abs(x) < 1.6 && z > -45 && z < 23) return true;
  if (Math.abs(z) < 1.4 && x > -27 && x < -3) return true;
  if (Math.abs(z + 1) < 1.4 && x > 1 && x < 25) return true;
  if (Math.abs(z + 18) < 1.4 && x > -41 && x < -23) return true;
  if (Math.abs(z + 22) < 1.4 && x > 16 && x < 32) return true;
  return false;
}
function placeOk(x, z) {
  if (inClearing(x, z) || onPath(x, z)) return false;
  if (inVillaZone(x, z) || inGraveyard(x, z)) return false;
  for (var ci = 0; ci < castles.length; ci++) {
    if (Math.abs(x - castles[ci].x) < 10 && Math.abs(z - castles[ci].z) < 10) return false;
  }
  return true;
}
{
  var rnd = mulberry32(555);
  var treeGeo = new THREE.PlaneGeometry(2.8, 2.8);
  var placed = 0, tries = 0;
  while (placed < 150 && tries < 1500) {
    tries++;
    var tx = (rnd() * 2 - 1) * 52, tz = (rnd() * 2 - 1) * 52;
    if (!placeOk(tx, tz)) continue;
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 1.6, 0.36),
      new THREE.MeshLambertMaterial({ map: T.wood })
    );
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    g.add(trunk);
    var ftex = foliageShared[(rnd() * 4) | 0];
    var fmat = new THREE.MeshLambertMaterial({ map: ftex, alphaTest: 0.5, side: THREE.DoubleSide });
    var fdepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ftex, alphaTest: 0.5 });
    [0, Math.PI / 2].forEach(function (ry) {
      var p = new THREE.Mesh(treeGeo, fmat);
      p.customDepthMaterial = fdepth;
      p.position.y = 2.4;
      p.rotation.y = ry;
      p.castShadow = true;
      g.add(p);
    });
    g.position.set(tx, 0, tz);
    var s = 0.9 + rnd() * 0.35;
    g.scale.set(s, s, s);
    scene.add(g);
    addCollider(tx, tz, 0.34 * s, 0.34 * s);
    placed++;
  }
  // 空地枯树
  var deadSpots = [[-6, 14], [6, 15], [-7, 23], [7, 24], [0, 28], [-3, 12]];
  deadSpots.forEach(function (sp, i) {
    var dtex = ctex(deadTreeCanvas(i * 7 + 3));
    var dmat = new THREE.MeshLambertMaterial({ map: dtex, alphaTest: 0.5, side: THREE.DoubleSide });
    var ddepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: dtex, alphaTest: 0.5 });
    var dg = new THREE.Group();
    [0, Math.PI / 2].forEach(function (ry) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), dmat);
      p.customDepthMaterial = ddepth;
      p.position.y = 1.5;
      p.rotation.y = ry;
      p.castShadow = true;
      dg.add(p);
    });
    dg.position.set(sp[0], 0, sp[1]);
    scene.add(dg);
    addCollider(sp[0], sp[1], 0.3, 0.3);
  });
  // 白骨
  var boneSpots = [[-3, 16], [3, 17], [-5, 21], [4, 22], [-2, 25], [5, 25], [-6, 18]];
  boneSpots.forEach(function (sp, i) {
    var b = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.35),
      new THREE.MeshLambertMaterial({ map: ctex(boneCanvas(i * 13 + 5)), alphaTest: 0.5, side: THREE.DoubleSide })
    );
    b.rotation.x = -Math.PI / 2;
    b.rotation.z = i * 0.9;
    b.position.set(sp[0], 0.03, sp[1]);
    scene.add(b);
  });
}

/* ---- 祭坛 + 梦魇 ---- */
var nightmareGroup, nightmareMesh, nightmareGlow, altarLight;
{
  var ag = new THREE.Group();
  var st = T.stone.clone(); st.needsUpdate = true; st.repeat.set(3, 1);
  var b1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 3.4), new THREE.MeshLambertMaterial({ map: st }));
  b1.position.y = 0.25; b1.castShadow = true; b1.receiveShadow = true; ag.add(b1);
  var b2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), new THREE.MeshLambertMaterial({ map: st }));
  b2.position.y = 0.75; b2.castShadow = true; ag.add(b2);
  var b3 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), new THREE.MeshLambertMaterial({ map: st }));
  b3.position.y = 1.3; b3.castShadow = true; ag.add(b3);
  // 符文光
  var rune = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowPurple, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false
  }));
  rune.scale.set(4.5, 4.5, 1);
  rune.position.y = 0.4;
  ag.add(rune);
  altarLight = new THREE.PointLight(0xa060ff, 0.8, 10);
  altarLight.position.y = 2;
  ag.add(altarLight);
  ag.position.set(ALTAR.x, 0, ALTAR.z);
  scene.add(ag);
  addCollider(ALTAR.x, ALTAR.z, 1.8, 1.8);

  // 梦魇本体（悬浮于祭坛上）
  nightmareGroup = new THREE.Group();
  var nt = [];
  for (var f = 0; f < 2; f++) {
    var cv = mkCanvas(28, 36);
    drawNightmare(cv[1], f);
    nt.push(ctex(cv[0]));
  }
  nightmareMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 3.3),
    new THREE.MeshBasicMaterial({ map: nt[0], transparent: true, side: THREE.DoubleSide })
  );
  nightmareMesh.position.y = 3.1;
  nightmareGroup.add(nightmareMesh);
  nightmareGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowPurple, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.65, depthWrite: false
  }));
  nightmareGlow.scale.set(6, 6, 1);
  nightmareGlow.position.y = 3.1;
  nightmareGroup.add(nightmareGlow);
  nightmareGroup.position.set(ALTAR.x, 0, ALTAR.z);
  nightmareGroup.userData.frames = nt;
  scene.add(nightmareGroup);
}

/* ---- 荒废别墅（西北） ---- */
function wallSeg(x1, z1, x2, z2, h) {
  var len = Math.hypot(x2 - x1, z2 - z1);
  var m = new THREE.Mesh(
    new THREE.BoxGeometry(len, h, 0.5),
    new THREE.MeshLambertMaterial({ map: T.stone })
  );
  m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  // 碰撞（线段外包盒）
  var hw = Math.abs(x2 - x1) / 2 + 0.3, hd = Math.abs(z2 - z1) / 2 + 0.3;
  addCollider((x1 + x2) / 2, (z1 + z2) / 2, hw, hd);
}
function buildRuin(x, z, w, d) {
  // 残缺四壁，南侧留门
  wallSeg(x - w / 2, z - d / 2, x + w / 2, z - d / 2, 2.4);            // 北墙
  wallSeg(x - w / 2, z + d / 2, x - 1.2, z + d / 2, 1.8);              // 南墙(左)
  wallSeg(x + 1.2, z + d / 2, x + w / 2, z + d / 2, 1.8);              // 南墙(右)
  wallSeg(x - w / 2, z - d / 2, x - w / 2, z + d / 2, 2.4);            // 西墙
  wallSeg(x + w / 2, z - d / 2, x + w / 2, z, 2.4);                    // 东墙(半)
  // 断墙残段
  wallSeg(x - w / 4, z - d / 2 - 1.6, x - w / 4, z - d / 2 - 0.4, 1.1);
}
buildRuin(-19, -15, 9, 7);
buildRuin(-11, -20, 7, 6);
buildRuin(-30, -26, 8, 6);

/* ---- 墓园（东北） ---- */
var GRAVE = { x: 23, z: -20 };
{
  var rnd = mulberry32(777);
  for (var i = 0; i < 16; i++) {
    var gx = GRAVE.x + (rnd() * 2 - 1) * 9;
    var gz = GRAVE.z + (rnd() * 2 - 1) * 8;
    var ts = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.9),
      new THREE.MeshLambertMaterial({ map: ctex(tombstoneCanvas(i * 11 + 3)), alphaTest: 0.5, side: THREE.DoubleSide })
    );
    ts.position.set(gx, 0.45, gz);
    ts.rotation.y = (rnd() - 0.5) * 0.6;
    ts.castShadow = true;
    scene.add(ts);
    addCollider(gx, gz, 0.25, 0.25);
  }
  // 墓园枯树
  [[12, -13], [22, -15], [19, -21], [30, -26], [14, -28]].forEach(function (sp, i) {
    var dtex = ctex(deadTreeCanvas(i * 17 + 40));
    var dmat = new THREE.MeshLambertMaterial({ map: dtex, alphaTest: 0.5, side: THREE.DoubleSide });
    var dg = new THREE.Group();
    [0, Math.PI / 2].forEach(function (ry) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), dmat);
      p.position.y = 1.4; p.rotation.y = ry; p.castShadow = true;
      dg.add(p);
    });
    dg.position.set(sp[0], 0, sp[1]);
    scene.add(dg);
    addCollider(sp[0], sp[1], 0.3, 0.3);
  });
}

/* ---- 战利品箱子 ---- */
var crates = [];
function addCrate(x, z, loot, gold) {
  var m = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshLambertMaterial(gold ? { color: 0xd8b060 } : { map: T.wood })
  );
  if (gold) m.scale.set(1.25, 1.25, 1.25);
  m.position.set(x, gold ? 0.5 : 0.4, z);
  m.rotation.y = (Math.random() - 0.5) * 0.5;
  m.castShadow = true;
  scene.add(m);
  addCollider(x, z, 0.45, 0.45);
  crates.push({ mesh: m, x: x, z: z, opened: false, loot: loot || "random", gold: !!gold });
  return crates[crates.length - 1];
}
addCrate(-19, -14, "random");
addCrate(-16, -16, "random");
addCrate(-11, -19, "random");
addCrate(-9, -21, "random");
addCrate(-20, -18, "random");
addCrate(-30, -24, "random");
addCrate(-27, -28, "random");
addCrate(16, -16, "random");
addCrate(19, -18, "random");
addCrate(27, -24, "random");
addCrate(-4, 6, "random");
addCrate(5, -6, "random");
addCrate(12, 8, "random");
addCrate(-14, 10, "random");
addCrate(-24, 4, "random");
addCrate(24, -6, "random");
// —— 扩张区域的新补给点 ——
addCrate(-30, 18, "random");
addCrate(-18, 27, "random");
addCrate(18, 29, "random");
addCrate(33, 25, "random");
addCrate(-45, -10, "random");
addCrate(45, 4, "random");
addCrate(-25, -37, "random");
addCrate(8, -41, "random");
addCrate(-6, -45, "random");
addCrate(27, -45, "random");
addCrate(-45, 31, "random");
addCrate(45, 35, "random");
addCrate(-37, 43, "random");
addCrate(6, 45, "random");
addCrate(41, -41, "random");
addCrate(-12, 34, "random");
addCrate(14, -32, "random");

/* ---- 营火（出生点旁） ---- */
var fireLight;
{
  var fg = new THREE.Group();
  var log1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.2), new THREE.MeshLambertMaterial({ map: T.wood }));
  var log2 = log1.clone(); log2.rotation.y = Math.PI / 2;
  log1.position.y = 0.1; log2.position.y = 0.1;
  fg.add(log1); fg.add(log2);
  var flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowWarm, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false
  }));
  flame.scale.set(1.1, 1.4, 1);
  flame.position.y = 0.5;
  fg.add(flame);
  fireLight = new THREE.PointLight(0xff9040, 0.9, 8);
  fireLight.position.y = 0.7;
  fg.add(fireLight);
  fg.position.set(2.6, 0, 22.5);
  scene.add(fg);
  fg.userData.flame = flame;
  window._fire = fg;
  addCollider(2.6, 22.5, 0.4, 0.4);
}

/* ---- 路牌 ---- */
var signPos = { x: 1.6, z: 12 };
{
  var post = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.3, 0.14),
    new THREE.MeshLambertMaterial({ color: 0x4a3624 })
  );
  post.position.set(signPos.x, 0.65, signPos.z);
  post.castShadow = true;
  scene.add(post);
  var board = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.6, 0.08),
    new THREE.MeshLambertMaterial({ map: T.wood })
  );
  board.position.set(signPos.x, 1.1, signPos.z);
  board.rotation.y = 0.3;
  board.castShadow = true;
  scene.add(board);
  addCollider(signPos.x, signPos.z, 0.35, 0.2);
}

/* ---- 空中尘埃微粒 ---- */
var motes, moteData = [];
{
  var N = 130;
  var pos = new Float32Array(N * 3);
  var rnd = mulberry32(4242);
  for (var i = 0; i < N; i++) {
    pos[i * 3] = (rnd() * 2 - 1) * 50;
    pos[i * 3 + 1] = 0.5 + rnd() * 3;
    pos[i * 3 + 2] = (rnd() * 2 - 1) * 50;
    moteData.push({ ph: rnd() * 6.28, sp: 0.3 + rnd() });
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  motes = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xc8c0a8, size: 0.09, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, map: T.dot
  }));
  scene.add(motes);
}

/* ============================================================
 * 三、玩家
 * ============================================================ */
function blobShadow(r) {
  var m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 12),
    new THREE.MeshBasicMaterial({ color: 0x0a0e08, transparent: true, opacity: 0.34, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

var HUNTER_PAL = {
  hair: "#3a2c20", hairD: "#2c2018", skin: "#e8bc90", eye: "#221c14",
  top: "#4a5a3a", topD: "#3a4a2e", pants: "#4a4238", boots: "#2c241c",
  hat: "#2e4a2e", hatD: "#223a22"
};
var hunterTex = { down: [], up: [], side: [] };
["down", "up", "side"].forEach(function (d) {
  for (var f = 0; f < 3; f++) {
    var cv = mkCanvas(16, 20);
    drawHunter(cv[1], d, f, HUNTER_PAL);
    hunterTex[d].push(ctex(cv[0]));
  }
});

var player = {
  pos: new THREE.Vector3(0, 0, 24),
  hp: 100, souls: 0,
  ammoN: 20, ammoS: 10, mag: 5,
  ammoType: "N",           // N 普通 / S 灵弹
  reloading: false, reloadT: 0,
  fireCd: 0,
  battery: 100, torchOn: false,
  aim: new THREE.Vector3(0, 0, 18),
  dir: "up", frameSeq: [0, 1, 0, 2], animT: 0, facingLeft: false,
  alive: true, inCastle: null
};
var playerGroup = new THREE.Group();
var playerMat = new THREE.MeshBasicMaterial({ map: hunterTex.up[0], transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
var playerMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.4), playerMat);
playerMesh.position.y = 0.72;
playerGroup.add(playerMesh);
playerGroup.add(blobShadow(0.3));
scene.add(playerGroup);

/* ---- 猎枪 ---- */
var gun = new THREE.Mesh(
  new THREE.PlaneGeometry(1.0, 0.28),
  new THREE.MeshBasicMaterial({ map: T.rifle, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide })
);
gun.rotation.order = "YXZ";
gun.rotation.x = -Math.PI / 2;
scene.add(gun);

/* ---- 手电筒锥形光 ---- */
var torchGroup = new THREE.Group();
{
  var cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 7.2, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2c0, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    })
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = 3.6;
  torchGroup.add(cone);
  torchGroup.visible = false;
  scene.add(torchGroup);
}

/* ============================================================
 * 四、敌人
 * ============================================================ */
var enemies = [];
var ANIMAL_TYPES = ["cow", "sheep", "pig", "deer"];

function animalTextures(type) {
  var t = { n: [], m: [] };
  for (var f = 0; f < 3; f++) {
    var cn = mkCanvas(20, 16); drawAnimal(cn[1], type, f, false); t.n.push(ctex(cn[0]));
    var cm = mkCanvas(20, 16); drawAnimal(cm[1], type, f, true);  t.m.push(ctex(cm[0]));
  }
  return t;
}
var animalTexCache = {};
ANIMAL_TYPES.forEach(function (a) { animalTexCache[a] = animalTextures(a); });

var zombieTex = [], ghostTex = [];
for (var zf = 0; zf < 3; zf++) {
  var zc = mkCanvas(16, 20); drawZombie(zc[1], zf); zombieTex.push(ctex(zc[0]));
  var gc = mkCanvas(16, 16); drawGhost(gc[1], zf % 2); ghostTex.push(ctex(gc[0]));
}

function spawnEnemy(kind, animalType, x, z, bounds) {
  var group = new THREE.Group();
  var mat, mesh, hw, hh, r;
  if (kind === "animal" || kind === "mutant") {
    var texSet = animalTexCache[animalType];
    mat = new THREE.MeshBasicMaterial({ map: texSet.n[0], transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.0), mat);
    mesh.position.y = 0.5;
    r = 0.55;
  } else if (kind === "zombie") {
    mat = new THREE.MeshBasicMaterial({ map: zombieTex[0], transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.4), mat);
    mesh.position.y = 0.72;
    r = 0.42;
  } else { // ghost
    mat = new THREE.MeshBasicMaterial({ map: ghostTex[0], transparent: true, opacity: 0.05, alphaTest: 0.01, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), mat);
    mesh.position.y = 0.85;
    r = 0.45;
  }
  group.add(mesh);
  if (kind !== "ghost") group.add(blobShadow(kind === "zombie" ? 0.3 : 0.42));
  group.position.set(x, 0, z);
  scene.add(group);

  var e = {
    kind: kind, animalType: animalType || null,
    group: group, mesh: mesh, mat: mat, r: r,
    hp: kind === "animal" ? 2 : kind === "mutant" ? 6 : kind === "zombie" ? 4 : 3,
    speed: kind === "animal" ? 1.0 : kind === "mutant" ? 2.5 : kind === "zombie" ? 1.15 : 0.9,
    revealed: false, lit: false,
    state: "wander", target: null, wait: Math.random() * 2,
    animT: 0, facingLeft: false, atkCd: 0, hitFlash: 0,
    wanderZone: null,
    retreatT: 0,
    bounds: bounds || null
  };
  enemies.push(e);
  return e;
}

function enemyHomeZone(e) {
  if (e.kind === "zombie") return inVillaZone(e.group.position.x, e.group.position.z) ? "villa" : "grave";
  if (e.kind === "ghost") return inGraveyard(e.group.position.x, e.group.position.z) ? "grave" : "villa";
  return "jungle";
}

/* ---- 初始种群 ---- */
function randPointInJungle() {
  for (var i = 0; i < 30; i++) {
    var x = (Math.random() * 2 - 1) * 52;
    var z = (Math.random() * 2 - 1) * 52;
    if (!placeOk(x, z)) continue;
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 12) continue;
    if (collidePoint(x, z, 0.5)) continue;
    return { x: x, z: z };
  }
  return { x: 15, z: -5 };
}
function randPointNear(cx, cz, radius) {
  for (var i = 0; i < 30; i++) {
    var x = cx + (Math.random() * 2 - 1) * radius;
    var z = cz + (Math.random() * 2 - 1) * radius;
    if (collidePoint(x, z, 0.5)) continue;
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 10) continue;
    return { x: x, z: z };
  }
  return { x: cx, z: cz };
}
function collidePoint(x, z, r) {
  for (var i = 0; i < colliders.length; i++) {
    var c = colliders[i];
    if (x > c.x - c.hw - r && x < c.x + c.hw + r &&
        z > c.z - c.hd - r && z < c.z + c.hd + r) return true;
  }
  return false;
}

function initPopulation() {
  for (var i = 0; i < 18; i++) {  // 丛林动物
    var p = randPointInJungle();
    var mutant = Math.random() < 0.22;
    spawnEnemy(mutant ? "mutant" : "animal", ANIMAL_TYPES[(Math.random() * 4) | 0], p.x, p.z);
  }
  for (var v = 0; v < 8; v++) {   // 别墅丧尸
    var pv = randPointNear(-15, -17, 7);
    spawnEnemy("zombie", null, pv.x, pv.z);
  }
  for (var v2 = 0; v2 < 3; v2++) { // 深处废墟丧尸
    var pv2 = randPointNear(-30, -26, 5);
    spawnEnemy("zombie", null, pv2.x, pv2.z);
  }
  for (var gz = 0; gz < 4; gz++) { // 墓园丧尸
    var pg = randPointNear(GRAVE.x, GRAVE.z, 7);
    spawnEnemy("zombie", null, pg.x, pg.z);
  }
  for (var gh = 0; gh < 6; gh++) { // 鬼魂
    var pgz = gh < 3 ? randPointNear(GRAVE.x, GRAVE.z, 7) : randPointNear(-15, -17, 6);
    spawnEnemy("ghost", null, pgz.x, pgz.z);
  }
}
initPopulation();

/* ============================================================
 * 古堡：外部（主世界随机 3 座）+ 内部（远端独立区域，E 传送）
 * ============================================================ */
var portals = [];

function buildCastleExterior(c) {
  var w = 11, d = 11;
  // 庭院石板
  var ct = T.stone.clone(); ct.needsUpdate = true; ct.repeat.set(6, 6);
  var court = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: ct }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(c.x, 0.02, c.z);
  court.receiveShadow = true;
  scene.add(court);
  // 四面墙（南面留门）
  wallSeg(c.x - w / 2, c.z - d / 2, c.x + w / 2, c.z - d / 2, 3.6);
  wallSeg(c.x - w / 2, c.z + d / 2, c.x - 1.4, c.z + d / 2, 2.6);
  wallSeg(c.x + 1.4, c.z + d / 2, c.x + w / 2, c.z + d / 2, 2.6);
  wallSeg(c.x - w / 2, c.z - d / 2, c.x - w / 2, c.z + d / 2, 3.6);
  wallSeg(c.x + w / 2, c.z - d / 2, c.x + w / 2, c.z + d / 2, 3.6);
  // 门拱
  var arch = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.9, 0.8), new THREE.MeshLambertMaterial({ map: T.stone }));
  arch.position.set(c.x, 2.7, c.z + d / 2);
  arch.castShadow = true;
  scene.add(arch);
  // 四角塔楼
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
    var tw = new THREE.Mesh(new THREE.BoxGeometry(2, 6.4, 2), new THREE.MeshLambertMaterial({ map: T.stone }));
    tw.position.set(c.x + s[0] * w / 2, 3.2, c.z + s[1] * d / 2);
    tw.castShadow = true; tw.receiveShadow = true;
    scene.add(tw);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.5, 4), new THREE.MeshLambertMaterial({ color: 0x3a2a32 }));
    tip.position.set(tw.position.x, 7.15, tw.position.z);
    tip.rotation.y = Math.PI / 4;
    tip.castShadow = true;
    scene.add(tip);
    addCollider(tw.position.x, tw.position.z, 1.05, 1.05);
  });
  // 大门辉光
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowPurple, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false
  }));
  glow.scale.set(3.2, 3.2, 1);
  glow.position.set(c.x, 1.4, c.z + d / 2 + 0.1);
  scene.add(glow);
  c.gateGlow = glow;
  portals.push({ x: c.x, z: c.z + d / 2 + 1.2, r: 2.2, enter: true, castle: c, to: null });
}

function interiorSpot(c, spreadX, spreadZ) {
  for (var i = 0; i < 20; i++) {
    var x = c.interior.x + (Math.random() * 2 - 1) * spreadX;
    var z = c.interior.z + (Math.random() * 2 - 1) * spreadZ;
    if (!collidePoint(x, z, 0.5)) return { x: x, z: z };
  }
  return { x: c.interior.x, z: c.interior.z + 5 };
}

function buildCastleInterior(c, idx) {
  var IX = 400 + idx * 80, IZ = 0, W = 20, D = 26;
  var bounds = { minX: IX - W / 2 + 1, maxX: IX + W / 2 - 1, minZ: IZ - D / 2 + 1, maxZ: IZ + D / 2 - 1 };
  c.interior = { x: IX, z: IZ, w: W, d: D, bounds: bounds, treasure: null };
  // 地板
  var ft = T.stone.clone(); ft.needsUpdate = true; ft.repeat.set(10, 13);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: ft }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(IX, 0.015, IZ);
  floor.receiveShadow = true;
  scene.add(floor);
  // 红毯
  var carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.6, D - 7), new THREE.MeshLambertMaterial({ color: 0x5a1c28 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(IX, 0.03, IZ - 1);
  scene.add(carpet);
  // 墙体（南墙低矮，便于俯瞰内部）
  wallSeg(IX - W / 2, IZ - D / 2, IX + W / 2, IZ - D / 2, 4.4);
  wallSeg(IX - W / 2, IZ + D / 2, IX - 2.2, IZ + D / 2, 1.1);
  wallSeg(IX + 2.2, IZ + D / 2, IX + W / 2, IZ + D / 2, 1.1);
  wallSeg(IX - W / 2, IZ - D / 2, IX - W / 2, IZ + D / 2, 2.6);
  wallSeg(IX + W / 2, IZ - D / 2, IX + W / 2, IZ + D / 2, 2.6);
  // 石柱两排
  [-6, 0, 6].forEach(function (ox) {
    [-4, 4].forEach(function (oz) {
      var col = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4, 0.9), new THREE.MeshLambertMaterial({ map: T.stone }));
      col.position.set(IX + ox, 2, IZ + oz);
      col.castShadow = true;
      scene.add(col);
      addCollider(IX + ox, IZ + oz, 0.5, 0.5);
    });
  });
  // 王座
  var dais = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 2), new THREE.MeshLambertMaterial({ map: T.stone }));
  dais.position.set(IX, 0.2, IZ - D / 2 + 1.8);
  dais.receiveShadow = true;
  scene.add(dais);
  var throne = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.5), new THREE.MeshLambertMaterial({ map: T.wood }));
  throne.position.set(IX, 1.5, IZ - D / 2 + 1.2);
  throne.castShadow = true;
  scene.add(throne);
  addCollider(IX, IZ - D / 2 + 1.6, 1.7, 1.0);
  // 烛台
  [[-7, -8], [7, -8], [-7, 6], [7, 6]].forEach(function (p) {
    var candle = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.glowWarm, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.75, depthWrite: false
    }));
    candle.scale.set(1.1, 1.1, 1);
    candle.position.set(IX + p[0], 1.6, IZ + p[1]);
    scene.add(candle);
    var pl = new THREE.PointLight(0xffa050, 0.75, 10);
    pl.position.set(IX + p[0], 2.2, IZ + p[1]);
    scene.add(pl);
  });
  // 出口传送门（南端）
  var exGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowCyan, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false
  }));
  exGlow.scale.set(3, 3, 1);
  exGlow.position.set(IX, 1.2, IZ + D / 2 - 0.6);
  scene.add(exGlow);
  portals.push({ x: IX, z: IZ + D / 2 - 1.2, r: 2, enter: false, castle: c, to: { x: c.x, z: c.z + 9.5 } });
  // 补给箱 ×3 + 宝箱 ×1
  for (var b = 0; b < 3; b++) {
    var spot = interiorSpot(c, 7, 9);
    addCrate(spot.x, spot.z, "random");
  }
  c.interior.treasure = addCrate(IX - 6.5, IZ - D / 2 + 3, "treasure", true);
  // 守卫（丧尸 + 鬼魂，限制在古堡内部）
  spawnCastleGuards(c, 4, 2);
  // 入口传送目标
  for (var pi = 0; pi < portals.length; pi++) {
    if (portals[pi].enter && portals[pi].castle === c) {
      portals[pi].to = { x: IX, z: IZ + 6 };
    }
  }
}

function spawnCastleGuards(c, nz, ng) {
  for (var i = 0; i < nz; i++) {
    var sp = interiorSpot(c, 7, 9);
    spawnEnemy("zombie", null, sp.x, sp.z, c.interior.bounds);
  }
  for (var j = 0; j < ng; j++) {
    var sp2 = interiorSpot(c, 6, 8);
    spawnEnemy("ghost", null, sp2.x, sp2.z, c.interior.bounds);
  }
}

function ensureCastleGuards(c) {
  var n = 0;
  enemies.forEach(function (e) { if (e.bounds === c.interior.bounds) n++; });
  if (n < 4 && !c.interior.treasure.opened) {
    spawnCastleGuards(c, 5 - n, 1);
  }
}

castles.forEach(function (c, i) {
  buildCastleExterior(c);
  buildCastleInterior(c, i);
});

/* ---- 增援生成 ---- */
var spawnTimer = 0;
function reinforcement(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  spawnTimer = 4;
  var counts = { animal: 0, mutant: 0, zombie: 0, ghost: 0 };
  enemies.forEach(function (e) { counts[e.kind]++; });
  var isNight = game.isNight;
  // 动物/变异体
  if (counts.animal + counts.mutant < (isNight ? 12 : 16)) {
    var p = randPointInJungle();
    var mutant = Math.random() < (isNight ? 0.38 : 0.22);
    spawnEnemy(mutant ? "mutant" : "animal", ANIMAL_TYPES[(Math.random() * 4) | 0], p.x, p.z);
  }
  // 丧尸
  if (counts.zombie < (isNight ? 12 : 8)) {
    var villaPts = [[-15, -17], [-30, -26]];
    var vc = villaPts[(Math.random() * 2) | 0];
    var pz = Math.random() < 0.65 ? randPointNear(vc[0], vc[1], 6) : randPointNear(GRAVE.x, GRAVE.z, 6);
    spawnEnemy("zombie", null, pz.x, pz.z);
  }
  // 鬼魂（夜里更多，会向丛林蔓延）
  if (counts.ghost < (isNight ? 9 : 5)) {
    var pg = Math.random() < 0.5 ? randPointNear(GRAVE.x, GRAVE.z, 5) :
             (Math.random() < 0.6 ? randPointNear(-15, -17, 6) : randPointInJungle());
    spawnEnemy("ghost", null, pg.x, pg.z);
  }
}

/* ============================================================
 * 五、子弹 / 灵魂 / 掉落 / 特效
 * ============================================================ */
var bullets = [], souls = [], drops = [], fx = [];

function shoot() {
  if (player.reloading || player.fireCd > 0) return;
  if (player.mag <= 0) { sfx.empty(); player.fireCd = 0.45; tryReload(); return; }
  player.mag--;
  player.fireCd = 0.55;
  var dir = new THREE.Vector3(player.aim.x - player.pos.x, 0, player.aim.z - player.pos.z).normalize();
  var isSpirit = player.ammoType === "S";
  var bmat = new THREE.MeshBasicMaterial({
    color: isSpirit ? 0x9ff0ff : 0xffd870, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var bmesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.07), bmat);
  bmesh.rotation.order = "YXZ";
  bmesh.rotation.x = -Math.PI / 2;
  bmesh.rotation.y = -Math.atan2(dir.z, dir.x);
  bmesh.position.set(player.pos.x + dir.x * 0.9, 0.78, player.pos.z + dir.z * 0.9);
  scene.add(bmesh);
  bullets.push({
    mesh: bmesh, dx: dir.x, dz: dir.z, life: 0.9,
    spirit: isSpirit, dmg: 2
  });
  // 枪口火光
  var fl = new THREE.Sprite(new THREE.SpriteMaterial({
    map: isSpirit ? T.glowCyan : T.glowWarm, blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.95, depthWrite: false
  }));
  fl.scale.set(0.9, 0.9, 1);
  fl.position.set(player.pos.x + dir.x * 1.1, 0.8, player.pos.z + dir.z * 1.1);
  scene.add(fl);
  fx.push({
    t: 0, ttl: 0.12,
    update: function (dt) { this.t += dt; fl.material.opacity = 0.95 * (1 - this.t / this.ttl); return this.t < this.ttl; },
    dispose: function () { scene.remove(fl); }
  });
  if (isSpirit) sfx.shotS(); else sfx.shotN();
  // 枪口硝烟微粒
  for (var i = 0; i < 3; i++) puff(player.pos.x + dir.x, player.pos.z + dir.z, 0.5);
}

function tryReload() {
  if (player.reloading) return;
  var pool = player.ammoType === "N" ? player.ammoN : player.ammoS;
  if (player.mag >= 5) return;
  if (pool <= 0) { showToast(player.ammoType === "N" ? "普通子弹耗尽！" : "灵弹耗尽！"); return; }
  player.reloading = true;
  player.reloadT = 1.4;
  sfx.reload();
}

function finishReload() {
  var poolRef = player.ammoType === "N" ? "ammoN" : "ammoS";
  var need = 5 - player.mag;
  var take = Math.min(need, player[poolRef]);
  player[poolRef] -= take;
  player.mag += take;
  player.reloading = false;
}

function switchAmmo() {
  if (player.reloading) return;
  // 退回弹匣存弹
  if (player.ammoType === "N") { player.ammoN += player.mag; player.ammoType = "S"; }
  else { player.ammoS += player.mag; player.ammoType = "N"; }
  player.mag = 0;
  tryReload();
  showToast(player.ammoType === "N" ? "切换：普通子弹" : "切换：灵弹");
  beep(660, 0.06, "square", 0.08);
}

function puff(x, z, vy) {
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.dot, transparent: true, opacity: 0.35, depthWrite: false, color: 0xb8b0a0
  }));
  sp.scale.set(0.24, 0.24, 1);
  sp.position.set(x + (Math.random() - 0.5) * 0.3, 0.15 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.3);
  scene.add(sp);
  fx.push({
    t: 0, ttl: 0.5,
    update: function (dt) {
      this.t += dt;
      var k = this.t / this.ttl;
      sp.position.y += dt * (vy || 0.3);
      sp.material.opacity = 0.35 * (1 - k);
      return k < 1;
    },
    dispose: function () { scene.remove(sp); }
  });
}

function bloodBurst(x, y, z, n, ghostly) {
  for (var i = 0; i < (n || 6); i++) {
    (function () {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ghostly ? T.glowCyan : T.dotRed, blending: ghostly ? THREE.AdditiveBlending : THREE.NormalBlending,
        transparent: true, opacity: ghostly ? 0.9 : 0.85, depthWrite: false
      }));
      sp.scale.set(ghostly ? 0.3 : 0.18, ghostly ? 0.3 : 0.18, 1);
      sp.position.set(x, y, z);
      scene.add(sp);
      var vx = (Math.random() - 0.5) * 3, vy2 = 1 + Math.random() * 2, vz = (Math.random() - 0.5) * 3;
      fx.push({
        t: 0, ttl: 0.45 + Math.random() * 0.25,
        update: function (dt) {
          this.t += dt;
          vy2 -= dt * 7;
          sp.position.x += vx * dt; sp.position.y += vy2 * dt; sp.position.z += vz * dt;
          if (sp.position.y < 0.05) { sp.position.y = 0.05; vy2 = 0; }
          sp.material.opacity = (ghostly ? 0.9 : 0.85) * (1 - this.t / this.ttl);
          return this.t < this.ttl;
        },
        dispose: function () { scene.remove(sp); }
      });
    })();
  }
}

function spawnSoul(x, z, val) {
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowCyan, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false
  }));
  sp.scale.set(0.55, 0.55, 1);
  sp.position.set(x, 0.7, z);
  scene.add(sp);
  souls.push({
    sprite: sp, val: val, t: 0,
    vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3
  });
}

function spawnDrop(x, z, type) {
  var colors = { ammoN: 0xc8a060, ammoS: 0x70d8e8, battery: 0xf0d060, herb: 0x70c060 };
  var box = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: colors[type] })
  );
  box.position.set(x, 0.3, z);
  scene.add(box);
  var gl = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowWarm, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.4, depthWrite: false
  }));
  gl.scale.set(0.8, 0.8, 1);
  gl.position.set(x, 0.3, z);
  scene.add(gl);
  drops.push({ mesh: box, glow: gl, type: type, t: 0 });
}

/* ============================================================
 * 六、游戏状态 / UI
 * ============================================================ */
var DAY_LEN = 90, TOTAL_DAYS = 7;
var game = {
  started: false, paused: false, ended: false,
  time: 0, day: 1, isNight: false, dayAnnounced: 1,
  nightmareMet: false
};

var ui = {
  hudTop: document.getElementById("hudTop"),
  hudLeft: document.getElementById("hudLeft"),
  hudBottom: document.getElementById("hudBottom"),
  ctrl: document.getElementById("ctrl"),
  dayLabel: document.getElementById("dayLabel"),
  phase: document.getElementById("phase"),
  soulLabel: document.getElementById("soulLabel"),
  hpFill: document.getElementById("hpFill"),
  btFill: document.getElementById("btFill"),
  ammoType: document.getElementById("ammoType"),
  magDots: document.getElementById("magDots"),
  ammoPool: document.getElementById("ammoPool"),
  reloadHint: document.getElementById("reloadHint"),
  dlg: document.getElementById("dlg"),
  dlgName: document.getElementById("dlgName"),
  dlgText: document.getElementById("dlgText"),
  dlgNext: document.getElementById("dlgNext"),
  promptE: document.getElementById("promptE"),
  toast: document.getElementById("toast"),
  title: document.getElementById("title"),
  choice: document.getElementById("choice"),
  end: document.getElementById("end"),
  endTitle: document.getElementById("endTitle"),
  endText: document.getElementById("endText"),
  pause: document.getElementById("pause"),
  hurt: document.getElementById("hurt"),
  fade: document.getElementById("fade"),
  mmWrap: document.getElementById("mmWrap"),
  mmName: document.getElementById("mmName")
};

function showToast(msg) {
  ui.toast.textContent = msg;
  ui.toast.style.display = "block";
  ui.toast.style.opacity = "1";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () {
    ui.toast.style.opacity = "0";
    setTimeout(function () { ui.toast.style.display = "none"; }, 450);
  }, 2400);
}

var dialog = null;
function openDialog(name, lines) {
  dialog = { name: name, lines: lines, idx: 0, shown: 0 };
  ui.dlgName.textContent = name;
  ui.dlgText.textContent = "";
  ui.dlg.style.display = "block";
  ui.dlgNext.style.visibility = "hidden";
  sfx.open();
}
function advanceDialog() {
  if (!dialog) return;
  var line = dialog.lines[dialog.idx];
  if (dialog.shown < line.length) {
    dialog.shown = line.length;
    ui.dlgText.textContent = line;
    ui.dlgNext.style.visibility = "visible";
    return;
  }
  dialog.idx++;
  if (dialog.idx >= dialog.lines.length) {
    ui.dlg.style.display = "none";
    dialog = null;
    if (advanceDialog._after) { var fn = advanceDialog._after; advanceDialog._after = null; fn(); }
    return;
  }
  dialog.shown = 0;
  ui.dlgText.textContent = "";
  ui.dlgNext.style.visibility = "hidden";
}
function updateDialog(dt) {
  if (!dialog) return;
  var line = dialog.lines[dialog.idx];
  if (dialog.shown < line.length) {
    dialog.shown = Math.min(line.length, dialog.shown + dt * 38);
    var n = dialog.shown | 0;
    ui.dlgText.textContent = line.slice(0, n);
    if (n % 3 === 0 && dialog._last !== n) sfx.talk();
    dialog._last = n;
    if (n >= line.length) ui.dlgNext.style.visibility = "visible";
  }
}

function hurtFlash() {
  ui.hurt.style.opacity = "1";
  clearTimeout(hurtFlash._t);
  hurtFlash._t = setTimeout(function () { ui.hurt.style.opacity = "0"; }, 220);
}

function updateHUD() {
  ui.dayLabel.textContent = "第 " + game.day + " / " + TOTAL_DAYS + " 天";
  ui.phase.textContent = game.isNight ? "黑夜 · NIGHT" : "白天 · DAY";
  ui.soulLabel.textContent = "灵魂 " + player.souls + " / 100";
  ui.hpFill.style.width = Math.max(0, player.hp) + "%";
  ui.btFill.style.width = Math.max(0, player.battery) + "%";
  ui.ammoType.textContent = player.ammoType === "N" ? "◈ 普通子弹" : "◈ 灵弹";
  var dots = "";
  for (var i = 0; i < 5; i++) dots += i < player.mag ? "●" : "○";
  ui.magDots.textContent = dots;
  ui.ammoPool.textContent = "普通 " + player.ammoN + " ｜ 灵弹 " + player.ammoS;
  ui.reloadHint.style.display = player.reloading ? "block" : "none";
}

/* ---- 昼夜环境 ---- */
var ENV_KEYS = [
  { t: 0.0,  sky: 0x6e8672, fogN: 38, fogF: 95, sunI: 0.95, hemiI: 0.5 },
  { t: 0.55, sky: 0x6e8672, fogN: 38, fogF: 95, sunI: 0.95, hemiI: 0.5 },
  { t: 0.68, sky: 0x8a5c48, fogN: 30, fogF: 72, sunI: 0.5,  hemiI: 0.35 },
  { t: 0.8,  sky: 0x101826, fogN: 13, fogF: 46, sunI: 0.1,  hemiI: 0.16 },
  { t: 1.0,  sky: 0x16202e, fogN: 15, fogF: 50, sunI: 0.14, hemiI: 0.2 }
];
var _cA = new THREE.Color(), _cB = new THREE.Color();
function updateEnv() {
  var dayT = (game.time % DAY_LEN) / DAY_LEN;
  var k0 = ENV_KEYS[0], k1 = ENV_KEYS[ENV_KEYS.length - 1];
  for (var i = 0; i < ENV_KEYS.length - 1; i++) {
    if (dayT >= ENV_KEYS[i].t && dayT <= ENV_KEYS[i + 1].t) { k0 = ENV_KEYS[i]; k1 = ENV_KEYS[i + 1]; break; }
  }
  var span = k1.t - k0.t || 1;
  var k = (dayT - k0.t) / span;
  _cA.setHex(k0.sky); _cB.setHex(k1.sky);
  _cA.lerp(_cB, k);
  skyColor.copy(_cA);
  scene.fog.color.copy(_cA);
  scene.fog.near = k0.fogN + (k1.fogN - k0.fogN) * k;
  scene.fog.far = k0.fogF + (k1.fogF - k0.fogF) * k;
  sun.intensity = k0.sunI + (k1.sunI - k0.sunI) * k;
  hemi.intensity = k0.hemiI + (k1.hemiI - k0.hemiI) * k;
}

/* ============================================================
 * 七、输入
 * ============================================================ */
var keys = {};
var mouse = { x: 0, y: 0, down: false };
var raycaster = new THREE.Raycaster();
var aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.7);
var ndc = new THREE.Vector2();

window.addEventListener("keydown", function (e) {
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === "KeyE" || e.code === "Enter") { onInteract(); e.preventDefault(); }
  if (e.code === "KeyR") tryReload();
  if (e.code === "KeyQ") switchAmmo();
  if (e.code === "KeyF") {
    if (player.battery > 0) {
      player.torchOn = !player.torchOn;
      beep(player.torchOn ? 800 : 500, 0.05, "square", 0.08);
    }
  }
  if (e.code === "KeyM") {
    if (game.started) {
      mmVisible = !mmVisible;
      ui.mmWrap.style.display = mmVisible ? "block" : "none";
    }
  }
  if (e.code === "Escape") {
    if (game.started && !game.ended) {
      game.paused = !game.paused;
      ui.pause.style.display = game.paused ? "flex" : "none";
    }
  }
});
window.addEventListener("keyup", function (e) { keys[e.code] = false; });

canvas.addEventListener("mousemove", function (e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
});
canvas.addEventListener("mousedown", function (e) {
  if (e.button === 0) mouse.down = true;
});
window.addEventListener("mouseup", function (e) {
  if (e.button === 0) mouse.down = false;
});
window.addEventListener("contextmenu", function (e) { e.preventDefault(); });

function updateAim() {
  ndc.set((mouse.x / window.innerWidth) * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(aimPlane, hit)) {
    player.aim.copy(hit);
  }
}

function onInteract() {
  if (!game.started || game.ended || game.paused) return;
  if (dialog) { advanceDialog(); return; }
  // 祭坛 / 梦魇
  var dAltar = Math.hypot(player.pos.x - ALTAR.x, player.pos.z - ALTAR.z);
  if (dAltar < 3.2) { talkToNightmare(); return; }
  // 传送门（古堡进出）
  for (var pi = 0; pi < portals.length; pi++) {
    var po = portals[pi];
    if (po.to && Math.hypot(player.pos.x - po.x, player.pos.z - po.z) < po.r) { usePortal(po); return; }
  }
  // 箱子
  for (var i = 0; i < crates.length; i++) {
    var c = crates[i];
    if (c.opened) continue;
    if (Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < 1.5) { openCrate(c); return; }
  }
  // 路牌
  if (Math.hypot(player.pos.x - signPos.x, player.pos.z - signPos.z) < 1.5) {
    openDialog("路牌", ["「北：原始丛林」", "「西北：荒废别墅 —— 不要在夜里靠近」", "「东北：墓园 —— 愿逝者安息」", "「密林深处矗立着几座古堡……据说藏着宝藏，也守着亡者」"]);
    return;
  }
}

function openCrate(c) {
  c.opened = true;
  c.mesh.material = new THREE.MeshLambertMaterial({ map: T.wood, color: 0x777777 });
  if (c.loot === "treasure") {
    player.souls += 6;
    player.ammoS += 6;
    player.battery = Math.min(100, player.battery + 80);
    player.hp = Math.min(100, player.hp + 50);
    showToast("✦ 古堡宝藏：灵魂结晶 ×6、灵弹 ×6、电池与药草！");
    beep(880, 0.3, "triangle", 0.14, 1320);
    return;
  }
  var roll = Math.random();
  if (roll < 0.32) { player.ammoN += 8; showToast("获得 普通子弹 ×8"); }
  else if (roll < 0.6) { player.ammoS += 5; showToast("获得 灵弹 ×5"); }
  else if (roll < 0.82) { player.battery = Math.min(100, player.battery + 60); showToast("获得 电池（+60）"); }
  else { player.hp = Math.min(100, player.hp + 40); showToast("获得 药草（生命 +40）"); }
  sfx.pick();
}

/* ---- 古堡传送 ---- */
function fadeTeleport(fn) {
  ui.fade.style.opacity = "1";
  setTimeout(function () {
    fn();
    setTimeout(function () { ui.fade.style.opacity = "0"; }, 80);
  }, 280);
}
function usePortal(po) {
  beep(420, 0.5, "sine", 0.12, 880);
  fadeTeleport(function () {
    player.pos.set(po.to.x, 0, po.to.z);
    player.inCastle = po.enter ? po.castle : null;
    camera.position.set(po.to.x, 9.7, po.to.z + 8.8);
    camera.lookAt(po.to.x, 1.1, po.to.z);
    if (po.enter) {
      ensureCastleGuards(po.castle);
      showToast("—— " + po.castle.name + " ——");
    } else {
      showToast("回到了丛林");
    }
  });
}

function talkToNightmare() {
  if (player.souls >= 100) {
    openDialog("梦魇", ["……一百个灵魂，你竟然真的做到了。", "把它们交给我，我将赐予你无法想象的力量——", "或者，你也可以背叛我，放走它们。", "选择吧，猎人。"]);
    advanceDialog._after = function () { showChoice(); };
  } else if (!game.nightmareMet) {
    game.nightmareMet = true;
    openDialog("梦魇", [
      "……愚蠢的猎人，你惊扰了我的沉眠。",
      "我尚虚弱，杀不死你——但我可以诅咒你。",
      "七天。七天内集齐一百个灵魂，送回这座祭坛。",
      "动物的、丧尸的、鬼魂的灵魂……都在这片丛林里。",
      "拿着这把猎枪，还有一匣灵弹和一支手电筒。",
      "记住：灵弹才能伤害鬼魂；手电筒会照出那些……伪装成猎物的东西。",
      "违约的下场，就是成为我的一部分。"
    ]);
  } else {
    var left = 100 - player.souls;
    openDialog("梦魇", ["还差 " + left + " 个灵魂。", "时间，可不站在你这边……"]);
  }
}

function showChoice() {
  ui.choice.style.display = "flex";
}
document.getElementById("btnSacrifice").addEventListener("click", function () {
  ui.choice.style.display = "none";
  endingDoom();
});
document.getElementById("btnRelease").addEventListener("click", function () {
  ui.choice.style.display = "none";
  endingPeace();
});

document.getElementById("startBtn").addEventListener("click", function (e) {
  e.stopPropagation(); startGame();
});
ui.title.addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", function () { location.reload(); });

function startGame() {
  if (game.started) return;
  game.started = true;
  ui.title.style.display = "none";
  ui.hudTop.style.display = "block";
  ui.hudLeft.style.display = "block";
  ui.hudBottom.style.display = "block";
  ui.ctrl.style.display = "block";
  ui.mmWrap.style.display = "block";
  audio();
  beep(110, 0.8, "sawtooth", 0.12, 55);
  setTimeout(function () {
    openDialog("梦魇", ["七天。一百个灵魂。", "（提示：F 手电筒，Q 切换弹药，E 交谈；密林里有几座古堡，M 打开地图）"]);
  }, 600);
}

/* ============================================================
 * 八、战斗与更新
 * ============================================================ */
var aimDir = new THREE.Vector3(1, 0, 0);

function updatePlayer(dt) {
  if (dialog || game.paused || game.ended) { playerMat.map = hunterTex[player.dir][0]; return; }
  var dx = 0, dz = 0;
  if (keys.KeyW || keys.ArrowUp) dz -= 1;
  if (keys.KeyS || keys.ArrowDown) dz += 1;
  if (keys.KeyA || keys.ArrowLeft) dx -= 1;
  if (keys.KeyD || keys.ArrowRight) dx += 1;
  var moving = dx !== 0 || dz !== 0;
  if (moving) {
    var len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    var speed = (keys.ShiftLeft || keys.ShiftRight) ? 4.8 : 3.4;
    var nx = player.pos.x + dx * speed * dt;
    var nz = player.pos.z + dz * speed * dt;
    var pb = player.inCastle ? player.inCastle.interior.bounds : WORLD;
    if (!collidePoint(nx, player.pos.z, 0.3)) player.pos.x = Math.max(pb.minX, Math.min(pb.maxX, nx));
    if (!collidePoint(player.pos.x, nz, 0.3)) player.pos.z = Math.max(pb.minZ, Math.min(pb.maxZ, nz));
    if (Math.abs(dx) > Math.abs(dz)) player.dir = "side";
    else player.dir = dz > 0 ? "down" : "up";
    player.animT += dt * speed * 0.62;
    var frame = player.frameSeq[(player.animT | 0) % 4];
    playerMat.map = hunterTex[player.dir][frame];
    if (Math.random() < dt * 3) puff(player.pos.x, player.pos.z, 0.2);
  } else {
    playerMat.map = hunterTex[player.dir][0];
  }
  playerGroup.position.copy(player.pos);

  // 朝向（跟随瞄准）
  aimDir.set(player.aim.x - player.pos.x, 0, player.aim.z - player.pos.z);
  if (aimDir.lengthSq() > 0.001) aimDir.normalize();
  var gunAng = Math.atan2(aimDir.z, aimDir.x);
  gun.rotation.y = -gunAng;
  gun.position.set(player.pos.x + aimDir.x * 0.45, 0.78, player.pos.z + aimDir.z * 0.45);
  // 角色镜像跟随瞄准方向
  playerMesh.scale.x = aimDir.x < 0 ? -1 : 1;

  // 手电筒
  var torchActive = player.torchOn && player.battery > 0;
  torchGroup.visible = torchActive;
  if (torchActive) {
    player.battery = Math.max(0, player.battery - dt * 7);
    if (player.battery <= 0) { player.torchOn = false; showToast("电池耗尽了！"); beep(200, 0.2, "square", 0.1, 80); }
    torchGroup.position.set(player.pos.x, 0.78, player.pos.z);
    torchGroup.rotation.y = Math.PI / 2 - gunAng;
  }

  // 开火
  player.fireCd -= dt;
  if (mouse.down) shoot();
  // 装填
  if (player.reloading) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) finishReload();
  }
}

/* ---- 敌人更新 ---- */
function damageEnemy(e, dmg, knock) {
  e.hp -= dmg;
  e.hitFlash = 0.12;
  if (e.kind === "mutant" && !e.revealed) { e.revealed = true; e.state = "chase"; sfx.growl(); }
  if (e.kind === "animal") e.state = "flee";
  if (e.kind === "zombie" || e.kind === "ghost") e.state = "chase";
  if (knock) {
    e.group.position.x += knock.x;
    e.group.position.z += knock.z;
  }
  bloodBurst(e.group.position.x, 0.6, e.group.position.z, e.kind === "ghost" ? 8 : 5, e.kind === "ghost");
  if (e.kind !== "ghost") sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  var val = e.kind === "animal" ? 1 : e.kind === "mutant" ? 3 : e.kind === "zombie" ? 2 : 4;
  spawnSoul(e.group.position.x, e.group.position.z, val);
  if (e.kind === "mutant" && Math.random() < 0.45) {
    spawnDrop(e.group.position.x + 0.3, e.group.position.z + 0.3,
      Math.random() < 0.5 ? (Math.random() < 0.5 ? "ammoN" : "ammoS") : (Math.random() < 0.5 ? "battery" : "herb"));
  }
  if (e.kind === "zombie" && Math.random() < 0.2) spawnDrop(e.group.position.x, e.group.position.z, "ammoN");
  var idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);
  scene.remove(e.group);
  if (e.kind === "ghost") sfx.ghost(); else sfx.growl();
}

function enemyMove(e, dx, dz, dt, speed) {
  var p = e.group.position;
  var b = e.bounds || WORLD;
  var nx = p.x + dx * speed * dt;
  var nz = p.z + dz * speed * dt;
  nx = Math.max(b.minX, Math.min(b.maxX, nx));
  nz = Math.max(b.minZ, Math.min(b.maxZ, nz));
  if (e.kind === "ghost" || !collidePoint(nx, p.z, e.r * 0.7)) p.x = nx;
  if (e.kind === "ghost" || !collidePoint(p.x, nz, e.r * 0.7)) p.z = nz;
  if (dx !== 0) e.facingLeft = dx < 0;
}

function updateEnemies(dt) {
  var px = player.pos.x, pz = player.pos.z;
  var torchActive = player.torchOn && player.battery > 0;

  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    var p = e.group.position;
    var dxp = px - p.x, dzp = pz - p.z;
    var dist = Math.hypot(dxp, dzp);

    // 手电筒照明判定
    e.lit = false;
    if (torchActive) {
      var toE = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (toE < 7.4) {
        var dot = ((p.x - player.pos.x) * aimDir.x + (p.z - player.pos.z) * aimDir.z) / (toE || 1);
        if (dot > 0.86) e.lit = true;
      }
    }

    // 变异体被照出真身 → 暴怒
    if (e.kind === "mutant" && e.lit && !e.revealed) {
      e.revealed = true;
      e.state = "chase";
      sfx.growl();
      showToast("那不是普通的" + ({ cow: "牛", sheep: "羊", pig: "猪", deer: "鹿" })[e.animalType] + "！");
    }

    // 行为
    if (e.kind === "animal" || (e.kind === "mutant" && !e.revealed)) {
      // 游荡 / 逃跑
      if (e.state === "flee") {
        e.wait -= dt;
        var fx2 = -dxp / (dist || 1), fz2 = -dzp / (dist || 1);
        enemyMove(e, fx2, fz2, dt, 3.2);
        if (e.wait <= 0) { e.state = "wander"; e.target = null; }
      } else {
        if (dist < 3) { e.state = "flee"; e.wait = 2.2; }
        if (!e.target) {
          e.wait -= dt;
          if (e.wait <= 0) {
            e.target = { x: p.x + (Math.random() - 0.5) * 8, z: p.z + (Math.random() - 0.5) * 8 };
            e.wait = 2 + Math.random() * 3;
          }
        } else {
          var tx = e.target.x - p.x, tz = e.target.z - p.z;
          var td = Math.hypot(tx, tz);
          if (td < 0.3) { e.target = null; }
          else enemyMove(e, tx / td, tz / td, dt, e.speed);
        }
      }
    } else if (e.kind === "mutant") {
      // 暴怒追击
      if (dist > 1.0) {
        enemyMove(e, dxp / (dist || 1), dzp / (dist || 1), dt, e.speed);
      } else {
        e.atkCd -= dt;
        if (e.atkCd <= 0) { e.atkCd = 1.2; damagePlayer(12, e); }
      }
      if (dist > 22) { e.state = "wander"; e.revealed = false; } // 脱离
    } else if (e.kind === "zombie") {
      if (dist < 11) {
        if (dist > 0.95) enemyMove(e, dxp / (dist || 1), dzp / (dist || 1), dt, e.speed);
        else {
          e.atkCd -= dt;
          if (e.atkCd <= 0) { e.atkCd = 1.3; damagePlayer(8, e); }
        }
        if (Math.random() < dt * 0.15) sfx.zombie();
      } else {
        if (!e.target) {
          e.target = { x: p.x + (Math.random() - 0.5) * 6, z: p.z + (Math.random() - 0.5) * 6 };
        } else {
          var tx2 = e.target.x - p.x, tz2 = e.target.z - p.z;
          if (Math.hypot(tx2, tz2) < 0.3) e.target = null;
          else enemyMove(e, tx2 / Math.hypot(tx2, tz2), tz2 / Math.hypot(tx2, tz2), dt, 0.5);
        }
      }
    } else if (e.kind === "ghost") {
      // 鬼魂：穿墙漂移
      if (e.retreatT > 0) {
        e.retreatT -= dt;
        enemyMove(e, -dxp / (dist || 1), -dzp / (dist || 1), dt, 1.6);
      } else if (dist < 13) {
        enemyMove(e, dxp / (dist || 1), dzp / (dist || 1), dt, e.speed);
        if (dist < 0.85) {
          e.atkCd -= dt;
          if (e.atkCd <= 0) { e.atkCd = 1.8; damagePlayer(10, e); e.retreatT = 1.5; }
        }
        if (dist < 5 && Math.random() < dt * 0.1) sfx.ghost();
      }
      // 可见度：被照 → 清晰；夜晚 → 隐约
      var visTarget = e.lit ? 0.92 : (game.isNight ? 0.14 : 0.04);
      e.mat.opacity += (visTarget - e.mat.opacity) * Math.min(1, dt * 6);
    }

    // 动画与贴图
    e.animT += dt;
    var frame = (e.animT * 3 | 0) % 3;
    var texSet;
    if (e.kind === "animal") texSet = animalTexCache[e.animalType].n;
    else if (e.kind === "mutant") texSet = e.revealed ? animalTexCache[e.animalType].m : animalTexCache[e.animalType].n;
    else if (e.kind === "zombie") texSet = zombieTex;
    else texSet = ghostTex;
    e.mat.map = texSet[frame];
    e.mesh.scale.x = e.facingLeft ? -1 : 1;

    // 受击闪红
    if (e.hitFlash > 0) {
      e.hitFlash -= dt;
      e.mat.color.setHex(e.hitFlash > 0 ? 0xff8080 : 0xffffff);
    }

    // 鬼魂漂浮
    if (e.kind === "ghost") e.mesh.position.y = 0.85 + Math.sin(e.animT * 2.2) * 0.12;
  }
}

function damagePlayer(dmg, from) {
  if (!player.alive || game.ended) return;
  player.hp -= dmg;
  hurtFlash();
  sfx.hurt();
  // 击退
  if (from) {
    var dx = player.pos.x - from.group.position.x;
    var dz = player.pos.z - from.group.position.z;
    var d = Math.hypot(dx, dz) || 1;
    var nx = player.pos.x + dx / d * 0.5, nz = player.pos.z + dz / d * 0.5;
    if (!collidePoint(nx, player.pos.z, 0.3)) player.pos.x = nx;
    if (!collidePoint(player.pos.x, nz, 0.3)) player.pos.z = nz;
  }
  if (player.hp <= 0) playerDown();
}

function playerDown() {
  player.hp = 0;
  var lost = Math.min(player.souls, Math.round(player.souls * 0.15));
  player.souls -= lost;
  showToast("你倒下了……被拖回营火旁，诅咒吞噬了 " + lost + " 个灵魂");
  // 击退周围敌人
  enemies.forEach(function (e) {
    if (e.kind === "mutant") { e.revealed = false; e.state = "wander"; }
  });
  player.hp = 100;
  player.battery = Math.max(player.battery, 30);
  player.inCastle = null;
  player.pos.set(0, 0, 24);
  player.ammoN += 5; player.ammoS += 3;
  beep(80, 1.0, "sawtooth", 0.16, 40);
}

/* ---- 子弹 ---- */
function updateBullets(dt) {
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    var step = 20 * dt;
    b.mesh.position.x += b.dx * step;
    b.mesh.position.z += b.dz * step;
    b.life -= dt;
    var dead = b.life <= 0;
    if (!dead && collidePoint(b.mesh.position.x, b.mesh.position.z, 0.05)) dead = true;
    if (!dead) {
      for (var j = 0; j < enemies.length; j++) {
        var e = enemies[j];
        var d = Math.hypot(e.group.position.x - b.mesh.position.x, e.group.position.z - b.mesh.position.z);
        if (d < e.r + 0.15) {
          if (e.kind === "ghost" && !b.spirit) {
            // 普通子弹穿过鬼魂
            continue;
          }
          var kx = b.dx * 0.25, kz = b.dz * 0.25;
          if (e.kind === "ghost") { kx = 0; kz = 0; }
          damageEnemy(e, b.dmg, { x: kx, z: kz });
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

/* ---- 灵魂 ---- */
function updateSouls(dt) {
  for (var i = souls.length - 1; i >= 0; i--) {
    var s = souls[i];
    s.t += dt;
    var sp = s.sprite.position;
    if (s.t < 0.35) {
      sp.x += s.vx * dt; sp.z += s.vz * dt;
      s.vx *= 0.94; s.vz *= 0.94;
    } else {
      var dx = player.pos.x - sp.x, dz = player.pos.z - sp.z;
      var d = Math.hypot(dx, dz) || 1;
      var spd = Math.min(14, 3 + s.t * 8);
      sp.x += dx / d * spd * dt;
      sp.z += dz / d * spd * dt;
      sp.y = 0.7 + Math.sin(s.t * 6) * 0.08;
      if (d < 0.7) {
        player.souls += s.val;
        sfx.soul();
        scene.remove(s.sprite);
        souls.splice(i, 1);
        if (player.souls >= 100 && player.souls - s.val < 100) {
          showToast("✦ 100 个灵魂集齐了！回到祭坛，做出你的选择……");
          beep(880, 0.3, "triangle", 0.14, 1320);
        }
        continue;
      }
    }
    if (s.t > 30) { scene.remove(s.sprite); souls.splice(i, 1); } // 防泄漏
  }
}

/* ---- 掉落物 ---- */
function updateDrops(dt) {
  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    d.t += dt;
    d.mesh.position.y = 0.3 + Math.sin(d.t * 3) * 0.06;
    d.mesh.rotation.y += dt * 1.5;
    d.glow.position.y = d.mesh.position.y;
    var dist = Math.hypot(player.pos.x - d.mesh.position.x, player.pos.z - d.mesh.position.z);
    if (dist < 0.85) {
      if (d.type === "ammoN") { player.ammoN += 6; showToast("拾取 普通子弹 ×6"); }
      else if (d.type === "ammoS") { player.ammoS += 4; showToast("拾取 灵弹 ×4"); }
      else if (d.type === "battery") { player.battery = Math.min(100, player.battery + 50); showToast("拾取 电池（+50）"); }
      else { player.hp = Math.min(100, player.hp + 30); showToast("拾取 药草（生命 +30）"); }
      sfx.pick();
      scene.remove(d.mesh); scene.remove(d.glow);
      drops.splice(i, 1);
    }
  }
}

/* ---- 交互提示 ---- */
var projV = new THREE.Vector3();
function updatePrompt() {
  ui.promptE.style.display = "none";
  if (!game.started || dialog || game.paused || game.ended) return;
  var target = null;
  var dAltar = Math.hypot(player.pos.x - ALTAR.x, player.pos.z - ALTAR.z);
  if (dAltar < 3.2) target = { x: ALTAR.x, y: 5.2, z: ALTAR.z };
  if (!target) {
    for (var pi = 0; pi < portals.length; pi++) {
      var po = portals[pi];
      if (Math.hypot(player.pos.x - po.x, player.pos.z - po.z) < po.r) {
        target = { x: po.x, y: po.enter ? 2.9 : 1.9, z: po.z };
        break;
      }
    }
  }
  if (!target) {
    for (var i = 0; i < crates.length; i++) {
      var c = crates[i];
      if (c.opened) continue;
      if (Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < 1.5) { target = { x: c.x, y: 1.4, z: c.z }; break; }
    }
  }
  if (!target && Math.hypot(player.pos.x - signPos.x, player.pos.z - signPos.z) < 1.5) {
    target = { x: signPos.x, y: 1.9, z: signPos.z };
  }
  if (target) {
    projV.set(target.x, target.y, target.z).project(camera);
    if (projV.z < 1) {
      ui.promptE.style.display = "block";
      ui.promptE.style.left = ((projV.x * 0.5 + 0.5) * window.innerWidth - 16) + "px";
      ui.promptE.style.top = ((-projV.y * 0.5 + 0.5) * window.innerHeight - 42) + "px";
    }
  }
}

/* ============================================================
 * 小地图（M 键开关；古堡内部自动切换为室内图）
 * ============================================================ */
var mmCanvas = document.getElementById("minimap");
var mmCtx = mmCanvas.getContext("2d");
var mmVisible = true;

function drawPlayerArrow(mx, mz) {
  mmCtx.save();
  mmCtx.translate(mx(player.pos.x), mz(player.pos.z));
  mmCtx.rotate(Math.atan2(aimDir.z, aimDir.x));
  mmCtx.fillStyle = "#ffffff";
  mmCtx.beginPath();
  mmCtx.moveTo(5, 0);
  mmCtx.lineTo(-3, 3);
  mmCtx.lineTo(-3, -3);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
}

function drawMinimap() {
  var W = mmCanvas.width, H = mmCanvas.height;
  mmCtx.clearRect(0, 0, W, H);
  if (player.inCastle) {
    // ---- 古堡内部图 ----
    var it = player.inCastle.interior;
    var sc = Math.min((W - 20) / it.w, (H - 20) / it.d);
    var mx = function (x) { return W / 2 + (x - it.x) * sc; };
    var mz = function (z) { return H / 2 + (z - it.z) * sc; };
    // 地板
    mmCtx.fillStyle = "#241e2a";
    mmCtx.fillRect(mx(it.x - it.w / 2), mz(it.z - it.d / 2), it.w * sc, it.d * sc);
    // 地毯
    mmCtx.fillStyle = "#4a1820";
    mmCtx.fillRect(mx(it.x - 1.3), mz(it.z - it.d / 2 + 2), 2.6 * sc, (it.d - 5) * sc);
    // 墙体
    mmCtx.strokeStyle = "#6a6a80";
    mmCtx.lineWidth = 2;
    mmCtx.strokeRect(mx(it.x - it.w / 2), mz(it.z - it.d / 2), it.w * sc, it.d * sc);
    // 石柱
    mmCtx.fillStyle = "#8a8aa0";
    [-6, 0, 6].forEach(function (ox) {
      [-4, 4].forEach(function (oz) {
        mmCtx.fillRect(mx(it.x + ox) - 2, mz(it.z + oz) - 2, 4, 4);
      });
    });
    // 出口传送门
    mmCtx.fillStyle = "#7ae8f0";
    mmCtx.fillRect(mx(it.x) - 3, mz(it.z + it.d / 2 - 1) - 3, 6, 6);
    // 箱子
    crates.forEach(function (c) {
      if (c.opened) return;
      if (Math.abs(c.x - it.x) > 12 || Math.abs(c.z - it.z) > 14) return;
      mmCtx.fillStyle = c.gold ? "#ffd870" : "#b09040";
      mmCtx.fillRect(mx(c.x) - 2, mz(c.z) - 2, 4, 4);
    });
    // 敌人
    mmCtx.fillStyle = "#e05050";
    enemies.forEach(function (e) {
      if (e.bounds !== it.bounds) return;
      mmCtx.fillRect(mx(e.group.position.x) - 1.5, mz(e.group.position.z) - 1.5, 3, 3);
    });
    drawPlayerArrow(mx, mz);
    ui.mmName.textContent = player.inCastle.name + " · CASTLE";
  } else {
    // ---- 主世界图 ----
    var s = W / 116;
    var wx = function (x) { return W / 2 + x * s; };
    var wz = function (z) { return H / 2 + z * s; };
    // 丛林底色
    mmCtx.fillStyle = "#1c2a18";
    mmCtx.fillRect(0, 0, W, H);
    // 祭坛空地
    mmCtx.fillStyle = "#4c4030";
    mmCtx.beginPath();
    mmCtx.arc(wx(ALTAR.x), wz(ALTAR.z), 10 * s, 0, 6.29);
    mmCtx.fill();
    // 别墅区
    mmCtx.fillStyle = "#33383e";
    mmCtx.fillRect(wx(-38), wz(-32), 34 * s, 26 * s);
    // 墓园区
    mmCtx.fillStyle = "#2a2a24";
    mmCtx.fillRect(wx(12), wz(-30), 24 * s, 22 * s);
    // 小路
    mmCtx.strokeStyle = "#6a5844";
    mmCtx.lineWidth = 2;
    mmPaths.forEach(function (p) {
      mmCtx.beginPath();
      if (p.ry) {
        mmCtx.moveTo(wx(p.x - p.l / 2), wz(p.z));
        mmCtx.lineTo(wx(p.x + p.l / 2), wz(p.z));
      } else {
        mmCtx.moveTo(wx(p.x), wz(p.z - p.l / 2));
        mmCtx.lineTo(wx(p.x), wz(p.z + p.l / 2));
      }
      mmCtx.stroke();
    });
    // 古堡
    castles.forEach(function (c) {
      mmCtx.fillStyle = "#5a3a4a";
      mmCtx.fillRect(wx(c.x) - 5, wz(c.z) - 5, 10, 10);
      mmCtx.strokeStyle = "#c8a0f0";
      mmCtx.lineWidth = 1;
      mmCtx.strokeRect(wx(c.x) - 5, wz(c.z) - 5, 10, 10);
    });
    // 祭坛
    mmCtx.fillStyle = "#c8a0f0";
    mmCtx.beginPath();
    mmCtx.arc(wx(ALTAR.x), wz(ALTAR.z), 2.5, 0, 6.29);
    mmCtx.fill();
    // 营火出生点
    mmCtx.fillStyle = "#ff9040";
    mmCtx.fillRect(wx(2.6) - 2, wz(22.5) - 2, 4, 4);
    // 箱子
    mmCtx.fillStyle = "#c8a050";
    crates.forEach(function (c) {
      if (c.opened) return;
      if (Math.abs(c.x) > 58 || Math.abs(c.z) > 58) return; // 排除古堡内的
      mmCtx.fillRect(wx(c.x) - 1.5, wz(c.z) - 1.5, 3, 3);
    });
    // 敌人
    mmCtx.fillStyle = "rgba(230,80,70,.85)";
    enemies.forEach(function (e) {
      if (e.bounds) return; // 古堡内的不显示
      mmCtx.fillRect(wx(e.group.position.x) - 1.5, wz(e.group.position.z) - 1.5, 3, 3);
    });
    drawPlayerArrow(wx, wz);
    ui.mmName.textContent = "丛林 · JUNGLE";
  }
}

/* ============================================================
 * 九、结局
 * ============================================================ */
function statText() {
  var mins = (game.time / 60) | 0, secs = (game.time % 60) | 0;
  return "用时 " + mins + " 分 " + (secs < 10 ? "0" : "") + secs + " 秒";
}
function showEnd(cls, title, text) {
  game.ended = true;
  mouse.down = false;
  ui.end.className = "";
  ui.end.classList.add(cls);
  ui.endTitle.textContent = title;
  ui.endText.innerHTML = text;
  ui.end.style.display = "flex";
  requestAnimationFrame(function () { ui.end.classList.add("show"); });
}
function endingDoom() {
  sfx.doom();
  // 红色爆发
  burstGlow(ALTAR.x, 3, ALTAR.z, T.glowRed, 10);
  altarLight.color.setHex(0xff3020);
  altarLight.intensity = 2.2;
  nightmareGlow.material.map = T.glowRed;
  setTimeout(function () {
    showEnd("doom", "世界末日", [
      "一百个灵魂涌入梦魇的躯体。",
      "它睁开了真正的眼睛——",
      "天空撕裂，大地哀嚎，黑夜再也没有退去。",
      "而你，成了它苏醒后的第一份祭品。",
      "<br>" + statText()
    ].join("<br>"));
  }, 1600);
}
function endingPeace() {
  sfx.peace();
  // 白光升腾
  burstGlow(ALTAR.x, 3, ALTAR.z, T.glowCyan, 10);
  altarLight.color.setHex(0xa0f0ff);
  altarLight.intensity = 2;
  // 灵魂四散飞升
  for (var i = 0; i < 24; i++) soulFlyUp();
  setTimeout(function () {
    showEnd("peace", "世界和平", [
      "你松开了双手，一百个灵魂化作流光升向天空。",
      "梦魇在晨光中消散，只留下一声悠长的叹息。",
      "丛林重新醒了过来——鸟鸣、鹿影、风穿过树叶。",
      "猎人在祭坛旁睡了一觉，那是七天来第一次好梦。",
      "<br>" + statText()
    ].join("<br>"));
  }, 2000);
}
function endingCurse() {
  showEnd("curse", "诅咒降临", [
    "第七天的黄昏，期限已至。",
    "一百个灵魂？你还差 " + (100 - player.souls) + " 个。",
    "梦魇从祭坛上缓缓站起，向你伸出了手——",
    "「没关系，」它说，「你自己，就很完整。」",
    "<br>从此，丛林里多了一个游荡的影子。"
  ].join("<br>"));
  sfx.doom();
}
function burstGlow(x, y, z, map, scale) {
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: map, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false
  }));
  sp.scale.set(scale, scale, 1);
  sp.position.set(x, y, z);
  scene.add(sp);
  fx.push({
    t: 0, ttl: 1.6,
    update: function (dt) {
      this.t += dt;
      var k = this.t / this.ttl;
      sp.scale.set(scale * (0.5 + k), scale * (0.5 + k), 1);
      sp.material.opacity = 0.95 * (1 - k);
      return k < 1;
    },
    dispose: function () { scene.remove(sp); }
  });
}
function soulFlyUp() {
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.glowCyan, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false
  }));
  sp.scale.set(0.5, 0.5, 1);
  sp.position.set(ALTAR.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 2, ALTAR.z + (Math.random() - 0.5) * 4);
  scene.add(sp);
  fx.push({
    t: 0, ttl: 1.4 + Math.random(),
    update: function (dt) {
      this.t += dt;
      sp.position.y += dt * 4;
      sp.position.x += dt * 0.4;
      sp.material.opacity = 0.9 * (1 - this.t / this.ttl);
      return this.t < this.ttl;
    },
    dispose: function () { scene.remove(sp); }
  });
}

/* ============================================================
 * 十、主循环
 * ============================================================ */
var clock = new THREE.Clock();
var camGoal = new THREE.Vector3();

function loop() {
  requestAnimationFrame(loop);
  var dt = Math.min(clock.getDelta(), 0.05);
  clock._frameDt = dt;
  var t = clock.elapsedTime;

  if (game.started && !game.paused && !game.ended) {
    // 时间与天数
    game.time += dt;
    var newDay = Math.min(TOTAL_DAYS, (game.time / DAY_LEN | 0) + 1);
    var wasNight = game.isNight;
    var dayT = (game.time % DAY_LEN) / DAY_LEN;
    game.isNight = dayT > 0.62 && dayT < 0.97;
    if (newDay !== game.day) {
      game.day = newDay;
      if (newDay > 1) { showToast("—— 第 " + newDay + " 天 ——"); sfx.day(); }
    }
    if (game.isNight !== wasNight) {
      showToast(game.isNight ? "夜幕降临……怪物变得躁动" : "天亮了");
      if (game.isNight) sfx.night();
    }
    // 期限到
    if (game.time >= TOTAL_DAYS * DAY_LEN) { endingCurse(); }

    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateSouls(dt);
    updateDrops(dt);
    reinforcement(dt);
    updateEnv();
    updateHUD();
    drawMinimap();
  }
  updateDialog(game.paused ? 0 : dt);
  updatePrompt();
  updateAim();

  // 特效
  for (var j = fx.length - 1; j >= 0; j--) {
    if (!fx[j].update(dt)) { fx[j].dispose(); fx.splice(j, 1); }
  }
  // 营火摇曳
  if (window._fire) {
    var fl = window._fire.userData.flame;
    fl.scale.set(1.0 + Math.sin(t * 9) * 0.15, 1.3 + Math.sin(t * 7) * 0.2, 1);
    fireLight.intensity = 0.8 + Math.sin(t * 11) * 0.18;
  }
  // 梦魇呼吸
  if (nightmareGroup) {
    var nf = nightmareGroup.userData.frames;
    nightmareMesh.material.map = nf[((t * 1.6) | 0) % 2];
    nightmareMesh.position.y = 3.1 + Math.sin(t * 1.4) * 0.15;
    nightmareGlow.position.y = nightmareMesh.position.y;
    nightmareGlow.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.15;
    altarLight.intensity = (game.ended ? altarLight.intensity : 0.7 + Math.sin(t * 3) * 0.2);
  }
  // 尘埃
  if (motes) {
    var pa = motes.geometry.attributes.position;
    for (var m = 0; m < moteData.length; m++) {
      var md = moteData[m];
      pa.array[m * 3 + 1] = 1.5 + Math.sin(t * md.sp + md.ph) * 1.1;
    }
    pa.needsUpdate = true;
  }

  // 相机
  camGoal.set(player.pos.x, 1.1, player.pos.z);
  var desired = new THREE.Vector3(camGoal.x, camGoal.y + 8.6, camGoal.z + 8.8);
  var k = 1 - Math.exp(-4.2 * dt);
  camera.position.lerp(desired, k);
  camera.lookAt(camGoal);

  renderer.render(scene, camera);
}

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loop();

})();
