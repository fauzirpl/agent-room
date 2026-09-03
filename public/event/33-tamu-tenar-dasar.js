/* ==========================================================================
   TAMU TENAR — dasar bersama
   ==========================================================================
   Berkas ini TIDAK mendaftarkan satu event pun. Isinya cuma satu wadah,
   `TOKOH`, yang dipakai empat berkas sesudahnya (34 musik & kreator, 35 atlet,
   36 tokoh global, 37 nostalgia & meme). Dipisah karena keempatnya berbagi
   persis pola yang sama — sosok terkenal masuk lewat tepi layar, ruangan
   gempar sebentar, prosedur tetap jalan, dia pulang — dan menyalin pola itu
   empat kali berarti empat versi yang lambat laun berbeda diam-diam.

   ------------------------------------------------------------------ kenapa
   Ruangan ini sudah punya delapan event tamu (tamu-di-ruang-tunggu,
   tamu-salah-alamat, tamu-dinas-kabupaten, tamu-nyasar, ojol-antar-kopi,
   pemohon-surat-di-loket, rombongan-studi-banding, wartawan-motret). Semuanya
   orang biasa. Yang belum pernah ada: orang yang SEMUA ORANG SUDAH KENAL
   sebelum dia membuka mulut.

   Lelucon yang dikejar bukan "wah ada artis" — itu habis dalam dua detik.
   Yang dikejar: birokrasi tidak peduli kamu siapa. Nomor antrean tetap
   berlaku, buku tamu tetap harus diisi, dan yang tanda tangan tetap sedang
   rapat di luar. Ketenaran masuk ke ruangan ini lalu menabrak prosedur, dan
   yang jadi bahan tertawaan selalu prosedurnya atau reaksi berlebihan
   pegawainya — bukan tamunya.

   ------------------------------------------------------- kenapa tanpa nama
   Tidak ada satu pun nama asli di keempat berkas ini, dan itu keputusan
   desain, bukan kehati-hatian yang malu-malu. Tiga alasannya:

     1. Balon kata di ruangan ini milik kita. Begitu sebuah nama sungguhan
        dipasang, tiap kalimat yang keluar dari mulut sosok itu jadi kalimat
        karangan yang ditempelkan ke orang yang benar-benar ada. Itu batas
        antara parodi dan pemalsuan, dan katalog ini tidak punya urusan di
        seberang batas itu.
     2. Nama basi, arketipe tidak. Yang panas tahun ini akan terbaca aneh tiga
        tahun lagi; "kiper bersarung tangan yang jerseynya beda sendiri"
        tidak pernah basi.
     3. Pengenalan justru lebih kuat tanpa nama. Yang bikin penonton langsung
        ngeh bukan tulisan, tapi SILUET: jersey merah muda bernomor sepuluh,
        raket di punggung, harmonika melingkar di leher, wearpack oranye
        dengan helm yang tidak dibuka-buka. Menyebut namanya justru merampas
        kesenangan mengenali.

   Jadi tiap tamu di sini dibangun dari satu tanda pengenal visual yang tidak
   bisa salah baca pada sosok setinggi 26 px dengan empat warna, dan pegawai
   yang menyebutnya cukup bilang "itu... yang di TV itu, kan?".

   ------------------------------------------------ batas yang sengaja dijaga
   * Tamu tenar TETAP orang luar: objek biasa di E.data, bukan Agent, tidak
     masuk penghuni(), tidak menempati slot stasiun. Sesi Claude Code
     sungguhan tidak boleh mengantre di belakang lelucon.
   * `menoleh()` TIDAK dipanggil tiap frame. Ia menaikkan busyUntil, jadi
     memanggilnya terus-menerus membekukan seluruh ruangan selama tamunya ada
     — persis yang dilarang aturan pertama. Karena itu TOKOH.tengok() dipisah
     dari TOKOH.gempar(): yang pertama dipanggil di beat tertentu saja, yang
     kedua boleh tiap frame karena cuma menghambur partikel.
   * Satu tamu tenar per waktu, dijaga TOKOH.adaTamu() yang MEMBACA eventHidup
     alih-alih menyimpan bendera sendiri. Bendera akan bocor: matikanEvent()
     melompati selesai() waktu event dibatalkan (mulai() melempar, atau
     perluAktor tanpa aktor), jadi bendera yang dipasang di mulai() bisa
     tersangkut menyala selamanya dan mematikan seluruh kategori ini sampai
     halaman dimuat ulang. eventHidup selalu benar karena matikanEvent selalu
     mencabut dari sana lebih dulu.
   * Bobot semuanya rendah dan cooldown-nya panjang. Tamu terkenal yang datang
     tiap lima menit berhenti jadi kejutan dan mulai jadi kebisingan.
   ========================================================================== */

