/* ==========================================================================
   RAPAT & PEMBAGIAN TUGAS
   ==========================================================================
   Tiga usulan yang sama-sama divonis "mahal" karena menuntut mesin baru:
   flag `tersembunyi` untuk orang yang masuk ruang kadis, `goToTitik()` untuk
   setengah lingkaran di karpet, dan koleksi caraka + lembar undangan yang
   dibaca drawMejaKerja(). Ketiganya ternyata sudah punya jalan yang lebih
   murah dan sudah terbukti dipakai event lain:

     * "menghilang di balik pintu" = a.alpha yang diturunkan ke 0 sambil
       berdiri di ambang pintu — persis pola antre-tanda-tangan-kadis dan
       penilaian-skp. TIDAK ada konsep "tidak terlihat" baru, jadi layers,
       pathing, slotBebas(), panel kru, dan kartu detail tidak disentuh sama
       sekali (itu lima jalur yang dikhawatirkan catatan teknis usulannya).
     * "setengah lingkaran di karpet" = tiga goToXY() ke titik tetap. Yang
       perlu dipikirkan bukan API-nya, tapi z-order-nya — lihat komentar di
       sekdis-bagi-tugas-di-karpet.
     * "caraka + lembar undangan di papan meja" = objek biasa di E.data yang
       digambar gambarOrangLuar() (aturan orang luar), dan lembarnya digambar
       event ini sendiri di gambarAtas — room.js tidak perlu tahu apa-apa.

   Yang benar-benar dibuang dari usulan asli ditulis alasannya di tempatnya
   masing-masing, bukan di sini.
   ========================================================================== */

