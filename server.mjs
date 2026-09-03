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

/* ------------------------------------------------------------ gerbang ---
   Dua penjaga di pintu depan, keduanya berlaku SEBELUM route mana pun:

   1. Penjaga Host. Server ini cuma mendengar di 127.0.0.1, tapi itu tidak
      menghalangi DNS rebinding: situs jahat yang dibuka pemilik mesin bisa
      mengarahkan nama domainnya sendiri ke 127.0.0.1 lalu membaca /stream
      dari skripnya — Origin-nya bukan milik kita, tapi /stream memang tidak
      pernah memeriksa Origin. Yang pasti berbeda pada permintaan seperti itu
      adalah header Host: dia berisi nama domain si penyerang, bukan
      127.0.0.1/localhost. Jadi Host yang bukan alamat kita ditolak 403,
      untuk semua route. Hook curl mengirim Host 127.0.0.1:port, halaman
      mengirim alamat yang diketik di peramban — keduanya lolos. Daftar
      tambahan (nama mesin di LAN, nama tunnel) lewat AGENT_ROOM_HOST_IZIN.

   2. Kunci event. Kalau AGENT_ROOM_KUNCI diisi, POST /event wajib membawa
      header x-agent-room-kunci yang sama. Ini syarat mutlak begitu bind
      dibuka ke LAN (kantor pusat menerima hook dari kantor cabang): tanpa
      kunci, siapa pun di jaringan bisa memalsukan sesi. Tanpa env, perilaku
      lama tetap — hook yang sudah terpasang tanpa kunci diterima. Dibanding-
      kan lewat hash supaya panjangnya tidak bocor lewat waktu.            */
const KUNCI = (process.env.AGENT_ROOM_KUNCI || '').trim();
const MESIN_INI = os.hostname().toLowerCase();
const HOST_IZIN = new Set(['127.0.0.1', 'localhost', '[::1]', HOST.toLowerCase(),
  ...(process.env.AGENT_ROOM_HOST_IZIN || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)]);
let gerbangWarnTs = 0;                      // console.warn tolakan: maks 1/menit
function hostSah(req) {
  const h = String(req.headers.host || '').trim().toLowerCase();
  if (!h) return true;                      // klien HTTP/1.0 tanpa Host: bukan peramban
  const m = h.match(/^(\[[0-9a-f:.]+\]|[^:]+)(?::\d{1,5})?$/);
  return !!m && HOST_IZIN.has(m[1]);
}
function kunciSah(req) {
  if (!KUNCI) return true;
  const bawa = String(req.headers['x-agent-room-kunci'] || '');
  const a = crypto.createHash('sha256').update(bawa).digest();
  const b = crypto.createHash('sha256').update(KUNCI).digest();
  return crypto.timingSafeEqual(a, b);
}
function gerbangWarn(pesan) {
  const kini = Date.now();
  if (kini - gerbangWarnTs < 60 * 1000) return;
  gerbangWarnTs = kini;
  console.warn('[agent-room] ' + pesan);
}
/* Nama mesin pengirim, dari header x-agent-room-mesin yang ditanam installer.
   Kosong kalau sama dengan mesin server: chip "mesin" di halaman cuma perlu
   muncul untuk sesi yang datang dari kantor cabang, bukan untuk semua. */
function mesinDari(req) {
  const m = String(req.headers['x-agent-room-mesin'] || '').trim().replace(/[^\w.-]/g, '').slice(0, 32);
  return m && m.toLowerCase() !== MESIN_INI ? m : '';
}

/* Peta sesi hidup untuk GET /ruangan (dan lewat itu, MCP): sesi 12-char ->
   metadata terakhir yang terlihat. Diisi tiap hook masuk, dihapus saat
   session-end, dan yang sudah lama diam dibuang waktu dibaca — sesi yang mati
   tanpa SessionEnd (terminal ditutup paksa) tidak boleh dilaporkan hidup
   selamanya. */
const sesiHidup = new Map();                // sesi -> { cwd, cabang, mesin, tool, kind, sejak, terakhir }
const SESI_HIDUP_SEPI_MS = 3 * 60 * 60 * 1000;
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

/* ----------------------------------------------------- antrean disposisi ---
   Tugas ke-5 dan seterusnya tidak lagi ditolak 429 lalu hilang: dia menunggu di
   loket sampai satu slot kosong, lalu dilahirkan sendiri oleh server lewat
   jalur spawn yang sama. Isinya persis parameter spawn (prompt, cwd, nama…),
   dan sengaja HANYA DI MEMORI — perintah eksekusi tidak pernah dipersist ke
   disk; server mati berarti antreannya ikut hangus, dan itu disengaja.
   `sifat` SEGERA masuk ke depan, di belakang SEGERA lain yang lebih dulu.   */
const ANTRE_MAKS = 12;
const antrean = [];                         // [{ id, prompt, cwd, nama, peran, model, mode, pagu, sifat, sejak }]
const SIFAT_SAH = new Set(['BIASA', 'SEGERA']);

/* ------------------------------------------------ nota dinas keluar (webhook)
   Lalu lintas keluar kedua setelah /cuaca, dan sama-sama mati secara bawaan.
   Diisi URL (Slack/Discord/Telegram-gateway) lewat AGENT_ROOM_LAPOR, server
   mem-POST satu JSON kecil tiap sesi masuk keadaan tertahan: minta paraf
   (butuh manusia), macet (stop-gagal), atau bisu (tugas-bisu). Yang dikirim
   METADATA saja — nama, proyek, cabang, sebab — tidak pernah pikir, ucap,
   maupun prompt. Dijeda 30 detik per sesi+jenis supaya izin beruntun tidak
   jadi rentetan notifikasi. */
const LAPOR_URL = (process.env.AGENT_ROOM_LAPOR || '').trim();
const LAPOR_SELESAI = String(process.env.AGENT_ROOM_LAPOR_SELESAI || '').trim() === '1';
const LAPOR_JEDA_MS = 30 * 1000;
const LAPOR_TIMEOUT_MS = 5 * 1000;
const laporTerakhir = new Map();            // "sesi|jenis" -> ts kiriman terakhir
let laporWarnTs = 0;                        // console.warn gagal kirim: maks 1/menit

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

/* ------------------------------------------------ nota dinas keluar (webhook)
   Dipanggil SETELAH publish() di tiap jalur yang bisa menahan sesi: hook
   (/event), stream-json (galat API), penjaga bisu, dan — kalau diminta lewat
   AGENT_ROOM_LAPOR_SELESAI=1 — giliran selesai. Membaca event yang sudah
   dinormalisasi, jadi yang ikut keluar cuma field yang memang sudah metadata:
   nama, proyek (basename), cabang, sebab, label tool. `pikir`/`ucap`/`prompt`
   tidak pernah lewat sini — kind-nya sengaja tidak ada di daftar di bawah.

   `text` dan `content` berisi satu kalimat yang sama supaya URL Slack
   (text), Discord (content), maupun gateway bot Telegram langsung bisa
   menampilkannya tanpa mengurai field lain. Gagal kirim tidak pernah
   mengganggu ruangan: satu baris peringatan per menit, sisanya diam. */
