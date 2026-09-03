/* ==========================================================================
   TAMU TENAR — NOSTALGIA MILENIAL & MEME
   ==========================================================================
   Tujuh tamu. Tiga pertama untuk penonton yang tumbuh dengan TV analog
   (pendongeng berblangkon, pesulap berambut penutup wajah, vokalis berponi
   sebelah), empat sisanya untuk penonton yang tumbuh dengan layar sentuh
   (siluet narator kriminal, dua sosok brainrot, dan satu bocah yang joget
   dengan kacamata hitam).

   Semuanya menumpang TOKOH (33-tamu-tenar-dasar.js): tepian masuk-keluar,
   jalur berbelok, palet berjaga-undefined, aksesori kepala, dan pagar satu-
   tamu-per-waktu lewat `tamuTenar: true` + `!TOKOH.adaTamu()`. Tidak ada satu
   baris pun yang menyentuh room.js, manifest, atau berkas event lain.

   ------------------------------------------------------------- tanpa nama
   Tidak ada nama orang di berkas ini — tidak di id, tidak di komentar, tidak
   di balon kata. Alasannya lengkap di kepala 33-tamu-tenar-dasar.js dan tidak
   diulang di sini; yang penting untuk pembaca berkas ini: tiap tamu dibangun
   dari SATU tanda pengenal visual yang tidak bisa salah baca pada sosok 26 px
   berwarna empat — blangkon, rambut sepinggang yang menutup wajah, poni
   sebelah, kupluk gelap tanpa wajah, kentongan bermata, kepala katak berbadan
   ban, destar plus kacamata hitam pada tubuh setinggi 20 px. Pegawai yang
   menyebutnya cukup bilang "itu... yang di TV itu, kan?".

   ------------------------------------------- penyimpangan dari spesifikasi
   Empat, semuanya karena aturan ruangan, bukan karena malas. Ditulis di sini
   supaya tidak dicoba ulang dengan cara yang berpura-pura — preseden nadanya
   ada di 28-gel4-a.js (buku-tamu-ditandatangani).

   1. TAMU TIDAK PERNAH BERBALON KATA. `say()` milik class Agent: ia menulis
      ke elemen DOM `this.el` yang dibuat waktu Agent lahir. Orang luar bukan
      Agent (aturan 2 ruangan), jadi ia tidak punya elemen itu, dan
      membuatkannya berarti mengubah room.js. Konvensi yang sudah dipakai
      pemohon-surat-di-loket dan mahasiswa-magang-bingung dipakai apa adanya:
      kalimat tamu jadi partikel 'talk' di atas kepalanya, dan yang berbalon
      sungguhan cuma pegawainya. Akibatnya untuk dua adegan:
        * pesulap yang "cuma menanyakan letak toilet" tidak bisa menanyakannya
          sendiri. Yang dipasang: tiga letupan 'talk' berirama pertanyaan,
          lalu pegawai yang menjawab — dan jawabannya yang jadi antiklimaks
          ("toilet? di luar, belok kanan, Pak."). Leluconnya justru lebih
          bagus di mulut pegawai: yang mengempiskan momen bukan pertanyaannya,
          tapi betapa biasanya jawaban itu.
        * siluet di lorong malam tidak bisa mengucapkan kalimat naratornya.
          Yang dipasang: dia memberi peringatannya lewat 'talk' lalu pergi
          TANPA DIJAWAB (itu bagian yang dipertahankan utuh), dan kalimat
          bergaya narator kriminal TV lama jatuh ke pegawai lembur SESUDAH
          siluetnya hilang — persis posisi narasi penutup di acara aslinya,
          jadi bentuknya malah lebih setia daripada kalau tamunya sendiri yang
          mengucapkannya.

   2. Pesulap tidak "membuat lampu berkedip mati" — MOD.lampu diturunkan ke
      0.84 dan MOD.hening dinyalakan tiap frame selama dia di ruangan, lalu
      BERHENTI ditulis begitu dia berbalik pulang. Snap-back-nya gratis: MOD
      direset tiap frame, jadi tidak perlu animasi balik. Yang sengaja tidak
      dipakai: MOD.neonMati — itu memadamkan tabung neon sungguhan dan bikin
      separuh ruangan gelap selama setengah menit hanya untuk satu lelucon.

   3. Sosok kayu dan sosok kepala-katak DIGAMBAR TANGAN, tidak lewat
      drawPerson. Keduanya memang bukan manusia; memaksakan drawPerson berarti
      menempelkan kepala katak di atas sosok berkemeja dan bercelana, yang
      justru merusak leluconnya. Konsekuensinya ditanggung: keduanya tidak
      ikut MOD.masker, tidak ikut bayangan senja, tidak berkedip. Untuk sosok
      yang muncul beberapa detik lalu hilang, itu harga yang murah.

   4. Bocah berdestar memakai TOKOH.anak() — sosok 20 px gambar tangan yang
      peta ketinggiannya BEDA dari sosok dewasa (mata y-18, garis rambut
      y-21, dagu y-14). Destar dan kacamata hitamnya memakai angka itu, BUKAN
      angka TOKOH.topi()/TOKOH.kacamataHitam() yang dihitung dari kepala
      dewasa (y-26 dan y-22) dan akan melayang enam piksel di atas ubun-ubun.

   --------------------------------------------------------- yang dibatalkan
   * Bekas permanen untuk lima dari tujuh event: TIDAK ADA. Cuma dua yang
     menulis RUANGAN, dan keduanya memakai field yang SUDAH punya cabang
     gambar di room.js — baganKotak (drawFiling, maks 2 kotak) dan laciCelah
     (drawFiling, celah laci macet). Sisanya sengaja tidak meninggalkan jejak:
     menambah field RUANGAN tanpa penggambar cuma menambah sampah tak
     terlihat, dan memaksakan bekas ke field milik event lain (nodaKopi,
     propLantai) bikin ruangan kotor tanpa sebab yang bisa diingat orang.
   * Bobot: tidak ada satu pun B.sering atau B.sedang di berkas ini. Tujuh
     tamu terkenal di satu berkas sudah cukup untuk membuat kategori ini jadi
     kebisingan kalau cooldown-nya pendek; yang paling sering pun (B.jarang,
     cooldown 1800) rata-rata muncul jauh lebih jarang dari itu karena
     `!TOKOH.adaTamu()` membuat ketujuhnya berebut satu slot yang sama.
   ========================================================================== */

/* Satu wadah, bukan tujuh fungsi global lepas: berkas event dimuat sebagai
   classic script yang berbagi satu scope lexical dengan berkas event lain,
   jadi tiap nama tingkat atas di sini ikut jadi milik semua orang. Isinya
   cuma penggambar — yang dipakai lebih dari satu berkas tema sudah tinggal di
   TOKOH; yang di sini semuanya cuma dipakai sekali, di berkas ini. */
