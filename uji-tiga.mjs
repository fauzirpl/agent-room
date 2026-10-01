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
//      mati dengan keterangan;
//   7. dengan WebGL2 PALSU (semua panggilan kosong) ruang3d.js menyala betulan:
//      isi kaca gambarDinding dilukis ke tekstur dinding SESUDAH langit, dan
//      gambarAtas bertanda atasDiDinding masuk ke pelukis dinding, bukan kartu
//      (kontrol: gambarAtas tanpa tanda tetap jadi kartu);
//   8. tiap gambarAtas di registri yang melukis lewat klipJendela bertanda
//      atasDiDinding — kalau tidak, di 3D isi kacanya jadi kartu di kedalaman
//      aktornya, melayang di tengah ruangan.
//   9..12. WebGL2 palsu yang MEREKAM geometri kiriman ruang3d.js, untuk empat
//      perbaikan 3D yang di peramban gagal diam-diam:
//   9. cubit dua jari lalu angkat satu: jari sisa lanjut memutar maket dan
//      kamera tetap hingga; NaN yang disuntik ke kamera pulih dalam satu tick;
//  10. cache warna() tidak tumbuh oleh alfa pecahan (200 alfa unik, 0 kunci);
//  11. notulen / noda kopi / gelas terguling di RUANGAN membangun ulang grup
//      perabot dengan geometri lebih banyak, dan kembali saat dikosongkan;
//  12. yang lewat pintu samping (x -14 lajur bawah, x W+20 lajur atas) dijepit
//      ke teras di atas alas dan memudar; tembok sampingnya berlubang di lajur
//      itu (tidak ada segitiga dinding yang menutupi tengah ambang);
//  13. di ambang pintu samping barang bawaan model event (pel OB, galon yang
//      dipanggul) bergeser & memudar bersama pemiliknya dan lenyap bersamanya,
//      cincin sorotan orang terpilih sepudar dia, dan kubah CCTV tidak
//      membidik orang yang sudah lenyap di sana — dibaca dari isi penyangga
//      titik yang diunggah WebGL2 palsu;
//  14. cubit dua jari lalu satu jari diangkat: sisa jarinya jadi seret dengan
//      ambang 5 px, dan mengangkatnya tidak pernah jadi klik.
//
// Pakai:
//   node uji-tiga.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { muatKonteks, buatCtxPalsu, buatS, buatE, buatPristine, resetRuangan, buatSatuOrang, merah, hijau, tebal } from './uji-event.mjs';

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

// ------------------------------------------------------------------ 7
/* WebGL2 palsu: konstanta jadi angka unik, create* jadi objek, sisanya fungsi
   kosong. Cukup untuk ruang3d.js menyiapkan shader, tekstur, dan wadahnya —
   yang diuji di sini bukan GPU-nya, tapi apa yang dilukis ke kanvas tekstur.
   Dengan `rekam` (bagian 9..12): tiap penyangga dicatat urutan buatnya, dan
   isi tiap bufferSubData DISALIN — Susun memakai ulang lariknya tiap frame.
   Dengan `penyangga` (Map, bagian 13..14): isi titik TERAKHIR yang diunggah
   Wadah.isi ke tiap vbo — wadah yang kosong frame itu tidak mengunggah. */
