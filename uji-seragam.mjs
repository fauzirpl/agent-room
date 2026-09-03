#!/usr/bin/env node
// uji-seragam.mjs :: uji SERAGAM KANTOR CABANG di public/room.js — pemetaan
// nama mesin -> rompi dinas, keterbacaan rompi di sprite 28 px, dan aturan
// sisi meja (lokal ke kiri, cabang ke kanan).
//
// Kenapa berkas sendiri: golden uji-zorder merekam URUTAN gambar frame(), dan
// syarat pekerjaan ini justru "golden itu tidak boleh bergerak satu baris pun"
// (fixture-nya tidak punya `mesin`, jadi memang tidak boleh bergeser). Yang
// diuji di sini bukan urutan lapisan, melainkan WARNA dan PETAK mana yang
// akhirnya kelihatan — jadi berkas ini memutar ulang seluruh fillRect
// drawPerson() ke dalam bingkai piksel kecil dan menghitung piksel yang benar-
// benar bertahan sesudah semua lapisan ditimpa.
//
// Sama seperti uji-zorder.mjs dan uji-sisip.mjs, berkas ini MEMAKAI
// muatKonteks/buatSatuOrang/buatS dari uji-event.mjs dan TIDAK mengubahnya
// sama sekali. Fungsi yang dipanggil (seragamCabang, kodeMesin, slotMeja,
// slotKongsi, drawPerson) semuanya deklarasi `function` di room.js, jadi
// otomatis jadi properti context vm — nol jembatan baru.
//
// Warna baju harian dan kedua tabel urutan meja DIBACA DARI SUMBER room.js,
// bukan dihafal di sini: kalau nanti ada yang menambah warna batik Jumat baru
// atau menggeser urutan meja, uji ini yang berteriak duluan.
//
// Pakai:
//   node uji-seragam.mjs            jalankan semua kasus
//   node uji-seragam.mjs --tampil   cetak juga tabel jarak warna & peta piksel

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  muatKonteks, buatSatuOrang, buatS, buatPristine, resetRuangan,
  merah, hijau, kuning, abu, tebal,
} from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOM = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
const TAMPIL = process.argv.includes('--tampil');

/* -------------------------------------------------------------- pelapor --- */
let lulus = 0, gagal = 0;
const catatanGagal = [];
function ok(nama, syarat, ket) {
  if (syarat) { lulus++; console.log(hijau('  ✓ ') + nama.padEnd(58) + abu(ket || '')); }
  else { gagal++; catatanGagal.push(nama); console.log(merah('  ✗ ') + nama.padEnd(58) + merah(ket || '')); }
}
function sama(nama, dapat, harap, ket) {
  const cocok = JSON.stringify(dapat) === JSON.stringify(harap);
  ok(nama, cocok, cocok ? ket : `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`);
}
const judul = (t) => console.log('\n' + tebal(t));

/* -------------------------------------------------------------- konteks --- */
const ctx = muatKonteks();
const H = ctx.__jembatan__;
const pristine = buatPristine(ctx);

const WAJIB = ['seragamCabang', 'kodeMesin', 'slotMeja', 'slotBebas', 'slotKongsi',
  'stasiunPulang', 'drawPerson', 'penghuni'];
for (const nama of WAJIB) {
  if (typeof ctx[nama] !== 'function') {
    console.log(merah(`fungsi ${nama}() tidak ditemukan di room.js — uji-seragam perlu dibaca ulang`));
    process.exit(1);
  }
}

function bersih() {
  H.agents.clear();
  H.peserta.length = 0;
  H.standby.length = 0;
  H.eventHidup.length = 0;
  H.setTerpilih(null);
  resetRuangan(ctx, pristine);
  buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  H.setNow(5000); H.setLast(5000);
}

/* ---------------------------------------------------------------- warna --- */
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const jarak = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

