#!/usr/bin/env node
/* uji-ulang.mjs :: putar ulang SATU HARI SUNGGUHAN ke frame()/handle() asli
 * public/room.js, headless, lalu periksa invarian yang harus benar sepanjang
 * hari itu.
 *
 * ================================ APA YANG DIJAGA UJI INI ==================
 *
 * Fixture-nya bukan karangan. uji-ulang.fixture.jsonl adalah buku agenda satu
 * hari kerja sungguhan (lihat kepala berkasnya) yang label & pengenalnya sudah
 * diganti sintetis oleh buat-fixture.mjs — bentuk harinya utuh, isinya tidak
 * ada lagi. Bentuk itulah yang tidak bisa ditiru fixture buatan tangan:
 * rentetan gagal beruntun, subagent-start yang jauh lebih banyak daripada
 * subagent-stop, rapat yang tidak pernah ditutup karena sesinya mati, tiga
 * proyek yang bertumpuk di satu ruangan.
 *
 * Yang diperiksa BUKAN golden urutan gambar — itu jatah uji-zorder.mjs — tapi
 * SIFAT yang harus bertahan dari awal sampai akhir hari:
 *
 *   A  nol lemparan dari handle() maupun frame();
 *   B  nol `console.warn('[event]', ...)` — inilah yang membongkar tick()
 *      event yang meledak tapi ditelan try/catch di tickEvent();
 *   C  tiap penghuni & tiap prop digambar TEPAT SEKALI tiap frame;
 *   D  x/y/alpha tiap penghuni terhingga dan di dalam batas kanvas yang wajar;
 *   E  tidak ada wadah yang tumbuh tanpa batas (ambang, bukan drain-ke-nol —
 *      lihat "APA YANG *TIDAK* DIJAGA" §1);
 *   F  larik RUANGAN yang naik monoton tanpa pernah turun dilaporkan sebagai
 *      dugaan bocor, kecuali yang memang permanen menurut desain;
 *   G  MOD kembali persis ke bawaan tiap kali tidak ada event hidup — diuji
 *      dengan PENANDA (MOD.mejaGetar dicorat-coret sebelum frame), jadi yang
 *      teruji resetMod()-nya sendiri, bukan kebetulan bahwa event terakhir
 *      menutup tulisannya sendiri;
 *   H  jumlah sesi di akhir masuk akal terhadap fixture;
 *   I  ATURAN 2 secara langsung: toolCount di akhir === jumlah baris kind
 *      'pre' di fixture, tanpa toleransi. Kalau ada event acak yang diam-diam
 *      menaikkan statistik pekerjaan, invarian ini yang merah;
 *   J  ATURAN 1 secara langsung, dua sisi:
 *      * sisi KEJADIAN: sesudah tiap kejadian yang melewati lepasDariEvent()
 *        di handle() — bukan cuma `pre` — pegawainya sudah lepas dari peran
 *        event (eventKerja null, doingEvent kosong);
 *      * sisi FRAME (J:pinjam-saat-kerja): tiap frame, tiap agen sesi yang
 *        sedang dipinjam event tidak boleh sekaligus memegang tool call
 *        (adaTugas). Sengaja adaTugas saja, bukan state 'work' — lihat
 *        alasannya (dan angka merah palsunya) di komentar J2 di jalankan().
 *      Sisi kejadian JARANG tersentuh — terukur 0-1 kali sehari, karena
 *      kejadian harus datang persis saat agennya sedang jadi pemeran; angka
 *      sekecil itu tidak terbedakan dari nol, jadi laporan memperingatkannya
 *      kuning di bawah J_MIN_TERSENTUH, bukan cuma tepat nol. Yang menahan
 *      Aturan 1 sepanjang hari sisi frame, yang diperiksa ribuan kali (baris
 *      "uji Aturan 1 (frame)" di laporan).
 *
 * Kanvas dipasang mode KETAT (buatCtxPalsu ketat: argumen NaN/undefined/
 * Infinity melempar). Ini GERBANG, bukan peringatan: event baru yang menggambar
 * dengan NaN memang bug nyata, dan pesan gagalnya menyebut ID EVENT (atau nama
 * prop / id pegawai) yang sedang menggambar, daftar event yang hidup saat itu,
 * plus argumen yang melanggar — supaya bisa diperbaiki dalam hitungan detik
 * tanpa membelah 300+ definisi event sendiri. Yang membuat id itu ada: kait
 * gambar dibungkus pasangMataMata(), dan pembungkusnya sengaja TIDAK memulihkan
 * penanda "sedang menggambar" di jalur melempar. `--longgar` mematikan mode
 * ketat untuk penyelidikan lokal, tidak untuk CI.
 *
 * Contoh kegagalan dicetak per BENTUK (kunci dedup), bukan per kali: gambar
 * ber-NaN terulang tiap frame, dan tanpa dedup kelima slot contoh habis oleh
 * satu baris agenda yang sama di frame berurutan.
 *
 * Satu keanehan sandbox yang perlu diketahui saat membaca pesan gagalnya:
 * di dalam vm uji-event.mjs, identifier bebas yang tidak terdaftar jatuh ke
 * objek dummy — termasuk `NaN`, `undefined`, dan `Infinity` yang ditulis
 * LITERAL di kode. Jadi gambar dengan NaN literal tetap tertangkap (dummy
 * bukan angka hingga), tapi pesannya berbunyi "bukan angka hingga:
 * function () { [native code] }", bukan "NaN". NaN hasil hitungan
 * (0/0, x - undefined, parseFloat gagal) tetap tampil sebagai NaN.
 *
 * ============================ APA YANG *TIDAK* DIJAGA =====================
 *
 * 1. LUBANG setInterval. Sandbox uji-event.mjs men-stub setInterval jadi
 *    `() => 0` — callback-nya tidak pernah disimpan, apalagi dipanggil.
 *    Akibatnya penyapu rapat basi 15 menit (public/room.js, setInterval 1
 *    detik yang membubarkan rapatAktif ber-`sejak` > 900 detik) TIDAK PERNAH
 *    jalan di sini. Karena itu invarian rapat berupa AMBANG, bukan
 *    "kembali ke nol": memaksa drain-ke-nol pasti merah palsu. Lubang ini
 *    diterima apa adanya — uji-event.mjs sengaja tidak disentuh berkas ini.
 *    Hal yang sama berlaku untuk terapkanSeragamHarian, cekJadwalRaya,
 *    aturSuaraHujan, muatCuaca, dan penyegar kartu 800 ms.
 *
 * 2. KIND YANG TIDAK PERNAH MASUK BUKU AGENDA. server.mjs menolak 'pikir',
 *    'ucap', dan 'token' (AGENDA_KIND_TOLAK), dan tidak pernah menyimpan
 *    ev.tanya / ev.paraf / ev.biaya / ev.antrean. Jadi balon pikiran, kotak
 *    kabar 'hasil', modal rencana, dan loket disposisi TIDAK teruji di sini.
 *    Yang menguji jalur itu tetap uji-event.mjs dan tangan.
 *
 * 3. KOMPRESI WAKTU. Bawaan --laju 12 memampatkan hari aslinya 12x, sementara
 *    tenggat berbasis `now` di room.js tidak ikut memampat (a.busyUntil = now
 *    + 60000). Ruangannya jadi lebih padat dan lebih sibuk daripada hari
 *    aslinya. Distorsi ini sama persis dengan yang sudah dialami putarUlang()
 *    di server pada laju 60 — bukan hal baru, tapi jangan dibaca sebagai
 *    "beginilah hari itu".
 *
 * 4. SATU JALUR DUNIA PER BENIH. Math.random di-benih, jadi event mana yang
 *    menyala bersifat tetap untuk satu benih — TAPI tiap definisi event baru
 *    menggeser hasil undian pilihBerbobot(). Karena itu berkas ini SENGAJA
 *    tidak punya golden apa pun tentang event: semua invarian berupa sifat,
 *    bukan daftar. Kalau aturan itu dilanggar, uji ini akan merah tiap kali
 *    ada yang menambah satu event.
 *
 * Dua jam sengaja dipakai bersamaan:
 *   * jam virtual (performance.now) maju 50 ms per frame — 50 ms karena
 *     frame() menjepit dt = Math.min(0.05, ...), jadi langkah lebih besar
 *     membuat `now` melonjak sementara integrasinya tertinggal;
 *   * Date palsu digeser mengikuti JAM DINDING hari aslinya (setJamPalsu),
 *     supaya jendela 60 detik RUANGAN.gagalBeruntun di tickRuangan() memangkas
 *     dengan irama yang sama seperti hari itu, bukan menghasilkan bocor palsu.
 *
 * Pakai:
 *   node uji-ulang.mjs                 putar seluruh fixture, gerbang CI
 *   node uji-ulang.mjs --laju 1        hari penuh pelan (di luar CI)
 *   node uji-ulang.mjs --benih 7       jalur dunia lain
 *   node uji-ulang.mjs --sampai 300    potong fixture, buat menyelidik cepat
 *   node uji-ulang.mjs --tampil        cetak urutan gambar frame sampel
 *   node uji-ulang.mjs --longgar       matikan kanvas ketat (bukan untuk CI)
 *   node uji-ulang.mjs --fixture X     pakai berkas fixture lain
 *
 * ANGGARAN WAKTU — diukur, bukan ditaksir, dan disebut sebagai SEBARAN karena
 * satu angka di sini selalu bohong. Jalan penuh = fixture 3.177 baris, 11.330
 * frame, 9,4 menit virtual. Di mesin pengembang (16 core logis) yang sedang
 * dipakai pekerjaan lain, sebelas pengukuran dalam satu sore:
 *   lima berturut  46,3 / 50,8 / 52,0 / 52,8 / 56,4 detik  (202-246 frame/detik)
 *   enam lainnya   56,9 sampai 92,4 detik, waktu mesinnya lebih sibuk
 * Jadi harapkan 46-92 detik dengan pusat sekitar 55; runner CI 2 core hampir
 * pasti lebih lambat lagi. Kalau langkah CI-nya kesempitan, `--laju 20`
 * terukur 33,2 detik (7.006 frame) dan tetap hijau — harinya jadi lebih
 * pendek, jadi lebih sedikit event ambient yang sempat menyala, bukan
 * invarian yang dimatikan.
 *
 * UTANG: komentar '27 detik di mesin lengang' di .github/workflows/uji.yml
 * tidak pernah bisa direproduksi (terbaik hari ini 46,3 detik) dan perlu
 * diralat jadi rentang di atas. Berkas itu di luar jangkauan tugas yang
 * menulis catatan ini; jangan biarkan orang berikutnya mengira runner-nya
 * rusak waktu langkah ini makan semenit.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  muatKonteks, setJamPalsu, buatPristine,
  merah, hijau, kuning, abu, tebal,
} from './uji-event.mjs';
import {
  muatFixture, periksaPrivasi, periksaKamus, periksaKepala, periksaLarik,
  jalankanPagar, FIXTURE,
} from './buat-fixture.mjs';

const BENIH_BAWAAN = 20260903;
const LAJU_BAWAAN = 12;
const JEDA_MAKS_BAWAAN = 4000;      // ms virtual; jeda malam tidak diputar semalaman
const LANGKAH_MS = 50;              // = jepitan dt frame() (Math.min(0.05, ...))
const FRAME_EKOR = 400;             // frame tambahan sesudah baris terakhir habis
const CHECKPOINT = 10;              // tiap berapa frame invarian yang mahal diperiksa
/* EMPAT kind yang KELUAR dari handle() sebelum baris `lepasDariEvent(a)`:
   session-end mengurus kepulangan sendiri; 'antre', 'promosi', dan 'pagu'
   bukan milik satu pegawai (session kosong — 'pagu' milik satu FOLDER).
   Invarian J tidak berlaku untuk keempatnya. */
