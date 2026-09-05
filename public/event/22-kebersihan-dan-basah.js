/* ==========================================================================
   KEBERSIHAN & LANTAI BASAH
   ==========================================================================
   Tiga usulan katalog yang semuanya divonis "mahal" karena alasan yang sama
   persis: masing-masing menuntut route() diberi PENGHALANG sementara supaya
   "semua orang terlihat memutar". Itu satu-satunya bagian yang tidak
   dikerjakan di sini, dan sengaja:

     * route() adalah SATU-SATUNYA penyusun jalur untuk seluruh penghuni —
       termasuk sesi Claude Code sungguhan. Penghalang yang salah tidak bikin
       gambar jelek, dia mengurung orang di lajur sampai halaman di-reload.
     * lajur tujuan ditentukan stasiunnya (s.lane), bukan dicari; "memutar"
       bukan penyetelan satu variabel tapi perilaku routing baru.
     * route() tinggal di room.js, berkas bersama yang sedang dipegang orang
       lain — mengubahnya dari sini menabrak pekerjaan mereka.

   Gantinya dipakai yang SUDAH ada dan sudah dibaca Agent.update(): a.laju,
   pengali kecepatan per-agen. Yang menginjak lantai basah melangkah setengah
   kecepatan, dan satu orang nyaris terpeleset. Klaimnya jadi lebih kecil dari
   usulan ("semua memutar" → "yang lewat jalan hati-hati"), tapi yang tersisa
   benar-benar jalan dan tidak bisa mengunci siapa pun.

   Ketiganya memang bertetangga tapi TIDAK kembar: ob-ngepel-lantai adalah
   ritual terjadwal yang membersihkan (dan tidak ada yang jatuh), sedangkan
   ember-luber-lantai-licin adalah kecelakaan yang justru lelucon jatuhnya.
   payung-basah cuma jejak air satu orang di pojok, tanpa akibat ke lalu
   lintas sama sekali.
   ========================================================================== */

/* --------------------------------------------------- petak basah bersama ---
   a.laju itu LENGKET dan dipakai event lain juga (ojol setengah berlari,
   kecoa bikin orang panik). Dua penjaga wajib supaya tidak saling menimpa:
     1. cuma orang yang lajunya masih 1 yang disentuh — kalau sedang dipakai
        event lain, dilewati;
     2. siapa pun yang pernah diperlambat DICATAT di E.data._basah dan
        dikembalikan ke 1 di selesai(). Tanpa itu, satu event yang batal di
        tengah meninggalkan pegawai yang jalan setengah kecepatan selamanya. */
const BASAH_LAJU = 0.55;

function basahPelankan(E, S, diPetak) {
  const catat = E.data._basah || (E.data._basah = []);
  for (const o of S.orang) {
    const kena = !!diPetak(o);
    const i = catat.indexOf(o);
    if (kena && i < 0) {
      if (o.laju !== 1) continue;              // sedang dipakai event lain
      o.laju = BASAH_LAJU;
      catat.push(o);
    } else if (!kena && i >= 0) {
      o.laju = 1;
      catat.splice(i, 1);
    }
  }
}

function basahKembalikan(E) {
  for (const o of (E.data._basah || [])) o.laju = 1;
  E.data._basah = [];
}

/* Nyaris terpeleset. Badan MIRING dari usulan dibuang: itu menuntut a.miring
   yang dibaca drawPerson (room.js, bukan milik saya), dan memutar ctx 0,12
   rad untuk sosok yang seluruhnya digambar dari koordinat bulat cuma bikin
   pikselnya kabur — persis keberatan yang sudah dicatat peninjau katalog.
   Yang dipakai: pose 'duaangkat' (dua lengan terangkat), debu, meluncur
   sebentar 2,2x, lalu BERHENTI mematung sedetik. Terbaca sama, nol perubahan
   di room.js. */
function basahGelincir(E, o, umur) {
  E.data._slip = o;
  E.data._slipMulai = umur;
  o.pose = 'duaangkat';
  o.laju = 2.2;
  for (let i = 0; i < 6; i++) spawn('dust', o.x, o.y);
}

