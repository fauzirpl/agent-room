/* ==========================================================================
   TAMU TENAR — MUSIK & KREATOR
   ==========================================================================
   Enam tamu yang datang karena urusan kertas, bukan karena panggung. Semuanya
   memakai TOKOH (33-tamu-tenar-dasar.js): objek biasa di E.data, bukan Agent,
   tidak menempati slot stasiun, dan dijaga satu-per-waktu lewat
   `!TOKOH.adaTamu()` + `tamuTenar: true`. Alasan kebijakan tanpa nama ada di
   kepala 33; yang ditulis di sini cuma keputusan yang khusus milik tema ini.

   ------------------------------------------------------- kenapa temanya ini
   Musisi dan kreator adalah arketipe yang siluetnya paling murah: gitar,
   harmonika di leher, gaun bervolume, warna baju yang tidak dipakai siapa pun
   di ruangan, tongsis. Semuanya terbaca pada sosok 26 px dengan empat warna,
   dan semuanya bisa digambar dari kotak 1 px tanpa satu baris pun di room.js.
   Yang TIDAK dipakai: kacamata hitam (sudah jadi milik berkas tokoh global),
   kalung/gelang (di 26 px cuma jadi bercak), dan tulisan apa pun di badan
   (huruf 5 px lumer jadi noda — pelajaran yang sudah dibayar drawNomorAntre).

   Enam-enamnya berbenturan dengan prosedur yang berbeda, sengaja tidak ada
   yang mengulang: surat rekomendasi (paraf tidak ada orangnya), salah alamat,
   legalisir (fasilitas yang ditawarkan tidak terpakai), salah kira kurir,
   larangan merekam + nomor antrean, dan urusan yang beres duluan justru buat
   yang paling tidak berisik.

   -------------------------------------------- yang dibatalkan, dan kenapa
   1. SELISIH TINGGI BADAN di 'duo-bapak-anak-konten'. Arahan minta yang muda
      jangkung dan yang tua pendek. Tinggi sosok BUKAN parameter di
      drawPerson() — sprite-nya konstanta, dan satu-satunya sosok berukuran
      lain di repo ini (TOKOH.anak, 20 px) dibuat dengan menggambar ulang
      seluruh badan dari nol. Menggambar ulang sosok "bapak pendek" berarti
      sprite ketiga yang harus dirawat, dan pada 20 px ia akan terbaca sebagai
      ANAK — persis kebalikan dari yang dimaksud. Jadi selisihnya dibayar di
      atas kepala, bukan di badan: yang muda memakai kupluk bermahkota tinggi
      (+6 px di atas garis rambut) dan bergerak naik-turun 1 px, yang tua
      berpeci datar dan melangkah pelan (laju 38 lawan 52). Yang hilang:
      tinggi badan sungguhan. Yang dipertahankan penuh: kontras heboh–kalem,
      dan itu yang sebenarnya jadi mesin leluconnya.

   2. KURSI RUANG TUNGGU di 'penyanyi-gaun-bunga-legalisir'. Arahan minta
      gaunnya tidak muat di kursi ruang tunggu. Ruang tunggu di ruangan ini
      TIDAK PUNYA kursi: STATIONS.idle (282,288) cuma titik berdiri berjarak
      23 px, dan tidak ada satu pun prop kursi di PROPS untuk area itu.
      Menggambar kursi baru di sana berarti prop yang muncul waktu eventnya
      jalan lalu ikut hilang — properti panggung yang berpura-pura jadi
      perabot, preseden yang sudah ditolak di 28-gel4-a.js untuk meja buku
      tamu. Jadi "tidak muat" tinggal jadi kalimat petugasnya, sementara
      AKIBATNYA tetap dibuat utuh dan justru jadi bekas permanen: satu kursi
      meja rapat benar-benar ditarik keluar barisan lewat RUANGAN.geserKursi,
      dan tetap serong di situ sesudah tamunya pulang karena dia tidak pernah
      memakainya. Kursi itu punya penggambar sungguhan (drawKursiJauh membaca
      geserKursi[k]) dan pembersihnya sendiri (luruskan-kursi-rapat), jadi ia
      bekas yang gratis — bukan field RUANGAN baru yang tak tergambar.

   3. TAMU YANG NAIK KE MEJA KERJA di 'duo-bapak-anak-konten'. Arahan minta
      yang muda menaruh sesuatu di meja pegawai. Meja kerja (MEJA_KERJA_Y 350)
      dihampiri pegawainya dari DEPAN, dan satu-satunya titik yang bisa
      dicapai orang luar lewat jalur lajur ada di BELAKANG meja — tamunya akan
      terbaca berdiri di dalam meja, bukan di depannya. Diganti meja rapat:
      taplaknya nyata (RAPAT, x 170..322 y 186..226), tepi depannya terbuka,
      dan celah antara dua kursi sisi dekat (x 225..267) memang lubang yang
      pas untuk satu orang berdiri. HP-nya disandarkan di (243,216) — jauh
      dari tumpukan berkas rapat-pleno-kursi-penuh yang ada di (238,196).

   4. BALON KATA UNTUK TAMU. Orang luar tidak punya say(); satu-satunya suara
      mereka partikel 'talk' di atas kepala. Konvensi yang sama dengan
      tamu-di-ruang-tunggu dan pemohon-surat-di-loket, dan sekaligus penjaga
      kebijakan nama: kalimat yang bisa dikutip cuma keluar dari mulut
      PEGAWAI, tidak pernah dari mulut sosok yang mirip orang sungguhan.

   ------------------------------------------------ batas yang dibayar bersama
   * Satu event = satu sortY. Lima dari enam adegan utamanya di lajur bawah,
     jadi sortY-nya dipilih untuk titik BERHENTInya, bukan untuk transitnya.
     Akibat jujurnya: selagi berjalan di LANE_DOWN (y 252) mereka tergambar di
     depan dua kursi rapat sisi dekat (sortY 260, x 203..225 dan 267..289)
     yang mestinya menutupi mereka. Sekilas, beberapa frame, dan persis
     kompromi yang sama yang sudah dipilih ojol-antar-kopi (259),
     kurir-paket-datang (260), dan tamu-salah-alamat (258).
   * SATU janji yang berlaku untuk keenamnya: tamunya WAJIB sudah berjalan
     keluar bingkai sebelum durasinya habis, dalam keadaan apa pun. Durasi yang
     habis selagi tamu masih di tengah ruangan bukan adegan yang menggantung —
     dia LENYAP seketika, karena matikanEvent() mencabut E dari eventHidup dan
     gambarProp berhenti dipanggil di frame berikutnya. Karena itu tidak ada
     satu pun jalan pulang di berkas ini yang bergantung pada pemeran yang
     masih dipegang: lima event memulangkan tamunya lewat pada() yang berbunyi
     ada aktor atau tidak, dan yang keenam (legalisir, satu-satunya yang
     rantainya digerakkan pemeran dari awal sampai akhir) punya cabang
     "ditinggal di loket" tersendiri. Yang dibayar: dua event jadi punya dua
     jalan keluar yang harus sama-sama dirawat.
   * Tidak ada yang berkelas 'panggung'. Yang perlu ditahan cuma SATU adegan
     mirip per event, dan itu tugas bentrokDengan; 'panggung' akan mengunci
     seluruh katalog selama satu menit demi menahan satu tetangga.
   * Bobot rendah, cooldown 1500–5400. Cuma satu yang B.sedang
     (rapper-polo-merah-muda) karena adegannya memang paling kecil: satu salah
     kira, satu tanda tangan, selesai.
   ========================================================================== */

