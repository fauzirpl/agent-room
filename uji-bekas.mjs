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
// Dan satu janji ke event: bekas yang disimpan tidak boleh membuat event yang
// menunggu bekasnya hilang menyala sekali lalu mati selamanya. Tiap field yang
// dibaca syarat() event harus punya masa pakai (BEKAS_MASA) atau jalan pulang
// yang terdaftar di JALAN_PULANG di bawah. Printer ikut di sini karena toner &
// kertasnya stok tersimpan yang dulu tidak pernah berkurang sama sekali.
//
// Dua konteks vm terpisah dipakai sebagai "sebelum" dan "sesudah" muat ulang.
// localStorage tiruan uji-event.mjs hidup per konteks, jadi teksnya dibawa
// menyeberang dengan tangan — persis yang dilakukan peramban antara dua muat.

import vm from 'node:vm';
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

/* ---------------------------------------------------- buku riwayat --- */
console.log(tebal('\nBuku riwayat'));
{
  for (const nama of ['catatRiwayat', 'jelaskanPerubahan', 'mulaiRuanganTersimpan', 'riwayatRujukan']) {
    if (typeof muatKonteks()[nama] !== 'function') { ok(`fungsi ${nama}() ada di room.js`, false); }
  }
  const G = muatKonteks();
  const RG = G.__jembatan__.RUANGAN;
  const { RIWAYAT_KUNCI, RIWAYAT_MAKS } = G.riwayatRujukan();
  const buku = () => G.riwayatRujukan().riwayatKantor;
  ok('halaman baru: buku dibuka dengan satu entri pembuka', buku().length === 1 && buku()[0].k === 'mulai',
    buku().map((r) => r.teks).join(' | '));
  ok('tanpa perubahan tidak ada yang dicatat', G.catatRiwayat(1000) === 0);

  RG.piala = true;
  RG.kursiRusak.add(1);
  RG.nodaPlafon.push({ x: 40, w: 12 });
  RG.toner = 0.2;                                     // stok BERKURANG: tidak dicatat
  const n = G.catatRiwayat(2000);
  const teks = buku().map((r) => r.teks).join(' | ');
  ok('tiga bekas baru jadi tiga entri, toner yang berkurang tidak', n === 3
    && /Piala/.test(teks) && /Kursi rapat rusak/.test(teks) && /plafon/.test(teks) && !/Toner/.test(teks), teks);
  ok('entri bertanggal dengan waktu kejadian', buku().slice(1).every((r) => r.t === 2000));
  RG.toner = 1;
  ok('stok yang DIISI ULANG dicatat', G.catatRiwayat(3000) === 1 && /Toner printer diganti/.test(buku().at(-1).teks));
  RG.kursiRusak.delete(1);
  ok('bekas yang hilang dicatat dengan kalimatnya sendiri', G.catatRiwayat(4000) === 1
    && buku().at(-1).teks === 'Kursi rapat yang rusak diganti', buku().at(-1).teks);
  const tersimpan = (() => { try { return JSON.parse(G.localStorage.getItem(RIWAYAT_KUNCI)); } catch { return null; } })();
  ok('riwayat ikut tersimpan', Array.isArray(tersimpan) && tersimpan.length === buku().length,
    `${tersimpan ? tersimpan.length : 0} entri`);

  // halaman berikutnya: bekas & riwayat dibawa menyeberang seperti peramban
  G.simpanBekasRuangan();
  const H2 = muatKonteks();
  H2.localStorage.setItem(G.bekasRujukan().BEKAS_KUNCI, G.localStorage.getItem(G.bekasRujukan().BEKAS_KUNCI));
  H2.localStorage.setItem(RIWAYAT_KUNCI, G.localStorage.getItem(RIWAYAT_KUNCI));
  H2.mulaiRuanganTersimpan(false);
  const buku2 = H2.riwayatRujukan().riwayatKantor;
  ok('muat ulang: riwayat lama kembali utuh', buku2.length === buku().length && buku2[0].k === 'mulai');
  ok('muat ulang: bekas yang DIPULIHKAN tidak dicatat sebagai kejadian baru', H2.catatRiwayat(5000) === 0,
    'piala sudah ada sejak halaman sebelumnya');

  // batas ukuran: entri pembuka tidak pernah ikut terbuang
  for (let i = 0; i < RIWAYAT_MAKS + 40; i++) {
    H2.__jembatan__.RUANGAN.fotoMiring = i % 2 ? 0 : 0.09;
    H2.catatRiwayat(6000 + i);
  }
  const buku3 = H2.riwayatRujukan().riwayatKantor;
  ok(`tidak pernah lebih dari ${RIWAYAT_MAKS} entri, pembuka tetap di depan`,
    buku3.length === RIWAYAT_MAKS && buku3[0].k === 'mulai', `${buku3.length} entri, pertama: ${buku3[0].teks}`);

  // rusak & bersih
  const I = muatKonteks();
  I.localStorage.setItem(RIWAYAT_KUNCI, '{bukan json');
  let lempar = null;
  try { I.mulaiRuanganTersimpan(false); } catch (e) { lempar = e; }
  ok('riwayat tersimpan yang rusak tidak menjatuhkan halaman', !lempar && I.riwayatRujukan().riwayatKantor.length === 1,
    lempar ? lempar.message : 'buku dibuka baru');
  H2.mulaiRuanganTersimpan(true);
  const buku4 = H2.riwayatRujukan().riwayatKantor;
  ok('?ruangan=baru mengosongkan riwayat juga', buku4.length === 1 && /bersih/.test(buku4[0].teks)
    && H2.localStorage.getItem(H2.bekasRujukan().BEKAS_KUNCI) === null, buku4.map((r) => r.teks).join(' | '));
  // kartu inventaris membaca buku riwayat
  ok('riwayatBarang: kartu meja rapat membaca entri kursi rusak terbaru',
    G.riwayatBarang('rapat') && G.riwayatBarang('rapat').teks === 'Kursi rapat yang rusak diganti',
    G.riwayatBarang('rapat') ? G.riwayatBarang('rapat').teks : 'null');
  ok('riwayatBarang: barang tanpa entri & barang tanpa peta = null',
    G.riwayatBarang('dispenser') === null && G.riwayatBarang('jam') === null && G.riwayatBarang('tidak-ada') === null);
  ok('riwayatBarang: kartu printer ikut isi ulang toner', G.riwayatBarang('printer')
    && /Toner printer diganti/.test(G.riwayatBarang('printer').teks));
  ok('jelaskanPerubahan murni: potret sama = nol kalimat',
    G.jelaskanPerubahan({ piala: true, nodaMeja: [] }, { piala: true, nodaMeja: [] }).length === 0);
}

