#!/usr/bin/env node
// uji-event.mjs :: harness uji headless untuk event acak (public/event-acak.js)
//
// Masalah yang dibereskan: satu-satunya cara menguji sebuah event sekarang
// adalah lewat browser hidup — dan bahkan itu pun jebakan. `?event=<id>`
// memang memaksa mulai() jalan, tapi SKIP syarat() sepenuhnya (lihat
// EVENT_PAKSA di public/room.js), dan tick()/selesai() cuma jalan kalau ada
// loop animasi yang benar-benar hidup selama durasinya. `?demo=1` bisa saja
// tidak pernah mencapai keadaan yang disyaratkan sebuah event. Tidak ada
// automated test sama sekali untuk ~270 definisi event.
//
// Harness ini memuat public/room.js + public/event-acak.js apa adanya (dua
// classic script, sama seperti public/index.html memuatnya — BUKAN modul,
// jadi keduanya berbagi satu scope global lexical) ke dalam sandbox
// node:vm, dengan shim DOM/browser paling minim yang membiarkannya SELESAI
// LOAD tanpa membiarkan requestAnimationFrame benar-benar jalan (yang akan
// membuatnya masuk loop animasi tak berhenti). Dari situ syarat()/mulai()/
// tick()/selesai() tiap event dipanggil langsung terhadap S/E buatan
// tangan — tanpa server, tanpa browser sungguhan.
//
// Tiga lubang yang dulu SENGAJA dilewati kini ditutup:
//   * hook gambar* (gambarDinding/gambarLantai/gambarProp/gambarAtas — daftar
//     namanya DIBACA dari room.js, lihat daftarHookGambar) dipanggil beberapa
//     kali sepanjang smoke terhadap canvas 2D PALSU (buatCtxPalsu) yang
//     menghitung panggilan dan MELEMPAR kalau ada argumen angka NaN/undefined/
//     Infinity — jadi bug render ketahuan tanpa peramban;
//   * rantai `lanjutan` diikuti sampai kedalaman 3 di sandbox yang sama
//     (RUANGAN/MOD/S tidak direset) — peluangnya diabaikan, semua cabang diuji;
//   * aturan `bentrok`/`kelas panggung`/pinjam aktor diuji lewat FUNGSI ASLI
//     room.js (bentrok, nyalakanEvent, matikanEvent, pinjamAktor) terhadap
//     definisi sintetis — lihat ujiPenjadwal; bukan salinan aturan.
//
// `Date` di dalam sandbox DIPALSUKAN (lihat buatDatePalsu): dikunci ke Rabu
// 15 April 2026, jamnya mengikuti S.jam. Tanpa ini, event yang syarat()/
// mulai()-nya membaca `new Date()` langsung (ramadan-siang-sunyi lewat
// taksirHijri(), hari-kejepit-nasional lewat HARI_KEJEPIT, hari-batik-
// nasional, hari-korpri, hormat-bendera, kembang-api-tahun-baru, tahun-
// anggaran-baru, serapan-anggaran-akhir-tahun, jumat-bersih, jam-dinding-
// mati, spanduk) ikut tanggal sungguhan hari itu — dan CI jadi merah/hijau
// tergantung kalender, bukan kode.
//
// Berkas ini juga MODUL: uji-zorder.mjs dan uji-katalog.mjs mengimpor
// muatKonteks/buatS/buatE/dkk. dari sini supaya sandbox-nya satu sumber.
//
// Pakai:
//   node uji-event.mjs <id>          satu event, detail lengkap
//   node uji-event.mjs --semua       sapu semua event + uji penjadwal, ringkas
//   node uji-event.mjs --penjadwal   cuma uji aturan bentrok/panggung/aktor
//   node uji-event.mjs --daftar      cetak semua id yang valid

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* --------------------------------------------------------------- warna --- */
const boleh = process.stdout.isTTY && !process.env.NO_COLOR;
const cat = (kode) => (teks) => (boleh ? `\x1b[${kode}m${teks}\x1b[0m` : String(teks));
export const merah = cat(31), hijau = cat(32), kuning = cat(33), abu = cat(90), tebal = cat(1);

/* ---------------------------------------------------------- Date palsu --- *
 * Tanggal acuan tetap: Rabu 15 April 2026 — hari kerja biasa, di luar
 * Ramadan 1447 (±18 Feb–19 Mar 2026), bukan tanggal HARI_KEJEPIT, bukan
 * 17-an, bukan Oktober–Desember (batik/korpri/serapan), bukan awal Januari
 * (tahun-anggaran-baru), bukan Senin/Jumat (hormat-bendera/jumat-bersih).
 * getDay()=3 dan getDate()=15 SENGAJA sama dengan S.hari=3/S.tanggal=15 di
 * buatS(), dan jamnya digeser lewat setJamPalsu(S.jam) supaya
 * `new Date().getHours()` di dalam event tidak bertentangan dengan S.jam.
 * Dibangun lewat komponen waktu LOKAL (bukan ISO/UTC) supaya getHours()/
 * getDay()/getDate() sama persis di WIB maupun di runner CI ber-UTC. */
const TANGGAL_BEKU = { tahun: 2026, bulan: 3, tanggal: 15 };   // bulan 0-based -> April
let msBeku = 0;
export function setJamPalsu(jam) {
  const j = Math.floor(jam), m = Math.round((jam - j) * 60);
  msBeku = new Date(TANGGAL_BEKU.tahun, TANGGAL_BEKU.bulan, TANGGAL_BEKU.tanggal, j, m, 0, 0).getTime();
}
setJamPalsu(10);

// Subclass Date asli: cuma konstruktor TANPA argumen dan Date.now() yang
// dibelokkan ke msBeku; `new Date(ms)`, `new Date(str)`, Date.parse/UTC,
// getMonth()/toLocale*() dst. tetap perilaku asli. Dibungkus Proxy supaya
// `Date()` tanpa `new` (yang pada class biasa melempar TypeError) tetap
// mengembalikan string, sama seperti Date asli.
function buatDatePalsu() {
  class DatePalsu extends Date {
    constructor(...args) {
      if (args.length === 0) super(msBeku);
      else super(...args);
    }
    static now() { return msBeku; }
  }
  return new Proxy(DatePalsu, {
    apply() { return new DatePalsu().toString(); },
  });
}

/* --------------------------------------------------------- dummy shim --- *
 * Satu objek "tak terbatas": properti apa pun mengembalikan dirinya
 * sendiri, dipanggil sebagai fungsi mengembalikan dirinya sendiri, di-`new`
 * mengembalikan dirinya sendiri — jadi rantai selebar apa pun
 * (`document.getElementById('x').style.display`, `new (window.AudioContext
 * || window.webkitAudioContext)()`, dst.) aman diproses tanpa pernah
 * melempar. Sengaja SATU instance dipakai ulang untuk document/window/
 * navigator/AudioContext/EventSource/ResizeObserver/dkk — dummy tidak
 * pernah menyimpan state pembeda, jadi tidak ada gunanya instance terpisah. */
