#!/usr/bin/env node
// uji-tempat.mjs :: perabot yang ditaruh lewat sapuan piksel TETAP berdiri di
// tempat yang kosong.
//
// Kenapa ada: letak pojok baca, pos satpam, panel MCB, dan rim kertas di atas
// mesin fotokopi dibuktikan dengan sapuan piksel + lalu lintas — tapi bukti
// itu cuma tertulis di komentar. Komentar tidak gagal. Satu perabot baru atau
// satu dekor tema yang digambar di tempat yang sama cukup untuk membuat klaim
// "nol piksel milik perabot lama" jadi bohong, dan itu sudah pernah terjadi:
// panel MCB versi pertama menumpuk dengan dekor tema ramadan, dan tidak ada
// yang tahu sampai sapu-ruang.mjs kebetulan dijalankan ulang.
//
// Yang dijalankan: SATU sapuan sapu-ruang.mjs (bukan ditulis ulang di sini)
// atas semua kotak sekaligus. Tiap perabot punya daftar pemilik piksel yang
// SAH (dirinya sendiri) dan, untuk perabot lantai, daftar tujuan rute yang sah
// (orang yang memang berjalan KE perabot itu). Apa pun di luar daftar itu —
// perabot lain, dekor tema, prop event, rute yang kebetulan lewat — gagal.
//
// Dua kontrol, supaya hijaunya berarti sesuatu:
//   * negatif: kotak panel MCB versi pertama (x422..436 y74..92) HARUS
//     ketahuan menumpuk dekor tema ramadan — tabrakan yang dulu lolos;
//   * positif: satu kotak di tengah lajur atas HARUS dilintasi rute.
//
// Menambah perabot baru yang letaknya dicari dengan sapu-ruang.mjs? Tambahkan
// barisnya di PERABOT di bawah.

import { sapuRuangan, siapaDiKotak } from './sapu-ruang.mjs';

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (k) => (s) => (warna ? '\x1b[' + k + 'm' + s + '\x1b[0m' : s);
const merah = c(31), hijau = c(32), abu = c(90), tebal = c(1);
let lulus = 0, gagal = 0;
function ok(nama, syarat, ket) {
  if (syarat) { lulus++; console.log(hijau('  ✓ ') + nama.padEnd(58) + abu(ket || '')); }
  else { gagal++; console.log(merah('  ✗ ') + nama.padEnd(58) + merah(ket || '')); }
}

// Kotak diambil dari room.js lewat ruangRujukan() di dalam sapuan, jadi uji ini
// dijalankan dua langkah: sapuan kosong untuk membaca geometrinya, lalu sapuan
// sungguhan dengan kotaknya. Sapuan pertama murah karena tanpa kotak sama saja
// — tapi supaya cuma sekali, geometrinya dibaca dari muatKonteks langsung.
import { muatKonteks } from './uji-event.mjs';
const G = muatKonteks().ruangRujukan();

const PERABOT = [
  {
    nama: 'panel MCB jalur timur',
    kotak: { x: G.PANEL_MCB.x, y: G.PANEL_MCB.y, w: G.PANEL_MCB.w, h: G.PANEL_MCB.h },
    pemilik: ['drawPanelMcb'],
    dinding: true,                           // orang lewat di depan dinding, bukan menembus panel
  },
  {
    nama: 'rim kertas di atas mesin fotokopi',
    kotak: { x: G.FOTOKOPI.x + 20, y: G.FOTOKOPI.y - 9, w: 12, h: 9 },
    pemilik: ['PROPS:drawFotokopi'],
    dinding: true,                           // di atas tutup mesin, di belakang yang berdiri memfotokopi
  },
  {
    nama: 'pos satpam',
    kotak: { x: G.POS_SATPAM.x, y: G.POS_SATPAM.y, w: G.POS_SATPAM.w, h: G.POS_SATPAM.h },
    pemilik: ['PROPS:drawPosSatpam', 'PROPS:drawPosSatpamKursi'],
    tujuanSah: ['pos satpam'],
  },
  {
    nama: 'pojok baca',
    kotak: { x: G.BACA.x, y: G.BACA.y, w: G.BACA.w, h: G.BACA.h },
    pemilik: ['PROPS:drawPojokBaca', 'gambarKarpetBaca'],
    tujuanSah: ['pojok baca bantal'],
  },
];
const KONTROL_RAMADAN = { x: 422, y: 74, w: 14, h: 18 };
const KONTROL_LAJUR = { x: 300, y: 150, w: 10, h: 10 };