const TOKOH = {

  /* ------------------------------------------------------------ satu saja ---
     Dipakai sebagai `syarat: () => !TOKOH.adaTamu()` — atau digabung dengan
     syarat lain. Menandai definisinya dengan field bebas `tamuTenar: true`;
     mesin event mengabaikan field yang tidak dikenalnya, jadi ini tidak
     menuntut satu baris pun di room.js. */
  adaTamu: () => eventHidup.some((E) => E.def.tamuTenar),

  /* --------------------------------------------------------------- tepian ---
     Tamu masuk dan keluar lewat tepi layar. Angka masuknya dipilih supaya
     sosoknya sudah utuh di dalam bingkai (lebar sprite ±10 px dari titik
     kaki), angka keluarnya lebih jauh lagi supaya benar-benar hilang sebelum
     eventnya dimatikan — lihat catatan "lenyap seketika" di bawah. */
  MASUK_KIRI: -16, MASUK_KANAN: W + 16,
  KELUAR_KIRI: -30, KELUAR_KANAN: W + 30,

  /* ------------------------------------------------------------- gerak ---
     Didelegasikan ke TAMU_BIROKRASI (25-tamu-birokrasi.js) apa adanya, bukan
     ditulis ulang: itu sudah jalur berbelok yang memutari meja rapat dengan
     aturan lajur yang sama dengan route() milik Agent, dan sudah dipakai tiga
     event lain. Dibungkus di sini semata supaya berkas tema tidak perlu tahu
     nama tetangganya. */
  langkah: (o, dt, laju) => TAMU_BIROKRASI.langkah(o, dt, laju),
  jalur: (x, y, tx, ty) => TAMU_BIROKRASI.jalur(x, y, tx, ty),

  // Suruh tamu berjalan ke satu titik lewat lajur yang benar.
  antar(o, tx, ty) { o.wp = TOKOH.jalur(o.x, o.y, tx, ty); return o; },

  // Pulangkan lewat tepi terdekat: yang di kiri ruangan tidak menyeberang
  // seluruh kantor cuma untuk keluar di kanan.
  pulangkan(o, paksaKanan) {
    const kanan = paksaKanan == null ? o.x > W / 2 : paksaKanan;
    const lajur = o.y < (LANE_UP + LANE_DOWN) / 2 ? LANE_UP : LANE_DOWN;
    o.wp = TOKOH.jalur(o.x, o.y, kanan ? W - 40 : 40, lajur);
    o.wp.push([kanan ? TOKOH.KELUAR_KANAN : TOKOH.KELUAR_KIRI, lajur]);
    o.fase = 'pulang';
    return o;
  },

  /* --------------------------------------------------------------- palet ---
     drawPerson membaca sembilan field dari pal dan tidak satu pun dijaga
     terhadap undefined — dan canvas palsu di uji-event.mjs MELEMPAR begitu
     fillStyle disetel undefined. Jadi tiap palet tamu dilewatkan ke sini
     dulu; berkas tema cukup menyebut yang beda dari bawaan. */
  pal(o) {
    return {
      main: '#6f7b63', pants: '#3a3f45', skin: '#e0ae80',
      hair: '#2b2118', head: 'hair', ...o,
    };
  },

  /* Bikin satu tamu lengkap di tepi layar. `spek` boleh membawa apa pun —
     yang dibaca TOKOH cuma pal/bawa/aksesori/hadap, sisanya milik event. */
  buat(spek, dariKanan, lajur) {
    const y = lajur == null ? LANE_DOWN : lajur;
    return {
      x: dariKanan ? TOKOH.MASUK_KANAN : TOKOH.MASUK_KIRI, y,
      hadap: dariKanan ? 'left' : 'right',
      wp: [], fase: 'masuk',
      bawa: null, aksesori: null,
      ...spek,
      pal: TOKOH.pal(spek && spek.pal),
    };
  },

  /* --------------------------------------------------------------- gambar ---
     Bentuk objek yang dititipkan ke drawPerson sengaja sama persis dengan
     TAMU_BIROKRASI.gambar — sosok tamu harus segaya dengan pegawai, bukan
     tamu bergaya balok di antara pegawai bergaya sprite. Bedanya cuma satu:
     aksesori digambar SESUDAH badan, di koordinat yang sudah dibulatkan,
     supaya topi/helm/kacamata hitam tidak bergetar setengah piksel waktu
     tamunya berjalan. */
  gambar(o) {
    drawPerson({
      x: o.x, y: o.y,
      face: o.hadap || 'down',
      state: o.wp && o.wp.length ? 'walk' : 'idle',
      phase: now / 1000, slot: 0,
      pal: o.pal,
      bawa: o.bawa || null,
    });
    if (o.aksesori) o.aksesori(Math.round(o.x), Math.round(o.y), o.hadap || 'down', o);
  },

  /* ---------------------------------------------------------- aksesori ---
     Tiga yang dipakai lebih dari satu berkas tema; yang cuma dipakai sekali
     (raket, barbel, gitar, kentongan) tinggal di berkas temanya masing-masing.

     Peta ketinggian kepala, dihitung dari drawHead(): titik kaki `y`, dagu di
     y-17, isi kepala y-25..y-18, garis rambut teratas y-26, dan mata/rim
     kacamata di y-22. Semua angka di bawah turunan dari situ. */

  // Kacamata hitam: satu palang gelap di garis mata. Lebih tebal dari rim
  // kacamata biasa (KACAMATA di drawHead cuma 1 px) supaya terbaca sebagai
  // "kacamata hitam di dalam ruangan", bukan sebagai pegawai berkacamata.
  kacamataHitam(x, y, hadap, warna) {
    const c = warna || '#16181c';
    if (hadap === 'left' || hadap === 'right') {
      const k = hadap === 'right' ? 1 : -4;
      r(x + k, y - 22, 4, 2, c);
    } else {
      r(x - 4, y - 22, 9, 2, c);
      r(x - 4, y - 22, 2, 1, '#4a5058');            // kilau di lensa kiri
    }
  },

  // Topi/kupluk: pita di garis rambut + mahkota setinggi 2 px. `lidah` benar
  // menambah lidah topi yang menjulur ke arah hadap — itu yang membedakan
  // topi pet dari kupluk, dan bedanya terbaca bahkan di 26 px. Yang menghadap
  // penonton lidahnya digambar melebar ke bawah, bukan ke samping: dari depan
  // lidah topi memang terlihat sebagai bayangan di atas dahi.
  topi(x, y, hadap, warna, lidah, warnaPita) {
    r(x - 4, y - 26, 9, 1, warnaPita || warna);
    r(x - 4, y - 28, 8, 2, warna);
    r(x - 4, y - 28, 3, 1, lerpHex(warna, '#ffffff', 0.22));
    if (!lidah) return;
    if (hadap === 'right') r(x + 4, y - 26, 4, 1, warna);
    else if (hadap === 'left') r(x - 7, y - 26, 4, 1, warna);
    else if (hadap !== 'up') r(x - 4, y - 25, 9, 1, sh(warna, 0.7));
  },

  // Helm full-face bervisor: dipakai pembalap dan siapa pun yang wajahnya
  // memang TIDAK boleh terbaca. Menutup seluruh kepala, jadi digambar dari
  // y-27 sampai y-17 — satu piksel lebih rendah dari dagu supaya tidak ada
  // celah kulit yang mengintip di antara helm dan leher.
  helm(x, y, warna, visor) {
    r(x - 5, y - 27, 11, 10, warna);
    r(x - 5, y - 27, 4, 1, lerpHex(warna, '#ffffff', 0.28));   // kilau ubun-ubun
    r(x - 4, y - 23, 9, 3, visor || '#1a1d24');                 // visor gelap
    r(x - 4, y - 23, 3, 1, '#5a6470');                          // pantulan di visor
  },

  /* Rambut/kepang yang menjuntai sampai punggung. Digambar sebagai kolom di
     belakang kepala; waktu menghadap penonton ia muncul di kedua sisi, waktu
     menyamping cuma di sisi belakang — kalau tidak, kepangnya terbaca
     menempel di wajah. */
  juntai(x, y, hadap, warna, panjang) {
    const p = panjang || 10;
    if (hadap === 'right') r(x - 5, y - 24, 1, p, warna);
    else if (hadap === 'left') r(x + 4, y - 24, 1, p, warna);
    else { r(x - 5, y - 24, 1, p, warna); r(x + 4, y - 24, 1, p, warna); }
  },

  /* ----------------------------------------------------------- sosok anak ---
     drawPerson tidak bisa diperkecil — tinggi sprite-nya konstanta, bukan
     parameter — jadi tamu yang berupa ANAK digambar tangan di sini. Ini bukan
     kemewahan: untuk beberapa tokoh, "jauh lebih pendek dari semua pegawai"
     ADALAH tanda pengenalnya, dan itu satu-satunya penanda yang masih terbaca
     di resolusi ini tanpa satu pun detail wajah.

     Tinggi total 20 px lawan 26 px pegawai — selisih yang cukup besar untuk
     terbaca sekilas, tapi tidak sampai membuatnya terlihat seperti prop.
     Peta ketinggiannya BEDA dari sosok dewasa, dan aksesori (destar, topi,
     kacamata hitam) harus memakai angka ini, bukan angka TOKOH.topi():
       kaki y-5..y-1 | badan y-13..y-6 | dagu y-14 | kepala y-20..y-15
       garis rambut teratas y-21 | mata y-18 */
  anak(o) {
    const x = Math.round(o.x), y = Math.round(o.y), p = o.pal;
    const jalan = o.wp && o.wp.length;
    const ayun = jalan ? (Math.sin(now / 90) > 0 ? 1 : 0) : 0;

    ctx.globalAlpha = 0.18;
    r(x - 3, y, 7, 1, '#20301f');                       // bayangan kaki
    ctx.globalAlpha = 1;

    r(x - 2, y - 5, 2, 5 - ayun, p.pants);              // kaki, satu terangkat saat jalan
    r(x + 1, y - 5, 2, 5, p.pants);
    r(x - 3, y - 13, 7, 8, p.main);                     // badan
    if (p.pattern) for (let i = 0; i < 4; i++) r(x - 2 + ((i * 3) % 5), y - 12 + ((i * 5) % 6), 1, 1, p.pattern);
    r(x - 4, y - 12 - ayun, 1, 5, p.main);              // lengan
    r(x + 4, y - 12 + ayun, 1, 5, p.main);
    r(x - 4, y - 8 - ayun, 1, 1, p.skin);               // telapak
    r(x + 4, y - 8 + ayun, 1, 1, p.skin);
    r(x - 1, y - 14, 2, 1, sh(p.skin, 0.78));           // leher
    gumpal(x - 3, y - 20, 6, 6, p.skin);                // kepala
    r(x - 3, y - 21, 6, 1, p.hair);                     // rambut
    r(x - 3, y - 20, 6, 1, p.hair);
    // Mata cuma waktu tidak membelakangi penonton. Dua titik saja: pada sosok
    // 20 px, apa pun yang lebih rinci dari itu jadi bercak.
    if (o.hadap !== 'up') {
      const g = o.hadap === 'left' ? -1 : o.hadap === 'right' ? 1 : 0;
      r(x - 2 + g, y - 18, 1, 1, '#2b2118');
      if (!g) r(x + 1, y - 18, 1, 1, '#2b2118');
    }
    if (o.aksesori) o.aksesori(x, y, o.hadap || 'down', o);
  },

  /* ---------------------------------------------------------- kegemparan ---
     Boleh dipanggil TIAP FRAME: cuma menghambur partikel, tidak menyentuh
     busyUntil siapa pun, jadi ruangan tetap bekerja di belakangnya. `kuat`
     mengatur derasnya — 0.4 untuk tamu yang cuma bikin orang melirik, 2 untuk
     yang bikin satu ruangan berdiri. */
  gempar(x, y, dt, kuat) {
    const k = kuat == null ? 1 : kuat;
    if (Math.random() < 2.2 * k * dt) spawn('talk', x + acak(-14, 14), y - 30);
    if (Math.random() < 1.0 * k * dt) spawn('hati', x + acak(-10, 10), y - 26);
    if (Math.random() < 0.8 * k * dt) spawn('ping', x + acak(-16, 16), y - 34);
  },

  /* Menoleh serempak — yang MENAIKKAN busyUntil, jadi ini yang tidak boleh
     dipanggil tiap frame. Pola pakainya cek rentang umur di tick():
         if (E.umur > 3 && E.umur < 3.2) TOKOH.tengok(S, T.x, T.y);
     Bukan pada(): pada() sah, tapi cek rentang lebih jujur di sini karena
     beatnya memang boleh berbunyi beberapa frame berturut-turut. */
  tengok(S, x, y, lama) {
    menoleh(S.orang || [], x, y, lama || 1100);
  },

  /* Satu pegawai yang sadar duluan. Sengaja SATU, bukan semua: ruangan yang
     serempak menoleh terbaca seperti koreografi, ruangan yang satu orangnya
     berhenti dulu lalu yang lain menyusul terbaca seperti kejadian.
     Mengembalikan pemerannya, atau null kalau semua sedang bekerja — dan yang
     memanggil WAJIB menangani null: di harness, matriks fixture menyapu
     ruangan berisi nol orang. */
  kenali(E, o, kalimat, peran) {
    const a = (peran && pemeran(E, peran)) || pemeranDekat(E, o.x, o.y) || pemeran(E);
    if (!a) return null;
    hadapkan(a, o.x, o.y);
    if (kalimat) a.say(kalimat);
    spawn('talk', a.x, a.y - 26);
    return a;
  },

  /* Nomor antrean loket maju satu. Dipakai tamu yang benar-benar mengantre —
     angkanya nyata di papan (drawAntrean membaca RUANGAN.antre), jadi ini
     satu-satunya bekas permanen yang gratis untuk kategori ini. */
  ambilNomor() { RUANGAN.antre = (RUANGAN.antre % 99) + 1; return RUANGAN.antre; },

  /* -------------------------------------------------------------- keluar ---
     matikanEvent() mencabut E dari eventHidup, jadi gambarProp berhenti
     dipanggil di frame berikutnya: tamu yang masih di tengah ruangan LENYAP
     SEKETIKA, tanpa fade. Tidak ada mekanisme "tunggu sampai keluar layar".
     Pola bakunya: durasi dibuat lebih panjang dari perjalanan pulang, lalu
     event dimatikan sendiri begitu tamunya benar-benar di luar bingkai. */
  sudahKeluar(o) { return o.x < TOKOH.KELUAR_KIRI + 4 || o.x > TOKOH.KELUAR_KANAN - 4; },

  /* Dipanggil di ujung tick(): kalau tamunya sudah keluar layar, matikan
     eventnya lebih awal alih-alih membiarkan sisa durasinya habis dengan
     panggung kosong. */
  tutupKalauKosong(E, o) {
    if (o && o.fase === 'pulang' && TOKOH.sudahKeluar(o)) E.selesaiCepat = true;
  },
};