/* Aksesori yang cuma dipakai berkas ini. Sengaja TIDAK dinaikkan ke TOKOH:
   yang di sana isinya aksesori yang dipakai lebih dari satu berkas tema
   (kacamata hitam, topi, helm, juntai rambut), dan menumpuk gitar di situ
   membuat berkas dasar tumbuh jadi gudang.

   Semua angka turunan dari peta ketinggian drawHead(), dihitung dari titik
   kaki y: dagu y-17, isi kepala y-25..y-18, garis rambut teratas y-26,
   mata/rim kacamata y-22, mulut y-19..y-18. Badan yb-15..yb-8, sabuk yb-8,
   kaki y-8..y-1, sepatu y-1..y+1. Ditulis di sini sekali supaya enam event di
   bawah tidak masing-masing menaksir ulang. */
const TENAR_MUSIK = {

  /* Bandana: menimpa persis dua baris pita rambut yang digambar drawHead
     (r(x-4, yT+1, 8, 2, hair) = y-24..y-23), jadi ia terbaca sebagai kain
     yang MENGGANTI garis rambut, bukan sebagai balok yang menempel di dahi.
     Simpulnya dijulurkan ke sisi belakang kepala supaya arah hadap tetap
     terbaca walau wajahnya tertutup harmonika. */
  bandana(x, y, hadap, warna) {
    r(x - 4, y - 24, 8, 2, warna);
    r(x - 4, y - 24, 3, 1, lerpHex(warna, '#ffffff', 0.28));
    if (hadap === 'right') { r(x - 6, y - 23, 2, 1, warna); r(x - 7, y - 22, 1, 3, warna); }
    else if (hadap === 'left') { r(x + 4, y - 23, 2, 1, warna); r(x + 6, y - 22, 1, 3, warna); }
    else { r(x + 4, y - 23, 1, 1, warna); r(x + 4, y - 22, 1, 3, warna); }
  },

  /* Rangka harmonika. Badannya ditaruh di y-18 (dua baris: y-18..y-17), BUKAN
     di y-19 tempat mulut digambar — kalau naik satu piksel ia menutupi kumis,
     dan kumis tebal adalah separuh siluet tokoh ini. Jadi urutannya dari atas:
     kumis y-19, harmonika y-18..y-17, dua batang penyangga y-17..y-16, palang
     melintang dada y-15 (satu piksel di atas badan gitar yang mulai y-14). */
  harmonika(x, y) {
    r(x - 5, y - 15, 11, 1, '#8f979f');
    r(x - 4, y - 17, 1, 2, '#a8b1ba');
    r(x + 3, y - 17, 1, 2, '#a8b1ba');
    r(x - 3, y - 18, 7, 2, '#c9ced4');
    r(x - 3, y - 18, 7, 1, '#e4e9ee');
  },

  /* Gitar akustik: badan 12x11 menutupi dada sampai paha (y-14..y-3), yang
     memang porsi gitar besar yang digantung rendah. Lehernya dijulurkan ke
     sisi PUNGGUNG — hadap kanan berarti leher ke kiri layar — supaya tangan
     yang memetik tetap ada di sisi penonton, bukan tertutup badan. */
  gitarAkustik(x, y, hadap) {
    const kanan = hadap !== 'right';
    r(x - 6, y - 14, 12, 11, '#b07a3c');
    r(x - 6, y - 14, 12, 1, '#cf9a55');
    r(x - 6, y - 4, 12, 1, '#6b4a2a');
    r(x - 2, y - 11, 4, 4, '#3a2a1c');           // lubang suara
    r(x - 1, y - 14, 1, 3, '#e8e0c8');           // senar di atas lubang
    const lx = kanan ? x + 6 : x - 15;
    r(lx, y - 16, 9, 2, '#6b4a2a');
    r(kanan ? lx + 9 : lx - 3, y - 17, 3, 4, '#4a3423');
  },

  /* Gitar elektrik: badan LEBIH RAMPING dan LEBIH TINGGI (y-16..y-11, tepat di
     dada) — itu satu-satunya beda yang terbaca antara "gitar akustik" dan
     "gitar elektrik" pada resolusi ini, dan kebetulan juga beda yang benar:
     yang satu dipeluk, yang satu digantung tinggi di tali bahu. */
  gitarElektrik(x, y, hadap) {
    const kanan = hadap !== 'right';
    r(x - 6, y - 17, 4, 2, '#20242c');           // tali bahu
    r(x - 5, y - 16, 10, 6, '#8c1f2a');
    r(x - 5, y - 16, 10, 1, '#c94a55');
    r(x - 5, y - 11, 10, 1, '#5d1219');
    r(x - 2, y - 14, 4, 2, '#c9ced4');           // pickup
    r(x - 3, y - 12, 6, 1, '#e0d8b8');           // senar
    const lx = kanan ? x + 5 : x - 17;
    r(lx, y - 15, 12, 1, '#3a2a1c');
    r(kanan ? lx + 12 : lx - 3, y - 17, 3, 4, '#20242c');
  },

  /* Gaun bervolume: sepuluh baris melebar 6 -> 15 px dari pinggang (y-10) ke
     lantai (y-1). Ini SATU-SATUNYA cara membuat siluet yang bukan siluet
     pegawai tanpa menyentuh drawPerson: kakinya tetap digambar mesin, cuma
     tertimbun rok. Baris terakhir sengaja berhenti di y-1 supaya dua baris
     sepatu (y-1..y+1) masih menyembul — tanpa itu ia terbaca melayang. */
  gaun(x, y, warna, motif) {
    for (let i = 0; i < 10; i++) {
      const w = 6 + i;
      const kiri = x - (w >> 1);
      r(kiri, y - 10 + i, w, 1, warna);
      r(kiri + w - 1, y - 10 + i, 1, 1, sh(warna, 0.86));
    }
    if (!motif) return;
    r(x - 3, y - 7, 1, 1, motif); r(x + 2, y - 5, 1, 1, motif);
    r(x - 5, y - 3, 1, 1, motif); r(x + 4, y - 2, 1, 1, motif);
  },

  // Bunga di rambut: dua piksel di tepi kepala, di sisi yang membelakangi
  // arah hadap supaya tidak menutupi mata (y-22).
  bungaRambut(x, y, hadap) {
    const bx = hadap === 'left' ? x - 6 : x + 4;
    r(bx, y - 25, 2, 2, '#e0577f');
    r(bx, y - 26, 1, 1, '#f2a8bd');
    r(bx + 1, y - 24, 1, 1, '#c9426a');
  },

  // Tas pinggang hitam menyilang dada: tujuh piksel bertangga dari bahu kiri
  // ke pinggul kanan, lalu kantongnya. Hitam pekat di atas polo merah muda —
  // kontras tertinggi yang bisa dibuat dua warna di ruangan ini.
  tasMenyilang(x, y) {
    for (let i = 0; i < 7; i++) r(x - 4 + i, y - 16 + i, 2, 1, '#16181c');
    r(x + 1, y - 11, 6, 4, '#20242c');
    r(x + 1, y - 11, 6, 1, '#3a3f45');
    r(x + 3, y - 10, 2, 1, '#c9ced4');
  },

  // Tongsis: batang 12 px + kotak HP 3x4 di ujungnya. Waktu tidak merekam,
  // seluruh rakitannya turun 10 px — batangnya tetap ada (dia tidak
  // memasukkannya ke tas), cuma layarnya padam. Itu yang membuat "dimatikan"
  // terbaca sebagai keputusan, bukan sebagai benda yang menghilang.
  tongsis(x, y, hadap, rekam) {
    const sx = hadap === 'left' ? x - 7 : x + 6;
    const yb = rekam ? y - 26 : y - 16;
    r(sx, yb, 1, 12, '#4a5058');
    r(sx - 1, yb - 4, 3, 4, '#20242c');
    if (!rekam) return;
    r(sx - 1, yb - 3, 3, 2, '#5b8ad4');
    r(sx - 1, yb - 3, 1, 1, '#a8cdf0');
  },

  // Kupluk bermahkota tinggi: pita di garis rambut (y-26) lalu mahkota 4 px
  // sampai y-30 dan bulatan di puncak y-32. Enam piksel di atas kepala
  // telanjang — selisih yang dipakai menggantikan tinggi badan, lihat catatan
  // 1 di kepala berkas.
  kupluk(x, y, warna) {
    r(x - 4, y - 26, 8, 1, sh(warna, 0.78));
    r(x - 4, y - 30, 8, 4, warna);
    r(x - 4, y - 30, 3, 1, lerpHex(warna, '#ffffff', 0.3));
    r(x - 1, y - 32, 2, 2, '#e8c15a');
  },
};

