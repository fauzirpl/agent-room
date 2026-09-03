/* ==========================================================================
   TAMU TENAR — ATLET
   ==========================================================================
   Enam tamu yang semuanya dikenali dari BENDA yang dibawa, bukan dari wajah.
   Itu bukan gaya, itu batasan yang jujur: sosok di ruangan ini tingginya 26
   px dan kepalanya 8x8 px, jadi wajah tidak pernah jadi tanda pengenal apa
   pun. Yang terbaca sekilas cuma siluet dan warna — sarung tangan kiper yang
   dua kali lebih besar dari telapak biasa, dua lengan lurus di atas kepala,
   barbel berpiringan, raket di punggung, tali harness yang menjuntai, dan
   tiga sosok berpalet SAMA PERSIS. Aturan tanpa nama (lihat kepala
   33-tamu-tenar-dasar.js) justru yang memaksa desainnya ke arah yang benar.

   Mesin komedinya tetap satu: birokrasi tidak peduli kamu siapa. Refleks
   kelas dunia dipakai menyelamatkan tumpukan map disposisi; lemparan ke
   dalam yang sempurna tetap ditegur karena "biasanya kami antar jalan kaki";
   galon yang diangkat satu tangan tetap ditanya surat jalannya. Yang jadi
   bahan tertawaan prosedurnya dan reaksi pegawainya — tidak pernah tamunya.

   ------------------------------------------------------ yang TIDAK dibuat

   1. "Dus arsip di atas lemari DITURUNKAN" (usulan asli event pemanjat).
      Dus yang tergambar di ATAS lemari arsip (drawArsip: r(x+6, y-14, 18,
      12) dan r(x+30, y-9, 14, 7)) adalah gambar TETAP — bukan data, tidak
      ada field RUANGAN di belakangnya. Menurunkannya berarti menyunting
      drawArsip di room.js, dan itu berkas yang tidak boleh disentuh dari
      sini. Yang PUNYA data justru tumpukan di LANTAI di depan lemari
      (RUANGAN.dusTambahanArsip, 0..2), jadi arah errand-nya dibalik: dus
      yang menumpuk di lantai itu yang dinaikkan ke atas lemari — tempat yang
      memang tidak terjangkau siapa pun tanpa memanjat, dan itu sebabnya
      selama ini tidak ada yang mengerjakannya. Akibatnya nyata dan langsung
      terlihat: satu dus hilang dari lantai.

      Cabang jujurnya dipasang di depan: dusTambahanArsip cuma DIGAMBAR kalau
      RUANGAN.arsipPenuh (lihat drawArsip), jadi klaim "satu dus berkurang"
      cuma diambil kalau keduanya benar. Kalau tidak, dia tetap memanjat tapi
      yang dikerjakan cuma membetulkan letak boks di atas — dan event ini
      pulang TANPA bekas permanen sama sekali. Lebih baik begitu daripada
      menulis angka yang tidak pernah muncul di layar.

   2. RUANGAN.sampahLantai TIDAK disentuh rombongan pembersih, walau namanya
      persis yang dicari. Field itu memang ada di RUANGAN, tapi disisir
      seluruh room.js hasilnya cuma satu baris: deklarasinya sendiri. Tidak
      ada satu pun cabang penggambar dan tidak ada satu pun event yang
      mengisinya. Mengosongkan array yang selalu kosong dan tidak pernah
      digambar itu bukan akibat, itu baris kode yang berpura-pura. Yang
      dipakai sebagai gantinya tiga bekas yang benar-benar tergambar:
      RUANGAN.tongPenuh (drawTongSampah), propLantai/kertasLantai lewat
      basahSapuSampah(), dan kurva kekusutan harian lewat bereskanKusut().

   3. Tidak ada satu pun dari enam event ini yang berkelas 'panggung',
      termasuk rombongan pembersih yang berdurasi 100 detik. Mengunci seluruh
      panggung selama itu untuk pekerjaan latar berarti seratus detik tanpa
      kejadian lain sama sekali; rombongan-studi-banding sudah membayar harga
      itu sekali dan itu sudah cukup. Yang menjaga supaya tidak ramai bukan
      kelasnya melainkan TOKOH.adaTamu() di syarat tiap event — satu tamu
      tenar per waktu — plus bobot langka dan cooldown panjang.

   4. Barbel yang benar-benar diangkat berulang (repetisi) dibuang: siklus
      naik-turun butuh pose lengan yang tidak ada di posEvent() dan tamu
      bukan Agent, jadi dia tidak punya pose sama sekali. Barbelnya jadi
      properti yang dibawa dan diletakkan — cukup untuk dikenali, dan tidak
      ada yang berpura-pura beranimasi.

   -------------------------------------------------------- batas yang dibayar
   * Satu event = satu sortY (mesinnya membaca E.def.sortY sekali, bukan per
     benda). Semua adegan di sini punya SATU tempat kejadian yang jelas dan
     sortY-nya dipilih untuk tempat itu, bukan untuk perjalanan menuju ke
     sana. Konsekuensinya: waktu tamunya masih melintas di lajur bawah menuju
     dinding, tumpang-tindihnya dengan pegawai bisa meleset beberapa detik.
     Itu dipilih sadar, sama seperti mahasiswa-magang-bingung memilihnya.
   * Tamu tidak punya say(). Semua kalimat yang terdengar di ruangan ini
     keluar dari mulut PEGAWAI; suara tamu diwakili partikel 'talk' di atas
     kepalanya. Konvensi yang sama dengan tamu-di-ruang-tunggu dan
     pemohon-surat-di-loket.
   * Aksesori digambar di koordinat kaki yang sudah dibulatkan, sementara
     badan ikut bob ±1 px. Sekali-sekali ada selisih satu piksel antara
     sarung tangan dan lengan. Itu harga yang sama yang sudah dibayar
     TOKOH.topi/TOKOH.helm, dan mengejarnya berarti menyalin seluruh
     perhitungan bob drawPerson ke sini.
   ========================================================================== */

/* Wadah bersama berkas ini. Satu const, bukan enam fungsi lepas: berkas event
   disambung jadi SATU classic script, jadi tiap nama tingkat atas di sini
   ikut jadi milik semua berkas event lain. */
