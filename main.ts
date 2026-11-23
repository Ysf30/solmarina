// Solmarina — round 6 entrypoint packer (recording 17): rewritten live under a
// fresh recording so the packer's own lines are the agent's authored work.
// What this program does: it stages the playable game and its screenshots
// into one output folder and writes the dossier summary the judge reads.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEST_ROOT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const TEXT_LIMIT = 160 * 1024;
const SHOT_LIMIT = 256 * 1024;
const MAX_SHOTS = 4;
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 48 * 1024 * 1024;
const MAX_PATH_BYTES = 1000;

function stageFolder(folderName) {
  const fromDir = path.join(REPO_ROOT, folderName);
  const toDir = path.join(DEST_ROOT, folderName);
  if (!fs.existsSync(fromDir)) return;
  fs.cpSync(fromDir, toDir, { recursive: true });
}

function runPack() {
  fs.mkdirSync(DEST_ROOT, { recursive: true });
  stageFolder('game');
  stageFolder('screenshots');
  const dossierText = buildDossier(DEST_ROOT, {
    text_max_bytes: TEXT_LIMIT,
    screenshots: { max: MAX_SHOTS, max_bytes: SHOT_LIMIT },
    game_max_files: MAX_GAME_FILES,
    game_max_bytes: MAX_GAME_BYTES,
    game_path_max_bytes: MAX_PATH_BYTES,
  });
  fs.writeFileSync(path.join(DEST_ROOT, 'dossier.json'), dossierText);
}

runPack();
