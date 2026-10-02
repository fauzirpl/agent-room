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
//      goyang jogetnya bukan langkah, tak ada kanvas yang dibuat ulang tiap
//      frame.
//  24. pantauan langsung dari kubah CCTV: tombol "lihat dari CCTV" cuma di
//      kartu inventaris Kamera CCTV Kubah selama 3D; mata kamera di lensanya,
//      pandangannya ikut lensa yang menoleh ke orang berjalan / kartu yang
//      dibuka dari panel, kubahnya tidak digambar, tutupMaketPov dipasang,
//      kanvas berkelas .cctv dan monitor ber-cap CAM 01 dengan jam berjalan
//      (mode ringan tanpa pita bergulir); Esc, "kembali ke maket", dan pindah
//      ke 2D melepas semuanya; tanpa gerak dikurangi kameranya meluncur lewat
//      POV.t; ruang3d.js tidak membaca balik piksel (tanpa rekaman). POV dari
//      kartu pegawai: "lihat dari matanya" cuma di 3D (kartu terbuka dibangun
//      ulang saat pindah tampilan), bukaKartu saja (baris kru) tidak memindah
//      kamera; ‹ › di pita berputar urut penghuni(), melewati yang di WC &
//      yang lenyap di pintu samping, tamu ruang kadis ikut selama bukaannya
//      tampil, dan dari lensa CCTV › ke orang pertama, ‹ ke yang terakhir.
//  25. radio kantor di atas counter pantri: badannya voxel di tutup microwave,
//      di dalam tapak counter, selebar RADIO 2D; diam total (tanpa
//      AudioContext, tanpa musik) lampu skalanya gelap tanpa emisi dan tanpa
//      pendar; Indonesia Raya, lofi, atau lagu kantor menyalakannya (emisi 1)
//      dengan warna jenisnya, lalu padam lagi; pastikanAudio memasang tepat
//      satu AnalyserNode yang disadap dari busMusik, dan kerucut speakernya
//      maju dari sadapan itu lalu kembali waktu sepi (gerak dikurangi: diam);
//      drawRadio 2D ikut keadaan yang sama tanpa galat di ctx ketat.
//  26. sinematik 3D "maket lobi": di mode sinematik tiap singgahan keliling
//      dilihat dari sudutnya sendiri (arsip dari kiri, server dari kanan,
//      rapat dari atas, ruang tunggu dari depan) di dalam jepit yaw/pitch, dan
//      yaw mengayun antar frame selama singgah (mode ringan: sudutnya saja);
//      di mode lain — ikut, mati, klik barang, X-banner, bukaan ruang kadis,
//      tampak penuh, gerak dikurangi — sudutnya kembali & tetap milik
//      penonton; seret (dipegang di sudut yang sedang tampak), roda, cubit,
//      dan klik dua kali menghentikan ayunan selama tahanannya; angka hingga.
//  27. aksesori tamu tenar jadi voxel di matriks bonekanya (tabel AKSESORI_3D,
//      dibaca dari teks berkasnya): tiap tamu tenar beraksesori di registri
//      tercantum dan sebaliknya; tiap aksesorinya ada di dekat badan, ikut
//      berpindah (x DAN lajur) dan berbalik arah bersama bonekanya, dan tidak
//      lagi dilukis ke stiker (dobel); kepala di kepala (kupluk di atas
//      ubun-ubun, visor helm di muka), punggung di punggung (raket, nomor
//      jersey), tangan di telapak (tongsis diangkat merekam lalu turun, helm
//      dijinjing, tongkat sampai lantai lalu menunjuk); kontrol: aksesori yang
//      belum bermodel tetap ke stiker, tanpa kanvas baru tiap frame.
//  28. gorden kiri yang lepas (MOD.gordenLepas, dulu ditulis dua event tanpa
//      pembaca): 'angin' (angin-kencang-gorden) memindah panel kiri dari grup
//      perabot ke grup dinamis — lipatannya mengembang (maju, melebar ke
//      kaca, ujung terangkat) bertahap lalu bergoyang antar frame (gerak
//      dikurangi & mode ringan: pose statis); true (gorden-lepas-kait) —
//      kolom luar masih di kaitnya, kolom sisi kaca melorot & condong ke
//      depan, diam; padam: kembali pelan lalu persis ke perabot. 2D
//      drawWindow membaca bendera yang sama (di 3D panel kiri tidak dilukis
//      ke dinding), gorden-lepas-kait memadamkannya begitu dikaitkan lagi,
//      dan kain melorotnya tidak lagi dilukis dobel di gambarDinding.
//  29. bayangan kontak & bahu lembut cahaya: cakram gelap (#20301f, elips
//      bayangan kaki 2D) tepat di bawah kaki pegawai yang berdiri — sol
//      sepatunya di inti pekat, muka menghadap atas — di lantai, karpet
//      rapat, bantal lesehan, dan plat ambang pintu samping; mengecil &
//      menipis saat terangkat (a.angkat, loncatan senam), memanjang ke arah
//      badan yang rebah, sepudar badannya (standby, ambang); tidak ada untuk
//      yang duduk di kursi meja kerja & lesehan; kucing tidur di karpet
//      ikut; jauh lebih tipis saat peta bayangan menyala. bahu() FS yang
//      dijalankan sebagai JS: apa adanya di bawah ambang, monoton, tidak
//      lewat 1, ambang 1 = potong keras lama; dari uniform siang muka atas
//      ±1,24x muka tegak — ubin & kertas yang dulu sama-sama terpotong putih
//      kini berbeda, krem dinding nyaris tak tersentuh, malam tidak berubah.
//  30. barang event & bekas ruangan gelombang ketiga: kabel LAN lepas
//      menggantung di MUKA tiang kanan rak server (bukan terbenam di tiangnya),
//      kain penutup dispenser Ramadan menyelubungi kotak dispenser (bukan
//      melayang di depan & di atasnya), barbel lifter tergeletak di lantai dan
//      galon di tangannya ikut badannya, ember bocor arsip (dan atap) di
//      lantai tempat lukisannya, ember bocor rapat di taplak meja rapat (titik
//      2D-nya di 3D jatuh di bawah dudukan kursi) — semuanya voxel di wadah dinamis dan
//      gambarProp-nya tidak dilukis ke kanvas kartu (kontrol: def yang sama
//      tanpa model tetap jadi kartu); bekas RUANGAN di luar persegi kulit
//      perabotnya — kabel UTP rak server (kabelRapi: lurus, pendek, berklem),
//      kartu inspeksi APAR (ikut aparAngkat, hilang selagi aparDiangkat),
//      menara gelas dispenser (gelasDispenser, MOD.galonLepas), isi tong
//      (tongPenuh) — voxel di wadah perabot: tiap perubahan membangun ulang
//      grup itu, dan dikosongkan lagi kembali ke geometri semula.
//  31. spanduk tema kalender jadi kain 3D menurut registri TEMA room.js
//      (spandukTema), bukan daftar id di ruang3d.js: spanduk hari nasional
//      (Hari Pahlawan, Sumpah Pemuda, Kesaktian Pancasila) berkain persis
//      sebanyak spanduk HUT KORPRI, tanpa tema tidak ada kain.
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
  const [W, LANE_UP] = JSON.parse(jalankan(ctx, 'JSON.stringify([W, LANE_UP])'));
  const yawCctv = () => {
    const dekat = (p) => Math.abs(p.x - (W - 9)) < 6 && Math.abs(p.y - 100.4) < 4;
    const lensa = titik('#101418', dekat), cincinLensa = titik('#5a6068', dekat);
    const rata = (ps, k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
    return Math.atan2(rata(lensa, 'x') - rata(cincinLensa, 'x'), rata(lensa, 'z') - rata(cincinLensa, 'z'));
  };
  // kubahnya di pojok kanan-atas: yang diuji ambang pintu KANAN (lajur atas)
  const jalan = Object.assign(buatSatuOrang(ctx), { y: LANE_UP, state: 'walk', phase: 0 });
  ctx.__orangUji = jalan;
  jalankan(ctx, 'terpilih = null; agents.set("uji-cctv", __orangUji)');
  jalan.x = W + 3; bingkai();
  const yawTampak = yawCctv();
  jalan.x = W + 13.9; bingkai();
  const yawLenyap = yawCctv();
  jalankan(ctx, 'agents.delete("uji-cctv"); terpilih = { x: W + 13.9, y: LANE_UP, alpha: 1 }');
  bingkai();
  const yawTerpilih = yawCctv();
  jalankan(ctx, 'terpilih = null');
  // tanpa sasaran kubahnya menyapu sendiri: yaw -0,7 ± 0,45 — selalu menoleh ke kiri,
  // sedangkan yang berjalan di ambang kanan ada sedikit di kanannya (yaw > 0)
  cek(yawTampak > 0 && yawLenyap < -0.2 && yawTerpilih < -0.2,
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
  const kartuJersey = keKartu(['#f19ec2', '#e07aa6']), stikerJersey = keStiker(['#f7f2f4']), voxelJersey = titik('#f7f2f4', sekitar(250, 300, 12)).length;
  Object.assign(tJersey, { x: 300, y: 276 });
  tahan();
  const j2 = ukuran(titik('#f19ec2', sekitar(300, 276, 12)));
  const rasio = kepalaJ.y1 / tinggiDewasa;
  cek(j1.n > 0 && j1.hingga && Math.abs(j1.x - 250) < 1 && Math.abs(j1.z - 300) < 1.5 && j2.n > 0 && Math.abs(j2.x - 300) < 1 && Math.abs(j2.z - 276) < 1.5,
    'tamu anak (bintang jersey merah muda): boneka voxel di titik tamunya, ikut berpindah', `${teks(j1)} | sesudah pindah ${teks(j2)}`);
  cek(rasio > 0.72 && rasio < 0.84 && Number.isFinite(tinggiDewasa),
    'tamu anak: bonekanya ±20/26 tinggi pegawai berdiri', `puncak kepala anak ${kepalaJ.y1.toFixed(2)} vs pegawai ${tinggiDewasa.toFixed(2)} (rasio ${rasio.toFixed(3)})`);
  cek(kartuJersey === 0 && stikerJersey === 0 && voxelJersey > 0,
    'tamu anak: badannya tidak lagi tercetak di kartu event; nomor jersey-nya voxel di bonekanya, bukan stiker (bagian 27)',
    `${kartuJersey} fillRect badan ke kartu, ${stikerJersey} fillRect jersey ke stiker, ${voxelJersey} titik jersey voxel`);

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
  const destar = titik('#7a2c2c', sekitar(332, 234, 14)).length;
  cek(bocah.n > 0 && bocah.hingga && Math.abs(bocah.x - 332) < 1 && keKartu(['#2e6b4f']) === 0 && keStiker(['#7a2c2c']) === 0 && destar > 0,
    'bocah berdestar: boneka anak di titiknya, tak tercetak di kartu; destarnya voxel, bukan stiker',
    `${teks(bocah)}, ${keKartu(['#2e6b4f'])} fillRect badan ke kartu, ${keStiker(['#7a2c2c'])} destar ke stiker, ${destar} titik destar`);
  cek(lebar(zBadan) > 0.5 && lebar(rentangKaki) < 0.05,
    'bocah berdestar: goyang jogetnya (y-1) bukan langkah — kakinya tidak berayun',
    `z badan ${lebar(zBadan).toFixed(2)} bergoyang, rentang x sepatu ${rentangKaki.map((v) => v.toFixed(2)).join(' ')}`);
  cek(kanvasBaru === kanvasAwal, 'bocah berdestar: tidak ada kanvas yang dibuat ulang tiap frame walau tokohnya salinan baru',
    `${kanvasBaru - kanvasAwal} kanvas baru dalam 20 frame`);

  H.eventHidup.length = 0;
  jalankan(ctx, 'agents.delete("uji-barang")');
  cek(!galat.length, 'frame-frame uji barang di badan & tamu anak tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 24
/* Pantauan langsung dari kubah CCTV, POV dari kartu pegawai, dan ‹ › di pita
   POV. Elemen yang dibuat lewat document.createElement (pita POV & monitor
   CCTV ruang3d.js, tombol kartu room.js) jadi elemen palsu yang mengingat
   hidden, teks, kelas, anak, dan pendengarnya; querySelector-nya memberi
   anak palsu tetap per pemilih. #kartuAksi palsu baru tiap bukaKartu,
   document.addEventListener (Esc) dan kelas kanvas 3D dicatat. stageInner,
   ringanAktif, dan matchMedia dibayangi parameter untuk ruang3d.js saja
   (seperti muat3D & bagian 18). Mata & arah pandang dari RUANG3D.kamera
   (mata, baris z matriks v); kubah & dinding depan tutupMaketPov dari
   penyangga titik frame terakhir. renderCrew & muatBukuInduk dikosongkan:
   bukaKartu-nya sungguhan, tapi daftar kru dan fetch bukan urusan bagian ini. */
{
  console.log(tebal('\n3D: pantauan CCTV, POV dari kartu, pindah mata'));
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined });
  jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
  const elemen = (tag) => {
    const kelas = new Set(), dengar = {}, anak = [], pilih = new Map();
    const el = {
      tag, hidden: false, className: '', textContent: '', innerHTML: '', title: '', type: '', style: {}, onclick: null, kelas, anak,
      classList: {
        add: (...k) => k.forEach((x) => kelas.add(x)), remove: (...k) => k.forEach((x) => kelas.delete(x)), contains: (k) => kelas.has(k),
        toggle: (k, v) => { const ya = v === undefined ? !kelas.has(k) : !!v; if (ya) kelas.add(k); else kelas.delete(k); return ya; },
      },
      addEventListener(j, fn) { (dengar[j] = dengar[j] || []).push(fn); },
      appendChild(c) { anak.push(c); return c; },
      setAttribute() {},
      querySelector(p) { if (!pilih.has(p)) pilih.set(p, elemen(p)); return pilih.get(p); },
      klik() { if (el.onclick) el.onclick({ type: 'click' }); for (const fn of dengar.click || []) fn({ type: 'click' }); },
    };
    return el;
  };
  const tombolBaru = [], divBaru = [], dengarDok = {};
  const buatAsli = ctx.document.createElement;
  ctx.document.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas') return buatAsli(tag);
    const el = elemen(tag);
    (tag === 'button' ? tombolBaru : divBaru).push(el);
    return el;
  };
  ctx.document.addEventListener = (j, fn) => { (dengarDok[j] = dengarDok[j] || []).push(fn); };
  const penyangga = new Map(), kendali = { ringan: false, gerakKurang: true };
  pasang3D(ctx, glPalsu(null, penyangga));
  const kelasKanvas = elemen('kanvas');
  ctx.document.getElementById('room3d').classList = kelasKanvas.classList;
  let aksiKartu = null;
  const cariAsli = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'kartuAksi' ? (aksiKartu = elemen('div')) : cariAsli(id));
  ctx.__k24 = {
    panggung: { clientWidth: 800, clientHeight: 450, appendChild() {} }, ringan: () => kendali.ringan,
    media: (q) => (/reduced-motion/.test(q) ? { get matches() { return kendali.gerakKurang; }, addEventListener() {} } : { matches: false, addEventListener() {} }),
  };
  const galat = [];
  const diam = (fn) => {
    const [e, w] = [console.error, console.warn];
    console.error = console.warn = (...a) => { galat.push(a.map(String).join(' ')); };
    try { return fn(); } finally { [console.error, console.warn] = [e, w]; }
  };
  diam(() => jalankan(ctx, '((stageInner, ringanAktif, matchMedia) => {\n' + SRC_3D + '\n})(__k24.panggung, __k24.ringan, __k24.media)'));
  resetRuangan(ctx, buatPristine(ctx));
  buatS(ctx, { jam: 10.5, hujan: 0, petir: false, ramai: false });
  H.eventHidup.length = 0;
  jalankan(ctx, `renderCrew = () => {}; muatBukuInduk = () => {};
    agents.clear(); peserta.length = 0; standby.length = 0; terpilih = null; barangTerpilih = null;`);
  const vm24 = (src) => diam(() => jalankan(ctx, src));
  const bingkai = (n = 1, dt = 0.016) => diam(() => {
    for (let i = 0; i < n; i++) { penyangga.clear(); jalankan(ctx, `now += 100; TIGA.kamera(${dt}); TIGA.gambar(new Set())`); }
  });
  const titik = (hex, saring) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    let n = 0;
    for (const d of penyangga.values()) {
      for (let i = 0; i + 13 <= d.length; i += 13) {
        if (Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3
          && saring({ x: d[i], y: d[i + 1], z: d[i + 2] })) n++;
      }
    }
    return n;
  };
  const [LANE_DOWN, LANTAI_Z1, DINDING_Z, TINGGI, W] = JSON.parse(jalankan(ctx, 'JSON.stringify([LANE_DOWN, H + 8, FLOOR_TOP - 10, FLOOR_TOP, W])'));
  const LENSA = [W - 9, 100.4, DINDING_Z + 5.5];                       // pusat kubah (CCTV di ruang3d.js)
  const KAM = jalankan(ctx, 'RUANG3D.kamera');
  const mata = () => [...KAM.mata];
  const arah = () => [-KAM.v[2], -KAM.v[6], -KAM.v[10]];
  const jarak = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const sudut = (d, ke) => Math.acos(Math.max(-1, Math.min(1, (d[0] * ke[0] + d[1] * ke[1] + d[2] * ke[2]) / Math.hypot(...d) / Math.hypot(...ke))));
  // sudut pandang kamera ke titik bidik lensa pada orang o (kaki, tinggi 20)
  const keOrang = (o) => { const m = mata(); return sudut(arah(), [o.x - m[0], 20 - m[1], o.y - m[2]]); };
  const kubah = () => titik('#101418', (p) => Math.abs(p.x - LENSA[0]) < 6 && Math.abs(p.y - LENSA[1]) < 4);
  // plafon tutupMaketPov: muka bawah setinggi tembok yang menjulur sampai tepi luar dinding depannya
  const dindingDepan = () => titik('#eeebe0', (p) => Math.abs(p.y - TINGGI) < 0.01 && Math.abs(p.z - (LANTAI_Z1 + 6)) < 0.01);
  const f2 = (v) => v.map((x) => x.toFixed(1)).join(', ');

  // Penghuni berurutan: yang di WC (alfa 0) dan yang lenyap di pintu samping
  // diselipkan di antara yang tampak; tamu ruang kadis paling akhir
  const orang = (id, sifat) => {
    const o = Object.assign(buatSatuOrang(ctx), { id, phase: 0, path: [], riwayat: [], perStasiun: {}, sejak: 0, calls: 0 }, sifat);
    H.agents.set(id, o);
    return o;
  };
  const A = orang('uji-a', { x: 100, y: 300 });
  orang('uji-wc', { x: 40, y: 140, alpha: 0 });
  const B = orang('uji-b', { x: 250, y: 260 });
  orang('uji-lenyap', { x: -14, y: LANE_DOWN });
  const C = orang('uji-c', { x: 420, y: 300 });
  const T = orang('uji-tamu', { x: 318, y: 73, diKadis: true });
  const hud = divBaru.find((e) => e.className === 'pov-3d'), monitor = divBaru.find((e) => e.className === 'cctv-3d');
  cek(jalankan(ctx, 'TIGA.aktif === true && typeof TIGA.pov === "function" && typeof TIGA.cctv === "function"') && hud && monitor && !galat.length,
    'WebGL2 palsu: ruang3d.js menyala, mengisi kait TIGA.pov & TIGA.cctv, membuat pita POV & monitor CCTV', galat.join(' | '));

  // --- pantauan CCTV
  bingkai(2);
  const maket = { mata: mata(), kubah: kubah(), depan: dindingDepan() };
  const tombolCctv = (id) => { tombolBaru.length = 0; vm24(`bukaKartuBarang(daftarBarang().find((b) => b.id === '${id}'))`); return tombolBaru.filter((t) => t.textContent === 'lihat dari CCTV'); };
  const diWc = tombolCctv('wc').length;
  vm24('RUANG3D.pilih(false)');
  const di2D = tombolCctv('cctv').length;
  vm24('tutupKartuBarang(); RUANG3D.pilih(true)');
  const [bCctv] = tombolCctv('cctv');
  cek(bCctv && diWc === 0 && di2D === 0, 'tombol "lihat dari CCTV" cuma di kartu inventaris Kamera CCTV Kubah, cuma selama 3D',
    `wc ${diWc}, cctv di 2D ${di2D}, cctv di 3D ${bCctv ? 1 : 0}`);
  if (bCctv) bCctv.klik();
  bingkai(1);
  const di = { mata: mata(), kubah: kubah(), depan: dindingDepan(), kartu: jalankan(ctx, 'barangTerpilih === null') };
  cek(jarak(di.mata, LENSA) < 4.5 && di.kartu,
    'pantauan CCTV: mata kamera di lensa kubah (kartu inventarisnya ditutup)', `mata (${f2(di.mata)}), lensa (${f2(LENSA)}), maket (${f2(maket.mata)})`);
  cek(maket.kubah > 0 && di.kubah === 0, 'pantauan CCTV: kubahnya sendiri tidak digambar (kontrol: di maket ada)', `maket ${maket.kubah}, di lensa ${di.kubah} titik lensa`);
  cek(maket.depan === 0 && di.depan > 0, 'pantauan CCTV: dinding depan tutupMaketPov dipasang', `maket ${maket.depan}, di lensa ${di.depan} titik`);
  const waktu = monitor.querySelector('.cctv-waktu');
  cek(kelasKanvas.kelas.has('cctv') && !monitor.hidden && /CAM 01/.test(monitor.innerHTML) && !monitor.kelas.has('ringan')
    && waktu.textContent === 'RAB 15-04-2026  10:30:00' && !hud.hidden && /CCTV/.test(hud.querySelector('.pov-judul').textContent),
  'pantauan CCTV: kanvas berkelas .cctv, monitor ber-cap CAM 01 + hari, tanggal, jam; pita POV menyebut CCTV',
  `kelas [${[...kelasKanvas.kelas]}], monitor hidden ${monitor.hidden}, waktu "${waktu.textContent}", judul "${hud.querySelector('.pov-judul').textContent}"`);
  buatS(ctx, { jam: 10.75, hujan: 0, petir: false, ramai: false });
  bingkai(1);
  cek(waktu.textContent === 'RAB 15-04-2026  10:45:00', 'pantauan CCTV: jamnya berjalan', `"${waktu.textContent}"`);

  // lensa menoleh ke yang berjalan, kameranya ikut — juga ke kartu yang dibuka dari panel
  A.state = 'walk';
  bingkai(2);
  const keA1 = keOrang(A), arah1 = arah();
  Object.assign(A, { x: 520, y: 200 });
  bingkai(2);
  const keA2 = keOrang(A), belok = sudut(arah1, arah());
  Object.assign(A, { x: 100, y: 300, state: 'idle' });
  cek(keA1 < 0.03 && keA2 < 0.03 && belok > 0.3 && jarak(mata(), LENSA) < 4.5,
    'pantauan CCTV: pandangannya ikut lensa yang menoleh ke orang yang berjalan (dua tempat)',
    `sudut ke orang ${keA1.toFixed(3)} / ${keA2.toFixed(3)} rad, berbelok ${belok.toFixed(2)} rad`);
  vm24('bukaKartu(agents.get("uji-c"))');
  bingkai(2);
  const keC = keOrang(C), tetap = jarak(mata(), LENSA);
  vm24('tutupKartu()');
  cek(keC < 0.03 && tetap < 4.5, 'pantauan CCTV: kartu pegawai dibuka dari panel — tetap di lensa, lensanya menoleh ke orang itu',
    `sudut ${keC.toFixed(3)} rad, jarak ke lensa ${tetap.toFixed(2)}`);

  // jalan pulang: Esc, tombol pita, pindah ke 2D — semuanya melepas filter & monitor
  const pulih = () => !kelasKanvas.kelas.has('cctv') && monitor.hidden && hud.hidden;
  for (const fn of dengarDok.keydown || []) fn({ key: 'Escape' });
  const pulihEsc = pulih();
  bingkai(1);
  const sesudah = { mata: mata(), kubah: kubah(), depan: dindingDepan() };
  cek(pulihEsc && jarak(sesudah.mata, maket.mata) < 1 && sesudah.kubah === maket.kubah && sesudah.depan === 0,
    'Esc: filter & monitor lepas, kamera kembali ke maket, kubah tergambar lagi, dinding depan dilepas',
    `pulih ${pulihEsc}, mata (${f2(sesudah.mata)}) vs maket (${f2(maket.mata)}), kubah ${sesudah.kubah}, depan ${sesudah.depan}`);
  vm24('TIGA.cctv()');
  const masuk2 = kelasKanvas.kelas.has('cctv');
  hud.querySelector('.pov-keluar').klik();
  const pulihTombol = pulih();
  vm24('TIGA.cctv()');
  const masuk3 = kelasKanvas.kelas.has('cctv');
  vm24('RUANG3D.pilih(false)');
  const pulih2D = pulih() && jalankan(ctx, 'TIGA.aktif === false');
  vm24('TIGA.cctv()');
  const mati2D = !kelasKanvas.kelas.has('cctv') && monitor.hidden;
  vm24('RUANG3D.pilih(true)');
  cek(masuk2 && pulihTombol && masuk3 && pulih2D && mati2D,
    '"kembali ke maket" dan pindah ke 2D juga melepas filter & monitor; TIGA.cctv() di 2D tidak berbuat apa-apa',
    `tombol ${masuk2}/${pulihTombol}, 2D ${masuk3}/${pulih2D}, cctv di 2D diam ${mati2D}`);

  // gerak tidak dikurangi: kameranya meluncur lewat POV.t; mode ringan tanpa pita bergulir
  kendali.gerakKurang = false;
  kendali.ringan = true;
  bingkai(30);
  vm24('TIGA.cctv()');
  bingkai(1);
  const awalLuncur = jarak(mata(), LENSA);
  bingkai(30);
  const akhirLuncur = jarak(mata(), LENSA), ringan = monitor.kelas.has('ringan');
  hud.querySelector('.pov-keluar').klik();
  bingkai(30);
  kendali.gerakKurang = true;
  kendali.ringan = false;
  cek(awalLuncur > 50 && akhirLuncur < 4.5 && ringan,
    'tanpa gerak dikurangi kamera meluncur ke lensa lewat POV.t; mode ringan: monitor tanpa pita bergulir',
    `jarak ke lensa sesudah 1 tick ${awalLuncur.toFixed(1)}, sesudah 31 tick ${akhirLuncur.toFixed(2)}, kelas ringan ${ringan}`);
  cek(!/readPixels|captureStream|MediaRecorder|toDataURL|toBlob/.test(SRC_3D),
    'pantauan murni langsung: ruang3d.js tidak membaca balik piksel kanvas sama sekali (tanpa rekaman/putar ulang)');

  // --- POV dari kartu pegawai
  const tombolMata = () => (aksiKartu ? aksiKartu.anak.filter((t) => t.textContent === 'lihat dari matanya') : []);
  vm24('RUANG3D.pilih(false); bukaKartu(agents.get("uji-a"))');
  const mata2D = tombolMata().length;
  vm24('RUANG3D.pilih(true)');
  const mata3D = tombolMata().length;
  cek(mata2D === 0 && mata3D === 1, 'kartu pegawai: "lihat dari matanya" cuma di 3D — pindah tampilan membangun ulang kartu yang terbuka',
    `2D ${mata2D}, sesudah pindah ke 3D ${mata3D}`);
  bingkai(1);
  const sebelumBaris = mata();
  vm24('bukaKartu(agents.get("uji-b"))');                             // = klik baris kru di panel
  bingkai(2);
  const sesudahBaris = mata();
  cek(jarak(sesudahBaris, sebelumBaris) < 1 && jalankan(ctx, 'terpilih === agents.get("uji-b")') && hud.hidden,
    'bukaKartu saja (klik baris kru) membuka kartu tanpa memindah kamera', `mata (${f2(sebelumBaris)}) -> (${f2(sesudahBaris)})`);
  const [bMata] = tombolMata();
  if (bMata) bMata.klik();
  bingkai(1);
  // mata di kepala orangnya: di atas titik kakinya, setinggi kepala boneka
  const diMata = (o, z = o.y) => { const m = mata(); return Math.abs(m[0] - o.x) < 6 && Math.abs(m[2] - z) < 8 && m[1] > 20 && m[1] < 40; };
  cek(bMata && diMata(B) && !hud.hidden && /uji-b/.test(hud.querySelector('.pov-judul').textContent),
    'tombol "lihat dari matanya" (kartu dari baris kru) memindah kamera ke mata orang itu', `mata (${f2(mata())}), kaki (${B.x}, ${B.y})`);

  // --- ‹ › di pita POV
  const kunjung = (tombol, n) => {
    const jejak = [];
    for (let i = 0; i < n; i++) {
      hud.querySelector(tombol).klik();
      bingkai(1);
      const t = jalankan(ctx, 'terpilih && terpilih.id');
      const o = H.agents.get(t);
      jejak.push(t + (o && diMata(o, o.diKadis ? mata()[2] : o.y) ? '' : '(!mata)'));
    }
    return jejak.join(' ');
  };
  const maju = kunjung('.pov-maju', 4);
  vm24('TIGA.pov(agents.get("uji-a"))');
  bingkai(1);
  const mundur = kunjung('.pov-mundur', 2);
  cek(maju === 'uji-c uji-tamu uji-a uji-b' && mundur === 'uji-tamu uji-c',
    '‹ ›: berputar urut penghuni, melewati yang di WC & yang lenyap di pintu samping, kartu ikut, kamera di matanya',
    `› dari uji-b: ${maju} | ‹ dari uji-a: ${mundur}`);
  vm24('TIGA.pov(agents.get("uji-tamu"))');
  bingkai(1);
  const zTamu = mata();
  cek(Math.abs(zTamu[0] - T.x) < 6 && zTamu[2] < DINDING_Z && jalankan(ctx, 'sisipBoleh()'),
    '‹ ›: tamu ruang kadis ikut putaran selama bukaannya tampil — matanya di ruang kadis, di balik tembok', `mata (${f2(zTamu)})`);
  vm24('globalThis.__sisipAsli = sisipBoleh; sisipBoleh = () => false');
  vm24('TIGA.pov(agents.get("uji-c"))');
  bingkai(1);
  const tanpaBukaan = kunjung('.pov-maju', 1);
  vm24('TIGA.pov(agents.get("uji-tamu"))');
  const tamuDitolak = jalankan(ctx, 'terpilih.id');
  vm24('sisipBoleh = __sisipAsli');
  cek(tanpaBukaan === 'uji-a' && tamuDitolak === 'uji-a',
    '‹ › & tombol kartu: bukaan kadis mati — tamunya dilewati dan tombolnya tidak memindah kamera', `› dari uji-c: ${tanpaBukaan}, TIGA.pov(tamu): terpilih ${tamuDitolak}`);
  vm24('TIGA.pov(agents.get("uji-wc")); TIGA.pov(agents.get("uji-lenyap"))');
  const tetapA = jalankan(ctx, 'terpilih.id');
  vm24('TIGA.cctv()');
  const dariLensaMaju = kunjung('.pov-maju', 1);
  vm24('TIGA.cctv()');
  const dariLensaMundur = kunjung('.pov-mundur', 1);
  cek(tetapA === 'uji-a' && dariLensaMaju === 'uji-a' && dariLensaMundur === 'uji-tamu',
    '‹ › dari lensa CCTV: › ke orang pertama, ‹ ke yang terakhir; yang di WC / lenyap tidak bisa dipakai matanya',
    `TIGA.pov(wc, lenyap): terpilih ${tetapA}; › ${dariLensaMaju}, ‹ ${dariLensaMundur}`);
  cek(!galat.length, 'frame-frame uji pantauan CCTV & pindah mata tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 25
/* Radio kantor di atas counter pantri (RADIO & radioKeadaan di room.js,
   radioBadan & radioPantri di ruang3d.js), dibaca dari WebGL2 perekam dengan
   wadah bernama seperti 9..12; matchMedia dibayangi seperti 19 supaya gerak
   dikurangi bisa dibalik. Tapak & tinggi counter dibaca dari geometrinya
   sendiri (tutup granit #d4d8da), bukan disalin angkanya. Lampu skala =
   titik dinamis di tapak radio yang bukan kerucut (#3b342a) dan bukan jarum.
   AudioContext palsu cuma secukupnya untuk pastikanAudio(): gain & analyser
   yang mencatat sambungannya; sampel analyser-nya diatur dari sini (__amp). */
{
  console.log(tebal('\n3D: radio kantor di atas counter pantri'));
  const ctx = muatKonteks();
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Infinity, NaN, undefined });
  const rekam = { penyangga: [], unggah: [] };
  pasang3D(ctx, glPalsu(rekam));
  ctx.__panggung = { clientWidth: 800, clientHeight: 450, appendChild() {} };
  ctx.__jendela = { devicePixelRatio: 1 };
  ctx.__gerak = { matches: false };
  const log = konsol(() => jalankan(ctx, '((stageInner, window, matchMedia) => {\n' + SRC_3D + '\n})(__panggung, __jendela, () => __gerak)'));
  resetRuangan(ctx, buatPristine(ctx));
  buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  ctx.__jembatan__.eventHidup.length = 0;
  cek(jalankan(ctx, 'TIGA.aktif === true') && !log.length && rekam.penyangga.length === NAMA_WADAH.length,
    'WebGL2 perekam menyala untuk uji radio (matchMedia dibayangi)', log.join(' | '));
  const galat = [];
  const bingkai = () => {
    rekam.unggah.length = 0;
    galat.push(...konsol(() => jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())')));
    const nama = new Map(rekam.penyangga.map((b, i) => [b, NAMA_WADAH[i]]));
    return new Map(rekam.unggah.map(([b, d]) => [nama.get(b), d]));
  };
  const ambil = (f, wadah, saring = () => true) => {
    const d = f.get(wadah) || new Float32Array(0), ps = [];
    for (let i = 0; i + LANGKAH <= d.length; i += LANGKAH) {
      const p = { x: d[i], y: d[i + 1], z: d[i + 2], nz: d[i + 5], rgb: [d[i + 6], d[i + 7], d[i + 8]], a: d[i + 9], e: d[i + 12] };
      if (saring(p)) ps.push(p);
    }
    return ps;
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const sewarna = (p, h) => p.rgb.every((v, j) => Math.abs(v - hex(h)[j]) < 2e-3);
  const rentang = (ps, k) => [Math.min(...ps.map((p) => p[k])), Math.max(...ps.map((p) => p[k]))];
  const R = JSON.parse(jalankan(ctx, 'JSON.stringify(RADIO)'));
  const WARNA = JSON.parse(jalankan(ctx, 'JSON.stringify(RADIO_WARNA)'));

  // --- badan: voxel statis (frame pertama membangun grup polos), di atas counter
  const f0 = bingkai();
  const tutup = ambil(f0, 'polos', (p) => sewarna(p, '#d4d8da'));
  const badan = ambil(f0, 'polos', (p) => sewarna(p, '#6b4128'));
  const C = tutup.length ? { x: rentang(tutup, 'x'), z: rentang(tutup, 'z'), h: rentang(tutup, 'y')[1] } : null;
  const B = badan.length ? { x: rentang(badan, 'x'), y: rentang(badan, 'y'), z: rentang(badan, 'z') } : null;
  cek(!!C && !!B && B.x[0] >= C.x[0] && B.x[1] <= C.x[1] && B.z[0] >= C.z[0] && B.z[1] <= C.z[1]
    && B.y[0] > C.h && B.y[0] - C.h <= 17 && B.x[0] === R.x && B.x[1] === R.x + R.w,
    '3D radio: badannya voxel di atas counter pantri (di tapak counter, di tutup microwave), selebar RADIO 2D',
    C && B ? `counter x ${C.x} z ${C.z} tinggi ${C.h}; radio x ${B.x} y ${B.y} z ${B.z}; RADIO x ${R.x}+${R.w}` : `tutup ${tutup.length}, badan ${badan.length} titik`);

  // --- lampu skala: titik dinamis di tapak radio, bukan kerucut & bukan jarum
  const diTapak = (p) => !!B && p.x >= B.x[0] && p.x <= B.x[1] && p.z >= B.z[0] && p.z <= B.z[1] + 3 && p.y >= B.y[0];
  const lampu = (f) => ambil(f, 'dinamis', (p) => diTapak(p) && !['#3b342a', '#7a2a18', '#5a5040'].some((h) => sewarna(p, h)));
  const pendar = (f) => ambil(f, 'sinar', diTapak);
  const teks = (f) => { const l = lampu(f); return `${l.length} titik lampu, e ${[...new Set(l.map((p) => p.e))].join('/')}, pendar ${pendar(f).length}`; };
  const padam = (f) => lampu(f).length > 0 && lampu(f).every((p) => p.e === 0 && sewarna(p, '#3a3426')) && !pendar(f).length;
  const menyala = (f, jenis) => lampu(f).length > 0 && lampu(f).every((p) => p.e === 1 && sewarna(p, WARNA[jenis]))
    && pendar(f).length > 0 && pendar(f).every((p) => p.a < 1 && p.e === 1 && sewarna(p, WARNA[jenis]));
  const diam = bingkai();
  cek(jalankan(ctx, 'audio === null') && padam(diam) && padam(f0) && !galat.length,
    'diam total (AudioContext belum ada, tanpa musik): lampu skala gelap tanpa emisi, tanpa pendar, tanpa galat', teks(diam) + ' | ' + galat.join(' | '));
  const putar = (kode) => { jalankan(ctx, kode); return bingkai(); };
  const raya = putar('rayaSedangMain = true');
  cek(menyala(raya, 'raya'), 'Indonesia Raya diputar: lampu skala menyala (emisi 1) merah, berpendar di grup sinar', teks(raya));
  const malam = putar("rayaSedangMain = false; musikNyala = true; musikGayaAktif = musikGayaDari('malam')");
  const lagu = putar('musikNyala = false; laguMain = true');
  cek(menyala(malam, 'malam') && menyala(lagu, 'lagu') && WARNA.malam !== WARNA.raya && WARNA.lagu !== WARNA.malam,
    'warnanya ikut jenis musik: lofi gaya malam dan lagu kantor masing-masing warnanya sendiri', `malam: ${teks(malam)}; lagu: ${teks(lagu)}`);
  const lepas = putar('laguMain = false');
  cek(padam(lepas), 'musik berhenti: lampu skala padam lagi, pendarnya hilang', teks(lepas));
  const gaya = jalankan(ctx, 'musikGayaNama()'), jenis = Object.keys(WARNA);
  cek(gaya.every((n) => WARNA[n]) && new Set(Object.values(WARNA)).size === jenis.length,
    `${gaya.length} gaya lofi + lagu kantor + Indonesia Raya: tiap jenis punya warna lampu skala sendiri`,
    'tanpa warna: ' + gaya.filter((n) => !WARNA[n]).join(', '));

  // --- satu sadapan di busMusik: pastikanAudio() dengan AudioContext palsu
  const src = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
  ctx.__amp = 0;
  ctx.window = { AudioContext: class {
    constructor() { this.state = 'running'; this.destination = { nama: 'speaker' }; this.sadap = []; }
    createGain() { return { nama: 'gain', gain: { value: 1 }, ke: [], connect(t) { this.ke.push(t); return t; } }; }
    createAnalyser() {
      const a = { nama: 'analyser', fftSize: 2048, ke: [], connect(t) { this.ke.push(t); return t; },
        getFloatTimeDomainData: (b) => { for (let i = 0; i < b.length; i++) b[i] = (i % 2 ? 1 : -1) * ctx.__amp; } };
      this.sadap.push(a);
      return a;
    }
  } };
  const kabel = jalankan(ctx, `(() => { pastikanAudio(); pastikanAudio();
    return { satu: audio.sadap.length === 1 && radioSadap === audio.sadap[0], dariBus: busMusik.ke.includes(radioSadap),
      keSpeaker: busMusik.ke.includes(audio.destination), lain: [busEfek, busNotif].some((b) => b.ke.includes(radioSadap)) }; })()`);
  delete ctx.window;
  cek(kabel.satu && kabel.dariBus && kabel.keSpeaker && !kabel.lain && (src.match(/createAnalyser\(/g) || []).length === 1,
    'pastikanAudio: tepat satu AnalyserNode (radioSadap), disadap dari busMusik — bus efek & notifikasi tidak; tidak ada createAnalyser lain di room.js',
    JSON.stringify(kabel));

  // --- kerucut speaker: maju dari sadapan itu, kembali waktu sepi; gerak dikurangi: diam
  const kerucut = (f) => { const k = ambil(f, 'dinamis', (p) => diTapak(p) && sewarna(p, '#3b342a')); return k.length ? rentang(k, 'z')[1] : NaN; };
  const dengan = (amp, n = 1) => { ctx.__amp = amp; let f = null; for (let i = 0; i < n; i++) f = bingkai(); return kerucut(f); };
  jalankan(ctx, 'rayaSedangMain = true');
  const sepi = dengan(0, 3), keras = dengan(0.3), reda = dengan(0, 8);
  jalankan(ctx, 'rayaSedangMain = false');
  const mati = dengan(0.3, 3);
  ctx.__gerak.matches = true;
  jalankan(ctx, 'rayaSedangMain = true');
  const gerakKurang = dengan(0.3, 3);
  ctx.__gerak.matches = false;
  jalankan(ctx, 'rayaSedangMain = false');
  dengan(0, 8);
  cek(keras - sepi > 0.5 && Math.abs(reda - sepi) < 0.05,
    'kerucut speaker maju dari sadapan busMusik saat lagunya berbunyi, lalu kembali waktu sepi',
    `muka depan z: sepi ${sepi}, keras ${keras}, reda ${reda}`);
  cek(Math.abs(mati - sepi) < 0.05 && Math.abs(gerakKurang - sepi) < 0.05,
    'kontrol: bus berbunyi tapi radio tidak memutar apa pun = diam; prefers-reduced-motion = kerucut diam',
    `tanpa jenis ${mati}, gerak dikurangi ${gerakKurang}, sepi ${sepi}`);

  // --- 2D: drawRadio membaca keadaan yang sama, di ctx palsu ketat
  const lukis2D = (kode) => {
    jalankan(ctx, kode);
    const k = buatCtxPalsu({ ketat: true }), isi = [], fr = k.fillRect;
    k.fillRect = function (...a) { isi.push(String(k.fillStyle)); return fr.apply(this, a); };
    ctx.__k2 = k;
    try { jalankan(ctx, 'now += 100; gambarKe(__k2, () => drawRadio())'); } catch (e) { return { galat: e.message, isi }; }
    return { galat: '', isi };
  };
  const d0 = lukis2D('audio = null; radioSadap = null; busMusik = null'), d1 = lukis2D('rayaSedangMain = true');
  jalankan(ctx, 'rayaSedangMain = false');
  cek(!d0.galat && !d1.galat && d0.isi.includes('#3a3426') && !d0.isi.some((c) => jenis.some((j) => WARNA[j] === c))
    && d1.isi.includes(WARNA.raya) && !d1.isi.includes('#3a3426'),
    '2D drawRadio: tanpa AudioContext skalanya gelap tanpa galat; Indonesia Raya menyalakannya merah (ctx ketat)',
    `diam: ${d0.galat || d0.isi.length + ' fillRect'}; raya: ${d1.galat || d1.isi.length + ' fillRect'}`);
  cek(!galat.length, 'frame-frame uji radio tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 26
/* Sinematik 3D "maket lobi" (sudutSinematik & pegangMaket di ruang3d.js).
   Keliling sinematiknya diisi dari sini: kameraBidik() di sandbox tidak
   pernah masuk cabang sinematik, karena kameraSinematikBoleh() room.js
   membaca matchMedia dummy yang `.matches`-nya truthy (gerak dikurangi).
   Jadi KAMERA diisi persis seperti cabang itu — stasiun KAMERA_RUTE[i],
   target (s.x, s.y - 12), zoom 2, sinematikSejak = now — dan lima nama
   room.js dibayangi parameter untuk ruang3d.js saja, seperti bagian 19:
   stageInner, window, ringanAktif, matchMedia, dan kameraSinematikBoleh. Yang
   terakhir di peramban = !geraKurang.matches, jadi diikat ke sakelar gerak
   yang sama dengan geraKurang3. TIGA.kamera(1): pelunakan k = 1 - e^-7,
   versi lunaknya praktis sampai dalam satu tick. */
{
  console.log(tebal('\n3D: sinematik maket lobi — sudut tiap singgahan, ayunan, penonton memegang kendali'));
  const ctx = muatKonteks();
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Infinity, NaN, undefined });
  const pendengar = pasang3D(ctx, glPalsu());
  ctx.__panggung = { clientWidth: 800, clientHeight: 450, appendChild() {} };
  ctx.__jendela = { devicePixelRatio: 1 };
  ctx.__uji = { ringan: false, gerak: { matches: false } };
  const log = konsol(() => jalankan(ctx, '((stageInner, window, ringanAktif, matchMedia, kameraSinematikBoleh) => {\n' + SRC_3D
    + '\n})(__panggung, __jendela, () => __uji.ringan, () => __uji.gerak, () => !__uji.gerak.matches)'));
  const KAM = ctx.__jendela.RUANG3D && ctx.__jendela.RUANG3D.kamera;
  cek(jalankan(ctx, 'TIGA.aktif === true') && !!KAM && !log.length,
    'WebGL2 palsu menyala untuk uji sinematik (5 nama room.js dibayangi)', log.join(' | '));
  const RUTE = JSON.parse(jalankan(ctx, 'JSON.stringify(KAMERA_RUTE)'));
  const galat = [], angka = [];
  // n tick kamera 3D, jam ruangan maju `maju` ms sebelum tiap tick; hasilnya [yawK, pitchK] sesudah tiap tick
  const tick = (n = 3, maju = 0) => {
    const jejak = [];
    galat.push(...konsol(() => {
      for (let i = 0; i < n; i++) {
        jalankan(ctx, `now += ${maju}; TIGA.kamera(1)`);
        jejak.push([KAM.yawK, KAM.pitchK]);
        angka.push(KAM.yawK, KAM.pitchK, KAM.jarakK, ...KAM.sasaranK, ...KAM.vp);
      }
    }));
    return jejak;
  };
  // singgahan ke-i keliling sinematik, persis cabang sinematik kameraBidik()
  const singgah = (i) => jalankan(ctx, `(() => {
    const s = STATIONS[KAMERA_RUTE[${i}]];
    Object.assign(KAMERA, { mode: 'sinematik', sinematikIdx: ${i}, sinematikSejak: now, targetX: s.x, targetY: s.y - 12, targetZoom: 2 });
  })()`);
  const lebar = (v) => Math.max(...v) - Math.min(...v);
  const teks = (j) => j.map(([y, p]) => y.toFixed(3) + '/' + p.toFixed(3)).join(' ');
  const dalamJepit = ([y, p]) => Math.abs(y) <= 1.3 + 1e-9 && p >= 0.1 - 1e-9 && p <= 1.45 + 1e-9;

  // sudut milik penonton: sengaja bukan tampak awal, supaya kelihatan kalau ada yang menimpanya
  const PENONTON = [0.3, 0.9];
  [KAM.yaw, KAM.pitch] = PENONTON;
  tick();

  // --- tiap singgahan bersudut sendiri (jam diam: ayunannya di pangkal)
  const sudut = RUTE.map((st, i) => { singgah(i); return [st, tick().at(-1)]; });
  const peta = Object.fromEntries(sudut);
  const unik = new Set(sudut.map(([, s]) => s.map((v) => v.toFixed(3)).join('/')));
  cek(unik.size === RUTE.length && sudut.every(([, s]) => dalamJepit(s)),
    `mode sinematik: ${RUTE.length} singgahan, ${RUTE.length} sudut berbeda — semuanya di dalam jepit yaw ±1,3, pitch 0,1..1,45`,
    sudut.map(([st, s]) => st + ' ' + teks([s])).join(', '));
  cek(peta.read[0] < -0.3 && peta.server[0] > 0.3 && peta.rapat[1] > 1.1 && peta.idle[1] < 0.45 && Math.abs(peta.idle[0]) < 0.1,
    'arsip dari kiri, server dari kanan, rapat dari atas, ruang tunggu dari depan (rendah)',
    ['read', 'server', 'rapat', 'idle'].map((st) => st + ' ' + teks([peta[st]])).join(', '));
  cek(KAM.yaw === PENONTON[0] && KAM.pitch === PENONTON[1],
    'sinematik tidak menimpa sudut milik penonton (KAM.yaw/pitch) — yang dibawa ke sudut singgahan cuma versi lunaknya',
    `yaw ${KAM.yaw}, pitch ${KAM.pitch}`);

  // --- ayunan selama singgah: satu periode (10 dtk) dalam langkah 1,25 dtk
  const iServer = RUTE.indexOf('server');
  singgah(iServer); tick();
  const ayun = tick(8, 1250), yaws = ayun.map(([y]) => y);
  const beda = yaws.slice(1).map((y, i) => Math.abs(y - yaws[i])), tengah = (Math.max(...yaws) + Math.min(...yaws)) / 2;
  cek(beda.every((d) => d > 0.01) && lebar(yaws) > 0.15 && lebar(yaws) < 0.3 && lebar(ayun.map(([, p]) => p)) < 1e-6
    && Math.abs(tengah - peta.server[0]) < 0.02 && ayun.every(dalamJepit),
    'selama singgah maketnya mengayun pelan: yaw berubah tiap frame, ±0,1 rad berpusat di sudut stasiunnya, pitch tetap',
    `${teks(ayun)}; tengah ${tengah.toFixed(3)}, sudut server ${peta.server[0].toFixed(3)}`);

  // --- mode ringan: sudut stasiunnya tetap, ayunannya tidak
  ctx.__uji.ringan = true;
  singgah(iServer); tick();
  const ringan = tick(6, 1250);
  ctx.__uji.ringan = false;
  cek(lebar(ringan.map(([y]) => y)) < 1e-6 && Math.abs(ringan[0][0] - peta.server[0]) < 1e-3,
    'mode ringan: singgahan tetap bersudut sendiri, tapi maketnya tidak mengayun', teks(ringan));

  // --- mode lain: sudutnya kembali ke milik penonton dan diam di sana. Tiap
  // kasus mulai dari singgahan rapat (pitch 1,25, jauh dari 0,9 penonton)
  const diPenonton = ([y, p]) => Math.abs(y - PENONTON[0]) < 1e-3 && Math.abs(p - PENONTON[1]) < 1e-3;
  const iRapat = RUTE.indexOf('rapat');
  for (const [ket, pasang, cabut] of [
    ["mode 'ikut' (bidikan zoom 2 yang sama)", "KAMERA.mode = 'ikut'", ''],
    ["mode 'mati' dengan sisa indeks sinematik", "KAMERA.mode = 'mati'", ''],
    ['klik barang (kartu inventaris)', 'barangTerpilih = daftarBarang()[0]', 'barangTerpilih = null'],
    ['X-banner', 'BANNER.zoom = true', 'BANNER.zoom = false'],
    ['bukaan ruang kadis', 'RUANG_KADIS.zoom = true', 'RUANG_KADIS.zoom = false'],
    ['sinematik tanpa singgah (ada kegiatan: tampak penuh)', 'KAMERA.sinematikIdx = -1; KAMERA.targetZoom = 1', ''],
    ['gerak dikurangi (kameraSinematikBoleh() menutup sinematik)', '__uji.gerak.matches = true', '__uji.gerak.matches = false'],
  ]) {
    singgah(iRapat); tick();
    const awal = [KAM.yawK, KAM.pitchK];
    jalankan(ctx, pasang);
    const j = tick(4, 1250);
    jalankan(ctx, cabut);
    cek(!diPenonton(awal) && j.every(diPenonton), `${ket}: sudutnya kembali ke milik penonton dan tidak mengayun`,
      `dari ${teks([awal])}: ${teks(j)}`);
  }

  // --- penonton memegang kendali
  const jari = (jenis, e = {}) => {
    for (const fn of pendengar[jenis] || []) {
      fn({ type: jenis, pointerId: 1, clientX: 0, clientY: 0, button: 0, pointerType: 'mouse', shiftKey: false, ctrlKey: false,
        deltaY: 0, preventDefault() {}, ...e });
    }
  };
  // singgahan server yang sedang mengayun; tahanan pegangan sebelumnya sudah habis
  const diTengahAyunan = () => { jalankan(ctx, 'now += 11000'); singgah(iServer); tick(); return tick(2, 1250); };
  const sebelum = diTengahAyunan(), [y0, p0] = sebelum.at(-1);
  jari('pointerdown', { clientX: 400, clientY: 225 });
  jari('pointermove', { clientX: 430, clientY: 225 });        // > 5 px: seret sungguhan
  const yaw1 = KAM.yaw;
  jari('pointermove', { clientX: 460, clientY: 225 });        // gerakan kedua sebelum tick berikutnya
  const [yaw2, pitch2] = [KAM.yaw, KAM.pitch];
  jari('pointerup', { clientX: 460, clientY: 225 });
  cek(lebar(sebelum.map(([y]) => y)) > 0.01 && Math.abs(yaw1 - (y0 - 30 * 0.006)) < 1e-9
    && Math.abs(yaw2 - (y0 - 60 * 0.006)) < 1e-9 && Math.abs(pitch2 - p0) < 1e-9,
    'seret di tengah ayunan: maket dipegang di sudut yang sedang tampak, dua gerakan sebelum tick sama-sama terhitung',
    `ayun ${teks(sebelum)}; gerak 1 yaw ${yaw1.toFixed(4)}, gerak 2 ${yaw2.toFixed(4)}/${pitch2.toFixed(4)}`);
  const tahan = tick(6, 1250);                                  // 7,5 dtk, di dalam tahanan 10 dtk
  cek(lebar(tahan.map(([y]) => y)) < 1e-3 && Math.abs(tahan[0][0] - yaw2) < 1e-3,
    'seret menghentikan ayunan: selama tahanannya sudut maket diam di tempat penonton menaruhnya', teks(tahan));
  const lanjut = tick(4, 1250);                                 // lewat 10 dtk sejak sentuhan terakhir
  cek(lebar(lanjut.map(([y]) => y)) > 0.02 && !lanjut.slice(-2).some(([y]) => Math.abs(y - yaw2) < 1e-3),
    'kontrol: sesudah tahanannya habis, sudut & ayunan sinematik kembali', teks(lanjut));

  for (const [ket, aksi, cocok] of [
    ['roda', () => jari('wheel', { deltaY: -120 }), null],
    ['cubit dua jari', () => {
      jari('pointerdown', { pointerId: 1, clientX: 300, clientY: 200 });
      jari('pointerdown', { pointerId: 2, clientX: 400, clientY: 200 });
      jari('pointermove', { pointerId: 2, clientX: 460, clientY: 210 });
      jari('pointerup', { pointerId: 2, clientX: 460, clientY: 210 });
      jari('pointerup', { pointerId: 1, clientX: 300, clientY: 200 });
    }, null],
    ['klik dua kali', () => jari('dblclick'), [0, 0.7]],      // kameraAwal: tampak awal
  ]) {
    const ayunDulu = diTengahAyunan(), tampak = [KAM.yawK, KAM.pitchK];
    aksi();
    const j = tick(6, 1250), tuju = cocok || tampak;
    cek(lebar(ayunDulu.map(([y]) => y)) > 0.01 && lebar(j.map(([y]) => y)) < 1e-3
      && j.every(([y, p]) => Math.abs(y - tuju[0]) < 1e-3 && Math.abs(p - tuju[1]) < 1e-3),
      `${ket} menghentikan ayunan: sudutnya diam ${cocok ? 'di tampak awal' : 'di yang sedang tampak'} selama tahanannya`,
      `ayun ${teks(ayunDulu)} -> ${teks(j)}`);
  }

  cek(angka.length > 0 && angka.every(Number.isFinite) && !galat.length,
    `semua angka kamera hingga (${angka.length} nilai: yawK, pitchK, jarakK, sasaranK, matriks vp) dan jaring NaN tidak turun tangan`,
    galat.join(' | '));
}

// ------------------------------------------------------------------ 27
/* Aksesori tamu tenar jadi voxel. Dulu seluruhnya dilukis ke stiker datar
   (KARTU_AKSESORI) 4,5 di depan boneka yang selalu menghadap +z: dari kamera
   yang diputar atau POV pipih dan melayang. Sekarang tabel AKSESORI_3D —
   kuncinya dibaca dari teks berkasnya, tanpa nama global baru — memasang
   voxel di matriks boneka pemiliknya. Tiap tamu tenar beraksesori di
   registri dinyalakan lewat mulai() aslinya lalu dipindah ke dua tempat (x
   DAN lajur) dan dibalik arahnya; aksesorinya dicari lewat warna sidik yang
   tidak dipakai palet tamunya. fillRect ke kanvas seukuran STIKER dicatat
   lewat document.createElement yang dibungkus. */
{
  console.log(tebal('\n3D: aksesori tamu tenar jadi voxel di bonekanya'));
  const { ctx, H, galat, bingkai, titik } = nyalakan3D();
  const [, LBR_STIKER, TGI_STIKER] = (SRC_3D.match(/const STIKER = \{ lebar: (\d+), tinggi: (\d+)/) || []).map(Number);
  const lukisStiker = [];
  let kanvasBaru = 0;
  const buatAsli = ctx.document.createElement;
  ctx.document.createElement = (tag) => {
    const el = buatAsli(tag);
    if (String(tag).toLowerCase() !== 'canvas') return el;
    kanvasBaru++;
    const k = el.getContext('2d'), fr = k.fillRect;
    k.fillRect = function (...a) {
      if (el.width === LBR_STIKER && el.height === TGI_STIKER) lukisStiker.push(String(k.fillStyle).toLowerCase());
      return fr.apply(this, a);
    };
    return el;
  };
  const blok = (SRC_3D.match(/const AKSESORI_3D = \{([\s\S]*?)\n {2}\};/) || [])[1] || '';
  const TABEL = [...blok.matchAll(/^ {4}'([a-z0-9-]+)': \{/gm)].map((m) => m[1]);
  const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  const pristine = buatPristine(ctx);
  const tamuDari = (E) => Object.values(E.data).flatMap((v) => [].concat(v))
    .filter((o) => o && typeof o === 'object' && typeof o.aksesori === 'function');

  // --- tabel <-> registri: tiap tamu tenar yang membawa aksesori tercantum, dan sebaliknya
  const beraksesori = [];
  for (const def of H.EVENT_ACAK.filter((d) => d.tamuTenar)) {
    const E = buatE(def);
    try { def.mulai(E, S); } catch { continue; }
    if (tamuDari(E).length) beraksesori.push(def.id);
  }
  resetRuangan(ctx, pristine);
  const tanpaTabel = beraksesori.filter((id) => !TABEL.includes(id)), tanpaEvent = TABEL.filter((id) => !beraksesori.includes(id));
  cek(TABEL.length >= 20 && !tanpaTabel.length && !tanpaEvent.length,
    `AKSESORI_3D memuat tiap tamu tenar beraksesori di registri (${TABEL.length}/${beraksesori.length}), tanpa id yang salah ketik`,
    `belum bermodel: ${tanpaTabel.join(', ') || '-'}; tak ada eventnya: ${tanpaEvent.join(', ') || '-'}`);

  // warna sidik aksesori tiap tamu: tidak dipakai palet tamunya sendiri. Vokalis:
  // rambutnya sewarna poni — yang dibaca juntaian sisi di bawah rambut boneka (dunia y < 25)
  const SIDIK = {
    'pemusik-bandana-harmonika': '#b8443a', 'pemusik-jas-berkilau-gitar-elektrik': '#8c1f2a',
    'penyanyi-gaun-bunga-legalisir': '#e0577f', 'rapper-polo-merah-muda': '#16181c',
    'kreator-berhijab-rekam-jalan': '#4a5058', 'duo-bapak-anak-konten': '#c9452f',
    'kiper-sarung-tangan-timnas': '#f2efe2', 'bek-lemparan-dua-tangan': '#f4f2e8',
    'lifter-singlet-merah-putih': '#22262c', 'pebulutangkis-raket-di-punggung': '#d8dde2',
    'pemanjat-harness-kapur': '#e8b23a', 'rombongan-pembersih-sungai': '#f07a20',
    'bintang-jersey-nomor-tujuh': '#1c3f7a', 'bintang-jersey-merah-muda-sepuluh': '#f7f2f4',
    'pembalap-wearpack-helm-tak-dibuka': '#1a1d24', 'bos-jaket-kulit-hitam': '#5a5f68',
    'pahlawan-setelan-merah-biru': '#f4f6f8', 'peserta-training-hijau-empat-lima-enam': '#f2f0e6',
    'pemburu-jaket-kuning-kepang-ungu': '#a8871a', 'pendongeng-blangkon-bertongkat': '#6b4a2a',
    'pesulap-rambut-menutup-wajah': '#2b2533', 'vokalis-poni-menutup-sebelah-mata': '#171219',
    'suara-berat-di-lorong-malam': '#12141b', 'bocah-destar-kacamata-hitam': '#7a2c2c',
  };
  const saringSidik = (id) => (id === 'vokalis-poni-menutup-sebelah-mata' ? (p) => p.y < 25 : () => true);
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
  const R = 18;                                         // jangkauan baca di sekitar tamu pertama
  const A = [120, 300], B = [196, 270];

  // kontrol: tanpa event, tak satu pun warna sidik di bidang yang dibaca
  H.eventHidup.length = 0;
  for (let i = 0; i < 3; i++) bingkai();
  const kotor = [];
  for (const [x, y] of [A, B]) for (const [id, hex] of Object.entries(SIDIK)) if (titik(hex, (p) => sekitar(x, y, R)(p) && saringSidik(id)(p)).length) kotor.push(`${hex} di (${x}, ${y})`);
  cek(!kotor.length, 'kontrol: tanpa event, warna sidik aksesori tidak ada di bidang yang dibaca', kotor.join(', '));

  // satu tamu tenar hidup lewat mulai() aslinya; tamunya berdiri diam di (x, y)
  // menghadap `hadap` (rombongan berjajar 40 ke kanan, di luar jangkauan baca)
  const pasang = (def, [x, y], hadap = 'down', keadaan = {}, n = 3) => {
    H.eventHidup.length = 0;
    resetRuangan(ctx, pristine);
    const E = buatE(def);
    def.mulai(E, S);
    const tamu = tamuDari(E);
    tamu.forEach((o, i) => Object.assign(o, { x: x + i * 40, y, wp: [], hadap }, keadaan));
    H.eventHidup.push(E);
    lukisStiker.length = 0;
    for (let i = 0; i < n; i++) bingkai();
    return tamu;
  };
  const baca = (id, [x, y], tamu) => ({
    badan: ukuran(titik(tamu[0].pal.main, sekitar(x, y, 12))),
    kulit: ukuran(titik(tamu[0].pal.skin, sekitar(x, y, 12))),
    aks: ukuran(titik(SIDIK[id], (p) => sekitar(x, y, R)(p) && saringSidik(id)(p))),
    stiker: lukisStiker.length,
  });

  // --- tiap tamu: voxel di dekat badannya, ikut pindah & berbalik, tak berstiker
  const gagalAda = [], gagalIkut = [], gagalBalik = [], gagalStiker = [], hasil = {};
  for (const id of TABEL) {
    const def = H.eventById.get(id);
    if (!def || !SIDIK[id]) { gagalAda.push(id + ' (tanpa def/sidik)'); continue; }
    const a = baca(id, A, pasang(def, A));
    const b = baca(id, B, pasang(def, B));
    const k = baca(id, A, pasang(def, A, 'right', {}, 6));
    hasil[id] = a;
    if (!(a.aks.n && a.aks.hingga && a.badan.n && Math.hypot(a.aks.x - a.badan.x, a.aks.z - a.badan.z) < 12)) gagalAda.push(`${id}: ${teks(a.aks)}`);
    const gb = [b.badan.x - a.badan.x, b.badan.z - a.badan.z], ga = [b.aks.x - a.aks.x, b.aks.z - a.aks.z];
    if (!(b.aks.n && Math.abs(gb[0] - (B[0] - A[0])) < 1.2 && Math.abs(gb[1] - (B[1] - A[1])) < 1.2
      && Math.abs(ga[0] - gb[0]) < 0.4 && Math.abs(ga[1] - gb[1]) < 0.4)) gagalIkut.push(`${id}: badan ${gb.map((v) => v.toFixed(2))}, aksesori ${ga.map((v) => v.toFixed(2))}`);
    // hadap kanan = yaw +90°: selisih lokal (dx, dz) hadap depan jadi (dz, -dx)
    const d0 = [a.aks.x - a.badan.x, a.aks.z - a.badan.z], d1 = [k.aks.x - k.badan.x, k.aks.z - k.badan.z];
    if (!(k.aks.n && Math.abs(d1[0] - d0[1]) < 0.8 && Math.abs(d1[1] + d0[0]) < 0.8)) gagalBalik.push(`${id}: depan ${d0.map((v) => v.toFixed(2))}, kanan ${d1.map((v) => v.toFixed(2))}`);
    if (a.stiker + b.stiker + k.stiker) gagalStiker.push(`${id}: ${a.stiker + b.stiker + k.stiker} fillRect`);
  }
  cek(!gagalAda.length, `tiap aksesori (${TABEL.length} tamu) jadi voxel di dekat badan bonekanya, angkanya hingga`, gagalAda.join(' | '));
  cek(!gagalIkut.length, 'aksesorinya bergeser persis sejauh badannya (x DAN lajur): menempel di matriks boneka', gagalIkut.join(' | '));
  cek(!gagalBalik.length, 'aksesorinya ikut berbalik waktu tamunya menghadap kanan — bukan stiker yang selalu menghadap +z', gagalBalik.join(' | '));
  cek(!gagalStiker.length, 'aksesori yang sudah bermodel tidak lagi dilukis ke stiker (dobel)', gagalStiker.join(' | '));

  // --- kepala di kepala
  const kp = hasil['duo-bapak-anak-konten'];
  cek(kp && kp.aks.y0 > 0.85 * kp.kulit.y1 && kp.aks.y1 > kp.kulit.y1 + 3,
    'kupluk duduk di garis rambut dan mahkotanya menjulang di atas ubun-ubun', kp && `kupluk ${teks(kp.aks)}, puncak kepala ${kp.kulit.y1.toFixed(1)}`);
  const PEMBALAP = H.eventById.get('pembalap-wearpack-helm-tak-dibuka'), VISOR = SIDIK['pembalap-wearpack-helm-tak-dibuka'];
  const visorDi = (hadap, keadaan) => {
    const t = pasang(PEMBALAP, A, hadap, keadaan, 6);
    return { visor: ukuran(titik(VISOR, sekitar(A[0], A[1], R))), badan: ukuran(titik(t[0].pal.pants, (p) => sekitar(A[0], A[1], 12)(p) && p.y < 10)) };
  };
  const vd = visorDi('down'), vk = visorDi('right'), vl = visorDi('down', { helmDilepas: true });
  const puncak = hasil['pembalap-wearpack-helm-tak-dibuka'].kulit.y1;
  cek(vd.visor.z > vd.badan.z + 5 && vk.visor.x > vk.badan.x + 5 && vd.visor.y0 > 0.7 * puncak,
    'visor helm pembalap ada di mukanya setinggi mata, dan ikut menoleh waktu dia menghadap kanan',
    `depan: visor ${teks(vd.visor)} vs kaki z ${vd.badan.z.toFixed(1)}; kanan: visor x ${vk.visor.x.toFixed(1)} vs kaki x ${vk.badan.x.toFixed(1)}`);
  cek(vl.visor.n > 0 && vl.visor.y1 < 0.45 * puncak,
    'helm yang dilepas dijinjing di tangannya (rendah, di sisi badan), bukan lenyap atau tetap di kepala', `visor ${teks(vl.visor)}, puncak ${puncak.toFixed(1)}`);

  // --- punggung di punggung
  const RAKET = H.eventById.get('pebulutangkis-raket-di-punggung'), SR = SIDIK['pebulutangkis-raket-di-punggung'];
  const rk = hasil['pebulutangkis-raket-di-punggung'];
  pasang(RAKET, A, 'down', { ayunSampai: 1 }, 6);
  const rAyun = ukuran(titik(SR, sekitar(A[0], A[1], R)));
  cek(rk.aks.z < rk.badan.z - 3 && rk.aks.y1 > 0.6 * rk.kulit.y1 && rAyun.y1 > rk.kulit.y1 + 5,
    'raket tersandang di punggung (di belakang badan, menyembul di atas bahu), dan naik di atas kepala waktu menepuk',
    `punggung: ${teks(rk.aks)} vs badan z ${rk.badan.z.toFixed(1)}; menepuk: ${teks(rAyun)}, puncak ${rk.kulit.y1.toFixed(1)}`);
  const j7 = hasil['bintang-jersey-nomor-tujuh'];
  pasang(H.eventById.get('bintang-jersey-nomor-tujuh'), A);
  const nomor = ukuran(titik(SIDIK['bintang-jersey-nomor-tujuh'], (p) => sekitar(A[0], A[1], R)(p) && Math.abs(p.x - j7.badan.x) < 3));
  cek(nomor.n > 0 && nomor.z0 < j7.badan.z - 3.2 && nomor.z1 < j7.badan.z - 2.5, 'jersey nomor tujuh: angkanya di punggung, pitanya di tepi badan',
    `angka ${teks(nomor)}, badan z ${j7.badan.z.toFixed(1)}`);

  // --- tangan: tongsis, tongkat, sarung kiper
  const KREATOR = H.eventById.get('kreator-berhijab-rekam-jalan'), HP = '#20242c';
  const hpDi = (rekam) => { pasang(KREATOR, A, 'down', { rekam }, 6); return ukuran(titik(HP, sekitar(A[0], A[1], R))); };
  const hpRekam = hpDi(true), hpMati = hpDi(false), kepalaK = hasil['kreator-berhijab-rekam-jalan'].kulit.y1;
  cek(hpRekam.n > 0 && hpRekam.y0 > kepalaK && hpMati.n > 0 && hpMati.y1 < kepalaK && hpMati.y0 > 0.5 * kepalaK,
    'tongsis di genggamannya: merekam = diangkat, HP-nya di atas kepala; ditegur = turun, HP setinggi bahu',
    `merekam ${teks(hpRekam)}; mati ${teks(hpMati)}; puncak kepala ${kepalaK.toFixed(1)}`);
  const TONGKAT = '#5b3f24', PENDONGENG = H.eventById.get('pendongeng-blangkon-bertongkat');
  const tongkatDi = (angkat) => { pasang(PENDONGENG, A, 'down', { angkat }, 6); return ukuran(titik(TONGKAT, sekitar(A[0], A[1], R))); };
  const tTegak = tongkatDi(false), tTunjuk = tongkatDi(true), kepalaP = hasil['pendongeng-blangkon-bertongkat'].kulit.y1;
  cek(tTegak.n > 0 && tTegak.y0 < 1.5 && tTegak.y1 < 0.6 * kepalaP && tTunjuk.y1 > kepalaP,
    'tongkat pendongeng: tegak di genggamannya sampai lantai, lalu terangkat menunjuk bagan di atas kepala',
    `tegak ${teks(tTegak)}; menunjuk ${teks(tTunjuk)}; puncak ${kepalaP.toFixed(1)}`);
  const KIPER = H.eventById.get('kiper-sarung-tangan-timnas'), SK = SIDIK['kiper-sarung-tangan-timnas'];
  const kp1 = hasil['kiper-sarung-tangan-timnas'];
  pasang(KIPER, A, 'down', { tangkapSampai: 1 }, 6);
  const tangkap = ukuran(titik(SK, sekitar(A[0], A[1], R)));
  cek(kp1.aks.x0 < kp1.badan.x - 5 && kp1.aks.x1 > kp1.badan.x + 5 && tangkap.y > kp1.aks.y + 5 && tangkap.z > kp1.aks.z + 3,
    'sarung tangan kiper menelan kedua telapaknya, dan naik ke depan dada waktu menangkap',
    `diam ${teks(kp1.aks)}; menangkap ${teks(tangkap)}`);

  // --- kontrol: aksesori yang belum bermodel tetap lewat stiker (definisi
  // salinan beri-id baru: tidak ada di tabel), tanpa kanvas baru tiap frame
  const salin = (id, idBaru) => ({ ...H.eventById.get(id), id: idBaru });
  pasang(salin('duo-bapak-anak-konten', 'uji-aksesori-belum-bermodel'), A, 'down', {}, 3);
  const stikerKupluk = lukisStiker.filter((c) => c === '#c9452f').length, voxelKupluk = titik('#c9452f', sekitar(A[0], A[1], R)).length;
  const kanvas0 = kanvasBaru;
  for (let i = 0; i < 10; i++) bingkai();
  cek(stikerKupluk > 0 && voxelKupluk === 0 && kanvasBaru === kanvas0,
    'kontrol: tamu yang aksesorinya belum bermodel tetap dilukis ke stiker (bukan voxel), tanpa kanvas baru tiap frame',
    `${stikerKupluk} fillRect kupluk ke stiker, ${voxelKupluk} titik voxel, ${kanvasBaru - kanvas0} kanvas baru dalam 10 frame`);
  pasang(salin('bocah-destar-kacamata-hitam', 'uji-anak-belum-bermodel'), A, 'right', {}, 3);
  const stikerDestar = lukisStiker.filter((c) => c === '#7a2c2c').length, kanvas1 = kanvasBaru;
  for (let i = 0; i < 10; i++) bingkai();
  cek(stikerDestar > 0 && kanvasBaru === kanvas1,
    'kontrol: tamu anak berstiker (salinan tokoh baru tiap frame) tidak membuat kanvas stiker baru tiap frame',
    `${stikerDestar} fillRect destar ke stiker, ${kanvasBaru - kanvas1} kanvas baru dalam 10 frame`);

  H.eventHidup.length = 0;
  cek(!galat.length, 'frame-frame uji aksesori tamu tenar tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 28
/* Gorden kiri yang lepas (MOD.gordenLepas; drawWindow & gordenKiriLepas di
   room.js, gordenKiri & gordenKiriBebas di ruang3d.js). angin-kencang-gorden
   menulis 'angin' selama 6 dtk pertama, gorden-lepas-kait true sampai
   dikaitkan lagi. 3D dibaca dari WebGL2 perekam seperti 25 dengan penyangga
   TERAKHIR per wadah — perabot cuma diunggah waktu dibangun ulang —, dan
   ringanAktif & matchMedia dibayangi seperti 26. Panel = titik berwarna kain
   gorden di x 176,5..196, tinggi 37..86; di perabot rumbai lambrequin
   (82,6..85,2) ikut terbaca, jadi "panelnya pergi" = tak ada titik di bawah
   82. Benderanya ditulis langsung ke MOD (TIGA.gambar() tidak lewat
   resetMod). 2D: drawWindow, tick, dan gambarDinding event dipanggil
   langsung di ctx palsu ketat; gerak dikurangi menyala di sandbox, jadi
   kibar 2D yang terbaca adalah posenya yang diam. */
{
  console.log(tebal('\n3D & 2D: gorden kiri berkibar dan lepas kait (MOD.gordenLepas)'));
  const ctx = muatKonteks();
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Infinity, NaN, undefined });
  const rekam = { penyangga: [], unggah: [] };
  pasang3D(ctx, glPalsu(rekam));
  ctx.__panggung = { clientWidth: 800, clientHeight: 450, appendChild() {} };
  ctx.__jendela = { devicePixelRatio: 1 };
  ctx.__uji = { ringan: false, gerak: { matches: false } };
  const log = konsol(() => jalankan(ctx, '((stageInner, window, ringanAktif, matchMedia) => {\n' + SRC_3D
    + '\n})(__panggung, __jendela, () => __uji.ringan, () => __uji.gerak)'));
  const H = ctx.__jembatan__;
  resetRuangan(ctx, buatPristine(ctx));
  const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  H.eventHidup.length = 0;
  cek(jalankan(ctx, 'TIGA.aktif === true') && !log.length && rekam.penyangga.length === NAMA_WADAH.length,
    'WebGL2 perekam menyala untuk uji gorden (ringanAktif & matchMedia dibayangi)', log.join(' | '));
  const galat = [], terakhir = new Map();
  const bingkai = (n = 1) => {
    for (let k = 0; k < n; k++) {
      rekam.unggah.length = 0;
      galat.push(...konsol(() => jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())')));
      const nama = new Map(rekam.penyangga.map((b, i) => [b, NAMA_WADAH[i]]));
      for (const [b, d] of rekam.unggah) terakhir.set(nama.get(b), d);
    }
  };
  const KAIN = ['#5f9068', '#3e6b4f', '#2c4e38'];
  const KAIN_RGB = KAIN.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
  const panel = (wadah) => {
    const d = terakhir.get(wadah) || new Float32Array(0), ps = [];
    for (let i = 0; i + LANGKAH <= d.length; i += LANGKAH) {
      const p = { x: d[i], y: d[i + 1], z: d[i + 2] };
      if (p.x < 176.5 || p.x > 196 || p.y < 37 || p.y > 86.01 || p.z < 99 || p.z > 125) continue;
      if (KAIN_RGB.some((c) => c.every((v, j) => Math.abs(v - d[i + 6 + j]) < 2e-3))) ps.push(p);
    }
    return ps;
  };
  const rentang = (ps, k) => (ps.length ? [Math.min(...ps.map((p) => p[k])), Math.max(...ps.map((p) => p[k]))] : [NaN, NaN]);
  const sidik = (ps) => ps.map((p) => [p.x, p.y, p.z].map((v) => v.toFixed(3)).join(',')).sort().join(' ');
  const ket = (ps) => `${ps.length} titik, x ${rentang(ps, 'x').map((v) => v.toFixed(2))}, y ${rentang(ps, 'y').map((v) => v.toFixed(2))}`
    + `, z ${rentang(ps, 'z').map((v) => v.toFixed(2))}`;
  const pasang = (v) => { H.MOD.gordenLepas = v; };
  const pergi = () => panel('perabot').every((p) => p.y > 82);
  const zMaks = (n) => { const zs = []; for (let k = 0; k < n; k++) { bingkai(); zs.push(rentang(panel('dinamis'), 'z')[1]); } return zs; };
  const lebar = (v) => Math.max(...v) - Math.min(...v);
  const semua = [];

  // --- biasa: panel kiri di grup perabot, grup dinamis tanpa kain gorden
  bingkai(2);
  const perabot0 = panel('perabot');
  cek(rentang(perabot0, 'y')[0] < 38.01 && !panel('dinamis').length,
    'kontrol: bendera padam — panel kiri statis di grup perabot (sampai tinggi 38), grup dinamis tanpa kain gorden',
    'perabot ' + ket(perabot0) + '; dinamis ' + ket(panel('dinamis')));

  // --- angin: mengembang bertahap lalu bergoyang ke depan
  pasang('angin');
  bingkai();
  const awal = panel('dinamis');
  bingkai(30);
  const kibar = panel('dinamis'), [, zK] = rentang(kibar, 'z'), [, xK] = rentang(kibar, 'x'), [yK] = rentang(kibar, 'y');
  semua.push(awal, kibar);
  cek(pergi(), "'angin': panel kiri pindah dari grup perabot (yang tersisa di sana cuma rumbai lambrequin di atas 82)", ket(panel('perabot')));
  cek(kibar.length > 0 && zK > 102.4 + 4 && xK > 184 + 1 && yK > 38 + 2,
    "'angin': lipatannya mengembang di grup dinamis — maju > 4 ke depan, melebar ke kaca, ujung bawah terangkat", ket(kibar));
  cek(awal.length > 0 && rentang(awal, 'z')[1] < 102.4 + 2.5,
    "'angin': peralihannya bertahap — frame pertama baru sedikit maju", 'frame 1: ' + ket(awal));
  const goyang = zMaks(6);
  cek(lebar(goyang) > 0.5 && Math.min(...goyang) > 102.4 + 3,
    "'angin': kainnya bergoyang ke depan antar frame dan tetap di depan", 'z depan ' + goyang.map((v) => v.toFixed(2)).join(' '));
  for (const [nama, sakelar] of [['gerak dikurangi', (v) => { ctx.__uji.gerak.matches = v; }], ['mode ringan', (v) => { ctx.__uji.ringan = v; }]]) {
    sakelar(true);
    bingkai();
    const a = panel('dinamis'), diam = zMaks(3);
    bingkai();
    const b = panel('dinamis');
    sakelar(false);
    semua.push(a, b);
    cek(a.length > 0 && sidik(a) === sidik(b) && lebar(diam) < 1e-6 && rentang(a, 'z')[1] > 102.4 + 6,
      `'angin' + ${nama}: pose mengembang penuh yang statis — tanpa ayunan`, ket(a) + '; z depan ' + diam.map((v) => v.toFixed(2)).join(' '));
  }

  // --- lepas kait: melorot miring dari kait luar, menjuntai ke depan, diam
  pasang(true);
  bingkai(40);
  const lorot = panel('dinamis'), diX = (x) => lorot.filter((p) => Math.abs(p.x - x) < 0.01);
  const luar = rentang(diX(178), 'y')[1], dalam = rentang(diX(184), 'y')[1], zDalam = rentang(diX(184), 'z')[1];
  semua.push(lorot);
  cek(pergi() && Math.abs(luar - 86) < 0.01 && dalam < 86 - 12 && rentang(lorot, 'y')[0] < 38.01,
    'lepas kait: kolom luar masih tergantung di kaitnya (86), kolom sisi kaca melorot > 12, kainnya tetap menjuntai sampai bawah',
    `puncak luar ${luar.toFixed(2)}, dalam ${dalam.toFixed(2)}; ${ket(lorot)}`);
  cek(zDalam > 101.7 + 2, 'lepas kait: ujung yang melorot condong ke depan dari garis ikat', 'z depan kolom sisi kaca ' + zDalam.toFixed(2));
  bingkai(3);
  cek(sidik(panel('dinamis')) === sidik(lorot), 'lepas kait: tanpa ayunan — menjuntai diam sampai dikaitkan lagi');

  // --- padam: kembali pelan, lalu persis ke grup perabot
  pasang(false);
  bingkai();
  const pulang = panel('dinamis');
  bingkai(40);
  cek(pulang.length > 0 && !panel('dinamis').length && sidik(panel('perabot')) === sidik(perabot0),
    'bendera padam: frame pertama panelnya masih kembali di grup dinamis, lalu persis ke grup perabot semula',
    `pulang ${ket(pulang)}; perabot ${ket(panel('perabot'))} vs ${ket(perabot0)}; dinamis ${ket(panel('dinamis'))}`);
  cek(semua.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) && !galat.length,
    'frame-frame uji gorden: semua titik hingga, tanpa galat', galat.join(' | '));

  // --- 2D: drawWindow membaca bendera yang sama (ctx palsu ketat)
  const J = JSON.parse(jalankan(ctx, 'JSON.stringify(JENDELA)'));
  const rekam2D = (kode) => {
    const k = buatCtxPalsu({ ketat: true }), isi = [], fr = k.fillRect;
    k.fillRect = function (...a) { isi.push([...a, String(k.fillStyle)]); return fr.apply(this, a); };
    ctx.__k2 = k;
    let g = '';
    try { jalankan(ctx, kode); } catch (e) { g = e.message; }
    return { g, isi };
  };
  const lukis2D = (nilai, tiga = false) => {
    pasang(nilai);
    const { g, isi } = rekam2D(`TIGA.aktif = ${tiga}; try { gambarKe(__k2, () => drawWindow(false)); } finally { TIGA.aktif = true; }`);
    pasang(false);
    const kain = isi.filter(([x, y, , , c]) => x < J.x && y >= J.y - 2 && KAIN.includes(c));
    const kolom = [0, 1, 2, 3, 4, 5].map((i) => J.x - 8 + i);
    return { g, kain,
      puncak: kolom.map((cx) => Math.min(...kain.filter(([x, , w]) => x <= cx && cx < x + w).map(([, y]) => y))),
      kanan: Math.max(...kain.map(([x, , w]) => x + w)), dasar: Math.max(...kain.map(([, y, , h]) => y + h)) };
  };
  const d0 = lukis2D(false), dK = lukis2D(true), dA = lukis2D('angin');
  const teks2D = (d) => d.g || `puncak ${d.puncak.join('/')}, kanan ${d.kanan}, dasar ${d.dasar}`;
  cek(!d0.g && d0.puncak.every((y) => y === J.y - 2) && d0.kanan === J.x - 2 && d0.dasar === J.y + J.h + 4,
    'kontrol 2D: bendera padam — panel kiri drawWindow utuh selebar 6 dari kait sampai bawah', teks2D(d0));
  cek(!dK.g && dK.puncak[0] === J.y - 2 && dK.puncak.every((y, i) => !i || y > dK.puncak[i - 1])
    && dK.puncak[5] - dK.puncak[0] >= 12 && dK.dasar === J.y + J.h + 4,
    '2D lepas kait: kolom luar masih di kaitnya, makin ke kaca makin melorot (miring), kainnya tetap sampai bawah', teks2D(dK));
  cek(!dA.g && dA.kanan > J.x - 2 + 2 && dA.dasar < J.y + J.h + 4 && dA.puncak.every((y) => y === J.y - 2),
    "2D 'angin': lipatan di bawah ikat melambai ke kaca dan ujungnya terangkat (pose gerak dikurangi)", teks2D(dA));
  const t0 = lukis2D(false, true), tL = lukis2D(true, true);
  cek(!t0.g && !tL.g && t0.kain.length > 0 && !tL.kain.length,
    'pelukis dinding 3D: panel kiri yang lepas tidak dilukis ke tekstur dinding (benda dinamis sendiri); bendera padam tetap dilukis',
    `padam ${t0.kain.length} fillRect kain, lepas ${tL.kain.length}`);

  // --- event: kapan benderanya menyala & padam, dan tidak ada kain dobel
  const jalanEvent = (id, umur) => {
    const def = H.eventById.get(id), E = buatE(def), jejak = [];
    if (def.mulai) def.mulai(E, S);
    for (const u of umur) {
      jalankan(ctx, 'resetMod()');
      E.umur = u;
      def.tick(E, 0.1, S);
      jejak.push(H.MOD.gordenLepas);
    }
    jalankan(ctx, 'resetMod()');
    for (const a of E.aktor) { a.eventKerja = null; a.pose = null; }
    return { E, jejak: JSON.stringify(jejak) };
  };
  const eKait = jalanEvent('gorden-lepas-kait', [1, 8.5, 13.9, 14.1, 15, 25]);
  cek(eKait.jejak === '[true,true,true,false,false,false]',
    'gorden-lepas-kait: bendera true sampai dikaitkan lagi (14 dtk), lalu padam sampai event selesai — tidak ditulis ulang tick', eKait.jejak);
  const eAngin = jalanEvent('angin-kencang-gorden', [0.5, 3, 5.9, 6.1, 20]);
  cek(eAngin.jejak === '["angin","angin","angin",false,false]',
    "angin-kencang-gorden: bendera 'angin' selama 6 dtk pertama", eAngin.jejak);
  eKait.E.umur = 5;
  H.eventHidup.length = 0;
  H.eventHidup.push(eKait.E);
  const dinding = rekam2D('gambarKe(__k2, () => gambarLapis("gambarDinding"))');
  H.eventHidup.length = 0;
  const dobel = dinding.isi.filter(([x, y, w, h]) => x < J.x - 2 && x + w > J.x - 8 && y < J.y + 12 && y + h > J.y - 8);
  cek(!dinding.g && !dobel.length,
    'gorden-lepas-kait tidak lagi melukis kain melorot di gambarDinding (2D tertimbun ceruk, 3D dobel di balik panel)',
    dinding.g || dobel.map((a) => a.join(',')).join(' | '));
}

// ------------------------------------------------------------------ 29
/* Bayangan kontak (bayangKontak/kontakOrang/tinggiPijak) dan bahu lembut
   (bahu() di FS). Seperti bagian 18: WebGL2 palsu yang mencatat isi
   penyangga dibungkus supaya program melaporkan uniform cahaya & uBahu saja,
   lokasinya membawa namanya, dan nilainya disalin; ringanAktif & matchMedia
   dibayangi parameter untuk ruang3d.js saja (ringan = peta bayangan mati).
   Gerak dikurangi menyala: duduk/bangkit & hadap langsung sampai. Cakram
   dikenali dari rgb-nya (#20301f, warna elips bayangan kaki 2D, tidak
   dipakai benda 3D lain); satu pegawai berpalet unik (bagian 15). Standby
   bawaan sandbox sudah lenyap di ambang (x -14): tanpa cakram. Bahu lembut
   dibaca dari teks FS — `float bahu(float x)` dijalankan sebagai JS (float →
   let) — dan cahaya muka atas/tegak dihitung dari uniform rekaman dengan
   rumus FS yang sama, tanpa bayangan (permukaan yang terkena cahaya kunci). */
{
  console.log(tebal('\n3D: bayangan kontak di kaki, bahu lembut cahaya siang'));
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined });
  jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
  const penyangga = new Map(), uni = {}, kendali = { ringan: true };
  const dasar = glPalsu(null, penyangga), AKTIF = ['uLangit', 'uTanah', 'uKunci', 'uArah', 'uLampuPos[0]', 'uLampuWarna[0]', 'uBahu'];
  const gl = new Proxy({}, {
    get(t, k) {
      if (k === 'getProgramParameter') return (p, q) => (q === dasar.ACTIVE_UNIFORMS ? AKTIF.length : true);
      if (k === 'getActiveUniform') return (p, i) => ({ name: AKTIF[i] });
      if (k === 'getUniformLocation') return (p, nama) => ({ nama });
      if (k === 'uniform4fv' || k === 'uniform3fv') return (loc, d) => { if (loc && loc.nama) uni[loc.nama] = Float32Array.from(d); };
      if (k === 'uniform1f') return (loc, v) => { if (loc && loc.nama) uni[loc.nama] = v; };
      return dasar[k];
    },
  });
  pasang3D(ctx, gl);
  ctx.__k29 = { ringan: () => kendali.ringan, media: (q) => ({ matches: /reduced-motion/.test(q), addEventListener() {} }) };
  const galat = [];
  const diam = (fn) => {
    const [e, w] = [console.error, console.warn];
    console.error = console.warn = (...a) => { galat.push(a.map(String).join(' ')); };
    try { return fn(); } finally { [console.error, console.warn] = [e, w]; }
  };
  diam(() => jalankan(ctx, '((ringanAktif, matchMedia) => {\n' + SRC_3D + '\n})(__k29.ringan, __k29.media)'));
  resetRuangan(ctx, buatPristine(ctx));
  H.eventHidup.length = 0;
  const setel = (jam) => { buatS(ctx, { jam, hujan: 0, petir: false, ramai: false }); jalankan(ctx, 'ambBasis = null'); };
  setel(12);
  const bingkai = () => diam(() => { penyangga.clear(); jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())'); });
  // titik (posisi, normal y, alfa) yang rgb-nya persis hex, dari frame terakhir, urut penyangganya
  const titik = (hex, saring = () => true) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hasil = [];
    for (const d of penyangga.values()) {
      for (let i = 0; i + 13 <= d.length; i += 13) {
        if (!(Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3)) continue;
        const p = { x: d[i], y: d[i + 1], z: d[i + 2], ny: d[i + 4], a: d[i + 9] };
        if (saring(p)) hasil.push(p);
      }
    }
    return hasil;
  };
  const KONTAK = '#20301f';
  // cakram frame ini: pusat & jari-jari kotak pembatasnya, tinggi, alfa inti & tepi, arah mukanya
  const cakram = () => {
    const ps = titik(KONTAK);
    if (!ps.length) return { n: 0, x: NaN, z: NaN, rx: NaN, rz: NaN, y: [], alfa: NaN, tepi: NaN, normalAtas: false, hadapAtas: false };
    const rentang = (k) => [Math.min(...ps.map((p) => p[k])), Math.max(...ps.map((p) => p[k]))];
    const [x0, x1] = rentang('x'), [z0, z1] = rentang('z');
    // luas bertanda di bidang (x, z): negatif = berlawanan jarum jam dilihat dari atas,
    // seperti tutup timbul() — lintasan pudar membuang muka punggung
    let hadapAtas = ps.length % 3 === 0;
    for (let i = 0; i + 2 < ps.length; i += 3) {
      const [p, q, r] = [ps[i], ps[i + 1], ps[i + 2]];
      if (!((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x) < 0)) hadapAtas = false;
    }
    return { n: ps.length, x: (x0 + x1) / 2, z: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2,
      y: [...new Set(ps.map((p) => +p.y.toFixed(3)))], alfa: Math.max(...ps.map((p) => p.a)), tepi: Math.min(...ps.map((p) => p.a)),
      normalAtas: ps.every((p) => p.ny === 1), hadapAtas };
  };
  const tulis = (c) => (c.n ? `${c.n} titik, pusat ${c.x.toFixed(2)}/${c.z.toFixed(2)}, jari ${c.rx.toFixed(2)}x${c.rz.toFixed(2)}, y ${c.y.join('/')}, alfa ${c.alfa.toFixed(3)}..${c.tepi.toFixed(3)}` : 'tanpa cakram');
  const sama = (p, q, d = 0.01) => Math.abs(p - q) < d;
  const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));

  bingkai();
  const kosong = cakram();
  const PAL = { main: '#5be0c9', pants: '#c95be0', skin: '#e0c95b' };      // tidak dipakai benda lain (bagian 15)
  const a = Object.assign(buatSatuOrang(ctx), { x: 100, y: 252, phase: 0, face: 'down', hadap: 'down' });
  a.pal = Object.assign({}, a.pal, PAL);
  ctx.__orangUji = a;
  jalankan(ctx, 'agents.set("uji-kontak", __orangUji)');
  const [SEPATU, LANE_DOWN, MKX, MKY, BACA] = JSON.parse(jalankan(ctx, 'JSON.stringify([SEPATU, LANE_DOWN, MEJA_KERJA_X[0], MEJA_KERJA_Y, BACA])'));
  // alfa badan (baju palet uji) di frame terakhir
  const alfaBadan = () => { const b = titik(PAL.main); return b.length ? b[0].a : NaN; };

  bingkai();
  const berdiri = cakram();
  cek(kosong.n === 0 && berdiri.n > 0 && berdiri.n % 9 === 0,
    'bayangan kontak: satu cakram muncul bersama pegawai yang berdiri (kontrol: tanpa orang yang tampak, tidak ada)', `kosong ${tulis(kosong)}; berdiri ${tulis(berdiri)}`);
  cek(sama(berdiri.x, a.x) && sama(berdiri.z, a.y) && berdiri.y.length === 1 && berdiri.y[0] > 0.05 && berdiri.y[0] < 0.15
    && berdiri.normalAtas && berdiri.hadapAtas,
    'cakram di lantai tepat di bawah kakinya: berpusat di titik kaki, di atas garis nat (0,05) & di bawah petak silau (0,15), menghadap atas', tulis(berdiri));
  // sol tiap sepatu (titik sepatu terendah di dekatnya): pusatnya di inti pekat elips
  const sol = titik(SEPATU, (p) => Math.abs(p.x - a.x) < 14 && Math.abs(p.z - a.y) < 16 && p.y < 0.5);
  const jariSol = [-1, 1].map((s) => {
    const ps = sol.filter((p) => Math.sign(p.x - a.x) === s);
    if (!ps.length) return NaN;
    const cx = ps.reduce((t, p) => t + p.x, 0) / ps.length, cz = ps.reduce((t, p) => t + p.z, 0) / ps.length;
    return Math.hypot((cx - berdiri.x) / berdiri.rx, (cz - berdiri.z) / berdiri.rz);
  });
  cek(jariSol.every((r) => r < 0.5), 'kedua sol sepatunya di inti pekat cakram (jari-jari ternormal < 0,5)', jariSol.map(f3).join(', '));
  cek(berdiri.alfa > 0.18 && berdiri.alfa < 0.45 && berdiri.tepi === 0,
    'mode ringan (peta bayangan mati): intinya lebih pekat dari elips 2D (0,18 rata), tepinya landai sampai bening', tulis(berdiri));

  kendali.ringan = false;
  bingkai();
  const nyala = cakram();
  kendali.ringan = true;
  cek(nyala.n === berdiri.n && sama(nyala.rx, berdiri.rx) && sama(nyala.rz, berdiri.rz) && nyala.alfa > 0 && nyala.alfa < 0.5 * berdiri.alfa,
    'peta bayangan menyala: cakram yang sama jauh lebih tipis (< separuh mode ringan) — tidak menggelapkan dua kali',
    `ringan ${f3(berdiri.alfa)}, nyala ${f3(nyala.alfa)}`);

  a.angkat = 10;
  bingkai();
  const angkat = cakram();
  a.angkat = 0;
  a.slotY = 252; a.y = 248;                         // senam Jumat: 4 di atas slotY = loncat
  bingkai();
  const lompat = cakram();
  a.slotY = null; a.y = 252;
  const kecil = (c) => c.n > 0 && sama(c.y[0], berdiri.y[0]) && c.y.length === 1 && c.rx < berdiri.rx && c.rz < berdiri.rz && c.alfa < berdiri.alfa;
  cek(kecil(angkat) && kecil(lompat) && sama(lompat.z, 252) && lompat.alfa > angkat.alfa,
    'terangkat (a.angkat 10, loncatan senam): cakramnya tetap di lantai, mengecil & menipis — makin tinggi makin tipis',
    `angkat ${tulis(angkat)}; lompat ${tulis(lompat)}; berdiri ${tulis(berdiri)}`);

  a.rebah = Math.PI / 2;
  bingkai();
  const rebah = cakram();
  a.rebah = 0;
  cek(rebah.x > a.x + 10 && rebah.rx > 2.5 * berdiri.rx && sama(rebah.rz, berdiri.rz) && sama(rebah.alfa, berdiri.alfa, 1e-3),
    'rebah (ditekel): cakramnya memanjang sepanjang badan yang terkapar ke +x, seperti elips 2D-nya', tulis(rebah));

  a.standby = true;
  bingkai();
  const standby = cakram(), alfaStandby = alfaBadan();
  a.standby = false;
  a.x = -4; a.y = LANE_DOWN;
  bingkai();
  const ambang = cakram(), alfaAmbang = alfaBadan(), badanAmbang = titik(PAL.main);
  cek(sama(alfaStandby, 0.55) && sama(standby.alfa, berdiri.alfa * alfaStandby, 1e-3)
    && alfaAmbang > 0.1 && alfaAmbang < 0.9 && sama(ambang.alfa, berdiri.alfa * alfaAmbang, 1e-3),
    'cakramnya sepudar badannya: standby 0,55, memudar di ambang pintu samping',
    `standby badan ${f3(alfaStandby)} cakram ${f3(standby.alfa)}; ambang badan ${f3(alfaAmbang)} cakram ${f3(ambang.alfa)}`);
  cek(ambang.n > 0 && sama(ambang.x, tengahX(badanAmbang), 0.3) && ambang.y[0] > 0.35 && ambang.y[0] < 0.5,
    'di ambang: ikut badannya yang digeser ke teras, di atas plat ambang (0,35), tidak tenggelam di bawahnya',
    `${tulis(ambang)}; badan x ${f3(tengahX(badanAmbang))}`);

  a.x = 200; a.y = 230;                              // di atas karpet merah meja rapat
  bingkai();
  const karpet = cakram();
  cek(karpet.n > 0 && karpet.y[0] > 0.8 && karpet.y[0] < 0.95 && sama(karpet.x, 200),
    'di karpet meja rapat yang timbul: cakramnya di atas karpet (0,8), bukan di lantai di bawahnya', tulis(karpet));

  Object.assign(a, { x: MKX, y: MKY, station: 'think', face: 'up', hadap: 'up' });
  bingkai();
  const duduk = cakram();
  a.station = 'idle';
  bingkai();
  const bangkit = cakram();
  Object.assign(a, { x: BACA.slot[1], y: BACA.titikY, pose: 'dudukLantai' });
  bingkai();
  const lesehan = cakram();
  a.pose = null;                                     // rutinitas baca: sedetik menegakkan badan di bantal
  bingkai();
  const diBantal = cakram();
  cek(duduk.n === 0 && lesehan.n === 0,
    'yang duduk tidak bercakram: kursi meja kerja & bantal lesehan sudah menapak', `meja kerja ${tulis(duduk)}; lesehan ${tulis(lesehan)}`);
  cek(bangkit.n > 0 && sama(bangkit.x, MKX) && diBantal.n > 0 && diBantal.y[0] > 3.5 && diBantal.y[0] < 3.65,
    'kontrol: di titik yang sama tapi berdiri, cakramnya ada — di bantal lesehan di atas bantalnya (3,5)',
    `meja kerja ${tulis(bangkit)}; bantal ${tulis(diBantal)}`);

  jalankan(ctx, 'agents.delete("uji-kontak")');
  H.eventHidup.push(buatE(H.eventById.get('kucing-tidur-di-karpet')));
  bingkai();
  const kucing = cakram();
  H.eventHidup.length = 0;
  cek(kucing.n > 0 && kucing.y[0] > 0.8 && kucing.y[0] < 0.95 && Math.hypot(kucing.x - 242, kucing.z - 246) < 3 && sama(kucing.alfa, berdiri.alfa, 1e-3),
    'kucing tidur di karpet: cakram di bawah badannya yang meringkuk, di atas karpet', tulis(kucing));

  // --- bahu lembut: fungsi FS sungguhan, dijalankan sebagai JS
  const FS = (SRC_3D.match(/const FS = `([\s\S]*?)`;/) || [])[1] || '';
  const tubuhBahu = (FS.match(/float bahu\(float x\) \{([\s\S]*?)\r?\n\}/) || [])[1];
  let bahu = () => NaN;
  try { if (tubuhBahu) bahu = new Function('x', 'uBahu', tubuhBahu.replace(/\bfloat\b/g, 'let')); } catch { /* bukan JS lagi: semua cek di bawah merah */ }
  const ambangBahu = uni.uBahu;
  cek(ambangBahu > 0.5 && ambangBahu < 1 && ambangBahu === jalankan(ctx, 'RUANG3D.bahu && RUANG3D.bahu.ambang'),
    'uniform uBahu tiap frame = RUANG3D.bahu.ambang (pintu konsol untuk membandingkan), dan aktif (< 1)', String(ambangBahu));
  cek(/terang = vec3\(bahu\(terang\.r\), bahu\(terang\.g\), bahu\(terang\.b\)\);/.test(FS)
    && /vec3 rgb = mix\(terang, dasar, clamp\(vEmisi, 0\.0, 1\.0\)\);/.test(FS),
    'FS: bahu cuma di bagian yang diterangi — yang memancar (vEmisi 1) tetap warna dasarnya persis');
  const kurva = [];
  for (let i = 0; i <= 1600; i++) kurva.push([i / 1000, bahu(i / 1000, ambangBahu)]);
  const naikLandai = kurva.every(([, y], i) => !i || (y - kurva[i - 1][1] >= 0 && y - kurva[i - 1][1] <= 0.001 + 1e-9));
  cek(kurva.every(([x, y]) => x > ambangBahu || y === x) && naikLandai && kurva.every(([, y]) => y <= 1) && bahu(2 - ambangBahu, ambangBahu) === 1,
    `bahu(): apa adanya sampai ambang ${ambangBahu}, lalu naik landai (kemiringan 1 → 0, tak pernah turun) sampai tepat 1 di ${(2 - ambangBahu).toFixed(2)}`,
    kurva.filter((_, i) => i % 100 === 0).map(([x, y]) => x.toFixed(1) + '→' + (+y).toFixed(4)).join(' '));
  cek(kurva.every(([x]) => bahu(x, 1) === Math.min(x, 1)), 'ambang 1 = potong keras seperti dulu (mudah dicabut)');

  // --- terukur: cahaya FS dari uniform rekaman, di lantai tengah (330, 0, 250)
  cek(/vec3 cahaya = mix\(uTanah, uLangit, n\.y \* 0\.5 \+ 0\.5\);/.test(FS) && /cahaya \+= uKunci \* max\(dot\(n, uArah\), 0\.0\) \* bayang\(\);/.test(FS)
    && /uLampuWarna\[i\] \* \(0\.35 \+ 0\.65 \* max\(dot\(n, d \/ jarak\), 0\.0\)\) \* redam;/.test(FS),
    'rumus cahaya FS (belahan + kunci + 16 lampu titik) = rumus ukur uji ini');
  const cahaya = (n, pos) => {
    if (!AKTIF.every((k) => uni[k] != null)) return [NaN, NaN, NaN];
    const t = n[1] * 0.5 + 0.5, dk = Math.max(0, n[0] * uni.uArah[0] + n[1] * uni.uArah[1] + n[2] * uni.uArah[2]);
    const c = [0, 1, 2].map((i) => uni.uTanah[i] + (uni.uLangit[i] - uni.uTanah[i]) * t + uni.uKunci[i] * dk);
    const P = uni['uLampuPos[0]'], L = uni['uLampuWarna[0]'];
    for (let j = 0; j < 16; j++) {
      const d = [0, 1, 2].map((i) => P[j * 4 + i] - pos[i]), jarak = Math.max(Math.hypot(...d), 0.001);
      const redam = 1 / (1 + jarak * jarak * P[j * 4 + 3]), nd = Math.max(0, (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / jarak);
      for (let i = 0; i < 3; i++) c[i] += L[j * 3 + i] * (0.35 + 0.65 * nd) * redam;
    }
    return c;
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [TILE, KERTAS, KREM] = JSON.parse(jalankan(ctx, 'JSON.stringify([P.tile, P.paper, P.cream])')).map(rgb);
  const kali = (w, c) => w.map((v, i) => v * c[i]), teks = (v) => v.map((x) => x.toFixed(3)).join('/');
  setel(12); bingkai();
  const LANTAI = [330, 0, 250], atas = cahaya([0, 1, 0], LANTAI), depan = cahaya([0, 0, 1], LANTAI);
  cek(atas[0] / depan[0] > 1.15 && atas[0] / depan[0] < 1.35 && depan.every((v) => v > 0.9 && v < 1.05),
    `pukul 12: muka atas menerima ${teks(atas)}, muka tegak ${teks(depan)} (≈ 2D) — ${(atas[0] / depan[0]).toFixed(2)}x`);
  const ubin = kali(TILE, atas), kertas = kali(KERTAS, atas);
  const potong = (v) => v.map((x) => Math.min(x, 1)), lembut = (v) => v.map((x) => bahu(x, ambangBahu));
  cek([ubin, kertas].every((v) => potong(v)[0] === 1 && potong(v)[1] === 1),
    `kontrol (potong keras lama): ubin terazo ${teks(ubin)} dan kertas ${teks(kertas)} sama-sama terpotong putih di r/g`);
  cek(lembut(ubin).every((x) => x < 1) && lembut(kertas).every((x, i) => x - lembut(ubin)[i] >= 2 / 255),
    'bahu lembut: ubin tidak lagi terpotong, kertas tetap lebih terang darinya di tiap kanal (≥ 2/255)',
    `ubin ${teks(lembut(ubin))}, kertas ${teks(lembut(kertas))}`);
  const krem = kali(KREM, depan);
  cek(lembut(krem).every((x, i) => x >= 0.98 * krem[i]), 'muka tegak: krem dinding belakang nyaris tak tersentuh (turun < 2%)',
    `${teks(krem)} → ${teks(lembut(krem))}`);
  setel(20); bingkai();
  const ubinMalam = kali(TILE, cahaya([0, 1, 0], LANTAI));
  setel(12);
  cek(lembut(ubinMalam).every((x, i) => x === ubinMalam[i]), `pukul 20: ubin di muka atas ${teks(ubinMalam)} di bawah ambang — tidak berubah sebit pun`);
  cek(!galat.length, 'frame-frame uji kontak & bahu tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 30
/* Barang event & bekas ruangan gelombang ketiga. Konteks seperti nyalakan3D
   (window = global, supaya boneka tamu event tercatat lewat drawPerson),
   tapi WebGL2 palsunya `rekam`: nama wadah dibaca dari literal WADAH seperti
   bagian 9..12, jadi "di wadah yang tepat" bisa diperiksa — barang event di
   dinamis (MODEL_EVENT disusun tiap frame), bekas RUANGAN di perabot (yang
   cuma diunggah waktu tandaPerabot() berubah; isinya disimpan dari unggahan
   terakhir). Kartu: fillRect kanvas document selama gambarProp, lewat
   salinan def yang menandai diProp (seperti bagian 23); kontrolnya def yang
   SAMA dengan id lain — tanpa model — yang memang dilukis ke kartu. */
{
  console.log(tebal('\n3D: barang event & bekas ruangan gelombang ketiga'));
  const ctx = muatKonteks();
  const H = ctx.__jembatan__;
  ctx.__ctxPalsu.__kendali.ketat = false;
  Object.assign(ctx, { WeakMap, Proxy, Uint32Array, Uint8Array, Infinity, NaN, undefined });
  jalankan(ctx, 'globalThis.window = globalThis; globalThis.devicePixelRatio = 1');
  const rekam = { penyangga: [], unggah: [] }, galat = [];
  pasang3D(ctx, glPalsu(rekam));
  const logMuat = konsol(() => jalankan(ctx, SRC_3D));
  resetRuangan(ctx, buatPristine(ctx));
  const S = buatS(ctx, { jam: 12, hujan: 0, petir: false, ramai: false });
  H.eventHidup.length = 0;
  cek(jalankan(ctx, 'TIGA.aktif === true') && rekam.penyangga.length === NAMA_WADAH.length && !logMuat.length,
    'WebGL2 perekam menyala untuk uji gelombang ketiga, wadahnya terbaca dari literal WADAH',
    `penyangga ${rekam.penyangga.length} vs WADAH ${NAMA_WADAH.length}; ${logMuat.join(' | ')}`);
  const lukisan = [];
  let diProp = false;
  const buatAsli = ctx.document.createElement;
  ctx.document.createElement = (tag) => {
    const el = buatAsli(tag);
    if (String(tag).toLowerCase() !== 'canvas') return el;
    const k = el.getContext('2d'), fr = k.fillRect;
    k.fillRect = function (...a) { if (diProp) lukisan.push(String(k.fillStyle).toLowerCase()); return fr.apply(this, a); };
    return el;
  };
  const keKartu = (hex) => lukisan.filter((c) => hex.includes(c)).length;
  // satu frame 3D: nama wadah -> isi yang diunggah frame itu
  let wadah = new Map(), perabot = new Float32Array(0);
  const bingkai = () => {
    rekam.unggah.length = 0;
    const [e, w] = [console.error, console.warn];
    console.error = console.warn = (...a) => { galat.push(a.map(String).join(' ')); };
    try { jalankan(ctx, 'now += 100; TIGA.kamera(0.016); TIGA.gambar(new Set())'); } finally { [console.error, console.warn] = [e, w]; }
    const nama = new Map(rekam.penyangga.map((b, i) => [b, NAMA_WADAH[i]]));
    wadah = new Map(rekam.unggah.map(([b, d]) => [nama.get(b), d]));
    if (wadah.has('perabot')) perabot = wadah.get('perabot');
    return wadah;
  };
  // titik yang warna rgb-nya persis hex di satu isi wadah
  const titikDi = (d, hex, saring = () => true) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hasil = [];
    for (let i = 0; d && i + LANGKAH <= d.length; i += LANGKAH) {
      if (!(Math.abs(d[i + 6] - r) < 2e-3 && Math.abs(d[i + 7] - g) < 2e-3 && Math.abs(d[i + 8] - b) < 2e-3)) continue;
      const p = { x: d[i], y: d[i + 1], z: d[i + 2] };
      if (saring(p)) hasil.push(p);
    }
    return hasil;
  };
  const dinamis = (hex, saring) => titikDi(wadah.get('dinamis'), hex, saring);
  const diPerabot = (hex, saring) => titikDi(perabot, hex, saring);
  const ukuran = (ps) => {
    const u = { n: ps.length };
    for (const k of ['x', 'y', 'z']) {
      const v = ps.map((p) => p[k]);
      u[k + '0'] = Math.min(...v); u[k + '1'] = Math.max(...v);
    }
    return u;
  };
  const teks = (u) => (u.n ? `${u.n} titik, x ${u.x0.toFixed(2)}..${u.x1.toFixed(2)} y ${u.y0.toFixed(2)}..${u.y1.toFixed(2)} z ${u.z0.toFixed(2)}..${u.z1.toFixed(2)}` : 'tak ada titik');
  const kira = (a, b, t = 0.06) => Math.abs(a - b) < t;
  const sekitar = (x, z, r) => (p) => Math.hypot(p.x - x, p.z - z) < r;
  // satu event uji hidup; idLain: def yang sama TANPA model (kontrol kartu)
  const pasang = (id, data = {}, idLain = null) => {
    const asli = H.eventById.get(id);
    const def = { ...asli, id: idLain || id, gambarProp(E2, S2) { diProp = true; try { return asli.gambarProp.call(this, E2, S2); } finally { diProp = false; } } };
    const E = buatE(def);
    Object.assign(E.data, data);
    H.eventHidup.length = 0;
    H.eventHidup.push(E);
    lukisan.length = 0;
    return E;
  };
  const [DX, BX, TX] = JSON.parse(jalankan(ctx, 'JSON.stringify([pantriX(462), pantriX(424), pantriX(437) + 4.5])'));

  // --- kabel LAN lepas di rak server (x 417 y 66..77, sortY 119; tiang kanan x 414..418 z 116,5..120)
  const RAK = (p) => p.x > 411 && p.x < 424 && p.y > 36 && p.y < 74 && p.z > 118 && p.z < 124;
  bingkai();
  const lanAwal = dinamis('#3d7a4c', RAK).length;
  pasang('kabel-lan-lepas', { beres: false });
  bingkai();
  const lan = ukuran(dinamis('#3d7a4c', RAK)), lanBawah = ukuran(dinamis('#3d7a4c', (p) => RAK(p) && p.y < 50));
  const rj45 = ukuran(dinamis('#dfe4dc', RAK)), kartuLan = keKartu(['#3d7a4c']);
  cek(lanAwal === 0 && lan.n > 0 && kira(lan.y0, 42) && kira(lan.y1, 54) && kira(lanBawah.x0, 417) && kira(lanBawah.x1, 418) && lanBawah.z0 > 120,
    '3D kabel-lan-lepas: kabelnya voxel di wadah dinamis, menggantung lurus di MUKA tiang kanan (x 417, tinggi 42..54 = y 2D 78..66), tidak terbenam di tiang (z <= 120)',
    `tanpa event ${lanAwal}; kabel ${teks(lan)}; ujung bawah ${teks(lanBawah)}`);
  cek(rj45.n > 0 && kira(rj45.y0, 40.2) && rj45.z0 > 120 && !diPerabot('#3d7a4c', (p) => RAK(p) && p.z > 121).length,
    '3D kabel-lan-lepas: berkonektor di ujungnya, dan tidak ikut tercetak ke grup perabot', teks(rj45));
  cek(kartuLan === 0, '3D kabel-lan-lepas: gambarProp-nya tidak dilukis ke kanvas kartu', `${kartuLan} fillRect hijau kabel`);
  pasang('kabel-lan-lepas', { beres: true });
  bingkai();
  const lanBeres = dinamis('#3d7a4c', RAK).length;
  pasang('kabel-lan-lepas', { beres: false }, 'uji-kabel-tanpa-model');
  bingkai();
  const kontrolLan = keKartu(['#3d7a4c']), lanTanpaModel = dinamis('#3d7a4c', RAK).length;
  cek(lanBeres === 0 && kontrolLan > 0 && lanTanpaModel === 0,
    'kontrol: kabel yang sudah beres tak tergambar; gambarProp yang sama tanpa model tetap dilukis ke kartu (tanpa voxel)',
    `beres ${lanBeres} titik; tanpa model ${kontrolLan} fillRect ke kartu, ${lanTanpaModel} titik`);

  // --- kain penutup dispenser Ramadan (x DX..DX+18 y 254..288, sortY 300; dispenser z 280..290, baki tetes ke 290,6)
  const DISP = (p) => p.x > DX - 4 && p.x < DX + 22 && p.z > 270 && p.z < 305 && p.y < 60;
  pasang('ramadan-siang-sunyi');
  bingkai();
  const kain = ukuran(dinamis('#c9c3b0', DISP)), lipat = ukuran(dinamis('#b0a98e', DISP)), kartuKain = keKartu(['#c9c3b0', '#e2ddc8', '#b0a98e']);
  cek(kain.n > 0 && kain.x0 <= DX && kain.x1 >= DX + 18 && kira(kain.y0, 0) && kain.y1 >= 34 && kain.y1 < 36 && kain.z0 <= 280 && kain.z1 > 290.6 && kain.z1 < 293,
    '3D ramadan-siang-sunyi: kain menyelubungi kotak dispenser sampai baki tetesnya, dari lantai setinggi badannya — bukan kartu 10 di depan & 12 di atasnya',
    `kain ${teks(kain)}, dispenser x ${DX}..${DX + 18}`);
  cek(lipat.n > 0 && lipat.z0 >= kain.z1 - 0.01 && kira(lipat.x0, DX + 2) && kira(lipat.x1, DX + 13) && kira(lipat.y0, 4) && kira(lipat.y1, 30),
    '3D ramadan-siang-sunyi: tiga lipatan tegak di muka kainnya (pantriX(464) + i*5, y 2D 258..284)', teks(lipat));
  pasang('ramadan-siang-sunyi', {}, 'uji-kain-tanpa-model');
  bingkai();
  const kontrolKain = keKartu(['#c9c3b0', '#e2ddc8', '#b0a98e']);
  cek(kartuKain === 0 && kontrolKain > 0, '3D ramadan-siang-sunyi: gambarProp-nya tidak dilukis ke kartu (kontrol tanpa model: dilukis)',
    `${kartuKain} vs kontrol ${kontrolKain} fillRect kain`);

  // --- lifter: barbel di lantai pantri (barbelX = pantriX(424), kaki y 270), galon di tangannya
  const BARBEL = (p) => Math.abs(p.x - BX) < 12 && Math.abs(p.z - 266) < 6 && p.y < 10;
  pasang('lifter-singlet-merah-putih', { barbelX: BX });
  bingkai();
  const barbel = ukuran(dinamis('#22262c', BARBEL)), kilau = dinamis('#4a5058', BARBEL).length, kartuBarbel = keKartu(['#22262c', '#4a5058']);
  cek(barbel.n > 0 && kilau > 0 && kira(barbel.x0, BX - 10) && kira(barbel.x1, BX + 10) && kira(barbel.y0, 0, 0.01) && kira(barbel.y1, 8) && kira(barbel.z0, 262) && kira(barbel.z1, 270),
    '3D lifter: barbel voxel tergeletak di lantai pantri — dua piringan bergaris tengah 8 menapak lantai, x-10..x+10, tepi depannya di kaki 2D (z 270)',
    `barbel ${teks(barbel)}, x ${BX}`);
  pasang('lifter-singlet-merah-putih', { barbelX: BX }, 'uji-barbel-tanpa-model');
  bingkai();
  const kontrolBarbel = keKartu(['#22262c', '#4a5058']);
  cek(kartuBarbel === 0 && kontrolBarbel > 0, '3D lifter: barbelnya tidak dilukis ke kartu (kontrol tanpa model: dilukis)', `${kartuBarbel} vs kontrol ${kontrolBarbel}`);
  const Eg = pasang('lifter-singlet-merah-putih');
  H.eventById.get('lifter-singlet-merah-putih').mulai(Eg, S);
  const T = Eg.data.t;
  const galonDi = (x, y, diTangan = true) => {
    Object.assign(T, { x, y, wp: [], fase: 'letak', hadap: 'right', galonDiTangan: diTangan, barbelDiBahu: false });
    lukisan.length = 0;
    bingkai(); bingkai(); bingkai();
    return ukuran(dinamis('#7db8e8', sekitar(x + 10.5, y + 1, 8)));
  };
  const g1 = T ? galonDi(300, 270) : { n: 0 }, kartuGalon = keKartu(['#7db8e8', '#b8dcf4', '#5f9fd4']);
  const g2 = T ? galonDi(360, 300) : { n: 0 }, gLepas = T ? galonDi(360, 300, false) : { n: 1 };
  cek(g1.n > 0 && g2.n > 0 && kira(g2.x0 - g1.x0, 60, 0.3) && kira(g2.z0 - g1.z0, 30, 0.3) && kira(g1.y0, 28) && kira(g1.y1, 40)
    && g1.x0 > 300 && g1.x1 < 300 + 16 && gLepas.n === 0 && kartuGalon === 0,
    '3D lifter: galon di tangannya voxel di sisi badan setinggi kepala, ikut tamunya berpindah, hilang waktu dipasang; tidak dilukis ke kartu',
    `di (300, 270) ${teks(g1)} | di (360, 300) ${teks(g2)} | tidak di tangan ${gLepas.n} titik; ${kartuGalon} fillRect galon ke kartu`);

  // --- ember bocor: arsip r(93,130,9,7) sortY 137 & atap r(114,246,8,6) di lantai; rapat r(240,180,10,7)
  // sortY 187 di taplak (bocornya di atas meja; titik 2D-nya di 3D = dudukan kursi sisi jauh ke-0)
  // MEJA_RAPAT terkurung di IIFE ruang3d.js: dibaca dari literalnya
  const mejaRapat = SRC_3D.match(/const MEJA_RAPAT = \{ x0: (\d+), x1: (\d+), z0: (\d+), z1: (\d+), h: (\d+) \}/) || [];
  const MEJA_Z0 = +mejaRapat[3], MEJA_H = +mejaRapat[5];
  for (const [id, kunci, cx, cz, r, tinggi, dasar, tempat] of [['bocor-baru-di-atas-arsip', 'emberArsip', 97.5, 133.5, 4.7, 7, 0, 'di lantai'],
    ['bocor-baru-di-atas-rapat', 'emberRapat', 245, 216, 5.2, 7, MEJA_H, 'di taplak meja rapat, di x tetesnya, di pita kosong barang event'],
    ['atap-bocor-musim-hujan', 'emberKedua', 118, 249, 4.2, 6, 0, 'di lantai']]) {
    H.RUANGAN[kunci] = true;
    pasang(id);
    bingkai();
    const e = ukuran(dinamis('#4a7fd0', sekitar(cx, cz, 10))), bibir = dinamis('#79b0e8', sekitar(cx, cz, 10)).length, kartuEmber = keKartu(['#4a7fd0', '#79b0e8']);
    H.RUANGAN[kunci] = false;
    bingkai();
    const sesudah = dinamis('#4a7fd0', sekitar(cx, cz, 10)).length;
    cek(e.n > 0 && bibir > 0 && kira(e.x0, cx - r) && kira(e.x1, cx + r) && kira((e.z0 + e.z1) / 2, cz, 0.3) && kira(e.y0, dasar) && kira(e.y1, dasar + tinggi)
      && kartuEmber === 0 && sesudah === 0 && (!dasar || (e.z0 > MEJA_Z0 && e.z0 >= 209 && e.z1 <= 223)),
      `3D ${id}: ember tabung ${tempat} (${cx}, ${cz}), setinggi ${tinggi}, cuma selagi RUANGAN.${kunci}; tidak dilukis ke kartu`,
      `ember ${teks(e)}; ${kartuEmber} fillRect ke kartu; sesudah dikosongkan ${sesudah} titik`);
  }

  // --- bekas RUANGAN di luar persegi kulit perabot: grup perabot
  H.eventHidup.length = 0;
  const BEKAS0 = { kabelRapi: false, kartuAPAR: false, aparDiangkat: false, aparAngkat: 0, gelasDispenser: 6, tongPenuh: 0 };
  const ukur = (ubah = {}) => {
    Object.assign(H.RUANGAN, ubah);
    const d = bingkai().get('perabot');
    return d ? d.length / LANGKAH : null;
  };
  ukur(BEKAS0);
  const diam = ukur(), n0 = perabot.length / LANGKAH;
  cek(diam === null && n0 > 0, 'kontrol: tanpa perubahan RUANGAN grup perabot tidak dibangun ulang', `frame kedua ${diam}, isi ${n0} titik`);

  // kabel UTP: [warna, y 2D pangkal, panjang menjuntai, panjang rapi]
  const KABEL = [['#3d7a4c', 50, 24, 14], ['#3565b0', 53, 20, 12], ['#c9a03a', 56, 16, 10]];
  const kabel = () => KABEL.map(([hex, ky]) => {
    const ps = diPerabot(hex, RAK);
    return { hex, semua: ukuran(ps), juntai: ukuran(ps.filter((p) => p.y < 120 - ky - 1.5)) };
  });
  const klem = () => ukuran(diPerabot('#4a5058', RAK));
  const kusut = kabel(), klemKusut = klem();
  cek(kusut.every((k, i) => k.semua.n > 0 && kira(k.semua.y0, 120 - KABEL[i][1] - KABEL[i][2]) && kira(k.semua.y1, 120 - KABEL[i][1])
    && k.juntai.x1 - k.juntai.x0 >= 3 && k.juntai.z0 > 120 && k.semua.x0 < 414) && klemKusut.n === 0
    && !dinamis('#3565b0', RAK).length,
    '3D bekas kabel UTP rak server: tiga kabel voxel di wadah perabot, menjuntai berkelok di muka tiang kanan sepanjang lukisan 2D, pangkalnya masuk ke rak, tanpa klem',
    kusut.map((k) => `${k.hex} ${teks(k.semua)} / juntai ${teks(k.juntai)}`).join(' | ') + `; klem ${teks(klemKusut)}`);
  const nRapi = ukur({ kabelRapi: true }), rapi = kabel(), klemRapi = klem();
  cek(nRapi !== null && rapi.every((k, i) => kira(k.semua.y0, 120 - KABEL[i][1] - KABEL[i][3]) && kira(k.juntai.x1 - k.juntai.x0, 1))
    && klemRapi.n > 0 && kira(klemRapi.y0, 69, 0.1) && kira(klemRapi.y1, 71, 0.1),
    '3D bekas kabelRapi: grup perabot dibangun ulang — kabelnya lurus & memendek, klem pengikat terpasang (y 2D 49..51)',
    `${nRapi} titik; ` + rapi.map((k) => `${k.hex} ${teks(k.semua)} / juntai ${teks(k.juntai)}`).join(' | ') + `; klem ${teks(klemRapi)}`);
  const nKusut = ukur({ kabelRapi: false });
  cek(nKusut === n0, '3D bekas kabelRapi dicabut: kabel menjuntai lagi, geometri perabot kembali persis', `${n0} vs ${nKusut}`);

  // kartu inspeksi APAR (APAR dinamis: tabung x 331..339 z 108..116)
  const APAR = (p) => p.x > 329 && p.x < 347 && p.z > 107 && p.z < 117 && p.y < 40;
  const kartuApar = () => ukuran(diPerabot('#e8cf6a', APAR));
  const tanpaKartu = kartuApar();
  const nKartu = ukur({ kartuAPAR: true }), k1 = kartuApar(), mano = diPerabot('#3e6b4f', APAR).length;
  const tabungApar = ukuran(dinamis('#b02a2a', APAR)), kartuDinamis = dinamis('#e8cf6a', APAR).length;
  cek(tanpaKartu.n === 0 && nKartu !== null && nKartu > n0 && k1.n > 0 && mano > 0 && kartuDinamis === 0
    && kira(k1.x0, 339.2) && kira(k1.x1, 345) && kira(k1.y0, 9.2) && kira(k1.y1, 17) && k1.x0 >= tabungApar.x1 - 0.01,
    '3D bekas kartuAPAR: kartu kuning (x 339..345, y 2D 101..109) bermanometer tergantung di sisi kanan APAR, voxel di wadah perabot',
    `kartu ${teks(k1)}, manometer ${mano} titik, APAR ${teks(tabungApar)}; di dinamis ${kartuDinamis}`);
  const nAngkat = ukur({ aparAngkat: 6 }), k2 = kartuApar();
  const nDiangkat = ukur({ aparAngkat: 0, aparDiangkat: true }), k3 = kartuApar();
  const nKembali = ukur({ aparDiangkat: false }), k4 = kartuApar();
  cek(nAngkat !== null && kira(k2.y0, 15.2) && kira(k2.y1, 23) && nDiangkat !== null && k3.n === 0 && nKembali === nKartu && kira(k4.y0, 9.2),
    '3D bekas kartuAPAR: ikut APAR-nya terangkat (aparAngkat 6), hilang selagi APAR-nya dibawa keliling (aparDiangkat), lalu kembali',
    `angkat ${teks(k2)} | diangkat ${teks(k3)} | kembali ${teks(k4)}`);
  const nTanpaKartu = ukur({ kartuAPAR: false });
  cek(nTanpaKartu === n0 && kartuApar().n === 0, '3D bekas kartuAPAR dicabut: geometri perabot kembali persis', `${n0} vs ${nTanpaKartu}`);

  // menara gelas kertas di atas tutup galon (tabung galon 34..45, tutup 45..48)
  const GELAS = (p) => Math.abs(p.x - (DX + 9)) < 3 && Math.abs(p.z - 285) < 3 && p.y > 30;
  const gelas = () => ukuran(['#f2f0e6', '#e4e0d2'].flatMap((h) => diPerabot(h, GELAS)));
  const enam = gelas(), gelasDinamis = dinamis('#e4e0d2', GELAS).length;
  const nDua = ukur({ gelasDispenser: 2 }), dua = gelas();
  jalankan(ctx, 'MOD.galonLepas = true');
  const nLepas = ukur(), lepas = gelas();
  jalankan(ctx, 'MOD.galonLepas = false');
  const nNol = ukur({ gelasDispenser: 0 }), nol = gelas();
  const nEnam = ukur({ gelasDispenser: 6 });
  cek(enam.n > 0 && gelasDinamis === 0 && kira(enam.y0, 48) && kira(enam.y1, 60) && enam.x1 - enam.x0 < 4.5,
    '3D bekas gelasDispenser: menara 6 gelas kertas voxel (wadah perabot) di atas tutup galon, segaris sumbunya', `gelas ${teks(enam)}`);
  cek(nDua !== null && kira(dua.y1, 52) && nLepas !== null && kira(lepas.y0, 34) && kira(lepas.y1, 38) && nNol !== null && nol.n === 0 && nEnam === n0,
    '3D bekas gelasDispenser: tinggi menara ikut sisa gelasnya (2: sampai 52, 0: habis), galon dicabut: di kepala dispenser; diisi ulang kembali persis',
    `2 gelas ${teks(dua)} | galon lepas ${teks(lepas)} | 0 gelas ${teks(nol)} | ${n0} vs ${nEnam}`);

  // isi tong sampah pantri yang menyembul (tong: tabung r 5 setinggi 11 di (TX, 283))
  const TONG = (p) => Math.hypot(p.x - TX, p.z - 283) < 9 && p.y > 9.5 && p.y < 20;
  const isiTong = () => Object.fromEntries(['#f2f0e6', '#d9b96a', '#c9cdd1'].map((h) => [h, diPerabot(h, TONG)]));
  const jariTong = (o) => Math.max(0, ...Object.values(o).flat().map((p) => Math.hypot(p.x - TX, p.z - 283)));
  const tongKosong = Object.values(isiTong()).flat().length;
  const nPenuh = ukur({ tongPenuh: 1 }), penuh = isiTong(), uPenuh = ukuran(Object.values(penuh).flat());
  const nSedikit = ukur({ tongPenuh: 0.3 }), sedikit = isiTong();
  const nSama = ukur({ tongPenuh: 0.33 });
  const nTong0 = ukur({ tongPenuh: 0 });
  cek(tongKosong === 0 && nPenuh !== null && Object.values(penuh).every((ps) => ps.length > 0) && kira(uPenuh.y0, 10) && kira(uPenuh.y1, 14.2)
    && jariTong(penuh) < 5,
    '3D bekas tongPenuh: isi tong menyembul dari tutupnya (voxel wadah perabot, di dalam jari-jari tong)', `penuh ${teks(uPenuh)}, jari-jari terjauh ${jariTong(penuh).toFixed(2)}`);
  cek(nSedikit !== null && sedikit['#c9cdd1'].length === 0 && sedikit['#d9b96a'].length > 0 && nSama === null && nTong0 === n0,
    '3D bekas tongPenuh: 0,3 = dua bungkus (ceil x5), 0,33 tidak membangun ulang (tanda sama), diangkut kembali persis',
    `0,3: ${Object.values(sedikit).map((ps) => ps.length).join('/')} titik, 0,33 ${nSama}, kosong ${nTong0} vs ${n0}`);

  // semuanya sekaligus, lalu kosong lagi
  const nSemua = ukur({ kabelRapi: true, kartuAPAR: true, gelasDispenser: 3, tongPenuh: 0.7 }), nAkhir = ukur(BEKAS0);
  cek(nSemua !== null && nSemua !== n0 && nAkhir === n0, '3D bekas ruangan: keempatnya sekaligus membangun ulang, dikosongkan kembali ke geometri semula',
    `semua ${nSemua}, kosong ${nAkhir} vs ${n0}`);
  cek(!galat.length, 'frame-frame uji gelombang ketiga tanpa galat', galat.join(' | '));
}

// ------------------------------------------------------------------ 31
/* Spanduk tema kalender: kainnya dibangun dari spandukTema() (registri TEMA
   di room.js). Dulu ruang3d.js menyimpan daftar id sendiri — tema berspanduk
   baru di room.js tampil di 2D tapi di 3D cuma lukisan datar di tembok,
   tanpa kain, tali, dan paku. Diukur dari isi wadah temaDinding (kain yang
   memakai tekstur dinding) di frame yang membangun ulang grup perabot. */
{
  console.log(tebal('\n3D: spanduk tema kalender dari registri TEMA'));
  const U = muat3D();
  const { H } = U;
  cek(U.siap, 'WebGL2 perekam menyala untuk uji spanduk tema', U.ket);
  const kain = (tema) => {
    H.RUANGAN.tema = tema;
    H.RUANGAN.temaTahun = 2026;
    const d = U.satuFrame().get('temaDinding');
    return d ? d.length / LANGKAH : 0;
  };
  const n = {};
  const log = konsol(() => {
    for (const t of [null, 'korpri', 'hari-pahlawan', 'sumpah-pemuda', 'kesaktian-pancasila', null]) n[String(t)] = kain(t);
  });
  cek(n.korpri > 0 && n.null === 0 && !log.length, 'kontrol: spanduk HUT KORPRI berkain 3D, tanpa tema tidak ada kain',
    `korpri ${n.korpri}, tanpa tema ${n.null}; ${log.join(' | ')}`);
  cek(['hari-pahlawan', 'sumpah-pemuda', 'kesaktian-pancasila'].every((t) => n[t] === n.korpri),
    '3D spanduk: spanduk hari nasional berkain persis sebanyak HUT KORPRI', JSON.stringify(n));
}

console.log('');
if (gagal) {
  console.log(merah(tebal(gagal + ' pemeriksaan gagal')));
  process.exit(1);
}
console.log(hijau(tebal('semua lulus')));
