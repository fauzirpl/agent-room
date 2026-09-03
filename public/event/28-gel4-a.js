/* ==========================================================================
   GELOMBANG 4A — SATU BENANG DARI PLAFON, DAN SATU BUKU TAMU YANG TIDAK JADI
   ==========================================================================
   Dua usulan masuk ke berkas ini. Satu dibuat utuh, satu TIDAK dibuat sama
   sekali — dan alasannya ditulis di sini supaya tidak dicoba ulang dengan
   cara yang berpura-pura.

   1. laba-laba-turun-di-rapat (dibuat).
      Vonis lama "mahal" cuma benar untuk SATU beat: peserta yang tepat di
      bawahnya menggeser kursi. Itu menuntut slotOffset() menerima slot
      paksaan — sekarang ia selalu memanggil slotBebas() yang memilih
      sendiri, dan slotOffset() tinggal di room.js. Beat itu dibuang; sisanya
      (benang, laba-laba, satu orang mengibas dengan kertas) tidak menyentuh
      satu baris pun di luar berkas ini.

      Yang diverifikasi dulu sebelum menulis, karena kalau salah seluruh
      adegannya bisu: PESERTA RAPAT TIDAK BISA DIPINJAM. class Peserta
      menyetel adaTugas = true dan busyUntil = Infinity, sedangkan
      bisaDipinjam() menolak adaTugas — jadi pemeran(), pemeranDekat(), dan
      pemeranStasiun() semuanya akan mengembalikan ORANG LAIN, bukan yang
      sedang duduk di meja rapat. Karena itu pengibasnya wajib pegawai
      menganggur yang berjalan ke depan meja, dan reaksi yang duduk cuma
      lewat o.face + say() — bukan lewat E.aktor. (Dulu lewat menoleh();
      kenapa tidak lagi, ditulis panjang di tick() bagian 4.)

   2. buku-tamu-ditandatangani (TIDAK dibuat, sengaja).
      Seluruh alasan usulan ini lolos triase adalah BEKAS PERMANEN: buku yang
      halamannya makin penuh sepanjang sesi, sekelas RUANGAN.edaran. Bekas
      permanen butuh penggambar yang hidup di luar umur event — artinya
      drawBukuTamu() + satu entri PROPS di public/room.js, berkas bersama yang
      tidak boleh disentuh dari sini. Tanpa itu yang tersisa cuma meja yang
      muncul waktu tamunya datang lalu ikut hilang waktu tamunya pulang: bukan
      "bekas yang menumpuk", cuma properti panggung — dan dengan begitu ia
      jatuh persis jadi kembaran arsiparis-minta-isi-buku-pinjam yang gara-gara
      itulah triase mula-mula hampir menolaknya. Preseden yang sama sudah
      dicatat di 27-serba-kecil.js (bulu ayam & bungkus gorengan): RUANGAN
      memang persisten, tapi yang MENGGAMBARnya ada di room.js, dan menaruh
      data yang tidak punya cabang gambar cuma menambah sampah tak terlihat.
      Jadi event ini dilewati, bukan dipalsukan. Spesifikasi lengkapnya (meja
      14x8 di x185..199 kaki y=296, sortY 296, RUANGAN.bukuTamu dicap 10,
      min(5,n) garis tinta di halaman kiri sisanya di kanan) dilaporkan ke
      pemegang room.js apa adanya.
   ========================================================================== */