function buatDummy() {
  const sasaran = function dummy() {};
  let d;
  const jerat = {
    get(t, prop, receiver) {
      if (prop === 'then') return undefined;        // jangan dikira thenable, await bisa menggantung
      if (prop === Symbol.toPrimitive || prop === 'valueOf'
        || prop === 'toString' || prop === Symbol.toStringTag) {
        return Reflect.get(t, prop, receiver);       // koersi (String(x), template literal) lewat asli
      }
      return d;
    },
    apply() { return d; },
    construct() { return d; },
  };
  d = new Proxy(sasaran, jerat);
  return d;
}

/* ------------------------------------------------------- canvas 2D palsu --- *
 * CanvasRenderingContext2D tiruan: setiap method yang dipakai room.js /
 * event-acak.js ada, MENGHITUNG panggilannya (hitung: Map nama -> n), dan
 * dalam mode `ketat` MELEMPAR kalau argumen yang seharusnya angka ternyata
 * NaN/undefined/Infinity/bukan angka. Indeks argumen angka per method
 * disalin dari tanda tangan spesifikasi Canvas 2D (wajib vs opsional). Di
 * peramban kesalahan macam ini DIAM (fillRect(NaN,...) cuma tidak menggambar)
 * — itu sebabnya bug render tidak pernah kelihatan di konsol.
 *
 * Setter properti (fillStyle, globalAlpha, font, ...) ikut dihitung dengan
 * nama '=fillStyle' dst. globalAlpha/lineWidth/dkk. wajib angka hingga;
 * fillStyle/strokeStyle wajib string atau objek gradien/pola (bukan
 * undefined — biasanya salah ketik nama warna di palet P). */
const SPEK_CTX = {
  // nama: [indeks angka wajib, indeks angka opsional]
  fillRect: [[0, 1, 2, 3], []], strokeRect: [[0, 1, 2, 3], []], clearRect: [[0, 1, 2, 3], []],
  fillText: [[1, 2], [3]], strokeText: [[1, 2], [3]],
  beginPath: [[], []], closePath: [[], []], stroke: [[], []], fill: [[], []], clip: [[], []],
  save: [[], []], restore: [[], []],
  moveTo: [[0, 1], []], lineTo: [[0, 1], []], rect: [[0, 1, 2, 3], []],
  arc: [[0, 1, 2, 3, 4], []], arcTo: [[0, 1, 2, 3, 4], []],
  ellipse: [[0, 1, 2, 3, 4, 5, 6], []],
  quadraticCurveTo: [[0, 1, 2, 3], []], bezierCurveTo: [[0, 1, 2, 3, 4, 5], []],
  roundRect: [[0, 1, 2, 3], []],
  translate: [[0, 1], []], scale: [[0, 1], []], rotate: [[0], []],
  transform: [[0, 1, 2, 3, 4, 5], []], resetTransform: [[], []],
  setLineDash: [[], []], getLineDash: [[], []],
  createRadialGradient: [[0, 1, 2, 3, 4, 5], []], createLinearGradient: [[0, 1, 2, 3], []],
  createConicGradient: [[0, 1, 2], []],
  createPattern: [[], []], measureText: [[], []],
  getImageData: [[0, 1, 2, 3], []], putImageData: [[1, 2], [3, 4, 5, 6]], createImageData: [[], []],
  isPointInPath: [[], []],
};
const PROP_ANGKA_CTX = ['globalAlpha', 'lineWidth', 'miterLimit', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'lineDashOffset'];
const PROP_LAIN_CTX = ['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin',
  'globalCompositeOperation', 'filter', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'shadowColor',
  'direction', 'letterSpacing', 'fontKerning', 'fontStretch', 'fontVariantCaps', 'textRendering', 'wordSpacing'];

export function buatCtxPalsu({ ketat = true, hitung = new Map() } = {}) {
  const k = { ketat, hitung };
  const catat = (m) => hitung.set(m, (hitung.get(m) || 0) + 1);
  const buruk = (v) => typeof v !== 'number' || !Number.isFinite(v);
  const periksa = (m, args, wajib, opsional) => {
    if (!k.ketat) return;
    for (const i of wajib) {
      if (buruk(args[i])) throw new TypeError(`ctx.${m}(): argumen #${i + 1} bukan angka hingga: ${String(args[i])}`);
    }
    for (const i of opsional) {
      if (args[i] !== undefined && buruk(args[i])) throw new TypeError(`ctx.${m}(): argumen #${i + 1} bukan angka hingga: ${String(args[i])}`);
    }
  };
  const gradien = () => ({
    addColorStop(offset, warna) {
      catat('addColorStop');
      if (k.ketat && (buruk(offset) || typeof warna !== 'string')) {
        throw new TypeError(`gradien.addColorStop(${String(offset)}, ${String(warna)}): offset wajib angka hingga, warna wajib string`);
      }
    },
  });
  const ctx = {};
  for (const [m, [wajib, opsional]] of Object.entries(SPEK_CTX)) {
    ctx[m] = function (...args) { catat(m); periksa(m, args, wajib, opsional); };
  }
  // yang punya nilai balik / bentuk argumen khusus
  for (const m of ['createRadialGradient', 'createLinearGradient', 'createConicGradient']) {
    const dasar = ctx[m];
    ctx[m] = function (...args) { dasar(...args); return gradien(); };
  }
  ctx.createPattern = function () { catat('createPattern'); return { setTransform() {} }; };
  ctx.measureText = function (t) {
    catat('measureText');
    const w = String(t).length * 4;
    return { width: w, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w };
  };
  ctx.getLineDash = function () { catat('getLineDash'); return []; };
  ctx.isPointInPath = function () { catat('isPointInPath'); return false; };
  ctx.getImageData = function (x, y, w, h) {
    catat('getImageData'); periksa('getImageData', [x, y, w, h], [0, 1, 2, 3], []);
    return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) };
  };
  ctx.createImageData = function (w, h) {
    catat('createImageData');
    if (typeof w === 'object') return { width: w.width, height: w.height, data: new Uint8ClampedArray(w.data.length) };
    periksa('createImageData', [w, h], [0, 1], []);
    return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) };
  };
  ctx.setTransform = function (...args) {
    catat('setTransform');
    if (args.length === 0 || (args.length === 1 && typeof args[0] === 'object')) return;   // reset / DOMMatrix
    periksa('setTransform', args, [0, 1, 2, 3, 4, 5], []);
  };
  ctx.drawImage = function (img, ...args) {
    catat('drawImage');
    if (k.ketat && (img == null)) throw new TypeError('ctx.drawImage(): sumber gambar null/undefined');
    periksa('drawImage', args, args.map((_, i) => i), []);   // semua argumen sesudah sumber wajib angka
  };
  ctx.getTransform = function () { catat('getTransform'); return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; };
  const simpan = {};
  for (const p of PROP_ANGKA_CTX) {
    simpan[p] = p === 'globalAlpha' || p === 'lineWidth' ? 1 : (p === 'miterLimit' ? 10 : 0);
    Object.defineProperty(ctx, p, {
      enumerable: true,
      get() { return simpan[p]; },
      set(v) {
        catat('=' + p);
        if (k.ketat && buruk(v)) throw new TypeError(`ctx.${p} = ${String(v)}: wajib angka hingga`);
        simpan[p] = v;
      },
    });
  }
  for (const p of PROP_LAIN_CTX) {
    simpan[p] = p === 'imageSmoothingEnabled' ? true : '';
    Object.defineProperty(ctx, p, {
      enumerable: true,
      get() { return simpan[p]; },
      set(v) {
        catat('=' + p);
        if (k.ketat) {
          if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) {
            throw new TypeError(`ctx.${p} = ${String(v)}: nilai tidak sah (salah ketik nama warna/palet?)`);
          }
          if ((p === 'fillStyle' || p === 'strokeStyle') && typeof v !== 'string' && typeof v !== 'object') {
            throw new TypeError(`ctx.${p} = ${String(v)}: wajib string warna atau gradien/pola`);
          }
        }
        simpan[p] = v;
      },
    });
  }
  ctx.canvas = null;                 // diisi buatKanvasPalsu
  Object.defineProperty(ctx, '__kendali', { value: k });   // { ketat, hitung } — bisa diubah dari harness
  return ctx;
}

