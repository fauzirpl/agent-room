#!/usr/bin/env node
// uji-sisip.mjs :: uji bukaan RUANG KADIS di public/room.js — konstanta
// geometri, urutan gambar di dalam bukaan, dan seluruh invarian Aturan 1 & 2
// yang menempel padanya.
//
// Kenapa berkas sendiri dan bukan menumpang uji-zorder.mjs: golden uji-zorder
// merekam urutan gambar frame() RUANG UTAMA, dan syarat penerimaan pekerjaan
// ini justru "golden itu TIDAK BOLEH bergerak satu baris pun". Menaruh kasus
// ruang kadis di sana berarti menulis ulang goldennya, yang menghapus alat
// buktinya sendiri. Jadi: golden terpisah, uji-sisip.golden.json.
//
// Sama seperti uji-zorder.mjs, berkas ini MEMAKAI muatKonteks/buatSatuOrang/
// buatS dari uji-event.mjs dan TIDAK mengubahnya sama sekali. Konstanta blok
// ruang kadis diambil lewat sisipRujukan() — deklarasi FUNGSI di room.js,
// satu-satunya cara membaca `const` blok itu dari luar vm tanpa menyentuh
// __jembatan__ milik uji-event.mjs.
//
// Pakai:
//   node uji-sisip.mjs              jalankan semua kasus + bandingkan golden urutan gambar
//   node uji-sisip.mjs --perbarui   tulis ulang golden urutan gambar
//   node uji-sisip.mjs --tampil     cetak urutan tiap kasus gambar

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  muatKonteks, buatSatuOrang, buatOrangPalsu, buatE, buatS, buatPristine, resetRuangan,
  merah, hijau, abu, tebal,
} from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(__dirname, 'uji-sisip.golden.json');

let lulus = 0, gagal = 0;
const catatanGagal = [];
function ok(nama, syarat, ket) {
  if (syarat) { lulus++; console.log(hijau('  ✓ ') + nama.padEnd(56) + abu(ket || '')); }
  else { gagal++; catatanGagal.push(nama); console.log(merah('  ✗ ') + nama.padEnd(56) + merah(ket || '')); }
}
function sama(nama, dapat, harap, ket) {
  const cocok = JSON.stringify(dapat) === JSON.stringify(harap);
  ok(nama, cocok, cocok ? ket : `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`);
}

/* ------------------------------------------------------------- konteks --- */
const ctx = muatKonteks();
const H = ctx.__jembatan__;
const pristine = buatPristine(ctx);
ctx.__ctxPalsu.__kendali.ketat = false;      // gambar milik room.js sendiri bukan yang diuji di sini

const WAJIB = ['sisipRujukan', 'gambarSisipKadis', 'tickSisip', 'masukKadis', 'keluarKadis',
  'buatKadis', 'tamuKadis', 'pintuSibuk', 'sisipHidup', 'sisipBoleh', 'sisipSetel',
  'sisipSetelan', 'klipSisip', 'klikSisip', 'sisipBidik', 'drawParts', 'bisaDipinjam',
  'drawKusenSisip', 'drawGordenSisip', 'drawDindingKadis', 'drawKarpetKadis'];
for (const nama of WAJIB) {
  if (typeof ctx[nama] !== 'function') {
    console.log(merah(`fungsi ${nama}() tidak ditemukan di room.js — uji-sisip perlu dibaca ulang`));
    process.exit(1);
  }
}
// Selalu dipanggil ulang: isinya `const`/`let` blok ruang kadis apa adanya,
// termasuk kadisNpc yang bisa dibuat ulang.
const R = () => ctx.sisipRujukan();

const TS = 5000;
function setJam(t) { H.setNow(t); H.setLast(t); }
function bersih() {
  H.agents.clear();
  H.peserta.length = 0;
  H.standby.length = 0;
  H.eventHidup.length = 0;
  H.setTerpilih(null);
  resetRuangan(ctx, pristine);
  buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  setJam(TS);
  const K = R().RUANG_KADIS;
  K.t = 0; K.buka = false; K.kosongSejak = 0; K.zoom = false;
  ctx.sisipSetel('auto');
  R().parts.length = 0;
}

/* Pegawai fixture yang BENAR-BENAR Agent, bukan objek datar: kasus arrive()/
   goTo()/masukKadis perlu method aslinya. `class Agent` di classic script
   TIDAK jadi properti global vm (beda dengan `function`), jadi satu-satunya
   pintu resmi ke konstruktornya adalah jalur yang dipakai halaman: handle()
   dengan event 'pre'. Itu sekaligus menguji jalur sungguhannya. */
let seq = 0;
function agenBaru(sesi, tool) {
  ctx.handle({ id: ++seq, ts: Date.now(), kind: 'pre', session: sesi,
               tool: tool || 'Skill', label: 'uji', ok: true, cwd: 'proyek-uji' });
  return H.agents.get(sesi);
}
// habiskan path lalu panggil arrive() persis seperti update() melakukannya
function tibaDiTujuan(a) {
  while (a.path.length) { const t = a.path.shift(); a.x = t.x; a.y = t.y; }
  a.arrive();
}
const panjangJalur = (p, x0, y0) => {
  let d = 0, x = x0, y = y0;
  for (const t of p) { d += Math.hypot(t.x - x, t.y - y); x = t.x; y = t.y; }
  return d;
};

/* =======================================================================
   1. GEOMETRI — bukaan tidak boleh menabrak prop lama
   ======================================================================= */
