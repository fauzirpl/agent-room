#!/usr/bin/env node
// uji-pantri.mjs :: sekat pantri itu DINDING, bukan gambar.
//
// Masalah yang ditutup uji ini punya umur panjang dan tidak pernah kelihatan
// sebagai bug: drawPantry() menggambar sekat kayu di x414 dan y196, tapi
// route() tidak punya pengertian rintangan sama sekali, jadi setiap kaki yang
// menuju pantri menembus kayunya di lajur bawah (y=252). Diukur sebelum
// diperbaiki: 60 dari 60 pasangan asal-tujuan menembus. Penulis event sudah
// menghindarinya satu per satu dengan tangan — "berhenti sebelum sekat pantry
// (x414)", "berakhir di x=404, aman dari sekat kiri pantry", "x=452 tidak
// bisa: pantry menempati x414..478" — yang artinya beban itu ada di orang,
// bukan di kode, dan orang berikutnya pasti lupa.
//
// Yang dijalankan di sini route() YANG ASLI di dalam sandbox uji-event.mjs,
// bukan salinan aturannya: tidak ada tabel jalur di berkas ini yang bisa basi.
// Angka sekat & pintunya juga dibaca dari room.js lewat pantriRujukan(),
// jadi menggeser pintunya di gambar otomatis menggeser yang diperiksa.
//
// Tujuan yang disapu BUKAN daftar tetap: semua goToXY(x, y) literal di
// public/event/*.js dipindai, dan yang jatuh di dalam pantri ikut diuji. Event
// baru yang menaruh orang di pantri otomatis masuk cakupan.
//
// Pakai:
//   node uji-pantri.mjs            jalankan semua pemeriksaan
//   node uji-pantri.mjs --tampil   cetak jalur tiap pasangan (tanpa memvonis)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { muatKonteks, merah, hijau, kuning, abu, tebal } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAMPIL = process.argv.includes('--tampil');

let lulus = 0;
const gagal = [];
const ok = (syarat, ket, rinci) => {
  if (syarat) { lulus++; console.log('  ' + hijau('✓') + ' ' + ket); return true; }
  gagal.push(ket + (rinci ? '\n      ' + rinci : ''));
  console.log('  ' + merah('✗') + ' ' + ket + (rinci ? '\n      ' + abu(rinci) : ''));
  return false;
};

const ctx = muatKonteks();
if (typeof ctx.route !== 'function') throw new Error('route() tidak ditemukan di room.js');
if (typeof ctx.pantriRujukan !== 'function') {
  throw new Error('pantriRujukan() tidak ditemukan di room.js — jendela baca uji ini hilang');
}
const R = ctx.pantriRujukan();
const { PANTRI, LANE_UP, LANE_DOWN, STATIONS, diPantri } = R;

/* --------------------------------------------------------------- geometri *
 * Kayu yang PEJAL, diturunkan dari PANTRI — bukan diketik ulang. Panel kiri
 * dipotong dua oleh bukaan pintu; panel belakang utuh. */
const pintu0 = PANTRI.pintuY, pintu1 = PANTRI.pintuY + PANTRI.pintuH;
const KAYU = [
  { nama: 'panel kiri (atas pintu)', x0: PANTRI.x, x1: PANTRI.x + PANTRI.tebal, y0: PANTRI.y, y1: pintu0 },
  { nama: 'panel kiri (bawah pintu)', x0: PANTRI.x, x1: PANTRI.x + PANTRI.tebal, y0: pintu1, y1: PANTRI.y1 },
  { nama: 'panel belakang', x0: PANTRI.x, x1: PANTRI.x1, y0: PANTRI.y, y1: PANTRI.y + PANTRI.atas },
];
const DALAM = { nama: 'ruang pantri', x0: PANTRI.x + PANTRI.tebal, x1: PANTRI.x1 + 2,
                y0: PANTRI.y + PANTRI.atas, y1: PANTRI.y1 };

// Ruas jalur selalu mendatar/tegak, jadi tumpang-tindih kotak = perpotongan.
const tabrak = (x0, y0, x1, y1, k) =>
  Math.max(x0, x1) > k.x0 && Math.min(x0, x1) < k.x1 &&
  Math.max(y0, y1) > k.y0 && Math.min(y0, y1) < k.y1;