function buatKanvasPalsu(ctx, dummy) {
  const kv = {
    width: 0, height: 0, style: {},
    getContext: (jenis) => (jenis === '2d' ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: kv.width, height: kv.height, right: kv.width, bottom: kv.height }),
    addEventListener() {}, removeEventListener() {},
    toDataURL: () => '', toBlob() {},
  };
  ctx.canvas = kv;
  return new Proxy(kv, {
    get(t, prop, receiver) {
      if (prop in t) return Reflect.get(t, prop, receiver);
      return dummy;
    },
  });
}

/* Sandbox = objek nyata berisi global yang WAJIB berperilaku benar (lihat
 * komentar tiap field), dibungkus Proxy supaya nama apa pun yang TIDAK
 * terdaftar di sini — window, navigator, AudioContext, webkitAudioContext,
 * EventSource, ResizeObserver, dan apa pun lain yang mungkin dipakai room.js
 * sekarang atau nanti — otomatis jatuh ke dummy, tanpa perlu didaftar manual
 * satu-satu. `has()` WAJIB true supaya `typeof namaYangTidakTerdaftar` tidak
 * ReferenceError.
 *
 * `document` SEKARANG setengah nyata: getElementById('room') mengembalikan
 * kanvas palsu ber-ctx palsu (supaya `const ctx = canvas.getContext('2d')`
 * di room.js dapat objek yang menghitung & memvalidasi), createElement
 * ('canvas') pun begitu (kanvas offscreen neonLapis dkk. berbagi Map hitung
 * yang sama); properti document lainnya tetap jatuh ke dummy. */
function buatSandbox() {
  const dummy = buatDummy();
  const memoriLS = new Map();
  const hitungCtx = new Map();
  const ctxUtama = buatCtxPalsu({ ketat: true, hitung: hitungCtx });
  const kanvasUtama = buatKanvasPalsu(ctxUtama, dummy);
  const dokumen = new Proxy({
    getElementById: (id) => (id === 'room' ? kanvasUtama : dummy),
    createElement: (tag) => (String(tag).toLowerCase() === 'canvas'
      ? buatKanvasPalsu(buatCtxPalsu({ ketat: ctxUtama.__kendali.ketat, hitung: hitungCtx }), dummy)
      : dummy),
  }, {
    get(t, prop, receiver) {
      if (prop in t) return Reflect.get(t, prop, receiver);
      return dummy;
    },
  });
  const nyata = {
    console,
    // Built-in standar ECMAScript — WAJIB didaftarkan eksplisit. vm.createContext()
    // dengan objek context BER-PROXY tidak otomatis mewariskan Map/Set/dst ke
    // context baru seperti context objek polos biasanya; tanpa ini `new Map()`
    // di dalam skrip vm diam-diam jadi `new dummy()` (karena bare identifier
    // `Map` jatuh ke fallback dummy) — bukan error yang melempar, cuma
    // `eventById` dkk. jadi BUKAN Map sungguhan. Ditemukan lewat reproduksi
    // manual, bukan dugaan: lihat riwayat commit kalau perlu detail lengkap.
    Map, Set, Array, Object, Promise, JSON, RegExp, Symbol, Error, TypeError, RangeError,
    Math, Number, String, Boolean, Uint8ClampedArray, Float32Array, Int32Array,
    isNaN, isFinite, parseInt, parseFloat,
    URLSearchParams,                    // dipakai parse location.search (EVENT_PAKSA dkk.)
    performance,
    Date: buatDatePalsu(),              // beku ke Rabu 15 Apr 2026, jam ikut S.jam — lihat setJamPalsu()
    location: { search: '' },           // kosong sengaja: harness kendalikan S langsung, bukan lewat ?query
    document: dokumen,
    localStorage: {
      getItem: (k) => (memoriLS.has(String(k)) ? memoriLS.get(String(k)) : null),
      setItem: (k, v) => { memoriLS.set(String(k), String(v)); },
      removeItem: (k) => { memoriLS.delete(String(k)); },
    },
    fetch: () => Promise.reject(new Error('fetch dimatikan di harness uji')),
    // tidak pernah memanggil callback-nya: frame() di ujung room.js memanggil
    // requestAnimationFrame(frame) lagi di akhirnya sendiri — kalau benar-benar
    // dieksekusi, harness masuk loop animasi 60fps yang tidak pernah berhenti.
    // Event di-tick manual oleh harness (lihat ujiSmoke), bukan lewat frame().
    setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    // pegangan harness ke canvas palsu (dibaca lewat ctx.__ctxPalsu dari host)
    __ctxPalsu: ctxUtama,
  };
  let sandbox;
  const jerat = {
    get(t, prop, receiver) {
      if (prop in t) return Reflect.get(t, prop, receiver);
      if (prop === Symbol.unscopables) return undefined;
      return dummy;
    },
    has() { return true; },
  };
  sandbox = new Proxy(nyata, jerat);
  // KRUSIAL: tanpa ini, `globalThis` (dan `window`/`self`) di dalam skrip vm
  // BUKAN properti nyata di `nyata` -> jatuh ke fallback -> jadi `dummy`.
  // Efeknya jembatan.js's `globalThis.__jembatan__ = {...}` diam-diam menulis
  // ke `dummy`, bukan ke context sungguhan — bukan error yang melempar,
  // cuma nilai yang salah tempat. Referensi balik ini yang bikin `globalThis.x
  // = y` di dalam vm benar-benar menempel ke objek context yang sama dibaca
  // host lewat `ctx.x`.
  nyata.globalThis = sandbox;
  nyata.self = sandbox;
  return sandbox;
}

/* ------------------------------------------ muat room.js + event-acak.js */
export const ROOM_JS = path.join(__dirname, 'public', 'room.js');
export const EVENT_ACAK_DIR = path.join(__dirname, 'public', 'event');
export const EVENT_ACAK_JS = EVENT_ACAK_DIR;   // nama lama, sekarang menunjuk foldernya
/** Menyambung bagian-bagian event acak persis seperti server (manifest.json, urutan wajib). */
export function bacaEventAcak() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EVENT_ACAK_DIR, 'manifest.json'), 'utf8'));
  return manifest.berkas.map((n) => fs.readFileSync(path.join(EVENT_ACAK_DIR, n), 'utf8')).join('');
}