const NOSTALGIA = {

  /* ---------------------------------------------------------- blangkon ---
     BUKAN TOKOH.topi(): topi() menggambar mahkota rata setinggi 2 px dengan
     pita — bentuk topi pet. Blangkon bentuknya gumpalan membulat yang duduk
     rendah menutup garis rambut, plus mondolan (gundukan simpul) yang cuma
     terlihat dari samping. Peta ketinggian kepala dewasa: garis rambut
     teratas y-26, isi kepala y-25..y-18. Jadi gumpal 8x4 di y-29 mengisi
     y-29..y-26 — duduk tepat di garis rambut, tidak melayang. */
  blangkon(x, y, hadap) {
    const c = '#6b4a2a', t = '#43301c';
    gumpal(x - 4, y - 29, 8, 4, c, t);
    r(x - 4, y - 26, 9, 1, t);                       // tepi bawah menutup rambut
    if (hadap === 'right') r(x - 6, y - 28, 2, 3, c);        // mondolan di belakang
    else if (hadap === 'left') r(x + 5, y - 28, 2, 3, c);
    else r(x - 3, y - 28, 3, 1, lerpHex(c, '#ffffff', 0.2)); // dari depan: kilau batik
  },

  /* Tongkat. Waktu `angkat` benar ia terangkat menunjuk bagan di dinding —
     itu satu-satunya cara sosok 26 px bisa "menunjuk sesuatu di y=55" tanpa
     lengan yang bisa dianimasikan (drawPerson tidak menerima pose dari luar
     untuk orang non-Agent). */
  tongkat(x, y, hadap, angkat) {
    const c = '#5b3f24', g = '#8a6a3c';
    const bx = hadap === 'left' ? x - 8 : x + 7;
    const atas = angkat ? y - 32 : y - 18;
    r(bx, atas, 1, angkat ? 16 : 18, c);
    r(bx - 1, atas - 1, 3, 1, g);                    // gagang
  },

  /* ------------------------------------------------ rambut penutup wajah ---
     Satu blok gelap MENGGANTIKAN kepala: y-27..y-17 menutupi seluruh gumpalan
     kepala (y-25..y-18) plus dagu (y-17), jadi tidak ada satu piksel kulit
     yang mengintip. Dua kolom menjuntai sampai y-10 — pinggang sosok ini ada
     di sekitar y-9 (kaki mulai y-8), jadi "sepinggang" itu harfiah. Bahu
     dilebarkan dua kolom di kiri-kanan supaya siluetnya terbaca besar;
     drawPerson tidak bisa diperbesar, dan ini cara termurah yang tidak
     menuntut satu baris pun di room.js. */
  tirai(x, y) {
    const c = '#141118';
    r(x - 8, y - 17, 3, 8, '#20202a');               // rompi hitam melebar, bahu kiri
    r(x + 6, y - 17, 3, 8, '#20202a');
    r(x - 6, y - 24, 1, 15, c);                      // rambut sepinggang
    r(x + 5, y - 24, 1, 15, c);
    r(x - 5, y - 27, 11, 11, c);                     // wajah tertutup rambut
    r(x - 5, y - 27, 4, 1, '#2b2533');               // kilau ubun-ubun
    r(x - 4, y - 17, 9, 3, c);                       // ujung rambut jatuh ke bahu
  },

  /* ---------------------------------------------------------- poni sebelah ---
     Blok miring: enam baris yang menyusut satu piksel per baris menghasilkan
     tepi diagonal, dan cuma separuh wajah yang tertutup. Yang membelakangi
     penonton tidak punya wajah untuk ditutup, jadi cukup rambutnya yang
     dipertebal.

     DI SISI MANA — ini yang gampang terbalik, jadi angkanya dibaca langsung
     dari drawHead()/drawEyes() dan bukan dikira-kira. cermin() memetakan sosok
     hadap KANAN ke sisi +x: hidungnya di x+4, mata tunggalnya di x+2 pada
     y-21..y-20, dan tengkuknya justru di x-5. Hadap kiri kebalikannya (mata di
     x-3). Yang menghadap penonton punya dua mata, di x-3..x-2 dan x+1..x+2.
     Jadi 'sisi depan' = +x HANYA untuk hadap 'right'; hadap 'down' ikut sisi
     kiri, supaya yang tertutup satu mata saja — poni yang menutup dua mata
     bukan poni, itu topeng.

     Tepi LUAR dipatok di pinggir kepala, tepi DALAM yang merambat masuk satu
     piksel per baris (lebar 9 → 4). Kebalikannya — mematok tepi dalam dan
     menyusut ke luar — juga menghasilkan diagonal, tapi baris terbawahnya
     berhenti di pinggir dahi dan justru kolom matanya yang terbuka; poninya
     jadi hiasan pelipis, bukan tanda pengenal. */
  poni(x, y, hadap) {
    const c = '#171219';
    r(x - 5, y - 27, 11, 2, c);                      // garis rambut tebal
    if (hadap === 'up') { r(x - 5, y - 25, 11, 6, c); return; }
    const kanan = hadap === 'right';                 // wajahnya di sisi +x
    for (let i = 0; i < 6; i++) {
      const lb = 9 - i;
      r(kanan ? x + 6 - lb : x - 6, y - 25 + i, lb, 1, c);
    }
    r(x - 6, y - 24, 1, 9, c);                       // sisa rambut menjuntai
    r(x + 5, y - 24, 1, 9, c);
  },

  /* --------------------------------------------------------- siluet gelap ---
     Kupluk + wajah yang sengaja tidak terbaca + jaket lebar. Satu warna gelap
     dengan dua tingkat saja: begitu ada tiga tingkat, mata penonton mulai
     mencari wajah dan menemukannya — padahal justru tidak adanya wajah yang
     jadi isi adegannya.

     Kupluknya MENYEMPIT ke atas (7 → 9 → 11 px) dan jaketnya menyempit ke
     bawah. Versi pertama memakai satu balok 11 px penuh dari y-30 sampai y-18
     di atas jaket 17 px, dan hasilnya di layar bukan orang berkupluk melainkan
     TUGU: tanpa satu pun garis yang menyempit, mata membacanya sebagai benda,
     bukan sebagai badan. Kepala berkupluknya 14 baris (y-30..y-17) — empat
     lebih tinggi dari kepala+rambut biasa yang cuma y-26..y-17, karena kupluk
     memang menambah tinggi di atas ubun-ubun. */
  siluet(x, y) {
    const g = '#12141b', g2 = '#191d27';
    r(x - 3, y - 30, 7, 1, g);                       // puncak kupluk
    r(x - 4, y - 29, 9, 2, g);
    r(x - 5, y - 27, 11, 3, g);                      // pinggir kupluk, paling lebar
    r(x - 5, y - 24, 11, 8, g);                      // wajah: blok, tanpa mata
    r(x - 7, y - 17, 15, 3, g2);                     // bahu jaket
    r(x - 6, y - 14, 13, 7, g2);                     // badan jaket, menyempit
    r(x - 7, y - 17, 15, 1, '#262c3a');              // garis bahu, satu-satunya kilau
  },

  /* ------------------------------------------------------------ sosok kayu ---
     Digambar tangan seluruhnya (lihat penyimpangan 3 di kepala berkas): ini
     bukan manusia, badannya kentongan berdiri. Tinggi total 24 px — sengaja
     sedikit lebih pendek dari pegawai (26 px) supaya ia terbaca sebagai
     BENDA yang berdiri, bukan sebagai orang berkostum.
       mata     y-22..y-19    badan/kentongan y-24..y-8
       mulut    y-15..y-11    kaki            y-7..y-2
     `ayun` menggeser pemukulnya turun waktu memukul; `alpha` dijepit 0..1
     karena canvas palsu di uji-event.mjs melempar untuk NaN/Infinity. */
  kayu(x, y, alpha, ayun) {
    const A = Math.max(0, Math.min(1, alpha || 0));
    if (A <= 0.01) return;
    const k1 = '#8a6034', k2 = '#6a4726', gelap = '#2a1c10';
    ctx.globalAlpha = 0.16 * A;
    r(x - 5, y, 11, 1, '#20301f');                   // bayangan kaki
    ctx.globalAlpha = A;
    r(x - 3, y - 7, 2, 6, k2);                       // dua kaki kurus
    r(x + 2, y - 7, 2, 6, k2);
    r(x - 4, y - 1, 4, 2, gelap);
    r(x + 1, y - 1, 4, 2, gelap);
    gumpal(x - 5, y - 24, 10, 17, k1, k2);           // badan = kentongan berdiri
    r(x - 1, y - 20, 2, 11, gelap);                  // celah kentongan
    r(x - 5, y - 24, 4, 1, lerpHex(k1, '#ffffff', 0.2));
    r(x - 4, y - 22, 4, 4, '#f4f2ea');               // mata bulat besar
    r(x + 1, y - 22, 4, 4, '#f4f2ea');
    r(x - 3, y - 21, 2, 2, '#14110d');
    r(x + 2, y - 21, 2, 2, '#14110d');
    r(x - 3, y - 15, 7, 5, gelap);                   // mulut menganga
    r(x - 2, y - 14, 5, 3, '#5a2f1c');
    r(x + 5, y - 18, 3, 1, k2);                      // lengan kayu
    r(x + 7, y - 20 + ayun, 2, 7, k2);               // pemukul
    r(x + 6, y - 21 + ayun, 4, 2, k1);
    ctx.globalAlpha = 1;
  },

  /* -------------------------------------------------------- kepala katak ---
     Juga gambar tangan. Tinggi 25 px, hampir sama dengan pegawai — itu yang
     bikin sosoknya mengganggu waktu berdiri diam di pojok: proporsinya orang,
     bagiannya bukan.
       mata menonjol y-25..y-23   kepala y-22..y-17
       ban           y-16..y-6    kaki manusia y-6..y-2 */
  katakBan(x, y) {
    const hijau = '#4f8a3a', hijauT = '#315c24', ban = '#1c1c21', kulit = '#d9ae84';
    ctx.globalAlpha = 0.16;
    r(x - 5, y, 11, 1, '#20301f');
    ctx.globalAlpha = 1;
    r(x - 3, y - 6, 2, 5, kulit);                    // kaki manusia, telanjang
    r(x + 2, y - 6, 2, 5, kulit);
    r(x - 4, y - 1, 4, 2, '#3a3f45');
    r(x + 1, y - 1, 4, 2, '#3a3f45');
    gumpal(x - 6, y - 16, 13, 11, ban, '#0f0f13');   // badan berupa ban
    r(x - 3, y - 13, 7, 5, '#33333d');               // rongga velg
    for (let i = 0; i < 4; i++) r(x - 5 + i * 4, y - 16, 2, 1, '#3c3c47');   // kembang ban
    gumpal(x - 4, y - 22, 8, 6, hijau, hijauT);      // kepala katak
    r(x - 4, y - 19, 8, 1, hijauT);                  // garis mulut selebar kepala
    r(x - 4, y - 25, 3, 3, '#f2f0e0');               // dua mata menonjol di ubun-ubun
    r(x + 2, y - 25, 3, 3, '#f2f0e0');
    r(x - 3, y - 24, 1, 1, '#14110d');
    r(x + 3, y - 24, 1, 1, '#14110d');
  },

  /* ------------------------------------------------ destar & kacamata anak ---
     Angka di dua fungsi ini turunan peta ketinggian SOSOK ANAK (TOKOH.anak):
     garis rambut teratas y-21, kepala y-20..y-15, dagu y-14, mata y-18. Kalau
     dipakai angka sosok dewasa (garis rambut y-26, mata y-22) destarnya
     melayang enam piksel di atas ubun-ubun. */
  destarAnak(x, y, hadap) {
    const c = '#7a2c2c', t = '#511c1c';
    r(x - 3, y - 22, 7, 1, t);
    r(x - 4, y - 21, 8, 3, c);                       // ikat kepala di garis rambut
    r(x - 4, y - 21, 3, 1, lerpHex(c, '#ffffff', 0.22));
    r(x - 1, y - 20, 3, 1, '#c9a03a');               // sulaman emas
    if (hadap === 'right') r(x + 3, y - 24, 3, 3, c);        // tanjak menjulang
    else if (hadap === 'left') r(x - 6, y - 24, 3, 3, c);
    else { r(x + 1, y - 24, 3, 3, c); r(x + 1, y - 24, 1, 1, t); }
  },

  kacamataAnak(x, y, hadap) {
    const c = '#14161c';
    if (hadap === 'up') return;                      // membelakangi: tidak ada lensa
    if (hadap === 'left' || hadap === 'right') {
      r(x + (hadap === 'right' ? 0 : -3), y - 18, 3, 2, c);
    } else {
      r(x - 3, y - 18, 7, 2, c);
      r(x - 3, y - 18, 2, 1, '#4a5058');             // kilau di lensa kiri
    }
  },
};