console.log(tebal('\nGeometri bukaan'));
{
  const { SISIP: S, SISIP_DALAM: D, KADIS_TITIK: T, SISIP_AMBANG: A } = R();
  /* Batas keras yang diturunkan dari sapuan piksel di bawah (bagian 1b).
     Angka-angka ini BUKAN tebakan: 289 = tepat di kanan garis pilar drawWall
     (96·3), 362 = rangka luar rak PC server, 33 = di bawah AC / wifi-sudut /
     ketupat halal-bihalal, 79 = di atas telepon dinding dan kepala APAR. */
  ok('bukaan di bidang dinding yang benar-benar kosong', S.x >= 290 && S.x + S.w <= 362,
    `x ${S.x}..${S.x + S.w} — garis pilar drawWall di 288, rangka rak server mulai 362`);
  ok('bukaan di bawah AC dan di atas telepon dinding', S.y >= 33 && S.y + S.h <= 79,
    `y ${S.y}..${S.y + S.h} — AC/ketupat berhenti 32, telepon & kepala APAR mulai 79`);
  ok('pintu kadis 440..474 dan plangnya tetap utuh', S.x + S.w <= 440);
  ok('mesin absen 424..433 (ritual pulang) tidak tertutup', S.x + S.w <= 424);
  ok('rak PC server (rangka luar 362..420) tidak tertutup', S.x + S.w <= 362);
  ok('garis pilar samar drawWall di x=288 tidak tertutup', S.x >= 289);
  /* 290, bukan 289: kolom 289 milik ekor 'cicak-jatuh-ke-berkas' selama
     umur 2,93..3,00 dtk (gambarProp: x = 262 + round(umur*7) -> 283, ekor
     r(288, y-1, 2, 2)). Sapuan lama mencuplik umur 0/5/12 dtk, jadi jendela
     ±70 ms itu tidak pernah kena — lihat bagian 1a yang sekarang menyapu
     halus. Batas ini yang menahannya supaya tidak diam-diam kembali. */
  ok('kolom 289 disisakan untuk ekor cicak-jatuh-ke-berkas', S.x >= 290,
    `SISIP.x ${S.x} — ekor cicak berdiri di 288..289 pada umur 2,93..3,00 dtk`);
  ok('kepala APAR tetap bebas walau event mengangkatnya 7 px (y87..100)',
    S.y + S.h <= 87, `ambang bawah ${S.y + S.h}, kepala APAR terangkat mulai y=87`);
  ok('bukaan lebih lapang daripada versi 44x72 yang ditolak pemeriksa',
    S.w * S.h >= 44 * 72 && S.w >= 60,
    `${S.w}x${S.h} = ${S.w * S.h} px (dulu 44x72 = 3168 px, lebar 44)`);
  ok('isi ruangan ada di dalam bingkai',
    D.x >= S.x && D.x + D.w <= S.x + S.w && D.y >= S.y && D.y + D.h <= S.y + S.h);
  ok('isi ruangan cukup lebar untuk tiga tamu berjajar (drawPerson 16 px)',
    D.w >= 3 * 16 + 8, `lebar dalam ${D.w} px`);
  ok('semua KADIS_TITIK y <= 100', T.every((t) => t.y <= 100), T.map((t) => `${t.x},${t.y}`).join(' · '));
  ok('tiga KADIS_TITIK tidak saling menindih (jarak >= 16 px atau beda baris)',
    T.every((t, i) => T.every((u, j) => i === j || Math.abs(t.x - u.x) >= 16 || Math.abs(t.y - u.y) >= 3)),
    T.map((t) => `${t.x},${t.y}`).join(' · '));
  ok('semua KADIS_TITIK ada di dalam SISIP_DALAM',
    T.every((t) => t.x > D.x && t.x < D.x + D.w && t.y > D.y && t.y < D.y + D.h));
  ok('ambang dalam ada di dalam SISIP_DALAM', A.x > D.x && A.x < D.x + D.w && A.y < D.y + D.h);
  // yang sebenarnya dijaga oleh "y <= 100": kotak klik agenDiTitik()
  ok('kotak klik tamu tidak beririsan dengan pegawai stasiun dinding (y 138..141)',
    T.every((t) => t.y + 5 < 138 - 30),
    'agenDiTitik: cy dalam [a.y-30, a.y+5]; stasiun dinding memberi 108..146');
  sama('STATIONS.agent dibatasi slot & langkahnya',
    [H.STATIONS.agent.slots, H.STATIONS.agent.step], [3, 12],
    'tanpa ini slotBebas() memakai bawaan 12 langkah 19 px, antreannya menjulur ke rak server');
  const s = H.STATIONS.agent;
  const slotX = [0, 1, 2].map((k) => s.x + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * s.step));
  ok('ketiga slot stasiun agent lolos saringan tepi slotBebas (16..464)',
    slotX.every((x) => x >= 16 && x <= 480 - 16), slotX.join(' · '));
}

/* =======================================================================
   1a. SAPUAN PROP LAMA — piksel mana yang HILANG gara-gara bukaan
   -----------------------------------------------------------------------
   Uji versi pertama cuma membuktikan "bukaan tidak meluber KELUAR kotaknya",
   dan itu kebalikan dari yang dibutuhkan: gambarSisipKadis() dipanggil
   SESUDAH loop layers di frame(), jadi apa pun milik prop lama yang kebetulan
   berada DI DALAM kotak SISIP akan tertimpa. Yang harus diuji karena itu:
   adakah prop lama yang menggambar di dalam kotak SISIP. Sapuan di bawah
   menjalankan seluruh perabot permanen (drawWall + tabel PROPS) DAN seluruh
   gambarProp/gambarDinding/gambarLantai/gambarAtas milik registri event, lalu
   mencatat tiap fillRect/strokeRect/fillText yang mendarat di kotak itu.
   ======================================================================= */