export function muatKonteks() {
  const sandbox = buatSandbox();
  const ctx = vm.createContext(sandbox);
  const roomSrc = fs.readFileSync(ROOM_JS, 'utf8');
  const eventSrc = bacaEventAcak();

  // Tiga skrip berurutan di CONTEXT YANG SAMA, bukan vm.SourceTextModule —
  // room.js & event-acak.js dimuat public/index.html sebagai <script> polos
  // tanpa type="module", jadi keduanya BERBAGI satu scope global lexical
  // sungguhan. event-acak.js sendiri memanggil daftarEvent(...) di
  // top-level-nya, jadi urutan (room.js dulu, baru event-acak.js) wajib.
  new vm.Script(roomSrc, { filename: 'public/room.js' }).runInContext(ctx);
  new vm.Script(eventSrc, { filename: 'public/event/(sambungan manifest.json)' }).runInContext(ctx);

  // Fungsi (`function nama(){}`) otomatis jadi properti context, jadi
  // daftarEvent/nyalakanEvent/matikanEvent/pinjamAktor/bisaDipinjam/pada/
  // bentrok/frame bisa dipanggil langsung ctx.<nama>(...) tanpa jembatan.
  // Yang WAJIB dijembatani cuma const/let: EVENT_ACAK/eventById/MOD/RUANGAN/
  // CUACA/eventHidup/cooldownSampai/agents/peserta/standby/PROPS (const), dan
  // S/now/last (let — assignment dari host tidak menembus binding lexical
  // asli, jadi butuh setter yang dieksekusi DI DALAM context yang sama).
  // jabatanDari juga wajib dijembatani walau dipakai lewat ctx.jabatanDari(...)
  // di kode host: dia `const jabatanDari = (id) => ...` (arrow function via
  // const), bukan `function jabatanDari(){}` — jadi TIDAK otomatis jadi
  // properti context seperti daftarEvent/pinjamAktor/bisaDipinjam/pada.
  new vm.Script(`
    globalThis.__jembatan__ = {
      EVENT_ACAK, eventById, MOD, RUANGAN, CUACA, jabatanDari,
      eventHidup, cooldownSampai, agents, peserta, standby, PROPS,
      SORT_KURSI_DEKAT,
      setS: (v) => { S = v; },
      setNow: (v) => { now = v; },
      setLast: (v) => { last = v; },
      setTerpilih: (v) => { terpilih = v; },
    };
  `, { filename: 'jembatan.js' }).runInContext(ctx);

  return ctx;
}

/* Nama hook gambar DIBACA dari room.js, bukan dihafal: gambarLapis('gambarX')
 * untuk lapisan penuh, E.def.gambarProp untuk yang ikut depth sort. Kalau
 * room.js menambah kait baru, harness otomatis ikut menyapunya; hook
 * `gambar*` di definisi event yang TIDAK ada di daftar ini tidak pernah
 * dipanggil peramban — dilaporkan sebagai peringatan. */
let hookGambarCache = null;
export function daftarHookGambar() {
  if (hookGambarCache) return hookGambarCache;
  const src = fs.readFileSync(ROOM_JS, 'utf8');
  const nama = new Set();
  for (const m of src.matchAll(/gambarLapis\('(gambar\w+)'\)/g)) nama.add(m[1]);
  for (const m of src.matchAll(/E\.def\.(gambar\w+)\(/g)) nama.add(m[1]);
  hookGambarCache = [...nama];
  return hookGambarCache;
}

/* --------------------------------------------------------- E & S palsu --- */
// Dikutip persis dari nyalakanEvent() asli (room.js) — bukan ditebak.
export function buatE(def) {
  return { def, id: def.id, umur: 0, sisa: def.durasi || 10, data: {}, aktor: [], tanda: new Set() };
}

let idOrangPalsu = 0;
export function buatSatuOrang(ctx, kerja) {
  idOrangPalsu++;
  const peran = 'pranata_muda';        // id fallback asli jabatanDari(), lihat room.js
  const o = {
    id: 'palsu-' + idOrangPalsu,
    x: 100, y: 300, slotIdx: 0,
    station: kerja ? 'think' : 'idle',
    state: kerja ? 'work' : 'idle',
    face: 'down', hadap: null,
    path: [],
    busyUntil: 0,
    // dibedakan tiap orang supaya pinjamAktor() (urut arrivedAt, paling lama
    // diam didahulukan) deterministik, bukan tabrakan nilai sama
    arrivedAt: msBeku - idOrangPalsu * 60000,
    adaTugas: false,
    betah: false, betahAsli: false,
    eventKerja: null,
    alpha: 1,
    doingEvent: '',
    bawa: null, bawaSampai: 0,
    pose: null,
    laju: 1,
    bekuSampai: 0,
    butuh: null,
    peran,
    // dikutip dari constructor Agent asli (room.js): this.pal = jabatanDari(this.peran).pal
    // — banyak event baca o.pal.head/o.pal.pattern langsung, tanpa ini
    // sebagian besar event ber-syarat S.orang.some(...)/mulai() yang menyentuh
    // pegawai meledak "Cannot read properties of undefined" — bug PALSU di
    // fixture, bukan bug di event yang diuji.
    pal: ctx.__jembatan__.jabatanDari(peran).pal,
    keluar: false,
    mulut: false,
    // event sering memanggil a.say(...)/a.goTo(...)/a.goToXY(...) — tanpa
    // method ini smoke-test gagal dengan "is not a function", bug PALSU yang
    // tidak ada hubungannya dengan event yang diuji
    say() {}, goTo() {}, goToXY() {},
  };
  // getter asli (room.js Agent#diam): !this.path.length — bukan field statis,
  // supaya tetap benar walau sebuah event memanipulasi a.path langsung
  Object.defineProperty(o, 'diam', { get() { return !o.path.length; }, enumerable: true });
  return o;
}
export function buatOrangPalsu(ctx, n, kerjaCount) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(buatSatuOrang(ctx, i < kerjaCount));
  return arr;
}

// Tiga sumbu sesuai brainstorm (siang/malam, hujan, ramai/sepi), bukan satu
// objek raksasa. Dikutip dari bentuk potretRuangan() asli (room.js).
export function buatS(ctx, { jam, hujan, petir, ramai }) {
  setJamPalsu(jam);                     // new Date().getHours() di sandbox = S.jam
  const orang = buatOrangPalsu(ctx, ramai ? 6 : 0, ramai ? 2 : 0);
  const lampu = jam < 5.4 || jam >= 18.8 ? 1 : (jam >= 7.2 && jam < 16.8 ? 0 : 0.5);
  const { bisaDipinjam } = ctx;
  const S = {
    jam, lampu, malam: lampu > 0.5, luar: lampu > 0.5 ? 0 : 1,
    hujan, petir,
    hari: 3, tanggal: 15,
    kerjaJam: jam >= 7 && jam < 16,
    orang,
    sesi: 0, standby: orang.length, peserta: 0,
    nganggur: orang.filter((o) => bisaDipinjam(o)),
    bekerja: orang.filter((o) => o.state === 'work'),
    stasiunAktif: new Set(orang.filter((o) => o.state === 'work').map((o) => o.station)),
  };
  // event-acak.js banyak yang baca CUACA/RUANGAN GLOBAL langsung, bukan cuma
  // lewat parameter S (dua contoh terverifikasi: pelangi-selepas-hujan baca
  // CUACA.hujan langsung, silau-sore-gorden baca RUANGAN.gordenKanan
  // langsung) — jadi CUACA wajib disamakan sebagai efek samping.
  const H = ctx.__jembatan__;
  H.CUACA.hujan = hujan;
  H.CUACA.petir = petir;
  H.setS(S);
  return S;
}