function laporKeluar(ev) {
  if (!LAPOR_URL) return;
  let jenis = '';
  let sebab = '';
  let alasan = '';
  if (ev.butuh) {
    jenis = 'izin-minta';
    sebab = ev.butuh.sebab || 'izin';
    alasan = ev.butuh.alasan || ev.butuh.label || ev.label || '';
  } else if (ev.macet) {
    jenis = 'stop-gagal';
    sebab = ev.macet.jenis || 'unknown';
    alasan = [ev.macet.label, ev.macet.galat].filter(Boolean).join(' — ');
  } else if (ev.kind === 'tugas-bisu') {
    jenis = 'tugas-bisu';
    sebab = 'bisu';
    alasan = ev.label || '';
  } else if (LAPOR_SELESAI && (ev.kind === 'stop' || ev.kind === 'tugas-selesai')) {
    jenis = 'selesai';
    sebab = ev.kind;
    alasan = ev.kind === 'tugas-selesai' && ev.ok === false ? ev.label || '' : '';
  } else {
    return;
  }

  const kini = Date.now();
  const kunci = ev.session + '|' + jenis;
  const lalu = laporTerakhir.get(kunci) || 0;
  if (kini - lalu < LAPOR_JEDA_MS) return;
  laporTerakhir.set(kunci, kini);
  // Map ini tidak boleh tumbuh tanpa batas mengikuti sesi yang sudah lewat.
  if (laporTerakhir.size > 500) {
    for (const [k, t] of laporTerakhir) if (kini - t > LAPOR_JEDA_MS) laporTerakhir.delete(k);
  }

  const nama = ev.nama || namaSesi.get(ev.session) || ev.session;
  const proyek = ev.cwd || '';
  const cabang = ev.cabang || '';
  const tempat = proyek ? ' (' + proyek + (cabang ? '@' + cabang : '') + ')' : '';
  const ekor = alasan ? ' — ' + clip(alasan, 200) : '';
  const kalimat = jenis === 'izin-minta' ? '🙏 Menunggu paraf: ' + nama + tempat + ekor
    : jenis === 'stop-gagal' ? '⛔ Sesi tertahan: ' + nama + tempat + ekor
    : jenis === 'tugas-bisu' ? '🔇 Tugas tidak pernah mulai: ' + nama + tempat + ekor
    : (ev.ok === false ? '❌ Tugas gagal: ' : '✅ Selesai: ') + nama + tempat + ekor;

  const nota = {
    jenis, sesi: ev.session, nama, proyek, cabang, sebab,
    alasan: clip(alasan, 200),
    model: ev.model || modelSesi.get(ev.session) || '',
    ts: ev.ts || kini,
    alamat: 'http://127.0.0.1:' + PORT,
    text: kalimat, content: kalimat,
  };
  fetch(LAPOR_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(nota),
    signal: AbortSignal.timeout(LAPOR_TIMEOUT_MS),
  }).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }).catch((err) => {
    if (kini - laporWarnTs < 60 * 1000) return;
    laporWarnTs = kini;
    console.warn('[agent-room] nota dinas keluar gagal dikirim ke ' + LAPOR_URL + ': '
      + (err && err.name === 'TimeoutError' ? 'lewat ' + (LAPOR_TIMEOUT_MS / 1000) + ' dtk' : err.message));
  });
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

/* Isi peta sesi hidup dari event yang sudah dinormalisasi. Yang disimpan cuma
   yang boleh keluar lewat /ruangan: tidak ada label, alasan, pikir, ucap. */
function catatSesiHidup(ev) {
  if (ev.kind === 'session-end') { sesiHidup.delete(ev.session); return; }
  const s = sesiHidup.get(ev.session) || { sejak: ev.ts };
  s.terakhir = ev.ts;
  s.kind = ev.kind;
  if (ev.cwd) s.cwd = ev.cwd;
  if (ev.cabang !== undefined) s.cabang = ev.cabang || '';
  if (ev.mesin) s.mesin = ev.mesin;
  if (ev.tool) { s.tool = ev.tool; s.toolTs = ev.ts; }
  sesiHidup.set(ev.session, s);
}