console.log(tebal('\nSapuan prop lama (nol yang tertutup bukaan)'));
{
  bersih();
  const S = R().SISIP;
  const RANCANGAN = { x: 284, y: 22, w: 154, h: 94 };   // kotak rancangan awal
  const iris = (K, x, y, w, h) => [x, y, w, h].every(Number.isFinite)
    && x < K.x + K.w && x + w > K.x && y < K.y + K.h && y + h > K.y;
  // Direkam sekali dengan kotak yang LEBIH LUAS (kotak rancangan memuat kotak
  // SISIP seluruhnya), lalu disaring dua kali: sekali untuk SISIP yang benar-
  // benar dipakai, sekali sebagai kontrol negatif untuk kotak rancangan.
  const temuanLuas = new Map();
  const cp = ctx.__ctxPalsu;
  let sedang = null, lewatiGrad = false;
  const cap = (x, y, w, h) => {
    if (!sedang) return;
    // glow() = fillRect radial gradient selebar 2r: cahaya lembut, bukan prop
    if (lewatiGrad) { lewatiGrad = false; return; }
    if (Math.abs(w) > 400 || Math.abs(h) > 300) return;     // isian dinding/lantai penuh
    if (!iris(RANCANGAN, x, y, w, h)) return;
    if (!temuanLuas.has(sedang)) temuanLuas.set(sedang, []);
    const a = temuanLuas.get(sedang);
    if (a.length < 40) a.push(`${x},${y},${w},${h}`);
  };
  const asli = {};
  for (const m of ['fillRect', 'strokeRect']) {
    asli[m] = cp[m];
    cp[m] = function (x, y, w, h, ...s) { cap(x, y, w, h); return asli[m].apply(this, [x, y, w, h, ...s]); };
  }
  asli.fillText = cp.fillText;
  cp.fillText = function (t, x, y, ...s) { cap(x, y - 5, String(t).length * 4 + 2, 8); return asli.fillText.apply(this, [t, x, y, ...s]); };
  for (const m of ['createRadialGradient', 'createLinearGradient']) {
    if (typeof cp[m] !== 'function') continue;
    asli[m] = cp[m];
    cp[m] = function (...s) { lewatiGrad = true; return asli[m].apply(this, s); };
  }

  const S2 = buatS(ctx, { jam: 10, hujan: false, petir: false, ramai: 3 });
  S2.orang = buatOrangPalsu(ctx, 6, 2);
  let nProp = 0, nLapis = 0;
  for (const nama of ['drawWall', 'drawFloor']) {
    if (typeof ctx[nama] !== 'function') continue;
    sedang = nama;
    try { ctx[nama](); } catch { /* prop lama boleh rewel, yang dicatat cuma gambarnya */ }
  }
  // dekor tema dinding: keempatnya, bukan cuma yang kebetulan berlaku hari ini
  for (const tema of [null, 'agustusan', 'ramadan', 'korpri', 'tahun-anggaran']) {
    ctx.RUANGAN.tema = tema; ctx.RUANGAN.temaTahun = 2026;
    sedang = 'gambarTemaDinding:' + String(tema);
    for (const jam of [8, 13, 19]) {
      try { H.setNow(jam * 3600000); } catch { /* idem */ }
      try { ctx.gambarTemaDinding(); } catch { /* idem */ }
      try { ctx.drawWall(); } catch { /* idem */ }
    }
  }
  setJam(TS);
  resetRuangan(ctx, pristine);
  for (const p of H.PROPS) {
    const nama = 'PROPS:' + ((p.draw && p.draw.name) || '(anon)');
    for (const aktif of [false, true]) { sedang = nama; try { p.draw(aktif); } catch { /* idem */ } }
  }
  /* UMUR DICUPLIK HALUS, dan itu bukan kemewahan. Sapuan versi pertama
     mencuplik umur 0/5/12 dtk saja, dan justru cuplikan itulah yang
     melewatkan satu temuan sungguhan: ekor 'cicak-jatuh-ke-berkas' cuma
     berdiri di kolom 289 selama umur 2,93..3,00 dtk (±70 ms). Prop event
     BERGERAK — hampir semuanya menghitung x dari E.umur — jadi tiga
     cuplikan sama saja dengan tidak menyapu. 0..14 dtk tiap 0,02 dtk =
     701 cuplikan per hook; seluruh sapuan tetap di bawah 2 detik.

     gambarAtas SENGAJA TIDAK IKUT: frame() memanggilnya SESUDAH
     gambarSisipKadis() (room.js: gambarSisipKadis() lalu
     gambarLapis('gambarAtas')), jadi lapisan itu menimpa bukaan, bukan
     ditimpa. Dua sapuan cahaya yang lewat dinding — sapuan-lampu-mobil-
     malam dan sirene-lewat-jalan-depan — memang melintasi kotak SISIP tiap
     kali jalan, dan itu memang yang diinginkan: cahaya jalanan jatuh di
     kaca bukaan juga. Memasukkannya ke sini cuma akan bikin uji ini
     berteriak untuk hal yang benar. */
  const UMUR = [];
  for (let u = 0; u <= 14.0001; u += 0.02) UMUR.push(Math.round(u * 100) / 100);
  for (const def of H.EVENT_ACAK) {
    // gambarProp + dua lapis yang digambar SEBELUM bukaan; gambarAtas tidak.
    for (const hook of ['gambarProp', 'gambarDinding', 'gambarLantai']) {
      if (typeof def[hook] !== 'function') continue;
      if (hook === 'gambarProp') nProp++; else nLapis++;
      resetRuangan(ctx, pristine);
      const E = buatE(def);
      sedang = hook + ':' + def.id;
      const durasi = Number(def.durasi) > 0 ? Number(def.durasi) : 10;
      for (const umur of UMUR) {
        E.umur = umur; E.t = Math.min(1, umur / durasi);
        try { def[hook](E, S2); } catch { /* idem */ }
      }
    }
  }
  // APAR yang sedang DIANGKAT event disposisi (public/event/03-*.js menaruh
  // RUANGAN.aparAngkat = 7): kepalanya naik 7 px, dan justru keadaan itulah
  // yang dulu kehilangan 102 dari 236 piksel.
  resetRuangan(ctx, pristine);
  for (const angkat of [0, 7]) {
    ctx.RUANGAN.aparAngkat = angkat;
    sedang = 'drawServer(aparAngkat=' + angkat + ')';
    try { ctx.drawServer(true); } catch { /* idem */ }
  }
  ctx.RUANGAN.aparAngkat = 0;
  sedang = null;
  for (const m of Object.keys(asli)) cp[m] = asli[m];
  resetRuangan(ctx, pristine);

  const kenaKotak = (K) => [...temuanLuas.entries()].filter(([, v]) => v.some((b) => {
    const [x, y, w, h] = b.split(',').map(Number);
    return iris(K, x, y, w, h);
  }));
  const daftar = kenaKotak(S);
  ok('NOL perabot lama yang piksel-nya tertimpa kotak SISIP',
    daftar.length === 0,
    daftar.length
      ? daftar.map(([n, v]) => n + ' [' + v.join(' | ') + ']').join('  ·  ')
      : `disapu: drawWall + ${H.PROPS.length} PROPS + ${nProp} gambarProp + ${nLapis} hook lapis`
        + `, tiap-tiap ${UMUR.length} cuplikan umur (0..14 dtk / 0,02)`);
  ok('sapuannya benar-benar berjalan (bukan nol karena tidak ada yang disapu)',
    nProp > 50 && nLapis > 15 && UMUR.length > 500,
    `${nProp} gambarProp, ${nLapis} hook lapis, ${UMUR.length} cuplikan umur`);
  // Kontrol negatif: kalau sapuan yang SAMA tidak menemukan apa pun di kotak
  // rancangan awal, berarti sapuannya rusak dan hasil di atas tidak berarti.
  // Sekaligus bukti terekam kenapa 154x94 di x284..438 ditolak.
  const bentrokRancangan = kenaKotak(RANCANGAN);
  ok('kontrol: kotak rancangan awal 284,22,154,94 memang mustahil',
    bentrokRancangan.length >= 6,
    bentrokRancangan.length + ' sumber bentrok, a.l. '
      + bentrokRancangan.slice(0, 5).map(([n]) => n).join(', '));
}

/* =======================================================================
   1b. NOL PIKSEL KELUAR KOTAK — bukti bahwa bukaan tidak menodai prop lain
   ======================================================================= */
