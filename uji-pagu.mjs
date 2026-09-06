#!/usr/bin/env node
/* uji-pagu.mjs :: penjaga pagu anggaran token mingguan (sisi server).
 *
 * Uji KOTAK HITAM, nol dependency: server.mjs dinyalakan sebagai proses
 * sendiri di port bebas, dengan SEMUA env data diarahkan ke folder sementara
 * di os.tmpdir() — token-riwayat, buku agenda, buku induk, kliping, kotak
 * surat tunda, dan pagu.json. Berkas data sungguhan di repo tidak pernah
 * disentuh, dan port kantor sungguhan tidak pernah dipakai.
 *
 * Yang dijaga di sini bukan "kodenya kompilasi", tapi sepuluh janji yang
 * gampang sekali dilanggar sambil tetap hijau di uji lain:
 *
 *   1. nota terbit TEPAT SEKALI waktu ambang pertama terlewati, dengan
 *      persen/pakai/pagu yang benar (ujung ke ujung: hook -> transkrip ->
 *      riwayat token -> nota -> SSE);
 *   2. delta berikutnya di bawah ambang berikutnya TIDAK menerbitkan apa pun;
 *   3. ambang kedua terbit sekali, dan hanya sekali;
 *   4. restart server di tengah minggu TIDAK mengulang nota yang sudah terbit
 *      (ini yang dijaga "dasar diam" di paguPeriksa);
 *   5. serapan MINGGU LALU tidak ikut terhitung ke minggu berjalan;
 *   6. tanpa pagu.json TIDAK ADA APA-APA: nol nota, pagu null di
 *      /token-riwayat, nol baris di /metrics, dan nol baris konsol;
 *   7. pagu.json rusak tidak menjatuhkan kantor: /health tetap 200, fitur
 *      mati, tepat satu peringatan;
 *   8. /metrics saat aktif membawa ketiga metrik, tanpa label proyek selama
 *      AGENT_ROOM_METRICS_PROYEK tidak diisi;
 *   9. notanya masuk buku agenda dan bisa diputar ulang utuh;
 *  10. AGENT_ROOM_PAGU_BAWAAN memberi pagu tanpa berkas sama sekali.
 *
 * Lalu empat janji yang lahir dari pemeriksaan sesudah pembangunan — semuanya
 * pernah dilanggar, jadi masing-masing dijaga kasusnya sendiri:
 *
 *  11. konfigurasi dengan ambang lebih banyak dari yang dipakai memotong dari
 *      ujung BAWAH: 100% tidak boleh diam-diam hilang, dan yang dibuang harus
 *      disebut namanya di konsol;
 *  12. metrik jumlah proyek & jumlah proyek terlampaui dihitung dari data
 *      PENUH, bukan dari daftar 20 baris yang sudah dipotong untuk tampilan —
 *      sekalian: jumlah proyek yang ditandai per minggu ada batasnya;
 *  13. laporan pagu selalu tentang MINGGU BERJALAN, walau baris transkrip
 *      lama masuk duluan sesudah proses baru mulai;
 *  14. nama folder panjang ditolak dengan suara (bukan jadi entri mati
 *      berelipsis), dan nama dengan spasi ganda tetap cocok apa adanya.
 *
 * Lalu enam janji dari pemeriksaan putaran KEDUA — semuanya pernah merah:
 *
 *  15. satu baris transkrip ber-ts MINGGU DEPAN (jam mesin cepat, transkrip
 *      dari mesin lain, resume sesudah koreksi NTP) tidak boleh mengunci
 *      minggu berjalan ke depan dan mematikan seluruh nota seumur proses;
 *  16. peringatan potongan (ambang dibuang / nama panjang) hanya terbit kalau
 *      pagunya BENAR-BENAR dipakai; berkas yang ujungnya inert bilang sendiri
 *      bahwa dia inert, satu baris, sekali;
 *  17. ambang 100 ("pagu terlampaui") tidak pernah dibuang — dari sisi bawah
 *      maupun dari sisi atas ([100,150,200,250,300] tetap memakai 100);
 *  18. agent_room_pagu_proyek menghitung yang dijanjikan HELP-nya (pagu
 *      eksplisit di pagu.json) dan tidak jatuh sendiri tiap Senin; yang
 *      week-scoped punya nama sendiri;
 *  19. tidak ada keluarga metrik pagu yang mencampur seri agregat TANPA label
 *      dengan seri per-proyek (sum() dobel);
 *  20. /metrics dan /token-riwayat tidak membayar ulang seluruh himpunan
 *      proyek tiap scrape — tapi tetap SEGAR sesudah satu giliran masuk.
 *      Ditagih dengan counter hitung penuh di /metrics, bukan dengan
 *      stopwatch: ambang waktu di kasus ini pernah dibuktikan TIDAK BISA
 *      merah (cache dimatikan total, 120/120 tetap hijau empat kali), karena
 *      hitung penuh 8.000 proyek cuma beberapa milidetik dan tenggelam di
 *      derau mesin yang ramai. Uji yang tidak bisa merah bukan uji.
 *
 * Lalu dua janji dari pemeriksaan putaran KETIGA:
 *
 *  21. jam MESIN yang mundur melewati batas minggu (koreksi NTP sesudah RTC
 *      ngebut, snapshot mesin maya dipulihkan) tidak boleh mematikan seluruh
 *      nota diam-diam sampai jam mesin menyusul — kembaran terbalik dari 15,
 *      dan satu-satunya yang tidak bisa dipalsukan lewat ts transkrip, jadi
 *      jam server digeser lewat modul yang di-preload `node --import`;
 *      sekalian: keadaan itu terbaca di konsol, sekali, dan membuang tanda
 *      minggu tidak boleh jadi kebiasaan tiap giliran (hujan nota);
 *  22. `hitung: "semua"` ikut menghitung token cache dan `"io"` tidak — satu
 *      giliran yang sama persis, dua berkas yang cuma beda satu kata, dan
 *      angkanya harus beda 800 di laporan, di metrik, dan di ada/tidaknya
 *      nota. Cabang itu sebelumnya nol kasus.
 *
 * Plus lint statis dua hal yang tidak kelihatan dari luar:
 *   - paguPeriksa() dipasang di riwayatCatat(), BUKAN di riwayatTambah()
 *     (riwayatMuat() memanggil riwayatTambah untuk setiap baris riwayat lama
 *     waktu start — di sana, satu restart = ribuan nota basi);
 *   - blok pagu tidak memuat satu pun tanda mata uang. Pagu itu ANGKA TOKEN;
 *   - SEMUA env berkas data yang bawaannya jatuh ke folder repo diarahkan ke
 *     sandbox (kalau tidak, server uji menulis formasi.json ke dalam repo);
 *   - blok pagu menyebut sendiri bahwa `pagu` di antrean disposisi itu pagu
 *     DOLAR milik CLI, bukan pagu token ini.
 *
 * Pakai:
 *   node uji-pagu.mjs
 *   AGENT_ROOM_UJI_PORT=4700 node uji-pagu.mjs     port awal pencarian
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const PORT_MULAI = Number(process.env.AGENT_ROOM_UJI_PORT) || 4641;

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const merah = (s) => (warna ? '\x1b[31m' + s + '\x1b[0m' : s);
const hijau = (s) => (warna ? '\x1b[32m' + s + '\x1b[0m' : s);
const abu = (s) => (warna ? '\x1b[90m' + s + '\x1b[0m' : s);
const tebal = (s) => (warna ? '\x1b[1m' + s + '\x1b[0m' : s);

let jumlahLulus = 0;
let jumlahGagal = 0;
const lulus = (t) => { jumlahLulus++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => {
  jumlahGagal++;
  console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(String(ket)) : ''));
};
const cek = (syarat, t, ket) => (syarat ? lulus(t) : tolak(t, ket));

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* Sama persis dengan tanggalLokal()/mingguLokal() di server.mjs — sengaja
   disalin, bukan diimpor: uji kotak hitam tidak boleh ikut memakai fungsi
   yang sedang diujinya. */
const tanggalLokal = (ts) => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};

const mingguLokal = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));      // mundur ke Senin
  return tanggalLokal(d.getTime());
};

/* ------------------------------------------------------------- jaringan --- */

function portBebas(mulai) {
  return new Promise((selesai, gagal) => {
    const coba = (p) => {
      if (p > mulai + 60) { gagal(new Error('tidak ada port bebas mulai dari ' + mulai)); return; }
      const s = net.createServer();
      s.once('error', () => coba(p + 1));
      s.once('listening', () => s.close(() => selesai(p)));
      s.listen(p, '127.0.0.1');
    };
    coba(mulai);
  });
}

function minta(port, jalur, opsi = {}) {
  return new Promise((selesai, gagal) => {
    const req = http.request({
      host: '127.0.0.1', port, path: jalur,
      method: opsi.method || 'GET',
      headers: opsi.headers || {},
    }, (res) => {
      let teks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { teks += c; });
      res.on('end', () => selesai({ status: res.statusCode, teks }));
    });
    req.on('error', gagal);
    if (opsi.body) req.write(opsi.body);
    req.end();
  });
}

/* Pengurai SSE seadanya: kumpulkan sampai '\n\n', ambil baris 'data: '. */
function uraiSSE(simpan) {
  let buf = '';
  return (potongan) => {
    buf += potongan;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const blok = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const baris of blok.split('\n')) {
        if (!baris.startsWith('data: ')) continue;
        try { simpan(JSON.parse(baris.slice(6))); } catch { /* frame komentar */ }
      }
    }
  };
}

/* ------------------------------------------------------------- sandbox --- */

const sandboxes = [];
const kantorHidup = new Set();

/* Nama folder sengaja TANPA kata "pagu": kasus 6 memeriksa bahwa keluaran
   konsol server tidak memuat kata itu sama sekali, dan server memang mencetak
   jalur token-riwayat waktu start. */
function sandboxBaru(nama) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-uji-anggaran-' + nama + '-'));
  fs.mkdirSync(path.join(dir, 'proyek-uji'), { recursive: true });
  fs.writeFileSync(path.join(dir, 't.jsonl'), '');
  sandboxes.push(dir);
  return dir;
}