const LEWAT_LEPAS = new Set(['session-end', 'antre', 'promosi', 'pagu']);
/* Berapa kali sisi-kejadian invarian J harus tersentuh sebelum angkanya boleh
   dibaca sebagai "teruji". Terukur 0-1 kali per hari pada laju 12; lihat
   peringatannya di jalankan(). */
const J_MIN_TERSENTUH = 5;

/* ------------------------------------------------------------ DIKETAHUI --- *
 * Daftar MILIK BERKAS INI (bukan menumpang DIKETAHUI di uji-event.mjs):
 * temuan nyata yang sudah dipastikan, yang sengaja TIDAK memerahkan CI supaya
 * pekerjaan lain tidak terhalang — tapi ikut tercetak tiap kali uji jalan
 * sehingga tidak bisa dilupakan. Begitu diperbaiki, entrinya HARUS dihapus;
 * uji ini memperingatkan kalau ada entri yang ternyata sudah tidak terjadi. */
const DIKETAHUI = [
  // Kosong — dan itu hasil pengukuran, bukan kemalasan.
  //
  // Dugaan waktu uji ini dirancang: bukaRapat() (public/room.js) SELALU
  // mendorong entri ke rapatAktif walau kursi penuh (muat === 0, jadi
  // anggota []), sementara entri ber-anggota kosong cuma dibersihkan
  // sapuRapatKosong() yang hanya dipanggil dari pesertaKeluar()/bubarkanSatu()
  // — penyapu 15 menit yang seharusnya jadi jaring pengaman hidup di dalam
  // setInterval, yang MATI di sandbox ini (lihat "APA YANG TIDAK DIJAGA" §1).
  // Hari fixture ini punya 94 subagent-start lawan 59 subagent-stop, jadi
  // entri kosong seharusnya menumpuk.
  //
  // Ternyata TIDAK menumpuk: diukur pada hari penuh (5.512 baris) puncak
  // rapatAktif cuma 10 dari ambang 36. Sebabnya sapuRapatKosong() menyapu
  // SELURUH larik tiap kali dipanggil, bukan satu entri — jadi satu
  // subagent-stop saja sudah membereskan semua entri kosong yang menumpuk
  // sebelumnya. Bug-nya nyata secara pembacaan kode, tapi tidak pernah
  // terwujud jadi kebocoran pada beban hari sungguhan.
  //
  // Bentuk entri kalau suatu hari perlu diisi lagi:
  //   { id: 'nama-pendek', invarian: 'E:bocor:<nama penghitung>', ket: '...' }
  // Entri di sini TIDAK memerahkan CI tapi tetap dicetak tiap kali uji jalan.
];

/* Larik RUANGAN yang MEMANG tumbuh permanen menurut desain ("bekas yang
 * sengaja hidup lebih lama dari eventnya", lihat komentar RUANGAN di room.js).
 * Yang di luar daftar ini, kalau naik monoton dan melewati 50, dilaporkan
 * sebagai dugaan bocor. */
const RUANGAN_PERMANEN = new Set([
  'nodaPlafon', 'retakExtra', 'nodaKopi', 'nodaMeja', 'edaran', 'sampahLantai',
  'propLantai', 'geserKursi', 'inspeksiLog',
]);
const RUANGAN_AMBANG = { gagalBeruntun: 400, bekasStempel: 200, kertasLantai: 200, tumpukanMap: 60 };

/* ------------------------------------------------------------- warna ------ */
const angka = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* -------------------------------------------------------------- acak ------ */
/* xorshift32 — deterministik, cukup rata untuk memilih event, dan tidak
   membawa dependensi. Benihnya dicetak di tiap laporan supaya kegagalan bisa
   diulang persis. */