/* ------------------------------------------------------ masa pakai --- */
console.log(tebal('\nMasa pakai: tidak ada event yang menyala sekali lalu mati selamanya'));
{
  const ser = (v) => JSON.stringify(v && typeof v.has === 'function' ? [...v] : v);
  const J = muatKonteks();
  const RJ = J.__jembatan__.RUANGAN;
  const { BEKAS_MASA, HARI_MS, BEKAS_TENGGANG_MS: TENGGANG } = J.bekasMasaRujukan();
  const sejak = () => J.bekasMasaRujukan().bekasSejak;
  const { BEKAS_FIELD: FIELD } = J.bekasRujukan();
  const awal = {};
  for (const k of FIELD) awal[k] = ser(RJ[k]);

  // nilai "jenuh": keadaan saat event penambahnya tidak bisa menyala lagi
  const JENUH = {
    kartuAPAR: true, kabelRapi: true, labelPatch: 10,
    stikerTertempel: ['arsip', 'filing', 'stempel', 'server', 'kipas', 'tunggu', 'dus'],
    plangBaru: true, kesetAda: true, piala: true, baganKotak: 2, bukuTamu: 10,
    spanduk: { hilang: 3, tempel: -1 }, catMengelupas: 0.9, fotoMiring: 0.09, karpetCerah: true,
  };
  // Set milik realm vm: diisi di tempat, bukan diganti Set dari realm host
  const pasang = (R, k) => {
    if (Array.isArray(JENUH[k])) { R[k].clear(); for (const x of JENUH[k]) R[k].add(x); } else R[k] = JENUH[k];
  };
  // field yang dibaca syarat tapi dikembalikan event (atau fungsi room.js), bukan masa pakai
  const JALAN_PULANG = {
    nodaPlafon: ['tukang-cat-plafon', 'plafon-melendut-noda-air'],
    retakExtra: ['ubin-retak-ditambal', 'ubin-retak-nambah'],
    nodaKopi: ['tumpahan-kopi-rapat', 'noda-kopi-taplak-dibersihkan'],
    kursiRusak: ['kursi-rapat-patah', 'kursi-rapat-rusak-diganti'],
    arsipPenuh: ['lemari-arsip-kepenuhan', 'pemadatan-arsip'],
    dusTambahanArsip: ['dus-arsip-ditumpuk', 'pemadatan-arsip'],
    gelasDispenser: ['kopi-sachet-di-dispenser', 'galon-habis-diganti'],
    rimKertas: ['kertas-nyangkut-di-fotokopi', 'jatah-kuota-cair'],
    toner: ['pakaiPrinter()', 'printer-toner-dikocok'],
    kertasPrinter: ['pakaiPrinter()', 'stok-kertas-habis'],
    isiGudang: ['simpanKeGudang()', 'penghapusan-bmn-gudang'],
  };
  const EVENTS = J.__jembatan__.EVENT_ACAK;
  const { eventById } = J.__jembatan__;
  const sumber = (d) => Object.values(d).filter((f) => typeof f === 'function').map(String).join('\n');
  const S_UJI = { jam: 9, kerjaJam: true, orang: [], nganggur: [], stasiunAktif: new Set(), luar: 0, gagalBeruntun: 0 };
  const syaratOk = (d) => { try { return !!d.syarat(S_UJI); } catch { return false; } };

  const bermasa = Object.keys(BEKAS_MASA);
  const tanpaJenuh = bermasa.filter((k) => !FIELD.includes(k) || !(k in JENUH));
  ok('tiap bekas bermasa ada di BEKAS_FIELD dan di tabel JENUH uji ini', tanpaJenuh.length === 0,
    tanpaJenuh.join(', ') || `${bermasa.length} bekas`);

  // field BEKAS_FIELD yang dibaca syarat() event mana saja
  const pembaca = {};
  for (const d of EVENTS) {
    if (typeof d.syarat !== 'function') continue;
    for (const m of String(d.syarat).matchAll(/RUANGAN\.(\w+)/g)) {
      if (FIELD.includes(m[1])) (pembaca[m[1]] ||= new Set()).add(d.id);
    }
  }
  const buntu = Object.keys(pembaca).filter((k) => !(k in BEKAS_MASA) && !(k in JALAN_PULANG))
    .map((k) => `${k} (${[...pembaca[k]].join(', ')})`);
  ok('tiap bekas yang dibaca syarat event punya masa pakai atau jalan pulang', buntu.length === 0,
    buntu.join('; ') || `${Object.keys(pembaca).length} field dibaca syarat`);
  const jalanPalsu = [];
  for (const [k, ids] of Object.entries(JALAN_PULANG)) {
    for (const id of ids) {
      if (id.endsWith('()')) { if (typeof J[id.slice(0, -2)] !== 'function') jalanPalsu.push(`${k}: ${id} tidak ada`); continue; }
      const d = eventById.get(id);
      if (!d) jalanPalsu.push(`${k}: event ${id} tidak ada`);
      else if (!sumber(d).includes('RUANGAN.' + k)) jalanPalsu.push(`${k}: ${id} tidak menyentuh RUANGAN.${k}`);
    }
  }
  ok('jalan pulang yang terdaftar benar-benar ada dan menyentuh bekasnya', jalanPalsu.length === 0, jalanPalsu.join('; '));

  // mekanik masa pakai, satu field per putaran
  const T0 = 1_000_000_000_000;
  const salah = [];
  for (const k of bermasa) {
    pasang(RJ, k);
    delete sejak()[k];
    const masa = BEKAS_MASA[k].hari * HARI_MS;
    if (J.kedaluwarsakanBekas(T0).includes(k)) salah.push(k + ': habis tanpa tanggal');
    if (J.kedaluwarsakanBekas(T0 + masa - 1).includes(k)) salah.push(k + ': habis sebelum masanya');
    if (!J.bekasJatuhTempo(T0 + masa).includes(k)) salah.push(k + ': tidak jatuh tempo tepat di masanya');
    if (J.kedaluwarsakanBekas(T0 + masa + TENGGANG - 1).includes(k)) salah.push(k + ': lenyap sebelum tenggangnya habis');
    if (!J.kedaluwarsakanBekas(T0 + masa + TENGGANG).includes(k)) salah.push(k + ': tidak dikembalikan sesudah tenggang');
    if (ser(RJ[k]) !== awal[k]) salah.push(`${k}: jadi ${ser(RJ[k])}, bukan bawaan ${awal[k]}`);
  }
  ok('bertahan sebelum masanya, jatuh tempo di masanya, kembali sesudah tenggang', salah.length === 0,
    salah.join('; ') || `${bermasa.length} bekas`);
  ok('Set yang dikembalikan tetap Set', typeof RJ.stikerTertempel.has === 'function' && RJ.stikerTertempel.size === 0);
  RJ.labelPatch = 4; sejak().labelPatch = 0;
  ok('bekas yang belum jenuh tidak pernah dikembalikan', !J.kedaluwarsakanBekas(T0 * 2).includes('labelPatch') && RJ.labelPatch === 4);
  RJ.labelPatch = 0;

  // event yang menunggu bekasnya hilang benar-benar bisa menyala lagi
  const mati = [], hidup = [];
  for (const k of bermasa) {
    if (!pembaca[k]) continue;
    const defs = [...pembaca[k]].map((id) => eventById.get(id));
    pasang(RJ, k);
    const sebelum = defs.map(syaratOk);
    sejak()[k] = T0;
    J.kedaluwarsakanBekas(T0 + 400 * HARI_MS);
    const sesudah = defs.map(syaratOk);
    const naik = defs.filter((d, i) => !sebelum[i] && sesudah[i]).map((d) => d.id);
    if (naik.length) hidup.push(...naik); else mati.push(`${k} (${defs.map((d) => d.id).join(', ')})`);
  }
  ok('event yang menunggu bekas hilang bisa menyala lagi sesudah masanya', mati.length === 0,
    mati.join('; ') || hidup.join(', '));

  // buku riwayat punya kalimat untuk tiap bekas yang kembali
  {
    const K = muatKonteks();
    const RK = K.__jembatan__.RUANGAN;
    for (const k of bermasa) pasang(RK, k);
    K.catatRiwayat(1000);
    const habis = K.kedaluwarsakanBekas(1000 + 400 * HARI_MS);
    const n0 = K.riwayatRujukan().riwayatKantor.length;
    K.catatRiwayat(2000 + 400 * HARI_MS);
    const entri = K.riwayatRujukan().riwayatKantor.slice(n0);
    const bisu = bermasa.filter((k) => !entri.some((r) => r.k === k));
    ok('semua bekas jenuh habis bersamaan sesudah 400 hari', habis.length === bermasa.length, `${habis.length}/${bermasa.length}`);
    ok('tiap bekas yang kembali punya kalimat di buku riwayat', bisu.length === 0,
      bisu.length ? 'bisu: ' + bisu.join(', ') : entri.map((r) => r.teks).slice(0, 3).join(' | ') + ' …');
  }

  // tanggalnya ikut tersimpan & dipulihkan
  {
    const L = muatKonteks();
    L.__jembatan__.RUANGAN.kesetAda = true;
    L.catatRiwayat(5000);
    L.simpanBekasRuangan();
    let d = null;
    try { d = JSON.parse(L.localStorage.getItem(BEKAS_KUNCI)); } catch { /* dicek di bawah */ }
    ok('tanggal bekas ikut tersimpan', d && d.sejak && d.sejak.kesetAda === 5000, d ? JSON.stringify(d.sejak) : 'kosong');
    const M = muatKonteks();
    M.pulihkanBekasRuangan(L.localStorage.getItem(BEKAS_KUNCI));
    ok('muat ulang: tanggalnya kembali dan masa pakainya berjalan terus',
      M.bekasMasaRujukan().bekasSejak.kesetAda === 5000 && !M.kedaluwarsakanBekas(5000 + 20 * HARI_MS).length
      && M.kedaluwarsakanBekas(5000 + 21 * HARI_MS + TENGGANG).includes('kesetAda') && M.__jembatan__.RUANGAN.kesetAda === false);
    ok('sesudah dipulihkan, simpan tanpa perubahan tidak menulis', (() => {
      const N = muatKonteks(); N.pulihkanBekasRuangan(L.localStorage.getItem(BEKAS_KUNCI)); return N.simpanBekasRuangan() === false;
    })());

    const O = muatKonteks();
    O.pulihkanBekasRuangan(JSON.stringify({ v: 1, isi: { kesetAda: true }, sejak: { kesetAda: 'kemarin' } }));
    const jauh = Date.now() + 999 * HARI_MS;
    ok('simpanan lama / tanggal rusak: tidak ada yang lenyap mendadak',
      O.kedaluwarsakanBekas(jauh).length === 0 && O.__jembatan__.RUANGAN.kesetAda === true
      && O.bekasMasaRujukan().bekasSejak.kesetAda === jauh);
  }
}