// Warna baju harian dibaca dari SUMBER room.js (const blok, tidak terjangkau
// dari vm) — bukan disalin ke sini, supaya batik baru ikut terbawa sendiri.
function bajuHarian() {
  const satu = (nama) => {
    const m = ROOM.match(new RegExp('const ' + nama + " = \\{[^}]*main: '(#[0-9a-f]{6})'"));
    return m ? [m[1]] : [];
  };
  const blok = ROOM.match(/const SERAGAM_BATIK_JUMAT = \[([\s\S]*?)\];/);
  const jumat = blok ? [...blok[1].matchAll(/main: '(#[0-9a-f]{6})'/g)].map((m) => m[1]) : [];
  return [...satu('SERAGAM_PUTIH'), ...satu('SERAGAM_BATIK_RABU'), ...jumat];
}
const BAJU = bajuHarian();

/* ============================================================ 1. kestabilan */
judul('1. kestabilan pemetaan mesin → rompi');
{
  const a = ctx.seragamCabang('nasgor-pc');
  ok('mesin dikenal memberi varian rompi', !!a && !!a.rompi && !!a.pangkat && !!a.nama, a ? a.id : 'null');
  let tetap = true;
  for (let i = 0; i < 1000; i++) if (ctx.seragamCabang('nasgor-pc').id !== a.id) { tetap = false; break; }
  ok('1000 panggilan berturut memberi id sama', tetap, a.id);

  const ctx2 = muatKonteks();
  ok('context BARU memberi id yang sama (bukan acakan)', ctx2.seragamCabang('nasgor-pc').id === a.id,
    ctx2.seragamCabang('nasgor-pc').id + ' = ' + a.id);
  ok('objek varian dimemo (identitas sama, bukan salinan baru)',
    ctx.seragamCabang('nasgor-pc') === a);
  // FNV-1a: nilai acuan, supaya perubahan diam-diam pada hashnya ketahuan
  ok('kodeMesin() FNV-1a 32-bit tak pernah negatif',
    ctx.kodeMesin('nasgor-pc') >= 0 && ctx.kodeMesin('nasgor-pc') <= 0xffffffff,
    String(ctx.kodeMesin('nasgor-pc')));
  ok("kodeMesin('') = offset basis FNV-1a", ctx.kodeMesin('') === 0x811c9dc5, String(ctx.kodeMesin('')));
}

/* ====================================================== 2. normalisasi/tepi */
judul('2. normalisasi & tepi');
{
  ok('huruf besar/kecil tidak berpengaruh',
    ctx.seragamCabang('NASGOR-PC').id === ctx.seragamCabang('nasgor-pc').id);
  ok('spasi di tepi tidak berpengaruh',
    ctx.seragamCabang('  nasgor-pc  ') === ctx.seragamCabang('nasgor-pc'));
  ok("seragamCabang('') = null (pegawai lokal tidak berompi)", ctx.seragamCabang('') === null);
  ok('seragamCabang(null) = null', ctx.seragamCabang(null) === null);
  ok('seragamCabang(undefined) = null', ctx.seragamCabang(undefined) === null);
  ok("seragamCabang('   ') = null", ctx.seragamCabang('   ') === null);
}