daftarEvent(

/* ---------------------------------------------------------------------------
   1. PENDONGENG BERBLANGKON
   Arketipenya: orang tua berblangkon dan berkumis tebal yang di TV lama
   membuka acaranya dengan satu cerita panjang, dan semua anak diam
   mendengarkan. Benturan ketenaran-lawan-prosedur yang dipilih: dia tidak
   minta apa-apa dari kantor ini, dia justru MEMBERI — satu kotak baru di
   bagan struktur organisasi, seolah-olah struktur birokrasi itu bagian dari
   dongengnya. Dan kantor menerimanya begitu saja.

   Bentrok dengan bagan-struktur-organisasi-diperbarui bukan karena tumpang
   tindih gambar tapi karena dua-duanya menulis RUANGAN.baganKotak DAN berdiri
   di titik yang sama persis (x≈118, y=152, di bawah bingkai bagan x104..160
   y20..62); dua orang menaikkan angka yang sama dari dua adegan berbeda bikin
   kotaknya lompat dua tanpa sebab.

   TIDAK digerbangi `RUANGAN.baganKotak < 2` seperti event lama itu — sengaja.
   Menggerbangnya berarti seluruh adegan ini MATI selamanya begitu dua kotak
   terisi, padahal isi adegannya dongengnya, bukan kotaknya. Yang dilakukan:
   kenaikannya dijepit min(2, +1), jadi kunjungan ketiga tetap punya adegan,
   cuma tidak menambah kotak lagi. Itu juga lebih jujur — bagan dinas memang
   ada batasnya.

   Berdiri di (114,152): 18 px di kiri dan 14 px di bawah titik berdiri
   stasiun 'search' (132,138), jadi tidak berimpit dengan pegawai yang
   benar-benar bekerja di filing kabinet (x108..156, y62..118). Transitnya
   lewat penghubung kiri LANE_L=160 dan sprite-nya cuma ±6 px, jadi tidak
   pernah menembus meja rapat yang mulai di x=170.

   TANPA perluAktor: dongeng yang tidak ada yang dengar tetap adegan yang
   benar untuk kantor yang sedang sibuk betulan, dan semua pemakaian pemeran
   di dalamnya dijaga null. --------------------------------------------------- */
{
  id: 'pendongeng-blangkon-bertongkat',
  kelas: 'latar', bobot: B.jarang, cooldown: 2400, durasi: 62,
  tamuTenar: true,
  // Jam kerja saja: dongeng di jam lembur cuma bikin orang ingin pulang.
  babak: { apel: 0.2, istirahat: 0.6, pulang: 0.2, lembur: 0, malam: 0, libur: 0 },
  bentrokDengan: ['bagan-struktur-organisasi-diperbarui'],
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 8 && S.jam < 15 && S.orang.length >= 2,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#2f3540', pants: '#23272e', skin: '#d9a273', hair: '#3a3128', kumis: true },
      aksesori: (x, y, hadap, o) => {
        NOSTALGIA.blangkon(x, y, hadap);
        NOSTALGIA.tongkat(x, y, hadap, !!o.angkat);
      },
    }, false, LANE_DOWN);
    TOKOH.antar(E.data.t, 114, 152);
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (!T) return;
    const sampai = TOKOH.langkah(T, dt, 38);
    if (T.fase === 'masuk' && sampai) { T.fase = 'dongeng'; T.hadap = 'up'; }

    // Satu pegawai sadar duluan, selagi tamunya masih berjalan. E.data.a
    // dipakai lagi di detik 29; dijaga masihMain() karena tool call sungguhan
    // boleh merebutnya kapan saja.
    pada(E, 6, () => { E.data.a = TOKOH.kenali(E, T, 'itu... yang di TV itu, kan?'); });

    /* Menoleh serempak menaikkan busyUntil, jadi TIDAK boleh tiap frame —
       dipanggil tiga kali di detik tetap dengan lama 3400 ms, dan ketiganya
       bersambung menutup rentang 12..31 detik. Itulah "berhenti dan menghadap
       seperti anak kecil": mereka betul-betul tertahan, bukan sekadar
       berputar sekali lalu lanjut mengetik. */
    pada(E, 12, () => TOKOH.tengok(S, T.x, T.y, 3400));
    pada(E, 19, () => TOKOH.tengok(S, T.x, T.y, 3400));
    pada(E, 27, () => TOKOH.tengok(S, T.x, T.y, 3400));

    // Suaranya: partikel 'talk' berirama lambat (lihat penyimpangan 1).
    if (T.fase === 'dongeng' && E.umur < 34 && Math.random() < 0.55 * dt) {
      spawn('talk', T.x + acak(-3, 3), T.y - 30);
    }

    /* Kotaknya nambah. Ditulis di tick(), bukan mulai(): selesai() TIDAK
       dipanggil kalau event dibatalkan, jadi perubahan permanen ke RUANGAN
       aman hanya di jalur yang benar-benar hidup. */
    pada(E, 26, () => {
      T.angkat = true;
      RUANGAN.baganKotak = Math.min(2, RUANGAN.baganKotak + 1);
      for (let i = 0; i < 4; i++) spawn('paper', 122, 44);
      blip(520, 0.07);
    });
    pada(E, 29, () => {
      if (masihMain(E, E.data.a)) E.data.a.say('jadi... kotaknya nambah satu.');
    });
    pada(E, 33, () => { T.angkat = false; TOKOH.pulangkan(T, false); });

    // Jaring pengaman: kalau perjalanan masuknya tersendat, dia tetap harus
    // sempat keluar bingkai sebelum durasinya habis — tamu yang masih di
    // tengah ruangan waktu event dimatikan LENYAP SEKETIKA, tanpa fade.
    if (T.fase !== 'pulang' && E.umur > 46) { T.angkat = false; TOKOH.pulangkan(T, false); }
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T) return;
    TOKOH.gambar(T);
  },
  // Adegan utamanya berdiri di y=152 di depan bagan; sortY-nya dipilih untuk
  // itu, bukan untuk transitnya di lajur bawah — satu event cuma punya satu.
  sortY: 152,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) { a.doingEvent = ''; a.hadap = null; }
  },
},

