/* ==========================================================================
   TAMU TENAR — TOKOH GLOBAL
   ==========================================================================
   Tujuh sosok yang dikenal orang di luar Indonesia juga: dua pesepak bola,
   satu pembalap, satu bos perusahaan mesin, satu pahlawan bertopeng, satu
   peserta permainan bertahan hidup, dan satu pemburu berkepang ungu. Semua
   dibangun dari SILUET, bukan nama — alasan lengkapnya ada di kepala
   33-tamu-tenar-dasar.js dan tidak diulang di sini. Yang perlu dicatat untuk
   berkas INI: siluet global harus terbaca oleh penonton yang tidak pernah
   nonton liga mana pun, jadi tiap tokoh dipilih yang tanda pengenalnya berupa
   WARNA yang tidak bisa tertukar dengan seragam mana pun di ruangan ini.
   Enam belas palet JABATAN di room.js semuanya rendah saturasi: cokelat
   (#6b3f21), khaki (#c9b178), navy (#2f4470), zaitun (#4f6b3c), maroon
   (#8c3a48), abu (#2b3138). Dua yang paling dekat dengan warna tamu di sini
   pun masih jauh — analis sistem #5b4d86 itu ungu kelabu lawan kepang
   #7b3fa0, dan teknisi #c07a2a itu cokelat jingga lawan wearpack #ef6f24.
   Yang membedakan bukan rona, tapi saturasinya: tidak ada satu pegawai pun
   yang seterang ini. Itulah yang bekerja, bukan detail wajah yang di 26 px
   memang tidak ada.

   ------------------------------------------------------ bentuk yang dipakai
   Ketujuhnya kelas 'latar', bukan 'panggung'. Bukan kelalaian: TOKOH.adaTamu()
   sudah menjamin cuma satu tamu tenar hidup pada satu waktu, jadi 'panggung'
   tidak menambah jaminan apa pun — yang ia tambahkan cuma penguncian seluruh
   adegan lain selama 40-54 detik, dan tujuh event sekaligus yang berlaku
   begitu akan membuat ruangan sering berhenti bekerja tanpa alasan.

   Tidak ada satu pun syarat() yang membaca S.babak. Di harness buatS() tidak
   pernah mengisi babak, jadi syarat berbasis babak TIDAK PERNAH lolos di uji
   dan eventnya lewat sebagai "0 kombinasi benar" tanpa ada yang salah di
   kodenya. Ketergantungan waktu dititipkan ke pengali `babak: {...}` yang
   memang jalur resminya, plus S.jam yang aman di harness.

   ----------------------------------------------- yang TIDAK jadi dibuat
   1. Tiga digit "456" yang benar-benar terbaca. Dada sosok 26 px lebarnya 8
      piksel (x-4..x+3 di drawPerson); tiga angka yang terbaca butuh 3 px per
      angka plus dua sela = 11 px. Yang digambar akhirnya: bidang putih (kaus
      dalam yang menyembul dari training yang tidak diresleting) selebar dada
      dengan TIGA guratan tinta 2 px. Dari jarak tonton itu terbaca "ada angka
      tiga digit di dadanya", dan pasangan training toska + angka dada itulah
      tanda pengenalnya. Memaksa digit yang "benar" cuma menghasilkan tiga
      noda yang tidak terbaca sebagai apa pun — lebih buruk, bukan lebih
      jujur. Warna trainingnya tetap terbaca lewat lengan, bahu, dan celana
      yang tidak tertutup bidang putih itu.

   2. Pahlawan yang MASUK LAGI lewat pintu depan sesudah disuruh keluar.
      Godaannya besar (itu penutup yang paling rapi), tapi ongkosnya satu
      perjalanan penuh lagi: ±6 detik keluar + ±6 detik masuk + beat loket,
      total durasi harus ~80 detik untuk satu event ber-bobot B.langka yang
      sebagian besar waktunya cuma orang berjalan. Leluconnya sudah tuntas di
      "dia menurut"; sisanya jadi menit yang dibayar penonton untuk menunggu.

   3. Mesin baru yang benar-benar muncul di rak PC server. drawServer() hidup
      di room.js dan tidak punya cabang "satu unit tambahan"; menambahkannya
      berarti menyentuh berkas bersama yang dari sini memang tidak boleh
      disentuh. Yang dipakai sebagai gantinya cuma yang SUDAH punya cabang:
      MOD.switchBadai, yang membuat semua LED rak berdenyut serempak dan
      mem-bypass gerbang `active` — jadi raknya "hidup" walau tidak ada
      seorang pun bekerja di situ. Persis yang dibutuhkan adegan demo.
      MOD.rakPanas juga mem-bypass `active`, dan justru karena itu keduanya
      dibentrokkan: drawServer memeriksa rakPanas LEBIH DULU, jadi kalau
      keduanya menyala yang terlihat cuma LED oranye kepanasan dan denyut
      serempak tidak pernah sampai ke layar.

   4. Anggukan puas petugas di adegan pembalap. drawPerson tidak punya sumbu
      kepala — tidak ada anggukan, tidak ada gelengan, dan memutar kanvas
      untuk satu piksel kepala bikin wajahnya pecah. Anggukan itu dibawa
      kalimatnya ("oh iya, cocok"), bukan dipalsukan dengan pose yang
      sebenarnya berarti hal lain.

   5. Bekas di buku tamu. Bidang itu dipegang berkas lain di gelombang yang
      sama, dan dua penulis yang menaikkan penghitung yang sama menghasilkan
      buku yang bertambah dua baris untuk satu tamu. Dari tujuh event di sini,
      cuma DUA yang meninggalkan bekas permanen, dan keduanya lewat field yang
      sudah punya penggambar sendiri: RUANGAN.mapDisposisi (tumpukan map di
      meja stempel, drawStempel) dan RUANGAN.antre (papan nomor loket,
      drawNomorAntre). Lima sisanya tidak meninggalkan apa-apa — lebih baik
      tanpa bekas daripada menambah field RUANGAN yang tidak ada yang
      menggambarnya.

   --------------------------------------------------------- batas yang dibayar
   * Satu event = satu sortY (mesinnya membaca E.def.sortY sekali, bukan per
     orang). Tiap sortY di bawah dipilih untuk ADEGAN UTAMA-nya, bukan untuk
     transitnya di lajur. Ongkosnya dua lapis, dan yang kedua sengaja disebut
     di sini karena lebih mudah dilihat daripada diakui:
       (a) terhadap PEJALAN lain, urutan tumpang-tindihnya bisa meleset
           sekilas selagi tamunya masuk/keluar;
       (b) terhadap PERABOT, tamu ber-sortY lajur atas yang transit di lajur
           bawah bisa tergambar di belakang benda yang seharusnya ia lewati di
           depannya. Yang tersisa di berkas ini cuma satu: peserta-training
           (sortY 164) masuk di y=252 dan melewati X-banner (x16..42, dasar
           y=240, sortY 242), jadi kepala dan bahunya tertutup banner selama
           ±0,6 detik. Dibiarkan karena persis itu yang sudah dibayar
           mahasiswa-magang-bingung di 25-tamu-birokrasi.js — sortY 152, masuk
           di y=252, melewati banner yang sama. Yang TIDAK dibiarkan adalah
           kasus yang lebih parah dari itu: lihat catatan lajur masuk di
           bos-jaket-kulit-hitam.
   * Aksesori digambar di koordinat KAKI yang sudah dibulatkan (keputusan
     TOKOH.gambar, supaya topi/helm tidak bergetar setengah piksel), sedangkan
     badan sprite naik-turun 1 px (bob) waktu berjalan dan bernapas. Semua
     aksesori BADAN di berkas ini karena itu dikurung di baris y-15..y-10 —
     satu-satunya pita yang ada di dalam badan pada bob 0 MAUPUN bob -1.
     Angka punggung, garis jersey, punuk aerodinamis, kilau jaket, bidang
     kaus dalam: semuanya memakai pita itu, bukan baris yang "kelihatan pas"
     di satu frame. Aksesori KEPALA (topeng, helm) ikut hanyut 1 px seperti
     aksesori TOKOH yang sudah ada, dan itu tidak terlihat karena keduanya
     menimpa warna yang sama dengan yang ada di bawahnya: helm punya margin
     1 px di ubun-ubun, dan topeng jaring warnanya sama dengan rambut dan
     kulit yang ia tutupi.
   * Tidak satu pun tamu di sini menempati slot stasiun. Satu-satunya yang
     berdiri benar-benar menempel ke stasiun — bos jaket kulit, 11 px di depan
     titik kerja rak server — menolak jalan selama stasiun 'server' dipakai
     sesi sungguhan. Yang lain berdiri cukup jauh untuk tidak perlu penjaga
     itu: peserta-training paling dekat, 26 px di bawah titik berdiri stasiun
     'web'. Sesi Claude Code nyata tidak boleh mengantre di belakang lelucon.
   ========================================================================== */

