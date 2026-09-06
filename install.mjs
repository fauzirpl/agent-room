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

/* Daftar hook Gemini. Nama-namanya dibaca dari `HookEventName` di
   `dist/src/hooks/types.d.ts` paket terpasang, dan tiap nama di sini WAJIB
   punya padanan kind di server — `selaras-dokumen.mjs` yang menagihnya.
   BeforeModel/AfterModel/BeforeToolSelection sengaja tidak ada: ketiganya
   menyala di dalam satu giliran yang sama dan tidak menggerakkan apa pun di
   ruangan. Hook yang tidak membuat sesuatu bergerak tidak dipasang. */
const GEMINI_TOOL_EVENTS = ['BeforeTool', 'AfterTool'];
const GEMINI_PLAIN_EVENTS = [
  'BeforeAgent', 'AfterAgent', 'SessionStart', 'SessionEnd',
  'Notification', 'PreCompress',
];

/* ————— pegawai honorer: vendor selain Claude Code —————
   `--untuk gemini` memasang hook yang SAMA ke Gemini CLI. Bisa karena payload
   hook-nya ternyata sama persis bentuknya (session_id, transcript_path, cwd,
   hook_event_name + tool_name/tool_input/tool_response) — dibuktikan dari
   `dist/src/hooks/types.d.ts` paket `@google/gemini-cli` yang terpasang, bukan
   dari dokumen di internet. Yang beda cuma empat hal, dan keempatnya di sini:

     1. berkasnya `~/.gemini/settings.json`, bukan `~/.claude/settings.json`;
     2. hooknya masih EKSPERIMEN dan harus dinyalakan dua saklar —
        `tools.enableHooks` dan `hooks.enabled`; tanpa keduanya hooknya diam;
     3. `timeout` dihitung MILIDETIK, bukan detik. Menyalin angka 5 dari
        profil Claude berarti 5 milidetik, dan setiap hook mati sebelum curl
        sempat menyambung;
     4. stdout hook dibaca sebagai JSON kalau exit 0; yang gagal diurai
        diperlakukan sebagai `systemMessage` yang muncul ke pemakainya. Jadi
        perintahnya ditutup `; echo {}` — sekalian memaksa exit 0, karena
        exit 2 di Gemini berarti MEMBLOKIR tool-nya. Nota bukan rem.

   Codex CLI dan Cursor tidak ada di sini; alasannya di komentar ASAL_SAH
   server.mjs. */
const VENDOR = {
  claude: {
    nama: 'Claude Code',
    berkas: '.claude/settings.json',
    toolEvents: TOOL_EVENTS,
    plainEvents: PLAIN_EVENTS,
    timeout: 5,                 // DETIK
    nyalakan: null,
  },
  gemini: {
    nama: 'Gemini CLI',
    berkas: '.gemini/settings.json',
    toolEvents: GEMINI_TOOL_EVENTS,
    plainEvents: GEMINI_PLAIN_EVENTS,
    timeout: 5000,              // MILIDETIK
    nyalakan: (s) => {
      s.tools = (s.tools && typeof s.tools === 'object') ? s.tools : {};
      s.tools.enableHooks = true;
    },
  },
};

const iUntuk = args.indexOf('--untuk');
const ASAL = iUntuk >= 0 ? String(args[iUntuk + 1] || '').trim().toLowerCase() : 'claude';
if (!VENDOR[ASAL]) {
  console.error('\n  ✗ --untuk tidak dikenal: ' + (args[iUntuk + 1] || '(kosong)')
    + '\n    yang ada: ' + Object.keys(VENDOR).join(', ') + '\n');
  process.exit(1);
}
const V = VENDOR[ASAL];

const target = global_
  ? path.join(os.homedir(), ...V.berkas.split('/'))
  : path.join(process.cwd(), ...V.berkas.split('/'));
/* Larik yang benar-benar DIPASANG diambil dari profil vendor. `TOOL_EVENTS`
   dan `PLAIN_EVENTS` di atas tetap ada sebagai literal karena keduanya
   permukaan protokol Claude yang dijaga `selaras-dokumen.mjs` — gerbang itu
   membaca sumbernya sebagai teks, bukan menjalankannya. */
const TOOLS = V.toolEvents;
const PLAIN = V.plainEvents;

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

export function bentukPerintah({ curl = useCurl, url = URL_KANTOR, kunci = KUNCI, mesin = MESIN, port = PORT, hook = HOOK, asal = ASAL } = {}) {
  /* Vendor selain Claude menutup perintahnya dengan `; echo {}`: stdout hook
     Gemini dibaca sebagai JSON, dan yang gagal diurai muncul ke pemakainya
     sebagai systemMessage. Sekalian memaksa exit 0 — exit 2 di sana berarti
     MEMBLOKIR tool-nya, dan kantor ini tidak pernah jadi rem. */
  const tutup = asal !== 'claude' ? '; echo {}' : '';
  if (!curl) return `node "${hook}"` + (asal !== 'claude' ? ` --asal ${asal}` : '') + tutup;
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
    (asal !== 'claude' ? ` -H "x-agent-room-asal: ${asal}"` : '') +
    ` -T - ${tujuan} || node "${hook}" --tunda`
    + (asal !== 'claude' ? ` --asal ${asal}` : '') + tutup;
}

const command = bentukPerintah();
// satuan `timeout` beda per vendor: Claude detik, Gemini milidetik
const entry = { type: 'command', command, timeout: V.timeout };

// --coba: cetak yang akan ditulis, jangan sentuh settings — ini jalur uji.
if (args.includes('--coba')) {
  console.log(`\n  --coba: tidak menulis apa pun`);
  console.log(`  untuk     ${V.nama}`);
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
  for (const name of TOOLS) {
    hooks[name] = hooks[name] || [];
    hooks[name].push({ matcher: '*', hooks: [entry] });
  }
  for (const name of PLAIN) {
    hooks[name] = hooks[name] || [];
    hooks[name].push({ hooks: [entry] });
  }
  /* Saklar yang cuma dipunyai vendor tertentu. Hooks Gemini masih eksperimen:
     tanpa `tools.enableHooks` DAN `hooks.enabled` seluruh blok hook diam, dan
     installer yang menulis hook lalu membiarkan sesi tetap sunyi lebih buruk
     daripada installer yang tidak melakukan apa-apa. */
  if (V.nyalakan) V.nyalakan(settings);
  if (ASAL === 'gemini') hooks.enabled = true;
}

/* `hooks.enabled` bukan nama event — kalau yang tersisa cuma dia, berarti
   tidak ada hook sama sekali dan seluruh bloknya dibuang. */
const adaEvent = Object.keys(hooks).some((k) => Array.isArray(hooks[k]) && hooks[k].length);
if (adaEvent) settings.hooks = hooks;
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

const scope = (global_ ? 'GLOBAL (semua project)' : `project ${process.cwd()}`)
  + (ASAL !== 'claude' ? ` — ${V.nama}` : '');
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
  console.log(`\n  Restart sesi ${V.nama} supaya hooks kebaca, lalu buka ${URL_KANTOR || 'http://127.0.0.1:' + PORT}\n`);
}