function glPalsu(rekam = null, penyangga = null) {
  let nomor = 1, terikat = null;
  const gl = new Proxy({}, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return 0x1000 + k.length * 7 + k.charCodeAt(0);
      if (k === 'getShaderParameter') return () => true;
      if (k === 'getProgramParameter') return (p, q) => (q === gl.ACTIVE_UNIFORMS ? 0 : true);
      if (k === 'getParameter') return () => 16;
      if (k === 'getExtension') return () => null;
      if (k === 'isContextLost') return () => false;
      if (k === 'getAttribLocation') return () => 0;
      if (rekam && k === 'createBuffer') return () => { const b = { id: nomor++ }; rekam.penyangga.push(b); return b; };
      if (rekam && k === 'bindBuffer') return (sasaran, b) => { terikat = b; };
      // panjang 0/tanpa panjang = salin seluruh sisa larik, seperti WebGL2
      if (rekam && k === 'bufferSubData') return (sasaran, ofs, d, dari = 0, n = 0) => {
        rekam.unggah.push([terikat, Float32Array.from(n ? d.subarray(dari, dari + n) : d.subarray(dari))]);
      };
      if (k === 'getUniformLocation' || k.startsWith('create')) return () => ({ id: nomor++ });
      if (penyangga && k === 'bindBuffer') return (sasaran, b) => { terikat = b; };
      if (penyangga && k === 'bufferSubData') {
        // panjang 0/tanpa panjang = salin seluruh sisa larik, seperti WebGL2
        return (sasaran, ofs, d, mulai = 0, n = 0) => { penyangga.set(terikat, d.slice(mulai, n ? mulai + n : d.length)); };
      }
      return () => {};
    },
  });
  return gl;
}
// Kanvas & tombol 3D palsu di getElementById konteks itu; pendengar: kait
// addEventListener kanvasnya per jenis (pointerdown, pointerup, ...)
function pasang3D(ctx, gl) {
  const kelas = { toggle() {}, add() {}, remove() {} };
  const tombol = { disabled: false, title: '', textContent: '', classList: kelas, setAttribute() {}, addEventListener() {} };
  const pendengar = {};
  const kanvas3d = { hidden: true, width: 0, height: 0, style: {}, classList: kelas, clientWidth: 800, clientHeight: 450,
    getContext: (j) => (j === 'webgl2' ? gl : null), setPointerCapture() {},
    addEventListener(jenis, fn) { (pendengar[jenis] = pendengar[jenis] || []).push(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }) };
  const cariAsli = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'room3d' ? kanvas3d : id === 'tampilanBtn' ? tombol : cariAsli(id));
  return pendengar;
}
{
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  const J = JSON.parse(jalankan(ctx, 'JSON.stringify(JENDELA)'));
  // Kanvas tekstur dicatat: fillRect langit jendela (gradien, bukan warna) per kanvas
  const log = [];
  ctx.__log = log;
  const buatAsli = ctx.document.createElement;
  ctx.document.createElement = (tag) => {
    const el = buatAsli(tag);
    if (String(tag).toLowerCase() !== 'canvas') return el;
    const k = el.getContext('2d');
    const fr = k.fillRect;
    k.fillRect = function (x, y, w, h) {
      if (x === J.x && y === J.y && w === J.w && h === J.h && typeof k.fillStyle !== 'string') log.push(['langit', k.canvas]);
      return fr.apply(this, arguments);
    };
    return el;
  };
  pasang3D(ctx, glPalsu());
  const galat = [];
  const errAsli = console.error;
  console.error = (...a) => { galat.push(a.map(String).join(' ')); };
  try {
    jalankan(ctx, fs.readFileSync(RUANG3D_JS, 'utf8'));
    resetRuangan(ctx, buatPristine(ctx));
    buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
    const KONTROL = jalankan(ctx, `({ id: 'uji-kartu-atas', kelas: 'latar', durasi: 100,
      gambarAtas() { r(300, 200, 6, 6, '#c22b2b'); } })`);
    for (const def of [H.eventById.get('monas-lampu-malam-dipandangi'), H.eventById.get('pelangi-selepas-hujan'), KONTROL]) {
      const E = buatE(def);
      E.umur = 10;                                 // pelangi sudah tidak memudar masuk
      H.eventHidup.push(E);
    }
    // Pengintai di DALAM vm: membaca `ctx` room.js waktu kait event & isi kaca
    // benar-benar dilukis. Isi klipJendela dicatat saat dilukis, bukan saat dipanggil.
    jalankan(ctx, `(() => {
      let kini = null;
      const klipAsli = klipJendela;
      klipJendela = (fn) => { const id = kini; return klipAsli(() => { __log.push(['isi:' + id, ctx.canvas]); fn(); }); };
      for (const E of eventHidup) {
        for (const kait of ['gambarDinding', 'gambarAtas']) {
          const asli = E.def[kait];
          if (!asli) continue;
          E.def[kait] = function (E2, S2) {
            kini = E.def.id; __log.push([kait + ':' + E.def.id, ctx.canvas]);
            try { return asli.call(this, E2, S2); } finally { kini = null; }
          };
        }
      }
    })()`);
    jalankan(ctx, 'TIGA.kamera(0.016); TIGA.gambar(new Set())');
  } finally {
    console.error = errAsli;
  }
  cek(jalankan(ctx, 'TIGA.aktif === true') && !galat.length, 'WebGL2 palsu: ruang3d.js menyala dan menggambar satu frame tanpa galat', galat.join(' | '));
  const [W, H2, FT] = JSON.parse(jalankan(ctx, 'JSON.stringify([W, H, FLOOR_TOP])'));
  const jenis = (kv) => (!kv || typeof kv.getContext !== 'function' ? 'hampa'
    : kv.width * FT === kv.height * W ? 'dinding' : kv.width === W && kv.height === H2 ? 'kartu' : 'lain');
  const di = (label, j) => log.flatMap(([l, kv], i) => (l === label && jenis(kv) === j ? [i] : []));
  const langit = di('langit', 'dinding'), monas = di('isi:monas-lampu-malam-dipandangi', 'dinding');
  cek(langit.length === 1 && monas.length === 1 && monas[0] > langit[0],
    '3D: isi kaca gambarDinding (Monas & lampu kota) dilukis ke tekstur dinding SESUDAH langit drawWindow',
    `langit ${JSON.stringify(langit)}, isi monas ${JSON.stringify(monas)}`);
  cek(di('gambarAtas:pelangi-selepas-hujan', 'dinding').length === 1 && di('isi:pelangi-selepas-hujan', 'dinding').length === 1
    && di('isi:pelangi-selepas-hujan', 'dinding')[0] > langit[0],
    '3D: gambarAtas bertanda atasDiDinding (pelangi di kaca) masuk ke pelukis dinding, sesudah langit');
  cek(!di('gambarAtas:pelangi-selepas-hujan', 'kartu').length, '3D: gambarAtas bertanda atasDiDinding tidak dijadikan kartu (tidak melayang di kedalaman aktor)');
  cek(di('gambarAtas:uji-kartu-atas', 'kartu').length === 1 && !di('gambarAtas:uji-kartu-atas', 'dinding').length,
    'kontrol: gambarAtas tanpa tanda tetap jadi kartu, tidak ikut ke dinding');
}