const lajur = (y) => (y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN);
const jalur = (a, b) => ctx.route(a[0], a[1], lajur(a[1]), b[0], b[1], lajur(b[1]));
const gambarJalur = (a, p) => [a[0] + ',' + a[1], ...p.map((t) => t.x + ',' + t.y)].join(' → ');

/* -------------------------------------------------------------- tujuan --- *
 * Dipindai dari definisi event, bukan didaftar tangan. goToXY(<angka>,<angka>)
 * saja: yang koordinatnya dihitung (mis. `428 + i * 14`) tidak bisa dibaca
 * statis, jadi tiga titik ngerumpi-di-pantry ditambahkan terpisah di bawah. */
function tujuanDariEvent() {
  const dir = path.join(__dirname, 'public', 'event');
  const titik = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/goToXY\(\s*(-?\d+)\s*,\s*(-?\d+)/g)) {
      const x = +m[1], y = +m[2];
      if (!diPantri(x, y)) continue;
      if (!titik.has(x + ',' + y)) titik.set(x + ',' + y, { xy: [x, y], asal: f });
    }
  }
  return [...titik.values()];
}

const dariEvent = tujuanDariEvent();
// ngerumpi-di-pantry menaruh tiga orang di `428 + i*14, 272` — dihitung, jadi
// tidak terpindai. Ditulis di sini supaya titik terjauhnya tetap teruji.
const TAMBAHAN = [[428, 272], [442, 272], [456, 272]];
const TUJUAN = [...dariEvent.map((t) => t.xy), ...TAMBAHAN];

const ASAL = [
  ['meja kerja', [STATIONS.think.x, STATIONS.think.y]],
  ['meja rapat', [STATIONS.rapat.x, STATIONS.rapat.y]],
  ['lemari arsip', [STATIONS.read.x, STATIONS.read.y]],
  ['ruang tunggu', [STATIONS.idle.x, STATIONS.idle.y]],
  ['rak server', [STATIONS.server.x, STATIONS.server.y]],
  ['ruang kadis', [STATIONS.agent.x, STATIONS.agent.y]],
  ['lantai bawah pantri', [452, 300]],
  ['depan pintu pantri', [R.PANTRI_LUAR, PANTRI.ambang]],
];

console.log(tebal('\nA — tapak pantri tidak pernah ditembus'));
console.log(abu(`  sekat x${PANTRI.x}..${PANTRI.x1} y${PANTRI.y}..${PANTRI.y1}, pintu y${pintu0}..${pintu1}`));
console.log(abu(`  ${TUJUAN.length} tujuan (${dariEvent.length} terpindai dari public/event/) × ${ASAL.length} asal, dua arah`));

const langgarKayu = [], langgarDalam = [];
let pasangan = 0;
for (const [nama, a] of ASAL) {
  for (const b of TUJUAN) {
    for (const [p, q, arah] of [[a, b, '→'], [b, a, '←']]) {
      pasangan++;
      const jl = jalur(p, q);
      const ujungDalam = diPantri(p[0], p[1]) || diPantri(q[0], q[1]);
      let cx = p[0], cy = p[1];
      for (const t of jl) {
        for (const k of KAYU) {
          if (tabrak(cx, cy, t.x, t.y, k)) {
            langgarKayu.push(`${nama} ${arah} ${b} lewat ${k.nama}: (${cx},${cy})→(${t.x},${t.y})`);
          }
        }
        if (!ujungDalam && tabrak(cx, cy, t.x, t.y, DALAM)) {
          langgarDalam.push(`${nama} ${arah} ${b}: (${cx},${cy})→(${t.x},${t.y})`);
        }
        cx = t.x; cy = t.y;
      }
      if (TAMPIL) console.log('  ' + abu(`${nama} ${arah} ${b}: ${gambarJalur(p, jl)}`));
    }
  }
}

ok(langgarKayu.length === 0,
   `tidak ada ruas yang menembus kayu sekat (${pasangan} jalur)`,
   langgarKayu.slice(0, 5).join('\n      '));
