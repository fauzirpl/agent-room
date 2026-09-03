#!/usr/bin/env node
// agent-room :: server
// Zero-dependency HTTP + SSE bus. Claude Code hooks POST here, browser listens.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.AGENT_ROOM_PORT || 4517);
const HOST = process.env.AGENT_ROOM_HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const RING_SIZE = 400;

/* ---------------------------------------------------------- kendali web ---
   Menyalakan ini berarti halaman web boleh MELAHIRKAN sesi Claude Code baru.
   Itu jalur eksekusi kode, jadi sengaja mati sampai diminta:
       node server.mjs --izinkan-perintah
   Setelan izinnya longgar (bypassPermissions, semua tool, cwd bebas) sesuai
   permintaan pemilik mesin. Yang TIDAK bisa ditawar dan tetap dipasang:
   - prompt tidak pernah lewat shell, jadi tidak bisa disisipi perintah
   - token per-jalan + cek Origin, supaya situs lain yang kebetulan dibuka
     pemilik tidak bisa diam-diam menyuruh mesinnya bekerja                  */
const IZIN = process.argv.includes('--izinkan-perintah');
const TOKEN = crypto.randomBytes(16).toString('hex');
const MAKS_JALAN = 4;                       // batas proses bersamaan
const TIMEOUT_MS = 15 * 60 * 1000;
/* Sesi headless yang gagal autentikasi tidak error dan tidak keluar — ia cuma
   diam sampai timeout. Tanpa penjaga ini, kegagalan itu tidak terlihat selama
   15 menit penuh: pegawainya berdiri di ruangan tanpa pernah bekerja. Satu pun
   hook yang masuk sudah cukup membatalkan peringatan. */
const BISU_MS = 25 * 1000;
const jalan = new Map();                    // uuid -> { anak, nama, mulai, cwd }

/* Kredensial untuk sesi yang dilahirkan halaman ini. Boleh ditempel dari web
   supaya tidak perlu mengatur env di terminal, dengan empat batasan yang
   sengaja dipasang dan tidak ditawar:
   - disimpan DI MEMORI saja; tidak pernah ditulis ke disk, hilang saat server mati
   - tidak pernah dikirim balik ke halaman; yang bisa dibaca cuma ada/tidaknya
   - tidak pernah masuk log, konsol, maupun stream event
   - diteruskan ke proses anak lewat ENV, bukan argv: daftar proses di Windows
     bisa dibaca proses lain, isi env-nya tidak                                */
let kredensial = null;                      // { nilai, envKey, sejak }

/** Token dari `claude setup-token` dan kunci API dipakai lewat env yang berbeda.
    Awalannya yang membedakan: sk-ant-api… kunci API, sk-ant-oat… token OAuth. */
function envKredensial(nilai) {
  return /^sk-ant-api/i.test(nilai) ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
}

/* Kalau kamu mencentang "ingat di berkas", tokennya ditulis ke sini supaya
   tidak perlu ditempel ulang tiap server dijalankan. Isinya token MENTAH —
   perlakukan seperti kunci: jangan ikut di-commit, jangan dikirim ke siapa pun.
   Mode 0600 berlaku di POSIX; di Windows yang berlaku ACL folder induknya. */
const BERKAS_TOKEN = process.env.AGENT_ROOM_TOKEN_FILE
  || path.join(__dirname, '.agent-room-token');

function muatKredensial() {
  let nilai = '';
  try {
    nilai = fs.readFileSync(BERKAS_TOKEN, 'utf8').trim();
  } catch {
    return;                                   // tidak ada berkasnya: wajar
  }
  if (!nilai) return;
  kredensial = { nilai, envKey: envKredensial(nilai), sejak: Date.now(), dariBerkas: true };
  console.log('[agent-room] kredensial headless dimuat dari ' + BERKAS_TOKEN
    + ' (' + kredensial.envKey + ')');
}

function tulisBerkasToken(nilai) {
  fs.writeFileSync(BERKAS_TOKEN, nilai + '\n', { mode: 0o600 });
}

function hapusBerkasToken() {
  try { fs.unlinkSync(BERKAS_TOKEN); } catch { /* memang belum pernah ada */ }
}
const namaSesi = new Map();                 // sesi 12-char -> nama panggilan
const peranSesi = new Map();                // sesi 12-char -> id jabatan
// Id jabatan itu kunci tabel di sisi halaman, bukan teks bebas. Disaring di
// sini supaya yang beredar di stream tetap berupa id, bukan kalimat orang.
const PERAN_SAH = /^[a-z][a-z_]{0,23}$/;

/* Model yang dipakai tiap sesi. Untuk sesi yang dilahirkan halaman ini kita
   tahu persis — kita sendiri yang mengirim --model. Sesi terminal tidak wajib
   memberitahu, jadi payload hook-nya cuma dibaca kalau kebetulan membawanya.
   Polanya longgar karena id model sah bisa berupa alias (`opus`), id penuh
   (`claude-opus-5`), maupun id penyedia lain yang memakai titik dan titik dua. */
const modelSesi = new Map();            // sesi 12-char -> id/nama model
const MODEL_SAH = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function modelDari(raw) {
  const m = raw.model;
  if (typeof m === 'string') return clip(m, 48);
  if (m && typeof m === 'object') return clip(m.display_name || m.id || '', 48);
  return '';
}

/** Alamat biner claude, dicari sekali di awal. Tanpa ini kita terpaksa
    memakai shell, dan shell + teks bebas dari halaman = celah injeksi.

    Bisa ditunjuk manual lewat AGENT_ROOM_CLAUDE. Itu perlu karena `where
    claude` gampang menemukan instalasi lama yang tertinggal di PATH, dan versi
    lama gagal TANPA SUARA: prosesnya lahir, tidak menulis apa pun ke stdout
    maupun stderr, lalu menggantung sampai timeout. */
function cariClaude() {
  const pilihan = (process.env.AGENT_ROOM_CLAUDE || '').trim();
  if (pilihan) {
    if (fs.existsSync(pilihan)) return pilihan;
    console.warn('[agent-room] AGENT_ROOM_CLAUDE menunjuk berkas yang tidak ada: ' + pilihan);
  }
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const out = execFileSync(cmd, ['claude'], { encoding: 'utf8' });
    const baris = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const exe = baris.find((l) => /\.(exe|cmd|bat)$/i.test(l)) || baris[0];
    return exe || null;
  } catch {
    return null;
  }
}

/** Versi biner yang akan dipakai, ditanya sekali saat start. Ditampilkan supaya
    instalasi basi ketahuan sebelum menyisakan tugas yang diam berjam-jam. */
function versiClaude(exe) {
  try {
    return execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'versi tidak terbaca';
  }
}
const CLAUDE = IZIN ? cariClaude() : null;

const asalSah = (req) => {
  const o = req.headers.origin;
  if (!o) return true;                      // curl/hook: tidak berasal dari halaman
  return o === `http://127.0.0.1:${PORT}` || o === `http://localhost:${PORT}`;
};

/** @type {any[]} */
const ring = [];
/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();
let seq = 0;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const clip = (v, n = 88) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
};
const baseName = (p) => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() || '';

/* ------------------------------------------------------- cabang git -----
   Nama folder saja tidak cukup membedakan dua sesi di proyek yang sama:
   yang satu di `master`, yang lain di worktree `fitur/x`. Cabangnya dibaca
   langsung dari `.git/HEAD` — bukan lewat `git rev-parse` — karena ini
   jalan di setiap event hook dan tidak boleh memunculkan proses baru.
   Worktree punya `.git` berupa BERKAS berisi `gitdir: <path>`; diikuti ke
   sana, HEAD-nya yang dibaca. Hasilnya nama cabang, atau 7 hex pertama saat
   detached, atau string kosong kalau cwd bukan repo. Tidak pernah melempar. */
const cabangCache = new Map();   // cwd -> { cabang, dicek, mtime, head }
const CABANG_SEGAR = 15 * 1000;  // di bawah ini tidak stat sama sekali
const CABANG_NAIK = 8;           // batas naik ke folder induk mencari .git

function cariHeadGit(cwd) {
  let dir = path.resolve(cwd);
  for (let i = 0; i < CABANG_NAIK; i++) {
    const git = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(git); } catch {}
    if (st) {
      if (st.isDirectory()) return path.join(git, 'HEAD');
      const m = fs.readFileSync(git, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m);
      return m ? path.join(path.resolve(dir, m[1]), 'HEAD') : '';
    }
    const induk = path.dirname(dir);
    if (induk === dir) break;
    dir = induk;
  }
  return '';
}

function bacaHeadGit(head) {
  const isi = fs.readFileSync(head, 'utf8').trim();
  const m = isi.match(/^ref:\s*refs\/heads\/(.+)$/);
  if (m) return clip(m[1], 48);
  return /^[0-9a-f]{40}$/i.test(isi) ? isi.slice(0, 7) : '';
}

function cabangGit(cwd) {
  if (!cwd) return '';
  cwd = String(cwd);
  const kini = Date.now();
  try {
    const c = cabangCache.get(cwd);
    if (c && kini - c.dicek < CABANG_SEGAR) return c.cabang;
    if (c && c.head) {
      // di luar masa segar cukup stat: HEAD ditulis ulang tiap checkout,
      // jadi mtime yang sama berarti cabangnya juga masih sama
      const mtime = fs.statSync(c.head).mtimeMs;
      if (mtime === c.mtime) { c.dicek = kini; return c.cabang; }
    }
    const head = cariHeadGit(cwd);
    const mtime = head ? fs.statSync(head).mtimeMs : 0;
    const cabang = head ? bacaHeadGit(head) : '';
    cabangCache.set(cwd, { cabang, dicek: kini, mtime, head });
    if (cabangCache.size > 200) cabangCache.delete(cabangCache.keys().next().value);
    return cabang;
  } catch {
    cabangCache.set(cwd, { cabang: '', dicek: kini, mtime: 0, head: '' });
    return '';
  }
}

const EVENT_ALIAS = {
  PreToolUse: 'pre',
  PostToolUse: 'post',
  // Sejak PostToolUse cuma menyala waktu tool-nya BERHASIL, kegagalan datang
  // lewat event terpisah. Tetap dipetakan ke 'post' karena yang harus terjadi
  // sama persis — giliran kerjanya ditutup, rapatnya dibubarkan — bedanya cuma
  // `ok:false` plus pesan galatnya. Kind sendiri berarti menyalin semua itu.
  PostToolUseFailure: 'post',
  UserPromptSubmit: 'prompt',
  Stop: 'stop',
  StopFailure: 'stop-gagal',
  SubagentStart: 'subagent-start',
  SubagentStop: 'subagent-stop',
  PermissionRequest: 'izin-minta',
  PermissionDenied: 'izin-tolak',
  Notification: 'notify',
  SessionStart: 'session-start',
  SessionEnd: 'session-end',
  PreCompact: 'compact',
  PostCompact: 'compact-selesai',
};

