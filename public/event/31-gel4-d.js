/* ==========================================================================
   GELOMBANG 4 — AIR DI LUAR JENDELA & SALAMAN LEBARAN
   ==========================================================================
   Dua event yang sama-sama dulu divonis "mahal", dan dua-duanya vonisnya
   sudah basi. Yang dikerjakan di sini cuma bagian yang benar-benar belum ada
   di 302 event terpasang; bagian yang kembar dengan event lain DIBUANG, dan
   alasannya ditulis supaya penulis berikutnya tidak menambahkannya lagi.

   1. banjir-di-luar-jendela. Keberatan lamanya: "bukaRapat(ev) terikat event
      sesi nyata, jadi rapat darurat harus menyuntik entri palsu". Betul —
      dan itulah kenapa BAGIAN RAPATNYA DIBUANG SELURUHNYA di sini, bukan
      dipaksakan lewat pintu belakang. Alasan kedua yang lebih penting: rapat
      darurat empat pegawai itu KEMBAR dengan rapat-evaluasi-dadakan dan
      rapat-pimpinan-dadakan (13-...js), yang keduanya cuma memanggil
      a.goTo('rapat') dan sudah mengerjakan adegan itu lebih baik. Yang
      tersisa — air di dalam kaca, satu penonton di jendela, dua orang
      menunggu keputusan pulang cepat di depan pintu kadis — nol mesin baru:
      klipJendela() sudah ada dan pelangi-selepas-hujan sudah jadi preseden
      menggambar di dalam kaca lewat gambarAtas.

      Pemicu asli "sesudah dua hujan-deras-jendela" MUSTAHIL: event itu tidak
      pernah dibuat (hujan di sini data sungguhan dari /cuaca, bukan event).
      Gantinya CUACA.hujan langsung.

   2. halal-bihalal-lebaran. Ramadan sudah tergarap penuh (tema 'ramadan',
      gambarPapanRamadan(), buka-puasa-bersama, ramadan-siang-sunyi) tapi
      bulan sesudahnya kosong — grep 'halal|bihalal|lebaran|Idul|ketupat|
      syawal' atas seluruh repo nol hasil. taksirHijri() sudah dipakai
      buka-puasa dengan h.bulan===9; Syawal tinggal h.bulan===10.

      Tiga hal dari usulan aslinya TIDAK dibuat, sengaja:
        * "pose salaman = cabang baru workArms" — tidak perlu. Pose 'salam'
          sudah ada DAN sudah beranimasi jabat tangan (room.js case 'salam':
          { l: 0, r: sin(t*6) > 0 ? -5 : -3 }).
        * teks spanduk bergulir — menyentuh drawWall di room.js, berkas
          bersama; dan tema kalender sudah punya slot spanduknya sendiri.
        * titik (300,214)/(286,226) dari usulan — itu DI DALAM trapesium meja
          rapat (RAPAT xFL=170 xFR=322 yF=226). Barisannya digeser ke y=240:
          di atas karpet (drawFloor x152..340 y176..252), di bawah meja.

      Yang memang baru dan jadi alasan event ini lolos: barisannya TUMBUH.
      hari-korpri juga berbaris di karpet, tapi barisannya statis — enam orang
      goToXY sekali lalu pose 'hormat'. Di sini titik tujuan orang berikutnya
      bergeser 16 px tiap satu salaman selesai, dan itu koreografi yang belum
      ada di 302 event mana pun.

   Catatan lintas-event yang berlaku untuk dua-duanya: TIDAK ada satu pun
   pada() di halal-bihalal — seluruh fasenya angka yang disimpan di E.data
   lalu dibandingkan manual, jadi aturan tenggat-bergerak dan pada()-bersarang
   tidak bisa dilanggar di sana. Di banjir pada() dipakai, tapi cuma dengan
   detik TETAP, dan MOD.pintuKadis-nya ditulis lewat cek rentang per-frame
   karena MOD direset tiap frame.

   Satu doktrin lagi berlaku untuk dua-duanya, dan ini yang paling gampang
   dilanggar lagi kalau tidak ditulis: `durasi` DI SINI CUMA PAGAR TERAKHIR,
   bukan penentu kapan adegan berakhir. Dua-duanya berakhir sendiri lewat
   E.selesaiCepat begitu langkah terakhirnya benar-benar habis (E.data.tutupPada
   yang diperbarui tiap frame selama masih ada yang melangkah). Alasannya
   diukur, bukan selera: mata rantai terakhir kedua event ini menyuruh orang
   MENYEBERANG RUANGAN, dan panjang trayek itu berayun 136..421 px tergantung
   slot yang kebagian, lalu dikali laju efektif yang bisa turun sampai 0,595
   (MOD.lajuGlobal 0,7 × LAJU_LELAH 0,85). Konstanta apa pun yang dipilih tanpa
   memasukkan itu — 70, 52, 55, "E.umur + 8" — akan memotong adegannya sendiri
   di sebagian kombinasi. Kalau ada yang mau menggeser angka di berkas ini,
   yang harus dihitung ulang trayeknya, bukan durasinya.
   ========================================================================== */