function acakBerbenih(benih) {
  let x = (benih >>> 0) || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/* Menambal Math.random & performance.now MILIK PROSES INI — objek yang sama
   yang diteruskan sandbox uji-event.mjs ke dalam vm. Mengembalikan fungsi
   pemulih; dipanggil di ujung supaya proses tidak ditinggalkan dalam keadaan
   tertambal (penting kalau suatu hari berkas ini diimpor, bukan dijalankan). */
function pasangJamDanDadu(jam, benih) {
  const randomAsli = Math.random;
  const nowAsli = performance.now;
  Math.random = acakBerbenih(benih);
  performance.now = () => jam.ms;
  return () => { Math.random = randomAsli; performance.now = nowAsli; };
}

/* Pembanding MOD per-kunci. Mengembalikan string beda pertama (maks 3 kunci)
   atau null. Dipakai tiap frame tanpa event hidup, jadi sengaja tanpa
   JSON.stringify: MOD punya ~50 kunci dan cuma satu yang berupa larik. */
function bedaMod(kini, awal) {
  let beda = null;
  for (const k of Object.keys(awal)) {
    const a = awal[k], b = kini[k];
    let sama;
    if (Array.isArray(a)) sama = Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
    else sama = a === b;
    if (sama) continue;
    const baris = `${k}: pristine ${JSON.stringify(a)} vs sekarang ${JSON.stringify(b)}`;
    beda = beda ? beda + '; ' + baris : baris;
  }
  return beda;
}

/* --------------------------------------------------------- jembatan ------ *
 * Jembatan KEDUA. uji-event.mjs punya __jembatan__ sendiri; berkas ini tidak
 * boleh mengubahnya, jadi const room.js yang tidak ada di sana diambil lewat
 * skrip vm terpisah.
 *
 * Sandbox uji-event.mjs memakai Proxy yang has()-nya selalu true, jadi
 * `typeof namaHilang` TIDAK PERNAH 'undefined' — nama yang hilang jatuh ke
 * objek dummy, bukan ReferenceError. Karena itu validasi WAJIB lewat BENTUK
 * nilainya (Array.isArray / instanceof Map / instanceof Set / typeof
 * 'number'), bukan typeof 'undefined'. */
const BENTUK = {
  rapatAktif: 'array', kabar: 'array', parts: 'array', antrianLaporDiri: 'array',
  pernahHadir: 'Map', izinTunggu: 'Map', namaPanggilan: 'Map', sesiHalaman: 'Set',
  pegawaiTetap: 'Map',
  KURSI_TOTAL: 'number', KABAR_MAX: 'number', MIN_DI_LAYAR: 'number',
  PARTIKEL_MAKS_RINGAN: 'number', stationFor: 'function', KEGIATAN_GIT: 'object',
};
const bentukDari = (v) => (Array.isArray(v) ? 'array'
  : v instanceof Map ? 'Map' : v instanceof Set ? 'Set'
    : v && typeof v === 'object' && !(v instanceof Function) ? 'object' : typeof v);

function pasangJembatanUlang(ctx, peringatan) {
  new vm.Script(`globalThis.__jembatanUlang__ = {
    rapatAktif, kabar, parts, antrianLaporDiri, pernahHadir, izinTunggu,
    namaPanggilan, sesiHalaman, pegawaiTetap, KURSI_TOTAL, KABAR_MAX, MIN_DI_LAYAR,
    PARTIKEL_MAKS_RINGAN, stationFor, KEGIATAN_GIT,
    ambilS: () => S,
    ambilNow: () => now,
    ambilToolCount: () => toolCount,
    ambilStandbyDihapus: () => standbyDihapus,
  };`, { filename: 'jembatan-ulang.js' }).runInContext(ctx);
  const J = ctx.__jembatanUlang__;
  const ada = {}, hilang = [];
  for (const [nama, bentuk] of Object.entries(BENTUK)) {
    if (bentukDari(J[nama]) === bentuk) ada[nama] = J[nama];
    else { hilang.push(nama); peringatan.push(`nama '${nama}' hilang dari public/room.js (atau ganti bentuk), invarian terkait dilewati`); }
  }
  /* Objek dummy sandbox ADALAH sebuah fungsi, jadi bentuk 'function' saja
     tidak membuktikan stationFor() sungguhan yang terambil. Dua uji kecil
     dengan jawaban yang sudah pasti menutup celah itu — tanpa ini,
     stationFor yang hilang lolos sebagai dummy dan pagar privasi ikut
     kehilangan daftar verb git-nya tanpa suara. */
  if (ada.stationFor && ada.stationFor('Read', 'x', '') !== 'read') {
    delete ada.stationFor; hilang.push('stationFor');
    peringatan.push("stationFor() dari room.js tidak menjawab 'read' untuk tool Read — dianggap hilang");
  }
  if (ada.KEGIATAN_GIT && !ada.KEGIATAN_GIT.push) {
    delete ada.KEGIATAN_GIT; hilang.push('KEGIATAN_GIT');
    peringatan.push('KEGIATAN_GIT dari room.js tidak berisi verb git yang dikenal — dianggap hilang');
  }
  if (hilang.length > Object.keys(BENTUK).length / 2) {
    throw new Error('lebih dari separuh nama room.js tidak terbaca lewat jembatan kedua ('
      + hilang.join(', ') + ') — uji-ulang.mjs perlu diselaraskan dengan room.js');
  }
  return { J, ada, hilang: new Set(hilang) };
}

/* --------------------------------------------------------- mata-mata ----- *
 * BUNGKUS, bukan ganti (beda dari uji-zorder.mjs yang mengganti total):
 * gambar aslinya tetap jalan supaya ctx palsu ketat benar-benar memvalidasi
 * koordinat yang dipakai room.js. Catatan per frame cuma Map hitungan;
 * urutan penuh disimpan hanya pada frame sampel. */
function pasangMataMata(ctx, H) {
  const catatan = {
    orang: new Map(), prop: new Map(), event: new Map(),
    urutan: null,                                 // diisi hanya saat frame sampel
    sumber: null,                                 // siapa yang SEDANG menggambar
  };
  /* `sumber` sengaja TIDAK dikosongkan lewat finally. Justru kebalikannya:
     kalau gambarnya melempar (mode kanvas ketat: koordinat NaN/undefined/
     Infinity), nilainya dibiarkan menggantung supaya penangkap di satuFrame()
     masih bisa membacanya dan menyebut id event / nama prop / id pegawai yang
     menggambar. Tanpa ini pesan gagalnya cuma menyebut baris agenda dan frame,
     dan penemunya harus membelah 300+ definisi event sendiri. Dikosongkan lagi
     di awal tiap frame lewat catatan.reset(). */
  const catat = (jenis, kunci, label) => {
    const m = catatan[jenis];
    m.set(kunci, (m.get(kunci) || 0) + 1);
    if (catatan.urutan) catatan.urutan.push(label);
  };

  const drawAsli = ctx.drawPerson;
  if (typeof drawAsli !== 'function') throw new Error('drawPerson() tidak ditemukan di room.js');
  ctx.drawPerson = function (a) {
    catat('orang', a, 'orang:' + (a && a.id));
    const lalu = catatan.sumber;
    catatan.sumber = `pegawai '${a && a.id}'`;
    const hasil = drawAsli(a);
    catatan.sumber = lalu;                      // hanya tercapai kalau TIDAK melempar
    return hasil;
  };

  for (const p of H.PROPS) {
    const asli = p.draw;
    if (typeof asli !== 'function') continue;
    const nama = asli.name || 'prop-tanpa-nama';
    p.draw = function (...args) {
      catat('prop', p, 'prop:' + nama);
      const lalu = catatan.sumber;
      catatan.sumber = `prop ${nama}()` + (p.station ? ` [stasiun ${p.station}]` : '');
      const hasil = asli.apply(this, args);
      catatan.sumber = lalu;
      return hasil;
    };
  }

  for (const def of H.EVENT_ACAK) {
    if (typeof def.gambarProp !== 'function') continue;
    const asli = def.gambarProp;
    def.gambarProp = function (...args) {
      catat('event', def.id, 'event:' + def.id);
      const lalu = catatan.sumber;
      catatan.sumber = `event ${def.id} (gambarProp)`;
      const hasil = asli.apply(this, args);
      catatan.sumber = lalu;
      return hasil;
    };
  }

  catatan.reset = () => {
    catatan.orang.clear(); catatan.prop.clear(); catatan.event.clear();
    catatan.sumber = null;
  };
  return catatan;
}

/* ------------------------------------------------------------- setup ----- */
function siapkan(opsi) {
  const peringatan = [];

  /* Dua jam & satu dadu DIPASANG SEBELUM room.js dimuat, bukan sesudah.
   * Sandbox uji-event.mjs meneruskan objek `Math` dan `performance` MILIK
   * proses ini apa adanya (lihat buatSandbox()), jadi menambal keduanya di
   * sini menembus ke dalam vm. Ini bukan kerapian: kode top-level room.js
   * sudah memanggil Math.random() (posisi standby, spawnIndex) dan
   * performance.now() (`now`, `last`, KAMERA.mulai, fpsSejak) SAAT DIMUAT.
   * Menambalnya sesudah muatKonteks() menyisakan keadaan awal yang berbeda
   * tiap kali dijalankan — dan itu terbukti membuat dua jalan berbenih sama
   * menghasilkan tabel puncak yang berbeda. */
  const jam = { ms: 0 };
  siapkan.pulihkan = pasangJamDanDadu(jam, opsi.benih);

  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  const { J, ada, hilang } = pasangJembatanUlang(ctx, peringatan);

  // (a) kanvas ketat: argumen NaN/undefined/Infinity melempar
  ctx.__ctxPalsu.__kendali.ketat = !opsi.longgar;

  // (b) perekam console: console.warn('[event]', id, e) dari tickEvent()
  //     tidak boleh hilang diam-diam
  const konsol = [];
  const rekam = (tingkat) => (...args) => {
    konsol.push({ tingkat, pesan: args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ') });
  };
  ctx.console = { log: rekam('log'), info: rekam('info'), debug: rekam('debug'), warn: rekam('warn'), error: rekam('error') };

  // (c) `now`/`last` disamakan dengan jam virtual. performance.now() sudah
  //     ditambal di atas, tapi kedua binding ini `let` yang nilainya sudah
  //     terlanjur dibaca waktu muat — hanya setter di dalam context yang bisa
  //     menembus binding lexical-nya.
  H.setNow(jam.ms);
  H.setLast(jam.ms);

  const pristine = buatPristine(ctx);
  const mata = pasangMataMata(ctx, H);
  return { ctx, H, J, ada, hilang, peringatan, konsol, jam, pristine, mata };
}

/* ------------------------------------------------------------ jalankan --- */
function jalankan(opsi, fixture, alat) {
  const { ctx, H, J, ada, peringatan, konsol, jam, pristine, mata } = alat;

  const baris = opsi.sampai ? fixture.baris.slice(0, opsi.sampai) : fixture.baris;
  const preTotal = baris.filter((b) => b.kind === 'pre').length;
  const sesiUnik = new Set(baris.map((b) => b.session).filter(Boolean));
  const sesiSelesai = new Set(baris.filter((b) => b.kind === 'session-end').map((b) => b.session));
  const sesiHidup = sesiUnik.size - [...sesiSelesai].filter((s) => sesiUnik.has(s)).length;

  /* id invarian -> { n, contoh[], kunci:Set }
   *
   * Contoh disimpan per BENTUK, bukan per kali. Tanpa itu satu baris agenda
   * yang bermasalah menghabiskan kelima slot contoh sendirian: gambar ber-NaN
   * terulang tiap frame, jadi kelimanya berbunyi sama persis kecuali nomor
   * frame-nya, dan bentuk KEDUA — yang biasanya justru menjelaskan sebabnya —
   * tidak pernah kelihatan. `n` tetap menghitung semua kejadian supaya
   * besarannya tidak hilang. */
  const gagal = new Map();
  const CONTOH_MAKS = 5;
  const KUNCI_MAKS = 500;           // batas ingatan bentuk; sesudahnya cuma dihitung
  const catatGagal = (id, isi, kunci) => {
    let g = gagal.get(id);
    if (!g) { g = { n: 0, contoh: [], kunci: new Set() }; gagal.set(id, g); }
    g.n++;
    const k = kunci === undefined ? isi : kunci;
    if (g.kunci.has(k)) return;
    if (g.kunci.size < KUNCI_MAKS) g.kunci.add(k);
    if (g.contoh.length < CONTOH_MAKS) g.contoh.push(isi);
  };
  const puncak = new Map();         // nama -> { nilai, ambang, frame }
  const naikkan = (nama, nilai, ambang) => {
    const p = puncak.get(nama);
    if (!p || nilai > p.nilai) puncak.set(nama, { nilai, ambang, frame: nFrame, baris: iBaris });
  };

  let nFrame = 0, iBaris = -1, frameSampel = null, jPinjam = 0, jUji = 0, gUji = 0;
  const jamAsli = () => {
    const b = baris[Math.max(0, iBaris)];
    if (!b) return '--:--:--';
    const d = new Date(b.ts);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  };
  const konteks = () => {
    const b = baris[Math.max(0, iBaris)] || {};
    return `baris #${iBaris} ${jamAsli()} ${b.kind || '-'}/${b.tool || '-'}/${b.session || '-'} `
      + `frame ${nFrame} jamVirtual ${(jam.ms / 1000).toFixed(1)}s`;
  };
  /* Tambahan konteks khusus untuk LEMPARAN: siapa yang sedang menggambar saat
     kanvas ketat menolak koordinatnya, dan event apa saja yang hidup saat itu.
     Ini yang membuat gerbang kanvas ketat layak jadi gerbang keras: event baru
     yang menggambar dengan NaN disebut NAMANYA di baris pertama laporan, jadi
     penemunya tidak perlu membelah 300+ definisi event sendiri. mata.sumber
     tetap terisi saat lemparan karena pembungkusnya sengaja tidak memulihkan
     nilainya di jalur gagal (lihat pasangMataMata). */
  const sumberGambar = () => {
    const hidup = H.eventHidup.map((E) => E.id);
    const daftar = hidup.length
      ? hidup.slice(0, 6).join(', ') + (hidup.length > 6 ? `, … (${hidup.length} total)` : '')
      : '(tidak ada)';
    return (mata.sumber ? ` saat menggambar ${mata.sumber}` : '')
      + ` · event hidup: ${daftar}`;
  };

  /* ---- satu frame + pemeriksaan per frame ---- */
  const ruanganPanjangLalu = new Map();
  const ruanganMonoton = new Map();
  const ruanganLarik = Object.keys(H.RUANGAN).filter((k) => Array.isArray(H.RUANGAN[k]));

  function satuFrame() {
    const hidupSebelum = H.eventHidup.length;
    // PENANDA untuk invarian G. Tanpa ini, invarian G bergantung pada
    // kebetulan: kebanyakan event MENUTUP tulisannya sendiri di tick terakhir
    // (`MOD.internetMati = E.umur < 28` sudah bernilai false waktu eventnya
    // mati), jadi MOD tetap bersih walau resetMod() dibuang — terbukti waktu
    // mutasi "hapus resetMod()" sempat lolos hijau padahal invariannya jalan
    // 6.068 kali. Dengan penanda ini yang diuji resetMod()-nya SENDIRI:
    // MOD.mejaGetar dicorat-coret ke -2 sebelum frame, dan resetMod() di awal
    // tickEvent() wajib mengembalikannya ke -1. Nilai -2 dipilih karena
    // room.js cuma membandingkannya dengan indeks meja (`MOD.mejaGetar === i`,
    // i >= 0), jadi tidak ada satu piksel pun yang berubah karenanya.
    if (hidupSebelum === 0) H.MOD.mejaGetar = -2;
    mata.reset();
    if (opsi.tampil && nFrame % 500 === 0) mata.urutan = [];
    jam.ms += LANGKAH_MS;
    try {
      ctx.frame(jam.ms);
    } catch (e) {
      // kunci dedup = SUMBER + pesan, bukan barisnya: yang menarik bentuk
      // lemparannya, bukan frame ke berapa ia terulang
      catatGagal('A:lemparan-frame', `${konteks()}${sumberGambar()} :: ${e && e.message}`,
        `${mata.sumber} :: ${e && e.message}`);
      jam.ms += LANGKAH_MS;            // jangan macet di frame yang sama
      nFrame++;
      return;
    }
    if (mata.urutan) { frameSampel = { frame: nFrame, urutan: mata.urutan }; mata.urutan = null; }
    nFrame++;

    // (B) console.warn dari event yang meledak di dalam try/catch tickEvent()
    while (konsol.length) {
      const k = konsol.shift();
      if (k.tingkat === 'warn' || k.tingkat === 'error') {
        if (/^\[event\]/.test(k.pesan)) catatGagal('B:warn-event', `${konteks()} :: ${k.pesan}`, k.pesan);
        else naikkan('console.warn lain', 1, 0);
      }
    }

    // (C) kelengkapan gambar + (D) posisi waras
    // Berapa kali agen SESI NYATA (bukan standby/peserta) benar-benar dipinjam
    // jadi pemeran event. Dipakai untuk tahu apakah invarian J di bawah
    // benar-benar teruji pada jalan ini atau cuma lewat tanpa pernah kena —
    // invarian yang tidak pernah tersentuh lebih buruk daripada tidak ada,
    // karena ia memberi rasa aman palsu.
    for (const a of H.agents.values()) {
      if (!a.eventKerja) continue;
      jPinjam++;
      /* (J2) Sisi Aturan 1 yang bisa diperiksa TIAP FRAME, bukan cuma saat
         kejadian kebetulan datang pas agennya dipinjam. Isinya sama: pegawai
         yang sedang jadi pemeran event TIDAK BOLEH sekaligus memegang tool
         call. room.js menjaga dua arah — bisaDipinjam() menolak meminjam yang
         masih adaTugas, dan handle() memanggil lepasDariEvent() sebelum
         menyalakan adaTugas — jadi kedua arah itu yang diuji di sini.

         Cuma agen SESI NYATA: standby boleh punya adaTugas sendiri (petugas
         notulen) dan Peserta lahir dengan adaTugas true, keduanya bukan
         pemegang tool call.

         Yang diperiksa `adaTugas` SAJA, bukan state === 'work'. Terukur: state
         'work' menyala pada pemeran event yang sama sekali tidak memegang tool
         call (adaTugas false, doing kosong) karena arrive() menyetel
         `state = now < busyUntil ? 'work' : 'idle'` tiap kali event
         memindahkan orangnya, dan busyUntil sisa tool call yang SUDAH selesai
         belum tentu nol. State itu kosmetik; adaTugas yang berarti "sedang
         memegang tool call". Memasukkan state ke sini menghasilkan merah palsu
         ~20 kejadian sehari.

         Ini yang membuat J menjaga sesuatu sepanjang hari; sisi kejadian (di
         pengumpan) tetap ada tapi jarang tersentuh. */
      if (a.adaTugas) {
        catatGagal('J:pinjam-saat-kerja',
          `${konteks()} :: '${a.id}' dipinjam event '${a.eventKerja.id}' padahal masih memegang `
          + `tool call (adaTugas=${a.adaTugas}, state='${a.state}', doing='${a.doing}')`,
          `${a.id}/${a.eventKerja.id}`);
      }
    }

    const penghuni = [...H.agents.values(), ...H.peserta, ...H.standby];
    for (const a of penghuni) {
      const n = mata.orang.get(a) || 0;
      if (n !== 1) catatGagal('C:gambar-penghuni', `${konteks()} :: pegawai '${a.id}' digambar ${n}x (harus 1x)`, `${a.id}:${n}`);
      const buruk = (v) => typeof v !== 'number' || !Number.isFinite(v);
      if (buruk(a.x) || buruk(a.y) || buruk(a.alpha)) {
        catatGagal('D:posisi', `${konteks()} :: '${a.id}' x=${a.x} y=${a.y} alpha=${a.alpha} (bukan angka hingga)`, `${a.id}:hingga`);
      } else if (a.x < -40 || a.x > 520 + 40 || a.y < -40 || a.y > 400 + 40 || a.alpha < 0 || a.alpha > 1) {
        catatGagal('D:posisi', `${konteks()} :: '${a.id}' x=${a.x.toFixed(1)} y=${a.y.toFixed(1)} alpha=${a.alpha.toFixed(2)} di luar batas wajar`, `${a.id}:batas`);
      }
    }
    for (const p of H.PROPS) {
      const n = mata.prop.get(p) || 0;
      if (n !== 1) catatGagal('C:gambar-prop', `${konteks()} :: prop '${p.station || '?'}' digambar ${n}x (harus 1x)`, `${p.station}:${n}`);
    }
    for (const E of H.eventHidup) {
      if (typeof E.def.gambarProp !== 'function') continue;
      const n = mata.event.get(E.id) || 0;
      if (n !== 1) catatGagal('C:gambar-event', `${konteks()} :: gambarProp '${E.id}' dipanggil ${n}x (harus 1x)`, `${E.id}:${n}`);
    }

    // (G) MOD kembali ke bawaan saat tidak ada event hidup. Syaratnya KOSONG
    //     sebelum DAN sesudah frame: resetMod() jalan di awal tickEvent(), jadi
    //     event yang mati di tengah frame ini masih sempat menulis MOD.
    //     Diperiksa TIAP FRAME yang memenuhi syarat, bukan tiap checkpoint —
    //     dengan katalog event yang makin penuh, frame tanpa satu pun event
    //     hidup jadi langka, dan menyaringnya lagi dengan checkpoint membuat
    //     invarian ini nyaris tidak pernah jalan (terbukti: mutasi yang
    //     membuang resetMod() sempat lolos hijau). Pembandingnya per-kunci,
    //     bukan JSON.stringify, supaya murah.
    if (hidupSebelum === 0 && H.eventHidup.length === 0) {
      gUji++;
      const beda = bedaMod(H.MOD, pristine.MOD);
      if (beda) {
        catatGagal('G:mod-bocor', `${konteks()} :: ${beda} (event terakhir mati: ${eventTerakhirMati || '-'})`, beda);
      }
    }

    // (E) ambang wadah
    naikkan('agents', H.agents.size, sesiUnik.size + 2);
    naikkan('standby', H.standby.length, ada.MIN_DI_LAYAR ?? 4);
    // Dua penghitung, bukan satu: yang MENDUDUKI kursi (belum `keluar`) dibatasi
    // KURSI_TOTAL oleh kursiKosong(); peserta yang sudah bubar masih ada di
    // larik beberapa frame sambil berjalan ke pintu, jadi panjang lariknya
    // sah melewati jumlah kursi. Yang pertama menjaga aturan kursi, yang kedua
    // menjaga lariknya tidak menumpuk selamanya.
    let duduk = 0;
    for (const p of H.peserta) if (!p.keluar) duduk++;
    naikkan('peserta (belum bubar)', duduk, ada.KURSI_TOTAL ?? 9);
    naikkan('peserta (larik)', H.peserta.length, 3 * (ada.KURSI_TOTAL ?? 9));
    if (ada.rapatAktif) {
      naikkan('rapatAktif', ada.rapatAktif.length, 4 * (ada.KURSI_TOTAL ?? 9));
      // Entri yang semua anggotanya sudah bubar (termasuk yang lahir tanpa
      // anggota sama sekali waktu kursi penuh) adalah SAMPAH: sedangRapat()
      // ikut berbohong selama ia menyangkut, dan itu menggeser stationFor()
      // untuk TodoWrite/ExitPlanMode/AskUserQuestion ke 'rapat'. Yang
      // membersihkannya sapuRapatKosong(). Ambangnya sengaja rapat — ini
      // penghitung yang membuat hilangnya sapuan langsung ketahuan, bukan
      // panjang rapatAktif yang punya kelonggaran besar.
      let kosong = 0;
      for (const rp of ada.rapatAktif) if (rp.anggota.every((p) => p.keluar)) kosong++;
      naikkan('rapatAktif (sampah)', kosong, 4);
    }
    naikkan('eventHidup', H.eventHidup.length, 6);
    naikkan('cooldownSampai', H.cooldownSampai.size, H.EVENT_ACAK.length);
    if (ada.kabar) naikkan('kabar', ada.kabar.length, ada.KABAR_MAX ?? 60);
    if (ada.parts) naikkan('parts', ada.parts.length, 4000);
    if (ada.pernahHadir) naikkan('pernahHadir', ada.pernahHadir.size, 200);
    if (ada.antrianLaporDiri) naikkan('antrianLaporDiri', ada.antrianLaporDiri.length, 32);
    if (ada.namaPanggilan) naikkan('namaPanggilan', ada.namaPanggilan.size, sesiUnik.size + 4);
    if (ada.izinTunggu) naikkan('izinTunggu', ada.izinTunggu.size, sesiUnik.size + 4);
    if (ada.sesiHalaman) naikkan('sesiHalaman', ada.sesiHalaman.size, sesiUnik.size + 4);
    /* Kursi formasi. Peta ini tidak punya timer penyapu: yang membersihkannya
       cuma sapuan malas di case 'nama' (buang sesi yang orangnya sudah tidak
       ada di `agents`), jadi ia tumbuh SATU entri permanen per sesi yang
       pernah dilantik kalau sapuan itu hilang. Penghitung ini yang akan
       menyadarinya — dan ia menjaga sesuatu hanya karena ekor sintetis
       fixture benar-benar mengisinya (lihat invarian K). */
    if (ada.pegawaiTetap) naikkan('pegawaiTetap', ada.pegawaiTetap.size, sesiUnik.size + 4);

    // (F) larik RUANGAN: ambang eksplisit + detektor naik-monoton.
    //     Tiap checkpoint, bukan tiap frame — nama lariknya dikunci sekali di
    //     awal supaya tidak ada Object.entries() 60 kunci per frame.
    if (nFrame % CHECKPOINT !== 0) return;
    for (const nama of ruanganLarik) {
      const nilai = H.RUANGAN[nama];
      if (!Array.isArray(nilai)) continue;
      const lalu = ruanganPanjangLalu.get(nama);
      if (lalu !== undefined && nilai.length < lalu) ruanganMonoton.set(nama, false);
      else if (!ruanganMonoton.has(nama)) ruanganMonoton.set(nama, true);
      ruanganPanjangLalu.set(nama, nilai.length);
      naikkan('RUANGAN.' + nama, nilai.length, RUANGAN_AMBANG[nama] ?? (RUANGAN_PERMANEN.has(nama) ? 5000 : 50));
    }
  }

  /* ---- pengumpan ---- */
  let eventTerakhirMati = '';
  const setJamDari = (ts) => {
    const d = new Date(ts);
    setJamPalsu(d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600);
  };

  let tsLalu = baris.length ? baris[0].ts : 0;
  setJamDari(tsLalu);
  for (iBaris = 0; iBaris < baris.length; iBaris++) {
    const b = baris[iBaris];
    setJamDari(b.ts);
    const majuMs = Math.min(opsi.jedaMaks, Math.max(0, (b.ts - tsLalu) / opsi.laju));
    tsLalu = b.ts;
    const sasaran = jam.ms + majuMs;
    while (jam.ms + LANGKAH_MS <= sasaran) satuFrame();

    // (J) ATURAN 1 — precondition diukur SEBELUM handle(). Kalau tidak, yang
    //     terhitung cuma "sesudahnya bersih", dan invariannya bisa hijau
    //     selamanya tanpa satu kali pun menguji apa-apa.
    const lewatAwal = LEWAT_LEPAS.has(b.kind);
    let pinjamSebelum = false;
    if (!lewatAwal) {
      const a0 = H.agents.get(b.session);
      pinjamSebelum = !!(a0 && (a0.eventKerja || a0.doingEvent));
    }

    const ev = { ...b, ts: ctx.Date.now() };
    const hidupSebelumHandle = H.eventHidup.map((E) => E.id);
    try {
      ctx.handle(ev);
    } catch (e) {
      catatGagal('A:lemparan-handle', `${konteks()}${sumberGambar()} :: ${e && e.message}`,
        `${b.kind}/${b.tool || '-'} :: ${e && e.message}`);
    }
    if (hidupSebelumHandle.length) eventTerakhirMati = hidupSebelumHandle[hidupSebelumHandle.length - 1];

    // (J) ATURAN 1: tool call selalu menang atas event ambient. Diperiksa pada
    //     SEMUA kind yang melewati lepasDariEvent() di handle(), bukan cuma
    //     'pre': yang tiga itu (session-end/antre/promosi) memang keluar lebih
    //     dulu dari handle() dan tidak pernah menyentuh pemeran event.
    if (!lewatAwal) {
      const a = H.agents.get(b.session);
      /* Terhitung "tersentuh" kalau agennya dipinjam SEBELUM kejadian datang,
         ATAU masih terpinjam sesudahnya. Yang kedua kelihatan mengada-ada
         (itu justru bentuk pelanggarannya), tapi tanpa itu penghitungnya
         berbohong: diukur pada mutasi "buang lepasDariEvent(a) dari handle()",
         invarian ini menemukan 2 pelanggaran sementara penghitungnya tetap
         menulis 0 tersentuh. Sebabnya event lapor-diri-pegawai-baru meminjam
         pegawainya DI DALAM handle() yang sama (session-start), jadi sebelum
         handle() memang belum ada yang dipinjam. Laporan yang menyebut nol
         padahal ada dua pelanggaran lebih buruk daripada tidak menghitung
         sama sekali. */
      if (pinjamSebelum || (a && a.eventKerja)) jUji++;
      if (a && (a.eventKerja != null || a.doingEvent !== '')) {
        catatGagal('J:aturan-1', `${konteks()} :: sesudah ${b.kind}, '${a.id}' masih dipegang event `
          + `(eventKerja=${a.eventKerja && a.eventKerja.id}, doingEvent='${a.doingEvent}')`,
        `${b.kind}/${a.id}/${a.eventKerja && a.eventKerja.id}`);
      }
    }
  }
  // ekor: biarkan ruangan mereda supaya bocor yang muncul belakangan kelihatan
  for (let i = 0; i < FRAME_EKOR; i++) satuFrame();

  /* ---- pemeriksaan akhir ---- */
  // (I) ATURAN 2 secara langsung, tanpa toleransi
  const toolCount = J.ambilToolCount();
  if (toolCount !== preTotal) {
    catatGagal('I:aturan-2', `toolCount ${toolCount} != jumlah baris kind 'pre' di fixture ${preTotal} `
      + `(selisih ${toolCount - preTotal}) — ada yang menaikkan statistik pekerjaan di luar handle('pre')`);
  }
  // (H) jumlah sesi masuk akal
  if (H.agents.size < sesiHidup - 1 || H.agents.size > sesiHidup) {
    catatGagal('H:jumlah-sesi', `agents.size ${H.agents.size} di luar [${sesiHidup - 1}, ${sesiHidup}] `
      + `(sesi unik ${sesiUnik.size}, yang punya session-end ${sesiSelesai.size})`);
  }
  const S = J.ambilS();
  if (S && S.sesi !== H.agents.size) {
    catatGagal('H:jumlah-sesi', `S.sesi ${S.sesi} != agents.size ${H.agents.size}`);
  }

  /* (K) CAKUPAN EKOR SINTETIS — invarian yang menjaga uji ini tetap MENGUJI.
   *
   * Dua jalur halaman (nota pagu, pelantikan pegawai tetap) tidak bisa hadir
   * di hari sungguhan mana pun: server MENOLAK kind 'nama' masuk buku agenda,
   * dan kind 'pagu' belum ada waktu hari fixture ini direkam. Cakupannya
   * datang dari ekor sintetis yang ditempel buat-fixture.mjs.
   *
   * Ekor itu gampang sekali hilang tanpa suara — cukup satu pembangkitan ulang
   * dengan versi buat-fixture.mjs yang tidak punya BARIS_SINTETIS, dan seluruh
   * cakupannya lenyap sementara semua penghitung tetap hijau di angka nol.
   * Persis pola yang jadi sebab invarian ini ditulis. Jadi: kalau fixture
   * BAWAAN diputar penuh, ekornya WAJIB ada dan WAJIB terbukti dieksekusi.
   *
   * Sengaja hanya untuk fixture bawaan & jalan penuh: `--fixture X` dan
   * `--sampai N` itu alat penyelidikan, dan memerahkannya cuma akan membuat
   * orang berhenti memakai keduanya. */
  if (!opsi.sampai && opsi.fixture === FIXTURE) {
    const ekorN = Number(fixture.kepala.sintetis) || 0;
    const ekor = ekorN ? fixture.baris.slice(-ekorN) : [];
    const nPagu = ekor.filter((b) => b.kind === 'pagu').length;
    const sesiTetap = new Set(ekor.filter((b) => b.kind === 'nama' && b.tetap).map((b) => b.session));
    if (!nPagu || !sesiTetap.size) {
      catatGagal('K:cakupan', `ekor sintetis fixture bawaan hilang atau tidak lengkap `
        + `(kepala.sintetis=${ekorN}, baris pagu ${nPagu}, baris nama ber-tetap ${sesiTetap.size}) — `
        + 'terimaPagu() & terimaPerkenalan() jadi tidak teruji sama sekali; '
        + 'bangkitkan ulang fixture dengan buat-fixture.mjs yang punya BARIS_SINTETIS');
    } else if (!ada.pegawaiTetap) {
      catatGagal('K:cakupan', 'pegawaiTetap tidak terbaca dari room.js — kursi formasi tidak terjaga apa pun');
    } else if (ada.pegawaiTetap.size !== sesiTetap.size) {
      catatGagal('K:cakupan', `pegawaiTetap.size ${ada.pegawaiTetap.size} != ${sesiTetap.size} sesi `
        + 'yang dilantik ekor sintetis — kursi formasi bocor, tersapu terlalu rakus, atau tidak pernah terpasang');
    }
    /* Pegawai hantu bernama sesi kosong. Ini sisi lain nota pagu: cabang
       `if (ev.kind === 'pagu')` di handle() WAJIB tetap di ATAS agentFor().
       Kalau ia turun satu baris saja, tiap nota melahirkan satu pegawai
       bersesi '' yang tidak pernah pulang. Invarian H sebenarnya sudah akan
       merah karena hitungannya meleset satu, tapi pesannya berupa aritmetika
       jumlah sesi dan tidak menyebut sebabnya. */
    if (H.agents.has('')) {
      catatGagal('K:cakupan', "agents memuat pegawai bersesi kosong ('') — kejadian milik folder "
        + "(kind 'pagu'/'promosi'/'antre') melahirkan pegawai hantu; cabangnya turun ke bawah agentFor()?");
    }
  }

  // (E) ambang: yang tembus dilaporkan sekali per nama
  for (const [nama, p] of puncak) {
    if (nama === 'console.warn lain') continue;
    if (p.nilai > p.ambang) {
      catatGagal('E:bocor:' + nama, `puncak ${p.nilai} > ambang ${p.ambang} pada frame ${p.frame} (baris #${p.baris})`);
    }
  }
  // (F) dugaan bocor: naik monoton sepanjang hari, tidak pernah turun, > 50
  for (const [nama, monoton] of ruanganMonoton) {
    if (!monoton || RUANGAN_PERMANEN.has(nama)) continue;
    const panjang = ruanganPanjangLalu.get(nama) || 0;
    if (panjang > 50) {
      catatGagal('F:naik-monoton', `RUANGAN.${nama} naik monoton sepanjang hari sampai ${panjang} `
        + 'tanpa pernah turun, dan tidak ada di daftar RUANGAN_PERMANEN');
    }
  }

  if (!gUji) {
    peringatan.push('invarian G (MOD kembali ke bawaan) TIDAK PERNAH TERUJI pada jalan ini: '
      + 'tidak ada satu frame pun tanpa event hidup, jadi tidak ada momen di mana MOD '
      + 'wajib bersih. Turunkan --laju atau jalankan dengan fixture yang lebih panjang.');
  }
  /* Sisi KEJADIAN invarian J (kejadian datang pas agennya sedang dipinjam)
     hampir tidak pernah tersentuh pada jalan bersih: terukur 0-1 kali sehari,
     dan angka yang sama muncul di benih yang jauh berbeda walau 'agen
     dipinjam' berayun empat kali lipat. Selisih antara 1 dan 0 di sana
     KEBETULAN, bukan jaminan — jadi peringatannya menyala di bawah ambang,
     bukan cuma tepat nol. Yang menahan Aturan 1 sepanjang hari adalah sisi
     FRAME (J:pinjam-saat-kerja), yang diperiksa jPinjam kali. */
  if (jUji < J_MIN_TERSENTUH) {
    peringatan.push(`invarian J sisi-kejadian nyaris tidak tersentuh pada jalan ini (${jUji} `
      + `kejadian datang saat agennya sedang dipinjam, ambang wajar ${J_MIN_TERSENTUH}). `
      + `Sisi frame tetap diperiksa ${angka(jPinjam)} kali, jadi Aturan 1 tidak hampa — `
      + 'tapi jangan baca angka kecil di baris "uji Aturan 1 (kejadian)" sebagai bukti. '
      + 'Untuk benar-benar menguji sisi kejadian: --laju 1.');
  }

  return {
    gagal, puncak, peringatan, jPinjam, jUji, gUji, nFrame, iBaris: baris.length,
    barisTotal: baris.length, preTotal, sesiUnik: sesiUnik.size, sesiHidup,
    menitVirtual: jam.ms / 60000, toolCount, frameSampel,
    ruanganMonoton, ruanganPanjangLalu,
  };
}

/* -------------------------------------------------------------- lapor ---- */
function lapor(hasil, opsi, fixture, mulaiMs) {
  const detik = (Date.now() - mulaiMs) / 1000;
  const { gagal, puncak, peringatan } = hasil;

  // temuan yang sudah tercatat DIKETAHUI: tetap dicetak, tidak memerahkan CI
  const diketahuiKena = new Set();
  for (const d of DIKETAHUI) if (gagal.has(d.invarian)) diketahuiKena.add(d.id);
  const gagalNyata = [...gagal.keys()].filter((id) => !DIKETAHUI.some((d) => d.invarian === id));

  console.log(tebal('\nputar ulang hari sungguhan — ' + fixture.kepala.dari));
  console.log(abu(`  fixture ${path.basename(opsi.fixture)} · ${angka(hasil.barisTotal)} baris · `
    + `benih ${opsi.benih} · laju ${opsi.laju}x · jeda-maks ${opsi.jedaMaks} ms`
    + (opsi.longgar ? ' · KANVAS LONGGAR' : ' · kanvas KETAT')));
  console.log(abu(`  ${angka(hasil.nFrame)} frame · ${hasil.menitVirtual.toFixed(1)} menit virtual · `
    + `${detik.toFixed(1)} detik nyata · ${Math.round(hasil.nFrame / Math.max(0.001, detik))} frame/detik`));

  for (const p of peringatan) console.log(kuning('  ! ' + p));

  if (opsi.tampil && hasil.frameSampel) {
    console.log(tebal(`\nurutan gambar frame sampel #${hasil.frameSampel.frame}:`));
    hasil.frameSampel.urutan.forEach((l, i) => console.log(abu(`  ${String(i).padStart(3)}  ${l}`)));
  }

  console.log(tebal('\nPUNCAK TERTINGGI'));
  const nama = [...puncak.keys()].filter((k) => k !== 'console.warn lain').sort();
  // ikut menghitung label tetap di bawah tabel, bukan cuma nama penghitung —
  // kalau tidak, baris 'uji Aturan 1 (kejadian)' menonjol keluar kolom
  const lebar = Math.max(...nama.map((n) => n.length), 23);
  for (const n of nama) {
    const p = puncak.get(n);
    const sisa = p.ambang - p.nilai;
    const warna = sisa < 0 ? merah : sisa <= Math.max(1, p.ambang * 0.1) ? kuning : hijau;
    console.log('  ' + n.padEnd(lebar) + '  ' + String(p.nilai).padStart(6)
      + abu(' / ') + String(p.ambang).padStart(6)
      + '  ' + warna((sisa >= 0 ? 'sisa ' : 'LEWAT ') + Math.abs(sisa))
      + abu(`  (puncak di frame ${p.frame})`));
  }
  console.log('  ' + 'toolCount'.padEnd(lebar) + '  ' + String(hasil.toolCount).padStart(6)
    + abu(' = ') + String(hasil.preTotal).padStart(6) + '  '
    + (hasil.toolCount === hasil.preTotal ? hijau('sama persis (Aturan 2)') : merah('BEDA (Aturan 2)')));
  console.log('  ' + 'agen dipinjam'.padEnd(lebar) + '  ' + String(hasil.jPinjam).padStart(6)
    + abu('        frame-agen jadi pemeran event = berapa kali sisi FRAME invarian J diperiksa'));
  console.log('  ' + 'uji Aturan 1 (kejadian)'.padEnd(lebar) + '  ' + String(hasil.jUji).padStart(6)
    + abu('        kejadian yang datang SAAT agennya masih dipegang event (sisi kejadian J)'));
  console.log('  ' + 'uji MOD bersih'.padEnd(lebar) + '  ' + String(hasil.gUji).padStart(6)
    + abu('        frame tanpa event hidup, yaitu berapa kali invarian G benar-benar diuji'));

  if (diketahuiKena.size) {
    console.log(tebal('\nDIKETAHUI (tidak memerahkan CI, tapi tetap bug nyata)'));
    for (const d of DIKETAHUI) {
      if (!diketahuiKena.has(d.id)) continue;
      console.log(kuning('  ~ ' + d.id) + abu(' [' + d.invarian + ']'));
      for (const k of ((gagal.get(d.invarian) || {}).contoh || []).slice(0, 3)) console.log(kuning('      ' + k));
      console.log(abu('      ' + d.ket.replace(/\s+/g, ' ')));
    }
  }
  // Entri DIKETAHUI yang ternyata sudah tidak terjadi harus DIHAPUS, bukan
  // dibiarkan menua. Cuma diperiksa pada jalan penuh: potongan --sampai wajar
  // saja tidak sampai ke kejadiannya.
  if (!opsi.sampai) {
    for (const d of DIKETAHUI) {
      if (!diketahuiKena.has(d.id)) {
        console.log(kuning(`  ! entri DIKETAHUI '${d.id}' tidak lagi terjadi — hapus dari uji-ulang.mjs`));
      }
    }
  }

  if (!gagalNyata.length) {
    console.log(hijau(`\n✓ ${nama.length} penghitung di bawah ambang, `
      + `${hasil.sesiUnik} sesi, ${angka(hasil.preTotal)} tool call, nol lemparan, nol warn event.`));
    return 0;
  }

  console.log(merah(`\n✗ ${gagalNyata.length} invarian dilanggar:`));
  for (const id of gagalNyata) {
    const g = gagal.get(id);
    // "bentuk" = kejadian yang berbeda menurut kunci dedup; kelima contoh di
    // bawah masing-masing satu bentuk, bukan lima ulangan bentuk yang sama
    console.log(merah('  ' + tebal(id))
      + abu(` (${angka(g.n)} kejadian, ${g.kunci.size}${g.kunci.size >= 500 ? '+' : ''} bentuk)`));
    for (const k of g.contoh) console.log(merah('      ' + k));
    if (g.kunci.size > g.contoh.length) {
      console.log(abu(`      … ${g.kunci.size - g.contoh.length} bentuk lain, ${angka(g.n - g.contoh.length)} kejadian sisanya`));
    }
  }
  console.log(abu(`\n  ulangi dengan: node uji-ulang.mjs --benih ${opsi.benih} --laju ${opsi.laju}`
    + (opsi.sampai ? ` --sampai ${opsi.sampai}` : '') + (opsi.longgar ? ' --longgar' : '')));
  return 1;
}

/* ---------------------------------------------------------------- CLI ---- */
function bacaOpsi(argv) {
  const ambil = (nama, bawaan) => {
    const i = argv.indexOf(nama);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : bawaan;
  };
  return {
    benih: Number(ambil('--benih', BENIH_BAWAAN)) | 0 || BENIH_BAWAAN,
    laju: Math.max(0.01, Number(ambil('--laju', LAJU_BAWAAN))),
    jedaMaks: Math.max(0, Number(ambil('--jeda-maks', JEDA_MAKS_BAWAAN))),
    sampai: Number(ambil('--sampai', 0)) | 0,
    longgar: argv.includes('--longgar'),
    tampil: argv.includes('--tampil'),
    fixture: ambil('--fixture', FIXTURE),
  };
}

function main() {
  const mulaiMs = Date.now();
  const opsi = bacaOpsi(process.argv.slice(2));

  if (!fs.existsSync(opsi.fixture)) {
    console.log(merah('fixture tidak ada: ' + opsi.fixture));
    console.log(abu('bikin ulang: node buat-fixture.mjs --dari <salinan buku agenda>.jsonl'));
    process.exit(1);
  }
  const fixture = muatFixture(opsi.fixture);

  // Sandbox dipasang duluan: verb git untuk pagar privasi diambil dari
  // KEGIATAN_GIT room.js yang asli, bukan disalin ke sini.
  const alat = siapkan(opsi);

  // Privasi diperiksa ULANG tiap kali uji jalan, bukan cuma sekali saat
  // fixture dibuat: kalau ada yang menyunting fixture dengan tangan dan
  // menyelipkan jalur berkas / URL / nama sungguhan, CI yang menemukannya.
  // Daftar verb git untuk pagar privasi datang dari KEGIATAN_GIT room.js yang
  // ASLI. Kalau dia tidak terbaca, pagarnya jadi lebih longgar tanpa suara —
  // jadi ini gerbang keras, bukan peringatan.
  const verbGit = Object.keys(alat.ada.KEGIATAN_GIT || {});
  if (!verbGit.length) {
    console.log(merah('\n✗ KEGIATAN_GIT tidak terbaca dari public/room.js — pagar privasi tidak bisa dipercaya.'));
    console.log(abu('  selaraskan jembatan kedua di uji-ulang.mjs dengan nama const di room.js.'));
    process.exit(1);
  }

  /* PAGARNYA SENDIRI DIUJI DULU, sebelum ia dipakai memeriksa apa pun.
   *
   * Alasannya konkret, bukan kerapian: pagar privasi di buat-fixture.mjs
   * pernah dikembalikan ke bentuk bolongnya yang lama — cabang nama tool yang
   * menerima apa saja — dan `node uji-ulang.mjs` tetap hijau exit 0, karena
   * fixture ter-commit kebetulan bersih dan jalur bersih memang selalu lulus.
   * Seluruh perbaikan privasi bisa lenyap tanpa satu uji pun protes.
   *
   * Jadi tabel kasus racun (kasusPagar() di buat-fixture.mjs) dijalankan di
   * sini, di harness yang MEMANG terdaftar di CI, bukan cuma di mode CLI yang
   * harus diingat orang. Kasusnya dua arah: yang HARUS ditolak dan yang HARUS
   * lolos — tanpa yang kedua, pagar `() => false` lulus dengan gemilang. */
  const pagarMeleset = jalankanPagar(verbGit);
  if (pagarMeleset.length) {
    console.log(merah(`\n✗ PAGAR PRIVASINYA SENDIRI RUSAK: ${pagarMeleset.length} kasus uji meleset`));
    for (const k of pagarMeleset.slice(0, 10)) {
      console.log(merah(`    [${k.pagar}] harus ${k.harusTolak ? 'DITOLAK' : 'LOLOS'} — ${k.nama} :: ${k.ket}`));
    }
    console.log(abu('\n  fixture belum tentu bocor, tapi yang menjaganya sudah tidak bisa dipercaya.'));
    console.log(abu('  tabel lengkapnya: node buat-fixture.mjs --uji-pagar'));
    process.exit(1);
  }

  /* EMPAT pagar, karena tiap pagar cuma melihat sepotong berkas dan potongan
     yang tak terlihat selalu jadi jalur bebas hambatan:
       periksaPrivasi  baris yang sudah dibentangkan;
       periksaKamus    kamus kepala — periksaPrivasi() cuma pernah melihat
                       nilai yang DIRUJUK baris, jadi entri yatim (fixture lama
                       menyimpan 187 label, 5 tool, 2 kind yang tidak ditunjuk
                       baris mana pun) lewat tanpa pernah disentuh;
       periksaKepala   SELURUH kepala di luar kamus — `catatan` itu teks bebas
                       yang ikut ter-commit DAN ikut terkirim ke npm, dan sampai
                       pagar ini ada, apa pun yang ditaruh di sana pulang hijau;
       periksaLarik    baris MENTAH — bentangkan() diam-diam membuang kunci
                       `tambahan` yang tidak dikenalnya, jadi nilai yang
                       diselipkan ke sana tidak pernah sampai ke pagar pertama.
     Gabungan keempatnya: tiap nilai di berkas fixture, di mana pun ia berada,
     punya satu aturan yang menyetujuinya — atau uji ini merah. */
  const langgar = [
    ...periksaPrivasi(fixture.baris, verbGit),
    ...periksaKamus(fixture.kepala.kamus, verbGit),
    ...periksaKepala(fixture.kepala),
    ...periksaLarik(fixture.kepala, fixture.larik),
  ];
  if (langgar.length) {
    console.log(merah(`\n✗ PERIKSA PRIVASI GAGAL: ${langgar.length} nilai di fixture tidak lolos pagar penyamaran`));
    for (const p of langgar.slice(0, 15)) {
      console.log(merah(`    ${p.indeks >= 0 ? 'baris #' + p.indeks + '  ' : ''}${p.jalur} = ${JSON.stringify(p.nilai)}`));
    }
    if (langgar.length > 15) console.log(abu(`    … ${langgar.length - 15} pelanggaran lain`));
    console.log(abu('\n  fixture WAJIB dibuat lewat `node buat-fixture.mjs`, bukan disunting tangan.'));
    process.exit(1);
  }

  const hasil = jalankan(opsi, fixture, alat);
  if (siapkan.pulihkan) siapkan.pulihkan();     // kembalikan Math.random & performance.now
  process.exit(lapor(hasil, opsi, fixture, mulaiMs));
}

main();