/* ============================================================== 3. kontras */
judul('3. kontras rompi terhadap seluruh baju harian');
// Sapu banyak nama mesin sampai seluruh varian tabel keluar — daftarnya tidak
// dibaca dari const SERAGAM_CABANG, jadi uji ini juga membuktikan hash-nya
// benar-benar menyebar, bukan selalu jatuh ke ember yang sama.
const varian = new Map();
const ember = new Map();
const CONTOH = 600;
for (let i = 0; i < CONTOH; i++) {
  const v = ctx.seragamCabang('kantor-cabang-' + i);
  varian.set(v.id, v);
  ember.set(v.id, (ember.get(v.id) || 0) + 1);
}
{
  ok('daftar baju harian terbaca dari sumber room.js', BAJU.length >= 7, BAJU.join(' '));
  ok('sapuan 600 nama mesin menemukan ≥ 2 varian rompi', varian.size >= 2,
    varian.size + ' varian: ' + [...varian.keys()].join(', '));
  const paling = Math.min(...ember.values()) / CONTOH;
  ok('hash menyebar (ember terkecil ≥ 10% dari 600 nama)', paling >= 0.10,
    (paling * 100).toFixed(1) + '%');

  let minBaju = Infinity, pasanganBaju = '';
  for (const v of varian.values()) {
    for (const b of BAJU) {
      const d = jarak(v.rompi, b);
      if (TAMPIL) console.log(abu(`      ${v.id.padEnd(8)} ${v.rompi} vs baju ${b} = ${d.toFixed(1)}`));
      if (d < minBaju) { minBaju = d; pasanganBaju = `${v.id} ${v.rompi} vs ${b}`; }
    }
  }
  ok('jarak RGB rompi ↔ setiap baju harian ≥ 60', minBaju >= 60,
    `terdekat ${minBaju.toFixed(1)} (${pasanganBaju})`);

  let minAntar = Infinity, pasanganAntar = '';
  const daftar = [...varian.values()];
  for (let i = 0; i < daftar.length; i++) {
    for (let j = i + 1; j < daftar.length; j++) {
      const d = jarak(daftar[i].rompi, daftar[j].rompi);
      if (d < minAntar) { minAntar = d; pasanganAntar = `${daftar[i].id} vs ${daftar[j].id}`; }
    }
  }
  ok('jarak RGB antar sesama rompi ≥ 60 (dua cabang bisa dibedakan)', minAntar >= 60,
    `terdekat ${minAntar.toFixed(1)} (${pasanganAntar})`);

  let minPangkat = Infinity, pasanganPangkat = '';
  for (const v of varian.values()) {
    const d = jarak(v.pangkat, v.rompi);
    if (d < minPangkat) { minPangkat = d; pasanganPangkat = v.id; }
  }
  ok('tanda pangkat ≥ 60 dari rompinya sendiri', minPangkat >= 60,
    `terdekat ${minPangkat.toFixed(1)} (${pasanganPangkat})`);

  // Pangkat menumpang separuh di bahu (baju), jadi harus terbaca juga di hari
  // kemeja putih — kalau tidak, hari putih tidak punya penanda pangkat.
  let minPutih = Infinity;
  for (const v of varian.values()) minPutih = Math.min(minPutih, jarak(v.pangkat, BAJU[0]));
  ok('tanda pangkat ≥ 55 dari kemeja putih', minPutih >= 55, `terdekat ${minPutih.toFixed(1)}`);
}

/* ================================================== 4. hari tidak tercemar */
judul('4. seragam harian tidak tercemar kanal cabang');
{
  ctx.terapkanSeragamHarian();
  const pal = H.jabatanDari('pranata_muda').pal;
  const sebelum = { main: pal.main, pants: pal.pants, pattern: pal.pattern };
  ok('harness membeku di hari batik (Rabu) — kasus paling rawan yang diuji',
    pal.pattern != null, `main ${pal.main}, pattern ${pal.pattern}`);
  for (let i = 0; i < 20; i++) ctx.seragamCabang('mesin-uji-' + i);
  sama('pal.main tidak berubah sesudah 20 panggilan seragamCabang', pal.main, sebelum.main);
  sama('pal.pattern tidak berubah', pal.pattern, sebelum.pattern);
  sama('pal.pants tidak berubah', pal.pants, sebelum.pants);

  // Menggambar pegawai cabang pun tidak boleh menulis balik ke pal bersama.
  bersih();
  const o = buatSatuOrang(ctx, 'nganggur');
  o.phase = 0; o.x = 200; o.y = 260; o.face = 'down'; o.mesin = 'kantor-cabang-b';
  ctx.drawPerson(o);
  sama('pal.main tetap utuh sesudah drawPerson() pegawai cabang', pal.main, sebelum.main);
  ok('a.pal masih objek jabatan yang sama (tidak disalin diam-diam)', o.pal === pal);
}