const TENAR_GLOBAL = {

  /* ------------------------------------------------------------- angka ---
     Font angka 3x5 dari kotak 1 px. Bukan ctx.fillText: room.js sendiri sudah
     mencatat bahwa huruf 5 px "lumer jadi noda" (lihat drawNomorAntre yang
     menggambar digitnya dari rect, dan papan nama rak yang terpaksa naik ke
     7 px). Angka punggung jersey lebarnya cuma 3 px, jadi rect adalah
     satu-satunya cara ia tetap terbaca.

     Cuma angka yang benar-benar dipakai berkas ini yang didaftar: 7 (jersey
     kuning), lalu 1 dan 0 (jersey merah muda nomor sepuluh). Tidak ada yang
     lain. 4/5/6 sempat ada di sini untuk "456" di dada peserta training, dan
     ikut dicabut waktu tiga digit itu dibatalkan — pola yang tidak pernah
     dipanggil tidak pernah bisa salah maupun benar, jadi ia cuma baris yang
     harus dibaca orang berikutnya tanpa imbalan. */
  ANGKA: {
    0: ['###', '#.#', '#.#', '#.#', '###'],
    1: ['.#.', '##.', '.#.', '.#.', '###'],
    7: ['###', '..#', '..#', '.#.', '.#.'],
  },

  // kiri/atas = pojok kiri-atas digit pertama. Tinggi selalu 5, lebar tiap
  // digit 3 + 1 sela.
  angka(teks, kiri, atas, warna) {
    const s = String(teks);
    for (let i = 0; i < s.length; i++) {
      const pola = TENAR_GLOBAL.ANGKA[s[i]];
      if (!pola) continue;
      for (let by = 0; by < 5; by++) {
        for (let bx = 0; bx < 3; bx++) {
          if (pola[by][bx] === '#') r(kiri + i * 4 + bx, atas + by, 1, 1, warna);
        }
      }
    }
  },

  /* ------------------------------------------------------- aksesori ---
     Semua pabrik aksesori di bawah mengembalikan closure ber-tanda tangan
     (x, y, hadap, o) — bentuk yang dipanggil TOKOH.gambar() dan TOKOH.anak()
     sesudah badan selesai digambar, dengan x/y yang SUDAH dibulatkan. */

  /* Jersey sepak bola dewasa: dua pita warna aksen di tepi badan + nomor
     punggung yang cuma muncul waktu hadap 'up'. Pita ditaruh di tepi (x-4 dan
     x+3 dari depan/belakang, x-3 dan x+2 dari samping) supaya tidak pernah
     bertabrakan dengan angka 3 px yang selalu di tengah. Nomor dua digit
     lebarnya 7 px dan MEMANG akan menyentuh pita — satu-satunya pemakai
     helper ini bernomor satu digit, dan yang dua digit memakai sosok anak
     dengan aksesorinya sendiri. */
  jersey(aksen, nomor) {
    return (x, y, hadap) => {
      const samping = hadap === 'left' || hadap === 'right';
      r(samping ? x - 3 : x - 4, y - 14, 1, 5, aksen);
      r(samping ? x + 2 : x + 3, y - 14, 1, 5, aksen);
      if (hadap !== 'up' || !nomor) return;
      const lebar = String(nomor).length * 4 - 1;
      TENAR_GLOBAL.angka(nomor, x - Math.ceil(lebar / 2), y - 14, aksen);
    };
  },

  /* Jersey pada sosok ANAK (TOKOH.anak): peta ketinggiannya beda — badan
     x-3..x+3, y-13..y-6, dan tidak ada bob sama sekali karena anak() memang
     tidak menggambar bob. Jadi angkanya boleh lebih longgar: dua digit (7 px)
     muat persis selebar badan, dan dipasang di DUA sisi karena jersey
     sungguhan memang bernomor depan-belakang. */
  jerseyAnak(aksen, nomor) {
    return (x, y, hadap) => {
      r(x - 3, y - 7, 7, 1, aksen);                      // kelim bawah
      if (hadap === 'left' || hadap === 'right') return; // dari samping nomornya tak terbaca
      TENAR_GLOBAL.angka(nomor, x - 3, y - 12, aksen);
    };
  },

  /* Wearpack balap + helm full-face. Punuk aerodinamis ditaruh di pita
     y-15..y-13: dari belakang ia terbaca sebagai punggung yang menonjol tepat
     di bawah helm (helm menutup y-27..y-17), dari samping sebagai gundukan di
     balik bahu. Dari depan tidak ada punuk — yang ada tempelan sponsor,
     karena punuk yang terlihat dari depan itu bukan punuk. */
  pembalap(warna, gelap) {
    return (x, y, hadap, o) => {
      if (hadap === 'up') {
        r(x - 3, y - 15, 7, 3, gelap);
        r(x - 3, y - 15, 3, 1, lerpHex(gelap, '#ffffff', 0.22));
      } else if (hadap === 'right') {
        r(x - 5, y - 15, 3, 3, gelap);
      } else if (hadap === 'left') {
        r(x + 3, y - 15, 3, 3, gelap);
      } else {
        r(x - 2, y - 13, 5, 2, gelap);                   // tempelan sponsor di dada
      }
      if (o && o.helmDilepas) {
        // helm dijinjing di sisi badan, bukan lenyap: yang dilepas harus
        // kelihatan ke mana perginya
        const hx = hadap === 'left' ? x - 10 : x + 6;
        gumpal(hx, y - 13, 5, 5, warna);
        r(hx, y - 11, 5, 2, '#1a1d24');
        return;
      }
      TOKOH.helm(x, y, warna, '#1a1d24');
      /* TOKOH.helm tidak tahu arah hadap dan selalu menggambar visor. Visor di
         TENGKUK salah baca, jadi dari belakang ia ditutup lagi dengan warna
         helm plus satu garis ventilasi — yang justru bikin arah kepalanya
         makin jelas. */
      if (hadap === 'up') {
        r(x - 4, y - 23, 9, 3, warna);
        r(x - 2, y - 22, 5, 1, sh(warna, 0.72));
      }
    };
  },

  // Jaket kulit: satu garis kilau di bahu. Satu, bukan dua — kulit mengilap
  // karena ada SATU sumber cahaya, dan dua garis simetris malah terbaca
  // sebagai lidah bahu seragam PDH yang justru sedang dihindari.
  jaketKulit(kilau) {
    return (x, y, hadap) => {
      const samping = hadap === 'left' || hadap === 'right';
      r(samping ? x - 3 : x - 4, y - 14, samping ? 3 : 4, 1, kilau);
    };
  },

  /* Topeng setelan merah-biru: kepala dicat ulang penuh (termasuk telinga,
     yang drawHead gambar di luar kotak kepala) lalu dua mata putih besar
     bergaris hitam ditimpakan. Dari belakang tidak ada mata sama sekali —
     itu benar, dan sekaligus bikin arah hadapnya terbaca tanpa detail lain. */
  topengJaring(merah) {
    return (x, y, hadap) => {
      gumpal(x - 4, y - 25, 8, 8, merah);
      r(x - 6, y - 21, 2, 2, merah); r(x + 4, y - 21, 2, 2, merah);
      if (hadap === 'up') return;
      const mata = (mx) => {
        r(mx, y - 23, 3, 4, '#14161a');
        r(mx, y - 22, 3, 2, '#f4f6f8');
      };
      if (hadap === 'right') mata(x);
      else if (hadap === 'left') mata(x - 3);
      else { mata(x - 4); mata(x + 1); }
    };
  },

  /* Kaus putih bernomor tiga digit di dada. Lihat catatan (1) di kepala
     berkas: yang digambar bukan "456" yang terbaca, tapi bidang putih selebar
     dada dengan tiga guratan yang bentuknya berbeda-beda supaya terbaca
     sebagai tiga KARAKTER, bukan satu blok. */
  dadaTigaAngka(tinta) {
    return (x, y, hadap) => {
      if (hadap === 'up') return;                        // punggungnya polos
      const samping = hadap === 'left' || hadap === 'right';
      const kiri = samping ? x - 3 : x - 4;
      const lebar = samping ? 6 : 8;
      r(kiri, y - 14, lebar, 5, '#f2f0e6');
      if (samping) {
        r(kiri + 1, y - 13, 1, 3, tinta);
        r(kiri + 3, y - 13, 1, 2, tinta);
        return;
      }
      r(x - 4, y - 13, 2, 3, tinta); r(x - 3, y - 13, 1, 1, '#f2f0e6');
      r(x - 1, y - 13, 2, 3, tinta); r(x - 1, y - 11, 1, 1, '#f2f0e6');
      r(x + 2, y - 13, 2, 3, tinta); r(x + 3, y - 12, 1, 1, '#f2f0e6');
    };
  },

  // Kepang panjang: TOKOH.juntai apa adanya (12 px, sampai pinggang) plus
  // resleting jaket yang cuma masuk akal dari depan.
  kepangJaket(warnaKepang, gelapJaket) {
    return (x, y, hadap) => {
      TOKOH.juntai(x, y, hadap, warnaKepang, 12);
      if (hadap === 'down') r(x, y - 14, 1, 5, gelapJaket);
    };
  },

  /* ------------------------------------------------------------ bantu ---
     Dua penjaga yang dipakai hampir semua event di bawah, dipisah ke sini
     supaya tujuh tick() tidak mengulang lima baris yang persis sama — dan,
     lebih penting, supaya keduanya tidak lambat laun berbeda diam-diam. */

  // Pemeran yang sudah direbut tool call sungguhan dibuang dari potret event.
  // WAJIB dipanggil di awal tick(): perintah tertunda tidak boleh menyeret
  // pegawai yang di panel jelas-jelas sedang mengerjakan tool call.
  saring(E, kunci) {
    for (const k of kunci) if (E.data[k] && E.data[k].eventKerja !== E) E.data[k] = null;
  },

  // Kembalikan pemeran ke pekerjaannya SELAGI masih milik event: goTo dari
  // pegawai yang sudah lepas itu persis pelanggaran yang dijaga uji-tenggat.
  // goTo() sekalian menyetel ulang hadap ke arah hadap stasiunnya, jadi
  // pemeran yang dipulangkan lewat sini tidak perlu hadapSemula().
  pulangkanPemeran(E, a) {
    if (!masihMain(E, a)) return;
    a.bawa = null; a.pose = null; a.doingEvent = '';
    a.goTo(stasiunPulang(a));
  },

  /* Kembalikan arah hadap pegawai yang cuma MENOLEH dan tidak pernah berjalan
     ke mana-mana. Perlu karena dua hal yang sama-sama tidak terlihat:
     lepaskanAktor() TIDAK mereset a.hadap (yang direset cuma bawa/pose/mulut/
     doingEvent/laju/alpha/bekuSampai/betah/busyUntil), dan a.face itu FIELD
     biasa yang cuma ditulis ulang di arrive()/setButuh()/selagi berjalan —
     jadi pegawai yang dipinjam, ditoleh-kan lewat hadapkan(), lalu dilepas di
     tempat akan menatap arah itu SELAMANYA: dia sudah berada di stasiun
     pulangnya, jadi cabang "sudah lama menganggur, pulang ke meja" di
     Agent.update() pun tidak pernah memanggil goTo() untuk membetulkannya.
     Rumusnya dikutip dari cara room.js sendiri menghitung face di arrive(). */
  hadapSemula(a) {
    if (!a) return;
    a.hadap = a.face = (STATIONS[a.station] || {}).face || 'down';
  },
};