const jalurTranskrip = (dir) => path.join(dir, 't.jsonl');
const jalurProyek = (dir) => path.join(dir, 'proyek-uji');

/* SATU tempat untuk semua env berkas data, dan lintEnv() di bawah memaksa
   daftar ini tetap lengkap terhadap server.mjs. Bukan kerapian: server uji
   yang satu env-nya kelupaan akan menulis berkas data SUNGGUHAN ke dalam
   folder repo (formasi.json pernah begitu — ditulis lewat debounce 20 detik
   dan lewat process.on('exit')), menimpa berkas milik pemakai dengan pegawai
   palsu bernama 'proyek-uji'. Berkas datanya bertambah dari waktu ke waktu,
   jadi daftar ini tidak boleh dijaga ingatan. */
const ENV_DATA = (dir) => ({
  AGENT_ROOM_PAGU: path.join(dir, 'pagu.json'),
  AGENT_ROOM_TOKEN_LOG: path.join(dir, 'token-riwayat.jsonl'),
  AGENT_ROOM_AGENDA_DIR: path.join(dir, 'agenda'),
  AGENT_ROOM_BUKU_INDUK: path.join(dir, 'buku-induk.json'),
  AGENT_ROOM_KLIPING_LOG: path.join(dir, 'kliping-mingguan.jsonl'),
  AGENT_ROOM_FORMASI: path.join(dir, 'formasi.json'),
  AGENT_ROOM_TUNDA_DIR: path.join(dir, 'tunda'),
  AGENT_ROOM_NAMA: path.join(dir, 'nama.json'),
  AGENT_ROOM_SUARA: path.join(dir, 'suara.json'),
  AGENT_ROOM_SUARA_KUNCI: path.join(dir, '.agent-room-suara-kunci'),
  AGENT_ROOM_SUARA_DIR: path.join(dir, 'suara'),
  AGENT_ROOM_SOP: path.join(dir, 'sop.json'),
  /* Ini satu-satunya yang cuma DIBACA server (katalog rancangan event, sumber
     kalimat narasi). Tetap disandbox-kan: berkasnya boleh tidak ada — narasi
     jatuh ke id event dan servernya tetap menyala — dan uji yang mau menguji
     jalur katalog jadi harus menaruh fixture-nya sendiri, bukan menumpang
     event-acak.json milik repo yang isinya berubah tiap gelombang event. */
  AGENT_ROOM_KATALOG: path.join(dir, 'event-acak.json'),
  AGENT_ROOM_NARASI: path.join(dir, 'narasi-event.json'),
});

/* Jam mesin yang bisa digeser DARI LUAR proses server, tanpa menyentuh satu
   huruf pun di server.mjs dan tanpa menyentuh jam mesin sungguhan. Modul ini
   ditulis ke sandbox lalu di-preload lewat `node --import`; isinya membaca
   berkas geseran (milidetik) dan menambahkannya ke Date.now() dan `new Date()`.
   Dipakai kasus 21, yang butuh jam mesin MELOMPAT — maju delapan hari lalu
   dibetulkan mundur — sesuatu yang tidak bisa dipalsukan lewat ts transkrip:
   pagu memakai Date.now() milik server sendiri sebagai langit-langit. */
const SUMBER_JAM = `import fs from 'node:fs';
const berkas = process.env.UJI_JAM_GESER;
const Asli = Date;
const asliNow = Date.now;
let geser = 0;
let dibacaPada = 0;
function baca() {
  const t = asliNow();
  if (t - dibacaPada < 20) return geser;       // bukan satu readFileSync per Date.now()
  dibacaPada = t;
  try { geser = Number(fs.readFileSync(berkas, 'utf8')) || 0; } catch { geser = 0; }
  return geser;
}
baca();
const kini = () => asliNow() + baca();
class Jam extends Asli {
  constructor(...a) { if (a.length === 0) super(kini()); else super(...a); }
  static now() { return kini(); }
}
globalThis.Date = Jam;
`;

/* Tulis modul jam ke sandbox, kembalikan { env, argNode } untuk bukaKantor. */
function jamPalsu(dir, geserAwal) {
  const berkas = path.join(dir, 'geser.txt');
  const modul = path.join(dir, 'jam.mjs');
  fs.writeFileSync(modul, SUMBER_JAM);
  fs.writeFileSync(berkas, String(geserAwal));
  return {
    berkas,
    env: { UJI_JAM_GESER: berkas },
    argNode: ['--import', pathToFileURL(modul).href],
    geser: (ms) => fs.writeFileSync(berkas, String(ms)),
  };
}

async function bukaKantor(dir, tambahEnv = {}, argNode = []) {
  const port = await portBebas(PORT_MULAI);
  const env = { ...process.env };
  // Bersihkan SEMUA env kantor yang mungkin ikut dari shell pemanggil, supaya
  // uji ini tidak pernah menulis ke berkas data sungguhan.
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port),
    AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off',
  }, ENV_DATA(dir), tambahEnv);

  const proc = spawn(process.execPath, [...argNode, SERVER],
    { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, keluar: '', galat: '', evs: [], stream: null };
  kantorHidup.add(k);
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (c) => { k.keluar += c; });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (c) => { k.galat += c; });

  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.keluar + k.galat);
    try {
      const r = await minta(port, '/health');
      if (r.status === 200) break;
    } catch { /* belum mendengar */ }
    if (Date.now() > batas) throw new Error('server tidak menjawab /health dalam 20 detik');
    await tidur(150);
  }
  return k;
}

/* Sesudah tersambung, klien SSE baru menerima SUSULAN dulu: ring di memori,
   yang waktu start ikut diisi buku agenda hari ini. Nota pagu yang terbit
   SEBELUM restart ikut lewat di situ — dan itu memang benar, halaman yang
   dibuka jam empat sore harus tetap melihat nota tadi pagi. Yang diuji di
   berkas ini bukan susulan itu, tapi apa yang terbit HIDUP sesudahnya, jadi
   batasnya dicatat di k.dasar dan semua hitungan mulai dari sana. */
async function bukaStream(k) {
  await new Promise((selesai, gagal) => {
    const req = http.request({ host: '127.0.0.1', port: k.port, path: '/stream' }, (res) => {
      res.setEncoding('utf8');
      res.on('data', uraiSSE((ev) => k.evs.push(ev)));
      selesai();
    });
    req.on('error', gagal);
    k.stream = req;
    req.end();
  });
  await tidur(600);
  k.dasar = k.evs.length;
}

async function tutupKantor(k) {
  if (!kantorHidup.has(k)) return;
  kantorHidup.delete(k);
  try { k.stream?.destroy(); } catch { /* sudah lepas */ }
  await new Promise((selesai) => {
    if (k.proc.exitCode !== null) { selesai(); return; }
    k.proc.once('exit', selesai);
    k.proc.kill();
    setTimeout(() => { try { k.proc.kill('SIGKILL'); } catch {} selesai(); }, 4000).unref?.();
  });
}

/* ---------------------------------------------------------------- hook --- */

let uuidKe = 0;

const kirimHook = (k, dir, sesi) => minta(k.port, '/event', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: sesi,
    cwd: jalurProyek(dir),
    transcript_path: jalurTranskrip(dir),
    tool_name: 'Read',
    tool_input: { file_path: 'catatan.txt' },
  }),
});

/* Satu giliran asisten ber-usage di transkrip: inilah satu-satunya jalan token
   masuk ke riwayat, sama seperti sesi sungguhan. */
function barisGiliran(dir, masuk, keluar, ts = Date.now(), cwd = null) {
  return JSON.stringify({
    type: 'assistant',
    uuid: 'uji-' + (++uuidKe),
    timestamp: new Date(ts).toISOString(),
    cwd: cwd || jalurProyek(dir),
    message: { role: 'assistant', model: 'uji', content: [], usage: { input_tokens: masuk, output_tokens: keluar } },
  });
}

function tulisGiliran(dir, masuk, keluar, ts = Date.now(), cwd = null) {
  fs.appendFileSync(jalurTranskrip(dir), barisGiliran(dir, masuk, keluar, ts, cwd) + '\n');
}

/* Giliran dengan usage LENGKAP, termasuk token cache. Inilah satu-satunya
   cara membedakan `hitung: "io"` dari `hitung: "semua"` dari luar: keduanya
   melihat baris yang sama persis dan harus menjumlahkannya berbeda. */
function tulisGiliranPenuh(dir, usage, ts = Date.now(), cwd = null) {
  fs.appendFileSync(jalurTranskrip(dir), JSON.stringify({
    type: 'assistant',
    uuid: 'uji-' + (++uuidKe),
    timestamp: new Date(ts).toISOString(),
    cwd: cwd || jalurProyek(dir),
    message: { role: 'assistant', model: 'uji', content: [], usage },
  }) + '\n');
}

/* Banyak proyek sekaligus: nama folder yang dipakai riwayat diambil dari
   `cwd` TIAP BARIS transkrip, jadi satu berkas cukup untuk menghidupkan
   ratusan proyek tanpa membuat ratusan folder. */
function tulisBanyakProyek(dir, jumlah, masuk, keluar, awalan = 'proy-') {
  const baris = [];
  for (let i = 0; i < jumlah; i++) {
    baris.push(barisGiliran(dir, masuk, keluar, Date.now(),
      path.join(dir, awalan + String(i).padStart(3, '0'))));
  }
  fs.appendFileSync(jalurTranskrip(dir), baris.join('\n') + '\n');
}

const hidup = (k) => k.evs.slice(k.dasar || 0);
const hitung = (k, kind) => hidup(k).filter((e) => e.kind === kind).length;
const notaPagu = (k) => hidup(k).filter((e) => e.kind === 'pagu');

/* Tunggu sampai giliran ke-n terserap (event kind:'token'), lalu beri jeda
   pendek: nota pagu diterbitkan di tick yang sama dengan event token itu,
   jadi sesudah ini keadaannya sudah pasti — tidak ada balapan. */
async function tungguGiliran(k, n, ms = 15000) {
  const batas = Date.now() + ms;
  while (Date.now() < batas) {
    if (hitung(k, 'token') >= n) { await tidur(250); return true; }
    await tidur(80);
  }
  return false;
}

