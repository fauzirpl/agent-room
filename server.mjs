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
/* Lembar telaah staf. Modul murni, nol efek samping, dan sengaja dipakai DUA
   proses: server ini dan `mcp-izin.mjs` — supaya aturan risikonya tidak pernah
   disalin dua kali lalu hanyut sendiri-sendiri. */
import { telaahRisiko, maksTingkat } from './telaah.mjs';

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
// sesi -> Map<agenId, { agen, sejak, terakhir, tool, toolN, gagal }>
const pesertaHidup = new Map();
/* Ambang "diam" peserta. NOTA, BUKAN REM: tidak ada yang ditahan karenanya,
   ia cuma penanda di /ruangan dan satu gauge. Angkanya baru jujur sejak
   `agent_id` dibaca pada pre/post — sebelum itu `terakhir` membeku di detik
   subagent-start, jadi tiap peserta yang hidup lebih dari sepuluh menit akan
   ditandai diam padahal sedang sibuk. */
const PESERTA_DIAM_MS = 10 * 60 * 1000;
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
const modeSesi = new Map();             // sesi 12-char -> permission_mode apa adanya
/* Surat kuasa: seberapa jauh sebuah sesi boleh bertindak tanpa bertanya.
 *
 * Tiap payload hook membawa `permission_mode`, dan sampai sekarang ia dibuang
 * utuh. Akibatnya pemilik tidak bisa membedakan sesi yang MEMANG tidak akan
 * pernah minta paraf dari sesi yang sedang diam-diam menunggu dijawab — dua
 * keadaan yang di ruangan terlihat persis sama.
 *
 * Nilainya enum milik CLI, bukan karangan kita. Yang tidak dikenal DILEWATKAN
 * apa adanya tanpa terjemahan: menebak-nebak nama mode baru lebih buruk
 * daripada menampilkan nilai mentahnya. */
const MODE_KUASA = {
  default: 'diawasi',
  plan: 'magang',
  acceptEdits: 'kuasa stempel',
  delegate: 'kuasa delegasi',
  dontAsk: 'kuasa penuh',
  bypassPermissions: 'kuasa penuh',
};
const kuasaDari = (mode) => MODE_KUASA[mode] || '';

/* ------------------------------------------------------- berputar-putar ---
 * Agen yang mandek di tempat terlihat seperti pegawai rajin: tool call naik,
 * stamina turun, tidak ada satu pun tanda bahwa dia sedang mengulang.
 *
 * Dua pola yang benar-benar belum punya padanan di mana pun:
 *
 *   ulang-sama    operasi yang PERSIS sama diulang >= 3 kali berturut-turut.
 *                 Persis di sini berarti sidik jarinya sama — bukan cuma nama
 *                 tool-nya, karena membaca dua berkas berbeda bukan
 *                 pengulangan.
 *   bolak-balik   menyunting a lalu b lalu a lagi, >= 2 putaran. Ini pola
 *                 "ragu-ragu" yang paling mahal dan paling sulit dilihat
 *                 manusia dari log yang mengalir.
 *
 * Yang SENGAJA tidak ikut: gagal berturut-turut. Itu sudah dihitung halaman
 * (`gagalBerturut` di room.js) dan dipakai event acak inspektorat; menghitung
 * ulang di server berarti ruangan menampilkan DUA angka untuk satu fakta.
 * Menyatukannya pekerjaan tersendiri.
 *
 * NOTA, BUKAN REM: tidak ada yang ditahan, tidak ada tool yang ditolak.
 */
const PUTAR_TOOL_EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PUTAR_ULANG_MIN = 3;      // berapa kali operasi sama berturut-turut
const PUTAR_BOLAK_MIN = 2;      // berapa putaran a→b→a
const PUTAR_RIWAYAT = 12;       // panjang jejak per sesi yang disimpan
const putarSesi = new Map();    // sesi -> { jejak: [sidik], edit: [berkas], tanda: '' }

/* Sidik jari satu operasi. Dihitung dari `tool_input` MENTAH, bukan dari
   `ev.label` yang sudah dipotong dan diterjemahkan: dua Read atas berkas yang
   sama tapi offset berbeda bukan pengulangan, dan labelnya tidak membedakan
   keduanya. */
function sidikTool(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  const p = (v) => String(v == null ? '' : v).slice(0, 200);
  switch (tool) {
    case 'Read': case 'NotebookRead':
      return 'read:' + p(i.file_path || i.notebook_path) + '#' + p(i.offset || 0) + '+' + p(i.limit || 0);
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit':
      return 'edit:' + p(i.file_path || i.notebook_path) + '#' + p(i.old_string || i.new_string || i.content).slice(0, 80);
    case 'Bash': case 'PowerShell':
      return 'sh:' + p(i.command);
    case 'Grep': case 'Glob':
      return 'cari:' + p(i.pattern) + '@' + p(i.path);
    default:
      return tool + ':' + p(Object.values(i).find((v) => typeof v === 'string'));
  }
}

/* Nama berkas yang disunting, untuk pola bolak-balik. Kosong = bukan suntingan,
   jadi tidak ikut dihitung. */
function berkasEdit(tool, input) {
  if (!PUTAR_TOOL_EDIT.has(tool)) return '';
  const i = input && typeof input === 'object' ? input : {};
  return baseName(i.file_path || i.notebook_path || '');
}

/* Dipanggil dari `terimaEvent()` untuk kind `pre`. Mengembalikan penanda kalau
   polanya BARU terdeteksi pada event ini, kosong kalau tidak — supaya notanya
   terbit sekali per kejadian, bukan tiap tool call sesudahnya. */
function periksaPutar(ev, raw) {
  if (ev.kind !== 'pre' || !ev.tool) return '';
  const s = putarSesi.get(ev.session) || { jejak: [], edit: [], tanda: '' };
  putarSesi.set(ev.session, s);

  const sidik = sidikTool(ev.tool, raw.tool_input);
  s.jejak.push(sidik);
  if (s.jejak.length > PUTAR_RIWAYAT) s.jejak.shift();

  const berkas = berkasEdit(ev.tool, raw.tool_input);
  if (berkas) {
    s.edit.push(berkas);
    if (s.edit.length > PUTAR_RIWAYAT) s.edit.shift();
  }

  // ulang-sama: ekor jejak yang seluruhnya sidik yang sama
  let sama = 0;
  for (let i = s.jejak.length - 1; i >= 0 && s.jejak[i] === sidik; i--) sama++;

  // bolak-balik: a b a b … pada ekor daftar berkas yang disunting
  let putaran = 0;
  const e = s.edit;
  if (e.length >= 4) {
    const a = e[e.length - 1]; const b = e[e.length - 2];
    if (a !== b) {
      let i = e.length - 1;
      while (i >= 0 && e[i] === (((e.length - 1 - i) % 2) ? b : a)) i--;
      putaran = Math.floor((e.length - 1 - i) / 2);
    }
  }

  const tanda = sama >= PUTAR_ULANG_MIN ? 'ulang-sama'
    : putaran >= PUTAR_BOLAK_MIN ? 'bolak-balik' : '';
  if (!tanda) { s.tanda = ''; return ''; }
  if (s.tanda === tanda) return '';        // sudah dilaporkan; jangan berisik tiap call
  s.tanda = tanda;
  return tanda;
}
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

/* Seam UNTUK UJI. `spawn()` di bawah memakai CLAUDE langsung sebagai
   executable, jadi penunjuk yang berupa skrip tidak akan pernah jalan: di
   Windows `.cmd`/`.mjs` melempar EINVAL sejak perbaikan CVE-2024-27980, dan
   di CI Linux semua `.mjs` di indeks git bermode 100644 (tanpa bit eksekusi).
   Akibatnya seluruh loop kendali — POST /perintah → stream-json →
   subagent-start/stop → tugas-selesai — mustahil diuji tanpa biner claude
   sungguhan, dan `npm test` memang tidak boleh punya satu pun.

   Kalau penunjuknya berakhiran .mjs/.cjs/.js, anaknya dijalankan sebagai
   `node <skrip> ...args`. Ini TIDAK menambah kuasa apa pun: AGENT_ROOM_CLAUDE
   hari ini sudah menjalankan executable sembarang, dan yang berubah cuma
   boleh-tidaknya penunjuk itu berupa skrip. Yang dipakai tetap shell:false,
   jadi prompt dari halaman tetap tidak bisa jadi perintah shell.

   Dan ia BERSUARA waktu dipakai — pola yang sama dengan
   AGENT_ROOM_BUKU_INDUK_UJI: kantor yang sedang memakai pemeran, bukan agen
   sungguhan, tidak boleh diam soal itu. */
const CLAUDE_SKRIP = /\.(mjs|cjs|js)$/i.test(CLAUDE || '');

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
  Elicitation: 'elicit',
  ElicitationResult: 'elicit-jawab',
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
  const lalu = macetSesi.get(sesi);
  const keadaan = { jenis, label, galat: galat || '', sejak: (lalu && lalu.sejak) || Date.now() };
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
/* Tool MCP bernama `mcp__<server>__<tool>`. Dipecah sekali di sini, dipakai
   normalize() (ev.mcpServer/ev.mcpTool), describe() (label), dan buku induk
   (agregat per server). Pola tidak cocok -> null, bukan tebakan. */
const MCP_RX = /^mcp__([^_](?:.*?[^_])?)__(.+)$/;
const MCP_LAMBAT_MS = 8000;                 // tool MCP lebih lama dari ini ditandai `lambat`
function pecahMcp(tool) {
  const m = typeof tool === 'string' ? MCP_RX.exec(tool) : null;
  return m ? { server: clip(m[1], 64), tool: clip(m[2], 64) } : null;
}

function describe(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  // label MCP: nama servernya ikut, bukan cuma string pertama dari input-nya
  const mcp = pecahMcp(tool);
  if (mcp) return mcp.server + ' · ' + mcp.tool;
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
  const mcp = pecahMcp(tool);
  if (mcp) {
    ev.mcpServer = mcp.server;
    ev.mcpTool = mcp.tool;
    // hanya di giliran penutup: durasi baru ada di PostToolUse(Failure)
    if (kind === 'post' && ev.durasi > MCP_LAMBAT_MS) ev.lambat = true;
  }
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
  /* Mode kuasa disimpan sebagai STATUS, tidak pernah jadi peristiwa. Hook yang
     menyala di dalam subagent memakai session_id INDUK tapi membawa mode-nya
     sendiri (agen bawaan sering `dontAsk`), jadi menerbitkan event tiap kali
     nilainya berubah akan berkedip palsu sepanjang hari. Yang terakhir
     terlihat itulah yang berlaku; tidak ada kind baru, tidak ada baris agenda
     baru, dan `?ulang=` tidak perlu tahu apa-apa soal ini. */
  /* Hook yang menyala DI DALAM subagent memakai session_id induk tapi membawa
     mode miliknya sendiri (agen bawaan sering `dontAsk`). Kalau itu ikut
     disimpan, surat kuasa induk akan berkedip-kedip sepanjang hari antara
     mode aslinya dan mode pesertanya. Jadi yang dipercaya cuma event yang
     memang milik sesi utama — dan `agent_id` itulah pembedanya. */
  if (raw.permission_mode && !raw.agent_id) modeSesi.set(ev.session, clip(raw.permission_mode, 20));
  const modeKini = modeSesi.get(ev.session);
  if (modeKini) {
    /* Field PASIF, bukan peristiwa: tidak ada kind baru, dan `agendaBaris()`
       memakai daftar putih jadi keduanya tidak pernah sampai ke disk. Halaman
       memerlukannya karena ia tidak pernah menanyai `/ruangan`. */
    ev.mode = modeKini;
    ev.kuasa = kuasaDari(modeKini);
  }
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
  /* Identitas PELAKU event ini, berlaku untuk kind apa pun — bukan cuma
     penanda masuk/keluar rapat.

     Hook yang dipasang lewat settings ikut menyala DI DALAM subagent, dan
     `PreToolUse`/`PostToolUse` dari sana membawa `agent_id` + `agent_type`.
     Dulu keduanya cuma dibaca pada `subagent-start`/`subagent-stop`, jadi tiap
     tool call milik peserta rapat kehilangan pelakunya dan ditagihkan ke sesi
     induk: pegawai induk yang berjalan ke stasiun, dan hitungan tool call,
     riwayat, serta gagal berturut di kartunya ikut tercemar. Buku agenda
     terukur membuktikannya — 2.020 baris `pre` hari ini, nol yang ber-agenId,
     padahal baris `subagent-start` dari sesi yang sama membawanya.

     Gerbangnya `agent_id`, BUKAN `agent_type`. Sesi yang dijalankan dengan
     `claude --agent` membawa `agent_type` di tingkat SESI, jadi menggerbangi
     `agent_type` akan menandai seluruh event sesi itu sebagai kerja peserta
     yang tidak pernah ada. `agent_id` hanya ada kalau pelakunya memang
     subagent. */
  if (raw.agent_id) {
    ev.agenId = clip(raw.agent_id, 64);
    if (raw.agent_type) ev.agen = clip(raw.agent_type, 26);
  }
  if (kind === 'subagent-start' || kind === 'subagent-stop') {
    // Payload lama bisa membawa agent_type tanpa agent_id; jangan kehilangan
    // namanya cuma karena pasangannya tidak ada.
    if (raw.agent_type) ev.agen = clip(raw.agent_type, 26);
    ev.label = ev.agen || '';
  }
  /* Telaah risiko untuk permintaan izin yang datang lewat HOOK (sesi
     terminal). Dihitung dari tool_input MENTAH, bukan dari label yang sudah
     dipotong. Cuma pita dan nama pola — tidak ada tombol, karena sesi
     terminal memang tidak bisa diparaf dari halaman. */
  if (kind === 'izin-minta') {
    const t = telaahRisiko(tool, raw.tool_input);
    if (t.tingkat !== 'rendah') ev.risiko = t;
  }
  /* Instansi luar minta keterangan. Yang jadi LABEL cuma nama server MCP-nya
     — itu metadata, dan itu yang boleh ikut ke buku agenda. Pertanyaannya
     sendiri isi kerja, jadi ia lewat `ev.tanya` yang memang tidak pernah
     disalin `agendaBaris()`, sama seperti AskUserQuestion. */
  if (kind === 'elicit') {
    ev.label = clip(raw.mcp_server_name || 'server MCP', 60);
    const pesan = clip(raw.message || '', 240);
    if (pesan && !ISI_MATI) ev.tanya = { jenis: 'tanya', daftar: [{ tanya: pesan, opsi: [] }] };
  }
  if (kind === 'elicit-jawab') ev.label = clip(raw.mcp_server_name || 'server MCP', 60);
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
    : kind === 'elicit' ? 'tanya'
    : kind === 'notify' && NOTIFY_BUTUH.has(String(raw.notification_type || '')) ? 'tanya'
    : kind === 'pre' && TOOL_TANYA.has(tool) ? 'tanya'
    : '';
  if (sebab) {
    /* `sejak` bertahan selama sesi itu belum lepas dari tertahan: permintaan
       izin kedua dari sesi yang sama bukan tunggu baru, ia tunggu yang sama
       yang belum dijawab. Yang mereset cuma pencabutan di cabang `else`. */
    const lalu = butuhManusia.get(ev.session);
    const keadaan = {
      sebab, alasan: ev.alasan || '', label: ev.label || '',
      sejak: (lalu && lalu.sejak) || Date.now(),
    };
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
  if (ev.kind === 'session-end') { sesiHidup.delete(ev.session); pesertaHidup.delete(ev.session); return; }
  const s = sesiHidup.get(ev.session) || { sejak: ev.ts };
  s.terakhir = ev.ts;
  s.kind = ev.kind;
  if (ev.cwd) s.cwd = ev.cwd;
  if (ev.cabang !== undefined) s.cabang = ev.cabang || '';
  if (ev.mesin) s.mesin = ev.mesin;
  if (ev.tool) { s.tool = ev.tool; s.toolTs = ev.ts; }
  if (ev.putar) { s.putar = ev.putar; s.putarTs = ev.ts; }
  const mode = modeSesi.get(ev.session);
  if (mode) s.mode = mode;
  sesiHidup.set(ev.session, s);
  catatPesertaHidup(ev);
}

/* Peserta rapat yang sedang hidup, DI SERVER.
 *
 * Sampai sekarang seluruh keadaan peserta cuma hidup di `public/room.js`, jadi
 * ia mati begitu tab ditutup — dan agen lain yang bertanya lewat MCP dijawab
 * `menganggur` untuk sesi induk yang sudah `stop` padahal tiga pesertanya masih
 * bekerja di latar. Itu keadaan lazim, bukan pojok: subagent memang dijalankan
 * di latar oleh sesi interaktif.
 *
 * Yang disimpan metadata saja, sekelas isi `sesiHidup`: nama jenis agennya,
 * kapan mulai, kapan terakhir terdengar, tool terakhir, dan hitungannya. Tidak
 * ada isi kerja, tidak ada label berkas. */
function catatPesertaHidup(ev) {
  if (!ev.agenId) {
    /* Tanpa agenId tidak ada peserta yang bisa disebut. Ini juga jalan yang
       dilalui SELURUH event sesi biasa, jadi ia harus murah. */
    return;
  }
  let peta = pesertaHidup.get(ev.session);
  if (ev.kind === 'subagent-stop') {
    if (peta) { peta.delete(ev.agenId); if (!peta.size) pesertaHidup.delete(ev.session); }
    return;
  }
  if (!peta) { peta = new Map(); pesertaHidup.set(ev.session, peta); }
  const p = peta.get(ev.agenId) || { agen: '', sejak: ev.ts, toolN: 0, gagal: 0 };
  if (ev.agen) p.agen = ev.agen;
  p.terakhir = ev.ts;
  if (ev.kind === 'pre' && ev.tool) { p.tool = ev.tool; p.toolN++; }
  if (ev.kind === 'post' && ev.ok === false) p.gagal++;
  peta.set(ev.agenId, p);
  /* Peserta yatim — `subagent-start` yang tidak pernah punya pasangan `stop` —
     memang ada (fixture hari sungguhan: 71 start lawan 29 stop). Yang menjaga
     petanya tidak tumbuh selamanya adalah sapuan di `potretRuangan()` dan
     penghapusan pada `session-end` induk, bukan harapan bahwa stop selalu
     datang. */
}

/* Potret ruangan untuk GET /ruangan: metadata saja, sekelas /health. */
/* ---------------------------------------------------- daftar hadir (ukur) ---
 * Claude Code menulis satu berkas per proses di `~/.claude/sessions/<pid>.json`
 * berisi `sessionId`, `pid`, `cwd`, `entrypoint`, dan seterusnya. Kalau berkas
 * itu bisa dipercaya, ia menjawab pertanyaan yang hari ini tidak punya jawaban:
 * sesi mana yang sudah MATI tanpa sempat mengirim `SessionEnd`.
 *
 * Tapi "kalau bisa dipercaya" itu belum diukur, dan membangun sapuan di atas
 * sinyal yang belum diukur persis kesalahan yang membuat beberapa usulan rapat
 * ini gugur. Jadi yang ada di sini CUMA PENGHITUNG — tidak ada sesi yang
 * dihapus, tidak ada yang diklasifikasi, tidak ada yang berubah karenanya.
 * Angkanya muncul di `/health` supaya bisa diamati sebulan lebih dulu.
 *
 *   terbaca  berkas sesi yang berhasil diurai
 *   cocok    sesi hidup di kantor ini yang punya berkasnya
 *   yatim    sesi hidup yang TIDAK punya berkas sama sekali
 *   mati     sesi hidup yang berkasnya ada tapi pid-nya sudah tidak jalan
 */
let absenCache = { pada: 0, n: -1, nilai: null };
function absenHitung() {
  const kini = Date.now();
  /* Cache-nya ikut JUMLAH SESI HIDUP, bukan cuma waktu: tanpa itu pembacaan
     pertama (yang selalu terjadi saat server baru menyala dan kantor masih
     kosong) membekukan angka nol selama setengah menit — persis di jendela
     waktu ketika sesi pertama masuk dan orang membuka /health untuk melihatnya. */
  if (absenCache.nilai && absenCache.n === sesiHidup.size && kini - absenCache.pada < 30000) {
    return absenCache.nilai;
  }
  const hasil = { terbaca: 0, cocok: 0, yatim: 0, mati: 0, ada: false };
  try {
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'sessions');
    const berkas = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    hasil.ada = true;
    const perSesi = new Map();
    for (const f of berkas.slice(0, 500)) {
      try {
        const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!o || !o.sessionId) continue;
        hasil.terbaca++;
        perSesi.set(String(o.sessionId).slice(0, 12), o);
      } catch { /* berkas setengah tulis atau bukan JSON: dilewati */ }
    }
    for (const id of sesiHidup.keys()) {
      const o = perSesi.get(id);
      if (!o) { hasil.yatim++; continue; }
      hasil.cocok++;
      /* `process.kill(pid, 0)` tidak mengirim sinyal apa pun — ia cuma menanya
         "boleh saya kirim?", dan melempar ESRCH kalau prosesnya sudah tidak
         ada. Tidak ada proses yang terganggu karenanya. */
      try { process.kill(Number(o.pid), 0); } catch { hasil.mati++; }
    }
  } catch { /* foldernya tidak ada: bukan galat, cuma tidak bisa diukur */ }
  absenCache = { pada: kini, n: sesiHidup.size, nilai: hasil };
  return hasil;
}

