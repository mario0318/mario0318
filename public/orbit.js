const VIEWBOX = 64;
const TOP_PIVOT = { x: 28, y: 32 };
const DEFAULT_TOP_POINTS = {
  blue: { x: 19, y: 18 },
  green: { x: 19, y: 46 },
  gray: { x: 46, y: 32 }
};

const state = {
  map: null,
  activePath: [],
  previewId: null,
  angle: 0,
  lastTime: null,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  topPositions: new Map()
};

const els = {
  camera: document.getElementById("orbital-camera"),
  topCluster: document.getElementById("top-cluster"),
  childLayer: document.getElementById("child-orbit-layer"),
  title: document.getElementById("status-title"),
  copy: document.getElementById("status-copy"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  backButton: document.getElementById("back-button"),
  fallbackList: document.getElementById("fallback-list"),
  canvas: document.getElementById("atmosphere")
};

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let ctx;

init();

async function init() {
  try {
    const map = await loadMap();
    const result = validateMap(map);
    if (!result.valid) throw new Error(result.errors.join("\n"));

    state.map = map;
    renderFallbackLinks(flattenLinks(map.orbs));
    renderTopCluster();
    applyHash();
    renderChildOrbit();
    updateHud();
    updateBreadcrumbs();
  } catch (error) {
    console.error(error);
    els.title.textContent = "links";
    els.copy.textContent = "The orbital map could not load. The link index is still available.";
    renderFallbackLinks([
      { label: "raul3", href: "https://raul3.com" },
      { label: "GitHub", href: "https://github.com/mario0318" },
      { label: "Contact", href: "mailto:hi@mario0318.com" }
    ]);
  }

  els.backButton.addEventListener("click", goBack);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") goBack();
  });
  window.addEventListener("popstate", () => {
    applyHash();
    updateAll();
  });
  window.addEventListener("resize", () => {
    renderChildOrbit();
    drawAtmosphere(performance.now());
  });
  motionQuery.addEventListener("change", () => {
    state.reducedMotion = motionQuery.matches;
    if (state.reducedMotion) state.angle = 0;
    updateAll();
  });

  requestAnimationFrame(frame);
}