daftarEvent(

/* --------------------------------------------------------------- 1 dari 6 ---
   Legenda balada yang datang minta surat rekomendasi izin keramaian.

   Beat "satu pegawai SENIOR sadar duluan dan BERDIRI" diterjemahkan jadi
   "meninggalkan mejanya dan menghampiri": di ruangan ini semua orang memang
   sudah berdiri, jadi satu-satunya cara menunjukkan bahwa dia bangkit adalah
   dia PINDAH. Yang muda tidak dibuat bereaksi sama sekali sampai detik 9,
   dan waktu akhirnya bereaksi cuma lewat TOKOH.tengok() — menoleh sebentar
   lalu kembali kerja, bukan mengenali.

   perluAktor: true, dan seniornya dipinjam di mulai() bukan di tick(): tanpa
   satu orang yang mengenalinya, yang tersisa cuma orang berbaju hitam berdiri
   diam 50 detik. Dia dilepas lebih awal (lepaskanAktor) begitu kabar buruknya
   disampaikan, supaya tidak tertahan menonton tamunya berjalan keluar. */
{
  id: 'pemusik-bandana-harmonika',
  tamuTenar: true,
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 54,
  perluAktor: true,
  // Bentrok dengan menunggu-paraf: antiklimaksnya persis sama (yang berwenang
  // tidak di tempat), dan dua adegan "menunggu paraf yang tidak akan datang"
  // sekaligus bikin yang satu terbaca sebagai gema yang lain.
  bentrokDengan: ['menunggu-paraf'],
  babak: { apel: 0, istirahat: 0.4, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 15,
  mulai(E) {
    /* Titik berhenti (166,284), ketiga jaraknya dihitung dari angka nyata,
       bukan ditaksir: 17 px di KANAN ujung kain bendera (drawBendera: tiang
       x 132, alas x 127..138, kain x+2+i untuk i 0..15 = x 134..149), 70 px
       di kiri slot ruang tunggu paling kiri yang biasa terisi (282 +
       slotKe(4, 23) = 236), dan 38 px di atas rangka meja kerja yang mulai di
       y 322 (papannya sendiri baru di y 330). Lantai kosong betulan. */
    E.data.t = TOKOH.buat({
      pal: { main: '#22252b', pants: '#2f3a4a', skin: '#d9a273', hair: '#3a2a1c', kumis: true },
      aksesori(x, y, hadap, o) {
        TENAR_MUSIK.gitarAkustik(x, y, hadap);
        TENAR_MUSIK.bandana(x, y, hadap, '#b8443a');
        TENAR_MUSIK.harmonika(x, y);
        // senar bergetar cuma selagi dipetik: satu piksel yang berkedip di
        // atas lubang suara, bukan animasi tangan yang tidak ada posenya
        if (o.petik && Math.sin(now / 70) > 0) r(x - 1, y - 13, 1, 2, '#fff4d0');
      },
    }, false, LANE_DOWN);
    TOKOH.antar(E.data.t, 166, 284);

    const a = pemeran(E, ['pranata_madya', 'kabid', 'kasi', 'sekdis']);
    E.data.a = a;
    if (a) a.doingEvent = 'melayani tamu minta surat rekomendasi';
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 42);
    if (T.fase === 'masuk' && sampai) { T.fase = 'tunggu'; T.hadap = 'down'; }

    // Potret pemeran bisa basi kapan saja: handle() memanggil lepasDariEvent()
    // begitu tool call sungguhan membutuhkannya. Diperiksa SEBELUM dipakai,
    // bukan sesudah — semua perintah di bawah ini lewat jalur ini.
    if (E.data.a && E.data.a.eventKerja !== E) E.data.a = null;
    const a = E.data.a;

    // Yang senior sadar duluan lalu meninggalkan mejanya. Tanpa dia, tamunya
    // tetap datang, menunggu, memetik gitar, dan pulang — sepi, tapi jujur.
    pada(E, 6, () => {
      if (!a) return;
      hadapkan(a, T.x, T.y);
      a.say('lho... itu yang di TV itu, kan?');
      spawn('talk', a.x, a.y - 26);
      // (152,278): berdiri 14 px di kiri tamunya, dan sosoknya (x 147..157)
      // sudah lepas dari alas tiang bendera yang berhenti di x 139.
      a.goToXY(152, 278, 'right');
    });

    // Yang muda baru menoleh tiga detik kemudian, dan cuma menoleh.
    pada(E, 9, () => TOKOH.tengok(S, T.x, T.y, 1100));

    // Memetik gitar sambil menunggu paraf: partikel 'talk' pelan, tidak
    // menyentuh busyUntil siapa pun, jadi ruangan tetap bekerja di belakangnya.
    if (E.umur > 14 && E.umur < 34) {
      T.petik = true;
      if (Math.random() < 1.6 * dt) spawn('talk', T.x + acak(-10, 10), T.y - 30);
      if (Math.random() < 0.5 * dt) spawn('idea', T.x + acak(-6, 6), T.y - 34);
    } else {
      T.petik = false;
    }

    // Antiklimaks: yang berwenang paraf sedang di luar. Seniornya dilepas di
    // sini juga — perannya sudah habis, dan menahannya 20 detik sisa durasi
    // cuma untuk menonton berarti satu meja kosong tanpa sebab.
    pada(E, 34, () => {
      if (!a) return;
      hadapkan(a, T.x, T.y);
      a.say('yang paraf sedang di luar, Pak... besok saja ya');
      lepaskanAktor(a);            // ikut mereset pose, bawa, laju, dan doingEvent
      a.goTo(stasiunPulang(a));
      E.data.a = null;
    });

    pada(E, 38, () => {
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 30);
      blip(300, 0.06);
      TOKOH.pulangkan(T, false);
    });

    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < TOKOH.KELUAR_KIRI || T.x > TOKOH.KELUAR_KANAN) return;
    TOKOH.gambar(T);
  },
  // sortY 284 = titik berhentinya, bukan lajur transitnya. Lihat catatan
  // "batas yang dibayar bersama" di kepala berkas.
  sortY: 284,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) a.doingEvent = '';
  },
},

