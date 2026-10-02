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
//  15. pose 'jongkok' di 3D benar-benar jongkok: kepala jauh lebih rendah dari
//      berdiri, telapak rata di lantai (tidak satu verteks pun di bawahnya),
//      tangan meraih lantai; pemeran event RAIH_MEJA bungkuk setinggi mesin
//      (lebih tinggi dari jongkok); loncatan senam Jumat (a.y di sekitar
//      a.slotY) menaikkan badan, bukan menggeser z.
//  16. layar laptop meja kerja 3D mengikuti drawMejaKerja 2D — MOD.layarPucat
//      (redup, baris bernapas lalu hilang), MOD.sidak (terang penuh),
//      MOD.layarPutih (putih memancar), MOD.slotTerkunci (empat titik),
//      MOD.mejaGetar (layar & lampu meja yang dipakai mengetik bergoyang ±1),
//      MOD.kipasGetar (kipas bergetar ±1): dipasang lewat defineProperty,
//      kembali persis begitu dicabut; pantulan biru layar di meja cuma malam.
//  17. satpam tetap yang diam di pos duduk di kursi lipatnya (pinggul di atas
//      papan dudukan, bukan di bibirnya; lirikan jadi tolehan kepala), bangkit
//      saat berjalan, dipinjam event, 'hormat', atau tegak; pegawai lain di
//      titik itu tetap berdiri; pose 'ngantuk' mengangguk (gerak dikurangi:
//      tunduk diam).
//  18. cahaya malam yang bergerak di slot lampu titik 13-15 (uniform uLampuPos/
//      uLampuWarna direkam lewat gl palsu yang dibungkus): nol di siang tanpa
//      event; senter satpam berpatroli menyala di ujung senternya waktu malam,
//      ikut melangkah, genangannya di dinding/lantai yang disorot (tidak di
//      mode ringan); sapuan lampu mobil & sirene mengikuti x 2D-nya, sirene
//      berganti merah/biru persis 2D-nya dan tidak berkedip waktu gerak
//      dikurangi; tak satu pun menenggelamkan neon dari 15 satuan ke atas.
//  19. sinar matahari ikut jam: petak sinar drawFloor pukul 8 cermin pukul 16
//      (pagi condong ke kanan, sore ke kiri) dan memanjang waktu matahari
//      rendah; ujung lantai prisma berkas 3D, petak di tekstur lantainya, dan
//      debu 3D-nya memakai bentuk yang sama (petakSinar); kilat menyalakan
//      prisma seukuran kaca plus petak empat daun di lantai — kecuali
//      prefers-reduced-motion. Debu 2D lahir di petak jam itu, dan event yang
//      menyentuh berkasnya (karpet-rapat-digulung-dijemur, debu-menari-di-
//      berkas, silau-sore-gorden 2D & 3D) membaca petakSinar juga, bukan
//      salinan trapesium lama.
//  20. lengan bersiku: tiap pose POSE_3D membawa telapaknya ke sasaran yang
//      dibaca dari geometri bonekanya sendiri — hormat di alis dengan siku
//      membuka ke samping, salam melambai di samping kepala di atas bahu,
//      hidung/nguap di hidung/mulut, hp di telinga (teleponnya terjepit di
//      antaranya), usap di tengkuk, silang di depan dada tanpa menjulur,
//      tepuk bertemu di depan dada lalu membuka, map disposisi dipegang di
//      tepinya; barang bawaan ikut telapaknya; lengan diam tetap menggantung
//      lurus persis lengan lama; semua titiknya hingga.
//  21. wajah berekspresi: ekspresi() 2D di boneka 3D — tegang (macet galat,
//      menunggu keputusan) melotot berbiji putih dengan tetes keringat di pipi
//      yang meluncur (gerak dikurangi: diam), lega ^ ^ tersenyum, fokus
//      menyipit, lelah berkelopak berat — dan keadaan wajah dari event: mulut
//      menganga sambil kepala mendongak (terbaca juga dari belakang), peci
//      melorot miring, masker (a.masker, MOD.masker) menutup mulut, kacamata
//      dilepas (matanya memicing), pulpen di telinga kanan; tiap keadaan cuma
//      mengubah kepala dan kembali persis begitu dicabut; semua titik hingga.
//  22. kursi ikut bergerak: pegawai yang duduk di meja kerja dengan a.miring
//      (bersandar-ayun-kursi) rebah ke belakang bersama dudukan & sandaran
//      kursi putarnya — satu benda tegar berporos di puncak tiang, kaki
//      bintang diam, tidak berguling ke samping (yang berjalan tetap
//      sempoyongan); kursi tambahan yang diseret (a.tugasKursi) ikut di
//      belakang petugasnya pergi & pulang, menikung di belokan; kursi meja
//      kerja mundur 2 waktu penghuninya bangkit dan ditarik lagi saat diduduki.
//  23. barang kecil yang menempel di badan orang — tumpukan undangan caraka,
//      tanda tanya tamu nyasar, kamera wartawan, gulungan audit-token — jadi
//      voxel di matriks badan bonekanya: dipindah ke dua tempat, barangnya
//      bergeser persis sejauh badannya, di tinggi yang masuk akal, dan
//      gambarProp-nya tidak lagi melukis warna barang itu ke kanvas kartu;
//      tamu tenar anak (TOKOH.anak) jadi boneka berskala anak di titik
//      tamunya — lebih pendek dari pegawai, badannya tak tercetak di kartu,
//      goyang jogetnya bukan langkah, stiker aksesorinya tidak dibuat ulang
//      tiap frame.
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

