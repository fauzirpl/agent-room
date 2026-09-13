#!/usr/bin/env node
// uji-bekas.mjs :: bekas di ruangan bertahan saat halaman dimuat ulang — dan
// HANYA bekas.
//
// room.js menyimpan daftar putih field RUANGAN ke localStorage (tiap 15 detik
// dan saat pagehide) lalu memulihkannya saat dimuat. Yang dijaga di sini tiga
// janji di komentar blok itu:
//   1. bekas yang disimpan benar-benar kembali, termasuk Set (kursiRusak,
//      stikerTertempel) yang tidak bisa lewat JSON apa adanya;
//   2. keadaan SESAAT tidak pernah ikut (kursi yang sedang diseret, kucing,
//      kusut harian, tema) — memulihkannya membuat ruangan terbangun dalam
//      keadaan yang tidak masuk akal;
//   3. memulihkan tidak pernah melempar: JSON rusak, versi lain, dan field yang
//      tipenya berubah dilewati per field.
// Plus satu janji ke harness lain: menjalankan ruangan (tickRuangan) TIDAK
// menulis ke localStorage, jadi tidak ada uji yang mewarisi bekas uji lain.
//
// Dua konteks vm terpisah dipakai sebagai "sebelum" dan "sesudah" muat ulang.
// localStorage tiruan uji-event.mjs hidup per konteks, jadi teksnya dibawa
// menyeberang dengan tangan — persis yang dilakukan peramban antara dua muat.

import { muatKonteks } from './uji-event.mjs';

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (k) => (s) => (warna ? '\x1b[' + k + 'm' + s + '\x1b[0m' : s);
const merah = c(31), hijau = c(32), abu = c(90), tebal = c(1);
let lulus = 0, gagal = 0;
function ok(nama, syarat, ket) {
  if (syarat) { lulus++; console.log(hijau('  ✓ ') + nama.padEnd(62) + abu(ket || '')); }
  else { gagal++; console.log(merah('  ✗ ') + nama.padEnd(62) + merah(ket || '')); }
}
const punyaSet = (v, x) => v && typeof v.has === 'function' && v.has(x);   // Set dari realm vm lain: instanceof bohong

for (const nama of ['simpanBekasRuangan', 'pulihkanBekasRuangan', 'lupakanBekasRuangan', 'bekasRujukan']) {
  if (typeof muatKonteks()[nama] !== 'function') {
    console.log(merah(`fungsi ${nama}() tidak ditemukan di room.js`));
    process.exit(1);
  }
}

/* ---------------------------------------------------------- simpan --- */
console.log(tebal('\nMenyimpan'));
const A = muatKonteks();
const RA = A.__jembatan__.RUANGAN;
const { BEKAS_KUNCI, BEKAS_FIELD } = A.bekasRujukan();
ok('halaman baru tanpa bekas tersimpan: RUANGAN tetap bawaan', RA.piala === false && RA.nodaMeja.length === 0,
  `piala=${RA.piala}, nodaMeja=${RA.nodaMeja.length}`);

// bekas
RA.piala = true;
RA.nodaMeja.push({ x: 30, y: 120 });
RA.kursiRusak.add(2);
RA.stikerTertempel.add('arsip');
RA.spanduk = { hilang: 3, tempel: -1 };
RA.koranTanggal = 'Sun Sep 13 2026';
RA.rimKertas = 2;
RA.mcbTurunKali = 1;
RA.dusTambahanArsip = 1; RA.arsipPenuh = true;
RA.toner = 0.25;
// keadaan sesaat yang TIDAK boleh ikut
RA.kursiDipinjam = 1; RA.kucingAda = true; RA.laciBuka = 5; RA.kusut = 0.7; RA.tema = 'ramadan';

ok('simpan pertama benar-benar menulis', A.simpanBekasRuangan() === true);
ok('simpan kedua tanpa perubahan tidak menulis ulang', A.simpanBekasRuangan() === false);
const teks = A.localStorage.getItem(BEKAS_KUNCI);
let data = null;
try { data = JSON.parse(teks); } catch { /* dicek di bawah */ }
ok('yang tersimpan JSON berversi', data && data.v === 1 && typeof data.isi === 'object', teks ? teks.length + ' huruf' : 'kosong');
const sesaat = ['kursiDipinjam', 'kucingAda', 'laciBuka', 'kusut', 'tema', 'kursiTambahanAda', 'gagalBeruntun'];
const bocor = data ? sesaat.filter((k) => k in data.isi) : sesaat;
ok('keadaan sesaat tidak ikut tersimpan', bocor.length === 0, bocor.join(', ') || sesaat.join(', '));
ok('yang tersimpan persis daftar putih', data && Object.keys(data.isi).length === BEKAS_FIELD.length,
  `${data ? Object.keys(data.isi).length : 0} dari ${BEKAS_FIELD.length} field`);