/* --------------------------------------------------------------- 2 dari 6 ---
   Raja panggung dangdut. Satu-satunya event di berkas ini yang benar-benar
   mengubah keadaan ruangan (MOD.kipas), dan itu sengaja: goyangnya harus
   terasa di perabot, bukan cuma di partikel.

   Bukan kelas 'panggung' walaupun adegannya paling ramai. Yang perlu ditahan
   cuma SATU tetangga — tamu-salah-alamat, yang antiklimaksnya identik — dan
   itu tepat pekerjaan bentrokDengan. Memakai 'panggung' berarti mengunci
   seluruh katalog 50 detik demi menahan satu event.

   TANPA perluAktor: goyangan ruangan tidak butuh lawan main, dan kalau
   seluruh ruangan sedang mengerjakan tool call sungguhan, adegannya tetap
   masuk akal — dia masuk, ruangan melirik sambil terus bekerja, dia pulang
   sendiri. Pegawai yang menjelaskan salah alamat baru dicari di detik 34,
   dan boleh tidak ketemu. */
{
  id: 'pemusik-jas-berkilau-gitar-elektrik',
  tamuTenar: true,
  kelas: 'latar', bobot: B.langka, cooldown: 3600, durasi: 52,
  bentrokDengan: ['tamu-salah-alamat'],
  babak: { apel: 0, istirahat: 0.5, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 9 && S.jam < 15,
  mulai(E) {
    /* Titik berhenti (246,270): celah antara dua kursi rapat sisi dekat
       (drawKursiDekat menggambarnya di x 203..225 dan 267..289), 11 px di
       bawah kaki kursi yang berhenti di y 259, dan 18 px di atas barisan
       ruang tunggu (y 288). Panggung kecil yang memang kosong. */
    E.data.t = TOKOH.buat({
      pal: { main: '#20232b', pants: '#1a1d24', skin: '#d9a273', hair: '#141010', pattern: '#e8c15a' },
      aksesori(x, y, hadap) {
        TOKOH.juntai(x, y, hadap, '#141010', 10);      // gondrong ikal sebahu
        TENAR_MUSIK.gitarElektrik(x, y, hadap);
      },
    }, true, LANE_DOWN);
    TOKOH.antar(E.data.t, 246, 270);
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 40);
    if (T.fase === 'masuk' && sampai) { T.fase = 'panggung'; T.hadap = 'down'; }

    if (E.data.a && E.data.a.eventKerja !== E) E.data.a = null;
    const a = E.data.a;

    pada(E, 8, () => {
      const p = TOKOH.kenali(E, T, 'itu... yang suka nyanyi di layar kaca itu!');
      if (p) { E.data.a = p; p.doingEvent = 'terpana lihat tamu'; }
    });
    pada(E, 10, () => TOKOH.tengok(S, T.x, T.y, 1400));

    // Yang terpana DILEPAS lagi setelah enam detik. Menahannya sampai
    // antiklimaks di detik 34 berarti satu meja kosong selama 26 detik dengan
    // keterangan panel "terpana lihat tamu" — dan justru menutup jalan
    // pencarian pemeran di bawah, yang syaratnya tidak ada aktor yang dipegang.
    pada(E, 14, () => {
      if (!a) return;
      lepaskanAktor(a);            // ikut mereset pose, bawa, laju, dan doingEvent
      a.goTo(stasiunPulang(a));
      E.data.a = null;
    });

    /* Ruangan bergoyang, detik 11..34. MOD DIRESET TIAP FRAME, jadi kipasnya
       wajib ditulis ulang di sini alih-alih disetel sekali di mulai().
       TOKOH.gempar() boleh dipanggil tiap frame (cuma partikel); TOKOH.tengok()
       TIDAK, karena ia menaikkan busyUntil — dipanggil per 2,4 detik dengan
       tahanan 700 ms saja, jadi ruangan tertahan kurang dari sepertiga waktu
       dan sesi sungguhan tetap jalan di belakangnya. */
    if (E.umur > 11 && E.umur < 34) {
      MOD.kipas = 1.8;
      TOKOH.gempar(T.x, T.y, dt, 1.3);
      if (E.umur > (E.data.ketukPada || 0)) {
        E.data.ketukPada = E.umur + 2.4;               // tenggat disimpan, dibanding manual
        TOKOH.tengok(S, T.x, T.y, 700);
        // ketukan jari di meja: satu bunyi pendek + satu debu di titik
        // pegawai menganggur yang paling dekat, bukan di semua orang
        const o = (S.orang || []).find((p) => p && !p.adaTugas && !p.eventKerja && !p.path.length);
        if (o) { spawn('step', o.x + 5, o.y, '#d9c9a0'); blip(196, 0.04); }
      }
    }

    // Antiklimaks: dia salah alamat. Dicari SESUDAH goyangnya reda supaya
    // pegawainya tidak dipinjam 25 detik cuma untuk satu kalimat.
    if (!a && !E.data.cari && E.umur > 34) {
      E.data.cari = true;
      const p = pemeranDekat(E, T.x, T.y, 260) || pemeran(E, ['humas']);
      if (p) {
        E.data.a = p;
        p.doingEvent = 'menunjukkan dinas sebelah';
        p.pose = 'nunjuk';
        hadapkan(p, T.x, T.y);
        p.say('ini Dinas AI, Pak. Panggungnya urusan dinas sebelah');
      }
    }

    pada(E, 39, () => {
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 32);
      blip(240, 0.07);
      TOKOH.pulangkan(T, true);
      if (a) { a.pose = null; a.doingEvent = ''; }
    });

    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < TOKOH.KELUAR_KIRI || T.x > TOKOH.KELUAR_KANAN) return;
    TOKOH.gambar(T);
  },
  sortY: 270,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.pose = null; a.doingEvent = ''; }
  },
},