console.log(tebal('\nBatas gambar'));
{
  bersih();
  ctx.buatKadis();
  const { SISIP: S, SISIP_DALAM: D, RUANG_KADIS: K } = R();
  const kotak = [];
  const clip = [];
  const cp = ctx.__ctxPalsu;
  const fillRectAsli = cp.fillRect, fillTextAsli = cp.fillText, rectAsli = cp.rect;
  cp.fillRect = function (x, y, w, h) { kotak.push([x, y, w, h]); return fillRectAsli.apply(this, arguments); };
  // kotak taksiran untuk teks: font 5 px Courier dengan textBaseline 'middle'
  // memberi glyph kira-kira y-3..y+2 dan lebar ±3 px per huruf
  cp.fillText = function (t, x, y) { kotak.push([x, y - 3, String(t).length * 3.2, 5]); return fillTextAsli.apply(this, arguments); };
  cp.rect = function (x, y, w, h) { clip.push([x, y, w, h]); return rectAsli.apply(this, arguments); };
  K.t = 0;
  kotak.length = 0;
  ctx.gambarSisipKadis();                // keadaan tertutup: kusen + gorden, tanpa klip
  const keluar = kotak.filter(([x, y, w, h]) =>
    x < S.x || y < S.y || x + w > S.x + S.w || y + h > S.y + S.h);
  ok('keadaan tertutup: NOL piksel digambar di luar kotak SISIP',
    keluar.length === 0,
    keluar.length ? 'keluar: ' + JSON.stringify(keluar.slice(0, 6)) : kotak.length + ' gambar, semua di dalam');
  K.t = 1;
  clip.length = 0;
  ctx.gambarSisipKadis();                // keadaan terbuka: isinya dikurung klip
  const klipLuar = clip.filter(([x, y, w, h]) =>
    x < D.x || y < D.y || x + w > D.x + D.w || y + h > D.y + D.h);
  ok('keadaan terbuka: klip isi ruangan tidak pernah keluar SISIP_DALAM',
    clip.length > 0 && klipLuar.length === 0,
    clip.length ? JSON.stringify(clip[0]) : 'klip tidak pernah dipasang');
  cp.fillRect = fillRectAsli; cp.fillText = fillTextAsli; cp.rect = rectAsli;
}

/* =======================================================================
   2. KADIS NPC
   ======================================================================= */
console.log(tebal('\nKadis NPC'));
{
  bersih();
  const k = ctx.buatKadis();
  ok('kadisNpc.pal === jabatanDari("kadis").pal (rujukan, bukan salinan)',
    k.pal === H.jabatanDari('kadis').pal,
    'kalau disalin, dia tidak ikut terapkanSeragamHarian()');
  ctx.terapkanSeragamHarian();
  const hari = new Date().getDay();
  const seragamHari = hari === 3 || hari === 5 ? 'batik' : 'putih';
  ok('ikut terapkanSeragamHarian()', k.pal.main === H.jabatanDari('kadis').pal.main,
    `hari ${hari} (${seragamHari}) — main ${k.pal.main}, pattern ${String(k.pal.pattern)}`);
  // bukti langsung: terapkanSeragamHarian() menulis ke pal DI TEMPAT, jadi
  // seragam kadis NPC ikut berganti tanpa dibuat ulang
  {
    const asli = H.jabatanDari('kadis').pal.main;
    H.jabatanDari('kadis').pal.main = '#ffffff';
    ok('ganti seragam di tabel jabatan langsung terlihat di kadisNpc', k.pal.main === '#ffffff');
    H.jabatanDari('kadis').pal.main = asli;
  }
  ok('bukan penghuni(): tidak masuk agents/peserta/standby', ![...ctx.penghuni()].includes(k));
  ok('station-nya bukan kunci STATIONS mana pun (slotBebas tidak menghitungnya)',
    !H.STATIONS[k.station], k.station);
  // pinjamAktor() menyaring dari S.orang, yang diisi potretRuangan() dari
  // penghuni(): karena dia bukan penghuni, event acak tidak akan pernah
  // menyeretnya ke pantry — itulah gunanya dia disimpan di luar
  const E = { def: { id: 'uji-pinjam' }, id: 'uji-pinjam', umur: 0, sisa: 10, data: {}, aktor: [], tanda: new Set() };
  ok('pinjamAktor() tidak pernah mengembalikannya', !ctx.pinjamAktor(E, 8).includes(k));
  let lempar = null;
  try { ctx.drawPerson(k); } catch (e) { lempar = e; }
  ok('bentuk objek kadisNpc lolos drawPerson() tanpa melempar', !lempar,
    lempar ? String(lempar.message) : '');
  const potret = ctx.potretRuangan();
  ok('tidak muncul di potretRuangan().orang', !(potret.orang || []).includes(k));
  ok('tidak muncul di potretRuangan().nganggur', !(potret.nganggur || []).includes(k));
  sama('buatKadis() tidak menambah sesi/peserta/standby',
    [H.agents.size, H.peserta.length, H.standby.length], [0, 0, 0]);
}

/* =======================================================================
   3. MASUK / KELUAR — Aturan 1 & Aturan 2
   ======================================================================= */