daftarEvent(

/* Rapat tertutup. Syarat katalog aslinya "ada kadis DAN sekdis bersamaan di
   ruangan" — di ruangan ini itu praktis mustahil: PERAN_BAWAAN menaruh sekdis
   di urutan ke-14 dan kadis ke-16, jadi keduanya baru sama-sama hidup kalau
   ada 16 sesi Claude Code sekaligus. Yang dipakai: dua orang mana pun yang
   bisa dipinjam, dengan pemeran() memilih yang paling tinggi jabatannya kalau
   kebetulan ada. Leluconnya tidak bergantung pada nama jabatannya — yang
   bikin lucu adalah pintu yang tertutup rapat dan ruangan yang mendadak
   berjinjit.

   Dijadikan 'panggung' bukan karena adegannya besar, tapi karena MOD.pintuKadis
   dipakai bersama enam event lain: kalau salah satunya jalan berbarengan,
   pintunya dipaksa terbuka sementara dua orang ini "sedang di dalam" — dan
   seluruh leluconnya batal di layar. */
{
  id: 'kadis-sekdis-rapat-tertutup',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1080, durasi: 38,
  babak: { apel: 0, malam: 0, libur: 0, istirahat: 0.3, pulang: 0.5 },
  syarat: (S) => S.kerjaJam && S.orang.filter((o) => bisaDipinjam(o)).length >= 2,
  perluAktor: true,
  // 'panggung' sudah menahan sesama panggung (antre-tanda-tangan-kadis,
  // penilaian-skp, surat-edaran-berparaf, kadis-sidak-keliling,
  // pengarahan-kadis, rapat-pimpinan-dadakan semuanya panggung). Yang perlu
  // disebut satu per satu justru yang kelas 'latar' — kelas itu tidak
  // ditahan apa pun, padahal keenamnya ikut menulis MOD.pintuKadis = true di
  // frame yang sama dan memaksa pintunya menganga sepanjang adegan tertutup.
  // Daftar ini hasil menyisir public/event/ waktu ditulis, dan SENGAJA tidak
  // dijanjikan lengkap selamanya: tiap gelombang event baru bisa menambah
  // penulis MOD.pintuKadis (banjir-di-luar-jendela dan oper-berkas-berantai
  // sudah menyusul, keduanya menutupinya dari sisi mereka sendiri karena
  // bentrok() dibaca dua arah). Kalau menambah penulis baru, cukup daftarkan
  // event INI di bentrokDengan milik event baru itu.
  bentrokDengan: [
    'disposisi-ditolak', 'menunggu-disposisi-di-depan-pintu',
    'humas-buru-kutipan-kadis', 'kursi-kepala-dicoba-magang', 'satpam-patroli',
  ],
  mulai(E) {
    const a = pemeran(E, ['kadis', 'sekdis', 'kabid']);
    const b = pemeran(E, ['sekdis', 'kabid', 'kasi']);
    E.data.duo = [a, b].filter(Boolean);
    E.data.asal = E.data.duo.map((o) => o.station);
    // Berdiri berimpit di depan daun pintu; yang kedua setengah langkah di
    // belakang, seperti orang yang mempersilakan atasannya masuk duluan.
    E.data.duo.forEach((o, i) => {
      o.doingEvent = 'rapat tertutup di ruang kadis';
      o.goToXY(456 - i * 11, 146 + i * 6, 'up');
    });
    E.data.pelan = [];        // siapa saja yang sedang saya pelankan langkahnya
  },
  tick(E, dt, S) {
    const duo = E.data.duo;
    if (!duo || !duo.length) return;

    // Tenggatnya DINAMIS (tergantung kapan mereka sampai di pintu), jadi
    // disimpan sekali lalu dibandingkan manual — pada() cuma untuk detik tetap.
    if (E.data.masukPada == null) {
      // 10 detik adalah batas sabar: kalau salah satunya tersangkut, adegannya
      // tetap jalan daripada eventnya habis tanpa apa-apa terjadi.
      if (duo.every((o) => o.diam) || E.umur > 10) {
        E.data.masukPada = E.umur;
        E.data.keluar = 19;                       // lama mereka di dalam, detik
        blip(200, 0.14);                          // daun pintu menutup
      }
      return;
    }

    const t = E.umur - E.data.masukPada, keluar = E.data.keluar;

    // Pintu cuma terbuka dua kali: waktu masuk dan waktu keluar. Ditulis tiap
    // frame (MOD direset di awal frame), dan HANYA ditulis true — tidak pernah
    // false, supaya tidak mematikan pintu yang dibuka event lain.
    if (t < 1.2 || (t > keluar && t < keluar + 1.6)) MOD.pintuKadis = true;

    // Memudar di ambang pintu, bukan dihapus dari render: satu-satunya cara
    // "menghilang" yang tidak menyentuh pathing/slotBebas/panel kru.
    // WAJIB disaring: kalau tool call sungguhan merebut salah satunya,
    // lepaskanAktor() mengembalikan alpha=1 tapi frame berikutnya blok ini
    // menimpanya jadi 0 lagi — pegawai yang di panel sedang bekerja HILANG
    // dari ruangan sampai t > keluar.
    for (const o of yangMasihMain(E, duo)) {
      o.alpha = t < 0.2 ? 1
        : t < 1.2 ? Math.max(0, 1 - (t - 0.2) / 1)
          : t < keluar ? 0
            : t < keluar + 1 ? Math.min(1, t - keluar)
              : 1;
    }

    // Suara teredam yang bocor dari balik daun pintu: 'talk' biasa, warnanya
    // digelapkan dan umurnya dipotong jadi 0,6 detik supaya terbaca "samar",
    // bukan percakapan yang jelas.
    if (t > 1.5 && t < keluar) {
      const k = Math.floor((t - 1.5) / 3.5);
      if (k !== E.data.gumam) {
        E.data.gumam = k;
        const p = spawn('talk', 457, 114, '#6d6b64');
        if (p) { p.life = 0.6; p.vy = -7; }
      }
    }

    /* Yang lewat di lajur atas dekat pintu memelankan langkah. a.laju LENGKET,
       jadi tiap frame daftar "yang sedang saya pelankan" disusun ulang dan
       yang sudah keluar zona dikembalikan ke 1 — kalau tidak, orang bisa
       berjalan setengah kecepatan seumur sesi. Yang sedang ada tool call
       (adaTugas) sengaja tidak disentuh: sesi nyata tidak boleh ditahan. */
    const dalam = [];
    if (t > 1.2 && t < keluar) {
      for (const o of S.orang) {
        if (o.adaTugas || o.eventKerja === E) continue;
        if (o.x > 356 && o.y < 200 && o.path.length) { o.laju = 0.6; dalam.push(o); }
      }
    }
    for (const o of E.data.pelan) if (dalam.indexOf(o) < 0) o.laju = 1;
    E.data.pelan = dalam;

    // Dua yang kebetulan berdekatan berbisik sekali. Mereka TIDAK dipinjam —
    // cuma tertahan sebentar lewat busyUntil, seperti menoleh().
    if (t > 4 && !E.data.bisik) {
      E.data.bisik = true;
      const calon = S.orang.filter((o) => bisaDipinjam(o) && !o.path.length);
      let p = null, q = null;
      for (let i = 0; i < calon.length && !p; i++) {
        for (let j = i + 1; j < calon.length; j++) {
          if (jarakKe(calon[i], calon[j].x, calon[j].y) < 46) { p = calon[i]; q = calon[j]; break; }
        }
      }
      if (p && q) {
        hadapkan(p, q.x, q.y); hadapkan(q, p.x, p.y);
        p.busyUntil = Math.max(p.busyUntil, now + 3200);
        q.busyUntil = Math.max(q.busyUntil, now + 3200);
        p.say('kayaknya soal anggaran');
        E.data.balas = q;
        E.data.balasPada = E.umur + 2.4;
      }
    }
    // Objek yang saya null-kan sendiri wajib ikut dicek di penjaganya.
    if (E.data.balas && E.data.balasPada && E.umur > E.data.balasPada) {
      E.data.balas.say('sst, kedengaran');
      E.data.balas = null;
    }

    // Pintu terbuka lagi: semua yang berdiri menoleh, langkah kembali normal.
    if (t > keluar && !E.data.buka) {
      E.data.buka = true;
      blip(320, 0.1);
      menoleh(S.orang, 457, 122, 1400);
    }
    if (t > keluar + 1.6 && !E.data.pulang) {
      E.data.pulang = true;
      // yang sudah direbut tool call sungguhan tidak ditarik balik ke mejanya
      duo.forEach((o, i) => {
        if (!masihMain(E, o)) return;
        o.doingEvent = ''; o.goTo(E.data.asal[i] || 'think');
      });
    }
  },
  /* Jendela kecil di daun pintu: drawKadis() tidak punya kaca sama sekali,
     jadi digambar di sini. sortY 116 — tepat SESUDAH drawKadis (115), kalau
     lebih kecil kacanya tertimbun daun pintunya sendiri. Digambar cuma selama
     pintunya tertutup dengan orang di dalam. */
  gambarProp(E) {
    if (E.data.masukPada == null || !E.data.keluar) return;
    const t = E.umur - E.data.masukPada;
    if (t < 1.2 || t > E.data.keluar) return;
    r(452, 46, 10, 12, '#3a2a18');
    ctx.globalAlpha = 0.55 + 0.12 * Math.sin(now / 620);
    r(453, 47, 8, 10, '#e8bf6a');
    ctx.globalAlpha = 1;
    r(452, 51, 10, 1, '#3a2a18');                 // palang kusen kaca
    glow(457, 52, 13, '#ffd88a', 0.16);
  },
  sortY: 116,
  selesai(E) {
    for (const o of (E.data.pelan || [])) o.laju = 1;
    for (const o of (E.data.duo || [])) { o.alpha = 1; o.doingEvent = ''; }
  },
},

/* Sekdis membagi tugas di karpet.

   Yang mahal dari usulan ini bukan "setengah lingkaran"-nya, tapi urutan
   gambarnya. room.js menggeser sortY orang yang berdiri di pita y 230..266
   menjadi y+24 (supaya mereka lewat DI DEPAN sandaran kursi rapat sisi
   dekat). Akibatnya, kalau si pembagi berdiri di y=262 dan stafnya di y=284,
   si pembagi disortir di 286 dan justru digambar DI DEPAN staf yang
   sebenarnya lebih dekat ke penonton. Jadi seluruh rombongan ditaruh di
   y >= 266 — di luar pita itu, di luar kotak meja rapat + kursinya
   (152..340 x 176..252) seperti yang diminta catatan teknis usulan, dan
   masih di atas baris meja kerja (y 322).

   "Penguncian tujuan berbeda selama 10 detik" tidak butuh penjadwal sendiri:
   aktor yang dipinjam sudah betah=true sampai eventnya habis, jadi cukup
   durasinya yang dibuat cukup panjang sesudah kertas terakhir dibagikan. */
{
  id: 'sekdis-bagi-tugas-di-karpet',
  kelas: 'panggung', bobot: B.jarang, cooldown: 720, durasi: 36,
  babak: { apel: 0, malam: 0, libur: 0, istirahat: 0.4 },
  syarat: (S) => S.kerjaJam && S.orang.filter((o) => bisaDipinjam(o)).length >= 4,
  perluAktor: true,
  mulai(E) {
    const bos = pemeran(E, ['sekdis', 'kabid', 'kasi']);
    if (!bos) return;
    E.data.bos = bos;
    bos.doingEvent = 'membagi tugas';
    bos.bawa = 'map';
    bos.goToXY(246, 266, 'down');

    const staf = pinjamAktor(E, 3);
    E.data.staf = staf;
    E.data.titik = [[196, 282], [246, 292], [296, 282]];
    staf.forEach((o, i) => {
      o.doingEvent = 'menunggu pembagian tugas';
      o.goToXY(E.data.titik[i][0], E.data.titik[i][1], 'up');
    });
    // Tiga meja berbeda — itu inti leluconnya, "yang ini bagi tiga": tidak
    // boleh ada dua orang yang dikirim ke stasiun yang sama.
    E.data.tujuan = ['read', 'web', 'edit'];
    E.data.k = -1;
  },
  tick(E, dt) {
    const bos = E.data.bos, staf = E.data.staf || [];
    if (!bos || !staf.length) return;

    if (bos.diam && E.data.mulaiPada == null) {
      E.data.mulaiPada = E.umur + 2;              // tenggat dinamis, disimpan sekali
      const n = ['satu', 'dua', 'tiga'][staf.length - 1] || 'rata';
      bos.say('yang ini bagi ' + n + ' ya');
    }

    if (E.data.mulaiPada != null && E.umur > E.data.mulaiPada) {
      const k = Math.floor((E.umur - E.data.mulaiPada) / 4);
      if (k > E.data.k && k < staf.length) {
        E.data.k = k;
        const o = staf[k];
        // stafnya keburu direbut tool call sungguhan: lewati gilirannya,
        // jangan dikirim ke stasiun karangan event ini
        if (!masihMain(E, o)) return;
        // 'paper' biasa, tapi kecepatannya diarahkan ke orangnya — spawn()
        // mengembalikan partikelnya, jadi tidak perlu jenis partikel baru
        // cuma untuk "kertas yang terbang ke seseorang".
        for (let i = 0; i < 3; i++) {
          const p = spawn('paper', bos.x, bos.y - 24);
          if (p) { p.vx = (o.x - bos.x) / 1.2 + acak(-8, 8); p.vy = -8; }
        }
        hadapkan(bos, o.x, o.y);
        blip(560, 0.07);
        o.bawa = 'kertas';
        o.doingEvent = 'dapat bagian tugas';
        o.goTo(E.data.tujuan[k]);
        if (k === staf.length - 1) E.data.bosPulangPada = E.umur + 5;
      }
    }

    /* Yang belum kebagian tetap berdiri menunggu. Usulannya minta "kaki
       bergeser-geser 1 px" — itu sengaja TIDAK dibuat dengan menggeser a.x
       sendiri: koordinat pegawai dipegang sistem jalan (path/route), dan
       menggesernya di luar sistem itu bikin dia meleset dari slot stasiunnya
       nanti. Gantinya partikel 'step' di kakinya, yang memang sudah ada dan
       terbaca persis seperti kaki yang tidak bisa diam. */
    for (let i = E.data.k + 1; i < staf.length; i++) {
      const o = staf[i];
      if (o.diam && Math.random() < 0.5 * dt) spawn('step', o.x, o.y);
    }

    // Sekdis pergi terakhir, ke meja kerjanya sendiri.
    if (E.data.bosPulangPada && E.umur > E.data.bosPulangPada && !E.data.bosPulang
        && masihMain(E, bos)) {
      E.data.bosPulang = true;
      bos.bawa = null;
      bos.doingEvent = '';
      bos.goTo('think');
    }
  },
  selesai(E) {
    if (E.data.bos) { E.data.bos.bawa = null; E.data.bos.doingEvent = ''; }
    for (const o of (E.data.staf || [])) { o.bawa = null; o.doingEvent = ''; }
  },
},

/* Undangan rapat disebar (workflow fan-out yang diterjemahkan ke ruangan).

   Caraka BUKAN Agent: objek biasa di E.data, digambar gambarOrangLuar() —
   aturan orang luar. Rutenya dijalankan sebagai tahap bernomor yang maju
   sendiri, bukan antrean tujuan di Agent.update yang belum ada.

   Dua penyimpangan dari usulan:
   * Usulannya menyebut empat meja (444, 374, 176, 86) — sekarang mejanya
     enam, dan berhenti di semuanya bikin perjalanannya saja hampir semenit.
     Yang didatangi cuma meja yang ADA orangnya, maksimal tiga. Meja kosong
     tidak perlu diundang.
   * "Lembar undangan dibaca drawMejaKerja()" tidak dilakukan: itu menitipkan
     state satu event ke berkas bersama. Lembarnya digambar event ini sendiri
     di gambarAtas, di celah papan meja antara pot mini (cx+1..cx+5) dan
     keyboard laptop (cx+12..cx+30). gambarAtas, bukan gambarProp, karena satu
     event cuma punya satu sortY — sementara di sini ada tiga benda pada tiga
     kedalaman berbeda (caraka, lembar di meja, lampu mic di meja rapat). */
{
  id: 'undangan-disebar',
  kelas: 'panggung', bobot: B.sedang, cooldown: 900, durasi: 54,
  babak: { apel: 0, malam: 0, libur: 0, pulang: 0.3, lembur: 0.3 },
  bentrokDengan: ['rapat-pimpinan-dadakan', 'rapat-evaluasi-dadakan',
    'rapat-pleno-kursi-penuh', 'audit-bpk', 'pengarahan-kadis'],
  syarat: (S) => S.kerjaJam && kursiKosong() >= 3
    && S.orang.filter((o) => bisaDipinjam(o)).length >= 2,
  perluAktor: true,
  mulai(E, S) {
    E.data.lembar = [];                      // slotIdx meja yang sudah kebagian
    E.data.i = 0;
    // Caraka keluar dari pintu kadis, lalu turun ke lajur atas. Turun lurus di
    // x=452 tidak bisa: pantry menempati x414..478 y196..288 — jadi dia
    // menyusur LANE_UP ke penghubung kanan (LANE_R) baru turun.
    E.data.t = { x: 452, y: 126, fase: 'keluar' };

    // Yang diundang: yang sedang di mejanya dulu (mereka punya meja yang jelas
    // untuk ditaruhi undangan), baru sisanya. Diurutkan dari kanan ke kiri
    // supaya caraka menyapu satu arah, bukan bolak-balik.
    const diMeja = S.orang.filter((o) => o.station === 'think' && bisaDipinjam(o));
    const lain = S.orang.filter((o) => bisaDipinjam(o) && diMeja.indexOf(o) < 0);
    const undang = diMeja.concat(lain).slice(0, 3);
    for (const o of undang) {
      o.eventKerja = E; o.betahAsli = o.betah; o.betah = true; E.aktor.push(o);
    }

    /* Nomor meja per undangan. Yang sedang duduk di meja pakai mejanya
       sendiri; yang tidak (misalnya sedang berdiri di ruang tunggu) dititipi
       di meja kosong berikutnya — undangan memang ditaruh di meja, bukan
       disodorkan ke tangan. Dedupe supaya tidak ada dua lembar di satu meja. */
    const dipakai = [];
    E.data.slot = undang.map((o) => {
      let s = o.station === 'think' && MEJA_KERJA_X[o.slotIdx] != null ? o.slotIdx : -1;
      if (s < 0 || dipakai.indexOf(s) >= 0) {
        s = -1;
        for (let k = 0; k < MEJA_KERJA_X.length; k++) if (dipakai.indexOf(k) < 0) { s = k; break; }
      }
      if (s >= 0) dipakai.push(s);
      return s;
    });
    // urutkan undangan menurut x mejanya, dari kanan ke kiri
    const urut = undang.map((o, i) => i)
      .filter((i) => E.data.slot[i] >= 0)
      .sort((p, q) => MEJA_KERJA_X[E.data.slot[q]] - MEJA_KERJA_X[E.data.slot[p]]);
    E.data.undang = urut.map((i) => undang[i]);
    E.data.slot = urut.map((i) => E.data.slot[i]);
    E.data.mejaX = E.data.slot.map((s) => MEJA_KERJA_X[s]);
  },
  tick(E, dt) {
    const T = E.data.t;
    if (!T) return;

    if (T.fase === 'keluar') {
      if (E.umur < 2.2) MOD.pintuKadis = true;      // ditulis tiap frame, bukan sekali
      T.y = Math.min(LANE_UP, T.y + 46 * dt);
      if (T.y >= LANE_UP) T.fase = 'kiri';
    } else if (T.fase === 'kiri') {
      T.x = Math.max(LANE_R, T.x - 46 * dt);
      if (T.x <= LANE_R) T.fase = 'turun';
    } else if (T.fase === 'turun') {
      T.y = Math.min(300, T.y + 46 * dt);           // baris depan meja kerja
      if (T.y >= 300) T.fase = 'susur';
    } else if (T.fase === 'susur') {
      const tuju = E.data.mejaX[E.data.i];
      if (tuju == null) { T.fase = 'pergi'; }
      // langkah DIJEPIT ke sisa jarak: ambang 1,5 px lebih sempit daripada
      // langkah 46*dt pada dt besar, jadi tanpa jepitan carakanya melewati
      // titik tuju dan bolak-balik selamanya (harness memakai dt 0,25)
      else if (Math.abs(tuju - T.x) > 0.5 && E.data.tibaPada == null) {
        const d = tuju - T.x;
        T.x += Math.sign(d) * Math.min(46 * dt, Math.abs(d));
      } else {
        if (E.data.tibaPada == null) {
          E.data.tibaPada = E.umur;
          const o = E.data.undang[E.data.i];
          E.data.lembar.push(E.data.slot[E.data.i]);
          blip(500, 0.06);
          for (let k = 0; k < 2; k++) spawn('paper', tuju, 324);
          if (masihMain(E, o)) {
            hadapkan(o, T.x, T.y);
            o.busyUntil = Math.max(o.busyUntil, now + 1400);
          }
        }
        // menunduk membaca dulu, baru berangkat — 2,4 detik per meja, jadi
        // arusnya berundak, bukan semua bangkit serentak
        if (E.umur - E.data.tibaPada > 2.4) {
          const o = E.data.undang[E.data.i];
          // jadwal caraka jalan sendiri, jadi perintah ini PASTI jatuh —
          // tanpa saringan, sesi nyata diseret dari stasiun tool call-nya
          if (masihMain(E, o)) {
            o.doingEvent = 'dipanggil rapat';
            o.goTo('rapat');
            if (E.data.i === 0) o.say('jam sepuluh ya, jangan telat');
          }
          E.data.tibaPada = null;
          E.data.i++;
        }
      }
    } else if (T.fase === 'pergi') {
      T.x -= 48 * dt;                                // keluar lewat kiri
    }

    // Semua sudah duduk? Dari sini rapatnya baru dihitung 10 detik.
    const und = E.data.undang || [];
    if (E.data.dudukPada == null && E.data.i >= E.data.mejaX.length && und.length
      && und.every((o) => o.station === 'rapat' && o.diam)) {
      E.data.dudukPada = E.umur;
    }
    if (E.data.dudukPada != null && E.umur - E.data.dudukPada > 10 && !E.data.bubar) {
      E.data.bubar = true;
      E.data.lembar.length = 0;                      // undangannya ikut dibawa
      for (const o of yangMasihMain(E, und)) { o.doingEvent = ''; o.goTo('think'); }
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#5a6b8a', null, null, '#241a12');
    const x = Math.round(T.x), y = Math.round(T.y);
    // tumpukan undangan di tangannya menipis tiap penyerahan
    const tinggi = Math.max(0, 5 - E.data.lembar.length);
    if (tinggi > 0) {
      r(x + 5, y - 17 - tinggi, 8, tinggi, P.paper);
      r(x + 5, y - 17 - tinggi, 8, 1, '#d9d4c2');
    }
  },
  // Satu sortY tetap untuk orang luar (keterbatasan yang sudah diakui di
  // berkas 21). 262 dipilih karena di situlah dia berada paling lama: di
  // baris y=300, dia harus tenggelam di belakang papan meja (sortY 348) dan
  // di belakang pegawai yang berdiri di mejanya (y=350).
  sortY: 262,
  gambarAtas(E) {
    // lembar undangan di papan meja masing-masing
    for (const s of (E.data.lembar || [])) {
      const cx = MEJA_KERJA_X[s];
      if (cx == null) continue;
      r(cx + 6, 327, 5, 3, P.paper);
      r(cx + 6, 327, 5, 1, '#d9d4c2');
    }
    // Mic meja rapat menyala merah selama mereka duduk. drawRapat() cuma
    // menyalakannya kalau ada tool call yang benar-benar berjalan di stasiun
    // 'rapat' — peserta undangan ini tidak begitu, jadi lampunya digambar
    // sendiri di tiga titik mic yang sama (208,206) (246,204) (284,206).
    if (E.data.dudukPada == null || E.data.bubar) return;
    if (Math.sin(now / 240) < 0.3) return;
    for (const [mx, my] of [[208, 206], [246, 204], [284, 206]]) r(mx, my - 8, 1, 1, P.red);
  },
  selesai(E) {
    for (const o of (E.data.undang || [])) o.doingEvent = '';
  },
},

);