/* --------------------------------------------------------------- 3 dari 6 ---
   Penyanyi indie muda, urusan legalisir ijazah.

   Rantai petugasnya tiga perjalanan (tamu -> meja stempel -> kursi rapat ->
   tamu), pola yang sama dengan pemohon-surat-di-loket. Yang berbeda: tiap
   tahap dijaga tenggat MINIMUM (E.data.siapPada, disimpan sekali lalu
   dibandingkan manual) selain a.diam. Alasannya bukan gaya — di harness
   a.goTo() adalah no-op dan a.diam selalu true, jadi rantai yang cuma
   bergantung pada a.diam akan melompat tiga tahap dalam satu frame dan
   menguji rantai yang tidak pernah benar-benar terjadi di peramban.

   Bekasnya kursi rapat slot 3 (kx = 246 + slotKe(3) = 284, digambar
   drawKursiJauh di y 169..186) yang ditarik keluar barisan lewat
   RUANGAN.geserKursi[3]. Petugas menariknya dari (284,166) — dua piksel di
   bawah LANE_UP, tepat di belakang sandaran kursi itu, dan segaris lurus di
   bawah meja stempel tempat dia baru saja mengecap. Satu langkah menurun,
   bukan perjalanan tambahan. */
{
  id: 'penyanyi-gaun-bunga-legalisir',
  tamuTenar: true,
  kelas: 'latar', bobot: B.jarang, cooldown: 2100, durasi: 62,
  perluAktor: true,
  // Dua adegan yang sama-sama menumpuk orang di meja stempel bikin salah satu
  // capnya tidak terbaca milik siapa.
  bentrokDengan: ['rebutan-stempel'],
  babak: { apel: 0, istirahat: 0.4, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 14,
  mulai(E) {
    // Titik berhenti (312,274): 78 px di kiri kaki kipas berdiri (drawKipas
    // menggambar alasnya cx-10..cx+10 dengan cx 400, jadi tepi kirinya 390)
    // dan 14 px di atas barisan ruang tunggu (STATIONS.idle y 288), jadi dia
    // terbaca mengantre tanpa menempati satu pun slotnya.
    E.data.t = TOKOH.buat({
      pal: { main: '#e2d6bc', pants: '#8d7f66', skin: '#f0c79c', hair: '#2b2118', pattern: '#b0688a' },
      aksesori(x, y, hadap) {
        TENAR_MUSIK.gaun(x, y, '#e2d6bc', '#b0688a');
        TENAR_MUSIK.bungaRambut(x, y, hadap);
      },
    }, true, LANE_DOWN);
    TOKOH.antar(E.data.t, 312, 274);
    E.data.tahap = 0;

    const a = pemeran(E, ['arsiparis', 'humas', 'pranata_pertama']);
    E.data.a = a;
    if (a) a.doingEvent = 'melayani legalisir ijazah';
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 40);
    if (T.fase === 'masuk' && sampai) { T.fase = 'loket'; T.hadap = 'left'; }

    if (E.data.a && E.data.a.eventKerja !== E) E.data.a = null;
    const a = E.data.a;

    pada(E, 6, () => {
      if (!a) return;
      hadapkan(a, T.x, T.y);
      a.say('lagunya yang itu... punya Mbak, ya?');
      spawn('talk', a.x, a.y - 26);
      a.goToXY(298, 258, 'right');
      E.data.siapPada = E.umur + 5;                 // tenggat minimum satu perjalanan
    });
    pada(E, 9, () => TOKOH.tengok(S, T.x, T.y, 1000));

    /* Petugasnya hilang di tengah rantai — direbut tool call sungguhan, yang
       boleh terjadi di detik mana pun. Rantai tahap di bawah memang berhenti
       di situ (itu benar: yang melayani sudah tidak ada), TAPI TAMUNYA TIDAK
       BOLEH IKUT BERHENTI. Tanpa cabang ini dia berdiri diam di (312,274)
       sampai durasi 62 detik habis, lalu LENYAP SEKETIKA di tengah ruangan:
       matikanEvent() mencabut E dari eventHidup, jadi gambarProp berhenti
       dipanggil di frame berikutnya dan tidak ada fade apa pun. Ini satu-
       satunya event di berkas ini yang rantainya digerakkan pemeran dari awal
       sampai akhir, jadi satu-satunya yang punya lubang ini — lima yang lain
       memulangkan tamunya lewat pada() yang berbunyi ada aktor atau tidak.

       Delapan detik menunggu, bukan langsung balik badan: orang yang loketnya
       ditinggal memang menunggu dulu sebelum menyerah, dan itu juga memberi
       ruang kalau pemerannya cuma sebentar direbut. Tenggatnya disimpan
       SEKALI lalu dibandingkan manual — pada() cuma sah untuk detik tetap.
       Dipatok maksimal detik 50 supaya perjalanan pulangnya (dari (312,274)
       ke tepi kanan lewat lajur: 22 + 128 + 70 = 220 px pada laju 40 = 5,5
       detik) masih muat utuh di dalam durasi. */
    if (!a) {
      if (T.fase !== 'pulang') {
        if (E.data.ditinggalPada == null) E.data.ditinggalPada = Math.min(E.umur + 8, 50);
        else if (E.umur > E.data.ditinggalPada) {
          for (let i = 0; i < 2; i++) spawn('talk', T.x, T.y - 32);
          TOKOH.pulangkan(T, true);
        }
      }
      TOKOH.tutupKalauKosong(E, T);
      return;
    }

    // tahap 0 -> 1: map ijazah diambil, dibawa ke meja stempel
    if (E.data.tahap === 0 && T.fase === 'loket' && a.diam
      && E.data.siapPada != null && E.umur > E.data.siapPada) {
      E.data.tahap = 1;
      a.bawa = 'map';
      a.say('ijazahnya saya legalisir dulu ya, Bu');
      a.goTo('edit');
      E.data.siapPada = E.umur + 6;
      for (let i = 0; i < 2; i++) spawn('talk', T.x, T.y - 30);
    } else if (E.data.tahap === 1 && a.diam && E.umur > E.data.siapPada) {
      E.data.tahap = 2;
      hentakkanStempel(a);
      blip(300, 0.07);
      E.data.siapPada = E.umur + 1.6;
    } else if (E.data.tahap === 2 && E.umur > E.data.siapPada) {
      E.data.tahap = 3;
      hentakkanStempel(a);                          // dua cap: legalisir + tanggal
      blip(300, 0.07);
      a.bawa = 'kertas';
      /* (284,166): DI BELAKANG kursi rapat slot 3, bukan di titik duduknya
         (284,192). Titik duduk itu bisa sedang ditempati peserta rapat
         sungguhan, dan dua sosok berimpit di satu kursi terbaca sebagai bug;
         lagi pula kursi memang ditarik dari belakang. LANE_UP 164, jadi ini
         cuma dua piksel keluar lajur — bukan perjalanan tambahan. */
      a.goToXY(284, 166, 'down');
      E.data.siapPada = E.umur + 4;
    } else if (E.data.tahap === 3 && a.diam && E.umur > E.data.siapPada) {
      /* Kursi ditarik keluar barisan. geserKursi[k] menaikkan kursi
         (drawKursiJauh: ky = 169 - offset), artinya kursinya mundur menjauhi
         meja — persis gerak "silakan duduk". 4 px cukup terbaca di 480x356
         tanpa membuatnya menabrak lajur atas (LANE_UP 164). */
      E.data.tahap = 4;
      RUANGAN.geserKursi[3] = 4;
      spawn('dust', 278, 186); spawn('dust', 290, 186);
      blip(230, 0.06);
      a.pose = 'nunjuk';
      hadapkan(a, T.x, T.y);
      a.say('duduk dulu saja, Bu — ruang tunggu sempit, pakai kursi rapat');
      E.data.siapPada = E.umur + 3;
    } else if (E.data.tahap === 4 && E.umur > E.data.siapPada) {
      // Dia tidak beranjak: gaunnya tidak akan lewat celah kursi-meja. Yang
      // tersisa cuma partikel 'talk' — orang luar tidak punya balon.
      E.data.tahap = 5;
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 32);
      a.pose = null;
      a.goToXY(298, 258, 'right');
      E.data.siapPada = E.umur + 5;
    } else if (E.data.tahap === 5 && a.diam && E.umur > E.data.siapPada) {
      E.data.tahap = 6;
      a.bawa = null;
      a.say('ini sudah dilegalisir, Bu. Kursinya biar saya rapikan nanti');
      T.bungkukSampai = E.umur + 2.2;               // membungkuk: badan turun 2 px
      E.data.siapPada = E.umur + 3;
    } else if (E.data.tahap === 6 && E.umur > E.data.siapPada) {
      E.data.tahap = 7;
      TOKOH.pulangkan(T, true);
      lepaskanAktor(a);            // ikut mereset pose, bawa, laju, dan doingEvent
      a.goTo(stasiunPulang(a));
      E.data.a = null;
    }

    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < TOKOH.KELUAR_KIRI || T.x > TOKOH.KELUAR_KANAN) return;
    const bungkuk = T.bungkukSampai && E.umur < T.bungkukSampai ? 2 : 0;
    TOKOH.gambar(bungkuk ? { ...T, y: T.y + bungkuk } : T);
  },
  sortY: 274,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.pose = null; a.bawa = null; a.doingEvent = ''; }
    // RUANGAN.geserKursi SENGAJA tidak dibersihkan: itu bekasnya, dan
    // luruskan-kursi-rapat yang berhak meluruskannya lagi.
  },
},

