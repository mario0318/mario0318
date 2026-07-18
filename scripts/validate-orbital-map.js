const fs = require("node:fs");
const path = require("node:path");

const mapPath = path.join(__dirname, "..", "public", "orbital-map.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const errors = [];
const ids = new Set();
const max = map.layout?.maxItemsPerOrbit ?? 10;

if (map.version == null) errors.push("version is required.");
if (!Array.isArray(map.orbs)) errors.push("orbs must be an array.");

const topIds = (map.orbs || []).filter((orb) => !orb.hidden).map((orb) => orb.id).sort();
if (topIds.join(",") !== "blue,gray,green") {
  errors.push("Top-level visible orbs must be exactly blue, green, and gray.");
}

for (const id of ["blue", "green", "gray"]) {
  const pair = map.layout?.topLevelCoordinates64?.[id];
  if (!Array.isArray(pair) || pair.length !== 2 || pair.some((value) => typeof value !== "number")) {
    errors.push(`layout.topLevelCoordinates64.${id} must be a [x, y] pair.`);
  }
}

walk(map.orbs || [], "orbs");

function walk(nodes, label) {
  for (const node of nodes) {
    const nodePath = `${label}.${node?.id || "(missing-id)"}`;
    if (!node || typeof node !== "object") {
      errors.push(`${nodePath} must be an object.`);
      continue;
    }
    if (!node.id || typeof node.id !== "string") errors.push(`${nodePath} id must be a string.`);
    else if (ids.has(node.id)) errors.push(`Duplicate id: ${node.id}.`);
    else ids.add(node.id);
    if (node.kind !== "orbit" && node.kind !== "link") errors.push(`${nodePath} kind must be orbit or link.`);
    if (typeof node.order !== "number") errors.push(`${nodePath} order must be a number.`);
    if (typeof node.hidden !== "boolean") errors.push(`${nodePath} hidden must be a boolean.`);
    if (node.manualAngle !== null && typeof node.manualAngle !== "number") errors.push(`${nodePath} manualAngle must be null or a number.`);
    if (!Array.isArray(node.children)) errors.push(`${nodePath} children must be an array.`);
    if (node.kind === "link" && !node.href) errors.push(`${nodePath} link nodes must include href.`);
    if (node.href && !isSafeHref(node.href)) errors.push(`${nodePath} href must be http(s), mailto, or a root-relative path.`);
    if (node.id === "fairchild-alchemy" && node.label !== "Fairchild Alchemy") {
      errors.push(`${nodePath} label must remain "Fairchild Alchemy".`);
    }
    if ((node.children || []).filter((child) => !child.hidden).length > max) {
      errors.push(`${nodePath} has more than ${max} visible children.`);
    }
    if (Array.isArray(node.children)) walk(node.children, nodePath);
  }
}

function isSafeHref(href) {
  return href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:") || href.startsWith("/");
}

if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

console.log(`orbital map ok: ${mapPath}`);