/* ---------------------------------------------------------------------------
   2. PESULAP BERAMBUT PENUTUP WAJAH
   Arketipenya: sosok besar berambut hitam sepinggang yang menutupi seluruh
   wajah, muncul di panggung tanpa bicara, dan seluruh ruangan menahan napas.
   Benturannya murni antiklimaks (beat 4 di brief): kantor menyiapkan diri
   untuk sesuatu yang besar, lalu yang ditanyakan cuma letak toilet.

   Tiga MOD dipakai dan ketiganya ditulis ULANG TIAP FRAME — MOD direset tiap
   frame, jadi menyetelnya sekali di mulai() sama saja dengan tidak
   menyetelnya sama sekali:
     MOD.lampu 0.84   — redup, bukan padam. MOD.neonMati sengaja tidak dipakai
                        (lihat penyimpangan 2 di kepala berkas).
     MOD.jamDetak     — jarum detik melompat per detik, bukan meluncur. Ini
                        yang bikin ruangan terdengar sunyi tanpa satu partikel
                        pun ditambahkan.
     MOD.hening       — partikel kerja berhenti & neon tidak berkedip = "semua
                        diam", gratis, tanpa menyentuh siapa-siapa.
   Ketiganya berhenti ditulis begitu dia berbalik pulang, jadi lampu kembali
   normal di frame berikutnya tanpa animasi balik.

   MOD.getar TIDAK dinyalakan terus: cuma letupan pendek waktu kakinya
   mendarat (sin(now/260) > 0.86), karena getar menggeser SELURUH kanvas dan
   getaran nonstop selama tujuh detik berjalan terbaca sebagai gempa, bukan
   sebagai langkah berat. Bentrok dipasang terhadap empat event lain yang
   berebut ketiga MOD yang sama; kalau tidak, lampu dan getarnya saling
   menimpa dan dua adegan sama-sama tidak terbaca.

   Berhenti di (250,252): tepat di sumbu ruangan, di sela dua kursi dekat meja
   rapat (x=214 dan x=278, sandarannya ±14 px) — sprite ±10 px, jadi tidak
   menyentuh keduanya. --------------------------------------------------------- */
{
  id: 'pesulap-rambut-menutup-wajah',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 46,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 0.6, pulang: 0.5, lembur: 0.6, malam: 0.3, libur: 0 },
  bentrokDengan: ['gempa-kecil', 'genset-nyala', 'mati-lampu-sekejap', 'detak-jam-terdengar'],
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 9 && S.jam < 17 && S.orang.length >= 2,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#20202a', pants: '#1a1a20', skin: '#c9976c', hair: '#141118' },
      aksesori: (x, y) => NOSTALGIA.tirai(x, y),
    }, true, LANE_DOWN);
    TOKOH.antar(E.data.t, 250, LANE_DOWN);
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (!T) return;
    const sampai = TOKOH.langkah(T, dt, 34);          // pelan: langkahnya berat
    if (T.fase === 'masuk' && sampai) { T.fase = 'diam'; T.hadap = 'down'; }

    /* Selama dia belum berbalik pulang, ruangan menahan napas. Ditulis tiap
       frame; berhenti sendiri begitu fase berganti. */
    if (T.fase !== 'pulang') {
      MOD.lampu = 0.84;
      MOD.jamDetak = true;
      MOD.hening = true;
      MOD.ambPlus = 0.04;
      if (T.wp.length && Math.sin(now / 260) > 0.86) MOD.getar = 1;   // hentakan kaki
    }

    pada(E, 4, () => { E.data.a = TOKOH.kenali(E, T, 'itu... yang di TV itu?'); });
    pada(E, 10, () => TOKOH.tengok(S, T.x, T.y, 4200));

    // Tiga letupan 'talk': iramanya pertanyaan, bukan pidato (lihat
    // penyimpangan 1 — tamu tidak punya say()).
    pada(E, 15, () => { spawn('talk', T.x, T.y - 30); spawn('talk', T.x - 4, T.y - 32); });
    pada(E, 16, () => spawn('talk', T.x + 4, T.y - 31));

    /* Jawabannya yang jadi antiklimaks. Kalau tidak ada seorang pun yang bisa
       dipinjam, pertanyaannya menggantung tanpa dijawab dan dia tetap pulang
       — cabang gagal yang jujur, bukan kecelakaan; itu sebabnya event ini
       tanpa perluAktor. */
    pada(E, 18, () => {
      const b = masihMain(E, E.data.a) ? E.data.a : pemeranDekat(E, T.x, T.y);
      if (!b) return;
      E.data.a = b;
      hadapkan(b, T.x, T.y);
      b.say('toilet? di luar, belok kanan, Pak.');
      spawn('talk', b.x, b.y - 26);
    });
    pada(E, 22, () => TOKOH.pulangkan(T, true));

    if (T.fase !== 'pulang' && E.umur > 32) TOKOH.pulangkan(T, true);
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T) return;
    TOKOH.gambar(T);
  },
  // Berdiri & transit sama-sama di lajur bawah (y=252). Pegawai di pita 230..265
  // diurut memakai y+24, jadi 276 menaruhnya sederet dengan mereka — dan di
  // depan meja rapat (249) serta kursi dekat (260), tempat dia memang berdiri.
  sortY: 276,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) { a.doingEvent = ''; a.hadap = null; }
  },
},