async function loadMap() {
  const response = await fetch("/orbital-map.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`orbital-map.json returned ${response.status}`);
  return response.json();
}

function validateMap(map) {
  const errors = [];
  const ids = new Set();
  const max = map?.layout?.maxItemsPerOrbit ?? 10;

  if (!map || typeof map !== "object") return { valid: false, errors: ["Map root must be an object."] };
  if (map.version == null) errors.push("version is required.");
  if (!Array.isArray(map.orbs)) errors.push("orbs must be an array.");

  const topIds = (map.orbs || []).filter((orb) => !orb.hidden).map((orb) => orb.id).sort();
  if (topIds.join(",") !== "blue,gray,green") errors.push("Top-level visible orbs must be exactly blue, green, and gray.");

  walk(map.orbs || [], "orbs");

  function walk(nodes, path) {
    for (const node of nodes) {
      const nodePath = `${path}.${node?.id || "(missing-id)"}`;
      if (!node || typeof node !== "object") {
        errors.push(`${nodePath} must be an object.`);
        continue;
      }
      if (!node.id || typeof node.id !== "string") errors.push(`${nodePath} id must be a non-empty string.`);
      else if (ids.has(node.id)) errors.push(`Duplicate id: ${node.id}.`);
      else ids.add(node.id);
      if (node.kind !== "orbit" && node.kind !== "link") errors.push(`${nodePath} kind must be orbit or link.`);
      if (typeof node.order !== "number") errors.push(`${nodePath} order must be a number.`);
      if (typeof node.hidden !== "boolean") errors.push(`${nodePath} hidden must be a boolean.`);
      if (node.manualAngle !== null && typeof node.manualAngle !== "number") errors.push(`${nodePath} manualAngle must be null or a number.`);
      if (!Array.isArray(node.children)) errors.push(`${nodePath} children must be an array.`);
      if (node.kind === "link" && !node.href) errors.push(`${nodePath} link nodes must include href.`);
      if (node.id === "fairchild-alchemy" && node.label !== "Fairchild Alchemy") errors.push(`${nodePath} label must remain Fairchild Alchemy.`);
      if (getVisibleChildren(node).length > max) errors.push(`${nodePath} has more than ${max} visible children.`);
      if (Array.isArray(node.children)) walk(node.children, nodePath);
    }
  }

  return { valid: errors.length === 0, errors };
}

function renderTopCluster() {
  els.topCluster.innerHTML = "";
  for (const orb of [...state.map.orbs].sort((a, b) => a.order - b.order)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "orb-node";
    button.dataset.id = orb.id;
    button.dataset.top = "true";
    button.style.setProperty("--node-color", colorFor(orb));
    button.setAttribute("aria-label", `${orb.label}: ${orb.description}`);
    button.appendChild(labelFor(orb));
    button.addEventListener("pointerenter", () => previewNode(orb.id));
    button.addEventListener("pointerleave", () => clearPreview(orb.id));
    button.addEventListener("focus", () => previewNode(orb.id));
    button.addEventListener("blur", () => clearPreview(orb.id));
    button.addEventListener("click", () => selectPath([orb.id]));
    els.topCluster.appendChild(button);
  }
  placeTopNodes();
}

function placeTopNodes() {
  if (!state.map) return;
  const points = state.map.layout?.topLevelCoordinates64 || {};
  for (const el of els.topCluster.querySelectorAll(".orb-node")) {
    const id = el.dataset.id;
    const pair = points[id];
    const base = Array.isArray(pair) ? { x: pair[0], y: pair[1] } : DEFAULT_TOP_POINTS[id];
    const point = state.reducedMotion ? base : rotatePoint(base, TOP_PIVOT, state.angle);
    const percent = toPercent(point);
    state.topPositions.set(id, percent);
    el.style.setProperty("--x", `${percent.x}%`);
    el.style.setProperty("--y", `${percent.y}%`);
  }
  updateCamera();
}

function renderChildOrbit() {
  els.childLayer.innerHTML = "";
  els.childLayer.classList.remove("is-dock");
  if (!state.activePath.length || !state.map) return;

  const parent = findNodeByPath(state.activePath);
  if (!parent) return;
  const children = getVisibleChildren(parent);
  const center = contextPoint(state.activePath);
  const parentColor = colorFor(parent, colorFor(findNodeByPath([state.activePath[0]])));

  const ring = document.createElement("div");
  ring.className = "orbit-ring";
  ring.style.setProperty("--x", `${center.x}%`);
  ring.style.setProperty("--y", `${center.y}%`);
  ring.style.setProperty("--ring-color", parentColor);
  els.childLayer.appendChild(ring);

  children.forEach((node, index) => {
    const hasChildren = getVisibleChildren(node).length > 0;
    const isLink = node.href && !hasChildren;
    const el = document.createElement(isLink ? "a" : "button");
    const color = colorFor(node, parentColor);
    const pos = positionForChild(index, children.length, node.manualAngle, center, state.activePath.length);

    el.className = "child-node";
    el.dataset.id = node.id;
    el.style.setProperty("--node-color", color);
    el.style.setProperty("--x", `${pos.x}%`);
    el.style.setProperty("--y", `${pos.y}%`);
    el.setAttribute("aria-label", isLink ? `Open ${node.label}` : `Enter ${node.label}`);
    el.appendChild(labelFor(node));

    if (isLink) {
      el.href = node.href;
      if (node.external !== false && !node.href.startsWith("/") && !node.href.startsWith("mailto:")) {
        el.target = "_blank";
        el.rel = "noreferrer";
      }
    } else {
      el.type = "button";
      el.addEventListener("click", () => selectPath([...state.activePath, node.id]));
    }

    el.addEventListener("pointerenter", () => previewNode(node.id));
    el.addEventListener("pointerleave", () => clearPreview(node.id));
    el.addEventListener("focus", () => previewNode(node.id));
    el.addEventListener("blur", () => clearPreview(node.id));
    els.childLayer.appendChild(el);
  });
}

function previewNode(id) {
  state.previewId = id;
  updateActiveClasses();
  updateHud(findNodeAny(id));
}

function clearPreview(id) {
  if (state.previewId !== id) return;
  state.previewId = null;
  updateActiveClasses();
  updateHud();
}

function selectPath(path) {
  const node = findNodeByPath(path);
  if (!node || !getVisibleChildren(node).length) return;
  state.activePath = path;
  state.previewId = null;
  updateHash();
  updateAll();
}

function goBack() {
  if (!state.activePath.length) return;
  state.activePath = state.activePath.slice(0, -1);
  state.previewId = null;
  updateHash();
  updateAll();
}

function updateAll() {
  placeTopNodes();
  renderChildOrbit();
  updateHud();
  updateBreadcrumbs();
  updateActiveClasses();
}

function updateHud(override = null) {
  const node = override || (state.activePath.length ? findNodeByPath(state.activePath) : null);
  if (node) {
    els.title.textContent = node.label;
    els.copy.textContent = node.description || (node.href || "select a node");
  } else {
    els.title.textContent = "select an orb";
    els.copy.textContent = "the dots are the interface";
  }
}

function updateBreadcrumbs() {
  els.breadcrumbs.innerHTML = "";
  els.backButton.hidden = state.activePath.length === 0;
  if (!state.activePath.length) return;

  const root = document.createElement("button");
  root.type = "button";
  root.textContent = "root";
  root.addEventListener("click", () => {
    state.activePath = [];
    updateHash();
    updateAll();
  });
  els.breadcrumbs.appendChild(root);

  state.activePath.forEach((_, index) => {
    const sep = document.createElement("span");
    sep.textContent = "/";
    els.breadcrumbs.appendChild(sep);
    const path = state.activePath.slice(0, index + 1);
    const node = findNodeByPath(path);
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = node?.shortLabel || node?.label || path[index];
    item.addEventListener("click", () => selectPath(path));
    els.breadcrumbs.appendChild(item);
  });
}

function updateActiveClasses() {
  document.querySelectorAll(".orb-node, .child-node").forEach((el) => {
    const id = el.dataset.id;
    el.classList.toggle("is-preview", state.previewId === id);
    el.classList.toggle("is-active", state.activePath.includes(id));
    el.classList.toggle("is-dimmed", Boolean(state.previewId && state.previewId !== id));
  });
  els.topCluster.classList.toggle("is-open", state.activePath.length > 0);
}

function renderFallbackLinks(links) {
  els.fallbackList.innerHTML = links.map((link) => {
    const external = !link.href.startsWith("mailto:") && !link.href.startsWith("/");
    const attrs = external ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${escapeHtml(link.href)}"${attrs}><span>${escapeHtml(link.label)}</span><small>${external ? "open" : "go"}</small></a>`;
  }).join("");
}

function flattenLinks(nodes, result = []) {
  for (const node of nodes || []) {
    if (node.hidden) continue;
    if (node.href) result.push(node);
    if (node.children?.length) flattenLinks(node.children, result);
  }
  return result;
}

function getVisibleChildren(node) {
  return (node?.children || []).filter((child) => !child.hidden).sort((a, b) => a.order - b.order);
}

function findNodeByPath(path) {
  let list = state.map?.orbs || [];
  let current = null;
  for (const id of path) {
    current = list.find((node) => node.id === id);
    if (!current) return null;
    list = current.children || [];
  }
  return current;
}

function findNodeAny(id) {
  const stack = [...(state.map?.orbs || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node.id === id) return node;
    stack.push(...(node.children || []));
  }
  return null;
}

function labelFor(node) {
  const label = document.createElement("span");
  label.className = "node-label";
  label.textContent = node.shortLabel || node.label || node.id;
  return label;
}

function colorFor(node, fallback = "#f3f6ff") {
  const value = node?.color;
  if (!value) return fallback;
  return state.map?.theme?.[value] || value;
}

function rotatePoint(point, center, radians) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians)
  };
}