/* Untuk kasus berproyek banyak: event kind:'token' dilebur di antrean SSE
   (satu sesi, yang lama diganti yang baru), jadi menghitungnya tidak bisa
   dipakai sebagai tanda "semua giliran sudah terserap". Buku agenda ditulis
   appendFileSync, jadi berkasnya yang jadi saksi. */
async function tungguSampai(uji, ms = 30000) {
  const batas = Date.now() + ms;
  while (Date.now() < batas) {
    let ok = false;
    try { ok = await uji(); } catch { ok = false; }
    if (ok) { await tidur(400); return true; }
    await tidur(150);
  }
  return false;
}

/* Baris kind:'pagu' di buku agenda hari ini — saksi yang tidak ikut kena rem
   SSE maupun ring 400 event. */
function agendaPagu(dir) {
  const berkas = path.join(dir, 'agenda', tanggalLokal(Date.now()) + '.jsonl');
  let teks = '';
  try { teks = fs.readFileSync(berkas, 'utf8'); } catch { return []; }
  return teks.split('\n').filter(Boolean)
    .map((b) => { try { return JSON.parse(b); } catch { return null; } })
    .filter((b) => b && b.kind === 'pagu');
}

const barisKonsol = (k, rx) => (k.keluar + k.galat).split('\n').filter((b) => rx.test(b));

/* Riwayat token yang DITANAM langsung ke berkas, bukan lewat transkrip: ini
   jalur "kantor yang sudah lama hidup" — riwayatMuat() membacanya waktu start,
   tanpa satu pun nota (paguPeriksa tidak dipasang di riwayatTambah). Satu-
   satunya cara membuat ribuan proyek tanpa menunggu ribuan giliran diserap. */
function tanamRiwayat(dir, jumlah, masuk, keluar, ts = Date.now(), awalan = 'proy-') {
  const baris = [];
  for (let i = 0; i < jumlah; i++) {
    baris.push(JSON.stringify({
      v: 1, ts, proyek: awalan + String(i).padStart(4, '0'),
      input: masuk, output: keluar, cacheTulis: 0, cacheBaca: 0,
    }));
  }
  fs.appendFileSync(path.join(dir, 'token-riwayat.jsonl'), baris.join('\n') + '\n');
}

/* Satu angka metrik telanjang: ^nama <angka>$ */
function angkaMetrik(teks, nama) {
  const m = teks.match(new RegExp('^' + nama + ' ([\\d.]+)$', 'm'));
  return m ? Number(m[1]) : null;
}

const helpMetrik = (teks, nama) => (teks.match(new RegExp('^# HELP ' + nama + ' (.*)$', 'm')) || [])[1] || '';

/* Kelompokkan baris /metrics per NAMA metrik, hitung seri telanjang vs seri
   berlabel. Satu keluarga yang memuat dua-duanya membuat sum() menghitung
   totalnya dua kali — agregat + tiap anggotanya. */
function keluargaMetrik(teks, awalan) {
  const peta = new Map();
  for (const b of teks.split('\n')) {
    if (!b || b.startsWith('#')) continue;
    const m = b.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\{[^}]*\})? /);
    if (!m || !m[1].startsWith(awalan)) continue;
    const g = peta.get(m[1]) || { telanjang: 0, berlabel: 0 };
    if (m[2]) g.berlabel++; else g.telanjang++;
    peta.set(m[1], g);
  }
  return peta;
}

function putarUlang(port, tanggal, ms = 10000) {
  return new Promise((selesai, gagal) => {
    const keluar = [];
    const req = http.request({ host: '127.0.0.1', port, path: '/stream?ulang=' + tanggal + '&laju=999' }, (res) => {
      res.setEncoding('utf8');
      res.on('data', uraiSSE((ev) => keluar.push(ev)));
      res.on('end', () => selesai(keluar));
    });
    req.on('error', gagal);
    req.setTimeout(ms, () => { req.destroy(); selesai(keluar); });
    req.end();
  });
}

/* ============================================================ lint statis === */

function lintStatis() {
  console.log(tebal('\nLint statis server.mjs'));
  const src = fs.readFileSync(SERVER, 'utf8');

  const iTambah = src.indexOf('function riwayatTambah(');
  const iCatat = src.indexOf('function riwayatCatat(');
  const panggil = [...src.matchAll(/paguPeriksa\(/g)].map((m) => m.index);
  const dipanggil = panggil.filter((i) => i > src.indexOf('function paguPeriksa(') + 1
    || i < src.indexOf('function paguPeriksa('));
  const dariCatat = panggil.filter((i) => i > iCatat && i < src.indexOf('\n}', iCatat));
  const dariTambah = panggil.filter((i) => i > iTambah && i < src.indexOf('\n}', iTambah));
  cek(dariCatat.length === 1, 'paguPeriksa() dipanggil tepat sekali dari riwayatCatat()',
    'ditemukan ' + dariCatat.length + ' panggilan di dalam riwayatCatat()');
  cek(dariTambah.length === 0, 'paguPeriksa() TIDAK dipanggil dari riwayatTambah() (jebakan nota basi saat start)',
    'ada ' + dariTambah.length + ' panggilan di riwayatTambah() — riwayatMuat() akan memuntahkan ribuan nota');
  cek(dipanggil.length >= 2, 'paguPeriksa() memang terpasang di jalur hidup', 'tidak ketemu pemanggilnya');

  const tanda = src.indexOf('pagu anggaran token ---');
  // mundur ke '/*' pembuka supaya komentar kepala blok ikut utuh — kalau
  // potongannya mulai di TENGAH komentar, penghapus komentar di bawah tidak
  // punya pembuka untuk dicocokkan dan kalimatnya terbaca sebagai kode.
  const mulai = tanda > 0 ? src.lastIndexOf('/*', tanda) : -1;
  const akhir = src.indexOf('buku agenda ----', tanda);
  cek(mulai > 0 && akhir > mulai, 'blok "pagu anggaran token" ada di server.mjs',
    'penanda blok tidak ketemu (mulai=' + mulai + ', akhir=' + akhir + ')');
  if (mulai > 0 && akhir > mulai) {
    const blok = src.slice(mulai, akhir);
    const uang = [...blok.matchAll(/\$|USD|\bRp\b/g)];
    cek(uang.length === 0, 'blok pagu bebas tanda mata uang (Aturan 4: token, bukan uang)',
      uang.length + ' kemunculan: ' + uang.map((m) => m[0]).join(' '));
    cek(/session: ''/.test(blok), "nota pagu memakai session: '' (nota milik folder, bukan sesi)");
    // KODE-nya saja: komentar blok ini memang menjelaskan kenapa tabel harga
    // tidak dipakai, dan kalimat itu tidak boleh bikin ujinya merah sendiri.
    const kode = blok
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    cek(!/harga|tarif|biaya/i.test(kode), 'kode blok pagu tidak menyeret tabel harga apa pun',
      (kode.match(/.*(harga|tarif|biaya).*/i) || [''])[0].trim());
    /* Kata `pagu` punya DUA arti di server.mjs: yang ini angka token, dan
       yang di antrean disposisi (`t.pagu` -> --max-budget-usd) itu pagu
       DOLAR milik CLI. Blok ini wajib menyebut sendiri bedanya, supaya orang
       berikutnya tidak menyambung angka token ke flag dolar itu. */
    cek(/max-budget-usd/.test(blok),
      'blok pagu menunjuk sendiri ke `--max-budget-usd` (dua arti kata "pagu" dibedakan)',
      'tidak ada satu pun kalimat pembeda di blok pagu');
  }

  lintEnv(src);
}

/* Server uji TIDAK BOLEH menulis berkas data ke dalam folder repo. Semua env
   yang bawaannya `path.join(__dirname, ...)` di server.mjs harus ada di
   ENV_DATA(). Ini lint, bukan uji jalan: di Windows kebocorannya cuma balapan
   waktu (debounce 20 detik), di Linux deterministik lewat process.on('exit')
   — jadi dijaga dari sisi daftar, bukan dari sisi kebetulan. */
function lintEnv(src) {
  const punyaUji = new Set(Object.keys(ENV_DATA('X')));
  const perlu = [...new Set([...src.matchAll(
    /process\.env\.(AGENT_ROOM_[A-Z_]+)\s*\|\|\s*path\.join\(__dirname/g)].map((m) => m[1]))];
  cek(perlu.length >= 3, 'lint env: env berkas data ketemu di server.mjs',
    'cuma ' + perlu.length + ' yang ketemu — regexnya mungkin sudah tidak cocok');
  const kurang = perlu.filter((n) => !punyaUji.has(n));
  cek(kurang.length === 0,
    'lint env: semua berkas data server.mjs diarahkan ke sandbox (' + perlu.length + ' env)',
    'belum diarahkan: ' + kurang.join(', ') + ' — server uji akan menulisnya ke dalam repo');
  const contoh = ENV_DATA(path.join(os.tmpdir(), 'sandbox-uji'));
  const bocor = Object.entries(contoh).filter(([, v]) => !String(v).startsWith(os.tmpdir()));
  cek(bocor.length === 0, 'lint env: tidak ada jalur ENV_DATA yang keluar dari folder sementara',
    bocor.map(([n, v]) => n + '=' + v).join(' | '));
}

/* ================================================================= kasus === */

async function kasus1sampai3dan8dan9() {
  console.log(tebal('\nKasus 1-3, 8, 9: nota terbit, anti-spam, ambang kedua, /metrics, buku agenda'));
  const dir = sandboxBaru('a');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80, 100], bawaan: 0, hitung: 'io', proyek: { 'proyek-uji': 1000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-1');
  await tidur(400);                       // beri waktu pemantau transkrip terpasang

  /* --- kasus 1: 800 token dari 1000 = 80%, tepat satu nota --- */
  tulisGiliran(dir, 500, 300);
  cek(await tungguGiliran(k, 1), 'giliran pertama terserap (event kind:token)');
  const nota = notaPagu(k);
  cek(nota.length === 1, 'kasus 1: tepat SATU nota pagu terbit di ambang 80%', 'terbit ' + nota.length + ' nota');
  const n1 = nota[0] || {};
  cek(n1.ambang === 80, 'kasus 1: ambang = 80', 'ambang = ' + n1.ambang);
  cek(n1.persen === 80, 'kasus 1: persen = 80', 'persen = ' + n1.persen);
  cek(n1.pakai === 800, 'kasus 1: pakai = 800 token', 'pakai = ' + n1.pakai);
  cek(n1.pagu === 1000, 'kasus 1: pagu = 1000 token', 'pagu = ' + n1.pagu);
  cek(n1.cwd === 'proyek-uji', 'kasus 1: cwd = nama folder proyek', 'cwd = ' + JSON.stringify(n1.cwd));
  cek(n1.session === '', "kasus 1: session kosong (nota milik folder)", 'session = ' + JSON.stringify(n1.session));
  cek(typeof n1.minggu === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n1.minggu || ''),
    'kasus 1: minggu dikunci tanggal Senin', 'minggu = ' + JSON.stringify(n1.minggu));

  /* --- kasus 2: naik ke 90%, tidak boleh ada nota baru --- */
  tulisGiliran(dir, 60, 40);
  cek(await tungguGiliran(k, 2), 'giliran kedua terserap');
  await tidur(700);
  cek(hitung(k, 'pagu') === 1, 'kasus 2: serapan 90% TIDAK menerbitkan nota baru (anti-spam)',
    'jumlah nota jadi ' + hitung(k, 'pagu'));

  /* --- kasus 3: 105%, ambang kedua terbit sekali --- */
  tulisGiliran(dir, 100, 50);
  cek(await tungguGiliran(k, 3), 'giliran ketiga terserap');
  await tidur(700);
  const nota2 = notaPagu(k);
  cek(nota2.length === 2, 'kasus 3: ambang 100 terbit, total 2 nota', 'total ' + nota2.length + ' nota');
  const n2 = nota2[1] || {};
  cek(n2.ambang === 100, 'kasus 3: ambang = 100', 'ambang = ' + n2.ambang);
  cek(n2.persen === 105, 'kasus 3: persen = 105', 'persen = ' + n2.persen);
  cek(n2.pakai === 1050, 'kasus 3: pakai = 1050 token', 'pakai = ' + n2.pakai);

  tulisGiliran(dir, 30, 20);
  cek(await tungguGiliran(k, 4), 'giliran keempat terserap');
  await tidur(700);
  cek(hitung(k, 'pagu') === 2, 'kasus 3: delta sesudahnya (110%) tidak menerbitkan nota ketiga',
    'jumlah nota jadi ' + hitung(k, 'pagu'));

  /* --- kasus 8: /metrics saat pagu aktif --- */
  const met = await minta(k.port, '/metrics');
  const barisPagu = met.teks.split('\n').filter((b) => b.includes('agent_room_pagu') && !b.startsWith('#'));
  cek(met.teks.includes('agent_room_pagu_proyek 1'), 'kasus 8: agent_room_pagu_proyek 1',
    barisPagu.join(' | '));
  cek(met.teks.includes('agent_room_pagu_terlampaui 1'), 'kasus 8: agent_room_pagu_terlampaui 1',
    barisPagu.join(' | '));
  cek(angkaMetrik(met.teks, 'agent_room_pagu_proyek_aktif') === 1,
    'kasus 8: agent_room_pagu_proyek_aktif 1 (yang masuk laporan minggu berjalan)',
    barisPagu.join(' | '));
  const mRasio = met.teks.match(/agent_room_pagu_serapan_rasio\{agregat="maks"\} ([\d.]+)/);
  cek(mRasio && Number(mRasio[1]) >= 1, 'kasus 8: agent_room_pagu_serapan_rasio{agregat="maks"} >= 1.0',
    'nilainya ' + (mRasio ? mRasio[1] : 'tidak ada'));
  cek(!barisPagu.some((b) => b.includes('proyek="')),
    'kasus 8: tanpa AGENT_ROOM_METRICS_PROYEK, metrik pagu tidak berlabel proyek',
    barisPagu.filter((b) => b.includes('proyek="')).join(' | '));

  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu && tr.pagu.proyek?.length === 1 && tr.pagu.proyek[0].nama === 'proyek-uji'
    && tr.pagu.proyek[0].pakai === 1100 && tr.pagu.proyek[0].persen === 110,
    '/token-riwayat membawa ringkasan pagu (1 proyek, pakai 1100, 110%)',
    JSON.stringify(tr.pagu));

  /* --- kasus 9: buku agenda + putar ulang --- */
  const hariIni = tanggalLokal(Date.now());
  const berkasAgenda = path.join(dir, 'agenda', hariIni + '.jsonl');
  const isiAgenda = fs.existsSync(berkasAgenda) ? fs.readFileSync(berkasAgenda, 'utf8') : '';
  const barisAgenda = isiAgenda.split('\n').filter(Boolean).map((b) => JSON.parse(b))
    .filter((b) => b.kind === 'pagu');
  cek(barisAgenda.length === 2, 'kasus 9: buku agenda memuat 2 baris kind:pagu',
    'ketemu ' + barisAgenda.length + ' baris di ' + berkasAgenda);
  const b0 = barisAgenda[0] || {};
  cek(b0.ambang === 80 && b0.persen === 80 && b0.pakai === 800 && b0.pagu === 1000 && Boolean(b0.minggu),
    'kasus 9: baris agenda membawa ambang/persen/pakai/pagu/minggu', JSON.stringify(b0));

  const ulang = await putarUlang(k.port, hariIni);
  const ulangPagu = ulang.filter((e) => e.kind === 'pagu');
  cek(ulangPagu.length === 2, 'kasus 9: /stream?ulang= mengeluarkan 2 nota pagu lagi',
    'keluar ' + ulangPagu.length + ' dari ' + ulang.length + ' baris');
  const u0 = ulangPagu[0] || {};
  cek(u0.ambang === 80 && u0.pakai === 800 && u0.pagu === 1000 && u0.persen === 80,
    'kasus 9: nota hasil putar ulang utuh', JSON.stringify(u0));

  await tutupKantor(k);
  return dir;
}