console.log(tebal('\nMasuk & keluar bukaan (Aturan 1 & 2)'));
{
  bersih();
  const { SISIP_DALAM: D, LANE_UP } = R();
  const a = agenBaru('uji-a', 'Skill');
  sama('tool Skill memetakan ke stasiun agent', a.station, 'agent');
  const jejak = { station: a.station, doing: a.doing, busyUntil: a.busyUntil,
                  calls: a.calls, perStasiun: JSON.stringify(a.perStasiun) };
  tibaDiTujuan(a);                       // arrive() DI AMBANG PINTU
  ok('arrive() di ambang tidak mengubah station/doing/busyUntil',
    a.station === jejak.station && a.doing === jejak.doing && a.busyUntil === jejak.busyUntil);
  ok('arrive() tidak menyentuh statistik (calls / perStasiun) — Aturan 2',
    a.calls === jejak.calls && JSON.stringify(a.perStasiun) === jejak.perStasiun);
  sama('state-nya jadi "work" tepat di ambang, seperti dulu', a.state, 'work');
  ok('belum diKadis: memudar di ambang dulu', a.diKadis === false && a.sisipFase === 'pudar');
  sama('posisinya masih ambang pintu', [Math.round(a.x), Math.round(a.y)], [452, 140]);
  sama('pintuSibuk() menghitungnya tanpa memindahkan siapa pun',
    [ctx.pintuSibuk(), ctx.tamuKadis()], [1, 0]);

  setJam(TS + 400);
  ctx.tickSisip(0.4);
  ok('sesudah memudar: benar-benar di dalam bukaan', a.diKadis === true);
  ok('koordinatnya koordinat DUNIA di dalam bukaan',
    a.x > D.x && a.x < D.x + D.w && a.y > D.y && a.y < D.y + D.h, `${a.x},${a.y}`);
  ok('station/doing/busyUntil tetap tidak berubah sesudah masuk',
    a.station === jejak.station && a.doing === jejak.doing && a.busyUntil === jejak.busyUntil);
  ok('bisaDipinjam(a) === false selagi di dalam (event tidak menyeretnya menembus dinding)',
    ctx.bisaDipinjam(a) === false);

  // jalan lurus ke kursi tamu lalu arrive() KEDUA — murni kosmetik
  const busySebelum = a.busyUntil, tibaSebelum = a.arrivedAt;
  a.adaTugas = true;                     // kondisi paling rawan: arrive() biasanya menambah 1,8 s
  tibaDiTujuan(a);
  sama('arrive() DI DALAM bukaan tidak memperpanjang busyUntil', a.busyUntil, busySebelum);
  sama('arrive() di dalam bukaan tidak menggeser arrivedAt', a.arrivedAt, tibaSebelum);
  sama('tamunya menghadap kadis', a.face, 'up');
  a.adaTugas = false;

  const posisi = [a.x, a.y];
  a.goTo('agent');
  sama('goTo("agent") saat sudah diKadis TIDAK memindahkan orangnya', [a.x, a.y], posisi);
  ok('dan dia tetap di dalam bukaan', a.diKadis === true);

  a.goTo('read');
  ok('goTo("read") mengeluarkannya dari bukaan', a.diKadis === false);
  sama('berangkat dari ambang pintu, bukan dari dalam bukaan',
    [Math.round(a.x), Math.round(a.y)], [452, LANE_UP]);
  ok('path-nya sudah terisi di frame yang sama (nol milidetik penundaan)', a.path.length > 0);
  ok('alpha dipulihkan SAMBIL jalan, bukan menahan langkah', a.alpha > 0 && a.alpha < 1);
  ok('bisaDipinjam kembali seperti semula sesudah keluar',
    ctx.bisaDipinjam(a) === (!a.eventKerja && !a.adaTugas && a.state !== 'work'
      && a.station !== 'keluar' && !a.keluar));

  // Bandingkan dengan route() yang dihitung LANGSUNG dari ambang pintu ke
  // tujuan yang sama: kalau keluarnya benar-benar potongan (bukan jalan balik
  // menyeberang ruangan), kedua lintasan itu harus identik panjangnya.
  const tujuanA = a.path[a.path.length - 1];
  const kontrol = ctx.route(452, LANE_UP, LANE_UP, tujuanA.x, tujuanA.y, LANE_UP);
  const dA = panjangJalur(a.path, 452, LANE_UP), dB = panjangJalur(kontrol, 452, LANE_UP);
  ok('lintasan keluarnya sama panjang dengan route() dari ambang pintu',
    Math.abs(dA - dB) < 0.5, `${dA.toFixed(1)} px vs ${dB.toFixed(1)} px`);
}
{
  // goToXY (jalur event) juga wajib mengeluarkannya lebih dulu
  bersih();
  const a = agenBaru('xy-a', 'Skill');
  tibaDiTujuan(a);
  setJam(TS + 400);
  ctx.tickSisip(0.4);
  ok('siap: dia di dalam bukaan', a.diKadis === true);
  a.goToXY(120, R().LANE_DOWN, 'down');
  ok('goToXY() mengeluarkannya lebih dulu', a.diKadis === false && a.path.length > 0);
  // pulangKantor juga
  bersih();
  const c = agenBaru('pulang-a', 'Skill');
  tibaDiTujuan(c);
  setJam(TS + 400);
  ctx.tickSisip(0.4);
  ok('siap: dia di dalam bukaan', c.diKadis === true);
  c.pulangKantor();
  ok('pulangKantor() mengeluarkannya lebih dulu', c.diKadis === false);
  ok('dan ritual pulangnya berangkat dari ambang pintu', c.pulang !== '' && c.path.length > 0);
}

/* =======================================================================
   4. ANTREAN — tamu keempat tetap di ruang utama
   ======================================================================= */
console.log(tebal('\nAntrean stasiun agent'));
{
  bersih();
  const { KADIS_TITIK: T, LANE_UP } = R();
  const org = [];
  for (let i = 0; i < 4; i++) {
    const a = agenBaru('antre-' + i, 'Skill');
    tibaDiTujuan(a);
    org.push(a);
  }
  setJam(TS + 400);
  ctx.tickSisip(0.4);
  const dalam = org.filter((a) => a.diKadis);
  const luar = org.filter((a) => !a.diKadis);
  sama('tiga tamu masuk, satu tetap di ruang utama', [dalam.length, luar.length], [3, 1]);
  ok('yang keempat MENGANTRE, bukan menumpuk di luar dinding', luar[0].antre >= 1,
    'antre=' + luar[0].antre);
  const tujuan = luar[0].path.length ? luar[0].path[luar[0].path.length - 1] : { x: luar[0].x, y: luar[0].y };
  sama('yang keempat berbaris di lajur atas ruang utama', Math.round(tujuan.y), LANE_UP);
  ok('dan titik antrenya masih di dalam kanvas', tujuan.x >= 14 && tujuan.x <= 468, 'x=' + tujuan.x);
  sama('ketiganya memakai slot berbeda, termasuk slot ketiga',
    dalam.map((a) => a.slotIdx).sort(), [0, 1, 2]);
  const titik = dalam.map((a) => {
    const t = a.path.length ? a.path[a.path.length - 1] : a;
    return `${Math.round(t.x)},${Math.round(t.y)}`;
  }).sort();
  sama('ketiganya menuju tiga KADIS_TITIK yang berbeda', titik,
    T.map((t) => `${t.x},${t.y}`).sort());
}

/* =======================================================================
   5. SETELAN 'mati' & penjaga
   ======================================================================= */