// ------------------------------------------------------------------ 8
{
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  const pristine = buatPristine(ctx);
  let kena = 0;
  const klipAsli = ctx.klipJendela;
  ctx.klipJendela = (fn) => { kena++; return klipAsli(fn); };
  const acakAsli = Math.random;
  let benih = 20261001;
  Math.random = () => { benih = (benih * 1103515245 + 12345) % 2147483648; return benih / 2147483648; };
  const lolos = [], tanpaAtas = [];
  let diperiksa = 0;
  try {
    for (const def of H.EVENT_ACAK) {
      if (def.atasDiDinding && typeof def.gambarAtas !== 'function') tanpaAtas.push(def.id);
      if (typeof def.gambarAtas !== 'function') continue;
      diperiksa++;
      kena = 0;
      for (const jam of [12, 20]) {
        resetRuangan(ctx, pristine);
        const S = buatS(ctx, { jam, hujan: 0, petir: false, ramai: true });
        const E = buatE(def);
        const lukis = () => { try { def.gambarAtas(E, S); } catch { /* yang butuh keadaan lain: lewati */ } };
        try {
          def.mulai && def.mulai(E, S);
          lukis();
          const dt = Math.min(2, Math.max(0.1, (def.durasi || 10) / 30));
          for (let n = 1; E.sisa > 0 && n <= 300; n++) {
            E.umur += dt; E.sisa -= dt;
            def.tick && def.tick(E, dt, S);
            lukis();
          }
          def.selesai && def.selesai(E, S);
        } catch { /* yang sempat terlukis tetap dinilai */ }
        for (const a of E.aktor) { a.eventKerja = null; a.betah = a.betahAsli || false; }
      }
      if (kena && !def.atasDiDinding) lolos.push(def.id);
    }
  } finally {
    Math.random = acakAsli;
    ctx.klipJendela = klipAsli;
  }
  cek(lolos.length === 0, 'tiap gambarAtas yang melukis lewat klipJendela bertanda atasDiDinding (' + diperiksa + ' gambarAtas disapu)', lolos.join(', '));
  cek(tanpaAtas.length === 0, 'atasDiDinding cuma dipasang di event yang punya gambarAtas', tanpaAtas.join(', '));
}

// ------------------------------------------------------------------ 9..12
/* ruang3d.js sungguhan di atas glPalsu(rekam), satu sandbox baru per bagian.
   Nama wadah dibaca dari literal WADAH: createBuffer cuma dipanggil di
   konstruktor Wadah, dan properti literal dievaluasi sesuai urutan tulisnya,
   jadi penyangga ke-i = nama ke-i. Satu titik = 13 float (posisi 3, normal 3,
   rgba 4, uv 2, emisi 1), sama seperti LANGKAH di Susun.

   Dua nama room.js jatuh ke dummy sandbox dan dibayangi parameter untuk
   ruang3d.js saja (teks berkasnya tetap apa adanya): stageInner — tanpa
   ukuran panggung, proyeksi dan geser-cubit jadi NaN — dan window, supaya
   window.RUANG3D (pintu konsol, membawa KAM) bisa dibaca. cacheWarna terkurung
   di IIFE: dikenali waktu dimuat sebagai satu-satunya Map yang menerima kunci
   string berisi rgba 0..1, lewat Map#set yang dibungkus selama pemuatan saja
   (Map di sandbox = Map host). Tanpa nama global atau API uji baru. */
const SRC_3D = fs.readFileSync(RUANG3D_JS, 'utf8');
const NAMA_WADAH = [...((SRC_3D.match(/const WADAH = \{([\s\S]*?)\n {2}\};/) || [])[1] || '').matchAll(/(\w+): new Wadah\(/g)].map((m) => m[1]);
const LANGKAH = 13;
const konsol = (fn) => {
  const log = [], err = console.error, warn = console.warn;
  console.error = console.warn = (...a) => { log.push(a.map(String).join(' ')); };
  try { fn(); } finally { console.error = err; console.warn = warn; }
  return log;
};
function muat3D() {
  const ctx = muatKonteks();
  ctx.__ctxPalsu.__kendali.ketat = false;
  const rekam = { penyangga: [], unggah: [] };
  const dengar = new Map();                       // jenis event -> pendengar kanvas 3D
  const kelas = { toggle() {}, add() {}, remove() {} };
  const tombol = { disabled: false, title: '', textContent: '', classList: kelas, setAttribute() {}, addEventListener() {} };
  const kanvas3d = { hidden: true, width: 0, height: 0, style: {}, classList: kelas,
    getContext: (j) => (j === 'webgl2' ? glPalsu(rekam) : null),
    addEventListener(jenis, fn) { if (!dengar.has(jenis)) dengar.set(jenis, []); dengar.get(jenis).push(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }) };
  const cariAsli = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'room3d' ? kanvas3d : id === 'tampilanBtn' ? tombol : cariAsli(id));
  ctx.__panggung = { clientWidth: 800, clientHeight: 450, appendChild() {} };
  ctx.__jendela = { devicePixelRatio: 1 };
  // WeakMap tidak ada di daftar bawaan sandbox uji-event.mjs: `new WeakMap()`
  // jadi dummy, dan keadaanOrang/capPartikel ruang3d.js membaca yaw, duduk, dan
  // cap partikel sebagai NaN — tiap pegawai & partikel 3D berposisi NaN.
  ctx.WeakMap = WeakMap;
  const petaWarna = new Set();
  const setAsli = Map.prototype.set;
  const rgba = (v) => Array.isArray(v) && v.length === 4 && v.every((c) => typeof c === 'number' && c >= 0 && c <= 1);
  const log = konsol(() => {
    Map.prototype.set = function (k, v) {
      if (typeof k === 'string' && rgba(v)) petaWarna.add(this);
      return setAsli.call(this, k, v);
    };
    try {
      jalankan(ctx, '((stageInner, window) => {\n' + SRC_3D + '\n})(__panggung, __jendela)');
    } finally {
      Map.prototype.set = setAsli;
    }
  });
  const R3 = ctx.__jendela.RUANG3D;
  // satu frame 3D; hasilnya: nama wadah -> salinan isi yang dikirim frame itu
  // (wadah yang tidak dikirim = tidak berubah, atau kosong untuk yang dinamis)
  const satuFrame = () => {
    rekam.unggah.length = 0;
    jalankan(ctx, 'TIGA.kamera(0.016); TIGA.gambar(new Set())');
    const nama = new Map(rekam.penyangga.map((b, i) => [b, NAMA_WADAH[i]]));
    return new Map(rekam.unggah.map(([b, d]) => [nama.get(b), d]));
  };
  const siap = jalankan(ctx, 'TIGA.aktif === true') && !!R3 && !log.length
    && NAMA_WADAH.length > 0 && rekam.penyangga.length === NAMA_WADAH.length;
  const ket = `aktif ${jalankan(ctx, 'TIGA.aktif')}, RUANG3D ${!!R3}, penyangga ${rekam.penyangga.length} vs WADAH ${NAMA_WADAH.length}`
    + (log.length ? ', konsol: ' + log.join(' | ') : '');
  return { ctx, H: ctx.__jembatan__, dengar, petaWarna, satuFrame, KAM: R3 && R3.kamera, siap, ket };
}