function potretRuangan() {
  const kini = Date.now();
  const sesi = [];
  for (const [id, s] of sesiHidup) {
    if (kini - s.terakhir > SESI_HIDUP_SEPI_MS) {
      sesiHidup.delete(id); pesertaHidup.delete(id); continue;
    }
    const butuh = butuhManusia.get(id);
    const macet = macetSesi.get(id);
    /* Peserta yang masih tercatat untuk sesi ini. Sapuannya di sini, bukan di
       timer sendiri: satu-satunya yang boleh menumbuhkan peta ini adalah event
       masuk, dan satu-satunya yang membacanya adalah potret ini. */
    const petaP = pesertaHidup.get(id);
    const peserta = [];
    if (petaP) {
      for (const [agenId, p] of petaP) {
        if (kini - p.terakhir > SESI_HIDUP_SEPI_MS) { petaP.delete(agenId); continue; }
        peserta.push({
          agenId,
          agen: p.agen || '',
          sejak: p.sejak,
          terakhir: p.terakhir,
          tool: p.tool || '',
          toolN: p.toolN,
          gagal: p.gagal,
          diam: kini - p.terakhir > PESERTA_DIAM_MS,
        });
      }
      if (!petaP.size) pesertaHidup.delete(id);
    }
    peserta.sort((a, b) => b.terakhir - a.terakhir);
    sesi.push({
      sesi: id,
      nama: namaSesi.get(id) || '',
      jk: jkDari(namaSesi.get(id) || ''),
      peran: peranSesi.get(id) || '',
      model: modelSesi.get(id) || '',
      mode: s.mode || '',
      putar: s.putar || '',
      konteks: konteksSesi.get(id) || null,
      kuasa: kuasaDari(s.mode || ''),
      proyek: s.cwd || '',
      cabang: s.cabang || '',
      mesin: s.mesin || '',
      tool: s.tool || '',
      toolTs: s.toolTs || null,
      kind: s.kind || '',
      sejak: s.sejak,
      terakhir: s.terakhir,
      /* `sejak` ikut supaya yang bertanya lewat MCP tidak perlu lagi menebak
         lama tertahan dari `terakhir` — dua hal yang berbeda: sesi bisa terus
         mengirim event sambil tetap menunggu dijawab. */
      butuh: butuh ? { sebab: butuh.sebab, sejak: butuh.sejak || null } : null,
      macet: macet ? { jenis: macet.jenis, sejak: macet.sejak || null } : null,
      /* Field TAMBAHAN, bukan pengganti: konsumen lama (`orang()` di
         uji-pegawai.mjs, kartu pegawai, mcp-room) tidak berubah artinya. */
      peserta,
      delegasi: { hidup: peserta.length, diam: peserta.filter((p) => p.diam).length },
    });
  }
  sesi.sort((a, b) => b.terakhir - a.terakhir);
  return {
    ok: true,
    ts: kini,
    mesin: os.hostname(),
    sesi,
    tertahan: sesi.filter((s) => s.butuh || s.macet).length,
    delegasi: {
      hidup: sesi.reduce((n, s) => n + s.delegasi.hidup, 0),
      diam: sesi.reduce((n, s) => n + s.delegasi.diam, 0),
      induk: sesi.filter((s) => s.delegasi.hidup > 0).length,
    },
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

/* ————— rem SSE (backpressure) —————
   Dulu publish() menulis ke semua klien tanpa melihat nilai balik res.write():
   satu tab yang tertidur (laptop ditutup, tab di latar yang dibekukan peramban)
   membuat buffer socket-nya menggelembung tanpa batas di memori server, dan
   event `token` yang lahir tiap giliran asisten adalah penyumbang terbesar.
   Sekarang tiap klien punya keadaan sendiri. write() yang menjawab false
   belum berarti klien lambat — highWaterMark socket cuma 16 KB, dan satu
   cek transkrip bisa melahirkan ribuan event SINKRON (SUSUL_MAX 4 MB)
   sebelum siapa pun sempat drain. Jadi ada dua lapis: selama byte yang
   masih tertahan di stream (writableLength) di bawah SSE_BUFFER_MAKS, event
   tetap ditulis langsung; lewat itu masuk antrean (maks SSE_ANTRE_MAKS,
   buang-terlama, dihitung `dibuang`) yang dikuras saat 'drain'. Event
   `token` berurutan untuk sesi yang sama dilebur waktu antre — isinya angka
   KUMULATIF sesi, jadi yang terbaru sudah memuat semua delta sebelumnya
   (dihitung `dilebur`, bukan `dibuang`). Memori per klien dengan begitu
   terikat: ≤ SSE_BUFFER_MAKS + 200 event. Klien yang antreannya penuh lebih
   dari SSE_MACET_MS tanpa pernah drain diputus, satu baris log.
   `?tanpa=pikir,token` di /stream menyaring kind per klien di sini juga. */
const SSE_BUFFER_MAKS = 4 * 1024 * 1024;    // = SUSUL_MAX: satu burst transkrip masih muat tanpa antre
const SSE_ANTRE_MAKS = 200;
const SSE_MACET_MS = 30 * 1000;
const sseKeadaan = new Map();               // res -> { antre: [], dibuang, tersumbat, tersumbatSejak, tanpa:Set|null }
let sseDibuangTotal = 0;                    // sepanjang proses; ke /metrics & /health
let sseDileburTotal = 0;                    // event token yang digantikan yang lebih baru di antrean
let sseDiputus = 0;                         // klien lambat yang diputus paksa
let metrikEventTotal = 0;                   // event yang lewat publish() sejak proses hidup

const sseFrame = (ev) => `id: ${ev.id}\ndata: ${JSON.stringify(ev)}\n\n`;

function sseDaftar(res, tanpa) {
  clients.add(res);
  const k = { antre: [], dibuang: 0, tersumbat: false, tersumbatSejak: 0, tanpa: tanpa && tanpa.size ? tanpa : null };
  sseKeadaan.set(res, k);
  res.on('drain', () => sseKuras(res));
  return k;
}
function sseLepas(res) {
  clients.delete(res);
  sseKeadaan.delete(res);
}
function sseTulis(res, k, frame) {
  let ok = false;
  try { ok = res.write(frame); } catch { sseLepas(res); return false; }
  if (!ok) { k.tersumbat = true; if (!k.tersumbatSejak) k.tersumbatSejak = Date.now(); }
  return true;
}
// masih boleh ditulis langsung? antrean harus kosong dulu supaya urutan terjaga
const sseLonggar = (res, k) => k.antre.length === 0 && (!k.tersumbat || res.writableLength < SSE_BUFFER_MAKS);
function sseKuras(res) {
  const k = sseKeadaan.get(res);
  if (!k) return;
  k.tersumbat = false; k.tersumbatSejak = 0;
  while (k.antre.length && (!k.tersumbat || res.writableLength < SSE_BUFFER_MAKS)) {
    if (!sseTulis(res, k, sseFrame(k.antre.shift()))) return;
  }
}
function sseAntre(res, k, ev) {
  // token kumulatif per sesi: yang lama di antrean sudah usang, ganti saja
  if (ev.kind === 'token') {
    /* Kuncinya sesi + agen: tanpa agenId, token peserta dan token induk saling
       menimpa waktu antre, dan gejalanya cuma muncul pada klien lambat. */
    const i = k.antre.findIndex((e) => e.kind === 'token' && e.session === ev.session
      && (e.agenId || '') === (ev.agenId || ''));
    if (i >= 0) { k.antre[i] = ev; sseDileburTotal++; return; }
  }
  k.antre.push(ev);
  if (k.antre.length > SSE_ANTRE_MAKS) { k.antre.shift(); k.dibuang++; sseDibuangTotal++; }
  // penuh dan tidak pernah drain lebih dari SSE_MACET_MS: putus, jangan tunggu
  if (k.antre.length >= SSE_ANTRE_MAKS && k.tersumbatSejak && Date.now() - k.tersumbatSejak > SSE_MACET_MS) {
    ssePutus(res, k);
  }
}
function ssePutus(res, k) {
  sseDiputus++;
  console.warn('[agent-room] klien SSE lambat diputus: antrean penuh ' + Math.round((Date.now() - k.tersumbatSejak) / 1000)
    + ' detik tanpa drain, ' + k.dibuang + ' event dibuang');
  sseLepas(res);
  try { res.destroy(); } catch {}
}
/* Dipanggil dari detak 20 detik tiap klien: klien yang macet tidak dikirimi
   `: beat` (cuma menambah buffer), tapi diperiksa apakah sudah layak diputus. */
function sseDetak(res) {
  const k = sseKeadaan.get(res);
  if (!k) return;
  if (!k.tersumbat) { try { res.write(': beat\n\n'); } catch {} return; }
  if (k.antre.length >= SSE_ANTRE_MAKS && Date.now() - k.tersumbatSejak > SSE_MACET_MS) ssePutus(res, k);
}

function publish(ev) {
  ring.push(ev);
  if (ring.length > RING_SIZE) ring.shift();
  metrikEventTotal++;
  agendaCatat(ev);                          // buku agenda: metadata saja, lihat agendaBaris()
  let frame = null;                         // dibentuk sekali, hanya kalau ada yang menerimanya langsung
  for (const res of clients) {
    const k = sseKeadaan.get(res);
    if (!k) { sseLepas(res); continue; }
    if (k.tanpa && k.tanpa.has(ev.kind)) continue;
    if (!sseLonggar(res, k)) { sseAntre(res, k, ev); continue; }
    if (!frame) frame = sseFrame(ev);
    sseTulis(res, k, frame);
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
const TRANSKRIP_MAX = 40;                 // berkas yang dipantau bersamaan (induk + peserta)
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

/* Transkrip PESERTA RAPAT. Subagent menulis transkripnya sendiri, terpisah dari
 * berkas induk, di salah satu dari dua tempat — keduanya diperiksa ada di mesin
 * ini, bukan ditebak dari dokumentasi:
 *
 *   <dir transkrip>/<session_id penuh>/subagents/agent-<agent_id>.jsonl
 *   <dir transkrip>/<session_id penuh>/subagents/workflows/wf_<run>/agent-<agent_id>.jsonl
 *
 * `SubagentStart` TIDAK membawa jalurnya, jadi ia direkonstruksi. Yang kedua
 * butuh satu `readdir` karena nama folder run-nya tidak bisa ditebak.
 */
function jalurTranskripPeserta(raw, agenId) {
  const induk = jalurTranskrip(raw);
  const sesiPenuh = String(raw.session_id || '');
  if (!induk || !sesiPenuh || !agenId) return '';
  const akar = path.join(path.dirname(induk), sesiPenuh, 'subagents');
  const langsung = path.join(akar, 'agent-' + agenId + '.jsonl');
  try { fs.accessSync(langsung); return langsung; } catch { /* coba folder workflow */ }
  try {
    const wf = path.join(akar, 'workflows');
    for (const d of fs.readdirSync(wf)) {
      const p = path.join(wf, d, 'agent-' + agenId + '.jsonl');
      try { fs.accessSync(p); return p; } catch { /* bukan di run ini */ }
    }
  } catch { /* belum ada folder workflows */ }
  /* Belum lahir. Jalur langsung tetap dikembalikan: `pantauTranskrip()` memakai
     `fs.watchFile`, yang memang boleh dipasang pada berkas yang belum ada. */
  return langsung;
}

/* Token, bukan biaya. Transkrip TIDAK punya `costUSD` — cuma angka mentah
   dari respons API (`input_tokens`, `output_tokens`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`). Itu bedanya
   dengan `macetSesi`/biaya sesi: token ini RESMI, bukan perkiraan — angka apa
   adanya dari Anthropic, dijumlahkan di sini, tanpa tabel harga yang bisa
   basi. Menghitung dolarnya sendiri berarti memelihara tabel harga per model
   yang berubah tiap Anthropic mengubah harga — sengaja belum dilakukan. */
const tokenSesi = new Map();                // sesi 12-char -> { input, output, cacheTulis, cacheBaca }
const konteksSesi = new Map();              // sesi 12-char -> { pakai, jendela, rasio }
/* Jendela konteks yang diasumsikan. SENGAJA tidak ditebak dari nama model:
   `modelDari()` mendahulukan nama tampilan, yang berubah antar versi, jadi
   mencocokkan '1m' di sana adalah tebakan yang akan salah diam-diam.
   Urutannya: env yang disetel sadar, lalu PENGAMATAN — begitu sebuah sesi
   pernah terlihat memakai lebih dari jendela bawaan, jendelanya dinaikkan dan
   tidak pernah turun lagi sampai sesi itu berakhir. Data mengalahkan tebakan. */
const KONTEKS_BAWAAN = Number(process.env.AGENT_ROOM_KONTEKS) || 200000;
const KONTEKS_BESAR = 1000000;
function konteksPakai(sesi, d) {
  const pakai = d.input + d.cacheBaca + d.cacheTulis;
  const lalu = konteksSesi.get(sesi);
  let jendela = (lalu && lalu.jendela) || KONTEKS_BAWAAN;
  if (pakai > jendela && jendela < KONTEKS_BESAR) jendela = KONTEKS_BESAR;
  const rasio = jendela > 0 ? Math.min(1, Math.round((pakai / jendela) * 1000) / 1000) : 0;
  const k = { pakai, jendela, rasio };
  konteksSesi.set(sesi, k);
  return { konteks: pakai, jendela, rasio };
}

/* ------------------------------------------------------ riwayat token -----
   tokenSesi di atas cuma hidup di memori selama SATU sesi — restart server
   atau tutup halaman, angkanya hilang. Ini bedanya: tiap delta token ditulis
   ke disk (satu baris JSON per giliran asisten), jadi bisa dipantau lintas
   sesi dan lintas restart. Sengaja DELTA, bukan kumulatif, supaya bisa
   dijumlah ulang per hari/per proyek kapan saja tanpa menyimpan turunannya. */
/* ------------------------------------------------- versi skema berkas ----
   Tiga berkas di disk hidup lebih lama dari kode yang menulisnya: riwayat
   token, buku agenda, buku induk. Tiap baris/berkas baru membawa `v`, angka
   skema dari tabel ini; baris TANPA `v` adalah v0 (ditulis sebelum ada
   tabel ini) dan dimigrasi di memori lewat migrasi<Nama>() — hari ini
   identitas, cuma menambal `v`. Baris yang gagal parse, atau `v`-nya LEBIH
   BESAR dari yang dikenal proses ini (ditulis server yang lebih baru),
   ditolak: dihitung dan dilaporkan satu baris di konsol, tidak ditebak.

   Cara menaikkan versi, mis. token 1 -> 2:
     1. naikkan SKEMA.token,
     2. di migrasiToken() tambah cabang `if (v < 2) { ...ubah bentuk lama... }`
        — berurutan, supaya v0 pun melewati semua tahap,
     3. penulisnya (riwayatCatat/riwayatLebur) otomatis memakai angka baru.
   Berkas lama tidak pernah ditulis ulang hanya demi versi; migrasi hidup
   di memori sampai barisnya kebetulan ditulis ulang (pemadatan).           */
const SKEMA = { token: 1, agenda: 1, bukuInduk: 1, formasi: 1, nama: 3, suara: 1 };
const versiSkema = (o) => (Number.isFinite(Number(o.v)) ? Number(o.v) : 0);
function migrasiToken(o) { o.v = SKEMA.token; return o; }
function migrasiAgenda(o) { o.v = SKEMA.agenda; return o; }
function migrasiBukuInduk(o) { o.v = SKEMA.bukuInduk; return o; }
function migrasiFormasi(o) { o.v = SKEMA.formasi; return o; }
function migrasiNama(o) { o.v = SKEMA.nama; return o; }
function migrasiSuara(o) { o.v = SKEMA.suara; return o; }

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

/* Batas minggu buat arsip kliping mingguan (di bawah): kalender lokal, mulai
   SENIN, dikunci sebagai tanggal Senin-nya sendiri. Rolling 7 hari sengaja
   ditolak — metafora "satu sheet dijilid" butuh titik tutup yang jelas,
   rolling window tidak pernah "selesai". */
const mingguLokal = (ts) => {
  const d = new Date(ts);
  const dow = (d.getDay() + 6) % 7;             // Senin=0 ... Minggu=6
  d.setDate(d.getDate() - dow);
  return tanggalLokal(d.getTime());
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
  const hq = hp[nama] || (hp[nama] = { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 });
  hq.input += d.input; hq.output += d.output;
  hq.cacheTulis += d.cacheTulis; hq.cacheBaca += d.cacheBaca;   // dipakai /skp (token per proyek dalam rentang)
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
/* `peserta` sengaja argumen TERSENDIRI, bukan diselipkan ke dalam `d`: objek itu
   diteruskan apa adanya ke `riwayatTambah()` dan `paguPeriksa()`, dan disebar
   dengan `...d` waktu di-JSON. Menyelipkannya di sana akan menaruh field yang
   bukan angka token ke dalam agregat, dan pagu ikut menghitungnya. Di baris
   riwayat ia field OPSIONAL, jadi `SKEMA.token` tidak perlu naik. */
function riwayatCatat(ts, proyek, model, d, peserta = false) {
  if (!d.input && !d.output && !d.cacheTulis && !d.cacheBaca) return;
  riwayatTambah(ts, proyek, d);
  const baris = JSON.stringify({
    v: SKEMA.token, ts, proyek, model: model || undefined,
    ...(peserta ? { peserta: true } : {}), ...d,
  });
  fs.appendFile(BERKAS_RIWAYAT_TOKEN, baris + '\n', (err) => {
    if (err) console.warn('[agent-room] gagal menulis riwayat token: ' + err.message);
  });
  /* Pagu anggaran token dipasang di SINI, ujung jalur hidup — bukan di
     riwayatTambah(), yang juga dipanggil riwayatMuat() untuk SETIAP baris
     riwayat lama waktu start. Di sana, satu restart = ribuan nota basi. */
  paguPeriksa(ts, proyek || '', d);
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
    const o = { v: SKEMA.token, ts: kunciWaktu(grup[0].o.ts), proyek: grup[0].o.proyek || '',
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
  let asing = 0;                    // skema lebih baru dari yang dikenal proses ini
  for (const t of teks.split('\n')) {
    if (!t.trim()) continue;
    let o = null;
    try { o = JSON.parse(t); } catch {}
    if (!o || !Number.isFinite(o.ts)) { rusak.push(t); continue; }
    if (versiSkema(o) > SKEMA.token) { rusak.push(t); asing++; continue; }
    // v0 (tanpa `v`) dimigrasi di memori; teksnya ikut diperbarui supaya
    // pemadatan yang kebetulan menulis ulang berkas menghasilkan baris ber-`v`
    const lama = versiSkema(o) < SKEMA.token;
    if (lama) migrasiToken(o);
    o.input = Number(o.input) || 0; o.output = Number(o.output) || 0;
    o.cacheTulis = Number(o.cacheTulis) || 0; o.cacheBaca = Number(o.cacheBaca) || 0;
    riwayatTambah(o.ts, o.proyek || '', o);
    baris.push({ o, teks: lama ? JSON.stringify(o) : t });
  }
  if (baris.length) console.log('[agent-room] riwayat token dimuat: ' + baris.length + ' baris dari ' + BERKAS_RIWAYAT_TOKEN);
  // Dulu baris rusak dibuang diam-diam; sekarang dihitung supaya berkas yang
  // terpotong (mis. mati listrik di tengah append) ketahuan, bukan hilang senyap.
  // Satu baris untuk keduanya: yang rusak dan yang skemanya di luar jangkauan.
  if (rusak.length) console.warn('[agent-room] token-riwayat: ' + rusak.length + ' baris ditolak (skema v' + SKEMA.token
    + '; ' + (rusak.length - asing) + ' bukan JSON / tanpa ts' + (asing ? ', ' + asing + ' ber-v lebih baru' : '') + ')');

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

/* -------------------------------------------------- pagu anggaran token ---
   Tiap proyek (kunci = nama FOLDER, sama dengan riwayatProyek dan buku induk)
   boleh diberi pagu token per MINGGU KALENDER — Senin sampai Minggu, memakai
   mingguLokal() yang sudah dipakai arsip kliping. Begitu serapan minggu
   berjalan melewati ambang (bawaan 80% lalu 100%), server menerbitkan satu
   event kind:'pagu', persis pola kind:'promosi' dari buku induk: dideteksi di
   SINI, bukan di halaman, supaya satu kejadian = satu nota, sama di semua
   penonton.

   Tiga janji yang tidak boleh dilanggar:

   1. TANPA pagu.json, TIDAK ADA APA-APA. Tidak ada nota, tidak ada metrik,
      tidak ada berkas baru di disk, dan tidak satu baris konsol pun. Yang
      tidak memakai fitur ini tidak perlu tahu fitur ini ada.
   2. PAGU ITU ANGKA TOKEN, BUKAN UANG. Tidak ada tabel harga di sini dan
      tidak akan pernah ada: harga berubah, angka token dari API tidak.
   3. NOTA, BUKAN REM. Keadaan pagu tidak pernah dipakai untuk menahan
      pegawai, menahan antrean, atau mengubah state siapa pun. Serapan lewat
      pagu bukan alasan berhenti bekerja — cuma alasan memberi tahu.

   Anti-spamnya sengaja TANPA berkas keadaan baru: tanda "ambang ini sudah
   terbit" hidup di memori (paguDitandai), dan pemeriksaan hidup PERTAMA untuk
   sebuah proyek menandai DIAM semua ambang yang sudah terlewati sebelum delta
   yang sedang diproses. Itu yang membuat restart di tengah minggu tidak
   memuntahkan ulang nota lama, sementara delta yang baru saja melewati ambang
   tetap terbit. Harganya dibayar sadar: kalau pagu.json baru diisi waktu
   serapan sudah 90%, nota 80% memang tidak akan terbit minggu itu.

   AWAS, KATA "PAGU" DI BERKAS INI PUNYA DUA ARTI. Yang di blok ini ANGKA
   TOKEN. Yang di antrean disposisi (`t.pagu`, diteruskan ke CLI sebagai
   `--max-budget-usd`) itu pagu DOLAR, milik dunia lain, dan tidak boleh
   pernah disambung ke angka di sini. Kalau suatu hari keduanya perlu
   bertemu, yang berubah namanya — bukan satuannya.                         */
const BERKAS_PAGU = process.env.AGENT_ROOM_PAGU || path.join(__dirname, 'pagu.json');
const PAGU_V = 1;                        // bentuk pagu.json yang dikenal proses ini
const PAGU_AMBANG_BAWAAN = [80, 100];    // persen serapan yang menerbitkan nota
const PAGU_AMBANG_MAX = 4;               // lebih dari ini bukan peringatan lagi, tapi hujan nota
const PAGU_AMBANG_WAJIB = 100;           // "pagu terlampaui" — tidak pernah ikut dipotong
const PAGU_NAMA_MAX = 64;                // nama folder proyek terpanjang yang diterima jadi kunci
const PAGU_PROYEK_MAX = 200;             // kunci proyek yang dibaca dari berkas
const PAGU_TANDA_MAX = PAGU_PROYEK_MAX;  // proyek yang boleh ditandai (= diberi nota) per minggu
const PAGU_RINGKAS_MAX = 20;             // baris RINCIAN proyek di /token-riwayat & /metrics berlabel

let pagu = null;                    // null = FITUR MATI, dan itu bawaannya
let paguMinggu = '';                // Senin minggu yang tandanya sedang dipegang
const paguDitandai = new Map();     // nama folder -> Set ambang yang notanya sudah terbit minggu ini
let paguTandaPenuh = false;         // batas PAGU_TANDA_MAX sudah dikabarkan minggu ini

/* Dibaca SEKALI waktu start. Mengubah pagu.json tanpa restart tidak
   berpengaruh — sama seperti env lain di berkas ini. Sifat baca-sekali itu,
   dasar diam, kunci nama folder, dan aturan potong ambang sekarang juga
   tertulis di docs/01-jalanin.md → Pagu anggaran token; kalau salah satunya
   diubah di sini, halaman itu ikut diubah. pagu.json sudah masuk .gitignore
   (isinya nama folder proyek milik pemakai); yang ikut di repo cuma
   pagu.contoh.json. */
function paguMuat() {
  let mentah = null;                // null = berkasnya memang tidak ada
  try { mentah = fs.readFileSync(BERKAS_PAGU, 'utf8'); }
  catch (err) {
    // ENOENT itu keadaan normal, bukan kekurangan: diam total (janji 1).
    if (err.code !== 'ENOENT') {
      console.warn('[agent-room] pagu: ' + path.basename(BERKAS_PAGU) + ' tidak terbaca ('
        + err.code + ') — pagu token tidak aktif');
      pagu = null;
      return;
    }
  }

  let o = null;
  if (mentah === null) {
    // Jalan pintas tanpa berkas: satu angka di env, berlaku untuk semua proyek.
    const bawaanEnv = Number(process.env.AGENT_ROOM_PAGU_BAWAAN);
    if (!Number.isFinite(bawaanEnv) || bawaanEnv <= 0) { pagu = null; return; }
    o = { bawaan: bawaanEnv };
  } else {
    try { o = JSON.parse(mentah); } catch { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      console.warn('[agent-room] pagu: isi ' + path.basename(BERKAS_PAGU)
        + ' bukan objek JSON yang bisa dibaca — pagu token tidak aktif');
      pagu = null;
      return;
    }
    const v = Number(o.v);
    if (Number.isFinite(v) && v > PAGU_V) {
      console.warn('[agent-room] pagu: ' + path.basename(BERKAS_PAGU) + ' ber-v' + v
        + ', lebih baru dari yang dikenal proses ini (v' + PAGU_V + ') — pagu token tidak aktif');
      pagu = null;
      return;
    }
  }

  /* Ambang diurut naik lalu dipotong dari ujung BAWAH — TAPI 100 disisihkan
     dulu dan selalu dikembalikan. Memotong dari atas membuang 90 dan 100 di
     konfigurasi enam ambang; memotong dari bawah membuang 100 di konfigurasi
     [100,150,200,250,300]. Dua-duanya membuang hal yang sama: satu-satunya
     nota yang jadi alasan fitur ini ada ("pagu terlampaui", yang di halaman
     jadi kabar bercorak galat). Jadi bukan arah potongnya yang dibalik, tapi
     100-nya yang dikunci; sisanya baru dipotong dari yang terendah, dan yang
     dibuang tetap disebut namanya — peringatan yang mengecil diam-diam lebih
     buruk daripada tidak ada. */
  const ambangSemua = [...new Set((Array.isArray(o.ambang) ? o.ambang : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 1000))]
    .sort((a, b) => a - b);
  const adaWajib = ambangSemua.includes(PAGU_AMBANG_WAJIB);
  // jatah untuk ambang SELAIN 100; ditulis lewat Math.max supaya slice(-0)
  // — yang diam-diam berarti "ambil semuanya" — tidak pernah kejadian
  const jatahSisa = Math.max(0, PAGU_AMBANG_MAX - (adaWajib ? 1 : 0));
  const ambang = (jatahSisa
    ? ambangSemua.filter((n) => n !== PAGU_AMBANG_WAJIB).slice(-jatahSisa)
    : [])
    .concat(adaWajib ? [PAGU_AMBANG_WAJIB] : [])
    .sort((a, b) => a - b);
  const ambangBuang = ambangSemua.filter((n) => !ambang.includes(n));
  const bawaanAngka = Number(o.bawaan);
  const bawaan = Number.isFinite(bawaanAngka) && bawaanAngka > 0 ? bawaanAngka : 0;
  const proyek = new Map();
  const daftar = o.proyek && typeof o.proyek === 'object' && !Array.isArray(o.proyek) ? o.proyek : {};
  const namaPanjang = [];
  for (const [k, v] of Object.entries(daftar)) {
    if (proyek.size >= PAGU_PROYEK_MAX) break;
    /* Kunci dipakai APA ADANYA — bukan clip(). clip() menempelkan elipsis dan
       meratakan spasi ganda, jadi kunci hasilnya tidak akan pernah cocok
       dengan nama folder mana pun: entri mati yang tetap ikut dihitung dan
       tetap memakan satu baris ringkasan. Yang kepanjangan ditolak, dengan
       suara, supaya orangnya tahu pagunya memang tidak berlaku. */
    const nama = String(k);
    const angka = Number(v);
    if (nama.length > PAGU_NAMA_MAX) { namaPanjang.push(nama); continue; }
    if (!nama || !Number.isFinite(angka) || angka < 0) continue;   // 0 = sengaja dikecualikan
    proyek.set(nama, angka);
  }
  let berpagu = 0;
  for (const n of proyek.values()) if (n > 0) berpagu++;

  /* Berkasnya ada tapi tidak memberi pagu kepada siapa pun — bawaan 0 dan nol
     kunci berpagu. PERILAKUNYA sama dengan tidak ada berkas, tapi SUARANYA
     tidak boleh sama: satu salah ketik kunci ("projects" alih-alih "proyek")
     menghasilkan kantor yang dikira berpagu padahal tidak, tanpa satu pun
     tempat untuk mengetahuinya. Kalimat ini MENGGANTIKAN keluhan potongan di
     bawah, bukan menemaninya — mengabarkan ambang mana "yang dipakai" waktu
     tidak ada satu pun yang dipakai cuma menguatkan salah paham yang sama.
     Janji 1 tetap utuh: jalur tanpa berkas sudah pulang jauh di atas sini,
     dan `mentah === null` (jalan pintas env) dijaga di sini. */
  if (bawaan <= 0 && !berpagu) {
    if (mentah !== null) {
      console.warn('[agent-room] pagu: ' + path.basename(BERKAS_PAGU) + ' ada tapi tidak memberi'
        + ' pagu kepada proyek mana pun (bawaan 0, nol kunci berpagu) — pagu token tidak aktif');
    }
    pagu = null;
    return;
  }

  /* Baru di sini, sesudah pagunya dipastikan HIDUP: yang ditulis orang memang
     sebagian tidak dipakai, dan dia berhak tahu bagian mana. */
  if (ambangBuang.length) {
    console.warn('[agent-room] pagu: ' + ambangSemua.length + ' ambang, lebih dari batas '
      + PAGU_AMBANG_MAX + ' — yang terendah diabaikan'
      + (adaWajib ? ' (ambang ' + PAGU_AMBANG_WAJIB + '% selalu dipertahankan)' : '') + ': '
      + ambangBuang.join('%, ') + '%'
      + ' (yang dipakai: ' + ambang.join('%, ') + '%)');
  }
  if (namaPanjang.length) {
    console.warn('[agent-room] pagu: ' + namaPanjang.length + ' nama proyek terlalu panjang'
      + ' (batas ' + PAGU_NAMA_MAX + ' huruf) dan tidak dipagu: ' + clip(namaPanjang[0], 72)
      + (namaPanjang.length > 1 ? ' (dan ' + (namaPanjang.length - 1) + ' lagi)' : ''));
  }

  pagu = {
    ambang: ambang.length ? ambang : PAGU_AMBANG_BAWAAN.slice(),
    bawaan,
    berpagu,                          // kunci berpagu di berkas — TIDAK ikut bergerak tiap minggu
    hitung: o.hitung === 'semua' ? 'semua' : 'io',
    proyek,
  };
  console.log('[agent-room] pagu token aktif: ' + berpagu + ' proyek'
    + (bawaan > 0 ? ' (+ bawaan ' + bawaan + ')' : '')
    + ', ambang ' + pagu.ambang.join('%, ') + '% — mingguan mulai Senin, hitung ' + pagu.hitung);
}
paguMuat();

/* 0 berarti "tidak dipagu": proyek tanpa nama, proyek yang sengaja diisi 0,
   atau semua proyek kalau `bawaan` memang 0. */
const paguDari = (nama) => {
  if (!pagu || !nama || nama === '(tanpa proyek)') return 0;
  const n = pagu.proyek.get(nama);
  return Number.isFinite(n) ? n : pagu.bawaan;
};

/* Tujuh tanggal lokal dari minggu yang dikunci Senin-nya. */
function paguHariMinggu(minggu) {
  const keluar = [];
  const d = new Date(minggu + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return keluar;
  for (let i = 0; i < 7; i++) {
    const h = new Date(d.getTime());
    h.setDate(h.getDate() + i);                 // lewat setDate, jadi DST tidak menggeser tanggal
    keluar.push(tanggalLokal(h.getTime()));
  }
  return keluar;
}

/* TUJUH Map.get, titik. Fungsi ini jalan tiap giliran asisten yang membawa
   usage — belasan kali semenit kalau beberapa sesi hidup bersamaan — jadi
   biayanya tidak boleh tumbuh seumur riwayat. Menyusuri seluruh riwayatHarian
   (bisa ratusan hari) di jalur sepanas ini adalah cara paling gampang membuat
   fitur dekoratif memperlambat kantor. */
function paguSerapan(nama, minggu) {
  const semua = Boolean(pagu && pagu.hitung === 'semua');
  let jumlah = 0;
  for (const tgl of paguHariMinggu(minggu)) {
    const p = riwayatHarian.get(tgl)?.proyek?.[nama];
    if (!p) continue;
    jumlah += (p.input || 0) + (p.output || 0);
    if (semua) jumlah += (p.cacheTulis || 0) + (p.cacheBaca || 0);
  }
  return jumlah;
}

const paguDelta = (d) => (!d ? 0 : (d.input || 0) + (d.output || 0)
  + (pagu && pagu.hitung === 'semua' ? (d.cacheTulis || 0) + (d.cacheBaca || 0) : 0));

/* Minggu berjalan bergerak SATU ARAH, dan tidak pernah mundur ke minggu
   lampau. ts yang datang mundur — baris transkrip lama yang baru terbaca
   sesudah resume — tidak boleh mereset tandanya dan membuat semua nota minggu
   ini terbit dua kali. Lantainya minggu KALENDER berjalan, bukan sekadar nilai
   paguMinggu sebelumnya: waktu proses baru mulai nilainya masih kosong, dan
   dulu satu baris transkrip kemarin sudah cukup untuk mengunci seluruh laporan
   ke minggu lalu sampai ada giliran minggu ini. Yang boleh memundurkannya
   cuma satu: koreksi jam MESIN yang melewati batas minggu — lihat di dalam. */
function paguPastikanMinggu(ts) {
  const kini = mingguLokal(Date.now());
  const dari = mingguLokal(ts);
  /* Langit-langitnya minggu kalender BERJALAN. Tanpa ini pagarnya cuma satu
     arah: mundur ditolak, maju tidak dibatasi sama sekali — dan satu baris
     transkrip ber-stempel minggu depan (jam mesin yang cepat, transkrip yang
     dibawa dari mesin lain, resume sesudah koreksi NTP) mengunci paguMinggu
     ke minggu yang belum terjadi. Sesudah itu setiap giliran sungguhan jatuh
     ke pagar mundur dan pulang, serapan minggu yang belum terjadi selalu 0,
     dan seluruh nota mati diam-diam seumur hidup proses — sementara /metrics
     dan /token-riwayat (yang memakai Date.now() sendiri) tetap melaporkan
     200% dengan benar, jadi tidak ada satu pun gejala yang kelihatan.
     ts masa depan tetap masuk riwayat: itu urusan riwayatTambah, dan token
     yang jatuh di hari depan memang bukan serapan minggu ini. */
  /* Dan karena pagar mundur di bawah memakai paguMinggu sebagai LANTAI,
     lantainya sendiri harus masuk akal. paguMinggu cuma bisa berisi minggu
     yang belum terjadi kalau jam MESIN sendiri pernah berada di sana lalu
     dimundurkan: koreksi NTP sesudah jam RTC ngebut, snapshot mesin maya
     dipulihkan, tanggal mesin salah lalu dibetulkan orangnya. Tanpa buangan
     ini cacatnya persis yang di alinea atas, cuma terbalik arahnya — tiap
     giliran sungguhan jatuh ke pagar mundur dan pulang, dan seluruh nota mati
     diam-diam sampai jam mesin merangkak melewati minggu yang telanjur
     terkunci: bisa seminggu penuh, tanpa satu pun gejala.
     Tandanya ikut dibuang, dan itu memang benar: minggu yang dibuang itu
     tidak pernah terjadi, jadi tidak ada nota terbit yang perlu diingat.
     Satu baris konsol, sekali per koreksi (sesudahnya paguMinggu tidak lagi
     di masa depan, jadi cabang ini tidak terpicu lagi): jam mesin yang lompat
     mundur melewati batas minggu pantas kelihatan, bukan pantas ditebak
     orang dari nota yang tidak kunjung terbit. */
  if (paguMinggu && paguMinggu > kini) {
    console.warn('[agent-room] pagu: jam mesin mundur melewati batas minggu — tanda minggu '
      + paguMinggu + ' dibuang, minggu berjalan sekarang ' + kini
      + ' (nota minggu ini dihitung ulang dari nol)');
    paguMinggu = '';
    paguDitandai.clear();
    paguTandaPenuh = false;
  }
  const m = dari > kini ? kini : dari;
  if (m === paguMinggu) return;
  if (m < (paguMinggu || kini)) return;
  paguMinggu = m;
  paguDitandai.clear();
  paguTandaPenuh = false;
}

function paguPeriksa(ts, nama, d) {
  if (!pagu) return;
  const batas = paguDari(nama);
  if (batas <= 0) return;
  paguPastikanMinggu(ts);
  const pakai = paguSerapan(nama, paguMinggu);
  const persen = pakai / batas * 100;
  let tanda = paguDitandai.get(nama);
  if (!tanda) {
    /* Rem terakhir: satu `bawaan` yang keisi terlalu rendah berlaku untuk
       SETIAP nama folder yang lewat, dan tanpa batas ini ratusan proyek baru
       dalam satu minggu berubah jadi hujan nota — di kotak kabar, di buku
       agenda, dan di /stream sekaligus. Berkasnya sendiri sudah dibatasi
       PAGU_PROYEK_MAX; yang lewat `bawaan` sampai sekarang tidak. */
    if (paguDitandai.size >= PAGU_TANDA_MAX) {
      if (!paguTandaPenuh) {
        paguTandaPenuh = true;
        console.warn('[agent-room] pagu: batas ' + PAGU_TANDA_MAX + ' proyek ditandai untuk minggu '
          + paguMinggu + ' sudah kena — proyek berikutnya tidak diberi nota sampai minggu berganti');
      }
      return;
    }
    /* Pemeriksaan hidup pertama proyek ini (proses baru mulai, atau minggu
       baru berganti): ambang yang sudah terlewati SEBELUM delta ini ditandai
       diam — tidak ada nota yang terbit dari sini. Lihat catatan blok. */
    tanda = new Set();
    paguDitandai.set(nama, tanda);
    const sebelum = (pakai - paguDelta(d)) / batas * 100;
    for (const a of pagu.ambang) if (a <= sebelum) tanda.add(a);
  }
  for (const a of pagu.ambang) {
    if (persen < a || tanda.has(a)) continue;
    tanda.add(a);
    // session: '' — nota ini milik FOLDER, bukan sesi. Jangan sampai halaman
    // melahirkan pegawai hantu bernama sesi kosong gara-gara nota anggaran.
    publish({
      id: ++seq, ts, kind: 'pagu', session: '', cwd: nama, tool: null, ok: true,
      ambang: a, persen: Math.round(persen), pakai, pagu: batas, minggu: paguMinggu,
      label: 'serapan pagu ' + Math.round(persen) + '% — ' + nama,
    });
  }
}

/* Dibaca /token-riwayat dan /metrics. null saat fitur mati — halaman memakai
   itu apa adanya untuk memutuskan menggambar blok pagu atau tidak.

   `jumlah`/`lewat`/`maks` dihitung dari HIMPUNAN PENUH, dan `proyek` yang
   dipotong PAGU_RINGKAS_MAX cuma daftar rincian untuk tampilan. Pemotongan itu
   pernah ikut dipakai /metrics, dan hasilnya gauge alert yang jenuh di 20:
   angka peringatan yang mengecil sendiri lebih berbahaya daripada tidak ada
   angka sama sekali.

   Mingguannya SELALU minggu kalender berjalan, bukan `paguMinggu` — laporan
   ini memang tentang minggu ini, dan paguMinggu masih kosong sampai giliran
   pertama masuk.

   BIAYANYA, DENGAN ANGKA. Bentuk lamanya dua kali linear: himpunan namanya
   disusun dari 7 hari riwayat, lalu TIAP nama membayar 7 Map.get lagi lewat
   paguSerapan(). Diukur di kantor yang sudah lama hidup — 8.000 proyek dalam
   satu minggu, selisih terhadap proses yang sama tanpa pagu.json — blok ini
   menambahkan 49,8 ms ke TIAP scrape /metrics dan 73,9 ms ke tiap
   /token-riwayat, yaitu tiap scrape Prometheus dan tiap kali modal Statistik
   token dibuka. Setiap angka lain di blok ini dipagari (PAGU_PROYEK_MAX,
   PAGU_TANDA_MAX, PAGU_RINGKAS_MAX); himpunan ini satu-satunya yang tidak.

   Sikapnya: BUKAN dibatasi, tapi dihitung sekali. (a) satu lintasan atas 7
   hari menggantikan N x 7 lookup — jumlah semua proyek langsung terkumpul
   sambil berjalan, jadi himpunan penuhnya tetap utuh dan tidak ada gauge yang
   jenuh diam-diam; (b) hasilnya disimpan dengan kunci "minggu berjalan +
   jumlah token yang pernah tercatat". Kuncinya DATA, bukan waktu: riwayatCatat
   -> riwayatTambah selalu menambah riwayatTotal, jadi satu giliran masuk =
   kunci berubah = hitung ulang. Tidak ada jendela basi, sekecil apa pun —
   /token-riwayat sesudah satu giliran tetap segar, dan kasus 4/5/13/20 di
   uji-pagu.mjs memang menagih itu.

   Sesudahnya, di titik ukur yang sama: satu hitung penuh ~8 ms (dari ~74 ms),
   dan scrape berikutnya di antara giliran tenggelam di derau (selisihnya
   -0,4 ms). YANG TIDAK DITEBUS, dan itu memang disengaja: kantor yang sibuk
   tetap membayar satu hitung penuh per giliran kalau tiap giliran disusul
   scrape — pertumbuhannya masih linear terhadap jumlah proyek seminggu, cuma
   konstantanya sembilan kali lebih kecil dan tidak lagi dikalikan frekuensi
   scrape. Membatasi himpunannya akan mematikan pertumbuhan itu, tapi harganya
   gauge yang mengecil sendiri persis waktu keadaan paling buruk — dan itu
   sudah pernah dicoba sekali di sini (lihat alinea di atas). */
let paguCache = null;               // hasil paguRingkas() terakhir
let paguCacheKunci = '';            // minggu berjalan + jumlah token yang pernah tercatat
/* Berapa kali lintasan penuh di bawah benar-benar dijalankan sejak proses
   hidup. Dipasang di /metrics sebagai counter, dan itu bukan hiasan: satu-
   satunya cara MENAGIH cache ini dari luar. Ukuran waktu tidak bisa —
   selisih 3 ms dari 0 ms tenggelam di derau mesin yang ramai, dan uji yang
   tidak bisa merah bukan uji. Dengan counter ini "20 scrape tanpa giliran
   baru = tetap satu hitung penuh" jadi angka bulat yang deterministik.
   Sekalian berguna di kantor sungguhan: rate()-nya menunjukkan berapa mahal
   blok ini sebenarnya dibayar. */
let paguHitungPenuh = 0;

function paguRingkas() {
  if (!pagu) return null;
  const minggu = mingguLokal(Date.now());
  const kunci = minggu + '|' + (riwayatTotal.input + riwayatTotal.output
    + riwayatTotal.cacheTulis + riwayatTotal.cacheBaca);
  if (paguCache && paguCacheKunci === kunci) return paguCache;

  paguHitungPenuh++;
  const ikutCache = Boolean(pagu.hitung === 'semua');
  const pakaiPer = new Map();
  // proyek yang dipagu EKSPLISIT selalu ikut dilaporkan, walau nol serapan
  for (const [k, v] of pagu.proyek) if (v > 0) pakaiPer.set(k, 0);
  /* Satu lintasan: yang lewat `bawaan` ikut ketemu di sini juga, dan
     paguDari() yang memutuskan siapa yang berpagu — proyek tanpa nama dan
     yang sengaja diisi 0 tersaring di situ, sama seperti sebelumnya. */
  for (const tgl of paguHariMinggu(minggu)) {
    const h = riwayatHarian.get(tgl);
    if (!h || !h.proyek) continue;
    for (const k of Object.keys(h.proyek)) {
      if (!pakaiPer.has(k)) {
        if (paguDari(k) <= 0) continue;
        pakaiPer.set(k, 0);
      }
      const p = h.proyek[k];
      pakaiPer.set(k, pakaiPer.get(k) + (p.input || 0) + (p.output || 0)
        + (ikutCache ? (p.cacheTulis || 0) + (p.cacheBaca || 0) : 0));
    }
  }
  const semua = [];
  for (const [n, pakai] of pakaiPer) {
    const batas = paguDari(n);
    const rasio = batas > 0 ? pakai / batas : 0;
    semua.push({ nama: n, pagu: batas, pakai, persen: Math.round(rasio * 100), rasio });
  }
  let lewat = 0;
  let maks = 0;
  for (const p of semua) {
    if (p.rasio >= 1) lewat++;
    if (p.rasio > maks) maks = p.rasio;
  }
  const proyek = semua
    .sort((a, b) => b.rasio - a.rasio)
    .slice(0, PAGU_RINGKAS_MAX)
    .map(({ nama: n, pagu: batas, pakai, persen }) => ({ nama: n, pagu: batas, pakai, persen }));
  /* `jumlah` itu himpunan LAPORAN minggu berjalan; `berpagu`/`bawaan` itu
     KONFIGURASI, yang tidak ikut bergerak tiap Senin. Dua-duanya dibawa
     supaya halaman tidak perlu menebak.
     UTANG, dan sengaja ditulis di sini: halamannya BELUM memakainya. Modal
     Statistik masih menulis "N proyek berpagu" dari `jumlah` (public/room.js,
     cari string 'proyek berpagu'), jadi Senin pagi kalimat itu masih bisa
     berbunyi "0 proyek berpagu" padahal pagunya aktif lewat `bawaan`. Yang
     sudah tertutup di sini cuma sisi Prometheus. Sisi halaman menunggu
     giliran yang boleh menyentuh public/room.js. */
  paguCache = {
    minggu, ambang: pagu.ambang, hitung: pagu.hitung,
    berpagu: pagu.berpagu, bawaan: pagu.bawaan,
    jumlah: semua.length, lewat, maks, proyek,
  };
  paguCacheKunci = kunci;
  return paguCache;
}

/* -------------------------------------------------------- buku agenda ----
   Ring di atas cuma 400 event terakhir DI MEMORI: restart server, ruangan
   hari ini hilang; buka halaman jam empat sore, yang kelihatan cuma sisa
   setengah jam terakhir. Buku agenda ini catatan append-only yang bertahan:
   satu berkas per HARI (agenda/YYYY-MM-DD.jsonl), satu baris per event.

   Yang dicatat METADATA SAJA — tool apa, berkas mana, berhasil atau tidak,
   berapa lama. `pikir`/`ucap`/`token`/`nama` tidak pernah masuk, dan tidak ada
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
/* `nama` ikut ditolak — pengumuman, bukan kejadian. Tiap baris agenda sudah
   membawa field `nama` sendiri (lihat agendaBaris di bawah), jadi baris
   kind:'nama' tidak menambah satu pun keterangan waktu diputar ulang: cuma
   satu baris ekstra per pelantikan kursi dan per ganti nama, selamanya, di
   berkas yang umurnya 30 hari. Blok formasi pegawai tetap memang menyiarkan
   pengumuman itu ke penonton yang sedang menonton (SSE + ring), tapi
   sengaja tidak menitipkannya ke disk.                                    */
const AGENDA_KIND_TOLAK = new Set(['pikir', 'ucap', 'token', 'nama']);
const AGENDA_TANGGAL_RX = /^\d{4}-\d{2}-\d{2}$/;
let agendaGalatTerakhir = 0;        // peringatan tulis dibatasi 1x/menit, bukan tiap event

const agendaBerkas = (tanggal) => path.join(AGENDA_DIR, tanggal + '.jsonl');

/* Daftar putih, bukan daftar hitam: field baru yang suatu hari ditambah ke
   event tidak otomatis bocor ke disk. */
function agendaBaris(ev) {
  if (!ev || AGENDA_KIND_TOLAK.has(ev.kind)) return null;
  const b = { v: SKEMA.agenda, id: ev.id, ts: ev.ts, kind: ev.kind, session: ev.session };
  if (ev.cwd) b.cwd = ev.cwd;
  if (ev.cabang) b.cabang = ev.cabang;
  if (ev.tool) b.tool = ev.tool;
  if (!ISI_MATI && ev.label) b.label = clip(ev.label, AGENDA_LABEL_MAX);
  b.ok = ev.ok !== false;
  if (ev.galat) b.galat = clip(ev.galat, AGENDA_LABEL_MAX);
  if (ev.interupsi) b.interupsi = true;
  if (ev.alasan) b.alasan = clip(ev.alasan, AGENDA_LABEL_MAX);
  if (Number.isFinite(ev.durasi)) b.durasi = ev.durasi;
  if (ev.lambat) b.lambat = true;                         // tool MCP > 8 detik
  if (ev.tunda) b.tunda = true;                           // diserap dari kotak surat hook offline
  if (ev.model) b.model = ev.model;
  // enum dua nilai, bukan isi kerja — aman ikut ke disk seperti sebab tertahan
  if (ev.putar) b.putar = ev.putar;
  /* Jejak keputusan paraf. Semuanya enum atau angka — TIDAK ada isi
     perintahnya. `risiko.tanda` sengaja cuma nama pola (lihat telaah.mjs),
     jadi ia sekelas `sebab` yang sudah lama ikut ke disk. */
  if (ev.keputusan) b.keputusan = ev.keputusan;
  if (ev.sumber) b.sumber = clip(ev.sumber, 24);
  if (Number.isFinite(ev.tunggu)) b.tunggu = ev.tunggu;
  if (ev.risiko && ev.risiko.tingkat) {
    b.risiko = ev.risiko.tingkat;
    if (Array.isArray(ev.risiko.tanda) && ev.risiko.tanda.length) b.tanda = ev.risiko.tanda.slice(0, 4).join(',');
  }
  if (ev.nama) b.nama = ev.nama;
  if (ev.peran) b.peran = ev.peran;
  if (ev.mesin) b.mesin = ev.mesin;
  if (ev.jenis) b.jenis = ev.jenis;
  if (ev.agen) b.agen = ev.agen;
  if (ev.agenId) b.agenId = ev.agenId;
  if (ev.panggilan) b.panggilan = ev.panggilan;
  if (ev.golongan) b.golongan = ev.golongan;              // kind:'promosi' (buku induk)
  // kind:'pagu' — angka dan nama folder saja, tidak ada isi kerja; ini yang
  // membuat /stream?ulang=YYYY-MM-DD bisa memutar notanya lagi utuh
  if (ev.kind === 'pagu') {
    b.ambang = ev.ambang;
    b.persen = ev.persen;
    b.pakai = ev.pakai;
    b.pagu = ev.pagu;
    b.minggu = ev.minggu;
  }
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
function agendaBacaHari(tanggal, tolak) {
  let teks = '';
  try { teks = fs.readFileSync(agendaBerkas(tanggal), 'utf8'); } catch { return []; }
  const keluar = [];
  for (const t of teks.split('\n')) {
    if (!t.trim()) continue;
    let o = null;
    try { o = JSON.parse(t); } catch { /* baris terpotong */ }
    if (!o || !Number.isFinite(o.ts) || !o.kind) { if (tolak) tolak.rusak++; continue; }
    if (versiSkema(o) > SKEMA.agenda) { if (tolak) tolak.asing++; continue; }
    if (versiSkema(o) < SKEMA.agenda) migrasiAgenda(o);
    if (AGENDA_KIND_TOLAK.has(o.kind)) continue;
    if (ISI_MATI) { delete o.label; if (o.butuh) delete o.butuh.label; if (o.macet) delete o.macet.label; }
    keluar.push(o);
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
  const tolak = { rusak: 0, asing: 0 };
  const hariIni = agendaBacaHari(tanggalLokal(Date.now()), tolak).slice(-RING_SIZE);
  for (const o of hariIni) {
    ring.push(o);
    if (Number.isFinite(o.id) && o.id > seq) seq = o.id;
  }
  if (tolak.rusak || tolak.asing) {
    console.warn('[agent-room] buku agenda: ' + (tolak.rusak + tolak.asing) + ' baris ditolak (skema v' + SKEMA.agenda
      + '; ' + tolak.rusak + ' rusak' + (tolak.asing ? ', ' + tolak.asing + ' ber-v lebih baru' : '') + ')');
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

/* ---------------------------------------------------- kliping mingguan ---
   Map arsip yang makin tebal tiap minggu: server merangkum sendiri tiap
   minggu (sesi aktif, tool teratas, proyek teratas, event ambient terjarang)
   jadi satu "sheet" yang dijilid ke arsip permanen. Dua berkas, dua peran
   berbeda — bukan satu dipaksa dua fungsi:
   - kliping-mingguan.jsonl: append-only, satu baris = satu minggu yang SUDAH
     FINAL (agregat akhir, bukan delta — beda dari token-riwayat di atas,
     karena granularitas per-tool-call di sini cuma akan menggandakan volume
     tulis untuk fitur yang murni dekoratif)
   - kliping-berjalan.json: checkpoint minggu YANG MASIH BERJALAN, ditimpa di
     tempat, supaya hitungan minggu ini tidak hilang tiap restart server     */
const BERKAS_KLIPING = process.env.AGENT_ROOM_KLIPING_LOG
  || path.join(__dirname, 'kliping-mingguan.jsonl');
const BERKAS_KLIPING_BERJALAN = path.join(path.dirname(BERKAS_KLIPING), 'kliping-berjalan.json');
const arsipMingguan = [];            // minggu yang sudah final, kronologis naik
let mingguAktif = null;              // { minggu, sesi:{}, tool:{}, proyek:{}, ambien:{} }
let klipingCheckpointTimer = null;

const klipingKosong = (minggu) => ({ minggu, sesi: {}, tool: {}, proyek: {}, ambien: {} });

function klipingTambah1(peta, kunci) {
  if (!kunci) return;
  peta[kunci] = (peta[kunci] || 0) + 1;
}

const klipingTeratas = (peta) => {
  let nama = null, jumlah = 0;
  for (const [k, v] of Object.entries(peta)) if (v > jumlah) { nama = k; jumlah = v; }
  return nama ? { nama, jumlah } : null;
};

/* Rarity dihitung EMPIRIS per-minggu (hitungan paling kecil minggu itu yang
   menang), bukan dari label rarity statis di katalog event — "minggu ini XYZ
   cuma sekali" itu cerita yang lebih hidup daripada label langka bawaan. */
const klipingTerjarang = (peta) => {
  let id = null, jumlah = Infinity;
  for (const [k, v] of Object.entries(peta)) if (v < jumlah) { id = k; jumlah = v; }
  return id ? { id, jumlah } : null;
};

/* Bentuk yang dikirim ke halaman: sesi jadi ANGKA (bukan daftar id — begitu
   minggu final, daftar id-nya tidak berguna lagi), plus tiga field turunan
   supaya halaman tidak perlu menghitung ulang tiap modal dibuka. */
function klipingRingkas(m) {
  if (!m) return null;
  return {
    minggu: m.minggu, sesi: Object.keys(m.sesi).length,
    tool: m.tool, proyek: m.proyek, ambien: m.ambien,
    toolTeratas: klipingTeratas(m.tool),
    proyekTeratas: klipingTeratas(m.proyek),
    ambienTerjarang: klipingTerjarang(m.ambien),
  };
}

function klipingTulisCheckpoint() {
  if (!mingguAktif) return;
  fs.writeFile(BERKAS_KLIPING_BERJALAN, JSON.stringify(mingguAktif), (err) => {
    if (err) console.warn('[agent-room] gagal menulis checkpoint kliping: ' + err.message);
  });
}

// Debounced ~20 detik — dipanggil tiap tool call/event ambient, tidak boleh
// menulis disk sesering itu. Rollover minggu (di bawah) TIDAK lewat jalur ini
// — itu menulis segera, lihat alasannya di klipingPastikanMinggu.
function klipingJadwalkanCheckpoint() {
  clearTimeout(klipingCheckpointTimer);
  klipingCheckpointTimer = setTimeout(klipingTulisCheckpoint, 20000);
  klipingCheckpointTimer.unref?.();
}

/* Dipanggil dari tiap titik yang mencatat (tool/ambien) plus penjaga berkala
   di bawah. Kalau minggu berjalan sudah beda dari minggu ts ini: minggu lama
   dijilid jadi baris final di kliping-mingguan.jsonl, minggu baru dimulai. */
function klipingPastikanMinggu(ts) {
  const minggu = mingguLokal(ts);
  if (mingguAktif && mingguAktif.minggu === minggu) return;
  if (mingguAktif) {
    const m = mingguAktif;
    arsipMingguan.push(klipingRingkas(m));
    const baris = JSON.stringify({
      minggu: m.minggu, sesi: Object.keys(m.sesi).length, tool: m.tool, proyek: m.proyek, ambien: m.ambien,
    });
    fs.appendFile(BERKAS_KLIPING, baris + '\n', (err) => {
      if (err) console.warn('[agent-room] gagal menulis kliping mingguan: ' + err.message);
    });
  }
  mingguAktif = klipingKosong(minggu);
  // Checkpoint minggu BARU ditulis SEGERA, bukan debounced: kalau server crash
  // tepat di celah ini, checkpoint lama di disk masih menunjuk minggu yang
  // barusan difinalkan — restart berikutnya akan memfinalkannya LAGI (baris
  // dobel di .jsonl). Menulis langsung menutup celah itu.
  klipingTulisCheckpoint();
}

function klipingCatatTool(ts, sesi, tool, cwd) {
  klipingPastikanMinggu(ts);
  mingguAktif.sesi[sesi] = true;
  klipingTambah1(mingguAktif.tool, tool);
  if (cwd) klipingTambah1(mingguAktif.proyek, cwd);
  klipingJadwalkanCheckpoint();
}

function klipingCatatAmbien(ts, id) {
  klipingPastikanMinggu(ts);
  klipingTambah1(mingguAktif.ambien, id);
  klipingJadwalkanCheckpoint();
}

function klipingMuat() {
  let teks = '';
  try { teks = fs.readFileSync(BERKAS_KLIPING, 'utf8'); } catch { /* belum ada: wajar */ }
  let baik = 0;
  for (const baris of teks.split('\n')) {
    if (!baris) continue;
    let o;
    try { o = JSON.parse(baris); } catch { continue; }
    if (!o || !o.minggu) continue;
    const tool = o.tool || {}, proyek = o.proyek || {}, ambien = o.ambien || {};
    arsipMingguan.push({
      minggu: o.minggu, sesi: Number(o.sesi) || 0, tool, proyek, ambien,
      toolTeratas: klipingTeratas(tool), proyekTeratas: klipingTeratas(proyek),
      ambienTerjarang: klipingTerjarang(ambien),
    });
    baik++;
  }
  arsipMingguan.sort((a, b) => (a.minggu < b.minggu ? -1 : 1));

  let checkpoint = null;
  try { checkpoint = JSON.parse(fs.readFileSync(BERKAS_KLIPING_BERJALAN, 'utf8')); } catch { /* belum ada: wajar */ }
  const mingguSekarang = mingguLokal(Date.now());
  if (checkpoint && checkpoint.minggu === mingguSekarang) {
    mingguAktif = checkpoint;
  } else if (checkpoint) {
    // Minggu checkpoint sudah lewat SEPENUHNYA selagi server mati (mis. mati
    // pas pergantian Minggu->Senin) — difinalkan sekarang juga saat startup,
    // bukan didiamkan sampai tercatat sebagai kekosongan yang salah.
    arsipMingguan.push(klipingRingkas(checkpoint));
    const b = JSON.stringify({
      minggu: checkpoint.minggu, sesi: Object.keys(checkpoint.sesi).length,
      tool: checkpoint.tool, proyek: checkpoint.proyek, ambien: checkpoint.ambien,
    });
    fs.appendFile(BERKAS_KLIPING, b + '\n', () => {});
    mingguAktif = klipingKosong(mingguSekarang);
  } else {
    mingguAktif = klipingKosong(mingguSekarang);
  }
  klipingTulisCheckpoint();
  if (baik) console.log('[agent-room] kliping mingguan dimuat: ' + baik + ' minggu dari ' + BERKAS_KLIPING);
}
klipingMuat();
// Penjaga rollover berkala: mendeteksi lewat traffic asli (klipingPastikanMinggu
// dipanggil dari klipingCatatTool/klipingCatatAmbien) sudah cukup untuk ruangan
// yang aktif, tapi ruangan yang idle pas pergantian Minggu->Senin butuh ini
// supaya minggu tetap terfile tepat waktu.
setInterval(() => klipingPastikanMinggu(Date.now()), 15 * 60 * 1000).unref?.();

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

const BUKU_INDUK_MCP_MAX = 20;              // server MCP per proyek, sisanya dilebur ke '(lain)'
const bukuInduk = { v: SKEMA.bukuInduk, proyek: {} };
const bukuIndukSesi = new Map();            // proyek -> Set sesi 12-char yang sudah dihitung di proses ini
let bukuIndukTimer = null;
let bukuIndukKotor = false;

const bukuIndukKosong = () => ({
  sesi: 0, toolCall: 0, gagal: 0, jamDinas: 0, fanOut: 0,
  pertama: 0, terakhir: 0, cabang: {}, tool: {}, mcp: {}, golongan: GOLONGAN[0].nama,
});

/* Tabel tool dibatasi 40 kunci: proyek yang memakai puluhan tool MCP tidak
   boleh menggemukkan berkas. Yang tersingkir dilebur ke '(lain)', jadi total
   hitungannya tetap sama dengan toolCall. */
function bukuIndukPangkasTool(tool, maks = BUKU_INDUK_TOOL_MAX) {
  const kunci = Object.keys(tool).filter((k) => k !== '(lain)');
  if (kunci.length <= maks) return;
  kunci.sort((a, b) => tool[b] - tool[a]);
  for (const k of kunci.slice(maks)) {
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
    // agregat per SERVER MCP (bukan per tool-nya): 20 kunci, sisanya '(lain)'
    if (ev.mcpServer) {
      p.mcp[ev.mcpServer] = (p.mcp[ev.mcpServer] || 0) + 1;
      bukuIndukPangkasTool(p.mcp, BUKU_INDUK_MCP_MAX);
    }
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
  if (!o || typeof o !== 'object' || !o.proyek || typeof o.proyek !== 'object') {
    console.warn('[agent-room] buku induk: 1 berkas ditolak (skema v' + SKEMA.bukuInduk + '; bentuk tidak dikenal)');
    return;
  }
  if (versiSkema(o) > SKEMA.bukuInduk) {
    console.warn('[agent-room] buku induk: 1 berkas ditolak (skema v' + SKEMA.bukuInduk + '; berkas ber-v' + versiSkema(o) + ' lebih baru)');
    return;
  }
  if (versiSkema(o) < SKEMA.bukuInduk) migrasiBukuInduk(o);
  let n = 0;
  for (const [nama, r] of Object.entries(o.proyek)) {
    if (!r || typeof r !== 'object' || !nama) continue;
    const p = bukuIndukKosong();
    for (const k of ['sesi', 'toolCall', 'gagal', 'jamDinas', 'fanOut', 'pertama', 'terakhir']) {
      p[k] = Math.max(0, Number(r[k]) || 0);
    }
    for (const k of ['cabang', 'tool', 'mcp']) {
      if (r[k] && typeof r[k] === 'object') {
        for (const [nm, v] of Object.entries(r[k])) if (nm && Number(v) > 0) p[k][clip(nm, 64)] = Number(v);
      }
    }
    bukuIndukPangkasTool(p.tool);
    bukuIndukPangkasTool(p.mcp, BUKU_INDUK_MCP_MAX);
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

/* ------------------------------------------------ formasi pegawai tetap ---
   Buku induk di atas mencatat KARIER sebuah folder; blok ini mencatat
   ORANGNYA. Tiap folder proyek punya beberapa KURSI formasi — pegawai tetap
   #1, #2, … — dan sesi yang datang dipinjami kursi kosong bernomor terkecil.
   Nama panggilan dan jabatan menempel pada KURSI, bukan pada sesi: sesi hari
   ini yang bekerja di folder yang sama dipanggil dengan nama yang sama
   seperti kemarin, tanpa siapa pun mengetik ulang. Kursinya dilepas waktu
   sesinya pamit, jadi besok pagi orang pertama yang masuk kembali ke #1.

   KUNCI IDENTITASNYA PROYEK SAJA — ev.cwd, yang sudah berupa nama folder
   (baseName), kunci yang sama persis dengan buku induk — BUKAN proyek+cabang.
   Dua alasannya:
   - satu sesi bisa `git checkout` di tengah kerja. Kalau cabang ikut jadi
     kunci, orangnya berganti nama di tengah jalan dan satu pegawai pecah jadi
     banyak orang yang sebetulnya sama.
   - `git worktree` sudah otomatis jadi FOLDER lain, jadi cabang yang memang
     perlu dibedakan sudah terpisah dengan sendirinya.
   Cabang tetap dicatat di kursi sebagai `cabangTerakhir`: itu KETERANGAN —
   dari mana dia terakhir bertugas — bukan bagian dari identitas.

   KENAPA BERKAS SENDIRI, bukan menumpang di buku-induk.json: menumpang berarti
   menaikkan SKEMA.bukuInduk 1 -> 2, dan server versi LAMA yang membaca berkas
   v2 akan menolak SELURUH berkas lalu menimpanya — seluruh jam dinas dan
   golongan hilang cuma gara-gara fitur nama. Dengan berkas terpisah, turun
   versi tidak merugikan apa pun: yang lama paling banter kehilangan nama,
   kariernya utuh.

   Aturan 5 (privasi) dijaga dari sini: yang ditulis ke disk cuma nama
   panggilan, id jabatan, cap waktu, nama folder, dan nama cabang/mesin. Id
   sesi TIDAK PERNAH ikut — `penghuni` hidup di memori saja dan sengaja
   ditanggalkan waktu berkasnya ditulis (lihat formasiIsi()).

   SAKLAR MATI: AGENT_ROOM_PEGAWAI_TETAP=off mematikan seluruh blok ini —
   tidak ada kursi yang dilantik, formasi.json tidak dibaca dan tidak pernah
   ditulis, dan sesi terminal kembali tanpa nama panggilan persis seperti
   sebelum fitur ini ada. Pemasangan lama yang tidak meminta apa-apa berhak
   mendapatkan perilakunya kembali dengan satu env, bukan dengan menunggu
   tambalan.                                                                */
const PEGAWAI_MATI = String(process.env.AGENT_ROOM_PEGAWAI_TETAP || '').trim().toLowerCase() === 'off';
const BERKAS_FORMASI = process.env.AGENT_ROOM_FORMASI || path.join(__dirname, 'formasi.json');
const FORMASI_MAKS = 12;                    // sesi ke-13 yang bersamaan jalan tanpa nama tetap, persis perilaku lama
/* Berapa banyak FOLDER yang boleh punya formasi. Tanpa batas ini tiap folder
   yang pernah dipakai sekali menetap selamanya — 300 folder sekali pakai =
   300 entri permanen — padahal semua dimensi lain di berkas ini dibatasi.
   Yang dibuang waktu penuh: yang `terakhir`-nya paling tua (dan tidak sedang
   dihuni), bukan yang paling lama dibuat, supaya folder yang benar-benar
   dipakai tidak pernah kehilangan orangnya. Sengaja BUKAN kedaluwarsa per
   hari: folder yang baru ditengok lagi setahun kemudian tetap berhak atas
   pegawai yang sama — itu inti fiturnya.                                   */
const FORMASI_PROYEK_MAKS = 64;
const PEGAWAI_SEPI_MS = 30 * 60 * 1000;     // penghuni sediam ini dianggap sudah pulang tanpa pamit
/* Hanya hook yang benar-benar menandakan orang sedang bekerja yang boleh
   melantik pegawai. `notify`, `compact`, `subagent-*` dan kawan-kawannya
   sengaja di luar daftar. Event ambient tidak ada di sini sama sekali —
   /ambien memang tidak pernah lewat terimaEvent(), dan Aturan 2 melarangnya
   menyentuh apa pun yang berhubungan dengan sesi.

   'session-end' juga TIDAK di sini, walau dia hook nyata: yang pamit tidak
   perlu kursi. Sesi yang event PERTAMANYA kebetulan SessionEnd — gampang
   kejadian, tiap server direstart selagi ada terminal terbuka, dan kotak
   surat tunda memperbanyaknya — akan direkrut jadi pegawai hantu: kursi dan
   entri proyek permanen lahir untuk orang yang justru sedang pulang, `sejak`
   kursinya jadi jam KEPERGIAN, dan halaman menerima pengumuman pegawai baru
   untuk sprite yang detik itu juga hilang. Sesi yang sudah punya kursi tetap
   pamit dengan namanya: namanya sudah menempel di namaSesi, dan
   pegawaiLepas() baru dipanggil SESUDAH event pamitnya disiarkan.          */
const PEGAWAI_KIND = new Set(['pre', 'post', 'stop', 'session-start', 'prompt']);

/* Daftar nama bergaya pegawai dinas — nama UTUH, bukan dua daftar yang
   dipasang-pasangkan. Ini cuma BAWAAN: begitu kamu menyimpan daftarmu sendiri
   lewat panel ⚙️ (jatuh ke nama.json), daftar itu yang dipakai — lihat
   daftarNama(). Daftar bawaan tidak pernah dibuang, dia jaring pengaman kalau
   nama.json hilang, kosong, atau rusak.

   Undiannya deterministik (lihat pegawaiUndi), jadi URUTAN daftar ikut
   menentukan siapa yang lahir di kursi mana: menyisipkan nama di TENGAH akan
   mengganti nama pegawai yang BELUM tersimpan di formasi.json. Yang sudah
   tersimpan tidak ikut berubah — namanya menempel di kursi. Kalau daftarnya
   mau diperpanjang, sambung di ujung.

   Aksesori kepala di halaman mengikuti JABATAN, bukan nama, jadi kesan gender
   pada nama bukan janji gambar. */
const NAMA_BAWAAN = [
  'Budi Santoso', 'Sri Rahayu', 'Bambang Nugroho', 'Dewi Handayani',
  'Agus Wijaya', 'Siti Kusuma', 'Joko Prasetyo', 'Rina Lestari',
  'Hendra Hartono', 'Ratna Puspita', 'Slamet Setiawan', 'Endang Mulyani',
  'Bayu Wibowo', 'Wulan Anggraini', 'Darmanto Suryana', 'Tuti Saputra',
  'Eko Santoso', 'Yanti Rahayu', 'Rudi Nugroho', 'Maryati Handayani',
  'Suparman Wijaya', 'Nunung Kusuma', 'Wahyu Prasetyo', 'Titik Lestari',
  'Joko Hartono', 'Ratna Setiawan', 'Agus Mulyani', 'Dewi Wibowo',
  'Bambang Anggraini', 'Sri Suryana', 'Budi Saputra', 'Siti Puspita',
];

/* Daftar nama pilihanmu, disimpan server (bukan localStorage) supaya sama di
   semua tab dan bertahan sesudah server mati. Kosong = pakai NAMA_BAWAAN.

   Satu entri = { nama, peran }. `peran` boleh kosong; kalau diisi, dia ikut
   menempel ke orangnya, bukan ke kursinya — itu bedanya dengan slot.peran di
   formasi. Bawaan sengaja TIDAK berjabatan: nama karangan tidak punya jabatan
   sungguhan, dan menebaknya cuma bikin sprite berseragam asal-asalan. */
const BERKAS_NAMA = process.env.AGENT_ROOM_NAMA || path.join(__dirname, 'nama.json');
const namaDaftar = { v: SKEMA.nama, penugasan: '', penuh: [], jk: Object.create(null) };
const BAWAAN_ENTRI = NAMA_BAWAAN.map((n) => ({ nama: n, peran: '' }));

const NAMA_MAKS = 512;                      // batas atas daftar; jauh di atas kebutuhan
const daftarNama = () => (namaDaftar.penuh.length ? namaDaftar.penuh : BAWAAN_ENTRI);

/* ------------------------------------------------------- jenis kelamin ---
   Sebelum ini aksesori kepala murni ikut JABATAN: auditor, arsiparis, dan
   humas selalu berjilbab, sandiman dan kadis berpeci, pranata madya berkumis.
   Akibatnya "Budi Santoso" yang kebagian kursi auditor tetap digambar
   berjilbab, dan "Sri Rahayu" yang jadi pranata madya tetap berkumis. Nama
   pegawai di kantor dinas jelas gendernya, jadi gambarnya sekarang ikut.

   Dua lapis, sengaja:
   - TEBAKAN dari nama depan. Ini yang bikin 32 nama bawaan langsung benar
     tanpa siapa pun perlu mengatur apa-apa.
   - TIMPAAN manual per nama (namaDaftar.jk), untuk nama yang tidak tertebak
     atau tertebak salah. Ditulis dari dua tempat — kolom ketiga di panel
     daftar nama dan tombol di kartu pegawai — tapi disimpan di SATU peta
     supaya tidak ada dua sumber kebenaran yang bisa berselisih.

   Yang tidak tertebak dan tidak ditimpa menghasilkan '' — dan '' berarti
   "biarkan seperti dulu", yaitu ikut jabatan. Jadi tamu event, sprite lama,
   dan nama asing tidak pernah berubah rupa gara-gara fitur ini.

   Daftarnya nama DEPAN, bukan nama keluarga: marga Indonesia (Santoso,
   Wijaya, Lestari) tidak menandai gender, jadi ikut menebaknya cuma menambah
   salah. Yang ambigu (Dian, Dwi, Tri, Nur, Ade) sengaja TIDAK dimasukkan —
   lebih baik jatuh ke '' daripada menebak salah setengah waktu. */
const JK_DEPAN_L = new Set([
  'adi', 'agus', 'ahmad', 'aji', 'andi', 'anton', 'arif', 'asep', 'bagus',
  'bambang', 'bayu', 'budi', 'cahyo', 'dadang', 'dani', 'darmanto', 'dedi',
  'deni', 'didik', 'dimas', 'doni', 'eko', 'endro', 'fajar', 'gunawan',
  'hadi', 'hamzah', 'hari', 'hendra', 'hendro', 'heru', 'ilham', 'imam',
  'indra', 'irfan', 'iwan', 'joko', 'lukman', 'mahmud', 'malik', 'muhammad',
  'mulyono', 'nanang', 'panji', 'priyo', 'purnomo', 'rahmat', 'ramadhan',
  'randi', 'rendi', 'ridwan', 'rizal', 'rudi', 'sigit', 'slamet', 'subagyo',
  'sudirman', 'sugeng', 'suharto', 'sukamto', 'sunarto', 'suparman',
  'supriyanto', 'surya', 'sutrisno', 'taufik', 'teguh', 'tono', 'untung',
  'wahyu', 'waluyo', 'wawan', 'yanto', 'yudi', 'yusuf', 'zaenal',
]);
const JK_DEPAN_P = new Set([
  'ajeng', 'ani', 'anis', 'anita', 'asih', 'ayu', 'dara', 'desi', 'dewi',
  'diah', 'dina', 'elis', 'endang', 'erna', 'eva', 'fitri', 'gita', 'hana',
  'hesti', 'ida', 'indah', 'intan', 'ira', 'kartika', 'lastri', 'lia',
  'lina', 'maryati', 'mega', 'mira', 'murni', 'novi', 'nunung', 'nurul',
  'prita', 'purwanti', 'putri', 'rahayu', 'ratih', 'ratna', 'retno', 'rina',
  'rini', 'risma', 'rita', 'sari', 'siti', 'sri', 'sulastri', 'susi', 'tini',
  'tita', 'titik', 'tuti', 'umi', 'wati', 'widya', 'wulan', 'yani', 'yanti',
  'yeni', 'yuli', 'yuni', 'zahra',
]);

/* Akhiran yang di bahasa Indonesia memang menandai gender, dipakai cuma kalau
   nama depannya tidak ada di kedua daftar: -wati/-ningsih menandai perempuan
   persis seperti -wan/-uddin menandai laki-laki. Diperiksa sesudah daftar
   supaya nama yang sudah pasti tidak bisa dibelokkan akhirannya. */
const JK_AKHIRAN = [
  [/(wati|ningsih|ningrum|astuti|asih|yanti|ati)$/, 'P'],
  [/(wan|anto|onto|udin|uddin|syah|man)$/, 'L'],
];

/** Tebak dari NAMA DEPAN saja; '' berarti tidak tahu (ikut jabatan). */
function tebakJk(nama) {
  const depan = String(nama || '').trim().toLowerCase().split(/\s+/)[0] || '';
  if (!depan) return '';
  if (JK_DEPAN_L.has(depan)) return 'L';
  if (JK_DEPAN_P.has(depan)) return 'P';
  for (const [pola, jk] of JK_AKHIRAN) if (pola.test(depan)) return jk;
  return '';
}

const jkKunci = (nama) => String(nama || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Timpaan menang atas tebakan. Inilah satu-satunya cara membaca jenis
    kelamin di server — jangan panggil tebakJk() langsung dari tempat lain. */
function jkDari(nama) {
  const k = jkKunci(nama);
  if (!k) return '';
  return namaDaftar.jk[k] || tebakJk(k);
}

/* Peta timpaan dari luar: cuma 'L'/'P' yang diterima, kunci dinormalkan, dan
   jumlahnya dibatasi seperti daftar namanya sendiri. Nilai lain (termasuk ''
   dan null) berarti "cabut timpaannya, kembali ke tebakan". */
function jkBersih(obj) {
  const keluar = Object.create(null);
  if (!obj || typeof obj !== 'object') return keluar;
  let n = 0;
  for (const [nama, jk] of Object.entries(obj)) {
    if (jk !== 'L' && jk !== 'P') continue;
    const k = jkKunci(clip(String(nama), 24));
    if (!k || keluar[k]) continue;
    keluar[k] = jk;
    if (++n >= NAMA_MAKS) break;
  }
  return keluar;
}


/* Dua cara menugaskan orang ke sesi:

   'tetap' — nama menempel di KURSI. Sesi yang datang ke folder yang sama
             mewarisi nama penghuni kursi itu; undiannya deterministik. Ini
             perilaku asli fitur pegawai tetap, dan yang dijaga uji-pegawai.

   'acak'  — nama menempel di ORANG. Tiap sesi baru menarik satu orang acak
             dari daftar, lengkap dengan jabatannya. Ruangan jadi berganti
             wajah; harganya, "besok dipanggil dengan nama yang sama" tidak
             lagi berlaku.

   Env menang atas berkas: uji-pegawai memakainya untuk menguji mode 'tetap'
   tanpa bergantung pada isi nama.json milik siapa pun. */
const PENUGASAN_ENV = String(process.env.AGENT_ROOM_PENUGASAN || '').trim().toLowerCase();
const PENUGASAN_SAH = new Set(['tetap', 'acak']);
function penugasan() {
  if (PENUGASAN_SAH.has(PENUGASAN_ENV)) return PENUGASAN_ENV;
  return namaDaftar.penugasan === 'tetap' ? 'tetap' : 'acak';
}

/* Nama dari manusia lewat panel: dipangkas, dibuang yang kosong, dibuang
   kembar, dipotong 24 huruf (sama dengan batas /nama), dan dibatasi jumlahnya.
   Urutannya DIPERTAHANKAN — undian mode 'tetap' bergantung pada urutan.

   Menerima string ("Oji") maupun objek ({nama, peran}), supaya nama.json v1
   dan tempelan lama dari panel tetap masuk tanpa perlu diubah tangan. */
function namaBersih(arr) {
  if (!Array.isArray(arr)) return [];
  const keluar = [], ada = new Set();
  for (const mentah of arr) {
    const asal = typeof mentah === 'string' ? { nama: mentah } : mentah;
    if (!asal || typeof asal.nama !== 'string') continue;
    const n = clip(asal.nama.replace(/\s+/g, ' ').trim(), 24);
    if (!n || ada.has(n)) continue;
    /* Id jabatan disaring BENTUKNYA saja, sama seperti POST /peran: tabel
       jabatannya hidup di halaman, bukan di sini, dan server tidak berhak
       menebak id mana yang sah. Yang tidak berbentuk id dibuang jadi ''. */
    const p = typeof asal.peran === 'string' && PERAN_SAH.test(asal.peran.trim())
      ? asal.peran.trim() : '';
    ada.add(n);
    keluar.push({ nama: n, peran: p });
    if (keluar.length >= NAMA_MAKS) break;
  }
  return keluar;
}

function namaMuat() {
  let teks = '';
  try { teks = fs.readFileSync(BERKAS_NAMA, 'utf8'); }
  catch (err) {
    // belum ada memang wajar; "ada tapi tidak terbaca" tidak boleh diam-diam
    if (err.code !== 'ENOENT') {
      console.warn('[agent-room] nama: ' + path.basename(BERKAS_NAMA)
        + ' tidak terbaca (' + err.message + '), memakai daftar bawaan');
    }
    return;
  }
  let o = null;
  try { o = JSON.parse(teks); } catch { o = null; }
  if (!o || typeof o !== 'object') {
    console.warn('[agent-room] nama: isi ' + path.basename(BERKAS_NAMA)
      + ' tidak terbaca sebagai JSON, memakai daftar bawaan');
    return;
  }
  const v = versiSkema(o);
  if (v > SKEMA.nama) {
    console.warn('[agent-room] nama: ' + path.basename(BERKAS_NAMA) + ' ber-v' + v
      + ' (server ini paham v' + SKEMA.nama + '), memakai daftar bawaan');
    return;
  }
  migrasiNama(o);
  /* v1 menyimpan `penuh` sebagai larik string. namaBersih() menerima string
     maupun objek, jadi naik versi tidak butuh kode migrasi tersendiri —
     berkas lama terbaca apa adanya dan jadi entri tanpa jabatan. */
  namaDaftar.penuh = namaBersih(o.penuh);
  namaDaftar.jk = jkBersih(o.jk);
  namaDaftar.penugasan = o.penugasan === 'tetap' ? 'tetap' : (o.penugasan === 'acak' ? 'acak' : '');
  if (namaDaftar.penuh.length) {
    const berjabatan = namaDaftar.penuh.filter((e) => e.peran).length;
    console.log('[agent-room] daftar nama dimuat: ' + namaDaftar.penuh.length
      + ' nama (' + berjabatan + ' berjabatan) dari ' + path.basename(BERKAS_NAMA)
      + ', penugasan ' + penugasan());
  }
}

function namaTulis() {
  /* `penugasan` ikut ditulis APA ADANYA, termasuk waktu isinya ''. '' berarti
     "belum pernah dipilih", dan penugasan() sudah menerjemahkannya jadi 'acak'
     saat dibaca; memaksanya jadi 'acak' di sini menghapus bedanya, padahal
     panel memakai beda itu buat tahu mana bawaan dan mana pilihan sadar. */
  const isi = JSON.stringify({
    v: SKEMA.nama, penugasan: namaDaftar.penugasan, penuh: namaDaftar.penuh, jk: namaDaftar.jk,
  }, null, 2) + '\n';
  const tmp = BERKAS_NAMA + '.tmp';
  try {
    fs.writeFileSync(tmp, isi);
    fs.renameSync(tmp, BERKAS_NAMA);
    return '';
  } catch (err) {
    return err.message;
  }
}

const formasi = { v: SKEMA.formasi, proyek: {} };   // nama folder -> [kursi]; indeks 0 = pegawai tetap #1
const slotSesi = new Map();                 // sesi 12-char -> { proyek, i } — memori saja, tidak pernah ke disk
let formasiKotor = false;
let formasiTimer = null;

/* Satu kursi. `sejak` = kapan kursinya pertama kali dilantik (itu yang
   dipajang kartu pegawai sebagai "sejak <tanggal>"); `terakhir` = kapan
   terakhir kali ada yang MENDUDUKINYA — dicatat sekali per penempatan, bukan
   tiap hook, supaya jalur event tidak mengotori berkas tiap detik. */
const kursiKosong = (ts) => ({
  nama: '', peran: '', sejak: ts, terakhir: ts,
  manual: false, peranManual: false,
  cabangTerakhir: '', mesinTerakhir: '',
  penghuni: '',                             // sesi yang sedang menduduki; MEMORI SAJA
});

/* Nama yang sedang dipakai kursi LAIN di proyek yang sama — supaya dua
   pegawai tetap di satu ruangan tidak kembar nama. */
function namaDipakai(kursi, kecuali) {
  const s = new Set();
  kursi.forEach((k, idx) => { if (idx !== kecuali && k && k.nama) s.add(k.nama); });
  return s;
}

/* Undian nama DETERMINISTIK: hash(proyek + '#' + kursi + '#' + salt), dua byte
   pertama jadi indeks ke daftar nama yang sedang berlaku. Deterministik
   dipilih supaya (a) formasi.json boleh hilang tanpa membuat seluruh kantor
   berganti orang, dan (b) uji bisa menghitung ulang nama yang seharusnya
   keluar tanpa mematok nama harfiah di dalam kodenya. `salt` dinaikkan (probe
   linear) selama hasilnya sudah dipakai kursi lain. */
function pegawaiUndi(proyek, i, dipakai) {
  const daftar = daftarNama().map((e) => e.nama);
  for (let salt = 0; salt < 64; salt++) {
    const h = crypto.createHash('sha256').update(proyek + '#' + i + '#' + salt).digest();
    const nama = daftar[h.readUInt16BE(0) % daftar.length];
    if (!dipakai || !dipakai.has(nama)) return nama;
  }
  /* Daftarnya lebih pendek daripada jumlah kursi — mungkin saja sekarang,
     karena daftarnya kamu yang menyusun dan boleh cuma berisi satu nama.
     Angka di belakang lebih jujur daripada dua pegawai bernama persis sama di
     satu ruangan, dan jauh lebih baik daripada nama kosong. */
  const dasar = daftar[i % daftar.length];
  if (!dipakai || !dipakai.has(dasar)) return dasar;
  for (let n = 2; n < 100; n++) {
    if (!dipakai.has(dasar + ' ' + n)) return dasar + ' ' + n;
  }
  return dasar;
}

/* Undian mode 'acak': satu orang, betulan acak, tiap sesi baru. Yang sedang
   duduk di kursi lain proyek yang sama dikecualikan supaya tidak ada dua orang
   bernama sama di satu ruangan; kalau daftarnya habis (sesi lebih banyak
   daripada nama), pagarnya dilepas dan kembar diterima — lebih baik kembar
   daripada sesi yang tidak dapat nama sama sekali.

   Undiannya rata, tanpa bobot. Komposisi daftarnya sendiri yang menentukan
   siapa sering muncul: kantor sungguhan isinya memang lebih banyak staf
   daripada kepala bidang, jadi undian rata di atas daftar yang jujur sudah
   menghasilkan ruangan yang masuk akal tanpa mesin pembobot apa pun. */
function pegawaiAcak(dipakai) {
  const daftar = daftarNama();
  const luang = dipakai ? daftar.filter((e) => !dipakai.has(e.nama)) : daftar;
  const kolam = luang.length ? luang : daftar;
  return kolam[Math.floor(Math.random() * kolam.length)];
}

/* Buang formasi folder yang paling lama tidak ditengok sampai jumlah proyek
   kembali ke FORMASI_PROYEK_MAKS. `lindungi` = folder yang barusan dibuat
   (jangan sampai yang baru lahir langsung dibuang kalau semua tetangganya
   lebih baru), dan folder yang kursinya sedang dihuni tidak pernah jadi
   calon: membuang formasi orang yang sedang duduk berarti mencabut namanya
   di tengah kerja. Mengembalikan berapa folder yang dibuang. */
function formasiPangkas(lindungi) {
  const nama = Object.keys(formasi.proyek);
  let sisa = nama.length - FORMASI_PROYEK_MAKS;
  if (sisa <= 0) return 0;
  const umur = (n) => (formasi.proyek[n] || []).reduce((m, k) => Math.max(m, k.terakhir || 0), 0);
  const dihuni = (n) => (formasi.proyek[n] || []).some((k) => k.penghuni);
  const calon = nama.filter((n) => n !== lindungi && !dihuni(n)).sort((a, b) => umur(a) - umur(b));
  let buang = 0;
  for (const n of calon) {
    if (sisa-- <= 0) break;
    delete formasi.proyek[n];
    buang++;
  }
  return buang;
}

function formasiKursi(proyek) {
  let a = formasi.proyek[proyek];
  if (!Array.isArray(a)) {
    a = [];
    formasi.proyek[proyek] = a;
    // folder baru: sekalian periksa apakah ruang arsipnya sudah kepenuhan
    if (formasiPangkas(proyek)) formasiKotor = true;
  }
  return a;
}

/** Kursi milik sesi ini beserta alamatnya (proyek + indeks), supaya
    pemanggilnya bisa mengundi ulang nama. null = sesi tanpa kursi, mis.
    tenaga kontrak yang dilahirkan halaman. */
function pegawaiSlot(sesi) {
  const alamat = slotSesi.get(sesi);
  if (!alamat) return null;
  const kursi = formasi.proyek[alamat.proyek];
  const slot = Array.isArray(kursi) ? kursi[alamat.i] : null;
  return slot ? { slot, kursi, proyek: alamat.proyek, i: alamat.i } : null;
}

/* Melantik sesi ke sebuah kursi, atau null kalau sesi ini memang tidak berhak
   dapat nama tetap. Dipanggil dari terimaEvent() untuk SETIAP hook, jadi
   jalur cepatnya (sudah punya kursi) harus di paling atas. */
function pegawaiTetapPasang(ev) {
  if (PEGAWAI_MATI) return null;                      // AGENT_ROOM_PEGAWAI_TETAP=off
  if (!ev.cwd || !ev.session || !PEGAWAI_KIND.has(ev.kind)) return null;
  if (slotSesi.has(ev.session)) return null;          // sudah dilantik
  /* Sesi yang dilahirkan halaman lewat lahirkanTugas() sudah membawa nama dari
     formulir tugas. Dia tenaga kontrak untuk satu pekerjaan, jangan sampai
     mengambil nomor formasi staf tetap. Pakai .get() truthy, JANGAN .has():
     jalur lain bisa menyisakan string kosong di peta yang sama. */
  if (namaSesi.get(ev.session)) return null;
  const proyek = clip(ev.cwd, 120);
  if (!proyek) return null;
  const kursi = formasiKursi(proyek);
  const kini = Date.now();

  /* Sapuan malas, tanpa timer — polanya sama dengan potretRuangan(): kursi
     yang penghuninya tidak ada lagi di sesiHidup, atau yang sudah diam lebih
     lama dari PEGAWAI_SEPI_MS, dianggap ditinggal pulang tanpa pamit.

     Yang disapu dilepas LENGKAP lewat pegawaiLepas(), bukan cuma dicoret dari
     slotSesi. Melepas setengah-setengah bikin dua kerusakan sekaligus: (a)
     namaSesi-nya tertinggal, jadi orang yang tersapu tetap dipanggil dengan
     nama kursi yang sudah diberikan ke orang lain — dua sesi hidup bernama
     sama persis, padahal namaDipakai() dibuat justru supaya itu mustahil; dan
     (b) gerbang "sudah punya nama = tenaga kontrak" di atas ikut menjebaknya,
     jadi waktu dia bekerja lagi dia TIDAK PERNAH dilantik ulang — kursinya
     hilang selamanya dan ganti nama/jabatan lewat kartu pegawai diam-diam
     tidak mendarat ke berkas. Harganya: orang yang diam 30 menit lalu bekerja
     lagi bisa berganti nama kalau kursinya sudah ditempati. Nama berkedip
     sekali jauh lebih ringan daripada dua orang bernama sama selamanya. */
  for (const k of kursi) {
    if (!k.penghuni) continue;
    const h = sesiHidup.get(k.penghuni);
    if (!h || kini - h.terakhir > PEGAWAI_SEPI_MS) pegawaiLepas(k.penghuni);
  }

  let i = kursi.findIndex((k) => !k.penghuni);
  let baru = false;
  if (i < 0) {
    if (kursi.length >= FORMASI_MAKS) return null;    // ruangannya penuh: jalan tanpa nama tetap
    i = kursi.length;
    kursi.push(kursiKosong(ev.ts || kini));
    baru = true;
  }
  const slot = kursi[i];
  /* Di sinilah dua mode penugasan berpisah.

     'tetap': nama diundi SEKALI lalu menempel di kursi selamanya (`!slot.nama`).
     'acak' : nama diundi ULANG tiap kali kursinya ditempati sesi baru — itulah
              yang membuat ruangan berganti wajah.

     Nama yang kamu ketik sendiri lewat kartu pegawai (`manual`) menang di
     kedua mode: itu keputusan manusia, bukan hasil undian, dan piket acak
     tidak berhak membatalkannya. Begitu juga jabatan yang kamu setel sendiri
     (`peranManual`) — jabatan bawaan orangnya cuma dipakai kalau kamu belum
     pernah menyetel jabatan kursi itu. */
  if (penugasan() === 'acak' && !slot.manual) {
    const orang = pegawaiAcak(namaDipakai(kursi, i));
    if (orang) {
      slot.nama = orang.nama;
      if (!slot.peranManual) slot.peran = orang.peran || '';
    }
  } else if (!slot.nama) {
    slot.nama = pegawaiUndi(proyek, i, namaDipakai(kursi, i));
  }
  slot.penghuni = ev.session;
  slot.terakhir = ev.ts || kini;
  if (ev.cabang) slot.cabangTerakhir = clip(ev.cabang, 48);
  if (ev.mesin) slot.mesinTerakhir = clip(ev.mesin, 32);
  slotSesi.set(ev.session, { proyek, i });
  namaSesi.set(ev.session, slot.nama);
  if (slot.peran) peranSesi.set(ev.session, slot.peran);
  formasiKotor = true;
  formasiJadwalkanTulis();
  return { nama: slot.nama, peran: slot.peran || '', slot: i + 1, sejak: slot.sejak, baru };
}

/* Pegawainya pulang: kursinya dikosongkan supaya sesi berikutnya di proyek
   yang sama mendapat nomor yang sama. Sekalian membersihkan tiga peta per-sesi
   yang selama ini cuma dibersihkan di jalur gagal-spawn. */
function pegawaiLepas(sesi) {
  if (!sesi) return;
  namaSesi.delete(sesi);
  peranSesi.delete(sesi);
  modelSesi.delete(sesi);
  modeSesi.delete(sesi);
  putarSesi.delete(sesi);
  konteksSesi.delete(sesi);
  const alamat = slotSesi.get(sesi);
  if (!alamat) return;
  slotSesi.delete(sesi);
  const kursi = formasi.proyek[alamat.proyek];
  const slot = Array.isArray(kursi) ? kursi[alamat.i] : null;
  if (slot && slot.penghuni === sesi) slot.penghuni = '';
}

// Bentuk yang boleh mendarat di disk: `penghuni` (id sesi) ditanggalkan di sini.
const formasiIsi = () => JSON.stringify({
  v: SKEMA.formasi,
  proyek: Object.fromEntries(Object.entries(formasi.proyek).map(([nm, kursi]) => [nm, kursi.map((k) => ({
    nama: k.nama, peran: k.peran, sejak: k.sejak, terakhir: k.terakhir,
    manual: k.manual, peranManual: k.peranManual,
    cabangTerakhir: k.cabangTerakhir, mesinTerakhir: k.mesinTerakhir,
  }))])),
});

function formasiTulis(sinkron) {
  if (PEGAWAI_MATI || !formasiKotor) return;          // saklar mati: berkasnya tidak pernah lahir
  formasiKotor = false;
  clearTimeout(formasiTimer);
  const isi = formasiIsi();
  if (sinkron) {
    try { fs.writeFileSync(BERKAS_FORMASI, isi); }
    catch (err) { console.warn('[agent-room] gagal menulis formasi: ' + err.message); }
    return;
  }
  // .tmp lalu rename, sama alasannya dengan buku induk: satu objek JSON,
  // setengah jadi = tidak terbaca sama sekali
  const tmp = BERKAS_FORMASI + '.tmp';
  fs.writeFile(tmp, isi, (err) => {
    if (err) { console.warn('[agent-room] gagal menulis formasi: ' + err.message); formasiKotor = true; return; }
    fs.rename(tmp, BERKAS_FORMASI, (e2) => {
      if (e2) { console.warn('[agent-room] gagal menulis formasi: ' + e2.message); formasiKotor = true; }
    });
  });
}

// Debounce 20 detik, sama dengan buku induk: dipanggil dari jalur hook.
function formasiJadwalkanTulis() {
  if (formasiTimer) return;
  formasiTimer = setTimeout(() => { formasiTimer = null; formasiTulis(false); }, 20000);
  formasiTimer.unref?.();
}

function formasiMuat() {
  if (PEGAWAI_MATI) return;                           // AGENT_ROOM_PEGAWAI_TETAP=off
  let teks = '';
  try { teks = fs.readFileSync(BERKAS_FORMASI, 'utf8'); }
  catch (err) {
    /* Berkas belum ada memang wajar — kantornya baru buka, diam saja. Tapi
       "ada, cuma tidak bisa dibaca" (izin, perangkat) bukan hal yang wajar
       dan tidak boleh dibuang tanpa suara: sebentar lagi berkasnya ditimpa. */
    if (err.code !== 'ENOENT') {
      console.warn('[agent-room] formasi: 1 berkas ditolak (tidak terbaca: ' + err.message + ')');
    }
    return;
  }
  let o = null;
  /* Dua cabang penolakan di bawah memperingatkan; yang ini dulu diam saja,
     padahal justru yang paling perlu terdengar: berkas terpotong (mati listrik
     saat rename, disk penuh) tidak bisa dibedakan dari kantor yang baru buka,
     dan seluruh nama yang sudah dipilih manusia lenyap tanpa jejak begitu
     kursi pertama lahir dan berkasnya ditimpa. */
  try { o = JSON.parse(teks); }
  catch (err) {
    console.warn('[agent-room] formasi: 1 berkas ditolak (isinya bukan JSON utuh: ' + err.message
      + '); nama lama hilang, berkasnya ditimpa begitu ada pegawai dilantik — ' + BERKAS_FORMASI);
    return;
  }
  if (!o || typeof o !== 'object' || !o.proyek || typeof o.proyek !== 'object') {
    console.warn('[agent-room] formasi: 1 berkas ditolak (skema v' + SKEMA.formasi + '; bentuk tidak dikenal)');
    return;
  }
  if (versiSkema(o) > SKEMA.formasi) {
    console.warn('[agent-room] formasi: 1 berkas ditolak (skema v' + SKEMA.formasi + '; berkas ber-v' + versiSkema(o) + ' lebih baru)');
    return;
  }
  if (versiSkema(o) < SKEMA.formasi) migrasiFormasi(o);
  let n = 0, jumlahKursi = 0;
  for (const [nama, arr] of Object.entries(o.proyek)) {
    if (!nama || !Array.isArray(arr)) continue;
    const kursi = [];
    // dipotong di FORMASI_MAKS, dan kursi rusak tetap memakan tempat: nomor
    // formasi itu alamat, menggesernya berarti menukar orang
    for (const r of arr.slice(0, FORMASI_MAKS)) {
      const k = kursiKosong(0);
      if (r && typeof r === 'object') {
        k.nama = clip(r.nama, 24);
        k.peran = typeof r.peran === 'string' && PERAN_SAH.test(r.peran) ? r.peran : '';
        k.sejak = Math.max(0, Number(r.sejak) || 0);
        k.terakhir = Math.max(0, Number(r.terakhir) || 0);
        k.manual = r.manual === true;
        k.peranManual = r.peranManual === true;
        k.cabangTerakhir = clip(r.cabangTerakhir, 48);
        k.mesinTerakhir = clip(r.mesinTerakhir, 32);
      }
      kursi.push(k);
    }
    if (!kursi.length) continue;
    formasi.proyek[clip(nama, 120)] = kursi;
    n++; jumlahKursi += kursi.length;
  }
  /* Berkas yang lahir dari server versi lama (atau disunting tangan) bisa
     membawa ribuan folder; dipangkas di sini juga, bukan cuma waktu folder
     baru datang. Ditandai kotor supaya bentuk rampingnya benar-benar mendarat
     ke disk waktu kantornya tutup, bukan cuma hidup di memori. */
  const dibuang = formasiPangkas();
  if (dibuang) {
    formasiKotor = true;
    n = 0; jumlahKursi = 0;
    for (const arr of Object.values(formasi.proyek)) { n++; jumlahKursi += arr.length; }
  }
  if (n) console.log('[agent-room] formasi dimuat: ' + jumlahKursi + ' pegawai tetap di ' + n + ' proyek dari ' + BERKAS_FORMASI
    + (dibuang ? ' (' + dibuang + ' proyek terlama dibuang, batas ' + FORMASI_PROYEK_MAKS + ')' : ''));
}
// Urutannya penting: daftar nama harus sudah di tangan sebelum formasi dimuat,
// sebab kursi yang namanya kosong di berkas diundi ulang saat pemuatan itu.
namaMuat();
formasiMuat();

/* ------------------------------------------------------------ papan SKP ---
   Kinerja per PROYEK dan per SESI dalam satu rentang tanggal, dihitung saat
   diminta dari tiga sumber yang sudah ada — bukan tabel baru yang harus
   dipelihara: buku agenda (tool call, gagal, durasi, tertahan, campuran tool),
   riwayat token (masuk/keluar/cache per proyek per hari), dan buku induk (jam
   dinas seumur hidup + golongan). Tidak ada label maupun isi yang keluar —
   agendaBacaHari() sudah menanggalkan label saat ISI_MATI, dan yang dijumlah
   di sini cuma nama tool, nama folder, cabang, dan angka. Berhenti di token,
   tidak ke dolar (lihat DESIGN "Token sesi terminal"). Di-cache 30 detik per
   rentang supaya halaman yang buka-tutup modal tidak membaca ulang 7-30
   berkas agenda tiap kali. */
const SKP_CACHE_MS = 30000;
const SKP_TOOL_MAX = 8;
const SKP_TERTAHAN = new Set(['izin-minta', 'stop-gagal']);
const skpCache = new Map();                 // 'dari|sampai' -> { ts, hasil }

/* ---------------------------------------------------- indikator perilaku ---
   Papan SKP di atas menjumlah VOLUME: 200 tool call rapi dan 200 tool call
   karena mengulang Edit yang sama empat puluh kali terlihat persis sama. Empat
   angka di bawah ini menilai PERILAKUNYA, semuanya dari bidang buku agenda
   yang sudah lama ada — tanpa hook baru, tanpa kunci, tanpa sinyal baru.

   Yang DIBERI bobot cuma yang benar-benar perbuatan agennya:

     rasioGagal     gagal per tool call, sesudah dikurangi Ctrl+C
     bolakBalik     tool+label yang sama berulang dalam jendela pendek
     tertahan       berapa kali sesi berhenti menunggu manusia
     gagalBeruntun  rentetan gagal terpanjang tanpa diselingi berhasil
     rapatYatim     subagent yang dibuka tapi tidak pernah ditutup

   Yang TIDAK diberi bobot, tapi tetap dilaporkan sebagai keterangan:

     interupsi      Ctrl+C tindakan PEMILIK, bukan alat yang rusak — kalimat
                    itu sudah tertulis di normalisasi hook dan di room.js.
                    Hari ini event yang sama sudah masuk hitungan `gagal`,
                    jadi memberinya bobot berarti menghukum dua kali. Yang
                    dilakukan di sini kebalikannya: `gagalBersih` justru
                    DIKURANGI jumlah interupsi sebelum dipakai menilai.
     lamaTertahan   berapa lama menunggu itu urusan JAM MANUSIANYA, bukan
                    kelakuan agen. Di empat hari data nyata p90-nya 36 menit
                    dan puncaknya 12 jam — itu orang tidur, bukan agen buruk.
     toolPerPrompt  sebarannya p50 31 dan p90 243. Angka besar sama saja
                    artinya "satu perintah dikerjakan tuntas" atau "meraba-
                    raba"; tidak ada arah yang bisa dipertahankan, jadi
                    disajikan mentah dan dibiarkan dibaca orang.

   Titik jenuh (nilai yang membuat satu sumbu kena hukuman penuh) dipilih dengan
   satu aturan, dan aturannya dua-duanya harus dipenuhi:

     a. bisa dijelaskan dengan kalimat biasa — "satu dari sepuluh tool call
        gagal", "empat gagal berturut-turut tanpa satu pun berhasil", "separuh
        subagent yang dibuka tidak pernah melapor balik";
     b. TERBUKTI bisa dicapai. Ambang yang tak pernah tersentuh sama saja
        dengan sumbu yang tidak ada.

   Syarat (b) bukan teori. Ambang gagal 20% yang dipakai warna `.gagal-tinggi`
   di halaman ternyata tidak pernah tercapai satu kali pun: rasio gagal
   tertinggi dari 29.496 baris agenda empat hari cuma 8,7%. Memakainya sebagai
   titik jenuh berarti sumbu paling berat dalam rumus ini tidak pernah berbunyi.
   Angka di bawah semuanya diadu dengan hari sungguhan itu dulu, dan yang
   pertama saya pilih sendiri (tertahan 6 per 100) juga gugur di syarat yang
   sama — maksimum sungguhannya 2,3. Bobot dan jenuh IKUT KELUAR di /skp supaya
   siapa pun bisa menghitung ulang sendiri dan membantahnya.

   `bolakBalik` cuma dihitung dari `pre` yang labelnya BISA dipercaya untuk
   perbandingan kesamaan, dan itu bukan basa-basi: `clip()` menutup label yang
   kepanjangan dengan '…', dan 6.633 dari 14.084 label memang tertutup begitu —
   dua perintah Bash yang cuma berbagi 88 karakter pertama akan terlihat kembar
   padahal bukan. Label tool MCP lebih parah: isinya nama servernya saja, jadi
   1.011 panggilan cuma punya 22 label berbeda. Dua-duanya dikeluarkan. Sisanya
   6.434 sidik jari yang jujur; kalau yang tersisa terlalu sedikit (atau
   AGENT_ROOM_ISI=off menghapus seluruh label), sumbu ini TIDAK dinilai dan
   bobotnya dikeluarkan dari pembagi — bukan dianggap nol. */
const SKP_JENDELA_ULANG = 3;                // sepanjang apa "barusan" untuk bolak-balik
const SKP_ULANG_MIN = 10;                   // di bawah ini rasio bolak-balik tidak berarti
const SKP_BOBOT = { rasioGagal: 30, bolakBalik: 25, tertahan: 20, gagalBeruntun: 15, rapatYatim: 10 };
/* satuan berurutan: % tool call · % panggilan yang labelnya layak dibandingkan
   · kali per 100 tool call · rentetan · % rapat yang dibuka. Tertinggi yang
   pernah tercatat di empat hari nyata: 8,7 · 34,5 · 2,3 · 3 · 100 */
const SKP_JENUH = { rasioGagal: 10, bolakBalik: 30, tertahan: 3, gagalBeruntun: 4, rapatYatim: 50 };
const skpSatuAngka = (x) => Math.round(x * 10) / 10;
/* Label yang boleh dipakai membandingkan kesamaan: ada, tidak tertutup '…'
   oleh clip(), dan bukan tool MCP (labelnya cuma "server · tool"). */
const skpLabelLayak = (o) => Boolean(o.label) && !o.label.endsWith('…')
  && !String(o.tool || '').startsWith('mcp__');

/* Fungsi MURNI: lima angka masuk, satu nilai keluar. Sumbu yang nilainya null
   berarti tidak terukur di rentang ini — bobotnya dikeluarkan dari pembagi,
   jadi sesi bersih tetap 100 dan sumbu yang buta tidak pernah menyamar jadi
   nilai sempurna maupun jadi hukuman. */
function skpNilai(ukur) {
  let bobot = 0; let denda = 0; const dipakai = [];
  for (const k of Object.keys(SKP_BOBOT)) {
    const v = ukur[k];
    if (v == null || !Number.isFinite(v)) continue;
    bobot += SKP_BOBOT[k];
    denda += SKP_BOBOT[k] * Math.min(1, Math.max(0, v) / SKP_JENUH[k]);
    dipakai.push(k);
  }
  if (!bobot) return { nilai: null, bobotDipakai: [] };
  return { nilai: Math.round(100 - (denda / bobot) * 100), bobotDipakai: dipakai };
}

/* Bentuk blok indikator yang sama untuk sesi maupun proyek — satu rumus, dua
   pemakai, jadi angka di baris proyek tidak pernah punya definisi sendiri. */
function skpPerilaku(a) {
  const gagalBersih = Math.max(0, a.gagal - a.interupsi);
  const rasioGagalBersih = a.toolCall ? skpSatuAngka((gagalBersih / a.toolCall) * 100) : 0;
  const bolakBalikRasio = a.bolakBalikDari >= SKP_ULANG_MIN
    ? skpSatuAngka((a.bolakBalik / a.bolakBalikDari) * 100) : null;
  const tertahanPer100 = a.toolCall ? skpSatuAngka((a.tertahan / a.toolCall) * 100) : 0;
  const rapatYatimRasio = a.rapat ? skpSatuAngka((a.rapatYatim / a.rapat) * 100) : null;
  const skor = skpNilai({ rasioGagal: rasioGagalBersih, bolakBalik: bolakBalikRasio,
                          tertahan: tertahanPer100, gagalBeruntun: a.gagalBeruntunMaks,
                          rapatYatim: rapatYatimRasio });
  return {
    nilai: skor.nilai,
    bobotDipakai: skor.bobotDipakai,
    gagalBersih,
    rasioGagalBersih,
    bolakBalik: a.bolakBalik,
    bolakBalikDari: a.bolakBalikDari,
    bolakBalikRasio,
    gagalBeruntunMaks: a.gagalBeruntunMaks,
    rapat: a.rapat,
    rapatYatim: a.rapatYatim,
    rapatYatimRasio,
    tertahanPer100,
    // keterangan tanpa bobot — alasannya di kepala blok ini
    interupsi: a.interupsi,
    tertahanLuas: a.tertahanLuas,
    lamaTertahan: a.lamaTertahan,
    prompt: a.prompt,
    toolPerPrompt: a.prompt ? skpSatuAngka(a.toolCall / a.prompt) : null,
  };
}

const skpHariMundur = (tanggal, n) => {
  const d = new Date(tanggal + 'T00:00:00');
  return tanggalLokal(d.getTime() - n * 24 * 3600 * 1000);
};

function skpHitung(dari, sampai) {
  const kunci = dari + '|' + sampai;
  const ada = skpCache.get(kunci);
  if (ada && Date.now() - ada.ts < SKP_CACHE_MS) return { ...ada.hasil, cache: true };

  const proyek = new Map();                 // nama -> agregat
  const sesi = new Map();                   // id sesi -> agregat
  const proyekAmbil = (nama) => {
    let p = proyek.get(nama);
    if (!p) proyek.set(nama, p = { nama, sesi: new Set(), toolCall: 0, gagal: 0, durasiJumlah: 0, durasiN: 0,
                                   tool: {}, jamDinasRentang: 0, terakhir: 0, token: null });
    return p;
  };
  // Rentang dibatasi seumur simpanan agenda; hari tanpa berkas cuma [] murah.
  // Dikumpulkan dulu lalu dibaca URUT NAIK: aturan celah jam dinas di bawah
  // butuh event kronologis, dan mundur dari `sampai` akan mematikan celahnya.
  const tanggal = [];
  for (let n = 0; n <= AGENDA_HARI + 1; n++) {
    const tgl = skpHariMundur(sampai, n);
    if (tgl < dari) break;
    tanggal.unshift(tgl);
  }
  const hari = tanggal.length;
  for (const tgl of tanggal) {
    for (const o of agendaBacaHari(tgl)) {
      if (!o.session) continue;
      const nama = o.cwd || '(tanpa proyek)';
      const p = proyekAmbil(nama);
      p.sesi.add(o.session);
      let s = sesi.get(o.session);
      if (!s) sesi.set(o.session, s = { sesi: o.session, proyek: nama, cabang: o.cabang || '', mulai: o.ts, selesai: o.ts,
                                        toolCall: 0, gagal: 0, tertahan: 0, tool: {}, model: '',
                                        // indikator perilaku; ulangRing/rapatBuka/tahanSejak kerja
                                        // sementara dan dibuang sebelum ikut ke respons
                                        interupsi: 0, prompt: 0, bolakBalik: 0, bolakBalikDari: 0, ulangRing: [],
                                        gagalRun: 0, gagalBeruntunMaks: 0, rapat: 0, rapatYatim: 0,
                                        rapatBuka: new Set(), tertahanLuas: 0, lamaTertahan: 0, tahanSejak: 0 });
      if (o.ts < s.mulai) s.mulai = o.ts;
      if (o.ts > s.selesai) s.selesai = o.ts;
      if (o.cabang) s.cabang = o.cabang;
      if (o.model) s.model = o.model;
      if (o.kind === 'pre' && o.tool) {
        p.toolCall++; s.toolCall++;
        p.tool[o.tool] = (p.tool[o.tool] || 0) + 1;
        s.tool[o.tool] = (s.tool[o.tool] || 0) + 1;
      }
      if (o.kind === 'post') {
        if (o.ok === false) { p.gagal++; s.gagal++; }
        if (Number.isFinite(o.durasi)) { p.durasiJumlah += o.durasi; p.durasiN++; }
      }
      if (SKP_TERTAHAN.has(o.kind)) s.tertahan++;
      /* ---- indikator perilaku, semuanya per SESI ----
         Rentetan gagal dan ring pengulangan cuma berarti di dalam satu sesi,
         dan di buku agenda yang urut waktu sesi-sesi saling menyela — jadi
         angka proyek digulung dari sini SESUDAH loop, bukan dijumlah di sini. */
      // menunggu ditutup oleh kejadian berikutnya dari sesi yang sama
      if (s.tahanSejak && o.ts > s.tahanSejak) { s.lamaTertahan += o.ts - s.tahanSejak; s.tahanSejak = 0; }
      if (o.kind === 'pre' && o.tool && skpLabelLayak(o)) {
        s.bolakBalikDari++;
        const sidik = o.tool + '\u0000' + o.label;
        if (s.ulangRing.includes(sidik)) s.bolakBalik++;
        s.ulangRing.push(sidik);
        if (s.ulangRing.length > SKP_JENDELA_ULANG) s.ulangRing.shift();
      }
      if (o.kind === 'post') {
        if (o.ok === false) {
          if (o.interupsi) s.interupsi++;
          s.gagalRun++;
          if (s.gagalRun > s.gagalBeruntunMaks) s.gagalBeruntunMaks = s.gagalRun;
        } else s.gagalRun = 0;                 // satu yang berhasil memutus rentetan
      }
      if (o.kind === 'prompt') s.prompt++;
      // hitungan LUAS (kind tertahan + objek butuh/macet di kind apa pun) cuma
      // dipakai lamaTertahan, supaya durasi dan jumlahnya selalu sepadan;
      // `tertahan` yang diberi bobot tetap definisi lamanya, dan itu juga yang
      // angkanya tampil di papan — yang menghukum harus bisa dibaca mata
      if (SKP_TERTAHAN.has(o.kind)
          || (o.butuh && typeof o.butuh === 'object') || (o.macet && typeof o.macet === 'object')) {
        s.tertahanLuas++;
        s.tahanSejak = o.ts;
      }
      /* Rapat yatim ditutup di `session-end` SAJA. `stop` terbit tiap giliran
         selesai, bukan tiap sesi selesai: di empat hari data nyata, 49 dari 187
         subagent yang benar-benar berpasangan melewati sedikitnya satu `stop`,
         jadi memakai `stop` sebagai batas melaporkan 136 yatim padahal yang
         sungguhan 35. Yang masih terbuka waktu rentang habis tidak dihitung —
         sesinya boleh jadi memang masih jalan. */
      if (o.kind === 'subagent-start' && o.agenId) { s.rapat++; s.rapatBuka.add(o.agenId); }
      else if (o.kind === 'subagent-stop' && o.agenId) s.rapatBuka.delete(o.agenId);
      else if (o.kind === 'session-end') { s.rapatYatim += s.rapatBuka.size; s.rapatBuka.clear(); }
      // jam dinas DALAM rentang: aturan yang sama dengan buku induk (celah ≤5
      // menit antar event hook), dihitung ulang dari agenda supaya angkanya
      // memang milik minggu ini, bukan seumur karier
      if (BUKU_INDUK_KIND.has(o.kind)) {
        if (p.terakhir && o.ts > p.terakhir && o.ts - p.terakhir <= BUKU_INDUK_JEDA) p.jamDinasRentang += o.ts - p.terakhir;
        if (o.ts > p.terakhir) p.terakhir = o.ts;
      }
    }
  }
  // token per proyek dalam rentang, dari rincian harian riwayat token
  for (const [tgl, h] of riwayatHarian) {
    if (tgl < dari || tgl > sampai || !h.proyek) continue;
    for (const [nama, t] of Object.entries(h.proyek)) {
      const p = proyekAmbil(nama);
      const k = p.token || (p.token = { input: 0, output: 0, cacheBaca: 0, cacheTulis: 0 });
      k.input += t.input || 0; k.output += t.output || 0;
      k.cacheBaca += t.cacheBaca || 0; k.cacheTulis += t.cacheTulis || 0;
    }
  }
  /* Indikator perilaku proyek = gulungan dari sesi-sesinya. Yang dijumlah
     dijumlah, tapi `gagalBeruntunMaks` diambil MAKS — rentetan terpanjang
     milik satu sesi, menjumlahkannya lintas sesi tidak berarti apa-apa. */
  const perilaku = new Map();
  for (const s of sesi.values()) {
    let a = perilaku.get(s.proyek);
    if (!a) perilaku.set(s.proyek, a = { interupsi: 0, prompt: 0, bolakBalik: 0, bolakBalikDari: 0,
                                         gagalBeruntunMaks: 0, rapat: 0, rapatYatim: 0,
                                         tertahan: 0, tertahanLuas: 0, lamaTertahan: 0 });
    for (const k of ['interupsi', 'prompt', 'bolakBalik', 'bolakBalikDari', 'rapat', 'rapatYatim',
                     'tertahan', 'tertahanLuas', 'lamaTertahan']) a[k] += s[k];
    if (s.gagalBeruntunMaks > a.gagalBeruntunMaks) a.gagalBeruntunMaks = s.gagalBeruntunMaks;
  }
  const teratas = (tool) => Object.entries(tool).sort((a, b) => b[1] - a[1]);
  const daftarProyek = [...proyek.values()].map((p) => {
    const induk = bukuInduk.proyek[p.nama];
    const a = perilaku.get(p.nama) || { interupsi: 0, prompt: 0, bolakBalik: 0, bolakBalikDari: 0,
                                        gagalBeruntunMaks: 0, rapat: 0, rapatYatim: 0,
                                        tertahan: 0, tertahanLuas: 0, lamaTertahan: 0 };
    return {
      nama: p.nama,
      sesi: p.sesi.size,
      toolCall: p.toolCall,
      gagal: p.gagal,
      rasioGagal: p.toolCall ? Math.round((p.gagal / p.toolCall) * 1000) / 10 : 0,
      durasiRata: p.durasiN ? Math.round(p.durasiJumlah / p.durasiN) : null,
      campuranTool: Object.fromEntries(teratas(p.tool).slice(0, SKP_TOOL_MAX)),
      token: p.token || { input: 0, output: 0, cacheBaca: 0, cacheTulis: 0 },
      jamDinasRentang: p.jamDinasRentang,
      jamDinas: induk ? induk.jamDinas : 0,          // seumur karier (buku induk), bukan cuma rentang ini
      golongan: induk ? induk.golongan : GOLONGAN[0].nama,
      fanOut: induk ? induk.fanOut : 0,
      tertahan: a.tertahan,                          // baru di tingkat proyek; per sesi sudah lama ada
      ...skpPerilaku({ ...a, toolCall: p.toolCall, gagal: p.gagal }),
    };
  }).sort((a, b) => (b.toolCall - a.toolCall) || ((b.token.input + b.token.output) - (a.token.input + a.token.output)));
  const daftarSesi = [...sesi.values()].map((s) => {
    const t = teratas(s.tool)[0];
    return { sesi: s.sesi, proyek: s.proyek, cabang: s.cabang, model: s.model, mulai: s.mulai, selesai: s.selesai,
             toolCall: s.toolCall, gagal: s.gagal, tertahan: s.tertahan,
             toolTeratas: t ? { nama: t[0], jumlah: t[1] } : null,
             // ulangRing/rapatBuka/tahanSejak sengaja TIDAK ikut: itu kerja
             // sementara, dan rapatBuka malah sebuah Set yang JSON.stringify
             // akan mengubah jadi {} tanpa memberi tahu siapa pun
             ...skpPerilaku(s) };
  }).sort((a, b) => (b.toolCall - a.toolCall) || (b.selesai - a.selesai));
  const hasil = {
    rentang: { dari, sampai, hari },
    proyek: daftarProyek,
    sesi: daftarSesi,
    keterangan: 'sejak dipantau',
    /* Rumus nilainya ikut keluar, bukan disembunyikan di kode: siapa pun yang
       membaca /skp bisa menghitung ulang angkanya sendiri dan membantahnya.
       `bobotDipakai` di tiap baris menyebut sumbu mana yang benar-benar
       terukur, jadi nilai 100 karena bersih tidak pernah tertukar dengan 100
       karena tidak ada yang bisa diukur. */
    bobot: SKP_BOBOT,
    jenuh: SKP_JENUH,
    jendelaUlang: SKP_JENDELA_ULANG,
    ulangMin: SKP_ULANG_MIN,
    bolakBalikDasar: ISI_MATI ? 'mati' : 'tool+label',
    dihitung: Date.now(),
  };
  // satu peta kecil: rentang yang lazim cuma 7/14/30 hari, sisanya kedaluwarsa sendiri
  for (const [k, v] of skpCache) if (Date.now() - v.ts >= SKP_CACHE_MS) skpCache.delete(k);
  skpCache.set(kunci, { ts: Date.now(), hasil });
  return { ...hasil, cache: false };
}

// Tulis saat keluar: 'exit' cuma boleh sinkron, dan SIGINT/SIGTERM harus
// diubah jadi exit() supaya 'exit' sempat jalan. Dipasang sekali saja.
process.on('exit', () => { bukuIndukTulis(true); formasiTulis(true); });
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
  /* jk ikut menempel di sini, bukan dihitung ulang di halaman: timpaan manualnya
     hidup di nama.json, dan cuma server yang memegangnya. '' = ikut jabatan. */
  ...(namaSesi.has(sesi) ? { jk: jkDari(namaSesi.get(sesi)) } : {}),
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

function pantauTranskrip(sesi, jalur, opsi = {}) {
  if (!jalur || ISI_MATI) return;
  const ada = transkrip.get(sesi);
  if (ada) {
    ada.sentuh = Date.now();
    if (ada.file === jalur) return;
    lepasTranskrip(sesi);                 // sesinya pindah berkas (resume/fork)
  }
  if (transkrip.size >= TRANSKRIP_MAX) {
    /* Yang dilepas: peserta yang paling lama diam LEBIH DULU, baru sesi induk.
       Tanpa urutan itu satu sesi ber-sepuluh subagent bisa mengusir pemantau
       induknya sendiri, dan yang hilang justru balon pikiran yang paling
       sering dilihat orang. */
    let tua = '';
    for (const [k, v] of transkrip) {
      if (!v.agenId) continue;
      if (!tua || v.sentuh < transkrip.get(tua).sentuh) tua = k;
    }
    if (!tua) {
      for (const [k, v] of transkrip) {
        if (!tua || v.sentuh < transkrip.get(tua).sentuh) tua = k;
      }
    }
    if (tua) lepasTranskrip(tua);
  }
  /* Berkas peserta dibaca dari AWAL: ia lahir sebelum hook `SubagentStart`
     sempat sampai, dan baris pertamanya cuma prompt penugasan. Berkas induk
     tetap dari ekor — sesi yang sudah panjang tidak boleh membanjiri ruangan
     dengan pikiran satu jam lalu. */
  let awal = 0;
  if (!opsi.agenId) { try { awal = fs.statSync(jalur).size; } catch { awal = 0; } }
  const rec = {
    file: jalur, offset: awal, sisa: Buffer.alloc(0),
    sibuk: false, sentuh: Date.now(), lihat: new Set(),
    sesi: opsi.sesi || sesi, agenId: opsi.agenId || '', agen: opsi.agen || '',
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
  if (!o || o.type !== 'assistant') return;
  /* Baris sidechain milik SUBAGENT. Di berkas induk ia tetap dilewati —
     tidak ada apa pun di barisnya yang bisa dipakai memastikan dia peserta
     yang mana, dan menempelkan pikiran ke orang yang salah lebih buruk
     daripada tidak menampilkannya. Di berkas PESERTA sebaliknya: pemantaunya
     memang dipasang untuk satu agenId, jadi pemiliknya pasti. Gerbang ini
     sekaligus yang membuat baris tidak pernah terhitung dua kali walau versi
     CLI tertentu menulisnya ke dua berkas. */
  if (o.isSidechain && !(rec.agenId && o.agentId === rec.agenId)) return;
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
  const nyata = rec.sesi || sesi;
  const tempel = rec.agenId ? { agenId: rec.agenId, ...(rec.agen ? { agen: rec.agen } : {}) } : {};
  const dasar = () => ({ ...dasarSesi(nyata, o.cwd, Number.isFinite(ts) ? ts : 0), ...tempel });
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
    /* Token peserta dijumlahkan TERPISAH dari induknya — kunci petanya
       'sesi|agenId'. Kalau digabung, kartu induk akan menampilkan token yang
       tidak pernah dipakainya sendiri, persis kontaminasi yang sudah
       dibereskan untuk hitungan tool call. */
    const kunciTok = rec.agenId ? nyata + '|' + rec.agenId : nyata;
    const t = tokenSesi.get(kunciTok) || { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
    t.input += d.input; t.output += d.output; t.cacheTulis += d.cacheTulis; t.cacheBaca += d.cacheBaca;
    tokenSesi.set(kunciTok, t);
    /* Seberapa penuh jendela konteksnya SEKARANG. Angkanya bukan jumlah
       kumulatif seperti `t`, melainkan ukuran prompt permintaan TERAKHIR:
       masuk + cache dibaca + cache ditulis pada baris asisten ini. Itulah yang
       benar-benar dikirim ke model, dan itulah yang akan memicu pemadatan.

       Sesi terminal tidak pernah memberitahu ini dengan cara lain — pemilik
       baru tahu waktu balon "merapikan catatan" muncul, dan sesudah itu agen
       sering lupa arahan awal. */
    const konteks = konteksPakai(kunciTok, d);
    publish({ ...dasar(), kind: 'token', token: { ...t, ...konteks } });
    /* Riwayat token TETAP dicatat untuk peserta: token yang dipakai subagent
       adalah token yang benar-benar terpakai, dan pagu maupun papan SKP harus
       menghitungnya. Modelnya diambil dari BARIS ITU SENDIRI — subagent bisa
       jalan di model yang berbeda dari induknya. */
    const modelBaris = rec.agenId ? (o.message && o.message.model) || '' : modelSesi.get(nyata);
    riwayatCatat(Number.isFinite(ts) ? ts : Date.now(), baseName(o.cwd || ''), modelBaris, d, Boolean(rec.agenId));
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
    if (m.permissionMode) modeSesi.set(sesi, String(m.permissionMode).slice(0, 20));
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
/* Telemetri galat halaman (POST /galat, dibaca GET /galat). Hidup DI MEMORI
   saja — 50 terakhir, tidak pernah ke disk — karena isinya cuma pesan galat
   + nama berkas:baris + id event acak yang sedang jalan + nama peramban; itu
   cukup buat tahu "halaman tersandung di event X" dari konsol server tanpa
   membuka devtools, dan tidak cukup berharga untuk bertahan setelah server
   mati. Batas 2 KB: pesan halaman sudah dipotong 200 huruf di sisi klien,
   jadi yang lebih besar dari itu pasti bukan laporan yang kita minta. */
const GALAT_SIMPAN = 50;
const GALAT_MAKS_BYTE = 2 * 1024;
const galatHalaman = [];

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
   — dua-duanya tanpa kunci API. Hasilnya di-cache 10 menit, dan halaman tetap
   jalan normal (jatuh ke hujan-sesekali acak) kalau endpoint ini gagal.

   Ini salah satu dari DUA jalur keluar yang dibuat server ini; satunya lagi
   suara ucap ke OpenRouter di bawah, yang bedanya mati bawaan dan tidak
   pernah jalan sebelum kamu memasang kunci lewat panel ⚙️.

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

/* --------------------------------------------------------- suara ucap ----
   Notifikasi "tugas selesai"/"mohon arahan" diucapkan dengan suara sungguhan,
   bukan TTS bawaan peramban. Klipnya dibuat sekali lewat OpenRouter lalu
   DISIMPAN — kalimatnya cuma berubah di bagian namanya, dan nama pegawai
   jumlahnya berhingga, jadi sesudah beberapa kali pakai (atau sekali tekan
   "panaskan cache") tidak ada lagi panggilan keluar.

   Tiga hal yang bikin fitur ini tidak bisa merusak apa pun:
   - MATI BAWAAN. Tanpa kunci OpenRouter, /ucap menjawab 204 dan halaman
     jatuh ke lonceng earcon-nya sendiri — yang memang tidak butuh jaringan.
   - Kuncinya tidak pernah keluar dari server. Panel cuma diberi tahu ADA/
     TIDAK plus empat huruf terakhir; nilainya sendiri tidak pernah keluar.
   - Gagal apa pun (jaringan, kuota, model dicabut) = 204, bukan 500. Bagi
     halaman, "tidak ada klip" dan "belum diatur" itu keadaan yang sama.

   Endpoint OpenRouter-nya OpenAI-compatible dan membalas byte audio mentah —
   bukan JSON, bukan SSE — jadi cukup fetch polos dan dependencies tetap {}. */
const DIR_SUARA = process.env.AGENT_ROOM_SUARA_DIR || path.join(__dirname, 'suara');
const BERKAS_SUARA = process.env.AGENT_ROOM_SUARA || path.join(__dirname, 'suara.json');
/* Kunci dipisah dari suara.json supaya suara.json aman di-`cat` kapan saja.
   Mode 0600 berlaku di POSIX; di Windows yang berlaku ACL folder induknya —
   dan itu memang sudah cukup untuk berkas sekecil ini. */
const BERKAS_SUARA_KUNCI = process.env.AGENT_ROOM_SUARA_KUNCI
  || path.join(__dirname, '.agent-room-suara-kunci');

/* Alamat tujuannya boleh ditimpa lewat env. Dua gunanya: uji-suara.mjs
   mengarahkannya ke OpenRouter palsu di localhost (uji tidak boleh pernah
   benar-benar keluar jaringan), dan kamu bisa menunjuk endpoint
   OpenAI-compatible sendiri kalau punya. Sengaja env, BUKAN panel: mengganti
   ke mana kuncimu dikirim bukan setelan sehari-hari, dan tidak boleh bisa
   diubah oleh apa pun yang datang dari halaman. */
const SUARA_URL = process.env.AGENT_ROOM_SUARA_URL
  || 'https://openrouter.ai/api/v1/audio/speech';
const SUARA_MODEL_URL = process.env.AGENT_ROOM_SUARA_MODEL_URL
  || 'https://openrouter.ai/api/v1/models?output_modalities=speech';
const SUARA_TEKS_MAKS = 200;                // kalimat notifikasi itu pendek; ini pagar biaya
const SUARA_KLIP_MAKS = 4 * 1024 * 1024;    // satu klip wajar < 100 KB; ini pagar kalau model salah
const SUARA_TIMEOUT_MS = 20000;
const SUARA_PANASI_MAKS = 64;               // batas satu kali "panaskan cache"

/* Bawaan dipilih dari daftar TTS OpenRouter yang sungguhan, bukan dikira-kira:
   Gemini Flash TTS satu-satunya yang nama voice-nya netral bahasa (Zephyr,
   Puck, Kore, …) dan modelnya memang multibahasa. Hampir semua model TTS lain
   di sana nama voice-nya bertanda bahasa — `-en`, `en_paul_*`, `English_*`,
   `en-US-*` — alias Inggris duluan, dan kalimat kita bahasa Indonesia.
   Harganya juga paling murah di daftar itu.

   `preview` di nama modelnya memang risiko: model preview bisa dicabut. Kalau
   itu terjadi, yang terjadi cuma /ucap balas 204 dan notifikasi kembali ke
   lonceng — lalu kamu pilih model lain dari panel. Tidak ada yang rusak. */
const suara = {
  v: SKEMA.suara,
  aktif: false,
  model: 'google/gemini-3.1-flash-tts-preview',
  voice: 'Zephyr',
  kecepatan: 1,
};
let suaraKunci = '';
/* Dedupe in-flight: tiga sesi selesai berbarengan dengan nama sama tidak boleh
   jadi tiga panggilan berbayar. Kuncinya hash, jadi dua kalimat berbeda tetap
   jalan paralel. */
const suaraJalan = new Map();               // hash -> Promise<Buffer>

const suaraSiap = () => Boolean(suara.aktif && suaraKunci && suara.model);

/* Model/voice/format/kecepatan ikut di-hash: ganti voice = hash beda = klip
   lama tidak pernah kepakai lagi, tanpa perlu invalidasi manual. Berkas
   lamanya sengaja dibiarkan — bolak-balik ganti voice jadi gratis. */
function suaraHash(teks) {
  return crypto.createHash('sha256')
    .update([teks, suara.model, suara.voice, 'mp3', suara.kecepatan].join('\0'))
    .digest('hex').slice(0, 16);
}
const suaraBerkas = (hash) => path.join(DIR_SUARA, hash + '.mp3');

function suaraMuat() {
  try {
    const nilai = fs.readFileSync(BERKAS_SUARA_KUNCI, 'utf8').trim();
    if (nilai) suaraKunci = nilai;
  } catch { /* belum ada: wajar, fiturnya memang mati bawaan */ }

  let teks = '';
  try { teks = fs.readFileSync(BERKAS_SUARA, 'utf8'); }
  catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[agent-room] suara: ' + path.basename(BERKAS_SUARA)
        + ' tidak terbaca (' + err.message + '), memakai setelan bawaan');
    }
    return;
  }
  let o = null;
  try { o = JSON.parse(teks); } catch { o = null; }
  if (!o || typeof o !== 'object') {
    console.warn('[agent-room] suara: isi ' + path.basename(BERKAS_SUARA)
      + ' tidak terbaca sebagai JSON, memakai setelan bawaan');
    return;
  }
  const v = versiSkema(o);
  if (v > SKEMA.suara) {
    console.warn('[agent-room] suara: ' + path.basename(BERKAS_SUARA) + ' ber-v' + v
      + ' (server ini paham v' + SKEMA.suara + '), memakai setelan bawaan');
    return;
  }
  migrasiSuara(o);
  suara.aktif = Boolean(o.aktif);
  if (typeof o.model === 'string' && o.model.trim()) suara.model = clip(o.model.trim(), 120);
  if (typeof o.voice === 'string') suara.voice = clip(o.voice.trim(), 60);
  const k = Number(o.kecepatan);
  if (Number.isFinite(k) && k >= 0.25 && k <= 4) suara.kecepatan = k;
  // Nilai kuncinya TIDAK dicetak — yang dicatat cuma ada/tidaknya.
  console.log('[agent-room] suara ucap: ' + (suara.aktif ? 'nyala' : 'mati')
    + ', model ' + suara.model + (suaraKunci ? ', kunci terpasang' : ', tanpa kunci'));
}

function suaraTulis() {
  const isi = JSON.stringify({
    v: SKEMA.suara, aktif: suara.aktif, model: suara.model,
    voice: suara.voice, kecepatan: suara.kecepatan,
  }, null, 2) + '\n';
  const tmp = BERKAS_SUARA + '.tmp';
  try {
    fs.writeFileSync(tmp, isi);
    fs.renameSync(tmp, BERKAS_SUARA);
    return '';
  } catch (err) { return err.message; }
}

function suaraKunciTulis(nilai) {
  if (!nilai) {
    suaraKunci = '';
    try { fs.unlinkSync(BERKAS_SUARA_KUNCI); } catch { /* memang belum pernah ada */ }
    console.log('[agent-room] kunci suara dihapus');
    return '';
  }
  suaraKunci = nilai;
  try {
    fs.writeFileSync(BERKAS_SUARA_KUNCI, nilai + '\n', { mode: 0o600 });
    console.log('[agent-room] kunci suara dipasang dan diingat di ' + BERKAS_SUARA_KUNCI);
    return '';
  } catch (err) {
    // Gagal menulis bukan alasan membuang kunci yang sudah dipegang: sesi ini
    // tetap bisa bersuara, cuma tidak bertahan sesudah server mati.
    console.log('[agent-room] kunci suara dipasang (gagal ditulis ke berkas)');
    return err.message;
  }
}

/* Isi cache untuk dipajang panel. readdir + stat, bukan berkas indeks
   terpisah: satu sumber kebenaran, tidak ada yang bisa hanyut. */
function suaraIsiCache() {
  let jumlah = 0, byte = 0;
  let nama = [];
  try { nama = fs.readdirSync(DIR_SUARA); } catch { return { jumlah: 0, byte: 0 }; }
  for (const n of nama) {
    if (!n.endsWith('.mp3')) continue;
    try { byte += fs.statSync(path.join(DIR_SUARA, n)).size; jumlah++; }
    catch { /* terhapus di tengah jalan: tidak usah dihitung */ }
  }
  return { jumlah, byte };
}

function suaraKosongkan() {
  let dibuang = 0;
  let nama = [];
  try { nama = fs.readdirSync(DIR_SUARA); } catch { return 0; }
  for (const n of nama) {
    if (!n.endsWith('.mp3')) continue;
    try { fs.unlinkSync(path.join(DIR_SUARA, n)); dibuang++; } catch { /* biarkan */ }
  }
  return dibuang;
}

/* Panggilan sungguhan ke OpenRouter. Melempar kalau gagal — pemanggilnya yang
   memutuskan itu jadi 204 (jalur /ucap) atau pesan di panel (jalur coba). */
async function suaraGenerate(teks) {
  const putus = AbortSignal.timeout
    ? AbortSignal.timeout(SUARA_TIMEOUT_MS)
    : undefined;
  const res = await fetch(SUARA_URL, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + suaraKunci,
      'content-type': 'application/json',
      // dipakai OpenRouter buat atribusi; tidak wajib, tapi sopan
      'x-title': 'agent-room',
    },
    body: JSON.stringify({
      model: suara.model,
      input: teks,
      voice: suara.voice || undefined,
      // WAJIB: bawaannya pcm, yang tidak bisa dimainkan <audio> apa adanya
      response_format: 'mp3',
      speed: suara.kecepatan !== 1 ? suara.kecepatan : undefined,
    }),
    signal: putus,
  });
  if (!res.ok) {
    // badan galat OpenRouter itu JSON; ambil pesannya kalau ada
    let ket = '';
    try {
      const j = JSON.parse(await res.text());
      ket = j?.error?.message || j?.message || '';
    } catch { /* bukan JSON: cukup kodenya */ }
    throw new Error('OpenRouter ' + res.status + (ket ? ': ' + clip(ket, 200) : ''));
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('OpenRouter membalas klip kosong');
  if (buf.length > SUARA_KLIP_MAKS) throw new Error('klip terlalu besar (' + buf.length + ' byte)');
  return buf;
}

/* Jalur utama: cache -> in-flight -> generate. Selalu mengembalikan Buffer
   atau melempar; tidak pernah mengembalikan null diam-diam. */
async function suaraAmbil(teks) {
  const hash = suaraHash(teks);
  const berkas = suaraBerkas(hash);
  try { return fs.readFileSync(berkas); } catch { /* belum ada: lanjut generate */ }

  const jalan = suaraJalan.get(hash);
  if (jalan) return jalan;

  const tugas = (async () => {
    const buf = await suaraGenerate(teks);
    try {
      fs.mkdirSync(DIR_SUARA, { recursive: true });
      // .tmp lalu rename: jangan sampai ada yang menyajikan mp3 setengah tulis
      const tmp = berkas + '.tmp';
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, berkas);
    } catch (err) {
      // Gagal menyimpan bukan gagal berbunyi: klipnya sudah di tangan.
      // Cuma berarti berikutnya digenerate lagi.
      console.warn('[agent-room] suara: klip gagal disimpan (' + err.message + ')');
    }
    return buf;
  })().finally(() => suaraJalan.delete(hash));

  suaraJalan.set(hash, tugas);
  return tugas;
}

/* Kalimat yang diucapkan. Sengaja SATU tempat: halaman tidak boleh mengarang
   kalimat sendiri, supaya isi cache tetap bisa ditebak dan "panaskan cache"
   benar-benar memanaskan yang nanti dipakai. */
const suaraKalimat = {
  selesai: (nama) => 'Izin, ' + (nama ? nama + ' ' : 'tugasnya ') + 'selesai',
  arahan: () => 'Izin, mohon arahan',
};

/* Semua kalimat yang mungkin dipakai roster sekarang — dipakai "panaskan
   cache" dan cuma itu. Nama manual yang belum pernah muncul memang tidak
   ikut; itu yang tersisa jadi generate saat runtime. */
function suaraDaftarKalimat() {
  const keluar = [suaraKalimat.arahan()];
  for (const e of daftarNama().slice(0, SUARA_PANASI_MAKS)) keluar.push(suaraKalimat.selesai(e.nama));
  return keluar;
}

suaraMuat();

/* --- event acak: dipecah per tema di public/event/, disambung di sini ----
   Semua bagian tetap <script> polos yang BERBAGI satu scope global (helper di
   00-dasar.js dipakai bagian berikutnya), jadi yang dikirim ke peramban tetap
   SATU berkas: sambungan berkas-berkas di manifest.json, urutan wajib. Harness
   uji-event.mjs menyambung dengan cara yang persis sama (bacaEventAcak).      */
const EVENT_DIR = path.join(PUBLIC_DIR, 'event');
let eventAcakCache = null;                  // { kunci (mtime tiap berkas), teks }
function bacaEventAcak() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EVENT_DIR, 'manifest.json'), 'utf8'));
  const berkas = manifest.berkas.map((n) => path.join(EVENT_DIR, path.basename(n)));
  const kunci = berkas.map((f) => f + ':' + fs.statSync(f).mtimeMs).join('|');
  if (eventAcakCache && eventAcakCache.kunci === kunci) return eventAcakCache.teks;
  const teks = berkas.map((f) => fs.readFileSync(f, 'utf8')).join('');
  eventAcakCache = { kunci, teks };
  return teks;
}

function serveStatic(req, res, urlPath) {
  if (urlPath === '/event-acak.js') {
    try {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(bacaEventAcak());
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('event acak gagal disambung: ' + err.message);
    }
    return;
  }
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
/* Jawaban yang SUDAH diputuskan, disimpan sebentar sesudah permintaannya
   dicabut dari `izinTunggu`.

   Kenapa perlu: `mcp-izin.mjs` bertanya lewat `/izin/tanya` lalu baru mulai
   long-poll `/izin/tunggu`. Di antara dua langkah itu ada celah, dan kalau
   jawabannya masuk TEPAT di celah itu, rekamannya sudah dihapus waktu poll
   pertama tiba — pollnya dijawab 404, dan mcp-izin menerjemahkan 404 jadi
   TOLAK. Artinya kamu menekan Paraf dan agennya tetap ditolak, diam-diam,
   tanpa jejak yang bisa dilacak. Celahnya sempit (beberapa milidetik) dan
   manusia praktis tidak bisa memenanginya, tapi apa pun yang menjawab
   otomatis bisa — `uji-kendali.mjs` memenanginya di percobaan pertama.

   Cabang `if (p.jawab)` di /izin/tunggu memang sudah dirancang untuk
   keadaan ini; yang membuatnya jadi kode mati adalah penghapusan yang
   terlalu cepat. Peta kecil ini yang menghidupkannya kembali, TANPA
   menahan permintaannya di `izinTunggu` — supaya kartu di halaman tetap
   hilang begitu diparaf. */
const IZIN_JAWAB_SIMPAN_MS = 60 * 1000;
const izinJawaban = new Map();              // id -> { tugas, jawab, kedaluwarsa }
const BERKAS_MCP_IZIN = path.join(__dirname, 'mcp-izin.mjs');

const kunciCocok = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

function ringkasIzin(p) {
  return { id: p.id, sesi: p.sesi, tool: p.tool, ringkasan: p.ringkasan, sejak: p.sejak, risiko: p.risiko || null };
}

/* Menjawab satu permintaan: melepas semua long-poll yang menunggunya, menyiarkan
   `izin-jawab`, dan mencabut keadaan butuh manusia. Dipakai tiga jalur —
   tombol di halaman, timeout 15 menit, dan proses tugas yang keburu berakhir. */
function jawabIzin(p, keputusan, pesan, sumber) {
  if (p.jawab) return;
  clearTimeout(p.timer);
  p.jawab = { keputusan, pesan: clip(pesan || '', 200) };
  izinTunggu.delete(p.id);
  // …tapi jawabannya disimpan sebentar untuk poll yang datang terlambat
  izinJawaban.set(p.id, { tugas: p.tugas, jawab: p.jawab, kedaluwarsa: Date.now() + IZIN_JAWAB_SIMPAN_MS });
  for (const [id, j] of izinJawaban) if (j.kedaluwarsa <= Date.now()) izinJawaban.delete(id);
  const badan = JSON.stringify({ ok: true, ...p.jawab });
  for (const res of p.penunggu) {
    try { res.writeHead(200, { 'content-type': 'application/json' }); res.end(badan); } catch { /* sudah putus */ }
  }
  p.penunggu.clear();
  const ev = {
    id: ++seq, ts: Date.now(), kind: 'izin-jawab', session: p.sesi,
    nama: namaSesi.get(p.sesi) || '', tool: p.tool, ok: keputusan === 'paraf',
    keputusan, sumber, paraf: { id: p.id, tool: p.tool },
    // berapa lama permintaan ini menunggu sebelum dijawab, dalam detik
    tunggu: Math.max(0, Math.round((Date.now() - p.sejak) / 1000)),
    ...(p.risiko && p.risiko.tingkat !== 'rendah' ? { risiko: p.risiko } : {}),
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
     env proses claude (di bawah) dan diwarisi proses MCP
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
    // Kunci izin lewat env, tidak pernah lewat argv: baris perintah proses
    // bisa dibaca proses lain di mesin yang sama, isi env-nya tidak.
    const lingkungan = { ...process.env };
    if (kunciIzin) lingkungan.AGENT_ROOM_KUNCI_IZIN = kunciIzin;
    // Skrip pemeran dijalankan lewat node; biner sungguhan tetap langsung.
    // Lihat CLAUDE_SKRIP — seam untuk uji, bukan kuasa baru.
    anak = spawn(CLAUDE_SKRIP ? process.execPath : CLAUDE,
                 CLAUDE_SKRIP ? [CLAUDE, ...args] : args, {
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
      + 'tempat perintah claude normal jalan, atau start dengan env-nya diisi: '
      + 'CLAUDE_CODE_OAUTH_TOKEN=... node server.mjs --izinkan-perintah');
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

/* Satu jalur untuk payload hook, dari mana pun datangnya: POST /event
   langsung, atau kotak surat tunda yang dipungut belakangan. `opsi.ts`
   (tunda) mengembalikan waktu asli event supaya agenda/buku induk mencatat
   kapan kejadiannya, bukan kapan servernya nyala lagi. */
function terimaEvent(raw, opsi = {}) {
  const ev = normalize(raw);
  if (opsi.mesin) ev.mesin = opsi.mesin;
  if (opsi.tunda) {
    ev.tunda = true;
    if (Number.isFinite(opsi.ts) && opsi.ts > 0) ev.ts = opsi.ts;
  }
  tandaiHidup(ev.session);
  /* Pola berputar-putar dihitung dari kejadian HIDUP saja. Event yang
     diserap dari kotak surat offline datang berjam-jam terlambat dan
     berurutan rapat, jadi ia akan memalsukan pengulangan yang tidak pernah
     terjadi — preseden yang sama dengan laporKeluar() di bawah. */
  if (!opsi.tunda) {
    const putar = periksaPutar(ev, raw);
    if (putar) ev.putar = putar;
  }
  /* Pelantikan pegawai tetap dulu, baru kegiatannya diumumkan: halaman harus
     tahu siapa orangnya sebelum melihat apa yang dikerjakannya. Event 'nama'
     terbit sekali per penempatan dan SENGAJA tidak masuk buku agenda sama
     sekali (lihat AGENDA_KIND_TOLAK): tiap baris agenda sudah membawa field
     `nama` sendiri, jadi barisnya tidak menambah keterangan apa pun waktu
     diputar ulang — cuma menggemukkan berkas harian.

     Nomornya DITUKAR, bukan diambil dari ujung antrean. Yang terbit lebih
     dulu harus ber-id lebih kecil: susulan Last-Event-ID bersandar pada
     invarian "urutan publish = urutan id" (`ring.filter(e => e.id > since)`),
     jadi kalau pengumuman namanya bernomor lebih besar, klien yang putus
     tepat di sela dua publish ini akan meminta id > id-pengumuman dan
     kehilangan event pemicunya untuk selamanya. Dua-duanya tetap unik dan
     menaik. */
  const tetap = pegawaiTetapPasang(ev);
  if (tetap) {
    if (!ev.nama) ev.nama = tetap.nama;
    if (!ev.peran && tetap.peran) ev.peran = tetap.peran;
    const idPengumuman = ev.id;
    ev.id = ++seq;
    publish({ id: idPengumuman, ts: ev.ts, kind: 'nama', session: ev.session, cwd: ev.cwd,
              nama: tetap.nama, peran: tetap.peran || '', jk: jkDari(tetap.nama),
              tetap: { slot: tetap.slot, sejak: tetap.sejak, baru: tetap.baru },
              tool: null, label: '', ok: true });
  }
  catatSesiHidup(ev);
  publish(ev);
  // nota dinas keluar hanya untuk yang baru terjadi: event yang tertunda
  // berjam-jam bukan bahan lapor "sedang tertahan"
  if (!opsi.tunda) laporKeluar(ev);          // hanya kalau AGENT_ROOM_LAPOR diisi
  // Top tool/top proyek buat kliping mingguan: murni MEMBACA field yang
  // normalize() sudah hitung, tidak menulis balik ke ev/ring/tokenSesi
  // apa pun. kind:'pre' dipilih supaya tepat satu hitungan per tool call
  // (beda dari 'post' yang bercabang ke PostToolUseFailure).
  if (ev.kind === 'pre' && ev.tool) klipingCatatTool(ev.ts, ev.session, ev.tool, ev.cwd);
  // Buku induk pegawai: karier per folder proyek, hanya dari hook nyata di sini
  bukuIndukCatat(ev);
  /* Jalur transkrip cuma diketahui dari sini. Waktu sesinya habis
     pemantauannya tidak langsung dicabut: kalimat penutup agen sering baru
     mendarat di berkas beberapa saat sesudah hook terakhir. Event tunda
     tidak membuka pemantau: sesinya sudah lewat, isinya sudah basi. */
  if (ev.kind === 'session-end') {
    // sesudah publish, supaya event pamitnya masih membawa nama orangnya
    pegawaiLepas(ev.session);
    setTimeout(() => lepasTranskrip(ev.session), 3000).unref?.();
    // pemantau peserta ikut disapu: kuncinya berprefiks sesi induk
    for (const k of [...transkrip.keys()]) {
      if (k.startsWith(ev.session + '|')) setTimeout(() => lepasTranskrip(k), 3000).unref?.();
    }
  } else if (!opsi.tunda) {
    pantauTranskrip(ev.session, jalurTranskrip(raw));
    /* Peserta rapat menulis transkripnya sendiri di berkas terpisah, dan
       `SubagentStart` tidak membawa jalurnya — jadi ia direkonstruksi. Berkasnya
       bisa belum lahir waktu hook ini tiba, jadi dicoba ulang beberapa kali
       dengan jeda pendek; `fs.watchFile` sendiri toleran terhadap berkas yang
       belum ada, yang belum toleran cuma pencarian folder run workflow-nya. */
    if (ev.kind === 'subagent-start' && ev.agenId) {
      const kunci = ev.session + '|' + ev.agenId;
      const coba = (sisa) => {
        if (transkrip.has(kunci)) return;
        const jalur = jalurTranskripPeserta(raw, ev.agenId);
        if (jalur) pantauTranskrip(kunci, jalur, { sesi: ev.session, agenId: ev.agenId, agen: ev.agen || '' });
        if (!transkrip.has(kunci) && sisa > 0) setTimeout(() => coba(sisa - 1), 700).unref?.();
      };
      coba(3);
    }
    if (ev.kind === 'subagent-stop' && ev.agenId) {
      // kalimat penutupnya sering mendarat sesudah hook, seperti sesi induk
      const kunci = ev.session + '|' + ev.agenId;
      setTimeout(() => lepasTranskrip(kunci), 3000).unref?.();
    }
  }
  return ev;
}

/* ------------------------------------------- kotak surat hook offline ----
   Hook curl memakai `-T -` dan cabang `|| node hook.mjs --tunda`: waktu
   server ini mati, payload mentah ditulis ke ~/.agent-room/tunda/<ts>-<acak>.json
   (lihat hook.mjs). Di sini dipungut: saat start dan tiap TUNDA_JEDA_MS,
   diurutkan menurut ts di nama berkas, diserap lewat terimaEvent() yang
   sama dengan /event (ev.tunda = true, ts asli), lalu berkasnya dihapus.
   Yang lebih tua dari 24 jam dibuang tanpa dibaca. Isinya payload mentah —
   termasuk tool_response — jadi ini satu-satunya tempat di luar transkrip
   Claude Code sendiri yang menyimpan isi kerja di disk; umurnya sehari. */
const TUNDA_DIR = process.env.AGENT_ROOM_TUNDA_DIR || path.join(os.homedir(), '.agent-room', 'tunda');
const TUNDA_JEDA_MS = 60 * 1000;
const TUNDA_UMUR_MS = 24 * 3600 * 1000;
const TUNDA_MAKS_BERKAS = 500;
const TUNDA_RX = /^(\d{13})-[a-z0-9]{1,12}\.json$/;
let tundaTerserap = 0;                      // sepanjang proses; ke /metrics

function tundaHitung() {
  try { return fs.readdirSync(TUNDA_DIR).filter((n) => TUNDA_RX.test(n)).length; } catch { return 0; }
}

function tundaSerap() {
  let nama;
  try { nama = fs.readdirSync(TUNDA_DIR); } catch { return; }   // folder belum ada: belum pernah offline
  const kini = Date.now();
  const berkas = [];
  let dibuang = 0;
  for (const n of nama) {
    const m = TUNDA_RX.exec(n);
    if (!m) continue;
    const ts = Number(m[1]);
    if (kini - ts > TUNDA_UMUR_MS) { try { fs.unlinkSync(path.join(TUNDA_DIR, n)); dibuang++; } catch {} continue; }
    berkas.push({ ts, jalur: path.join(TUNDA_DIR, n) });
  }
  berkas.sort((a, b) => a.ts - b.ts);
  // lebih dari batas: yang paling tua dibuang, sisanya diserap — batas yang
  // sama dengan penulisnya, supaya folder yang ditulis versi hook lain pun terjaga
  while (berkas.length > TUNDA_MAKS_BERKAS) { try { fs.unlinkSync(berkas.shift().jalur); dibuang++; } catch { berkas.shift(); } }
  let diserap = 0, rusak = 0;
  for (const b of berkas) {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(b.jalur, 'utf8')); } catch { rusak++; }
    if (raw && typeof raw === 'object') {
      try { terimaEvent(raw, { tunda: true, ts: b.ts }); diserap++; } catch (err) { rusak++; }
    }
    try { fs.unlinkSync(b.jalur); } catch {}
  }
  tundaTerserap += diserap;
  if (diserap || rusak || dibuang) {
    console.log('[agent-room] kotak surat tunda: ' + diserap + ' event diserap'
      + (rusak ? ', ' + rusak + ' rusak' : '') + (dibuang ? ', ' + dibuang + ' dibuang (lebih tua dari 24 jam / melebihi batas)' : '')
      + ' (' + TUNDA_DIR + ')');
  }
}
setInterval(tundaSerap, TUNDA_JEDA_MS).unref?.();

/* ------------------------------------------------------- /metrics ------
   Format exposition Prometheus (text/plain; version=0.0.4). Tanpa token,
   seperti /health — penjaga Host di depan tetap berlaku. Nama proyek
   sengaja TIDAK jadi label kecuali AGENT_ROOM_METRICS_PROYEK=1: kardinalitas
   di sisi pengumpul, dan nama folder itu metadata yang tidak perlu keluar
   bersama angka. */
const METRICS_PROYEK = String(process.env.AGENT_ROOM_METRICS_PROYEK || '').trim() === '1';
const metrikLabel = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
function metrikTeks() {
  const baris = [];
  const metrik = (nama, tipe, help, nilai) => {
    baris.push('# HELP ' + nama + ' ' + help, '# TYPE ' + nama + ' ' + tipe);
    for (const [label, v] of nilai) baris.push(nama + (label ? '{' + label + '}' : '') + ' ' + (Number.isFinite(v) ? v : 0));
  };
  const potret = potretRuangan();
  const butuh = potret.sesi.filter((s) => s.butuh).length;
  const macet = potret.sesi.filter((s) => s.macet).length;
  const hariIni = riwayatHarian.get(tanggalLokal(Date.now())) || { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 };
  const JENIS = [['input', 'input'], ['output', 'output'], ['cache_tulis', 'cacheTulis'], ['cache_baca', 'cacheBaca']];
  const token = (sumber, perProyek) => {
    const keluar = [];
    for (const [jenis, k] of JENIS) keluar.push(['jenis="' + jenis + '"', sumber[k] || 0]);
    if (METRICS_PROYEK && perProyek) {
      for (const [nama, p] of perProyek) {
        for (const [jenis, k] of JENIS) {
          if (p[k] === undefined) continue;
          keluar.push(['jenis="' + jenis + '",proyek="' + metrikLabel(nama) + '"', p[k] || 0]);
        }
      }
    }
    return keluar;
  };
  metrik('agent_room_events_total', 'counter', 'Event yang disiarkan lewat publish() sejak proses hidup.', [['', metrikEventTotal]]);
  metrik('agent_room_viewers', 'gauge', 'Klien SSE /stream yang sedang tersambung.', [['', clients.size]]);
  metrik('agent_room_sesi_hidup', 'gauge', 'Sesi Claude Code yang masih mengirim hook (jendela 3 jam).', [['', potret.sesi.length]]);
  /* Berapa sesi hidup di tiap mode kuasa. Kardinalitasnya kecil dan tetap
     (enum CLI), jadi aman jadi label — beda dari nama proyek. */
  const perMode = new Map();
  for (const s of potret.sesi) {
    const m = s.mode || 'tak-diketahui';
    perMode.set(m, (perMode.get(m) || 0) + 1);
  }
  metrik('agent_room_sesi_mode', 'gauge', 'Sesi hidup menurut mode izinnya (permission_mode).',
    [...perMode].map(([m, n]) => ['mode="' + m + '"', n]));
  /* Rasio TERTINGGI di antara sesi hidup: yang ingin dipantau orang adalah
     'apakah ADA sesi yang hampir kehilangan ingatan', bukan rata-ratanya. */
  const rasioMaks = potret.sesi.reduce((m, s) => Math.max(m, (s.konteks && s.konteks.rasio) || 0), 0);
  /* Berapa permintaan paraf menurut tingkat risikonya. Cuma jalur paraf —
     yang memang terhitung; label "langsung" akan berbohong karena perintah
     yang sudah diizinkan lewat settings tidak pernah memicu PermissionRequest. */
  const perRisiko = new Map();
  for (const p of izinTunggu.values()) {
    const t = (p.risiko && p.risiko.tingkat) || 'rendah';
    perRisiko.set(t, (perRisiko.get(t) || 0) + 1);
  }
  metrik('agent_room_izin_menunggu', 'gauge', 'Permintaan paraf yang masih menunggu dijawab, menurut tingkat risikonya.',
    [...perRisiko].map(([t, n]) => ['tingkat="' + t + '"', n]));
  metrik('agent_room_konteks_rasio', 'gauge', 'Rasio jendela konteks terpenuh di antara sesi hidup (1.0 = penuh).', [['', rasioMaks]]);
  metrik('agent_room_peserta_hidup', 'gauge', 'Subagent yang masih tercatat hidup di bawah sesi induknya.', [['', potret.delegasi.hidup]]);
  metrik('agent_room_peserta_diam', 'gauge', 'Subagent hidup yang tidak terdengar lebih dari sepuluh menit.', [['', potret.delegasi.diam]]);
  metrik('agent_room_sesi_tertahan', 'gauge', 'Sesi hidup yang tertahan: butuh manusia atau macet karena galat.',
    [['jenis="butuh"', butuh], ['jenis="macet"', macet]]);
  metrik('agent_room_antrean', 'gauge', 'Disposisi yang menunggu giliran dijalankan (kendali web).', [['', antrean.length]]);
  metrik('agent_room_tugas_jalan', 'gauge', 'Sesi headless yang sedang dijalankan dari halaman (kendali web).', [['', jalan.size]]);
  metrik('agent_room_token_total', 'counter', 'Token sepanjang masa dari riwayat lintas sesi.',
    token(riwayatTotal, riwayatProyek));
  metrik('agent_room_token_hari_ini', 'gauge', 'Token hari ini (kalender lokal server) dari riwayat lintas sesi.',
    token(hariIni, hariIni.proyek ? Object.entries(hariIni.proyek) : null));
  /* Pagu anggaran token — hanya kalau pagu.json memang ada. Tanpa berkas itu
     /metrics tidak boleh memuat satu baris pagu pun (janji 1 di blok pagu).
     Rasio, bukan angka mentah: 1.0 = pas pagu, jadi satu alert rule berlaku
     untuk semua proyek berapa pun pagunya. Nama proyek tetap tunduk pada
     aturan METRICS_PROYEK yang sudah berlaku di fungsi ini.

     KETIGA ANGKA AGREGAT DIAMBIL DARI HIMPUNAN PENUH (rp.jumlah/rp.lewat/
     rp.maks), bukan dari rp.proyek yang sudah dipotong 20 baris untuk
     tampilan. Gauge yang jenuh di 20 diam-diam mengecilkan justru waktu
     keadaannya paling buruk — dan itu persis kebalikan dari gunanya alert.
     Seri BERLABEL boleh tetap 20 teratas: di sana yang dijaga kardinalitas,
     dan daftarnya sudah diurut rasio menurun — tapi seri itu tinggal di NAMA
     METRIK SENDIRI (agent_room_pagu_proyek_*). Satu keluarga yang memuat baris
     agregat telanjang DAN baris per-proyek membuat sum() menghitung totalnya
     dua kali: 25 proyek terlampaui terbaca 45. Aturan di sini: satu nama
     metrik = satu tingkat agregasi.

     Nama juga harus menjanjikan yang benar-benar dihitung. agent_room_pagu_
     proyek dulu berisi himpunan laporan minggu berjalan sambil ber-HELP
     "proyek yang punya pagu" — dengan `bawaan` terisi, angkanya jatuh ke 0
     tiap Senin pagi tanpa satu huruf pun berubah di pagu.json, dan gauge 0
     gampang dibaca sebagai "pagu tidak aktif". Sekarang tiga hal itu tiga
     metrik: konfigurasi (proyek + bawaan), dan yang week-scoped (_aktif). */
  if (pagu) {
    const rp = paguRingkas();
    const bulat = (v) => Math.round(v * 10000) / 10000;
    const rasio = (p) => (p.pagu > 0 ? bulat(p.pakai / p.pagu) : 0);
    const label = (p) => 'proyek="' + metrikLabel(p.nama) + '"';
    metrik('agent_room_pagu_proyek', 'gauge',
      'Proyek yang diberi pagu token eksplisit di pagu.json (angka konfigurasi, bukan pemakaian).',
      [['', pagu.berpagu]]);
    metrik('agent_room_pagu_bawaan', 'gauge',
      'Pagu token bawaan untuk proyek yang tidak disebut di pagu.json (0 = tidak ada pagu bawaan).',
      [['', pagu.bawaan]]);
    metrik('agent_room_pagu_proyek_aktif', 'gauge',
      'Proyek berpagu yang masuk laporan minggu berjalan: yang dipagu eksplisit,'
      + ' plus yang memakai pagu bawaan dan menyerap token minggu ini.', [['', rp.jumlah]]);
    metrik('agent_room_pagu_serapan_rasio', 'gauge',
      'Serapan pagu minggu berjalan sebagai rasio token terpakai / pagu (1.0 = pas pagu).',
      [['agregat="maks"', bulat(rp.maks)]]);
    metrik('agent_room_pagu_terlampaui', 'gauge', 'Proyek yang serapan minggu ininya sudah melewati pagu.',
      [['', rp.lewat]]);
    /* Bukan hiasan: angka inilah yang membuat cache laporan pagu bisa
       DITAGIH dari luar (lihat catatan di paguRingkas). Naik sekali per
       hitung penuh — kalau naik tiap scrape, cachenya sudah tidak bekerja. */
    metrik('agent_room_pagu_hitung_penuh_total', 'counter',
      'Berapa kali laporan pagu dihitung penuh (lintasan 7 hari riwayat) sejak proses hidup;'
      + ' scrape di antara dua giliran memakai hasil yang sudah ada.', [['', paguHitungPenuh]]);
    if (METRICS_PROYEK) {
      metrik('agent_room_pagu_proyek_serapan_rasio', 'gauge',
        'Serapan pagu minggu berjalan per proyek (' + PAGU_RINGKAS_MAX + ' teratas menurut rasio).',
        rp.proyek.map((p) => [label(p), rasio(p)]));
      metrik('agent_room_pagu_proyek_terlampaui', 'gauge',
        'Per proyek (' + PAGU_RINGKAS_MAX + ' teratas menurut rasio): 1 = serapan minggu ini melewati pagu.',
        rp.proyek.map((p) => [label(p), rasio(p) >= 1 ? 1 : 0]));
    }
  }
  metrik('agent_room_galat_halaman', 'gauge', 'Laporan galat halaman yang tersimpan di memori (POST /galat, maks ' + GALAT_SIMPAN + ').',
    [['', galatHalaman.length]]);
  metrik('agent_room_sse_dibuang_total', 'counter', 'Event yang dibuang dari antrean klien SSE lambat (rem SSE).', [['', sseDibuangTotal]]);
  metrik('agent_room_sse_dilebur_total', 'counter', 'Event token yang digantikan yang lebih baru selagi antre (bukan kehilangan: angkanya kumulatif).', [['', sseDileburTotal]]);
  metrik('agent_room_sse_diputus_total', 'counter', 'Klien SSE yang diputus karena macet lebih dari ' + (SSE_MACET_MS / 1000) + ' detik.', [['', sseDiputus]]);
  metrik('agent_room_tunda_berkas', 'gauge', 'Berkas di kotak surat hook offline yang belum dipungut.', [['', tundaHitung()]]);
  metrik('agent_room_tunda_diserap_total', 'counter', 'Event dari kotak surat hook offline yang diserap sejak proses hidup.', [['', tundaTerserap]]);
  metrik('agent_room_uptime_seconds', 'gauge', 'Umur proses server dalam detik.', [['', Math.round(process.uptime())]]);
  return baris.join('\n') + '\n';
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
      terimaEvent(JSON.parse(body.teks || '{}'), { mesin });
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
    // ?tanpa=pikir,token — kind yang tidak mau diterima klien ini (rem SSE)
    const tanpa = new Set(String(url.searchParams.get('tanpa') || '').split(',').map((s) => s.trim()).filter(Boolean));
    for (const ev of ring.filter((e) => e.id > since && !tanpa.has(e.kind)).slice(-60)) {
      res.write(sseFrame(ev));
    }
    sseDaftar(res, tanpa);
    const beat = setInterval(() => sseDetak(res), 20000);
    req.on('close', () => { clearInterval(beat); sseLepas(res); });
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
        /* Nama yang dipilih manusia menempel di KURSI, bukan cuma di sesi ini:
           besok pegawai yang sama dipanggil begitu lagi. Mengosongkan nama
           berarti "kembali ke nama undian", BUKAN "pegawainya jadi anonim" —
           makanya namaSesi diisi ulang, bukan dibiarkan kosong. Sesi tanpa
           kursi (tenaga kontrak dari halaman) tetap seperti dulu: memori saja. */
        const k = pegawaiSlot(sesi);
        if (k) {
          if (nama) { k.slot.nama = clip(nama, 24); k.slot.manual = true; }
          else {
            k.slot.manual = false;
            k.slot.nama = pegawaiUndi(k.proyek, k.i, namaDipakai(k.kursi, k.i));
            namaSesi.set(sesi, k.slot.nama);
          }
          formasiKotor = true;
          formasiJadwalkanTulis();
        }
        publish({ id: ++seq, ts: Date.now(), kind: 'nama', session: sesi,
                  nama: namaSesi.get(sesi) || '', jk: jkDari(namaSesi.get(sesi) || ''), tool: null, label: '', ok: true });
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  /* ---------- daftar nama pegawai ----------
     Rute tulis di bawah ini sengaja TIDAK meminta TOKEN, cuma asalSah() —
     sama seperti /nama, /peran, dan /ambien. TOKEN itu penjaga jalur yang
     MELAHIRKAN SESI (--izinkan-perintah), dan menuntutnya di sini berarti
     panel ⚙️ cuma bisa dipakai kalau servernya dijalankan dengan flag itu.
     Setelan ruangan harus bisa diatur dari ruangan. */
  /* Timpaan jenis kelamin dari kartu pegawai. Menempel di NAMA, bukan di
     sesi: besok orang yang sama digambar sama, di tab mana pun, dan sesi
     terminal yang kebetulan bernama sama ikut. Kiriman selain 'L'/'P'
     (termasuk '') berarti cabut timpaannya — kembali ke tebakan nama.
     Tanpa TOKEN, sekelas /nama dan /peran: ini setelan rupa ruangan, bukan
     jalur yang melahirkan sesi. */
  if (url.pathname === '/jk' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    try {
      const { sesi, nama: namaLangsung, jk } = JSON.parse(body || '{}');
      const nama = clip(String(namaLangsung || (sesi ? namaSesi.get(sesi) : '') || ''), 24);
      const k = jkKunci(nama);
      if (!k) { res.writeHead(400).end(); return; }
      if (jk === 'L' || jk === 'P') namaDaftar.jk[k] = jk;
      else delete namaDaftar.jk[k];
      const galat = namaTulis();
      /* Disiarkan supaya tab lain ikut berubah tanpa reload. Yang dikirim
         NAMA-nya, bukan sesi: satu nama bisa dipakai beberapa kursi. */
      publish({ id: ++seq, ts: Date.now(), kind: 'jk', session: sesi || '',
                nama, jk: jkDari(nama), tool: null, label: '', ok: true });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, nama, jk: jkDari(nama), tebakan: tebakJk(nama),
        pesan: galat ? 'dipakai, tapi gagal ditulis ke berkas: ' + galat : '' }));
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  if (url.pathname === '/nama/daftar' && req.method === 'GET') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({
      penuh: namaDaftar.penuh,
      jk: namaDaftar.jk,
      bawaan: NAMA_BAWAAN,
      pakaiBawaan: namaDaftar.penuh.length === 0,
      maks: NAMA_MAKS,
      penugasan: penugasan(),
      // env menang atas berkas; panel perlu tahu supaya tidak menawarkan
      // saklar yang tidak akan berpengaruh apa-apa
      penugasanTerkunci: PENUGASAN_SAH.has(PENUGASAN_ENV),
    }));
    return;
  }

  if (url.pathname === '/nama/daftar' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    let p;
    try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }
    /* Daftar kosong BUKAN galat: itu cara mengembalikan daftar bawaan.
       Dibedakan dari "belum pernah diatur" cuma oleh ada/tidaknya berkas. */
    namaDaftar.penuh = namaBersih(p.penuh);
    /* Peta jk dikirim UTUH tiap simpan, bukan tambal-sulam: panelnya memang
       menampilkan seluruh daftar sekaligus, jadi menghapus baris = mencabut
       timpaannya. Kalau field-nya tidak ada sama sekali, yang lama dibiarkan
       — itu bedanya panel lama (tanpa kolom jk) dari panel yang mengosongkan. */
    if (p.jk !== undefined) namaDaftar.jk = jkBersih(p.jk);
    if (p.penugasan === 'tetap' || p.penugasan === 'acak') namaDaftar.penugasan = p.penugasan;
    const galat = namaTulis();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, jumlah: namaDaftar.penuh.length,
      jk: namaDaftar.jk,
      pakaiBawaan: namaDaftar.penuh.length === 0,
      berjabatan: namaDaftar.penuh.filter((e) => e.peran).length,
      penugasan: penugasan(),
      penugasanTerkunci: PENUGASAN_SAH.has(PENUGASAN_ENV),
      pesan: galat ? 'daftar dipakai, tapi gagal ditulis ke berkas: ' + galat : '',
    }));
    return;
  }

  /* Undi ulang nama kursi yang BUKAN pilihan manusia. Tanpa tombol ini,
     mengganti daftar nama tidak kelihatan apa-apa — nama menempel di kursi
     (formasi.json), dan daftar cuma dipakai waktu kursi baru lahir. Kursi
     ber-`manual: true` tidak pernah disentuh: itu nama yang kamu ketik
     sendiri lewat kartu pegawai. */
  if (url.pathname === '/nama/undi-ulang' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    let diganti = 0, dilewati = 0;
    for (const [proyek, kursi] of Object.entries(formasi.proyek)) {
      if (!Array.isArray(kursi)) continue;
      kursi.forEach((k, i) => {
        if (!k) return;
        if (k.manual) { dilewati++; return; }
        /* Ikut mode yang sedang berlaku: di 'acak' tombol ini berarti
           "kocok sekarang", di 'tetap' berarti "hitung ulang undian dengan
           daftar yang baru". Dua-duanya yang diharapkan orang waktu menekannya. */
        let baru, peranBaru = null;
        if (penugasan() === 'acak') {
          const orang = pegawaiAcak(namaDipakai(kursi, i));
          if (!orang) return;
          baru = orang.nama;
          if (!k.peranManual) peranBaru = orang.peran || '';
        } else {
          baru = pegawaiUndi(proyek, i, namaDipakai(kursi, i));
        }
        const namaGanti = Boolean(baru) && baru !== k.nama;
        const peranGanti = peranBaru !== null && peranBaru !== k.peran;
        if (!namaGanti && !peranGanti) return;
        if (namaGanti) k.nama = baru;
        if (peranGanti) k.peran = peranBaru;
        diganti++;
        /* Kursi yang sedang diduduki harus ikut berganti SEKARANG di semua
           halaman yang terbuka — kalau tidak, sprite-nya baru berganti nama
           besok waktu sesinya lahir lagi. Jabatan disiarkan terpisah karena
           halaman memang menanganinya lewat event `peran`, bukan `nama`. */
        if (k.penghuni) {
          if (namaGanti) {
            namaSesi.set(k.penghuni, k.nama);
            publish({ id: ++seq, ts: Date.now(), kind: 'nama', session: k.penghuni,
                      nama: k.nama, tool: null, label: '', ok: true });
          }
          if (peranGanti) {
            if (k.peran) peranSesi.set(k.penghuni, k.peran); else peranSesi.delete(k.penghuni);
            publish({ id: ++seq, ts: Date.now(), kind: 'peran', session: k.penghuni,
                      peran: k.peran, tool: null, label: '', ok: true });
          }
        }
      });
    }
    if (diganti) { formasiKotor = true; formasiTulis(true); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, diganti, dilewati }));
    return;
  }

  /* ---------- suara ucap ----------
     Inti fiturnya. 204 di sini BUKAN galat, dan halaman memang tidak
     memperlakukannya begitu: "belum diatur", "kuncinya salah", "OpenRouter
     sedang mati", dan "teksnya kosong" semuanya berujung sama — tidak ada
     klip, pakai lonceng saja. Satu-satunya jalur yang melaporkan sebab galat
     ke manusia adalah /suara/coba, tempat manusianya memang sedang menunggu
     jawaban. */
  if (url.pathname === '/ucap' && req.method === 'GET') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const teks = clip((url.searchParams.get('teks') || '').replace(/\s+/g, ' ').trim(), SUARA_TEKS_MAKS);
    if (!teks || !suaraSiap()) { res.writeHead(204).end(); return; }
    try {
      const buf = await suaraAmbil(teks);
      /* Sengaja no-cache + ETag, BUKAN immutable: URL-nya cuma memuat teks,
         jadi klip yang sama bisa berganti isi kalau model/voice-nya kamu
         ubah. Revalidasi ke localhost harganya sepersekian milidetik dan
         balasannya 304 tanpa badan — jauh lebih murah daripada memutar suara
         lama dengan voice yang sudah kamu ganti. */
      const etag = '"' + suaraHash(teks) + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }).end(); return; }
      res.writeHead(200, {
        'content-type': 'audio/mpeg',
        'content-length': buf.length,
        etag,
        'cache-control': 'private, no-cache',
      });
      res.end(buf);
    } catch (err) {
      console.warn('[agent-room] suara: ' + err.message);
      res.writeHead(204).end();
    }
    return;
  }

  if (url.pathname === '/suara/setelan' && req.method === 'GET') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const isi = suaraIsiCache();
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    // Nilai kuncinya tidak pernah keluar — cuma ada/tidak plus empat huruf
    // terakhir, supaya kamu bisa memastikan yang terpasang kunci yang mana.
    res.end(JSON.stringify({
      aktif: suara.aktif, model: suara.model, voice: suara.voice, kecepatan: suara.kecepatan,
      punyaKunci: Boolean(suaraKunci),
      kunciEkor: suaraKunci ? suaraKunci.slice(-4) : '',
      siap: suaraSiap(),
      cache: isi,
      contoh: suaraKalimat.selesai('Sri Rahayu'),
    }));
    return;
  }

  if (url.pathname === '/suara/setelan' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    let p;
    try { p = JSON.parse(body || '{}'); } catch { res.writeHead(400).end(); return; }

    let pesanKunci = '';
    // `kunci` tidak dikirim = jangan disentuh; '' = hapus; teks = pasang.
    if (typeof p.kunci === 'string') {
      const nilai = p.kunci.trim();
      if (nilai && (/\s/.test(nilai) || nilai.length > 500)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, pesan: 'bentuknya tidak seperti kunci' }));
        return;
      }
      pesanKunci = suaraKunciTulis(nilai);
    }
    if (typeof p.aktif === 'boolean') suara.aktif = p.aktif;
    if (typeof p.model === 'string' && p.model.trim()) suara.model = clip(p.model.trim(), 120);
    if (typeof p.voice === 'string') suara.voice = clip(p.voice.trim(), 60);
    const k = Number(p.kecepatan);
    if (Number.isFinite(k) && k >= 0.25 && k <= 4) suara.kecepatan = k;
    /* Menyalakan tanpa kunci itu setelan yang tidak bisa jalan; lebih baik
       ditolak halus di sini daripada diam-diam 204 tiap notifikasi. */
    if (suara.aktif && !suaraKunci) suara.aktif = false;

    const galat = suaraTulis();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, aktif: suara.aktif, siap: suaraSiap(),
      punyaKunci: Boolean(suaraKunci), kunciEkor: suaraKunci ? suaraKunci.slice(-4) : '',
      pesan: pesanKunci ? 'kunci dipakai, tapi gagal ditulis ke berkas: ' + pesanKunci
        : galat ? 'setelan dipakai, tapi gagal ditulis ke berkas: ' + galat : '',
    }));
    return;
  }

  /* Daftar model TTS, diambilkan server supaya halaman tidak perlu tahu
     apa-apa soal OpenRouter. Daftarnya publik — tidak butuh kunci — jadi
     kamu bisa memilih model dulu, memasang kunci belakangan. */
  if (url.pathname === '/suara/model' && req.method === 'GET') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    try {
      const r = await fetch(SUARA_MODEL_URL, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(SUARA_TIMEOUT_MS) : undefined,
      });
      if (!r.ok) throw new Error('OpenRouter ' + r.status);
      const j = await r.json();
      const model = (Array.isArray(j?.data) ? j.data : []).map((m) => ({
        id: String(m?.id || ''),
        nama: String(m?.name || m?.id || ''),
        // bentuk `pricing` beda-beda antar penyedia; diteruskan apa adanya dan
        // halaman yang memutuskan mau menampilkannya atau tidak
        harga: m?.pricing?.audio || m?.pricing?.prompt || '',
        /* Nama voice TIDAK seragam antar penyedia — `Zephyr`, `flux-bree-en`,
           `English_radiant_girl`, `en-US-Harper:MAI-Voice-2` — dan voice yang
           salah bikin permintaan ditolak. Untung daftarnya ikut di metadata
           model, jadi panel bisa menawarkannya alih-alih menyuruh menebak.
           `null` artinya penyedianya menerima voice bebas (Fish Audio), bukan
           artinya tidak punya voice. */
        suara: Array.isArray(m?.supported_voices) ? m.supported_voices.slice(0, 120) : null,
      })).filter((m) => m.id);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
      res.end(JSON.stringify({ ok: true, model }));
    } catch (err) {
      /* Gagal mengambil daftar bukan gagal fatal: panel turun jadi kotak teks
         biasa, ID model tetap bisa diketik manual. */
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, model: [], pesan: clip(err.message, 200) }));
    }
    return;
  }

  /* Audisi. Sengaja TIDAK menuntut `aktif` — gunanya justru mendengar dulu
     sebelum memutuskan menyalakan. Yang dituntut cuma kunci. */
  if (url.pathname === '/suara/coba' && req.method === 'GET') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    if (!suaraKunci || !suara.model) {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, pesan: 'pasang kunci OpenRouter dulu' }));
      return;
    }
    try {
      const buf = await suaraAmbil(suaraKalimat.selesai('Sri Rahayu'));
      res.writeHead(200, {
        'content-type': 'audio/mpeg', 'content-length': buf.length,
        'cache-control': 'private, no-cache',
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, pesan: clip(err.message, 200) }));
    }
    return;
  }

  /* Panaskan cache: buat semua kalimat untuk roster sekarang sekaligus, satu
     per satu (bukan berbarengan) supaya tidak menghantam OpenRouter dan
     supaya kegagalan di tengah tetap menyisakan yang sudah jadi. */
  if (url.pathname === '/suara/panasi' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    if (!suaraKunci || !suara.model) {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, pesan: 'pasang kunci OpenRouter dulu' }));
      return;
    }
    const mulai = Date.now();
    let dibuat = 0, sudah = 0, gagal = 0, pesan = '';
    for (const teks of suaraDaftarKalimat()) {
      if (Date.now() - mulai > 120000) { pesan = 'berhenti di tengah karena kelamaan; tekan lagi untuk melanjutkan'; break; }
      let ada = false;
      try { fs.accessSync(suaraBerkas(suaraHash(teks))); ada = true; } catch { ada = false; }
      if (ada) { sudah++; continue; }
      try { await suaraAmbil(teks); dibuat++; }
      catch (err) { gagal++; if (!pesan) pesan = clip(err.message, 200); }
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, dibuat, sudah, gagal, pesan, cache: suaraIsiCache() }));
    return;
  }

  if (url.pathname === '/suara/cache' && req.method === 'DELETE') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const dibuang = suaraKosongkan();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, dibuang, cache: suaraIsiCache() }));
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
        /* Jabatan pun menempel di kursi. Server sengaja TIDAK pernah mengundi
           jabatan sendiri: daftar id JABATAN hidup di halaman, dan menyalinnya
           ke sini berarti dua daftar yang bisa hanyut. Jadi kursi baru lahir
           tanpa jabatan, dan menetap begitu manusia memilihkannya sekali. */
        const k = pegawaiSlot(sesi);
        if (k) {
          k.slot.peran = peran ? peran : '';
          k.slot.peranManual = !!peran;
          formasiKotor = true;
          formasiJadwalkanTulis();
        }
        publish({ id: ++seq, ts: Date.now(), kind: 'peran', session: sesi,
                  peran: peranSesi.get(sesi) || '', tool: null, label: '', ok: true });
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  /* Ledger kejadian ambient buat arsip kliping mingguan — TERPISAH TOTAL dari
     /event: tidak pernah publish(), tidak pernah masuk ring/SSE/tokenSesi.
     Event ambient tidak pernah menaikkan statistik SESI (lihat DESIGN.md);
     endpoint ini murni tally suasana RUANGAN, bukan laporan sesi, jadi
     arsitekturnya memang harus terpisah, bukan cuma kebetulan. */
  if (url.pathname === '/ambien' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = (await readBody(req)).teks;
    try {
      const { id } = JSON.parse(body || '{}');
      if (typeof id === 'string' && id) klipingCatatAmbien(Date.now(), clip(id, 64));
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  /* Telemetri galat halaman — pasangan laporGalat() di room.js. Dijaga
     asalSah seperti /ambien: hanya halaman dari alamat kantor ini. Yang
     masuk sudah dipotong lagi di sini (clip), bukan mempercayai klien. */
  if (url.pathname === '/galat' && req.method === 'POST') {
    if (!asalSah(req)) { res.writeHead(403).end(); return; }
    const body = await readBody(req, GALAT_MAKS_BYTE);
    if (body.terpotong) { res.writeHead(413).end(); return; }
    let p;
    try { p = JSON.parse(body.teks || '{}'); } catch { res.writeHead(400).end(); return; }
    if (!p || typeof p !== 'object') { res.writeHead(400).end(); return; }
    const g = {
      ts: Number.isFinite(p.ts) ? p.ts : Date.now(),
      pesan: clip(p.pesan, 200),
      sumber: clip(p.sumber, 80),
      event: clip(p.event, 64),
      ua: clip(p.ua, 24),
    };
    if (!g.pesan) { res.writeHead(400).end(); return; }
    galatHalaman.push(g);
    if (galatHalaman.length > GALAT_SIMPAN) galatHalaman.splice(0, galatHalaman.length - GALAT_SIMPAN);
    console.warn('[agent-room] galat halaman: ' + g.pesan
      + (g.sumber ? ' @ ' + g.sumber : '')
      + (g.event ? ' [event ' + g.event + ']' : '')
      + (g.ua ? ' (' + g.ua + ')' : ''));
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    return;
  }
  if (url.pathname === '/galat' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ galat: galatHalaman }));
    return;
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
    /* Dua sumber telaah, yang paling waspada yang berlaku: proses MCP melihat
       input UTUH, server cuma melihat ringkasan 300 karakter. Kalau proses MCP
       versi lama tidak mengirim apa-apa, server tetap punya telaahnya sendiri. */
    const dariMcp = p.risiko && typeof p.risiko === 'object' ? p.risiko : null;
    const dariSini = telaahRisiko(tool, ringkasan);
    const risiko = {
      tingkat: maksTingkat((dariMcp && dariMcp.tingkat) || 'rendah', dariSini.tingkat),
      tanda: [...new Set([...(Array.isArray(dariMcp && dariMcp.tanda) ? dariMcp.tanda : []), ...dariSini.tanda])].slice(0, 4),
    };
    const izin = {
      id: crypto.randomBytes(6).toString('hex'), tugas: String(p.tugas), sesi, tool, ringkasan,
      panggilan: clip(p.tool_use_id || '', 64), sejak: Date.now(), jawab: null, risiko,
      penunggu: new Set(), timer: null,
    };
    izin.timer = setTimeout(() => jawabIzin(izin, 'tolak', 'tidak ada paraf', 'waktu habis'), IZIN_TUNGGU_MS);
    izin.timer.unref?.();
    izinTunggu.set(izin.id, izin);
    // Event yang sama bentuknya dengan izin-minta dari hook, ditambah `paraf`:
    // pose butuh manusia, pengingat terkatung, dan nota dinas keluar semuanya
    // ikut jalan tanpa perlu tahu dari mana izinnya datang.
    /* Jam tunggunya diambil dari `izin.sejak` yang sudah ada, bukan dibuat
       baru: satu permintaan paraf harus punya SATU sumber waktu, kalau tidak
       kartu dan register bisa menyebut dua angka untuk kejadian yang sama. */
    const keadaan = { sebab: 'izin', alasan: ringkasan, label: ringkasan, sejak: izin.sejak };
    butuhManusia.set(sesi, keadaan);
    const ev = {
      id: ++seq, ts: izin.sejak, kind: 'izin-minta', session: sesi,
      nama: namaSesi.get(sesi) || rec.nama, cwd: baseName(rec.cwd),
      ...(rec.cwd ? { cabang: cabangGit(rec.cwd) } : {}),
      tool, label: ringkasan, ok: true, sebab: 'izin', alasan: ringkasan,
      ...(izin.panggilan ? { panggilan: izin.panggilan } : {}),
      paraf: { id: izin.id, tool }, butuh: keadaan,
      ...(izin.risiko && izin.risiko.tingkat !== 'rendah' ? { risiko: izin.risiko } : {}),
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
    const idIzin = url.searchParams.get('id') || '';
    const p = izinTunggu.get(idIzin);
    if (!p || p.tugas !== tugas) {
      /* Sudah dijawab tepat sebelum poll pertama tiba? Jawabannya masih ada.
         404 di sini berarti TOLAK di sisi mcp-izin, jadi keliru sedikit saja
         di tempat ini membalikkan keputusan yang sudah kamu ambil. */
      const j = izinJawaban.get(idIzin);
      if (j && j.tugas === tugas && j.kedaluwarsa > Date.now()) return balas(200, { ok: true, ...j.jawab });
      return balas(404, { ok: false, pesan: 'permintaan izin tidak ada' });
    }
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
    // `pagu` null kalau pagu.json tidak ada — halaman membaca itu apa adanya
    res.end(JSON.stringify({ total: riwayatTotal, sejak: riwayatSejak || null, harian, proyek, pagu: paguRingkas() }));
    return;
  }

  /* Buku induk pegawai — tanpa token, sekelas /token-riwayat: isinya angka
     dan nama folder/cabang/tool yang toh sudah lewat /stream juga. */
  if (url.pathname === '/buku-induk') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(bukuIndukRingkas()));
    return;
  }

  /* Papan SKP — tanpa token, sekelas /token-riwayat: agregat angka dan nama
     folder/cabang/tool dari agenda + riwayat token + buku induk (lihat
     skpHitung()). Bawaan 7 hari terakhir sampai hari ini. */
  /* Buku register paraf: keputusan izin sepanjang rentang, dibaca ULANG dari
     buku agenda — bukan tabel baru yang harus dipelihara. Sekelas `/skp`:
     tanpa token, dan yang keluar cuma enum, angka, dan nama pola. Isi
     perintahnya tidak pernah ikut. */
  if (url.pathname === '/paraf') {
    const p = url.searchParams;
    const hariIni = tanggalLokal(Date.now());
    const sampai = p.get('sampai') || hariIni;
    const dari = p.get('dari') || skpHariMundur(sampai, 6);
    if (!AGENDA_TANGGAL_RX.test(dari) || !AGENDA_TANGGAL_RX.test(sampai) || dari > sampai) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ galat: 'dari/sampai harus YYYY-MM-DD dan dari <= sampai' }));
      return;
    }
    const baris = [];
    const tally = { paraf: 0, tolak: 0, tinggi: 0, sedang: 0 };
    /* Hari dikumpulkan mundur dari `sampai` memakai `skpHariMundur()` yang
       sudah ada — pola yang sama dengan `skpHitung()`, jadi tidak ada helper
       tanggal kedua yang bisa hanyut dari yang pertama. */
    const tanggal = [];
    for (let n = 0; n <= AGENDA_HARI + 1; n++) {
      const t = skpHariMundur(sampai, n);
      if (t < dari) break;
      tanggal.push(t);
    }
    for (const hari of tanggal) {
      for (const b of agendaBacaHari(hari)) {
        if (b.kind !== 'izin-jawab' && b.kind !== 'izin-minta') continue;
        baris.push({
          ts: b.ts, sesi: b.session, proyek: b.cwd, nama: b.nama || '',
          kind: b.kind, tool: b.tool || '',
          keputusan: b.keputusan || '', sumber: b.sumber || '',
          tunggu: Number.isFinite(b.tunggu) ? b.tunggu : null,
          risiko: b.risiko || '', tanda: b.tanda || '',
        });
        if (b.keputusan === 'paraf') tally.paraf++;
        if (b.keputusan === 'tolak') tally.tolak++;
        if (b.risiko === 'tinggi') tally.tinggi++;
        if (b.risiko === 'sedang') tally.sedang++;
      }
    }
    baris.sort((a, b) => b.ts - a.ts);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({ dari, sampai, jumlah: baris.length, tally, baris: baris.slice(0, 500) }));
    return;
  }

  if (url.pathname === '/skp') {
    const p = url.searchParams;
    const hariIni = tanggalLokal(Date.now());
    const sampai = p.get('sampai') || hariIni;
    const dari = p.get('dari') || skpHariMundur(sampai, 6);
    if (!AGENDA_TANGGAL_RX.test(dari) || !AGENDA_TANGGAL_RX.test(sampai) || dari > sampai) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ galat: 'dari/sampai harus YYYY-MM-DD dan dari <= sampai' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(skpHitung(dari, sampai)));
    return;
  }

  /* Arsip kliping mingguan — tanpa token/Origin check, sama seperti
     /token-riwayat: angkanya toh sudah publik lewat /event juga. */
  if (url.pathname === '/kliping-mingguan') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({
      arsip: arsipMingguan,
      berjalan: klipingRingkas(mingguAktif),
      lembar: arsipMingguan.length,
    }));
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

  /* Metrik gaya Prometheus — tanpa token, sekelas /health. */
  if (url.pathname === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(metrikTeks());
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, events: seq, viewers: clients.size, pemutarUlang, port: PORT,
      sseDibuang: sseDibuangTotal, sseDilebur: sseDileburTotal, sseDiputus, tunda: tundaHitung(),
      memoriMB: Math.round(process.memoryUsage().rss / 1048576),
      absen: absenHitung(),
    }));
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