daftarEvent(

/* ---------------------------------------------------------------------------
   1. Bintang jersey nomor tujuh.
   Kuning beraksen biru tua, angka 7 di punggung. Angkanya CUMA terbaca waktu
   hadap 'up', dan itu bukan keterbatasan yang ditolerir melainkan yang
   menentukan bentuk adegannya: seluruh koreografi disusun supaya dia
   membelakangi ruangan tepat di beat puncaknya. Penggemar minta selebrasi ->
   dia berbalik (nomor muncul) -> melompat -> mendarat dan menahan pose. Foto
   diambil di detik itu, jadi yang masuk ke kamera memang punggungnya.

   Dua bentrok:
     * wartawan-motret — dua adegan pemotretan pada detik yang sama bikin
       penonton tidak tahu kilat yang mana milik siapa, dan wartawan-motret
       sudah punya koreografi kilatnya sendiri;
     * pemohon-surat-di-loket — tamunya berdiri di (198,302), delapan piksel
       dari titik berdiri di sini. Sosok selebar ±5 px dari titik kaki berarti
       193..203 lawan 201..211: tiga kolom saling tembus, dan dua orang luar
       yang saling tembus di strip loket terbaca sebagai satu bug, bukan dua
       adegan. Ini alasan yang sama persis yang dipakai pemburu-jaket-kuning
       di bawah, cuma jaraknya di sini 8 px alih-alih 0.

   Titik berdiri (206,300): strip depan yang sama yang dipakai
   pemohon-surat-di-loket (198,302) — papan meja kerja baru mulai di y=322 dan
   barisan ruang tunggu ada di y=288, jadi pita y≈300 itu koridor yang memang
   kosong. Penggemar di 244 (38 px) dan petugas di 170 (36 px): cukup supaya
   tiga sosok selebar ±5 px dari titik kakinya tidak saling tindih. */
{
  id: 'bintang-jersey-nomor-tujuh',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 44,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.6, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  bentrokDengan: ['wartawan-motret', 'pemohon-surat-di-loket'],
  syarat: (S) => S.jam >= 8 && S.jam < 15 && !TOKOH.adaTamu(),
  // Tanpa penggemar tidak ada yang meminta selebrasi, dan yang tersisa cuma
  // orang berjersey menyeberang ruangan.
  perluAktor: true,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#f2d24b', pants: '#f2d24b', hair: '#141014', skin: '#c98f63' },
      aksesori: TENAR_GLOBAL.jersey('#1c3f7a', 7),
    }, false);
    TOKOH.antar(E.data.t, 206, 300);
    E.data.jedaPada = 0;
    E.data.fan = pemeran(E, ['pranata_pertama', 'pranata_muda']);
    E.data.petugas = pemeran(E, ['humas', 'kasi']);
    if (E.data.fan) {
      E.data.fan.doingEvent = 'minta foto ke tamu';
      E.data.fan.goToXY(244, 300, 'left');
    }
    if (E.data.petugas) {
      E.data.petugas.doingEvent = 'mengatur izin foto di ruangan';
      E.data.petugas.goToXY(170, 300, 'right');
    }
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 44);
    if (T.x > -12 && T.x < W + 12) TOKOH.gempar(T.x, T.y, dt, 0.55);
    TENAR_GLOBAL.saring(E, ['fan', 'petugas']);
    const fan = E.data.fan, petugas = E.data.petugas;

    if (T.fase === 'masuk' && sampai) {
      T.fase = 'sapa'; T.hadap = 'right';
      E.data.jedaPada = E.umur + 1.9;
      // tengok() menaikkan busyUntil, jadi dipanggil SEKALI di peralihan fase —
      // bukan tiap frame, yang akan membekukan ruangan selama tamunya ada
      TOKOH.tengok(S, T.x, T.y, 1300);
      if (fan) fan.say('itu... yang di TV itu, kan?');
    } else if (T.fase === 'sapa' && E.umur > E.data.jedaPada) {
      T.fase = 'minta'; E.data.jedaPada = E.umur + 3.2;
      if (fan) { fan.bawa = 'hp'; fan.pose = 'hp'; fan.say('selebrasinya sekali, Pak, boleh?'); }
      spawn('talk', T.x, T.y - 30);
    } else if (T.fase === 'minta' && E.umur > E.data.jedaPada) {
      T.fase = 'balik'; E.data.jedaPada = E.umur + 1.1;
      T.hadap = 'up';                                    // di sinilah nomor 7 muncul
    } else if (T.fase === 'balik' && E.umur > E.data.jedaPada) {
      T.fase = 'lompat'; E.data.jedaPada = E.umur + 1.5;
      E.data.lompatPada = E.umur;
      blip(660, 0.06);
      for (let i = 0; i < 4; i++) spawn('ping', T.x + acak(-8, 8), T.y - 32);
    } else if (T.fase === 'lompat' && E.umur > E.data.jedaPada) {
      T.fase = 'pose'; E.data.jedaPada = E.umur + 5.4;
      E.data.kilatPada = E.umur + 1.3;
      // Beat prosedur. Petugas kalau ada; kalau ruangan cuma melepas satu
      // orang, penggemarnya sendiri yang ingat aturannya di tengah kegirangan
      // — versi yang justru lebih lucu, jadi tidak dijaga perluAktor kedua.
      const p = petugas || fan;
      if (p) p.say('boleh difoto, Pak — tapi jangan yang kelihatan layarnya');
      spawn('talk', T.x, T.y - 30);
    } else if (T.fase === 'pose' && E.umur > E.data.jedaPada) {
      TOKOH.pulangkan(T, false);                          // dia di kiri layar: keluar kiri
      TENAR_GLOBAL.pulangkanPemeran(E, fan);
      TENAR_GLOBAL.pulangkanPemeran(E, petugas);
    }

    // Jaring pengaman: perjalanan pulang ±6,5 detik, jadi jam 34 masih
    // menyisakan 3,5 detik sebelum durasi habis. Tanpa ini tamu yang
    // adegannya tersendat lenyap seketika di tengah ruangan.
    if (T.fase !== 'pulang' && E.umur > 34) {
      TOKOH.pulangkan(T, false);
      TENAR_GLOBAL.pulangkanPemeran(E, fan);
      TENAR_GLOBAL.pulangkanPemeran(E, petugas);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T) return;
    // Lompatan: setengah gelombang sinus 0 -> -3 -> 0 sepanjang 0,5 detik.
    // Dipisah dari objek aslinya lewat spread supaya T.y tetap titik kaki yang
    // benar untuk langkah() — kalau y-nya diubah langsung, jalur pulangnya
    // ikut naik 3 px dan dia berjalan melayang.
    let dy = 0;
    const L = E.data.lompatPada;
    if (L != null && E.umur - L < 0.5) dy = -Math.round(3 * Math.sin(((E.umur - L) / 0.5) * Math.PI));
    if (T.x > -14 && T.x < W + 14) TOKOH.gambar({ ...T, y: T.y + dy });
    // Kilat kamera: sama pendeknya dengan milik rombongan-studi-banding
    // (0,18 detik), supaya dua adegan foto di ruangan ini terbaca sekeluarga.
    const k = E.data.kilatPada;
    if (k != null && E.umur > k && E.umur - k < 0.18) {
      const fan = E.data.fan;
      const fx = fan ? Math.round(fan.x) : Math.round(T.x) + 30;
      const fy = fan ? Math.round(fan.y) : Math.round(T.y);
      ctx.globalAlpha = 0.8 * (1 - (E.umur - k) / 0.18);
      r(fx - 5, fy - 30, 10, 10, '#fffdf4');
      ctx.globalAlpha = 1;
    }
  },
  sortY: 300,
  selesai(E) {
    for (const a of [E.data.fan, E.data.petugas]) {
      if (a && a.eventKerja === E) { a.bawa = null; a.pose = null; a.doingEvent = ''; }
    }
  },
},