const JAM_MATRIKS = [3, 8, 12, 17, 20, 23];
const HUJAN_MATRIKS = [
  { hujan: 0, petir: false, label: 'cerah' },
  { hujan: 0.3, petir: false, label: 'gerimis' },
  { hujan: 0.9, petir: true, label: 'deras+petir' },
];
const RAMAI_MATRIKS = [false, true];

/* ---------------------------------------------------- bug gambar diketahui --- *
 * Hook gambar yang MEMANG melempar di ctx palsu karena bug nyata di
 * event-acak.js dan belum diperbaiki. Dicatat di sini supaya CI tetap hijau
 * sambil bug-nya tetap tercatat (dilaporkan sebagai peringatan, bukan
 * gagal). Begitu diperbaiki, entrinya harus DIHAPUS — harness memperingatkan
 * kalau ada entri yang sudah tidak melempar lagi.
 *   'id-event': { hook: 'gambarProp', pola: /potongan pesan/, alasan: '...' } */
export const DIKETAHUI = {
};

/* ------------------------------------------------------------- uji satu --- */
export function resetRuangan(ctx, pristine) {
  Object.assign(ctx.__jembatan__.RUANGAN, structuredClone(pristine.RUANGAN));
  Object.assign(ctx.__jembatan__.MOD, structuredClone(pristine.MOD));
}

export function buatPristine(ctx) {
  const { MOD, RUANGAN } = ctx.__jembatan__;
  return { RUANGAN: structuredClone(RUANGAN), MOD: structuredClone(MOD) };
}

function ujiSyarat(ctx, def, pristine) {
  let benar = 0, total = 0;
  const galat = [];
  for (const jam of JAM_MATRIKS) {
    for (const h of HUJAN_MATRIKS) {
      for (const ramai of RAMAI_MATRIKS) {
        total++;
        resetRuangan(ctx, pristine);
        const S = buatS(ctx, { jam, hujan: h.hujan, petir: h.petir, ramai });
        try {
          if (def.syarat ? def.syarat(S) : true) benar++;
        } catch (e) {
          galat.push({ kombinasi: `jam${jam}-${h.label}-${ramai ? 'ramai' : 'sepi'}`, pesan: e.message });
        }
      }
    }
  }
  return { benar, total, galat };
}

const jumlahHitung = (hitung) => { let n = 0; for (const v of hitung.values()) n += v; return n; };

// mulai -> tick x N -> selesai, meniru pembukuan tickEvent() asli persis
// (E.umur += dt SEBELUM tiap tick) supaya pada(E, N, fn) yang berfase
// benar-benar terpicu semua, bukan cuma cabang paling awal.
//
// Di sela-selanya hook gambar* dipanggil terhadap ctx palsu KETAT — sesudah
// mulai(), tiap tick ke-3, dan sesudah tick terakhir — karena kebanyakan
// gambarProp membaca E.data yang baru terisi di mulai()/tick() tertentu.
// Rantai `lanjutan` diikuti sesudah selesai(): tiap cabang di-smoke di
// sandbox yang SAMA tanpa reset (persis seperti matikanEvent() yang langsung
// nyalakanEvent(d) di ruangan yang sama), kedalaman maksimum 3, tiap id
// sekali per rantai (pagar siklus).
const KEDALAMAN_LANJUTAN = 3;
export function ujiSmoke(ctx, def, pristine, opsi = {}) {
  const { kedalaman = 0, dilihat = new Set([def.id]) } = opsi;
  let S = opsi.S;
  if (!S) {
    resetRuangan(ctx, pristine);
    S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });
  }
  const E = buatE(def);
  const hasil = { mulai: 'ok', tick: 'ok', selesai: 'ok', tickCount: 0, gambar: {}, gambarAsing: [], lanjutan: [], panggilanCtx: 0 };
  const hook = daftarHookGambar().filter((h) => typeof def[h] === 'function');
  for (const k of Object.keys(def)) {
    if (/^gambar/.test(k) && typeof def[k] === 'function' && !daftarHookGambar().includes(k)) hasil.gambarAsing.push(k);
  }
  for (const h of hook) hasil.gambar[h] = 'ok';
  const kendali = ctx.__ctxPalsu.__kendali;
  const ketatSebelum = kendali.ketat;
  kendali.ketat = true;
  const ctxSebelum = jumlahHitung(kendali.hitung);
  const sapuGambar = (kapan) => {
    for (const h of hook) {
      if (hasil.gambar[h] !== 'ok') continue;      // sudah tercatat melempar, cukup sekali
      try {
        def[h](E, S);
      } catch (e) {
        hasil.gambar[h] = `THROW (${kapan}): ${e.message}`;
      }
    }
  };

  try {
    def.mulai && def.mulai(E, S);
  } catch (e) {
    hasil.mulai = 'THROW: ' + e.message;
  }
  sapuGambar('sesudah mulai');

  const durasi = def.durasi || 10;
  const dt = Math.min(1, Math.max(0.1, durasi / 12));
  try {
    while (E.sisa > 0 && hasil.tickCount < 200) {   // 200 = pagar jaga-jaga, bukan batas normal
      E.umur += dt;
      E.sisa -= dt;
      def.tick && def.tick(E, dt, S);
      hasil.tickCount++;
      if (hasil.tickCount % 3 === 0) sapuGambar('tick #' + hasil.tickCount);
    }
  } catch (e) {
    hasil.tick = 'THROW (tick #' + (hasil.tickCount + 1) + '): ' + e.message;
  }
  sapuGambar('sesudah tick terakhir');

  try {
    def.selesai && def.selesai(E, S);
  } catch (e) {
    hasil.selesai = 'THROW: ' + e.message;
  }

  if (def.perluAktor === true && E.aktor.length === 0) hasil.peringatanAktor = true;
  hasil.panggilanCtx = jumlahHitung(kendali.hitung) - ctxSebelum;
  kendali.ketat = ketatSebelum;

  // Pemain dilepas seperti lepaskanAktor() asli SEBELUM lanjutan dinyalakan —
  // matikanEvent() melepas aktor dulu, baru menyalakan lanjutan, jadi
  // lanjutan berhak meminjam orang yang sama.
  for (const a of E.aktor) { a.eventKerja = null; a.betah = a.betahAsli || false; }
  E.aktor.length = 0;

  if (Array.isArray(def.lanjutan) && kedalaman < KEDALAMAN_LANJUTAN) {
    const { eventById } = ctx.__jembatan__;
    for (const L of def.lanjutan) {
      const d = eventById.get(L && L.id);
      if (!d) { hasil.lanjutan.push({ id: L && L.id, hilang: true }); continue; }
      if (dilihat.has(d.id)) { hasil.lanjutan.push({ id: d.id, siklus: true }); continue; }
      dilihat.add(d.id);
      const sub = ujiSmoke(ctx, d, pristine, { kedalaman: kedalaman + 1, dilihat, S });
      hasil.lanjutan.push({ id: d.id, smoke: sub });
    }
  } else if (Array.isArray(def.lanjutan) && def.lanjutan.length) {
    hasil.lanjutanTerpotong = true;
  }
  return hasil;
}