const ATLET = {

  /* Peta ketinggian yang dipakai semua aksesori di bawah, diturunkan dari
     drawPerson + drawHead terhadap titik kaki `y`:
       sabuk y-8 | badan y-14..y-9 | bahu y-16..y-15 | dagu y-17
       isi kepala y-25..y-18 | garis rambut teratas y-26 | mata y-22
     Lengan yang menggantung: pangkal y-15, telapak y-9..y-8 di x-7..x-6
     (kiri) dan x+5..x+6 (kanan) untuk sosok yang menghadap penonton. */

  /* ---------------------------------------------------------- kiper ---
     Sarung tangan kiper: dua kotak 4x5 yang MENELAN telapak (telapak aslinya
     cuma 2x2), dan itu justru intinya — yang bikin sosok ini terbaca kiper
     bukan warnanya tapi tangan yang terlalu besar untuk badannya. Waktu
     menangkap, keduanya naik ke depan dada. */
  sarungTangan(x, y, hadap, o) {
    const c = '#f2efe2', tepi = '#c2bda8';
    const naik = o && o.tangkapSampai ? 6 : 0;
    if (hadap === 'left' || hadap === 'right') {
      // Dari samping cuma satu tangan yang terbaca; yang di belakang badan
      // tidak digambar supaya tidak terlihat seperti tangan ketiga.
      const k = hadap === 'right' ? 4 : -8;
      r(x + k, y - 10 - naik, 4, 5, c);
      r(x + k, y - 10 - naik, 4, 1, tepi);
      return;
    }
    r(x - 8, y - 10 - naik, 4, 5, c);
    r(x - 8, y - 10 - naik, 4, 1, tepi);
    r(x + 5, y - 10 - naik, 4, 5, c);
    r(x + 5, y - 10 - naik, 4, 1, tepi);
  },

  /* ------------------------------------------------------------- bek ---
     Lemparan ke dalam: dua lengan LURUS di atas kepala. drawPerson tidak
     punya pose seperti itu (posEvent paling tinggi 'hormat' di -9, masih di
     bawah bahu) dan tamu bukan Agent jadi tidak punya a.pose sama sekali —
     jadi lengannya digambar tangan di sini, dari bahu (y-15) naik sampai
     y-30. Digambar SESUDAH badan, jadi ia menutupi lengan bawaan drawPerson
     yang menggantung di sisi badan. */
  lenganLempar(x, y, hadap, o) {
    if (!o || !o.lenganAtas) return;
    const c = o.pal.main, tepi = sh(c, 0.72), kulit = o.pal.skin;
    const kiri = hadap === 'right' ? 0 : -7;      // dari samping keduanya rapat
    const kanan = hadap === 'left' ? -1 : 5;
    r(x + kiri, y - 30, 2, 15, c);
    r(x + kiri, y - 30, 2, 2, kulit);             // telapak menggenggam map
    r(x + kiri - 1, y - 30, 1, 15, tepi);
    r(x + kanan, y - 30, 2, 15, c);
    r(x + kanan, y - 30, 2, 2, kulit);
    r(x + kanan + 2, y - 30, 1, 15, tepi);
  },

  // Nomor punggung: tiga baris kotak 1 px yang cuma perlu terbaca sebagai
  // "ada angka besar di punggung", bukan sebagai angka tertentu.
  nomorPunggung(x, y, hadap) {
    if (hadap !== 'up') return;
    const c = '#f4f2e8';
    r(x - 2, y - 14, 1, 5, c);
    r(x, y - 14, 3, 1, c); r(x, y - 12, 3, 1, c); r(x, y - 10, 3, 1, c);
    r(x + 2, y - 13, 1, 1, c); r(x, y - 11, 1, 1, c);
  },

  /* ----------------------------------------------------------- lifter ---
     Badan pendek-kekar: drawPerson tinggi sprite-nya konstanta, jadi "pendek"
     tidak bisa diminta. Yang bisa: badannya DILEBARKAN 1 px di tiap sisi
     dengan dua kolom yang ditimpakan persis di tepi torso (torso depan
     x-4..x+3 di y-14..y-9), plus bahu yang ikut melebar 1 px. Selisih dua
     piksel terdengar kecil, tapi di sosok selebar 8 px itu 25% — dan
     berdampingan dengan pegawai lain bedanya langsung terbaca.
     Singlet merah-putih: dua pita putih tegak di dada. */
  badanKekar(x, y, hadap) {
    const merah = '#c8302c', putih = '#f2f0e6', tepi = '#8f2020';
    if (hadap === 'left' || hadap === 'right') {
      r(x - 5, y - 14, 1, 6, merah); r(x + 4, y - 14, 1, 6, merah);
      r(x - 5, y - 15, 1, 1, tepi); r(x + 4, y - 15, 1, 1, tepi);
      r(x - 1, y - 14, 2, 6, putih);
      return;
    }
    r(x - 6, y - 14, 1, 6, merah); r(x + 5, y - 14, 1, 6, merah);
    r(x - 6, y - 15, 1, 1, tepi); r(x + 5, y - 15, 1, 1, tepi);
    r(x - 5, y - 15, 1, 1, tepi); r(x + 4, y - 15, 1, 1, tepi);
    // dua pita singlet; yang membelakangi penonton pitanya di punggung juga
    r(x - 3, y - 15, 2, 7, putih);
    r(x + 1, y - 15, 2, 7, putih);
  },

  /* Barbel: batang + dua piringan HITAM yang tingginya 8 px — piringan besar
     itu satu-satunya bagian yang harus benar, karena dumbel kecil terbaca
     sebagai kotak biasa. `di` = 'lantai' (tergeletak) atau 'bahu'. */
  barbel(x, y, di) {
    const besi = '#22262c', kilau = '#4a5058';
    if (di === 'bahu') {
      r(x - 9, y - 21, 18, 1, besi);
      r(x - 11, y - 25, 3, 8, besi); r(x - 11, y - 25, 3, 1, kilau);
      r(x + 8, y - 25, 3, 8, besi); r(x + 8, y - 25, 3, 1, kilau);
      return;
    }
    r(x - 8, y - 4, 16, 1, besi);
    r(x - 10, y - 8, 3, 8, besi); r(x - 10, y - 8, 3, 1, kilau);
    r(x + 7, y - 8, 3, 8, besi); r(x + 7, y - 8, 3, 1, kilau);
  },

  /* ---------------------------------------------------- pebulutangkis ---
     Raket: kepala oval + gagang panjang. Tidak ada satu pun benda lain di
     ruangan ini yang berbentuk begitu — tidak sapu, tidak pel, tidak papan
     jalan auditor — jadi ini penanda yang paling murah sekaligus paling
     tegas di seluruh berkas. Tersandang di punggung saat diam; naik miring
     di atas kepala selama setengah detik saat menepuk. */
  raket(x, y, hadap, o) {
    const gagang = '#3a2a1c', rangka = '#d8dde2', senar = '#8f9aa4';
    const ayun = o && o.ayunSampai ? 1 : 0;
    if (ayun) {
      // menepuk: gagang miring dari pinggang ke kanan atas, kepala di y-34
      r(x + 4, y - 20, 1, 8, gagang);
      r(x + 5, y - 26, 1, 6, gagang);
      gumpal(x + 3, y - 34, 6, 8, rangka);
      r(x + 5, y - 32, 2, 5, senar);
      return;
    }
    const s = hadap === 'left' ? -1 : 1;          // tersandang di sisi belakang
    r(x + s * 4, y - 12, 1, 5, gagang);
    r(x + s * 5, y - 18, 1, 6, gagang);
    gumpal(x + (s > 0 ? 4 : -9), y - 27, 6, 8, rangka);
    r(x + (s > 0 ? 6 : -7), y - 25, 2, 5, senar);
  },

  /* -------------------------------------------------------- pemanjat ---
     Harness: sabuk pinggang tebal + tali menjuntai + kantong kapur di
     belakang pinggang + sepatu panjat merah. Talinya sengaja digambar
     terpisah (ATLET.tali) karena panjangnya ikut ketinggian dia memanjat,
     sementara sisanya menempel di badan. */
  harness(x, y, hadap) {
    const sabuk = '#e8b23a', kapur = '#7a6a52', sepatu = '#c22b2b';
    r(x - 5, y - 9, 10, 2, sabuk);
    r(x - 5, y - 9, 10, 1, lerpHex(sabuk, '#ffffff', 0.3));
    r(x - 1, y - 8, 2, 3, sabuk);                 // lingkar paha
    // kantong kapur: di sisi belakang, jadi ikut arah hadap
    const k = hadap === 'right' ? -8 : hadap === 'left' ? 5 : 5;
    r(x + k, y - 10, 3, 4, kapur);
    r(x + k, y - 10, 3, 1, '#e4ddc8');            // mulut kantong berdebu kapur
    r(x - 4, y - 1, 3, 2, sepatu);                // sepatu panjat merah
    r(x + 1, y - 1, 3, 2, sepatu);
  },

  // Tali yang menjuntai dari pinggang sampai lantai selama dia di dinding.
  // Digambar 1 px dengan satu lekuk supaya tidak terbaca sebagai kabel lurus.
  tali(x, y, sampaiY) {
    if (sampaiY <= y) return;
    const c = '#c9542a';
    r(x + 4, y - 8, 1, sampaiY - y + 8, c);
    r(x + 5, y - 8 + Math.round((sampaiY - y) * 0.55), 1, 3, c);
  },

  /* -------------------------------------------- rombongan pembersih ---
     Palet identik bertiga: itu yang bikin mereka terbaca satu rombongan dan
     bukan tiga orang asing yang kebetulan datang bersamaan — pola yang sama
     dipakai rombongan-studi-banding dengan batiknya. Yang membedakan tiap
     orang cuma isi karungnya. */
  PAL_BERSIH: { main: '#2a2f36', pants: '#2a2f36', skin: '#c98f5e', hair: '#1b1712' },

  bersih(x, y, hadap, o) {
    const glove = '#f07a20', boot = '#26402c', karung = '#eae7dc';
    // boot tinggi: menimpa betis sampai separuh, warnanya beda dari celana
    r(x - 4, y - 5, 3, 5, boot);
    r(x + 1, y - 5, 3, 5, boot);
    r(x - 4, y - 5, 3, 1, lerpHex(boot, '#ffffff', 0.25));
    r(x + 1, y - 5, 3, 1, lerpHex(boot, '#ffffff', 0.25));
    // sarung tangan karet terang, menutupi telapak seperti sarung kiper tapi
    // lebih ramping (3x4) — ini pekerja, bukan penjaga gawang
    if (hadap === 'left' || hadap === 'right') {
      r(x + (hadap === 'right' ? 4 : -7), y - 10, 3, 4, glove);
    } else {
      r(x - 7, y - 10, 3, 4, glove);
      r(x + 5, y - 10, 3, 4, glove);
    }
    // karung putih dipanggul: yang membelakangi penonton karungnya menutupi
    // punggung, yang menyamping karungnya nongol di sisi belakang
    if (o && o.karung) {
      const isi = o.karungPenuh ? 2 : 0;
      if (hadap === 'up') gumpal(x - 5, y - 24 - isi, 11, 11 + isi, karung);
      else {
        const s = hadap === 'left' ? 1 : -1;
        gumpal(x + (s > 0 ? 3 : -10), y - 24 - isi, 8, 11 + isi, karung);
      }
    }
  },

  /* Sapu yang MENYENTUH lantai. Sengaja tidak memakai a.bawa 'sapu': itu
     milik Agent, dan kepala sapunya menggantung setinggi pinggang karena
     dirancang untuk dibawa, bukan untuk menyapu. */
  sapu(x, y, arah) {
    r(x + arah * 6, y - 19, 1, 22, '#8a6844');
    r(x + arah * 3, y + 2, 7, 3, '#c9a03a');
    r(x + arah * 3, y + 4, 7, 1, '#8a6a1a');
  },
};