/* ---------------------------------------------------------------------------
   2. Bintang jersey merah muda nomor sepuluh.
   Merah muda tidak dipakai satu jabatan pun (yang paling dekat, humas, memakai
   maroon #8c3a48), jadi warnanya sendiri sudah cukup jadi tanda pengenal
   sebelum nomornya terbaca.

   Sosoknya digambar TOKOH.anak(), 20 px lawan 26 px pegawai. Itu memang
   satu-satunya cara "lebih pendek dari semua orang di ruangan" bisa
   diungkapkan — drawPerson tingginya konstanta, bukan parameter. Ongkosnya
   jujur: proporsi anak() kepalanya lebih besar terhadap badan, jadi sekilas ia
   bisa terbaca sebagai anak-anak. Yang menahan pembacaan itu jersey bernomor
   dua digit di dada dan punggung — anak tidak memakai nomor punggung — dan
   fakta bahwa DIA yang dimintai tanda tangan, bukan sebaliknya.

   Bekas permanennya RUANGAN.mapDisposisi, satu-satunya field yang benar untuk
   adegan ini: map yang salah sodor itu memang berakhir di tumpukan meja
   stempel menunggu paraf. Dinaikkan pada detik penandatanganan, bukan waktu
   petugasnya tiba di meja stempel — kalau petugas direbut tool call SESUDAH
   itu, mapnya toh sudah tertandatangani dan tumpukan yang bertambah tetap
   kalimat yang benar. Kalau direbut SEBELUM itu, tumpukannya tidak bertambah
   sama sekali (lihat penjaga di beat 'teken'): tidak ada map di tangan siapa
   pun untuk ditandatangani. mapDisposisi dijepit min(5, ...) sesuai batas yang
   ditulis room.js; serapan-anggaran-akhir-tahun dan tahun-anggaran-baru juga
   menulis field ini, dan tiga penulis di satu penghitung berjepit itu aman —
   karena itu tidak ada bentrokDengan di sini. */
{
  id: 'bintang-jersey-merah-muda-sepuluh',
  kelas: 'latar', bobot: B.jarang, cooldown: 2100, durasi: 54,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.5, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 8 && S.jam < 15 && !TOKOH.adaTamu(),
  perluAktor: true,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#f19ec2', pants: '#e07aa6', hair: '#241a12', skin: '#e0ae80' },
      aksesori: TENAR_GLOBAL.jerseyAnak('#f7f2f4', 10),
    }, true);                                            // masuk dari kanan
    TOKOH.antar(E.data.t, 250, 300);
    E.data.jedaPada = 0;
    E.data.a = pemeran(E, ['humas', 'pranata_pertama']);
    if (E.data.a) {
      E.data.a.doingEvent = 'minta tanda tangan tamu';
      E.data.a.goToXY(216, 300, 'right');
    }
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 40);             // langkah anak, sedikit lebih pendek
    if (T.x > -12 && T.x < W + 12) TOKOH.gempar(T.x, T.y, dt, 0.5);
    TENAR_GLOBAL.saring(E, ['a']);
    const a = E.data.a;

    if (T.fase === 'masuk' && sampai) {
      T.fase = 'sapa'; T.hadap = 'left';
      E.data.jedaPada = E.umur + 2;
      TOKOH.tengok(S, T.x, T.y, 1300);
      if (a) a.say('ini... yang merah muda nomor sepuluh itu, bukan?');
    } else if (T.fase === 'sapa' && E.umur > E.data.jedaPada) {
      T.fase = 'sodor'; E.data.jedaPada = E.umur + 3;
      // Map disposisi memang pink di ruangan ini (drawStempel menggambar
      // '#e8a0a8'), dan 'map-pink' ada di daftar bawa. Salah sodornya jadi
      // masuk akal justru karena warnanya sama dengan map tanda tangan biasa.
      if (a) { a.bawa = 'map-pink'; a.pose = 'angkat'; a.say('tanda tangan di sini ya, Pak'); }
    } else if (T.fase === 'sodor' && E.umur > E.data.jedaPada) {
      T.fase = 'teken'; E.data.jedaPada = E.umur + 2.4;
      /* Bekas permanen cuma sah kalau mapnya BENAR-BENAR masih di tangan
         petugas pada detik ini. perluAktor menjamin ada pemeran waktu mulai(),
         tapi tidak menjamin apa pun tiga detik kemudian: kalau tool call
         sungguhan merebutnya di antara 'sodor' dan 'teken', lepaskanAktor()
         sudah mencabut map-pink dari tangannya dan tidak ada apa pun yang bisa
         ditandatangani. Tanpa penjaga ini tumpukan di meja stempel bertambah
         satu untuk penyerahan yang tidak pernah terjadi — bekas permanen dari
         adegan yang batal di tengah jalan, dan RUANGAN tidak pernah direset,
         jadi kebohongan itu menetap sampai halaman dimuat ulang.
         Fase tetap maju walau penjaganya gagal: tamunya toh sudah berdiri di
         situ dan tetap harus berjalan pulang. */
      if (masihMain(E, a) && a.bawa === 'map-pink') {
        for (let i = 0; i < 3; i++) spawn('ink', T.x - 8, T.y - 18);
        blip(520, 0.05);
        RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
      }
    } else if (T.fase === 'teken' && E.umur > E.data.jedaPada) {
      T.fase = 'sadar'; E.data.jedaPada = E.umur + 3.4;
      if (a) {
        a.pose = 'usap';                                 // usap tengkuk
        a.say('...aduh. itu map disposisi yang belum diparaf');
        spawn('talk', a.x, a.y - 28);
      }
    } else if (T.fase === 'sadar' && E.umur > E.data.jedaPada) {
      TOKOH.pulangkan(T, true);                          // dia di kanan tengah: keluar kanan
      // Mapnya tetap dibawa ke meja stempel, bukan dikembalikan: yang sudah
      // ditandatangani orang luar tidak bisa dianggap tidak pernah terjadi.
      if (masihMain(E, a)) {
        a.pose = null;
        a.doingEvent = 'menaruh map yang telanjur diteken';
        a.goTo('edit');
      }
    } else if (T.fase === 'pulang' && a && a.station === 'edit' && a.diam && a.bawa) {
      // Ditaruh, BUKAN distempel: hentakkanStempel() di sini akan membatalkan
      // seluruh leluconnya — yang bikin map itu masalah justru karena ia
      // belum diparaf siapa pun.
      a.bawa = null;
      spawn('paper', a.x, a.y - 20);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }

    if (T.fase !== 'pulang' && E.umur > 42) {
      TOKOH.pulangkan(T, true);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }
    // Jaring terakhir: kalau perjalanannya ke meja stempel tersendat sampai
    // detik 48, mapnya dilepas di tempat — lebih baik daripada dicabut dari
    // tangannya oleh selesai() waktu durasi habis.
    if (E.umur > 48 && masihMain(E, a) && a.bawa) TENAR_GLOBAL.pulangkanPemeran(E, a);
    /* Event ini TIDAK boleh mati begitu tamunya keluar layar: petugasnya masih
       berjalan membawa map yang telanjur diteken, dan matikanEvent() akan
       melenyapkan map itu dari tangannya di tengah ruangan. Ditunggu sampai
       mapnya benar-benar sampai (atau petugasnya direbut tool call). */
    if (!masihMain(E, a) || !a.bawa) TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.x > W + 14) return;
    TOKOH.anak(T);
  },
  sortY: 300,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.bawa = null; a.pose = null; a.doingEvent = ''; }
  },
},

