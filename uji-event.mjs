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
// Cakupan yang SENGAJA dilewati (bukan lupa): hook gambar* (butuh canvas 2D
// sungguhan buat berarti apa-apa), rantai `lanjutan`, dan aturan `bentrok`/
// `kelas panggung` (harness memanggil hook satu event terisolasi, bukan
// lewat penjadwal penuh).
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
// Pakai:
//   node uji-event.mjs <id>       satu event, detail lengkap
//   node uji-event.mjs --semua    sapu semua event terdaftar, ringkas
//   node uji-event.mjs --daftar   cetak semua id yang valid

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* --------------------------------------------------------------- warna --- */
const boleh = process.stdout.isTTY && !process.env.NO_COLOR;
const cat = (kode) => (teks) => (boleh ? `\x1b[${kode}m${teks}\x1b[0m` : String(teks));
const merah = cat(31), hijau = cat(32), kuning = cat(33), abu = cat(90), tebal = cat(1);

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
function setJamPalsu(jam) {
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

/* Sandbox = objek nyata berisi global yang WAJIB berperilaku benar (lihat
 * komentar tiap field), dibungkus Proxy supaya nama apa pun yang TIDAK
 * terdaftar di sini — document, window, navigator, AudioContext,
 * webkitAudioContext, EventSource, ResizeObserver, dan apa pun lain yang
 * mungkin dipakai room.js sekarang atau nanti — otomatis jatuh ke dummy,
 * tanpa perlu didaftar manual satu-satu. `has()` WAJIB true supaya
 * `typeof namaYangTidakTerdaftar` tidak ReferenceError. */
function buatSandbox() {
  const dummy = buatDummy();
  const memoriLS = new Map();
  const nyata = {
    console,
    // Built-in standar ECMAScript — WAJIB didaftarkan eksplisit. vm.createContext()
    // dengan objek context BER-PROXY tidak otomatis mewariskan Map/Set/dst ke
    // context baru seperti context objek polos biasanya; tanpa ini `new Map()`
    // di dalam skrip vm diam-diam jadi `new dummy()` (karena bare identifier
    // `Map` jatuh ke fallback dummy) — bukan error yang melempar, cuma
    // `eventById` dkk. jadi BUKAN Map sungguhan. Ditemukan lewat reproduksi
    // manual, bukan dugaan: lihat riwayat commit kalau perlu detail lengkap.
    Map, Set, Array, Object, Promise, JSON, RegExp, Symbol, Error,
    Math, Number, String, Boolean,
    URLSearchParams,                    // dipakai parse location.search (EVENT_PAKSA dkk.)
    performance,
    Date: buatDatePalsu(),              // beku ke Rabu 15 Apr 2026, jam ikut S.jam — lihat setJamPalsu()
    location: { search: '' },           // kosong sengaja: harness kendalikan S langsung, bukan lewat ?query
    localStorage: {
      getItem: (k) => (memoriLS.has(String(k)) ? memoriLS.get(String(k)) : null),
      setItem: (k, v) => { memoriLS.set(String(k), String(v)); },
      removeItem: (k) => { memoriLS.delete(String(k)); },
    },
    fetch: () => Promise.reject(new Error('fetch dimatikan di harness uji')),
    // tidak pernah memanggil callback-nya: frame() di ujung room.js memanggil
    // requestAnimationFrame(frame) lagi di akhirnya sendiri — kalau benar-benar
    // dieksekusi, harness masuk loop animasi 60fps yang tidak pernah berhenti.
    // Event di-tick manual oleh harness (lihat pumpTick), bukan lewat frame().
    setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
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
function muatKonteks() {
  const sandbox = buatSandbox();
  const ctx = vm.createContext(sandbox);
  const roomSrc = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
  const eventSrc = fs.readFileSync(path.join(__dirname, 'public', 'event-acak.js'), 'utf8');

  // Tiga skrip berurutan di CONTEXT YANG SAMA, bukan vm.SourceTextModule —
  // room.js & event-acak.js dimuat public/index.html sebagai <script> polos
  // tanpa type="module", jadi keduanya BERBAGI satu scope global lexical
  // sungguhan. event-acak.js sendiri memanggil daftarEvent(...) di
  // top-level-nya, jadi urutan (room.js dulu, baru event-acak.js) wajib.
  new vm.Script(roomSrc, { filename: 'public/room.js' }).runInContext(ctx);
  new vm.Script(eventSrc, { filename: 'public/event-acak.js' }).runInContext(ctx);

  // Fungsi (`function nama(){}`) otomatis jadi properti context, jadi
  // daftarEvent/nyalakanEvent/matikanEvent/pinjamAktor/bisaDipinjam/pada bisa
  // dipanggil langsung ctx.<nama>(...) tanpa jembatan. Yang WAJIB dijembatani
  // cuma const/let: EVENT_ACAK/eventById/MOD/RUANGAN/CUACA (const), dan S/now
  // (let — assignment dari host tidak menembus binding lexical asli, jadi
  // butuh setter yang dieksekusi DI DALAM context yang sama).
  // jabatanDari juga wajib dijembatani walau dipakai lewat ctx.jabatanDari(...)
  // di kode host: dia `const jabatanDari = (id) => ...` (arrow function via
  // const), bukan `function jabatanDari(){}` — jadi TIDAK otomatis jadi
  // properti context seperti daftarEvent/pinjamAktor/bisaDipinjam/pada.
  new vm.Script(`
    globalThis.__jembatan__ = {
      EVENT_ACAK, eventById, MOD, RUANGAN, CUACA, jabatanDari,
      setS: (v) => { S = v; },
      setNow: (v) => { now = v; },
    };
  `, { filename: 'jembatan.js' }).runInContext(ctx);

  return ctx;
}

/* --------------------------------------------------------- E & S palsu --- */
// Dikutip persis dari nyalakanEvent() asli (room.js) — bukan ditebak.
function buatE(def) {
  return { def, id: def.id, umur: 0, sisa: def.durasi || 10, data: {}, aktor: [], tanda: new Set() };
}

let idOrangPalsu = 0;
function buatSatuOrang(ctx, kerja) {
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
function buatOrangPalsu(ctx, n, kerjaCount) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(buatSatuOrang(ctx, i < kerjaCount));
  return arr;
}

// Tiga sumbu sesuai brainstorm (siang/malam, hujan, ramai/sepi), bukan satu
// objek raksasa. Dikutip dari bentuk potretRuangan() asli (room.js).
function buatS(ctx, { jam, hujan, petir, ramai }) {
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

/* ------------------------------------------------------------- uji satu --- */
function resetRuangan(ctx, pristine) {
  Object.assign(ctx.__jembatan__.RUANGAN, structuredClone(pristine.RUANGAN));
  Object.assign(ctx.__jembatan__.MOD, structuredClone(pristine.MOD));
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

// mulai -> tick x N -> selesai, meniru pembukuan tickEvent() asli persis
// (E.umur += dt SEBELUM tiap tick) supaya pada(E, N, fn) yang berfase
// benar-benar terpicu semua, bukan cuma cabang paling awal.
function ujiSmoke(ctx, def, pristine) {
  resetRuangan(ctx, pristine);
  const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });
  const E = buatE(def);
  const hasil = { mulai: 'ok', tick: 'ok', selesai: 'ok', tickCount: 0 };

  try {
    def.mulai && def.mulai(E, S);
  } catch (e) {
    hasil.mulai = 'THROW: ' + e.message;
  }

  const durasi = def.durasi || 10;
  const dt = Math.min(1, Math.max(0.1, durasi / 12));
  try {
    while (E.sisa > 0 && hasil.tickCount < 200) {   // 200 = pagar jaga-jaga, bukan batas normal
      E.umur += dt;
      E.sisa -= dt;
      def.tick && def.tick(E, dt, S);
      hasil.tickCount++;
    }
  } catch (e) {
    hasil.tick = 'THROW (tick #' + (hasil.tickCount + 1) + '): ' + e.message;
  }

  try {
    def.selesai && def.selesai(E, S);
  } catch (e) {
    hasil.selesai = 'THROW: ' + e.message;
  }

  if (def.perluAktor === true && E.aktor.length === 0) hasil.peringatanAktor = true;
  return hasil;
}

function ujiSatuEvent(ctx, def, pristine) {
  const syarat = ujiSyarat(ctx, def, pristine);
  const smoke = ujiSmoke(ctx, def, pristine);
  const gagal = smoke.mulai !== 'ok' || smoke.tick !== 'ok' || smoke.selesai !== 'ok';
  return { id: def.id, def, syarat, smoke, gagal };
}

/* -------------------------------------------------------------- laporan --- */
function cetakSatu(hasil) {
  const { def, syarat, smoke } = hasil;
  console.log(tebal(def.id) + abu(`   kelas: ${def.kelas}   bobot: ${def.bobot}   `
    + `cooldown: ${def.cooldown}s   durasi: ${def.durasi || 10}s`));
  console.log();
  console.log(`  syarat(S) — ${syarat.total} kombinasi: ${syarat.benar} benar, `
    + `${syarat.total - syarat.galat.length - syarat.benar} salah`
    + (syarat.galat.length ? merah(`, ${syarat.galat.length} melempar`) : ''));
  for (const g of syarat.galat) console.log(merah(`    ✗ ${g.kombinasi}: ${g.pesan}`));
  console.log();
  const baris = (nama, v) => console.log('  ' + nama.padEnd(22)
    + (v === 'ok' ? hijau('ok') : merah(v)));
  baris('mulai(E,S)', smoke.mulai);
  baris(`tick(E,dt,S) ×${smoke.tickCount}`, smoke.tick);
  baris('selesai(E,S)', smoke.selesai);
  if (smoke.peringatanAktor) {
    console.log(kuning('  peringatan: perluAktor=true tapi E.aktor kosong sesudah mulai()'));
  }
  console.log();
  console.log(tebal('RINGKASAN: ') + (hasil.gagal
    ? merah(`${[smoke.mulai, smoke.tick, smoke.selesai].filter((s) => s !== 'ok').length} hook melempar`)
    : hijau('0 exception')));
}

function cetakRingkas(hasil) {
  const status = hasil.gagal ? merah('THROW') : hijau('ok');
  const catatan = hasil.gagal
    ? '  ' + [hasil.smoke.mulai, hasil.smoke.tick, hasil.smoke.selesai]
      .filter((s) => s !== 'ok').join(' | ')
    : '';
  console.log(
    hasil.id.padEnd(38) + status.padEnd(boleh ? 20 : 6)
    + abu(`${hasil.syarat.benar}/${hasil.syarat.total} syarat`) + catatan,
  );
}

/* -------------------------------------------------------------------- CLI */
function main() {
  const argv = process.argv.slice(2);
  const ctx = muatKonteks();
  const { EVENT_ACAK, eventById, MOD, RUANGAN } = ctx.__jembatan__;
  const pristine = { RUANGAN: structuredClone(RUANGAN), MOD: structuredClone(MOD) };

  if (argv.includes('--daftar')) {
    for (const def of EVENT_ACAK) console.log(def.id);
    console.log(abu(`\n${EVENT_ACAK.length} event terdaftar`));
    return;
  }

  if (argv.includes('--semua')) {
    let adaGagal = false;
    let totalGalatSyarat = 0;
    for (const def of EVENT_ACAK) {
      const hasil = ujiSatuEvent(ctx, def, pristine);
      cetakRingkas(hasil);
      if (hasil.gagal) adaGagal = true;
      totalGalatSyarat += hasil.syarat.galat.length;
    }
    console.log();
    console.log(tebal(`${EVENT_ACAK.length} event diuji. `)
      + (adaGagal ? merah('ada hook yang melempar — lihat di atas.') : hijau('0 exception.'))
      + (totalGalatSyarat ? kuning(` (${totalGalatSyarat} kombinasi syarat() ikut melempar)`) : ''));
    process.exit(adaGagal ? 1 : 0);
  }

  const id = argv[0];
  if (!id || id.startsWith('--')) {
    console.log('Pakai:');
    console.log('  node uji-event.mjs <id>       satu event, detail lengkap');
    console.log('  node uji-event.mjs --semua    sapu semua event, ringkas + exit code');
    console.log('  node uji-event.mjs --daftar   cetak semua id yang valid');
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

main();