function basahTickGelincir(E, umur) {
  const o = E.data._slip;
  if (!o) return;                              // sudah dibereskan sendiri
  const t = umur - E.data._slipMulai;
  if (t > 0.4 && o.laju > 1) {
    o.laju = 1;
    // dicoret dari daftar perlambatan supaya frame berikutnya dia diperlambat
    // ulang seperti pejalan lain — bukan malah jadi satu-satunya yang normal
    const c = E.data._basah;
    if (c) { const i = c.indexOf(o); if (i >= 0) c.splice(i, 1); }
    // Sesi nyata yang sedang mengerjakan tool call TIDAK PERNAH dibekukan.
    if (!o.adaTugas) o.bekuSampai = now + 1000;
  }
  if (t > 1.8) { o.pose = null; E.data._slip = null; }
}

function basahLepasGelincir(E) {
  const o = E.data._slip;
  if (!o) return;
  o.pose = null;
  if (o.laju > 1) o.laju = 1;
  o.bekuSampai = 0;
  E.data._slip = null;
}

/* Genangan luber: naik 0->1 dalam 8 detik, surut lagi di 15 detik terakhir.
   Dipakai tick() DAN gambarLantai(), jadi rumusnya satu tempat — bukan dua
   salinan yang gampang beda sepersekian detik. */
function basahKadarLuber(E) {
  const naik = Math.min(1, E.umur / 8);
  const surut = Math.min(1, Math.max(0, (45 - E.umur) / 15));
  return Math.min(naik, surut);
}

/* Sampah kecil di jalur pel ikut hilang. RUANGAN.propLantai (daun rontok,
   kertas bekas) dan RUANGAN.kertasLantai sudah ada dan sudah punya
   penggambarnya, jadi ini akibat yang MENETAP sesudah eventnya usai tanpa
   satu pun field baru — bagian usulan yang paling murah sekaligus paling
   terasa besok paginya. */
function basahSapuSampah(x) {
  const p = RUANGAN.propLantai;
  for (let i = p.length - 1; i >= 0; i--) {
    const s = p[i];
    if (s.jenis !== 'daun' && s.jenis !== 'kertas-bekas') continue;
    if (Math.abs(s.x - x) > 12 || s.y < 240 || s.y > 292) continue;
    p.splice(i, 1);
    spawn('dust', s.x, s.y);
  }
  const k = RUANGAN.kertasLantai;
  for (let i = k.length - 1; i >= 0; i--) {
    if (Math.abs(k[i].x - x) > 12 || k[i].y < 240 || k[i].y > 292) continue;
    k.splice(i, 1);
  }
}

// Kerucut 'awas licin' 6x9 px. Fungsi tersendiri karena digambar tiga kali:
// dua mengapit genangan, satu lagi di tangan yang membawanya.
function gambarKerucutLicin(x, y) {
  r(x - 1, y - 1, 8, 2, '#c98a1e');            // alas
  r(x + 1, y - 4, 4, 3, '#e8a83a');
  r(x + 1, y - 5, 4, 1, '#f2f0e6');            // strip putih
  r(x + 2, y - 8, 2, 3, '#e8a83a');
  r(x + 2, y - 9, 2, 1, '#f2c46a');
}

/* Payung terlipat: batang 1x22, kepala kain 7x9, gagang melengkung 3 px —
   ukuran persis dari usulan. `dijinjing` membedakan yang masih dibawa (tegak
   di sisi badan) dari yang sudah disandarkan (rebah 2 px ke dinding). */
function gambarPayungLipat(x, y, dijinjing) {
  const dx = dijinjing ? 0 : 2;
  r(x + dx, y - 22, 1, 22, '#4a5058');         // batang
  r(x + dx - 3, y - 31, 7, 9, '#20303f');      // kepala kain, hitam kebiruan
  r(x + dx - 3, y - 31, 7, 1, '#2f4557');
  r(x + dx - 1, y - 29, 1, 5, '#3b5468');      // lipatan
  r(x + dx, y - 1, 2, 1, '#3a3f45');           // ujung logam
  r(x + dx - 2, y - 33, 3, 1, '#6b4a2e');      // gagang melengkung
  r(x + dx - 3, y - 32, 1, 2, '#6b4a2e');
}

// Papan lipat kuning "AWAS LICIN" — bentuk yang sebenarnya lebih sering ada
// di kantor dinas daripada kerucut, jadi dipakai untuk yang mengepel.
function gambarPapanLicin(x, y) {
  r(x - 4, y - 11, 4, 11, '#c9901e');          // daun kiri (lebih gelap: membelakangi)
  r(x, y - 11, 4, 11, '#e8b23a');
  r(x - 4, y - 8, 8, 1, '#2c3038');            // dua pita hitam, bukan huruf:
  r(x - 4, y - 5, 8, 1, '#2c3038');            // 8 px tidak muat huruf apa pun
  r(x - 3, y - 1, 6, 1, '#8a6a1a');
}