daftarEvent(

/* --------------------------------------------------------------- 1. KIPER ---
   Refleks kelas dunia dipakai untuk hal paling remeh yang ada di ruangan ini:
   menahan tumpukan map disposisi yang longsor dari meja stempel. Lelucon
   sebenarnya bukan tangkapannya, tapi AKIBATNYA — RUANGAN.mapDisposisi tidak
   berkurang satu pun. Berkasnya selamat, dan itu berarti pekerjaan yang
   menunggu di meja stempel juga masih utuh.

   Tumpukan yang longsor itu tumpukan yang DIA SENDIRI baru taruh: kalau
   mengandalkan mapDisposisi yang kebetulan sudah ada, adegannya batal di
   ruangan yang mejanya kebetulan bersih. Jadi urusan mengantar berkasnya
   nyata (mapDisposisi +1, digambar drawStempel dan menyusut sendiri begitu
   ada yang memakai meja stempel), dan longsornya menyusul dari situ. */
{
  id: 'kiper-sarung-tangan-timnas',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 46,
  tamuTenar: true,
  // apel 0: barisan apel tidak boleh dibubarkan untuk mengantar map. Malam &
  // libur 0: loket tutup, dan tamu tenar yang datang jam tiga pagi terbaca
  // sebagai kerusakan, bukan lelucon.
  babak: { apel: 0, istirahat: 0.4, pulang: 0.3, lembur: 0, malam: 0, libur: 0 },
  // !stasiunAktif.has('edit'): jangan menaruh orang luar berdiri 18 px dari
  // pegawai yang sedang benar-benar bekerja di meja stempel — dan jangan
  // menumpahkan map di meja yang sedang dipakai sesi sungguhan.
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 15
    && !S.stasiunAktif.has('edit') && RUANGAN.mapDisposisi < 5,
  mulai(E) {
    /* Berdiri di (268,148): meja stempel x252..322 y72..118, jadi 30 px di
       bawah bibir mejanya dan 18 px di kiri titik berdiri stasiun 'edit'
       (286,140). Kursi jauh meja rapat baru mulai y169, jadi tidak ada yang
       ditabrak. Masuk lewat jalur baku (TOKOH.jalur) supaya memutari meja
       rapat lewat penghubung kiri seperti pejalan lain. */
    const T = TOKOH.buat({
      pal: { main: '#b8f227', pants: '#20242c', skin: '#c98f5e', hair: '#1b1712' },
      bawa: 'map',
      aksesori: ATLET.sarungTangan,
    }, false, LANE_DOWN);
    TOKOH.antar(T, 268, 148);
    E.data.t = T;
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 48);
    if (T.fase === 'masuk' && sampai) {
      T.fase = 'taruh';
      T.hadap = 'up';
      E.data.taruhPada = E.umur + 0.8;            // tenggat disimpan, dibanding manual
    }
    // Sudah menyentuh titik di luar bingkai: matikan lebih awal alih-alih
    // membiarkan sisa durasi habis dengan panggung kosong.
    if (T.fase === 'pulang' && sampai) { T.fase = 'usai'; E.selesaiCepat = true; }

    // Pengenalan: satu orang sadar duluan, waktu dia masih melintas lajur.
    // Cek RENTANG, bukan pada(): beatnya boleh berbunyi beberapa frame.
    if (!E.data.a && E.umur > 3 && E.umur < 3.3) {
      E.data.a = TOKOH.kenali(E, T, 'lho — sarung tangannya... itu yang jaga gawang itu?');
    }
    // Gelombang: cuma partikel, jadi aman dipanggil tiap frame — tidak
    // menyentuh busyUntil siapa pun, ruangan tetap bekerja di belakangnya.
    if (E.umur > 3 && E.umur < 24) TOKOH.gempar(T.x, T.y, dt, 0.6);

    // Berkasnya ditaruh: tumpukan map disposisi benar-benar naik satu lapis.
    if (E.data.taruhPada && E.umur > E.data.taruhPada && !E.data.taruh) {
      E.data.taruh = true;
      T.bawa = null;
      RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
      for (let i = 0; i < 3; i++) spawn('paper', 262, 96);
      blip(340, 0.06);
      E.data.longsorPada = E.umur + 2.6;
    }

    // Longsor + tangkapan. Lembarannya dihamburkan dari bibir meja (y=100,
    // drawStempel: papan meja y94..102) supaya jatuhnya memang ke arah dia,
    // bukan dari puncak tumpukan setinggi 40 px yang mustahil dijangkau.
    if (E.data.longsorPada && E.umur > E.data.longsorPada && !E.data.longsor) {
      E.data.longsor = true;
      for (let i = 0; i < 5; i++) spawn('lembar', 258 + i * 3, 100);
      T.tangkapSampai = E.umur + 1.1;
      blip(220, 0.08);
      TOKOH.tengok(S, T.x, T.y, 1300);
      E.data.pujiPada = E.umur + 1.3;
    }
    if (T.tangkapSampai && E.umur > T.tangkapSampai) T.tangkapSampai = 0;

    // Yang berbalon selalu PEGAWAI; tamu cuma mengeluarkan partikel 'talk'.
    if (E.data.pujiPada && E.umur > E.data.pujiPada && !E.data.puji) {
      E.data.puji = true;
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 28);
      const a = E.data.a;
      if (masihMain(E, a)) a.say('berkasnya... selamat, Pak');
      E.data.nomorPada = E.umur + 3.4;
    }

    // Prosedur menjawab: refleksnya boleh, nomornya tetap berlaku. Papan
    // antrean di dinding benar-benar maju satu (drawNomorAntre).
    if (E.data.nomorPada && E.umur > E.data.nomorPada && !E.data.nomor) {
      E.data.nomor = true;
      const n = TOKOH.ambilNomor();
      const a = E.data.a;
      if (masihMain(E, a)) a.say('nomornya tetap diambil ya, Pak — ' + esc(n));
      spawn('ping', 218, 34);
      E.data.pulangPada = E.umur + 3.2;
    }

    if (E.data.pulangPada && E.umur > E.data.pulangPada && T.fase !== 'pulang'
      && T.fase !== 'usai') {
      TOKOH.pulangkan(T, false);
    }
    // Jaring pengaman: durasi habis dengan tamu masih di tengah ruangan =
    // dia LENYAP seketika (matikanEvent mencabut E dari eventHidup). Batas
    // 34 memberi 12 detik untuk berjalan keluar bingkai.
    if (E.umur > 34 && T.fase !== 'pulang' && T.fase !== 'usai') TOKOH.pulangkan(T, false);
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.fase === 'usai' || T.x < TOKOH.KELUAR_KIRI) return;
    TOKOH.gambar(T);
    // Lembar yang tertangkap: dua kotak kertas di antara kedua sarung tangan.
    // Cuma sekejap — sesudah itu tumpukannya sudah kembali di meja.
    if (T.tangkapSampai) {
      const x = Math.round(T.x), y = Math.round(T.y);
      r(x - 4, y - 16, 9, 3, '#f4f2ea');
      r(x - 4, y - 13, 9, 1, '#d9d4c2');
    }
  },
  // Adegan utamanya berdiri di y148 di depan meja stempel; 154 menaruhnya di
  // depan seluruh perabot dinding (sortY 118) dan di belakang siapa pun yang
  // lewat di LANE_UP (164). Transit di lajur bawah memang meleset — satu
  // event cuma punya satu sortY.
  sortY: 154,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) a.doingEvent = '';
  },
},

