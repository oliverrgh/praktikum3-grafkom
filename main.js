import { Mat3 } from "./matrix3.js";

/* =========================================================================
 * INTERACTIVE TRANSFORMATION PLAYGROUND — WebGL2
 *
 * Alur koordinat:
 *   Local (vertex mentah)  →  Model Matrix  →  World  →  View (aspect)  →  NDC
 *
 * Struktur file:
 *   1. WebGL2 context & konstanta
 *   2. Shader (homogeneous coordinate + uniform matrix)
 *   3. Geometry (disimpan sekali di GPU buffer, dipakai ulang)
 *   4. State (object, mode, input)
 *   5. Matrix builder (TRS, transform order, pivot, hierarchy, orbit)
 *   6. Update (deltaTime, keyboard, animasi)
 *   7. Draw
 *   8. HUD & sinkronisasi UI
 *   9. Event handler (keyboard, mouse, tombol)
 *  10. Main loop
 * ========================================================================= */

/* ---------- 1. WebGL2 context & konstanta ---------- */

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2", { antialias: true });

if (!gl) {
  throw new Error("WebGL2 tidak tersedia.");
}

// Canvas tidak persegi (1100x650). Tanpa koreksi, rotasi terlihat "gepeng/miring"
// karena 1 unit NDC di sumbu X lebih panjang dari 1 unit NDC di sumbu Y.
// Solusi: View matrix = Scale(1/aspect, 1) → world space X: [-aspect, +aspect], Y: [-1, +1].
const ASPECT = canvas.width / canvas.height;
const viewMatrix = Mat3.scaling(1 / ASPECT, 1);

const ORBIT_RADIUS = 0.55;
const ORBIT_SPEED_DEG = 55.0;

const LIMIT = {
  x: ASPECT - 0.2,
  y: 0.8,
  scaleMin: 0.2,
  scaleMax: 2.5
};

/* ---------- 2. Shader ---------- */

const vertexShaderSource = `#version 300 es
in vec2 a_position;          // local coordinate
uniform mat3 u_model;        // Model Matrix (dari JavaScript)
uniform mat3 u_view;         // koreksi aspect ratio
void main() {
  vec3 p = u_view * u_model * vec3(a_position, 1.0);   // homogeneous: w = 1
  gl_Position = vec4(p.xy, 0.0, 1.0);
  gl_PointSize = 9.0;
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}`;

function createShader(glContext, type, source) {
  const shader = glContext.createShader(type);
  glContext.shaderSource(shader, source);
  glContext.compileShader(shader);
  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    const message = glContext.getShaderInfoLog(shader);
    glContext.deleteShader(shader);
    throw new Error(`Shader compile error:\n${message}`);
  }
  return shader;
}

function createProgram(glContext, vertexShader, fragmentShader) {
  const programObject = glContext.createProgram();
  glContext.attachShader(programObject, vertexShader);
  glContext.attachShader(programObject, fragmentShader);
  glContext.linkProgram(programObject);
  if (!glContext.getProgramParameter(programObject, glContext.LINK_STATUS)) {
    const message = glContext.getProgramInfoLog(programObject);
    glContext.deleteProgram(programObject);
    throw new Error(`Program link error:\n${message}`);
  }
  return programObject;
}

const program = createProgram(
  gl,
  createShader(gl, gl.VERTEX_SHADER, vertexShaderSource),
  createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
);
gl.useProgram(program);

const positionLocation = gl.getAttribLocation(program, "a_position");
const modelLocation = gl.getUniformLocation(program, "u_model");
const viewLocation = gl.getUniformLocation(program, "u_view");
const colorLocation = gl.getUniformLocation(program, "u_color");

// Alpha pada warna grid/axis hanya bekerja jika blending aktif.
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

/* ---------- 3. Geometry (local coordinate, GPU buffer) ---------- */

// Satu VAO + satu buffer per geometry, dibuat SEKALI lalu dipakai ulang tiap frame.
function createGeometry(data, mode) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, mode, count: data.length / 2 };
}