/* ---------------------------------------------------------------------------
   3. Pembalap berwearpack, helm tidak dibuka.
   Beat terbaik di berkas ini, dan seluruhnya bertumpu pada satu kebetulan
   sinematik yang di sini dibuat sengaja: petugas minta helm dibuka untuk
   pencocokan wajah dengan KTP, dia MENURUT — dan tepat pada frame itu dia
   sedang digambar hadap 'up'. Penonton tidak pernah melihat wajahnya. Petugas
   puas. Prosedur terpenuhi, tidak ada yang dilanggar, dan tidak ada yang tahu
   siapa yang barusan diverifikasi.

   Supaya itu bukan kecelakaan, hadap 'up' dan pelepasan helm dipasang di
   PERALIHAN FASE YANG SAMA — satu baris, bukan dua tenggat yang bisa geser.

   Titik berdiri (330,300): strip depan yang sama, di antara papan meja kerja
   slot 308 (x276..340, baru mulai y=322) dan pantry (x414..478). Petugas di
   298, jarak 32 px. */
{
  id: 'pembalap-wearpack-helm-tak-dibuka',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 46,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.4, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  syarat: (S) => S.jam >= 8 && S.jam < 15 && !TOKOH.adaTamu(),
  // Tanpa petugas tidak ada yang minta helmnya dibuka — dan seluruh lelucon
  // ini adalah permintaan itu.
  perluAktor: true,
  mulai(E) {
    E.data.t = TOKOH.buat({
      // wearpack satu potong: main dan pants sewarna, itu yang membedakannya
      // dari seragam mana pun di ruangan ini
      pal: { main: '#ef6f24', pants: '#ef6f24', hair: '#241a12', skin: '#e0ae80' },
      aksesori: TENAR_GLOBAL.pembalap('#ef6f24', '#8f3a0e'),
    }, true);
    TOKOH.antar(E.data.t, 330, 300);
    E.data.jedaPada = 0;
    E.data.a = pemeran(E, ['sandiman', 'humas', 'kasi']);
    if (E.data.a) {
      E.data.a.doingEvent = 'cocokkan wajah tamu dengan KTP';
      E.data.a.goToXY(298, 300, 'right');
    }
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 44);
    if (T.x > -12 && T.x < W + 12) TOKOH.gempar(T.x, T.y, dt, 0.45);
    TENAR_GLOBAL.saring(E, ['a']);
    const a = E.data.a;

    if (T.fase === 'masuk' && sampai) {
      T.fase = 'sapa'; T.hadap = 'left';
      E.data.jedaPada = E.umur + 2.2;
      TOKOH.tengok(S, T.x, T.y, 1200);
      if (a) a.say('wearpack-nya... ini yang balapan itu, ya?');
    } else if (T.fase === 'sapa' && E.umur > E.data.jedaPada) {
      T.fase = 'minta'; E.data.jedaPada = E.umur + 3.6;
      if (a) {
        a.bawa = 'kertas';                               // KTP di tangan
        a.say('helmnya dibuka dulu ya, Pak. cocokkan wajah dengan KTP');
      }
    } else if (T.fase === 'minta' && E.umur > E.data.jedaPada) {
      // SATU peralihan: dia menurut DAN membelakangi penonton di detik yang
      // sama. Dipisah jadi dua tenggat, salah satunya pasti pernah geser satu
      // frame dan wajahnya bocor.
      T.fase = 'buka'; E.data.jedaPada = E.umur + 3.8;
      T.helmDilepas = true; T.hadap = 'up';
      blip(300, 0.06);
      spawn('dust', T.x, T.y - 26);
    } else if (T.fase === 'buka' && E.umur > E.data.jedaPada) {
      T.fase = 'cocok'; E.data.jedaPada = E.umur + 3.2;
      // Anggukan puas dibawa kalimatnya: drawPerson tidak punya sumbu kepala.
      if (a) a.say('oh iya, cocok. silakan, Pak');
      spawn('talk', T.x, T.y - 30);
    } else if (T.fase === 'cocok' && E.umur > E.data.jedaPada) {
      T.helmDilepas = false;                             // helm dipakai lagi
      TOKOH.pulangkan(T, true);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }

    if (T.fase !== 'pulang' && E.umur > 36) {
      T.helmDilepas = false;
      TOKOH.pulangkan(T, true);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.x > W + 14) return;
    TOKOH.gambar(T);
  },
  sortY: 300,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.bawa = null; a.doingEvent = ''; }
  },
},

