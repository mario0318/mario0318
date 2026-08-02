const G = 0.06;
const REFERENCE_G = 0.05;
const MAX_TRAIL = 220;

const PRESETS = {
  planet: { name: "planet", mass: 700, radius: 12, color: "#4db8ff" },
  moon: { name: "moon", mass: 35, radius: 6, color: "#b6c4d0" },
  star: { name: "star", mass: 50000, radius: 28, color: "#ffbd73" },
  asteroid: { name: "asteroid", mass: 8, radius: 4, color: "#d7795f" }
};

const state = {
  bodies: [],
  selectedId: null,
  nextId: 1,
  spawnPreset: "planet",
  gravityScale: 1,
  timeScale: 1,
  running: true,
  elapsed: 0,
  width: 0,
  height: 0,
  lastFrame: 0,
  dragging: null
};

const els = {
  stage: document.getElementById("gravity-stage"),
  canvas: document.getElementById("gravity-canvas"),
  status: document.getElementById("sim-status"),
  statusDot: document.getElementById("sim-status-dot"),
  play: document.getElementById("play-toggle"),
  reset: document.getElementById("reset-simulation"),
  gravity: document.getElementById("gravity-scale"),
  gravityValue: document.getElementById("gravity-scale-value"),
  time: document.getElementById("time-scale"),
  timeValue: document.getElementById("time-scale-value"),
  hint: document.getElementById("stage-hint"),
  readTime: document.getElementById("read-time"),
  readBodies: document.getElementById("read-bodies"),
  readG: document.getElementById("read-g"),
  readSpeed: document.getElementById("read-speed"),
  inspector: document.getElementById("body-inspector"),
  selectedName: document.getElementById("selected-name"),
  remove: document.getElementById("remove-body"),
  mass: document.getElementById("body-mass"),
  massValue: document.getElementById("body-mass-value"),
  radius: document.getElementById("body-radius"),
  radiusValue: document.getElementById("body-radius-value"),
  vx: document.getElementById("body-vx"),
  vy: document.getElementById("body-vy"),
  velocityValue: document.getElementById("body-velocity-value")
};

const ctx = els.canvas.getContext("2d");

resize();
resetSimulation();
bindEvents();
requestAnimationFrame(frame);

function bindEvents() {
  window.addEventListener("resize", resize);
  els.play.addEventListener("click", () => setRunning(!state.running));
  els.reset.addEventListener("click", resetSimulation);
  els.gravity.addEventListener("input", () => {
    state.gravityScale = Number(els.gravity.value);
    setOutput(els.gravityValue, `${state.gravityScale.toFixed(2)}×`);
  });
  els.time.addEventListener("input", () => {
    state.timeScale = Number(els.time.value);
    setOutput(els.timeValue, `${state.timeScale.toFixed(2)}×`);
  });

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.spawnPreset = button.dataset.preset;
      document.querySelectorAll("[data-preset]").forEach((item) => item.classList.toggle("is-active", item === button));
      els.hint.textContent = `click to place a ${PRESETS[state.spawnPreset].name}`;
    });
  });

  [els.mass, els.radius, els.vx, els.vy].forEach((control) => control.addEventListener("input", updateSelectedFromControls));
  els.remove.addEventListener("click", removeSelected);

  els.canvas.addEventListener("pointerdown", onPointerDown);
  els.canvas.addEventListener("pointermove", onPointerMove);
  els.canvas.addEventListener("pointerup", onPointerUp);
  els.canvas.addEventListener("pointercancel", onPointerUp);
  els.canvas.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setRunning(!state.running);
    }
  });
}

function resetSimulation() {
  state.bodies = [];
  state.nextId = 1;
  state.elapsed = 0;
  state.dragging = null;
  const cx = state.width / 2;
  const cy = state.height / 2;
  const star = addBody("star", cx, cy);
  star.pinned = true;
  const distance = Math.min(155, state.width * 0.24);
  const planet = addBody("planet", cx + distance, cy, 0, -Math.sqrt(G * star.mass / distance));
  const moonDistance = 32;
  addBody("moon", planet.x + moonDistance, planet.y, planet.vx, planet.vy - Math.sqrt(G * planet.mass / moonDistance));
  selectBody(planet.id);
  setRunning(true);
}

function addBody(presetName, x, y, vx = 0, vy = 0) {
  const preset = PRESETS[presetName];
  const body = {
    id: state.nextId++,
    name: preset.name,
    mass: preset.mass,
    radius: preset.radius,
    color: preset.color,
    x,
    y,
    vx,
    vy,
    pinned: false,
    trail: []
  };
  state.bodies.push(body);
  return body;
}

function selectBody(id) {
  state.selectedId = id;
  syncInspector();
}

function getSelected() {
  return state.bodies.find((body) => body.id === state.selectedId) || null;
}