function toPercent(point) {
  return { x: (point.x / VIEWBOX) * 100, y: (point.y / VIEWBOX) * 100 };
}

function positionForChild(index, total, manualAngle, center, depth) {
  const angle = manualAngle != null ? manualAngle * Math.PI / 180 : -Math.PI / 2 + (index / Math.max(1, total)) * Math.PI * 2;
  const radius = (window.innerWidth < 640 ? 25 : 24) - Math.max(0, depth - 1) * 4;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function contextPoint(path) {
  let point = state.topPositions.get(path[0]) || toPercent(DEFAULT_TOP_POINTS[path[0]]);
  for (let depth = 1; depth < path.length; depth += 1) {
    const parent = findNodeByPath(path.slice(0, depth));
    const children = getVisibleChildren(parent);
    const index = children.findIndex((node) => node.id === path[depth]);
    if (index < 0) break;
    point = positionForChild(index, children.length, children[index].manualAngle, point, depth);
  }
  return point;
}

function updateCamera() {
  const focus = state.activePath.length ? contextPoint(state.activePath) : { x: 50, y: 50 };
  els.camera.style.setProperty("--focus-x", `${focus.x}%`);
  els.camera.style.setProperty("--focus-y", `${focus.y}%`);
  els.camera.style.setProperty("--shift-x", state.activePath.length ? `calc(50% - ${focus.x}%)` : "0");
  els.camera.style.setProperty("--shift-y", state.activePath.length ? `calc(50% - ${focus.y}%)` : "0");
  els.camera.classList.toggle("is-open", state.activePath.length > 0 && !state.reducedMotion);
}

function updateHash() {
  const hash = state.activePath.length ? `#/${state.activePath.map(encodeURIComponent).join("/")}` : "#/";
  if (location.hash !== hash) history.pushState(null, "", hash);
}

function applyHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  let path = [];
  for (const part of parts) {
    const next = [...path, part];
    const node = findNodeByPath(next);
    if (!node || !getVisibleChildren(node).length) break;
    path = next;
  }
  state.activePath = path;
}