function buildGridVertices() {
  const lines = [];
  const step = 0.1;
  const xMax = Math.floor(ASPECT / step);
  for (let i = -xMax; i <= xMax; i++) lines.push(i * step, -1, i * step, 1);
  for (let j = -10; j <= 10; j++) lines.push(-ASPECT, j * step, ASPECT, j * step);
  return new Float32Array(lines);
}

function buildCircleVertices(segments = 96) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(Math.cos(a), Math.sin(a));
  }
  return new Float32Array(points);
}

const geometry = {
  // Segitiga: koordinat LOKAL, pusat (0,0) = titik pivot lokal
  triangle: createGeometry(new Float32Array([
    -0.18, -0.15,
     0.18, -0.15,
     0.00,  0.22
  ]), gl.TRIANGLES),

  grid: createGeometry(buildGridVertices(), gl.LINES),
  axisX: createGeometry(new Float32Array([-ASPECT, 0, ASPECT, 0]), gl.LINES),
  axisY: createGeometry(new Float32Array([0, -1, 0, 1]), gl.LINES),
  basisX: createGeometry(new Float32Array([0, 0, 0.13, 0]), gl.LINES),
  basisY: createGeometry(new Float32Array([0, 0, 0, 0.13]), gl.LINES),
  point: createGeometry(new Float32Array([0, 0]), gl.POINTS),
  circle: createGeometry(buildCircleVertices(), gl.LINE_LOOP)
};

const color = {
  A: new Float32Array([0.10, 0.84, 1.00, 1.00]),
  B: new Float32Array([1.00, 0.48, 0.15, 1.00]),
  C: new Float32Array([0.68, 0.42, 1.00, 1.00]),
  child: new Float32Array([0.25, 1.00, 0.67, 1.00]),
  pivot: new Float32Array([1.00, 0.92, 0.20, 1.00]),
  grid: new Float32Array([0.16, 0.43, 0.55, 0.20]),
  axisX: new Float32Array([1.00, 0.36, 0.36, 0.75]),
  axisY: new Float32Array([0.36, 1.00, 0.55, 0.75]),
  basisX: new Float32Array([1.00, 0.36, 0.36, 0.95]),
  basisY: new Float32Array([0.36, 1.00, 0.55, 0.95]),
  orbitGuide: new Float32Array([0.68, 0.42, 1.00, 0.35]),
  origin: new Float32Array([1.00, 1.00, 1.00, 0.90])
};

/* ---------- 4. State ---------- */

const INITIAL_A = { x: -0.35, y: 0.0, rotation: 0.0, scaleX: 1.0, scaleY: 1.0 };

// Challenge B — Transform Preset
const PRESETS = {
  1: { x: -0.40, y: 0.20, rotation: 0.0,  scaleX: 1.0, scaleY: 1.0 },
  2: { x:  0.00, y: 0.00, rotation: 45.0, scaleX: 1.5, scaleY: 1.5 },
  3: { x:  0.30, y: -0.20, rotation: 90.0, scaleX: 1.8, scaleY: 0.6 }
};

// Object A: dikontrol keyboard / mouse
const objectA = { ...INITIAL_A };

// Object C: object statis untuk membandingkan transform order
const objectC = { x: 0.60, y: 0.03, rotation: 35.0, scaleX: 1.25, scaleY: 0.68 };

// Challenge E — local transform child (relatif terhadap parent)
const childLocal = { x: 0.28, y: 0.02, rotation: 30.0, scaleX: 0.45, scaleY: 0.45 };

// Demo pivot (engsel pintu)
const pivotDemo = {
  enabled: false,
  pivotX: 0.18, pivotY: 0.0,
  x: 0.00, y: 0.31,
  rotation: 0.0, scaleX: 1.0, scaleY: 1.0
};

const state = {
  orderMode: 0,          // 0: Order T×R×S   1: Order T×R
  orbitMode: false,      // Challenge F
  showParentChild: false, // Challenge E
  showAxes: true,
  showPivot: true,
  autoObjectB: true,
  paused: false,
  rotationSpeed: 100.0,
  scaleSpeed: 0.8,
  moveSpeed: 0.65,       // Pengaturan speed translasi (bisa ditoggle)
  animationTime: 0,
  frameCount: 0
};

// Label berganti antara parameter lengkap dan tanpa scale
const ORDER_LABEL = [
  "T × R × S",
  "T × R"
];