/* --------------------------------------------------------- pulihkan --- */
console.log(tebal('\nMemulihkan di halaman berikutnya'));
const B = muatKonteks();
const RB = B.__jembatan__.RUANGAN;
const n = B.pulihkanBekasRuangan(teks);
ok('semua field daftar putih dipulihkan', n === BEKAS_FIELD.length, `${n} field`);
ok('boolean & angka kembali', RB.piala === true && RB.rimKertas === 2 && RB.mcbTurunKali === 1 && RB.toner === 0.25);
ok('array & objek kembali', RB.nodaMeja.length === 1 && RB.nodaMeja[0].x === 30 && RB.spanduk && RB.spanduk.hilang === 3);
ok('Set kembali sebagai Set, bukan array', punyaSet(RB.kursiRusak, 2) && punyaSet(RB.stikerTertempel, 'arsip'),
  typeof RB.kursiRusak);
ok('bawaan null diisi teks (koranTanggal)', RB.koranTanggal === 'Sun Sep 13 2026');
ok('dus tambahan arsip kembali bersama kepenuhannya', RB.dusTambahanArsip === 1 && RB.arsipPenuh === true);
ok('keadaan sesaat di halaman baru tetap bawaan',
  RB.kursiDipinjam === -1 && RB.kucingAda === false && RB.kusut === null && RB.laciBuka === 0,
  `kursiDipinjam=${RB.kursiDipinjam} kucingAda=${RB.kucingAda} kusut=${RB.kusut}`);
ok('sesudah dipulihkan, simpan tanpa perubahan tidak menulis', B.simpanBekasRuangan() === false);

/* ------------------------------------------------------------ rusak --- */
console.log(tebal('\nIsi yang rusak tidak pernah menjatuhkan halaman'));
{
  const C = muatKonteks();
  const RC = C.__jembatan__.RUANGAN;
  let lempar = null, hasil = [];
  try {
    hasil = [
      C.pulihkanBekasRuangan('{bukan json'),
      C.pulihkanBekasRuangan(JSON.stringify({ v: 99, isi: { piala: true } })),
      C.pulihkanBekasRuangan(JSON.stringify({ v: 1, isi: null })),
      C.pulihkanBekasRuangan(''),
    ];
  } catch (e) { lempar = e; }
  ok('JSON rusak, versi lain, isi null, teks kosong: nol field, tanpa lemparan',
    !lempar && hasil.every((x) => x === 0) && RC.piala === false, lempar ? lempar.message : hasil.join(','));
  const salahTipe = C.pulihkanBekasRuangan(JSON.stringify({ v: 1, isi: {
    piala: 'ya', toner: 'penuh', nodaMeja: {}, kursiRusak: 5, spanduk: 7,
  } }));
  ok('field bertipe salah dilewati satu per satu', salahTipe === 0
    && RC.piala === false && RC.toner === 1 && Array.isArray(RC.nodaMeja) && RC.spanduk === null,
    `${salahTipe} field, toner=${RC.toner}`);
  const campur = C.pulihkanBekasRuangan(JSON.stringify({ v: 1, isi: { piala: 'ya', kesetAda: true } }));
  ok('satu field rusak tidak membatalkan field lain', campur === 1 && RC.kesetAda === true && RC.piala === false);
  const asing = C.pulihkanBekasRuangan(JSON.stringify({ v: 1, isi: { kursiDipinjam: 3, kucingAda: true, tema: 'korpri' } }));
  ok('field di luar daftar putih tidak dipulihkan walau ada di teks', asing === 0
    && RC.kursiDipinjam === -1 && RC.kucingAda === false && RC.tema !== 'korpri');
}

/* --------------------------------------------------- lupa & harness --- */
console.log(tebal('\nMelupakan, dan harness lain tidak mewarisi apa pun'));
{
  A.lupakanBekasRuangan();
  ok('lupakanBekasRuangan() menghapus yang tersimpan', A.localStorage.getItem(BEKAS_KUNCI) === null);
  ok('sesudah dilupakan, simpan berikutnya menulis lagi', A.simpanBekasRuangan() === true);

  const D = muatKonteks();
  const RD = D.__jembatan__.RUANGAN;
  RD.piala = true; RD.kesetAda = true;
  let lempar = null;
  for (let i = 0; i < 200; i++) { try { D.tickRuangan(0.05); } catch (e) { lempar = lempar || e; } }
  ok('menjalankan ruangan (tickRuangan ×200) tidak menulis localStorage', D.localStorage.getItem(BEKAS_KUNCI) === null,
    lempar ? 'tickRuangan melempar: ' + lempar.message : 'setInterval/pagehide di sandbox memang tidak pernah jalan');
}

console.log('\n' + (gagal ? merah(`GAGAL ${gagal}`) + ` · lulus ${lulus}` : hijau(`LULUS ${lulus} pemeriksaan`)));
process.exit(gagal ? 1 : 0);