/* ================================================ 5. keterbacaan di sprite */
judul('5. rompi terbaca di sprite (piksel yang benar-benar bertahan)');
// Semua fillRect drawPerson() diputar ulang ke bingkai piksel: yang dihitung
// adalah warna TERAKHIR di tiap petak, jadi rompi yang ketiban lengan, rim
// light, atau motif batik memang hilang dari hitungan — persis seperti yang
// dilihat mata di layar.
const cp = ctx.__ctxPalsu;
const fillRectAsli = cp.fillRect;
function petaPiksel(o) {
  const peta = new Map();
  cp.fillRect = function (x, y, w, h) {
    fillRectAsli.call(cp, x, y, w, h);
    const c = String(cp.fillStyle).toLowerCase();
    for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) peta.set(((x | 0) + i) + ',' + ((y | 0) + j), c);
  };
  try { ctx.drawPerson(o); } finally { cp.fillRect = fillRectAsli; }
  return peta;
}
const hitungWarna = (peta, warna) => [...peta.values()].filter((c) => c === warna.toLowerCase()).length;
// Sekeluarga rompi: warna dasarnya, kolom teduhnya (sh 0.85, mengikuti cahaya
// kiri-atas seperti mainG), dan garis tepinya (garisTepi = sh 0.55). Ketiganya
// piksel rompi di mata penonton, jadi keterbacaan dihitung dari ketiganya —
// warna dasar saja terlalu pelit dan bikin ambangnya bohong.
const keluargaRompi = (rc) => [rc.rompi, ctx.sh(rc.rompi, 0.85), ctx.sh(rc.rompi, 0.55)];
const hitungKeluarga = (peta, rc) => {
  const set = new Set(keluargaRompi(rc).map((c) => c.toLowerCase()));
  return [...peta.values()].filter((c) => set.has(c)).length;
};