// ------------------------------------------------------------------ 15
/* Jongkok sungguhan. Dulu 'jongkok' (pose event terbanyak) cuma memiringkan
   badan 0,25 rad dengan kaki lurus. Satu pegawai berpalet unik di lajur
   bawah, menghadap +z; titik bonekanya dibaca dari penyangga frame (badan,
   celana, kulit, plus sepatu di dekat kakinya). Tiap keadaan ditahan 30
   frame supaya turun-tegaknya yang halus sudah sampai. */
{
  console.log(tebal('\n3D: jongkok, bungkuk setinggi meja, loncatan senam'));
  const { ctx, H, galat, bingkai, titik } = nyalakan3D();
  const PAL = { main: '#5be0c9', pants: '#c95be0', skin: '#e0c95b' };    // tidak dipakai benda lain
  const Y0 = 252;
  const a = Object.assign(buatSatuOrang(ctx), { x: 100, y: Y0, phase: 0, face: 'down', hadap: 'down' });
  a.pal = Object.assign({}, a.pal, PAL);
  ctx.__orangUji = a;
  jalankan(ctx, 'agents.set("uji-jongkok", __orangUji)');
  const SEPATU = jalankan(ctx, 'SEPATU');
  const ujung = (ps, k, f) => (ps.length ? f(...ps.map((p) => p[k])) : NaN);
  const tengahZ = (ps) => (ujung(ps, 'z', Math.min) + ujung(ps, 'z', Math.max)) / 2;
  const ukur = () => {
    for (let i = 0; i < 30; i++) bingkai();
    const dekat = (p) => Math.abs(p.x - a.x) < 14 && Math.abs(p.z - Y0) < 16;
    const kulit = titik(PAL.skin), baju = titik(PAL.main), sepatu = titik(SEPATU, dekat);
    const semua = [...kulit, ...baju, ...titik(PAL.pants), ...sepatu];
    const tangan = kulit.filter((p) => Math.abs(p.x - a.x) > 6);           // lengan di x ±5,4 lokal; kepala ±4
    return {
      n: semua.length, hingga: semua.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)),
      kepala: ujung(kulit, 'y', Math.max), bawah: ujung(semua, 'y', Math.min),
      tangan: ujung(tangan, 'y', Math.min), tanganZ: ujung(tangan, 'z', Math.max),
      telapak: ujung(sepatu, 'y', Math.min), ujungKaki: ujung(sepatu, 'z', Math.max), badanZ: tengahZ(baju),
    };
  };
  const angka = (u) => Object.entries(u).map(([k, v]) => k + ' ' + (typeof v === 'number' ? v.toFixed(2) : v)).join(', ');
  const balon = () => jalankan(ctx, `JSON.stringify(TIGA.keLayar(${a.x}, ${a.y - 34}, ${a.y}))`);

  const berdiri = ukur(), balonBerdiri = balon();
  cek(berdiri.n > 0 && berdiri.hingga && Math.abs(berdiri.telapak) < 0.01 && berdiri.bawah > -0.01,
    'kontrol: pegawai berdiri — boneka tergambar, telapaknya di lantai', angka(berdiri));

  a.pose = 'jongkok';
  const jongkok = ukur();
  cek(jongkok.hingga && jongkok.kepala < 0.72 * berdiri.kepala,
    '3D jongkok: kepalanya jauh lebih rendah dari berdiri (pinggul turun, paha & betis terlipat)',
    `kepala ${jongkok.kepala.toFixed(2)} vs berdiri ${berdiri.kepala.toFixed(2)}; ${angka(jongkok)}`);
  cek(jongkok.bawah > -0.01 && Math.abs(jongkok.telapak) < 0.01,
    '3D jongkok: telapaknya tetap rata di lantai — tidak satu verteks pun di bawah lantai', angka(jongkok));
  cek(jongkok.tangan < 0.3 * berdiri.tangan && jongkok.tanganZ > jongkok.ujungKaki,
    '3D jongkok: tangannya terulur ke depan-bawah meraih lantai (di depan ujung sepatu)',
    `tangan ${jongkok.tangan.toFixed(2)} (berdiri ${berdiri.tangan.toFixed(2)}), z tangan ${jongkok.tanganZ.toFixed(2)} vs ujung kaki ${jongkok.ujungKaki.toFixed(2)}`);
  cek(balon() === balonBerdiri, '3D jongkok: balon & kartunya tetap di tinggi berdiri (keLayar tidak berubah)', balonBerdiri + ' vs ' + balon());

  // jongkok sebagai pemeran event yang meraih mesin (RAIH_MEJA): bungkuk berdiri
  const pasang = (id) => {
    H.eventHidup.length = 0;
    const E = buatE(H.eventById.get(id));
    E.aktor.push(a); E.data.a = a; E.data.tahap = 3;
    a.eventKerja = E;
    H.eventHidup.push(E);
  };
  pasang('jatah-kuota-cair');
  const bungkuk = ukur();
  cek(bungkuk.hingga && bungkuk.kepala > jongkok.kepala + 5,
    '3D bungkuk (jatah-kuota-cair: rim di atas mesin fotokopi): kepalanya lebih tinggi dari jongkok',
    `kepala ${bungkuk.kepala.toFixed(2)} vs jongkok ${jongkok.kepala.toFixed(2)}, berdiri ${berdiri.kepala.toFixed(2)}`);
  cek(bungkuk.tangan > berdiri.tangan + 5 && bungkuk.bawah > -0.01 && Math.abs(bungkuk.telapak) < 0.01,
    '3D bungkuk: tangannya terulur ke tinggi mesin, telapak tetap di lantai', angka(bungkuk));
  pasang('bolpoin-jatuh-ke-kolong');
  const kontrol = ukur();
  cek(Math.abs(kontrol.kepala - jongkok.kepala) < 0.01 && Math.abs(kontrol.tangan - jongkok.tangan) < 0.01,
    'kontrol: pemeran event yang jongkok ke lantai (bolpoin ke kolong) tetap jongkok — dibedakan per id event',
    `kepala ${kontrol.kepala.toFixed(2)} vs jongkok ${jongkok.kepala.toFixed(2)}`);
  H.eventHidup.length = 0;
  a.eventKerja = null; a.pose = null;

  // Senam Jumat: a.y bergoyang di sekitar a.slotY (event/04)
  a.slotY = Y0; a.y = Y0 - 4;
  const lompat = ukur();
  cek(lompat.telapak > 4 && Math.abs(lompat.badanZ - berdiri.badanZ) < 0.01 && lompat.bawah > 4,
    '3D senam: loncatan (a.y 4 di atas slotY) mengangkat badan, z tetap di slotnya',
    `telapak ${lompat.telapak.toFixed(2)}, z badan ${lompat.badanZ.toFixed(2)} vs berdiri ${berdiri.badanZ.toFixed(2)}`);
  a.y = Y0 + 4;
  const mendarat = ukur();
  cek(Math.abs(mendarat.telapak) < 0.01 && mendarat.bawah > -0.01 && Math.abs(mendarat.badanZ - berdiri.badanZ) < 0.01,
    '3D senam: separuh gelombang di bawah slotY = mendarat — di lantai, tidak maju dan tidak tenggelam', angka(mendarat));
  a.slotY = null; a.y = Y0 - 4;
  const tanpaSlot = ukur();
  cek(Math.abs(tanpaSlot.badanZ - (berdiri.badanZ - 4)) < 0.01 && Math.abs(tanpaSlot.telapak) < 0.01,
    'kontrol: tanpa slotY, a.y yang sama memang kedalaman (badan bergeser 4, tetap di lantai)', angka(tanpaSlot));
  cek(!galat.length, 'frame-frame uji jongkok tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 16
/* Layar laptop meja kerja 3D mengikuti drawMejaKerja 2D. Tiap MOD dipasang
   lewat defineProperty — seperti event yang menulisnya tiap tick, resetMod
   tidak bisa menghapusnya — lalu dicabut lagi. `now` dibekukan: warna layar
   berdenyut menurut now, tanpa itu "kembali persis" tak bisa dibandingkan.
   Meja 0 dipakai mengetik; meja 1 kosong jadi pembanding. Yang dibaca: muka
   depan (normal +z) layar, baris kode, dan titik kunci di wadah dinamis. */
{
  console.log(tebal('\n3D: layar laptop meja kerja ikut ulah event'));
  const U = muat3D();
  const { ctx, H } = U;
  cek(U.siap, 'WebGL2 perekam menyala untuk uji layar laptop', U.ket);
  const MEJA_H = Number((SRC_3D.match(/const MEJA_H = (\d+);/) || [])[1]);
  const [MX, KAKI] = JSON.parse(jalankan(ctx, 'JSON.stringify([MEJA_KERJA_X, MEJA_KERJA_Y])'));
  H.agents.set('uji-layar', Object.assign(buatSatuOrang(ctx, 'kerja'), { id: 'uji-layar', slotIdx: 0, x: MX[0], y: KAKI }));
  const NOW = 777777, ASLI = { ...H.MOD };
  const bingkai = (n) => {
    jalankan(ctx, `now = ${n}`);
    const f = U.satuFrame();
    return { dinamis: f.get('dinamis') || new Float32Array(0), sinar: f.get('sinar') || new Float32Array(0) };
  };
  const pasang = (mod, n = NOW) => {
    for (const [k, v] of Object.entries(mod)) Object.defineProperty(H.MOD, k, { get: () => v, set() {}, configurable: true, enumerable: true });
    try { return bingkai(n); } finally {
      for (const k of Object.keys(mod)) { delete H.MOD[k]; H.MOD[k] = ASLI[k]; }
    }
  };
  const ambil = (d, saring) => {
    const ps = [];
    for (let i = 0; i + LANGKAH <= d.length; i += LANGKAH) {
      const p = { x: d[i], y: d[i + 1], z: d[i + 2], nz: d[i + 5], rgb: [d[i + 6], d[i + 7], d[i + 8]], a: d[i + 9], e: d[i + 12] };
      if (saring(p)) ps.push(p);
    }
    return ps;
  };
  // layar 336.2, baris & titik kunci 336.3; badan & tutup laptop statis (tidak di wadah dinamis)
  const layarMeja = (f, k) => ambil(f.dinamis, (p) => p.nz === 1 && p.z > 335.9 && p.z < 336.4
    && p.x > MX[k] + 11.5 && p.x < MX[k] + 30.5 && p.y > MEJA_H + 1 && p.y < MEJA_H + 14);
  const muka = (ps) => ps.filter((p) => Math.abs(p.z - 336.2) < 0.01);
  const baris = (ps) => ps.filter((p) => Math.abs(p.z - 336.3) < 0.01);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const warnanya = (ps, h) => ps.length > 0 && ps.every((p) => p.rgb.every((v, j) => Math.abs(v - hex(h)[j]) < 2e-3));
  const terang = (ps) => ps.reduce((s, p) => s + p.rgb[0] + p.rgb[1] + p.rgb[2], 0) / Math.max(1, ps.length);
  const sidik = (ps, dx = 0) => ps.map((p) => [p.x + dx, p.y, p.z, ...p.rgb, p.a, p.e].map((v) => v.toFixed(4)).join(',')).sort().join(' | ');
  const berwarna = (d, h, saring) => ambil(d, (p) => p.rgb.every((v, j) => Math.abs(v - hex(h)[j]) < 2e-3) && saring(p));
  const kap = (f) => berwarna(f.dinamis, '#2c3440', (p) => p.x > MX[0] - 34 && p.x < MX[0] - 23 && p.z > 331 && p.z < 338);
  const tiangKipas = (f) => berwarna(f.dinamis, '#c9ced4', (p) => Math.abs(p.z - 290) < 2 && Math.abs(p.x - 400) < 30);
  const pantulan = (f) => berwarna(f.sinar, '#9fc3ff', (p) => p.x >= MX[0] + 8.9 && p.x <= MX[0] + 32.1 && p.z > 335 && p.z < 348);
  const ket = (ps) => `${ps.length} titik (muka ${muka(ps).length}, baris ${baris(ps).length}), terang ${terang(ps).toFixed(3)}, e ${[...new Set(ps.map((p) => p.e.toFixed(3)))].join('/')}`;
  const h = {};
  const log = konsol(() => {
    bingkai(NOW); bingkai(NOW);                  // pemanasan: statis dibangun, boneka sudah duduk
    h.biasa = bingkai(NOW);
    h.pucat = pasang({ layarPucat: 1 });
    h.pucatSetengah = pasang({ layarPucat: 0.5 });
    h.sidak = pasang({ sidak: true });
    h.sidakPucat = pasang({ sidak: true, layarPucat: 1 });
    h.putih = pasang({ layarPutih: 1 });
    h.kunci = pasang({ slotTerkunci: 0 });
    h.getar = pasang({ mejaGetar: 0 });
    h.getarKosong = pasang({ mejaGetar: 1 });
    h.kipas = pasang({ kipasGetar: 1 });
    h.pulang = bingkai(NOW);
    // malam lewat lampuMin; `now` lain karena ambien() di-cache per now
    h.malam = pasang({ lampuMin: 1 }, NOW + 5000);
    h.malamPucat = pasang({ lampuMin: 1, layarPucat: 1 }, NOW + 5000);
  });
  const L = (k, m = 0) => layarMeja(h[k], m);
  const biasa = L('biasa');
  cek(!log.length && biasa.length === 24 && muka(biasa).length === 6 && baris(biasa).length === 18
    && muka(biasa).every((p) => Math.abs(p.e - 0.85) < 1e-3) && muka(L('biasa', 1)).length === 6 && L('biasa', 1).every((p) => p.e === 0),
    'kontrol: meja yang dipakai mengetik — layar menyala (emisi 0,85) dengan tiga baris; meja kosong padam',
    'meja 0: ' + ket(biasa) + '; meja 1: ' + ket(L('biasa', 1)) + (log.length ? ' | ' + log.join(' | ') : ''));
  cek(baris(L('pucat')).length === 0 && warnanya(muka(L('pucat')), '#121a2c'),
    'MOD.layarPucat 1: layar meredup ke #121a2c dan barisnya hilang (layar-mengantuk)', ket(L('pucat')));
  cek(baris(L('pucatSetengah')).length === 18 && terang(baris(L('pucatSetengah'))) < terang(baris(biasa)) - 0.3
    && terang(muka(L('pucatSetengah'))) < terang(muka(biasa)),
    'MOD.layarPucat 0,5: baris masih ada tapi bernapas redup, layarnya ikut meredup', ket(L('pucatSetengah')) + ' vs biasa ' + ket(biasa));
  cek(muka(L('sidak')).every((p) => Math.abs(p.e - 1) < 1e-6) && sidik(L('sidak')) !== sidik(biasa),
    'MOD.sidak: layar terang penuh (emisi 1, denyutnya ditahan di puncak)', ket(L('sidak')));
  cek(sidik(L('sidakPucat')) === sidik(L('sidak')),
    'MOD.sidak menang atas MOD.layarPucat: baris tetap ada, layar tetap terang', ket(L('sidakPucat')));
  cek(L('putih').length === 24 && warnanya(L('putih'), '#ffffff') && L('putih').every((p) => Math.abs(p.e - 1) < 1e-6),
    'MOD.layarPutih 1: seluruh muka layar putih memancar (emisi 1)', ket(L('putih')));
  cek(warnanya(muka(L('kunci')), '#141a20') && baris(L('kunci')).length === 24 && warnanya(baris(L('kunci')), '#5a6068'),
    'MOD.slotTerkunci: layar gelap dengan empat titik, bukan baris kode', ket(L('kunci')));
  const dx = (a, b) => tengahX(a) - tengahX(b);
  const dLayar = dx(L('getar'), biasa), dKap = dx(kap(h.getar), kap(h.biasa));
  cek(Math.abs(Math.abs(dLayar) - 1) < 1e-3 && sidik(L('getar')) === sidik(biasa, dLayar) && Math.abs(dKap - dLayar) < 1e-3,
    'MOD.mejaGetar: layar, barisnya, dan kap lampu meja bergoyang ±1 bersama',
    `geser layar ${dLayar.toFixed(3)}, kap ${dKap.toFixed(3)}`);
  cek(sidik(L('getarKosong', 1)) === sidik(L('biasa', 1)) && sidik(L('getarKosong')) === sidik(biasa),
    'kontrol: MOD.mejaGetar di meja yang tidak dipakai mengetik tidak menggoyang apa pun');
  const dKipas = dx(tiangKipas(h.kipas), tiangKipas(h.biasa));
  cek(tiangKipas(h.biasa).length > 0 && Math.abs(Math.abs(dKipas) - 1) < 1e-3 && sidik(L('kipas')) === sidik(biasa),
    'MOD.kipasGetar: tiang kipas angin bergetar ±1 (motor macet)', `geser ${dKipas.toFixed(3)}, ${tiangKipas(h.biasa).length} titik`);
  cek(sidik(L('pulang')) === sidik(biasa) && sidik(L('pulang', 1)) === sidik(L('biasa', 1))
    && sidik(kap(h.pulang)) === sidik(kap(h.biasa)) && sidik(tiangKipas(h.pulang)) === sidik(tiangKipas(h.biasa)),
    'semua MOD dicabut: layar, kap, dan kipas kembali persis seperti semula', ket(L('pulang')));
  const pMalam = pantulan(h.malam);
  cek(!pantulan(h.biasa).length && pMalam.length === 12 && pMalam.every((p) => Math.abs(p.a - 0.13) < 1e-3)
    && !pantulan(h.malamPucat).length,
    'pantulan biru layar di papan meja & dek keyboard: cuma malam, ikut padam saat barisnya hilang',
    `siang ${pantulan(h.biasa).length}, malam ${ringkas(pMalam)}, malam pucat ${pantulan(h.malamPucat).length}`);
}

// ------------------------------------------------------------------ 17
/* Satpam jaga pos duduk di kursi lipatnya (dudukDiPos di ruang3d.js), dan
   pose 'ngantuk' mengangguk (anggukKantuk). Satpamnya satpam tetap sungguhan
   (pastikanPetugasTetap, class Standby) yang dipindah ke titik POS_SATPAM.
   Ukurannya dibaca dari titik yang diunggah frame itu: pinggul = pusat sabuk
   (kotak 8..9 lokal yang mengapit poros pinggul 8,5), papan dudukan &
   sandaran = warna kursi lipat (kursiLipatSatpam), sudut kepala = arah lidah
   topi dari puncaknya. Celananya sewarna tali bahu seragam satpam, jadi paha
   dibaca di bawah bahu saja. matchMedia sandbox jatuh ke dummy yang
   .matches-nya truthy, jadi muatannya dibuat di sini dengan
   prefers-reduced-motion yang dipilih: menyala untuk duduk/berdiri
   (pelunakan langsung sampai) dan tunduk diam, mati untuk anggukan. */
{
  console.log(tebal('\n3D: satpam duduk di kursi lipat pos, kepala terkantuk'));
  const muat = (gerakKurang) => {
    const ctx = muatKonteks();
    const H = ctx.__jembatan__;
    ctx.__ctxPalsu.__kendali.ketat = false;
    Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined,
      matchMedia: () => ({ matches: gerakKurang }) });
    jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
    const penyangga = new Map(), galat = [];
    pasang3D(ctx, glPalsu(null, penyangga));
    jalankan(ctx, SRC_3D);
    resetRuangan(ctx, buatPristine(ctx));
    buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
    H.eventHidup.length = 0;
    const P = JSON.parse(jalankan(ctx, 'JSON.stringify(POS_SATPAM)'));
    const satpam = H.standby.find((b) => b.tetap === 'satpam');
    // diam di pos persis seperti sesudah tickTetap: menghadap ruangan, tanpa event
    const diPos = (o) => Object.assign(o, { x: P.titikX, y: P.titikY, path: [], state: 'idle', face: 'down', hadap: 'down',
      pose: null, eventKerja: null, tegak: false, phase: 0 });
    if (satpam) diPos(satpam);
    // satu frame; hasilnya: hex -> titik berwarna persis itu di sekitar pos
    const bingkai = () => {
      penyangga.clear();
      const [e, w] = [console.error, console.warn];
      console.error = console.warn = (...a) => { galat.push(a.map(String).join(' ')); };
      try { jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())'); } finally { [console.error, console.warn] = [e, w]; }
      const data = [...penyangga.values()];
      return (hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hasil = [];
        for (const d of data) {
          for (let i = 0; i + 13 <= d.length; i += 13) {
            if (Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3
              && Math.abs(d[i] - P.titikX) < 14 && Math.abs(d[i + 2] - P.titikY) < 16) hasil.push({ x: d[i], y: d[i + 1], z: d[i + 2] });
          }
        }
        return hasil;
      };
    };
    return { ctx, H, P, satpam, diPos, bingkai, galat };
  };
  const rata = (ps, k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
  const rentang = (ps, k) => [Math.min(...ps.map((p) => p[k])), Math.max(...ps.map((p) => p[k]))];
  const lebar = (xs) => Math.max(...xs) - Math.min(...xs);

  const U = muat(true);
  const { ctx, H, P, satpam } = U;
  cek(!!satpam, 'kontrol: satpam tetap lahir di sandbox (pastikanPetugasTetap)');
  const TOPI = JSON.parse(jalankan(ctx, 'JSON.stringify(TOPI_SATPAM)'));
  // sabuk = sh(celana, 0.7), dan sh() menulis 'rgb(r,g,b)'
  const sabukHex = (o) => '#' + jalankan(ctx, `sh(${JSON.stringify(o.pal.pants)}, 0.7)`).match(/\d+/g)
    .map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  // frame pertama: grup statis ikut terunggah — papan dudukan (atas #56606a,
  // badan #4a525c) dan sandaran (#3a4048) kursi lipat
  const w0 = U.bingkai();
  const atasPapan = w0('#56606a'), badanPapan = w0('#4a525c'), sandaran = w0('#3a4048');
  const [x0, x1] = rentang(atasPapan, 'x'), [z0, z1] = rentang(atasPapan, 'z');
  const KURSI = { atas: rentang(atasPapan, 'y')[1], bawah: rentang(badanPapan, 'y')[0], sandaran: rentang(sandaran, 'z')[1] };
  cek(atasPapan.length > 0 && badanPapan.length > 0 && sandaran.length > 0 && KURSI.atas > KURSI.bawah && KURSI.sandaran < z1,
    'kontrol: papan dudukan & sandaran kursi lipat pos terbaca dari grup statis', JSON.stringify({ x0, x1, z0, z1, ...KURSI }));

  // pinggul (pusat sabuk), paha terendah di tapak dudukan (di bawah tali bahu),
  // dan arah lidah topi: angguk = sudut ke bawah/atas, toleh = sudut ke samping
  const ukur = (V, o) => {
    const w = V.bingkai();
    const sabuk = w(sabukHex(o));
    const paha = w(o.pal.pants).filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1 && p.y < KURSI.atas + 4);
    const isi = w(TOPI.isi).filter((p) => p.y > 26), lidah = w(TOPI.lidah).filter((p) => p.y > 26);
    const v = ['x', 'y', 'z'].map((k) => rata(lidah, k) - rata(isi, k));
    return {
      pinggul: sabuk.length ? { x: rata(sabuk, 'x'), y: rata(sabuk, 'y'), z: rata(sabuk, 'z'), punggung: rentang(sabuk, 'z')[0] } : null,
      paha: paha.length ? rentang(paha, 'y')[0] : null,
      angguk: Math.atan2(v[1], Math.hypot(v[0], v[2])), toleh: Math.atan2(v[0], v[2]),
    };
  };
  const duduk = (m) => !!m.pinggul && m.pinggul.y >= KURSI.atas && m.pinggul.y <= KURSI.atas + 1.5
    && m.pinggul.x > x0 && m.pinggul.x < x1 && m.pinggul.z > z0 && z1 - m.pinggul.z >= 2;
  const berdiri = (m) => !!m.pinggul && m.pinggul.y > KURSI.atas + 3 && m.pinggul.z > z1;
  const teks = (m) => (m.pinggul ? `pinggul y ${m.pinggul.y.toFixed(2)} z ${m.pinggul.z.toFixed(2)}` : 'sabuk tak terbaca')
    + `, paha terendah di tapak ${m.paha == null ? '-' : m.paha.toFixed(2)}; dudukan y ${KURSI.bawah}..${KURSI.atas}, z ${z0}..${z1}`;

  const jaga = ukur(U, satpam);
  cek(duduk(jaga), 'satpam diam di pos: pinggulnya setinggi dudukan kursi lipat, jauh dari bibir depannya (bukan berdiri)', teks(jaga));
  cek(jaga.paha != null && jaga.paha >= KURSI.bawah - 0.05 && jaga.paha <= KURSI.atas,
    'pahanya menumpang di papan dudukan: tidak menembus ke bawah papan, tidak melayang di atasnya', teks(jaga));
  cek(!!jaga.pinggul && jaga.pinggul.punggung >= KURSI.sandaran,
    'punggungnya tidak menembus sandaran', `punggung z ${jaga.pinggul && jaga.pinggul.punggung.toFixed(2)}, sandaran ${KURSI.sandaran}`);

  satpam.face = satpam.hadap = 'left';                 // lirikan tickTetap
  const lirik = ukur(U, satpam);
  satpam.face = satpam.hadap = 'down';
  cek(duduk(lirik) && Math.hypot(lirik.pinggul.x - jaga.pinggul.x, lirik.pinggul.z - jaga.pinggul.z) < 0.01 && lirik.toleh < -0.5,
    'melirik ke kiri sambil duduk: badannya tetap di dudukan menghadap depan, kepalanya yang menoleh',
    teks(lirik) + `, toleh kepala ${lirik.toleh.toFixed(3)}`);

  for (const [ket, ubah] of [
    ['berjalan meninggalkan pos (berangkat patroli)', { state: 'walk', path: [{ x: P.titikX - 60, y: P.titikY }] }],
    ['dipinjam event (menerima tamu, laporan ronda)', { eventKerja: {} }],
    ["tersentak 'hormat' (HT berbunyi)", { eventKerja: {}, pose: 'hormat' }],
    ['berdiri tegak (Indonesia Raya)', { tegak: true }],
  ]) {
    Object.assign(satpam, ubah);
    const m = ukur(U, satpam);
    U.diPos(satpam);
    cek(berdiri(m), `satpam ${ket}: bangkit, pinggulnya setinggi orang berdiri di depan kursi`, teks(m));
  }

  Object.assign(satpam, { eventKerja: {}, pose: 'ngantuk' });
  const kantuk = [0, 0.7, 1.4, 2.1].map((t) => { satpam.phase = t; return ukur(U, satpam); });
  U.diPos(satpam);
  cek(kantuk.every(duduk), "satpam terkantuk di pos (jaga-pos-ketiduran, pose 'ngantuk'): tetap duduk", kantuk.map(teks).join(' | '));
  const tunduk = kantuk.map((m) => m.angguk);
  cek(lebar(tunduk) < 1e-4 && jaga.angguk - tunduk[0] > 0.2,
    "gerak dikurangi: kepala yang terkantuk tunduk diam (lebih tunduk dari biasa, sudutnya sama antar frame)",
    `tegak ${jaga.angguk.toFixed(3)}, terkantuk ${tunduk.map((s) => s.toFixed(3)).join(' ')}`);

  const lain = H.standby.find((b) => !b.tetap);
  satpam.x = P.titikX - 120;                            // keluar dari jangkauan baca
  U.diPos(lain);
  const mLain = ukur(U, lain);
  U.diPos(satpam);
  cek(berdiri(mLain), `kontrol: ${lain.peran} (bukan satpam) yang diam di titik pos tetap berdiri`, teks(mLain));

  const G = muat(false);
  Object.assign(G.satpam, { eventKerja: {}, pose: 'ngantuk' });
  for (let i = 0; i < 12; i++) G.bingkai();            // pelunakan duduk & hadap sampai dulu
  const angguk = [];
  for (let i = 0; i < 10; i++) { G.satpam.phase = i * 0.4; angguk.push(ukur(G, G.satpam).angguk); }
  G.diPos(G.satpam);
  for (let i = 0; i < 12; i++) G.bingkai();
  const diam = [];
  for (let i = 0; i < 6; i++) { G.satpam.phase = i * 0.4; diam.push(ukur(G, G.satpam).angguk); }
  cek(lebar(angguk) > 0.2, "pose 'ngantuk': kepalanya mengangguk — sudutnya berubah antar frame (4 detik, langkah 0,4)",
    angguk.map((s) => s.toFixed(3)).join(' '));
  cek(lebar(diam) < 1e-4, 'kontrol: tanpa pose ngantuk kepala satpam yang duduk diam', diam.map((s) => s.toFixed(3)).join(' '));
  cek(!U.galat.length && !G.galat.length, 'frame-frame uji satpam tanpa galat', [...U.galat, ...G.galat].join(' | '));
}

