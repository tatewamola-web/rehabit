#!/usr/bin/env node
/**
 * Vendors everything the pose engine needs into public/ so the app runs offline.
 *
 *   1. copies the MediaPipe WASM runtime out of node_modules
 *   2. downloads the pose + hand landmarker model files
 *
 * Run explicitly with `npm run setup`. Also runs after `npm install` in --soft
 * mode, where a network failure prints instructions instead of failing install.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const soft = process.argv.includes('--soft');
const force = process.argv.includes('--force');

const WASM_SRC = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_DEST = join(root, 'public', 'mediapipe', 'wasm');
const MODEL_DIR = join(root, 'public', 'models');

const MODELS = [
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    note: 'body pose, 33 landmarks (fast)',
  },
  {
    file: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    note: 'body pose, 33 landmarks (accurate)',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    note: 'hands, 21 landmarks per hand',
  },
];

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function copyWasm() {
  if (!existsSync(WASM_SRC)) {
    throw new Error(
      'node_modules/@mediapipe/tasks-vision/wasm not found — run `npm install` first.',
    );
  }
  await mkdir(dirname(WASM_DEST), { recursive: true });
  await cp(WASM_SRC, WASM_DEST, { recursive: true });
  console.log('  ✓ mediapipe wasm runtime → public/mediapipe/wasm');
}

async function fetchModel({ file, url, note }) {
  const dest = join(MODEL_DIR, file);
  if (!force && existsSync(dest)) {
    const { size } = await stat(dest);
    console.log(`  · ${file} already present (${kb(size)})`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status} from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`  ✓ ${file} — ${note} (${kb(buf.byteLength)})`);
}

async function main() {
  console.log('Rehabit · vendoring on-device pose assets');
  await mkdir(MODEL_DIR, { recursive: true });
  await copyWasm();
  for (const model of MODELS) await fetchModel(model);
  console.log('Done. Everything runs locally from here — no network needed.\n');
}

main().catch((err) => {
  const msg = [
    '',
    '  Could not vendor the pose assets.',
    `  ${err.message}`,
    '',
    '  The task log and dashboard work without them; only the webcam',
    '  Motion Analyst needs these files. Retry any time with:',
    '',
    '      npm run setup',
    '',
  ].join('\n');
  console.error(msg);
  process.exit(soft ? 0 : 1);
});
