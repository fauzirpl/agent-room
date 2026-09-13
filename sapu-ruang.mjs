#!/usr/bin/env node
// sapu-ruang.mjs :: siapa yang MENGGAMBAR dan siapa yang LEWAT di sebuah kotak
// dunia ruangan — alat pencari tempat untuk perabot baru.
//
// Kenapa ada: tiap perabot baru di ruangan ini ditaruh dengan cara yang sama —
// bukaan ruang kadis, WC, gudang, tiga belas perabot pengisi, pojok baca, panel
// MCB — yaitu sapuan piksel atas SEMUA yang digambar (drawWall di kelima tema,
// drawFloor, tabel PROPS, seluruh hook gambar registri event di banyak cuplikan
// umur) ditambah rute pegawai yang sungguhan. Selama ini sapuan itu ditulis
// ulang sekali pakai tiap kali, di berkas uji atau di skrip coretan yang
// dibuang. Hasilnya benar, tapi mahal dan mudah salah: sapuan pertama bukaan
// kadis melewatkan ekor cicak yang cuma 70 ms karena cuplikan umurnya kasar
// (lihat kepala uji-sisip.mjs bagian 1a).
//
// Tiga perintah:
//   node sapu-ruang.mjs siapa X Y W H     pemilik piksel + rute yang melintas di kotak itu
//   node sapu-ruang.mjs peta  X Y W H     peta ASCII: huruf = pemilik piksel, ~ = badan orang lewat
//   node sapu-ruang.mjs kosong W H [X Y W H]
//                                         calon kotak W x H yang bebas piksel DAN bebas lalu lintas,
//                                         dicari di dalam area (bawaan: seluruh dunia)
// Opsi:
//   --halus                 cuplikan umur event tiap 0,02 dtk (bawaan 0,05) — lambat, untuk keputusan akhir
//   --abaikan-lalu-lintas   kotak yang cuma dilewati orang tetap dianggap kosong (perabot dinding)
//   --atas                  ikut hitung gambarAtas (bawaan: tidak — lihat di bawah)
//   --periksa               (siapa) exit 1 kalau kotaknya terisi; bisa dipakai uji
//
// Yang SENGAJA TIDAK dihitung:
//   * isian latar selebar dinding/lantai (>400 px atau >300 px) dan kanvas
//     bahan yang ditempel drawImage (cat, lis, pilar): itu bidang tempat
//     perabot ditaruh, bukan perabot.
//   * gradien (glow): cahaya lembut, bukan benda.
//   * gambarAtas, kecuali --atas: lapisan itu digambar SESUDAH semuanya dan
//     berisi cahaya yang memang harus lewat (sapuan lampu mobil malam, sirene)
//     — menghitungnya membuat seluruh pita dinding tampak penuh.
//
// LALU LINTAS: route() yang ASLI (room.js, lewat ruangRujukan()) dijalankan
// antar semua titik tujuan yang dikenal — slot stasiun, meja kerja, WC, gudang,
// fotokopi, pojok baca, mesin absen, pintu keluar kiri & kanan, rute satpam,
// pos satpam — ditambah setiap goToXY(<angka>, <angka>) literal di
// public/event/*.js. Badan orang dianggap 11 px lebar dan dari 30 px di atas
// garis kaki sampai 3 px di bawahnya (bayangan kontak), persis rupa yang
// digambar drawPerson.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { muatKonteks, buatOrangPalsu, buatE, buatS, buatPristine, resetRuangan } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opsi = new Set(argv.filter((a) => a.startsWith('--')));
const pos = argv.filter((a) => !a.startsWith('--'));
const perintah = pos[0];
const n = (i) => Number(pos[i]);