/* ---------------------------------------------------------------------------
   3. VOKALIS BERPONI SEBELAH
   Arketipenya: vokalis band 2000-an dengan poni panjang menutup separuh
   wajah. Benturannya bukan prosedur melainkan GENERASI — dan itu memang
   diminta: dia menyanyi pelan di ruang tunggu, SATU pegawai ikut menyanyi
   tanpa sadar, yang lain menoleh bingung. Yang bikin lucu bukan lagunya, tapi
   badan pegawai yang tahu liriknya sebelum kepalanya sempat memutuskan.

   Liriknya KARANGAN SENDIRI dan berlatar kantor ("map basah semua"), bukan
   penggalan lagu yang benar-benar ada: menempelkan lirik nyata ke mulut
   pegawai fiktif tidak menambah apa pun ke leluconnya dan memindahkan berkas
   ini ke urusan yang bukan urusannya.

   perluAktor: true — di sini benar-benar wajib, karena "satu pegawai ikut
   menyanyi" ADALAH eventnya. Tanpa dia yang tersisa cuma tamu bersenandung
   sendirian, yang sudah dipunyai bersiul-pelan-sendirian; makanya keduanya
   dipasang bentrok.

   Berdiri di (310,296): 28 px di kanan slot ruang tunggu terdepan (STATIONS
   idle x=282, y=288, antreannya melangkah KE KIRI 23 px per orang), jadi ia
   berdiri di tepi ruang tunggu tanpa menempati satu pun slot pegawai. Meja
   kerja baru mulai y=322 dan sekat pantri mulai x=414, jadi titik itu kosong.
   --------------------------------------------------------------------------- */
{
  id: 'vokalis-poni-menutup-sebelah-mata',
  kelas: 'latar', bobot: B.jarang, cooldown: 2100, durasi: 50,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 1.5, pulang: 0.6, lembur: 0.3, malam: 0, libur: 0 },
  bentrokDengan: ['bersiul-pelan-sendirian'],
  perluAktor: true,
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 11 && S.jam < 15 && S.orang.length >= 2,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#2b2b33', pants: '#1f1f26', skin: '#dda879', hair: '#171219' },
      aksesori: (x, y, hadap) => NOSTALGIA.poni(x, y, hadap),
    }, true, LANE_DOWN);
    TOKOH.antar(E.data.t, 310, 296);
    // Dipinjam di mulai(), bukan di tengah jalan: perluAktor:true membatalkan
    // event yang tidak dapat aktor, dan pembatalan di detik nol jauh lebih
    // baik daripada tamunya sudah masuk lalu tidak ada yang ikut menyanyi.
    E.data.n = pemeran(E);
    if (E.data.n) E.data.n.doingEvent = 'ikut menyanyi tanpa sadar';
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (!T) return;
    const sampai = TOKOH.langkah(T, dt, 40);
    if (T.fase === 'masuk' && sampai) { T.fase = 'nyanyi'; T.hadap = 'left'; }

    pada(E, 3, () => { E.data.a = TOKOH.kenali(E, T, 'itu... yang nyanyi di TV itu, ya?'); });

    // Nyanyian tamu = partikel, bukan balon (tamu bukan Agent).
    if (T.fase === 'nyanyi' && E.umur < 30) {
      if (Math.random() < 0.7 * dt) spawn('talk', T.x + acak(-4, 4), T.y - 30);
      if (Math.random() < 0.25 * dt) spawn('hati', T.x + acak(-6, 6), T.y - 26);
    }

    if (E.data.n && E.data.n.eventKerja !== E) E.data.n = null;   // direbut tool call
    const n = E.data.n;

    pada(E, 14, () => {
      if (!n) return;
      hadapkan(n, T.x, T.y);
      n.say('~ hujan turun di parkiran, map basah semua ~');
      spawn('talk', n.x, n.y - 26);
    });
    // Yang lain menoleh ke PEGAWAINYA, bukan ke tamunya — itu letak
    // leluconnya. menoleh() melewati siapa pun yang sedang jadi pemeran, jadi
    // si penyanyi tidak ikut menoleh ke dirinya sendiri.
    pada(E, 18, () => { if (n) TOKOH.tengok(S, n.x, n.y, 2600); });
    pada(E, 22, () => {
      if (!n) return;
      n.say('...eh. maaf. kebawa.');
      n.pose = 'usap';                       // usap tengkuk: malunya kelihatan
    });
    pada(E, 28, () => { if (n) n.pose = null; });
    pada(E, 32, () => TOKOH.pulangkan(T, true));

    if (T.fase !== 'pulang' && E.umur > 40) TOKOH.pulangkan(T, true);
    TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T) return;
    TOKOH.gambar(T);
  },
  // y=296 di luar pita lajur bawah (230..265), jadi sortY = garis kakinya apa
  // adanya: di depan meja buku tamu (296) dan tong sampah (288), di belakang
  // meja kerja (348) — persis urutan yang benar untuk tepi ruang tunggu.
  sortY: 296,
  selesai(E) {
    for (const a of [E.data.n, E.data.a]) {
      if (masihMain(E, a)) { a.pose = null; a.doingEvent = ''; a.hadap = null; }
    }
  },
},