/* ---------------------------------------------------- sedang menua --- */
console.log(tebal('\nSedang menua: masa pakai yang terlihat'));
{
  const Q = muatKonteks();
  const RQ = Q.__jembatan__.RUANGAN;
  const { BEKAS_MASA, HARI_MS, BEKAS_MASA_NAMA } = Q.bekasMasaRujukan();
  const sj = () => Q.bekasMasaRujukan().bekasSejak;
  const tanpaNama = Object.keys(BEKAS_MASA).filter((k) => !BEKAS_MASA_NAMA || !BEKAS_MASA_NAMA[k]);
  ok('tiap bekas bermasa punya nama untuk manusia', tanpaNama.length === 0, tanpaNama.join(', '));
  ok('kantor bersih: tidak ada yang sedang menua', Q.bekasMenua(1).length === 0);

  const T0 = 1_000_000_000_000;
  RQ.kesetAda = true; sj().kesetAda = T0;
  RQ.kartuAPAR = true; sj().kartuAPAR = T0 - 24 * HARI_MS;
  RQ.piala = true; delete sj().piala;
  RQ.labelPatch = 4;                                   // belum jenuh: bukan bekas bermasa yang aktif
  const m = Q.bekasMenua(T0 + 5.2 * HARI_MS);
  ok('yang paling dekat habis di depan, tanggal tak dikenal paling belakang',
    m.map((x) => x.k).join() === 'kartuAPAR,kesetAda,piala', m.map((x) => x.k).join());
  const keset = m.find((x) => x.k === 'kesetAda');
  ok('keset: sudah 5 hari, habis 16 hari lagi', keset && keset.umurHari === 5 && keset.sisaHari === 16
    && Q.teksSisaMasa(keset) === 'habis 16 hari lagi' && Q.teksUmurBekas(keset) === 'sudah 5 hari',
    keset ? `${Q.teksUmurBekas(keset)}, ${Q.teksSisaMasa(keset)}` : 'tidak ada');
  ok('kartu APAR yang tinggal kurang dari sehari: "habis hari ini"', Q.teksSisaMasa(m[0]) === 'habis hari ini', Q.teksSisaMasa(m[0]));
  ok('satu setengah hari lagi: "habis besok"', Q.teksSisaMasa({ sisaMs: 1.5 * HARI_MS, sisaHari: 2 }) === 'habis besok');
  ok('tanggal belum diketahui tidak ditebak', m[2].sisaHari === null && Q.teksSisaMasa(m[2]) === 'masa pakai belum diketahui'
    && Q.teksUmurBekas(m[2]) === '');
  ok('lewat masanya tapi belum dikembalikan: "menunggu dibereskan", bukan angka negatif',
    Q.teksSisaMasa(Q.bekasMenua(T0 + 40 * HARI_MS).find((x) => x.k === 'kesetAda')) === 'sudah habis, menunggu dibereskan');
}