async function kasus4(dir) {
  console.log(tebal('\nKasus 4: restart di tengah minggu tidak mengulang nota'));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-2');
  await tidur(400);
  tulisGiliran(dir, 30, 20);
  cek(await tungguGiliran(k, 1), 'giliran sesudah restart terserap');
  await tidur(900);
  cek(hitung(k, 'pagu') === 0, 'kasus 4: NOL nota sesudah restart dengan riwayat yang sama',
    'terbit ' + hitung(k, 'pagu') + ' nota basi');
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.proyek?.[0]?.pakai === 1150,
    'kasus 4: serapan minggu berjalan tetap terbaca (1150 token)', JSON.stringify(tr.pagu?.proyek?.[0]));
  await tutupKantor(k);
}

async function kasus5() {
  console.log(tebal('\nKasus 5: serapan minggu lalu tidak ikut terhitung'));
  const dir = sandboxBaru('b');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80, 100], proyek: { 'proyek-uji': 1000 },
  }));
  const lalu = Date.now() - 8 * 24 * 3600 * 1000;      // selalu jatuh di minggu sebelumnya
  fs.writeFileSync(path.join(dir, 'token-riwayat.jsonl'), JSON.stringify({
    v: 1, ts: lalu, proyek: 'proyek-uji', input: 2000, output: 1000, cacheTulis: 0, cacheBaca: 0,
  }) + '\n');
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-3');
  await tidur(400);
  tulisGiliran(dir, 60, 40);
  cek(await tungguGiliran(k, 1), 'giliran minggu ini terserap');
  await tidur(900);
  cek(hitung(k, 'pagu') === 0, 'kasus 5: 300% minggu lalu + 10% minggu ini = NOL nota',
    'terbit ' + hitung(k, 'pagu') + ' nota');
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.proyek?.[0]?.pakai === 100,
    'kasus 5: serapan minggu berjalan = 100 token (bukan 3100)', JSON.stringify(tr.pagu?.proyek?.[0]));
  await tutupKantor(k);
}

async function kasus6() {
  console.log(tebal('\nKasus 6: tanpa pagu.json, benar-benar tidak ada apa-apa'));
  const dir = sandboxBaru('c');                       // sengaja TANPA pagu.json
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-4');
  await tidur(400);
  tulisGiliran(dir, 6000, 4000);                      // 10x pagu contoh
  cek(await tungguGiliran(k, 1), 'giliran terserap walau fitur pagu mati');
  await tidur(900);
  cek(hitung(k, 'pagu') === 0, 'kasus 6: nol event kind:pagu', 'terbit ' + hitung(k, 'pagu'));

  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu === null, 'kasus 6: /token-riwayat -> pagu === null', 'pagu = ' + JSON.stringify(tr.pagu));

  const met = await minta(k.port, '/metrics');
  const bocor = met.teks.split('\n').filter((b) => b.includes('agent_room_pagu'));
  cek(bocor.length === 0, 'kasus 6: /metrics tidak memuat satu baris agent_room_pagu pun',
    bocor.join(' | '));

  cek(!fs.existsSync(path.join(dir, 'pagu.json')), 'kasus 6: server tidak membuat pagu.json sendiri');
  const konsol = (k.keluar + k.galat).toLowerCase();
  cek(!konsol.includes('pagu'), 'kasus 6: konsol server tidak menyebut kata "pagu" sama sekali',
    (k.keluar + k.galat).split('\n').filter((b) => /pagu/i.test(b)).join(' | '));
  await tutupKantor(k);
}

async function kasus7() {
  console.log(tebal('\nKasus 7: pagu.json rusak tidak menjatuhkan kantor'));
  const dir = sandboxBaru('d');
  fs.writeFileSync(path.join(dir, 'pagu.json'), '{{');
  const k = await bukaKantor(dir);                    // bukaKantor sendiri sudah menunggu /health
  const sehat = await minta(k.port, '/health');
  cek(sehat.status === 200, 'kasus 7: /health tetap 200', 'status ' + sehat.status);
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu === null, 'kasus 7: fitur pagu mati', 'pagu = ' + JSON.stringify(tr.pagu));
  const peringatan = (k.keluar + k.galat).split('\n').filter((b) => /\[agent-room\] pagu/.test(b));
  cek(peringatan.length === 1, 'kasus 7: tepat SATU peringatan konsol',
    peringatan.length + ' baris: ' + peringatan.join(' | '));
  const met = await minta(k.port, '/metrics');
  cek(!met.teks.includes('agent_room_pagu'), 'kasus 7: /metrics tetap bersih dari baris pagu');
  await tutupKantor(k);
}

