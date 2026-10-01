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
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  muatKonteks, buatSatuOrang, buatS, buatE, buatPristine, resetRuangan,
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

/* -------------------------------------------- prop event tertimpa perabot --- *
 * Golden di atas menjaga urutan fixture pegawai, bukan isi gambar event. Yang
 * lolos darinya: prop event yang sortY-nya jatuh SEBELUM perabot yang menutupi
 * gambarnya. Sembilan event di atas taplak meja rapat (gorengan, nasi kotak,
 * kue ulang tahun, toples arisan, tumpeng, ...) dulu ber-sortY 200..205 —
 * meja rapatnya sendiri 249 — jadi taplak dilukis belakangan dan menimpa
 * SELURUH barangnya; dua event yang paling sering di katalog tidak pernah
 * kelihatan. Di sini tiap gambarProp dijalankan (mulai + tick, Math.random
 * diberi benih) terhadap kanvas pencatat sel 1x1, begitu juga gambar semua
 * PROPS; prop yang >= 90% selnya tertimpa perabot ber-sortY lebih besar =
 * gagal. Yang memang sengaja di balik perabot dicatat di SENGAJA_TERTUTUP. */
const SENGAJA_TERTUTUP = {
  'tikus-lewat-kolong': 'lewat KOLONG lemari arsip: memang di balik perabot',
};
const AMBANG_TERTUTUP = 0.9;

// Kanvas 2D yang cuma mencatat sel 1x1 mana yang diwarnai (kotak luar tiap
// fillRect/fill/stroke/drawImage/teks, ikut transform). Sosok orang dilewati.
function kanvasSel() {
  const K = { sel: new Set(), alphaMin: 0.05, diam: 0 };
  let T = [1, 0, 0, 1, 0, 0], jalur = [], alpha = 1;
  const tumpuk = [];
  const kali = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const ubah = (x, y) => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]];
  const tandai = (titik) => {
    if (K.diam || alpha < K.alphaMin || !titik.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of titik) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
    // selubung selayar (kilat, mati lampu) bukan benda yang bisa tertimpa
    if (!Number.isFinite(x0 + x1 + y0 + y1) || x1 - x0 > 400 || y1 - y0 > 250) return;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) K.sel.add(x + ',' + y);
  };
  const kotak = (x, y, w, h) => tandai([ubah(x, y), ubah(x + w, y), ubah(x, y + h), ubah(x + w, y + h)]);
  const isi = {
    save() { tumpuk.push([T.slice(), alpha]); },
    restore() { const s = tumpuk.pop(); if (s) [T, alpha] = s; },
    setTransform(a, b, c, d, e, f) { T = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
    resetTransform() { T = [1, 0, 0, 1, 0, 0]; },
    transform(a, b, c, d, e, f) { T = kali(T, [a, b, c, d, e, f]); },
    translate(x, y) { T = kali(T, [1, 0, 0, 1, x, y]); },
    scale(x, y) { T = kali(T, [x, 0, 0, y, 0, 0]); },
    rotate(r) { const c = Math.cos(r), s = Math.sin(r); T = kali(T, [c, s, -s, c, 0, 0]); },
    getTransform() { return { a: T[0], b: T[1], c: T[2], d: T[3], e: T[4], f: T[5] }; },
    beginPath() { jalur = []; },
    moveTo(x, y) { jalur.push(ubah(x, y)); },
    lineTo(x, y) { jalur.push(ubah(x, y)); },
    rect(x, y, w, h) { jalur.push(ubah(x, y), ubah(x + w, y), ubah(x, y + h), ubah(x + w, y + h)); },
    arc(x, y, r) { jalur.push(ubah(x - r, y - r), ubah(x + r, y - r), ubah(x - r, y + r), ubah(x + r, y + r)); },
    ellipse(x, y, rx, ry) { jalur.push(ubah(x - rx, y - ry), ubah(x + rx, y - ry), ubah(x - rx, y + ry), ubah(x + rx, y + ry)); },
    quadraticCurveTo(a, b, x, y) { jalur.push(ubah(a, b), ubah(x, y)); },
    bezierCurveTo(a, b, c, d, x, y) { jalur.push(ubah(a, b), ubah(c, d), ubah(x, y)); },
    arcTo(a, b, x, y) { jalur.push(ubah(a, b), ubah(x, y)); },
    fill() { tandai(jalur); },
    stroke() { tandai(jalur); },
    fillRect: kotak, strokeRect: kotak,
    fillText(t, x, y) { kotak(x, y - 6, String(t).length * 4, 7); },
    drawImage(img, ...a) {
      if (a.length === 2) kotak(a[0], a[1], img.width || 1, img.height || 1);
      else if (a.length === 4) kotak(...a);
      else if (a.length === 8) kotak(a[4], a[5], a[6], a[7]);
    },
    measureText(t) { return { width: String(t).length * 4, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createConicGradient() { return { addColorStop() {} }; },
    createPattern() { return { setTransform() {} }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) }; },
    getLineDash() { return []; },
    isPointInPath() { return false; },
  };
  K.ctx = new Proxy(isi, {
    get: (t, k) => (k in t ? t[k] : k === 'globalAlpha' ? alpha : () => {}),
    set: (t, k, v) => { if (k === 'globalAlpha') alpha = Number(v); return true; },
  });
  K.reset = () => { K.sel.clear(); T = [1, 0, 0, 1, 0, 0]; jalur = []; alpha = 1; tumpuk.length = 0; };
  return K;
}