function orangCabang(face, mesin) {
  const o = buatSatuOrang(ctx, 'nganggur');
  o.phase = 0; o.x = 220; o.y = 260; o.face = face; o.mesin = mesin || '';
  return o;
}
{
  bersih();
  const RC = ctx.seragamCabang('kantor-cabang-b');
  const pal = H.jabatanDari('pranata_muda').pal;
  const hariAsli = { main: pal.main, pattern: pal.pattern };

  for (const [namaHari, setel] of [['batik Rabu', { main: hariAsli.main, pattern: hariAsli.pattern }],
    ['kemeja putih', { main: '#f0ede2', pattern: null }]]) {
    pal.main = setel.main; pal.pattern = setel.pattern;
    for (const [namaArah, face, minRompi, minPangkat] of [
      ['depan (ruang tunggu)', 'down', 28, 3],
      ['belakang (meja kerja)', 'up', 28, 3],
      ['samping kanan', 'right', 16, 2],
      ['samping kiri', 'left', 16, 2],
    ]) {
      const peta = petaPiksel(orangCabang(face, 'kantor-cabang-b'));
      const nR = hitungKeluarga(peta, RC), nP = hitungWarna(peta, RC.pangkat);
      ok(`${namaHari} · ${namaArah}: rompi ≥ ${minRompi} px`, nR >= minRompi, `${nR} px`);
      ok(`${namaHari} · ${namaArah}: tanda pangkat ≥ ${minPangkat} px`, nP >= minPangkat, `${nP} px`);
      if (TAMPIL) {
        console.log(abu(`      keluarga rompi ${keluargaRompi(RC).join(' ')} = ${nR} px`
          + `, warna dasar saja = ${hitungWarna(peta, RC.rompi)} px, pangkat ${RC.pangkat} = ${nP} px`));
      }
    }
  }

  // Berjilbab: kerudung digambar SESUDAH badan dan menjuntai menutup bahu
  // (yb-16..yb-13), jadi tanda pangkat di pundak akan terkubur habis kalau
  // barisnya tidak diturunkan. Ini kasus nyata, bukan buatan: beberapa jabatan
  // di JABATAN memang ber-head 'jilbab'.
  {
    const simpanKepala = pal.head, simpanJilbab = pal.jilbab;
    pal.head = 'jilbab'; pal.jilbab = pal.jilbab || '#6b4a2a';
    for (const [namaArah, face, minRompi] of [
      ['depan', 'down', 14], ['belakang', 'up', 14], ['samping', 'right', 10],
    ]) {
      const peta = petaPiksel(orangCabang(face, 'kantor-cabang-b'));
      const nR = hitungKeluarga(peta, RC), nP = hitungWarna(peta, RC.pangkat);
      ok(`berjilbab · ${namaArah}: rompi masih ≥ ${minRompi} px di bawah juntaian`, nR >= minRompi, `${nR} px`);
      ok(`berjilbab · ${namaArah}: tanda pangkat tetap terlihat`, nP >= 1, `${nP} px`);
    }
    pal.head = simpanKepala; pal.jilbab = simpanJilbab;
  }

  /* Menunggu keputusan (a.butuh): map disposisi 10x8 px dipegang di depan
     dada dan menutup PERSIS seluruh petak rompi — rompinya memang mengalah,
     itu yang benar-benar terjadi kalau orang memegang map. Tapi tanda
     pangkatnya TIDAK boleh ikut hilang: justru di pose inilah penonton
     paling perlu tahu ini sesi mesin yang mana, karena dialah yang sedang
     ditunggu jawabannya. Pose ini dulu 0 px rompi DAN 0 px pangkat, dan
     tidak ada satu kasus pun di sini yang akan menyadarinya. */
  {
    for (const [namaArah, face] of [
      ['depan', 'down'], ['belakang', 'up'], ['samping kanan', 'right'], ['samping kiri', 'left'],
    ]) {
      const o = orangCabang(face, 'kantor-cabang-b');
      o.butuh = { sebab: 'izin', label: 'menunggu paraf' };
      const peta = petaPiksel(o);
      const nP = hitungWarna(peta, RC.pangkat);
      ok(`menunggu keputusan · ${namaArah}: tanda pangkat ≥ 4 px di atas map`, nP >= 4, `${nP} px`);
    }
    // Berjilbab pun: pangkatnya pindah ke tepi atas map, bukan ke dada.
    const simpanKepala = pal.head, simpanJilbab = pal.jilbab;
    pal.head = 'jilbab'; pal.jilbab = pal.jilbab || '#6b4a2a';
    const oj = orangCabang('down', 'kantor-cabang-b');
    oj.butuh = { sebab: 'izin' };
    const nPj = hitungWarna(petaPiksel(oj), RC.pangkat);
    ok('menunggu keputusan · berjilbab: tanda pangkat tetap ≥ 4 px', nPj >= 4, `${nPj} px`);
    pal.head = simpanKepala; pal.jilbab = simpanJilbab;

    // Pegawai LOKAL yang menunggu keputusan tetap nol piksel cabang: petak
    // pangkat di atas map digerbangi `rc`, bukan digambar lalu ditimpa.
    let bocorButuh = 0;
    for (const face of ['down', 'up', 'left', 'right']) {
      const o = orangCabang(face, '');
      o.butuh = { sebab: 'tolak' };
      const peta = petaPiksel(o);
      for (const v of varian.values()) bocorButuh += hitungKeluarga(peta, v) + hitungWarna(peta, v.pangkat);
    }
    ok('menunggu keputusan · pegawai LOKAL tetap nol piksel rompi/pangkat', bocorButuh === 0, `${bocorButuh} px`);
  }

  // 4 px tengah badan WAJIB tetap baju: kerah, kancing, dan motif batik masih
  // harus terbaca. Diperiksa di kolom x-2..x+1, baris badan yb-14..yb-9.
  pal.main = '#f0ede2'; pal.pattern = null;
  const petaDepan = petaPiksel(orangCabang('down', 'kantor-cabang-b'));
  let tengahBaju = 0, tengahRompi = 0;
  for (let dy = -14; dy <= -9; dy++) {
    for (let dx = -2; dx <= 1; dx++) {
      const c = petaDepan.get((220 + dx) + ',' + (260 + dy));
      if (c === '#f0ede2') tengahBaju++;
      if (c === RC.rompi.toLowerCase()) tengahRompi++;
    }
  }
  ok('4 px tengah badan tetap baju (kerah/kancing/batik masih terbaca)', tengahBaju >= 12,
    `${tengahBaju} dari 24 px tengah masih baju`);
  ok('rompi tidak merembes ke 4 px tengah', tengahRompi === 0, `${tengahRompi} px`);

  // Pegawai lokal: tidak boleh ada satu piksel pun berwarna rompi mana pun.
  let bocor = 0;
  for (const face of ['down', 'up', 'left', 'right']) {
    const peta = petaPiksel(orangCabang(face, ''));
    for (const v of varian.values()) bocor += hitungKeluarga(peta, v) + hitungWarna(peta, v.pangkat);
  }
  ok('pegawai LOKAL nol piksel rompi/pangkat di keempat arah', bocor === 0, `${bocor} px`);

  pal.main = hariAsli.main; pal.pattern = hariAsli.pattern;
}