/* ----------------------------------------------------- jatuh tempo --- */
console.log(tebal('\nJatuh tempo: masa pakai yang habis dibereskan orang, bukan lenyap'));
{
  const V = muatKonteks();
  const RV = V.__jembatan__.RUANGAN;
  const { HARI_MS, BEKAS_MASA } = V.bekasMasaRujukan();
  const sj = () => V.bekasMasaRujukan().bekasSejak;
  const T0 = 1_000_000_000_000;
  ok('kantor bersih: tidak ada yang jatuh tempo', V.bekasJatuhTempo(T0).length === 0);
  RV.kesetAda = true; sj().kesetAda = T0 - 21.2 * HARI_MS;      // lewat 0,2 hari
  RV.piala = true; sj().piala = T0 - 60.4 * HARI_MS;            // lewat 0,4 hari: paling lama
  RV.kartuAPAR = true; sj().kartuAPAR = T0 - 10 * HARI_MS;      // belum
  RV.bukuTamu = 10;                                             // penuh tapi tanggalnya belum diketahui
  const tempo = V.bekasJatuhTempo(T0);
  ok('jatuh tempo: yang paling lama lewat di depan, yang belum & tak bertanggal tidak ikut',
    tempo.join() === 'piala,kesetAda', tempo.join());
  ok('kembalikanBekas: mengembalikan yang aktif, menolak yang sudah bawaan & yang tidak bermasa',
    V.kembalikanBekas('kesetAda') === true && RV.kesetAda === false
    && V.kembalikanBekas('kesetAda') === false && V.kembalikanBekas('nodaPlafon') === false);

  const ev = V.__jembatan__.eventById.get('bekas-habis-masa-pakai');
  ok('event bekas-habis-masa-pakai terpasang', Boolean(ev));
  let adegan = [];
  try { adegan = new vm.Script('Object.keys(ADEGAN_HABIS)').runInContext(V); } catch { /* dicek di bawah */ }
  const nyasar = adegan.filter((k) => !(k in BEKAS_MASA));
  ok('tiap adegan di event 42 menunjuk bekas bermasa pakai', adegan.length > 0 && nyasar.length === 0,
    nyasar.length ? 'nyasar: ' + nyasar.join(', ') : `${adegan.length} adegan: ${adegan.join(', ')}`);
  RV.piala = false; RV.bukuTamu = 0;
  let lempar = null, bisa = true;
  try { bisa = ev ? ev.syarat({ jam: 10, kerjaJam: true, orang: [], nganggur: [] }) : true; } catch (e) { lempar = e; }
  ok('tidak ada yang jatuh tempo: event-nya tidak bisa menyala', !lempar && !bisa, lempar ? lempar.message : '');
}