/* --------------------------------------------------------------- 4 dari 6 ---
   Yang polo merah mudanya bikin dia terbaca dari seberang ruangan. Warna itu
   dipilih karena TIDAK ADA di JABATAN mana pun: yang paling dekat cuma humas
   ('#8c3a48' marun tua dengan motif '#e5a3ad'), jadi merah muda pekat di
   badan penuh tidak pernah bertabrakan dengan pegawai.

   Adegan terkecil di berkas ini — satu salah kira, satu tanda tangan, selesai
   — jadi ia yang berbobot B.sedang. Leluconnya bertumpu pada dia yang TIDAK
   protes: dia menandatangani buku terima paket lebih dulu, baru menjelaskan.
   Yang jadi bahan tertawaan petugasnya, bukan tamunya, persis aturan main
   kategori ini. */
{
  id: 'rapper-polo-merah-muda',
  tamuTenar: true,
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 40,
  perluAktor: true,
  // Dua adegan "terima paket, tanda tangan di buku" sekaligus bikin yang satu
  // terbaca sebagai kurir kedua yang datang di menit yang sama.
  bentrokDengan: ['kurir-paket-datang'],
  babak: { apel: 0.2, istirahat: 0.5, pulang: 0.3, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 16,
  mulai(E) {
    // Titik berhenti (330,268): 60 px di kiri tepi alas kipas berdiri (390,
    // lihat drawKipas) dan 106 px di kiri tong sampah (drawTongSampah tx 437,
    // bibirnya 436..446) — lantai kosong di sisi kanan lajur bawah, jauh dari
    // sekat pantri yang mulai di x 414 (drawPantry px).
    E.data.t = TOKOH.buat({
      pal: { main: '#ef6a9c', pants: '#20242c', skin: '#c98f63', hair: '#161210' },
      aksesori(x, y) { TENAR_MUSIK.tasMenyilang(x, y); },
    }, true, LANE_DOWN);
    TOKOH.antar(E.data.t, 330, 268);

    const a = pemeran(E, ['magang', 'pranata_pertama', 'humas']);
    E.data.a = a;
    if (a) {
      a.doingEvent = 'menerima paket (katanya)';
      a.bawa = 'papan';                              // buku terima paket
      a.goToXY(352, 266, 'left');
    }
  },
  tick(E, dt) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 44);
    if (T.fase === 'masuk' && sampai) { T.fase = 'loket'; T.hadap = 'right'; }

    if (E.data.a && E.data.a.eventKerja !== E) E.data.a = null;
    const a = E.data.a;

    pada(E, 6, () => {
      if (!a) return;
      hadapkan(a, T.x, T.y);
      a.say('paketnya taruh sini saja, Mas. Tanda tangan dulu ya');
      spawn('talk', a.x, a.y - 26);
    });

    // Dia menandatangani saja. Tidak ada protes, tidak ada penjelasan dulu —
    // itu seluruh isi leluconnya, jadi jeda 4 detiknya dijaga tetap panjang.
    pada(E, 11, () => {
      T.tandaTangan = true;
      spawn('paper', T.x, T.y - 22);
      blip(420, 0.05);
    });

    pada(E, 16, () => {
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 30);
      if (!a) return;
      a.say('...loh. Jadi Mas bukan yang antar paket?');
    });

    pada(E, 21, () => {
      if (!a) return;
      a.bawa = null;
      a.say('maaf, Mas — silakan, ruang kadisnya lurus lalu kanan');
      spawn('ping', a.x, a.y - 28);
      lepaskanAktor(a);            // ikut mereset pose, bawa, laju, dan doingEvent
      a.goTo(stasiunPulang(a));
      E.data.a = null;
    });

    pada(E, 25, () => { TOKOH.pulangkan(T, true); });

    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < TOKOH.KELUAR_KIRI || T.x > TOKOH.KELUAR_KANAN) return;
    TOKOH.gambar(T);
    // Bolpoin yang masih dipegang sesudah tanda tangan — satu piksel biru di
    // ujung tangan, sisi yang benar menurut arah hadapnya.
    if (!T.tandaTangan) return;
    const x = Math.round(T.x), y = Math.round(T.y);
    r(T.hadap === 'left' ? x - 8 : x + 7, y - 11, 1, 3, '#1c4e8a');
  },
  sortY: 268,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.bawa = null; a.doingEvent = ''; }
  },
},