function pakai(pesan) {
  if (pesan) console.error(pesan + '\n');
  console.error([
    'pakai:',
    '  node sapu-ruang.mjs siapa X Y W H [--halus] [--atas] [--periksa]',
    '  node sapu-ruang.mjs peta  X Y W H [--halus] [--atas]',
    '  node sapu-ruang.mjs kosong W H [X Y W H] [--abaikan-lalu-lintas] [--halus] [--atas]',
  ].join('\n'));
  process.exit(2);
}
if (!['siapa', 'peta', 'kosong'].includes(perintah)) pakai(perintah ? 'perintah tidak dikenal: ' + perintah : '');

/* ------------------------------------------------------------ konteks --- */
const ctx = muatKonteks();
const H = ctx.__jembatan__;
const pristine = buatPristine(ctx);
ctx.__ctxPalsu.__kendali.ketat = false;      // gambar milik room.js sendiri bukan yang diuji di sini
if (typeof ctx.ruangRujukan !== 'function') {
  console.error('ruangRujukan() tidak ditemukan di room.js — jendela baca alat ini hilang');
  process.exit(1);
}
const R = ctx.ruangRujukan();
const DW = R.W, DH = R.H;

let kotak = null, area = { x: 0, y: 0, w: DW, h: DH }, ukuran = null;
if (perintah === 'siapa' || perintah === 'peta') {
  if (pos.length < 5 || [1, 2, 3, 4].some((i) => !Number.isFinite(n(i)))) pakai('butuh X Y W H');
  kotak = { x: n(1), y: n(2), w: n(3), h: n(4) };
  area = kotak;
} else {
  if (pos.length < 3 || !Number.isFinite(n(1)) || !Number.isFinite(n(2))) pakai('butuh W H');
  ukuran = { w: n(1), h: n(2) };
  if (pos.length >= 7) area = { x: n(3), y: n(4), w: n(5), h: n(6) };
}

/* ---------------------------------------------------- sapuan piksel --- */
const pemilik = new Int16Array(DW * DH).fill(-1);   // indeks sumber pertama yang menggambar sel itu
const namaSumber = [];
const idSumber = new Map();
const contoh = new Map();                           // sumber -> potongan kotak yang mengenai `kotak`
const iris = (K, x, y, w, h) => x < K.x + K.w && x + w > K.x && y < K.y + K.h && y + h > K.y;

let sedang = null, lewatiGrad = false;
function catat(x, y, w, h) {
  if (!sedang) return;
  if (lewatiGrad) { lewatiGrad = false; return; }
  if (![x, y, w, h].every(Number.isFinite)) return;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  if (w > 400 || h > 300) return;
  const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(DW, Math.ceil(x + w));
  const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(DH, Math.ceil(y + h));
  if (x0 >= x1 || y0 >= y1) return;
  let id = idSumber.get(sedang);
  if (id == null) { id = namaSumber.length; namaSumber.push(sedang); idSumber.set(sedang, id); }
  for (let py = y0; py < y1; py++) {
    const baris = py * DW;
    for (let px = x0; px < x1; px++) if (pemilik[baris + px] < 0) pemilik[baris + px] = id;
  }
  if (kotak && iris(kotak, x, y, w, h)) {
    const a = contoh.get(sedang) || new Set();
    if (a.size < 6) a.add(`${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`);
    contoh.set(sedang, a);
  }
}

const cp = ctx.__ctxPalsu;
const asli = {};
for (const m of ['fillRect', 'strokeRect']) {
  asli[m] = cp[m];
  cp[m] = function (x, y, w, h, ...s) { catat(x, y, w, h); return asli[m].apply(this, [x, y, w, h, ...s]); };
}
asli.fillText = cp.fillText;
cp.fillText = function (t, x, y, ...s) { catat(x, y - 5, String(t).length * 4 + 2, 8); return asli.fillText.apply(this, [t, x, y, ...s]); };
for (const m of ['createRadialGradient', 'createLinearGradient']) {
  if (typeof cp[m] !== 'function') continue;
  asli[m] = cp[m];
  cp[m] = function (...s) { lewatiGrad = true; return asli[m].apply(this, s); };
}