function updateSelectedFromControls() {
  const body = getSelected();
  if (!body) return;
  body.mass = Number(els.mass.value);
  body.radius = Number(els.radius.value);
  body.vx = Number(els.vx.value);
  body.vy = Number(els.vy.value);
  syncInspector();
}

function syncInspector() {
  const body = getSelected();
  els.inspector.hidden = !body;
  if (!body) return;
  els.selectedName.textContent = body.pinned ? `${body.name} / pinned` : body.name;
  els.mass.value = String(Math.round(body.mass));
  setOutput(els.massValue, String(Math.round(body.mass)));
  els.radius.value = String(Math.round(body.radius));
  setOutput(els.radiusValue, String(Math.round(body.radius)));
  els.vx.value = String(clamp(body.vx, -2, 2));
  els.vy.value = String(clamp(body.vy, -2, 2));
  els.velocityValue.textContent = `${body.vx.toFixed(2)}, ${body.vy.toFixed(2)}`;
}

function removeSelected() {
  if (!getSelected()) return;
  state.bodies = state.bodies.filter((body) => body.id !== state.selectedId);
  state.selectedId = state.bodies.at(-1)?.id || null;
  syncInspector();
}

function setRunning(running) {
  state.running = running;
  els.status.textContent = running ? "running" : "paused";
  els.statusDot.classList.toggle("is-running", running);
  els.statusDot.classList.toggle("is-paused", !running);
  els.play.textContent = running ? "Ⅱ" : "▶";
  els.play.setAttribute("aria-label", running ? "pause simulation" : "play simulation");
}

function resize() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = Math.max(320, rect.width);
  state.height = Math.max(320, rect.height);
  els.canvas.width = Math.round(state.width * dpr);
  els.canvas.height = Math.round(state.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!state.bodies.length) return;
  const scaleX = state.width / (state.previousWidth || state.width);
  const scaleY = state.height / (state.previousHeight || state.height);
  state.bodies.forEach((body) => {
    body.x *= scaleX;
    body.y *= scaleY;
    body.trail = body.trail.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
  });
  state.previousWidth = state.width;
  state.previousHeight = state.height;
}

function frame(timestamp) {
  const delta = state.lastFrame ? Math.min((timestamp - state.lastFrame) / 1000, 0.04) : 0;
  state.lastFrame = timestamp;
  if (state.running && delta) step(delta * state.timeScale);
  draw();
  updateReadout();
  requestAnimationFrame(frame);
}

function step(dt) {
  const accelerations = new Map();
  for (const body of state.bodies) accelerations.set(body.id, fieldAt(body));
  for (const body of state.bodies) {
    const acceleration = accelerations.get(body.id);
    if (!body.pinned) {
      body.vx += acceleration.x * dt;
      body.vy += acceleration.y * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }
    if (!body.trail.length || distance(body, body.trail.at(-1)) > 2) body.trail.push({ x: body.x, y: body.y });
    if (body.trail.length > MAX_TRAIL) body.trail.shift();
  }
  mergeOverlaps();
  state.elapsed += dt;
}

function fieldAt(target) {
  let x = 0;
  let y = 0;
  for (const other of state.bodies) {
    if (other.id === target.id) continue;
    const dx = other.x - target.x;
    const dy = other.y - target.y;
    const d2 = Math.max(dx * dx + dy * dy, 36);
    const factor = G * state.gravityScale * other.mass / (d2 * Math.sqrt(d2));
    x += dx * factor;
    y += dy * factor;
  }
  return { x, y, magnitude: Math.hypot(x, y) };
}