daftarEvent(

/* Laba-laba turun di meja rapat. Kolomnya (x 246, dari plafon ke taplak) sama
   persis dengan kolom bocor-baru-di-atas-rapat — itu satu-satunya alasan
   keduanya dibentrokkan: dua benda menggantung di garis yang sama bikin
   penonton tidak bisa membaca mana yang mana. Cukup ditulis di satu sisi,
   bentrokDengan sudah dua arah.

   Tidak meninggalkan bekas apa pun di RUANGAN — sengaja. Meja rapat sudah
   dipakai bersama bocor-baru-di-atas-rapat dan tumpahan-kopi-rapat yang
   dua-duanya menimbun RUANGAN.nodaKopi; menambah noda ketiga dari lelucon
   yang akibatnya cuma "semua mendongak sebentar" bikin taplaknya kotor tanpa
   sebab yang bisa diingat orang. */
{
  id: 'laba-laba-turun-di-rapat',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 20,
  perluAktor: true,
  babak: { malam: 0, libur: 0 },
  bentrokDengan: ['bocor-baru-di-atas-rapat'],
  // minimal 3 kursi terisi: tidak ada gunanya laba-laba turun di meja kosong.
  // kursiKosong() dan KURSI_TOTAL keduanya global di room.js dan sudah dipakai
  // sebagai syarat oleh bocor-baru-di-atas-rapat.
  syarat: () => kursiKosong() <= KURSI_TOTAL - 3,

  mulai(E) {
    E.data.y = 6;              // ujung benang, px dari plafon
    E.data.naik = false;
    E.data.tiba = false;
    E.data.kibasSampai = 0;

    /* Pengibas: pegawai menganggur TERDEKAT ke depan meja rapat. Bukan
       peserta rapat — mereka tidak akan pernah lolos bisaDipinjam(), lihat
       catatan di kepala berkas. Kalau tidak ada yang bisa dipinjam sama
       sekali, E.aktor kosong dan nyalakanEvent() membatalkan sendiri
       (perluAktor: true) — tidak ada adegan setengah jadi. */
    const a = pemeranDekat(E, 246, 252, 220);
    if (!a) return;
    E.data.a = a;
    a.doingEvent = 'mengusir laba-laba';
    a.bawa = 'kertas';
    /* (232, 236) — SENGAJA bukan 246, dan jangan dikembalikan ke sana.
       Dua hal harus benar sekaligus:

       1. Titiknya kosong. Taplak berhenti di yF 226, drawKursiDekat cuma
          menggambar x 203..224 dan 267..288, dan LANE_DOWN ada di 252.
          Siluetnya di 232 terukur x 224..245 (sudah termasuk kertas yang
          dibawa; diukur dengan drawPerson asli, bukan ditaksir) — nol piksel
          bersinggungan dengan kursi dekat.

       2. Dia TIDAK MENELAN laba-labanya. Di frame() titik y 236 masuk pita
          bawah (230..266) jadi dapat +24 = 260, di ATAS sortY event ini
          (250): orangnya digambar SESUDAH laba-labanya. Waktu dia masih
          berdiri sekolom di 246, kotak siluetnya x 238..259 y 210..236
          menelan SELURUH laba-laba (x 244..248, y 214..216) plus
          bayangannya — 11 dari 11 piksel, selama 3,67 detik (t=3,92 s.d.
          t=7,58), persis sepanjang beat kibasnya. Yang tersisa di layar cuma
          benang yang putus di kepala orang. Dari 232, 0 dari 11 piksel
          tertutup, dan lengan kanan pose 'mengipas' (x 237..239) justru
          menjulur ke arah laba-labanya — kibasnya malah lebih terbaca. */
    a.goToXY(232, 236, 'up');
  },

  tick(E, dt, S) {
    const d = E.data;

    // 1. gerak. Turun 52 px/dtk (plafon ke taplak ±4 detik), naik 60 px/dtk:
    //    diusirnya lebih cepat daripada datangnya.
    if (d.naik) {
      d.y -= 60 * dt;
      if (d.y <= 6) { d.y = 6; E.selesaiCepat = true; }
    } else {
      d.y = Math.min(214, d.y + 52 * dt);
    }

    /* 2. pengibas. Kedatangannya DINAMIS — tergantung dari mana dia dipinjam —
       jadi tenggat kibasnya disimpan SEKALI lalu dibandingkan manual.
       pada(E, E.umur + 3.5, ...) tidak akan pernah jalan (pada() berbunyi
       "if (E.umur < detik) return"), dan ada lint-nya di uji-tenggat.mjs.

       masihMain() dipasang di SETIAP frame, bukan sekali: kalau tool call
       sungguhan merebut orang ini di tengah adegan, dia berhenti diperintah
       detik itu juga — termasuk berhenti dipakaikan pose. */
    const a = masihMain(E, d.a) ? d.a : null;
    if (a && !d.tiba && a.diam && d.y >= 214) {
      d.tiba = true;
      d.kibasSampai = E.umur + 3.5;
      a.say('sini saya kibas');
    }
    if (a && d.tiba && E.umur < d.kibasSampai) {
      a.pose = 'mengipas';                       // pose LENGKET: ditulis ulang tiap frame
      if (Math.random() < dt * 2.5) spawn('dust', 246, d.y + 4);
    }
    if (d.tiba && E.umur >= d.kibasSampai && !d.naik) {
      d.naik = true;
      if (a) a.pose = null;
    }

    /* 3. jaring pengaman. Pengibasnya bisa direbut tool call sebelum sampai,
       atau tersangkut di jalan. Laba-labanya tetap harus naik lagi — kalau
       tidak, ia cuma lenyap begitu durasinya habis. */
    if (!d.tiba && !d.naik && E.umur > 11) d.naik = true;

    /* 4. yang duduk mendongak.

       TIDAK memakai menoleh(), dan itu bukan selera. menoleh() memanggil
       hadapkan(), yang menulis o.hadap — dan o.hadap itu LENGKET: di room.js
       yang menulisnya ulang cuma goTo/goToXY/pulangKe (ketiganya menuntut
       perjalanan baru) dan Peserta.bubar() yang menolkannya saat peserta
       keluar dari rapat, sedangkan peserta rapat justru TIDAK berjalan lagi
       selama dia masih duduk — jadi selama adegan ini nilai yang ditulis
       event tetap menempel di badannya, tidak ada yang membereskan. Begitu
       event ini menulis hadap, ia terpaksa MENARIKNYA BALIK sendiri
       belakangan — dan tarikan itulah akar T2. Pagar !o.eventKerja yang dulu
       dipasang di tarikan itu cuma menangkap event yang MEMINJAM orangnya;
       menoleh() sendiri — cara paling umum event lain memutar orang, 27
       pemanggilan di 17 berkas event (dihitung dari kode tanpa komentar,
       4 Sep 2026) — tidak memasang eventKerja sama sekali (lihat menoleh() di
       00-dasar.js: cuma hadapkan() + busyUntil), jadi arah yang baru saja
       dipasang tetangga tetap tersapu lewat pintu itu.

       Yang ditulis sekarang CUMA o.face, dan hadap tidak disentuh sama sekali
       — cuma DIBACA sebagai saksi di pulihToleh(). face bukan field lengket:
       room.js memulihkannya sendiri dari o.hadap di arrive(), setButuh(), dan
       tickPulang(), dan tickKongsi memang preseden persis untuk toleh sesaat
       seperti ini ("cuma `face`, bukan `hadap`, jadi arah hadap stasiunnya
       tidak berubah"). Karena hadap tidak pernah ditulis, event ini secara
       struktural TIDAK BISA lagi menghapus hadapkan() milik siapa pun — arah
       yang tetangga pasang di hadap tetap utuh, dan pemulihan face di sini
       malah IKUT ke sana (lihat pulihToleh). Yang paling parah masih mungkin
       tinggal satu tulisan face yang salah waktu, dan nilainya pun bukan
       potret basi detik 4,5 melainkan salah satu dari dua arah yang memang
       sah buat orang itu.

       Terukur, bukan diklaim (scratchpad/sapu-t2.mjs — tick()/selesai() ASLI
       di sandbox uji-event.mjs, tujuh peserta duduk palsu di kursi sisi jauh,
       aksi event tetangga disuntikkan pada detik tertentu): sapuan 4 cara
       tetangga memutar orang (menoleh / hadapkan langsung / pinjam+hadapkan /
       tulis face saja) x 7 kursi x 45 detik penyuntikan (0..11 dtk, langkah
       0,25) x 3 arah tujuan = 3.696 kombinasi yang benar-benar terpakai
       (sisanya jatuh sesudah eventnya mati). Versi lama membanting arah
       tetangga di 1.274 di antaranya: menoleh 364, hadapkan 364, tulis-face-
       saja 546, pinjam 0 — cuma cabang pinjam itu yang dijaga pagar lama,
       dan itulah kenapa vonis rondenya "ditambal". Versi ini: 42, semuanya
       satu kelas yang memang tidak bisa dibedakan dari face saja — lihat
       pulihToleh().

       Daftarnya diambil ULANG di dalam callback, tidak disimpan di mulai():
       peserta rapat bisa bubar di tengah adegan.

       Yang duduk di dua kursi sisi DEKAT (slotIdx >= KURSI_N) tetap
       DIKECUALIKAN, tapi alasan lamanya sudah TIDAK berlaku: cabang kursi
       dekat di frame() (`a.station === 'rapat' && a.hadap === 'up'`) membaca
       hadap, dan hadap sekarang tidak pernah disentuh, jadi tidak ada lagi
       lompatan z-order. Alasan yang tersisa ada di drawPerson: `back = a.face
       === 'up'`. Dua kursi itu duduk MEMBELAKANGI kamera (goTo memberi mereka
       hadap 'up', arrive() menyalinnya ke face), jadi mengubah face mereka
       jadi 'left'/'right' membalik seluruh sprite dari punggung jadi
       muka-samping — terbaca seperti kursinya diputar 180 derajat, bukan
       seperti melirik. Yang di sisi jauh sudah face 'down', jadi aman. */
    pada(E, 4.5, () => {
      /* Saringannya SAMA PERSIS dengan yang dipakai menoleh() (melewati siapa
         pun yang o.path.length || o.eventKerja): yang sedang dipinjam event
         lain atau sedang berjalan memang bukan milik event ini untuk diputar.
         Saringan yang sama juga menjaga `dekat` di bawah supaya say() tidak
         menimpa balon ucap milik event lain. */
      const duduk = S.orang.filter((o) => o.station === 'rapat' && !o.antre
        && o.dudukSejak && o.slotIdx < KURSI_N && !o.eventKerja && !o.path.length);
      if (!duduk.length) return;
      /* hadapkan() sengaja tidak dipanggil — dia menulis hadap. Arahnya
         dihitung dengan rumus yang sama persis (00-dasar.js hadapkan), cuma
         hasilnya ditaruh di face. Kursi jauh ada di y 192 dan x 189..303, jadi
         yang benar-benar berputar cuma empat kursi terluar (x 284/208/303/189
         -> left/right/left/right); tiga kursi tengah (246/265/227) memang sudah
         menghadap 'down' ke arah laba-labanya. */
      d.noleh = [];
      for (const o of duduk) {
        const dx = 246 - o.x, dy = 214 - o.y;
        const arah = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        // face SEBELUM ditulis (itu yang dibatalkan nanti) + hadap sebagai
        // SAKSI, cuma dibaca, tidak pernah ditulis — lihat pulihToleh().
        d.noleh.push([o, arah, o.face, o.hadap]);
        o.face = arah;
        o.busyUntil = Math.max(o.busyUntil, now + 1600);
      }
      const dekat = duduk.slice().sort((x, y) => Math.abs(x.x - 246) - Math.abs(y.x - 246))[0];
      if (dekat) dekat.say('pindah dulu ya');   // dibilang ke laba-labanya, bukan ke kursinya
    });

    /* 5. tolehnya berakhir 1,6 detik sesudah potret: 4,5 + 1,6 = 6,1 detik
       TETAP (bukan E.umur + N — lihat catatan pada() di bagian 2).

       Dulu pemulihan ini cuma ada di selesai(), dan itu bukan cuma soal
       kebersihan. Angka 1600 (dulu argumen `lama` menoleh(), sekarang
       busyUntil di atas) cuma menahan LANGKAH orangnya 1,6 detik; arah
       hadapnya sendiri bertahan sampai eventnya mati — terukur 4,517 s.d.
       10,983 detik pada jalur normal tanpa gangguan. Jadi ada hampir 5 detik
       (6,1 -> 10,98) waktu event ini masih memegang klaim atas arah orang
       yang sudah tidak dipakainya — dan di sapuan, 266 dari 364 tabrakan
       menoleh versi lama memang jatuh di jendela sesudah 6,1 itu. */
    if (d.noleh && E.umur >= 6.1) E.def.pulihToleh(E);
  },

  /* BUKAN kait room.js — helper milik event ini sendiri, dipanggil dari tick()
     (saat tolehnya habis di detik 6,1) dan dari selesai() (jaring terakhir
     kalau eventnya keburu mati lebih dulu; terukur: mati paksa di detik 5,02
     tetap memulihkan ketujuh face dan mengosongkan d.noleh). Satu salinan,
     dua pemanggil.

     Pagarnya CUMA `o.face !== arah`, dan justru itu pagar kepemilikan yang
     sebenarnya: kalau face-nya sudah bukan nilai yang event ini tulis, ada yang
     menimpanya sesudah itu — dilepas, bukan ditarik balik. Pagar !o.eventKerja
     sengaja TIDAK dipakai lagi; event tetangga boleh meminjam orangnya tanpa
     menyentuh face sama sekali, dan kalau pemulihannya dilewati karena itu,
     toleh milik event INI yang nyangkut di badan orang. Yang sedang berjalan
     dilewati karena update() memasang face tiap langkah dan arrive()
     memulihkannya dari hadap begitu dia sampai.

     Nilai yang dikembalikan dipilih dari SAKSI hadap, bukan dari satu potret
     buta, dan dua cabangnya lahir dari dua kelas kegagalan yang benar-benar
     terukur di sapuan (masing-masing nol kalau cabangnya dipakai, ratusan
     kalau tidak):
       hadap BERUBAH sejak potret -> ada yang memindahkan arah duduk resminya
         (hadapkan/menoleh/goTo). Ikut ke sana: face = o.hadap, persis yang
         dilakukan arrive() dan setButuh(). Tanpa cabang ini, 28 kombinasi per
         cara-tetangga (84 total) berakhir dengan hadap milik tetangga tapi
         face lama milik event ini.
       hadap TETAP -> tidak ada yang memindahkannya; yang dibatalkan cuma
         tulisan sendiri, jadi face dikembalikan seperti sebelum event ini
         menyentuhnya. Tanpa cabang ini, 378 kombinasi (tetangga yang menulis
         face sebelum potret detik 4,5) ikut tersapu jadi arah duduk resmi.

     Sisa yang TIDAK bisa ditutup dari sini, dan angkanya jujur 42 dari 3.696:
     tetangga yang menulis face SAJA — tanpa hadap — dengan arah yang KEBETULAN
     sama dengan arah yang event ini pasang, di dalam jendela 4,5-6,1 (di
     sapuan: dua kursi yang arahnya 'right' x 7 detik penyuntikan x 3 tujuan).
     Dari face saja dua tulisan itu memang tidak bisa dibedakan. Akibatnya pun
     yang paling ringan sekelasnya: toleh tetangga berakhir lebih cepat dari
     maunya, tidak ada field lengket yang rusak. */
  pulihToleh(E) {
    for (const [o, arah, faceLama, hadapLama] of E.data.noleh || []) {
      if (!o || o.path.length || o.face !== arah) continue;
      const balik = o.hadap !== hadapLama ? o.hadap : faceLama;
      o.face = balik || (STATIONS[o.station] || {}).face || 'down';
    }
    E.data.noleh = null;
  },

  /* Satu hook, satu sortY (250): di ATAS taplak meja rapat (drawRapat 249)
      supaya benang, bayangan, dan laba-labanya jatuh di permukaan meja — dan
      di BAWAH pejalan pita bawah (y+24, jadi paling kecil 254) supaya siapa
      pun yang melintas di depan meja lewat di DEPAN laba-labanya.

      Konsekuensi yang harus diingat penulis berikutnya: siapa pun yang event
      ini parkir di pita bawah otomatis menang urutan atas laba-labanya. Kalau
      dia berdiri sekolom (x 246) dia MENELAN habis laba-labanya — itu yang
      dulu terjadi; karena itu pengibasnya berdiri di x 232, lihat mulai().

      Benangnya memang melintasi kepala yang duduk di kursi jauh: mereka
      berada di belakang bidang benang, jadi itu urutan yang benar. */
  gambarProp(E) {
    const d = E.data;
    const y = Math.round(d.y);
    // goyang mendatar 1 px cuma waktu MENGGANTUNG diam di ujung benang
    const gx = (!d.naik && y >= 214) ? Math.round(Math.sin(now / 420)) : 0;
    const x = 246 + gx;

    /* Benang, 1 px dan nyaris tak ada. Pangkalnya DIPAKU di 246 — titik
       gantungnya di plafon tidak ikut bergoyang. Yang bergoyang cuma 20%
       terbawah (dari y 172 waktu menggantung penuh). Dulu seluruh benang
       memakai `x`, jadi garis 208 px plafon-ke-taplak melompat antar kolom
       245/246/247 tiap ~1,3 detik dan ujung atasnya lepas dari plafon: bukan
       benang berayun, tapi benang pindah tempat. */
    ctx.globalAlpha = 0.5;
    const yBelok = 6 + Math.max(0, Math.round((y - 6) * 0.8));
    r(246, 6, 1, yBelok - 6, '#e8e8e0');
    r(x, yBelok, 1, Math.max(0, y - yBelok), '#e8e8e0');
    ctx.globalAlpha = 1;

    /* Bayangan di taplak (y 221, permukaan meja). Ambangnya tepi BELAKANG
       meja — RAPAT.yB = 186 — bukan 170: di atas 186 laba-labanya belum
       menggantung di atas bidang meja sama sekali, jadi bayangannya tidak
       punya tempat jatuh. Ikut goyang bersama badannya (x - 2, bukan 244
       tetap), dan alpha-nya menajam 0,06 -> 0,16 sepanjang 28 px terakhir
       (186 -> 214) supaya terbaca "makin mendekat", bukan lampu yang menyala
       mendadak. */
    if (y > 186) {
      ctx.globalAlpha = 0.06 + 0.10 * Math.min(1, (y - 186) / 28);
      r(x - 2, 221, 5, 1, '#3a3a30');
      ctx.globalAlpha = 1;
    }

    r(x - 1, y, 3, 3, '#2a241e');                           // badan
    r(x - 2, y + 1, 1, 1, '#2a241e');                       // kaki kiri
    r(x + 2, y + 1, 1, 1, '#2a241e');                       // kaki kanan
  },
  sortY: 250,

  selesai(E) {
    /* a.hadap ikut dibersihkan walaupun lepaskanAktor() tidak melakukannya:
       goToXY(232, 236, 'up') di mulai() yang memasangnya, dan yang lengket
       dibereskan di sini. Yang berubah karenanya sudah ditelusuri ke tiap
       pembaca hadap di room.js, bukan ditaksir:
         - goTo / goToXY / pulangKe menulis hadap ULANG sebelum jalan, jadi
           arrive() dan tickKongsi() (yang menuntut station 'think') tidak
           pernah membaca nilai bekas event ini;
         - KAMERA menguji `a.hadap === 'down'` dan cabang kursi rapat sisi
           dekat di frame() menguji `station === 'rapat' && hadap === 'up'` —
           pengibas ini station-nya 'acara', jadi dua-duanya menjawab sama
           sebelum maupun sesudah dinolkan;
         - satu-satunya beda yang benar-benar ada: setButuh() dipanggil di
           handle() SEBELUM cabang yang memanggil goTo(), jadi kalau sesinya
           mengirim butuh/lepas-butuh selagi orangnya masih berdiri di tengah
           ruangan, face-nya jatuh ke 'down' (menghadap kamera) alih-alih
           bertahan 'up' (membelakangi) — itu yang lebih benar untuk orang
           yang ditinggal berdiri di lantai, bukan di depan mejanya. */
    for (const a of E.aktor) { a.pose = null; a.bawa = null; a.doingEvent = ''; a.hadap = null; }
    /* Peserta rapat tidak pernah masuk E.aktor, jadi matikanEvent() tidak akan
       membereskan mereka. Yang perlu dibereskan tinggal SATU field non-lengket
       (face), dan itu pun normalnya sudah selesai di detik 6,1 lewat tick();
       pemanggilan di sini cuma jaring untuk event yang mati lebih cepat.
       Pose mereka tidak disentuh sama sekali — event ini tidak pernah
       memasangnya, dan menyapu pose semua penghuni meja rapat berarti
       menghapus pose milik event lain yang kebetulan jalan barengan. */
    E.def.pulihToleh(E);
  },
},

);
