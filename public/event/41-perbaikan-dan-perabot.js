/* ==========================================================================
   PERBAIKAN BERKALA — dan dua kejadian di perabot yang belum punya kejadian
   ==========================================================================
   Sejak bekas di kantor bertahan saat muat ulang (BEKAS_FIELD di room.js),
   empat bekas hanya bisa BERTAMBAH: tidak ada satu baris kode pun yang pernah
   mengurangi noda plafon (maks 3), retak lantai (maks 6), noda kopi di taplak
   meja rapat (tanpa batas sama sekali), atau kursi rapat yang rusak. Dulu itu
   tidak apa-apa karena semuanya lenyap tiap halaman dimuat ulang. Sekarang,
   tanpa penyeimbang, kantornya jadi gedung terbengkalai dalam beberapa minggu.

   Empat event di sini penyeimbangnya — SATU bekas per kejadian, jarang, dan
   sengaja tidak pernah membersihkan sampai tuntas: retak baru ditambal kalau
   sudah ada dua, noda kopi dicuci kalau sudah dua. Kantor yang habis
   direnovasi tiap minggu sama tidak meyakinkannya dengan yang tidak pernah
   diperbaiki. Buku riwayat (📜) mencatat perbaikannya sendiri ("Retak di
   lantai ditambal") karena ia membaca BEKAS, bukan event — tidak ada baris
   di sini yang menyebut buku itu.

   Dua sisanya untuk perabot yang sampai sekarang cuma bisa dipandang: papan
   kinerja (grafiknya hidup dari tool call, tapi tidak pernah ada yang
   membacanya) dan mesin fotokopi berdiri di sayap timur — beda dari printer
   meja yang dipakai fotokopi-kilat dan kasi-panggil-magang-fotokopi.
   ========================================================================== */