/* ============================================================ 6. sisi meja */
judul('6. urutan meja: lokal ke kiri, cabang ke kanan');
const MEJA = H.MEJA_KERJA_X;
function urutSumber(nama) {
  const m = ROOM.match(new RegExp('const ' + nama + ' = \\[([0-9,\\s]*)\\]'));
  return m ? m[1].split(',').map((s) => Number(s.trim())) : null;
}
{
  for (const nama of ['URUT_MEJA_LOKAL', 'URUT_MEJA_CABANG']) {
    const u = urutSumber(nama);
    ok(`${nama} terbaca di sumber`, Array.isArray(u) && u.length === MEJA.length,
      u ? '[' + u.join(', ') + ']' : 'tidak ketemu');
    if (!u) continue;
    const set = new Set(u);
    ok(`${nama} permutasi 0..${MEJA.length - 1} (tanpa duplikat, tanpa di luar MEJA_KERJA_X)`,
      set.size === MEJA.length && u.every((k) => Number.isInteger(k) && k >= 0 && k < MEJA.length),
      'x: ' + u.map((k) => MEJA[k]).join(', '));
  }
  const lokal = urutSumber('URUT_MEJA_LOKAL'), cabang = urutSumber('URUT_MEJA_CABANG');
  const xl = lokal.map((k) => MEJA[k]), xc = cabang.map((k) => MEJA[k]);
  ok('urutan lokal menyapu dari KIRI ke kanan', xl.every((v, i) => i === 0 || v > xl[i - 1]), xl.join(' → '));
  ok('urutan cabang menyapu dari KANAN ke kiri', xc.every((v, i) => i === 0 || v < xc[i - 1]), xc.join(' → '));

  const lok = { id: 'L', mesin: '', station: 'think' };
  const cab = { id: 'C', mesin: 'kantor-cabang-b', station: 'think' };

  bersih();
  const kL = ctx.slotMeja(lok), kC = ctx.slotMeja(cab);
  sama('kantor kosong: lokal dapat meja paling kiri', [kL, MEJA[kL]], [2, 86]);
  sama('kantor kosong: cabang dapat meja paling kanan', [kC, MEJA[kC]], [3, 444]);

  // 3 lokal sudah terpasang di 2, 0, 4 (86, 176, 242)
  const duduk = (slotIdx, mesin) => {
    const o = buatSatuOrang(ctx, 'diam-di-meja');
    o.slotIdx = slotIdx; o.antre = 0; o.mesin = mesin || '';
    o.x = MEJA[slotIdx]; o.id = 'duduk-' + slotIdx;
    H.agents.set(o.id, o);
    return o;
  };
  bersih();
  duduk(2); duduk(0); duduk(4);
  sama('3 lokal di 2,0,4 → cabang berikutnya TETAP meja pojok kanan', ctx.slotMeja(cab), 3);
  sama('3 lokal di 2,0,4 → lokal berikutnya limpah ke 5 (x=308)', ctx.slotMeja(lok), 5);

  bersih();
  for (let k = 0; k < MEJA.length; k++) duduk(k);
  sama('6 meja penuh: lokal -1', ctx.slotMeja(lok), -1);
  sama('6 meja penuh: cabang -1', ctx.slotMeja(cab), -1);
  ok('slotBebas() setuju kantor penuh (stasiunPulang tetap benar)',
    ctx.slotBebas('think', lok) === -1 && ctx.stasiunPulang(lok) === 'idle');

  // Yang mengantre berdiri di lajur, bukan di slot — persis aturan slotBebas.
  bersih();
  const antre = duduk(3); antre.antre = 1;
  sama('penghuni ber-antre tidak menahan slotnya', ctx.slotMeja(cab), 3);
}