// ------------------------------------------------------------------ 9
{
  console.log(tebal('\n3D: cubit, cache warna, taplak rapat, pintu samping'));
  const U = muat3D();
  cek(U.siap, 'WebGL2 perekam: ruang3d.js menyala, wadahnya terbaca dari literal WADAH', U.ket);
  const { ctx, dengar, KAM } = U;
  const sentuh = (jenis, id, x, y) => {
    for (const fn of dengar.get(jenis) || []) {
      fn({ type: jenis, pointerId: id, clientX: x, clientY: y, button: 0, pointerType: 'touch',
        shiftKey: false, ctrlKey: false, preventDefault() {} });
    }
  };
  const BIDANG = ['yaw', 'pitch', 'zoom', 'yawK', 'pitchK', 'jarakK', 'sasaran', 'sasaranK'];
  const rusak = () => BIDANG.filter((k) => ![].concat(KAM[k]).every(Number.isFinite));
  const tickKamera = () => jalankan(ctx, 'TIGA.kamera(0.016)');
  const h = {};
  const log = konsol(() => {
    U.satuFrame();
    sentuh('pointerdown', 1, 300, 200);
    sentuh('pointerdown', 2, 400, 200);
    sentuh('pointermove', 2, 460, 210);           // cubit: zoom & geser sasaran
    h.zoomCubit = KAM.zoom;
    sentuh('pointerup', 2, 460, 210);             // angkat satu jari...
    h.yaw0 = KAM.yaw;
    sentuh('pointermove', 1, 340, 204);           // ...jari sisa terus menyeret
    h.yaw1 = KAM.yaw;
    h.rusakSeret = rusak();
    sentuh('pointerup', 1, 340, 204);
    for (let i = 0; i < 5; i++) tickKamera();
    h.rusakTick = rusak();
  });
  cek(h.zoomCubit !== 1 && Number.isFinite(h.zoomCubit), '3D cubit: dua jari mengubah zoom (pendengar kanvas sungguhan yang dipanggil)', 'zoom ' + h.zoomCubit);
  cek(!h.rusakSeret.length && Number.isFinite(h.yaw1) && h.yaw1 !== h.yaw0,
    '3D cubit: angkat satu jari lalu seret — jari sisa memutar maket, kamera tetap hingga',
    `yaw ${h.yaw0} -> ${h.yaw1}, rusak: ${h.rusakSeret.join(', ')}`);
  cek(!h.rusakTick.length && !log.some((l) => /tidak hingga/.test(l)),
    '3D cubit: sesudah 5 tick semua bidang kamera hingga, jaring NaN tidak perlu turun tangan',
    `rusak: ${h.rusakTick.join(', ')}; konsol: ${log.join(' | ')}`);
  KAM.yawK = NaN;
  const logNaN = konsol(tickKamera);
  cek(!rusak().length && jalankan(ctx, 'TIGA.aktif === true'),
    '3D kamera: NaN yang disuntik ke yawK pulih dalam satu tick (3D tetap menyala)', 'rusak: ' + rusak().join(', '));
  cek(logNaN.some((l) => /kamera .*tidak hingga/.test(l)), '3D kamera: pemulihan NaN dilaporkan', logNaN.join(' | ') || '(konsol sepi)');
}

// ------------------------------------------------------------------ 10
{
  const U = muat3D();
  const { ctx } = U;
  const [peta] = U.petaWarna;
  cek(U.siap && U.petaWarna.size === 1, 'cacheWarna dikenali dari luar IIFE (satu Map kunci-string berisi rgba)', U.ket + ', calon ' + U.petaWarna.size);
  // 40 partikel tinta di lantai; tiap frame alfanya diganti semua, tidak ada yang kembar
  const N = 40, FRAME = 5;
  const alfa = (f, i) => 0.25 + (f * N + i) * 0.0013;
  const isiAlfa = (f) => jalankan(ctx, `parts.forEach((p, i) => { p.a = 0.25 + (${f} * ${N} + i) * 0.0013; })`);
  let ukuran0 = 0, ukuran1 = 0, tergambar = 0;
  const log = konsol(() => {
    jalankan(ctx, `parts.length = 0;
      for (let i = 0; i < ${N}; i++) parts.push({ x: 200 + i * 6, y: 230, vx: 0, vy: 0, g: 0, life: 1, c: '#c93030', s: 1, a: 1 });`);
    U.satuFrame(); U.satuFrame();                 // pemanasan: warna partikelnya sudah tersimpan
    ukuran0 = peta ? peta.size : 0;
    let akhir = null;
    for (let f = 1; f <= FRAME; f++) { isiAlfa(f); akhir = U.satuFrame(); }
    ukuran1 = peta ? peta.size : 0;
    // bukti partikelnya memang lewat warna(c, alfa): tiap alfa frame terakhir ada di wadah pudar
    const d = akhir.get('pudar') || new Float32Array(0), ada = new Set();
    for (let i = 9; i < d.length; i += LANGKAH) ada.add(d[i]);
    for (let i = 0; i < N; i++) if (ada.has(Math.fround(alfa(FRAME, i)))) tergambar++;
    jalankan(ctx, 'parts.length = 0');
  });
  cek(tergambar === N && !log.length, `3D warna: ${N} partikel per frame tergambar dengan alfanya sendiri (${FRAME} frame, ${N * FRAME} alfa unik)`,
    `tergambar ${tergambar}/${N}; ${log.join(' | ')}`);
  cek(ukuran1 - ukuran0 === 0, '3D warna: cache warna tidak tumbuh oleh alfa unik',
    `tumbuh ${ukuran1 - ukuran0} kunci (${ukuran0} -> ${ukuran1}) untuk ${N * FRAME} alfa unik`);
}