const kotak = [...PERABOT.map((p) => p.kotak), KONTROL_RAMADAN, KONTROL_LAJUR];
const mulai = Date.now();
const hasil = sapuRuangan({ kotak });
console.log(tebal('\nSapuan'));
ok('sapuannya benar-benar berjalan', hasil.namaSumber.length > 80 && hasil.jumlahRute > 10000,
  `${hasil.namaSumber.length} sumber, ${hasil.jumlahTitik} titik, ${hasil.jumlahRute} rute, ${((Date.now() - mulai) / 1000).toFixed(1)} dtk`);

console.log(tebal('\nKontrol'));
{
  const { sumber } = siapaDiKotak(hasil, PERABOT.length);
  ok('negatif: kotak MCB versi pertama menumpuk dekor tema ramadan',
    sumber.some((s) => s.nama === 'drawWall (tema ramadan)'),
    sumber.map((s) => s.nama).join(', ') || 'nol sumber — sapuannya buta tema');
  const { rute } = siapaDiKotak(hasil, PERABOT.length + 1);
  ok('positif: tengah lajur atas dilintasi rute', rute.length > 100, `${rute.length} rute`);
}

console.log(tebal('\nPerabot'));
PERABOT.forEach((p, k) => {
  const { sumber, rute } = siapaDiKotak(hasil, k);
  const { x, y, w, h } = p.kotak;
  const liar = sumber.filter((s) => !p.pemilik.includes(s.nama));
  ok(`${p.nama}: cuma dirinya yang menggambar di x${x}..${x + w} y${y}..${y + h}`, liar.length === 0,
    liar.length ? liar.map((s) => `${s.nama} (${s.piksel} px)`).join(', ') : sumber.map((s) => s.nama).join(', '));
  ok(`${p.nama}: gambarnya sendiri benar-benar ada di kotak itu`, sumber.some((s) => p.pemilik.includes(s.nama)),
    'kalau nol, kotaknya dan gambarnya sudah berpisah');
  if (p.dinding) return;
  /* Rute SAH = yang ujungnya berada DI DALAM kotak perabot itu sendiri: orang
     yang berjalan ke bantal pojok baca, ke rak korannya, ke meja jaga. Bukan
     dicocokkan lewat nama titik — titik goToXY event dinamai menurut berkas
     eventnya ("goToXY 39-gel5-..."), jadi aturan nama akan menolak event
     pojok baca yang justru sah dan harus diperbarui tiap event baru lahir. */
  const diDalam = ([x, y]) => x >= p.kotak.x && x <= p.kotak.x + p.kotak.w && y >= p.kotak.y && y <= p.kotak.y + p.kotak.h;
  const nyasar = rute.filter((r) => !diDalam(r.dari) && !diDalam(r.ke));
  ok(`${p.nama}: tidak ada rute yang cuma LEWAT (semua berujung di dalamnya)`, nyasar.length === 0,
    nyasar.length ? `${nyasar.length} rute, a.l. ${nyasar.slice(0, 3).map((r) => r.asal + ' → ' + r.tujuan).join(' | ')}`
      : `${rute.length} rute, semuanya berangkat dari / tiba di dalam kotaknya`);
});

console.log('\n' + (gagal ? merah(`GAGAL ${gagal}`) + ` · lulus ${lulus}` : hijau(`LULUS ${lulus} pemeriksaan`)));
process.exit(gagal ? 1 : 0);