/* ---------------------------------------------------------- gudang --- */
console.log(tebal('\nGudang: barang bekas menumpuk, lalu penghapusan BMN'));
{
  const G2 = muatKonteks();
  const RG2 = G2.__jembatan__.RUANGAN;
  const buku = () => G2.riwayatRujukan().riwayatKantor;
  ok('isiGudang ikut daftar putih bekas', G2.bekasRujukan().BEKAS_FIELD.includes('isiGudang'));
  ok('simpanKeGudang: jenis dikenal masuk, jenis asing ditolak',
    G2.simpanKeGudang('keset') === true && G2.simpanKeGudang('kulkas') === false && RG2.isiGudang.length === 1);
  G2.catatRiwayat(1000);
  ok('buku riwayat menyebut barang yang masuk gudang', /^Keset lama disimpan di gudang \(1 barang bekas sekarang\)$/.test(buku().at(-1).teks),
    buku().at(-1).teks);
  for (let i = 0; i < 20; i++) G2.simpanKeGudang('kursi');
  ok('gudang tidak menampung lebih dari batasnya', RG2.isiGudang.length === 8, `${RG2.isiGudang.length} barang`);
  G2.catatRiwayat(2000);
  RG2.isiGudang.splice(0);
  G2.catatRiwayat(3000);
  ok('penghapusan BMN tercatat sebagai satu kalimat', /^Penghapusan BMN: 8 barang bekas di gudang diangkut/.test(buku().at(-1).teks),
    buku().at(-1).teks);
  G2.simpanKeGudang('kursi'); G2.simpanKeGudang('kursi'); G2.simpanKeGudang('piala');
  ok('kartu gudang meringkas isinya per jenis', G2.ringkasIsiGudang() === 'Kursi rapat rusak ×2, Piala voli', G2.ringkasIsiGudang());
  const ev = G2.__jembatan__.eventById.get('penghapusan-bmn-gudang');
  ok('event penghapusan-bmn-gudang terpasang', Boolean(ev));
  let adegan = {};
  try { adegan = new vm.Script('ADEGAN_HABIS').runInContext(G2); } catch { /* dicek di bawah */ }
  const keGudang = Object.entries(adegan).filter(([, A]) => A.keGudang);
  const tanpaJenis = keGudang.filter(([, A]) => !A.gudang || !G2.simpanKeGudang(A.gudang)).map(([k]) => k);
  ok('tiap adegan yang membawa barang ke gudang menyimpannya dengan jenis yang dikenal', keGudang.length > 0 && tanpaJenis.length === 0,
    tanpaJenis.join(', ') || keGudang.map(([k]) => k).join(', '));
}