ok(langgarDalam.length === 0,
   'tidak ada yang memotong ruang pantri tanpa urusan di dalamnya',
   langgarDalam.slice(0, 5).join('\n      '));

console.log(tebal('\nB — pintunya benar-benar dipakai, bukan sekadar ada'));
// Dinding yang menutup SEMUA jalan juga akan lolos A. Yang membedakan pantri
// yang punya pintu dari pantri yang tersegel: jalur masuk harus benar-benar
// melewati pita bukaan, dan harus sampai.
let lewatPintu = 0, sampai = 0;
for (const b of TUJUAN) {
  const jl = jalur([STATIONS.think.x, STATIONS.think.y], b);
  const akhir = jl[jl.length - 1];
  if (akhir && akhir.x === b[0] && akhir.y === b[1]) sampai++;
  let cx = STATIONS.think.x, cy = STATIONS.think.y;
  for (const t of jl) {
    // ruas mendatar yang menyeberangi kolom sekat kiri di dalam pita bukaan
    if (cy === t.y && cy > pintu0 && cy < pintu1 &&
        Math.min(cx, t.x) <= PANTRI.x && Math.max(cx, t.x) >= PANTRI.x + PANTRI.tebal) {
      lewatPintu++; break;
    }
    cx = t.x; cy = t.y;
  }
}
ok(sampai === TUJUAN.length, `semua ${TUJUAN.length} tujuan pantri tetap tercapai (jalurnya berujung di titiknya)`);
ok(lewatPintu === TUJUAN.length, `semua jalur masuk melewati bukaan pintu (${lewatPintu}/${TUJUAN.length})`);

console.log(tebal('\nC — ambang pintu tidak tertelan sekatnya sendiri'));
// Jebakan yang sudah menggigit sekali waktu pintunya dipasang: prop pantri
// ber-sortY 270. Ambang yang jatuh di ATAS angka itu membuat orang yang sedang
// berdiri di pintu digambar DI BELAKANG sekat — terbaca seperti tertelan.
const H = ctx.__jembatan__;
const propPantri = H.PROPS.find((p) => p.draw && p.draw.name === 'drawPantry');
ok(!!propPantri, 'prop pantri ketemu di PROPS');
ok(propPantri && PANTRI.ambang > propPantri.sortY,
   `ambang pintu (${PANTRI.ambang}) di depan sortY prop pantri (${propPantri && propPantri.sortY})`);
ok(PANTRI.ambang > pintu0 && PANTRI.ambang < pintu1,
   `ambang (${PANTRI.ambang}) berada di dalam bukaan pintu (${pintu0}..${pintu1})`);

console.log(tebal('\nD — titik bantu router berdiri di lantai bebas'));
ok(R.PANTRI_LUAR < PANTRI.x,
   `titik depan pintu (x=${R.PANTRI_LUAR}) di luar sekat (x=${PANTRI.x})`);
ok(R.PANTRI_DALAM > PANTRI.x + PANTRI.tebal,
   `titik dalam (x=${R.PANTRI_DALAM}) sudah lewat kusen (x=${PANTRI.x + PANTRI.tebal})`);
// Kolom memutar dipisah dari titik pintu justru karena kaki kipas berdiri
// (drawKipas: x390..410, y292..295) ada tepat di kolom pintu.
ok(R.PANTRI_MEMUTAR < 390 || R.PANTRI_MEMUTAR > 410,
   `kolom memutar (x=${R.PANTRI_MEMUTAR}) tidak menginjak kaki kipas (x390..410)`);
ok(R.PANTRI_BAWAH >= PANTRI.y1,
   `lajur memutar (y=${R.PANTRI_BAWAH}) di bawah tapak pantri (y=${PANTRI.y1})`);

if (gagal.length) {
  console.log('\n' + merah(tebal(`${gagal.length} GAGAL`)) + ` dari ${lulus + gagal.length} pemeriksaan`);
  for (const g of gagal) console.log('  ' + merah('✗') + ' ' + g);
  process.exit(1);
}
console.log('\n' + hijau(tebal(`LULUS ${lulus} pemeriksaan`)) +
  abu(` · ${pasangan} jalur diuji, ${dariEvent.length} tujuan terpindai dari public/event/`));