/* ----------------------------------------------------------------- 2. BEK ---
   Lemparan ke dalam dua tangan, dipakai untuk memindahkan satu map ke meja
   seberang. Yang bikin lucu bukan lemparannya, tapi kalimat pegawai
   sesudahnya: "biasanya kami antar jalan kaki, Mas."

   Mapnya BENAR-BENAR terbang: prop sendiri di E.data.map, lintasan parabola
   dari tangannya ke bibir meja stempel, dan mendarat jadi RUANGAN.mapDisposisi
   +1. Tidak dipakai a.bawa karena yang melempar bukan Agent, dan tidak
   dipakai partikel karena partikel tidak bisa dijamin mendarat di titik
   tertentu. */
{
  id: 'bek-lemparan-dua-tangan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 40,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.5, pulang: 0.3, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 15
    && !S.stasiunAktif.has('edit') && RUANGAN.mapDisposisi < 5,
  mulai(E) {
    // Berdiri di (200,252) — persis di LANE_DOWN, di depan meja rapat.
    // Lemparannya melewati karpet rapat (x154..340, y169..252) tanpa
    // menyentuh apa pun: yang terbang cuma prop, bukan penghalang.
    const T = TOKOH.buat({
      pal: { main: '#2f4f9a', pants: '#20242c', skin: '#e0ae80', hair: '#241a12' },
      bawa: 'map-kuning',
      aksesori(x, y, hadap, o) {
        ATLET.nomorPunggung(x, y, hadap);
        ATLET.lenganLempar(x, y, hadap, o);
      },
    }, false, LANE_DOWN);
    TOKOH.antar(T, 200, LANE_DOWN);
    E.data.t = T;
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 48);
    if (T.fase === 'masuk' && sampai) {
      T.fase = 'ancang';
      T.hadap = 'up';                              // menghadap meja stempel di dinding
      E.data.angkatPada = E.umur + 1.8;
    }
    // Sudah menyentuh titik di luar bingkai: matikan lebih awal alih-alih
    // membiarkan sisa durasi habis dengan panggung kosong.
    if (T.fase === 'pulang' && sampai) { T.fase = 'usai'; E.selesaiCepat = true; }

    if (!E.data.a && E.umur > 2.6 && E.umur < 2.9) {
      E.data.a = TOKOH.kenali(E, T, 'itu... yang biasa di lapangan itu?');
    }
    if (E.umur > 2.6 && E.umur < 20) TOKOH.gempar(T.x, T.y, dt, 0.5);

    // Ancang-ancang: dua lengan naik di atas kepala dan DITAHAN satu detik
    // sebelum lepas. Tanpa jeda itu lemparannya terbaca seperti map yang
    // terbang sendiri.
    if (E.data.angkatPada && E.umur > E.data.angkatPada && !E.data.angkat) {
      E.data.angkat = true;
      T.lenganAtas = true;
      T.bawa = null;                               // mapnya pindah ke atas kepala
      TOKOH.tengok(S, T.x, T.y, 1200);
      E.data.lemparPada = E.umur + 1.2;
    }

    if (E.data.lemparPada && E.umur > E.data.lemparPada && !E.data.map) {
      // Lintasan: dari genggaman di atas kepala (200,222) ke bibir meja
      // stempel (262,100). Puncaknya 26 px di atas garis lurus keduanya.
      E.data.map = { x: 200, y: 222, t: 0 };
      blip(180, 0.06);
    }

    const M = E.data.map;
    if (M && !E.data.mendarat) {
      M.t = Math.min(1, M.t + dt / 1.15);
      M.x = 200 + (262 - 200) * M.t;
      M.y = 222 + (100 - 222) * M.t - 26 * Math.sin(Math.PI * M.t);
      if (M.t >= 1) {
        E.data.mendarat = true;
        T.lenganAtas = false;
        RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
        for (let i = 0; i < 4; i++) spawn('paper', 262, 96);
        blip(300, 0.07);
        E.data.tegurPada = E.umur + 1.4;
      }
    }

    // Prosedur menjawab lemparan sempurna dengan kalimat paling datar yang
    // bisa dibayangkan.
    if (E.data.tegurPada && E.umur > E.data.tegurPada && !E.data.tegur) {
      E.data.tegur = true;
      const a = E.data.a;
      if (masihMain(E, a)) {
        hadapkan(a, T.x, T.y);
        a.say('biasanya kami antar jalan kaki, Mas');
      }
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 28);
      E.data.antiPada = E.umur + 3.2;
    }
    // Antiklimaks: sudah mendarat sempurna pun, yang paraf tetap tidak ada.
    if (E.data.antiPada && E.umur > E.data.antiPada && !E.data.anti) {
      E.data.anti = true;
      const a = E.data.a;
      if (masihMain(E, a)) a.say('yang paraf lagi rapat di luar');
      E.data.pulangPada = E.umur + 2.6;
    }

    if (E.data.pulangPada && E.umur > E.data.pulangPada && T.fase !== 'pulang'
      && T.fase !== 'usai') {
      T.lenganAtas = false;
      TOKOH.pulangkan(T, false);
    }
    if (E.umur > 30 && T.fase !== 'pulang' && T.fase !== 'usai') {
      T.lenganAtas = false;
      TOKOH.pulangkan(T, false);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (T && T.fase !== 'usai' && T.x > TOKOH.KELUAR_KIRI) TOKOH.gambar(T);
    const M = E.data.map;
    // Map yang terbang ikut sortY event ini (276, lajur bawah). Selama
    // separuh awal lintasannya itu benar; menjelang mendarat di dinding ia
    // lewat di DEPAN pejalan LANE_UP padahal seharusnya di belakang. Itu
    // batas "satu event satu sortY" yang dibayar sadar — mapnya di udara
    // cuma 1,15 detik, dan alternatifnya (gambarAtas) justru bikin ia
    // melayang di atas segalanya termasuk redup malam.
    if (M && !E.data.mendarat) {
      const x = Math.round(M.x), y = Math.round(M.y);
      r(x - 4, y - 3, 8, 6, '#c9a03a');
      r(x - 3, y - 1, 6, 1, '#f4f2ea');
    }
  },
  // LANE_DOWN + 24: konvensi pita lajur bawah di frame() — tanpa itu dia
  // tenggelam di balik sandaran kursi rapat sisi dekat waktu berdiri di x200.
  sortY: 276,
  selesai(E) {
    const T = E.data.t;
    if (T) T.lenganAtas = false;
    const a = E.data.a;
    if (masihMain(E, a)) a.doingEvent = '';
  },
},