const S2 = buatS(ctx, { jam: 10, hujan: false, petir: false, ramai: 3 });
S2.orang = buatOrangPalsu(ctx, 6, 2);
for (const tema of [null, 'agustusan', 'ramadan', 'korpri', 'tahun-anggaran']) {
  H.RUANGAN.tema = tema; H.RUANGAN.temaTahun = 2026;
  sedang = 'drawWall' + (tema ? ' (tema ' + tema + ')' : '');
  for (const jam of [8, 13, 19]) {
    try { H.setNow(jam * 3600000); } catch { /* sumber lama boleh rewel */ }
    try { ctx.gambarTemaDinding(); } catch { /* idem */ }
    try { ctx.drawWall(); } catch { /* idem */ }
  }
}
resetRuangan(ctx, pristine);
sedang = 'drawFloor';
try { ctx.drawFloor(); } catch { /* idem */ }
for (const p of H.PROPS) {
  const nama = 'PROPS:' + ((p.draw && p.draw.name) || '(anon)');
  for (const aktif of [false, true]) { sedang = nama; try { p.draw(aktif); } catch { /* idem */ } }
}
resetRuangan(ctx, pristine);
for (const angkat of [0, 7]) {                      // APAR yang diangkat event disposisi naik 7 px
  H.RUANGAN.aparAngkat = angkat;
  sedang = 'PROPS:drawServer';
  try { ctx.drawServer(true); } catch { /* idem */ }
}
const langkah = opsi.has('--halus') ? 0.02 : 0.05;
const UMUR = [];
for (let u = 0; u <= 14.0001; u += langkah) UMUR.push(Math.round(u * 100) / 100);
const HOOK = ['gambarProp', 'gambarDinding', 'gambarLantai'].concat(opsi.has('--atas') ? ['gambarAtas'] : []);
for (const def of H.EVENT_ACAK) {
  for (const hook of HOOK) {
    if (typeof def[hook] !== 'function') continue;
    resetRuangan(ctx, pristine);
    const E = buatE(def);
    sedang = 'EVENT:' + def.id + (hook === 'gambarProp' ? '' : ' (' + hook + ')');
    const durasi = Number(def.durasi) > 0 ? Number(def.durasi) : 10;
    for (const umur of UMUR) {
      E.umur = umur; E.t = Math.min(1, umur / durasi);
      try { def[hook](E, S2); } catch { /* idem */ }
    }
  }
}
sedang = null;
for (const m of Object.keys(asli)) cp[m] = asli[m];
resetRuangan(ctx, pristine);

/* ------------------------------------------------------ lalu lintas --- */
const BADAN_KIRI = 5, BADAN_KANAN = 5, BADAN_ATAS = 30, BADAN_BAWAH = 3;
const titik = new Map();
const tambah = (nama, x, y) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const k = Math.round(x) + ',' + Math.round(y);
  if (!titik.has(k)) titik.set(k, { nama, x: Math.round(x), y: Math.round(y) });
};
for (const [id, s] of Object.entries(R.STATIONS)) {
  if (s.slotsX) { s.slotsX.forEach((x, i) => tambah(`${s.name} ${i}`, x, s.y)); continue; }
  const step = s.step || 19, slots = s.slots || 12;
  for (let k = 0; k < slots; k++) {
    const x = s.x + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step);
    if (x < 16 || x > DW - 16) continue;            // saringan tepi slotBebas
    tambah(`${s.name || id} slot ${k}`, x, s.y);
  }
}
tambah('ambang WC', R.WC.titikX, R.WC.titikY);
tambah('ambang gudang', R.GUDANG.titikX, R.GUDANG.titikY);
tambah('mesin fotokopi', R.FOTOKOPI_TITIK.x, R.FOTOKOPI_TITIK.y);
R.BACA.slot.forEach((x, i) => tambah(`pojok baca bantal ${i}`, x, R.BACA.titikY));
tambah('mesin absen', R.ABSEN_X, R.ABSEN_Y);
tambah('pintu keluar kanan', R.PINTU_X, R.LANE_UP);
tambah('pintu keluar kiri', -20, R.LANE_DOWN);
tambah('depan pintu pantri', R.PANTRI_LUAR, R.PANTRI.ambang);
(R.SATPAM_RUTE || []).forEach((t, i) => tambah(`rute satpam ${i}`, t.x, t.y));
if (R.POS_SATPAM) tambah('pos satpam', R.POS_SATPAM.titikX, R.POS_SATPAM.titikY);
const dirEvent = path.join(__dirname, 'public', 'event');
for (const f of fs.readdirSync(dirEvent).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dirEvent, f), 'utf8');
  for (const m of src.matchAll(/goToXY\(\s*(?:pantriX\(\s*(-?\d+)\s*\)|(-?\d+))\s*,\s*(-?\d+)/g)) {
    const x = m[1] != null ? ctx.pantriX(+m[1]) : +m[2];
    tambah(`goToXY ${f.replace(/\.js$/, '')}`, x, +m[3]);
  }
}
const TITIK = [...titik.values()];