// ------------------------------------------------------------------ 11
{
  const U = muat3D();
  const { H } = U;
  cek(U.siap, 'WebGL2 perekam menyala untuk uji taplak', U.ket);
  const KOSONG = { notulen: 0, nodaKopi: [], gelasGuling: null };
  // titik di wadah perabot frame ini; null = tidak dibangun ulang (tandaPerabot sama)
  const ukur = (ubah) => {
    Object.assign(H.RUANGAN, KOSONG, ubah);
    const d = U.satuFrame().get('perabot');
    return d ? d.length / LANGKAH : null;
  };
  const h = {};
  const log = konsol(() => {
    h.n0 = ukur({});                              // frame 3D pertama selalu membangun
    h.diam = ukur({});
    h.notulen = ukur({ notulen: 4 });
    h.notulenPulang = ukur({});
    h.nodaKopi = ukur({ nodaKopi: [{ x: 236, y: 214, lebar: 5 }] });
    h.nodaPulang = ukur({});
    h.gelasGuling = ukur({ gelasGuling: 226 });
    h.gelasPulang = ukur({});
    h.semua = ukur({ notulen: 7, nodaKopi: [{ x: 236, y: 214, lebar: 5 }, { x: 290, y: 200, lebar: 4 }], gelasGuling: 266 });
    h.kosong = ukur({});
  });
  cek(h.n0 > 0 && h.diam === null && !log.length, 'kontrol: tanpa perubahan RUANGAN grup perabot tidak dibangun ulang',
    `awal ${h.n0}, frame kedua ${h.diam}; ${log.join(' | ')}`);
  for (const k of ['notulen', 'nodaKopi', 'gelasGuling']) {
    cek(h[k] !== null && h[k] > h.n0, `3D taplak: RUANGAN.${k} mengubah tandaPerabot dan menambah geometri grup perabot`,
      `${h.n0} -> ${h[k]} titik (null = tidak dibangun ulang)`);
  }
  cek(h.notulenPulang === h.n0 && h.nodaPulang === h.n0 && h.gelasPulang === h.n0,
    '3D taplak: tiap keadaan yang dikosongkan lagi mengembalikan geometri persis semula',
    `${h.n0} vs ${h.notulenPulang} / ${h.nodaPulang} / ${h.gelasPulang}`);
  cek(h.semua > Math.max(h.notulen, h.nodaKopi, h.gelasGuling) && h.kosong === h.n0,
    '3D taplak: ketiganya sekaligus menambah lebih banyak, lalu kosong kembali ke semula', `semua ${h.semua}, kosong ${h.kosong}`);
}