/* -------------------------------------------------------------- 3. LIFTER ---
   Galon 19 liter diangkat satu tangan, dipasang, selesai. Yang mengempiskan
   momennya: pegawai bertepuk, lalu langsung menanyakan surat jalannya.

   Kenapa bentrok dengan dua event galon yang sudah ada: ketiganya menulis
   RUANGAN.gelasDispenser dan MOD.galonLepas: kepala dispenser yang kosong
   itu satu benda, dan dua adegan yang mencabut galon bersamaan menghasilkan
   satu dispenser dengan dua galon di tangan orang berbeda. */
{
  id: 'lifter-singlet-merah-putih',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 46,
  tamuTenar: true,
  babak: { apel: 0, malam: 0, libur: 0 },
  bentrokDengan: ['tukang-galon-datang', 'galon-habis-diganti'],
  // Ambangnya <= 1, sama dalamnya dengan tukang-galon-datang: kalau masih
  // ada 2-3 gelas, yang wajar datang pegawainya sendiri (galon-habis-diganti,
  // ambang <= 3), bukan tamu dari luar.
  syarat: (S) => !TOKOH.adaTamu() && S.kerjaJam && RUANGAN.gelasDispenser <= 1,
  mulai(E) {
    /* Masuk dari KANAN — dispenser ada di pojok kanan pantry (drawDispenser
       Pantry: dx=462, dy=272, badan x462..480 y254..288), jadi menyeberangi
       seluruh kantor dari kiri cuma untuk sampai ke situ tidak masuk akal.
       Berdiri di (450,268): 12 px di kiri badan dispenser, di dalam pantry
       (sekat pantry x414..420), dan tidak menindih tong sampah (x437..446,
       y276..288) yang ada di depan-bawahnya. */
    const T = TOKOH.buat({
      pal: { main: '#c8302c', pants: '#20242c', skin: '#c98f5e', hair: '#1b1712' },
      aksesori(x, y, hadap, o) {
        ATLET.badanKekar(x, y, hadap);
        if (o.barbelDiBahu) ATLET.barbel(x, y, 'bahu');
      },
    }, true, LANE_DOWN);
    T.barbelDiBahu = true;
    TOKOH.antar(T, 450, 268);
    E.data.t = T;
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 40);       // 40, bukan 48: memanggul barbel
    if (T.fase === 'masuk' && sampai) {
      T.fase = 'letak';
      T.hadap = 'right';
      E.data.letakPada = E.umur + 1.2;
    }
    // Sudah menyentuh titik di luar bingkai: matikan lebih awal alih-alih
    // membiarkan sisa durasi habis dengan panggung kosong.
    if (T.fase === 'pulang' && sampai) { T.fase = 'usai'; E.selesaiCepat = true; }

    if (!E.data.a && E.umur > 2.4 && E.umur < 2.7) {
      E.data.a = TOKOH.kenali(E, T, 'itu... yang suka angkat besi itu, kan?');
    }
    if (E.umur > 2.4 && E.umur < 26) TOKOH.gempar(T.x, T.y, dt, 0.7);

    /* Barbel diletakkan di lantai pantry di (424,270). Celah antara sekat
       pantry (drawPantry: r(414,196,6,92) = x414..420) dan tutup tong sampah
       (drawTongSampah: r(436,276,11,2) = x436..447) cuma 16 px, sementara
       barbelnya 20 px dari piringan ke piringan — jadi tidak ada titik di
       pantry yang bebas dari keduanya sekaligus. Yang dipilih menempel ke
       SEKAT: piringan kirinya (x414..416) bersandar di panel kayu, yang
       memang cara barbel diletakkan orang, sementara piringan kanan (x431..
       433) berhenti 3 px sebelum tutup tong. Tongnya sendiri tidak pernah
       tertindih badan tamunya: sosoknya y242..268, tong y274..288. */
    if (E.data.letakPada && E.umur > E.data.letakPada && !E.data.letak) {
      E.data.letak = true;
      T.barbelDiBahu = false;
      E.data.barbelX = 424;
      spawn('dust', 424, 268);
      blip(120, 0.09);
      E.data.angkatPada = E.umur + 1.6;
    }

    if (E.data.angkatPada && E.umur > E.data.angkatPada && !E.data.angkat) {
      E.data.angkat = true;
      T.galonDiTangan = true;
      E.data.pasangPada = E.umur + 4;
    }

    /* MOD DIRESET TIAP FRAME: kepala dispenser yang kosong wajib ditulis
       ulang di sini selama galonnya ada di tangan, bukan disetel sekali. */
    if (T.galonDiTangan) MOD.galonLepas = true;

    if (E.data.pasangPada && E.umur > E.data.pasangPada && !E.data.pasang) {
      E.data.pasang = true;
      T.galonDiTangan = false;                     // galonnya pindah ke dispenser
      RUANGAN.gelasDispenser = 6;
      for (let i = 0; i < 4; i++) spawn('splash', 466, 238, '#b8dcf4');
      blip(520, 0.07);
      TOKOH.tengok(S, T.x, T.y, 1400);
      E.data.tepukSampai = E.umur + 2.6;
      E.data.suratPada = E.umur + 3;
    }

    // Tepuk tangan: pose pegawainya ditulis ulang tiap frame selama
    // rentangnya, dan dijaga masihMain — kalau dia direbut tool call di
    // tengah tepukan, event ini berhenti menyentuhnya sama sekali.
    if (E.data.tepukSampai && E.umur < E.data.tepukSampai) {
      const a = E.data.a;
      if (masihMain(E, a)) a.pose = 'tepuk';
      if (Math.random() < 3 * dt) spawn('talk', T.x + acak(-16, 16), T.y - 32);
      if (Math.random() < 1.4 * dt) spawn('ping', T.x + acak(-18, 18), T.y - 36);
    } else if (E.data.tepukSampai && !E.data.tepukUsai) {
      E.data.tepukUsai = true;
      const a = E.data.a;
      if (masihMain(E, a)) a.pose = null;
    }

    // Prosedur: yang ditanya bukan berat galonnya, tapi surat jalannya.
    if (E.data.suratPada && E.umur > E.data.suratPada && !E.data.surat) {
      E.data.surat = true;
      const a = E.data.a;
      if (masihMain(E, a)) a.say('ada surat jalannya, Pak?');
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 30);
      E.data.pulangPada = E.umur + 3.4;
    }

    if (E.data.pulangPada && E.umur > E.data.pulangPada && T.fase !== 'pulang'
      && T.fase !== 'usai') {
      T.barbelDiBahu = true;                       // barbelnya dipanggul lagi
      E.data.barbelX = null;
      TOKOH.pulangkan(T, true);
    }
    if (E.umur > 36 && T.fase !== 'pulang' && T.fase !== 'usai') {
      T.barbelDiBahu = true;
      E.data.barbelX = null;
      TOKOH.pulangkan(T, true);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (E.data.barbelX != null) ATLET.barbel(E.data.barbelX, 270, 'lantai');
    if (!T || T.fase === 'usai' || T.x > TOKOH.KELUAR_KANAN) return;
    TOKOH.gambar(T);
    // Galon di satu tangan, setinggi bahu. Digambar SESUDAH badan supaya
    // terbaca terangkat di depan, bukan menempel di punggung.
    if (T.galonDiTangan) {
      const x = Math.round(T.x), y = Math.round(T.y);
      r(x + 6, y - 30, 12, 10, '#7db8e8');
      r(x + 8, y - 28, 2, 6, '#b8dcf4');
      r(x + 10, y - 33, 4, 3, '#5f9fd4');
    }
  },
  /* 290: sesudah pantry (270), dispenser & tong sampah (288), sebelum pot
     tanaman (294) dan kipas (295) — dua benda yang ada di ujung kiri/tengah
     ruangan dan tidak pernah bertumpuk dengannya. Jadi dia di depan perabot
     yang sedang dia kerjakan, dan itu yang benar untuk adegan ini. */
  sortY: 290,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) { a.pose = null; a.doingEvent = ''; }
  },
},