console.log(tebal('\nSetelan mati & penjaga'));
{
  bersih();
  const { LANE_UP } = R();
  ctx.sisipSetel('mati');
  ok('sisipBoleh() false', ctx.sisipBoleh() === false);
  const a = agenBaru('mati-a', 'Skill');
  tibaDiTujuan(a);
  setJam(TS + 400);
  ctx.tickSisip(0.4);
  ok('tidak ada yang dipindah ke dalam bukaan', a.diKadis === false && !a.sisipFase);
  sama('dia berdiri di ambang pintu persis seperti sebelum fitur ini ada',
    [Math.round(a.x), Math.round(a.y)], [452, 140]);
  sama('gorden tidak pernah menyibak', R().RUANG_KADIS.t, 0);
  sama('alpha-nya utuh', a.alpha, 1);

  ctx.sisipSetel('auto');
  tibaDiTujuan(a);
  setJam(TS + 900);
  ctx.tickSisip(0.4);
  ok('kembali ke "auto": dia masuk lagi', a.diKadis === true);
  ctx.sisipSetel('mati');
  ok('memilih "mati" mengeluarkan yang sedang di dalam', a.diKadis === false);
  // tahan 6 detik itu untuk rentetan tool call, BUKAN untuk setelan:
  // memilih 'mati' harus menutup bukaannya sekarang juga
  ctx.tickSisip(0.4);
  sama('memilih "mati" menutup bukaan SEKARANG, tidak menunggu tahan 6 detik', R().RUANG_KADIS.t, 0);
  sama('dan mengembalikannya ke ambang pintu',
    [Math.round(a.x), Math.round(a.y)], [452, LANE_UP]);
  /* Dikeluarkan saja TIDAK CUKUP. keluarKadis() menaruhnya di lajur dengan
     path kosong, dan handle() cuma memanggil goTo saat STASIUNNYA berganti —
     rentetan tool call mcp__ berikutnya tidak akan memindahkannya. Kalau dia
     tidak disuruh berbaris ulang, dia mematung di tengah lajur. */
  ok('dan menyuruhnya berbaris ulang ke ambang pintu, bukan ditelantarkan di lajur',
    a.path.length > 0 || Math.round(a.y) === 140,
    a.path.length ? 'path ' + a.path.length + ' titik' : 'sudah di ambang');
  const akhir = a.path.length ? a.path[a.path.length - 1] : { x: a.x, y: a.y };
  sama('tujuan barisannya persis titik stasiun agent', Math.round(akhir.y), 140);
  ctx.sisipSetel('auto');
}
{
  /* "Setel 'mati': ruangan harus identik dengan hari ini" — bukan bukaan
     tertutup, melainkan TIDAK ADA BUKAAN. Kalau bingkai + gorden tetap
     terlukis, dinding itu berubah permanen dan setelannya bohong. */
  bersih();
  const cp = ctx.__ctxPalsu;
  const hitung = () => {
    let n = 0;
    const nama = ['fillRect', 'strokeRect', 'fillText', 'drawImage', 'fill', 'stroke', 'rect'];
    const asli = {};
    for (const m of nama) {
      if (typeof cp[m] !== 'function') continue;
      asli[m] = cp[m];
      cp[m] = function (...s) { n++; return asli[m].apply(this, s); };
    }
    ctx.gambarSisipKadis();
    for (const m of Object.keys(asli)) cp[m] = asli[m];
    return n;
  };
  ctx.sisipSetel('auto');
  R().RUANG_KADIS.t = 0;
  const tertutup = hitung();
  ok('setelan "auto" saat tertutup memang melukis bingkai + gorden', tertutup > 0,
    tertutup + ' panggilan gambar/frame');
  ctx.sisipSetel('mati');
  const mati = hitung();
  sama('setelan "mati": NOL panggilan gambar — dindingnya persis seperti hari ini', mati, 0);
  R().RUANG_KADIS.t = 1;                 // walau keadaan internalnya terlanjur terbuka
  sama('bahkan kalau RUANG_KADIS.t terlanjur 1, "mati" tetap nol gambar', hitung(), 0);
  ok('klik pada dinding itu pun tidak menyalakan apa-apa saat "mati"',
    ctx.klikSisip(R().SISIP.x + 5, R().SISIP.y + 5) === false);
  ctx.sisipSetel('auto');
  R().RUANG_KADIS.t = 0;
}
{
  /* Klik pada bukaan yang sedang TERTUTUP harus memberi umpan balik: zoom ke
     gorden tertutup itu umpan balik yang mati, dan tickSisip melepas zoomnya
     di ketukan berikutnya (`if (!R.buka && R.t === 0) R.zoom = false`). */
  bersih();
  const { SISIP: S, RUANG_KADIS: K, SISIP_TAHAN_MS } = R();
  sama('siap: ruangan kosong dan bukaan tertutup', [ctx.tamuKadis(), K.t], [0, 0]);
  ok('klik menyalakan zoom', ctx.klikSisip(S.x + 5, S.y + 5) === true && K.zoom === true);
  ok('dan MENYIBAK gordennya walau tidak ada tamu', ctx.sisipHidup() === true);
  ctx.tickSisip(0.4);
  ok('gordennya benar-benar bergerak membuka', K.t > 0, 't=' + K.t.toFixed(2));
  ctx.tickSisip(0.4);
  ok('zoomnya TIDAK dilepas lagi di ketukan berikutnya', K.zoom === true);
  // paksaan sibak habis, lalu tahan-6-detik biasa mulai dihitung dari ketukan
  // pertama yang melihat ruangan kosong
  setJam(TS + SISIP_TAHAN_MS + 500);
  ctx.tickSisip(0.4);
  sama('paksaan habis: hitungan kosong baru dimulai di sini', K.kosongSejak, TS + SISIP_TAHAN_MS + 500);
  setJam(TS + 2 * SISIP_TAHAN_MS + 1000);
  ctx.tickSisip(0.4);
  ctx.tickSisip(0.4);
  sama('sesudah tahan habis, bukaannya menutup sendiri lagi', K.t, 0);
  ok('dan zoomnya ikut lepas', K.zoom === false);

  bersih();
  ok('klik kedua (mematikan zoom) melepas paksaan sibaknya',
    ctx.klikSisip(S.x + 5, S.y + 5) === true && K.zoom === true
      && ctx.klikSisip(S.x + 5, S.y + 5) === true && K.zoom === false
      && K.paksaSampai === 0);
}

/* =======================================================================
   6. PARTIKEL — cap p.sisip tidak bocor ke lintasan pertama
   ======================================================================= */
console.log(tebal('\nPartikel'));
{
  bersih();
  const K = R().RUANG_KADIS;
  // 'step' menaruh partikelnya di x persis (tanpa sebaran acak), jadi
  // x-nya bisa dipakai sebagai penanda di mata-mata fillRect
  ctx.spawn('step', 100, 200);
  const p2 = ctx.spawn('step', 340, 90);
  p2.sisip = true;
  const digambar = [];
  const asli = ctx.__ctxPalsu.fillRect;
  ctx.__ctxPalsu.fillRect = function (x, ...sisa) { digambar.push(Math.round(x)); return asli.call(this, x, ...sisa); };
  K.t = 0;                               // bukaan tertutup: klipSisip() langsung return
  digambar.length = 0;
  ctx.drawParts();
  ok('lintasan pertama melewatkan partikel bercap p.sisip',
    digambar.includes(100) && !digambar.includes(340), digambar.join(','));
  K.t = 1;                               // bukaan terbuka: lintasan kedua menggambarnya di dalam klip
  digambar.length = 0;
  ctx.drawParts();
  ok('lintasan kedua menggambarnya saat bukaan terbuka',
    digambar.includes(100) && digambar.includes(340), digambar.join(','));
  ctx.__ctxPalsu.fillRect = asli;
}