// ------------------------------------------------------------------ 12
{
  const U = muat3D();
  const { ctx, H } = U;
  cek(U.siap, 'WebGL2 perekam menyala untuk uji pintu samping', U.ket);
  const [W, LANE_DOWN, LANE_UP] = JSON.parse(jalankan(ctx, 'JSON.stringify([W, LANE_DOWN, LANE_UP])'));
  const ALAS = 12;                                    // alas maket: -12 .. W+12 (bangunStatis)
  const orang = (id, x, y) => {
    const o = buatSatuOrang(ctx, 'nganggur');
    Object.assign(o, { id, x, y, phase: 0, face: x < 0 ? 'left' : 'right', hadap: x < 0 ? 'left' : 'right' });
    H.agents.set(id, o);
  };
  orang('pulang-kiri', -14, LANE_DOWN);              // lahir/pulang di tepi kiri, sudah lewat ambang
  orang('pulang-kanan', W + 20, LANE_UP);            // PINTU_X room.js
  orang('di-ambang-kiri', -4, LANE_DOWN);            // baru melangkah keluar: masih kelihatan, memudar
  orang('di-ambang-kanan', W + 4, LANE_UP);
  let f = null;
  const log = konsol(() => { U.satuFrame(); f = U.satuFrame(); });
  const layar = (x, y) => JSON.parse(jalankan(ctx, `JSON.stringify(TIGA.keLayar(${x}, ${y}, ${y}))`));
  const tampak = (x, y) => jalankan(ctx, `TIGA.tampak(${x}, ${y})`);
  // letak p di ruas a->b (t 0..1) dan jaraknya dari garis itu, dalam piksel layar
  const diRuas = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return { t: ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L), jauh: Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L };
  };
  // Kaki orang (tinggi 0) diproyeksikan keLayar lewat posisiOrang; titik lantai
  // tanpa orang di (x, lajur) jadi pembanding: kakinya harus di ruas tepi alas..tembok.
  for (const [nama, x, y, tepi, tembok] of [['kiri', -14, LANE_DOWN, -ALAS, 0], ['kanan', W + 20, LANE_UP, W + ALAS, W]]) {
    const p = layar(x, y), r = diRuas(p, layar(tepi, y), layar(tembok, y));
    cek(p.every(Number.isFinite) && r.t >= 0 && r.t <= 1 && r.jauh < 0.5,
      `3D pintu samping ${nama}: orang di x ${x} dijepit ke teras ambang, di atas alas (antara ${tepi} dan ${tembok})`,
      `layar ${JSON.stringify(p)}, t ${r.t.toFixed(3)}, jauh ${r.jauh.toFixed(2)} px`);
    cek(tampak(x, y) === false, `3D pintu samping ${nama}: yang sudah lewat ambang memudar habis (balon & klik ikut hilang)`);
  }
  cek(tampak(-4, LANE_DOWN) === true && tampak(W + 4, LANE_UP) === true, 'kontrol: yang baru di ambang masih tampak');
  // Geometri pegawai (pejal & pudar) di pita lajur pintu, di luar garis tembok
  const PITA = 16;
  const pita = { luar: [], pejal: 0, pudar: { kiri: 0, kanan: 0 } };
  for (const nama of ['dinamis', 'dinamisKulit', 'pudar']) {
    const d = f.get(nama) || new Float32Array(0);
    for (let i = 0; i < d.length; i += LANGKAH) {
      const x = d[i], z = d[i + 2], a = d[i + 9];
      const sisi = x < 0 && Math.abs(z - LANE_DOWN) < PITA ? 'kiri' : x > W && Math.abs(z - LANE_UP) < PITA ? 'kanan' : null;
      if (!sisi) continue;
      if (x < -ALAS || x > W + ALAS) pita.luar.push(`${nama} x ${x.toFixed(1)}`);
      if (a >= 0.999) pita.pejal++;
      else if (a > 0) pita.pudar[sisi]++;
    }
  }
  cek(!log.length && pita.luar.length === 0, '3D pintu samping: tidak ada pegawai yang digambar di luar alas maket',
    pita.luar.slice(0, 4).join(', ') + (log.length ? ' | ' + log.join(' | ') : ''));
  cek(pita.pejal === 0 && pita.pudar.kiri > 0 && pita.pudar.kanan > 0,
    '3D pintu samping: yang di balik garis tembok digambar memudar (alfa < 1), tidak pejal',
    `pejal ${pita.pejal}, pudar kiri ${pita.pudar.kiri}, kanan ${pita.pudar.kanan}`);
  // Lubang tembok: proyeksikan tiap segitiga dinding samping ke bidang (z, y) —
  // sinar sepanjang x menembus tembok — dan uji titik-dalam-segitiga sungguhan:
  // tiga hasil kali silang setanda dengan luasnya. Muka yang tegak lurus tembok
  // jadi segitiga berluas nol di bidang itu dan memang tidak menutupi apa-apa.
  const samping = f.get('samping') || new Float32Array(0);
  const menutupi = (xMin, xMax, z, y) => {
    for (let i = 0; i + 3 * LANGKAH <= samping.length; i += 3 * LANGKAH) {
      const P = [0, 1, 2].map((j) => [samping[i + j * LANGKAH], samping[i + j * LANGKAH + 2], samping[i + j * LANGKAH + 1]]);
      if (P.some(([x]) => x < xMin || x > xMax)) continue;
      const silang = (a, b, u, v) => (b[1] - a[1]) * (v - a[2]) - (b[2] - a[2]) * (u - a[1]);
      const luas = silang(P[0], P[1], P[2][1], P[2][2]);
      if (Math.abs(luas) < 1e-6) continue;
      if ([[P[0], P[1]], [P[1], P[2]], [P[2], P[0]]].every(([a, b]) => silang(a, b, z, y) * luas >= 0)) return true;
    }
    return false;
  };
  for (const [nama, xMin, xMax, lajur] of [['kiri', -8, 3, LANE_DOWN], ['kanan', W - 3, W + 8, LANE_UP]]) {
    const tertutup = [5, 20, 39, 60, 75].filter((y) => menutupi(xMin, xMax, lajur, y));
    cek(tertutup.length === 0, `3D tembok samping ${nama}: berlubang di lajur ${lajur} — tidak ada segitiga dinding yang menutupi tengah ambang`,
      'tertutup di tinggi ' + tertutup.join(', '));
    cek(menutupi(xMin, xMax, lajur + 40, 39) && menutupi(xMin, xMax, lajur - 40, 39),
      `kontrol: tembok samping ${nama} tetap pejal di luar ambang (z ${lajur} ± 40)`);
  }
}

/* Konteks baru dengan ruang3d.js menyala di atas WebGL2 palsu yang mencatat
   isi penyangganya. Seperti di peramban: window = global (catatOrangEvent
   menukar window.drawPerson untuk mencatat sosok tamu event), dan built-in
   yang tidak didaftarkan sandbox uji-event.mjs (WeakMap, Proxy, Infinity,
   ...) tidak jatuh ke dummy — keadaanOrang & tiruanEvent yang dummy membuat
   boneka tamu event jadi dummy juga, diam-diam tidak tergambar, dan
   `jarak = Infinity` yang dummy membuat kubah CCTV tidak pernah membidik.
   galat: console.error/warn ruang3d.js (aman() melaporkan model event yang
   melempar lewat console.warn). */