/* ------------------------------------------------------- 4. PEBULUTANGKIS ---
   Laron mengerumuni neon, dia menepuk satu dengan raket tanpa berpikir, lalu
   sadar seluruh ruangan menonton. Beatnya pendek karena leluconnya memang
   satu gerakan.

   bentrokDengan kutu-lampu-neon: keduanya menghamburkan laron di titik yang
   sama (NEON_X, cy=16) dan dua kerumunan laron di satu lampu terbaca sebagai
   salah gambar. nyamuk-sore ikut dibentrokkan karena syaratnya sendiri
   berbunyi `|| sedangJalan('kutu-lampu-neon')` — dua adegan tepuk-serangga
   bersamaan menghabiskan leluconnya sekaligus. */
{
  id: 'pebulutangkis-raket-di-punggung',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 40,
  tamuTenar: true,
  babak: { apel: 0, malam: 1.3, lembur: 1.3, libur: 0.4 },
  bentrokDengan: ['kutu-lampu-neon', 'nyamuk-sore'],
  // Syarat laron sama persis dengan kutu-lampu-neon: lampu benar-benar
  // menyala terang (S.lampu > 0.7 = di luar sudah gelap) dan ruangan tidak
  // sedang dalam mode hening.
  syarat: (S) => !TOKOH.adaTamu() && S.lampu > 0.7 && !MOD.hening,
  mulai(E) {
    /* Berdiri di (170,150), tepat di bawah neon kiri (NEON_X[0] = 170).
       Kabinet filing berhenti di x156 dan jendela baru mulai x186, jadi
       koridor di bawah neon itu memang kosong; kursi jauh meja rapat mulai
       y169, 19 px di bawahnya. */
    const T = TOKOH.buat({
      pal: { main: '#efeee4', pants: '#20242c', skin: '#c98f5e', hair: '#1b1712' },
      aksesori: ATLET.raket,
    }, false, LANE_DOWN);
    TOKOH.antar(T, 170, 150);
    E.data.t = T;
    E.data.laron = [];
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 48);
    if (T.fase === 'masuk' && sampai) {
      T.fase = 'berdiri';
      T.hadap = 'up';
      E.data.laronPada = E.umur + 1.2;
    }
    // Sudah menyentuh titik di luar bingkai: matikan lebih awal alih-alih
    // membiarkan sisa durasi habis dengan panggung kosong.
    if (T.fase === 'pulang' && sampai) { T.fase = 'usai'; E.selesaiCepat = true; }

    if (!E.data.a && E.umur > 2.8 && E.umur < 3.1) {
      E.data.a = TOKOH.kenali(E, T, 'raketnya... itu bukan yang di TV, ya?');
    }
    if (E.umur > 2.8 && E.umur < 22) TOKOH.gempar(T.x, T.y, dt, 0.6);

    if (E.data.laronPada && E.umur > E.data.laronPada && !E.data.laronAda) {
      E.data.laronAda = true;
      E.data.jatuhPada = E.umur + 4.5;
    }
    /* Kerumunannya DIJAGA tiap frame, bukan ditabur sekali di satu tenggat.
       spawn('laron') memberi `life: 2 + Math.random() * 2` detik, sementara
       jarak dari tabur pertama sampai raketnya naik hampir tujuh detik: yang
       ditabur sekali sudah habis semua sebelum ayunannya, dan yang tersisa di
       layar cuma orang menepuk lampu yang kosong. Tidak ada uji yang bisa
       menangkap itu — tidak melempar, tidak ber-NaN, cuma bisu.
       Jadi yang sudah gugur dibuang dari daftar dan yang kurang ditambah lagi.
       Sesudah separuhnya digugurkan targetnya turun ke 5 supaya "kerumunannya
       menipis" tetap terbaca, dan sesudah ditepuk penambahan berhenti sama
       sekali — sisanya dibiarkan habis sendiri waktu dia berjalan pulang. */
    if (E.data.laronAda && !E.data.tepuk) {
      E.data.laron = E.data.laron.filter((p) => p && p.life > 0);
      const target = E.data.jatuh ? 5 : 12;
      while (E.data.laron.length < target) E.data.laron.push(spawn('laron', 170, 16));
    }
    // Separuh kerumunan gugur: `g` di partikel 'laron' dipakai sebagai
    // penanda jatuh (lihat updateParts), bukan gravitasi biasa.
    if (E.data.jatuhPada && E.umur > E.data.jatuhPada && !E.data.jatuh) {
      E.data.jatuh = true;
      for (const p of E.data.laron) if (p.life > 0 && Math.random() < 0.5) p.g = 110;
      /* 1,35 detik, bukan 2,2. Yang gugur jatuh dari cy=16 dengan g=110 px/s²,
         jadi ia sampai di ketinggian kepala raket (gumpal di y-34..y-26 =
         y116..124 waktu dia berdiri di y=150) sekitar t = sqrt(2 × 100 / 110)
         ≈ 1,35 s. updateParts mengintegrasi cara Euler (vy dinaikkan sebelum
         y ditambah), jadi jatuhnya beberapa piksel lebih cepat dari rumus itu
         — diukur di sandbox laronnya ada di y≈126 waktu raket naik, tepat di
         sisi bawah kepala raket. Di detik 2,2 ia sudah 250 px di bawah
         raketnya: raket menepuk udara dan serbuk di (174,118) muncul tanpa
         satu pun laron di sana. */
      E.data.tepukPada = E.umur + 1.35;
    }

    // Tepukan refleks: raket naik setengah detik, dua laron hilang, serbuk.
    if (E.data.tepukPada && E.umur > E.data.tepukPada && !E.data.tepuk) {
      E.data.tepuk = true;
      T.ayunSampai = E.umur + 0.55;
      // Didahulukan yang SEDANG jatuh (g > 0) — cuma mereka yang benar-benar
      // ada di ketinggian raket. Lintasan kedua ke laron mana pun dipasang
      // supaya beatnya tidak pernah kosong kalau undian jatuhnya kebetulan
      // meleset jauh dari x raketnya.
      let kena = 0;
      for (const p of E.data.laron) {
        if (kena >= 2) break;
        if (p.life > 0 && p.g > 0) { p.life = 0; kena++; }
      }
      for (const p of E.data.laron) {
        if (kena >= 2) break;
        if (p.life > 0) { p.life = 0; kena++; }
      }
      for (let i = 0; i < 4; i++) spawn('serbuk', 174, 118);
      blip(760, 0.05);
      E.data.canggungPada = E.umur + 0.7;
    }
    if (T.ayunSampai && E.umur > T.ayunSampai) T.ayunSampai = 0;

    // Canggung: SESUDAH tepukan barulah semua menoleh. Urutannya penting —
    // ruangan yang sudah menonton duluan menghapus kejutan gerakannya.
    if (E.data.canggungPada && E.umur > E.data.canggungPada && !E.data.canggung) {
      E.data.canggung = true;
      TOKOH.tengok(S, T.x, T.y, 1600);
      for (let i = 0; i < 4; i++) spawn('talk', T.x, T.y - 30);
      const a = E.data.a;
      if (masihMain(E, a)) a.say('refleks, ya, Pak?');
      E.data.antiPada = E.umur + 3.4;
    }
    /* Antiklimaks: salah alamat, bukan "yang paraf lagi rapat di luar" —
       kalimat itu sudah jadi penutup bek-lemparan-dua-tangan, dan dua tamu
       yang dipulangkan dengan alasan yang sama persis terbaca sebagai satu
       event yang diulang, bukan dua. */
    if (E.data.antiPada && E.umur > E.data.antiPada && !E.data.anti) {
      E.data.anti = true;
      const a = E.data.a;
      if (masihMain(E, a)) a.say('oh — yang dicari di gedung sebelah, Pak');
      E.data.pulangPada = E.umur + 2.8;
    }

    if (E.data.pulangPada && E.umur > E.data.pulangPada && T.fase !== 'pulang'
      && T.fase !== 'usai') {
      TOKOH.pulangkan(T, false);
    }
    if (E.umur > 30 && T.fase !== 'pulang' && T.fase !== 'usai') TOKOH.pulangkan(T, false);
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.fase === 'usai' || T.x < TOKOH.KELUAR_KIRI) return;
    TOKOH.gambar(T);
  },
  // Sama seperti kiper: adegan utamanya berdiri di y150 di depan dinding.
  sortY: 152,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) a.doingEvent = '';
  },
},