/* Potret ruangan untuk GET /ruangan: metadata saja, sekelas /health. */
function potretRuangan() {
  const kini = Date.now();
  const sesi = [];
  for (const [id, s] of sesiHidup) {
    if (kini - s.terakhir > SESI_HIDUP_SEPI_MS) { sesiHidup.delete(id); continue; }
    const butuh = butuhManusia.get(id);
    const macet = macetSesi.get(id);
    sesi.push({
      sesi: id,
      nama: namaSesi.get(id) || '',
      peran: peranSesi.get(id) || '',
      model: modelSesi.get(id) || '',
      proyek: s.cwd || '',
      cabang: s.cabang || '',
      mesin: s.mesin || '',
      tool: s.tool || '',
      toolTs: s.toolTs || null,
      kind: s.kind || '',
      sejak: s.sejak,
      terakhir: s.terakhir,
      butuh: butuh ? { sebab: butuh.sebab } : null,
      macet: macet ? { jenis: macet.jenis } : null,
    });
  }
  sesi.sort((a, b) => b.terakhir - a.terakhir);
  return {
    ok: true,
    ts: kini,
    mesin: os.hostname(),
    sesi,
    tertahan: sesi.filter((s) => s.butuh || s.macet).length,
    antrean: { jumlah: antrean.length, nama: antrean.map((t) => t.nama || '').filter(Boolean) },
    jalan: { jumlah: jalan.size },
    viewers: clients.size,
    kendali: IZIN,
  };
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
  agendaCatat(ev);                          // buku agenda: metadata saja, lihat agendaBaris()
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
  // rincian per proyek di dalam hari yang sama — dipakai /ruangan & MCP
  // ("token hari ini per proyek"), bukan cuma total sepanjang masa per proyek
  const hp = h.proyek || (h.proyek = {});
  const hq = hp[nama] || (hp[nama] = { input: 0, output: 0 });
  hq.input += d.input; hq.output += d.output;
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

/* -------------------------------------------------------- buku agenda ----
   Ring di atas cuma 400 event terakhir DI MEMORI: restart server, ruangan
   hari ini hilang; buka halaman jam empat sore, yang kelihatan cuma sisa
   setengah jam terakhir. Buku agenda ini catatan append-only yang bertahan:
   satu berkas per HARI (agenda/YYYY-MM-DD.jsonl), satu baris per event.

   Yang dicatat METADATA SAJA — tool apa, berkas mana, berhasil atau tidak,
   berapa lama. `pikir`/`ucap`/`token` tidak pernah masuk, dan tidak ada
   field isi transkrip (`teks`, `tanya`, `token`) yang ikut ditulis walau
   menumpang di event lain. Ring/SSE boleh membawa isi karena umurnya sebatas
   memori; berkas di disk umurnya 30 hari, jadi ambangnya sengaja lebih
   rendah. Kalau AGENT_ROOM_ISI=off, `label` pun tidak ditulis.

   Per hari, bukan satu berkas panjang: rotasi & pembersihan jadi cuma soal
   nama berkas, `/agenda?dari=..&sampai=..` cuma perlu membuka berkas yang
   diminta, dan putar ulang (`/stream?ulang=YYYY-MM-DD`) membaca tepat satu
   berkas. appendFileSync: satu baris ~200 byte per tool call, jauh lebih
   murah daripada risiko baris terakhir hilang waktu server dimatikan.     */
const AGENDA_DIR = process.env.AGENT_ROOM_AGENDA_DIR || path.join(__dirname, 'agenda');
const AGENDA_HARI = Math.max(1, Number(process.env.AGENT_ROOM_AGENDA_HARI) || 30);
const AGENDA_LABEL_MAX = 120;
const AGENDA_KIND_TOLAK = new Set(['pikir', 'ucap', 'token']);
const AGENDA_TANGGAL_RX = /^\d{4}-\d{2}-\d{2}$/;
let agendaGalatTerakhir = 0;        // peringatan tulis dibatasi 1x/menit, bukan tiap event

const agendaBerkas = (tanggal) => path.join(AGENDA_DIR, tanggal + '.jsonl');

/* Daftar putih, bukan daftar hitam: field baru yang suatu hari ditambah ke
   event tidak otomatis bocor ke disk. */
function agendaBaris(ev) {
  if (!ev || AGENDA_KIND_TOLAK.has(ev.kind)) return null;
  const b = { id: ev.id, ts: ev.ts, kind: ev.kind, session: ev.session };
  if (ev.cwd) b.cwd = ev.cwd;
  if (ev.cabang) b.cabang = ev.cabang;
  if (ev.tool) b.tool = ev.tool;
  if (!ISI_MATI && ev.label) b.label = clip(ev.label, AGENDA_LABEL_MAX);
  b.ok = ev.ok !== false;
  if (ev.galat) b.galat = clip(ev.galat, AGENDA_LABEL_MAX);
  if (ev.interupsi) b.interupsi = true;
  if (ev.alasan) b.alasan = clip(ev.alasan, AGENDA_LABEL_MAX);
  if (Number.isFinite(ev.durasi)) b.durasi = ev.durasi;
  if (ev.model) b.model = ev.model;
  if (ev.nama) b.nama = ev.nama;
  if (ev.peran) b.peran = ev.peran;
  if (ev.mesin) b.mesin = ev.mesin;
  if (ev.jenis) b.jenis = ev.jenis;
  if (ev.agen) b.agen = ev.agen;
  if (ev.agenId) b.agenId = ev.agenId;
  if (ev.panggilan) b.panggilan = ev.panggilan;
  if (ev.golongan) b.golongan = ev.golongan;              // kind:'promosi' (buku induk)
  if (ev.sebelumnya) b.sebelumnya = ev.sebelumnya;
  if (Array.isArray(ev.peserta)) b.peserta = ev.peserta.slice(0, 12).map((p) => clip(p, 40));
  for (const k of ['butuh', 'macet']) {
    const v = ev[k];
    if (v === false) b[k] = false;
    else if (v && typeof v === 'object') {
      const s = { sebab: v.sebab || v.jenis || '', alasan: clip(v.alasan || '', AGENDA_LABEL_MAX) };
      if (!ISI_MATI && v.label) s.label = clip(v.label, AGENDA_LABEL_MAX);
      b[k] = s;
    }
  }
  return b;
}

function agendaCatat(ev) {
  const b = agendaBaris(ev);
  if (!b) return;
  try {
    fs.appendFileSync(agendaBerkas(tanggalLokal(b.ts)), JSON.stringify(b) + '\n');
  } catch (err) {
    const kini = Date.now();
    if (kini - agendaGalatTerakhir > 60000) {
      agendaGalatTerakhir = kini;
      console.warn('[agent-room] gagal menulis buku agenda: ' + err.message);
    }
  }
}

/* Baris satu hari, kronologis naik. Berkas tidak ada → []. Baris rusak
   (append terpotong) dilewati, tidak menggagalkan seluruh hari. */
function agendaBacaHari(tanggal) {
  let teks = '';
  try { teks = fs.readFileSync(agendaBerkas(tanggal), 'utf8'); } catch { return []; }
  const keluar = [];
  for (const t of teks.split('\n')) {
    if (!t.trim()) continue;
    try {
      const o = JSON.parse(t);
      if (o && Number.isFinite(o.ts) && o.kind && !AGENDA_KIND_TOLAK.has(o.kind)) {
        if (ISI_MATI) { delete o.label; if (o.butuh) delete o.butuh.label; if (o.macet) delete o.macet.label; }
        keluar.push(o);
      }
    } catch { /* baris terpotong */ }
  }
  return keluar;
}

function agendaMuat() {
  try { fs.mkdirSync(AGENDA_DIR, { recursive: true }); }
  catch (err) { console.warn('[agent-room] folder agenda tidak bisa dibuat: ' + err.message); return; }
  // bersih-bersih: nama berkasnya sudah tanggal, jadi cukup bandingkan string
  const batas = tanggalLokal(Date.now() - AGENDA_HARI * 24 * 3600 * 1000);
  let dibuang = 0;
  try {
    for (const nama of fs.readdirSync(AGENDA_DIR)) {
      const m = nama.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!m || m[1] >= batas) continue;
      try { fs.unlinkSync(path.join(AGENDA_DIR, nama)); dibuang++; } catch {}
    }
  } catch {}
  // ring diisi ulang dari hari ini supaya halaman yang dibuka SESUDAH restart
  // tetap melihat ruangan hari ini, dan seq lanjut dari id terbesar supaya
  // Last-Event-ID milik halaman yang sudah terbuka tidak bertabrakan.
  const hariIni = agendaBacaHari(tanggalLokal(Date.now())).slice(-RING_SIZE);
  for (const o of hariIni) {
    ring.push(o);
    if (Number.isFinite(o.id) && o.id > seq) seq = o.id;
  }
  if (hariIni.length || dibuang) {
    console.log('[agent-room] buku agenda: ' + hariIni.length + ' event hari ini dimuat ke ring'
      + (dibuang ? ', ' + dibuang + ' berkas lebih tua dari ' + AGENDA_HARI + ' hari dibuang' : '')
      + ' (' + AGENDA_DIR + ')');
  }
}
agendaMuat();

/* Putar ulang satu hari lewat SSE. Koneksi ini TIDAK didaftarkan ke
   `clients`: tidak menerima event live, tidak dihitung viewer. Jeda antar
   event = selisih ts asli / laju, dipangkas 5 detik supaya malam sepi tidak
   ditunggu; tiap event diberi `ulang: true`, ditutup `ulang-selesai`.       */
