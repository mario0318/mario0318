import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnFile } from './spawn-file.mjs';

const DEFAULT_OUTPUT_DIR = path.resolve('public/audio-vault');
const DEFAULT_MANIFEST = path.resolve('public/tracks.json');
const DEFAULT_URL_PREFIX = '/audio-vault/';

const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.amr',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.wma',
]);

const DIRECT_BROWSER_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
]);

export function isExcludedByPrivacy(relativePath) {
  return relativePath
    .split(/[\\/]+/)
    .some((segment) => segment.toLowerCase() === 'personal');
}

export function isAudioCandidate(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function displayTitle(relativePath) {
  const parsed = path.parse(relativePath);
  const folder = path.dirname(relativePath);
  const cleanName = parsed.name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!folder || folder === '.') return cleanName;
  return `${folder.split(/[\\/]+/).join(' / ')} / ${cleanName}`;
}

export function outputName(relativePath) {
  const parsed = path.parse(relativePath);
  const base = parsed.name
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 72)
    .toLowerCase() || 'clip';
  const digest = crypto.createHash('sha1').update(relativePath).digest('hex').slice(0, 10);
  return `${base}-${digest}.mp3`;
}

export function normalizeUrlPrefix(urlPrefix = DEFAULT_URL_PREFIX) {
  if (!urlPrefix) return DEFAULT_URL_PREFIX;
  return urlPrefix.endsWith('/') ? urlPrefix : `${urlPrefix}/`;
}

export function buildImportPlan(sourceDir, options = {}) {
  const root = path.resolve(sourceDir);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const urlPrefix = normalizeUrlPrefix(options.urlPrefix);
  const files = walk(root)
    .map((absolutePath) => {
      const relativePath = path.relative(root, absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      return {
        absolutePath,
        relativePath,
        ext,
        excluded: isExcludedByPrivacy(relativePath),
        audioCandidate: isAudioCandidate(absolutePath),
      };
    });

  const included = files
    .filter((file) => file.audioCandidate && !file.excluded)
    .map((file) => {
      const name = outputName(file.relativePath);
      const copyOnly = DIRECT_BROWSER_TYPES.has(file.ext);
      return {
        ...file,
        copyOnly,
        outputName: name,
        outputPath: path.join(outputDir, name),
        url: `${urlPrefix}${name}`,
        type: 'audio/mpeg',
        title: displayTitle(file.relativePath),
      };
    });

  return {
    sourceDir: root,
    outputDir,
    manifestPath: path.resolve(options.manifestPath || DEFAULT_MANIFEST),
    scanned: files.length,
    included,
    excludedPersonal: files.filter((file) => file.audioCandidate && file.excluded),
    ignoredNonAudio: files.filter((file) => !file.audioCandidate && !file.excluded),
  };
}

export async function importAudioVault(sourceDir, options = {}) {
  const plan = buildImportPlan(sourceDir, options);
  const dryRun = options.dryRun === true;
  if (!dryRun) {
    fs.mkdirSync(plan.outputDir, { recursive: true });
  }

  const tracks = [];
  for (const file of plan.included) {
    if (!dryRun) {
      if (file.copyOnly) {
        fs.copyFileSync(file.absolutePath, file.outputPath);
      } else {
        await convertToMp3(file.absolutePath, file.outputPath);
      }
    }
    tracks.push({
      title: file.title,
      url: file.url,
      type: file.type,
      source: 'audio vault',
    });
  }

  tracks.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (!dryRun) {
    fs.writeFileSync(plan.manifestPath, `${JSON.stringify(tracks, null, 2)}\n`);
  }

  return { ...plan, tracks };
}

async function convertToMp3(inputPath, outputPath) {
  await spawnFile('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-map',
    '0:a:0',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '160k',
    outputPath,
  ]);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--out') args.outputDir = argv[++i];
    else if (arg === '--manifest') args.manifestPath = argv[++i];
    else if (arg === '--url-prefix') args.urlPrefix = argv[++i];
    else if (arg === '--help' || arg === '-h') continue;
    else if (!args.sourceDir) args.sourceDir = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.sourceDir) {
    console.error('usage: npm run import:audio-vault -- <source-dir> [--dry-run] [--out public/audio-vault] [--manifest public/tracks.json] [--url-prefix /audio-vault/]');
    process.exit(args.help ? 0 : 2);
  }
  if (!fs.existsSync(args.sourceDir)) {
    console.error(`source directory not found: ${args.sourceDir}`);
    process.exit(2);
  }
  const result = await importAudioVault(args.sourceDir, args);
  console.log(JSON.stringify({
    sourceDir: result.sourceDir,
    outputDir: result.outputDir,
    manifestPath: result.manifestPath,
    scanned: result.scanned,
    included: result.included.length,
    excludedPersonal: result.excludedPersonal.length,
    ignoredNonAudio: result.ignoredNonAudio.length,
    dryRun: args.dryRun,
  }, null, 2));
}