daftarEvent(

/* ------------------------------------------------------ air di luar kaca ---
   Satu-satunya penulis MOD.pintuKadis yang lahir sesudah daftar bentrok
   kadis-sekdis-rapat-tertutup (24-...js) disusun. Daftar itu hasil menyisir
   seluruh public/event/ waktu itu, jadi ia TIDAK memuat event ini dan tidak
   boleh saya sunting (berkas orang lain). Karena bentrok() sekarang dua arah,
   cukup event itu disebut DI SINI — perlindungannya jadi utuh lagi. */
{
  id: 'banjir-di-luar-jendela',
  /* durasi 46 = PAGAR TERAKHIR, bukan penentu adegan. Dua versi sebelumnya
     (70, lalu 52) sama-sama salah cara menghitungnya: angkanya dipilih supaya
     KETUKAN terakhir masih muat, padahal yang harus muat itu AKSI ketukan itu
     — pada(E, 46) menyuruh dua orang menyeberang ruangan ke ruang tunggu, dan
     panjang trayek itu tidak pernah ikut dihitung.

     Yang benar-benar disapu (scratchpad/sim-lama.mjs: route(), slotBebas(),
     slotKe() ASLI dan blok gerak update() ASLI, dt 1/60; kedua penunggu di
     titik baku 452,152 dan 436,152; SELURUH keterisian ruang tunggu 0..10
     slot terpakai — bukan cuma slot pertama — dikali DELAPAN laju efektif
     yang mungkin: MOD.lajuGlobal 1 / 0,85 / 0,8 / 0,7 masing-masing sendiri
     dan dikali LAJU_LELAH 0,85 -> 0,85 / 0,7225 / 0,68 / 0,595):
       trayek terpanjang 421 px, yaitu ke slot slotKe(10,23) = x 167 — bukan
       306 px seperti kalau cuma slot pertama yang dihitung;
       waktu tempuhnya 8,05 dtk di laju penuh sampai 13,47 dtk di 0,595.
     Jatah versi lama cuma 52 - 46 = 6,00 detik, jadi 86 dari 88 kombinasi
     melepas aktor SELAGI trayeknya belum habis, sisa terpanjang 233,2 px.
     Ini bukan cuma cerita laju lambat: di laju PENUH pun 9 dari 11 tingkat
     keterisian gagal. Menaikkan durasi lagi cuma menggeser ambang yang sama.

     Yang dipasang sekarang karena itu bukan konstanta yang lebih besar:
       * ketukan bubar maju ke t=28, pas waktu air di kaca habis (surut 20..28
         di gambarAtas), jadi ekor air diam yang dulu dikeluhkan hilang tanpa
         mendorong adegannya ke ujung durasi;
       * event mati lewat E.selesaiCepat begitu LANGKAH TERAKHIR benar-benar
         habis — E.data.tutupPada di tick, diperbarui tiap frame selama masih
         ada yang berjalan, jadi tenggatnya mengikuti trayek, bukan menebaknya;
       * 46 tinggal jadi pagar: jatahnya 46 - 28 = 18,00 detik terhadap tempuh
         terburuk 13,47 detik, margin 4,53 detik.
     Sapuan ujung-ke-ujung dengan berkas ini apa adanya (sim-banjir2.mjs, 792
     kombinasi = 9 posisi awal pemeran x 11 keterisian x 8 laju efektif):
     0 aktor dilepas selagi berjalan, dan SEMUA kombinasi mati lewat
     selesaiCepat di umur 35,05..42,68 detik — pagarnya tidak pernah kepakai.

     Ongkos yang dulu jadi alasan memangkas 70 ikut terjaga: bentrok() dua
     arah, jadi event 'latar' ini MENGUNCI kadis-sekdis-rapat-tertutup (kelas
     'panggung') dan menahan tiga pegawai betah=true selama ia hidup —
     sekarang 35-43 detik terukur, bukan 52 detik penuh. */
  kelas: 'latar', bobot: B.langka, cooldown: 2700, durasi: 46,
  perluAktor: true,
  babak: { libur: 0 },
  bentrokDengan: [
    'hujan-pertama-bau-tanah', 'kabut-embun-jendela', 'pelangi-selepas-hujan',
    'monas-lampu-malam-dipandangi',
    // penulis MOD.pintuKadis: adegan pintu tertutupnya batal kalau pintunya
    // dipaksa menganga dari sini
    'kadis-sekdis-rapat-tertutup',
  ],
  /* CUACA.hujanTinggiSejak dicatat tiap frame di tickRuangan (room.js) waktu
     CUACA.hujan > 0.6 — terverifikasi. Yang perlu jujur: itu stempel
     "TERAKHIR KALI deras", BUKAN "sejak kapan mulai deras". Karena itu ia
     dipakai sebagai OR, bukan AND seperti rencana awal: sebagai AND
     (hujan > 0.7 && now - hujanTinggiSejak < 90dtk) klausa keduanya tidak
     pernah mengubah apa pun, sebab frame yang sama baru saja mencatat
     stempelnya — klausa hiasan yang cuma bikin cabang tak teruji.

     Sebagai OR ia mengerjakan sesuatu yang nyata: angka /cuaca naik-turun
     melewati ambang, dan event langka bercooldown 45 menit tidak boleh
     kehilangan seluruh jendelanya gara-gara satu pembacaan yang turun
     sedetik. Lantai bawahnya 0.35 supaya toleransi ini tidak pernah bisa
     menyalakan banjir di cuaca yang sudah benar-benar kering. */
  syarat: (S) => {
    const deras = S.hujan > 0.7
      || (S.hujan > 0.35 && Date.now() - CUACA.hujanTinggiSejak < 30000);
    return deras && S.jam >= 13 && S.jam < 19;
  },
  mulai(E) {
    const o = pinjamAktor(E, 3);
    E.data.orang = o;
    if (o[0]) { o[0].doingEvent = 'melihat air di luar'; o[0].goTo('web'); }
    // 452,152 titik baku depan pintu kadis (dipakai 06-/13-...js), 436,152
    // pasangannya di 04-...js. Dua-duanya di lajur atas, tidak menembus apa pun.
    if (o[1]) { o[1].doingEvent = 'menunggu keputusan pulang cepat'; o[1].goToXY(452, 152, 'up'); }
    if (o[2]) { o[2].doingEvent = 'menunggu keputusan pulang cepat'; o[2].goToXY(436, 152, 'up'); }
  },
  tick(E, dt, S) {
    const o = E.data.orang || [];

    pada(E, 6, () => {
      const a = o[0];
      if (!masihMain(E, a)) return;       // sudah direbut tool call: jangan disuruh apa-apa
      hadapkan(a, 212, 40);
      a.say('depan kantor sudah selutut');
    });

    // penonton lain: cuma menoleh 1,5 detik, tidak dipinjam
    pada(E, 14, () => menoleh(S.orang.filter((x) => !x.eventKerja), 212, 40, 1500));

    pada(E, 20, () => {
      const a = o[1];
      if (!masihMain(E, a)) return;
      a.say('pulang cepat masih diurus');
      spawn('talk', a.x, a.y - 24);
    });

    /* MOD direset SETIAP frame, jadi "pintu kadis terbuka tiga detik" tidak
       bisa ditulis sekali di dalam pada() — harus ditulis ulang tiap frame
       lewat cek rentang, kalau tidak pintunya berkedip satu frame saja. */
    if (E.umur > 24 && E.umur < 27) MOD.pintuKadis = true;

    if (E.umur > 24.5 && E.umur < 26 && Math.random() < 2 * dt) {
      const a = o[2];
      if (masihMain(E, a)) spawn('talk', a.x, a.y - 24);
    }

    /* Ketukan terakhir, dipasangkan dengan air yang habis di detik 28 (surut
       20..28 di gambarAtas): yang menunggu keputusan bubar ke ruang tunggu.
       matikanEvent → lepaskanAktor sudah mengembalikan state 'idle' untuk
       sisanya, jadi tidak ada stasiun yang perlu disimpan/dipulihkan. */
    pada(E, 28, () => {
      for (const a of yangMasihMain(E, [o[1], o[2]])) a.goTo('idle');
      E.data.bubarSejak = E.umur;
    });

    /* Penutup event dihitung dari TRAYEK, bukan dari angka durasi. Selama
       masih ada yang melangkah, tutupPada digeser maju tiap frame; begitu
       langkah terakhir habis — atau orangnya direbut tool call, yang bikin
       yangMasihMain() menjatuhkannya dari daftar — angkanya membeku dan event
       mati 1,2 detik kemudian. Ini BUKAN pada(E, E.umur + n): tenggatnya
       disimpan di E.data lalu dibandingkan manual, persis pola yang diminta
       aturan tenggat-bergerak. durasi cuma pagar kalau semuanya melar. */
    if (E.data.bubarSejak != null) {
      const jalan = yangMasihMain(E, [o[1], o[2]]).some((a) => !a.diam);
      if (jalan || E.data.tutupPada == null) E.data.tutupPada = E.umur + 1.2;
      else if (E.umur > E.data.tutupPada) E.selesaiCepat = true;
    }
  },
  /* gambarAtas, meniru pelangi-selepas-hujan — bukan gambarProp. Tidak butuh
     sortY: kaca (y 26..68) tidak pernah beririsan dengan kepala siapa pun
     (pejalan LANE_UP y=164, kepalanya masih di sekitar y130). Konsekuensinya
     air ini digambar SESUDAH kusen aluminium drawWindow, jadi kusen tengah
     vertikalnya harus digambar ulang di akhir. Turun ke gambarDinding BUKAN
     jalan keluar: drawWindow (prop sortY 116) mengisi seluruh kaca dengan
     gradien langit yang opak, jadi apa pun di gambarDinding terkubur.

     Konsekuensi kedua, yang lebih halus dan sempat terlewat: di ujung frame()
     urutan gambarnya drawParts() → drawAmbien() → drawDebu() →
     gambarLapis('gambarAtas'), jadi hook ini jatuh SESUDAH selubung suasana
     yang menyapu SELURUH kanvas (drawAmbien: fillRect(0,0,W,H) beralpha
     A.ambA — cari `if (A.ambA > 0.005)` di sana). Menggambar air pada
     alpha 1 penuh membuatnya satu-satunya benda di frame yang kebal tint
     ruangan — dan itu paling kentara justru di jendela syaratnya sendiri:
     hujan menaikkan A.ambA sebesar 0,08×hujan sekaligus meredupkan dunia luar
     (A.luar ×= 1−0,55×hujan), jadi siluet kota di balik kaca menggelap dan
     airnya tidak. Terverifikasi lewat hitungAmbien(): jam 18:30 hujan 0,9 →
     ambA 0,275, air #5f7f96 seharusnya terbaca rgb(92,109,127); jam 15 hujan
     0,9 → ambA 0,074. Karena itu tiap BENDA padat di sini dilewatkan teduh().
     Yang sengaja TIDAK diteduhkan cuma pantulan lampu kota — itu sumber
     cahaya, bukan benda, dan memang harus tetap terang. (pelangi-selepas-
     hujan lolos tanpa ini karena ia menggambar pada globalAlpha 0,45, jadi
     warnanya sudah bercampur dengan latar yang sudah ter-tint.) */
  gambarAtas(E) {
    const { x, y, w, h } = JENDELA;
    const naik = Math.min(8, 3 + E.umur * 0.45);
    /* Surut mulai t=20 dan makan 8 detik, jadi air habis di t=28 — angka yang
       SAMA dengan pada(E, 28, ...) di tick: airnya habis, mereka bubar. Dua
       angka itu memang harus jalan bersama; kalau salah satunya digeser, yang
       satu lagi ikut. Air terlihat t=0..28 (mentok 8 px sejak t=11,11 karena
       min(8, 3+0,45t)), bukan lagi 51 detik persegi panjang diam. */
    const surut = E.umur > 20 ? Math.max(0, 1 - (E.umur - 20) / 8) : 1;
    const t = naik * surut;
    if (t < 0.6) return;
    const A = ambien();
    const teduh = (c) => lerpHex(c, A.amb, A.ambA);
    const cAir = teduh('#5f7f96'), cRiak = teduh('#7d9bb0');
    const cMobil = teduh('#3a4450'), cKusen = teduh('#9aa1a6');
    klipJendela(() => {
      const air = y + h - t;
      r(x, air, w, t, cAir);
      r(x, air, w, 1, cRiak);                           // garis permukaan
      // dua riak bergeser mendatar, dibungkus modulo supaya tidak keluar kaca
      for (let k = 0; k < 2; k++) {
        const rx = x + ((now / 900 + k * 26) % (w + 8)) - 4;
        r(rx, air + 2 + k * 2, 6, 1, cRiak);
      }
      // dua kendaraan berhenti separuh terendam
      r(x + 38, air - 2, 6, 3, cMobil);
      r(x + 46, air - 1, 6, 3, cMobil);
      // pantulan lampu kota di air — sengaja TIDAK diteduhkan (lihat di atas)
      ctx.globalAlpha = 0.4;
      for (let k = 0; k < 5; k++) r(x + 4 + k * 9, air + 1 + (k % 3), 1, 1, '#ffd27a');
      ctx.globalAlpha = 1;
      // kusen tengah ditimpa air tadi — dikembalikan, ikut teduh seperti
      // aslinya di drawWindow yang memang kena selubung suasana
      r(x + w / 2 - 1, air, 2, t, cKusen);
    });
  },
  selesai(E) {
    // tidak ada pose/bawa yang dipasang event ini; ini cuma pengaman, dan
    // cukup atas yang MASIH milik event — yang direbut di tengah sudah
    // dibersihkan lepaskanAktor, dan menyentuhnya lagi justru menimpa event
    // yang sekarang memegangnya.
    for (const a of yangMasihMain(E, E.data.orang || [])) { a.pose = null; a.doingEvent = ''; }
  },
},

/* ------------------------------------------------------- barisan salaman ---
   Semua koordinat diverifikasi ke room.js, bukan ke katalog:
     karpet   drawFloor  x152..340, y176..252
     meja     RAPAT      xFL=170 xFR=322 yB=186 yF=226
     kursi dekat         x=214 dan x=278, sandaran y229..242, sortY 260
   Pita y=240 jatuh DI ATAS karpet dan DI BAWAH meja — bersih. Orang di sana
   masuk pita 230..266 sehingga frame() memberi +24 (sortY efektif 264), jadi
   mereka tergambar di DEPAN sandaran kursi dekat; itu persis alasan ambang
   230 ditulis di komentar frame().

   Tuan rumah di x=188, penyalam ke-i di 188 + i*16 — maksimum lima penyalam
   berhenti di x=268, masih jauh di dalam karpet. Antrean menunggu di
   340 + i*16 pada y=252: berakhir di x=404, aman dari sekat kiri pantry
   (x414..420) dan tidak menembusnya. */
{
  id: 'halal-bihalal-lebaran',
  /* durasi 62 = pagar terakhir, bukan panjang adegan. Adegannya berakhir
     sendiri lewat E.selesaiCepat begitu langkah bubar terakhir habis (lihat
     d.tutupPada di tick), jadi angka ini cuma menentukan kapan adegan yang
     melar dipotong paksa. Panjang adegan yang sebenarnya, terukur ujung-ke-
     ujung (scratchpad/sim-halal.mjs + sapuan lanjutannya: route() dan blok
     gerak update() ASLI, dt 1/60, 1248 kombinasi = 13 posisi awal tuan rumah
     x 12 sebaran antrean x 8 laju efektif [MOD.lajuGlobal 1 / 0,85 / 0,8 /
     0,7, masing-masing sendiri dan dikali LAJU_LELAH 0,85]):
       laju 1      33,30..41,20 dtk        laju 0,8    38,00..47,55
       laju 0,85   36,75..45,72            laju 0,7225 40,27..50,88
       laju 0,7    41,20..52,03            laju 0,68   41,97..53,12
       laju 0,595  45,97..58,37 dtk  <- kasus terburuk, margin 3,6 dtk
     Dengan durasi 55 yang lama, 22 dari 156 kombinasi di laju 0,595 mati
     kena pagar SELAGI orangnya masih melangkah pulang. Panggungnya tidak
     ikut terkunci lebih lama gara-gara angka ini: di laju normal event tetap
     bubar di detik 33-41. */
  kelas: 'panggung', bobot: B.langka, cooldown: 82800, durasi: 62,
  perluAktor: true,
  babak: { libur: 0 },
  // toples kue tidak boleh menumpuk di taplak yang sudah ada hidangannya.
  // bentrok() dua arah, jadi cukup ditulis di sini.
  bentrokDengan: [
    'nasi-kotak-datang', 'makan-siang-bareng', 'tumpeng-syukuran',
    'gorengan-di-meja-rapat', 'buka-puasa-bersama',
  ],
  syarat: (S) => {
    const h = taksirHijri(new Date());
    return h.bulan === 10 && h.tgl <= 7
      && S.jam >= 8 && S.jam < 11
      && S.orang.filter(bisaDipinjam).length >= 3;
  },
  mulai(E) {
    const tuan = pemeran(E, ['kadis', 'sekdis', 'kabid']);
    if (!tuan) return;                       // perluAktor akan membatalkannya
    const antre = pinjamAktor(E, 5);
    if (antre.length < 2) { E.selesaiCepat = true; return; }
    E.data.tuan = tuan;
    E.data.baris = [tuan];                   // penerima salaman, tumbuh dari kiri
    E.data.antre = antre;
    E.data.asal = new Map();                 // stasiun asal, dikembalikan saat bubar
    for (const a of [tuan, ...antre]) {
      E.data.asal.set(a, a.station);
      a.doingEvent = 'halal bihalal';
    }
    tuan.goToXY(188, 240, 'right');
    antre.forEach((a, i) => a.goToXY(340 + i * 16, 252, 'left'));
    tuan.say('mari, salaman dulu');
  },
  /* Tidak ada pada() sama sekali di sini: tiap fase angka yang disimpan di
     E.data lalu dibandingkan manual terhadap E.umur. Itu bukan gaya, itu
     kebutuhan — tenggat di adegan ini BERGERAK (kapan orang berikutnya
     sampai tidak diketahui di muka), dan pada(E, E.umur + n, ...) tidak
     pernah jalan. */
  tick(E, dt, S) {
    const d = E.data;
    if (!d.baris) { E.selesaiCepat = true; return; }

    // Antrean dimutasi sendiri lewat shift(), jadi yang sudah direbut tool
    // call dibuang DI TEMPAT supaya d.antre[0] selalu orang yang benar-benar
    // masih ikut.
    pangkasLepas(E, d.antre);

    /* Tuan rumah direbut = acaranya bubar. Melanjutkan barisan tanpa yang
       disalami akan menggambar orang menjabat udara, dan menyeret tuan
       rumahnya balik jelas-jelas melawan tool call yang sedang jalan.

       Ini SATU-SATUNYA jalur di berkas ini yang sengaja melepas pemeran
       selagi trayeknya belum habis, dan memang harus begitu: yang lain
       kebetulan sedang berjalan ke pesta yang barusan dibatalkan, jadi
       menahan event tetap hidup cuma supaya langkah mereka "rapi" berarti
       mengunci panggung untuk adegan yang sudah tidak ada. Mereka dilepas dan
       jalannya diteruskan sendiri (lepaskanAktor tidak menghapus path).
       Sapuan rebutan 552 kombinasi (6 korban x 23 saat rebut x 2 laju x
       segar/lelah): 50 kejadian aktor-masih-melangkah, SEMUANYA dari jalur
       ini, nol dari jalur lain, dan nol pose tersisa sesudah event mati. */
    if (!masihMain(E, d.tuan)) { E.selesaiCepat = true; return; }

    if (d.bubarPada == null) {
      /* Penyalam yang sedang jalan sudah direbut: lupakan dia, ambil
         berikutnya — DAN turunkan tangan PENERIMANYA. lepaskanAktor() cuma
         membersihkan pose orang yang direbut, bukan pose pasangannya, jadi
         dulu tangan penerima tetap terangkat. Kalau yang direbut kebetulan
         penyalam TERAKHIR, tidak ada penyalam berikutnya yang menimpa pose
         itu, jadi tangan itu menggantung sampai event mati — belasan detik,
         bukan sekejap. (Angka detik yang dulu ditulis di sini sengaja dibuang:
         ia diukur waktu durasinya masih 55 dan jadi menyesatkan sesudah
         durasinya berubah. Yang masih bisa diperiksa: sapuan rebutan di
         penjaga tuan rumah di atas melaporkan NOL pose tersisa sesudah event
         mati, 552 kombinasi.) Dan itu bukan cuma berdiri diam: fase bubar di
         bawah menyuruh orang itu BERJALAN, sementara
         drawPerson memberi a.pose prioritas di atas lengan berjalan — hasilnya
         pegawai menyeberang ruangan sambil menjabat udara. */
      if (d.kini && !masihMain(E, d.kini)) {
        for (const p of yangMasihMain(E, [d.pasangan])) p.pose = null;
        d.pasangan = null;
        d.kini = null;
        d.salamMulai = null;
      }

      /* Sisi sebaliknya: PASANGANNYA yang direbut di tengah jabat tangan.
         Posenya sudah terpasang di frame sebelumnya, jadi tidak ada yang bisa
         dibatalkan — yang bisa cuma tidak menahan penyalamnya sampai 2 detik
         penuh menjabat udara. Salamannya disudahi sekarang juga lewat cabang
         "salam selesai" di bawah: dia tetap masuk barisan, cuma lebih cepat. */
      const pasanganPergi = d.pasangan != null && !masihMain(E, d.pasangan);

      /* Ekor barisan penerima yang MASIH ikut. Dihitung sekali di sini karena
         dipakai untuk DUA hal yang harus memakai orang yang sama: syarat boleh
         tidaknya salaman dimulai, dan pasangan salamannya. */
      const lawan = yangMasihMain(E, d.baris).pop() || null;

      if (!d.kini && d.antre.length) {
        d.kini = d.antre[0];
        // titik tujuan bergeser mengikuti panjang barisan penerima — inti
        // koreografinya, dan alasan tenggatnya tidak bisa ditulis di muka
        d.kini.goToXY(188 + d.baris.length * 16, 240, 'left');
        d.kiniSejak = E.umur;
        d.salamMulai = null;
      } else if (d.kini && d.salamMulai == null && d.kini.diam
                 && lawan && lawan.diam && E.umur - d.kiniSejak > 0.6) {
        /* DUA-DUANYA harus sudah berdiri, bukan cuma penyalamnya. Dulu
           syaratnya cuma `d.kini.diam`, dan itu bocor persis di salaman
           PERTAMA: tuan rumah dikirim goToXY(188,240) dari stasiunnya sendiri
           di mulai(), penyalam pertama dikirim ke 204,240 di frame tick
           pertama — dan tuan rumah dipilih pemeran() yang mengutamakan kadis/
           sekdis/kabid, yang justru sering berangkat dari ruang kadis
           (452,140), trayek terpanjang di adegan ini. Kalau penyalamnya tiba
           lebih dulu, tuan rumah diberi pose 'salam' SELAGI MASIH BERJALAN,
           dan drawPerson memberi a.pose prioritas di atas lengan berjalan —
           jadi jabat tangan melayang di udara sambil menyeberang ruangan.
           Terukur (scratchpad/sim-halal.mjs, route()+update() asli, 936
           kombinasi = 13 posisi awal tuan rumah x 3 sebaran antrean x 3
           panjang antrean x 8 laju efektif): 408 kombinasi kena, sampai 2,00
           detik berpose sambil melangkah dan pasangan terpisah 192 px.
           Dengan syarat lawan.diam: 0 dari 936.

           0,6 detik jaga-jaga tetap: route() bisa mengembalikan jalur kosong
           kalau orangnya kebetulan sudah berdiri di titik itu, dan salaman nol
           detik terbaca sebagai kedutan, bukan jabat tangan.

           Pasangannya ekor barisan yang MASIH ikut, bukan d.baris[terakhir]
           mentah: yang sudah direbut tool call tetap tercatat di d.baris, dan
           menyalami dia persis kegagalan yang dijanjikan berkas ini untuk
           dihindari. Terverifikasi: pasangan direbut t=6,83 → satu frame
           kemudian pose tersisa cuma [penyalam:salam], tanpa lawan.

           d.baris SENGAJA tidak ikut dipangkas seperti d.antre. Dia roster
           SLOT, bukan sekadar daftar orang: titik berdiri penyalam ke-n itu
           188 + d.baris.length*16, jadi memangkas orang yang direbut di
           TENGAH barisan bikin penyalam berikutnya berdiri menimpa orang yang
           sudah berdiri di slot itu (baris [tuan@188, p1@204, p2@220], p1
           dipangkas → berikutnya disuruh ke 188+2*16 = 220 = tempat p2).
           Lubang di barisan justru jujur: orangnya memang pergi.

           `lawan` tidak pernah bisa null di sini — d.tuan === d.baris[0] dan
           penjaga di atas sudah membubarkan acara kalau tuan rumahnya direbut
           — tapi syaratnya tetap ditulis supaya cabang ini tidak bergantung
           pada penjaga yang letaknya jauh di atas. Dan ia tidak bisa
           menggantung: `lawan` cuma berdua kemungkinan, sedang berjalan
           (trayeknya pasti habis) atau sudah berdiri. */
        d.salamMulai = E.umur;
        d.kini.pose = 'salam';
        d.pasangan = lawan;
        lawan.pose = 'salam';
        hadapkan(lawan, d.kini.x, d.kini.y);
        blip(523, 0.15);
        spawn('talk', d.kini.x, d.kini.y - 24);
        if (!d.ucapSudah) { d.ucapSudah = true; d.kini.say('mohon maaf lahir batin'); }
      } else if (d.kini && d.salamMulai != null
                 && (pasanganPergi || E.umur > d.salamMulai + 2)) {
        // yang diturunkan tangannya pasangan SALAMAN INI, bukan ekor barisan
        // saat ini — ekornya bisa sudah berganti kalau yang tadi direbut di
        // tengah salam, dan menyentuhnya berarti menimpa orang yang salah
        for (const p of yangMasihMain(E, [d.pasangan])) p.pose = null;
        d.pasangan = null;
        d.kini.pose = null;
        // dia sekarang ujung kanan barisan penerima: berbalik menghadap antrean
        hadapkan(d.kini, d.kini.x + 40, 240);
        d.baris.push(d.kini);
        d.antre.shift();
        d.kini = null;
        d.salamMulai = null;
      }

      // antrean habis (atau habis karena direbut semua): mulai hitung bubar
      if (!d.kini && !d.antre.length) d.bubarPada = E.umur + 4;
    }

    // obrolan pelan sepanjang barisan berdiri
    if (d.baris.length > 1 && Math.random() < 0.5 * dt) {
      const a = pilih(yangMasihMain(E, d.baris));
      if (a) spawn('talk', a.x, a.y - 24);
    }

    if (d.bubarPada != null && !d.bubarSudah && E.umur > d.bubarPada) {
      d.bubarSudah = true;
      const sisa = yangMasihMain(E, d.baris);
      sisa.forEach((a, i) => {
        // jaring pengaman sebelum siapa pun disuruh berjalan: TIDAK ADA pose
        // yang boleh ikut jalan, dari mana pun sumbernya. drawPerson memberi
        // a.pose prioritas di atas lengan berjalan, jadi satu pose yang lolos
        // = satu pegawai menyeberang ruangan sambil menjabat udara.
        a.pose = null;
        if (i < 2) {
          // mampir ke toples kue: dua titik yang MENGAPIT toples (x232..237)
          // supaya kepala mereka (x-4..x+3) tidak menutupinya
          a.goToXY(i === 0 ? 218 : 250, 238, 'up');
        } else {
          const st = d.asal.get(a);
          a.goTo(STATIONS[st] ? st : 'think');
        }
      });
    }

    /* Penutupnya mengikuti LANGKAH BUBAR, bukan angka mati. Dulu di sini
       tertulis `d.tutupPada = E.umur + 8` — konstanta yang berlomba dengan
       trayek yang panjangnya tidak dia batasi, kesalahan yang persis sama
       dengan yang dibetulkan di banjir-di-luar-jendela. Pulang dari ujung
       barisan (x sampai 268, y 240) ke lemari arsip (54,138) itu 340,0 px
       lewat route() — 10,87 detik pada laju terlambat 0,595, tidak muat di 8.
       Terukur dengan berkas ini sebelum diperbaiki (scratchpad, 1248
       kombinasi = 13 posisi awal x 12 sebaran antrean x 8 laju efektif): 444
       kombinasi mematikan event selagi masih ada yang melangkah, sisa
       terpanjang 105,5 px — bersih di laju 1 dan 0,85, mulai bocor di 0,8
       (36/156) dan terburuk di 0,595 (132/156). Sesudah diperbaiki: 0.
       Sama seperti di banjir, ini BUKAN pada(E, E.umur + n): tenggatnya
       disimpan di E.data lalu dibandingkan manual tiap frame. */
    if (d.bubarSudah) {
      const jalan = yangMasihMain(E, d.baris).some((a) => !a.diam);
      if (jalan || d.tutupPada == null) d.tutupPada = E.umur + 1.5;
      else if (E.umur > d.tutupPada) E.selesaiCepat = true;
    }
  },
  /* Ketupat digantung di bawah trio foto-Garuda-foto. Diverifikasi bersih:
     drawPortrait(268,6)/drawGaruda(300,6)/drawPortrait(320,6) tingginya 15 px
     (berakhir y21), AC baru mulai x336, papan nomor antrean x210..226, cat
     mengelupas x196..210. gambarDinding jalan SESUDAH drawWall, jadi
     ketupatnya menggantung di depan dinding, bukan tertimpa. */
  gambarDinding(E) {
    const fade = E.umur < 2 ? E.umur / 2 : 1;
    ctx.globalAlpha = fade;
    [276, 322].forEach((cx0, i) => {
      const gx = cx0 + Math.round(Math.sin(now / 700 + i * 1.6));
      r(gx, 22, 1, 4, '#c9a03a');                    // benang gantungan
      for (let k = 0; k < 7; k++) {
        const lebar = k < 4 ? 1 + k * 2 : 13 - k * 2;   // 1,3,5,7,5,3,1
        r(gx - (lebar - 1) / 2, 26 + k, lebar, 1, k === 3 ? '#3a6b41' : '#4f8a56');
      }
      r(gx, 27, 1, 1, '#6fa877');                    // sorot anyaman
      r(gx, 31, 1, 1, '#6fa877');
    });
    ctx.globalAlpha = 1;
  },
  /* Toples kue di taplak meja rapat. sortY 251, bukan 200-an: drawRapat
     sortY-nya 249 dan taplaknya menutup seluruh y186..226, jadi prop yang
     ber-sortY lebih kecil digambar SEBELUM taplak dan tertimpa. 251 juga
     tetap di bawah kursi dekat (260) dan pantry (270).

     x=232 bukan (192,207) seperti usulan: di situ sudah ada gelas rapat
     drawRapat [190,214] (tergambar x190..195, y209..214) dan botol(198,212).
     Celah 232..237 bersih dari gelas 226, mic 246, map 214..228 dan
     notulen 238..251. */
  gambarProp() {
    const x = 232, y = 206;
    r(x, y, 6, 7, '#dcd6c4');            // toples kaca
    r(x, y + 1, 1, 6, '#eeeade');        // kilau sisi kiri
    r(x, y, 6, 1, '#8a6844');            // tutup
    r(x + 1, y + 3, 1, 1, '#c9a03a');    // kue kering warna-warni
    r(x + 3, y + 2, 1, 1, '#b03030');
    r(x + 2, y + 5, 1, 1, '#3e6b4f');
    r(x + 4, y + 5, 1, 1, '#e0ae80');
  },
  sortY: 251,
  selesai(E) {
    /* pose 'salam' LENGKET — kalau tidak diturunkan di sini, siapa pun yang
       masih memegangnya akan menjabat udara sampai event berikutnya
       menimpanya. Cukup yang MASIH milik event ini: matikanEvent memanggil
       selesai() SEBELUM lepaskanAktor, jadi semua yang masih ikut ada di
       sini — dan yang direbut di tengah sudah dibersihkan lepaskanAktor
       waktu direbut. Tidak ada yang disuruh bergerak dari selesai(). */
    for (const a of yangMasihMain(E, [...(E.data.baris || []), ...(E.data.antre || []), E.data.kini])) {
      a.pose = null;
      a.doingEvent = '';
    }
  },
},

);