/* ---------------------------------------------------------------------------
   4. SUARA BERAT DI LORONG MALAM
   Arketipenya: siluet gelap tak berwajah dari acara rekonstruksi kriminal TV
   lama, yang muncul di lorong dan memperingatkan sesuatu. Benturannya: yang
   diperingatkan bukan kejahatan besar, cuma laci filing yang tidak dikunci.

   Kalimat naratornya JATUH KE PEGAWAI, bukan ke tamunya, dan itu bukan
   kompromi setengah hati — alasannya panjang di penyimpangan 1 di kepala
   berkas: tamu bukan Agent dan tidak punya say(); dan begitu kalimatnya
   dipindah ke pegawai, ia otomatis jatuh di posisi yang benar (narasi PENUTUP
   sesudah siluetnya hilang, persis seperti acara aslinya). Yang dipertahankan
   utuh dari spesifikasi: siluet itu pergi TANPA DIJAWAB.

   Bekas permanen: RUANGAN.laciCelah dikembalikan ke 0. Field itu sudah punya
   cabang gambar (drawFiling, celah laci macet yang tidak bisa tertutup rapat)
   dan biasanya dinaikkan ke 2 oleh laci-arsip-macet — jadi keduanya dipasang
   bentrok, dan malam ini lacinya benar-benar ditutup. Kalau kebetulan sudah 0,
   penulisan ini no-op dan yang tersisa cuma pegawai berjalan ke kabinet lalu
   mengucapkan kalimatnya; itu tetap adegan yang utuh.

   Berdiri di (337,196): penghubung kanan LANE_R, di antara dua lajur. Kursi
   jauh meja rapat berhenti di x=311 dan sekat pantri baru mulai x=414, jadi
   petak itu memang lorong kosong — satu-satunya tempat di ruangan ini yang
   bisa disebut lorong. --------------------------------------------------------- */
{
  id: 'suara-berat-di-lorong-malam',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 46,
  tamuTenar: true,
  babak: { malam: 3, lembur: 2, apel: 0, kerja: 0, istirahat: 0, pulang: 0, libur: 0 },
  bentrokDengan: ['laci-arsip-macet', 'satpam-patroli'],
  perluAktor: true,                                  // tanpa yang mendengar, tidak ada penutup
  syarat: (S) => !TOKOH.adaTamu() && (S.jam >= 18 || S.jam < 5) && S.orang.length >= 1,
  mulai(E) {
    E.data.t = TOKOH.buat({
      pal: { main: '#191d27', pants: '#141821', skin: '#c9976c', hair: '#101218' },
      aksesori: (x, y) => NOSTALGIA.siluet(x, y),
    }, true, LANE_UP);
    TOKOH.antar(E.data.t, 337, 196);
    E.data.a = pemeran(E);
    if (E.data.a) E.data.a.doingEvent = 'mendengar sesuatu di lorong';
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (!T) return;
    const sampai = TOKOH.langkah(T, dt, 30);         // pelan, langkah berat
    if (T.fase === 'masuk' && sampai) { T.fase = 'lorong'; T.hadap = 'left'; }

    // Lorongnya digelapkan lewat selubung suasana, bukan lewat lampu: ini
    // adegan yang harus tetap terbaca, cuma warnanya yang harus salah.
    if (T.fase !== 'pulang') { MOD.ambPlus = 0.06; MOD.vignette = 0.44; MOD.hening = true; }

    pada(E, 5, () => {
      if (masihMain(E, E.data.a)) { hadapkan(E.data.a, T.x, T.y); E.data.a.say('...lah. siapa itu?'); }
    });
    pada(E, 9, () => TOKOH.tengok(S, T.x, T.y, 2600));

    // Peringatannya: dua letupan 'talk' berat, lalu dia berbalik. Tidak ada
    // yang menjawabnya, dan memang tidak boleh ada.
    pada(E, 12, () => { spawn('talk', T.x, T.y - 30); blip(120, 0.12); });
    pada(E, 16, () => { spawn('talk', T.x - 3, T.y - 31); spawn('talk', T.x + 3, T.y - 29); });
    pada(E, 20, () => TOKOH.pulangkan(T, true));

    /* Narasi penutup + laci ditutup. Berjalannya disuruh di detik tetap;
       kedatangannya diperiksa lewat a.diam, bukan lewat a.station — di harness
       goToXY() cuma stub, jadi a.diam selalu benar dan station tidak pernah
       berubah. */
    pada(E, 24, () => {
      const a = E.data.a;
      if (!masihMain(E, a)) return;
      a.doingEvent = 'menutup laci filing';
      a.goToXY(122, 152, 'up');
    });

    /* Detik siluetnya benar-benar hilang dari bingkai DICATAT, tidak dipatok
       sebagai konstanta. Perjalanan pulangnya 205 px (32 naik ke LANE_UP + 103
       ke x=440 + 70 keluar bingkai) di 30 px/s ≈ 6,8 detik dari detik 20, tapi
       angka itu ikut MOD.lajuGlobal (lembur malam memperlambat semua orang) dan
       ikut di mana persisnya dia berhenti. Tenggat tetap apa pun akan meleset ke
       salah satu dari dua arah: narasinya jatuh selagi siluetnya masih terlihat,
       atau tidak jatuh sama sekali. */
    if (E.data.pergi == null && T.fase === 'pulang' && TOKOH.sudahKeluar(T)) E.data.pergi = E.umur;

    if (!E.data.tutup && E.data.pergi != null && masihMain(E, E.data.a) && E.data.a.diam) {
      E.data.tutup = true;
      RUANGAN.laciCelah = 0;                          // lacinya benar-benar ditutup
      blip(210, 0.09);
      spawn('dust', 132, 128);
      E.data.a.say('berkas hilang itu bukan karena maling. lacinya aja nggak dikunci. waspadalah.');
    }

    if (T.fase !== 'pulang' && E.umur > 30) TOKOH.pulangkan(T, true);
    /* Pagar ini yang bikin adegannya punya penutup. tutupKalauKosong() tanpa
       syarat mematikan event begitu tamunya keluar bingkai — di sini itu detik
       ~27, sementara SELURUH beat penutup (laci ditutup, kalimat naratornya)
       memang dirancang jatuh SESUDAH siluetnya hilang. Tanpa pagar ini
       pegawainya mati di tengah jalan menuju kabinet, laciCelah tidak pernah
       dikembalikan ke 0, dan yang tersisa cuma tamu lewat tanpa akibat — bisu,
       tapi lolos semua uji. Kalau pemerannya keburu direbut tool call sungguhan
       tidak ada lagi yang ditunggu, jadi barulah boleh tutup cepat. */
    if (E.data.tutup || !masihMain(E, E.data.a)) TOKOH.tutupKalauKosong(E, T);
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T) return;
    TOKOH.gambar(T);
  },
  // Berdiri di y=196, di luar pita lajur bawah: sortY = garis kakinya. Di
  // depan kursi jauh meja rapat (168), di belakang meja rapat (249).
  sortY: 196,
  selesai(E) {
    const a = E.data.a;
    if (masihMain(E, a)) { a.doingEvent = ''; a.hadap = null; }
  },
},