server.listen(PORT, HOST, () => {
  console.log(`[agent-room] ruangan siap  ->  http://${HOST}:${PORT}`);
  console.log('[agent-room] menunggu event dari Claude Code hooks...');
  tundaSerap();                 // surat yang menumpuk selagi kantor tutup, dibaca sekarang
  if (KUNCI) console.log('[agent-room] kunci event AKTIF — POST /event tanpa x-agent-room-kunci ditolak');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !KUNCI) {
    console.warn('[agent-room] PERINGATAN: bind ke ' + HOST + ' tanpa AGENT_ROOM_KUNCI — siapa pun di jaringan'
      + ' bisa memalsukan sesi dan membaca isi kerja lewat /stream. Isi AGENT_ROOM_KUNCI, atau kembali ke 127.0.0.1.');
  }
  if (IZIN) {
    if (CLAUDE) {
      console.log(`[agent-room] kendali web AKTIF — halaman boleh melahirkan sesi`);
      if (CLAUDE_SKRIP) {
        // Kantor yang sedang memakai PEMERAN tidak boleh diam soal itu.
        console.log(`[agent-room] memakai SKRIP ${CLAUDE} lewat ${process.execPath}`);
        console.log('[agent-room] AGENT_ROOM_CLAUDE menunjuk skrip, bukan biner claude — ini jalur UJI,'
          + ' tidak ada agen sungguhan yang lahir dari sini');
      } else {
        console.log(`[agent-room] memakai ${CLAUDE} (${versiClaude(CLAUDE)})`);
        console.log('[agent-room] biner lain bisa ditunjuk lewat AGENT_ROOM_CLAUDE');
      }
    } else {
      console.log('[agent-room] kendali web diminta, tapi biner claude tidak ketemu di PATH');
    }
  } else {
    console.log('[agent-room] kendali web mati. Nyalakan: node server.mjs --izinkan-perintah');
  }
});
