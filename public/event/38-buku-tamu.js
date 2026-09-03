/* ==========================================================================
   BUKU TAMU — satu-satunya bekas permanen yang ditinggalkan orang LUAR
   ==========================================================================
   Semua bekas permanen di ruangan ini sejauh ini dibuat pegawai: map
   menumpuk di meja stempel (RUANGAN.mapDisposisi), edaran ditempel di
   dinding (RUANGAN.edaran), dus arsip bertambah (RUANGAN.dusTambahanArsip).
   Yang belum ada: bekas yang ditinggalkan orang yang cuma lewat. Buku tamu
   itu justru arsip paling jujur di kantor dinas mana pun — halamannya
   penuh, tapi tidak ada satu pun yang pernah membacanya lagi.

   Kembaran terdekatnya arsiparis-minta-isi-buku-pinjam (12-...bagian-a),
   tapi di sana pelakunya dua PEGAWAI di lemari arsip dan tidak ada apa pun
   yang tersisa sesudah eventnya mati. Di sini justru sisanya yang penting:
   RUANGAN.bukuTamu naik dan TIDAK PERNAH turun sepanjang sesi, jadi kalau
   sesinya panjang halaman kiri buku itu penuh coretan.

   NOL pinjamAktor. Tamu ini tidak menarik satu pegawai pun dari mejanya —
   dia mengurus dirinya sendiri di pojok, dan yang kebetulan menganggur cuma
   menoleh sebentar. Itu pilihan sengaja: rombongan-studi-banding dan
   pemohon-surat-di-loket sudah memakan pegawai, dan ruangan tidak butuh
   tamu ketiga yang ikut berebut.

   Koordinatnya diverifikasi, bukan ditaksir: rancangan awal menaruh mejanya
   di x185..199, dan itu salah — slotKe(k,23) dari STATIONS.idle.x=282
   menghasilkan 282,305,259,328,236,351,213,374,190,... jadi slot menganggur
   ke-8 jatuh tepat di x=190, di dalam mejanya. Mejanya dipindah ke x52..66,
   di luar rentang slot yang wajar (167..420), sesudah tanaman (berhenti di
   x=44) dan di atas papan meja kerja slot cx=86 (baru mulai y=322). */