/* ================================================= 7. kongsi seproyek menang */
judul('7. kongsi seproyek menang atas aturan sisi');
{
  bersih();
  const rekan = buatSatuOrang(ctx, 'diam-di-meja');
  rekan.id = 'lokal-1'; rekan.slotIdx = 2; rekan.x = MEJA[2]; rekan.antre = 0;
  rekan.project = 'alpha'; rekan.mesin = ''; rekan.sejak = 1000;
  H.agents.set(rekan.id, rekan);

  const tamu = buatSatuOrang(ctx, 'nganggur');
  tamu.id = 'cabang-1'; tamu.station = 'think'; tamu.slotIdx = -1; tamu.antre = 0;
  tamu.project = 'alpha'; tamu.mesin = 'kantor-cabang-b'; tamu.sejak = 2000;
  H.agents.set(tamu.id, tamu);

  const k = ctx.slotKongsi(tamu);
  sama('rekan seproyek beda mesin: duduk di meja TERDEKAT ke rekannya (x=176), bukan pojok kanan',
    [k, MEJA[k]], [0, 176]);

  // Beda proyek: aturan sisi kembali berlaku.
  tamu.project = 'beta';
  const k2 = ctx.slotKongsi(tamu);
  sama('beda proyek: cabang kembali ke sisi kanan (x=444)', [k2, MEJA[k2]], [3, 444]);

  // Cabang tanpa proyek sama sekali juga ikut aturan sisi.
  tamu.project = '';
  sama('cabang tanpa proyek: sisi kanan', ctx.slotKongsi(tamu), 3);

  // Pegawai lokal tanpa rekan: sisi kiri — perubahan perilaku yang terlihat
  // walau tidak ada mesin kedua sama sekali (dicatat di komentar room.js).
  bersih();
  const sendiri = buatSatuOrang(ctx, 'nganggur');
  sendiri.id = 'lokal-sendiri'; sendiri.station = 'think'; sendiri.mesin = ''; sendiri.project = '';
  H.agents.set(sendiri.id, sendiri);
  const k3 = ctx.slotKongsi(sendiri);
  sama('sesi pertama (lokal, tanpa rekan) duduk di x=86', [k3, MEJA[k3]], [2, 86]);
}

/* ------------------------------------------------------------- rekapan --- */
console.log('\n' + tebal('rekap: ') + hijau(lulus + ' lulus') + '  ' + (gagal ? merah(gagal + ' gagal') : abu('0 gagal')));
if (gagal) {
  console.log(kuning('yang gagal:'));
  for (const n of catatanGagal) console.log('  - ' + n);
}
process.exit(gagal ? 1 : 0);
