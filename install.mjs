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
  /* Server MCP yang meminta keterangan di tengah tool call. Yang bergerak
     karenanya: pegawainya berdiri mengangkat map disposisi menghadap kamera,
     dengan nama instansi yang bertanya — pose butuh-manusia yang sudah ada.
     Nama keduanya dibuktikan dari literal berkutip di binari 2.1.260, bukan
     dari ingatan. */
  'Elicitation', 'ElicitationResult',
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

/* ————— kantor pusat & kantor cabang —————
   Bawaannya hook bicara ke 127.0.0.1 di mesin yang sama. Dua env mengubahnya:
   - AGENT_ROOM_URL    : alamat kantor pusat (mis. http://kantor.lan:4517) —
                         hook di mesin INI mengirim event ke sana ("cabang")
   - AGENT_ROOM_KUNCI  : kunci yang sama dengan yang dipasang di server pusat;
                         ditanam sebagai header x-agent-room-kunci
   Nama mesin (os.hostname) SELALU ikut sebagai x-agent-room-mesin: murah, dan
   di kantor pusat itulah yang membedakan pegawai cabang dari pegawai lokal.
   Ketiganya masuk ke satu baris shell di settings.json, jadi nilainya dibatasi
   ke karakter yang tidak mungkin memecah kutipan — kalau tidak lolos, batal,
   bukan menulis perintah yang rusak.                                        */
const URL_KANTOR = (process.env.AGENT_ROOM_URL || '').trim().replace(/\/+$/, '');
const KUNCI = (process.env.AGENT_ROOM_KUNCI || '').trim();
const MESIN = os.hostname().replace(/[^\w.-]/g, '').slice(0, 32);
if (URL_KANTOR && !/^https?:\/\/[A-Za-z0-9.\-\[\]:_~%]+(?:\/[A-Za-z0-9.\-_~%\/]*)?$/.test(URL_KANTOR)) {
  console.error('\n  ✗ AGENT_ROOM_URL tidak sah: ' + URL_KANTOR + '\n    contoh: http://kantor.lan:4517\n');
  process.exit(1);
}
if (KUNCI && !/^[A-Za-z0-9_.\-]{8,128}$/.test(KUNCI)) {
  console.error('\n  ✗ AGENT_ROOM_KUNCI harus 8–128 karakter huruf/angka/_.- (dipakai di baris shell hook)\n');
  process.exit(1);
}

export function bentukPerintah({ curl = useCurl, url = URL_KANTOR, kunci = KUNCI, mesin = MESIN, port = PORT, hook = HOOK } = {}) {
  if (!curl) return `node "${hook}"`;
  const tujuan = (url || `http://127.0.0.1:${port}`) + '/event';
  // header x-agent-room sekaligus jadi penanda supaya isOurs() bisa mengenali
  // dan melepas hook ini lagi nanti.
  /* `-T -`, bukan `--data-binary @-`: keduanya mengirim stdin sebagai body,
     tapi --data-binary MENGHABISKAN stdin sebelum tersambung, sedangkan -T
     baru membacanya sesudah koneksi berdiri (dikirim chunked). Jadi waktu
     server ruangan mati, cabang `||` masih menerima payload utuh dan
     `hook.mjs --tunda` menyimpannya ke kotak surat ~/.agent-room/tunda —
     dipungut server saat nyala lagi. `Expect:` dikosongkan supaya curl tidak
     menunggu 100-continue. Sesi tetap tidak pernah kena warning: hook.mjs
     selalu keluar 0 dan tidak menulis apa pun ke stdout.                   */
  return `curl -s -m 2 --connect-timeout 1 -X POST -H "content-type: application/json" ` +
    `-H "x-agent-room: 1" -H "Expect:"` +
    (mesin ? ` -H "x-agent-room-mesin: ${mesin}"` : '') +
    (kunci ? ` -H "x-agent-room-kunci: ${kunci}"` : '') +
    ` -T - ${tujuan} || node "${hook}" --tunda`;
}

const command = bentukPerintah();
const entry = { type: 'command', command, timeout: 5 };

// --coba: cetak yang akan ditulis, jangan sentuh settings — ini jalur uji.
if (args.includes('--coba')) {
  console.log(`\n  --coba: tidak menulis apa pun`);
  console.log(`  target    ${target}`);
  console.log(`  transport ${useCurl ? 'curl' : 'node hook.mjs'}`);
  console.log(`  kantor    ${URL_KANTOR || 'http://127.0.0.1:' + PORT + ' (lokal)'}`);
  console.log(`  kunci     ${KUNCI ? 'terpasang' : 'tidak'}`);
  console.log(`  mesin     ${MESIN}`);
  console.log(`  perintah  ${command}\n`);
  process.exit(0);
}

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
  if (URL_KANTOR) console.log(`    kantor pusat: ${URL_KANTOR}  (event dari mesin ini dikirim ke sana)`);
  if (KUNCI) console.log(`    kunci event: terpasang di perintah hook`);
  else if (URL_KANTOR) console.log(`    kunci event: TIDAK ADA — kantor pusat yang memakai AGENT_ROOM_KUNCI akan menolak`);
  console.log(`\n  Restart sesi Claude Code supaya hooks kebaca, lalu buka ${URL_KANTOR || 'http://127.0.0.1:' + PORT}\n`);
}