function nyalakan3D() {
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined });
  jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
  const penyangga = new Map(), galat = [];
  const pendengar = pasang3D(ctx, glPalsu(null, penyangga));
  jalankan(ctx, fs.readFileSync(RUANG3D_JS, 'utf8'));
  resetRuangan(ctx, buatPristine(ctx));
  buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  H.eventHidup.length = 0;
  // satu frame 3D; yang dibaca sesudahnya cuma yang diunggah frame ini
  const bingkai = () => {
    penyangga.clear();
    const [e, w] = [console.error, console.warn];
    console.error = console.warn = (...a) => { galat.push(a.map(String).join(' ')); };
    try { jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())'); } finally { [console.error, console.warn] = [e, w]; }
  };
  // titik (posisi + alfa) yang warna rgb-nya persis hex, dari frame terakhir
  const titik = (hex, saring = () => true) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hasil = [];
    for (const d of penyangga.values()) {
      for (let i = 0; i + 13 <= d.length; i += 13) {
        if (!(Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3)) continue;
        const p = { x: d[i], y: d[i + 1], z: d[i + 2], a: d[i + 9] };
        if (saring(p)) hasil.push(p);
      }
    }
    return hasil;
  };
  return { ctx, H, pendengar, galat, bingkai, titik };
}
const tengahX = (ps) => (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
const alfaSemua = (ps, a) => ps.length > 0 && ps.every((p) => Math.abs(p.a - a) < 0.01);
const ringkas = (ps) => ps.length + ' titik, alfa ' + [...new Set(ps.map((p) => p.a.toFixed(3)))].join('/')
  + (ps.length ? ', tengah x ' + tengahX(ps).toFixed(2) : '');

// ------------------------------------------------------------------ 13
/* Pintu samping: yang lewat ambangnya memudar & bergeser (ambangSamping) —
   barang bawaan yang dibangun model event di luar susunOrang harus ikut
   pemiliknya, bukan tertinggal pejal di posisi simulasi di luar alas.
   Pembandingnya selalu badan pemiliknya sendiri di frame yang sama. */
{
  const { ctx, H, galat, bingkai, titik } = nyalakan3D();
  // satu event hidup, E baru tiap kali: bonekanya mulai dari catatan kosong
  // (diam, menghadap depan) supaya jarak barang ke badannya bisa dibandingkan
  const pasang = (id, data) => {
    H.eventHidup.length = 0;
    const E = buatE(H.eventById.get(id));
    Object.assign(E.data, data);
    H.eventHidup.push(E);
    bingkai();
  };
  const BAJU_OB = '#2f6f8a', KEPALA_PEL = '#c9c3b0';
  const ob = (x) => ({ t: { x, fase: 'pulang', jeda: 0, sapuT: 0 }, petak: [] });
  pasang('ob-ngepel-lantai', ob(100));
  const badanDalam = titik(BAJU_OB), pelDalam = titik(KEPALA_PEL);
  cek(alfaSemua(badanDalam, 1) && alfaSemua(pelDalam, 1), 'kontrol: OB ngepel di dalam ruangan — boneka & kepala pelnya pejal',
    'badan ' + ringkas(badanDalam) + '; pel ' + ringkas(pelDalam));
  const jarakDalam = tengahX(pelDalam) - tengahX(badanDalam);

  pasang('ob-ngepel-lantai', ob(-7));
  const badan = titik(BAJU_OB), pel = titik(KEPALA_PEL), alfaAmbang = badan.length ? badan[0].a : NaN;
  cek(alfaAmbang > 0.1 && alfaAmbang < 0.9 && alfaSemua(badan, alfaAmbang), 'OB pulang lewat ambang pintu samping: bonekanya memudar', ringkas(badan));
  cek(alfaSemua(pel, alfaAmbang), 'kepala pelnya sepudar badannya, bukan pejal', 'badan ' + ringkas(badan) + '; pel ' + ringkas(pel));
  const jarak = tengahX(pel) - tengahX(badan);
  cek(pel.length && Math.abs(jarak - jarakDalam) < 0.3, 'kepala pelnya ikut bergeser bersama badannya (jaraknya sama dengan di dalam ruangan)',
    'jarak ' + jarak.toFixed(2) + ', di dalam ' + jarakDalam.toFixed(2));

  pasang('ob-ngepel-lantai', ob(-13.9));
  cek(!titik(BAJU_OB).length && !titik(KEPALA_PEL).length, 'OB yang sudah lenyap di ambang: kepala pelnya ikut lenyap',
    'badan ' + ringkas(titik(BAJU_OB)) + '; pel ' + ringkas(titik(KEPALA_PEL)));

  // galon menumpang matriks badan tukangnya: posisinya sudah ikut, alfanya harus ikut juga
  const BAJU_GALON = '#3f6285', GALON = '#7db8e8', dekatPintu = (p) => p.x < 40;
  pasang('tukang-galon-datang', { t: { x: -7, y: 252, fase: 'masuk' } });
  const tukang = titik(BAJU_GALON), galon = titik(GALON, dekatPintu), alfaTukang = tukang.length ? tukang[0].a : NaN;
  cek(alfaTukang < 0.9 && alfaSemua(galon, 0.9 * alfaTukang), 'galon yang dipanggul memudar bersama tukangnya di ambang',
    'tukang ' + ringkas(tukang) + '; galon ' + ringkas(galon));

  // cincin sorotan orang terpilih: di sosoknya, sepudar ambangnya
  H.eventHidup.length = 0;
  const AMBER = '#ffb454', diLantai = (p) => p.y <= 1.01;
  jalankan(ctx, 'terpilih = { x: 100, y: 252, alpha: 1 }');
  bingkai();
  const cincinDalam = titik(AMBER, diLantai);
  jalankan(ctx, 'terpilih = { x: -7, y: 252, alpha: 1 }');
  bingkai();
  const cincin = titik(AMBER, diLantai);
  cek(alfaSemua(cincinDalam, 1) && alfaSemua(cincin, alfaAmbang),
    'cincin sorotan orang terpilih yang lewat ambang sepudar badan di titik itu (kontrol: pejal di dalam ruangan)',
    'dalam ' + ringkas(cincinDalam) + '; ambang ' + ringkas(cincin) + ', badan ' + alfaAmbang.toFixed(3));

  // kubah CCTV: arah lensa = dari cincin lensa ke kaca lensanya (dua kotak sesumbu)
  const yawCctv = () => {
    const dekat = (p) => Math.abs(p.x - 9) < 6 && Math.abs(p.y - 100.4) < 4;
    const lensa = titik('#101418', dekat), cincinLensa = titik('#5a6068', dekat);
    const rata = (ps, k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
    return Math.atan2(rata(lensa, 'x') - rata(cincinLensa, 'x'), rata(lensa, 'z') - rata(cincinLensa, 'z'));
  };
  const jalan = Object.assign(buatSatuOrang(ctx), { y: 252, state: 'walk', phase: 0 });
  ctx.__orangUji = jalan;
  jalankan(ctx, 'terpilih = null; agents.set("uji-cctv", __orangUji)');
  jalan.x = -3; bingkai();
  const yawTampak = yawCctv();
  jalan.x = -13.9; bingkai();
  const yawLenyap = yawCctv();
  jalankan(ctx, 'agents.delete("uji-cctv"); terpilih = { x: -13.9, y: 252, alpha: 1 }');
  bingkai();
  const yawTerpilih = yawCctv();
  jalankan(ctx, 'terpilih = null');
  // tanpa sasaran kubahnya menyapu sendiri: yaw 0,7 ± 0,45 — selalu menoleh ke kanan
  cek(yawTampak < 0 && yawLenyap > 0.2 && yawTerpilih > 0.2,
    'kubah CCTV membidik yang berjalan di ambang, tapi tidak lagi yang sudah lenyap di sana (berjalan maupun terpilih)',
    'yaw tampak ' + yawTampak.toFixed(2) + ', lenyap ' + yawLenyap.toFixed(2) + ', terpilih lenyap ' + yawTerpilih.toFixed(2));
  cek(!galat.length, 'frame-frame uji ambang tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 14
/* Cubit dua jari lalu satu jari diangkat: sisanya lanjut sebagai seret dari
   jari itu — dengan ambang 5 px seperti seret biasa (getar jari tidak
   memutar maket), dan mengangkatnya tidak pernah jadi klik. */
{
  const { ctx, pendengar } = nyalakan3D();
  jalankan(ctx, 'TIGA.kamera(0.016); TIGA.gambar(new Set())');           // matriks kamera untuk sinar klik
  // klik3D berujung bukaKartu (kena orang) atau tutupKartu (kena yang lain)
  jalankan(ctx, `globalThis.__klik = 0;
    bukaKartu = () => { __klik++; }; tutupKartu = () => { __klik++; };
    tutupKartuBarang = () => {}; bukaKartuBarang = () => {}; klikBanner = () => false; klikSisip = () => false;`);
  const KAM = jalankan(ctx, 'RUANG3D.kamera');
  const jari = (jenis, id, x, y) => {
    const e = { type: jenis, pointerId: id, clientX: x, clientY: y, button: 0, pointerType: 'touch', shiftKey: false, ctrlKey: false };
    for (const fn of pendengar[jenis] || []) fn(e);
  };
  const klik = () => jalankan(ctx, '__klik');

  jari('pointerdown', 1, 300, 200); jari('pointerup', 1, 300, 200);
  cek(klik() === 1, 'kontrol: ketuk satu jari tetap jadi klik', 'klik ' + klik());

  jalankan(ctx, '__klik = 0');
  const [yaw0, pitch0] = [KAM.yaw, KAM.pitch];
  jari('pointerdown', 1, 300, 200); jari('pointerdown', 2, 420, 200);
  jari('pointerup', 2, 420, 200);
  jari('pointermove', 1, 303, 201);
  cek(KAM.yaw === yaw0 && KAM.pitch === pitch0, 'cubit tinggal satu jari: getar < 5 px tidak memutar maket',
    'yaw ' + yaw0 + ' -> ' + KAM.yaw + ', pitch ' + pitch0 + ' -> ' + KAM.pitch);
  jari('pointerup', 1, 303, 201);
  cek(klik() === 0, 'mengangkat jari terakhir sesudah cubit tidak jadi klik', 'klik ' + klik());

  jari('pointerdown', 1, 300, 200); jari('pointerdown', 2, 420, 200);
  jari('pointerup', 2, 420, 200);
  jari('pointermove', 1, 330, 200);
  const diputar = KAM.yaw !== yaw0 && Number.isFinite(KAM.yaw) && Number.isFinite(KAM.pitch);
  jari('pointerup', 1, 330, 200);
  cek(diputar && klik() === 0, 'seret sesudah cubit tetap memutar maket (angkanya hingga), dan tetap bukan klik',
    'yaw ' + KAM.yaw + ', klik ' + klik());
}

console.log('');
if (gagal) {
  console.log(merah(tebal(gagal + ' pemeriksaan gagal')));
  process.exit(1);
}
console.log(hijau(tebal('semua lulus')));