// ------------------------------------------------------------------ 18
/* Cahaya malam yang bergerak di tiga slot lampu titik terakhir: 13 senter
   satpam, 14 sapuan lampu mobil, 15 sirene. Uniform uLampuPos/uLampuWarna
   direkam dengan MEMBUNGKUS WebGL2 palsu (glPalsu tetap apa adanya): program
   melaporkan dua uniform aktif itu saja, lokasinya membawa namanya, dan tiap
   uniform4fv/3fv ke lokasi itu disalin — larik CAHAYA dipakai ulang tiap
   frame. ringanAktif dan matchMedia dibayangi parameter untuk ruang3d.js saja
   (seperti stageInner/window di muat3D): di sandbox keduanya dummy yang
   selalu benar, jadi mode ringan & gerak-dikurangi selalu menyala. Posisi x
   2D sapuan & sirene dan warna sirene dibaca dari gambarAtas event-nya
   sendiri (fillRect pertama di ctx perekam), bukan dihafal. */
{
  console.log(tebal('\n3D: cahaya malam yang bergerak (senter satpam, lampu mobil, sirene)'));
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined });
  jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
  const penyangga = new Map(), uni = {}, kendali = { ringan: false, gerakKurang: false };
  const dasar = glPalsu(null, penyangga), AKTIF = ['uLampuPos[0]', 'uLampuWarna[0]'];
  const gl = new Proxy({}, {
    get(t, k) {
      if (k === 'getProgramParameter') return (p, q) => (q === dasar.ACTIVE_UNIFORMS ? AKTIF.length : true);
      if (k === 'getActiveUniform') return (p, i) => ({ name: AKTIF[i] });
      if (k === 'getUniformLocation') return (p, nama) => ({ nama });
      if (k === 'uniform4fv' || k === 'uniform3fv') return (loc, d) => { if (loc && loc.nama) uni[loc.nama] = Float32Array.from(d); };
      return dasar[k];
    },
  });
  pasang3D(ctx, gl);
  const media = (q) => (/reduced-motion/.test(q) ? { get matches() { return kendali.gerakKurang; }, addEventListener() {} }
    : { matches: false, addEventListener() {} });
  ctx.__k18 = { ringan: () => kendali.ringan, media };
  const galat = [];
  const diam = (fn) => {
    const [e, w] = [console.error, console.warn];
    console.error = console.warn = (...a) => { galat.push(a.map(String).join(' ')); };
    try { return fn(); } finally { [console.error, console.warn] = [e, w]; }
  };
  diam(() => jalankan(ctx, '((ringanAktif, matchMedia) => {\n' + SRC_3D + '\n})(__k18.ringan, __k18.media)'));
  resetRuangan(ctx, buatPristine(ctx));
  H.eventHidup.length = 0;
  const [W, DINDING_Z, LANE_DOWN] = JSON.parse(jalankan(ctx, 'JSON.stringify([W, FLOOR_TOP - 10, LANE_DOWN])'));
  // x tengah & warna fillRect pertama gambarAtas 2D event E pada `now` sekarang
  jalankan(ctx, `globalThis.__dua = (E) => {
    const rek = [], k = new Proxy({}, {
      get: (t, p) => (p === 'fillRect' ? (x, y, w) => { rek.push([x + w / 2, t.fillStyle]); }
        : p === 'createRadialGradient' || p === 'createLinearGradient' ? () => ({ addColorStop() {} }) : p in t ? t[p] : () => {}),
      set: (t, p, v) => { t[p] = v; return true; },
    });
    gambarKe(k, () => E.def.gambarAtas(E, S));
    return rek[0];
  }`);
  const setel = (jam) => { buatS(ctx, { jam, hujan: 0, petir: false, ramai: false }); jalankan(ctx, 'ambBasis = null'); };
  const bingkai = (n = 2) => diam(() => {
    for (let i = 0; i < n; i++) {
      penyangga.clear();
      jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())');
    }
  });
  const slot = (i) => {
    const p = uni['uLampuPos[0]'], w = uni['uLampuWarna[0]'];
    return p && w ? { x: p[i * 4], y: p[i * 4 + 1], z: p[i * 4 + 2], redam: p[i * 4 + 3], c: [w[i * 3], w[i * 3 + 1], w[i * 3 + 2]] }
      : { x: NaN, y: NaN, z: NaN, redam: NaN, c: [NaN, NaN, NaN] };
  };
  const terang = (s) => s.c[0] + s.c[1] + s.c[2];
  const tulis = (s) => `(${[s.x, s.y, s.z].map((v) => v.toFixed(1)).join(', ')}) rgb ${s.c.map((v) => v.toFixed(3)).join('/')}`;
  // titik (posisi) yang rgb-nya persis hex, dari frame terakhir
  const titik = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hasil = [];
    for (const d of penyangga.values()) {
      for (let i = 0; i + 13 <= d.length; i += 13) {
        if (Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3) hasil.push({ x: d[i], y: d[i + 1], z: d[i + 2] });
      }
    }
    return hasil;
  };
  const GENANGAN = '#ffe9b0', LENSA = '#e8d98a';
  const rentang = (ps, k) => (ps.length ? Math.min(...ps.map((p) => p[k])).toFixed(2) + '..' + Math.max(...ps.map((p) => p[k])).toFixed(2) : '-');
  const sebaran = (ps) => `${ps.length} titik, x ${rentang(ps, 'x')}, y ${rentang(ps, 'y')}, z ${rentang(ps, 'z')}`;

  // siang, tanpa event, tanpa pembawa senter
  setel(12);
  bingkai();
  const neonSiang = terang(slot(0));
  cek(neonSiang > 0 && [13, 14, 15].every((i) => terang(slot(i)) === 0),
    'siang tanpa event: slot lampu 13-15 nol (kontrol: uniform terekam, neon slot 0 menyala)',
    `neon ${neonSiang}; ` + [13, 14, 15].map((i) => i + ' ' + tulis(slot(i))).join('; '));

  // satpam berpatroli: senter di tangan, berpose nunjuk di depan mesin absen, menghadap dinding
  const satpam = buatSatuOrang(ctx, 'nganggur');
  Object.assign(satpam, { id: 'uji-satpam', x: 424, y: 152, face: 'up', hadap: 'up', state: 'idle', phase: 0, pose: 'nunjuk', bawa: 'senter' });
  H.agents.set('uji-satpam', satpam);
  bingkai();
  cek(titik(LENSA).length > 0 && terang(slot(13)) < 0.01 && !titik(GENANGAN).length,
    'siang: satpam berpatroli membawa senter (lensanya tergambar), tapi lampu senternya nyaris nol dan tanpa genangan',
    `lensa ${titik(LENSA).length} titik; slot 13 ${tulis(slot(13))}; genangan ${sebaran(titik(GENANGAN))}`);

  setel(21);
  bingkai();
  const s13 = slot(13), genangDinding = titik(GENANGAN);
  cek(terang(s13) > 0.5 && Math.abs(s13.x - 424) < 12 && s13.y > 15 && s13.y < 32 && s13.z > 125 && s13.z < 150,
    'malam: lampu senter (slot 13) menyala di ujung senter yang diacungkan satpam, di depannya ke arah dinding',
    'slot 13 ' + tulis(s13));
  cek(genangDinding.length > 0 && genangDinding.every((p) => p.z > DINDING_Z + 0.05 && p.z < DINDING_Z + 0.3 && Math.abs(p.x - s13.x) < 10 && p.y > 15 && p.y < 45),
    'malam: genangan senter jatuh di dinding yang disorot (sejajar tangannya, setinggi dada)', sebaran(genangDinding));
  /* Tidak menenggelamkan neon: dari jarak 15 satuan ke atas tiap lampu malam
     menyumbang paling banyak tiga perempat neon yang menyala tenang di jarak
     yang sama (suku redaman shader: 1 / (1 + d² w)). Pembandingnya neon tanpa
     kedip — MOD.hening dipaku lewat defineProperty, resetMod tiap frame tidak
     bisa menimpanya — supaya angka kedip sesaat tidak ikut menentukan. */
  const heningAsli = Object.getOwnPropertyDescriptor(H.MOD, 'hening');
  Object.defineProperty(H.MOD, 'hening', { get: () => true, set() {}, configurable: true });
  bingkai(1);
  const neon = slot(0);
  if (heningAsli) Object.defineProperty(H.MOD, 'hening', heningAsli); else delete H.MOD.hening;
  const sumbang = (s, d) => terang(s) / (1 + d * d * s.redam);
  const tenggelam = (s) => [15, 40].filter((d) => !(sumbang(s, d) <= 0.75 * sumbang(neon, d)));
  const banding = (s) => [15, 40].map((d) => `d ${d}: ${sumbang(s, d).toFixed(3)} vs neon ${sumbang(neon, d).toFixed(3)}`).join('; ');
  cek(terang(neon) > 0.5 && !tenggelam(s13).length, 'senter: lampu titik pendek — dari 15 satuan ke atas tidak menenggelamkan neon', banding(s13));

  satpam.x = 300;
  bingkai();
  const s13b = slot(13);
  cek(Math.abs(s13b.x - s13.x - (300 - 424)) < 1.5 && terang(s13b) > 0.5,
    'senter ikut bergerak bersama satpamnya (x 424 -> 300)', tulis(s13) + ' -> ' + tulis(s13b));

  // berjalan: lengan menjuntai, sorotnya ke lantai di dekat kakinya
  Object.assign(satpam, { pose: null, state: 'walk' });
  bingkai();
  const genangLantai = titik(GENANGAN);
  cek(genangLantai.length > 0 && genangLantai.every((p) => p.y > 0.05 && p.y < 0.3 && Math.abs(p.x - 300) < 16 && Math.abs(p.z - 152) < 12),
    'berjalan: sorot senter menjuntai, genangannya di lantai dekat kaki satpam', sebaran(genangLantai));

  kendali.ringan = true;
  bingkai();
  const genangRingan = titik(GENANGAN), s13r = slot(13);
  kendali.ringan = false;
  cek(!genangRingan.length && terang(s13r) > 0.5, 'mode ringan: genangan senter tidak dibangun, lampu titiknya tetap menyala',
    `genangan ${genangRingan.length} titik; slot 13 ${tulis(s13r)}`);

  H.agents.delete('uji-satpam');
  bingkai();
  cek([13, 14, 15].every((i) => terang(slot(i)) === 0) && !titik(GENANGAN).length,
    'malam, senternya sudah tidak dibawa siapa pun: slot 13-15 padam lagi, genangannya hilang',
    [13, 14, 15].map((i) => i + ' ' + tulis(slot(i))).join('; '));

  // tamu satpam-patroli (boneka event, senter dari model event-nya)
  const patroli = buatE(H.eventById.get('satpam-patroli'));
  patroli.data.t = { x: 250, y: LANE_DOWN, fase: 'masuk', hadap: 'right' };
  H.eventHidup.push(patroli);
  bingkai();
  const sp1 = slot(13);
  patroli.data.t.x = 400;
  bingkai();
  const sp2 = slot(13);
  H.eventHidup.length = 0;
  cek(terang(sp1) > 0.5 && terang(sp2) > 0.5 && Math.abs(sp1.x - 250) < 15 && Math.abs(sp1.z - LANE_DOWN) < 15 && Math.abs(sp2.x - 400) < 15,
    'event satpam-patroli malam: senter satpam tamunya menyala di slot 13 dan ikut melangkah', tulis(sp1) + ' -> ' + tulis(sp2));

  // sapuan lampu mobil: x mengikuti sapuan 2D-nya, dekat dinding jendela, putih kebiruan
  const sapu = buatE(H.eventById.get('sapuan-lampu-mobil-malam'));
  H.eventHidup.push(sapu);
  ctx.__E = sapu;
  const sapuan = [0.9, 2.1].map((umur) => {
    sapu.umur = umur;
    bingkai(1);
    return { s: slot(14), dua: jalankan(ctx, '__dua(__E)') };
  });
  cek(sapuan.every(({ s, dua }) => Math.abs(s.x - dua[0]) < 0.01 && s.z > DINDING_Z && s.z < DINDING_Z + 30 && s.y > 40 && s.y < 110
      && s.c[2] > s.c[0] && s.c[0] > 0.1) && sapuan[1].s.x < sapuan[0].s.x - 200,
    'sapuan lampu mobil (slot 14): meluncur mengikuti x sapuan 2D-nya, di dalam ruangan dekat dinding jendela, putih kebiruan',
    sapuan.map(({ s, dua }) => `2D x ${dua[0].toFixed(1)} -> 3D ${tulis(s)}`).join('; '));
  cek(!tenggelam(sapuan[0].s).length, 'sapuan lampu mobil tidak menenggelamkan neon (jarak 15 dan 40)', banding(sapuan[0].s));
  setel(12);
  bingkai(1);
  cek(terang(slot(14)) === 0, 'sapuan yang dipaksa siang hari: lampunya nol (cahaya mobil tidak terbaca di siang terang)', tulis(slot(14)));
  H.eventHidup.length = 0;

  // sirene: x & warna mengikuti 2D; gerak dikurangi = tidak berkedip
  setel(21);
  const sir = buatE(H.eventById.get('sirene-lewat-jalan-depan'));
  sir.umur = 3.5;
  H.eventHidup.push(sir);
  ctx.__E = sir;
  const sampel = () => Array.from({ length: 10 }, () => {
    jalankan(ctx, 'now += 120');                          // + 100 di bingkai: 220 ms antarsampel, kilasan 2D berganti tiap ±440 ms
    bingkai(1);
    const s = slot(15);
    return { s, dua: jalankan(ctx, '__dua(__E)'), biru: s.c[2] > s.c[0] };
  });
  const cepat = sampel();
  const ikut = cepat.every(({ s, dua, biru }) => Math.abs(s.x - dua[0]) < 0.01 && biru === (dua[1] === '#4a7fd0') && terang(s) > 0.2);
  cek(ikut && cepat.some((p) => p.biru) && cepat.some((p) => !p.biru),
    'sirene (slot 15): x mengikuti 2D-nya, merah/biru berganti persis seperti kilasan 2D-nya',
    cepat.map(({ s, dua }) => `${dua[1]} ${tulis(s)}`).join('; '));
  const sirTerang = cepat.reduce((a, b) => (terang(b.s) > terang(a.s) ? b : a)).s;
  cek(!tenggelam(sirTerang).length, 'sirene tidak menenggelamkan neon (warna terterangnya, jarak 15 dan 40)', banding(sirTerang));
  const loncat = (ps) => Math.max(...ps.slice(1).map((p, i) => Math.abs((p.s.c[2] - p.s.c[0]) - (ps[i].s.c[2] - ps[i].s.c[0]))));
  kendali.gerakKurang = true;
  const pelan = sampel();
  kendali.gerakKurang = false;
  cek(loncat(pelan) < 0.1 && loncat(cepat) > 0.3 && pelan.every(({ s, dua }) => Math.abs(s.x - dua[0]) < 0.01 && terang(s) > 0.2),
    'gerak dikurangi: sirene tetap bergerak tapi tidak berkedip (lonjakan merah-biru antarsampel 220 ms kecil)',
    `lonjakan pelan ${loncat(pelan).toFixed(3)}, cepat ${loncat(cepat).toFixed(3)}`);
  H.eventHidup.length = 0;
  cek(!galat.length, 'frame-frame uji cahaya malam tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 19
/* Sinar matahari ikut jam (petakSinar di room.js). Trapesium sinar drawFloor
   dibaca dari jalur yang benar-benar dilukis — moveTo/lineTo sebelum fill
   berwarna ambien().sinar — baik di kanvas ruangan 2D maupun di kanvas
   tekstur lantai 3D (lukisLantai memanggil drawFloor juga). Ujung lantai
   prisma berkas 3D dibaca dari wadah 'berkas' WebGL2 perekam: titik setinggi
   0 = t 1 di titikBerkas. Dua nama room.js dibayangi parameter untuk
   ruang3d.js saja, seperti stageInner di 9..12: ringanAktif (di sandbox selalu
   benar — matchMedia jatuh ke dummy yang `.matches`-nya fungsi — jadi berkas
   & debu 3D tidak pernah disusun) dan matchMedia (geraKurang3 yang bisa
   dibalik dari sini). Pemakai petakSinar lainnya (debu 2D, tiga event yang
   menyentuh berkasnya) diperiksa di ujung bagian ini, pada jam yang petaknya
   paling miring; "di dalam petak" dihitung ulang di sini, bukan lebarPetak. */
{
  console.log(tebal('\n3D: sinar matahari ikut jam, kilat lewat jendela'));
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Infinity, NaN, undefined });
  const rekam = { penyangga: [], unggah: [] };
  pasang3D(ctx, glPalsu(rekam));
  ctx.__panggung = { clientWidth: 800, clientHeight: 450, appendChild() {} };
  ctx.__jendela = { devicePixelRatio: 1 };
  ctx.__uji = { ringan: false, gerak: { matches: false } };
  // perekam drawFloor: tiap pemanggilan (2D atau pelukis lantai 3D) mencatat isi yang dilukisnya
  jalankan(ctx, `globalThis.__lantai = [];
    (() => {
      const asliLantai = drawFloor;
      drawFloor = function () {
        const k = ctx, asli = { beginPath: k.beginPath, moveTo: k.moveTo, lineTo: k.lineTo, fill: k.fill }, isi = [];
        let jalur = [];
        k.beginPath = function () { jalur = []; return asli.beginPath.apply(this, arguments); };
        k.moveTo = function (x, y) { jalur.push([x, y]); return asli.moveTo.apply(this, arguments); };
        k.lineTo = function (x, y) { jalur.push([x, y]); return asli.lineTo.apply(this, arguments); };
        k.fill = function () { isi.push({ warna: k.fillStyle, jalur: jalur.slice() }); return asli.fill.apply(this, arguments); };
        try { return asliLantai(); } finally { Object.assign(k, asli); __lantai.push({ utama: k === __ctxPalsu, isi }); }
      };
    })();`);
  const log = konsol(() => jalankan(ctx, '((stageInner, window, ringanAktif, matchMedia) => {\n' + SRC_3D
    + '\n})(__panggung, __jendela, () => __uji.ringan, () => __uji.gerak)'));
  H.eventHidup.length = 0;
  cek(jalankan(ctx, 'TIGA.aktif === true') && !log.length && rekam.penyangga.length === NAMA_WADAH.length,
    'WebGL2 perekam menyala untuk uji sinar (ringanAktif & matchMedia dibayangi)', log.join(' | '));
  const [FT, JX, JW, JH] = JSON.parse(jalankan(ctx, 'JSON.stringify([FLOOR_TOP, JENDELA.x, JENDELA.w, JENDELA.h])'));
  const galat = [];
  const bingkai = () => {
    rekam.unggah.length = 0;
    galat.push(...konsol(() => jalankan(ctx, '__lantai.length = 0; now += 1500; TIGA.kamera(0.016); TIGA.gambar(new Set())')));
    const nama = new Map(rekam.penyangga.map((b, i) => [b, NAMA_WADAH[i]]));
    return new Map(rekam.unggah.map(([b, d]) => [nama.get(b), d]));
  };
  const pasangJam = (jam, kilat = 0) => {
    buatS(ctx, { jam, hujan: 0, petir: kilat > 0, ramai: false });
    jalankan(ctx, `kilat = ${kilat}`);
  };
  // trapesium sinar yang dilukis drawFloor terakhir: [dekat.x0, dekat.x1, jauh.x1, jauh.x0] sebagai [x, y]
  const trapesium = (utama) => {
    const sinar = jalankan(ctx, 'ambien().sinar');
    const t = jalankan(ctx, '__lantai').filter((c) => c.utama === utama).flatMap((c) => c.isi)
      .filter((f) => f.warna === sinar && f.jalur.length === 4);
    return t.length === 1 ? t[0].jalur.map(([x, y]) => [x, y]) : null;
  };
  const dua = (jam) => { pasangJam(jam); jalankan(ctx, '__lantai.length = 0; now += 1500; drawFloor()'); return trapesium(true); };
  // titik wadah berkas: yang setinggi 0 = ujung lantai prisma (pojok unik), setinggi 0,12 = petak kilat
  const berkas = (f, tinggi) => {
    const d = f.get('berkas') || new Float32Array(0), p = new Map();
    for (let i = 0; i + LANGKAH <= d.length; i += LANGKAH) {
      if (Math.abs(d[i + 1] - tinggi) < 1e-3) p.set(d[i].toFixed(2) + ',' + d[i + 2].toFixed(2), [d[i], d[i + 2]]);
    }
    return [...p.values()];
  };
  const samaPojok = (a, b) => !!a && !!b && a.length === b.length
    && a.every(([x, z]) => b.some(([x2, z2]) => Math.abs(x - x2) < 1e-3 && Math.abs(z - z2) < 1e-3));
  const teks = (ps) => (ps ? ps.map(([x, z]) => `${+x.toFixed(1)},${+z.toFixed(1)}`).join(' ') : '(tidak ada)');

  // --- 2D: pagi condong ke kanan, sore cerminnya; tengah hari paling pendek
  const siang = dua(12), pagi = dua(8), sore = dua(16);
  const sumbu = siang ? (siang[0][0] + siang[1][0]) / 2 : NaN;
  const tengahJauh = (t) => (t[2][0] + t[3][0]) / 2;
  const cermin = !!(pagi && sore) && [[0, 1], [1, 0], [2, 3], [3, 2]]
    .every(([i, j]) => Math.abs(pagi[i][0] - (2 * sumbu - sore[j][0])) <= 1 && pagi[i][1] === sore[j][1]);
  cek(cermin, `2D: petak sinar pukul 8 adalah cermin pukul 16 terhadap sumbu tengah hari x ${sumbu}`,
    `pagi ${teks(pagi)} | sore ${teks(sore)}`);
  cek(!!(pagi && sore) && tengahJauh(pagi) - sumbu > 10 && sumbu - tengahJauh(sore) > 10,
    '2D: pagi petaknya condong ke kanan (matahari di kiri kaca), sore ke kiri',
    pagi && sore ? `tengah tepi jauh: pagi ${tengahJauh(pagi)}, sore ${tengahJauh(sore)}, sumbu ${sumbu}` : 'trapesium tidak terbaca');
  const jauhY = (jam) => { const t = dua(jam); return t ? t[2][1] : NaN; };
  const [y7, y95, y12, y145, y175] = [7, 9.5, 12, 14.5, 17.5].map(jauhY);
  cek(y12 < y95 && y95 < y7 && y12 < y145 && y145 < y175,
    '2D: petaknya memanjang ke dalam waktu matahari rendah, tengah hari paling pendek',
    `tepi jauh y: 7→${y7}, 9.5→${y95}, 12→${y12}, 14.5→${y145}, 17.5→${y175}`);

  // --- 3D: ujung lantai prisma & tekstur lantainya = trapesium 2D, di jam mana pun
  for (const jam of [8, 12, 16]) {
    pasangJam(jam);
    const f = bingkai(), kaki = berkas(f, 0), lantai3D = trapesium(false);
    const duaD = dua(jam);
    cek(kaki.length === 4 && samaPojok(kaki, duaD) && samaPojok(lantai3D, duaD),
      `pukul ${jam}: ujung lantai prisma berkas 3D & petak di tekstur lantainya = trapesium drawFloor 2D`,
      `prisma ${teks(kaki)} | tekstur ${teks(lantai3D)} | 2D ${teks(duaD)}`);
  }

  // --- debu 3D lahir di berkas yang sama: pagi bergeser ke kanan, sore ke kiri
  const acakAsli = Math.random;
  const debuX = (jam) => {
    pasangJam(jam);
    let benih = 19190;
    Math.random = () => { benih = (benih * 1103515245 + 12345) % 2147483648; return benih / 2147483648; };
    try {
      ctx.__uji.ringan = true; bingkai(); ctx.__uji.ringan = false;        // mode ringan menyapu debu lama
      let f = null;
      for (let i = 0; i < 40; i++) f = bingkai();
      const d = f.get('pudar') || new Float32Array(0), xs = [];
      const [r, g, b] = [0xff / 255, 0xfb / 255, 0xe8 / 255];               // '#fffbe8': debu berkas jendela
      for (let i = 0; i + LANGKAH <= d.length; i += LANGKAH) {
        if (Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3) xs.push(d[i]);
      }
      return { n: xs.length / 36, x: xs.reduce((s, x) => s + x, 0) / xs.length };
    } finally { Math.random = acakAsli; }
  };
  const debuPagi = debuX(8), debuSore = debuX(16);
  cek(debuPagi.n >= 5 && debuSore.n >= 5 && debuPagi.x - debuSore.x > 8,
    'debu 3D lahir di berkas yang ikut jam: rata-rata x pagi di kanan rata-rata sore',
    `pagi ${debuPagi.n} butir x ${debuPagi.x.toFixed(1)}, sore ${debuSore.n} butir x ${debuSore.x.toFixed(1)}`);

  // --- kilat: prisma menyala seukuran kaca + petak empat daun, kecuali gerak dikurangi
  const KACA = [[JX, FT], [JX + JW, FT], [JX + JW, FT + JH], [JX, FT + JH]];
  pasangJam(21);
  const malam = bingkai();
  cek(!berkas(malam, 0).length, 'kontrol: pukul 21 tanpa kilat tidak ada prisma berkas (luar gelap)', teks(berkas(malam, 0)));
  pasangJam(21, 1);
  const kilatM = bingkai(), kakiK = berkas(kilatM, 0), daun = berkas(kilatM, 0.12);
  const dk = kilatM.get('berkas') || new Float32Array(0);
  cek(samaPojok(kakiK, KACA) && dk.length && dk[6] < dk[8],
    'kilat (pukul 21): prisma berkas menyala putih kebiruan, ujung lantainya seukuran kaca jendela',
    `ujung ${teks(kakiK)}, rgb ${[...dk.slice(6, 9)].map((v) => v.toFixed(3)).join('/')}`);
  const xsDaun = [...new Set(daun.map(([x]) => x))].sort((a, b) => a - b);
  const zsDaun = [...new Set(daun.map(([, z]) => z))].sort((a, b) => a - b);
  const xt = JX + JW / 2, zt = FT + JH / 2;
  cek(JSON.stringify(xsDaun) === JSON.stringify([JX, xt - 1, xt + 1, JX + JW]) && JSON.stringify(zsDaun) === JSON.stringify([FT, zt - 1, zt + 1, FT + JH]),
    'kilat: petaknya di lantai berbentuk jendela — empat daun kaca dipisah bayang kusen silang',
    `x ${xsDaun.join('/')}, z ${zsDaun.join('/')}`);
  ctx.__uji.gerak.matches = true;
  const kilatGerak = bingkai();
  ctx.__uji.gerak.matches = false;
  cek(!(kilatGerak.get('berkas') || []).length && !berkas(kilatGerak, 0).length,
    'prefers-reduced-motion: kilat tidak mengedipkan prisma & petaknya', `${(kilatGerak.get('berkas') || []).length / LANGKAH} titik`);
  pasangJam(12, 1);
  const kilatSiang = berkas(bingkai(), 0);
  pasangJam(12);
  const lepas = berkas(bingkai(), 0), siangLagi = dua(12);
  cek(samaPojok(kilatSiang, KACA) && samaPojok(lepas, siangLagi),
    'kilat siang: berkas sesaat seukuran kaca, lalu kembali ke petak matahari',
    `kilat ${teks(kilatSiang)} | sesudah ${teks(lepas)} | 2D ${teks(siangLagi)}`);

  // --- yang lain yang menyentuh berkasnya juga membaca petakSinar, bukan salinan angka lama
  const petakJam = (jam) => JSON.parse(jalankan(ctx, `JSON.stringify(petakSinar(${jam}))`));
  // di dalam petak: dihitung ulang di sini, tidak meminjam lebarPetak room.js
  const diPetak = ({ dekat, jauh }, x, y) => {
    const v = (y - dekat.y) / (jauh.y - dekat.y);
    return v >= -1e-9 && v <= 1 + 1e-9
      && x >= dekat.x0 + (jauh.x0 - dekat.x0) * v - 1e-6 && x <= dekat.x1 + (jauh.x1 - dekat.x1) * v + 1e-6;
  };
  const acakBenih = (benih) => () => { benih = (benih * 1103515245 + 12345) % 2147483648; return benih / 2147483648; };
  // isi yang di-fill di kanvas `ctx` room.js selama fn: [{ warna, jalur }]
  jalankan(ctx, `globalThis.__rekamIsi = (fn) => {
    const k = ctx, asli = { beginPath: k.beginPath, moveTo: k.moveTo, lineTo: k.lineTo, fill: k.fill }, isi = [];
    let jalur = [];
    k.beginPath = function () { jalur = []; return asli.beginPath.apply(this, arguments); };
    k.moveTo = function (x, y) { jalur.push([x, y]); return asli.moveTo.apply(this, arguments); };
    k.lineTo = function (x, y) { jalur.push([x, y]); return asli.lineTo.apply(this, arguments); };
    k.fill = function () { isi.push({ warna: k.fillStyle, jalur: jalur.slice() }); return asli.fill.apply(this, arguments); };
    try { fn(); } finally { Object.assign(k, asli); }
    return isi;
  }`);
  const segiEmpat = (isi, warnaIsi) => {
    const t = isi.filter((f) => f.warna === warnaIsi && f.jalur.length === 4);
    return t.length === 1 ? t[0].jalur.map(([x, y]) => [x, y]) : null;
  };

  // debu 2D: updateDebu tergerbang ringanAktif() yang di sandbox selalu benar,
  // jadi teks fungsinya dibaca dari room.js apa adanya dan dijalankan dengan
  // ringanAktif dibayangi parameter, seperti ruang3d.js di atas. Kelahirannya
  // dicatat lewat debu.push — yang lahir di luar petak langsung mati di update
  // yang sama, jadi isi `debu` sesudahnya tidak membuktikan apa-apa.
  const SRC_ROOM = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
  const teksDebu = (SRC_ROOM.match(/^function updateDebu\(dt\) \{[\s\S]*?^\}/m) || [])[0];
  const updateDebu2D = teksDebu ? jalankan(ctx, '((ringanAktif) => {\n' + teksDebu + '\nreturn updateDebu;\n})(() => false)') : null;
  const lahirDebu2D = (jam) => {
    if (!updateDebu2D) return { n: 0, luar: [], x: NaN };
    pasangJam(jam);
    const catat = [];
    ctx.__catatDebu = catat;
    jalankan(ctx, `now += 1500; debu.length = 0;
      debu.push = function (...a) { for (const d of a) __catatDebu.push([d.jenis, d.x, d.y]); return Array.prototype.push.apply(this, a); };`);
    Math.random = acakBenih(5819);
    try { for (let i = 0; i < 80; i++) updateDebu2D(0.2); } finally {
      Math.random = acakAsli;
      jalankan(ctx, 'delete debu.push; debu.length = 0');
    }
    const petak = petakJam(jam), jendela = catat.filter(([j]) => j === 'jendela');
    return { n: jendela.length, luar: jendela.filter(([, x, y]) => !diPetak(petak, x, y)), x: jendela.reduce((s, [, x]) => s + x, 0) / jendela.length };
  };
  const d75 = lahirDebu2D(7.5), d175 = lahirDebu2D(17.5);
  const ketDebu = (d) => `${d.n} lahir, ${d.luar.length} di luar petak ${JSON.stringify(d.luar.slice(0, 3).map(([, x, y]) => [+x.toFixed(1), +y.toFixed(1)]))}`;
  cek(!!updateDebu2D && d75.n >= 20 && d175.n >= 20 && !d75.luar.length && !d175.luar.length,
    'debu 2D lahir di dalam petak sinar jam itu (pukul 7,5 & 17,5, waktu petaknya paling miring)',
    updateDebu2D ? `7,5: ${ketDebu(d75)}; 17,5: ${ketDebu(d175)}` : 'function updateDebu(dt) tidak ditemukan di room.js');
  cek(d75.x - d175.x > 15, 'debu 2D ikut condong: rata-rata x pagi di kanan rata-rata sore', `${d75.x.toFixed(1)} vs ${d175.x.toFixed(1)}`);

  // karpet-rapat-digulung-dijemur mengecat ulang lantai yang tersingkap SESUDAH
  // drawFloor (lukisLantai 3D juga, lewat gambarLapis) lalu mengembalikan berkasnya
  const karpet = H.eventById.get('karpet-rapat-digulung-dijemur');
  for (const jam of [8, 10]) {
    const duaD = dua(jam), Ek = buatE(karpet);
    Ek.data.rollX = 168;
    const jalurK = segiEmpat(ctx.__rekamIsi(() => karpet.gambarLantai(Ek)), jalankan(ctx, 'ambien().sinar'));
    cek(!!duaD && JSON.stringify(jalurK) === JSON.stringify(duaD),
      `pukul ${jam}: berkas yang dikembalikan karpet-rapat-digulung-dijemur = trapesium drawFloor`,
      `karpet ${teks(jalurK)} | 2D ${teks(duaD)}`);
  }

  // debu-menari-di-berkas: debunya ditabur & yang melintas dikenali di petak jam itu
  const menari = H.eventById.get('debu-menari-di-berkas');
  const Sm = buatS(ctx, { jam: 17.5, hujan: 0, petir: false, ramai: false });
  jalankan(ctx, 'now += 1500');
  const p175 = petakJam(17.5), ditabur = [], spawnAsli = ctx.spawn, Em = buatE(menari);
  // (250,150) di kotak lama x 164..266 y 100..200 tapi di luar petak 17,5; (130,215) sebaliknya
  const luarSinar = { x: 250, y: 150, path: [1], laju: 1 }, dalamSinar = { x: 130, y: 215, path: [1], laju: 1 };
  ctx.spawn = (jenis, x, y) => { ditabur.push([jenis, x, y]); };
  Math.random = acakBenih(1717);
  try {
    Sm.orang = [];
    for (let i = 0; i < 30; i++) menari.tick(Em, 1, Sm);         // dt 1: tiap tick menabur sebutir
    Sm.orang = [luarSinar, dalamSinar];
    menari.tick(Em, 0, Sm);
  } finally { Math.random = acakAsli; ctx.spawn = spawnAsli; }
  const taburLuar = ditabur.slice(0, 30).filter(([, x, y]) => !diPetak(p175, x, y));
  cek(ditabur.length >= 30 && !taburLuar.length,
    'debu-menari-di-berkas (pukul 17,5) menabur debunya di dalam petak sinar jam itu',
    `${ditabur.length} tabur, di luar: ${JSON.stringify(taburLuar.slice(0, 3).map(([, x, y]) => [+x.toFixed(1), +y.toFixed(1)]))}`);
  cek(!diPetak(p175, luarSinar.x, luarSinar.y) && diPetak(p175, dalamSinar.x, dalamSinar.y)
    && dalamSinar.laju === 0.8 && luarSinar.laju === 1,
    'debu-menari-di-berkas mengenali yang melintas di petak jam itu, bukan di kotak lama',
    `laju di petak ${dalamSinar.laju}, di kotak lama ${luarSinar.laju}`);

  // silau-sore-gorden: kipas 2D di ujung jauh petak, segi 3D-nya di petak yang sama
  const silau = H.eventById.get('silau-sore-gorden');
  pasangJam(17);
  jalankan(ctx, 'now += 1500');
  const p17 = petakJam(17), Es = buatE(silau);
  Es.umur = 1;
  const kipas = segiEmpat(ctx.__rekamIsi(() => silau.gambarProp(Es)), '#ffd88a');
  const xsPada = (ps, y) => (ps || []).filter(([, y2]) => Math.abs(y2 - y) < 1e-3).map(([x]) => x).sort((a, b) => a - b);
  const tengah = (xs) => (xs.length === 2 ? (xs[0] + xs[1]) / 2 : NaN);
  const di = (x, { x0, x1 }) => x >= x0 && x <= x1;
  const kipasAtas = xsPada(kipas, p17.jauh.y), kipasBawah = xsPada(kipas, p17.jauh.y + 4);
  cek(kipasAtas.length === 2 && kipasBawah.length === 2 && di(tengah(kipasAtas), p17.jauh),
    '2D: kipas silau-sore-gorden (pukul 17) menempel di tepi jauh petak sinar jam itu',
    `kipas ${teks(kipas)} | tepi jauh ${p17.jauh.x0}..${p17.jauh.x1}@${p17.jauh.y}`);
  H.eventHidup.push(Es);
  let segiSilau = [];
  try {
    const d = bingkai().get('sinar') || new Float32Array(0), p = new Map();
    const [sr, sg, sb] = [1, 0xd8 / 255, 0x8a / 255];                      // '#ffd88a'
    for (let i = 0; i + LANGKAH <= d.length; i += LANGKAH) {
      if (Math.abs(d[i + 1] - 0.15) < 1e-3 && Math.abs(d[i + 6] - sr) < 2e-3 && Math.abs(d[i + 7] - sg) < 2e-3 && Math.abs(d[i + 8] - sb) < 2e-3) {
        p.set(d[i].toFixed(2) + ',' + d[i + 2].toFixed(2), [d[i], d[i + 2]]);
      }
    }
    segiSilau = [...p.values()];
  } finally { H.eventHidup.length = 0; }
  const s3Dekat = xsPada(segiSilau, p17.dekat.y - 9), s3Jauh = xsPada(segiSilau, p17.jauh.y + 4);
  cek(segiSilau.length === 4 && s3Dekat.length === 2 && s3Jauh.length === 2
    && di(tengah(s3Dekat), p17.dekat) && di(tengah(s3Jauh), p17.jauh) && JSON.stringify(s3Jauh) === JSON.stringify(kipasBawah),
    '3D: segi silau-sore-gorden di petak yang sama — tepi lebarnya = tepi lebar kipas 2D',
    `3D ${teks(segiSilau)} | kipas 2D ${teks(kipas)} | petak ${JSON.stringify(p17)}`);
  cek(!galat.length, 'frame-frame uji sinar tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 20
/* Lengan bersiku (POSE_3D + lenganIK di ruang3d.js). Satu pegawai berpalet
   unik menghadap +z di lajur bawah. kotakM menulis 36 titik berurutan
   sewarna, jadi kotak bonekanya dibaca dari penyangga frame dengan memotong
   tiap deret warna per 36; sumbu kotak yang terputar = tiga rusuk dari satu
   pojok yang saling tegak lurus. Semuanya dipetakan ke kerangka lokal badan
   lewat kotak kepalanya (lebar 8, y 17..25, berpusat di sumbu badan) —
   menghadap +z tanpa condong, kerangka kepala = kerangka badan. Sasarannya
   dibaca dari geometri yang sama, bukan dari tabel pose: mata (#1b1712),
   mulut (sh(kulit, 0,72)), sisi/muka/belakang kepala, muka dada (kotak baju
   terbesar). Telapak = kotak kulit 1,9 × 1,9 × 2 (berlengan panjang: kulit
   lainnya cuma leher & kepala), kiri dulu sesuai urutan gambarnya. "Di"
   sasaran = jarak titik itu ke kotak telapak yang terputar. Dua muatan
   seperti bagian 17: gerak dikurangi (pose diam di ujung ayunnya — tepuk
   menempel) dan gerak penuh (lambaian, tepuk membuka-menutup, lap menyapu). */
{
  console.log(tebal('\n3D: lengan bersiku, tangan ke sasaran pose'));
  const PAL = { main: '#5be0c9', pants: '#c95be0', skin: '#e0c95b' };    // tidak dipakai benda lain
  const ukuran = (k, u) => !!k && k.ukuran.length === 3 && u.every((v, i) => Math.abs(k.ukuran[i] - v) < 0.02);
  // kotak dari 36 titiknya (dipetakan lewat ke): pojok unik, pusat, tiga sumbu & ukuran
  const keKotak = (titik, ke) => {
    const pojok = [];
    for (const p of titik) {
      const q = ke(p);
      if (!pojok.some((o) => Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]) < 1e-3)) pojok.push(q);
    }
    const v = pojok.slice(1).map((q) => [0, 1, 2].map((k) => q[k] - pojok[0][k]));
    const tegak = (u, w) => Math.abs(u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) < 1e-3 * Math.hypot(...u) * Math.hypot(...w);
    let rusuk = [];
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) for (let m = j + 1; m < v.length; m++) {
      if (!rusuk.length && tegak(v[i], v[j]) && tegak(v[i], v[m]) && tegak(v[j], v[m])) rusuk = [v[i], v[j], v[m]];
    }
    const sumbu = rusuk.map((r) => { const l = Math.hypot(...r); return { u: r.map((x) => x / l), l }; });
    const pusat = [0, 1, 2].map((k) => pojok.reduce((s, q) => s + q[k], 0) / Math.max(1, pojok.length));
    return { pojok, pusat, sumbu, ukuran: sumbu.map((s) => s.l).sort((x, y) => x - y) };
  };
  const rentang = (k, i) => [Math.min(...k.pojok.map((q) => q[i])), Math.max(...k.pojok.map((q) => q[i]))];
  const muat = (gerakKurang) => {
    const ctx = muatKonteks();
    const H = ctx.__jembatan__;
    ctx.__ctxPalsu.__kendali.ketat = false;
    Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined,
      matchMedia: () => ({ matches: gerakKurang }) });
    jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
    const penyangga = new Map(), galat = [];
    pasang3D(ctx, glPalsu(null, penyangga));
    jalankan(ctx, SRC_3D);
    resetRuangan(ctx, buatPristine(ctx));
    buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
    H.eventHidup.length = 0;
    const a = Object.assign(buatSatuOrang(ctx), { x: 100, y: 252, phase: 0, face: 'down', hadap: 'down' });
    a.pal = Object.assign({}, a.pal, PAL, { kacamata: false, kumis: false });
    ctx.__orangUji = a;
    jalankan(ctx, 'agents.set("uji-lengan", __orangUji)');
    // sh() menulis 'rgb(r,g,b)'
    const hexMulut = '#' + jalankan(ctx, `sh(${JSON.stringify(PAL.skin)}, 0.72)`).match(/\d+/g)
      .map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    const bingkai = () => {
      penyangga.clear();
      const [e, w] = [console.error, console.warn];
      console.error = console.warn = (...x) => { galat.push(x.map(String).join(' ')); };
      try { jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())'); } finally { [console.error, console.warn] = [e, w]; }
    };
    // titik sewarna hex di sekitar orangnya, per deret warna dipotong per kotak (36 titik)
    const deret = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hasil = [];
      for (const d of penyangga.values()) {
        let kini = [];
        const putus = () => { for (let i = 0; i + 36 <= kini.length; i += 36) hasil.push(kini.slice(i, i + 36)); kini = []; };
        for (let i = 0; i + 13 <= d.length; i += 13) {
          if (Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3
            && Math.abs(d[i] - a.x) < 25 && Math.abs(d[i + 2] - a.y) < 25) kini.push([d[i], d[i + 1], d[i + 2]]);
          else putus();
        }
        putus();
      }
      return hasil;
    };
    // pose dipasang, tiga frame, lalu bonekanya dibaca di kerangka lokal badannya
    const potret = (pose, opsi = {}) => {
      Object.assign(a, { pose, phase: opsi.phase || 0, bawa: opsi.bawa || null, butuh: !!opsi.butuh });
      for (let i = 0; i < 3; i++) bingkai();
      const kepalaD = deret(PAL.skin).map((t) => keKotak(t, (p) => p)).reduce((m, k) => (!m || k.ukuran[2] > m.ukuran[2] ? k : m), null);
      if (!kepalaD) return null;
      const [x0, x1] = rentang(kepalaD, 0), [y0] = rentang(kepalaD, 1), [z0, z1] = rentang(kepalaD, 2), s = (x1 - x0) / 8;
      const lokal = (p) => [(p[0] - (x0 + x1) / 2) / s, (p[1] - y0) / s + 17, (p[2] - (z0 + z1) / 2) / s];
      const baca = (hex) => deret(hex).map((t) => keKotak(t, lokal));
      const kulit = baca(PAL.skin), baju = baca(PAL.main), celana = baca(PAL.pants);
      const volume = (k) => k.ukuran.reduce((x, y) => x * y, 1);
      return {
        s, baca,
        kepala: kulit.find((k) => ukuran(k, [7, 8, 8])),
        telapak: kulit.filter((k) => ukuran(k, [1.9, 1.9, 2])),
        lengan: baju.filter((k) => Math.abs(k.ukuran[0] - 2.1) < 0.02 && Math.abs(k.ukuran[1] - 2.1) < 0.02),
        dada: baju.reduce((m, k) => (!m || volume(k) > volume(m) ? k : m), null),
        mata: baca('#1b1712').filter((k) => k.pusat[1] > 19 && k.pusat[2] > 3).sort((p, q) => p.pusat[0] - q.pusat[0]),
        mulut: baca(hexMulut).find((k) => k.pusat[2] > 3),
        hingga: [...kulit, ...baju, ...celana].every((k) => k.sumbu.length === 3 && k.pojok.length === 8 && k.pojok.every((q) => q.every(Number.isFinite))),
      };
    };
    return { potret, galat };
  };
  // jarak titik q ke kotak terputar k (0 = di dalamnya; tak ada kotak = tak hingga)
  const jarakKe = (q, k) => {
    if (!k || k.sumbu.length !== 3) return Infinity;
    const d = [0, 1, 2].map((i) => q[i] - k.pusat[i]);
    return Math.hypot(...k.sumbu.map(({ u, l }) => Math.max(0, Math.abs(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) - l / 2)));
  };
  const f2 = (v) => (Array.isArray(v) ? '(' + v.map((x) => x.toFixed(2)).join(', ') + ')' : Number(v).toFixed(2));
  const kiri = (B) => (B && B.telapak.length === 2 ? B.telapak[0] : null), kanan = (B) => (B && B.telapak.length === 2 ? B.telapak[1] : null);
  const pusat = (k) => (k ? k.pusat : [NaN, NaN, NaN]);
  const tgn = (B) => (B && B.telapak.length === 2 ? `telapak kiri ${f2(B.telapak[0].pusat)}, kanan ${f2(B.telapak[1].pusat)}` : 'telapak tak terbaca');
  const terjauh = (ks, i, arah = 1) => (ks.length ? arah * Math.max(...ks.flatMap((k) => k.pojok.map((q) => arah * q[i]))) : NaN);
  // telapak yang menggantung lurus di sisi badan (lengan diam lama: pusat x ±5,4, y 8,4, tegak)
  const gantung = (k, sisi) => !!k && Math.hypot(k.pusat[0] - sisi * 5.4, k.pusat[1] - 8.4, k.pusat[2]) < 0.02
    && k.sumbu.some(({ u, l }) => Math.abs(l - 2) < 0.02 && Math.abs(u[1]) > 0.9999);
  /* Siku sisi itu: sumbu panjang lengan baju atas & bawah sama-sama lewat
     sikunya, jadi siku = titik terdekat kedua garis itu. Lengan atas = yang
     pusatnya paling dekat poros bahu (±5,4, 15,4, 0). Lurus (satu kotak): null. */
  const siku = (B, sisi) => {
    const ruas = B.lengan.filter((k) => k.pusat[0] * sisi > 0)
      .sort((p, q) => Math.hypot(p.pusat[0] - sisi * 5.4, p.pusat[1] - 15.4, p.pusat[2]) - Math.hypot(q.pusat[0] - sisi * 5.4, q.pusat[1] - 15.4, q.pusat[2]));
    if (ruas.length !== 2) return null;
    const [p, q] = ruas.map((k) => ({ c: k.pusat, u: k.sumbu.reduce((m, s) => (s.l > m.l ? s : m)).u }));
    const d = [0, 1, 2].map((i) => p.c[i] - q.c[i]), b = p.u[0] * q.u[0] + p.u[1] * q.u[1] + p.u[2] * q.u[2];
    const dp = d[0] * p.u[0] + d[1] * p.u[1] + d[2] * p.u[2], dq = d[0] * q.u[0] + d[1] * q.u[1] + d[2] * q.u[2], n = 1 - b * b;
    if (n < 1e-6) return null;
    const s = (b * dq - dp) / n, t = (dq - b * dp) / n;
    return [0, 1, 2].map((i) => (p.c[i] + p.u[i] * s + q.c[i] + q.u[i] * t) / 2);
  };
  // badan (x ±4,3, y 9..16, z ±2,2) & kepala (±4, 17..25, ±3,5), dilonggarkan
  const diBadan = (e) => Math.abs(e[0]) < 4.3 + 0.3 && e[1] > 8.7 && e[1] < 25.3 && Math.abs(e[2]) < (e[1] < 16.5 ? 2.2 : 3.5) + 0.3;

  const U = muat(true);
  const diam = U.potret(null);
  // titik sasaran dari boneka yang diam; kerangka lokalnya sama untuk semua pose
  const A = (() => {
    if (!diam || !diam.kepala || diam.mata.length !== 2 || !diam.mulut || !diam.dada) return null;
    const [, kx1] = rentang(diam.kepala, 0), [ky0, ky1] = rentang(diam.kepala, 1), [kz0, kz1] = rentang(diam.kepala, 2);
    const mataKanan = diam.mata[1], mataY = mataKanan.pusat[1];
    return {
      kx1, ky0, ky1, kz0, kz1,
      alis: [mataKanan.pusat[0], rentang(mataKanan, 1)[1] + 0.6, kz1],
      hidung: [0, (mataY + diam.mulut.pusat[1]) / 2, kz1],
      mulut: [diam.mulut.pusat[0], diam.mulut.pusat[1], kz1],
      telinga: [kx1, mataY - 0.5, 0],
      tengkuk: [0, ky0 + 0.6, kz0],
      dadaZ: rentang(diam.dada, 2)[1], bahuY: rentang(diam.dada, 1)[1],
    };
  })();
  cek(!!A && Math.abs(diam.s - 1.4) < 1e-3, 'kontrol: kerangka lokal boneka terbaca dari kotak kepala, mata, mulut, dan dadanya',
    A ? `skala ${f2(diam.s)}, alis ${f2(A.alis)}, hidung ${f2(A.hidung)}, mulut ${f2(A.mulut)}, telinga ${f2(A.telinga)}, dada z ${f2(A.dadaZ)}`
      : 'kepala/mata/mulut/dada tak terbaca');
  if (A) {
    cek(diam.hingga && gantung(kiri(diam), -1) && gantung(kanan(diam), 1)
      && diam.lengan.length === 2 && diam.lengan.every((k) => ukuran(k, [2.1, 2.1, 6.8])),
      'tanpa pose: kedua lengan menggantung lurus di sisi badan, lengan bajunya satu kotak utuh (persis lengan lama)',
      `${tgn(diam)}; lengan baju ${diam.lengan.map((k) => f2(k.ukuran)).join(' ')}`);

    const hormat = U.potret('hormat'), lenganKanan = (B) => B.lengan.filter((k) => k.pusat[0] > 0);
    cek(hormat.hingga && jarakKe(A.alis, kanan(hormat)) < 0.6 && terjauh(lenganKanan(hormat), 0) > 7 && gantung(kiri(hormat), -1),
      "hormat: telapak kanan di alis, sikunya membuka ke samping (lengan baju lewat x 7), tangan kiri tetap menggantung",
      `alis ${f2(jarakKe(A.alis, kanan(hormat)))} dari telapak, x terjauh lengan kanan ${f2(terjauh(lenganKanan(hormat), 0))}; ${tgn(hormat)}`);

    const salam = U.potret('salam'), ps = pusat(kanan(salam));
    cek(salam.hingga && ps[0] > A.kx1 + 1 && ps[1] > A.bahuY + 3 && ps[1] < A.ky1 && Math.abs(ps[2]) < 2,
      'salam: telapak kanan di samping kepala (di luar lebarnya), jauh di atas bahu', `${tgn(salam)}; sisi kepala x ${f2(A.kx1)}, bahu y ${f2(A.bahuY)}`);

    const hidung = U.potret('hidung'), nguap = U.potret('nguap');
    cek(hidung.hingga && jarakKe(A.hidung, kiri(hidung)) < 0.6 && gantung(kanan(hidung), 1),
      'hidung: telapak kiri menutup hidung, tangan kanan tetap menggantung', `hidung ${f2(jarakKe(A.hidung, kiri(hidung)))} dari telapak; ${tgn(hidung)}`);
    cek(nguap.hingga && jarakKe(A.mulut, kiri(nguap)) < 0.6,
      'nguap: telapak kiri menutup mulut', `mulut ${f2(jarakKe(A.mulut, kiri(nguap)))} dari telapak; ${tgn(nguap)}`);

    const hp = U.potret('hp'), hpBawa = U.potret('hp', { bawa: 'hp' });
    const telepon = hpBawa.baca('#20242c').filter((k) => k.pusat[1] > 15);
    const pt = telepon.length === 1 ? telepon[0].pusat : [NaN, NaN, NaN];
    cek(hp.hingga && jarakKe(A.telinga, kanan(hp)) < 1 && pusat(kiri(hp))[1] < 11,
      'hp: telapak kanan di telinga, tangan kirinya santai di bawah', `telinga ${f2(jarakKe(A.telinga, kanan(hp)))} dari telapak; ${tgn(hp)}`);
    cek(Math.hypot(pt[0] - A.telinga[0], pt[1] - A.telinga[1], pt[2] - A.telinga[2]) < 1.2 && pt[0] > A.kx1 - 0.4 && pt[0] < pusat(kanan(hpBawa))[0],
      "hp dengan bawaan 'hp': teleponnya ikut telapak ke telinga, terjepit di antara telapak dan kepala",
      `telepon ${f2(pt)} (${telepon.length} kotak), telinga ${f2(A.telinga)}, telapak ${f2(pusat(kanan(hpBawa)))}`);

    const usap = U.potret('usap'), pu = pusat(kanan(usap));
    cek(usap.hingga && pu[2] < A.kz0 && Math.abs(pu[0]) < A.kx1 && pu[1] > A.ky0 - 0.5 && pu[1] < A.ky0 + 2.5 && jarakKe(A.tengkuk, kanan(usap)) < 1,
      'usap: telapak kanan di tengkuk — di belakang kepala, di dalam lebarnya, setinggi pangkal kepala',
      `${tgn(usap)}; tengkuk ${f2(A.tengkuk)} berjarak ${f2(jarakKe(A.tengkuk, kanan(usap)))}`);

    const silang = U.potret('silang'), [sl, sr] = [pusat(kiri(silang)), pusat(kanan(silang))];
    const lenganSilang = [...silang.lengan, ...silang.telapak];
    const diDada = (p) => p[2] - A.dadaZ > 0.6 && p[2] - A.dadaZ < 2.2 && p[1] > 11 && p[1] < A.bahuY - 1;
    cek(silang.hingga && diDada(sl) && diDada(sr) && sr[0] < 1.5 && sl[0] > -1.5
      && terjauh(lenganSilang, 2) < A.dadaZ + 3.3 && terjauh(silang.lengan.filter((k) => k.pusat[0] > 0), 0) > 5
      && terjauh(silang.lengan.filter((k) => k.pusat[0] < 0), 0, -1) < -5,
      'silang: kedua telapak bersilang ke tengah di depan dada, lengannya tidak menjulur, sikunya di sisi badan',
      `${tgn(silang)}; muka dada z ${f2(A.dadaZ)}, z terjauh lengan ${f2(terjauh(lenganSilang, 2))}`);

    const tepuk = U.potret('tepuk'), [tl, tr] = [pusat(kiri(tepuk)), pusat(kanan(tepuk))];
    const rapat = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    cek(tepuk.hingga && rapat(tl, tr) < 2 && tl[2] > A.dadaZ + 1.5 && tr[2] > A.dadaZ + 1.5 && tl[1] > 12 && tl[1] < A.bahuY,
      'tepuk (gerak dikurangi): kedua telapak bertemu di depan dada', `${tgn(tepuk)}; jarak pusat ${f2(rapat(tl, tr))}`);

    const kipas = U.potret('kipas', { bawa: 'map' }), pk = pusat(kanan(kipas));
    const map = kipas.baca('#d9b96a');
    cek(kipas.hingga && pk[2] > A.dadaZ + 1 && pk[1] > 14 && pk[1] < 18 && map.length === 1 && rapat(map[0].pusat, pk) < 2.5,
      "kipas dengan bawaan 'map': telapak kanan di depan dagu, mapnya ikut di telapak itu",
      `${tgn(kipas)}; map ${map.length === 1 ? f2(map[0].pusat) : map.length + ' kotak'}`);
    const kibas = U.potret('mengipas'), pm = pusat(kanan(kibas));
    cek(kibas.hingga && pm[2] > A.kz1 && pm[1] > 18 && pm[1] < 22, 'mengipas: telapak kanan di depan wajah', tgn(kibas));
    const lap = U.potret('lap'), pl = pusat(kanan(lap));
    cek(lap.hingga && pl[2] > A.dadaZ + 2.5 && pl[1] > 12 && pl[1] < A.bahuY, 'lap: telapak kanan terulur ke depan setinggi dada', tgn(lap));

    const butuh = U.potret(null, { butuh: true });
    const mapD = butuh.baca('#e8a0a8').find((k) => k.ukuran[2] > 9);
    const diTepi = (k, sisi) => !!k && !!mapD && Math.abs(k.pusat[0] - sisi * rentang(mapD, 0)[1]) < 1
      && k.pusat[2] > rentang(mapD, 2)[0] - 1.5 && k.pusat[2] < rentang(mapD, 2)[1] + 1.5
      && k.pusat[1] > rentang(mapD, 1)[0] && k.pusat[1] < rentang(mapD, 1)[1];
    cek(butuh.hingga && diTepi(kiri(butuh), -1) && diTepi(kanan(butuh), 1),
      'menunggu disposisi (a.butuh): kedua telapak memegang tepi map di dada, bukan lengan lurus ke depan',
      `${tgn(butuh)}; map x ±${mapD ? f2(rentang(mapD, 0)[1]) : '-'}, z ${mapD ? f2(rentang(mapD, 2)) : '-'}`);

    // siku tiap sisi bertabel menekuk ke luar: di sisinya sendiri, tidak di dalam badan atau kepala
    const BERSIKU = { hormat: [1], salam: [1], hidung: [-1], nguap: [-1], hp: [-1, 1], usap: [1], silang: [-1, 1], tepuk: [-1, 1],
      kipas: [1], mengipas: [1], lap: [1], butuh: [-1, 1] };
    const hasilPose = { hormat, salam, hidung, nguap, hp, usap, silang, tepuk, kipas, mengipas: kibas, lap, butuh };
    const sikuSemua = Object.entries(BERSIKU).flatMap(([nama, sisi]) => sisi.map((s) => [nama + (s < 0 ? ' kiri' : ' kanan'), s, siku(hasilPose[nama], s)]));
    const sikuSalah = sikuSemua.filter(([, s, e]) => !e || e[0] * s < 3 || diBadan(e));
    const sk = (nama) => (sikuSemua.find(([n]) => n === nama) || [])[2] || [NaN, NaN, NaN];
    cek(!sikuSalah.length, `siku ${sikuSemua.length} lengan bertabel menekuk ke luar: di sisinya sendiri, tidak di dalam badan/kepala`,
      sikuSalah.map(([n, , e]) => n + ' ' + (e ? f2(e) : 'tak terbaca')).join('; '));
    cek(sk('hormat kanan')[0] > 6 && sk('hormat kanan')[1] > A.bahuY
      && ['silang kiri', 'silang kanan'].every((n) => Math.abs(sk(n)[0]) > 4.3 && sk(n)[2] > 0.5),
      'arah siku: hormat terangkat di samping bahu, silang di sisi badan agak ke depan',
      `hormat ${f2(sk('hormat kanan'))}, silang ${f2(sk('silang kiri'))} / ${f2(sk('silang kanan'))}`);

    // gerak penuh: ayunan sasaran ikut phase
    const G = muat(false);
    const fase = (laju, sin) => (sin > 0 ? Math.PI / 2 : 3 * Math.PI / 2) / laju;   // sin(phase·laju) = ±1
    const buka = G.potret('tepuk', { phase: fase(9, 1) }), tutup = G.potret('tepuk', { phase: fase(9, -1) });
    const jb = rapat(pusat(kiri(buka)), pusat(kanan(buka))), jt = rapat(pusat(kiri(tutup)), pusat(kanan(tutup)));
    cek(buka.hingga && tutup.hingga && jt < 2 && jb > 3.5 && pusat(kiri(buka))[2] > A.dadaZ + 1.5,
      'tepuk (gerak penuh): telapak membuka lalu bertemu lagi di depan dada', `terbuka ${f2(jb)}, tertutup ${f2(jt)}`);
    const lambai = [1, -1].map((s) => pusat(kanan(G.potret('salam', { phase: fase(6, s) }))));
    cek(Math.abs(lambai[0][0] - lambai[1][0]) > 1.2 && lambai.every((p) => p[0] > A.kx1 + 1 && p[1] > A.bahuY + 3),
      'salam (gerak penuh): telapaknya melambai ke kiri-kanan, tetap di samping kepala', lambai.map(f2).join(' -> '));
    const sapu = [1, -1].map((s) => pusat(kanan(G.potret('lap', { phase: fase(8, s) }))));
    cek(Math.abs(sapu[0][0] - sapu[1][0]) > 1.5, 'lap (gerak penuh): telapaknya menyapu ke kiri-kanan', sapu.map(f2).join(' -> '));
    cek(!U.galat.length && !G.galat.length, 'frame-frame uji lengan tanpa galat', [...U.galat, ...G.galat].join(' | '));
  }
}