/* Jenis galat yang bikin giliran agen berhenti di tengah jalan. Namanya datang
   dalam bahasa Inggris dan cuma segelintir, jadi diterjemahkan di sini supaya
   panel tidak mendadak berbahasa Inggris. Yang tidak dikenal lewat apa adanya —
   lebih jujur daripada memaksanya jadi "galat lain". */
const GALAT_STOP = {
  rate_limit: 'kena batas pemakaian',
  overloaded: 'server penuh',
  authentication_failed: 'kredensial ditolak',
  oauth_org_not_allowed: 'organisasi tidak diizinkan',
  billing_error: 'urusan tagihan',
  invalid_request: 'permintaan tidak sah',
  model_not_found: 'model tidak ketemu',
  server_error: 'server bermasalah',
  max_output_tokens: 'jawabannya kepanjangan',
  unknown: 'sebabnya tidak jelas',
};

/* Pemicu pemadatan konteks. Dua nilai saja, tapi bedanya penting dibaca:
   yang manual kamu yang minta, yang otomatis berarti konteksnya sudah mepet. */
const PEMICU_COMPACT = { manual: 'diminta', auto: 'otomatis' };

/* Sesi yang berhenti MENUNGGU KEPUTUSAN KAMU. Ini keadaan ketiga, di samping
   sedang bekerja dan menganggur, dan bedanya nyata: yang menganggur sudah
   selesai, yang ini tidak bisa lanjut sampai ada orang yang menjawab.
   Disimpan per sesi supaya server tetap jadi sumbernya — halaman cukup
   mengikuti apa yang dikirim, tidak perlu menebak sendiri. */
const butuhManusia = new Map();             // sesi 12-char -> { sebab, alasan }

/* Keadaan keempat, dan yang paling gampang disalahbaca sebagai "menunggu
   manusia" padahal beda: giliran ini BERHENTI PAKSA karena galat, bukan
   berhenti untuk menunggu jawabanmu. Kamu tidak sedang ditunggu — sesinya
   tidak bisa lanjut sampai kondisinya sendiri berubah (kuota reset, server
   pulih) atau kamu yang memutuskan menyuruhnya lanjut. Dipisah dari
   `butuhManusia` supaya dua hal itu tidak pernah tercampur di satu Map,
   walau keduanya sama-sama "berhenti di tempat" secara visual. */
const macetSesi = new Map();                // sesi 12-char -> { jenis, label, galat }

/* Dipakai dari DUA jalur — hook lewat normalize(), dan stream-json lewat
   serapStream() — supaya sesi yang dilahirkan halaman ini pun dapat tanda
   yang sama waktu galat API menghentikannya, bukan cuma balon sesaat yang
   hilang begitu `rec.hasil` datang. */
function tandaiMacet(sesi, jenis, label, galat) {
  const keadaan = { jenis, label, galat: galat || '' };
  macetSesi.set(sesi, keadaan);
  return keadaan;
}

/* Dari 12 nilai `notification_type`, cuma dua yang benar-benar berarti
   gilirannya ada di kamu. Sisanya kabar lewat: `auth_success` memberitahu
   login berhasil, `agent_completed` memberitahu subagent kelar, `quota_*`
   memberitahu kuota. Tidak satu pun menahan sesinya. */
const NOTIFY_BUTUH = new Set(['permission_prompt', 'agent_needs_input']);

/* Dua tool yang tidak mengerjakan apa pun sampai kamu menjawab: yang satu
   bertanya, yang satu mengajukan rencana. Hook cuma bilang "PreToolUse
   AskUserQuestion" — pertanyaannya sendiri ada di `tool_input`, dan justru itu
   yang perlu dibaca orang. Jadi keduanya masuk keadaan "butuh manusia" sama
   seperti permintaan izin, lengkap dengan isi pertanyaannya. */
const TOOL_TANYA = new Set(['AskUserQuestion', 'ExitPlanMode']);

function ringkasTanya(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  if (tool === 'ExitPlanMode') return { jenis: 'rencana', teks: potong(i.plan || '', UCAP_MAX) };
  const daftar = [];
  for (const q of Array.isArray(i.questions) ? i.questions.slice(0, 4) : []) {
    daftar.push({
      tanya: clip((q && (q.question || q.header)) || '', 240),
      opsi: (Array.isArray(q && q.options) ? q.options.slice(0, 6) : [])
        .map((o) => clip((o && o.label) || '', 60)).filter(Boolean),
    });
  }
  return { jenis: 'tanya', daftar };
}