daftarEvent(

/* Tukang cat plafon. Orang luar, masuk dari tepi kiri, memasang tangga lipat
   di depan lemari arsip (noda plafonnya memang di atas lemari itu, lihat
   drawWall), naik, mengecat satu noda, turun, pulang. Tidak meminjam pegawai:
   tukang bukan urusan siapa pun di ruangan ini, cuma dilirik. */
{
  id: 'tukang-cat-plafon',
  kelas: 'latar', bobot: B.jarang, cooldown: 5400, durasi: 42,
  sfx: 'sapu',
  babak: { kerja: 1, istirahat: 0.3, apel: 0, pulang: 0, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 9 && S.jam < 15 && RUANGAN.nodaPlafon.length > 0 && CUACA.hujan < 0.2,
  bentrokDengan: ['atap-bocor-musim-hujan', 'plafon-melendut-noda-air', 'bocor-baru-di-atas-arsip'],
  mulai(E) {
    // ?event= melewati syarat: tanpa noda, tidak ada yang dicat
    if (!RUANGAN.nodaPlafon.length) { E.selesaiCepat = true; return; }
    const n = RUANGAN.nodaPlafon[RUANGAN.nodaPlafon.length - 1];
    E.data.noda = n;
    E.data.tx = Math.round(n.x + n.w / 2);
    E.data.t = { x: -14, naik: 0, fase: 'masuk' };
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (!T) return;
    if (T.fase === 'masuk') {
      T.x = Math.min(E.data.tx, T.x + 46 * dt);
      if (T.x < E.data.tx) return;
      T.fase = 'naik';
      menoleh(S.orang.filter((o) => !o.eventKerja && jarakKe(o, E.data.tx, 150) < 120), E.data.tx, 60, 1500);
      return;
    }
    if (T.fase === 'naik') {
      T.naik = Math.min(1, T.naik + dt / 1.5);
      if (T.naik >= 1) { T.fase = 'cat'; E.data.catSampai = E.umur + 7; }
      return;
    }
    if (T.fase === 'cat') {
      if (Math.random() < 3 * dt) spawn('dust', E.data.tx + acak(-4, 4), 10);
      if (E.umur > E.data.catSampai) {
        // nodanya sendiri yang dihapus, bukan "yang terakhir": noda baru bisa
        // saja muncul selama tukangnya di atas tangga
        const i = RUANGAN.nodaPlafon.indexOf(E.data.noda);
        if (i >= 0) RUANGAN.nodaPlafon.splice(i, 1);
        T.fase = 'turun';
      }
      return;
    }
    if (T.fase === 'turun') {
      T.naik = Math.max(0, T.naik - dt / 1.2);
      if (T.naik <= 0) T.fase = 'pulang';
      return;
    }
    T.x -= 46 * dt;
    if (T.x < -16) E.selesaiCepat = true;
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -16) return;
    const tx = E.data.tx;
    if (T.fase !== 'masuk' && T.fase !== 'pulang') {
      // tangga lipat aluminium, dari lantai (y150) sampai dekat plafon
      for (const kx of [tx - 5, tx + 5]) r(kx, 22, 1, 128, '#b9bdb6');
      for (let yy = 32; yy < 150; yy += 12) r(tx - 5, yy, 11, 1, '#9aa1a6');
    }
    // di puncak tangga garis kakinya y40: kuas rol ('sapu') menyentuh plafon
    const y = Math.round(150 - T.naik * 110);
    gambarOrangLuar(Math.round(T.x), y, '#e8e4d4', null, 'sapu', '#6b5a3a');
  },
  sortY: 152,
},

/* Kursi rapat yang rusak diganti. Pengganti diambil dari gudang ATK, ditukar
   di tempatnya, yang rusak dibawa balik ke gudang. Tidak saat ada rapat
   sungguhan: slot kursi rusak tetap bisa diduduki (drawKursiJauh), dan
   menukar kursi yang sedang diduduki peserta bukan adegan. */
{
  id: 'kursi-rapat-rusak-diganti',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 60,
  sfx: 'kursi',
  babak: { kerja: 1, istirahat: 0.5, apel: 0, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 8 && S.jam < 15.5 && RUANGAN.kursiRusak.size > 0 && !rapatAktif.length
    && S.orang.some((o) => bisaDipinjam(o)),
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['teknisi']);
    if (!a) return;
    E.data.a = a;
    E.data.slot = [...RUANGAN.kursiRusak][0];
    E.data.kx = RAPAT.cx + slotKe(E.data.slot);
    E.data.tahap = 'gudang';
    a.doingEvent = 'ambil kursi pengganti di gudang';
    a.goToXY(GUDANG.titikX, GUDANG.titikY, 'up');
  },
  tick(E) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    const T = E.data;
    if (T.tahap === 'ambil' && E.umur > T.lanjutPada) {
      T.tahap = 'bawa';
      T.dibawa = 'baru';
      a.doingEvent = 'ganti kursi rapat yang rusak';
      a.laju = 0.8;
      a.goToXY(T.kx, 160, 'down');                 // di belakang deretan kursi jauh (sandaran y169)
      return;
    }
    if (T.tahap === 'tukar' && E.umur > T.lanjutPada) {
      RUANGAN.kursiRusak.delete(T.slot);           // buku riwayat: "Kursi rapat yang rusak diganti"
      T.dibawa = 'rusak';
      a.pose = null;
      T.tahap = 'kembali';
      a.goToXY(GUDANG.titikX, GUDANG.titikY, 'up');
      return;
    }
    if (!a.diam) return;
    if (T.tahap === 'gudang') { T.tahap = 'ambil'; T.lanjutPada = E.umur + 2; return; }
    if (T.tahap === 'bawa') {
      T.tahap = 'tukar';
      T.lanjutPada = E.umur + 2.5;
      a.pose = 'jongkok';
      for (let i = 0; i < 4; i++) spawn('dust', T.kx, 180);
      return;
    }
    if (T.tahap === 'kembali') {
      T.dibawa = null; a.laju = 1;
      simpanKeGudang('kursi');                     // kursi rusaknya menunggu penghapusan BMN
      gudangKeadaan.bukaSampai = now + 1200;
      E.selesaiCepat = true;
    }
  },
  // Kursi yang dijinjing digambar di ATAS segalanya: sortY tetap tidak bisa
  // mengikuti orang yang berjalan melintasi separuh ruangan.
  gambarAtas(E) {
    const a = E.data.a;
    if (!E.data.dibawa || !a || a.eventKerja !== E) return;
    const x = Math.round(a.x) + 5, y = Math.round(a.y) - 24;
    const baru = E.data.dibawa === 'baru';
    r(x, y, 9, 10, baru ? '#2a4f8a' : '#8b8f86');
    r(x + 1, y + 1, 7, 7, baru ? '#3f74c4' : '#c9ced4');
    r(x + 3, y + 10, 2, 4, '#9aa1a6');
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.laju = 1; } },
},