/* ------------------------------------------------------------ 5. PEMANJAT ---
   Satu-satunya event di berkas ini yang naik ke area DINDING, dan karena itu
   yang paling mudah salah sortY. Angkanya 160 dan alasannya di catatan
   sortY di bawah.

   Arah errand-nya dibalik dari usulan (lihat butir 1 di kepala berkas): dus
   yang menumpuk di LANTAI di depan lemari arsip itu yang punya data
   (RUANGAN.dusTambahanArsip), sedangkan dus di ATAS lemari cuma gambar tetap
   di drawArsip. Jadi yang dikerjakan menaikkan satu dus ke atas — tempat
   yang memang tidak terjangkau siapa pun tanpa memanjat, dan itu jawaban
   atas kenapa tumpukan itu tidak pernah dibereskan sendiri. */
{
  id: 'pemanjat-harness-kapur',
  kelas: 'latar', bobot: B.langka, cooldown: 3600, durasi: 58,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.4, malam: 0.3, libur: 0.2 },
  /* Semua penulis/pembaca dus & lemari arsip. Bukan kerapian: dus-arsip-
     ditumpuk dan kurir-paket-datang MENAMBAH dusTambahanArsip sementara
     event ini menguranginya, dan pemadatan-arsip mengosongkannya sekaligus —
     dua yang berlawanan arah di frame yang sama bikin tumpukannya berkedip.
     dus-arsip-ambruk ikut karena adegannya di lemari yang sama persis. */
  bentrokDengan: ['dus-arsip-ditumpuk', 'kurir-paket-datang', 'pemadatan-arsip',
    'lemari-arsip-kepenuhan', 'dus-arsip-ambruk'],
  // !stasiunAktif.has('read'): jangan menempelkan orang luar ke lemari arsip
  // yang sedang dipakai sesi sungguhan.
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 7 && S.jam < 16
    && !S.stasiunAktif.has('read'),
  mulai(E) {
    /* Naik lurus di x=62 dari lajur bawah ke y152, lalu geser ke x=56.
       Koridor itu memang kosong: X-banner berhenti di x42, pot tanaman
       x20..45, tiang bendera x127..139, dan rumbai karpet meja rapat baru
       mulai x154. Di x=56 dia tepat di tengah muka lemari arsip (x26..82). */
    const T = TOKOH.buat({
      pal: { main: '#e8712a', pants: '#3a3f45', skin: '#c98f5e', hair: '#1b1712' },
      aksesori: ATLET.harness,
    }, false, LANE_DOWN);
    T.wp = [[62, LANE_DOWN], [62, 152], [56, 152]];
    E.data.t = T;
    E.data.lantaiY = 152;                          // pangkal tali, tidak berubah
  },
  tick(E, dt, S) {
    const T = E.data.t;
    // langkah() cuma dipakai selama dia di lantai; pemanjatan digerakkan
    // manual karena tidak ada lajur vertikal di jalur() untuk muka lemari.
    if (T.fase === 'masuk' || T.fase === 'pulang') {
      const sampai = TOKOH.langkah(T, dt, 46);
      if (sampai && T.fase === 'masuk') {
        T.fase = 'siap';
        T.hadap = 'up';
        E.data.siapPada = E.umur + 2.4;
      }
      if (sampai && T.fase === 'pulang') { T.fase = 'usai'; E.selesaiCepat = true; }
    }

    if (!E.data.a && E.umur > 3.2 && E.umur < 3.5) {
      E.data.a = TOKOH.kenali(E, T, 'ada tali... mau manjat, Mas?');
    }
    if (E.umur > 3.2 && E.umur < 26) TOKOH.gempar(T.x, T.y, dt, 0.45);

    /* Cabang jujur, diputuskan waktu dia SAMPAI (bukan di mulai()): dus di
       lantai cuma DIGAMBAR kalau RUANGAN.arsipPenuh, jadi klaim "satu dus
       berkurang" cuma sah kalau keduanya benar. Kalau tidak, dia tetap
       memanjat, tapi yang dikerjakan membetulkan letak boks di atas — dan
       event ini pulang tanpa bekas permanen. */
    if (E.data.siapPada && E.umur > E.data.siapPada && E.data.adaDus == null) {
      E.data.adaDus = RUANGAN.arsipPenuh && RUANGAN.dusTambahanArsip > 0;
      if (E.data.adaDus) {
        RUANGAN.dusTambahanArsip = Math.max(0, RUANGAN.dusTambahanArsip - 1);
        T.bawa = 'boks';
        for (let i = 0; i < 3; i++) spawn('dust', 34, 114);
      }
      T.fase = 'panjat';
      blip(200, 0.06);
    }

    // Memanjat: 106 px dalam ±4,4 detik. Berhenti di y=46 — muka lemari
    // arsip y30..118, jadi di situ dia menggantung di tengah raknya dan
    // tangannya sampai ke dus di atas (y16..28). Tidak dibawa sampai berdiri
    // DI ATAS lemari: kepalanya akan menembus tepi atas kanvas.
    if (T.fase === 'panjat') {
      T.y = Math.max(46, T.y - 24 * dt);
      if (T.y <= 46) { T.fase = 'atas'; E.data.atasPada = E.umur + 1.4; }
    } else if (T.fase === 'turun') {
      T.y = Math.min(E.data.lantaiY, T.y + 28 * dt);
      if (T.y >= E.data.lantaiY) {
        T.fase = 'pulang';
        TOKOH.pulangkan(T, false);
      }
    }

    if (T.fase === 'atas' && E.data.atasPada && E.umur > E.data.atasPada && !E.data.taruh) {
      E.data.taruh = true;
      T.bawa = null;
      for (let i = 0; i < 4; i++) spawn('dust', 40, 22);
      blip(280, 0.07);
      TOKOH.tengok(S, T.x, T.y, 1200);
      E.data.suratPada = E.umur + 1.6;
      E.data.turunPada = E.umur + 3.4;
    }
    // Prosedur: yang ditanya bukan bagaimana dia naik, tapi surat tugasnya.
    if (E.data.suratPada && E.umur > E.data.suratPada && !E.data.surat) {
      E.data.surat = true;
      const a = E.data.a;
      if (masihMain(E, a)) {
        hadapkan(a, T.x, T.y);
        a.say(E.data.adaDus ? 'ada surat tugasnya, Mas?' : 'itu... dibiarkan saja, Mas');
      }
      for (let i = 0; i < 3; i++) spawn('talk', T.x, T.y - 30);
    }
    if (E.data.turunPada && E.umur > E.data.turunPada && T.fase === 'atas') {
      T.fase = 'turun';
    }

    /* Jaring pengaman: durasi habis selagi dia masih di dinding = dia lenyap
       menggantung di udara. Batas 44 memberi 14 detik untuk turun (±3,8 s)
       dan berjalan keluar bingkai. */
    if (E.umur > 44 && (T.fase === 'panjat' || T.fase === 'atas')) {
      T.bawa = null;
      T.fase = 'turun';
    }
    // Dan kalau perjalanannya sendiri yang tersendat (masuk / siap belum juga
    // lewat di detik 50), dia tetap harus sempat berjalan keluar.
    if (E.umur > 50 && T.fase !== 'pulang' && T.fase !== 'usai') {
      T.bawa = null;
      T.y = E.data.lantaiY;
      TOKOH.pulangkan(T, false);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.fase === 'usai' || T.x < TOKOH.KELUAR_KIRI) return;
    // Tali digambar SEBELUM badan: ia keluar dari balik pinggangnya, bukan
    // menempel di depan bajunya.
    if (T.y < E.data.lantaiY - 2) ATLET.tali(Math.round(T.x), Math.round(T.y), E.data.lantaiY);
    TOKOH.gambar(T);
    // Serbuk kapur dari kantong selama memanjat — satu titik yang jatuh, cuma
    // sesekali, supaya tidak terbaca sebagai kebocoran.
    if (T.fase === 'panjat' && Math.random() < 0.06) spawn('dust', T.x + 5, T.y - 10);
  },
  /* 160 — angka yang paling mudah salah di berkas ini. Yang dituntut adegan
     ini dua-duanya sekaligus:
       * DI DEPAN lemari arsip (drawArsip sortY 118) dan prop lantai (119),
         karena dia memang menempel di muka lemari — bukan di dalamnya;
       * DI BELAKANG siapa pun yang berjalan di LANE_UP (y=164, diurut apa
         adanya), karena lajur itu ada di depan deretan meja dinding.
     160 jatuh persis di antara keduanya, dan tetap benar sepanjang dia naik
     ke y=46: sortY event dibaca SEKALI dari definisi, tidak ikut posisi. Itu
     justru yang menyelamatkan adegan ini — kalau sortY-nya mengikuti T.y,
     dia akan menyelinap ke belakang lemari begitu naik. */
  sortY: 160,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) a.doingEvent = '';
  },
},