/* ---------------------------------------------------------------------------
   4. Bos jaket kulit hitam.
   Berdiri di depan rak PC server menawarkan mesin baru; LED rak berdenyut
   serempak lewat MOD.switchBadai — satu-satunya cabang gambar yang membuat rak
   terlihat "hidup" tanpa menyentuh room.js, dan satu-satunya yang mem-bypass
   gerbang `active` sehingga raknya menyala walau tidak ada pegawai bekerja di
   situ. MOD direset tiap frame, jadi ia ditulis ulang lewat cek rentang di
   tick(), bukan disetel sekali di mulai().

   Tiga bentrok, semuanya karena alasan konkret:
     * blink-storm-switch menulis MOD.switchBadai yang sama;
     * rak-server-kepanasan menyetel MOD.rakPanas, yang di drawServer
       DIPERIKSA LEBIH DULU — LED-nya jadi oranye dan denyut serempak tidak
       pernah terlihat, artinya demo yang ini kehilangan satu-satunya efeknya;
     * sales-mesin-fotokopi adalah kembaran premisnya (orang luar menawarkan
       mesin), dan dua penjual mesin dalam satu ruangan bikin kantor ini
       terbaca seperti pameran.
   tahun-anggaran-baru dan serapan-anggaran-akhir-tahun SENGAJA tidak
   didaftarkan walau temanya anggaran: keduanya terkunci kalender (1-14 Januari
   / Oktober-Desember jam 15-19) sementara yang ini jam 9-15 hari apa saja.
   bentrok yang tidak akan pernah berbunyi cuma bikin daftarnya terbaca seolah
   sedang menjaga sesuatu.

   Masuknya lewat LANE_UP, bukan lajur bawah bawaan TOKOH.buat. Dua alasan,
   dan yang kedua yang menentukan: (a) tujuannya memang di lajur atas, jadi
   lewat lajur bawah ia harus turun ke y=252, menyeberang ke penghubung kanan
   (LANE_R=337), lalu naik lagi — 322 px memutar untuk jarak lurus 108 px;
   (b) di y=252 antara x=414 dan x=478 ada perabot pantri yang sortY-nya 270 —
   meja kafe (432..452, y252..255), kakinya, dan dua stul (424..431 / 455..462,
   y256..262). Pejalan biasa lolos karena pita lajur bawah memberi mereka
   y+24=276, tapi event ini ber-sortY 152 dan tamunya akan digambar DI BELAKANG
   meja kafe itu selama ±1,5 detik: badannya terpotong meja, bukan lewat di
   depannya. Lewat LANE_UP x=400..496 tidak ada apa pun — mesin absensi
   (424..433) berhenti di y=113, pintu kadis (440..474) di y=110, dan pantri
   baru mulai y=187.

   Titik berdiri (400,152): 34 px di bawah dasar rak (y=118) dan 12 px di atas
   LANE_UP, jadi ia berdiri DI DEPAN rak dan di belakang lajur lewat. Pegawai
   yang benar-benar bekerja di rak berdiri 11 px di belakangnya, di y=141 pada
   x 370/390/410/430 (slotKe(k,20) dari STATIONS.server.x=390) — dekat sekali,
   dan karena itu syaratnya menolak jalan selama stasiun 'server' terpakai
   sesi sungguhan. */
{
  id: 'bos-jaket-kulit-hitam',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 52,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.3, pulang: 0.2, lembur: 0.3, malam: 0, libur: 0 },
  bentrokDengan: ['blink-storm-switch', 'rak-server-kepanasan', 'sales-mesin-fotokopi'],
  syarat: (S) => S.jam >= 9 && S.jam < 15 && !TOKOH.adaTamu()
    && !S.stasiunAktif.has('server'),
  perluAktor: true,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: {
        main: '#1c1d22', pants: '#23262c', hair: '#d9d9d2', skin: '#eec39a',
        kacamata: true,
      },
      aksesori: TENAR_GLOBAL.jaketKulit('#5a5f68'),
    }, true, LANE_UP);                                   // lihat catatan lajur di atas
    TOKOH.antar(E.data.t, 400, 152);
    E.data.jedaPada = 0;
    E.data.a = pemeran(E, ['analis_sistem', 'pranata_madya', 'kabid']);
    if (E.data.a) {
      E.data.a.doingEvent = 'menemani tamu di rak server';
      E.data.a.goToXY(368, 152, 'right');
    }
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 44);
    if (T.x > -12 && T.x < W + 12) TOKOH.gempar(T.x, T.y, dt, 0.4);
    TENAR_GLOBAL.saring(E, ['a']);
    const a = E.data.a;

    /* Denyut LED cuma selama fase 'demo' — dikunci ke FASE-nya, bukan ke
       tenggat angka sendiri. Versi bertenggat (demoDari + 12 detik sementara
       fasenya cuma 8) bikin raknya masih berdenyut empat detik sesudah
       kalimat "anggarannya belum cair", yaitu tepat di beat yang seharusnya
       mengempis. Dua sumber kebenaran untuk satu adegan selalu berakhir
       begitu. Ditulis ulang tiap frame karena MOD kosong lagi di awal
       tiap frame. */
    if (T.fase === 'demo') {
      MOD.switchBadai = 1;
      if (Math.random() < 3 * dt) spawn('data', 390 + acak(-14, 14), 120);
    }

    if (T.fase === 'masuk' && sampai) {
      T.fase = 'sapa'; T.hadap = 'left';
      E.data.jedaPada = E.umur + 2.2;
      TOKOH.tengok(S, T.x, T.y, 1200);
      if (a) a.say('itu... yang suka pidato pakai jaket kulit itu, kan?');
    } else if (T.fase === 'sapa' && E.umur > E.data.jedaPada) {
      T.fase = 'demo'; E.data.jedaPada = E.umur + 8;
      T.hadap = 'up';                                    // menghadap rak, menunjuk mesinnya
      if (a) { hadapkan(a, 390, 130); a.pose = 'nunjuk'; }
      blip(760, 0.06);
    } else if (T.fase === 'demo' && E.umur > E.data.jedaPada) {
      T.fase = 'kempis'; E.data.jedaPada = E.umur + 4.2;
      T.hadap = 'left';
      if (a) {
        a.pose = null;
        a.say('anggarannya belum cair, Pak. nanti kami usulkan di RKA');
        spawn('talk', a.x, a.y - 28);
      }
    } else if (T.fase === 'kempis' && E.umur > E.data.jedaPada) {
      TOKOH.pulangkan(T, true);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }

    if (T.fase !== 'pulang' && E.umur > 40) {
      TOKOH.pulangkan(T, true);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.x > W + 14) return;
    TOKOH.gambar(T);
  },
  // 152: garis kaki adegan utamanya di depan rak (dasar rak 118), bukan garis
  // transitnya di LANE_DOWN. Satu event cuma punya satu sortY.
  sortY: 152,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) { a.pose = null; a.doingEvent = ''; }
  },
},