/* =======================================================================
   7. GORDEN, TAHAN, DAN ZOOM
   ======================================================================= */
console.log(tebal('\nGorden, tahan, dan zoom'));
{
  bersih();
  const { SISIP: S, SISIP_ZOOM, SISIP_TAHAN_MS, RUANG_KADIS: K, KAMERA, LANE_UP } = R();
  sama('mulai tertutup', K.t, 0);
  const a = agenBaru('gorden-a', 'Skill');
  tibaDiTujuan(a);
  setJam(TS + 100);
  ctx.tickSisip(0.1);
  ok('menyibak begitu ada yang berhenti di ambang pintu', K.t > 0, 't=' + K.t.toFixed(2));
  setJam(TS + 900);
  ctx.tickSisip(0.4);
  sama('terbuka penuh', K.t, 1);
  a.goTo('read');
  a.path = []; a.x = 54; a.y = LANE_UP;
  const kosong = TS + 4000;
  setJam(kosong);
  ctx.tickSisip(0.05);                   // ketukan pertama yang melihat ruangan kosong
  sama('kosongSejak dipasang di ketukan pertama yang kosong', K.kosongSejak, kosong);
  setJam(kosong + SISIP_TAHAN_MS - 1000);
  ctx.tickSisip(0.05);
  sama('masih terbuka 5 detik sesudah kosong (tahan 6 detik)', K.t, 1);
  setJam(kosong + SISIP_TAHAN_MS + 100);
  ctx.tickSisip(0.05);
  ctx.tickSisip(0.4);
  sama('menutup sesudah SISIP_TAHAN_MS', K.t, 0);

  K.t = 1;
  ok('klik di luar kotak bukaan tidak menyalakan zoom', ctx.klikSisip(10, 10) === false);
  ok('klik di dalam kotak bukaan menyalakan zoom',
    ctx.klikSisip(S.x + 5, S.y + 5) === true && K.zoom === true);
  ctx.kameraBidik();
  sama('bidikan dikunci ke pusat bukaan',
    [KAMERA.targetX, KAMERA.targetY, KAMERA.targetZoom],
    [S.x + S.w / 2, S.y + S.h / 2, SISIP_ZOOM]);
  const hw = 480 / (2 * SISIP_ZOOM), hh = 356 / (2 * SISIP_ZOOM);
  ok('pusat bidikan tidak menabrak penjepitan tickKamera',
    KAMERA.targetX >= hw && KAMERA.targetX <= 480 - hw
    && KAMERA.targetY >= hh && KAMERA.targetY <= 356 - hh,
    `hw ${hw} · hh ${hh.toFixed(1)}`);
  ok('bidikan zoom itu benar-benar memuat seluruh tinggi bukaan', 356 / SISIP_ZOOM >= S.h,
    `${(356 / SISIP_ZOOM).toFixed(0)} px >= ${S.h} px`);
  ok('klik lagi mematikan zoom',
    ctx.klikSisip(S.x + 5, S.y + 5) === true && K.zoom === false);
  K.zoom = true; K.t = 0; K.buka = false;
  ctx.tickSisip(0.1);
  ok('bukaan tertutup melepas zoom sendiri', K.zoom === false);
}

/* =======================================================================
   7b. GERBANG frame() — `if (a.diKadis) continue;` di loop layers
   -----------------------------------------------------------------------
   Ini satu-satunya liputan gerbang itu: uji-zorder.mjs tidak punya satu pun
   kasus ber-diKadis (18 goldennya semua false), jadi kalau nanti ada yang
   mengutak-atik baris itu, YANG MENJAGANYA BERKAS INI — bukan uji-zorder.
   Dijalankan lewat frame() ASLI di sandbox, sama seperti uji-zorder.mjs.
   ======================================================================= */
console.log(tebal('\nGerbang penggambaran di frame()'));
{
  bersih();
  const K = R().RUANG_KADIS;
  const gambar = [];
  const drawPersonAsli = ctx.drawPerson, drawSorotAsli = ctx.drawSorot;
  ctx.drawPerson = (a) => { gambar.push(a.id); };
  ctx.drawSorot = () => {};
  const dalam = buatSatuOrang(ctx, false);
  Object.assign(dalam, { id: 'DALAM', x: R().KADIS_TITIK[0].x, y: R().KADIS_TITIK[0].y,
    station: 'agent', state: 'idle', path: [], diKadis: true, update() {} });
  H.agents.set('DALAM', dalam);
  const luar = buatSatuOrang(ctx, false);
  Object.assign(luar, { id: 'LUAR', x: 250, y: 240, station: 'idle', state: 'idle',
    path: [], update() {} });
  H.agents.set('LUAR', luar);

  K.t = 1; K.buka = true;
  gambar.length = 0;
  ctx.frame(TS);                          // ts == last → dt = 0, cuma satu frame gambar
  sama('bukaan terbuka: yang di dalam digambar TEPAT SEKALI (loop layers melewatinya)',
    gambar.filter((id) => id === 'DALAM').length, 1,
    'tanpa `if (a.diKadis) continue;` dia digambar dua kali — sekali di lajur, sekali di bukaan');
  sama('dan yang di ruang utama tetap tepat sekali',
    gambar.filter((id) => id === 'LUAR').length, 1);
  ok('dan dia masih benar-benar di dalam bukaan saat itu', dalam.diKadis === true);

  // 'mati' memulangkannya ke ruang utama: sesudah itu dia digambar oleh loop
  // layers seperti pegawai lain, dan gambarSisipKadis tidak menggambar apa pun
  ctx.sisipSetel('mati');
  gambar.length = 0;
  ctx.frame(TS);
  ok('setelan "mati": dia kembali jadi pegawai ruang utama biasa',
    dalam.diKadis === false && gambar.filter((id) => id === 'DALAM').length === 1);
  sama('dan bukaannya benar-benar tidak ada lagi', R().RUANG_KADIS.t, 0);
  ctx.sisipSetel('auto');
  ctx.drawPerson = drawPersonAsli;
  ctx.drawSorot = drawSorotAsli;
  bersih();
}

/* =======================================================================
   8. GOLDEN URUTAN GAMBAR DI DALAM BUKAAN
   ======================================================================= */
console.log(tebal('\nUrutan gambar di dalam bukaan'));
const urutan = [];
for (const p of R().PROPS_KADIS) {
  const nama = p.draw && p.draw.name ? p.draw.name : 'prop-tanpa-nama';
  p.draw = () => { urutan.push('prop:' + nama); };
}
ctx.drawPerson = (a) => { urutan.push('orang:' + a.id); };
ctx.drawSorot = (a) => { urutan.push('sorot:' + a.id); };
ctx.drawDindingKadis = () => { urutan.push('dinding'); };
ctx.drawKarpetKadis = () => { urutan.push('karpet'); };
ctx.drawKusenSisip = () => { urutan.push('kusen'); };
ctx.drawGordenSisip = () => { urutan.push('gorden'); };