let pemutarUlang = 0;
function putarUlang(req, res, tanggal, laju) {
  const baris = agendaBacaHari(tanggal).sort((a, b) => a.ts - b.ts);
  const kirim = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`); } catch {} };
  if (!baris.length) {
    kirim({ kind: 'ulang-kosong', ulang: true, tanggal, ts: Date.now() });
    res.end();
    return;
  }
  pemutarUlang++;
  let i = 0, timer = null, putus = false;
  const langkah = () => {
    if (putus) return;
    kirim({ ...baris[i], ulang: true });
    i++;
    if (i >= baris.length) {
      kirim({ kind: 'ulang-selesai', ulang: true, tanggal, jumlah: baris.length, ts: Date.now() });
      res.end();
      return;
    }
    const jeda = Math.min(5000, Math.max(0, (baris[i].ts - baris[i - 1].ts) / laju));
    timer = setTimeout(langkah, jeda);
  };
  req.on('close', () => { putus = true; clearTimeout(timer); pemutarUlang = Math.max(0, pemutarUlang - 1); });
  langkah();
}

/* ------------------------------------------------------ buku induk pegawai ---
   Kartu pegawai cuma tahu SATU sesi; kliping cuma tahu SATU minggu. Buku induk
   ini arsip karier lintas sesi & lintas restart, dikunci per NAMA FOLDER
   PROYEK — satu-satunya identitas yang bertahan: session id selalu baru,
   nama panggilan acak, jabatan bisa diganti kapan saja. "Pegawai" di sini
   berarti "siapa pun yang bekerja di folder itu".

   Bahannya HANYA event hook nyata yang lewat /event (pre/post/stop/session-
   start/session-end). Event ambient tidak pernah sampai ke sini (POST /ambien
   tidak memanggil apa pun di blok ini), dan peserta rapat (subagent) tidak
   dihitung sebagai sesi — cuma fan-out-nya (Task/Agent/Workflow) yang ditulis
   ke rekening proyek pemanggilnya.

   Yang disimpan: angka dan nama (folder, cabang, tool). Tidak ada label, tidak
   ada isi — jadi tidak perlu tunduk ke AGENT_ROOM_ISI: tidak ada isi yang
   bisa dimatikan. Angkanya "sejak dipantau", dan label itu ikut ke halaman. */
const BERKAS_BUKU_INDUK = process.env.AGENT_ROOM_BUKU_INDUK
  || path.join(__dirname, 'buku-induk.json');
const BUKU_INDUK_KIND = new Set(['pre', 'post', 'stop', 'session-start', 'session-end']);
const BUKU_INDUK_FANOUT = new Set(['Task', 'Agent', 'Workflow']);
const BUKU_INDUK_JEDA = 5 * 60 * 1000;      // celah antar event lebih dari ini bukan jam dinas
const BUKU_INDUK_TOOL_MAX = 40;             // kunci tool per proyek dibatasi, sisanya dilebur ke '(lain)'
/* Pengali jam dinas untuk UJI SAJA (AGENT_ROOM_BUKU_INDUK_UJI=<angka>): tanpa
   ini kenaikan golongan butuh berjam-jam kerja sungguhan dan mustahil diuji.
   Nilainya ikut ditulis ke /buku-induk supaya angka palsu tidak menyamar. */
const BUKU_INDUK_UJI = Math.max(0, Number(process.env.AGENT_ROOM_BUKU_INDUK_UJI) || 0);
if (BUKU_INDUK_UJI > 1) console.warn('[agent-room] buku induk MODE UJI: jam dinas dikalikan ' + BUKU_INDUK_UJI);

/* Jenjang ala ASN dari jam dinas. Batasnya jam AKTIF (celah ≤5 menit antar
   event), bukan jam kalender — sesi yang dibiarkan terbuka semalaman tidak
   naik pangkat karenanya. Urutan array = urutan pangkat, dipakai membandingkan. */
const GOLONGAN = [
  { nama: 'CPNS',        jam: 0 },
  { nama: 'Pengatur',    jam: 2 },
  { nama: 'Penata Muda', jam: 10 },
  { nama: 'Penata',      jam: 40 },
  { nama: 'Pembina',     jam: 120 },
];
const USUL_FANOUT_MIN = 10;                 // fan-out minimal supaya layak diusulkan Kepala Bidang

function golonganDari(p) {
  // tanpa satu pun tool call belum bisa disebut bekerja, apa pun jam dinasnya
  if (!p.toolCall) return GOLONGAN[0].nama;
  const jam = p.jamDinas / 3600000;
  let g = GOLONGAN[0].nama;
  for (const t of GOLONGAN) if (jam >= t.jam) g = t.nama;
  return g;
}
const golonganUrut = (nama) => GOLONGAN.findIndex((g) => g.nama === nama);

const bukuInduk = { v: 1, proyek: {} };
const bukuIndukSesi = new Map();            // proyek -> Set sesi 12-char yang sudah dihitung di proses ini
let bukuIndukTimer = null;
let bukuIndukKotor = false;

const bukuIndukKosong = () => ({
  sesi: 0, toolCall: 0, gagal: 0, jamDinas: 0, fanOut: 0,
  pertama: 0, terakhir: 0, cabang: {}, tool: {}, golongan: GOLONGAN[0].nama,
});

/* Tabel tool dibatasi 40 kunci: proyek yang memakai puluhan tool MCP tidak
   boleh menggemukkan berkas. Yang tersingkir dilebur ke '(lain)', jadi total
   hitungannya tetap sama dengan toolCall. */
function bukuIndukPangkasTool(tool) {
  const kunci = Object.keys(tool).filter((k) => k !== '(lain)');
  if (kunci.length <= BUKU_INDUK_TOOL_MAX) return;
  kunci.sort((a, b) => tool[b] - tool[a]);
  for (const k of kunci.slice(BUKU_INDUK_TOOL_MAX)) {
    tool['(lain)'] = (tool['(lain)'] || 0) + tool[k];
    delete tool[k];
  }
}

function bukuIndukCatat(ev) {
  if (!BUKU_INDUK_KIND.has(ev.kind) || !ev.cwd) return;
  let p = bukuInduk.proyek[ev.cwd];
  if (!p) p = bukuInduk.proyek[ev.cwd] = bukuIndukKosong();
  const ts = ev.ts;
  // jam dinas: jumlah celah antar event yang masih ≤5 menit — hanya celah,
  // bukan durasi tool, supaya sesi terminal yang tidak melaporkan durasi pun adil
  if (p.terakhir && ts > p.terakhir && ts - p.terakhir <= BUKU_INDUK_JEDA) {
    p.jamDinas += (ts - p.terakhir) * (BUKU_INDUK_UJI > 1 ? BUKU_INDUK_UJI : 1);
  }
  if (!p.pertama || ts < p.pertama) p.pertama = ts;
  if (ts > p.terakhir) p.terakhir = ts;
  // sesi dihitung sekali per proses server: id-nya tidak disimpan ke disk
  // (buku induk bukan daftar hadir), jadi sesi yang melintasi restart bisa
  // terhitung dua kali — itu harga yang dipilih daripada menulis id sesi
  let set = bukuIndukSesi.get(ev.cwd);
  if (!set) bukuIndukSesi.set(ev.cwd, set = new Set());
  if (!set.has(ev.session)) { set.add(ev.session); p.sesi++; }
  if (ev.kind === 'pre' && ev.tool) {
    p.toolCall++;
    p.tool[ev.tool] = (p.tool[ev.tool] || 0) + 1;
    bukuIndukPangkasTool(p.tool);
    if (BUKU_INDUK_FANOUT.has(ev.tool)) p.fanOut++;
  }
  if (ev.kind === 'post' && ev.ok === false) p.gagal++;
  if (ev.cabang) p.cabang[ev.cabang] = (p.cabang[ev.cabang] || 0) + 1;

  // Kenaikan pangkat dideteksi di sini, bukan di halaman: satu sumber, satu
  // event per kenaikan, sama di semua penonton. Hanya USUL & seremoni — tidak
  // menyentuh peranSesi, tidak memindahkan meja siapa pun.
  const g = golonganDari(p);
  if (golonganUrut(g) > golonganUrut(p.golongan)) {
    const sebelumnya = p.golongan;
    p.golongan = g;
    publish({ id: ++seq, ts, kind: 'promosi', session: '', cwd: ev.cwd,
              golongan: g, sebelumnya, tool: null, label: 'naik pangkat ' + sebelumnya + ' → ' + g, ok: true });
  }
  bukuIndukKotor = true;
  bukuIndukJadwalkanTulis();
}

function bukuIndukTulis(sinkron) {
  if (!bukuIndukKotor) return;
  bukuIndukKotor = false;
  clearTimeout(bukuIndukTimer);
  const isi = JSON.stringify(bukuInduk);
  if (sinkron) {
    try { fs.writeFileSync(BERKAS_BUKU_INDUK, isi); }
    catch (err) { console.warn('[agent-room] gagal menulis buku induk: ' + err.message); }
    return;
  }
  // .tmp lalu rename: berkas satu objek JSON, setengah jadi = tidak terbaca sama sekali
  const tmp = BERKAS_BUKU_INDUK + '.tmp';
  fs.writeFile(tmp, isi, (err) => {
    if (err) { console.warn('[agent-room] gagal menulis buku induk: ' + err.message); bukuIndukKotor = true; return; }
    fs.rename(tmp, BERKAS_BUKU_INDUK, (e2) => {
      if (e2) { console.warn('[agent-room] gagal menulis buku induk: ' + e2.message); bukuIndukKotor = true; }
    });
  });
}

// Debounced ≤20 detik, sama alasannya dengan checkpoint kliping: dipanggil
// tiap tool call, tidak boleh menulis disk sesering itu.
function bukuIndukJadwalkanTulis() {
  if (bukuIndukTimer) return;
  bukuIndukTimer = setTimeout(() => { bukuIndukTimer = null; bukuIndukTulis(false); }, 20000);
  bukuIndukTimer.unref?.();
}

function bukuIndukMuat() {
  let o = null;
  try { o = JSON.parse(fs.readFileSync(BERKAS_BUKU_INDUK, 'utf8')); }
  catch { return; }                 // belum ada: wajar, karier baru mulai
  if (!o || o.v !== 1 || !o.proyek || typeof o.proyek !== 'object') {
    console.warn('[agent-room] buku induk diabaikan: bentuk berkas tidak dikenal');
    return;
  }
  let n = 0;
  for (const [nama, r] of Object.entries(o.proyek)) {
    if (!r || typeof r !== 'object' || !nama) continue;
    const p = bukuIndukKosong();
    for (const k of ['sesi', 'toolCall', 'gagal', 'jamDinas', 'fanOut', 'pertama', 'terakhir']) {
      p[k] = Math.max(0, Number(r[k]) || 0);
    }
    for (const k of ['cabang', 'tool']) {
      if (r[k] && typeof r[k] === 'object') {
        for (const [nm, v] of Object.entries(r[k])) if (nm && Number(v) > 0) p[k][clip(nm, 64)] = Number(v);
      }
    }
    bukuIndukPangkasTool(p.tool);
    // golongan tersimpan dipercaya kalau sah; kalau tidak, dihitung ulang tanpa
    // menerbitkan event — berkas lama bukan kenaikan pangkat
    p.golongan = golonganUrut(r.golongan) >= 0 ? r.golongan : golonganDari(p);
    bukuInduk.proyek[clip(nama, 120)] = p;
    n++;
  }
  if (n) console.log('[agent-room] buku induk dimuat: ' + n + ' proyek dari ' + BERKAS_BUKU_INDUK);
}
bukuIndukMuat();

/* Bentuk yang dilayani /buku-induk: rekaman mentah + `golongan` per proyek
   (sudah tersimpan) + `usulPromosi`: proyek dengan fan-out tertinggi (≥10)
   diusulkan jadi Kepala Bidang — USUL, bukan pengangkatan: peranSesi tidak
   pernah disentuh dari sini. */
function bukuIndukRingkas() {
  let usul = null;
  for (const [nama, p] of Object.entries(bukuInduk.proyek)) {
    if (p.fanOut >= USUL_FANOUT_MIN && (!usul || p.fanOut > usul.fanOut)) usul = { proyek: nama, fanOut: p.fanOut };
  }
  return {
    v: bukuInduk.v,
    keterangan: 'sejak dipantau',
    ...(BUKU_INDUK_UJI > 1 ? { uji: BUKU_INDUK_UJI } : {}),
    golongan: GOLONGAN,
    proyek: bukuInduk.proyek,
    usulPromosi: usul ? { ...usul, jabatan: 'Kepala Bidang', jabatanId: 'kabid' } : null,
  };
}

// Tulis saat keluar: 'exit' cuma boleh sinkron, dan SIGINT/SIGTERM harus
// diubah jadi exit() supaya 'exit' sempat jalan. Dipasang sekali saja.
process.on('exit', () => bukuIndukTulis(true));
for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.on(sinyal, () => process.exit(0));
}

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
    const evMacet = dasar({ kind: 'stop-gagal', ok: false, label, macet });
    publish(evMacet);
    laporKeluar(evMacet);
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

/* ------------------------------------------------------ antrean disposisi ---
   Ringkasan satu tugas yang antre, untuk /kendali dan event `antre`. Prompt-nya
   sengaja TIDAK ikut: yang beredar di stream cukup nama, proyek, dan sifat. */
function ringkasAntre(t, i) {
  return { id: t.id, nama: t.nama, cwd: baseName(t.cwd), sejak: t.sejak, sifat: t.sifat, posisi: i + 1 };
}

/* Satu event ringan tiap antrean berubah — masuk, lahir, batal — membawa
   potret seluruh antrean supaya halaman tinggal mengganti daftarnya, tanpa
   polling /kendali. `session` kosong: ini bukan kejadian milik satu pegawai. */
function siarAntre(aksi, t, posisi, pesan) {
  const kepala = aksi === 'masuk' ? 'antre #' + posisi
    : aksi === 'lahir' ? 'giliran tiba'
    : aksi === 'batal' ? 'batal antre'
    : 'gagal lahir';
  publish({
    id: ++seq, ts: Date.now(), kind: 'antre', aksi, session: '', tool: null, ok: aksi !== 'gagal',
    tugas: ringkasAntre(t, (posisi || 1) - 1),
    antrean: antrean.map(ringkasAntre),
    label: clip(kepala + ' · ' + t.nama + ' · ' + baseName(t.cwd)
      + (t.sifat === 'SEGERA' ? ' · SEGERA' : '') + (pesan ? ' — ' + pesan : ''), 220),
  });
}

/* SEGERA menyalip semua BIASA, tapi antre di belakang SEGERA yang lebih dulu:
   loket tetap adil di antara yang sama-sama mendesak. */
function masukAntrean(t) {
  let i = antrean.length;
  if (t.sifat === 'SEGERA') {
    i = antrean.findIndex((x) => x.sifat !== 'SEGERA');
    if (i < 0) i = antrean.length;
  }
  antrean.splice(i, 0, t);
  console.log('[agent-room] tugas "' + t.nama + '" antre #' + (i + 1)
    + (t.sifat === 'SEGERA' ? ' (SEGERA)' : '') + ' — ' + jalan.size + '/' + MAKS_JALAN + ' slot terpakai');
  siarAntre('masuk', t, i + 1);
  return i + 1;
}

function batalAntre(id) {
  const i = antrean.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [t] = antrean.splice(i, 1);
  console.log('[agent-room] antrean "' + t.nama + '" dibatalkan');
  siarAntre('batal', t, i + 1);
  return t;
}

/* Dipanggil tiap satu slot kosong (selesai/timeout/proses keluar). Yang gagal
   lahir tidak menyumbat: dilaporkan sebagai tugas-selesai gagal, lalu lanjut ke
   berikutnya — persis seperti kalau dia gagal waktu dikirim langsung. */
function lahirkanAntrean() {
  while (antrean.length && jalan.size < MAKS_JALAN) {
    const t = antrean.shift();
    siarAntre('lahir', t, 1);
    const hasil = lahirkanTugas(t);
    if (!hasil.ok) {
      console.warn('[agent-room] antrean "' + t.nama + '" gagal lahir: ' + hasil.pesan);
      siarAntre('gagal', t, 1, hasil.pesan);
    }
  }
}

/* ----------------------------------------------------- paraf dari ruangan ---
   Sesi yang dilahirkan halaman dengan `paraf:true` tidak lagi jalan
   bypassPermissions: dia lahir dengan --permission-mode default dan
   --permission-prompt-tool yang menunjuk ke server MCP kecil milik kita
   (mcp-izin.mjs). Tiap kali satu tool butuh izin, proses MCP itu mem-POST ke
   /izin/tanya lalu long-poll /izin/tunggu; kamu menjawab dari kartu pegawai
   lewat /izin/jawab. Kuncinya per-tugas, acak, cuma ada di env anak — jadi
   yang bisa MENGAJUKAN izin hanya proses yang memang kita lahirkan, dan yang
   bisa MENJAWAB hanya pemegang token halaman (gerbang yang sama dengan
   /perintah). Hanya di memori: server mati, permintaan yang menggantung ikut
   hangus, dan CLI-nya menerima deny. */
const IZIN_TUNGGU_MS = 15 * 60 * 1000;      // tanpa paraf selama ini -> ditolak
const IZIN_POLL_MS = 25 * 1000;             // satu long-poll ditahan paling lama segini
const izinTunggu = new Map();               // id 12-hex -> { id, tugas, sesi, tool, ringkasan, sejak, jawab, penunggu:Set<res>, timer }
const BERKAS_MCP_IZIN = path.join(__dirname, 'mcp-izin.mjs');

const kunciCocok = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

function ringkasIzin(p) {
  return { id: p.id, sesi: p.sesi, tool: p.tool, ringkasan: p.ringkasan, sejak: p.sejak };
}

/* Menjawab satu permintaan: melepas semua long-poll yang menunggunya, menyiarkan
   `izin-jawab`, dan mencabut keadaan butuh manusia. Dipakai tiga jalur —
   tombol di halaman, timeout 15 menit, dan proses tugas yang keburu berakhir. */
function jawabIzin(p, keputusan, pesan, sumber) {
  if (p.jawab) return;
  clearTimeout(p.timer);
  p.jawab = { keputusan, pesan: clip(pesan || '', 200) };
  izinTunggu.delete(p.id);
  const badan = JSON.stringify({ ok: true, ...p.jawab });
  for (const res of p.penunggu) {
    try { res.writeHead(200, { 'content-type': 'application/json' }); res.end(badan); } catch { /* sudah putus */ }
  }
  p.penunggu.clear();
  const ev = {
    id: ++seq, ts: Date.now(), kind: 'izin-jawab', session: p.sesi,
    nama: namaSesi.get(p.sesi) || '', tool: p.tool, ok: keputusan === 'paraf',
    keputusan, sumber, paraf: { id: p.id, tool: p.tool },
    // keputusannya sudah ada di `keputusan`; label cuma tool + catatan penolakan
    label: clip(p.tool + (pesan ? ' — ' + pesan : ''), 120),
    ...(peranSesi.has(p.sesi) ? { peran: peranSesi.get(p.sesi) } : {}),
    ...(modelSesi.has(p.sesi) ? { model: modelSesi.get(p.sesi) } : {}),
  };
  // Keadaan butuh manusia dicabut di sini, bukan menunggu PostToolUse: kalau
  // ditolak, tool-nya tidak pernah jalan, jadi tidak ada hook yang menyusul.
  if (butuhManusia.delete(p.sesi)) ev.butuh = false;
  publish(ev);
  console.log('[agent-room] izin ' + p.id + ' (' + p.tool + ', sesi ' + p.sesi + ') '
    + keputusan + (sumber ? ' oleh ' + sumber : ''));
}

/* Tugas berakhir — selesai, dihentikan, timeout — sementara ada permintaan
   yang belum dijawab: proses MCP-nya juga sudah mati, jadi tidak ada yang
   perlu diberi tahu; cukup dibersihkan supaya kartu tidak menawarkan tombol
   paraf untuk sesi yang sudah tidak ada. */
function bersihkanIzin(sid) {
  for (const p of [...izinTunggu.values()]) {
    if (p.tugas === sid) jawabIzin(p, 'tolak', 'tugasnya sudah berakhir', 'server');
  }
}

/* Jalur lahir yang SATU-SATUNYA: dipakai /perintah waktu slot masih ada, dan
   lahirkanAntrean() waktu giliran tiba. `t` adalah bahan yang sudah disaring
   di /perintah — di sini tidak ada lagi keputusan soal apa yang boleh. */
function lahirkanTugas(t) {
  const sid = crypto.randomUUID();
  const nama = t.nama;
  const kerja = t.cwd;
  const model = t.model;
  namaSesi.set(sid.slice(0, 12), nama);
  // Jabatannya dipasang SEBELUM prosesnya lahir, memakai trik yang sama
  // dengan nama: sesi id sudah kita tentukan sendiri lewat --session-id,
  // jadi event hook pertamanya langsung datang dengan seragam yang benar.
  if (t.peran) peranSesi.set(sid.slice(0, 12), t.peran);
  if (model) modelSesi.set(sid.slice(0, 12), model);

  // Prompt masuk sebagai satu elemen argv, BUKAN lewat shell: itu yang
  // bikin teks bebas dari halaman tidak bisa jadi perintah shell.
  const args = [
    '-p', t.prompt,
    '--session-id', sid,
    // stream-json, bukan json: yang dibaca bukan cuma hasil akhirnya, tapi
    // jalannya sesi — dan `-p` mensyaratkan --verbose untuk bentuk ini.
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', t.mode || 'bypassPermissions',
    '--add-dir', kerja,
  ];
  if (model) args.push('--model', model);
  if (t.pagu) args.push('--max-budget-usd', t.pagu);

  /* Paraf dari ruangan: mode izin bawaan, dan tiap permintaan izin dialihkan
     ke tool MCP kita. Konfigurasi MCP-nya JSON inline satu elemen argv (bukan
     berkas sementara — tidak ada yang tertinggal di disk). Yang masuk ke
     JSON itu cuma alamat server dan id tugas; KUNCINYA TIDAK, karena argv
     proses bisa dibaca proses lain di mesin yang sama. Kunci dititipkan lewat
     env proses claude (di bawah, bersama kredensial) dan diwarisi proses MCP
     anaknya — CLI meneruskan env induk ke server MCP stdio. */
  const kunciIzin = t.paraf ? crypto.randomBytes(16).toString('hex') : '';
  if (t.paraf) {
    const mcp = { mcpServers: { 'agent-room-izin': {
      command: process.execPath, args: [BERKAS_MCP_IZIN],
      env: { AGENT_ROOM_URL: 'http://127.0.0.1:' + PORT, AGENT_ROOM_TUGAS: sid },
    } } };
    args.push('--permission-prompt-tool', 'mcp__agent-room-izin__izin',
              '--mcp-config', JSON.stringify(mcp));
    // --permission-mode di atas sudah terpasang; 'default' yang dipakai kalau
    // pemanggil tidak memaksa mode lain, supaya izin benar-benar ditanyakan.
    const iMode = args.indexOf('--permission-mode');
    if (iMode >= 0 && !t.mode) args[iMode + 1] = 'default';
  }

  let anak;
  try {
    // Kredensial lewat env, tidak pernah lewat argv: baris perintah proses
    // bisa dibaca proses lain di mesin yang sama, isi env-nya tidak.
    const lingkungan = { ...process.env };
    if (kredensial) lingkungan[kredensial.envKey] = kredensial.nilai;
    if (kunciIzin) lingkungan.AGENT_ROOM_KUNCI_IZIN = kunciIzin;
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
    return { ok: false, pesan: 'gagal menjalankan claude: ' + err.message };
  }

  const rec = {
    anak, nama, mulai: Date.now(), cwd: kerja, keluar: '', galat: '', hidup: false,
    paraf: Boolean(t.paraf), // izin ditanyakan ke ruangan, bukan bypass
    kunciIzin,               // kunci /izin/tanya — cuma dibandingkan, tidak pernah keluar
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
    const evBisu = {
      id: ++seq, ts: Date.now(), kind: 'tugas-bisu', session: sid.slice(0, 12),
      nama, tool: null, ok: false, cwd: baseName(kerja), cabang: cabangGit(kerja),
      label: 'nihil ' + (BISU_MS / 1000) + ' dtk, hook maupun stream — sesinya tidak pernah mulai',
    };
    publish(evBisu);
    laporKeluar(evBisu);
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
      const tb = b.trim();
      if (!tb) continue;
      let m;
      // Baris yang tidak bisa diurai dilewati, bukan bikin meledak: satu
      // pesan rusak tidak boleh mematikan seluruh sesi.
      try { m = JSON.parse(tb); } catch { continue; }
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

  let sudahSelesai = false;
  const selesai = (kode, sinyal) => {
    // 'error' dan 'close' bisa dua-duanya menyala untuk satu proses; slotnya
    // cuma boleh dilepas — dan antrean dilahirkan — sekali.
    if (sudahSelesai) return;
    sudahSelesai = true;
    clearTimeout(batas);
    clearTimeout(rec.bisu);
    jalan.delete(sid);
    bersihkanIzin(sid);      // permintaan paraf yang menggantung ikut ditutup
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
    const evSelesai = {
      id: ++seq, ts: Date.now(), kind: 'tugas-selesai',
      session: sid.slice(0, 12), nama, tool: null, ok: !gagal,
      cwd: baseName(kerja), cabang: cabangGit(kerja),
      label: gagal
        ? clip('gagal (kode ' + kode + (sinyal ? '/' + sinyal : '') + ') '
               + sebabGagal(), 220)
        : nama,
      ...(biaya ? { biaya } : {}),
    };
    publish(evSelesai);
    laporKeluar(evSelesai);
    // Slot baru kosong: yang paling depan di loket langsung dilahirkan.
    lahirkanAntrean();
  };
  anak.on('error', (err) => { rec.galat += err.message; selesai(-1, null); });
  anak.on('close', selesai);

  publish({ id: ++seq, ts: Date.now(), kind: 'tugas-mulai',
            session: sid.slice(0, 12), nama, tool: null, label: nama, ok: true,
            peran: peranSesi.get(sid.slice(0, 12)) || '', model, paraf: rec.paraf });

  return { ok: true, sesi: sid.slice(0, 12) };
}

const server = http.createServer(async (req, res) => {
  // Penjaga Host jalan paling depan, untuk SEMUA route — lihat blok gerbang.
  if (!hostSah(req)) {
    gerbangWarn('permintaan ditolak: Host "' + clip(req.headers.host, 80) + '" bukan alamat kantor ini'
      + ' (izinkan lewat AGENT_ROOM_HOST_IZIN kalau memang milikmu)');
    req.resume();
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Host tidak dikenal');
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/event' && req.method === 'POST') {
    if (!kunciSah(req)) {
      gerbangWarn('event ditolak: x-agent-room-kunci tidak cocok/kosong — pasang ulang hook dengan'
        + ' AGENT_ROOM_KUNCI yang sama (dinas --pasang)');
      req.resume();
      res.writeHead(403).end();
      return;
    }
    const mesin = mesinDari(req);
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
      if (mesin) ev.mesin = mesin;
      tandaiHidup(ev.session);
      catatSesiHidup(ev);
      publish(ev);
      laporKeluar(ev);          // nota dinas keluar: hanya kalau AGENT_ROOM_LAPOR diisi
      // Buku induk pegawai: karier per folder proyek, hanya dari hook nyata di sini
      bukuIndukCatat(ev);
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
    const ulang = url.searchParams.get('ulang');
    if (ulang) {
      if (!AGENDA_TANGGAL_RX.test(ulang)) { res.end(); return; }
      putarUlang(req, res, ulang, Math.min(600, Math.max(1, Number(url.searchParams.get('laju')) || 60)));
      return;
    }
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
        paraf: Boolean(j.paraf),
      })),
      // Permintaan izin yang masih menunggu paraf dari ruangan — supaya halaman
      // yang dibuka belakangan tetap bisa menawarkan tombolnya.
      izinTunggu: [...izinTunggu.values()].map(ringkasIzin),
      // Loket disposisi: yang menunggu slot. Prompt-nya tidak ikut — cukup
      // nama, proyek, sifat, dan posisinya.
      antrean: antrean.map(ringkasAntre),
      antreMaks: ANTRE_MAKS,
      maksJalan: MAKS_JALAN,
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

    const prompt = String(p.prompt || '').trim();
    if (!prompt) return tolak(400, 'prompt kosong');

    const model = String(p.model || '').trim();
    if (model && !MODEL_SAH.test(model)) return tolak(400, 'id model tidak sah: ' + clip(model, 40));

    const kerja = String(p.cwd || '').trim() || process.cwd();
    if (!fs.existsSync(kerja) || !fs.statSync(kerja).isDirectory()) {
      return tolak(400, 'folder kerja tidak ada: ' + kerja);
    }

    /* Semua yang nanti dibutuhkan spawn dikumpulkan di satu objek, supaya
       jalur "lahir sekarang" dan "antre dulu" memakai bahan yang persis sama.
       Disaring DI SINI, saat masuk — bukan saat lahir — supaya yang ditolak
       tahu sekarang, bukan lima menit lagi waktu gilirannya tiba. */
    const sifat = String(p.sifat || 'BIASA').trim().toUpperCase();
    if (!SIFAT_SAH.has(sifat)) return tolak(400, 'sifat tidak dikenal: ' + clip(p.sifat, 20));
    const tugas = {
      id: crypto.randomBytes(6).toString('hex'),
      prompt, cwd: kerja, nama: clip(p.nama, 24) || 'tugas',
      peran: typeof p.peran === 'string' && PERAN_SAH.test(p.peran) ? p.peran : '',
      model,
      mode: typeof p.mode === 'string' && p.mode ? p.mode : '',
      pagu: p.pagu ? String(Number(p.pagu) || 1) : '',
      // paraf:true = izin ditanyakan ke ruangan (lihat "paraf dari ruangan");
      // bawaan tetap jalur lama bypassPermissions.
      paraf: p.paraf === true,
      sifat, sejak: Date.now(),
    };

    if (jalan.size >= MAKS_JALAN) {
      if (antrean.length >= ANTRE_MAKS) {
        return tolak(429, 'loket disposisi penuh — ' + ANTRE_MAKS + ' tugas sudah antre');
      }
      const posisi = masukAntrean(tugas);
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, antre: true, id: tugas.id, posisi }));
      return;
    }

    const hasil = lahirkanTugas(tugas);
    if (!hasil.ok) return tolak(500, hasil.pesan);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sesi: hasil.sesi }));
    return;
  }

  /* Batalkan yang masih antre. Gerbangnya sama persis dengan /perintah —
     yang boleh menaruh disposisi di loket boleh juga menariknya kembali.
     Dua bentuk diterima: DELETE /perintah/antre/<id>?token=… dan
     POST /perintah/batal {token, id}, supaya klien yang alergi body di
     DELETE tetap punya jalan. Yang sudah lahir bukan urusan sini — itu
     /perintah/hentikan. */
  const mAntre = req.method === 'DELETE' && url.pathname.match(/^\/perintah\/antre\/([0-9a-f]{12})$/);
  if (mAntre || (url.pathname === '/perintah/batal' && req.method === 'POST')) {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    let token = '';
    let idAntre = '';
    if (mAntre) {
      token = url.searchParams.get('token') || '';
      idAntre = mAntre[1];
    } else {
      const body = (await readBody(req)).teks;
      let p;
      try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }
      token = p.token;
      idAntre = String(p.id || '');
    }
    const balas = (kode, obj) => {
      res.writeHead(kode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (!IZIN) return balas(403, { ok: false, pesan: 'kendali web mati' });
    if (token !== TOKEN) return balas(403, { ok: false, pesan: 'token tidak cocok' });
    const t = batalAntre(idAntre);
    if (!t) return balas(404, { ok: false, pesan: 'tidak ada di antrean (mungkin sudah lahir)' });
    return balas(200, { ok: true, id: t.id, nama: t.nama });
  }

  /* ------------------------------------------------- paraf dari ruangan ---
     Tiga pintu. Dua yang pertama dipakai proses MCP anak (mcp-izin.mjs) dan
     dijaga kunci per-tugas; yang ketiga dipakai halaman dan dijaga gerbang
     yang sama persis dengan /perintah — yang boleh menyuruh mesin bekerja,
     boleh juga memparaf pekerjaannya. */
  if (url.pathname === '/izin/tanya' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    let p;
    try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }
    const balas = (kode, obj) => {
      res.writeHead(kode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const rec = jalan.get(String(p.tugas || ''));
    if (!rec || !rec.paraf || !kunciCocok(p.kunci, rec.kunciIzin)) {
      return balas(403, { ok: false, pesan: 'kunci izin tidak cocok' });
    }
    const sesi = String(p.tugas).slice(0, 12);
    const tool = clip(p.tool_name || '?', 64);
    const ringkasan = clip(p.ringkasan || '', 300);
    const izin = {
      id: crypto.randomBytes(6).toString('hex'), tugas: String(p.tugas), sesi, tool, ringkasan,
      panggilan: clip(p.tool_use_id || '', 64), sejak: Date.now(), jawab: null,
      penunggu: new Set(), timer: null,
    };
    izin.timer = setTimeout(() => jawabIzin(izin, 'tolak', 'tidak ada paraf', 'waktu habis'), IZIN_TUNGGU_MS);
    izin.timer.unref?.();
    izinTunggu.set(izin.id, izin);
    // Event yang sama bentuknya dengan izin-minta dari hook, ditambah `paraf`:
    // pose butuh manusia, pengingat terkatung, dan nota dinas keluar semuanya
    // ikut jalan tanpa perlu tahu dari mana izinnya datang.
    const keadaan = { sebab: 'izin', alasan: ringkasan, label: ringkasan };
    butuhManusia.set(sesi, keadaan);
    const ev = {
      id: ++seq, ts: izin.sejak, kind: 'izin-minta', session: sesi,
      nama: namaSesi.get(sesi) || rec.nama, cwd: baseName(rec.cwd),
      ...(rec.cwd ? { cabang: cabangGit(rec.cwd) } : {}),
      tool, label: ringkasan, ok: true, sebab: 'izin', alasan: ringkasan,
      ...(izin.panggilan ? { panggilan: izin.panggilan } : {}),
      paraf: { id: izin.id, tool }, butuh: keadaan,
      ...(peranSesi.has(sesi) ? { peran: peranSesi.get(sesi) } : {}),
      ...(modelSesi.has(sesi) ? { model: modelSesi.get(sesi) } : {}),
    };
    tandaiHidup(sesi);       // proses MCP-nya sudah bicara: sesinya jelas hidup
    publish(ev);
    laporKeluar(ev);
    console.log('[agent-room] izin ' + izin.id + ' diajukan: ' + tool + ' (sesi ' + sesi + ')');
    return balas(200, { ok: true, id: izin.id });
  }

  if (url.pathname === '/izin/tunggu' && req.method === 'GET') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const balas = (kode, obj) => {
      res.writeHead(kode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const tugas = url.searchParams.get('tugas') || '';
    const rec = jalan.get(tugas);
    if (!rec || !rec.paraf || !kunciCocok(url.searchParams.get('kunci'), rec.kunciIzin)) {
      return balas(403, { ok: false, pesan: 'kunci izin tidak cocok' });
    }
    const p = izinTunggu.get(url.searchParams.get('id') || '');
    if (!p || p.tugas !== tugas) return balas(404, { ok: false, pesan: 'permintaan izin tidak ada' });
    if (p.jawab) return balas(200, { ok: true, ...p.jawab });
    // Ditahan sampai dijawab atau IZIN_POLL_MS lewat — yang kedua menjawab
    // {tunggu:true} supaya klien mengulang, bukan menggantung tanpa batas.
    p.penunggu.add(res);
    const lepas = setTimeout(() => {
      if (!p.penunggu.delete(res)) return;
      try { balas(200, { ok: true, tunggu: true }); } catch { /* sudah putus */ }
    }, IZIN_POLL_MS);
    req.on('close', () => { clearTimeout(lepas); p.penunggu.delete(res); });
    return;
  }

  if (url.pathname === '/izin/jawab' && req.method === 'POST') {
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
    const keputusan = p.keputusan === 'paraf' ? 'paraf' : p.keputusan === 'tolak' ? 'tolak' : '';
    if (!keputusan) return balas(400, { ok: false, pesan: 'keputusan harus paraf atau tolak' });
    const izin = izinTunggu.get(String(p.id || ''));
    if (!izin) return balas(404, { ok: false, pesan: 'permintaan izin tidak ada (sudah dijawab atau tugasnya berakhir)' });
    jawabIzin(izin, keputusan, keputusan === 'tolak' ? clip(p.pesan || 'ditolak dari ruangan', 200) : '', 'halaman');
    return balas(200, { ok: true, id: izin.id, keputusan });
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

  /* Buku induk pegawai — tanpa token, sekelas /token-riwayat: isinya angka
     dan nama folder/cabang/tool yang toh sudah lewat /stream juga. */
  if (url.pathname === '/buku-induk') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(bukuIndukRingkas()));
    return;
  }

  /* Buku agenda — tanpa token, sekelas /token-riwayat: isinya metadata yang
     toh sudah lewat /stream tanpa autentikasi juga. Terbaru dulu. */
  if (url.pathname === '/agenda') {
    const p = url.searchParams;
    const hariIni = tanggalLokal(Date.now());
    const dari = p.get('dari') || hariIni;
    const sampai = p.get('sampai') || dari;
    if (!AGENDA_TANGGAL_RX.test(dari) || !AGENDA_TANGGAL_RX.test(sampai) || dari > sampai) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ galat: 'dari/sampai harus YYYY-MM-DD dan dari <= sampai' }));
      return;
    }
    const limit = Math.min(2000, Math.max(1, Number(p.get('limit')) || 200));
    const q = (p.get('q') || '').toLowerCase();
    const sesi = p.get('sesi') || '';
    const proyek = p.get('proyek') || '';
    const kind = p.get('kind') || '';
    const cocok = (o) => (!sesi || o.session === sesi)
      && (!proyek || o.cwd === proyek)
      && (!kind || o.kind === kind)
      && (!q || [o.label, o.tool, o.kind, o.cwd].some((v) => v && String(v).toLowerCase().includes(q)));
    const baris = [];
    // mundur per hari dari `sampai`; rentang dibatasi seumur simpanan (AGENDA_HARI)
    const d = new Date(sampai + 'T00:00:00');
    for (let n = 0; n <= AGENDA_HARI + 1 && baris.length < limit; n++) {
      const tgl = tanggalLokal(d.getTime() - n * 24 * 3600 * 1000);
      if (tgl < dari) break;
      const hari = agendaBacaHari(tgl);
      for (let i = hari.length - 1; i >= 0 && baris.length < limit; i--) {
        if (cocok(hari[i])) baris.push(hari[i]);
      }
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({ dari, sampai, jumlah: baris.length, baris }));
    return;
  }

  /* Potret ruangan — tanpa token, sekelas /health: siapa yang hidup, siapa
     yang tertahan, berapa yang antre. Metadata saja; ini yang dibaca
     mcp-room.mjs supaya sesi Claude lain bisa "menanyakan kantornya". */
  if (url.pathname === '/ruangan') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(potretRuangan()));
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, events: seq, viewers: clients.size, pemutarUlang, port: PORT }));
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
  if (KUNCI) console.log('[agent-room] kunci event AKTIF — POST /event tanpa x-agent-room-kunci ditolak');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !KUNCI) {
    console.warn('[agent-room] PERINGATAN: bind ke ' + HOST + ' tanpa AGENT_ROOM_KUNCI — siapa pun di jaringan'
      + ' bisa memalsukan sesi dan membaca isi kerja lewat /stream. Isi AGENT_ROOM_KUNCI, atau kembali ke 127.0.0.1.');
  }
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