/* Hook gambar yang melempar tapi ada di DIKETAHUI = peringatan; sisanya gagal.
 * Mengembalikan { gagal: [...], peringatan: [...], basi: [...] } berisi
 * string siap cetak. */
function nilaiGambar(id, smoke) {
  const gagal = [], peringatan = [], basi = [];
  const tahu = DIKETAHUI[id];
  for (const [h, v] of Object.entries(smoke.gambar)) {
    if (v === 'ok') {
      if (tahu && tahu.hook === h) basi.push(`${id}.${h} ada di DIKETAHUI tapi sudah tidak melempar — hapus entrinya`);
      continue;
    }
    if (tahu && tahu.hook === h && (!tahu.pola || tahu.pola.test(v))) peringatan.push(`${h}: ${v}  [DIKETAHUI: ${tahu.alasan || ''}]`);
    else gagal.push(`${h}: ${v}`);
  }
  for (const h of smoke.gambarAsing) peringatan.push(`${h}: hook gambar tidak dikenal room.js (tidak pernah dipanggil peramban)`);
  return { gagal, peringatan, basi };
}

// Datar-kan smoke + semua lanjutannya jadi satu daftar temuan.
function rangkumSmoke(id, smoke, prefiks = '') {
  const gagal = [], peringatan = [];
  for (const k of ['mulai', 'tick', 'selesai']) if (smoke[k] !== 'ok') gagal.push(`${prefiks}${k}: ${smoke[k]}`);
  const g = nilaiGambar(id, smoke);
  for (const s of g.gagal) gagal.push(prefiks + s);
  for (const s of g.peringatan) peringatan.push(prefiks + s);
  for (const s of g.basi) peringatan.push(prefiks + s);
  if (smoke.peringatanAktor) peringatan.push(`${prefiks}perluAktor=true tapi E.aktor kosong sesudah mulai()`);
  for (const L of smoke.lanjutan) {
    if (L.hilang) { gagal.push(`${prefiks}lanjutan → '${L.id}': id tidak terdaftar`); continue; }
    if (L.siklus) { peringatan.push(`${prefiks}lanjutan → '${L.id}': siklus, tidak diulang`); continue; }
    const sub = rangkumSmoke(L.id, L.smoke, `${prefiks}lanjutan→${L.id}: `);
    gagal.push(...sub.gagal);
    peringatan.push(...sub.peringatan);
  }
  return { gagal, peringatan };
}

export function ujiSatuEvent(ctx, def, pristine) {
  const syarat = ujiSyarat(ctx, def, pristine);
  const smoke = ujiSmoke(ctx, def, pristine);
  const temuan = rangkumSmoke(def.id, smoke);
  return { id: def.id, def, syarat, smoke, temuan, gagal: temuan.gagal.length > 0 };
}

/* ------------------------------------------------------------ penjadwal --- *
 * Aturan bentrok/panggung/aktor diuji lewat fungsi ASLI room.js — bentrok(),
 * nyalakanEvent(), matikanEvent(), pinjamAktor(), lepaskanAktor(),
 * bisaDipinjam() — terhadap definisi sintetis yang TIDAK didaftarkan ke
 * EVENT_ACAK (nyalakanEvent tidak menuntut def ada di registri). Tiap kasus
 * dibaca dari kode sumber, bukan dari ingatan:
 *   bentrok(def):  sedangJalan(def.id)                                   -> true
 *                  def.kelas==='panggung' && ada panggung hidup            -> true
 *                  def.bentrokDengan.some(sedangJalan)                     -> true
 *   nyalakanEvent: mulai() melempar -> batal, cooldown 20 s; perluAktor &&
 *                  E.aktor kosong -> batal, cooldown 20 s
 *   pinjamAktor:   cuma bisaDipinjam(a) (= !eventKerja && !adaTugas &&
 *                  state!=='work' && !keluar), urut arrivedAt
 *   matikanEvent(E) (bukan batal): selesai() lalu tiap lanjutan dengan
 *                  peluang lolos dinyalakan kalau tidak sedang jalan */