/* --------------------------------------------------------------- 5 dari 6 ---
   Kreator yang merekam sambil berjalan. Satu-satunya event di berkas ini yang
   memakai bekas RUANGAN.antre — dan itu yang benar untuk dia: dia satu-satunya
   yang akhirnya benar-benar mengantre seperti pemohon biasa.

   TANPA perluAktor, sengaja. Kalau seluruh ruangan sedang mengerjakan tool
   call sungguhan, tidak ada yang menegur: kameranya TETAP menyala, dia tetap
   mengambil nomor antrean (mengambil nomor tidak butuh disuruh siapa pun),
   lalu pulang masih sambil merekam. Itu bukan adegan yang gagal — itu adegan
   yang lain, dan kebetulan juga sindiran yang lebih tajam.

   Bentrok dengan wartawan-motret: dua orang luar yang sama-sama mengarahkan
   lensa ke ruangan di menit yang sama bikin dua-duanya kehilangan artinya. */
{
  id: 'kreator-berhijab-rekam-jalan',
  tamuTenar: true,
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 56,
  bentrokDengan: ['wartawan-motret'],
  babak: { apel: 0, istirahat: 0.6, pulang: 0.3, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 15,
  mulai(E) {
    E.data.t = TOKOH.buat({
      rekam: true,
      pal: { main: '#e8e4dc', pants: '#3a3f45', skin: '#eec39a', head: 'jilbab', jilbab: '#3a6b6b' },
      aksesori(x, y, hadap, o) { TENAR_MUSIK.tongsis(x, y, hadap, o.rekam); },
    }, false, LANE_DOWN);
    // Menyeberang ruangan lebih dulu (x -16 -> 300 di LANE_DOWN): "merekam
    // sambil berjalan" cuma terbaca kalau jalannya panjang. Lajunya 34, lebih
    // pelan dari tamu lain, karena dia sedang bicara ke kamera.
    E.data.t.wp = [[300, LANE_DOWN]];
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, T.fase === 'pulang' ? 44 : 34);
    if (T.fase === 'masuk' && sampai) { T.fase = 'rekam'; T.hadap = 'down'; }
    if (T.fase === 'ke-loket' && sampai) { T.fase = 'antre'; T.hadap = 'down'; }

    if (E.data.a && E.data.a.eventKerja !== E) E.data.a = null;
    const a = E.data.a;

    // Layar menyala: satu 'ping' sesekali di ujung tongsis, 30 px di atas
    // titik kakinya (batang 12 px + HP 4 px di atas kepala setinggi 26 px).
    if (T.rekam && Math.random() < 1.1 * dt) spawn('ping', T.x + 6, T.y - 32);

    pada(E, 7, () => {
      const p = TOKOH.kenali(E, T, 'eh — yang suka bikin video itu bukan?');
      if (p) { E.data.a = p; p.doingEvent = 'menegur tamu yang merekam'; }
    });
    pada(E, 10, () => TOKOH.tengok(S, T.x, T.y, 1000));

    pada(E, 14, () => {
      if (!a) return;
      hadapkan(a, T.x, T.y);
      a.pose = 'nunjuk';
      a.say('maaf, Mbak — area layanan tidak boleh direkam');
      E.data.ditegur = true;
    });

    pada(E, 18, () => {
      /* Kameranya cuma mati kalau BENAR-BENAR ada yang menegur. Sebelumnya
         beat ini tidak bersyarat, jadi di ruangan yang seluruh pegawainya
         sedang mengerjakan tool call sungguhan lampunya tetap padam sendiri
         seolah ada yang bicara — persis cabang gagal yang dijanjikan komentar
         kepala event ini justru tidak pernah terjadi. Tanpa penegur dia terus
         merekam sampai keluar bingkai; nomor antreannya tetap diambil, karena
         mengambil nomor tidak butuh disuruh siapa pun. */
      if (!E.data.ditegur || !T.rekam) return;
      T.rekam = false;
      blip(210, 0.06);
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 30);
      if (a) a.pose = null;
    });

    /* Dia minta izin lewat loket seperti orang lain. Nomornya benar-benar maju
       di papan (drawNomorAntre membaca RUANGAN.antre), jadi bekasnya kelihatan
       di dinding, bukan cuma di E.data. 'ping' di (218,34) titik papan itu. */
    pada(E, 22, () => {
      T.fase = 'ke-loket';
      // Dua titik ditulis tangan, bukan lewat TOKOH.jalur(): jaraknya cuma
      // 26 px di dalam satu lajur, dan jalur() akan menambahkan perhentian
      // di lajur yang justru membuatnya melangkah mundur dulu.
      T.wp = [[300, 268], [286, 276]];
      E.data.nomor = TOKOH.ambilNomor();
      spawn('ping', 218, 34);
      blip(560, 0.05);
    });

    pada(E, 28, () => {
      if (!a) return;
      hadapkan(a, T.x, T.y);
      a.say('nomor ' + esc(String(E.data.nomor || 0)) + ', ya. Nanti dipanggil');
      lepaskanAktor(a);            // ikut mereset pose, bawa, laju, dan doingEvent
      a.goTo(stasiunPulang(a));
      E.data.a = null;
    });

    pada(E, 34, () => {
      for (let i = 0; i < 2; i++) spawn('talk', T.x, T.y - 30);
      TOKOH.pulangkan(T, false);
    });

    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < TOKOH.KELUAR_KIRI || T.x > TOKOH.KELUAR_KANAN) return;
    TOKOH.gambar(T);
  },
  // 276 = titik berhentinya di depan barisan ruang tunggu, bukan lajur
  // transitnya (252). Konsekuensinya sama dengan tamu lain; lihat kepala berkas.
  sortY: 276,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.pose = null; a.doingEvent = ''; }
  },
},

