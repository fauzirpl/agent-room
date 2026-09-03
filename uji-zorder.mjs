#!/usr/bin/env node
// uji-zorder.mjs :: uji z-order (depth sort) deterministik untuk frame() di
// public/room.js — golden berupa URUTAN ID lapisan, bukan angka y.
//
// Masalahnya: urutan gambar prop vs pegawai diatur oleh beberapa aturan yang
// saling tindih di frame() (tabel PROPS.sortY, pita lajur bawah y 230..265
// yang digeser +24, SORT_KURSI_DEKAT untuk yang duduk di kursi rapat sisi
// dekat, pengecualian a.butuh/a.path, sortY prop event), dan tiap kali salah
// satunya digeser (commit 01d698d: "pegawai tertelan meja rapat") bug-nya
// cuma kelihatan kalau seseorang kebetulan berdiri di y yang salah di
// peramban. Uji ini memanggil frame() ASLI di sandbox uji-event.mjs dengan
// fixture pegawai di posisi tetap, memata-matai drawPerson/PROPS[].draw/
// gambarProp supaya URUTAN pemanggilannya terekam, lalu membandingkannya
// dengan uji-zorder.golden.json. Yang dibandingkan urutan id — angka y boleh
// berubah selama urutannya tetap; yang berubah urutan harus disengaja
// (--perbarui) dan ketahuan di diff.
//
// Tidak ada salinan aturan sort di sini: frame() yang asli yang jalan, jadi
// tidak ada yang bisa basi. Yang ditiru cuma bentuk objek pegawai
// (buatSatuOrang dari uji-event.mjs + update() kosong).
//
// Pakai:
//   node uji-zorder.mjs              bandingkan dengan golden, exit 1 kalau beda
//   node uji-zorder.mjs --perbarui   tulis ulang golden dari keadaan sekarang
//   node uji-zorder.mjs --tampil     cetak urutan tiap kasus (tanpa membandingkan)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  muatKonteks, buatSatuOrang, buatS, buatPristine, resetRuangan,
  merah, hijau, kuning, abu, tebal,
} from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(__dirname, 'uji-zorder.golden.json');

/* ------------------------------------------------------------- fixture --- *
 * Angka-angka di sini DIAMBIL dari konstanta room.js waktu ditulis: pita
 * bawah 230..265 (frame()), LANE_UP 164, LANE_DOWN 252, SORT_KURSI_DEKAT 255,
 * meja rapat sortY 249, kursi dekat 260, pantry 270, meja kerja 348 /
 * MEJA_KERJA_Y 350, ruang tunggu y 288, sortY bawaan prop event 118.
 * Kalau konstanta itu digeser, golden yang berubah adalah sinyalnya. */