export function ujiPenjadwal(ctx, pristine) {
  const H = ctx.__jembatan__;
  const { eventHidup, cooldownSampai, eventById, EVENT_ACAK } = H;
  const kasus = [];
  const uji = (nama, fn) => {
    try { fn(); kasus.push({ nama, lulus: true }); }
    catch (e) { kasus.push({ nama, lulus: false, pesan: e.message }); }
  };
  const harus = (kondisi, pesan) => { if (!kondisi) throw new Error(pesan); };
  const bersih = () => { eventHidup.length = 0; cooldownSampai.clear(); };
  // console.warn asli room.js berisik saat mulai() sengaja dibuat melempar
  const konsolAsli = ctx.console;
  ctx.console = { ...console, warn() {}, error() {} };
  const NOW = 1_000_000;
  H.setNow(NOW);

  const P1 = { id: 'uji-panggung-1', kelas: 'panggung', durasi: 5 };
  const P2 = { id: 'uji-panggung-2', kelas: 'panggung', durasi: 5 };
  const L1 = { id: 'uji-latar-1', kelas: 'latar', durasi: 5 };
  const L2 = { id: 'uji-latar-2', kelas: 'latar', durasi: 5 };
  const LB = { id: 'uji-latar-bentrok', kelas: 'latar', durasi: 5, bentrokDengan: ['uji-latar-1'] };

  resetRuangan(ctx, pristine);
  buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });

  uji('dua event kelas panggung tidak boleh bersamaan', () => {
    bersih();
    harus(ctx.nyalakanEvent(P1) === true, 'P1 gagal dinyalakan');
    harus(eventHidup.length === 1 && eventHidup[0].id === P1.id, 'P1 tidak masuk eventHidup');
    harus(ctx.bentrok(P2) === true, 'panggung kedua seharusnya bentrok saat panggung pertama hidup');
    harus(ctx.bentrok(P1) === true, 'event yang sedang jalan seharusnya bentrok dengan dirinya sendiri');
    ctx.matikanEvent(eventHidup[0], true);
    harus(eventHidup.length === 0, 'matikanEvent tidak mengosongkan eventHidup');
    harus(ctx.bentrok(P2) === false, 'sesudah panggung pertama mati, panggung kedua seharusnya bebas');
  });

  uji('latar boleh menumpuk dan tidak menghalangi panggung', () => {
    bersih();
    harus(ctx.nyalakanEvent(L1) === true, 'L1 gagal dinyalakan');
    harus(ctx.bentrok(L2) === false, 'latar kedua seharusnya bebas saat latar pertama hidup');
    harus(ctx.bentrok(P1) === false, 'panggung seharusnya bebas saat cuma latar yang hidup');
    harus(ctx.nyalakanEvent(P1) === true, 'P1 gagal dinyalakan di atas latar');
    harus(ctx.bentrok(L2) === false, 'latar seharusnya tetap bebas saat panggung hidup');
    harus(ctx.bentrok(L1) === true, 'latar yang sedang jalan seharusnya bentrok dengan dirinya sendiri');
  });

  uji('bentrokDengan menahan event selama lawannya hidup', () => {
    bersih();
    harus(ctx.bentrok(LB) === false, 'LB seharusnya bebas saat tidak ada apa-apa');
    ctx.nyalakanEvent(L1);
    harus(ctx.bentrok(LB) === true, 'LB seharusnya bentrok saat uji-latar-1 hidup');
    ctx.matikanEvent(eventHidup[0], true);
    harus(ctx.bentrok(LB) === false, 'LB seharusnya bebas lagi sesudah uji-latar-1 mati');
  });

  uji('mulai() melempar → event batal + cooldown 20 s', () => {
    bersih();
    const X = { id: 'uji-meledak', kelas: 'latar', durasi: 5, mulai() { throw new Error('sengaja'); } };
    harus(ctx.nyalakanEvent(X) === false, 'nyalakanEvent seharusnya false');
    harus(eventHidup.length === 0, 'event yang meledak seharusnya tidak tinggal di eventHidup');
    harus(cooldownSampai.get(X.id) === NOW + 20000, 'cooldown batal seharusnya now + 20000, dapat ' + cooldownSampai.get(X.id));
  });

  uji('perluAktor tanpa pemain menganggur → batal, tidak jalan hampa', () => {
    bersih();
    buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });   // 0 orang
    const A = { id: 'uji-butuh-aktor', kelas: 'panggung', durasi: 5, perluAktor: true,
      mulai(E) { ctx.pinjamAktor(E, 1); } };
    harus(ctx.nyalakanEvent(A) === false, 'seharusnya batal karena tidak ada aktor');
    harus(eventHidup.length === 0, 'tidak boleh tinggal di eventHidup');
    harus(cooldownSampai.get(A.id) === NOW + 20000, 'cooldown batal seharusnya 20 s');
    buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });   // 6 orang, 2 kerja
    harus(ctx.nyalakanEvent(A) === true, 'dengan pemain tersedia seharusnya jalan');
    harus(eventHidup[0].aktor.length === 1, 'seharusnya meminjam tepat 1 aktor');
    ctx.matikanEvent(eventHidup[0], true);
  });

  uji('aktor yang dipinjam satu event tidak bisa dipinjam event lain; yang bekerja tidak pernah', () => {
    bersih();
    const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });   // 6 orang, 2 state 'work'
    const E1 = buatE(L1), E2 = buatE(L2);
    const ambil = ctx.pinjamAktor(E1, 10);
    harus(ambil.length === 4, 'seharusnya dapat 4 (6 orang - 2 bekerja), dapat ' + ambil.length);
    harus(ambil.every((a) => a.state !== 'work'), 'pegawai state work ikut terpinjam');
    harus(ambil.every((a) => a.eventKerja === E1 && a.betah === true), 'eventKerja/betah tidak dipasang');
    harus(ctx.pinjamAktor(E2, 1).length === 0, 'event kedua seharusnya tidak dapat siapa-siapa');
    harus(S.orang.filter(ctx.bisaDipinjam).length === 0, 'bisaDipinjam masih true untuk yang sudah dipinjam');
    for (const a of [...E1.aktor]) ctx.lepaskanAktor(a);
    harus(E1.aktor.length === 0, 'lepaskanAktor tidak mengosongkan E.aktor');
    harus(ctx.pinjamAktor(E2, 1).length === 1, 'sesudah dilepas seharusnya bisa dipinjam lagi');
    for (const a of [...E2.aktor]) ctx.lepaskanAktor(a);
  });

  uji('pinjamAktor mendahulukan yang paling lama diam (arrivedAt terkecil)', () => {
    bersih();
    const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });
    const E1 = buatE(L1);
    const [a] = ctx.pinjamAktor(E1, 1);
    const calon = S.orang.filter(ctx.bisaDipinjam);   // sisanya (a sudah tidak bisa)
    harus(calon.every((b) => b.arrivedAt >= a.arrivedAt), 'yang dipinjam bukan yang paling lama diam');
    ctx.lepaskanAktor(a);
  });

  uji('matikanEvent normal menyalakan lanjutan (peluang 1) di ruangan yang sama', () => {
    bersih();
    const R = { id: 'uji-rantai', kelas: 'latar', durasi: 5, lanjutan: [{ id: 'uji-latar-1' }, { id: 'uji-latar-2', peluang: 0 }] };
    eventById.set(L1.id, L1); eventById.set(L2.id, L2);
    try {
      harus(ctx.nyalakanEvent(R) === true, 'R gagal dinyalakan');
      ctx.matikanEvent(eventHidup[0], false);
      harus(eventHidup.some((E) => E.id === L1.id), 'lanjutan peluang 1 seharusnya menyala');
      harus(!eventHidup.some((E) => E.id === L2.id), 'lanjutan peluang 0 seharusnya tidak menyala');
      harus(!eventHidup.some((E) => E.id === R.id), 'event induk seharusnya sudah keluar dari eventHidup');
    } finally {
      eventById.delete(L1.id); eventById.delete(L2.id);
    }
  });

  uji('matikanEvent batal TIDAK menyalakan lanjutan', () => {
    bersih();
    const R = { id: 'uji-rantai-batal', kelas: 'latar', durasi: 5, lanjutan: [{ id: 'uji-latar-1' }] };
    eventById.set(L1.id, L1);
    try {
      ctx.nyalakanEvent(R);
      ctx.matikanEvent(eventHidup[0], true);
      harus(eventHidup.length === 0, 'lanjutan seharusnya tidak menyala saat induknya dibatalkan');
    } finally { eventById.delete(L1.id); }
  });

  uji('semua rujukan lanjutan/bentrokDengan di registri menunjuk id yang terdaftar', () => {
    const hilang = [];
    for (const d of EVENT_ACAK) {
      for (const L of d.lanjutan || []) if (!eventById.has(L && L.id)) hilang.push(`${d.id}.lanjutan → ${L && L.id}`);
      for (const id of d.bentrokDengan || []) if (!eventById.has(id)) hilang.push(`${d.id}.bentrokDengan → ${id}`);
    }
    harus(hilang.length === 0, 'rujukan putus: ' + hilang.join(', '));
  });

  uji('event kelas panggung di registri tidak ada yang bentrokDengan dirinya sendiri / kelas tak dikenal', () => {
    const aneh = [];
    for (const d of EVENT_ACAK) {
      if (d.kelas !== 'panggung' && d.kelas !== 'latar') aneh.push(`${d.id}: kelas '${d.kelas}'`);
      if ((d.bentrokDengan || []).includes(d.id)) aneh.push(`${d.id}: bentrokDengan dirinya sendiri`);
    }
    harus(aneh.length === 0, aneh.join(', '));
  });

  bersih();
  ctx.console = konsolAsli;
  resetRuangan(ctx, pristine);
  return kasus;
}