/* --------------------------------------------------------------- 6 dari 6 ---
   Dua sosok berdampingan: yang muda heboh, yang tua kalem.

   Satu hal yang dijaga ketat di seluruh event ini: BAPAKNYA TIDAK PERNAH JADI
   BAHAN TERTAWAAN. Dia tidak tersesat, tidak salah sebut, tidak bingung.
   Dia menyapa duluan, dilayani duluan, dan selesai duluan — dan satu-satunya
   yang lucu adalah anaknya yang sudah sampai lebih dulu (laju 52 lawan 38,
   tiba di detik ~5 lawan ~9) tapi tetap kalah cepat urusannya. Balon kata
   petugas ke bapaknya sengaja ramah dan biasa saja; tidak ada satu kalimat
   pun yang menertawakan dia.

   Selisih tingginya dibayar di kupluk, bukan di sprite — lihat catatan 1 di
   kepala berkas. Gerak naik-turun 1 px yang muda dipasang di titik GAMBAR
   (objek salinan dengan y digeser), bukan di E.data.m.y, supaya jalur
   waypoint-nya tidak ikut bergetar dan langkah()-nya tetap menghitung jarak
   ke titik yang tetap. */
{
  id: 'duo-bapak-anak-konten',
  tamuTenar: true,
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 52,
  perluAktor: true,
  /* Yang muda berdiri di tepi depan meja rapat dan menyandarkan HP di
     taplaknya. Kalau sembilan kursi sedang penuh (rapat-pleno-kursi-penuh
     syaratnya kursiKosong() === 0), adegan yang sama berubah jadi "orang asing
     merekam rapat yang sedang berlangsung" — lelucon lain, dan yang lebih
     tidak enak. Ditahan di sini, bukan dibiarkan jadi kebetulan. */
  bentrokDengan: ['rapat-pleno-kursi-penuh'],
  babak: { apel: 0, istirahat: 0.5, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 9 && S.jam < 15 && S.orang.length >= 2,
  mulai(E) {
    /* Anak berhenti di (246,236): celah 42 px antara dua kursi rapat sisi
       dekat (x 203..225 dan 267..289), 10 px di depan tepi meja rapat yang
       berhenti di y 226 (RAPAT.yF). Bapak berhenti di (188,264): 15 px di kiri
       kursi dekat paling kiri (203) dan 39 px di kanan ujung kain bendera
       (drawBendera: kain x 134..149, alasnya sendiri cuma x 127..138). */
    E.data.m = TOKOH.buat({
      heboh: true,
      pal: { main: '#2a2f3a', pants: '#454b56', skin: '#e8b98b', hair: '#1a1410' },
      aksesori(x, y) { TENAR_MUSIK.kupluk(x, y, '#c9452f'); },
    }, true, LANE_DOWN);
    E.data.b = TOKOH.buat({
      pal: { main: '#7a6a4a', pants: '#3a3f45', skin: '#d9a273', hair: '#3a3028',
        head: 'peci', kumis: true, pattern: '#c9a05a' },
    }, true, LANE_DOWN);
    E.data.b.x = TOKOH.MASUK_KANAN + 18;           // berdampingan, bukan berimpit
    TOKOH.antar(E.data.m, 246, 236);
    TOKOH.antar(E.data.b, 188, 264);

    const a = pemeran(E, ['kasi', 'pranata_madya', 'humas', 'arsiparis']);
    E.data.a = a;
    if (a) a.doingEvent = 'melayani tamu';
  },
  tick(E, dt, S) {
    const M = E.data.m, Bp = E.data.b;
    const mSampai = TOKOH.langkah(M, dt, M.fase === 'pulang' ? 58 : 52);
    const bSampai = TOKOH.langkah(Bp, dt, 38);
    if (M.fase === 'masuk' && mSampai) {
      M.fase = 'pasang'; M.hadap = 'up';
      E.data.hp = true;                            // HP disandarkan di taplak
      blip(520, 0.04);
      spawn('ping', 243, 212);
    }
    if (Bp.fase === 'masuk' && bSampai) { Bp.fase = 'diam'; Bp.hadap = 'down'; }

    if (E.data.a && E.data.a.eventKerja !== E) E.data.a = null;
    const a = E.data.a;

    // Bapaknya yang menyapa duluan — begitu dia sampai, bukan di detik tetap:
    // perjalanannya paling lambat dan lamanya bergantung dari mana dia masuk.
    if (Bp.fase === 'diam' && !E.data.sapa) {
      E.data.sapa = true;
      for (let i = 0; i < 2; i++) spawn('talk', Bp.x, Bp.y - 30);
      TOKOH.tengok(S, Bp.x, Bp.y, 900);
      if (a) {
        hadapkan(a, Bp.x, Bp.y);
        a.say('eh, Bapak. Mari, Pak, sini saja');
        a.goToXY(212, 268, 'left');
        E.data.siapPada = E.umur + 4;              // tenggat minimum satu perjalanan
      }
    }

    if (!a) {
      // Tidak ada yang melayani: keduanya tetap harus pulang, dan itu ditangani
      // pada() di bawah — bukan dibiarkan menggantung sampai durasi habis.
      pada(E, 34, () => {
        E.data.hp = false;
        TOKOH.pulangkan(M, true);
        TOKOH.pulangkan(Bp, true);
      });
    } else if (E.data.sapa && !E.data.layan && a.diam
      && E.data.siapPada != null && E.umur > E.data.siapPada) {
      E.data.layan = true;
      a.bawa = 'kertas';
      a.say('suratnya sudah lengkap, Pak. Tinggal paraf di sini');
      E.data.siapPada = E.umur + 5;
    } else if (E.data.layan && !E.data.beres && E.umur > E.data.siapPada) {
      E.data.beres = true;
      a.bawa = null;
      a.say('sudah, Pak. Terima kasih ya');
      for (let i = 0; i < 3; i++) spawn('talk', Bp.x, Bp.y - 30);
      blip(360, 0.06);
      E.data.siapPada = E.umur + 4;
    } else if (E.data.beres && !E.data.bubar && E.umur > E.data.siapPada) {
      /* Anaknya baru sadar urusannya sudah selesai tanpa dia. HP-nya diambil
         lagi, dan pulangnya lebih kencang dari bapaknya (58 lawan 38) —
         satu-satunya balapan yang dia menangkan hari itu. */
      E.data.bubar = true;
      E.data.hp = false;
      for (let i = 0; i < 3; i++) spawn('talk', M.x, M.y - 34);
      TOKOH.pulangkan(M, true);
      TOKOH.pulangkan(Bp, true);
      lepaskanAktor(a);            // ikut mereset pose, bawa, laju, dan doingEvent
      a.goTo(stasiunPulang(a));
      E.data.a = null;
    }

    // Jaring pengaman: apa pun yang tersendat, keduanya wajib sudah berjalan
    // keluar sebelum durasi habis — kalau tidak, mereka LENYAP di tengah
    // ruangan waktu eventnya dimatikan.
    pada(E, 40, () => {
      if (M.fase === 'pulang') return;
      E.data.hp = false;
      TOKOH.pulangkan(M, true);
      TOKOH.pulangkan(Bp, true);
    });

    if (M.fase === 'pulang' && Bp.fase === 'pulang'
      && TOKOH.sudahKeluar(M) && TOKOH.sudahKeluar(Bp)) E.selesaiCepat = true;
  },
  gambarProp(E) {
    const M = E.data.m, Bp = E.data.b;
    // HP bersandar di taplak meja rapat. (243,216) ada di dalam trapesium
    // meja pada baris itu (trapRows: y 216 -> x 172..320) dan 16 px di bawah
    // tumpukan berkas rapat-pleno-kursi-penuh yang di (238,196).
    if (E.data.hp) {
      r(243, 216, 3, 5, '#20242c');
      r(243, 217, 3, 3, '#5b8ad4');
      r(242, 221, 5, 1, '#3a3f45');                 // kaki sandaran
      if (Math.sin(now / 240) > 0) r(244, 218, 1, 1, '#e8453f');   // LED rekam
    }
    if (Bp && Bp.x > TOKOH.KELUAR_KIRI && Bp.x < TOKOH.KELUAR_KANAN) TOKOH.gambar(Bp);
    if (M && M.x > TOKOH.KELUAR_KIRI && M.x < TOKOH.KELUAR_KANAN) {
      // Gerak naik-turun 1 px cuma untuk yang muda, dan cuma di salinan objek
      // yang dipakai menggambar — jalur waypoint aslinya tidak ikut bergetar.
      const bob = M.heboh && Math.sin(now / 130) > 0 ? -1 : 0;
      TOKOH.gambar(bob ? { ...M, y: M.y + bob } : M);
    }
  },
  // Adegan utamanya di celah kursi rapat sisi dekat: 252 menaruh keduanya di
  // depan meja rapat (sortY 249) dan di belakang sandaran kursi dekat (260),
  // yang benar untuk titik berdiri keduanya.
  sortY: 252,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.bawa = null; a.doingEvent = ''; }
  },
},

);