/* ---------------------------------------------------------------------------
   5. SOSOK KAYU PEMUKUL SAHUR
   Meme brainrot: sosok kayu berdiri, badannya kentongan, matanya bulat besar,
   mulutnya menganga, dua kaki kurus, memegang pemukul. Digambar tangan
   seluruhnya — ini bukan manusia (penyimpangan 3 di kepala berkas).

   Yang membuatnya bukan sekadar gambar aneh: dia TIDAK BERJALAN MASUK. Dia
   sudah ada di situ waktu alpha-nya naik dari nol, memukul tiga kali, lalu
   pudar lagi. Tamu lain di katalog ini semuanya masuk lewat tepi layar; yang
   ini tidak, dan justru itu yang bikin pegawai lembur mendongak.

   Tiga pukulan di detik 4 / 5.4 / 6.8 — jaraknya 1.4 detik, tempo kentongan
   sahur yang sebenarnya, bukan tiga ketukan cepat. MOD.getar ditulis ULANG
   TIAP FRAME lewat cek rentang (MOD direset tiap frame), cuma 0,35 detik per
   pukulan: getar yang lebih panjang dari itu terbaca gempa, bukan pukulan.
   Bentrok dengan gempa-kecil karena keduanya menggeser seluruh kanvas.

   Berdiri di (158,252): di lajur bawah, 12 px di kiri sudut meja rapat
   (xFL=170) dan 8 px di kanan bendera yang berkibar (x134..150) — sela sempit
   yang memang kosong. Tidak berjalan sama sekali, jadi tidak ada risiko
   menembus perabot di tengah jalan. -------------------------------------------- */
{
  id: 'sosok-kayu-pemukul-sahur',
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 16,
  tamuTenar: true,
  babak: { malam: 2.5, lembur: 2, apel: 0, kerja: 0, istirahat: 0, pulang: 0, libur: 0 },
  bentrokDengan: ['gempa-kecil'],
  syarat: (S) => !TOKOH.adaTamu() && (S.jam >= 21 || S.jam < 4) && S.orang.length >= 1,
  mulai(E) {
    // Objek biasa, bukan hasil TOKOH.buat(): tidak punya pal (tidak lewat
    // drawPerson) dan tidak punya wp (tidak pernah berjalan).
    E.data.k = { x: 158, y: LANE_DOWN, ayun: 0 };
  },
  tick(E, dt, S) {
    const K = E.data.k;
    if (!K) return;

    /* Tiga pukulan. Getarnya dihitung ULANG tiap frame dari daftar tenggat
       tetap ini — bukan disetel sekali, karena MOD kembali ke bawaan di frame
       berikutnya. Ayun pemukulnya dihitung dari daftar yang sama supaya
       gambar dan guncangannya tidak pernah lepas sinkron. */
    const PUKUL = [4, 5.4, 6.8];
    K.ayun = 0;
    for (const t0 of PUKUL) {
      if (E.umur > t0 - 0.25 && E.umur < t0) K.ayun = -3;          // ancang-ancang
      if (E.umur > t0 && E.umur < t0 + 0.35) { K.ayun = 3; MOD.getar = 1.2; }
    }
    pada(E, 4, () => { blip(170, 0.1); spawn('dust', K.x + 8, K.y - 16); });
    pada(E, 5.4, () => { blip(170, 0.1); spawn('dust', K.x + 8, K.y - 16); });
    pada(E, 6.8, () => { blip(170, 0.1); spawn('dust', K.x + 8, K.y - 16); });

    // Pegawai lembur mendongak — sekali, di detik tetap, sesudah pukulan
    // pertama. menoleh() menaikkan busyUntil, jadi tidak boleh tiap frame.
    pada(E, 4.4, () => TOKOH.tengok(S, K.x, K.y, 2600));

    // Muncul dan hilang lewat alpha, bukan lewat berjalan. Dijepit 0..1 di
    // penggambarnya karena canvas palsu melempar untuk nilai di luar akal.
    E.data.alpha = E.umur < 2 ? E.umur / 2
      : (E.umur > 9 ? Math.max(0, 1 - (E.umur - 9) / 2.5) : 1);

    // Sudah benar-benar tak terlihat: tutup lebih awal daripada membiarkan
    // sisa durasinya habis dengan panggung kosong.
    if (E.umur > 11.6) E.selesaiCepat = true;
  },
  gambarProp(E) {
    const K = E.data.k;
    if (!K) return;
    NOSTALGIA.kayu(Math.round(K.x), Math.round(K.y), E.data.alpha == null ? 1 : E.data.alpha, K.ayun || 0);
  },
  // y=252 ada di pita lajur bawah, yang mengurut PEGAWAI memakai y+24 — jadi
  // 276 menaruhnya sederet dengan orang yang berdiri di garis yang sama, dan
  // di depan meja rapat (249). Tiang bendera (274) hampir sederajat tapi tidak
  // pernah bertumpuk: bendera berhenti di x=150, sosok ini mulai di x=153.
  sortY: 276,
},

/* ---------------------------------------------------------------------------
   6. BONEKA KEPALA KATAK BADAN BAN
   Easter egg paling langka di berkas ini, dan satu-satunya tamu di seluruh
   katalog yang TIDAK PUNYA SATU PUN BUNYI DAN PARTIKEL. Tidak ada blip(),
   tidak ada spawn(), tidak ada balon, tidak ada menoleh serempak. Dia cuma
   berdiri di pojok kiri bawah sejak detik nol.

   Mekanisme dilihat-lalu-hilang: tiap frame diperiksa apakah ADA pegawai yang
   jaraknya < 100 px DAN arah hadapnya menunjuk ke arahnya (arah dihitung
   dengan aturan yang sama dengan hadapkan(): sumbu dominan menang). Begitu
   ada, dia berhenti digambar di frame itu juga dan eventnya ditutup lewat
   E.selesaiCepat di tick BERIKUTNYA — dua langkah, bukan satu, supaya
   hilangnya benar-benar terlihat sebagai satu frame kosong dan bukan sebagai
   event yang tidak pernah jalan.

   Yang membaca `o.face || o.hadap`, bukan `o.hadap` saja: hadap itu arah
   khusus stasiun dan seringnya null, sedangkan face selalu terisi — dan face
   yang menentukan ke mana wajahnya digambar.

   Berdiri di (26,316): pojok kiri bawah, di depan pot tanaman (badan pot
   x23..42, y280..293; daunnya berhenti di y=252 jadi tidak tersentuh) dan di
   kiri meja kerja paling kiri (x=86, papannya x54..118 mulai y=322). Sosoknya
   25 px, lebar x20..x32, jadi ujung atasnya di y=291 dan tiga baris teratasnya
   MEMANG bertumpuk dengan dasar pot — itu benar, bukan kelalaian: sortY-nya
   316 lawan 294 milik pot, jadi ia digambar DI DEPAN pot, persis seperti orang
   yang berdiri satu langkah lebih dekat ke kamera. Titik terjauh dari lalu
   lintas ruangan yang masih di dalam bingkai. ----------------------------------- */
{
  id: 'boneka-kepala-katak-badan-ban',
  kelas: 'latar', bobot: B.langka, cooldown: 5400, durasi: 40,
  tamuTenar: true,
  babak: { apel: 0, libur: 0 },
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 7 && S.jam < 20,
  mulai(E) {
    // Sudah berdiri di pojok sejak detik nol: tidak ada fase 'masuk'.
    E.data.b = { x: 26, y: 316, wp: [], fase: 'diam' };
  },
  tick(E, dt, S) {
    const B2 = E.data.b;
    if (!B2) return;

    // Sudah ketahuan di frame lalu: tutup sekarang. Diperiksa paling awal
    // supaya tick ini tidak sempat menggerakkannya lagi.
    if (B2.lenyap) { E.selesaiCepat = true; return; }

    if (B2.fase === 'diam') {
      for (const o of (S.orang || [])) {
        const dx = B2.x - o.x, dy = B2.y - o.y;
        if (Math.hypot(dx, dy) > 100) continue;
        const arah = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        if ((o.face || o.hadap) !== arah) continue;
        B2.lenyap = true;                    // berhenti digambar mulai frame ini
        break;
      }
      // Tidak ada yang melihat sampai menjelang durasi habis: dia pergi
      // sendiri, berjalan keluar tepi kiri seperti tamu mana pun.
      if (!B2.lenyap && E.umur > 32) {
        B2.fase = 'pulang';
        B2.wp = [[TOKOH.KELUAR_KIRI, B2.y]];
      }
    }
    TOKOH.langkah(B2, dt, 30);
    TOKOH.tutupKalauKosong(E, B2);
  },
  gambarProp(E) {
    const B2 = E.data.b;
    if (!B2 || B2.lenyap) return;
    NOSTALGIA.katakBan(Math.round(B2.x), Math.round(B2.y));
  },
  // y=316 di luar pita lajur bawah: sortY = garis kakinya. Di depan pot
  // tanaman (294) dan meja buku tamu (296), di belakang meja kerja (348).
  sortY: 316,
},