function frame(time) {
  if (state.lastTime == null) state.lastTime = time;
  const delta = time - state.lastTime;
  state.lastTime = time;
  if (!state.reducedMotion && !state.activePath.length) {
    state.angle = (state.angle + (delta / 240000) * Math.PI * 2) % (Math.PI * 2);
  }
  placeTopNodes();
  drawAtmosphere(time);
  requestAnimationFrame(frame);
}

function drawAtmosphere(time) {
  if (!ctx) ctx = els.canvas.getContext("2d", { alpha: true });
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  const w = width / dpr;
  const h = height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const focus = state.activePath.length ? contextPoint(state.activePath) : { x: 44, y: 50 };
  const color = colorFor(state.previewId ? findNodeAny(state.previewId) : findNodeByPath(state.activePath) || { color: "blue" });
  const cx = focus.x / 100 * w;
  const cy = focus.y / 100 * h;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .44);
  gradient.addColorStop(0, hexToRgba(color, state.activePath.length ? .16 : .08));
  gradient.addColorStop(1, "rgba(10,12,16,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(state.reducedMotion ? 0 : time / 58000);
  ctx.strokeStyle = "rgba(243,246,255,.055)";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(w, h) * (.16 + i * .08), Math.min(w, h) * (.1 + i * .05), i * .55, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  if (!hex?.startsWith("#")) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