function tamuPalsu(id, x, y) {
  const a = buatSatuOrang(ctx, false);
  Object.assign(a, { id, x, y, diKadis: true, update() {} });
  H.agents.set(id, a);
  return a;
}
function kasusGambar(siap) {
  bersih();
  ctx.buatKadis();
  urutan.length = 0;
  siap();
  ctx.gambarSisipKadis();
  return urutan.slice();
}

const KASUS = [
  { id: 'tertutup-t0', ket: 't=0: cuma kusen + gorden, NOL pemanggilan drawPerson',
    siap: () => { R().RUANG_KADIS.t = 0; } },
  { id: 'terbuka-kosong', ket: 'terbuka tanpa tamu: kursi kadis, kadis, meja, kursi tamu',
    siap: () => { R().RUANG_KADIS.t = 1; } },
  { id: 'satu-tamu', ket: 'satu tamu: kursi kadis / kadis / meja / tamu / kursi tamu',
    siap: () => { R().RUANG_KADIS.t = 1; tamuPalsu('T1', R().KADIS_TITIK[0].x, R().KADIS_TITIK[0].y); } },
  { id: 'tiga-tamu', ket: 'tiga tamu termasuk slot ketiga yang berdiri lebih ke belakang',
    siap: () => {
      R().RUANG_KADIS.t = 1;
      R().KADIS_TITIK.forEach((t, i) => tamuPalsu('T' + (i + 1), t.x, t.y));
    } },
  { id: 'tamu-terpilih-disorot', ket: 'tamu yang kartunya dibuka ikut dapat drawSorot di dalam bukaan',
    siap: () => { R().RUANG_KADIS.t = 1; H.setTerpilih(tamuPalsu('T1', R().KADIS_TITIK[0].x, R().KADIS_TITIK[0].y)); } },
  { id: 'orang-ruang-utama-tidak-ikut', ket: 'yang TIDAK diKadis tidak pernah digambar di dalam bukaan',
    siap: () => {
      R().RUANG_KADIS.t = 1;
      const a = buatSatuOrang(ctx, false);
      Object.assign(a, { id: 'LUAR', x: 250, y: 240, update() {} });
      H.agents.set('LUAR', a);
    } },
];

const sekarang = {};
for (const k of KASUS) sekarang[k.id] = kasusGambar(k.siap);

const argv = process.argv.slice(2);
if (argv.includes('--tampil')) {
  for (const k of KASUS) {
    console.log(tebal('  ' + k.id) + abu('  ' + k.ket));
    sekarang[k.id].forEach((l, i) => console.log(abu(`    ${String(i).padStart(2)}  `) + l));
  }
} else if (argv.includes('--perbarui')) {
  fs.writeFileSync(GOLDEN, JSON.stringify({
    _catatan: 'Golden urutan gambar gambarSisipKadis() (bukaan ruang kadis) di public/room.js. '
      + 'Isinya URUTAN label (prop:<fungsi>, orang:<id>, sorot:<id>, dinding, karpet, kusen, '
      + 'gorden), bukan angka y. Perbarui dengan `node uji-sisip.mjs --perbarui` HANYA kalau '
      + 'perubahan urutannya memang disengaja. Tidak ada hubungannya dengan uji-zorder.golden.json '
      + '— itu golden ruang utama dan tidak boleh ikut bergeser oleh pekerjaan ruang kadis.',
    kasus: sekarang,
  }, null, 2) + '\n');
  console.log(hijau(`golden ditulis: ${path.basename(GOLDEN)} (${KASUS.length} kasus)`));
} else {
  if (!fs.existsSync(GOLDEN)) {
    console.log(merah(`golden belum ada: ${path.basename(GOLDEN)}`));
    console.log(abu('jalankan `node uji-sisip.mjs --perbarui` dulu, lalu commit berkasnya'));
    process.exit(1);
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')).kasus || {};
  for (const k of KASUS) {
    const g = golden[k.id], s = sekarang[k.id];
    const cocok = !!g && g.length === s.length && g.every((v, i) => v === s[i]);
    ok(k.id, cocok, cocok ? k.ket : `golden ${JSON.stringify(g)}\n        sekarang ${JSON.stringify(s)}`);
  }
  // invarian yang harus benar apa pun isi goldennya
  ok('t=0 tidak pernah memanggil drawPerson (nol biaya saat tertutup)',
    !sekarang['tertutup-t0'].some((l) => l.startsWith('orang:')));
  ok('kusen & gorden selalu digambar PALING AKHIR, di luar klip',
    KASUS.every((k) => {
      const a = sekarang[k.id];
      return a[a.length - 2] === 'kusen' && a[a.length - 1] === 'gorden';
    }));
  ok('urutan satu tamu: kursi kadis → kadis → meja → tamu', (() => {
    const a = sekarang['satu-tamu'], i = (l) => a.indexOf(l);
    return i('prop:drawKursiKadis') < i('orang:kadis-npc')
      && i('orang:kadis-npc') < i('prop:drawMejaKadis')
      && i('prop:drawMejaKadis') < i('orang:T1');
  })());
  const tiga = sekarang['tiga-tamu'];
  ok('tamu yang berdiri di belakang digambar sebelum yang di depan',
    tiga.indexOf('orang:T3') < tiga.indexOf('orang:T1')
    && tiga.indexOf('orang:T3') < tiga.indexOf('orang:T2'));
  ok('sandaran kursi tamu digambar SESUDAH tamunya (tenggelam di belakang sandaran)',
    tiga.indexOf('prop:drawKursiTamu') > tiga.indexOf('orang:T1'));
  ok('drawSorot menempel tepat sebelum tamu yang terpilih',
    sekarang['tamu-terpilih-disorot'].indexOf('sorot:T1')
      === sekarang['tamu-terpilih-disorot'].indexOf('orang:T1') - 1);
  ok('orang ruang utama tidak pernah bocor ke dalam bukaan',
    !sekarang['orang-ruang-utama-tidak-ikut'].includes('orang:LUAR'));
}

/* ------------------------------------------------------------------ CLI --- */
console.log();
if (gagal) {
  console.log(merah(`${gagal} pemeriksaan gagal`) + abu(`, ${lulus} lulus`));
  for (const n of catatanGagal) console.log(merah('  • ' + n));
  process.exit(1);
}
console.log(hijau(`${lulus} pemeriksaan bukaan ruang kadis lulus.`)
  + abu(' (golden: ' + path.basename(GOLDEN) + ')'));