async function kasus10() {
  console.log(tebal('\nKasus 10: AGENT_ROOM_PAGU_BAWAAN — jalan pintas tanpa berkas'));
  const dir = sandboxBaru('e');                       // sengaja TANPA pagu.json
  const k = await bukaKantor(dir, { AGENT_ROOM_PAGU_BAWAAN: '1000' });
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-5');
  await tidur(400);
  tulisGiliran(dir, 500, 300);
  cek(await tungguGiliran(k, 1), 'giliran terserap');
  await tidur(900);
  const nota = notaPagu(k);
  cek(nota.length === 1 && nota[0].ambang === 80 && nota[0].pagu === 1000,
    'kasus 10: pagu bawaan dari env menerbitkan nota 80% tanpa pagu.json',
    JSON.stringify(nota));
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.ambang?.join(',') === '80,100' && tr.pagu?.hitung === 'io',
    'kasus 10: ambang & cara hitung jatuh ke bawaan', JSON.stringify(tr.pagu));
  cek(tr.pagu?.proyek?.length === 1 && tr.pagu.proyek[0].nama === 'proyek-uji',
    'kasus 10: proyek berserapan ikut dilaporkan walau tidak disebut di berkas',
    JSON.stringify(tr.pagu?.proyek));
  await tutupKantor(k);
}

/* Kasus 11-14 lahir dari pemeriksaan sesudah pembangunan: masing-masing
   pernah MERAH terhadap kode yang sudah lulus kasus 1-10. */

async function kasus11() {
  console.log(tebal('\nKasus 11: ambang berlebih dipotong dari ujung BAWAH, bukan atas'));
  const dir = sandboxBaru('f');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [50, 60, 70, 80, 90, 100], proyek: { 'proyek-uji': 1000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-6');
  await tidur(400);

  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.ambang?.join(',') === '70,80,90,100',
    'kasus 11: yang disimpan 4 ambang TERTINGGI (70,80,90,100)',
    'ambang aktif = ' + JSON.stringify(tr.pagu?.ambang));

  const dibuang = barisKonsol(k, /pagu:.*diabaikan/);
  cek(dibuang.length === 1 && /50/.test(dibuang[0]) && /60/.test(dibuang[0]),
    'kasus 11: ambang yang dibuang disebut namanya di konsol (bukan hilang diam-diam)',
    dibuang.join(' | ') || 'tidak ada satu baris pun');

  tulisGiliran(dir, 1200, 800);                      // 2000 dari 1000 = 200%
  cek(await tungguGiliran(k, 1), 'giliran 200% terserap');
  await tidur(900);
  const nota = notaPagu(k);
  const ambangTerbit = nota.map((n) => n.ambang).sort((a, b) => a - b);
  cek(ambangTerbit.join(',') === '70,80,90,100',
    'kasus 11: keempat ambang aktif terbit sekaligus di 200%', 'terbit ' + JSON.stringify(ambangTerbit));
  cek(nota.some((n) => n.ambang === 100),
    'kasus 11: nota PAGU TERLAMPAUI (ambang 100) benar-benar terbit',
    'ambang yang terbit cuma ' + JSON.stringify(ambangTerbit));
  await tutupKantor(k);
}

async function kasus12() {
  console.log(tebal('\nKasus 12: metrik dari data PENUH, dan tanda per minggu berbatas'));
  const dir = sandboxBaru('g');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({ v: 1, bawaan: 100, ambang: [80, 100] }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-7');
  await tidur(400);

  const N = 250;                                     // lewat batas ringkasan (20) DAN batas tanda (200)
  tulisBanyakProyek(dir, N, 150, 0);                 // masing-masing 150 dari 100 = 150%
  const siap = await tungguSampai(async () => {
    const t = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
    return (t.total?.input || 0) >= N * 150;
  });
  cek(siap, 'ke-' + N + ' proyek terserap ke riwayat');

  const met = await minta(k.port, '/metrics');
  const angka = (nama) => angkaMetrik(met.teks, nama);
  cek(angka('agent_room_pagu_proyek_aktif') === N,
    'kasus 12: agent_room_pagu_proyek_aktif = ' + N + ' (bukan jenuh di 20)',
    'nilainya ' + angka('agent_room_pagu_proyek_aktif'));
  cek(angka('agent_room_pagu_terlampaui') === N,
    'kasus 12: agent_room_pagu_terlampaui = ' + N + ' (bukan jenuh di 20)',
    'nilainya ' + angka('agent_room_pagu_terlampaui'));
  const mRasio = met.teks.match(/agent_room_pagu_serapan_rasio\{agregat="maks"\} ([\d.]+)/);
  cek(mRasio && Number(mRasio[1]) === 1.5,
    'kasus 12: rasio maks = 1.5', 'nilainya ' + (mRasio ? mRasio[1] : 'tidak ada'));

  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.proyek?.length === 20,
    'kasus 12: daftar RINCIAN tetap dipotong 20 baris (pemotongan cuma untuk tampilan)',
    'panjangnya ' + tr.pagu?.proyek?.length);

  const nota = agendaPagu(dir);
  cek(nota.length === 400,
    'kasus 12: nota berhenti di batas tanda (200 proyek x 2 ambang), bukan ' + (N * 2),
    'terbit ' + nota.length + ' nota — tanda per minggu tidak berbatas');
  const penuh = barisKonsol(k, /pagu:.*batas.*ditandai/);
  cek(penuh.length === 1, 'kasus 12: batas tanda disebut sekali di konsol',
    penuh.length + ' baris: ' + penuh.join(' | '));
  await tutupKantor(k);
}

async function kasus13() {
  console.log(tebal('\nKasus 13: laporan pagu selalu tentang minggu BERJALAN'));
  const dir = sandboxBaru('h');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80, 100], proyek: { 'proyek-uji': 1000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-8');
  await tidur(400);

  // Giliran PERTAMA sesudah proses hidup justru baris transkrip lama (resume
  // sesi kemarin). Ini yang dulu mengunci paguMinggu ke minggu lampau.
  tulisGiliran(dir, 60, 40, Date.now() - 9 * 24 * 3600 * 1000);
  cek(await tungguGiliran(k, 1), 'giliran ber-ts minggu lalu terserap');
  await tidur(900);
  const iniMinggu = mingguLokal(Date.now());
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.minggu === iniMinggu,
    'kasus 13: /token-riwayat melaporkan minggu berjalan (' + iniMinggu + ')',
    'minggu = ' + JSON.stringify(tr.pagu?.minggu));
  cek(tr.pagu?.proyek?.[0]?.pakai === 0,
    'kasus 13: serapan minggu berjalan masih 0 (token minggu lalu tidak ikut)',
    JSON.stringify(tr.pagu?.proyek?.[0]));
  cek(hitung(k, 'pagu') === 0, 'kasus 13: baris lama tidak menerbitkan nota',
    'terbit ' + hitung(k, 'pagu') + ' nota');

  tulisGiliran(dir, 500, 300);                       // 800 dari 1000 = 80%, minggu ini
  cek(await tungguGiliran(k, 2), 'giliran minggu ini terserap');
  await tidur(900);
  const nota = notaPagu(k);
  cek(nota.length === 1 && nota[0].ambang === 80 && nota[0].pakai === 800
    && nota[0].minggu === iniMinggu,
    'kasus 13: nota minggu berjalan tetap terbit benar sesudahnya', JSON.stringify(nota));
  await tutupKantor(k);
}

async function kasus14() {
  console.log(tebal('\nKasus 14: nama folder ditolak dengan suara, bukan jadi entri mati'));
  const dir = sandboxBaru('i');
  const panjang = 'p'.repeat(80);                    // lebih panjang dari batas nama
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80], proyek: { [panjang]: 1000, 'dua  spasi': 1000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-9');
  await tidur(400);

  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  const daftar = tr.pagu?.proyek || [];
  cek(!daftar.some((p) => String(p.nama).includes('…')),
    'kasus 14: tidak ada entri berelipsis (kunci begitu tidak akan cocok dengan folder mana pun)',
    JSON.stringify(daftar.map((p) => p.nama)));
  cek(daftar.length === 1 && daftar[0].nama === 'dua  spasi',
    'kasus 14: nama kelewat panjang ditolak, yang sah tetap masuk apa adanya',
    JSON.stringify(daftar.map((p) => p.nama)));
  const tolakan = barisKonsol(k, /pagu:.*terlalu panjang/);
  cek(tolakan.length === 1, 'kasus 14: penolakan nama panjang disebut di konsol',
    tolakan.length + ' baris: ' + tolakan.join(' | '));

  // Spasi ganda: clip() dulu meratakannya jadi satu spasi, dan kuncinya
  // berhenti cocok dengan nama folder sungguhan.
  tulisGiliran(dir, 500, 300, Date.now(), path.join(dir, 'dua  spasi'));
  cek(await tungguGiliran(k, 1), 'giliran proyek berspasi ganda terserap');
  await tidur(900);
  const nota = notaPagu(k);
  cek(nota.length === 1 && nota[0].cwd === 'dua  spasi' && nota[0].ambang === 80,
    'kasus 14: nama folder berspasi ganda tetap cocok dengan kuncinya',
    JSON.stringify(nota.map((n) => ({ cwd: n.cwd, ambang: n.ambang }))));
  await tutupKantor(k);
}

/* Kasus 15-20 lahir dari pemeriksaan putaran KEDUA. */