const kaki = new Uint8Array(DW * DH);               // garis kaki yang pernah diinjak
const melintas = new Map();                         // 'asal → tujuan' -> jumlah, cuma untuk `kotak`
let jumlahRute = 0, jumlahMelintas = 0;
const badanKena = (x, y) => kotak
  && x - BADAN_KIRI < kotak.x + kotak.w && x + BADAN_KANAN + 1 > kotak.x
  && y - BADAN_ATAS < kotak.y + kotak.h && y + BADAN_BAWAH + 1 > kotak.y;
const lajur = (y) => (y < (R.LANE_UP + R.LANE_DOWN) / 2 ? R.LANE_UP : R.LANE_DOWN);
for (const a of TITIK) {
  for (const b of TITIK) {
    if (a === b) continue;
    let p;
    try { p = R.route(a.x, a.y, lajur(a.y), b.x, b.y, lajur(b.y)); } catch { continue; }
    jumlahRute++;
    let cx = a.x, cy = a.y, kena = false;
    for (const t of p) {
      const dx = Math.sign(t.x - cx), dy = Math.sign(t.y - cy);
      const lang = Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy));
      for (let i = 0; i <= lang; i++) {
        const px = Math.round(cx + dx * i), py = Math.round(cy + dy * i);
        if (px >= 0 && px < DW && py >= 0 && py < DH) kaki[py * DW + px] = 1;
        if (!kena && badanKena(px, py)) kena = true;
      }
      cx = t.x; cy = t.y;
    }
    if (kena) {
      jumlahMelintas++;
      const k = a.nama + ' → ' + b.nama;
      if (melintas.size < 400) melintas.set(k, (melintas.get(k) || 0) + 1);
    }
  }
}
// Garis kaki dilebarkan jadi badan (satu kali, bukan per langkah).
const badan = new Uint8Array(DW * DH);
for (let y = 0; y < DH; y++) {
  for (let x = 0; x < DW; x++) {
    if (!kaki[y * DW + x]) continue;
    for (let by = Math.max(0, y - BADAN_ATAS); by <= Math.min(DH - 1, y + BADAN_BAWAH); by++) {
      const baris = by * DW;
      for (let bx = Math.max(0, x - BADAN_KIRI); bx <= Math.min(DW - 1, x + BADAN_KANAN); bx++) badan[baris + bx] = 1;
    }
  }
}

/* ----------------------------------------------------------- keluaran --- */
const ket = `${namaSumber.length} sumber gambar disapu (umur event tiap ${langkah} dtk${opsi.has('--atas') ? ', termasuk gambarAtas' : ''}), `
  + `${TITIK.length} titik tujuan, ${jumlahRute} rute`;