daftarEvent(

/* Petugas kebersihan: satu-satunya bagian mahal yang benar-benar dikerjakan
   di sini adalah pita lantai basah yang MENGERING DARI BELAKANG. Petugasnya
   sendiri orang luar (aturan: bukan Agent, bukan penghuni()), jadi dia tidak
   punya say() — kalimat "awas licin" dipindahkan ke pegawai yang menyapanya,
   yang justru lebih benar: yang menyapa duluan memang stafnya. */
{
  id: 'ob-ngepel-lantai',
  kelas: 'latar', bobot: B.sedang, cooldown: 10800, durasi: 35,
  babak: { malam: 0, libur: 0 },
  // pagi sebelum jam kerja penuh dan sore menjelang pulang; batasnya digeser
  // setengah jam dari usulan (07-08 / 16-17) supaya jam bulat yang paling
  // sering kejadian di ruangan sungguhan ikut masuk rentang, bukan jatuh
  // tepat di tepinya
  syarat: (S) => (S.jam >= 6.5 && S.jam < 8.5) || (S.jam >= 15.5 && S.jam < 17.5),
  // TANPA perluAktor: adegannya utuh walau tidak ada satu pegawai pun yang
  // bisa dipinjam — yang jadi acara petugasnya, bukan penontonnya
  mulai(E) {
    E.data.t = { x: -16, fase: 'masuk', jeda: 0, sapuT: 0 };
    E.data.petak = [];                          // {x, umur} jejak pel
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (T.fase === 'masuk') {
      T.x += 46 * dt;
      // 42, bukan 60: satu-satunya penulis propLantai jenis 'daun' menaruhnya
      // di x 30..40 (18-suasana...js), jadi mulai dari 60 daunnya tidak pernah
      // tersapu padahal komentar penyapunya menyebut daun paling depan
      if (T.x >= 42) { T.x = 42; T.fase = 'pel'; }
    } else if (T.fase === 'pel') {
      if (T.jeda > 0) {
        T.jeda -= dt;                           // berhenti menaruh papan
      } else {
        T.x += 26 * dt;                         // pelan: mendorong pel, bukan lewat
        T.sapuT += dt;
        if (T.sapuT > 0.32) {
          T.sapuT = 0;
          E.data.petak.push({ x: T.x, umur: 0 });
          spawn('splash', T.x, 262, '#b9c4c8');
          basahSapuSampah(T.x);
        }
        if (!E.data.papan && T.x >= 196) { E.data.papan = true; T.jeda = 2.4; }
        if (T.x >= 404) {
          T.fase = 'pulang';                 // berhenti sebelum sekat pantry (x414)
          // Sudah menyapu seluruh lajur: kekusutan harian (room.js) dipangkas
          // SEBAGIAN, bukan sampai bersih seperti jumat-bersih — yang dipegang
          // OB cuma lantainya, tumpukan di meja orang tidak disentuhnya.
          bereskanKusut(0.6);
        }
      }
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
      if (E.data.papan && T.x < 194) E.data.papan = false;   // papannya diangkat lagi
    }

    for (const p of E.data.petak) p.umur += dt;

    // Rentang yang masih basah. Petak didorong berurutan dari kiri ke kanan
    // dan mengering dengan urutan yang sama, jadi yang tersisa selalu potongan
    // menyambung — cukup ujung kiri dan ujung kanannya.
    const hidup = E.data.petak.filter((p) => p.umur < 12);
    const ada = hidup.length > 0;
    const x1 = ada ? hidup[0].x - 10 : 0;
    const x2 = ada ? hidup[hidup.length - 1].x + 10 : 0;
    const diPetak = (o) => ada && o.y > 244 && o.y < 278 && o.x > x1 && o.x < x2;

    basahPelankan(E, S, diPetak);

    // satu orang saja yang nyaris terpeleset sepanjang event; sesudahnya
    // semua sudah tahu dan cuma melangkah pelan
    if (ada && !E.data.pernahGelincir) {
      for (const o of S.orang) {
        // eventKerja apa pun dilewati: menyetel pose orang yang sedang jadi
        // pemeran event lain akan menimpa koreografi event itu
        if (o.adaTugas || o.eventKerja || !o.path.length) continue;
        if (o.laju !== BASAH_LAJU) continue;     // sudah dicatat basahPelankan
        E.data.pernahGelincir = true;
        basahGelincir(E, o, E.umur);
        o.say('eh—');
        break;
      }
    }
    basahTickGelincir(E, E.umur);

    // yang paling dekat menyapa; balon "awas licin" milik petugas dipindah ke
    // sini karena orang luar tidak punya say()
    if (!E.data.sapa && T.fase === 'pel' && E.umur > 4) {
      const dekat = S.orang.find((o) => !o.adaTugas && !o.eventKerja
        && o.y > 230 && Math.abs(o.x - T.x) < 70);
      if (dekat) {
        E.data.sapa = true;
        dekat.say('permisi, Pak — awas licin');
        // -Ke: OB-nya berdiri tepat di depannya dan menyapa, bukan lewat saja
        menolehKe([dekat], T.x, 252, 1200);
      }
    }
    pada(E, 3, () => menoleh(S.orang, 120, 252, 900));
  },
  gambarLantai(E) {
    const daftar = E.data.petak;
    if (!daftar || !daftar.length) return;
    const hidup = daftar.filter((p) => p.umur < 12);
    if (!hidup.length) return;
    const x1 = Math.round(hidup[0].x) - 8;
    const x2 = Math.round(hidup[hidup.length - 1].x) + 8;
    const lebar = x2 - x1;
    if (lebar < 2) return;
    // Pita basah di bawah bibir karpet (karpet berhenti di y252), jadi yang
    // dipel memang ubin — bukan permadani merah ruang rapat.
    const tepi = Math.min(30, lebar);
    ctx.globalAlpha = 0.17;
    if (lebar > tepi) r(x1 + tepi, 256, lebar - tepi, 14, '#ffffff');
    ctx.globalAlpha = 1;
    // ujung belakang mengering bertahap, bukan hilang sekaligus
    const w = Math.max(1, Math.round(tepi / 3));
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.05 + 0.06 * i;
      r(x1 + i * w, 256, w, 14, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // tiga kilau 1 px yang merayap: tanpa ini pitanya cuma terbaca "ubin lebih
    // terang", bukan basah
    for (let i = 0; i < 3; i++) {
      const t = ((now / 900) + i / 3) % 1;
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(now / 130 + i);
      r(Math.round(x1 + lebar * t), 258 + i * 4, 1, 1, '#eaf4ff');
      ctx.globalAlpha = 1;
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14) return;
    const x = Math.round(T.x), y = 252;
    gambarOrangLuar(x, y, '#2f6f8a', null, null, '#2b2118');   // wearpack biru
    // Gagang pel digambar sendiri, bukan a.bawa 'sapu': kepala sapu di
    // drawBawaan warnanya kuning ijuk dan menggantung setinggi pinggang,
    // sementara kepala pel harus MENYENTUH lantai tepat di pita basah.
    const arah = T.fase === 'pulang' ? -1 : 1;
    r(x + arah * 7, y - 18, 1, 24, '#8a6844');
    r(x + arah * 4, y + 5, 8, 3, '#c9c3b0');
    r(x + arah * 4, y + 7, 8, 1, '#9aa1a6');
    // Papan digambar SESUDAH petugas: satu-satunya saat keduanya bertumpuk
    // adalah ketika dia berhenti tepat di belakangnya untuk menaruh — dan di
    // situ papannya memang harus di depan.
    if (E.data.papan) gambarPapanLicin(196, 268);
  },
  // 252 + 24: konvensi "pita lajur bawah" di frame() — tanpa itu petugasnya
  // tenggelam di balik kursi rapat sisi dekat tepat waktu melintas x214/x278
  sortY: 276,
  selesai(E) { basahKembalikan(E); basahLepasGelincir(E); },
},

/* Payung basah: yang MASUK DARI TEPI KANVAS sambil membawa payung sengaja
   tidak dibuat. Orang itu seorang PEGAWAI, dan pegawai baru cuma boleh lahir
   dari sesi Claude Code sungguhan — memaksanya jadi gambarOrangLuar akan
   membuatnya orang asing, bukan rekan. Jadi yang menyandarkan payung adalah
   pegawai yang memang sudah ada di ruangan, baru balik dari luar. Sisanya
   utuh: payung tersandar, tetesan, dan noda yang membesar sendiri.

   Satu bagian usulan lagi yang dibuang: "pegawai lain yang melewati noda
   memperlambat langkah". Pojok itu TIDAK dilewati satu rute pun — route()
   cuma memakai LANE_L=160/LANE_R=337 sebagai penghubung dan meja kerja
   paling kiri ada di x=86, jadi tidak ada yang pernah berjalan di x≈55.
   Kodenya akan jadi cabang yang tidak pernah dieksekusi. Yang menggantikan
   fungsinya: rekan kedua yang sengaja datang menengok di detik 45. */
{
  id: 'payung-basah-di-pojok',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 75,
  babak: { libur: 0 },
  // saat hujan, atau sampai 5 menit sesudah hujan derasnya berhenti —
  // hujanTinggiSejak dicatat tickRuangan tiap frame selama CUACA.hujan > .6
  syarat: () => CUACA.hujan > 0.35
    || (CUACA.hujanTinggiSejak && Date.now() - CUACA.hujanTinggiSejak < 300000),
  perluAktor: true,
  mulai(E) {
    const a = E.data.a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menyandarkan payung basah';
    a.goToXY(74, 262, 'left');
  },
  tick(E, dt, S) {
    // Tetesan dari ujung payung. p.dasar WAJIB dipasang: tanpa itu updateParts
    // memperlakukannya sebagai tetes AC — mendarat di y=124 (di udara, jauh di
    // seberang ruangan) dan ikut mengisi RUANGAN.emberIsi yang bukan urusannya.
    if (E.data.taruh) {
      E.data.tetesT = (E.data.tetesT || 0) + dt;
      if (E.data.tetesT > 1.5) {
        E.data.tetesT = 0;
        const p = spawn('drip', 56, 256, '#a8c4d0');
        if (p) {
          p.dasar = 271;                        // lantai tepat di bawah ujungnya
          p.onDrip = () => { E.data.noda = Math.min(9, (E.data.noda || 0) + 1); };
        }
      }
    }

    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (a && !E.data.taruh) {
      if (a.diam && !E.data.taruhPada) E.data.taruhPada = E.umur + 1.5;
      if (E.data.taruhPada && E.umur > E.data.taruhPada) {
        E.data.taruh = true;
        E.data.noda = 1;
        a.say('kehujanan di jalan');
        a.doingEvent = '';
        a.goTo(stasiunPulang(a));
        // dilepas rapi lewat lepaskanAktor (bukan splice dari E.aktor): dia
        // sudah selesai berperan dan tidak boleh ditahan 60 detik sisanya
        E.data.pemilik = a;      // supaya rekan di babak kedua bukan dia lagi
        E.data.a = null;
        lepaskanAktor(a);
      }
    }

    // Babak kedua: rekan yang lewat dan bertanya payung siapa. Ini yang bikin
    // pojok itu ditengok orang; tanpa dia payungnya cuma prop diam 75 detik.
    // Babak kedua HANYA kalau payungnya benar-benar sempat disandarkan. Kalau
    // pemeran pertama direbut tool call sebelum sampai, tidak ada payung untuk
    // ditengok — rekannya jangan disuruh mengagumi pojok kosong.
    if (E.data.taruh) {
      pada(E, 45, () => {
        // pemiliknya sendiri dikecualikan: sesudah menyandarkan payung dia
        // pulang ke meja/ruang tunggu yang justru PALING DEKAT ke titik ini,
        // jadi pemeranDekat hampir pasti memilih dia lagi
        const b = E.data.b = pinjamAktor(E, 1, (o) => o !== E.data.pemilik)[0];
        if (b) { b.doingEvent = 'melihat payung di pojok'; b.goToXY(84, 258, 'left'); }
      });
    }
    const b = masihMain(E, E.data.b) ? E.data.b : null;
    if (b && b.diam && !E.data.tanyaPada) {
      E.data.tanyaPada = E.umur + 1.2;
      b.say('punya siapa ini? basah kuyup');
    }
    if (b && E.data.tanyaPada && E.umur > E.data.tanyaPada && !E.data.balik) {
      E.data.balik = true;
      b.doingEvent = '';
      b.goTo(stasiunPulang(b));
    }
  },
  gambarLantai(E) {
    const n = E.data.noda || 0;
    if (!n) return;
    // Menyusut di 12 detik terakhir eventnya sendiri. Usulan minta nodanya
    // hidup 20 detik SESUDAH event usai; itu butuh tempat penyimpanan di
    // RUANGAN yang belum ada, dan menaruhnya di sana berarti lantai bisa
    // basah selamanya kalau eventnya batal di tengah.
    const sisa = Math.min(1, Math.max(0, (75 - E.umur) / 12));
    const w = Math.round(n * 1.6 * sisa) + 2;
    if (w < 3) return;
    ctx.globalAlpha = 0.2;
    r(55 - (w >> 1), 271, w, 3, '#98a0a4');
    r(56 - (w >> 1), 270, w - 2, 1, '#b6bdc0');
    ctx.globalAlpha = 1;
  },
  gambarProp(E) {
    if (!E.data.taruh) return;
    gambarPayungLipat(54, 270, false);
  },
  // 273: di depan pejalan lajur bawah, tetap di belakang pot tanaman (sortY
  // 294) yang berdiri lebih dekat ke penonton. x=54 dipilih supaya payungnya
  // bersandar DI SEBELAH pot, bukan tersangkut di daunnya (pot + daun memakan
  // x16..48, lihat drawPlant) — usulan aslinya menaruhnya di x=36, tepat di
  // tengah tanaman
  sortY: 273,
  gambarAtas(E) {
    // Selagi masih dijinjing, payungnya digambar di lapis ATAS — bukan lewat
    // gambarProp: satu event cuma punya satu sortY, dan sortY pojok (273)
    // akan menenggelamkan payung di balik badan pembawanya sendiri.
    const a = E.data.a;
    if (!a || E.data.taruh || !masihMain(E, a)) return;
    gambarPayungLipat(Math.round(a.x) + (a.face === 'left' ? -13 : 9),
      Math.round(a.y) - 2, true);
  },
  selesai(E) {
    if (E.data.a) E.data.a.doingEvent = '';
    if (E.data.b) E.data.b.doingEvent = '';
  },
},

/* Ember luber. Rantai `lanjutan` dari ac-bocor-deras tidak dipakai — berkas
   itu milik orang lain, dan lebih penting: `lanjutan` berpeluang statis,
   tidak bisa membaca "apakah tadi ada yang sempat mengosongkan ember".
   Syaratnya justru bisa menyatakannya langsung dan lebih jujur: embernya
   MENTOK PENUH (emberIsi 90 adalah batas atas di room.js), dan bentrokDengan
   memastikan tidak ada satu pun adegan ember lain yang sedang berjalan.
   Artinya memang tidak ada yang membereskannya. Cipratan luber-nya bahkan
   sudah gratis: updateParts menyemprot 6 partikel, bukan 3, begitu embernya
   penuh — dan embernya sengaja TIDAK dikosongkan di sini, biar
   ember-ac-penuh (syarat >= 88) yang membereskannya sesudah ini. */
{
  id: 'ember-luber-lantai-licin',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 45,
  // teknisi-ac-datang ikut disebut: durasinya 900 detik dan ia menulis
  // MOD.drip = 99999 tiap frame, jadi MOD.drip = 1.4 di bawah pasti ditimpa
  bentrokDengan: ['ember-ac-penuh', 'ac-bocor-deras', 'tetes-terakhir-ember', 'teknisi-ac-datang'],
  syarat: () => RUANGAN.emberIsi >= 90 && !RUANGAN.emberDiangkat,
  perluAktor: true,
  mulai(E) {
    // Dipinjam sekarang walau baru bergerak di detik 5: perluAktor diperiksa
    // tepat sesudah mulai(), jadi memanggil pemeran() belakangan bikin
    // eventnya dibatalkan sebelum sempat jalan.
    const a = E.data.a = pemeran(E, ['teknisi', 'magang', 'pranata_muda']);
    if (a) a.doingEvent = 'mengambil kerucut awas licin';
    E.data.tahap = -1;
    for (let i = 0; i < 8; i++) spawn('splash', 347, 132);
  },
  tick(E, dt, S) {
    // Tetesnya tidak berhenti — itu justru sebabnya. Ditulis ULANG tiap frame:
    // MOD direset di awal setiap frame.
    MOD.drip = 1.4;

    const k = basahKadarLuber(E);
    const diGenangan = (o) => k > 0.15 && Math.abs(o.x - 347) < 18
      && o.y > 138 && o.y < 180;

    // Sebelum kerucut berdiri: yang pertama menginjak tergelincir.
    if (!E.data.kerucut && !E.data.pernah && k > 0.25) {
      for (const o of S.orang) {
        if (o.eventKerja || o.adaTugas || !o.path.length || o.laju !== 1) continue;
        if (!diGenangan(o)) continue;
        E.data.pernah = true;
        basahGelincir(E, o, E.umur);
        o.say('aduh, licin!');
        break;
      }
    }
    basahTickGelincir(E, E.umur);
    // Sesudah kerucut berdiri barulah semua melangkah hati-hati — sebelum itu
    // memang tidak ada yang tahu, dan itu inti keseluruhan adegannya.
    if (E.data.kerucut) basahPelankan(E, S, diGenangan);

    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.data.bawa = false; return; }   // direbut tool call: skripnya berhenti
    if (E.data.tahap < 0) {
      pada(E, 5, () => {
        E.data.tahap = 0;
        a.say('saya ambil kerucutnya dulu');
        a.goToXY(290, 278, 'down');            // kerucut nganggur di sudut ruang tunggu
      });
      return;
    }
    // perhentian bernomor: maju begitu sampai, bukan antrean tujuan di Agent
    if (E.data.tahap < 2 && a.diam && !E.data.jedaPada) E.data.jedaPada = E.umur + 1.4;
    if (E.data.jedaPada && E.umur > E.data.jedaPada) {
      E.data.jedaPada = 0;
      E.data.tahap++;
      if (E.data.tahap === 1) {
        E.data.bawa = true;
        a.doingEvent = 'memasang kerucut awas licin';
        a.goToXY(326, 176, 'up');
      } else if (E.data.tahap === 2) {
        E.data.bawa = false;
        E.data.kerucut = true;
        a.pose = 'jongkok';
        a.say('awas licin, sudah saya pasang kerucut');
        E.data.bangunPada = E.umur + 2.5;
      }
    }
    if (E.data.bangunPada && E.umur > E.data.bangunPada) {
      E.data.bangunPada = 0;
      a.pose = null;
      a.doingEvent = '';
      a.goTo(stasiunPulang(a));
    }
  },
  gambarLantai(E) {
    const k = basahKadarLuber(E);
    if (k <= 0.02) return;
    const cx = 347, atas = 134;
    const h = Math.round(4 + 26 * k);
    // Bentuk tetesan, bukan kotak: lebarnya mengembang lalu mengecil ke bawah.
    ctx.globalAlpha = 0.33;
    for (let i = 0; i < h; i++) {
      const w = Math.round((4 + 26 * k) * Math.sin(0.25 * Math.PI + (i / h) * 0.75 * Math.PI));
      if (w < 1) continue;
      r(cx - (w >> 1), atas + i, w, 1, i % 4 === 0 ? '#4a7a90' : '#3f6a80');
    }
    ctx.globalAlpha = 1;
    // dua titik pantulan neon yang bergeser pelan di permukaannya
    for (let i = 0; i < 2; i++) {
      const px = cx - 4 + Math.round(Math.sin(now / 900 + i * 2.1) * 7);
      const py = atas + 6 + i * 9;
      if (py >= atas + h) continue;
      ctx.globalAlpha = 0.5;
      r(px, py, 1, 1, '#cfe6f2');
      ctx.globalAlpha = 1;
    }
  },
  gambarProp(E) {
    if (!E.data.kerucut) return;
    gambarKerucutLicin(325, 166);
    gambarKerucutLicin(367, 166);
  },
  // 167: satu piksel di depan kaki pejalan lajur atas (LANE_UP 164), jadi
  // kerucut yang berdiri lebih dekat ke penonton menutupi mereka, bukan
  // sebaliknya
  sortY: 167,
  gambarAtas(E) {
    if (!E.data.bawa || !E.data.a) return;
    const a = E.data.a;
    gambarKerucutLicin(Math.round(a.x) + (a.face === 'left' ? -14 : 8),
      Math.round(a.y) - 10);
  },
  selesai(E) {
    basahKembalikan(E);
    basahLepasGelincir(E);
    if (E.data.a) { E.data.a.pose = null; E.data.a.doingEvent = ''; }
  },
},

);