function periksaTertutup() {
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  const pristine = buatPristine(ctx);
  const K = kanvasSel();
  const drawPersonAsli = ctx.drawPerson;
  ctx.drawPerson = (a) => { K.diam++; try { drawPersonAsli(a); } finally { K.diam--; } };
  const acakAsli = Math.random;
  let benih = 20260930;
  Math.random = () => { benih = (benih * 1103515245 + 12345) % 2147483648; return benih / 2147483648; };
  const gagal = [];
  let diperiksa = 0;
  try {
    // perabot: cuma piksel pejal (alpha >= 0,5) — bayangan tembus tidak menutupi
    K.alphaMin = 0.5;
    const perabot = H.PROPS.map((p) => {
      K.reset();
      try { ctx.gambarKe(K.ctx, () => p.draw(false)); } catch { /* perabot yang butuh keadaan lain: lewati */ }
      return { sortY: p.sortY, nama: (p.draw && p.draw.name) || '?', sel: new Set(K.sel) };
    });
    K.alphaMin = 0.05;
    for (const def of H.EVENT_ACAK) {
      if (typeof def.gambarProp !== 'function') continue;
      resetRuangan(ctx, pristine);
      const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: true });
      const E = buatE(def);
      let terbanyak = new Set();
      const cicip = () => {
        K.reset();
        try { ctx.gambarKe(K.ctx, () => def.gambarProp(E, S)); } catch { return; }
        if (K.sel.size > terbanyak.size) terbanyak = new Set(K.sel);
      };
      try {
        def.mulai && def.mulai(E, S);
        cicip();
        const dt = Math.min(1, Math.max(0.1, (def.durasi || 10) / 24));
        for (let n = 1; E.sisa > 0 && n <= 400; n++) {
          E.umur += dt; E.sisa -= dt;
          def.tick && def.tick(E, dt, S);
          if (n % 2 === 0) cicip();
        }
        cicip();
        def.selesai && def.selesai(E, S);
      } catch { /* event yang butuh keadaan lain: sel yang sempat tercatat tetap dinilai */ }
      for (const a of E.aktor) { a.eventKerja = null; a.betah = a.betahAsli || false; }
      if (terbanyak.size < 6) continue;          // titik satu-dua piksel (lalat, nyamuk): tidak bermakna
      diperiksa++;
      const sy = def.sortY == null ? 118 : def.sortY;
      const oleh = new Map();
      let tertutup = 0;
      for (const s of terbanyak) {
        const p = perabot.find((q) => q.sortY > sy && q.sel.has(s));
        if (p) { tertutup++; oleh.set(p.nama, (oleh.get(p.nama) || 0) + 1); }
      }
      const porsi = tertutup / terbanyak.size;
      if (porsi >= AMBANG_TERTUTUP && !SENGAJA_TERTUTUP[def.id]) {
        const siapa = [...oleh.entries()].sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n} (${k})`).join(', ');
        gagal.push(`${def.id}: sortY ${sy}, ${Math.round(porsi * 100)}% dari ${terbanyak.size} piksel tertimpa ${siapa}`);
      }
    }
  } finally {
    Math.random = acakAsli;
  }
  return { gagal, diperiksa };
}

/* -------------------------------------------- isi kaca sesudah langit --- *
 * drawWindow (prop sortY 116) mengisi kaca dengan langit opak, dan dilukis
 * SESUDAH gambarLapis('gambarDinding'). Isi klipJendela() dari gambarDinding
 * dulu dilukis di tempat, jadi tertimbun langit dan tidak pernah kelihatan:
 * Monas & lampu kota, bulan purnama, layangan, kucing berantem, burung di
 * kusen, gerobak bakso, asap genset. Sekarang isinya ditunda ke lapis kaca
 * (lukisKaca di drawWindow). Di sini frame() ASLI dijalankan per event dengan
 * ctx pencatat urutan: tiap isi klipJendela dilukis tepat sekali per
 * panggilan, SESUDAH fillRect langit. Kontrolnya event buatan yang menggambar
 * di kaca TANPA klipJendela — wajib ketahuan tertimbun, bukti pencatatnya
 * memang bisa melihat urutan yang salah. */
const KACA_DIKENAL = ['monas-lampu-malam-dipandangi', 'bulan-purnama-besar', 'layangan-nyangkut-kabel',
  'kucing-berantem-di-parkiran', 'burung-di-kusen-jendela', 'tukang-bakso-lewat', 'genset-uji-bulanan'];
function periksaKaca() {
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  const k = ctx.__ctxPalsu;
  k.__kendali.ketat = false;
  const pristine = buatPristine(ctx);
  const J = JSON.parse(vm.runInContext('JSON.stringify(JENDELA)', ctx));
  const WARNA_KONTROL = '#0a0b0c';
  const KONTROL = vm.runInContext(`({ id: 'uji-kaca-tanpa-klip', kelas: 'latar', durasi: 100,
    gambarDinding() { r(JENDELA.x + 10, JENDELA.y + 10, 3, 3, '${WARNA_KONTROL}'); } })`, ctx);
  const log = [];
  const frAsli = k.fillRect;
  k.fillRect = function (x, y, w, h) {
    if (x === J.x && y === J.y && w === J.w && h === J.h && typeof k.fillStyle !== 'string') log.push('langit');
    else if (k.fillStyle === WARNA_KONTROL) log.push('isi');
    return frAsli.apply(this, arguments);
  };
  let panggil = 0;
  const klipAsli = ctx.klipJendela;
  ctx.klipJendela = (fn) => { panggil++; return klipAsli(() => { log.push('isi'); fn(); }); };
  const gagal = [], ketemu = [];
  let kontrolTertimbun = false;
  const TS = 5000;
  try {
    for (const def of [...H.EVENT_ACAK, KONTROL]) {
      if (typeof def.gambarDinding !== 'function') continue;
      H.agents.clear(); H.peserta.length = 0; H.standby.length = 0; H.eventHidup.length = 0;
      resetRuangan(ctx, pristine);
      const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
      const E = buatE(def);
      try { def.mulai && def.mulai(E, S); } catch { /* event yang butuh keadaan lain: gambarnya tetap dicoba */ }
      H.eventHidup.push(E);
      H.setLast(TS); H.setNow(TS);
      log.length = 0; panggil = 0;
      ctx.frame(TS);
      H.eventHidup.length = 0;
      for (const a of E.aktor) { a.eventKerja = null; a.betah = a.betahAsli || false; }
      const langit = log.indexOf('langit');
      const isi = log.flatMap((x, i) => (x === 'isi' ? [i] : []));
      if (def === KONTROL) { kontrolTertimbun = langit >= 0 && isi.length > 0 && isi.every((i) => i < langit); continue; }
      if (!panggil) continue;
      ketemu.push(def.id);
      if (langit < 0) gagal.push(`${def.id}: langit drawWindow tidak tercatat di frame()`);
      else if (isi.length !== panggil) gagal.push(`${def.id}: ${panggil} panggilan klipJendela, ${isi.length} yang dilukis`);
      else if (isi.some((i) => i < langit)) gagal.push(`${def.id}: isi kacanya dilukis SEBELUM langit (tertimbun)`);
    }
  } finally {
    ctx.klipJendela = klipAsli;
    k.fillRect = frAsli;
  }
  for (const id of KACA_DIKENAL) if (!ketemu.includes(id)) gagal.push(`${id}: gambarDinding-nya tidak lagi melukis lewat klipJendela`);
  if (!kontrolTertimbun) gagal.push('kontrol: gambar di kaca TANPA klipJendela tidak ketahuan tertimbun — pencatatnya buta');
  return { gagal, diperiksa: ketemu.length };
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
  const tutup = periksaTertutup();
  console.log((tutup.gagal.length ? merah('  ✗ ') : hijau('  ✓ ')) + 'prop-event-tidak-tertimpa-perabot'.padEnd(44)
    + abu(`${tutup.diperiksa} gambarProp: < ${AMBANG_TERTUTUP * 100}% pikselnya tertimpa perabot ber-sortY lebih besar`));
  for (const g of tutup.gagal) console.log(merah('      ' + g));
  const kaca = periksaKaca();
  console.log((kaca.gagal.length ? merah('  ✗ ') : hijau('  ✓ ')) + 'isi-kaca-sesudah-langit'.padEnd(44)
    + abu(`${kaca.diperiksa} gambarDinding ber-klipJendela: isinya dilukis sesudah langit drawWindow (kontrol tanpa klip: tertimbun)`));
  for (const g of kaca.gagal) console.log(merah('      ' + g));
  console.log();
  if (beda.length) {
    console.log(merah(`${beda.length} kasus z-order berubah dari golden.`)
      + abu(' Kalau memang disengaja: node uji-zorder.mjs --perbarui'));
  }
  if (tutup.gagal.length) {
    console.log(merah(`${tutup.gagal.length} prop event tidak kelihatan: perabot yang dilukis sesudahnya menimpanya.`)
      + abu(' Naikkan sortY-nya melewati perabot itu, atau catat di SENGAJA_TERTUTUP kalau memang disengaja.'));
  }
  if (kaca.gagal.length) {
    console.log(merah(`${kaca.gagal.length} isi kaca jendela tertimbun langit atau hilang.`)
      + abu(' Gambar di dalam kaca lewat klipJendela(), bukan langsung — lihat lukisKaca di room.js.'));
  }
  if (beda.length || tutup.gagal.length || kaca.gagal.length) process.exit(1);
  console.log(hijau(`${KASUS.length} kasus z-order sama dengan golden; tidak ada prop event yang tertimpa perabot; isi kaca di atas langit.`));
}

main();
