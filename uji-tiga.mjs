#!/usr/bin/env node
// uji-tiga.mjs :: tampilan 3D (public/ruang3d.js) tidak boleh pernah merusak 2D.
//
// Tampilan 3D menempel ke room.js lewat satu kait saja — objek TIGA — plus
// `let ctx` yang boleh ditukar sementara lewat gambarKe(). Janjinya: kalau
// 3D mati (harness uji, peramban tanpa WebGL2, ?tampilan=2d), room.js jalan
// PERSIS seperti sebelum berkas itu ada; kalau 3D menyala, simulasinya tetap
// jalan apa adanya dan cuma penggambarannya yang diserahkan. Dua-duanya gagal
// diam-diam kalau dilanggar — kanvas 2D yang kosong tidak melempar apa-apa,
// dan pegawai yang berhenti berjalan karena update() ikut tergerbang cuma
// kelihatan sebagai "ruangan sepi".
//
// Yang diuji di sandbox uji-event.mjs (VM tanpa WebGL):
//   1. kait TIGA ada, mati bawaan, dan keLayar() 2D mengabaikan argumen kaki;
//   2. gambarKe() menukar ctx dan SELALU mengembalikannya, juga kalau fn melempar;
//   3. TIGA.tanpaNeon / tanpaCCTV cuma membuang tabung neon / kubah CCTV (dan
//      bayangan tempelnya) dari drawWall, bukan dindingnya;
//   4. frame() dengan TIGA.aktif: pegawai tetap di-update, kamera & gambar 3D
//      dipanggil sekali, dan drawWall 2D tidak disentuh sama sekali;
//   5. keLayar() meneruskan garis kaki ke TIGA (bawaan: titik itu sendiri),
//      dan balon/kartu pegawai di room.js memang memberikannya;
//   6. ruang3d.js dimuat di peramban tanpa WebGL2: tidak melempar, tidak
//      menyalakan 3D, tidak menambah satu pun nama global, dan tombolnya
//      mati dengan keterangan.
//
// Pakai:
//   node uji-tiga.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { muatKonteks, buatCtxPalsu, merah, hijau, tebal } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUANG3D_JS = path.join(__dirname, 'public', 'ruang3d.js');