// State-based input: keydown/keyup hanya mengisi tabel ini,
// perubahan objek dilakukan di update() memakai deltaTime.
const keys = {};
const isDown = (...codes) => codes.some((code) => keys[code]);

/* ---------- 5. Matrix builder ---------- */

const degToRad = (degree) => (degree * Math.PI) / 180;

// compose(A, B, C) = A · B · C  (dibaca kanan → kiri: C dulu, lalu B, lalu A)
const compose = (...matrices) => matrices.reduce((acc, m) => Mat3.multiply(acc, m));

function translationOf(t) { return Mat3.translation(t.x, t.y); }
function rotationOf(t) { return Mat3.rotation(degToRad(t.rotation)); }
function scalingOf(t) { return Mat3.scaling(t.scaleX, t.scaleY); }

// Transform Order T × R × S (Lengkap dengan Scale)
function createTRSMatrix(t) {
  const T = translationOf(t);
  const R = rotationOf(t);
  const S = scalingOf(t);
  return compose(T, R, S);
}

// Transform Order T × R (Tanpa Scale)
function createTRMatrix(t) {
  const T = translationOf(t);
  const R = rotationOf(t);
  return compose(T, R);
}

// Pilih order berdasarkan mode: 0 → T×R×S, 1 → T×R
function createModelMatrix(t, order) {
  return order === 0 ? createTRSMatrix(t) : createTRMatrix(t);
}

// Rotasi/scale terhadap titik pivot: T(pos) · T(pivot) · R · S · T(-pivot)
function createPivotMatrix(t) {
  return compose(
    Mat3.translation(t.x, t.y),
    Mat3.translation(t.pivotX, t.pivotY),
    rotationOf(t),
    scalingOf(t),
    Mat3.translation(-t.pivotX, -t.pivotY)
  );
}

// Challenge F — orbit:  T(center) · R(orbit) · T(radius, 0) · R(self) · S
// center diambil dari posisi world Object A (kolom translasi matrix A).
function createOrbitMatrix(center, seconds) {
  return compose(
    Mat3.translation(center.x, center.y),
    Mat3.rotation(degToRad(seconds * ORBIT_SPEED_DEG)),
    Mat3.translation(ORBIT_RADIUS, 0),
    Mat3.rotation(degToRad(seconds * 140.0)),
    Mat3.scaling(0.6, 0.6)
  );
}

/* ---------- 6. Update ---------- */

function updateTranslation(dt) {
  if (isDown("ArrowLeft", "KeyA")) objectA.x -= state.moveSpeed * dt;
  if (isDown("ArrowRight", "KeyD")) objectA.x += state.moveSpeed * dt;
  if (isDown("ArrowUp", "KeyW")) objectA.y += state.moveSpeed * dt;
  if (isDown("ArrowDown", "KeyS")) objectA.y -= state.moveSpeed * dt;
}

function updateRotation(dt) {
  if (isDown("KeyQ")) objectA.rotation -= state.rotationSpeed * dt;
  if (isDown("KeyE")) objectA.rotation += state.rotationSpeed * dt;
}

// Scale masih bisa diupdate, namun jika mode T x R aktif, perubahannya tidak akan terlihat pada Object A
function updateUniformScale(dt) {
  const d = state.scaleSpeed * dt;
  if (isDown("Equal", "NumpadAdd")) { objectA.scaleX += d; objectA.scaleY += d; }
  if (isDown("Minus", "NumpadSubtract")) { objectA.scaleX -= d; objectA.scaleY -= d; }
}