// ------------------------------------------------------------------ 21
/* Wajah berekspresi (wajahOrang di ruang3d.js; kepala mendongak & peci
   melorot di susunOrang). Satu pegawai berpalet unik, berpeci dan
   berkacamata, menghadap +z di lajur bawah; kotak bonekanya dibaca per 36
   titik sewarna seperti bagian 20. Sidik = semua titik (posisi + warna) di
   sekitar orangnya: tiap keadaan harus mengubahnya, perubahannya tidak turun
   di bawah bahu (y lokal 15,5), dan begitu keadaannya dicabut sidiknya
   kembali PERSIS seperti biasa. Kerangka kepala dibaca dari kotak kulit
   terbesarnya (rusuk 7 = kedalaman, rusuk 8 yang paling tegak = atas), jadi
   kepala yang mendongak tetap terukur di kerangkanya sendiri. Pemicunya
   keadaan yang memang ditulis room.js & event: macet / butuh (tegang),
   legaSampai, state 'work' (fokus — tegak, supaya lengannya tidak ikut
   bekerja), stamina (lelah), mulut, peciMiring, masker, MOD.masker
   (defineProperty: resetMod tiap frame), kacamataLepas, pulpenDiTelinga.
   Warna dibaca dari room.js, biji mata dari teks ruang3d.js. Dua muatan
   seperti bagian 17: gerak dikurangi (pelunakan langsung sampai, tetes
   keringat diam) dan gerak penuh (tetesnya meluncur). */
{
  console.log(tebal('\n3D: wajah berekspresi, menguap, peci melorot, masker'));
  const PAL = { main: '#5be0c9', pants: '#c95be0', skin: '#e0c95b', head: 'peci', kacamata: true, kumis: false };
  const BIJI = (SRC_3D.match(/const BIJI_MATA = '(#[0-9a-f]{6})'/) || [])[1] || '#010203';
  const kurang = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const kali3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  // pojok unik, pusat, dan tiga rusuk (dari satu pojok, saling tegak lurus) kotak dari 36 titiknya
  const kotakDari = (ts) => {
    const pojok = [];
    for (const q of ts) if (!pojok.some((o) => Math.hypot(...kurang(q, o)) < 1e-4)) pojok.push(q);
    const v = pojok.slice(1).map((q) => kurang(q, pojok[0]));
    const tegak = (u, w) => Math.abs(kali3(u, w)) < 1e-3 * Math.hypot(...u) * Math.hypot(...w);
    let rusuk = [];
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) for (let m = j + 1; m < v.length; m++) {
      if (!rusuk.length && tegak(v[i], v[j]) && tegak(v[i], v[m]) && tegak(v[j], v[m])) rusuk = [v[i], v[j], v[m]];
    }
    return { pojok, rusuk, pusat: [0, 1, 2].map((k) => pojok.reduce((s, q) => s + q[k], 0) / pojok.length) };
  };
  const muat = (gerakKurang) => {
    const ctx = muatKonteks();
    const H = ctx.__jembatan__;
    ctx.__ctxPalsu.__kendali.ketat = false;
    Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined,
      matchMedia: () => ({ matches: gerakKurang }) });
    jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
    const penyangga = new Map(), galat = [];
    pasang3D(ctx, glPalsu(null, penyangga));
    jalankan(ctx, SRC_3D);
    resetRuangan(ctx, buatPristine(ctx));
    buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
    H.eventHidup.length = 0;
    const a = Object.assign(buatSatuOrang(ctx), { x: 100, y: 252, phase: 0, face: 'down', hadap: 'down' });
    a.pal = Object.assign({}, a.pal, PAL);
    ctx.__orangUji = a;
    jalankan(ctx, 'agents.set("uji-wajah", __orangUji)');
    // warna dari room.js; sh() menulis 'rgb(r,g,b)'
    const hex = (ek) => {
      const s = String(jalankan(ctx, ek));
      return s.startsWith('#') ? s : '#' + s.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    };
    const WARNA = {
      mata: '#1b1712', biji: BIJI, keringat: hex('KERINGAT'), nguap: hex('MULUT_NGUAP'), masker: hex('MASKER'),
      lipat: hex('MASKER_LIPAT'), kacamata: hex('KACAMATA'), pulpen: hex('PULPEN_TELINGA'), peci: hex('PECI.isi'),
      bibir: hex(`sh(${JSON.stringify(PAL.skin)}, 0.72)`), fokus: hex(`sh(${JSON.stringify(PAL.skin)}, 0.62)`),
      lelah: hex(`sh(${JSON.stringify(PAL.skin)}, 0.5)`), kulit: PAL.skin, baju: PAL.main,
    };
    const bingkai = () => {
      penyangga.clear();
      const [e, w] = [console.error, console.warn];
      console.error = console.warn = (...x) => { galat.push(x.map(String).join(' ')); };
      try { jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())'); } finally { [console.error, console.warn] = [e, w]; }
    };
    // titik sewarna hex di sekitar orangnya, per deret warna dipotong per kotak (36 titik)
    const deret = (h) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), hasil = [];
      for (const d of penyangga.values()) {
        let kini = [];
        const putus = () => { for (let i = 0; i + 36 <= kini.length; i += 36) hasil.push(kini.slice(i, i + 36)); kini = []; };
        for (let i = 0; i + 13 <= d.length; i += 13) {
          if (Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3
            && Math.abs(d[i] - a.x) < 25 && Math.abs(d[i + 2] - a.y) < 25) kini.push([d[i], d[i + 1], d[i + 2]]);
          else putus();
        }
        putus();
      }
      return hasil;
    };
    // satu frame dibaca: sidik, kerangka kepala, dan kotak tiap warna WARNA di kerangka itu
    const baca = () => {
      const sidik = new Map();
      let hingga = true;
      for (const d of penyangga.values()) {
        for (let i = 0; i + 13 <= d.length; i += 13) {
          if (![0, 1, 2, 6, 7, 8, 9].every((k) => Number.isFinite(d[i + k]))) { hingga = false; continue; }
          if (Math.abs(d[i] - a.x) >= 25 || Math.abs(d[i + 2] - a.y) >= 25) continue;
          const kunci = [0, 1, 2, 6, 7, 8, 9].map((k) => d[i + k].toFixed(3)).join(',');
          sidik.set(kunci, (sidik.get(kunci) || 0) + 1);
        }
      }
      const vol = (k) => k.rusuk.reduce((s, r) => s * Math.hypot(...r), 1);
      const kp = deret(WARNA.kulit).map(kotakDari).filter((k) => k.rusuk.length === 3).reduce((m, k) => (!m || vol(k) > vol(m) ? k : m), null);
      if (!kp) return { sidik, hingga, kepala: null, k: {} };
      const sumbu = kp.rusuk.map((r) => { const l = Math.hypot(...r); return { u: r.map((x) => x / l), l }; });
      const zS = sumbu.reduce((m, s) => (s.l < m.l ? s : m)), lain = sumbu.filter((s) => s !== zS);
      const yS = Math.abs(lain[0].u[1]) > Math.abs(lain[1].u[1]) ? lain[0] : lain[1], xS = lain.find((s) => s !== yS);
      const searah = (s, i) => (s.u[i] < 0 ? s.u.map((x) => -x) : s.u);
      const [ux, uy, uz] = [searah(xS, 0), searah(yS, 1), searah(zS, 2)], skala = zS.l / 7;
      const lokal = (p) => { const q = kurang(p, kp.pusat); return [kali3(q, ux) / skala, kali3(q, uy) / skala + 21, kali3(q, uz) / skala]; };
      const k = {};
      for (const [nama, h] of Object.entries(WARNA)) {
        k[nama] = deret(h).map((ts) => {
          const pj = kotakDari(ts).pojok.map(lokal);
          const min = [0, 1, 2].map((i) => Math.min(...pj.map((q) => q[i]))), max = [0, 1, 2].map((i) => Math.max(...pj.map((q) => q[i])));
          return { pj, min, max, uk: max.map((v, i) => v - min[i]), pusat: max.map((v, i) => (v + min[i]) / 2), dunia: ts };
        });
      }
      return { sidik, hingga, kepala: { uy, ukuran: sumbu.map((s) => s.l / skala).sort((p, q) => p - q) }, k };
    };
    // keadaan dipasang (objek atau fungsi), dua frame, lalu dibaca
    const potret = (ubah) => {
      if (typeof ubah === 'function') ubah(a, ctx); else Object.assign(a, ubah);
      bingkai(); bingkai();
      return baca();
    };
    return { ctx, H, a, potret, galat };
  };
  // titik yang beda dari sidik pembanding (dua arah), sebagai [x, y, z, ...]
  const beda = (A, B) => {
    const hasil = [];
    for (const [s, n] of A) if ((B.get(s) || 0) !== n) hasil.push(s.split(',').map(Number));
    for (const [s, n] of B) if ((A.get(s) || 0) !== n) hasil.push(s.split(',').map(Number));
    return hasil;
  };
  const f2 = (v) => (Array.isArray(v) ? '(' + v.map((x) => x.toFixed(2)).join(', ') + ')' : Number(v).toFixed(2));
  const muka = (ks) => ks.filter((q) => q.max[2] > 3.4);                // di muka kepala
  const kiriKanan = (ks) => muka(ks).sort((p, q) => p.pusat[0] - q.pusat[0]);

  const U = muat(true);
  const { a } = U;
  const biasa = U.potret({});
  const lagi = U.potret({});
  const B = biasa.k, mataB = kiriKanan(B.mata || []);
  cek(!!biasa.kepala && Math.abs(biasa.kepala.ukuran[0] - 7) < 0.01 && Math.abs(biasa.kepala.ukuran[2] - 8) < 0.01
    && mataB.length === 2 && muka(B.bibir).length === 1 && B.kacamata.length === 5 && B.peci.length === 1
    && jalankan(U.ctx, 'kepalaEfektif(__orangUji)') === 'peci',
    'kontrol: kepala berpeci, dua mata, mulut, dan lima rim kacamata terbaca di kerangka kepalanya',
    biasa.kepala ? `ukuran kepala ${f2(biasa.kepala.ukuran)}, mata ${mataB.length}, mulut ${muka(B.bibir).length}, kacamata ${B.kacamata.length}, peci ${B.peci.length}` : 'kepala tak terbaca');
  cek(!beda(biasa.sidik, lagi.sidik).length && biasa.sidik.size > 100 && biasa.hingga,
    'kontrol: dua frame wajah biasa berturut-turut identik (sidiknya stabil, semua titik hingga)',
    `beda ${beda(biasa.sidik, lagi.sidik).length} titik dari ${biasa.sidik.size}`);
  cek(['biji', 'keringat', 'nguap', 'masker', 'pulpen', 'fokus', 'lelah'].every((n) => !B[n].length),
    'kontrol: wajah biasa tanpa biji melotot, keringat, mulut menganga, masker, pulpen, atau kelopak turun',
    ['biji', 'keringat', 'nguap', 'masker', 'pulpen', 'fokus', 'lelah'].map((n) => n + ' ' + B[n].length).join(', '));

  const lebar = (q) => q.uk[0], tinggi = (q) => q.uk[1];
  const lega = (o, ctx) => jalankan(ctx, '__orangUji.legaSampai = now + 60000');
  let maskerAsli = null;
  const kasus = [
    // [nama, pasang, cabut, cuma kepala?, periksa(hasil) -> [lulus, ket]]
    ['tegang (macet galat): melotot berbiji putih, tetes keringat di pipi kanan', { macet: { pesan: 'uji' } }, { macet: null }, true, (R) => {
      const biji = kiriKanan(R.k.biji), pupil = kiriKanan(R.k.mata), tetes = R.k.keringat;
      const ok = biji.length === 2 && pupil.length === 2 && biji.every((q, i) => lebar(q) > lebar(mataB[i]) * 1.4 && tinggi(q) > tinggi(mataB[i])
        && pupil[i].min[0] >= q.min[0] && pupil[i].max[0] <= q.max[0] && pupil[i].max[2] > q.max[2])
        && tetes.length === 2 && tetes.every((q) => q.min[0] > 2.5 && q.max[2] > 3.5 && q.pusat[1] > 18 && q.pusat[1] < 23.5);
      return [ok, `biji ${biji.map((q) => f2(q.uk)).join(' ')} vs mata ${mataB.map((q) => f2(q.uk)).join(' ')}; tetes ${tetes.map((q) => f2(q.pusat)).join(' ')}`];
    }],
    ['lega: mata ^ ^ dan senyum', lega, { legaSampai: 0 }, true, (R) => {
      const m = muka(R.k.mata), sisi = [m.filter((q) => q.pusat[0] < 0), m.filter((q) => q.pusat[0] > 0)];
      const caping = (ks) => { const urut = ks.sort((p, q) => p.pusat[0] - q.pusat[0]); return urut.length === 3 && urut[1].pusat[1] > urut[0].pusat[1] && urut[1].pusat[1] > urut[2].pusat[1]; };
      const bb = muka(R.k.bibir).sort((p, q) => p.pusat[0] - q.pusat[0]);
      const senyum = bb.length === 3 && bb[0].pusat[1] > bb[1].pusat[1] && bb[2].pusat[1] > bb[1].pusat[1];
      return [sisi.every(caping) && senyum, `mata ${sisi.map((s) => s.map((q) => f2(q.pusat)).join(' ')).join(' | ')}; bibir ${bb.map((q) => f2(q.pusat)).join(' ')}`];
    }],
    ["fokus (state 'work'): menyipit, kelopak turun di atas matanya", { state: 'work', tegak: true }, { state: 'idle', tegak: false }, true, (R) => {
      const kl = kiriKanan(R.k.fokus), m = kiriKanan(R.k.mata);
      const ok = kl.length === 2 && m.length === 2 && m.every((q, i) => tinggi(q) < tinggi(mataB[i]) * 0.6 && Math.abs(kl[i].min[1] - q.max[1]) < 0.05
        && Math.abs(kl[i].pusat[0] - q.pusat[0]) < 0.05);
      return [ok, `kelopak ${kl.map((q) => f2(q.pusat)).join(' ')}, mata ${m.map((q) => f2(q.uk)).join(' ')}`];
    }],
    ['lelah (stamina habis): kelopak berat selebar lebih dari mata, tinggal titik pupil', (o, ctx) => { o.stamina = jalankan(ctx, 'STAMINA_LELAH') / 2; },
      (o) => { delete o.stamina; }, false, (R) => {
        const kl = kiriKanan(R.k.lelah), m = kiriKanan(R.k.mata);
        const ok = kl.length === 2 && m.length === 2 && kl.every((q, i) => lebar(q) > lebar(mataB[i]) && lebar(m[i]) < lebar(mataB[i]) && q.min[1] < m[i].max[1] + 0.05);
        return [ok, `kelopak ${kl.map((q) => f2(q.uk)).join(' ')}, pupil ${m.map((q) => f2(q.uk)).join(' ')}`];
      }],
    ['menguap/bersin (a.mulut): mulut menganga, kepala mendongak', { mulut: true }, { mulut: false }, true, (R) => {
      const ng = muka(R.k.nguap), bibirB = muka(B.bibir)[0];
      const ok = ng.length === 1 && !muka(R.k.bibir).length && tinggi(ng[0]) > 2 * tinggi(bibirB)
        && ng[0].min[1] < bibirB.min[1] && ng[0].max[1] > bibirB.max[1] && R.kepala.uy[2] < -0.25;
      return [ok, `mulut ${ng.map((q) => f2(q.uk)).join(' ')} vs ${f2(bibirB.uk)}, sumbu atas kepala ${f2(R.kepala.uy)}`];
    }],
    ['peci melorot (a.peciMiring): miring, tepi kanannya turun, sisi kirinya tetap di kepala', { peciMiring: 1 }, { peciMiring: 0 }, true, (R) => {
      const pc = R.k.peci[0], bawah = pc ? pc.pj.filter((q) => q[1] < 25.2) : [];
      const kanan = bawah.filter((q) => q[0] > 0), kiri = bawah.filter((q) => q[0] < 0);
      const ok = R.k.peci.length === 1 && kanan.length > 0 && Math.min(...kanan.map((q) => q[1])) < 23.4
        && kiri.length > 0 && kiri.every((q) => q[1] > 24.2);
      return [ok, pc ? `pojok bawah ${bawah.map(f2).join(' ')}` : 'peci tak terbaca'];
    }],
    ['masker (a.masker): menutup mulut sampai ke tali telinga', { masker: true }, { masker: false }, true, (R) => {
      const mk = muka(R.k.masker), bibirB = muka(B.bibir)[0], tali = R.k.lipat.filter((q) => Math.abs(q.pusat[0]) > 3.9);
      const ok = mk.length === 1 && !muka(R.k.bibir).length && !muka(R.k.nguap).length
        && [0, 1].every((i) => mk[0].min[i] <= bibirB.min[i] && mk[0].max[i] >= bibirB.max[i]) && mk[0].max[2] > bibirB.max[2]
        && tali.length === 2 && tali[0].pusat[0] * tali[1].pusat[0] < 0;
      return [ok, `masker ${mk.map((q) => f2(q.min) + '..' + f2(q.max)).join(' ')}, mulut ${f2(bibirB.min)}..${f2(bibirB.max)}, tali ${tali.length}`];
    }],
    ['masker + menguap: mulut yang menganga tetap tertutup masker', { masker: true, mulut: true }, { masker: false, mulut: false }, true, (R) => {
      return [muka(R.k.masker).length === 1 && !muka(R.k.nguap).length && !muka(R.k.bibir).length, `masker ${muka(R.k.masker).length}, nguap ${muka(R.k.nguap).length}`];
    }],
    ['MOD.masker (semua wajah bermasker): masker terpasang', (o, ctx) => {
      maskerAsli = Object.getOwnPropertyDescriptor(ctx.__jembatan__.MOD, 'masker');
      Object.defineProperty(ctx.__jembatan__.MOD, 'masker', { get: () => true, set() {}, configurable: true });
    }, (o, ctx) => { Object.defineProperty(ctx.__jembatan__.MOD, 'masker', maskerAsli); }, true, (R) => {
      return [muka(R.k.masker).length === 1 && !muka(R.k.bibir).length, `masker ${muka(R.k.masker).length}, mulut ${muka(R.k.bibir).length}`];
    }],
    ['kacamata dilepas untuk dilap (a.kacamataLepas): rimnya hilang, matanya memicing', { kacamataLepas: true }, { kacamataLepas: false }, true, (R) => {
      return [!R.k.kacamata.length && kiriKanan(R.k.fokus).length === 2, `rim ${R.k.kacamata.length}, kelopak memicing ${R.k.fokus.length}`];
    }],
    ['pulpen di telinga (a.pulpenDiTelinga): terselip di sisi kanan kepala', { pulpenDiTelinga: true }, { pulpenDiTelinga: false }, true, (R) => {
      const pl = R.k.pulpen;
      const ok = pl.length === 1 && pl[0].min[0] > 3.9 && pl[0].pusat[1] > 20 && pl[0].pusat[1] < 23 && pl[0].uk[2] > 3;
      return [ok, pl.map((q) => `${f2(q.min)}..${f2(q.max)}`).join(' ') || 'pulpen tak terbaca'];
    }],
  ];
  const semuaHingga = [biasa.hingga];
  for (const [nama, pasang, cabut, cumaKepala, periksa] of kasus) {
    const R = U.potret(pasang);
    const sesudah = U.potret(cabut);
    semuaHingga.push(R.hingga, sesudah.hingga);
    const db = beda(biasa.sidik, R.sidik), turun = db.filter((p) => p[1] <= 15.5 * 1.4);
    const [ok, ket] = R.kepala ? periksa(R) : [false, 'kepala tak terbaca'];
    cek(ok && db.length > 0 && (!cumaKepala || !turun.length), nama,
      `${ket}; ${db.length} titik berubah` + (cumaKepala ? `, ${turun.length} di bawah bahu` : ''));
    const sisa = beda(biasa.sidik, sesudah.sidik);
    cek(!sisa.length, `  …dan dicabut: wajahnya kembali persis seperti biasa`, `${sisa.length} titik masih beda`);
  }

  // a.butuh: wajah tegang juga (room.js memaksanya menghadap kamera)
  const butuh = U.potret({ butuh: { jenis: 'uji' } });
  U.potret({ butuh: null });
  cek(kiriKanan(butuh.k.biji).length === 2 && butuh.k.keringat.length === 2 && butuh.k.keringat.every((q) => q.max[2] > 3.5),
    'menunggu keputusan (a.butuh): wajahnya tegang — melotot dan berkeringat, di muka yang menghadap kamera',
    `biji ${butuh.k.biji.length}, keringat ${butuh.k.keringat.map((q) => f2(q.pusat)).join(' ')}`);

  // menguap di meja kerja: membelakangi kamera (face 'up'); kepalanya mendongak ke arah kamera
  const punggung = U.potret({ face: 'up', hadap: 'up' });
  const nguapBlk = U.potret({ mulut: true });
  U.potret({ mulut: false, face: 'down', hadap: 'down' });
  cek(!!punggung.kepala && !!nguapBlk.kepala && Math.abs(punggung.kepala.uy[2]) < 1e-3 && nguapBlk.kepala.uy[2] > 0.25,
    'menguap membelakangi kamera: ubun-ubunnya condong ke arah kamera (+z), terbaca tanpa melihat mulutnya',
    `sumbu atas kepala ${punggung.kepala ? f2(punggung.kepala.uy) : '-'} -> ${nguapBlk.kepala ? f2(nguapBlk.kepala.uy) : '-'}`);

  // tetes keringat: gerak dikurangi diam, gerak penuh meluncur turun
  const tetesY = (R) => (R.k.keringat.length ? Math.max(...R.k.keringat.map((q) => q.max[1])) : NaN);
  const diam = [U.potret({ macet: { pesan: 'uji' } }), U.potret({})].map(tetesY);
  U.potret({ macet: null });
  const G = muat(false);
  // awal satu putaran tetes (1,4 dtk): tiga potret 200 ms berselang tidak melewati ujungnya
  jalankan(G.ctx, 'now = (Math.floor(now / 1400) + 10) * 1400');
  const luncur = [G.potret({ macet: { pesan: 'uji' } }), G.potret({}), G.potret({})].map(tetesY);
  cek(diam.every(Number.isFinite) && Math.abs(diam[0] - diam[1]) < 1e-3, 'gerak dikurangi: tetes keringat diam di pipinya', diam.map(f2).join(' -> '));
  cek(luncur.every(Number.isFinite) && luncur[0] - luncur[1] > 0.3 && luncur[1] - luncur[2] > 0.3,
    'gerak penuh: tetes keringat meluncur turun di pipinya (dua frame, 200 ms)', luncur.map(f2).join(' -> '));
  cek(semuaHingga.every(Boolean), 'semua titik tiap keadaan hingga (tanpa NaN/Infinity)');
  cek(!U.galat.length && !G.galat.length, 'frame-frame uji wajah tanpa galat', [...U.galat, ...G.galat].join(' | '));
}