/* ---------------------------------------------------------------------------
   7. BOCAH BERDESTAR & BERKACAMATA HITAM
   Anak berbaju tradisional Melayu, berdestar, berkacamata hitam, joget pelan
   di ujung meja rapat dengan tenang sekali sementara dua pegawai merekam.
   Benturannya dibalik dari brief: biasanya ketenaran yang menabrak prosedur;
   di sini KANTORNYA yang kehilangan wibawa duluan, dan si tamu satu-satunya
   yang tidak terpengaruh sama sekali.

   TOKOH.anak() wajib, dan bukan demi kelucuan visual: tingginya 20 px lawan
   26 px pegawai adalah SETENGAH dari leluconnya — sosok yang paling tenang di
   ruangan itu juga yang paling pendek. drawPerson tidak bisa diperkecil
   (tinggi sprite-nya konstanta, bukan parameter), jadi tidak ada jalan lain.
   Destar dan kacamata hitamnya memakai peta ketinggian ANAK (garis rambut
   y-21, mata y-18); lihat NOSTALGIA.destarAnak/kacamataAnak.

   Jogetnya: goyang satu piksel naik-turun dengan periode tetap dan arah hadap
   yang bergantian tiap ±2,8 detik. Iramanya TIDAK PERNAH berubah sepanjang
   event — tidak dipercepat waktu direkam, tidak berhenti waktu ditegur. Itu
   yang dimaksud "sama sekali tidak terpengaruh", dan itu juga sebabnya
   goyangnya dihitung dari `now` dan bukan dari fase apa pun.

   Berdiri di (332,234): 10 px di kanan sudut depan-kanan meja rapat
   (xFR=322, yF=226), jadi benar-benar di UJUNG mejanya. Kursi dekat terjauh
   berpusat di x=278 dan sandarannya berhenti sekitar x=292, jadi tidak
   bertumpuk. Dua perekam ditaruh di (306,266) dan (356,262) — keduanya di
   luar jejak kursi dekat dan jauh dari sekat pantri yang mulai x=414.
   --------------------------------------------------------------------------- */
{
  id: 'bocah-destar-kacamata-hitam',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 56,
  tamuTenar: true,
  babak: { apel: 0, istirahat: 1.5, pulang: 0.4, lembur: 0.3, malam: 0, libur: 0 },
  bentrokDengan: ['rapat-pleno-kursi-penuh'],
  perluAktor: true,                                  // tanpa perekam, ini cuma anak berdiri
  syarat: (S) => !TOKOH.adaTamu() && S.jam >= 10 && S.jam < 16 && S.orang.length >= 2,
  mulai(E) {
    E.data.b = TOKOH.buat({
      pal: { main: '#2e6b4f', pants: '#2e6b4f', skin: '#d9a273', hair: '#1b1410', pattern: '#c9a03a' },
      aksesori: (x, y, hadap) => {
        NOSTALGIA.destarAnak(x, y, hadap);
        NOSTALGIA.kacamataAnak(x, y, hadap);
      },
    }, true, LANE_DOWN);
    TOKOH.antar(E.data.b, 332, 234);
    /* pinjamAktor() BOLEH mengembalikan array lebih pendek dari yang diminta
       — ruangan cuma dijaga berisi empat penghuni dan sebagiannya bisa sedang
       mengerjakan tool call sungguhan. Jadi panjangnya diperiksa di tiap
       pemakaian, bukan diasumsikan dua. */
    E.data.q = pinjamAktor(E, 2);
    for (const a of E.data.q) a.doingEvent = 'merekam tamu di meja rapat';
  },
  tick(E, dt, S) {
    const B3 = E.data.b;
    if (!B3) return;
    const sampai = TOKOH.langkah(B3, dt, 34);
    if (B3.fase === 'masuk' && sampai) B3.fase = 'joget';

    // Arah hadap joget: bergantian pelan, dihitung dari `now` supaya tidak
    // pernah ikut fase apa pun. Selagi berjalan, langkah() yang menentukan.
    if (B3.fase === 'joget') B3.hadap = Math.sin(now / 900) > 0 ? 'left' : 'right';

    // Direbut tool call di tengah adegan: potretnya dipangkas DI TEMPAT
    // supaya q[0] selalu orang yang benar-benar masih ikut.
    pangkasLepas(E, E.data.q);
    const q = E.data.q;

    pada(E, 5, () => {
      if (!q.length) return;
      hadapkan(q[0], B3.x, B3.y);
      q[0].say('itu... bocah yang joget itu, kan?');
      spawn('talk', q[0].x, q[0].y - 26);
    });
    pada(E, 9, () => {
      const titik = [[306, 266, 'right'], [356, 262, 'left']];
      q.forEach((a, i) => {
        const p = titik[i] || titik[0];
        a.goToXY(p[0], p[1], p[2]);
        a.bawa = 'hp';
        a.pose = 'hp';
      });
    });
    pada(E, 13, () => TOKOH.tengok(S, B3.x, B3.y, 2600));
    pada(E, 20, () => { if (q.length) spawn('ping', q[0].x, q[0].y - 30); });
    pada(E, 30, () => { if (q.length > 1) q[1].say('sebentar ya, Dik. sekali lagi.'); });

    // Kegemparan boleh tiap frame: cuma menghambur partikel, tidak menyentuh
    // busyUntil siapa pun, jadi ruangan tetap bekerja di belakangnya.
    if (B3.fase === 'joget' && E.umur < 36) TOKOH.gempar(B3.x, B3.y, dt, 0.5);

    pada(E, 38, () => {
      for (const a of q) { a.pose = null; a.bawa = null; a.doingEvent = ''; }
      TOKOH.pulangkan(B3, true);
    });

    if (B3.fase !== 'pulang' && E.umur > 46) TOKOH.pulangkan(B3, true);
    TOKOH.tutupKalauKosong(E, B3);
  },
  gambarProp(E) {
    const B3 = E.data.b;
    if (!B3) return;
    // Joget = goyang satu piksel, dan cuma waktu dia tidak sedang berjalan
    // (TOKOH.anak sudah punya ayunan langkahnya sendiri untuk yang berjalan).
    const goyang = (!B3.wp.length && Math.sin(now / 260) > 0) ? 1 : 0;
    TOKOH.anak({ ...B3, y: B3.y - goyang });
  },
  // Berdiri di y=234, di dalam pita lajur bawah (230..265) yang mengurut
  // pegawai memakai y+24: 258 menaruhnya sederet dengan mereka, dan di DEPAN
  // meja rapat (249) — dia memang berdiri di sisi dekat mejanya.
  sortY: 258,
  selesai(E) {
    for (const a of yangMasihMain(E, E.data.q)) {
      a.pose = null; a.bawa = null; a.doingEvent = ''; a.hadap = null;
    }
  },
},

);