/* -------------------------------------------- 6. ROMBONGAN PEMBERSIH SUNGAI ---
   Tiga sosok berpalet SAMA PERSIS — kaos gelap, sarung tangan karet oranye,
   boot tinggi, karung putih di punggung. Keseragaman itu yang bikin mereka
   terbaca satu rombongan; pola yang sama dipakai rombongan-studi-banding.

   Satu-satunya event panjang di berkas ini (100 detik), dan satu-satunya
   yang bekasnya benar-benar berguna: lantai bersih, tong dikosongkan, kurva
   kekusutan harian ditarik turun. Ketiganya lewat field yang MEMANG punya
   penggambar — lihat butir 2 di kepala berkas soal RUANGAN.sampahLantai yang
   sengaja tidak disentuh.

   Menyapunya dititipkan ke basahSapuSampah() (22-kebersihan-dan-basah.js)
   apa adanya, bukan disalin: fungsinya persis yang dibutuhkan (buang daun &
   kertas bekas dalam radius 12 px di pita lantai y240..292, dari propLantai
   maupun kertasLantai), sudah dipakai ob-ngepel-lantai, dan menyalinnya
   berarti dua versi yang lambat laun berbeda diam-diam. */
{
  id: 'rombongan-pembersih-sungai',
  // durasi 104: menyapu 356 px pita lantai dengan kecepatan menyapu sungguhan
  // (5 px/detik, seperempat kecepatan berjalan) memakan ±72 detik sendirian,
  // dan sesudahnya masih ada tong sampah dan perjalanan keluar. Ini SATU-
  // SATUNYA event panjang di berkas ini, dan bobot langka + cooldown 5400
  // yang membayarnya.
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 104,
  tamuTenar: true,
  babak: { apel: 0, malam: 0.3, libur: 0.5 },
  /* Semua adegan bersih-bersih lain. ob-ngepel-lantai menyapu pita lantai
     yang sama persis; jumat-bersih & kerja-bakti-berkas sama-sama memanggil
     bereskanKusut() dan dua penurun kurva bersamaan bikin ruangan bersih
     mendadak tanpa sebab yang kelihatan; ember-luber-lantai-licin justru
     mengotori pita yang sedang mereka sapu. */
  bentrokDengan: ['ob-ngepel-lantai', 'jumat-bersih', 'kerja-bakti-berkas',
    'ember-luber-lantai-licin'],
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 7 && S.jam < 16.5,
  mulai(E) {
    /* Tiga baris dengan y berbeda (252/258/264) supaya terbaca rombongan yang
       menyebar, bukan satu file berbaris. Angkanya mulai dari 252 dan bukan
       248: karpet meja rapat dicat r(152,176,188,76) = y176..252, jadi baris
       248 akan menyapu KARPET, bukan ubin — dan yang dibuang basahSapuSampah
       memang sampah lantai. 252 = LANE_DOWN (baris pertama ikut lajur pejalan
       biasa), 264 masih jauh di atas ruang tunggu (y288), dan ketiganya di
       dalam pita yang disapu basahSapuSampah (y240..292). */
    E.data.rom = [0, 1, 2].map((i) => {
      const o = TOKOH.buat({
        pal: ATLET.PAL_BERSIH,
        karung: true,
        aksesori: ATLET.bersih,
      }, false, LANE_DOWN + i * 6);
      o.x = TOKOH.MASUK_KIRI - i * 18;
      o.wp = [[40 + i * 16, o.y]];
      o.sapuT = 0;
      return o;
    });
    E.data.batasSapu = 396;
  },
  tick(E, dt, S) {
    const R = E.data.rom;

    R.forEach((o, i) => {
      if (o.fase === 'masuk') {
        if (TOKOH.langkah(o, dt, 46)) { o.fase = 'sapu'; o.hadap = 'right'; }
        return;
      }
      if (o.fase === 'sapu') {
        /* Menyapu = berjalan pelan sambil mendorong sapu. Titik tujunya
           digeser maju tiap frame sampai mentok di batas, jadi langkah()
           yang sama dengan pejalan lain yang menggerakkannya — tidak perlu
           penggerak kedua yang harus dijaga sendiri. Batasnya bertingkat 8
           px per orang supaya berhentinya tidak sebaris. */
        const batas = E.data.batasSapu + i * 8;
        o.wp = [[Math.min(batas, o.x + 40), o.y]];
        const sampai = TOKOH.langkah(o, dt, 5);   // seperempat kecepatan berjalan
        o.sapuT += dt;
        if (o.sapuT > 0.5) {
          o.sapuT = 0;
          spawn('dust', o.x, o.y + 4);
          basahSapuSampah(o.x);                    // daun & kertas bekas benar-benar hilang
        }
        if (sampai) { o.fase = 'usai'; o.hadap = 'right'; }
        return;
      }
      if (o.fase === 'ke-tong' || o.fase === 'pulang') {
        const sampai = TOKOH.langkah(o, dt, 44);
        if (sampai && o.fase === 'ke-tong') {
          o.fase = 'tong';
          o.hadap = 'right';
          E.data.tongPada = E.umur + 1.4;
        }
        if (sampai && o.fase === 'pulang') o.fase = 'keluar';
      }
    });

    // Pengenalan: satu orang sadar, dan yang dikenali justru seragamnya.
    if (!E.data.a && E.umur > 5 && E.umur < 5.3) {
      E.data.a = TOKOH.kenali(E, R[0], 'itu yang suka bersihin sungai itu, kan?');
    }
    if (E.umur > 5 && E.umur < 40) TOKOH.gempar(R[1].x, R[1].y, dt, 0.5);

    // Gelombang: satu HP keluar, lalu disimpan lagi. Cuma satu — ruangan
    // tetap harus terlihat bekerja di belakang mereka.
    if (E.umur > 11 && E.umur < 11.3 && !E.data.hp) {
      E.data.hp = true;
      const a = E.data.a;
      if (masihMain(E, a)) { a.bawa = 'hp'; a.bawaSampai = now + 9000; }
    }

    // Prosedur, dan jawabannya yang mengempiskan: suratnya tidak ada dan
    // yang menandatangani sedang di luar — tapi lantainya tetap disapu.
    if (E.umur > 28 && E.umur < 28.3 && !E.data.surat) {
      E.data.surat = true;
      const a = E.data.a;
      if (masihMain(E, a)) {
        hadapkan(a, R[1].x, R[1].y);
        a.say('ini ada surat tugasnya nggak ya, Bang?');
      }
      for (let i = 0; i < 3; i++) spawn('talk', R[1].x, R[1].y - 28);
    }

    /* Sudah menyapu seluruh pita: kurva kekusutan harian ditarik turun lebih
       dalam dari ob-ngepel-lantai (0,6) tapi tidak sebersih jumat-bersih
       (0,1) — mereka membereskan LANTAI seisi ruangan, bukan tumpukan di
       meja orang. Tidak dikunci: kurvanya menyeretnya naik lagi pelan-pelan. */
    if (!E.data.beres && R.every((o) => o.fase === 'usai')) {
      E.data.beres = true;
      bereskanKusut(0.3);
      // Yang paling kanan mampir ke tong sampah (drawTongSampah tx=437,
      // ty=278). Berdiri di (428,266): 9 px di kiri tongnya, di dalam pantry
      // dan tidak menindih dispenser (x462..480).
      TOKOH.antar(R[2], 428, 266);
      R[2].fase = 'ke-tong';
      R[0].fase = 'tunggu';
      R[1].fase = 'tunggu';
    }

    if (E.data.tongPada && E.umur > E.data.tongPada && !E.data.tong) {
      E.data.tong = true;
      RUANGAN.tongPenuh = 0;                       // isinya benar-benar diangkut
      R[2].karungPenuh = true;                     // karungnya menggembung
      for (let i = 0; i < 4; i++) spawn('dust', 441, 272);
      blip(240, 0.07);
      E.data.pulangPada = E.umur + 2.4;
    }

    if (E.data.pulangPada && E.umur > E.data.pulangPada && !E.data.pulang) {
      E.data.pulang = true;
      // Keluar lewat kanan bertiga: yang terakhir sudah di pantry, dan
      // menyeret dua lainnya balik ke kiri melewati seluruh ruangan yang
      // baru mereka sapu terbaca sebagai mundur, bukan pamit.
      R.forEach((o, i) => {
        o.wp = TOKOH.jalur(o.x, o.y, W - 40, LANE_DOWN);
        o.wp.push([TOKOH.KELUAR_KANAN + i * 14, LANE_DOWN]);
        o.fase = 'pulang';
      });
      const a = E.data.a;
      if (masihMain(E, a)) a.say('makasih ya, Bang');
    }

    // Jaring pengaman: 90 memberi ±14 detik untuk berjalan keluar bingkai
    // (perjalanan pulang terpanjang, dari x=396 ke tepi kanan, ±6 detik).
    if (E.umur > 90 && !E.data.pulang) {
      E.data.pulang = true;
      R.forEach((o, i) => {
        o.wp = TOKOH.jalur(o.x, o.y, W - 40, LANE_DOWN);
        o.wp.push([TOKOH.KELUAR_KANAN + i * 14, LANE_DOWN]);
        o.fase = 'pulang';
      });
    }
    if (E.data.pulang && R.every((o) => TOKOH.sudahKeluar(o))) E.selesaiCepat = true;
  },
  gambarProp(E) {
    for (const o of (E.data.rom || [])) {
      if (o.x < TOKOH.KELUAR_KIRI - 20 || o.x > TOKOH.KELUAR_KANAN + 20) continue;
      TOKOH.gambar(o);
      // Sapu cuma di tangan yang sedang menyapu; yang sudah selesai
      // memanggulnya tidak digambar — dua sapu yang menempel di badan diam
      // terbaca sebagai galat gambar, bukan sebagai istirahat.
      if (o.fase === 'sapu') ATLET.sapu(Math.round(o.x), Math.round(o.y), 1);
    }
  },
  // LANE_DOWN + 24, sama dengan ob-ngepel-lantai: pegawai di pita 230..265
  // diurut memakai a.y + 24, jadi tanpa ini rombongannya tenggelam di balik
  // sandaran kursi rapat sisi dekat tepat waktu melintas x214 dan x278.
  sortY: 276,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) a.doingEvent = '';
  },
},

);