// ------------------------------------------------------------------ 22
/* Kursi ikut bergerak. (a) bersandar-ayun-kursi memasang a.miring pada
   pegawai yang duduk di meja kerja; dulu itu putarZ — berguling ke samping
   sementara kursinya diam. Sekarang badan & dudukan + sandaran kursi putarnya
   mendongak ke belakang bersama, berporos di puncak tiang: kaki bintang tidak
   bergerak sebutir pun, dan jarak titik berat kulitnya ke titik berat rangka
   sandaran tetap (berputar sebagai satu benda tegar). Yang berjalan tetap
   sempoyongan ke samping. (b) kursi tambahan yang diseret petugas
   (a.tugasKursi) digambar di belakangnya sepanjang jalan, sandarannya ke arah
   dia — pergi maupun pulang, dan yang pulang tidak lagi tertinggal di celah
   baris meja kerja. (c) kursi meja kerja mundur sedikit begitu penghuninya
   bangkit. nyalakan3D: gerak dikurangi menyala (matchMedia dummy), jadi
   pelunakan langsung sampai dan sudut sandarnya tidak mengayun. Kursi
   membaca st.sandar susunan frame sebelumnya: tiap ukuran dua frame. */
{
  console.log(tebal('\n3D: kursi ikut bergerak — bersandar, diseret, ditinggal'));
  const { ctx, H, galat, bingkai, titik } = nyalakan3D();
  const [MX, MY, KT, KURSI_N] = JSON.parse(jalankan(ctx, 'JSON.stringify([MEJA_KERJA_X, MEJA_KERJA_Y, KURSI_TAMBAHAN, KURSI_N])'));
  const KX = MX[0], KZ = 355.6;                           // kursi meja kerja slot 0 (susunDinamis)
  const RANGKA = '#2a4f8a', ATAS_JOK = '#5b8ad4', BESI_TUA = '#5a6068';
  const PAL = { main: '#5be0c9', pants: '#c95be0', skin: '#e0c95b' };    // tidak dipakai benda lain
  const a = Object.assign(buatSatuOrang(ctx, 'diam-di-meja'), { x: KX, y: MY, slotIdx: 0, phase: 0, antre: false, butuh: false });
  a.pal = Object.assign({}, a.pal, PAL);
  ctx.__orangUji = a;
  jalankan(ctx, 'agents.set("uji-sandar", __orangUji)');
  const rata = (ps, k) => (ps.length ? ps.reduce((s, p) => s + p[k], 0) / ps.length : NaN);
  const pusat = (ps) => ({ x: rata(ps, 'x'), y: rata(ps, 'y'), z: rata(ps, 'z') });
  const jarak = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const hingga = (...pss) => pss.every((ps) => ps.length > 0 && ps.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
  const dekatKursi = (x, z, r = 10) => (p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r + 4;
  const ukur = () => {
    bingkai(); bingkai();
    const dekat = dekatKursi(KX, KZ);
    const kulit = titik(PAL.skin), rangka = titik(RANGKA, dekat), atas = titik(ATAS_JOK, dekat), kaki = titik(BESI_TUA, dekat);
    return {
      kulit: pusat(kulit), rangka: pusat(rangka), kaki: pusat(kaki), zSandaran: Math.max(...rangka.map((p) => p.z)),
      bibir: Math.max(...atas.map((p) => p.y)), sidikKaki: JSON.stringify(kaki.map((p) => [p.x, p.y, p.z])),
      hingga: hingga(kulit, rangka, atas, kaki),
    };
  };
  const angka = (m) => `kulit ${['x', 'y', 'z'].map((k) => m.kulit[k].toFixed(2)).join(',')}`
    + `, rangka ${['x', 'y', 'z'].map((k) => m.rangka[k].toFixed(2)).join(',')}, z sandaran ${m.zSandaran.toFixed(2)}`
    + `, bibir dudukan y ${m.bibir.toFixed(2)}, kaki z ${m.kaki.z.toFixed(2)}`;

  // --- (a) bersandar
  const tegak = ukur();
  cek(tegak.hingga && Math.abs(tegak.bibir - 8) < 1e-3 && Math.abs(tegak.kaki.z - KZ) < 1e-3,
    'kontrol: pegawai duduk tegak di meja kerja — dudukan kursinya datar, kursi di tempatnya', angka(tegak));
  a.miring = true;
  const sandar = ukur();
  cek(sandar.hingga, 'bersandar: semua angka boneka & kursi hingga', angka(sandar));
  cek(Math.abs(sandar.kulit.x - tegak.kulit.x) < 0.01 && sandar.kulit.z - tegak.kulit.z > 1.5,
    '3D bersandar (a.miring sambil duduk): badan rebah ke BELAKANG, tidak berguling ke samping',
    `geser x ${(sandar.kulit.x - tegak.kulit.x).toFixed(3)}, mundur z ${(sandar.kulit.z - tegak.kulit.z).toFixed(3)}`);
  cek(sandar.zSandaran - tegak.zSandaran > 1 && sandar.rangka.z - tegak.rangka.z > 1 && sandar.bibir - tegak.bibir > 0.5,
    '3D bersandar: sandaran kursi ikut bergeser ke belakang dan dudukannya mendongak (bibir depan naik)',
    `z sandaran ${tegak.zSandaran.toFixed(2)} -> ${sandar.zSandaran.toFixed(2)}, bibir ${tegak.bibir.toFixed(2)} -> ${sandar.bibir.toFixed(2)}`);
  cek(sandar.sidikKaki === tegak.sidikKaki, '3D bersandar: kaki bintang kursinya tetap di lantai, tidak bergeser sebutir pun');
  const jTegak = jarak(tegak.kulit, tegak.rangka), jSandar = jarak(sandar.kulit, sandar.rangka);
  cek(Math.abs(jSandar - jTegak) < 0.05,
    '3D bersandar: badan & sandaran berputar sebagai satu benda (poros sama di puncak tiang)',
    `jarak titik berat kulit-rangka ${jTegak.toFixed(3)} -> ${jSandar.toFixed(3)}`);

  // kontrol: yang berjalan & miring (tersandung) tetap sempoyongan ke samping
  Object.assign(a, { path: [{ x: KX + 60, y: MY }], state: 'walk', miring: false });
  const jalan = ukur();
  a.miring = true;
  const sandung = ukur();
  cek(Math.abs(sandung.kulit.x - jalan.kulit.x) > 1.5,
    'kontrol: yang berjalan sambil a.miring (tersandung) tetap sempoyongan ke samping',
    `geser x ${(sandung.kulit.x - jalan.kulit.x).toFixed(3)}`);

  // --- (c) ditinggal bangkit: kursinya mundur, ditarik lagi waktu diduduki
  cek(Math.abs(jalan.kaki.z - (KZ + 2)) < 1e-3 && Math.abs(jalan.kaki.x - KX) < 1e-3,
    '3D: kursi meja kerja yang ditinggal penghuninya bangkit mundur sedikit (2), lurus ke belakang', `kaki kursi z ${jalan.kaki.z.toFixed(3)}`);
  Object.assign(a, { path: [], state: 'idle', miring: false });
  const kembali = ukur();
  cek(Math.abs(kembali.kaki.z - KZ) < 1e-3 && kembali.sidikKaki === tegak.sidikKaki,
    '3D: diduduki lagi — kursinya ditarik masuk ke tempat semula', `kaki kursi z ${kembali.kaki.z.toFixed(3)}`);
  const kosong = pusat(titik(BESI_TUA, dekatKursi(MX[6], KZ)));
  cek(Math.abs(kosong.z - KZ) < 1e-3, 'kontrol: kursi yang belum pernah diduduki tetap rapat di mejanya', `z ${kosong.z}`);

  // --- (b) diseret: petugas standby berjalan ke kanan lalu berbelok turun
  jalankan(ctx, 'agents.delete("uji-sandar")');
  const p = H.standby.find((b) => !b.tetap);
  const X0 = 400, Z0 = 268;
  const dekatP = (r = 20) => (q) => Math.hypot(q.x - p.x, q.z - p.y) < r;
  const kursiDi = (saring) => titik(RANGKA, saring);
  Object.assign(p, { x: X0, y: Z0, path: [{ x: X0 + 100, y: Z0 }], state: 'walk', face: 'right', hadap: 'right',
    pose: null, eventKerja: null, tugasKursi: '', phase: 0 });
  bingkai(); bingkai();
  cek(!kursiDi(dekatP()).length, 'kontrol: petugas tanpa tugas kursi berjalan tanpa kursi di dekatnya');
  Object.assign(H.RUANGAN, { kursiDipinjam: KURSI_N - 1, kursiTambahanAda: false });
  p.tugasKursi = 'pergi';
  // letak kursi = titik berat kaki bintangnya (pusat tiang); sandaran = rangka
  const seret = () => {
    const kaki = titik(BESI_TUA, dekatP()), rangka = kursiDi(dekatP()), atas = titik(ATAS_JOK, dekatP());
    return { px: p.x, pz: p.y, k: pusat(kaki), sandaran: pusat(rangka), dudukan: pusat(atas), hingga: hingga(kaki, rangka, atas) };
  };
  const lintas = [];
  for (let i = 0; i < 12; i++) { p.x += 2; bingkai(); lintas.push(seret()); }
  const jauh = (l, q = l.k) => Math.hypot(q.x - l.px, q.z - l.pz);
  const teksL = (ls) => ls.map((l) => `(${l.k.x.toFixed(1)},${l.k.z.toFixed(1)}) vs petugas (${l.px},${l.pz})`).join(' ');
  cek(lintas.every((l) => l.hingga), '3D seret: kursi yang diseret tergambar tiap frame, angkanya hingga');
  cek(lintas.every((l) => l.k.x < l.px - 9 && Math.abs(l.k.z - l.pz) < 1),
    '3D seret (pergi): kursinya di belakang petugas yang berjalan ke kanan, ikut tiap langkahnya', teksL(lintas.slice(-3)));
  cek(lintas.every((l) => jauh(l, l.sandaran) < jauh(l, l.dudukan)),
    '3D seret: sandarannya yang menghadap petugas (lebih dekat dari dudukannya)');
  p.face = p.hadap = 'down';
  p.path = [{ x: p.x, y: Z0 + 100 }];
  const belok = [];
  for (let i = 0; i < 12; i++) { p.y += 2; bingkai(); belok.push(seret()); }
  const akhir = belok[belok.length - 1];
  // gandengan, bukan tongkat kaku: sesaat sesudah berbelok kursinya masih di
  // lajur lama (tidak berayun mengitari petugas), lalu pelan-pelan masuk ke
  // belakangnya. belok[1], bukan [0]: kursi digambar sebelum pegawai, jadi
  // tongkat kaku pun baru membaca hadap barunya satu frame kemudian
  cek(belok.every((l) => l.hingga && Math.abs(jauh(l) - jauh(lintas[0])) < 1.5)
    && belok[1].k.x < belok[1].px - 8 && akhir.k.z < akhir.pz - 6,
    '3D seret: di belokan kursinya menikung memotong sudut — tetap sejauh semula, akhirnya di belakang lagi',
    teksL([belok[0], belok[5], akhir]));

  // pulang: kursi tidak lagi di celah baris meja kerja, tapi di belakang petugasnya
  Object.assign(H.RUANGAN, { kursiTambahanAda: true });
  p.tugasKursi = 'balik';
  bingkai(); bingkai();
  const diCelah = () => titik(RANGKA, dekatKursi(KT.x, KT.y + 10, 9));
  const celahPulang = diCelah(), bawaPulang = kursiDi(dekatP());
  p.tugasKursi = '';
  bingkai(); bingkai();
  const celahDiam = diCelah(), bawaDiam = kursiDi(dekatP());
  cek(!celahPulang.length && bawaPulang.length > 0,
    '3D seret (pulang): kursi tambahan diangkat dari celah baris meja kerja, ikut di belakang petugas',
    `di celah ${celahPulang.length}, di petugas ${bawaPulang.length}`);
  cek(celahDiam.length > 0 && !bawaDiam.length, 'kontrol: tanpa tugas kursi, kursi tambahan diam di celahnya',
    `di celah ${celahDiam.length}, di petugas ${bawaDiam.length}`);
  Object.assign(H.RUANGAN, { kursiDipinjam: -1, kursiTambahanAda: false });
  cek(!galat.length, 'frame-frame uji kursi tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 23
/* Barang kecil yang menempel di badan orang, dan tamu anak. Tumpukan undangan
   caraka, tanda tanya tamu nyasar, kamera wartawan, dan gulungan audit-token
   dulu tercetak di kartu ber-sortY tetap event-nya: melayang jauh dari
   orangnya, atau terpotong di bawah lantai kartu waktu orangnya berjalan di
   baris yang lebih dekat. Sekarang voxel di matriks badan bonekanya. Tiap
   pemilik dipindah ke dua tempat (x DAN lajur berbeda): barangnya harus
   bergeser persis sejauh badannya, dan gambarProp event-nya tidak lagi
   melukis warna barang itu ke kanvas sungguhan — fillRect tiap kanvas dari
   document.createElement dibungkus, gambarProp ditandai lewat salinan def-nya
   (kanvas hampa catatOrangEvent bukan kanvas document, jadi tidak tercatat).
   Tamu tenar anak (TOKOH.anak menggambar sosoknya sendiri, tanpa drawPerson)
   harus jadi boneka di titik tamunya, lebih pendek dari pegawai berdiri. */
{
  console.log(tebal('\n3D: barang di badan tamu, tamu anak'));
  const { ctx, H, galat, bingkai, titik } = nyalakan3D();
  const lukisan = [];
  let diProp = false, kanvasBaru = 0;
  const buatAsli = ctx.document.createElement;
  ctx.document.createElement = (tag) => {
    const el = buatAsli(tag);
    if (String(tag).toLowerCase() !== 'canvas') return el;
    kanvasBaru++;
    const k = el.getContext('2d'), fr = k.fillRect;
    k.fillRect = function (...a) { lukisan.push({ c: String(k.fillStyle).toLowerCase(), prop: diProp }); return fr.apply(this, a); };
    return el;
  };
  const keKartu = (hex) => lukisan.filter((l) => l.prop && hex.includes(l.c)).length;
  const keStiker = (hex) => lukisan.filter((l) => !l.prop && hex.includes(l.c)).length;
  // satu event uji hidup, E baru; gambarProp-nya lewat salinan def yang menandai diProp
  const pasang = (id, data, aktor = null) => {
    const asli = H.eventById.get(id);
    const def = { ...asli, gambarProp(E2, S2) { diProp = true; try { return asli.gambarProp.call(this, E2, S2); } finally { diProp = false; } } };
    const E = buatE(def);
    Object.assign(E.data, data);
    if (aktor) E.aktor.push(aktor);
    H.eventHidup.length = 0;
    H.eventHidup.push(E);
    lukisan.length = 0;
    return E;
  };
  // 3 frame: yang baru dipindah sempat 'melangkah' satu catatan (catatOrangEvent), lalu diam lagi
  const tahan = (n = 3) => { for (let i = 0; i < n; i++) bingkai(); };
  const sekitar = (x, z, r) => (p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r;
  const ukuran = (ps) => {
    const u = { n: ps.length, hingga: ps.every((p) => [p.x, p.y, p.z].every(Number.isFinite)) };
    for (const k of ['x', 'y', 'z']) {
      const v = ps.map((p) => p[k]);
      u[k + '0'] = Math.min(...v); u[k + '1'] = Math.max(...v); u[k] = (u[k + '0'] + u[k + '1']) / 2;
    }
    return u;
  };
  const teks = (u) => (u.n ? `${u.n} titik, x ${u.x0.toFixed(1)}..${u.x1.toFixed(1)} y ${u.y0.toFixed(1)}..${u.y1.toFixed(1)} z ${u.z0.toFixed(1)}..${u.z1.toFixed(1)}` : 'tak ada titik');
  const P_KERTAS = jalankan(ctx, 'P.paper').toLowerCase(), KULIT_TAMU = '#e0ae80', SEPATU = jalankan(ctx, 'SEPATU');
  // pegawai berpalet unik: auditor audit-token, dan pembanding tinggi orang dewasa
  const PAL = { main: '#5be0c9', pants: '#c95be0', skin: '#e0c95b' };
  const peg = Object.assign(buatSatuOrang(ctx), { x: 40, y: 330, phase: 0, face: 'down', hadap: 'down', path: [] });
  peg.pal = Object.assign({}, peg.pal, PAL);
  ctx.__orangUji = peg;
  jalankan(ctx, 'agents.set("uji-barang", __orangUji)');

  const TEMPAT = [[120, 300], [196, 270]];
  const KASUS = [
    { id: 'undangan-disebar', ket: 'tumpukan undangan caraka', badan: '#5a6b8a', kulit: KULIT_TAMU, barang: [P_KERTAS, '#d9d4c2'],
      pasang: (x, y) => pasang('undangan-disebar', { t: { x, y, fase: 'susur' }, lembar: [0] }) },
    { id: 'tamu-nyasar', ket: 'tanda tanya tamu nyasar', badan: '#8b9098', kulit: KULIT_TAMU, barang: ['#e8453f'],
      pasang: (x, y) => pasang('tamu-nyasar', { t: { x, y, fase: 'bingung', putar: 1 } }) },
    { id: 'wartawan-motret', ket: 'kamera wartawan', badan: '#7a6a4a', kulit: KULIT_TAMU, barang: ['#20242c', '#5a6068', '#8fb4d9'],
      pasang: (x, y) => pasang('wartawan-motret', { t: { x, y, fase: 'motret' }, baris: [] }) },
    { id: 'audit-token', ket: 'gulungan audit-token', badan: PAL.main, kulit: PAL.skin, barang: ['#c9c2ae'],
      pasang: (x, y) => {
        Object.assign(peg, { x, y, face: 'left', hadap: 'left', pose: 'duaangkat', path: [] });
        const E = pasang('audit-token', {}, peg);
        E.umur = 10;
        return E;
      } },
  ];
  // kontrol: tanpa event, tak satu pun warna barang/badan di bidang yang dibaca
  // (kotak ±16 di tiap tempat uji, dan lantai depan auditor di kertasAudit)
  const lantaiAudit = (p) => Math.abs(p.z - 300) < 10 && p.x > 120 && p.x < 215;
  H.eventHidup.length = 0;
  tahan();
  const kotor = [];
  const warnaUji = [...new Set(KASUS.flatMap((k) => [k.badan, ...k.barang]).concat(['#f19ec2', '#2e6b4f', SEPATU, KULIT_TAMU]))];
  for (const [x, y] of [...TEMPAT, [250, 300], [300, 276], [332, 234]]) {
    for (const hex of warnaUji) if (titik(hex, sekitar(x, y, 16)).length) kotor.push(`${hex} di (${x}, ${y})`);
  }
  if (titik(P_KERTAS, lantaiAudit).length) kotor.push(`${P_KERTAS} di lantai depan auditor`);
  cek(!kotor.length, 'kontrol: tanpa event, warna barang & badan uji tidak ada di bidang yang dibaca', kotor.join(', '));

  const hasil = {};
  for (const K of KASUS) {
    const ukurDi = ([x, y]) => {
      K.pasang(x, y);
      tahan();
      const dekat = sekitar(x, y, 16);
      return { badan: ukuran(titik(K.badan, dekat)), kulit: ukuran(titik(K.kulit, dekat)),
        barang: ukuran(K.barang.flatMap((h) => titik(h, dekat))), kartu: keKartu(K.barang) };
    };
    const [a, b] = TEMPAT.map(ukurDi);
    hasil[K.id] = a;
    const geserBadan = [b.badan.x - a.badan.x, b.badan.z - a.badan.z], geserBarang = [b.barang.x - a.barang.x, b.barang.z - a.barang.z];
    const dx = TEMPAT[1][0] - TEMPAT[0][0], dz = TEMPAT[1][1] - TEMPAT[0][1];
    cek(a.barang.n > 0 && b.barang.n > 0 && a.barang.hingga && b.barang.hingga && a.badan.hingga
      && Math.abs(geserBadan[0] - dx) < 0.5 && Math.abs(geserBadan[1] - dz) < 0.5
      && Math.abs(geserBarang[0] - geserBadan[0]) < 0.3 && Math.abs(geserBarang[1] - geserBadan[1]) < 0.3,
      `3D ${K.id}: ${K.ket} jadi voxel yang bergeser bersama pemiliknya (x DAN lajur)`,
      `geser badan ${geserBadan.map((v) => v.toFixed(2))}, barang ${geserBarang.map((v) => v.toFixed(2))}; barang ${teks(a.barang)} | ${teks(b.barang)}`);
    cek(Math.hypot(a.barang.x - a.badan.x, a.barang.z - a.badan.z) < 12,
      `3D ${K.id}: ${K.ket} menempel di badannya, bukan di kedalaman sortY event`,
      `barang (${a.barang.x.toFixed(1)}, ${a.barang.z.toFixed(1)}) vs badan (${a.badan.x.toFixed(1)}, ${a.badan.z.toFixed(1)})`);
    cek(a.kartu + b.kartu === 0, `3D ${K.id}: gambarProp-nya tidak lagi melukis ${K.ket} ke kanvas kartu`, `${a.kartu + b.kartu} fillRect warna barang`);
  }

  // tinggi & arah tiap barang terhadap kepala pemiliknya (puncak kulit kepala)
  const u = hasil['undangan-disebar'];
  cek(u.barang.y0 > 0.3 * u.kulit.y1 && u.barang.y1 < 0.65 * u.kulit.y1,
    'undangan: tumpukannya di depan dada caraka, di antara kedua tangannya', `tumpukan ${teks(u.barang)}, puncak kepala ${u.kulit.y1.toFixed(1)}`);
  const tumpukan = (lembar) => {
    pasang('undangan-disebar', { t: { x: 120, y: 300, fase: 'susur' }, lembar });
    tahan();
    return ukuran([P_KERTAS, '#d9d4c2'].flatMap((h) => titik(h, sekitar(120, 300, 16))));
  };
  const tipis = tumpukan([0, 1, 2]), habis = tumpukan([0, 1, 2, 3, 4]);
  cek(tipis.n > 0 && tipis.y1 < u.barang.y1 - 1 && habis.n === 0,
    'undangan: tumpukannya menipis tiap meja yang kebagian, habis = tak ada lagi', `4 lembar ${teks(u.barang)} | 2 lembar ${teks(tipis)} | habis ${teks(habis)}`);
  const n = hasil['tamu-nyasar'];
  cek(n.barang.y0 > n.kulit.y1 + 1 && Math.abs(n.barang.x - n.badan.x) < 0.6 && Math.abs(n.barang.z - n.badan.z) < 1,
    'tamu nyasar: tanda tanyanya melayang tepat di atas kepalanya', `tanda tanya ${teks(n.barang)}, badan x ${n.badan.x.toFixed(1)} z ${n.badan.z.toFixed(1)}, puncak ${n.kulit.y1.toFixed(1)}`);
  const w = hasil['wartawan-motret'];
  const lensa = (x, y) => ukuran(titik('#8fb4d9', sekitar(x, y, 16)));
  pasang('wartawan-motret', { t: { x: 120, y: 300, fase: 'motret' }, baris: [] });
  tahan();
  const lensaMotret = lensa(120, 300);
  pasang('wartawan-motret', { t: { x: 120, y: 300, fase: 'masuk' }, baris: [] });
  tahan();
  const kameraJalan = ukuran(['#20242c', '#5a6068'].flatMap((h) => titik(h, sekitar(120, 300, 16)))), lensaJalan = lensa(120, 300);
  cek(w.barang.y > 0.7 * w.kulit.y1 && lensaMotret.z < w.badan.z - 3,
    'wartawan memotret: kameranya di depan mata, lensanya ke barisan yang difoto di belakang lajurnya',
    `kamera ${teks(w.barang)}, lensa z ${lensaMotret.z.toFixed(1)}, badan z ${w.badan.z.toFixed(1)}, puncak ${w.kulit.y1.toFixed(1)}`);
  cek(kameraJalan.n > 0 && kameraJalan.y < 0.6 * w.kulit.y1 && lensaJalan.z > w.badan.z + 3,
    'kontrol: wartawan yang belum memotret menggantung kameranya di dada, lensa ke arah hadapnya', `kamera ${teks(kameraJalan)}, lensa z ${lensaJalan.z.toFixed(1)}`);
  const g = hasil['audit-token'];
  const kertasAudit = (umur) => {
    Object.assign(peg, { x: 200, y: 300, face: 'left', hadap: 'left', pose: 'duaangkat', path: [] });
    const E = pasang('audit-token', {}, peg);
    E.umur = umur;
    tahan();
    return ukuran(titik(P_KERTAS, lantaiAudit));
  };
  const awal = kertasAudit(4), bentang = kertasAudit(10);
  cek(g.barang.y > 0.7 * g.kulit.y1 && bentang.y1 > g.barang.y0 && bentang.y0 < 0.4 && bentang.hingga,
    'audit-token: gulungannya di dua tangan yang terangkat, kertasnya menjuntai sampai lantai',
    `gulungan ${teks(g.barang)}, kertas ${teks(bentang)}, puncak ${g.kulit.y1.toFixed(1)}`);
  cek(awal.n > 0 && bentang.x0 < awal.x0 - 30 && awal.x0 > 200 - 20,
    'audit-token: makin lama dibentang, kertasnya makin panjang terhampar ke depan auditor (menghadap kiri)',
    `detik 4 ${teks(awal)} | detik 10 ${teks(bentang)}`);

  // kontrol: barang yang sengaja tetap kartu (nyamuk satu piksel) memang tercatat ke kanvas kartu
  Object.assign(peg, { x: 40, y: 330, face: 'down', hadap: 'down', pose: null });
  pasang('nyamuk-sore', { a: peg, tepuk: 0 });
  tahan();
  cek(keKartu(['#2c2620']) > 0, 'kontrol: nyamuk-sore (tetap kartu) tercatat dilukis gambarProp-nya ke kanvas kartu', `${lukisan.length} fillRect kanvas`);

  // --- tamu tenar anak
  jalankan(ctx, `globalThis.__jersey = TOKOH.buat({ pal: { main: '#f19ec2', pants: '#e07aa6', hair: '#241a12', skin: '#e0ae80' },
      aksesori: TENAR_GLOBAL.jerseyAnak('#f7f2f4', 10) }, true);
    globalThis.__bocah = TOKOH.buat({ pal: { main: '#2e6b4f', pants: '#2e6b4f', skin: '#d9a273', hair: '#1b1410', pattern: '#c9a03a' },
      aksesori: (x, y, hadap) => { NOSTALGIA.destarAnak(x, y, hadap); NOSTALGIA.kacamataAnak(x, y, hadap); } }, true, LANE_DOWN);`);
  const dewasa = () => ukuran(titik(PAL.skin, sekitar(peg.x, peg.y, 16))).y1;
  const tJersey = Object.assign(ctx.__jersey, { x: 250, y: 300, wp: [], fase: 'sapa', hadap: 'left' });
  pasang('bintang-jersey-merah-muda-sepuluh', { t: tJersey });
  tahan();
  const j1 = ukuran(titik('#f19ec2', sekitar(250, 300, 12))), kepalaJ = ukuran(titik(KULIT_TAMU, sekitar(250, 300, 12))), tinggiDewasa = dewasa();
  const kartuJersey = keKartu(['#f19ec2', '#e07aa6']), stikerJersey = keStiker(['#f7f2f4']);
  Object.assign(tJersey, { x: 300, y: 276 });
  tahan();
  const j2 = ukuran(titik('#f19ec2', sekitar(300, 276, 12)));
  const rasio = kepalaJ.y1 / tinggiDewasa;
  cek(j1.n > 0 && j1.hingga && Math.abs(j1.x - 250) < 1 && Math.abs(j1.z - 300) < 1.5 && j2.n > 0 && Math.abs(j2.x - 300) < 1 && Math.abs(j2.z - 276) < 1.5,
    'tamu anak (bintang jersey merah muda): boneka voxel di titik tamunya, ikut berpindah', `${teks(j1)} | sesudah pindah ${teks(j2)}`);
  cek(rasio > 0.72 && rasio < 0.84 && Number.isFinite(tinggiDewasa),
    'tamu anak: bonekanya ±20/26 tinggi pegawai berdiri', `puncak kepala anak ${kepalaJ.y1.toFixed(2)} vs pegawai ${tinggiDewasa.toFixed(2)} (rasio ${rasio.toFixed(3)})`);
  cek(kartuJersey === 0 && stikerJersey > 0, 'tamu anak: badannya tidak lagi tercetak di kartu event; jersey-nya dilukis ke stiker aksesori',
    `${kartuJersey} fillRect badan ke kartu, ${stikerJersey} fillRect jersey ke stiker`);

  // bocah berdestar: digambar lewat salinan TOKOH.anak({ ...B3, y: B3.y - goyang }) tiap frame
  const tBocah = Object.assign(ctx.__bocah, { x: 332, y: 234, wp: [], fase: 'joget', hadap: 'right' });
  pasang('bocah-destar-kacamata-hitam', { b: tBocah, q: [] });
  tahan(1);
  const kanvasAwal = kanvasBaru, rentangKaki = [], zBadan = [];
  let bocah = null;
  for (let i = 0; i < 20; i++) {
    bingkai();
    const sepatu = ukuran(titik(SEPATU, sekitar(332, 234, 14)));
    bocah = ukuran(titik('#2e6b4f', sekitar(332, 234, 14)));
    rentangKaki.push(sepatu.x1 - sepatu.x0);
    zBadan.push(bocah.z);
  }
  const lebar = (v) => Math.max(...v) - Math.min(...v);
  cek(bocah.n > 0 && bocah.hingga && Math.abs(bocah.x - 332) < 1 && keKartu(['#2e6b4f']) === 0 && keStiker(['#7a2c2c']) > 0,
    'bocah berdestar: boneka anak di titiknya, tak tercetak di kartu; destarnya di stiker', `${teks(bocah)}, ${keKartu(['#2e6b4f'])} fillRect badan ke kartu`);
  cek(lebar(zBadan) > 0.5 && lebar(rentangKaki) < 0.05,
    'bocah berdestar: goyang jogetnya (y-1) bukan langkah — kakinya tidak berayun',
    `z badan ${lebar(zBadan).toFixed(2)} bergoyang, rentang x sepatu ${rentangKaki.map((v) => v.toFixed(2)).join(' ')}`);
  cek(kanvasBaru === kanvasAwal, 'bocah berdestar: stiker aksesorinya tidak dibuat ulang tiap frame walau tokohnya salinan baru',
    `${kanvasBaru - kanvasAwal} kanvas baru dalam 20 frame`);

  H.eventHidup.length = 0;
  jalankan(ctx, 'agents.delete("uji-barang")');
  cek(!galat.length, 'frame-frame uji barang di badan & tamu anak tanpa galat', galat.join(' | '));
}

console.log('');
if (gagal) {
  console.log(merah(tebal(gagal + ' pemeriksaan gagal')));
  process.exit(1);
}
console.log(hijau(tebal('semua lulus')));