const KASUS = [
  { id: 'pita-bawah-240-berdiri-depan-meja-rapat',
    ket: 'y=240 berdiri diam (gorengan-di-meja-rapat / oleh-oleh-dinas-luar): harus DI DEPAN kursi rapat dekat',
    orang: [{ id: 'A', x: 250, y: 240 }] },
  { id: 'pita-bawah-234-hari-korpri',
    ket: 'y=234 (hari-korpri): pita bawah digeser ke >=230 supaya tidak tertelan meja rapat',
    orang: [{ id: 'A', x: 250, y: 234 }] },
  { id: 'pita-bawah-230-batas-bawah',
    ket: 'y=230 tepat di batas bawah pita: masih dapat +24',
    orang: [{ id: 'A', x: 250, y: 230 }] },
  { id: 'luar-pita-229',
    ket: 'y=229 satu piksel di luar pita: dipakai y mentah, jatuh di belakang meja rapat',
    orang: [{ id: 'A', x: 250, y: 229 }] },
  { id: 'pita-bawah-265-batas-atas',
    ket: 'y=265 tepat di batas atas pita: masih dapat +24',
    orang: [{ id: 'A', x: 250, y: 265 }] },
  { id: 'luar-pita-266',
    ket: 'y=266 satu piksel di luar pita: dipakai y mentah',
    orang: [{ id: 'A', x: 250, y: 266 }] },
  { id: 'duduk-kursi-rapat-dekat',
    ket: 'station rapat, hadap up, diam, tidak menunggu: tenggelam di belakang sandaran kursi dekat (SORT_KURSI_DEKAT)',
    orang: [{ id: 'A', x: 250, y: 240, station: 'rapat', hadap: 'up' }] },
  { id: 'duduk-dekat-berdiri-menunggu-keputusan',
    ket: 'sama, tapi a.butuh terisi: dia BERDIRI dari kursinya, naik ke depan sandaran',
    orang: [{ id: 'A', x: 250, y: 240, station: 'rapat', hadap: 'up', butuh: { sebab: 'izin' } }] },
  { id: 'duduk-dekat-masih-berjalan',
    ket: 'sama, tapi path belum kosong: belum duduk, ikut aturan pita',
    orang: [{ id: 'A', x: 250, y: 240, station: 'rapat', hadap: 'up', path: [{ x: 250, y: 240 }] }] },
  { id: 'duduk-kursi-rapat-jauh',
    ket: 'station rapat hadap down di y=190: di depan kursi jauh, di belakang meja rapat',
    orang: [{ id: 'A', x: 250, y: 190, station: 'rapat', hadap: 'down' }] },
  { id: 'meja-kerja-berdiri-350',
    ket: 'MEJA_KERJA_Y 350 > sortY meja kerja 348: badan di depan papan meja',
    orang: [{ id: 'A', x: 176, y: 350, station: 'think', hadap: 'up' }] },
  { id: 'meja-kerja-di-belakang-340',
    ket: 'y=340 < 348: tertutup papan meja kerja',
    orang: [{ id: 'A', x: 176, y: 340, station: 'think', hadap: 'up' }] },
  { id: 'lajur-atas-dekat-rak-server',
    ket: 'LANE_UP 164 di depan rak server (sortY 118), di belakang kursi jauh (168)',
    orang: [{ id: 'A', x: 420, y: 164, station: 'server' }] },
  { id: 'dua-pegawai-tumpang-tindih-y-sama',
    ket: 'y sama persis: sort stabil, urutan sisipan (agents dulu, lalu peserta, lalu standby)',
    orang: [{ id: 'A', x: 240, y: 252 }, { id: 'B', x: 244, y: 252, wadah: 'peserta' }, { id: 'C', x: 248, y: 252, wadah: 'standby' }] },
  { id: 'dua-pegawai-selisih-satu-piksel',
    ket: 'yang lebih bawah (y besar) digambar belakangan walau disisipkan lebih dulu',
    orang: [{ id: 'A', x: 240, y: 253 }, { id: 'B', x: 244, y: 252 }] },
  { id: 'standby-ruang-tunggu-288',
    ket: 'standby berdiri di ruang tunggu (idle y=288): di depan pantry (270), sejajar dispenser/tong (288)',
    orang: [{ id: 'S1', x: 282, y: 288, station: 'idle', wadah: 'standby' }] },
  { id: 'event-prop-sortY-250-vs-pegawai-pita',
    ket: 'prop event ber-sortY 250 (kucing di karpet) harus tertutup pegawai pita bawah (240+24)',
    orang: [{ id: 'A', x: 250, y: 240 }], eventProp: { id: 'uji-kucing', sortY: 250 } },
  { id: 'event-prop-tanpa-sortY-118',
    ket: 'prop event tanpa sortY memakai 118 (garis kaki perabot dinding): di belakang pegawai lajur atas',
    orang: [{ id: 'A', x: 300, y: 120 }], eventProp: { id: 'uji-prop-bawaan' } },
];

/* --------------------------------------------------------- jalankan ---- */
function siapkan() {
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  if (typeof ctx.frame !== 'function') throw new Error('frame() tidak ditemukan di room.js — uji zorder perlu dibaca ulang');
  if (!Array.isArray(H.PROPS) || !H.PROPS.length) throw new Error('PROPS tidak terbaca dari room.js');
  if (typeof ctx.drawPerson !== 'function') throw new Error('drawPerson() tidak ditemukan di room.js');
  ctx.__ctxPalsu.__kendali.ketat = false;      // gambar milik room.js sendiri bukan yang diuji di sini
  const pristine = buatPristine(ctx);
  const urutan = [];
  // Mata-mata. Penimpaan fungsi global (`ctx.drawPerson = ...`) MENEMBUS ke
  // dalam vm karena deklarasi function di classic script adalah properti
  // objek global, dan pencarian identifier bebas lewat objek global itu —
  // sudah dibuktikan lewat vm kecil sebelum dipakai di sini.
  for (const p of H.PROPS) {
    const nama = p.draw && p.draw.name ? p.draw.name : 'prop-tanpa-nama';
    p.draw = () => { urutan.push('prop:' + nama); };
  }
  ctx.drawPerson = (a) => { urutan.push('orang:' + a.id); };
  ctx.drawSorot = () => {};
  return { ctx, H, pristine, urutan };
}

function jalankanKasus({ ctx, H, pristine, urutan }, k) {
  H.agents.clear();
  H.peserta.length = 0;
  H.standby.length = 0;
  H.eventHidup.length = 0;
  H.setTerpilih(null);
  resetRuangan(ctx, pristine);
  buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  for (const o of k.orang) {
    const a = buatSatuOrang(ctx, false);
    Object.assign(a, {
      id: o.id, x: o.x, y: o.y,
      station: o.station || 'idle',
      hadap: o.hadap || null,
      path: o.path || [],
      butuh: o.butuh || null,
      state: 'idle',
      update() {},                         // frame() memanggil a.update(dt); dt=0 jadi tidak ada gerak
    });
    if (o.wadah === 'peserta') H.peserta.push(a);
    else if (o.wadah === 'standby') { a.standby = true; H.standby.push(a); }
    else H.agents.set(a.id, a);
  }
  if (k.eventProp) {
    const def = { id: k.eventProp.id, kelas: 'latar', durasi: 100,
      gambarProp() { urutan.push('event:' + k.eventProp.id); } };
    if (k.eventProp.sortY != null) def.sortY = k.eventProp.sortY;
    H.eventHidup.push({ def, id: def.id, umur: 0, sisa: 100, data: {}, aktor: [], tanda: new Set() });
  }
  // ts == last → dt = 0: tidak ada tick gerak, tidak ada undian event
  // (jedaEvent tidak berkurang), cuma satu frame gambar.
  const TS = 5000;
  H.setLast(TS);
  H.setNow(TS);
  urutan.length = 0;
  ctx.frame(TS);
  const hasil = urutan.slice();
  H.eventHidup.length = 0;
  return hasil;
}