/* --------------------------------------------------------- printer --- */
console.log(tebal('\nPrinter memakai kertas'));
{
  const P = muatKonteks();
  const RP = P.__jembatan__.RUANGAN;
  const EV = P.__jembatan__.eventById;
  const bisa = (id) => { try { return !!EV.get(id).syarat({ jam: 9, kerjaJam: true, orang: [] }); } catch { return false; } };
  ok('kertas & toner penuh: kedua event isi ulang belum bisa menyala', !bisa('stok-kertas-habis') && !bisa('printer-toner-dikocok'));
  let n = 0;
  for (let i = 0; i < 20; i++) if (P.pakaiPrinter()) n++;
  ok('dua puluh lembar menghabiskan kertas', n === 20 && RP.kertasPrinter === 0, `${n} lembar, sisa ${RP.kertasPrinter}`);
  ok('toner turun di bawah 90%: printer-toner-dikocok bisa menyala', RP.toner < 0.9 && bisa('printer-toner-dikocok'), `toner ${RP.toner}`);
  ok('kertas habis: stok-kertas-habis bisa menyala, tidak ada yang tercetak lagi',
    bisa('stok-kertas-habis') && P.pakaiPrinter() === false && RP.kertasPrinter === 0);

  // lewat jalur sungguhan: handle() dengan tool call
  RP.kertasPrinter = 20; RP.toner = 1;
  const live = Date.now() + 60000;
  const call = (id, ts, tool) => P.handle({ id, ts, kind: 'pre', session: 'uji-printer', tool, label: 'uji', ok: true, cwd: 'proyek-uji' });
  call(1, live, 'WebFetch');
  ok('tool call sungguhan di meja printer mencetak selembar', RP.kertasPrinter === 19 && RP.toner < 1, `sisa ${RP.kertasPrinter}`);
  call(2, 1000, 'WebSearch');
  ok('event lama yang diputar ulang saat tersambung tidak mencetak lagi', RP.kertasPrinter === 19, `sisa ${RP.kertasPrinter}`);
  call(3, live + 1, 'Read');
  ok('tool call di stasiun lain tidak memakai kertas', RP.kertasPrinter === 19, `sisa ${RP.kertasPrinter}`);
}