let gagal = 0;
const lulus = (t) => console.log('  ' + hijau('✓') + ' ' + t);
const tolak = (t, ket) => { gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const cek = (syarat, t, ket) => (syarat ? lulus(t) : tolak(t, ket));
const jalankan = (ctx, src) => new vm.Script(src, { filename: 'uji-tiga' }).runInContext(ctx);

console.log(tebal('\nTampilan 3D tidak boleh merusak 2D'));

// ------------------------------------------------------------------ 1
{
  const ctx = muatKonteks();
  cek(jalankan(ctx, 'typeof TIGA === "object" && TIGA.aktif === false'),
    'kait TIGA ada dan mati bawaan');
  const [a, b] = jalankan(ctx, '[JSON.stringify(keLayar(120, 200)), JSON.stringify(keLayar(120, 200, 260))]');
  cek(a === b, 'keLayar() 2D mengabaikan argumen kaki', a + ' vs ' + b);
}

// ------------------------------------------------------------------ 2
{
  const ctx = muatKonteks();
  const hasil = jalankan(ctx, `(() => {
    const asli = ctx, lain = { penanda: 1 };
    let dipakai = null, dilempar = false;
    gambarKe(lain, () => { dipakai = ctx; });
    const pulang1 = ctx === asli;
    try { gambarKe(lain, () => { throw new Error('sengaja'); }); } catch { dilempar = true; }
    return { tukar: dipakai === lain, pulang1, dilempar, pulang2: ctx === asli };
  })()`);
  cek(hasil.tukar, 'gambarKe() menukar ctx selama fn berjalan');
  cek(hasil.pulang1, 'ctx kembali ke kanvas ruangan sesudahnya');
  cek(hasil.dilempar && hasil.pulang2, 'ctx tetap kembali walau fn melempar (galatnya diteruskan)');
}

// ------------------------------------------------------------------ 3
{
  const ctx = muatKonteks();
  const hitung = (kait, nyala) => {
    const k = buatCtxPalsu({ ketat: true });
    jalankan(ctx, 'globalThis.__kPalsu = null');
    ctx.__kPalsu = k;
    jalankan(ctx, `TIGA.${kait} = ${nyala}; try { gambarKe(__kPalsu, () => drawWall()); } finally { TIGA.${kait} = false; }`);
    return k.__kendali.hitung;
  };
  const biasa = hitung('tanpaNeon', false), tanpa = hitung('tanpaNeon', true);
  const neon = jalankan(ctx, 'NEON_X.length');
  const rBiasa = biasa.get('fillRect') || 0, rTanpa = tanpa.get('fillRect') || 0;
  // tiap tabung: dua kabel, rumah lampu, tabung, pendar glow() = 5 fillRect
  cek(rBiasa - rTanpa === neon * 5,
    'TIGA.tanpaNeon membuang tepat tabung neon dari drawWall (' + neon + ' tabung x 5 fillRect)',
    rBiasa + ' - ' + rTanpa + ' != ' + neon * 5);
  cek((tanpa.get('drawImage') || 0) >= 1 && rTanpa > 20, 'dinding & isinya tetap digambar tanpa neon');
  // kubah CCTV: badan, tutup, lensa, LED = 4 fillRect, ditambah dua tingkat
  // bayangan tempelnya di bayangDinding() = 2 fillRect
  const rCctv = hitung('tanpaCCTV', true).get('fillRect') || 0;
  cek(rBiasa - rCctv === 6,
    'TIGA.tanpaCCTV membuang tepat kubah CCTV & bayangan tempelnya dari drawWall (4 + 2 fillRect)',
    rBiasa + ' - ' + rCctv + ' != 6');
  cek(jalankan(ctx, 'TIGA.tanpaNeon === false && TIGA.tanpaCCTV === false'), 'kedua kait pelukis dinding mati lagi sesudahnya');
}

// ------------------------------------------------------------------ 4
{
  const ctx = muatKonteks();
  const hasil = jalankan(ctx, `(() => {
    const catat = { kamera: 0, gambar: 0, dinding: 0, update: 0, stasiunSet: false };
    const drawWallAsli = drawWall;
    drawWall = function () { catat.dinding++; return drawWallAsli(); };
    const palsu = { id: 'uji-3d', x: 120, y: 252, state: 'work', station: 'read', path: [],
      update() { catat.update++; } };
    agents.set('uji-3d', palsu);
    Object.assign(TIGA, {
      aktif: true,
      kamera() { catat.kamera++; },
      gambar(st) { catat.gambar++; catat.stasiunSet = st instanceof Set && st.has('read'); },
      keLayar: () => [0, 0], tampak: () => true,
    });
    frame(performance.now() + 16);
    const tiga = { ...catat };
    // pegawai palsu tidak punya palet: keluarkan dulu sebelum jalur 2D menggambarnya
    agents.delete('uji-3d');
    TIGA.aktif = false;
    frame(performance.now() + 32);
    drawWall = drawWallAsli;
    return { tiga, dua: { ...catat } };
  })()`);
  cek(hasil.tiga.update === 1, 'TIGA.aktif: pegawai tetap di-update (simulasi tidak tahu soal tampilan)');
  cek(hasil.tiga.kamera === 1 && hasil.tiga.gambar === 1, 'TIGA.aktif: kamera() dan gambar() 3D dipanggil sekali per frame');
  cek(hasil.tiga.stasiunSet, 'TIGA.aktif: gambar() menerima Set stasiun yang sedang dipakai');
  cek(hasil.tiga.dinding === 0, 'TIGA.aktif: drawWall 2D tidak disentuh sama sekali', 'dinding = ' + hasil.tiga.dinding);
  cek(hasil.dua.dinding === 1 && hasil.dua.gambar === 1, 'TIGA mati lagi: frame() kembali ke jalur 2D');
}

// ------------------------------------------------------------------ 5
{
  const ctx = muatKonteks();
  const hasil = jalankan(ctx, `(() => {
    const dapat = [];
    Object.assign(TIGA, { aktif: true, keLayar: (...a) => { dapat.push(a); return [0, 0]; } });
    keLayar(10, 20); keLayar(10, 20, 30);
    TIGA.aktif = false;
    return JSON.stringify(dapat);
  })()`);
  cek(hasil === '[[10,20,20],[10,20,30]]', 'keLayar() meneruskan kaki ke TIGA (bawaan: y titik itu sendiri)', hasil);
  const src = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
  const semua = src.match(/keLayar\(this\.x, this\.y - \d+[^)]*\)/g) || [];
  const berkaki = semua.filter((s) => /, this\.y\)$/.test(s));
  cek(semua.length >= 3 && berkaki.length === semua.length,
    'balon ucap, balon pikir, dan lencana galat memberi garis kakinya ke keLayar (' + berkaki.length + '/' + semua.length + ')',
    semua.filter((s) => !berkaki.includes(s)).join(' | '));
  cek(/keLayar\(terpilih\.x, terpilih\.y - 14, terpilih\.y\)/.test(src),
    'kartu pegawai memberi garis kakinya ke keLayar');
}

// ------------------------------------------------------------------ 6
{
  const ctx = muatKonteks();
  const tombol = { disabled: false, title: '', textContent: '', classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, addEventListener() {} };
  const kanvas3d = { hidden: true, width: 0, height: 0, style: {}, classList: tombol.classList,
    getContext: () => null, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const cariAsli = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'room3d' ? kanvas3d : id === 'tampilanBtn' ? tombol : cariAsli(id));
  const sebelum = new Set(Object.keys(ctx));
  let galat = null;
  try { jalankan(ctx, fs.readFileSync(RUANG3D_JS, 'utf8')); } catch (e) { galat = e; }
  cek(!galat, 'ruang3d.js dimuat tanpa WebGL2 tanpa melempar', galat && galat.message);
  cek(jalankan(ctx, 'TIGA.aktif === false && TIGA.gambar === null'), 'tanpa WebGL2: 3D tidak menyala, kait tetap kosong');
  cek(tombol.disabled && /WebGL2/.test(tombol.title), 'tanpa WebGL2: tombol 3D mati dan menjelaskan sebabnya', JSON.stringify(tombol.title));
  const baru = Object.keys(ctx).filter((k) => !sebelum.has(k));
  cek(baru.length === 0, 'ruang3d.js tidak menambah nama global (semuanya di dalam satu fungsi)', baru.join(', '));
}

console.log('');
if (gagal) {
  console.log(merah(tebal(gagal + ' pemeriksaan gagal')));
  process.exit(1);
}
console.log(hijau(tebal('semua lulus')));