/* ---------------------------------------------------------------------------
   5. Pahlawan setelan merah-biru, masuk lewat jendela.
   Easter egg: B.langka, cooldown 5400. Satu-satunya tamu di seluruh katalog
   yang tidak masuk lewat tepi layar.

   Kolom turunnya x=236, bukan x=212 (sumbu jendela) — meja printer menempati
   x198..228 pada y96..118 dan seutas benang yang menembus printer bukan
   adegan, itu bug yang kelihatan. x=236 masih di dalam kaca (JENDELA
   x186..238) dan bidang dinding di bawahnya memang kosong: room.js sendiri
   menyebutnya "bidang dinding kosong antara jendela dan meja stempel" waktu
   menaruh cat mengelupas di situ. Mendarat di y=164 = LANE_UP, lajur yang
   menurut definisinya bebas perabot; kursi jauh baru mulai y=169.

   Bentrok dengan jendela-dilap dan jendela-macet-didorong-berdua: dua-duanya
   menaruh pegawai berdiri menempel di kaca, dan orang yang sedang mengelap
   jendela sementara ada yang turun dari jendela itu terbaca sebagai dua
   adegan yang saling tidak sadar.

   Beat penutupnya sengaja TIDAK diperpanjang jadi "keluar lalu masuk lagi
   lewat pintu" — lihat catatan (2) di kepala berkas. */
{
  id: 'pahlawan-setelan-merah-biru',
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 44,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.5, pulang: 0.3, lembur: 0.5, malam: 0, libur: 0 },
  bentrokDengan: ['jendela-dilap', 'jendela-macet-didorong-berdua'],
  syarat: (S) => S.jam >= 8 && S.jam < 16 && !TOKOH.adaTamu(),
  perluAktor: true,
  mulai(E) {
    const t = TOKOH.buat({
      pal: {
        main: '#d1332f', pants: '#2f56a8', hair: '#d1332f', skin: '#d1332f',
        pattern: '#8f1f1c',                              // jaring: 8 bintik di badan
      },
      aksesori: TENAR_GLOBAL.topengJaring('#d1332f'),
    }, false, LANE_UP);
    // Dibangun lewat TOKOH.buat supaya paletnya lewat TOKOH.pal (drawPerson
    // membaca sembilan field tanpa satu pun penjaga undefined), lalu titik
    // masuknya ditimpa: dia tidak datang dari tepi layar.
    t.x = 236; t.y = 62; t.hadap = 'down'; t.fase = 'turun'; t.wp = [];
    E.data.t = t;
    E.data.jedaPada = 0;
    E.data.a = pemeran(E, ['humas', 'kasi', 'sandiman']);
    if (E.data.a) {
      E.data.a.doingEvent = 'mengarahkan tamu ke pintu depan';
      E.data.a.goToXY(268, 164, 'left');
    }
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (T.fase === 'turun') {
      T.y = Math.min(LANE_UP, T.y + 30 * dt);            // ±3,4 detik dari kusen ke lantai
      if (T.y >= LANE_UP) {
        T.fase = 'mendarat'; T.hadap = 'down';
        E.data.jedaPada = E.umur + 2;
        for (let i = 0; i < 4; i++) spawn('dust', 236 + acak(-6, 6), 164);
        blip(220, 0.08);
        TOKOH.tengok(S, T.x, T.y, 1500);
      }
    } else {
      TOKOH.langkah(T, dt, 44);
    }
    // Kegemparan baru mulai sesudah dia menyentuh lantai: partikel yang
    // menghambur di y≈32 selagi dia masih meluncur turun jatuh di dinding
    // atas, jauh dari kepala siapa pun yang bereaksi.
    if (T.fase !== 'turun' && T.x > -12 && T.x < W + 12) TOKOH.gempar(T.x, T.y, dt, 0.7);
    TENAR_GLOBAL.saring(E, ['a']);
    const a = E.data.a;

    if (T.fase === 'mendarat' && E.umur > E.data.jedaPada) {
      T.fase = 'ditegur'; E.data.jedaPada = E.umur + 4.4;
      if (a) a.say('lewat jendela?!');
      spawn('talk', T.x, T.y - 30);
    } else if (T.fase === 'ditegur' && E.umur > E.data.jedaPada) {
      T.fase = 'diarahkan'; E.data.jedaPada = E.umur + 3.4;
      if (a) a.say('maaf, Mas — masuknya lewat pintu depan, sama seperti tamu lain');
    } else if (T.fase === 'diarahkan' && E.umur > E.data.jedaPada) {
      // Dia menurut. Itu seluruh leluconnya, dan karena itu tidak ada satu pun
      // partikel atau bunyi di beat ini: yang lucu justru kepatuhannya yang
      // tanpa protes.
      TOKOH.pulangkan(T, false);
      if (masihMain(E, a)) a.say('nah, gitu');
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }

    if (T.fase !== 'pulang' && E.umur > 34) {
      TOKOH.pulangkan(T, false);
      TENAR_GLOBAL.pulangkanPemeran(E, a);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.x > W + 14) return;
    // Benang: dari ambang bawah kaca (JENDELA.y + JENDELA.h = 68) sampai ke
    // ubun-ubun. Hilang begitu dia melepasnya di lantai — benang yang masih
    // menggantung sesudah dia berjalan pergi itu tali jemuran, bukan jejak.
    if (T.fase === 'turun') {
      const kepala = Math.round(T.y) - 26;
      if (kepala > 68) r(236, 68, 1, kepala - 68, '#e8e4d4');
    }
    TOKOH.gambar(T);
  },
  // 164: garis kaki tempat dia mendarat dan berdiri sepanjang adegan. Selama
  // meluncur turun ia digambar di kedalaman itu juga — benar, karena kolom
  // turunnya memang di depan dinding dan di belakang lajur bawah.
  sortY: 164,
  selesai(E) {
    const a = E.data.a;
    if (a && a.eventKerja === E) a.doingEvent = '';
  },
},

/* ---------------------------------------------------------------------------
   6. Peserta training hijau toska, angka tiga digit di dada.
   TANPA SATU KATA PUN dari dia: tidak ada say(), dan tidak ada satu partikel
   'talk' pun yang keluar dari kepalanya — partikel talk adalah cara orang luar
   "berbicara" di ruangan ini (lihat pemohon-surat-di-loket), jadi memakainya
   di sini akan melanggar aturan yang justru jadi isi adegannya. TOKOH.gempar()
   pun tidak dipanggil sama sekali — satu-satunya event di berkas ini yang
   begitu — karena gempar menghambur 'talk' dan 'hati' tepat di atas kepalanya.
   Yang boleh berbunyi cuma satu pegawai, di akhir, dan itu pun karena dia
   tidak mengerti apa yang barusan dilihatnya.

   Dia masuk, menatap papan nomor antrean (drawNomorAntre di x210..226, y30..40
   — dinding di atas ruang tunggu), membaca kertas di tangannya, diam, lalu
   MUNDUR: berjalan ke kiri sepanjang lajur sambil hadapnya dipaksa tetap 'up'.
   TOKOH.langkah() menyetel hadap dari arah gerak, jadi paksaannya ditulis
   SESUDAH langkah() tiap frame. Efeknya: punggung ke penonton, wajah tetap ke
   papan, badan menjauh — itu bacaan "mundur pelan" yang benar tanpa satu
   sprite baru.

   Berdiri di (224,164): 12 px di kanan titik berdiri stasiun 'web' (212,138)
   supaya tidak berimpit dengan pegawai yang benar-benar mencetak, tepat di
   bawah papan nomor, dan 5 px di atas kursi jauh yang baru mulai y=169.

   TANPA perluAktor, sengaja. Kalau seluruh ruangan sedang bekerja, adegan ini
   tetap utuh — orang diam yang datang, membaca, dan pergi tanpa ada yang
   menyapanya justru versi yang lebih sepi dan lebih tepat. Balon pegawai yang
   kebingungan itu bonus, bukan tulang punggung. */
{
  id: 'peserta-training-hijau-empat-lima-enam',
  kelas: 'latar', bobot: B.langka, cooldown: 4800, durasi: 40,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.6, pulang: 0.4, lembur: 0.4, malam: 0, libur: 0 },
  bentrokDengan: ['nomor-antrean-loket'],
  syarat: (S) => S.jam >= 8 && S.jam < 16 && !TOKOH.adaTamu(),
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#2fa37a', pants: '#2fa37a', hair: '#1d1712', skin: '#e0ae80' },
      aksesori: TENAR_GLOBAL.dadaTigaAngka('#20242c'),
      bawa: 'kertas',                                    // secarik nomor di tangan
    }, false);
    TOKOH.antar(E.data.t, 224, LANE_UP);
    E.data.jedaPada = 0;
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, T.fase === 'mundur' ? 20 : 44);
    // Mundur: arah gerak ke kiri, wajah tetap ke papan. Ditulis SESUDAH
    // langkah() karena langkah() sendiri yang barusan menyetel hadap.
    if (T.fase === 'mundur') T.hadap = 'up';
    // Tidak ada TOKOH.gempar() di seluruh tick ini: lihat catatan di kepala
    // event. Ruangan yang diam itu yang bikin satu balon kebingungan terdengar.
    TENAR_GLOBAL.saring(E, ['a']);

    if (T.fase === 'masuk' && sampai) {
      T.fase = 'baca'; T.hadap = 'up';                   // menatap papan nomor
      E.data.jedaPada = E.umur + 3;
    } else if (T.fase === 'baca' && E.umur > E.data.jedaPada) {
      T.fase = 'cocokkan'; T.hadap = 'down';             // melihat kertasnya sendiri
      E.data.jedaPada = E.umur + 2.2;
    } else if (T.fase === 'cocokkan' && E.umur > E.data.jedaPada) {
      T.fase = 'diam'; T.hadap = 'up';
      E.data.jedaPada = E.umur + 2.6;
    } else if (T.fase === 'diam' && E.umur > E.data.jedaPada) {
      T.fase = 'mundur';
      T.wp = [[160, LANE_UP]];                           // 64 px mundur, ±3,2 detik
      // Satu pegawai menoleh — dan tidak mengerti. Dipinjam di sini, bukan di
      // mulai(): sebelum beat ini tidak ada apa pun untuk ditolehi.
      const a = pemeranDekat(E, T.x, T.y, 140) || pemeran(E);
      E.data.a = a;
      if (a) {
        a.doingEvent = 'menoleh ke tamu yang mundur';
        hadapkan(a, T.x, T.y);
        a.say('lho — Pak? Pak?');
      }
    } else if (T.fase === 'mundur' && sampai) {
      TOKOH.pulangkan(T, false);
      const a = E.data.a;
      if (masihMain(E, a)) { a.say('...tadi mau apa, ya'); a.doingEvent = ''; TENAR_GLOBAL.hadapSemula(a); }
    }

    if (T.fase !== 'pulang' && E.umur > 30) TOKOH.pulangkan(T, false);
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.x > W + 14) return;
    TOKOH.gambar(T);
  },
  // 164: garis kaki di lajur atas tempat seluruh adegan terjadi; cuma jalan
  // masuk dan jalan keluarnya yang lewat lajur bawah.
  sortY: 164,
  selesai(E) {
    const a = E.data.a;
    // Pemeran di sini satu-satunya di berkas ini yang TIDAK pernah di-goTo()
    // ke mana pun — dia cuma menoleh dari tempatnya. Jadi arah hadapnya harus
    // dikembalikan tangan; lihat TENAR_GLOBAL.hadapSemula.
    if (a && a.eventKerja === E) { a.doingEvent = ''; TENAR_GLOBAL.hadapSemula(a); }
  },
},