/* Ubin retak ditambal. Baru kalau retaknya sudah dua: satu retak di lantai
   kantor dinas itu karakter, bukan kerusakan. Yang ditambal yang TERTUA. */
{
  id: 'ubin-retak-ditambal',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 42,
  sfx: 'ketuk',
  babak: { kerja: 1, istirahat: 0.4, apel: 0, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 8 && S.jam < 15.5 && RUANGAN.retakExtra.length >= 2
    && S.orang.some((o) => bisaDipinjam(o)),
  bentrokDengan: ['ubin-retak-nambah'],
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['teknisi']);
    if (!a) return;
    const k = RUANGAN.retakExtra[0];
    if (!k) { E.selesaiCepat = true; return; }   // ?event= melewati syarat: tanpa retak, tidak ada yang ditambal
    E.data.a = a;
    E.data.retak = k;
    E.data.x = k.gx * 24 + 12;
    E.data.y = FLOOR_TOP + k.gy * 24 + 20;       // berdiri tepat di bawah titik tengah retaknya
    a.doingEvent = 'menambal ubin retak';
    a.bawa = 'ember';
    a.goToXY(E.data.x, E.data.y, 'up');
  },
  tick(E, dt) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    if (!a.diam) return;
    if (E.data.tambalPada == null) { E.data.tambalPada = E.umur + 8; a.pose = 'jongkok'; }
    if (!E.data.beres) {
      if (Math.random() < 2 * dt) spawn('dust', E.data.x + acak(-3, 3), E.data.y - 6);
      if (E.umur <= E.data.tambalPada) return;
      const i = RUANGAN.retakExtra.indexOf(E.data.retak);
      if (i >= 0) RUANGAN.retakExtra.splice(i, 1);  // buku riwayat: "Retak di lantai ditambal"
      E.data.beres = true;
      E.data.bubarPada = E.umur + 1.5;
      a.pose = null;
      a.bawa = null;
      return;
    }
    if (E.umur > E.data.bubarPada) E.selesaiCepat = true;
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; } },
},

/* Noda kopi di taplak meja rapat dilap sampai bersih, lalu lapnya dibilas di
   pantri. Satu-satunya bekas di daftar ini yang tidak punya batas atas —
   tiap kopi tumpah menambah satu — jadi yang ini membersihkan semuanya
   sekaligus, tapi baru kalau sudah dua. */
{
  id: 'noda-kopi-taplak-dibersihkan',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 44,
  sfx: 'air',
  babak: { kerja: 1, istirahat: 0.6, apel: 0, lembur: 0.2, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 9 && S.jam < 15.5 && RUANGAN.nodaKopi.length >= 2 && !rapatAktif.length
    && S.orang.some((o) => bisaDipinjam(o)),
  bentrokDengan: ['gorengan-di-meja-rapat', 'rapat-molor-kopi-masuk'],
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    E.data.a = a;
    E.data.tahap = 'meja';
    a.doingEvent = 'membersihkan noda kopi di taplak';
    a.bawa = 'lap';
    a.goToXY(246, 240, 'up');                    // sisi dekat meja rapat, idiom gorengan-di-meja-rapat
  },
  tick(E, dt) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    const T = E.data;
    if (T.tahap === 'lap') {
      if (Math.random() < 2.5 * dt) spawn('splash', 246 + acak(-14, 14), 200);
      if (E.umur <= T.lanjutPada) return;
      RUANGAN.nodaKopi = [];                     // buku riwayat: "Noda kopi di meja rapat dibersihkan"
      a.pose = null;
      T.tahap = 'bilas';
      a.doingEvent = 'bilas lap di pantri';
      a.goToXY(pantriX(466), 256, 'up');
      return;
    }
    if (T.tahap === 'tuntas' && E.umur > T.lanjutPada) { a.bawa = null; E.selesaiCepat = true; return; }
    if (!a.diam) return;
    if (T.tahap === 'meja') { T.tahap = 'lap'; T.lanjutPada = E.umur + 7; a.pose = 'lap'; return; }
    if (T.tahap === 'bilas') {
      T.tahap = 'tuntas';
      T.lanjutPada = E.umur + 2;
      for (let i = 0; i < 3; i++) spawn('splash', a.x, a.y - 16);
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; } },
},

