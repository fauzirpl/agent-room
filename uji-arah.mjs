#!/usr/bin/env node
// uji-arah.mjs :: arah hadap penonton tidak boleh ikut ditulis event.
//
// Kelas bugnya begini. `hadapkan(o, tx, ty)` (00-dasar.js) menulis DUA field:
//     a.hadap = a.face = <arah>
// `face` itu sementara — room.js memasangnya ulang tiap langkah, dan
// arrive()/setButuh()/tickPulang() memulihkannya dari hadap. `hadap` TIDAK:
// yang menulisnya ulang cuma goTo/goToXY/pulangKe, dan ketiganya menuntut
// PERJALANAN BARU. Pegawai yang sudah duduk di mejanya tidak pernah dapat
// perjalanan baru — handle() cuma memanggil goTo() kalau stasiun tool-nya
// BEDA, dan stasiunPulang() orang yang sudah di mejanya selalu mengembalikan
// stasiun yang sedang ditempatinya.
//
// Jadi begitu sebuah event memanggil hadapkan() pada orang yang TIDAK
// dipinjamnya sebagai pemeran, arah itu menempel di badan orang tersebut
// sampai sesinya berakhir: pegawai berdiri menyamping di depan laptopnya,
// tanpa batas waktu, gara-gara tikus lewat di plafon dua puluh menit lalu.
// Enam penonton sekaligus pernah begitu (tikus-lari-di-atas-plafon), dan
// tidak ada satu pun harness yang melihatnya — tidak ada exception, tidak ada
// NaN, tidak ada peringatan.
//
// Yang benar untuk penonton adalah menoleh() (00-dasar.js) — atau mendongak()
// untuk "semua menengadah", atau menolehKe() untuk orang yang menghampiri
// mejanya: ketiganya cuma menulis face, menitipkan face lama di o.tolehBalik,
// dan tickKongsi() (room.js) yang mengembalikannya.
//
// Ujinya semantik, bukan regex: jalankan tiap event sampai habis di sandbox
// uji-event.mjs, catat siapa saja yang PERNAH masuk E.aktor, lalu bandingkan
// hadap semua orang yang tidak pernah masuk situ dengan potret sebelum event
// mulai. Pemeran sendiri tidak diperiksa — event memang berhak mengarahkan
// orang yang dipinjamnya, dan mereka berjalan lagi sesudahnya.
//
// Pakai:
//   node uji-arah.mjs

import {
  muatKonteks, buatE, buatS, buatPristine, resetRuangan,
  merah, hijau, kuning, tebal,
} from './uji-event.mjs';

let gagal = 0;
const lulus = (t) => console.log('  ' + hijau('✓') + ' ' + t);
const tolak = (t, ket) => { gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };

const ctx = muatKonteks();
const pristine = buatPristine(ctx);
const { eventById } = ctx.__jembatan__;

console.log(tebal('\nArah: event tidak menulis hadap ke orang yang bukan pemerannya'));

const kena = [];
let diuji = 0, adaYangMemutar = 0;

for (const [id, def] of eventById) {
  resetRuangan(ctx, pristine);
  const S = buatS(ctx, { jam: 10, hujan: 0, petir: false, ramai: true });
  ctx.__jembatan__.setS(S);
  const E = buatE(def);

  const awal = new Map(S.orang.map((o) => [o, o.hadap]));
  // E.aktor berubah sepanjang adegan (pinjam menyusul, lepas duluan), jadi
  // dicatat KUMULATIF tiap frame — bukan dipotret sekali di akhir.
  const pernah = new Set();
  const catat = () => { for (const a of E.aktor) pernah.add(a); };

  try { if (def.mulai) def.mulai(E, S); } catch (e) { continue; }
  catat();
  diuji++;

  try {
    const dt = 0.25;
    for (let t = 0; t < (def.durasi || 10); t += dt) {
      E.umur += dt; E.sisa -= dt;
      if (def.tick) def.tick(E, dt, S);
      catat();
      if (E.selesaiCepat) break;
    }
    if (def.selesai) def.selesai(E, S);
  } catch (e) { continue; }

  // Penonton yang benar-benar diputar lewat jalur yang SAH (menoleh/mendongak
  // memasang tolehSampai) dihitung sebagai jangkauan: kalau angkanya nol,
  // yang hijau bukan kodenya melainkan fixture yang tidak punya penonton.
  if (S.orang.some((o) => !pernah.has(o) && o.tolehSampai)) adaYangMemutar++;

  const rusak = S.orang.filter((o) => !pernah.has(o) && o.hadap !== awal.get(o));
  if (rusak.length) {
    kena.push([id, rusak.length, rusak.map((o) => `${awal.get(o)}→${o.hadap}`).join(', ')]);
  }
}

if (kena.length) {
  for (const [id, n, ket] of kena) {
    tolak(`${id}: menulis hadap ke ${n} penonton (${ket})`,
      'pakai menoleh(daftar, tx, ty, ms) dari 00-dasar.js — mendongak(daftar, ms) untuk "semua menengadah", menolehKe(...) untuk orang yang menghampiri mejanya; hadapkan() cuma untuk pemeran yang dipinjam event ini sendiri');
  }
} else {
  lulus(`${diuji} event dijalankan penuh: nol tulisan hadap ke orang yang bukan pemeran`);
}

// Jangkauan, bukan hiasan: pelajaran dari lubang fixture yang dulu membuat
// "0 dari 36 syarat" terbaca seperti kelulusan.
if (adaYangMemutar) {
  lulus(`${adaYangMemutar} event benar-benar memutar penonton lewat menoleh()/mendongak() — pemeriksaannya tidak hampa`);
} else {
  console.log('  ' + kuning('!') + ' tidak ada satu pun event yang memutar penonton di fixture ini —'
    + ' hijau di atas belum tentu berarti kodenya benar, periksa dulu fixture buatOrangPalsu()');
}

console.log();
if (gagal) { console.log(merah(tebal(`${gagal} pemeriksaan gagal`))); process.exit(1); }
console.log(hijau(tebal('semua pemeriksaan arah lulus')));