if (perintah === 'siapa') {
  const { x, y, w, h } = kotak;
  console.log(`kotak x${x}..${x + w} y${y}..${y + h} (${w}x${h})`);
  console.log('  ' + ket + '\n');
  const sumber = [...contoh.entries()];
  console.log(sumber.length ? `PIKSEL — ${sumber.length} sumber menggambar di kotak ini:` : 'PIKSEL — nol sumber menggambar di kotak ini');
  for (const [nama, s] of sumber) console.log(`  ${nama.padEnd(46)} ${[...s].join(' | ')}`);
  console.log('');
  console.log(jumlahMelintas
    ? `LALU LINTAS — ${jumlahMelintas} rute membawa badan orang melintasi kotak ini, contoh:`
    : 'LALU LINTAS — nol rute melintasi kotak ini');
  [...melintas.keys()].slice(0, 8).forEach((k) => console.log('  ' + k));
  const terisi = sumber.length > 0 || (jumlahMelintas > 0 && !opsi.has('--abaikan-lalu-lintas'));
  console.log('\n' + (terisi ? 'TERISI' : 'KOSONG'));
  process.exit(opsi.has('--periksa') && terisi ? 1 : 0);
}

if (perintah === 'peta') {
  const { x: ax, y: ay, w: aw, h: ah } = kotak;
  const huruf = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const kode = new Map();
  let kepala = '     ';
  for (let px = ax; px < ax + aw; px++) kepala += px % 10 === 0 ? String((px / 10) % 10) : ' ';
  console.log(ket);
  console.log(kepala);
  for (let py = ay; py < ay + ah; py++) {
    let baris = String(py).padStart(4) + ' ';
    for (let px = ax; px < ax + aw; px++) {
      if (px < 0 || py < 0 || px >= DW || py >= DH) { baris += ' '; continue; }
      const id = pemilik[py * DW + px];
      if (id >= 0) {
        if (!kode.has(id)) kode.set(id, huruf[kode.size % huruf.length]);
        baris += kode.get(id);
      } else baris += badan[py * DW + px] ? '~' : '.';
    }
    console.log(baris);
  }
  console.log('\n~ = badan orang lewat (lalu lintas)   . = kosong');
  for (const [id, c] of kode) console.log(`  ${c} = ${namaSumber[id]}`);
  process.exit(0);
}

// kosong
const abaikan = opsi.has('--abaikan-lalu-lintas');
const isi = new Uint32Array((DW + 1) * (DH + 1));   // tabel jumlah-area: O(1) per kotak
for (let y = 0; y < DH; y++) {
  let jalan = 0;
  for (let x = 0; x < DW; x++) {
    const i = y * DW + x;
    jalan += (pemilik[i] >= 0 || (!abaikan && badan[i])) ? 1 : 0;
    isi[(y + 1) * (DW + 1) + x + 1] = isi[y * (DW + 1) + x + 1] + jalan;
  }
}
const jumlah = (x, y, w, h) => isi[(y + h) * (DW + 1) + x + w] - isi[y * (DW + 1) + x + w]
  - isi[(y + h) * (DW + 1) + x] + isi[y * (DW + 1) + x];
const { w: kw, h: kh } = ukuran;
const x0 = Math.max(0, area.x), y0 = Math.max(0, area.y);
const x1 = Math.min(DW, area.x + area.w), y1 = Math.min(DH, area.y + area.h);
const dipilih = [];
for (let y = y0; y + kh <= y1; y++) {
  for (let x = x0; x + kw <= x1; x++) {
    if (jumlah(x, y, kw, kh)) continue;
    if (dipilih.some((d) => iris(d, x, y, kw, kh))) continue;
    dipilih.push({ x, y, w: kw, h: kh });
  }
}
console.log(ket);
console.log(`calon kotak ${kw}x${kh} bebas piksel${abaikan ? '' : ' dan bebas lalu lintas'} di area x${x0}..${x1} y${y0}..${y1}: ${dipilih.length}`);
for (const d of dipilih.slice(0, 40)) console.log(`  x${d.x}..${d.x + kw} y${d.y}..${d.y + kh}`);
if (dipilih.length > 40) console.log(`  ... ${dipilih.length - 40} lagi`);