async function kasus15() {
  console.log(tebal('\nKasus 15: ts MINGGU DEPAN tidak mengunci minggu berjalan ke depan'));
  const dir = sandboxBaru('j');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80, 100], proyek: { 'proyek-uji': 1000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-10');
  await tidur(400);

  /* Satu baris ber-stempel minggu DEPAN. Jam mesin yang cepat, transkrip yang
     dibawa dari mesin lain, atau resume sesudah koreksi NTP — tiga hari
     kalender sudah cukup. Baris ini boleh masuk riwayat, tapi TIDAK boleh
     memindahkan minggu berjalan milik pagu. */
  tulisGiliran(dir, 10, 10, Date.now() + 7 * 24 * 3600 * 1000);
  cek(await tungguGiliran(k, 1), 'giliran ber-ts minggu depan terserap');
  await tidur(900);
  cek(hitung(k, 'pagu') === 0, 'kasus 15: baris masa depan sendiri tidak menerbitkan nota',
    'terbit ' + hitung(k, 'pagu') + ' nota');

  tulisGiliran(dir, 1200, 800);                      // 2000 dari 1000 = 200%, MINGGU INI
  cek(await tungguGiliran(k, 2), 'giliran 200% minggu ini terserap');
  await tidur(900);
  const nota = notaPagu(k);
  const ambangTerbit = nota.map((n) => n.ambang).sort((a, b) => a - b);
  cek(ambangTerbit.join(',') === '80,100',
    'kasus 15: nota 80% & 100% tetap terbit sesudah baris masa depan',
    'yang terbit ' + JSON.stringify(ambangTerbit) + ' — pagu terkunci ke minggu yang belum terjadi');
  cek(nota[0]?.pakai === 2000 && nota[0]?.persen === 200,
    'kasus 15: angka notanya minggu berjalan (2000 token, 200%)', JSON.stringify(nota[0] || null));

  const iniMinggu = mingguLokal(Date.now());
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.minggu === iniMinggu && tr.pagu?.proyek?.[0]?.pakai === 2000,
    'kasus 15: /token-riwayat tetap tentang minggu berjalan', JSON.stringify(tr.pagu?.proyek?.[0]));
  cek(nota[0]?.minggu === iniMinggu,
    'kasus 15: nota memakai minggu berjalan, bukan minggu depan', 'minggu = ' + nota[0]?.minggu);
  await tutupKantor(k);
}

async function kasus16() {
  console.log(tebal('\nKasus 16: berkas yang ujungnya INERT bilang begitu, dan tidak mengaku bersenjata'));

  /* (a) enam ambang + satu-satunya nilai proyek bukan angka: potongan ambangnya
     terjadi, tapi ujungnya tidak ada satu proyek pun yang dipagu. */
  const dirA = sandboxBaru('k');
  fs.writeFileSync(path.join(dirA, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [50, 60, 70, 80, 90, 100], proyek: { 'proyek-uji': 'seribu' },
  }));
  const kA = await bukaKantor(dirA);
  const trA = JSON.parse((await minta(kA.port, '/token-riwayat')).teks);
  cek(trA.pagu === null, 'kasus 16a: fitur memang mati', 'pagu = ' + JSON.stringify(trA.pagu));
  const klaim = barisKonsol(kA, /yang dipakai/);
  cek(klaim.length === 0,
    'kasus 16a: NOL kalimat "yang dipakai" waktu tidak ada ambang yang dipakai',
    klaim.join(' | '));
  const inert = barisKonsol(kA, /pagu:.*tidak memberi pagu/);
  cek(inert.length === 1, 'kasus 16a: tepat satu kalimat "berkasnya ada tapi tidak memberi pagu"',
    inert.length + ' baris: ' + barisKonsol(kA, /\[agent-room\] pagu/).join(' | '));
  await tutupKantor(kA);

  /* (b) salah ketik kunci ("projects" alih-alih "proyek") — dulu senyap total,
     dan orangnya menyangka pagunya jalan. */
  const dirB = sandboxBaru('l');
  fs.writeFileSync(path.join(dirB, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80, 100], projects: { 'proyek-uji': 1000 },
  }));
  const kB = await bukaKantor(dirB);
  const trB = JSON.parse((await minta(kB.port, '/token-riwayat')).teks);
  cek(trB.pagu === null, 'kasus 16b: salah ketik kunci = fitur mati', JSON.stringify(trB.pagu));
  const inertB = barisKonsol(kB, /pagu:.*tidak memberi pagu/);
  cek(inertB.length === 1, 'kasus 16b: berkas inert karena salah ketik tidak senyap',
    inertB.length + ' baris konsol pagu: ' + barisKonsol(kB, /\[agent-room\] pagu/).join(' | '));
  await tutupKantor(kB);

  /* (c) janji 1 tetap: TANPA berkas, tidak ada satu baris pun — termasuk
     kalimat baru di (a)/(b). */
  const dirC = sandboxBaru('m');
  const kC = await bukaKantor(dirC);
  cek(barisKonsol(kC, /pagu/i).length === 0,
    'kasus 16c: tanpa berkas, kalimat "tidak memberi pagu" pun tidak terbit (janji 1)',
    barisKonsol(kC, /pagu/i).join(' | '));
  await tutupKantor(kC);
}

async function kasus17() {
  console.log(tebal('\nKasus 17: ambang 100 tidak pernah dibuang, dari sisi mana pun'));
  const dir = sandboxBaru('n');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [100, 150, 200, 250, 300], proyek: { 'proyek-uji': 1000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-11');
  await tidur(400);

  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek((tr.pagu?.ambang || []).includes(100),
    'kasus 17: ambang 100 ("pagu terlampaui") tetap dipakai walau ambangnya berlebih',
    'ambang aktif = ' + JSON.stringify(tr.pagu?.ambang));
  cek(tr.pagu?.ambang?.join(',') === '100,200,250,300',
    'kasus 17: yang dibuang ambang terendah SELAIN 100 (150), sisanya utuh',
    'ambang aktif = ' + JSON.stringify(tr.pagu?.ambang));
  const dibuang = barisKonsol(k, /pagu:.*diabaikan/);
  cek(dibuang.length === 1 && /diabaikan[^:]*: 150%/.test(dibuang[0])
    && /yang dipakai:[^)]*100%/.test(dibuang[0]),
    'kasus 17: konsol menyebut 150% sebagai yang dibuang, dan 100% sebagai yang dipakai',
    dibuang.join(' | ') || 'tidak ada satu baris pun');

  tulisGiliran(dir, 2400, 1600);                     // 4000 dari 1000 = 400%
  cek(await tungguGiliran(k, 1), 'giliran 400% terserap');
  await tidur(900);
  const nota = notaPagu(k);
  const ambangTerbit = nota.map((n) => n.ambang).sort((a, b) => a - b);
  cek(ambangTerbit.includes(100),
    'kasus 17: nota PAGU TERLAMPAUI (ambang 100) benar-benar terbit',
    'yang terbit ' + JSON.stringify(ambangTerbit));
  cek(ambangTerbit.join(',') === '100,200,250,300',
    'kasus 17: keempat ambang aktif terbit di 400%', 'yang terbit ' + JSON.stringify(ambangTerbit));
  await tutupKantor(k);
}

async function kasus18() {
  console.log(tebal('\nKasus 18: agent_room_pagu_proyek menghitung yang dijanjikan HELP-nya'));
  const dir = sandboxBaru('o');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, bawaan: 100, ambang: [80, 100], proyek: { 'proyek-tetap': 5000 },
  }));
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-12');
  await tidur(400);

  const met1 = (await minta(k.port, '/metrics')).teks;
  cek(angkaMetrik(met1, 'agent_room_pagu_proyek') === 1,
    'kasus 18: agent_room_pagu_proyek = 1 (pagu eksplisit di pagu.json)',
    'nilainya ' + angkaMetrik(met1, 'agent_room_pagu_proyek'));
  cek(angkaMetrik(met1, 'agent_room_pagu_bawaan') === 100,
    'kasus 18: agent_room_pagu_bawaan = 100 (pagu bawaan kelihatan, bukan tersembunyi)',
    'nilainya ' + angkaMetrik(met1, 'agent_room_pagu_bawaan'));
  cek(angkaMetrik(met1, 'agent_room_pagu_proyek_aktif') === 1,
    'kasus 18: agent_room_pagu_proyek_aktif = 1 sebelum ada serapan lain',
    'nilainya ' + angkaMetrik(met1, 'agent_room_pagu_proyek_aktif'));

  /* Proyek yang pagunya cuma dari `bawaan` menyerap minggu ini. Yang boleh
     bergerak cuma yang week-scoped; yang mengaku "punya pagu" tidak. */
  tulisGiliran(dir, 150, 0, Date.now(), path.join(dir, 'proy-numpang'));
  cek(await tungguGiliran(k, 1), 'giliran proyek berpagu bawaan terserap');
  await tidur(900);
  const met2 = (await minta(k.port, '/metrics')).teks;
  cek(angkaMetrik(met2, 'agent_room_pagu_proyek') === 1,
    'kasus 18: agent_room_pagu_proyek TIDAK ikut bergerak dengan serapan mingguan'
    + ' (gigi gergaji tiap Senin)',
    'nilainya jadi ' + angkaMetrik(met2, 'agent_room_pagu_proyek'));
  cek(angkaMetrik(met2, 'agent_room_pagu_proyek_aktif') === 2,
    'kasus 18: yang week-scoped punya nama sendiri dan naik jadi 2',
    'nilainya ' + angkaMetrik(met2, 'agent_room_pagu_proyek_aktif'));
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.berpagu === 1 && tr.pagu?.bawaan === 100 && tr.pagu?.jumlah === 2,
    'kasus 18: /token-riwayat memisahkan konfigurasi (berpagu/bawaan) dari himpunan minggu ini (jumlah)',
    JSON.stringify({ berpagu: tr.pagu?.berpagu, bawaan: tr.pagu?.bawaan, jumlah: tr.pagu?.jumlah }));
  const help = helpMetrik(met2, 'agent_room_pagu_proyek');
  cek(/pagu\.json/.test(help) && !/minggu/i.test(help),
    'kasus 18: HELP agent_room_pagu_proyek menjanjikan yang memang dihitung', 'HELP = ' + help);
  cek(/minggu/i.test(helpMetrik(met2, 'agent_room_pagu_proyek_aktif')),
    'kasus 18: HELP agent_room_pagu_proyek_aktif menyebut minggu berjalan',
    'HELP = ' + helpMetrik(met2, 'agent_room_pagu_proyek_aktif'));
  await tutupKantor(k);
}