/* -------------------------------------------------------------- laporan --- */
function cetakSatu(hasil) {
  const { def, syarat, smoke, temuan } = hasil;
  console.log(tebal(def.id) + abu(`   kelas: ${def.kelas}   bobot: ${def.bobot}   `
    + `cooldown: ${def.cooldown}s   durasi: ${def.durasi || 10}s`));
  console.log();
  console.log(`  syarat(S) — ${syarat.total} kombinasi: ${syarat.benar} benar, `
    + `${syarat.total - syarat.galat.length - syarat.benar} salah`
    + (syarat.galat.length ? merah(`, ${syarat.galat.length} melempar`) : ''));
  for (const g of syarat.galat) console.log(merah(`    ✗ ${g.kombinasi}: ${g.pesan}`));
  console.log();
  const baris = (nama, v) => console.log('  ' + nama.padEnd(30)
    + (v === 'ok' ? hijau('ok') : merah(v)));
  baris('mulai(E,S)', smoke.mulai);
  baris(`tick(E,dt,S) ×${smoke.tickCount}`, smoke.tick);
  baris('selesai(E,S)', smoke.selesai);
  const hook = Object.keys(smoke.gambar);
  if (hook.length) {
    for (const h of hook) baris(`${h}(E,S)`, smoke.gambar[h]);
    console.log(abu(`  ${smoke.panggilanCtx} panggilan ctx palsu sepanjang smoke`));
  } else {
    console.log(abu('  (tidak punya hook gambar)'));
  }
  if (smoke.lanjutan.length) {
    console.log();
    console.log('  lanjutan:');
    const cetakRantai = (L, indent) => {
      if (L.hilang) { console.log(merah(`${indent}✗ ${L.id}: id tidak terdaftar`)); return; }
      if (L.siklus) { console.log(kuning(`${indent}↺ ${L.id}: siklus`)); return; }
      const sub = rangkumSmoke(L.id, L.smoke);
      console.log(`${indent}${sub.gagal.length ? merah('✗') : hijau('✓')} ${L.id}`
        + abu(` (tick ×${L.smoke.tickCount}, ${Object.keys(L.smoke.gambar).length} hook gambar)`));
      for (const s of sub.gagal) console.log(merah(`${indent}    ${s}`));
      for (const s of sub.peringatan) console.log(kuning(`${indent}    ${s}`));
      for (const M of L.smoke.lanjutan) cetakRantai(M, indent + '  ');
    };
    for (const L of smoke.lanjutan) cetakRantai(L, '    ');
  }
  if (smoke.lanjutanTerpotong) console.log(kuning(`  lanjutan dipotong di kedalaman ${KEDALAMAN_LANJUTAN}`));
  for (const p of temuan.peringatan) console.log(kuning('  peringatan: ' + p));
  console.log();
  console.log(tebal('RINGKASAN: ') + (hasil.gagal
    ? merah(`${temuan.gagal.length} temuan gagal`)
    : hijau('0 exception')));
}

function cetakRingkas(hasil) {
  const status = hasil.gagal ? merah('THROW') : hijau('ok');
  const nHook = Object.keys(hasil.smoke.gambar).length;
  const nLanjut = hasil.smoke.lanjutan.length;
  const ekstra = (nHook ? ` g${nHook}` : '') + (nLanjut ? ` →${nLanjut}` : '');
  const catatan = hasil.gagal ? '  ' + hasil.temuan.gagal.join(' | ') : '';
  console.log(
    hasil.id.padEnd(38) + status.padEnd(boleh ? 20 : 6)
    + abu(`${hasil.syarat.benar}/${hasil.syarat.total} syarat${ekstra}`) + catatan,
  );
  for (const p of hasil.temuan.peringatan) console.log(kuning('    ⚠ ' + p));
}

function cetakPenjadwal(kasus) {
  console.log(tebal('Uji penjadwal (bentrok / panggung / aktor / lanjutan) — fungsi asli room.js:'));
  for (const k of kasus) {
    console.log((k.lulus ? hijau('  ✓ ') : merah('  ✗ ')) + k.nama + (k.lulus ? '' : merah('  — ' + k.pesan)));
  }
  return kasus.every((k) => k.lulus);
}

/* -------------------------------------------------------------------- CLI */
function main() {
  const argv = process.argv.slice(2);
  const ctx = muatKonteks();
  const { EVENT_ACAK, eventById } = ctx.__jembatan__;
  const pristine = buatPristine(ctx);

  if (argv.includes('--daftar')) {
    for (const def of EVENT_ACAK) console.log(def.id);
    console.log(abu(`\n${EVENT_ACAK.length} event terdaftar`));
    return;
  }

  if (argv.includes('--penjadwal')) {
    const lulus = cetakPenjadwal(ujiPenjadwal(ctx, pristine));
    process.exit(lulus ? 0 : 1);
  }

  if (argv.includes('--semua')) {
    let adaGagal = false;
    let totalGalatSyarat = 0, totalHook = 0, eventBerHook = 0, totalLanjutan = 0, totalPeringatan = 0;
    for (const def of EVENT_ACAK) {
      const hasil = ujiSatuEvent(ctx, def, pristine);
      cetakRingkas(hasil);
      if (hasil.gagal) adaGagal = true;
      totalGalatSyarat += hasil.syarat.galat.length;
      const nHook = Object.keys(hasil.smoke.gambar).length;
      totalHook += nHook;
      if (nHook) eventBerHook++;
      totalLanjutan += hasil.smoke.lanjutan.filter((L) => L.smoke).length;
      totalPeringatan += hasil.temuan.peringatan.length;
    }
    const hitung = ctx.__ctxPalsu.__kendali.hitung;
    const teratas = [...hitung.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([m, n]) => `${m} ×${n}`).join(', ');
    console.log();
    console.log(tebal(`${EVENT_ACAK.length} event diuji. `)
      + (adaGagal ? merah('ada hook yang melempar — lihat di atas.') : hijau('0 exception.'))
      + (totalGalatSyarat ? kuning(` (${totalGalatSyarat} kombinasi syarat() ikut melempar)`) : ''));
    console.log(abu(`hook gambar disapu: ${totalHook} hook di ${eventBerHook} event; `
      + `rantai lanjutan diikuti: ${totalLanjutan}; panggilan ctx palsu: ${jumlahHitung(hitung)} (${teratas})`));
    if (totalPeringatan) console.log(kuning(`${totalPeringatan} peringatan (tidak menggagalkan).`));
    console.log();
    const lulusPenjadwal = cetakPenjadwal(ujiPenjadwal(ctx, pristine));
    process.exit(adaGagal || !lulusPenjadwal ? 1 : 0);
  }

  const id = argv[0];
  if (!id || id.startsWith('--')) {
    console.log('Pakai:');
    console.log('  node uji-event.mjs <id>          satu event, detail lengkap');
    console.log('  node uji-event.mjs --semua       sapu semua event + uji penjadwal, ringkas + exit code');
    console.log('  node uji-event.mjs --penjadwal   cuma uji aturan bentrok/panggung/aktor');
    console.log('  node uji-event.mjs --daftar      cetak semua id yang valid');
    process.exit(1);
  }

  const def = eventById.get(id);
  if (!def) {
    console.log(merah(`id tidak dikenal: ${id}`));
    console.log(abu('lihat --daftar untuk id yang valid'));
    process.exit(1);
  }
  const hasil = ujiSatuEvent(ctx, def, pristine);
  cetakSatu(hasil);
  process.exit(hasil.gagal ? 1 : 0);
}

// Jalan sebagai CLI hanya kalau berkas ini yang dieksekusi langsung — waktu
// diimpor uji-zorder.mjs / uji-katalog.mjs, main() tidak boleh ikut jalan.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