function mergeOverlaps() {
  for (let i = 0; i < state.bodies.length; i += 1) {
    for (let j = i + 1; j < state.bodies.length; j += 1) {
      const first = state.bodies[i];
      const second = state.bodies[j];
      if (Math.hypot(first.x - second.x, first.y - second.y) > first.radius + second.radius) continue;
      const primary = first.pinned ? first : second.pinned ? second : (first.mass >= second.mass ? first : second);
      const absorbed = primary === first ? second : first;
      const totalMass = primary.mass + absorbed.mass;
      primary.vx = (primary.vx * primary.mass + absorbed.vx * absorbed.mass) / totalMass;
      primary.vy = (primary.vy * primary.mass + absorbed.vy * absorbed.mass) / totalMass;
      primary.mass = totalMass;
      primary.radius = Math.min(48, Math.sqrt(primary.radius ** 2 + absorbed.radius ** 2));
      state.bodies = state.bodies.filter((body) => body.id !== absorbed.id);
      if (state.selectedId === absorbed.id) state.selectedId = primary.id;
      syncInspector();
      return mergeOverlaps();
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);
  drawGrid();
  const selected = getSelected();
  if (selected) drawFieldLines(selected);
  for (const body of state.bodies) drawBody(body, body === selected);
}

function drawGrid() {
  ctx.strokeStyle = "rgba(188, 211, 224, .055)";
  ctx.lineWidth = 1;
  const spacing = 48;
  for (let x = spacing / 2; x < state.width; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.height); ctx.stroke();
  }
  for (let y = spacing / 2; y < state.height; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.width, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(188, 211, 224, .12)";
  ctx.beginPath(); ctx.moveTo(state.width / 2, 0); ctx.lineTo(state.width / 2, state.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, state.height / 2); ctx.lineTo(state.width, state.height / 2); ctx.stroke();
}

function drawFieldLines(selected) {
  const selectedField = fieldAt(selected);
  for (const other of state.bodies) {
    if (other.id === selected.id) continue;
    const dx = other.x - selected.x;
    const dy = other.y - selected.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const reach = Math.min(length - selected.radius, 72);
    const opacity = Math.min(.35, .08 + other.mass / 100000);
    ctx.strokeStyle = `rgba(255, 216, 145, ${opacity})`;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(selected.x, selected.y);
    ctx.lineTo(selected.x + dx / length * Math.max(reach, 12), selected.y + dy / length * Math.max(reach, 12));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (selectedField.magnitude > 0) {
    const angle = Math.atan2(selectedField.y, selectedField.x);
    ctx.strokeStyle = "rgba(255, 255, 255, .68)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(selected.x, selected.y);
    ctx.lineTo(selected.x + Math.cos(angle) * 34, selected.y + Math.sin(angle) * 34);
    ctx.stroke();
  }
}

function drawBody(body, selected) {
  if (body.trail.length > 1) {
    ctx.strokeStyle = colorWithAlpha(body.color, selected ? .48 : .2);
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.beginPath();
    body.trail.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(body.x, body.y, 0, body.x, body.y, body.radius * 3.2);
  glow.addColorStop(0, colorWithAlpha(body.color, .28));
  glow.addColorStop(1, colorWithAlpha(body.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(body.x, body.y, body.radius * 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = body.color;
  ctx.beginPath(); ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.beginPath(); ctx.arc(body.x - body.radius * .3, body.y - body.radius * .34, body.radius * .22, 0, Math.PI * 2); ctx.fill();
  if (selected) {
    ctx.strokeStyle = "rgba(255,255,255,.86)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(body.x, body.y, body.radius + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = "rgba(243,246,255,.82)";
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(body.name, body.x + body.radius + 8, body.y - body.radius - 5);
}

function updateReadout() {
  const selected = getSelected();
  const field = selected ? fieldAt(selected) : null;
  els.readTime.textContent = `${state.elapsed.toFixed(1)} s`;
  els.readBodies.textContent = String(state.bodies.length);
  els.readG.textContent = field ? `${(field.magnitude / REFERENCE_G).toFixed(2)} g` : "--";
  els.readSpeed.textContent = selected ? Math.hypot(selected.vx, selected.vy).toFixed(2) : "--";
  if (selected) els.velocityValue.textContent = `${selected.vx.toFixed(2)}, ${selected.vy.toFixed(2)}`;
}

function pointerPosition(event) {
  const rect = els.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function bodyAt(point) {
  return [...state.bodies].reverse().find((body) => Math.hypot(body.x - point.x, body.y - point.y) <= Math.max(body.radius + 10, 18));
}

function onPointerDown(event) {
  const point = pointerPosition(event);
  const body = bodyAt(point);
  if (body) {
    selectBody(body.id);
    state.dragging = { id: body.id, offsetX: body.x - point.x, offsetY: body.y - point.y };
    setRunning(false);
    els.canvas.setPointerCapture(event.pointerId);
    return;
  }
  const preset = PRESETS[state.spawnPreset];
  const added = addBody(state.spawnPreset, point.x, point.y);
  selectBody(added.id);
  els.hint.textContent = `selected ${preset.name}`;
}

function onPointerMove(event) {
  if (!state.dragging) return;
  const body = state.bodies.find((item) => item.id === state.dragging.id);
  if (!body) return;
  const point = pointerPosition(event);
  body.x = clamp(point.x + state.dragging.offsetX, body.radius, state.width - body.radius);
  body.y = clamp(point.y + state.dragging.offsetY, body.radius, state.height - body.radius);
  body.vx = 0;
  body.vy = 0;
  body.trail = [];
}

function onPointerUp(event) {
  if (!state.dragging) return;
  state.dragging = null;
  if (els.canvas.hasPointerCapture(event.pointerId)) els.canvas.releasePointerCapture(event.pointerId);
}

function distance(body, point) {
  return Math.hypot(body.x - point.x, body.y - point.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setOutput(output, value) {
  output.value = value;
  output.textContent = value;
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