/** Human-readable one-liner for what the agent is doing. */
function describe(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      // perintahnya, bukan description-nya: description sering kalimat Inggris
      // yang janggal disandingkan dengan frasa kegiatan berbahasa Indonesia
      return clip(i.command || i.description);
    case 'Read':
    case 'NotebookEdit':
      return baseName(i.file_path || i.notebook_path);
    case 'Edit':
    case 'Write':
      return baseName(i.file_path);
    case 'Glob':
      return clip(i.pattern);
    case 'Grep': {
      const pola = clip(i.pattern);
      const di = i.path ? `di ${baseName(i.path)}` : '';
      return [pola, di].filter(Boolean).join(' ');
    }
    case 'WebFetch':
      try { return new URL(i.url).host; } catch { return clip(i.url, 40); }
    case 'WebSearch':
      return clip(i.query, 50);
    case 'Task':
    case 'Agent':
      return clip(i.description || i.subagent_type, 50);
    case 'Workflow':
      // input-nya berisi seluruh script; jatuh ke default bikin label berupa
      // potongan kode. Nama workflow-nya yang informatif.
      return clip(namaWorkflow(i), 50);
    case 'TodoWrite':
      return Array.isArray(i.todos) ? `${i.todos.length} item` : 'todo';
    case 'Skill':
      return clip(i.skill);
    case 'AskUserQuestion': {
      const q = Array.isArray(i.questions) ? i.questions[0] : null;
      return clip((q && (q.header || q.question)) || 'pertanyaan', 50);
    }
    case 'ExitPlanMode':
      // baris pertama rencana biasanya judulnya; nama tool-nya sendiri sudah
      // jadi kegiatan ("mengajukan rencana"), jadi jangan diulang di objeknya
      return clip(String(i.plan || '').split('\n')[0].replace(/^#+\s*/, ''), 50);
    default: {
      // jangan pernah jatuh ke nama tool: itu bahasa Inggris dan bikin label
      // seperti "menunggu arahan AskUserQuestion". Kosong lebih baik.
      const first = Object.values(i).find((v) => typeof v === 'string');
      return first ? clip(first, 50) : '';
    }
  }
}

/** Nama workflow dari `meta.name`, argumen `name`, atau nama file script-nya. */
function namaWorkflow(i) {
  const script = typeof i.script === 'string' ? i.script : '';
  const m = script.match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
  return (m && m[1]) || i.name || baseName(i.scriptPath) || 'workflow';
}

/* Siapa saja yang ikut duduk di meja rapat untuk satu panggilan tool.
   Workflow: satu kursi per fase, diambil dari `meta.phases` di script-nya —
   itu satu-satunya daftar peserta yang bisa dibaca sebelum workflow-nya jalan
   (jumlah agent per fase sering ditentukan saat runtime).

   Task/Agent: satu kursi SEMENTARA. Identitas subagent yang sebenarnya datang
   dari `SubagentStart` (`agent_type`/`agent_id`), tapi baru beberapa saat
   kemudian; `description` di sisi pemanggil sudah bisa dibaca sekarang, jadi
   dia yang menempati kursinya lebih dulu dan diambil alih begitu agennya
   memperkenalkan diri. Ini juga yang menahan kursinya tetap terisi kalau
   `SubagentStart` memang tidak pernah datang. */
function pesertaRapat(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  if (tool === 'Task' || tool === 'Agent') {
    return [clip(i.description || i.subagent_type || 'agen', 26)];
  }
  if (tool !== 'Workflow') return [];
  const script = typeof i.script === 'string' ? i.script : '';
  const blok = script.match(/phases\s*:\s*\[([^\]]*)\]/);
  const fase = [];
  if (blok) {
    for (const m of blok[1].matchAll(/title\s*:\s*['"`]([^'"`]+)['"`]/g)) {
      fase.push(clip(m[1], 26));
      if (fase.length >= 9) break;                 // kursi meja rapat cuma 9
    }
  }
  return fase.length ? fase : [clip(namaWorkflow(i), 26)];
}

/** Did a PostToolUse response look like a failure? */
function isError(resp) {
  if (!resp) return false;
  if (typeof resp === 'object') {
    if (resp.is_error === true || resp.success === false) return true;
    if (typeof resp.stderr === 'string' && resp.stderr.trim() && resp.exit_code) return true;
  }
  const s = typeof resp === 'string' ? resp : JSON.stringify(resp);
  return /^\s*(error|exception)[:\s]/i.test(s || '');
}

function normalize(raw) {
  const kind = EVENT_ALIAS[raw.hook_event_name] || String(raw.hook_event_name || 'unknown').toLowerCase();
  const tool = raw.tool_name || null;
  // Kegagalan datang lewat event sendiri sekarang, tapi isError() tetap dipakai:
  // versi Claude Code lama masih mengirim PostToolUse berisi respons galat.
  const gagalTool = raw.hook_event_name === 'PostToolUseFailure';
  const ev = {
    id: ++seq,
    ts: Date.now(),
    kind,
    session: String(raw.session_id || 'local').slice(0, 12),
    cwd: raw.cwd ? baseName(raw.cwd) : '',
    // nama cabangnya saja, bukan path — path penuh tidak pernah keluar ke halaman
    ...(raw.cwd ? { cabang: cabangGit(raw.cwd) } : {}),
    tool,
    label: tool ? describe(tool, raw.tool_input) : '',
    ok: kind === 'post' ? !gagalTool && !isError(raw.tool_response) : true,
  };
  // Id panggilan tool: pre dan post-nya membawa nilai yang sama. Ini yang bikin
  // pasangan pre→post bisa dicocokkan persis, bukan ditebak lewat (sesi, tool).
  if (raw.tool_use_id) ev.panggilan = clip(raw.tool_use_id, 64);
  if (Number.isFinite(raw.duration_ms)) ev.durasi = Math.round(raw.duration_ms);
  const panggilan = namaSesi.get(ev.session);
  if (panggilan) ev.nama = panggilan;
  const peran = peranSesi.get(ev.session);
  if (peran) ev.peran = peran;
  // yang kita kirim sendiri menang atas yang dibawa payload: itu id sebenarnya,
  // bukan nama tampilan yang bisa berubah antar versi
  const bawa = modelDari(raw);
  if (bawa && !modelSesi.has(ev.session)) modelSesi.set(ev.session, bawa);
  const model = modelSesi.get(ev.session);
  if (model) ev.model = model;
  if (tool === 'Task' || tool === 'Agent' || tool === 'Workflow') {
    ev.peserta = pesertaRapat(tool, raw.tool_input);
  }
  if (kind === 'prompt') ev.label = clip(raw.prompt, 120);
  if (kind === 'notify') {
    if (raw.notification_type) ev.jenis = clip(raw.notification_type, 32);
    // pesan notifikasi datang dalam bahasa Inggris dari Claude Code
    ev.label = clip(String(raw.message || '')
      .replace(/^Claude needs your permission to use\s*/i, 'minta izin memakai ')
      .replace(/^Claude is waiting for your input\s*/i, 'menunggu jawaban kamu')
      .replace(/\bis waiting for your input\b/i, 'menunggu jawaban kamu'), 120);
  }
  if (kind === 'session-start') ev.label = clip(raw.source || 'startup', 40);
  if (kind === 'session-end') ev.label = clip(raw.reason || '', 40);
  if (gagalTool) {
    ev.galat = clip(raw.error, 120);
    // Ctrl+C bukan kegagalan tool: yang berhenti kamu, bukan alatnya. Dibedakan
    // supaya panelnya tidak menuduh alat yang sebenarnya baik-baik saja.
    ev.interupsi = raw.is_interrupt === true;
  }
  if (kind === 'stop-gagal') {
    const jenis = String(raw.error || 'unknown');
    ev.label = clip(GALAT_STOP[jenis] || jenis, 60);
    ev.galat = clip(raw.error_details || '', 120);
  }
  if (kind === 'subagent-start' || kind === 'subagent-stop') {
    // Identitas subagent yang sebenarnya — bukan `description` milik pemanggil.
    // Ada HANYA kalau hook-nya menyala di dalam subagent, dan itu justru yang
    // membuatnya bisa dipakai memasangkan siapa masuk dengan siapa keluar.
    if (raw.agent_id) ev.agenId = clip(raw.agent_id, 64);
    if (raw.agent_type) ev.agen = clip(raw.agent_type, 26);
    ev.label = ev.agen || '';
  }
  if (kind === 'izin-tolak') ev.alasan = clip(raw.reason || '', 120);
  if (kind === 'pre' && TOOL_TANYA.has(tool)) ev.tanya = ringkasTanya(tool, raw.tool_input);
  if (kind === 'compact' || kind === 'compact-selesai') {
    const p = String(raw.trigger || '');
    ev.label = clip(PEMICU_COMPACT[p] || p, 40);
  }
  /* Keadaan "butuh manusia" dihitung di sini, bukan lewat sapuan berkala.
     Alasannya waktu: izin yang kamu berikan detik ini langsung disusul
     PostToolUse, dan pegawainya harus duduk lagi saat itu juga — kalau
     menunggu penyapu lewat, dia berdiri mengangkat map padahal sesinya sudah
     jalan lagi. Jadi event APA PUN dari sesi yang sama membatalkannya. */
  const sebab = kind === 'izin-minta' ? 'izin'
    : kind === 'izin-tolak' ? 'tolak'
    : kind === 'notify' && NOTIFY_BUTUH.has(String(raw.notification_type || '')) ? 'tanya'
    : kind === 'pre' && TOOL_TANYA.has(tool) ? 'tanya'
    : '';
  if (sebab) {
    const keadaan = { sebab, alasan: ev.alasan || '', label: ev.label || '' };
    butuhManusia.set(ev.session, keadaan);
    ev.butuh = keadaan;
  } else if (butuhManusia.delete(ev.session)) {
    ev.butuh = false;
  }

  /* Sama persis alasannya dengan blok di atas, cuma untuk keadaan yang
     berbeda: `stop-gagal` menyalakannya, dan giliran BERIKUTNYA dari sesi
     yang sama — apa pun bentuknya, tool baru atau prompt baru — berarti
     sesinya sudah lanjut lagi, jadi tandanya dicabut. */
  if (kind === 'stop-gagal') {
    ev.macet = tandaiMacet(ev.session, String(raw.error || 'unknown'), ev.label || '', ev.galat);
  } else if (macetSesi.delete(ev.session)) {
    ev.macet = false;
  }
  return ev;
}

/* Sesi yang mengirim hook berarti benar-benar hidup: batalkan penjaga bisu. */
function tandaiHidup(sesi) {
  for (const [id, j] of jalan) {
    if (id.slice(0, 12) !== sesi || j.hidup) continue;
    j.hidup = true;
    clearTimeout(j.bisu);
  }
}

function publish(ev) {
  ring.push(ev);
  if (ring.length > RING_SIZE) ring.shift();
  const frame = `id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) {
    try { res.write(frame); } catch { clients.delete(res); }
  }
}

/* ————— transkrip: isi kepala dan isi mulut agen —————

   Hook membawa PERBUATAN — tool apa, berkas mana, berhasil atau tidak — tapi
   tidak pernah membawa ISI: kalimat yang ditulis agen untuk kamu, apalagi
   pikirannya. Keduanya cuma ada di satu tempat, yaitu berkas transkrip sesi
   yang ditulis Claude Code sendiri: satu baris JSON per pesan. Jalurnya
   dititipkan di tiap payload hook (`transcript_path`), jadi tinggal diikuti
   dari ujungnya — apa yang bertambah SESUDAH kita mulai memantau, itu yang
   disiarkan.

   Dibaca dari EKOR, bukan dari pangkal. Sesi yang sudah panjang tidak boleh
   membanjiri ruangan dengan pikiran satu jam lalu; yang menarik selalu yang
   baru saja terjadi.

   Baris dari subagent (`isSidechain`) dilewati. Tidak ada apa pun di barisnya
   yang bisa dipakai memastikan dia peserta rapat yang mana, dan menempelkan
   pikiran ke orang yang salah lebih buruk daripada tidak menampilkannya.

   Isi pikiran TIDAK SELALU ADA. Sebagian permintaan mengembalikan blok
   `thinking` yang teksnya kosong — tersegel, cuma tanda tangannya yang ikut.
   Waktu itu terjadi yang dikirim jumlah tokennya saja: "dia memang sedang
   mikir, isinya tidak dibagi" lebih jujur daripada balon kosong.            */

const PIKIR_MAX = 520;                    // teks yang muat di balon pikiran
const UCAP_MAX = 4000;                    // teks yang dibaca orang di modal
const TRANSKRIP_MAX = 24;                 // berkas yang dipantau bersamaan
const TRANSKRIP_JEDA = 350;               // ms antar cek ukuran berkas
const TRANSKRIP_SEPI = 30 * 60 * 1000;    // sesi sesenyap ini dilepas pemantaunya
const BARIS_MAX = 256 * 1024;             // baris lebih panjang dari ini tidak diurai
const SUSUL_MAX = 4 * 1024 * 1024;        // maksimal yang dibaca sekali cek

const transkrip = new Map();              // sesi 12-char -> pemantau berkas

/* Saklar mati. Sampai fitur ini ada, server cuma menyiarkan METADATA — tool
   apa, berkas mana, berhasil atau tidak. Sekarang isi percakapan ikut lewat,
   dan walau semuanya tetap di localhost, yang mau ruangannya kembali cuma
   metadata harus punya cara mematikannya di SERVER, bukan cuma menyembunyikan
   balonnya di halaman: AGENT_ROOM_ISI=off. */
const ISI_MATI = String(process.env.AGENT_ROOM_ISI || '').trim().toLowerCase() === 'off';
if (ISI_MATI) console.log('[agent-room] AGENT_ROOM_ISI=off — pikiran dan kalimat agen tidak dibaca');

/* Seperti clip(), tapi GANTI BARIS DIPERTAHANKAN: yang ini dibaca manusia
   sebagai paragraf di modal, bukan dipadatkan jadi satu baris label. */
function potong(v, n) {
  const s = String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/* Jalur transkrip kalau payload-nya kebetulan tidak membawanya. Claude Code
   menyimpan satu berkas per sesi di ~/.claude/projects/<cwd disandikan>/<id>.jsonl,
   dan penyandiannya cuma "semua yang bukan huruf/angka jadi tanda hubung".
   Tebakan ini sengaja ada: kalau suatu hari `transcript_path` hilang dari
   payload, yang mati cuma jalan pintasnya, bukan fiturnya. */
function jalurTranskrip(raw) {
  const bawaan = raw.transcript_path;
  if (typeof bawaan === 'string' && bawaan) return bawaan;
  const sesi = String(raw.session_id || '');
  const cwd = String(raw.cwd || '');
  if (!sesi || !cwd) return '';
  const dasar = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dasar, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), sesi + '.jsonl');
}

/* Token, bukan biaya. Transkrip TIDAK punya `costUSD` — cuma angka mentah
   dari respons API (`input_tokens`, `output_tokens`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`). Itu bedanya
   dengan `macetSesi`/biaya sesi: token ini RESMI, bukan perkiraan — angka apa
   adanya dari Anthropic, dijumlahkan di sini, tanpa tabel harga yang bisa
   basi. Menghitung dolarnya sendiri berarti memelihara tabel harga per model
   yang berubah tiap Anthropic mengubah harga — sengaja belum dilakukan. */
const tokenSesi = new Map();                // sesi 12-char -> { input, output, cacheTulis, cacheBaca }

/* ------------------------------------------------------ riwayat token -----
   tokenSesi di atas cuma hidup di memori selama SATU sesi — restart server
   atau tutup halaman, angkanya hilang. Ini bedanya: tiap delta token ditulis
   ke disk (satu baris JSON per giliran asisten), jadi bisa dipantau lintas
   sesi dan lintas restart. Sengaja DELTA, bukan kumulatif, supaya bisa
   dijumlah ulang per hari/per proyek kapan saja tanpa menyimpan turunannya. */
const BERKAS_RIWAYAT_TOKEN = process.env.AGENT_ROOM_TOKEN_LOG
  || path.join(__dirname, 'token-riwayat.jsonl');
const riwayatHarian = new Map();   // 'YYYY-MM-DD' (waktu lokal server) -> { input, output, cacheTulis, cacheBaca }
const riwayatProyek = new Map();   // nama folder -> { input, output, cacheTulis, cacheBaca, terakhir }
const riwayatTotal = { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
let riwayatSejak = 0;               // ts baris pertama yang pernah tercatat, buat "tercatat sejak ..."

const tanggalLokal = (ts) => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};

function riwayatTambah(ts, proyek, d) {
  if (!riwayatSejak || ts < riwayatSejak) riwayatSejak = ts;
  riwayatTotal.input += d.input; riwayatTotal.output += d.output;
  riwayatTotal.cacheTulis += d.cacheTulis; riwayatTotal.cacheBaca += d.cacheBaca;

  const hari = tanggalLokal(ts);
  const h = riwayatHarian.get(hari) || { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
  h.input += d.input; h.output += d.output; h.cacheTulis += d.cacheTulis; h.cacheBaca += d.cacheBaca;
  riwayatHarian.set(hari, h);

  const nama = proyek || '(tanpa proyek)';
  const p = riwayatProyek.get(nama) || { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0, terakhir: 0 };
  p.input += d.input; p.output += d.output; p.cacheTulis += d.cacheTulis; p.cacheBaca += d.cacheBaca;
  p.terakhir = Math.max(p.terakhir, ts);
  riwayatProyek.set(nama, p);
}

/* Ditulis async (bukan Sync) karena ini jalan tiap giliran asisten yang punya
   usage — bisa belasan kali semenit kalau beberapa sesi jalan bersamaan, dan
   tidak boleh menahan pemrosesan hook. Satu baris JSON jauh di bawah ukuran
   yang bikin write() terpecah, jadi append bersamaan dari beberapa sesi tetap
   aman tanpa perlu antrean sendiri. */
function riwayatCatat(ts, proyek, model, d) {
  if (!d.input && !d.output && !d.cacheTulis && !d.cacheBaca) return;
  riwayatTambah(ts, proyek, d);
  const baris = JSON.stringify({ ts, proyek, model: model || undefined, ...d });
  fs.appendFile(BERKAS_RIWAYAT_TOKEN, baris + '\n', (err) => {
    if (err) console.warn('[agent-room] gagal menulis riwayat token: ' + err.message);
  });
}

/* Pemadatan. Delta per giliran itu ~100 byte, tapi berkasnya bisa 8.000 baris
   dalam lima hari — puluhan MB setahun, dan semuanya dibaca sinkron tiap start.
   Padahal konsumennya (total, per hari, per proyek, grafik 14 hari) tidak
   pernah butuh butiran per giliran untuk data lama. Jadi waktu muat, baris
   yang lebih tua dari PADAT_HARI dilebur jadi satu baris per HARI per proyek
   (`padat: true`, `n` = berapa giliran yang dilebur, ts = awal hari lokal),
   dan kalau berkasnya masih di atas PADAT_UKURAN, baris berumur 7-30 hari
   ikut dilebur per JAM per proyek. Baris aslinya tidak dibuang: dipindahkan
   ke `token-riwayat.arsip.jsonl`, yang tidak pernah dibaca saat start —
   itu cuma jaminan kalau suatu hari ada yang butuh butirannya lagi.
   Field `model` dilepas waktu dilebur: tidak ada konsumen yang membacanya
   dari berkas, dan satu hari bisa memakai beberapa model sekaligus. */
const BERKAS_ARSIP_TOKEN = BERKAS_RIWAYAT_TOKEN.replace(/\.jsonl$/i, '') + '.arsip.jsonl';
const PADAT_HARI = 30 * 24 * 3600 * 1000;      // lebih tua dari ini: per hari
const PADAT_JAM = 7 * 24 * 3600 * 1000;        // lebih tua dari ini: per jam, kalau masih gemuk
const PADAT_UKURAN = 4 * 1024 * 1024;          // batas gemuk berkas utama

const awalHariLokal = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const awalJamLokal = (ts) => { const d = new Date(ts); d.setMinutes(0, 0, 0); return d.getTime(); };

/* `baris`: [{ o, teks }] hasil parse. Yang ts-nya di bawah `batas` dikelompokkan
   per (kunciWaktu(ts), proyek). Kelompok berisi satu baris yang sudah padat
   dibiarkan — supaya start berikutnya tidak menulis ulang berkas yang sama. */
function riwayatLebur(baris, batas, kunciWaktu) {
  const kelompok = new Map();
  const sisa = [];
  for (const b of baris) {
    if (b.o.ts >= batas) { sisa.push(b); continue; }
    const k = kunciWaktu(b.o.ts) + '|' + (b.o.proyek || '');
    if (!kelompok.has(k)) kelompok.set(k, []);
    kelompok.get(k).push(b);
  }
  const arsip = [];
  for (const grup of kelompok.values()) {
    if (grup.length === 1 && grup[0].o.padat) { sisa.push(grup[0]); continue; }
    const o = { ts: kunciWaktu(grup[0].o.ts), proyek: grup[0].o.proyek || '',
                input: 0, output: 0, cacheTulis: 0, cacheBaca: 0, n: 0, padat: true };
    for (const b of grup) {
      o.input += b.o.input; o.output += b.o.output;
      o.cacheTulis += b.o.cacheTulis; o.cacheBaca += b.o.cacheBaca;
      o.n += b.o.n || 1;
      arsip.push(b.teks);
    }
    sisa.push({ o, teks: JSON.stringify(o) });
  }
  sisa.sort((a, b) => a.o.ts - b.o.ts);
  return { sisa, arsip };
}

function riwayatMuat() {
  let teks = '';
  try { teks = fs.readFileSync(BERKAS_RIWAYAT_TOKEN, 'utf8'); }
  catch { return; }                 // belum ada berkasnya: wajar, riwayat baru mulai
  const baris = [];
  const rusak = [];                 // ikut ke arsip kalau berkas utama ditulis ulang
  for (const t of teks.split('\n')) {
    if (!t.trim()) continue;
    let o = null;
    try { o = JSON.parse(t); } catch {}
    if (!o || !Number.isFinite(o.ts)) { rusak.push(t); continue; }
    o.input = Number(o.input) || 0; o.output = Number(o.output) || 0;
    o.cacheTulis = Number(o.cacheTulis) || 0; o.cacheBaca = Number(o.cacheBaca) || 0;
    riwayatTambah(o.ts, o.proyek || '', o);
    baris.push({ o, teks: t });
  }
  if (baris.length) console.log('[agent-room] riwayat token dimuat: ' + baris.length + ' baris dari ' + BERKAS_RIWAYAT_TOKEN);
  // Dulu baris rusak dibuang diam-diam; sekarang dihitung supaya berkas yang
  // terpotong (mis. mati listrik di tengah append) ketahuan, bukan hilang senyap.
  if (rusak.length) console.warn('[agent-room] token-riwayat: ' + rusak.length + ' baris ditolak (bukan JSON / tanpa ts)');

  const kini = Date.now();
  let { sisa, arsip } = riwayatLebur(baris, kini - PADAT_HARI, awalHariLokal);
  let isi = sisa.map((b) => b.teks).join('\n') + '\n';
  if (Buffer.byteLength(isi) > PADAT_UKURAN) {
    const lagi = riwayatLebur(sisa, kini - PADAT_JAM, awalJamLokal);
    sisa = lagi.sisa; arsip = arsip.concat(lagi.arsip);
    isi = sisa.map((b) => b.teks).join('\n') + '\n';
  }
  if (!arsip.length) return;        // tidak ada yang layak dilebur: berkas tidak disentuh

  // Arsip dulu, baru berkas utama: kalau arsip gagal, berkas utama tetap utuh
  // dan tidak ada butiran yang hilang. Tulis .tmp lalu rename supaya start
  // yang keburu mati di tengah tidak meninggalkan berkas utama setengah jadi.
  try {
    fs.appendFileSync(BERKAS_ARSIP_TOKEN, arsip.concat(rusak).join('\n') + '\n');
    const tmp = BERKAS_RIWAYAT_TOKEN + '.tmp';
    fs.writeFileSync(tmp, isi);
    fs.renameSync(tmp, BERKAS_RIWAYAT_TOKEN);
    console.log('[agent-room] token-riwayat dipadatkan: ' + arsip.length + ' baris -> '
      + (arsip.length - (baris.length - sisa.length)) + ' ringkasan; '
      + baris.length + ' -> ' + sisa.length + ' baris, aslinya ke ' + path.basename(BERKAS_ARSIP_TOKEN));
  } catch (err) {
    console.warn('[agent-room] gagal memadatkan token-riwayat: ' + err.message);
  }
}
riwayatMuat();

/** Rangka event untuk sesi yang identitasnya sudah tercatat di server. */
const dasarSesi = (sesi, cwd, ts) => ({
  id: ++seq,
  ts: ts || Date.now(),
  session: sesi,
  cwd: baseName(cwd || ''),
  ...(cwd ? { cabang: cabangGit(cwd) } : {}),
  tool: null,
  label: '',
  ok: true,
  ...(namaSesi.has(sesi) ? { nama: namaSesi.get(sesi) } : {}),
  ...(peranSesi.has(sesi) ? { peran: peranSesi.get(sesi) } : {}),
  ...(modelSesi.has(sesi) ? { model: modelSesi.get(sesi) } : {}),
});

/* Satu pesan asisten -> event yang layak disiarkan. Dipakai DUA jalur
   (transkrip dan stream-json) supaya aturannya cuma ditulis sekali. */
function isiAgen(msg) {
  const keluar = [];
  if (!msg || !Array.isArray(msg.content)) return keluar;
  /* `end_turn` berarti giliran ini memang berhenti di sini, jadi teksnya
     jawaban akhir — bukan kalimat pengantar sebelum tool berikutnya. Bedanya
     yang menentukan mana yang pantas memunculkan modal sendiri dan mana yang
     cukup lewat sebagai balon. */
  const akhir = msg.stop_reason === 'end_turn';
  const tokenPikir = msg.usage?.output_tokens_details?.thinking_tokens;
  for (const b of msg.content) {
    if (b?.type === 'thinking' || b?.type === 'redacted_thinking') {
      const teks = potong(b.thinking || '', PIKIR_MAX);
      const ev = { kind: 'pikir', teks, label: clip(teks || 'mikir', 90) };
      if (!teks) ev.tersegel = true;
      if (Number.isFinite(tokenPikir) && tokenPikir > 0) ev.token = tokenPikir;
      keluar.push(ev);
    } else if (b?.type === 'text') {
      const teks = potong(b.text || '', UCAP_MAX);
      if (teks) keluar.push({ kind: 'ucap', teks, akhir, label: clip(teks, 120) });
    }
  }
  return keluar;
}

function pantauTranskrip(sesi, jalur) {
  if (!jalur || ISI_MATI) return;
  const ada = transkrip.get(sesi);
  if (ada) {
    ada.sentuh = Date.now();
    if (ada.file === jalur) return;
    lepasTranskrip(sesi);                 // sesinya pindah berkas (resume/fork)
  }
  if (transkrip.size >= TRANSKRIP_MAX) {
    // yang paling lama tidak bersuara yang dilepas, bukan yang paling dulu masuk
    let tua = '';
    for (const [k, v] of transkrip) {
      if (!tua || v.sentuh < transkrip.get(tua).sentuh) tua = k;
    }
    if (tua) lepasTranskrip(tua);
  }
  let awal = 0;
  try { awal = fs.statSync(jalur).size; } catch { awal = 0; }   // belum ada: mulai dari 0
  const rec = {
    file: jalur, offset: awal, sisa: Buffer.alloc(0),
    sibuk: false, sentuh: Date.now(), lihat: new Set(),
  };
  rec.pantau = () => { bacaSusulan(sesi, rec); };
  try {
    fs.watchFile(jalur, { interval: TRANSKRIP_JEDA }, rec.pantau);
  } catch (err) {
    console.warn('[agent-room] transkrip tidak bisa dipantau: ' + err.message);
    return;
  }
  transkrip.set(sesi, rec);
}

function lepasTranskrip(sesi) {
  const rec = transkrip.get(sesi);
  if (!rec) return;
  transkrip.delete(sesi);
  try { fs.unwatchFile(rec.file, rec.pantau); } catch { /* memang sudah lepas */ }
}

async function bacaSusulan(sesi, rec) {
  if (rec.sibuk || !transkrip.has(sesi)) return;
  rec.sibuk = true;
  try {
    const st = await fs.promises.stat(rec.file);
    // berkasnya menyusut = ditulis ulang; ikuti lagi dari pangkalnya
    if (st.size < rec.offset) { rec.offset = 0; rec.sisa = Buffer.alloc(0); }
    while (rec.offset < st.size) {
      const n = Math.min(st.size - rec.offset, SUSUL_MAX);
      const fh = await fs.promises.open(rec.file, 'r');
      let dibaca = 0;
      const buf = Buffer.allocUnsafe(n);
      try { dibaca = (await fh.read(buf, 0, n, rec.offset)).bytesRead; }
      finally { await fh.close(); }
      if (!dibaca) break;
      rec.offset += dibaca;
      cernaPotongan(sesi, rec, buf.subarray(0, dibaca));
      if (dibaca < n) break;
    }
  } catch (err) {
    // berkasnya belum sempat lahir itu wajar; sisanya tidak, dan pemantaunya
    // dilepas supaya galat yang sama tidak diulang tiap 350 ms
    if (err.code !== 'ENOENT') {
      console.warn('[agent-room] transkrip ' + sesi + ': ' + err.message);
      lepasTranskrip(sesi);
    }
  } finally {
    rec.sibuk = false;
  }
}

/* Potongan byte -> baris utuh. Sisanya disimpan sebagai Buffer, bukan string:
   satu huruf UTF-8 bisa terpotong di batas pembacaan, dan menyambungnya
   sesudah terlanjur jadi string berarti hurufnya sudah rusak. */
function cernaPotongan(sesi, rec, buf) {
  const semua = rec.sisa.length ? Buffer.concat([rec.sisa, buf]) : buf;
  let mulai = 0;
  for (let i = 0; i < semua.length; i++) {
    if (semua[i] !== 10) continue;                    // '\n'
    const baris = semua.subarray(mulai, i);
    mulai = i + 1;
    // baris raksasa selalu hasil tool (satu berkas besar yang dibaca), bukan
    // yang kita cari — melewatinya menghemat urai JSON yang percuma
    if (!baris.length || baris.length > BARIS_MAX) continue;
    let o = null;
    try { o = JSON.parse(baris.toString('utf8')); } catch { continue; }
    serapTranskrip(sesi, rec, o);
  }
  rec.sisa = semua.subarray(mulai);
  // satu baris yang tidak selesai-selesai tidak boleh menumpuk di memori; yang
  // dibuang cuma penggalannya, baris sesudahnya tetap terbaca utuh
  if (rec.sisa.length > BARIS_MAX) rec.sisa = Buffer.alloc(0);
}

function serapTranskrip(sesi, rec, o) {
  if (!o || o.type !== 'assistant' || o.isSidechain) return;
  const uuid = typeof o.uuid === 'string' ? o.uuid : '';
  if (uuid) {
    // sesudah resume atau pemadatan, baris lama bisa ditulis ulang apa adanya
    if (rec.lihat.has(uuid)) return;
    rec.lihat.add(uuid);
    if (rec.lihat.size > 400) rec.lihat.delete(rec.lihat.values().next().value);
  }
  if (o.message?.is_api_error_message) return;        // galat API punya jalurnya sendiri
  rec.sentuh = Date.now();
  const ts = Date.parse(o.timestamp);
  const dasar = () => dasarSesi(sesi, o.cwd, Number.isFinite(ts) ? ts : 0);
  for (const b of isiAgen(o.message)) publish({ ...dasar(), ...b });

  /* Dijumlahkan dari SETIAP baris asisten yang punya usage, dedup uuid di atas
     sudah menjamin tidak ada baris yang dihitung dua kali. Dipublish sebagai
     kind sendiri, bukan ditumpangkan ke pikir/ucap: banyak giliran cuma
     berisi tool_use tanpa teks maupun pikiran sama sekali, dan giliran itu
     tetap makan token — kalau menunggu tumpangan, angkanya telat nongol. */
  const u = o.message?.usage;
  if (u) {
    const d = {
      input: Number(u.input_tokens) || 0,
      output: Number(u.output_tokens) || 0,
      cacheTulis: Number(u.cache_creation_input_tokens) || 0,
      cacheBaca: Number(u.cache_read_input_tokens) || 0,
    };
    const t = tokenSesi.get(sesi) || { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
    t.input += d.input; t.output += d.output; t.cacheTulis += d.cacheTulis; t.cacheBaca += d.cacheBaca;
    tokenSesi.set(sesi, t);
    publish({ ...dasar(), kind: 'token', token: { ...t } });
    riwayatCatat(Number.isFinite(ts) ? ts : Date.now(), baseName(o.cwd || ''), modelSesi.get(sesi), d);
  }
}

/* `SessionEnd` tidak selalu datang — terminal ditutup paksa, mesin di-restart.
   Tanpa penyapu ini pemantau berkasnya hidup terus sampai server mati. */
setInterval(() => {
  const batas = Date.now() - TRANSKRIP_SEPI;
  for (const [sesi, rec] of transkrip) if (rec.sentuh < batas) lepasTranskrip(sesi);
}, 5 * 60 * 1000).unref?.();

/* ————— stream-json: sumber kedua untuk sesi yang dilahirkan halaman ini —————

   Sesi dari `/perintah` dibaca dua kali — lewat hook seperti sesi terminal
   biasa, dan lewat stdout-nya sendiri. Itu bukan pemborosan, itu menambal
   tanggal kedaluwarsa: `--bare` melewati hook sepenuhnya, dan dokumentasi
   Anthropic menyatakan ia akan jadi default untuk `-p`. Sudah diuji juga bahwa
   di mode itu hook tidak bisa dititipkan lewat `--settings` maupun
   `--plugin-dir` — jadi kalau hari itu tiba, jalur hook untuk sesi headless
   mati total. stdout tidak ikut mati.

   `rec.hidup` yang menentukan siapa yang bicara. Begitu satu hook masuk untuk
   sesi ini, hook yang pegang kendali dan stream cuma menyumbang yang memang
   tidak pernah dibawa hook: biaya dan percobaan ulang API. Kalau tidak ada hook
   sama sekali, stream mengambil alih seluruhnya. Tanpa pembagian itu satu
   panggilan tool terhitung dua kali — sekali dari hook, sekali dari stream. */
function serapStream(rec, sid, m) {
  const sesi = sid.slice(0, 12);
  rec.streamMasuk++;

  const dasar = (tambah) => ({
    id: ++seq, ts: Date.now(), session: sesi, cwd: baseName(rec.cwd),
    ...(rec.cwd ? { cabang: cabangGit(rec.cwd) } : {}),
    nama: rec.nama, tool: null, label: '', ok: true,
    ...(peranSesi.has(sesi) ? { peran: peranSesi.get(sesi) } : {}),
    ...(modelSesi.has(sesi) ? { model: modelSesi.get(sesi) } : {}),
    ...tambah,
  });

  /* Tiga hal ini diserap apa pun keadaannya, karena hook memang tidak
     membawanya sama sekali. */
  if (m.type === 'result') {
    rec.hasil = m;
    if (typeof m.total_cost_usd === 'number') rec.biaya = m.total_cost_usd;
    return;
  }
  if (m.type === 'system' && m.subtype === 'api_retry') {
    publish(dasar({ kind: 'notify', ok: false,
      label: clip('mencoba ulang — ' + (GALAT_STOP[m.error] || m.error || 'gangguan'), 60) }));
    return;
  }
  if (m.type === 'system' && m.subtype === 'init') {
    if (m.model && !modelSesi.has(sesi)) modelSesi.set(sesi, m.model);
    if (!rec.hidup) {
      publish(dasar({ kind: 'session-start', label: 'lewat stream-json',
                      model: modelSesi.get(sesi) }));
    }
    return;
  }
  /* Galat API datang sebagai pesan asisten biasa yang ditandai khusus, bukan
     sebagai pesan galat tersendiri. Ini satu-satunya tempat sebab berhentinya
     sesi terbaca selagi sesinya masih jalan — hook tidak pernah membawanya, dan
     menunggu `result` berarti ruangannya diam dulu tanpa alasan. */
  if (m.type === 'assistant' && m.is_api_error_message) {
    const label = clip(GALAT_STOP[m.error] || String(m.error || 'galat API'), 60);
    const macet = tandaiMacet(sesi, String(m.error || 'unknown'), label, '');
    publish(dasar({ kind: 'stop-gagal', ok: false, label, macet }));
    return;
  }

  /* Pikiran dan kalimat agen tetap diserap walau hook yang pegang kendali —
     hook memang tidak pernah membawanya. Yang dijaga cuma jangan sampai dobel
     dengan transkrip: kalau berkas sesi ini sudah dipantau, biarkan transkrip
     yang bicara, karena dia juga melayani sesi terminal. */
  if (m.type === 'assistant' && !ISI_MATI && !transkrip.has(sesi)) {
    for (const b of isiAgen(m.message)) publish(dasar(b));
  }

  if (rec.hidup) return;                      // hook sudah pegang kendali

  const isi = Array.isArray(m.message?.content) ? m.message.content : [];

  /* Panggilan tool dari agen. `parent_tool_use_id` yang terisi berarti panggilan
     itu datang DARI subagent, bukan dari agen utama — pohon rapat yang sungguhan,
     bukan tebakan jarak waktu seperti dulu. */
  if (m.type === 'assistant') {
    for (const b of isi) {
      if (b?.type !== 'tool_use') continue;
      const label = describe(b.name, b.input);
      // dicatat karena tool_result nanti cuma membawa id-nya, tanpa nama tool
      // maupun input — padahal justru itu yang dibaca orang di panel
      if (rec.alat.size < 500) rec.alat.set(b.id, { tool: b.name, label });
      const ev = dasar({ kind: 'pre', tool: b.name, label });
      if (m.parent_tool_use_id) ev.agenId = m.parent_tool_use_id;
      if (b.name === 'Task' || b.name === 'Agent') {
        const nm = clip(b.input?.description || b.input?.subagent_type || 'agen', 26);
        rec.rapat.set(b.id, nm);
        ev.peserta = [nm];
        publish(ev);
        publish(dasar({ kind: 'subagent-start', agenId: b.id, label: nm, peserta: [nm] }));
        continue;
      }
      publish(ev);
    }
    return;
  }

  /* Hasil tool. Sekaligus penutup rapat: kalau id yang selesai ini id panggilan
     Task/Agent-nya, subagent-nya memang sudah berhenti — tidak perlu ambang
     waktu untuk menebaknya. */
  if (m.type === 'user') {
    for (const b of isi) {
      if (b?.type !== 'tool_result') continue;
      const asal = rec.alat.get(b.tool_use_id);
      rec.alat.delete(b.tool_use_id);
      const ev = dasar({ kind: 'post', ok: b.is_error !== true,
                         tool: asal?.tool || null, label: asal?.label || '' });
      if (m.parent_tool_use_id) ev.agenId = m.parent_tool_use_id;
      publish(ev);
      if (rec.rapat.has(b.tool_use_id)) {
        const nm = rec.rapat.get(b.tool_use_id);
        rec.rapat.delete(b.tool_use_id);
        publish(dasar({ kind: 'subagent-stop', agenId: b.tool_use_id, label: nm }));
      }
    }
  }
}

/* Payload hook membawa `tool_response` apa adanya, jadi satu Read berkas besar
   atau satu Bash yang cerewet gampang lewat setengah mega. Batasnya tetap ada
   supaya satu payload raksasa tidak menghabiskan memori, tapi angkanya jauh di
   atas ukuran wajar — yang dipotong seharusnya cuma yang benar-benar liar. */
const BATAS_EVENT = 8 * 1024 * 1024;

/* Kembaliannya objek, bukan string, karena PEMOTONGAN HARUS TERLIHAT. Versi
   lama membuang kelebihan chunk tapi tetap mengembalikan potongannya, jadi
   JSON.parse pasti gagal dengan "Unterminated string in JSON at position ..." —
   pesan yang menyesatkan: yang salah ukurannya, bukan payloadnya. */
function readBody(req, limit = 1024 * 512) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on('end', () => resolve({
      teks: Buffer.concat(chunks).toString('utf8'),
      ukuran: size,
      terpotong: size > limit,
    }));
    req.on('error', () => resolve({ teks: '', ukuran: 0, terpotong: false }));
  });
}

/* Penyelamat kalau payloadnya terpaksa dipotong: session_id itu field pendek di
   dekat pangkal JSON, jadi hampir pasti masih utuh di potongannya. Cukup untuk
   MENANDAI SESINYA HIDUP — tanpa ini, payload yang jatuh bikin penjaga bisu
   menuduh sesi yang sebenarnya sehat gagal autentikasi. */
const SESI_RX = /"session_id"\s*:\s*"([0-9a-zA-Z-]{8,64})"/;

/* ------------------------------------------------------------- cuaca ----
   Hujan di ruangan mengikuti hujan sungguhan di tempat servernya berdiri.
   Lokasi ditebak dari IP publik lewat geojs.io, cuacanya dari open-meteo.com
   — dua-duanya tanpa kunci API. Ini SATU-SATUNYA lalu lintas keluar yang
   dibuat server ini, hasilnya di-cache 10 menit, dan halaman tetap jalan
   normal (jatuh ke hujan-sesekali acak) kalau endpoint ini gagal.

   AGENT_ROOM_CUACA: 'off' mematikan total (server tidak pernah keluar),
   atau 'lat,lon' (mis. '-6.2,106.8') menetapkan lokasi tanpa menebak IP. */
const CUACA_KOORD = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;
const CUACA_ATUR = (process.env.AGENT_ROOM_CUACA || '').trim();
// Nilai env yang salah harus berisik SAAT START, bukan gagal bisu berulang:
// fallback dadu di halaman justru menyamarkan kegagalan di sini.
if (CUACA_ATUR && CUACA_ATUR.toLowerCase() !== 'off') {
  const m = CUACA_ATUR.match(CUACA_KOORD);
  if (!m) {
    console.warn('[agent-room] AGENT_ROOM_CUACA tidak dikenali: "' + CUACA_ATUR
      + '" — pakai "off" atau "lat,lon" (mis. "-6.2,106.8"); lokasi akan ditebak dari IP.');
  } else if (Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) {
    console.warn('[agent-room] AGENT_ROOM_CUACA di luar rentang lat -90..90 / lon -180..180'
      + ' (lat,lon mungkin tertukar): ' + CUACA_ATUR);
  }
}
let cuacaCache = null;          // { data, pada }
let cuacaGagalPada = 0;         // jangan menghajar API waktu offline
let cuacaKodeLog = null;        // log ke konsol hanya saat kondisinya berubah
let cuacaGagalLog = '';         // pesan gagal terakhir yang sudah dilog

async function ambilJSON(u, timeout = 4500) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(u, { signal: ac.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function cuacaSekarang() {
  if (CUACA_ATUR.toLowerCase() === 'off') return { mati: true };
  if (cuacaCache && Date.now() - cuacaCache.pada < 10 * 60 * 1000) return cuacaCache.data;
  if (Date.now() - cuacaGagalPada < 2 * 60 * 1000) {
    if (cuacaCache) return cuacaCache.data;      // basi lebih jujur daripada kosong
    throw new Error('masih dalam jeda gagal');
  }
  try {
    let lat, lon, kota = '';
    const m = CUACA_ATUR.match(CUACA_KOORD);
    if (m) { lat = +m[1]; lon = +m[2]; }
    else {
      const g = await ambilJSON('https://get.geojs.io/v1/ip/geo.json');
      lat = +g.latitude; lon = +g.longitude; kota = g.city || '';
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('lokasi tidak ketahuan');
    const w = await ambilJSON('https://api.open-meteo.com/v1/forecast?latitude=' + lat
      + '&longitude=' + lon + '&current=weather_code,precipitation,temperature_2m&timezone=auto');
    const cur = (w && w.current) || {};
    const data = {
      kode: cur.weather_code ?? null,
      presipitasi: cur.precipitation ?? null,
      suhu: cur.temperature_2m ?? null,
      kota,
      pada: Date.now(),
    };
    cuacaCache = { data, pada: Date.now() };
    cuacaGagalLog = '';
    if (data.kode !== cuacaKodeLog) {
      cuacaKodeLog = data.kode;
      console.log('[agent-room] cuaca ' + (kota || 'lokasi ditentukan') + ': kode WMO '
        + data.kode + (data.presipitasi ? ', presipitasi ' + data.presipitasi + ' mm' : ''));
    }
    return data;
  } catch (err) {
    cuacaGagalPada = Date.now();
    if (err.message !== cuacaGagalLog) {       // sekali per jenis gagal, bukan spam
      cuacaGagalLog = err.message;
      console.warn('[agent-room] cuaca gagal diambil: ' + err.message);
    }
    if (cuacaCache) return cuacaCache.data;    // bacaan lama menjembatani gangguan
    throw err;
  }
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/event' && req.method === 'POST') {
    const body = await readBody(req, BATAS_EVENT);
    // Balas 204 tanpa isi: apa pun yang ditulis hook ke stdout bisa dibaca
    // Claude Code sebagai perintah kontrol, jadi jangan kirim body sama sekali.
    res.writeHead(204).end();

    if (body.terpotong) {
      // Sebabnya disebut apa adanya — ukuran, bukan "payload rusak" — dan
      // sesinya tetap ditandai hidup supaya tidak dituduh gagal autentikasi.
      const sesi = (body.teks.match(SESI_RX) || [])[1];
      if (sesi) tandaiHidup(sesi.slice(0, 12));
      console.warn('[agent-room] payload dilewati: ' + Math.round(body.ukuran / 1024)
        + ' KB, lebih besar dari batas ' + Math.round(BATAS_EVENT / 1024) + ' KB'
        + (sesi ? ' (sesi ' + sesi.slice(0, 12) + ' tetap dianggap hidup)' : '')
        + '. Satu tool call tidak tergambar; sesinya sendiri jalan terus.');
      return;
    }

    try {
      const raw = JSON.parse(body.teks || '{}');
      const ev = normalize(raw);
      tandaiHidup(ev.session);
      publish(ev);
      /* Jalur transkrip cuma diketahui dari sini. Waktu sesinya habis
         pemantauannya tidak langsung dicabut: kalimat penutup agen sering baru
         mendarat di berkas beberapa saat sesudah hook terakhir. */
      if (ev.kind === 'session-end') setTimeout(() => lepasTranskrip(ev.session), 3000).unref?.();
      else pantauTranskrip(ev.session, jalurTranskrip(raw));
    } catch (err) {
      // payload rusak: jangan pernah bikin agent-nya ikut gagal
      console.warn('[agent-room] payload diabaikan:', err.message);
    }
    return;
  }

  if (url.pathname === '/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 1500\n\n');
    const since = Number(req.headers['last-event-id'] || url.searchParams.get('since') || 0);
    for (const ev of ring.filter((e) => e.id > since).slice(-60)) {
      res.write(`id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
    clients.add(res);
    const beat = setInterval(() => { try { res.write(': beat\n\n'); } catch {} }, 20000);
    req.on('close', () => { clearInterval(beat); clients.delete(res); });
    return;
  }

  /* ------------------------------------------------------- kendali web --- */

  // Halaman butuh tahu: fitur ini menyala atau tidak, dan tokennya apa.
  // Token hanya bisa dibaca lewat GET same-origin; situs lain boleh mem-POST
  // tapi tidak boleh MEMBACA balasan lintas-asal, jadi tokennya tidak bocor.
  if (url.pathname === '/kendali') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      izin: IZIN,
      siap: Boolean(CLAUDE),
      token: IZIN ? TOKEN : null,
      alasan: !IZIN ? 'jalankan server dengan --izinkan-perintah'
        : !CLAUDE ? 'biner claude tidak ketemu di PATH' : '',
      cwdBawaan: process.cwd(),
      port: PORT,
      host: HOST,
      // status apa adanya, dibaca panel Pengaturan di halaman — read-only,
      // tidak ada endpoint yang mengubahnya balik dari sini.
      isiAktif: !ISI_MATI,
      cuacaAktif: CUACA_ATUR.toLowerCase() !== 'off',
      // hanya ADA atau TIDAK, plus nama env-nya. Nilainya tidak pernah keluar.
      punyaKredensial: Boolean(kredensial),
      kredensialEnv: kredensial ? kredensial.envKey : '',
      kredensialBerkas: Boolean(kredensial && kredensial.dariBerkas),
      berjalan: [...jalan.entries()].map(([id, j]) => ({
        sesi: id.slice(0, 12), nama: j.nama, mulai: j.mulai, cwd: j.cwd,
        cabang: cabangGit(j.cwd),
        peran: peranSesi.get(id.slice(0, 12)) || '',
        model: modelSesi.get(id.slice(0, 12)) || '',
      })),
    }));
    return;
  }

  /* Penelusur folder. Browser tidak boleh membocorkan path absolut lewat
     <input type="file"> (aturan keamanan browser), jadi daftar isinya harus
     dilayani server. Hanya direktori yang dikirim — isi berkasnya tidak
     pernah dibaca, apalagi dikirim. */
  if (url.pathname === '/folder') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    // Sebutkan sebab yang sebenarnya. "token tidak cocok" waktu fiturnya
    // memang belum dinyalakan itu menyesatkan dan bikin orang mencari-cari.
    if (!IZIN) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false,
        pesan: 'kendali web mati — jalankan: node server.mjs --izinkan-perintah' }));
      return;
    }
    if (url.searchParams.get('token') !== TOKEN) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end('{"ok":false,"pesan":"token tidak cocok — muat ulang halamannya"}');
      return;
    }

    const kirim = (obj) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    // Windows: minta daftar drive dulu, karena "atas" dari C:\ itu bukan folder
    if (url.searchParams.get('drive') === '1') {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const d = String.fromCharCode(c) + ':\\';
        try { if (fs.existsSync(d)) drives.push(d); } catch { /* drive tidak siap */ }
      }
      kirim({ ok: true, drives });
      return;
    }

    let target = url.searchParams.get('path') || process.cwd();
    try {
      target = path.resolve(target);
      if (!fs.statSync(target).isDirectory()) target = path.dirname(target);
    } catch {
      kirim({ ok: false, pesan: 'folder tidak terbaca: ' + target });
      return;
    }

    let isi = [];
    let catatan = '';
    try {
      const semua = fs.readdirSync(target, { withFileTypes: true });
      const folder = semua.filter((d) => {
        if (!d.isDirectory()) return false;
        // buang yang tidak bisa di-stat (junction rusak, folder sistem terkunci)
        try { fs.statSync(path.join(target, d.name)); return true; } catch { return false; }
      });
      if (folder.length > 300) catatan = folder.length - 300 + ' folder lain tidak ditampilkan';
      isi = folder.slice(0, 300).map((d) => ({
        nama: d.name, path: path.join(target, d.name),
      }));
    } catch (err) {
      kirim({ ok: false, pesan: 'tidak boleh membuka: ' + err.code });
      return;
    }

    const induk = path.dirname(target);
    kirim({
      ok: true,
      path: target,
      induk: induk === target ? null : induk,   // null = sudah di akar drive
      windows: process.platform === 'win32',
      home: os.homedir(),
      awal: process.cwd(),
      pemisah: path.sep,
      catatan,
      isi,
    });
    return;
  }

  if (url.pathname === '/nama' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    try {
      const { sesi, nama } = JSON.parse(body || '{}');
      if (typeof sesi === 'string' && sesi) {
        if (nama) namaSesi.set(sesi, clip(nama, 24)); else namaSesi.delete(sesi);
        publish({ id: ++seq, ts: Date.now(), kind: 'nama', session: sesi,
                  nama: namaSesi.get(sesi) || '', tool: null, label: '', ok: true });
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  /* Jabatan pegawai. Disimpan server, bukan di halaman, supaya tetap melekat
     waktu halaman dibuka ulang dan sama di semua penonton. */
  if (url.pathname === '/peran' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    try {
      const { sesi, peran } = JSON.parse(body || '{}');
      // id yang tidak dikenal DITOLAK, bukan diam-diam menghapus jabatannya:
      // salah ketik sekali tidak boleh menelanjangi pegawai yang sudah diatur
      if (peran && !(typeof peran === 'string' && PERAN_SAH.test(peran))) {
        res.writeHead(400, { 'content-type': 'application/json' })
           .end('{"ok":false,"pesan":"id jabatan tidak sah"}');
        return;
      }
      if (typeof sesi === 'string' && sesi) {
        if (peran) peranSesi.set(sesi, peran);
        else peranSesi.delete(sesi);
        publish({ id: ++seq, ts: Date.now(), kind: 'peran', session: sesi,
                  peran: peranSesi.get(sesi) || '', tool: null, label: '', ok: true });
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  /* Simpan atau hapus kredensial headless. Dijaga token + cek Origin yang sama
     dengan /perintah — gerbangnya memang harus sama, karena yang bisa menyuruh
     mesin ini bekerja sudah pasti bisa menentukan kredensial yang dipakainya. */
  if (url.pathname === '/kredensial' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    let p;
    try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }

    const balas = (kode, obj) => {
      res.writeHead(kode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (!IZIN) return balas(403, { ok: false, pesan: 'kendali web mati' });
    if (p.token !== TOKEN) return balas(403, { ok: false, pesan: 'token tidak cocok' });

    const nilai = String(p.nilai || '').trim();
    if (!nilai) {
      kredensial = null;
      hapusBerkasToken();          // hapus berarti hapus, termasuk yang di disk
      console.log('[agent-room] kredensial headless dihapus');
      return balas(200, { ok: true, punya: false });
    }
    // Sanity check seadanya: token asli tidak punya spasi dan tidak sepanjang esai.
    if (/\s/.test(nilai) || nilai.length > 500) {
      return balas(400, { ok: false, pesan: 'bentuknya tidak seperti token' });
    }
    const simpan = p.simpan !== false;
    kredensial = { nilai, envKey: envKredensial(nilai), sejak: Date.now(), dariBerkas: simpan };
    // Nilainya TIDAK dicetak — yang dicatat cuma nama env-nya.
    console.log('[agent-room] kredensial headless dipasang untuk ' + kredensial.envKey);

    if (!simpan) {
      hapusBerkasToken();          // pilihan "jangan diingat" harus mencabut yang lama
      return balas(200, { ok: true, punya: true, envKey: kredensial.envKey, berkas: false });
    }
    try {
      tulisBerkasToken(nilai);
      console.log('[agent-room] token diingat di ' + BERKAS_TOKEN);
    } catch (err) {
      // Gagal menulis bukan alasan membuang token yang sudah dipegang: sesinya
      // tetap bisa jalan sekarang, cuma tidak bertahan setelah server mati.
      kredensial.dariBerkas = false;
      return balas(200, {
        ok: true, punya: true, envKey: kredensial.envKey, berkas: false,
        pesan: 'token dipakai, tapi gagal ditulis ke berkas: ' + err.code,
      });
    }
    return balas(200, { ok: true, punya: true, envKey: kredensial.envKey, berkas: true });
  }

  if (url.pathname === '/perintah' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    let p;
    try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }

    const tolak = (kode, pesan) => {
      res.writeHead(kode, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, pesan }));
    };
    if (!IZIN) return tolak(403, 'kendali web mati — jalankan dengan --izinkan-perintah');
    if (p.token !== TOKEN) return tolak(403, 'token tidak cocok');
    if (!CLAUDE) return tolak(500, 'biner claude tidak ketemu di PATH');
    if (jalan.size >= MAKS_JALAN) return tolak(429, `sudah ${MAKS_JALAN} tugas jalan bersamaan`);

    const prompt = String(p.prompt || '').trim();
    if (!prompt) return tolak(400, 'prompt kosong');

    const model = String(p.model || '').trim();
    if (model && !MODEL_SAH.test(model)) return tolak(400, 'id model tidak sah: ' + clip(model, 40));

    const kerja = String(p.cwd || '').trim() || process.cwd();
    if (!fs.existsSync(kerja) || !fs.statSync(kerja).isDirectory()) {
      return tolak(400, 'folder kerja tidak ada: ' + kerja);
    }

    const sid = crypto.randomUUID();
    const nama = clip(p.nama, 24) || 'tugas';
    namaSesi.set(sid.slice(0, 12), nama);
    // Jabatannya dipasang SEBELUM prosesnya lahir, memakai trik yang sama
    // dengan nama: sesi id sudah kita tentukan sendiri lewat --session-id,
    // jadi event hook pertamanya langsung datang dengan seragam yang benar.
    if (typeof p.peran === 'string' && PERAN_SAH.test(p.peran)) {
      peranSesi.set(sid.slice(0, 12), p.peran);
    }
    if (model) modelSesi.set(sid.slice(0, 12), model);

    // Prompt masuk sebagai satu elemen argv, BUKAN lewat shell: itu yang
    // bikin teks bebas dari halaman tidak bisa jadi perintah shell.
    const args = [
      '-p', prompt,
      '--session-id', sid,
      // stream-json, bukan json: yang dibaca bukan cuma hasil akhirnya, tapi
      // jalannya sesi — dan `-p` mensyaratkan --verbose untuk bentuk ini.
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', p.mode || 'bypassPermissions',
      '--add-dir', kerja,
    ];
    if (model) args.push('--model', model);
    if (p.pagu) args.push('--max-budget-usd', String(Number(p.pagu) || 1));

    let anak;
    try {
      // Kredensial lewat env, tidak pernah lewat argv: baris perintah proses
      // bisa dibaca proses lain di mesin yang sama, isi env-nya tidak.
      const lingkungan = { ...process.env };
      if (kredensial) lingkungan[kredensial.envKey] = kredensial.nilai;
      anak = spawn(CLAUDE, args, {
        cwd: kerja, shell: false, windowsHide: true, env: lingkungan,
        // stdin ditutup sejak awal. Kalau dibiarkan berupa pipa yang tidak
        // pernah diisi, CLI menunggunya dulu ("no stdin data received in 3s")
        // — tiga detik terbuang tiap tugas, plus peringatan yang menyesatkan
        // karena menutupi sebab gagal yang sebenarnya.
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      namaSesi.delete(sid.slice(0, 12));
      return tolak(500, 'gagal menjalankan claude: ' + err.message);
    }

    const rec = {
      anak, nama, mulai: Date.now(), cwd: kerja, keluar: '', galat: '', hidup: false,
      streamMasuk: 0,          // berapa pesan stream-json yang sudah terbaca
      hasil: null,             // pesan `result` terakhir — sumber sebab gagal & biaya
      biaya: null,
      alat: new Map(),         // tool_use_id -> { tool, label }
      rapat: new Map(),        // tool_use_id panggilan Task/Agent -> nama pesertanya
    };
    jalan.set(sid, rec);

    // Prosesnya lahir bukan berarti sesinya jalan. Kalau tidak ada satu pun
    // hook dalam BISU_MS, bilang sekarang — jangan biarkan halaman menampilkan
    // pegawai yang tampak sehat padahal sesinya tidak pernah mulai.
    /* Sejak stream-json ikut dibaca, "tidak ada hook" dan "tidak ada apa-apa"
       jadi dua hal yang berbeda — dan cuma yang kedua pantas dituduh gagal
       autentikasi. Dulu keduanya dilaporkan sama, jadi sesi yang sebenarnya
       sehat tapi hook-nya tidak terpasang ikut kena tuduhan yang salah. */
    rec.bisu = setTimeout(() => {
      if (rec.hidup) return;
      if (rec.streamMasuk > 0) {
        console.log('[agent-room] sesi ' + sid.slice(0, 12) + ' jalan tanpa hook — '
          + 'ruangannya digerakkan dari stream-json (' + rec.streamMasuk + ' pesan). '
          + 'Itu yang terjadi di mode --bare, dan memang tidak apa-apa.');
        return;
      }
      console.warn('[agent-room] sesi ' + sid.slice(0, 12) + ' belum mengirim apa pun '
        + (BISU_MS / 1000) + ' detik setelah lahir — hook maupun stream-json. '
        + 'Sesi headless butuh kredensial sendiri: jalankan server ini dari terminal '
        + 'biasa tempat perintah claude normal jalan, atau siapkan token lewat: '
        + 'claude setup-token');
      publish({
        id: ++seq, ts: Date.now(), kind: 'tugas-bisu', session: sid.slice(0, 12),
        nama, tool: null, ok: false,
        label: 'nihil ' + (BISU_MS / 1000) + ' dtk, hook maupun stream — sesinya tidak pernah mulai',
      });
    }, BISU_MS);

    /* stdout sekarang NDJSON, bukan satu JSON di akhir: dibaca baris per baris
       supaya ruangannya bergerak selagi sesinya jalan, bukan menunggu selesai. */
    let sisa = '';
    anak.stdout.on('data', (c) => {
      const teks = String(c);
      // Mentahnya tetap disimpan sebagai cadangan pembaca sebab gagal, tapi
      // ekornya saja: stream satu sesi panjang bisa puluhan MB, dan yang
      // dibutuhkan cuma bagian akhir.
      rec.keluar = (rec.keluar + teks).slice(-64 * 1024);
      sisa += teks;
      if (sisa.length > 8 * 1024 * 1024) {     // satu baris raksasa tanpa newline
        console.warn('[agent-room] baris stream-json > 8 MB dibuang (sesi '
                     + sid.slice(0, 12) + ')');
        sisa = '';
        return;
      }
      const baris = sisa.split('\n');
      sisa = baris.pop();
      for (const b of baris) {
        const t = b.trim();
        if (!t) continue;
        let m;
        // Baris yang tidak bisa diurai dilewati, bukan bikin meledak: satu
        // pesan rusak tidak boleh mematikan seluruh sesi.
        try { m = JSON.parse(t); } catch { continue; }
        try { serapStream(rec, sid, m); }
        catch (err) {
          console.warn('[agent-room] stream-json ' + sid.slice(0, 12) + ': ' + err.message);
        }
      }
    });
    anak.stderr.on('data', (c) => { rec.galat = (rec.galat + c).slice(-16 * 1024); });

    const batas = setTimeout(() => {
      rec.galat += '\n[dihentikan: lewat batas waktu]';
      try { anak.kill(); } catch { /* sudah mati */ }
    }, TIMEOUT_MS);

    /* Sebab gagal yang benar-benar terbaca. Dua jebakan yang dihindari:
       - stderr sering cuma berisi peringatan, sementara sebab sebenarnya ada
         di stdout sebagai JSON hasil (mis. "Not logged in · Please run /login")
       - JSON itu panjang; yang dibaca orang cuma field result/error-nya */
    const sebabGagal = () => {
      // Pesan `result` terakhir dari stream sudah terurai waktu ia lewat, jadi
      // tidak perlu mengurai ulang ekor stdout yang mungkin terpotong di tengah.
      if (rec.hasil) {
        const inti = rec.hasil.result || rec.hasil.error;
        if (inti) return String(inti);
      }
      const err = rec.galat.split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^warning:/i.test(l))
        .join(' ');
      return err || rec.keluar || '';
    };

    const selesai = (kode, sinyal) => {
      clearTimeout(batas);
      clearTimeout(rec.bisu);
      jalan.delete(sid);
      // Jangan diam kalau gagal: sesi yang tidak pernah lahir tidak akan
      // memunculkan pegawai apa pun, jadi kegagalannya harus terlihat.
      const gagal = kode !== 0;
      /* Angka ini SETARA, bukan tagihan — dan bedanya penting. Sesi headless
         yang dijalankan dengan token dari `claude setup-token` berautentikasi
         lewat langganan: yang terpakai kuota paket, bukan saldo API. Yang
         dikirim Claude Code di `total_cost_usd` adalah perkiraan sisi klien
         soal berapa pemakaian itu KALAU ditagih lewat API. Dikirim sebagai
         field sendiri, bukan digabung ke label — supaya halaman yang
         memutuskan cara memberi taunya, bukan server yang sudah merangkai
         kalimatnya. `resmi:false` di sini bukan hiasan: itu yang membuat
         halaman menuliskannya sebagai "data sementara", bukan angka pasti. */
      const biaya = typeof rec.biaya === 'number' ? { usd: rec.biaya, resmi: false } : null;
      publish({
        id: ++seq, ts: Date.now(), kind: 'tugas-selesai',
        session: sid.slice(0, 12), nama, tool: null, ok: !gagal,
        label: gagal
          ? clip('gagal (kode ' + kode + (sinyal ? '/' + sinyal : '') + ') '
                 + sebabGagal(), 220)
          : nama,
        ...(biaya ? { biaya } : {}),
      });
    };
    anak.on('error', (err) => { rec.galat += err.message; selesai(-1, null); });
    anak.on('close', selesai);

    publish({ id: ++seq, ts: Date.now(), kind: 'tugas-mulai',
              session: sid.slice(0, 12), nama, tool: null, label: nama, ok: true,
              peran: peranSesi.get(sid.slice(0, 12)) || '', model });

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sesi: sid.slice(0, 12) }));
    return;
  }

  if (url.pathname === '/perintah/hentikan' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    let p;
    try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }
    if (p.token !== TOKEN) { res.writeHead(403).end(); return; }
    let kena = 0;
    for (const [id, j] of jalan) {
      if (id.slice(0, 12) === p.sesi) {
        try { j.anak.kill(); kena++; } catch { /* sudah mati */ }
      }
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, kena }));
    return;
  }

  if (url.pathname === '/cuaca') {
    // Sengaja tidak pernah 500: halaman cuma butuh tahu "ada data atau tidak".
    let body;
    try { body = await cuacaSekarang(); }
    catch { body = { gagal: true }; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(body));
    return;
  }

  /* Riwayat token sepanjang waktu — tanpa token/Origin check, sama seperti
     /cuaca: angkanya toh sudah lewat /stream tanpa autentikasi juga, cuma
     dirangkum di sini supaya halaman tidak perlu menjumlahkan ulang seluruh
     riwayat sendiri tiap modal Statistik token dibuka. */
  if (url.pathname === '/token-riwayat') {
    const harian = [...riwayatHarian.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([tanggal, v]) => ({ tanggal, ...v }));
    const proyek = [...riwayatProyek.entries()]
      .map(([nama, v]) => ({ nama, ...v }))
      .sort((a, b) => (b.input + b.output) - (a.input + a.output))
      .slice(0, 20);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({ total: riwayatTotal, sejak: riwayatSejak || null, harian, proyek }));
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, events: seq, viewers: clients.size, port: PORT }));
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[agent-room] port ${PORT} sudah dipakai — server lain mungkin sudah jalan.`);
    process.exit(1);
  }
  throw err;
});

if (IZIN) muatKredensial();     // hanya berguna kalau halaman boleh melahirkan sesi

server.listen(PORT, HOST, () => {
  console.log(`[agent-room] ruangan siap  ->  http://${HOST}:${PORT}`);
  console.log('[agent-room] menunggu event dari Claude Code hooks...');
  if (IZIN) {
    if (CLAUDE) {
      console.log(`[agent-room] kendali web AKTIF — halaman boleh melahirkan sesi`);
      console.log(`[agent-room] memakai ${CLAUDE} (${versiClaude(CLAUDE)})`);
      console.log('[agent-room] biner lain bisa ditunjuk lewat AGENT_ROOM_CLAUDE');
    } else {
      console.log('[agent-room] kendali web diminta, tapi biner claude tidak ketemu di PATH');
    }
  } else {
    console.log('[agent-room] kendali web mati. Nyalakan: node server.mjs --izinkan-perintah');
  }
});