/* ---------------------------------------------------------------------------
   7. Pemburu berjaket kuning, kepang ungu.
   Dua balon yang bertabrakan: yang muda dan yang senior bicara di FRAME YANG
   SAMA, bukan bergantian. Itu satu-satunya cara "kesenjangan generasi" terbaca
   di ruangan yang tiap balonnya berumur beberapa detik — kalau dijeda, yang
   terbaca cuma dua orang berkomentar, bukan dua dunia yang tidak nyambung.

   Prosedurnya: permohonan izin yang jenis layanannya tidak ada di daftar.
   Nomor antreannya tetap diambil (RUANGAN.antre maju satu, papan di dinding
   benar-benar berubah) — itu bekas permanen yang gratis dan sekaligus intinya:
   sistem sudah memberinya nomor sebelum sistem tahu dia mau apa.

   Titik berdiri (198,302) memang persis titik pemohon-surat-di-loket, dan
   itulah alasan keduanya dibentrokkan: dua orang asing berdiri di piksel yang
   sama akan saling tembus, dan dua adegan loket sekaligus bikin kantor ini
   terbaca seperti ada dua loket. Yang muda di 230 dan yang senior di 166 —
   jarak 32 dan 32, cukup untuk tiga sosok selebar ±10 px. */
{
  id: 'pemburu-jaket-kuning-kepang-ungu',
  kelas: 'latar', bobot: B.jarang, cooldown: 2100, durasi: 48,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.5, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  bentrokDengan: ['pemohon-surat-di-loket'],
  syarat: (S) => S.jam >= 8 && S.jam < 15 && !TOKOH.adaTamu(),
  perluAktor: true,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#e8c22a', pants: '#3a3f45', hair: '#7b3fa0', skin: '#e0ae80' },
      aksesori: TENAR_GLOBAL.kepangJaket('#7b3fa0', '#a8871a'),
      bawa: 'map-kuning',                                // berkas permohonan izin
    }, false);
    TOKOH.antar(E.data.t, 198, 302);
    E.data.jedaPada = 0;
    E.data.muda = pemeran(E, ['pranata_pertama', 'pranata_muda']);
    E.data.senior = pemeran(E, ['pranata_madya', 'kabid', 'sekdis', 'kasi']);
    if (E.data.muda) {
      E.data.muda.doingEvent = 'heboh lihat tamu';
      E.data.muda.goToXY(230, 300, 'left');
    }
    if (E.data.senior) {
      E.data.senior.doingEvent = 'melayani permohonan izin';
      E.data.senior.goToXY(166, 300, 'right');
    }
  },
  tick(E, dt, S) {
    const T = E.data.t;
    const sampai = TOKOH.langkah(T, dt, 44);
    if (T.x > -12 && T.x < W + 12) TOKOH.gempar(T.x, T.y, dt, 0.6);
    TENAR_GLOBAL.saring(E, ['muda', 'senior']);
    const muda = E.data.muda, senior = E.data.senior;

    if (T.fase === 'masuk' && sampai) {
      T.fase = 'tabrakan'; T.hadap = 'down';
      E.data.jedaPada = E.umur + 3.6;
      TOKOH.tengok(S, T.x, T.y, 1300);
      // Dua balon di frame yang sama — ini seluruh leluconnya.
      if (muda) muda.say('ITU DIA! yang di video itu!');
      if (senior) senior.say('siapa? bapak siapa?');
      // Nomor antrean diambil di sini, sesudah perluAktor lolos di mulai():
      // event yang batal tidak boleh meninggalkan nomor yang tidak pernah
      // dipanggil di papan.
      TOKOH.ambilNomor();
      blip(880, 0.05);
    } else if (T.fase === 'tabrakan' && E.umur > E.data.jedaPada) {
      T.fase = 'serah'; E.data.jedaPada = E.umur + 4.2;
      // Menghadap penonton cuma selama beat pengenalan (dua balon bertabrakan
      // di atas kepalanya); begitu berkasnya diserahkan dia berbalik ke
      // petugas — dan dari samping kepang ungunya digambar di sisi punggung,
      // yang justru bikin siluetnya lebih terbaca.
      T.hadap = 'left';
      T.bawa = null;
      if (senior) { senior.bawa = 'map-kuning'; senior.pose = 'angkat'; }
      spawn('paper', T.x, T.y - 26);
    } else if (T.fase === 'serah' && E.umur > E.data.jedaPada) {
      T.fase = 'cari'; E.data.jedaPada = E.umur + 4.6;
      if (senior) {
        senior.pose = 'nunjuk';                          // menyusuri daftar layanan
        senior.say('jenis layanan ini... tidak ada di daftar kami, Mas');
      }
      if (muda) muda.say('itu memang belum ada, Bu');
      spawn('talk', T.x, T.y - 30);
    } else if (T.fase === 'cari' && E.umur > E.data.jedaPada) {
      // Berkasnya dikembalikan, bukan ditinggal: yang tidak ada di daftar
      // tidak boleh menumpuk di meja stempel sebagai map yang tidak jelas
      // mau diapakan.
      T.bawa = 'map-kuning';
      TOKOH.pulangkan(T, false);
      TENAR_GLOBAL.pulangkanPemeran(E, muda);
      TENAR_GLOBAL.pulangkanPemeran(E, senior);
    }

    if (T.fase !== 'pulang' && E.umur > 38) {
      T.bawa = 'map-kuning';
      TOKOH.pulangkan(T, false);
      TENAR_GLOBAL.pulangkanPemeran(E, muda);
      TENAR_GLOBAL.pulangkanPemeran(E, senior);
    }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -14 || T.x > W + 14) return;
    TOKOH.gambar(T);
  },
  sortY: 302,
  selesai(E) {
    for (const a of [E.data.muda, E.data.senior]) {
      if (a && a.eventKerja === E) { a.bawa = null; a.pose = null; a.doingEvent = ''; }
    }
  },
},

);