/* ------------------------------------------------ pemakaian stasiun --- */
console.log(tebal('\nPemakaian stasiun: perabot aus karena kerja sungguhan'));
{
  const U = muatKonteks();
  const HU = U.__jembatan__;
  HU.setNow(1_000_000);                              // now=0 bawaan sandbox = selalu "masih cooldown"
  const { PEMAKAIAN_STASIUN, pakaiStasiun } = U.pemakaianRujukan();
  const nyasar = Object.entries(PEMAKAIAN_STASIUN).filter(([, q]) => !HU.eventById.has(q.event)).map(([st, q]) => `${st}: ${q.event}`);
  ok('tiap pemicu menunjuk event yang terdaftar', nyasar.length === 0, nyasar.join(', ') || Object.keys(PEMAKAIAN_STASIUN).join(', '));
  const hidup = (id) => HU.eventHidup.some((e) => e.def.id === id);
  const live = Date.now() + 60000;
  let seq = 0;
  const call = (tool, ts) => U.handle({ id: ++seq, ts, kind: 'pre', session: 'uji-pakai', tool, label: 'uji', ok: true, cwd: 'proyek-uji' });
  const { tiap, event } = PEMAKAIAN_STASIUN.search;
  for (let i = 0; i < tiap - 1; i++) call('Grep', live + i);
  ok(`${tiap - 1} Grep: ${event} belum menyala`, !hidup(event) && pakaiStasiun.search === tiap - 1, `hitungan ${pakaiStasiun.search}`);
  for (let i = 0; i < 5; i++) call('Grep', 1000 + i);
  ok('event lama yang diputar ulang saat tersambung tidak dihitung', pakaiStasiun.search === tiap - 1, `hitungan ${pakaiStasiun.search}`);
  call('Grep', live + 100);
  ok(`Grep ke-${tiap}: ${event} menyala, hitungannya kembali nol`, hidup(event) && pakaiStasiun.search === 0, `hitungan ${pakaiStasiun.search}`);
  for (let i = 0; i < tiap + 3; i++) call('Grep', live + 200 + i);
  ok('pemicu yang ditolak (event-nya masih hidup) tidak membuang hitungan',
    pakaiStasiun.search === tiap + 3 && HU.eventHidup.filter((e) => e.def.id === event).length === 1, `hitungan ${pakaiStasiun.search}`);
  call('Read', live + 500);
  ok('tiap stasiun dihitung sendiri', pakaiStasiun.read === 1 && pakaiStasiun.search === tiap + 3);
}

console.log('\n' + (gagal ? merah(`GAGAL ${gagal}`) + ` · lulus ${lulus}` : hijau(`LULUS ${lulus} pemeriksaan`)));
process.exit(gagal ? 1 : 0);