daftarEvent(

/* Tamunya berjalan masuk, menandatangani, berdiri kikuk sebentar karena
   tidak ada yang menyambut, lalu pulang. Tidak ada punchline besar; yang
   dikejar justru rasa "ada orang datang dan tidak ada yang mengurus", plus
   satu baris tinta yang menetap. */
{
  id: 'buku-tamu-ditandatangani',
  // Durasi 24, bukan 34. Adegannya terukur: jalan masuk 1,9 dtk (-14 -> 74
  // pada 46 px/dtk) + tanda tangan 6 + berdiri kikuk 8 + keluar 2,3 = 18,2
  // detik. Sisanya dulu event hidup yang tidak menggambar apa pun karena
  // gambarProp sudah return di T.x < -16. Penjaga selesaiCepat di bawah
  // yang jadi pengaman sebenarnya; 24 cuma batas atas.
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 24,
  babak: { malam: 0, libur: 0 },
  // Di-cap 10 supaya bukunya berhenti terisi sebelum barisnya tumpah keluar
  // halaman; drawBukuTamu memang cuma menggambar sampai 10.
  syarat: (S) => S.jam >= 8 && S.jam < 15 && RUANGAN.bukuTamu < 10,
  // Satu tamu saja pada satu waktu. Enam event di bawah ini sama-sama
  // memunculkan orang luar; dua tamu sekaligus membuat ruangan terlihat
  // seperti kantor pelayanan, bukan bidang teknis yang sepi.
  bentrokDengan: [
    'tamu-di-ruang-tunggu', 'tamu-nyasar', 'tamu-salah-alamat',
    'pemohon-surat-di-loket', 'tamu-dinas-kabupaten', 'rombongan-studi-banding',
  ],
  mulai(E) {
    E.data.t = { x: -14, y: 288, fase: 'masuk' };
    E.data.tinta = 0;                 // partikel tinta yang sudah dilepas
    E.data.tambah = 0;                // baris yang sudah ditambahkan, maks 2
    E.data.noleh = [];                // [orang, hadapLama, faceLama]
  },
  tick(E, dt, S) {
    const T = E.data.t;

    if (T.fase === 'masuk') {
      // Berhenti di x=74, DI SAMPING mejanya (x52..66), bukan di atasnya:
      // sosoknya selebar ~10px, jadi di 74 dia berdiri utuh terlihat dan
      // mejanya tetap menutupi tulang keringnya lewat sortY 296 > 292.
      T.x = Math.min(74, T.x + 46 * dt);
      if (T.x >= 74) {
        T.fase = 'tanda';
        // Tenggat MUTLAK disimpan sekali. pada(E, E.umur + 6, ...) tidak
        // akan pernah menyala — pada() itu one-shot pada detik TETAP.
        E.data.tandaSampai = E.umur + 6;
        // Yang kebetulan menganggur menoleh sebentar. hadap/face itu field
        // LENGKET dan lepaskanAktor tidak meresetnya (dan tamu ini memang
        // tidak meminjam siapa pun), jadi arah lamanya dicatat dan
        // dikembalikan sendiri di selesai().
        for (const o of S.orang) {
          if (o.eventKerja || o.path.length || E.data.noleh.length >= 3) continue;
          E.data.noleh.push([o, o.hadap, o.face]);
          hadapkan(o, 60, 286);
          o.busyUntil = Math.max(o.busyUntil, now + 1500);
        }
      }
      return;
    }

    if (T.fase === 'tanda') {
      // Tinta menetes tiap ~1,5 detik selama menandatangani; baris bukunya
      // sendiri naik maksimal 2 — satu tamu tidak mengisi separuh buku.
      const lewat = 6 - (E.data.tandaSampai - E.umur);
      const mau = Math.min(2, Math.floor(lewat / 2.4));
      while (E.data.tambah < mau) {
        E.data.tambah++;
        RUANGAN.bukuTamu = Math.min(10, (RUANGAN.bukuTamu | 0) + 1);
        spawn('ink', 58 + acak(-2, 2), 285);
      }
      if (E.umur > E.data.tandaSampai) { T.fase = 'tunggu'; E.data.tungguSampai = E.umur + 8; }
      return;
    }

    if (T.fase === 'tunggu') {
      // Berdiri kikuk beberapa langkah ke dalam, menunggu disambut. Tidak
      // ada yang datang — itu leluconnya, jadi tidak ada penjaga apa pun
      // yang perlu dipasang di sini.
      T.x = Math.min(92, T.x + 30 * dt);
      if (E.umur > E.data.tungguSampai) T.fase = 'pulang';
      return;
    }

    if (T.fase === 'pulang') {
      T.x -= 46 * dt;
      // Begitu tamunya lewat tepi kiri, tidak ada lagi yang tersisa untuk
      // digambar — eventnya mati sekarang, bukan menunggu durasi habis.
      if (T.x < -16) E.selesaiCepat = true;
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (!T || T.x < -16) return;
    // Membungkuk waktu menandatangani = seluruh sosok turun 2px. Tidak perlu
    // pose baru, dan gambarOrangLuar memang selalu menghadap penonton.
    gambarOrangLuar(Math.round(T.x), T.y + (T.fase === 'tanda' ? 2 : 0),
      '#6b4a2a', '#d9ab5e', T.fase === 'masuk' ? 'map' : null);
  },
  selesai(E) {
    // Tidak ada aktor yang dipinjam, tidak ada pose/bawa/MOD yang dipasang.
    // Yang WAJIB dikembalikan cuma arah orang yang tadi menoleh: pegawai
    // yang duduk di stasiun 'think' tidak pernah dapat goTo() baru, jadi
    // arah itu akan nyangkut selamanya kalau dibiarkan.
    for (const [o, hadap, face] of E.data.noleh || []) {
      if (o.eventKerja) continue;      // sudah dipakai event/tool call lain
      o.hadap = hadap;
      o.face = face;
    }
    // RUANGAN.bukuTamu memang SENGAJA tidak dibersihkan — itu bekasnya.
  },
  sortY: 292,
},

);