async function kasus19() {
  console.log(tebal('\nKasus 19: keluarga metrik pagu tidak mencampur agregat telanjang & per-proyek'));
  const dir = sandboxBaru('p');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({ v: 1, bawaan: 100, ambang: [80, 100] }));
  const N = 25;
  tanamRiwayat(dir, N, 150, 0);                      // 150 dari 100 = 150%, semuanya lewat
  const k = await bukaKantor(dir, { AGENT_ROOM_METRICS_PROYEK: '1' });
  const met = (await minta(k.port, '/metrics')).teks;

  const campur = [...keluargaMetrik(met, 'agent_room_pagu')]
    .filter(([, g]) => g.telanjang > 0 && g.berlabel > 0);
  cek(campur.length === 0,
    'kasus 19: nol keluarga metrik pagu yang memuat seri telanjang DAN seri berlabel',
    campur.map(([n, g]) => n + ' (' + g.telanjang + ' telanjang + ' + g.berlabel + ' berlabel)').join(' | '));

  cek(angkaMetrik(met, 'agent_room_pagu_terlampaui') === N,
    'kasus 19: agregat agent_room_pagu_terlampaui = ' + N,
    'nilainya ' + angkaMetrik(met, 'agent_room_pagu_terlampaui'));
  const perProyek = met.split('\n').filter((b) => /^agent_room_pagu_proyek_terlampaui\{proyek="/.test(b));
  cek(perProyek.length === 20,
    'kasus 19: seri per-proyek pindah ke agent_room_pagu_proyek_terlampaui (20 teratas)',
    'ketemu ' + perProyek.length + ' baris');
  const rasioProyek = met.split('\n').filter((b) => /^agent_room_pagu_proyek_serapan_rasio\{proyek="/.test(b));
  cek(rasioProyek.length === 20,
    'kasus 19: rasio per-proyek pindah ke agent_room_pagu_proyek_serapan_rasio (20 teratas)',
    'ketemu ' + rasioProyek.length + ' baris');

  /* sum() yang akan dihitung Prometheus untuk tiap keluarga = jumlah semua
     serinya. Untuk keluarga terlampaui, itu harus 25 (agregat) dan 20
     (per-proyek), bukan 45 dalam satu nama. */
  const jumlahSeri = (nama) => met.split('\n')
    .filter((b) => b.startsWith(nama + ' ') || b.startsWith(nama + '{'))
    .reduce((a, b) => a + Number(b.slice(b.lastIndexOf(' ') + 1) || 0), 0);
  cek(jumlahSeri('agent_room_pagu_terlampaui') === N,
    'kasus 19: sum(agent_room_pagu_terlampaui) = ' + N + ', bukan dobel',
    'sum-nya ' + jumlahSeri('agent_room_pagu_terlampaui'));
  await tutupKantor(k);
}

async function kasus20() {
  console.log(tebal('\nKasus 20: laporan pagu tidak dihitung ulang tiap scrape, tapi tetap segar'));
  const dir = sandboxBaru('q');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({ v: 1, bawaan: 100, ambang: [80, 100] }));
  const N = 8000;                                    // kantor yang sudah lama hidup
  tanamRiwayat(dir, N, 150, 0);
  const k = await bukaKantor(dir);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-13');
  await tidur(400);

  /* Scrape PERTAMA sesudah riwayat termuat: di sinilah himpunan penuhnya
     dihitung. Sesudah ini datanya tidak berubah sampai ada giliran baru. */
  const t0 = Date.now();
  const metDingin = (await minta(k.port, '/metrics')).teks;
  const dingin = Date.now() - t0;
  cek(angkaMetrik(metDingin, 'agent_room_pagu_proyek_aktif') === N,
    'kasus 20: ke-' + N + ' proyek memang ikut dihitung',
    'nilainya ' + angkaMetrik(metDingin, 'agent_room_pagu_proyek_aktif'));

  /* Ongkos yang BUKAN milik blok pagu (ongkos soket, dan metrik token yang
     juga mahal dengan 8.000 proyek sehari) diukur di kantor KEMBAR: riwayat
     yang sama persis, pagu.json diarahkan ke berkas yang tidak ada. Selisih
     dua angka inilah biaya blok pagu — bukan "berapa lama /metrics", yang
     jawabannya berbeda di tiap mesin. */
  const kTanpa = await bukaKantor(dir, { AGENT_ROOM_PAGU: path.join(dir, 'tidak-ada.json') });
  const ULANG = 20;
  const perScrape = async (kk) => {
    await minta(kk.port, '/metrics');                // buang yang pertama
    const t = Date.now();
    for (let i = 0; i < ULANG; i++) await minta(kk.port, '/metrics');
    return (Date.now() - t) / ULANG;
  };
  const tanpa = await perScrape(kTanpa);
  const dengan = await perScrape(k);
  await tutupKantor(kTanpa);
  const hangatPagu = Math.max(0, dengan - tanpa);    // biaya pagu per scrape berulang
  const dinginPagu = Math.max(1, dingin - tanpa);    // biaya pagu sekali hitung penuh
  console.log(abu('      ' + N + ' proyek: hitung penuh ' + dinginPagu.toFixed(1) + ' ms; '
    + ULANG + ' scrape berikutnya ' + hangatPagu.toFixed(2) + ' ms/scrape'
    + ' (/metrics ' + dengan.toFixed(2) + ' ms dengan pagu vs ' + tanpa.toFixed(2) + ' ms tanpa)'));
  cek(hangatPagu * ULANG < dinginPagu * 5,
    'kasus 20: ' + ULANG + ' scrape berturut-turut lebih murah dari 5 x hitung penuh',
    (hangatPagu * ULANG).toFixed(1) + ' ms untuk ' + ULANG + ' scrape vs ' + dinginPagu.toFixed(1)
    + ' ms sekali hitung penuh — himpunan ' + N + ' proyek dihitung ulang tiap scrape');

  /* Ambang waktu di atas cuma KETERANGAN, dan sudah terbukti tidak bisa
     merah: cachenya pernah dimatikan total dan angkanya tetap muat di jatah
     itu, empat kali berturut-turut. Hitung penuh 8.000 proyek cuma beberapa
     milidetik, dan mesin yang ramai tidak akan pernah bisa membedakan 3 ms
     dari 0 ms dengan aman — jadi klaim "dihitung sekali" ditagih di bawah
     dengan angka BULAT, bukan dengan stopwatch: counter hitung penuh di
     /metrics naik sekali per giliran baru, dan nol kali karena discrape. */
  const hitungPenuh = async () => angkaMetrik((await minta(k.port, '/metrics')).teks,
    'agent_room_pagu_hitung_penuh_total');
  const h0 = await hitungPenuh();
  cek(Number.isFinite(h0) && h0 >= 1,
    'kasus 20: counter hitung penuh laporan pagu ada di /metrics',
    'agent_room_pagu_hitung_penuh_total = ' + h0 + ' — cachenya tidak bisa ditagih dari luar');
  const SCRAPE = 20;
  for (let i = 0; i < SCRAPE; i++) {
    await minta(k.port, '/metrics');
    await minta(k.port, '/token-riwayat');
  }
  const h1 = await hitungPenuh();
  cek(h1 === h0,
    'kasus 20: ' + SCRAPE + ' x (/metrics + /token-riwayat) tanpa giliran baru = NOL hitung penuh',
    'counter naik dari ' + h0 + ' ke ' + h1 + ' — himpunan ' + N + ' proyek dihitung ulang tiap scrape');

  /* Segar itu syaratnya, bukan bonus: kasus 4/5/13 membaca /token-riwayat
     tepat sesudah satu giliran. Cache yang berbasis WAKTU akan lulus uji
     kecepatan di atas dan gagal di sini. */
  tulisGiliran(dir, 700, 0, Date.now(), path.join(dir, 'proy-baru'));
  cek(await tungguGiliran(k, 1), 'giliran proyek baru terserap');
  await tidur(900);
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  const baru = (tr.pagu?.proyek || []).find((p) => p.nama === 'proy-baru');
  cek(baru?.pakai === 700,
    'kasus 20: /token-riwayat langsung segar sesudah satu giliran (bukan angka basi)',
    JSON.stringify(baru || null));
  cek(angkaMetrik((await minta(k.port, '/metrics')).teks, 'agent_room_pagu_proyek_aktif') === N + 1,
    'kasus 20: /metrics ikut segar (' + (N + 1) + ' proyek)',
    'nilainya ' + angkaMetrik((await minta(k.port, '/metrics')).teks, 'agent_room_pagu_proyek_aktif'));

  /* Sisi lain dari klaim yang sama, dan yang membuatnya tidak bisa dipuaskan
     dengan "hitung ulang saja terus": satu giliran baru = TEPAT satu hitung
     penuh, walau sesudahnya discrape berkali-kali. */
  const h2 = await hitungPenuh();
  cek(h2 === h0 + 1,
    'kasus 20: satu giliran baru = tepat SATU hitung penuh, bukan satu per scrape',
    'counter ' + h0 + ' -> ' + h2 + ' sesudah satu giliran dan beberapa scrape');
  await tutupKantor(k);
}

/* Kasus 21-22 lahir dari pemeriksaan putaran KETIGA. */

async function kasus21() {
  console.log(tebal('\nKasus 21: jam mesin yang MUNDUR melewati batas minggu tidak mematikan nota'));
  const dir = sandboxBaru('r');
  fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
    v: 1, ambang: [80, 100], proyek: { 'proyek-uji': 1000 },
  }));

  /* Kembaran terbalik dari kasus 15. Di sana yang salah stempel TRANSKRIP-nya
     dan jam mesinnya benar; di sini jam MESIN-nya sendiri yang ngebut delapan
     hari lalu dibetulkan mundur — koreksi NTP, snapshot mesin maya dipulihkan,
     tanggal mesin salah lalu dibetulkan orangnya. Langit-langit minggu pagu
     memakai Date.now() milik server, jadi keadaan ini TIDAK bisa dipalsukan
     dari sisi transkrip: jamnya harus benar-benar digeser. */
  const DELAPAN_HARI = 8 * 24 * 3600 * 1000;
  const jam = jamPalsu(dir, DELAPAN_HARI);
  const k = await bukaKantor(dir, jam.env, jam.argNode);
  await bukaStream(k);
  await kirimHook(k, dir, 'uji-anggaran-14');
  await tidur(400);

  const mingguDepan = mingguLokal(Date.now() + DELAPAN_HARI);
  const mingguIni = mingguLokal(Date.now());
  cek(mingguDepan !== mingguIni, 'kasus 21: geseran delapan hari memang melewati batas minggu',
    mingguIni + ' vs ' + mingguDepan);

  /* Satu giliran KECIL selagi jam ngebut. Jumlahnya jauh di bawah ambang, jadi
     tidak ada nota — yang dikerjakannya cuma satu: mengunci tanda minggu pagu
     ke minggu yang (menurut jam sungguhan) belum terjadi. */
  tulisGiliran(dir, 5, 5, Date.now() + DELAPAN_HARI);
  cek(await tungguGiliran(k, 1), 'kasus 21: giliran selagi jam ngebut terserap');
  await tidur(600);
  const trNgebut = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(trNgebut.pagu?.minggu === mingguDepan,
    'kasus 21: selagi jam ngebut, laporan pagu memang tentang minggu jam mesin',
    'minggu = ' + trNgebut.pagu?.minggu + ', harusnya ' + mingguDepan);
  cek(hitung(k, 'pagu') === 0, 'kasus 21: giliran kecil itu sendiri tidak menerbitkan nota',
    'terbit ' + hitung(k, 'pagu') + ' nota');

  // KOREKSI: jam mesin dibetulkan, mundur delapan hari, melewati batas minggu.
  jam.geser(0);
  await tidur(300);

  tulisGiliran(dir, 700, 500);                       // 1200 dari 1000 = 120%, minggu SUNGGUHAN
  cek(await tungguGiliran(k, 2), 'kasus 21: giliran sesudah jam dibetulkan terserap');
  await tidur(1200);
  const nota = notaPagu(k);
  const ambangTerbit = nota.map((n) => n.ambang).sort((a, b) => a - b);
  cek(ambangTerbit.join(',') === '80,100',
    'kasus 21: nota 80% & 100% tetap terbit sesudah jam mesin mundur lintas minggu',
    'yang terbit ' + JSON.stringify(ambangTerbit) + ' — pagu masih terkunci ke minggu '
    + trNgebut.pagu?.minggu + ', dan matinya senyap sampai jam mesin menyusul');
  cek(nota[0]?.pakai === 1200 && nota[0]?.persen === 120,
    'kasus 21: angka notanya minggu berjalan sungguhan (1200 token, 120%)',
    JSON.stringify(nota[0] || null));
  cek(nota[0]?.minggu === mingguLokal(Date.now()),
    'kasus 21: nota memakai minggu berjalan sesudah koreksi, bukan minggu yang terkunci',
    'minggu = ' + nota[0]?.minggu);
  const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
  cek(tr.pagu?.minggu === mingguLokal(Date.now()) && tr.pagu?.proyek?.[0]?.pakai === 1200,
    'kasus 21: /token-riwayat dan nota sepakat soal minggu berjalan',
    JSON.stringify({ minggu: tr.pagu?.minggu, proyek: tr.pagu?.proyek?.[0] }));

  /* Kelihatan, bukan senyap: keadaan "jam mesin mundur lintas minggu" itu
     kejadian yang pantas dibaca orangnya di konsol. Tepat SATU baris — sesudah
     tandanya dibuang, paguMinggu tidak lagi di masa depan. */
  const suara = barisKonsol(k, /jam mesin mundur/);
  cek(suara.length === 1, 'kasus 21: tepat satu baris konsol soal jam mesin yang mundur',
    suara.length + ' baris: ' + (barisKonsol(k, /\[agent-room\] pagu/).join(' | ') || '(kosong)'));

  /* Rem baliknya: membuang tanda minggu TIDAK boleh jadi kebiasaan tiap
     giliran. Kalau iya, tiap giliran berikutnya menerbitkan ulang 80% & 100%
     yang sama — hujan nota, cacat yang lebih berisik daripada yang ditutup. */
  const sebelum = notaPagu(k).length;
  tulisGiliran(dir, 100, 0);
  cek(await tungguGiliran(k, 3), 'kasus 21: giliran ketiga terserap');
  await tidur(900);
  cek(notaPagu(k).length === sebelum,
    'kasus 21: giliran berikutnya tidak menerbitkan ulang nota yang sudah terbit',
    'nota bertambah dari ' + sebelum + ' jadi ' + notaPagu(k).length);
  cek(barisKonsol(k, /jam mesin mundur/).length === 1,
    'kasus 21: peringatan jam mesin tidak berulang tiap giliran',
    barisKonsol(k, /jam mesin mundur/).length + ' baris');
  await tutupKantor(k);
}