/* Papan kinerja dievaluasi. Grafiknya selama ini hidup dari tool call
   sungguhan (tapakStasiun) tapi tidak pernah ada yang membacanya. Atasan
   menunjuk batang tertinggi — stasiun yang paling banyak dipakai sesi Claude
   Code hari ini, dibaca dari data yang sama dengan yang digambar papan — dan
   dua pendengar garuk tengkuk: garis target merahnya dipasang di 80%,
   sengaja supaya selalu ada yang belum tercapai. */
{
  id: 'papan-kinerja-dievaluasi',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 36,
  sfx: 'gores',
  babak: { kerja: 1.2, istirahat: 0, apel: 0, pulang: 0.6, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 9 && S.jam < 16.5 && S.orang.filter((o) => bisaDipinjam(o)).length >= 3
    && KINERJA_URUT.reduce((n, st) => n + (tapakStasiun[st] || 0), 0) >= 12,
  perluAktor: true,
  mulai(E) {
    // jabatan struktural dari JABATAN di room.js; tidak ada = siapa pun yang menganggur
    const atasan = pemeran(E, ['kadis', 'sekdis', 'kabid', 'kasi']);
    if (!atasan) return;
    const dengar = pinjamAktor(E, 2);
    if (dengar.length < 2) { E.selesaiCepat = true; return; }
    E.data.atasan = atasan;
    E.data.dengar = dengar;
    atasan.doingEvent = 'evaluasi papan kinerja';
    atasan.goToXY(272, 164, 'up');               // lajur atas, tepat di bawah papan (x258..286)
    dengar.forEach((o, i) => {
      o.doingEvent = 'dengar evaluasi kinerja';
      o.goToXY(250 + i * 44, 180, 'up');
    });
    const nilai = KINERJA_URUT.map((st) => tapakStasiun[st] || 0);
    E.data.juara = nilai.indexOf(Math.max(...nilai));
  },
  tick(E, dt) {
    const atasan = masihMain(E, E.data.atasan) ? E.data.atasan : null;
    if (!atasan) { E.selesaiCepat = true; return; }
    if (!atasan.diam) return;
    if (E.data.tunjukSejak == null) E.data.tunjukSejak = E.umur;
    const t = E.umur - E.data.tunjukSejak;
    atasan.pose = t < 12 ? 'nunjuk' : null;
    if (t < 12 && Math.random() < 1.2 * dt) {
      spawn('ping', PAPAN_KINERJA.x + 3 + E.data.juara * 3, PAPAN_KINERJA.y + 12);
    }
    if (t > 6 && !E.data.garuk) {
      E.data.garuk = true;
      for (const o of yangMasihMain(E, E.data.dengar)) if (o.diam) o.pose = 'usap';
    }
    if (t > 15) E.selesaiCepat = true;
  },
  selesai(E) {
    for (const o of [E.data.atasan, ...(E.data.dengar || [])]) if (o) o.pose = null;
  },
},

/* Kertas nyangkut di mesin fotokopi sayap timur. Lampu merah berkedip, laci
   bawahnya ditarik, kertas kusut dicabut satu-satu — dan kalau ada rim
   cadangan di atas mesin (RUANGAN.rimKertas, dari jatah-kuota-cair), lacinya
   diisi dari situ. Rim yang terpakai tidak masuk buku riwayat, sengaja: yang
   dicatat buku itu isi ulang, bukan pemakaian. */
{
  id: 'kertas-nyangkut-di-fotokopi',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 32,
  sfx: 'printer',
  babak: { kerja: 1, istirahat: 0.4, apel: 0, lembur: 0.2, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 8 && S.jam < 15.5 && S.orang.some((o) => bisaDipinjam(o)),
  bentrokDengan: ['jatah-kuota-cair'],
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, FOTOKOPI_TITIK.x, FOTOKOPI_TITIK.y);
    if (!a) return;
    E.data.a = a;
    E.data.tahap = 'jalan';
    a.doingEvent = 'memfotokopi berkas';
    a.bawa = 'kertas';
    a.goToXY(FOTOKOPI_TITIK.x, FOTOKOPI_TITIK.y, 'up');
  },
  tick(E, dt) {
    const a = masihMain(E, E.data.a) ? E.data.a : null;
    if (!a) { E.selesaiCepat = true; return; }
    const T = E.data;
    if (T.tahap === 'macet' && E.umur > T.lanjutPada) {
      T.tahap = 'cabut';
      T.lanjutPada = E.umur + 5;
      a.pose = 'jongkok';
      a.bawa = null;
      return;
    }
    if (T.tahap === 'cabut') {
      if (Math.random() < 1.2 * dt) spawn('lembar', FOTOKOPI.x + 17, FOTOKOPI.y + 32);
      if (E.umur <= T.lanjutPada) return;
      T.tahap = 'isi';
      T.lanjutPada = E.umur + 3;
      a.pose = 'angkat';
      if (RUANGAN.rimKertas > 0) RUANGAN.rimKertas--;   // laci diisi dari rim cadangan di atas mesin
      return;
    }
    if (T.tahap === 'isi' && E.umur > T.lanjutPada) { a.pose = null; E.selesaiCepat = true; return; }
    if (T.tahap === 'jalan' && a.diam) { T.tahap = 'macet'; T.lanjutPada = E.umur + 2.5; }
  },
  gambarProp(E) {
    const { x, y, w } = FOTOKOPI;
    const T = E.data.tahap;
    if ((T === 'macet' || T === 'cabut') && Math.floor(now / 300) % 2) r(x + w - 4, y + 8, 2, 2, '#e05a5a');
    if (T === 'cabut' || T === 'isi') {
      r(x + 3, y + 31, w - 8, 6, '#b4b8b0');          // laci bawah tertarik keluar
      r(x + 3, y + 37, w - 8, 1, '#8d948c');
    }
  },
  sortY: 121,                                      // sesudah mesin fotokopi (120), sebelum yang berdiri di depannya (140)
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bawa = null; } },
},

);
