#!/usr/bin/env node
// agent-room :: hook installer
//   node install.mjs            -> pasang untuk project ini saja (./.claude/settings.json)
//   node install.mjs --global   -> pasang untuk SEMUA project (~/.claude/settings.json)
//   node install.mjs --remove   -> lepas lagi (gabungkan dengan --global bila perlu)
// Selalu bikin backup sebelum menulis.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(__dirname, 'hook.mjs').split(path.sep).join('/');
const TAG = 'agent-room';
const PORT = process.env.AGENT_ROOM_PORT || 4517;

const args = process.argv.slice(2);
const global_ = args.includes('--global') || args.includes('-g');
const remove = args.includes('--remove') || args.includes('--uninstall');
const forceNode = args.includes('--node');

const target = global_
  ? path.join(os.homedir(), '.claude', 'settings.json')
  : path.join(process.cwd(), '.claude', 'settings.json');

// Events yang matcher-nya menyaring NAMA TOOL. Dipasang dengan matcher '*'.
const TOOL_EVENTS = [
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'PermissionDenied',
];
// Sisanya dipasang tanpa matcher. Sebagian di daftar ini sebenarnya PUNYA
// matcher (SessionStart menyaring cara mulai, SubagentStart menyaring tipe
// agen, PreCompact/PostCompact menyaring pemicunya, StopFailure menyaring jenis
// galat) — tapi matcher yang dihilangkan artinya sama dengan '*': kena semua.
// Jadi bentuk polos ini benar untuk keduanya, dan satu daftar lebih sedikit.
const PLAIN_EVENTS = [
  'UserPromptSubmit', 'Stop', 'StopFailure',
  'SubagentStart', 'SubagentStop', 'Notification',
  'SessionStart', 'SessionEnd',
  'PreCompact', 'PostCompact',
];

// curl ~42ms vs node ~153ms per panggilan, dan hook ini jalan tiap tool call.
// `|| exit 0` supaya sesi tidak kena warning waktu server ruangan lagi mati.
function hasCurl() {
  try {
    execFileSync('curl', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const useCurl = !forceNode && hasCurl();
// header x-agent-room sekaligus jadi penanda supaya isOurs() bisa mengenali
// dan melepas hook ini lagi nanti.
const command = useCurl
  ? `curl -s -m 2 --connect-timeout 1 -X POST -H "content-type: application/json" ` +
    `-H "x-agent-room: 1" --data-binary @- http://127.0.0.1:${PORT}/event || exit 0`
  : `node "${HOOK}"`;
const entry = { type: 'command', command, timeout: 5 };

const isOurs = (group) =>
  Array.isArray(group?.hooks) && group.hooks.some((h) => String(h?.command || '').includes(TAG));

function load(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`\n  ✗ ${file} bukan JSON valid — dibatalkan supaya tidak merusak config.`);
    console.error(`    ${err.message}\n`);
    process.exit(1);
  }
}

const settings = load(target);
const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};

// Selalu bersihkan entri agent-room lama dulu (biar idempotent, dan ini juga jalur --remove).
for (const name of Object.keys(hooks)) {
  if (!Array.isArray(hooks[name])) continue;
  hooks[name] = hooks[name].filter((g) => !isOurs(g));
  if (hooks[name].length === 0) delete hooks[name];
}

if (!remove) {
  for (const name of TOOL_EVENTS) {
    hooks[name] = hooks[name] || [];
    hooks[name].push({ matcher: '*', hooks: [entry] });
  }
  for (const name of PLAIN_EVENTS) {
    hooks[name] = hooks[name] || [];
    hooks[name].push({ hooks: [entry] });
  }
}

if (Object.keys(hooks).length) settings.hooks = hooks;
else delete settings.hooks;

const dir = path.dirname(target);
fs.mkdirSync(dir, { recursive: true });
if (fs.existsSync(target)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${target}.bak-${stamp}`;
  fs.copyFileSync(target, backup);
  console.log(`  backup  ${backup}`);

  // simpan 3 backup terbaru saja, sisanya dibuang
  const prefix = path.basename(target) + '.bak-';
  const old = fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .sort()
    .slice(0, -3);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
}
fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n', 'utf8');

const scope = global_ ? 'GLOBAL (semua project)' : `project ${process.cwd()}`;
if (remove) {
  console.log(`\n  ✓ hooks agent-room dilepas dari ${scope}`);
  console.log(`    ${target}\n`);
} else {
  console.log(`\n  ✓ hooks agent-room terpasang untuk ${scope}`);
  console.log(`    ${target}`);
  console.log(`    transport: ${useCurl ? 'curl (~42ms/panggilan)' : 'node hook.mjs (~153ms/panggilan)'}`);
  console.log(`\n  Restart sesi Claude Code supaya hooks kebaca, lalu buka http://127.0.0.1:4517\n`);
}