function kumpulkan() {
  const alat = siapkan();
  const kasus = {};
  for (const k of KASUS) kasus[k.id] = jalankanKasus(alat, k);
  return kasus;
}

/* ------------------------------------------------------------- banding --- */
const dinamis = (label) => label.startsWith('orang:') || label.startsWith('event:');
const tetangga = (arr, i) => `${i > 0 ? arr[i - 1] : '(awal)'}  →  ${arr[i]}  →  ${i < arr.length - 1 ? arr[i + 1] : '(akhir)'}`;

function bandingkan(golden, sekarang) {
  const beda = [];
  const semuaId = new Set([...Object.keys(golden), ...Object.keys(sekarang)]);
  for (const id of semuaId) {
    const g = golden[id], s = sekarang[id];
    if (!g) { beda.push({ id, pesan: 'kasus baru, belum ada di golden' }); continue; }
    if (!s) { beda.push({ id, pesan: 'ada di golden tapi tidak ada lagi di fixture' }); continue; }
    if (g.length === s.length && g.every((v, i) => v === s[i])) continue;
    const baris = [];
    let awal = 0;
    while (awal < g.length && awal < s.length && g[awal] === s[awal]) awal++;
    baris.push(`beda pertama di indeks ${awal}: golden '${g[awal] ?? '(habis)'}', sekarang '${s[awal] ?? '(habis)'}'`);
    for (const label of new Set([...g, ...s].filter(dinamis))) {
      const ig = g.indexOf(label), is = s.indexOf(label);
      if (ig === is && g[ig - 1] === s[is - 1] && g[ig + 1] === s[is + 1]) continue;
      baris.push(`  ${label}`);
      baris.push(`    golden  : ${ig >= 0 ? tetangga(g, ig) : '(tidak ada)'}`);
      baris.push(`    sekarang: ${is >= 0 ? tetangga(s, is) : '(tidak ada)'}`);
    }
    beda.push({ id, pesan: baris.join('\n') });
  }
  return beda;
}

/* ----------------------------------------------------------------- CLI --- */
function main() {
  const argv = process.argv.slice(2);
  const sekarang = kumpulkan();

  if (argv.includes('--tampil')) {
    for (const k of KASUS) {
      console.log(tebal(k.id) + abu('  ' + k.ket));
      const arr = sekarang[k.id];
      arr.forEach((label, i) => console.log((dinamis(label) ? hijau : abu)(`  ${String(i).padStart(2)}  ${label}`)));
      console.log();
    }
    return;
  }

  if (argv.includes('--perbarui')) {
    const isi = {
      _catatan: 'Golden urutan gambar frame() room.js per kasus fixture uji-zorder.mjs. '
        + 'Isinya URUTAN label (prop:<fungsi draw>, orang:<id>, event:<id>), bukan angka y. '
        + 'Perbarui dengan `node uji-zorder.mjs --perbarui` HANYA kalau perubahan urutannya memang disengaja.',
      kasus: sekarang,
    };
    fs.writeFileSync(GOLDEN, JSON.stringify(isi, null, 2) + '\n');
    console.log(hijau(`golden ditulis: ${path.basename(GOLDEN)} (${KASUS.length} kasus)`));
    return;
  }

  if (!fs.existsSync(GOLDEN)) {
    console.log(merah(`golden belum ada: ${path.basename(GOLDEN)}`));
    console.log(abu('jalankan `node uji-zorder.mjs --perbarui` dulu, lalu commit berkasnya'));
    process.exit(1);
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')).kasus || {};
  const beda = bandingkan(golden, sekarang);
  for (const k of KASUS) {
    const b = beda.find((x) => x.id === k.id);
    console.log((b ? merah('  ✗ ') : hijau('  ✓ ')) + k.id.padEnd(44) + abu(k.ket));
    if (b) for (const baris of b.pesan.split('\n')) console.log(merah('      ' + baris));
  }
  for (const b of beda.filter((x) => !KASUS.some((k) => k.id === x.id))) {
    console.log(merah('  ✗ ' + b.id) + '\n' + merah('      ' + b.pesan));
  }
  console.log();
  if (beda.length) {
    console.log(merah(`${beda.length} kasus z-order berubah dari golden.`)
      + abu(' Kalau memang disengaja: node uji-zorder.mjs --perbarui'));
    process.exit(1);
  }
  console.log(hijau(`${KASUS.length} kasus z-order sama dengan golden.`));
}

main();