function updateNonUniformScale(dt) {
  const d = state.scaleSpeed * dt;
  if (isDown("KeyZ")) objectA.scaleX -= d;
  if (isDown("KeyX")) objectA.scaleX += d;
  if (isDown("KeyC")) objectA.scaleY -= d;
  if (isDown("KeyV")) objectA.scaleY += d;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function clampObjectA() {
  objectA.x = clamp(objectA.x, -LIMIT.x, LIMIT.x);
  objectA.y = clamp(objectA.y, -LIMIT.y, LIMIT.y);
  objectA.scaleX = clamp(objectA.scaleX, LIMIT.scaleMin, LIMIT.scaleMax);
  objectA.scaleY = clamp(objectA.scaleY, LIMIT.scaleMin, LIMIT.scaleMax);
  objectA.rotation = ((objectA.rotation % 360) + 360) % 360; // 0..360
}

// Challenge A — Reset Transform
function resetTransform() {
  Object.assign(objectA, INITIAL_A);
  state.orderMode = 0;
}

// Challenge B — Transform Preset
function applyPreset(number) {
  Object.assign(objectA, PRESETS[number]);
}

function update(dt, seconds) {
  // Hanya izinkan input pergerakan jika tidak di-pause
  if (!state.paused) {
    updateTranslation(dt);
    updateRotation(dt);
    updateUniformScale(dt);
    updateNonUniformScale(dt);
  }
  clampObjectA();

  // Animasi otomatis untuk mode hierarchy & pivot
  childLocal.rotation = 30.0 + seconds * 90.0;
  if (pivotDemo.enabled) pivotDemo.rotation = seconds * 70.0;
}

/* ---------- 7. Draw ---------- */

function draw(geo, model, colorValue) {
  gl.bindVertexArray(geo.vao);
  gl.uniformMatrix3fv(modelLocation, false, model);   // matrix → uniform
  gl.uniform4fv(colorLocation, colorValue);
  gl.drawArrays(geo.mode, 0, geo.count);
}

function drawPointAt(model, colorValue) {
  draw(geometry.point, model, colorValue);
}

function drawLocalBasis(model) {
  draw(geometry.basisX, model, color.basisX);
  draw(geometry.basisY, model, color.basisY);
}

function drawWorldAxes() {
  const identity = Mat3.identity();
  draw(geometry.axisX, identity, color.axisX);
  draw(geometry.axisY, identity, color.axisY);
  drawPointAt(identity, color.origin); // origin (0,0)
}

// Object A dan C memakai geometry.triangle yang SAMA (reuse), hanya beda Model Matrix.
function drawTriangle(model, colorValue) {
  draw(geometry.triangle, model, colorValue);
  if (state.showPivot) drawPointAt(model, color.pivot);
}

function drawScene() {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.006, 0.012, 0.026, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniformMatrix3fv(viewLocation, false, viewMatrix);

  draw(geometry.grid, Mat3.identity(), color.grid);
  if (state.showAxes) drawWorldAxes();

  // --- Object A (interactive) / Parent pada Challenge E ---
  const matrixA = createModelMatrix(objectA, state.orderMode);
  drawTriangle(matrixA, color.A);
  drawLocalBasis(matrixA);

  // --- Challenge E: Child = Parent · LocalChild ---
  if (state.showParentChild) {
    // Child tetap menggunakan TRS agar ukurannya tidak mengecil secara tidak wajar
    const childWorld = compose(matrixA, createTRSMatrix(childLocal));
    drawTriangle(childWorld, color.child);
  }

  // --- Object C: order test / orbiter (Challenge F) ---
  let matrixC;
  if (state.orbitMode) {
    const center = { x: matrixA[6], y: matrixA[7] }; // posisi world Object A
    const guide = compose(Mat3.translation(center.x, center.y), Mat3.scaling(ORBIT_RADIUS, ORBIT_RADIUS));
    draw(geometry.circle, guide, color.orbitGuide);
    matrixC = createOrbitMatrix(center, state.animationTime);
  } else {
    // Object C dibuat statis selalu menggunakan TRS secara utuh
    matrixC = createTRSMatrix(objectC);
  }
  drawTriangle(matrixC, color.C);

  // --- Object B (animasi otomatis) ---
  if (state.autoObjectB) {
    if (pivotDemo.enabled) {
      drawTriangle(createPivotMatrix(pivotDemo), color.B);
      if (state.showPivot) {
        // marker pivot: (pivotX, pivotY) lokal → world lewat T(pos)
        drawPointAt(
          Mat3.translation(pivotDemo.x + pivotDemo.pivotX, pivotDemo.y + pivotDemo.pivotY),
          color.pivot
        );
      }
    } else {
      const pulse = 1.0 + Math.sin(state.animationTime * 2.0) * 0.25;
      const transformB = {
        x: -0.04, y: 0.42,
        rotation: state.animationTime * 70.0,
        scaleX: pulse, scaleY: pulse
      };
      drawTriangle(createTRSMatrix(transformB), color.B);
    }
  }

  gl.bindVertexArray(null);
}

/* ---------- 8. HUD & sinkronisasi UI ---------- */

const $ = (id) => document.getElementById(id);

const ui = {
  positionInfo: $("positionInfo"),
  rotationInfo: $("rotationInfo"),
  scaleInfo: $("scaleInfo"),
  orderInfo: $("orderInfo"),
  pivotInfo: $("pivotInfo"),
  modeInfo: $("modeInfo"),
  fpsInfo: $("fpsInfo"),
  frameInfo: $("frameInfo"),
  runStatus: $("runStatus"),
  rotationSpeed: $("rotationSpeed"),
  rotationSpeedValue: $("rotationSpeedValue"),
  scaleSpeed: $("scaleSpeed"),
  scaleSpeedValue: $("scaleSpeedValue"),
  autoObjectB: $("autoObjectB"),
  showAxes: $("showAxes"),
  showPivot: $("showPivot"),
  showParentChild: $("showParentChild"),
  mouseMode: $("mouseMode"), // Boleh dihapus di HTML jika tidak dipakai lagi
  pauseButton: $("pauseButton"),
  resetButton: $("resetButton"),
  orderButton: $("orderButton"),
  orbitButton: $("orbitButton"),
  pivotButton: $("pivotButton")
};

let displayedFps = 60;
let fpsAccumulator = 0;
let fpsFrames = 0;

function updateHUD() {
  ui.positionInfo.textContent = `(${objectA.x.toFixed(2)}, ${objectA.y.toFixed(2)})`;
  ui.rotationInfo.textContent = `${objectA.rotation.toFixed(1)}°`;
  ui.scaleInfo.textContent = `(${objectA.scaleX.toFixed(2)}, ${objectA.scaleY.toFixed(2)})`;
  
  // Tampilkan Order Aktif pada HUD (T x R x S atau T x R)
  ui.orderInfo.textContent = ORDER_LABEL[state.orderMode];
  
  ui.pivotInfo.textContent = pivotDemo.enabled ? "Door hinge demo ON" : "Local origin (0,0)";

  const modes = ["Keyboard", "Mouse click"]; // Mouse click selalu aktif
  if (state.orbitMode) modes.push("Orbit");
  if (state.showParentChild) modes.push("Parent-Child");
  ui.modeInfo.textContent = modes.join(" · ");

  ui.fpsInfo.textContent = `${displayedFps} FPS`;
  ui.frameInfo.textContent = `FRAME ${String(state.frameCount).padStart(4, "0")}`;
  ui.runStatus.textContent = state.paused ? "PAUSED" : "LIVE";
  ui.pauseButton.firstChild.textContent = state.paused ? "Resume " : "Pause ";
  ui.pauseButton.classList.toggle("primary", !state.paused);
  ui.rotationSpeedValue.textContent = `${Math.round(state.rotationSpeed)}°/s`;
  ui.scaleSpeedValue.textContent = state.scaleSpeed.toFixed(2);

  // Sinkronkan toggle di panel dengan state (mis. saat diubah lewat keyboard)
  ui.autoObjectB.checked = state.autoObjectB;
  ui.showAxes.checked = state.showAxes;
  ui.showPivot.checked = state.showPivot;
  ui.showParentChild.checked = state.showParentChild;
  if (ui.mouseMode) ui.mouseMode.checked = true; // Jika elemen HTML masih ada, paksa aktif

  canvas.style.cursor = "crosshair"; // Kursor crosshair selalu aktif
}

/* ---------- 9. Event handler ---------- */

const toggleOrder = () => { state.orderMode = state.orderMode === 0 ? 1 : 0; };
const togglePause = () => { state.paused = !state.paused; };
const toggleOrbit = () => { state.orbitMode = !state.orbitMode; };
const togglePivot = () => { pivotDemo.enabled = !pivotDemo.enabled; };
const toggleParentChild = () => { state.showParentChild = !state.showParentChild; };
const toggleMoveSpeed = () => { state.moveSpeed = state.moveSpeed === 0.65 ? 1.5 : 0.65; }; // Toggle kecepatan

ui.rotationSpeed.addEventListener("input", () => {
  state.rotationSpeed = Number(ui.rotationSpeed.value);
});
ui.scaleSpeed.addEventListener("input", () => {
  state.scaleSpeed = Number(ui.scaleSpeed.value);
});

ui.autoObjectB.addEventListener("change", () => { state.autoObjectB = ui.autoObjectB.checked; });
ui.showAxes.addEventListener("change", () => { state.showAxes = ui.showAxes.checked; });
ui.showPivot.addEventListener("change", () => { state.showPivot = ui.showPivot.checked; });
ui.showParentChild.addEventListener("change", () => { state.showParentChild = ui.showParentChild.checked; });

ui.pauseButton.addEventListener("click", togglePause);
ui.resetButton.addEventListener("click", resetTransform);
ui.orderButton.addEventListener("click", toggleOrder);
ui.orbitButton.addEventListener("click", toggleOrbit);
ui.pivotButton.addEventListener("click", togglePivot);

// Lepas fokus tombol setelah diklik supaya Space/Enter tidak menekan tombol lagi.
document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => button.blur());
});