async function kasus22() {
  console.log(tebal('\nKasus 22: hitung "semua" ikut menghitung token cache, "io" tidak'));

  /* Cabang `hitung` punya tiga tempat yang harus sepakat — paguSerapan()
     (nota), paguDelta() (dasar diam), dan lintasan tunggal paguRingkas()
     (laporan + metrik). Sampai sekarang ketiganya cuma pernah dilewati dengan
     "io". Berkas yang SAMA PERSIS dijalankan dua kali, cuma `hitung`-nya yang
     beda, dan angkanya harus berbeda dengan cara yang bisa diramalkan. */
  const USAGE = {
    input_tokens: 60, output_tokens: 40,
    cache_creation_input_tokens: 500, cache_read_input_tokens: 300,
  };
  const rasioMaks = (teks) => {
    const m = teks.match(/^agent_room_pagu_serapan_rasio\{agregat="maks"\} ([\d.]+)$/m);
    return m ? Number(m[1]) : null;
  };

  const jalankan = async (mode, huruf, sesi) => {
    const dir = sandboxBaru(huruf);
    fs.writeFileSync(path.join(dir, 'pagu.json'), JSON.stringify({
      v: 1, ambang: [80, 100], hitung: mode, proyek: { 'proyek-uji': 1000 },
    }));
    const k = await bukaKantor(dir);
    await bukaStream(k);
    await kirimHook(k, dir, sesi);
    await tidur(400);
    tulisGiliranPenuh(dir, USAGE);
    cek(await tungguGiliran(k, 1), 'kasus 22 (' + mode + '): giliran ber-token cache terserap');
    await tidur(900);
    const tr = JSON.parse((await minta(k.port, '/token-riwayat')).teks);
    const met = (await minta(k.port, '/metrics')).teks;
    const hasil = {
      hitung: tr.pagu?.hitung,
      pakai: tr.pagu?.proyek?.[0]?.pakai,
      persen: tr.pagu?.proyek?.[0]?.persen,
      rasio: rasioMaks(met),
      ambang: notaPagu(k).map((n) => n.ambang).sort((a, b) => a - b).join(','),
    };
    await tutupKantor(k);
    return hasil;
  };

  // 60 + 40 = 100 dari 1000 = 10%: di bawah ambang mana pun.
  const io = await jalankan('io', 's', 'uji-anggaran-15');
  cek(io.hitung === 'io' && io.pakai === 100 && io.persen === 10,
    'kasus 22: hitung "io" menjumlahkan input+output saja (100 dari 1000)', JSON.stringify(io));
  cek(io.rasio === 0.1, 'kasus 22: rasio metrik "io" = 0.1', 'rasio = ' + io.rasio);
  cek(io.ambang === '', 'kasus 22: "io" tidak menerbitkan nota di 10%', 'terbit ' + io.ambang);

  // 60 + 40 + 500 + 300 = 900 dari 1000 = 90%: lewat ambang 80, belum 100.
  const semua = await jalankan('semua', 't', 'uji-anggaran-16');
  cek(semua.hitung === 'semua' && semua.pakai === 900 && semua.persen === 90,
    'kasus 22: hitung "semua" ikut menghitung cacheTulis+cacheBaca (900 dari 1000)',
    JSON.stringify(semua));
  cek(semua.rasio === 0.9, 'kasus 22: rasio metrik "semua" = 0.9', 'rasio = ' + semua.rasio);
  cek(semua.ambang === '80',
    'kasus 22: baris yang sama menerbitkan nota 80% di mode "semua", dan cuma 80%',
    'terbit ' + JSON.stringify(semua.ambang));
  cek(semua.pakai === io.pakai + 800,
    'kasus 22: selisih dua mode persis token cache-nya (800)',
    io.pakai + ' vs ' + semua.pakai);
}

/* ================================================================== jalan === */

async function main() {
  console.log(tebal('Uji pagu anggaran token') + abu('  (server.mjs, kotak hitam, port mulai ' + PORT_MULAI + ')'));
  lintStatis();
  const dirA = await kasus1sampai3dan8dan9();
  await kasus4(dirA);
  await kasus5();
  await kasus6();
  await kasus7();
  await kasus10();
  await kasus11();
  await kasus12();
  await kasus13();
  await kasus14();
  await kasus15();
  await kasus16();
  await kasus17();
  await kasus18();
  await kasus19();
  await kasus20();
  await kasus21();
  await kasus22();

  console.log('\n' + (jumlahGagal === 0
    ? hijau(tebal('SEMUA LULUS')) + ' — ' + jumlahLulus + ' pemeriksaan'
    : merah(tebal(jumlahGagal + ' GAGAL')) + ' dari ' + (jumlahLulus + jumlahGagal) + ' pemeriksaan'));
  return jumlahGagal === 0 ? 0 : 1;
}

async function bersih() {
  for (const k of [...kantorHidup]) await tutupKantor(k);
  for (const d of sandboxes) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* Windows kadang masih memegang */ }
  }
}

main()
  .then(async (kode) => { await bersih(); process.exit(kode); })
  .catch(async (err) => {
    console.error(merah('\nuji-pagu gagal jalan: ' + (err?.stack || err)));
    await bersih();
    process.exit(1);
  });