const PREVENT_DEFAULT_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();

  // 1. Selalu izinkan tombol Pause/Resume kapan saja (Key P atau Space)
  if (event.code === "KeyP" || event.code === "Space") {
    if (!event.repeat) togglePause();
    keys[event.code] = true;
    return;
  }

  // 2. BATASI SEMUA INPUT KEYBOARD LAINNYA JIKA SEDANG PAUSE
  if (state.paused) return;

  keys[event.code] = true;
  if (event.repeat) return; // aksi sekali-tekan tidak boleh berulang

  switch (event.code) {
    case "KeyR": resetTransform(); break;
    case "Digit1": case "Numpad1": applyPreset(1); break;
    case "Digit2": case "Numpad2": applyPreset(2); break;
    case "Digit3": case "Numpad3": applyPreset(3); break;
    case "KeyT": toggleOrder(); break; // Toggle Transform Order T x R x S vs T x R
    case "KeyO": toggleOrbit(); break;
    case "KeyY": togglePivot(); break;
    case "KeyH": toggleParentChild(); break;
    case "KeyF": toggleMoveSpeed(); break; // Tekan F untuk ganti kecepatan translasi
    default: break;
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

// Jika tab/window kehilangan fokus, keyup bisa terlewat → reset semua tombol.
window.addEventListener("blur", () => {
  Object.keys(keys).forEach((code) => { keys[code] = false; });
});

// Challenge D — Mouse Pixel → NDC → transform.x/y → Translation Matrix
function pixelToNdc(event) {
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width;   // 0..1
  const py = (event.clientY - rect.top) / rect.height;   // 0..1
  return { x: px * 2 - 1, y: 1 - py * 2 };               // Y layar ke bawah, Y NDC ke atas
}

canvas.addEventListener("click", (event) => {
  // Jangan pindahkan objek jika sedang di-pause. Hapus validasi state.mouseMode
  if (state.paused) return; 
  
  const ndc = pixelToNdc(event);
  // Kebalikan dari View matrix Scale(1/aspect, 1): x_world = x_ndc * aspect
  objectA.x = ndc.x * ASPECT;
  objectA.y = ndc.y;
  clampObjectA();
});

/* ---------- 10. Main loop ---------- */

let lastTime = 0;

function render(time) {
  const realDt = lastTime === 0 ? 0 : (time - lastTime) * 0.001;
  lastTime = time;
  const dt = clamp(realDt, 0, 0.05); // deltaTime (detik), dibatasi saat tab sempat freeze

  if (!state.paused) state.animationTime += dt;
  update(dt, state.animationTime);
  updateHUD();
  drawScene();

  state.frameCount += 1;
  fpsAccumulator += dt;
  fpsFrames += 1;
  if (fpsAccumulator >= 0.5) {
    displayedFps = Math.round(fpsFrames / fpsAccumulator);
    fpsAccumulator = 0;
    fpsFrames = 0;
  }

  requestAnimationFrame(render);
}

updateHUD();
requestAnimationFrame(render);