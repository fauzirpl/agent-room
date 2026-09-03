/* ==========================================================================
   BIROKRASI — ritual dinas: disposisi, paraf, stempel, tamu, inspeksi
   ========================================================================== */

daftarEvent(

{
  id: 'disposisi-surat-masuk',
  kelas: 'latar', bobot: B.sering, cooldown: 120, durasi: 18,
  syarat: (S) => S.kerjaJam && RUANGAN.mapDisposisi < 5,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['magang', 'arsiparis']);
    if (!a) return;
    a.doingEvent = 'mengantar surat masuk';
    a.bawa = 'map-pink';
    a.goToXY(286, 152, 'up');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a) return;
    if (a.diam && !E.data.taruh) {
      E.data.taruh = true;
      RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
      a.bawa = null;
      a.say('surat masuk, Bu');
      // yang sedang di meja stempel berhenti sebentar dan menerimanya
      const tuan = S.orang.find((o) => o.station === 'edit' && o.state === 'work');
      if (tuan) {
        hadapkan(tuan, a.x, a.y);
        tuan.busyUntil = Math.max(tuan.busyUntil, now + 1500);
        spawn('paper', 292, 130); spawn('paper', 292, 130);
      }
    }
    pada(E, 12, () => a.goToXY(-20, LANE_DOWN, 'left'));
  },
},

/* Mekanisme "hilang di balik pintu" dipakai ulang penilaian-skp: yang masuk
   ruang kadis memudar di ambang, bukan menghilang mendadak. */
{
  id: 'antre-tanda-tangan-kadis',
  kelas: 'panggung', bobot: B.sedang, cooldown: 240, durasi: 30,
  perluAktor: true,
  // Di luar jam kerja pun antrean bisa mengular: kalau ≥2 agen nyata sedang
  // menunggu keputusan kamu / macet (S.tungguTotal), tanda tangan kadis
  // memang sedang jadi penyumbat. `?? 0` buat potret yang belum membawanya.
  syarat: (S) => S.kerjaJam || (S.tungguTotal ?? 0) >= 2,
  mulai(E) {
    const orang = pinjamAktor(E, 3);
    E.data.antre = orang;
    orang.forEach((a, i) => {
      a.doingEvent = 'antre tanda tangan';
      a.bawa = 'map';
      a.goToXY(470 - i * 12, 152, 'up');
    });
  },
  tick(E) {
    const q = E.data.antre;
    if (!q || !q.length) return;
    MOD.pintuKadis = E.data.diDalam != null;
    if (E.data.diDalam == null && E.umur > (E.data.berikut || 3)) {
      E.data.diDalam = 0;
      E.data.masukPada = E.umur;
      q[0].goToXY(456, 146, 'up');
    }
    if (E.data.diDalam != null) {
      const t = E.umur - E.data.masukPada;
      const a = q[0];
      if (!a) return;
      a.alpha = t < 0.8 ? Math.max(0, 1 - t / 0.8) : (t > 4.8 ? Math.min(1, (t - 4.8) / 0.8) : 0);
      if (t > 5.6) {
        a.alpha = 1;
        const ditolak = Math.random() < 0.25;
        if (!ditolak) { spawn('ink', 452, 132); spawn('ink', 452, 132); a.say('acc, tinggal dicap'); }
        a.doingEvent = ditolak ? 'mapnya dikembalikan' : 'mencapkan berkas';
        a.goTo(ditolak ? 'read' : 'edit');
        lepaskanAktor(a);
        q.shift();
        q.forEach((o, i) => o.goToXY(470 - i * 12, 152, 'up'));   // antrean maju
        E.data.diDalam = null;
        E.data.berikut = E.umur + 3;
      }
    }
  },
},

{
  id: 'penilaian-skp',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 45,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 15 && S.orang.length >= 2,
  bentrokDengan: ['antre-tanda-tangan-kadis'],
  mulai(E) {
    const orang = pinjamAktor(E, 2);
    E.data.antre = orang;
    orang.forEach((a, i) => {
      a.doingEvent = 'menghadap penilaian SKP';
      a.goToXY(468 - i * 12, 152, 'up');
    });
  },
  tick(E) {
    const q = E.data.antre;
    if (!q || !q.length) return;
    MOD.pintuKadis = true;
    if (E.data.masuk == null && E.umur > (E.data.berikut || 4)) {
      E.data.masuk = E.umur;
      q[0].goToXY(456, 146, 'up');
    }
    if (E.data.masuk != null) {
      const t = E.umur - E.data.masuk, a = q[0];
      if (!a) return;
      a.alpha = t < 0.8 ? Math.max(0, 1 - t / 0.8) : (t > 9 ? Math.min(1, (t - 9) / 0.8) : 0);
      if (t > 9.9) {
        a.alpha = 1;
        // dua nasib berbeda; itu yang memberi ceritanya, bukan animasinya
        const baik = Math.random() < 0.55;
        a.bawa = baik ? 'map-hijau' : 'map-merah';
        a.say(baik ? 'nilainya baik, alhamdulillah' : 'uraian tugasnya disuruh dirapikan');
        if (baik) for (let i = 0; i < 3; i++) spawn('idea', a.x, a.y - 26);
        a.doingEvent = baik ? 'kembali ke meja' : 'merapikan uraian tugas';
        a.goTo(baik ? 'think' : 'read');
        if (!baik) { RUANGAN.laciBuka = 6; spawn('dust', 60, 130); }
        lepaskanAktor(a);
        q.shift();
        q.forEach((o, i) => o.goToXY(468 - i * 12, 152, 'up'));
        E.data.masuk = null;
        E.data.berikut = E.umur + 4;
      }
    }
  },
},

{
  id: 'nota-dinas-keliling',
  // durasi dilonggarkan dari 40: rutenya keliling SEMUA meja di MEJA_KERJA_X
  // (kini 6, bukan 4), dan dua meja baru (242, 308) menambah jarak tempuh.
  kelas: 'panggung', bobot: B.sedang, cooldown: 600, durasi: 52,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E) {
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (!a) return;
    a.doingEvent = 'mengedarkan nota dinas';
    a.bawa = 'map';
    E.data.i = 0;
    a.goToXY(MEJA_KERJA_X[0], 300, 'down');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    if (E.umur - E.data.tibaPada > 3) {
      const mejaX = MEJA_KERJA_X[E.data.i];
      // meja kosong dilewati tanpa berhenti — tidak ada yang diparaf di situ
      const tuan = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - mejaX) < 8);
      if (tuan) {
        hadapkan(tuan, a.x, a.y);
        tuan.busyUntil = Math.max(tuan.busyUntil, now + 1200);
        spawn('ink', mejaX, 300);
      }
      E.data.i++;
      E.data.tibaPada = null;
      if (E.data.i >= MEJA_KERJA_X.length) {
        if (!E.data.pulang) {
          E.data.pulang = true;
          a.doingEvent = 'menyimpan nota';
          a.goToXY(132, 152, 'up');
        } else if (a.bawa) {
          RUANGAN.tumpukanFiling = Math.min(6, RUANGAN.tumpukanFiling + 1);
          RUANGAN.laciBuka = 3;
          a.bawa = null;
        }
      } else {
        a.goToXY(MEJA_KERJA_X[E.data.i], 300, 'down');
      }
    }
    pada(E, 4, () => a.say('paraf dulu, Pak, nota dinasnya'));
  },
},

{
  id: 'laporan-bulanan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2100, durasi: 55,
  perluAktor: true,
  syarat: (S) => S.tanggal >= 25 || (S.jam >= 8 && S.jam < 10),
  mulai(E) {
    const orang = pinjamAktor(E, 3);
    E.data.antre = orang;
    orang.forEach((a, i) => {
      a.doingEvent = 'menyetor laporan bulanan';
      a.bawa = 'map';
      a.goToXY(110 + i * 16, 152, 'up');
    });
  },
  tick(E) {
    const q = E.data.antre;
    if (!q || !q.length) return;
    if (E.umur > (E.data.berikut || 5)) {
      const a = q.shift();
      if (a) {
        a.bawa = null;
        a.say('laporan bulanan, sudah lengkap');
        RUANGAN.laciBuka = 3;
        // tumpukan di ATAS kabinet: bekas yang masih terlihat lama sesudahnya
        RUANGAN.tumpukanFiling = Math.min(6, RUANGAN.tumpukanFiling + 1);
        spawn('dust', 138, 130); spawn('dust', 138, 130);
        lepaskanAktor(a);
      }
      E.data.berikut = E.umur + 6;
      q.forEach((o, i) => o.goToXY(110 + i * 16, 152, 'up'));
    }
  },
},

{
  id: 'surat-edaran-berparaf',
  kelas: 'panggung', bobot: B.sedang, cooldown: 1500, durasi: 28,
  perluAktor: true,
  mulai(E, S) {
    const a = pemeran(E, ['arsiparis', 'humas', 'magang']);
    if (!a) return;
    a.doingEvent = 'mengedarkan surat edaran';
    a.bawa = 'map';
    E.data.tujuan = S.orang.filter((o) => o !== a).slice(0, 3);
    E.data.i = 0;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    const t = E.data.tujuan[E.data.i];
    if (!t) {
      MOD.pintuKadis = true;
      pada(E, 24, () => { a.bawa = null; a.goToXY(452, 152, 'up'); });
      return;
    }
    if (!E.data.menuju) { E.data.menuju = true; a.goToXY(t.x + 14, t.y, 'left'); }
    if (a.diam) {
      if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
      // yang sedang bekerja tidak diganggu: pembawanya menunggu di sampingnya
      const tunda = t.state === 'work' ? 3 : 0;
      if (E.umur - E.data.tibaPada > 2.5 + tunda) {
        spawn('ink', t.x, t.y - 14); spawn('ink', t.x, t.y - 14);
        hadapkan(t, a.x, a.y);
        E.data.i++; E.data.menuju = false; E.data.tibaPada = null;
      }
    }
    pada(E, 3, () => a.say('paraf sebelah sini, Bu'));
  },
},

{
  id: 'berkas-kurang-lampiran',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 30,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'mencari lampiran';
    a.bawa = 'map';
    a.goToXY(286, 152, 'up');
    RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 4, () => a.say('kurang lampiran SPTJM, ambil dulu di arsip'));
    pada(E, 6, () => a.goToXY(54, 152, 'up'));
    pada(E, 14, () => {
      RUANGAN.laciBuka = 4;
      for (let i = 0; i < 3; i++) spawn('dust', 60, 130);
      a.bawa = 'kertas';
    });
    pada(E, 17, () => a.goToXY(286, 152, 'up'));
    pada(E, 26, () => {
      a.bawa = null;
      hentakkanStempel(a);
      RUANGAN.mapDisposisi = Math.max(0, RUANGAN.mapDisposisi - 2);
    });
  },
},

{
  id: 'stempel-tinta-kering',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 20,
  perluAktor: true,
  mulai(E) {
    RUANGAN.bantalanKering = true;
    const a = pemeranDekat(E, 286, 164, 400);
    if (a) { a.doingEvent = 'mengisi bantalan stempel'; a.goToXY(286, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 2, () => a.say('tintanya kering'));
    pada(E, 4, () => { a.doingEvent = 'ambil botol tinta'; a.goToXY(132, 152, 'up'); });
    pada(E, 10, () => { a.bawa = 'botol'; a.goToXY(286, 152, 'up'); });
    pada(E, 16, () => {
      for (let i = 0; i < 5; i++) spawn('ink', 278, 92);
      RUANGAN.bantalanKering = false;
      // noda di meja tidak pernah hilang; itu bekas yang jujur
      RUANGAN.nodaMeja.push({ x: 22 + ((Math.random() * 12) | 0), y: 24 });
      a.bawa = null;
    });
  },
  selesai() { RUANGAN.bantalanKering = false; },
},

/* Menempel pada kode yang sudah jalan: update() sudah tahu momen stempel
   menghantam meja. Ini cuma menambahkan tiupan supaya capnya cepat kering. */
{
  id: 'stempel-basah-berkilau',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 5,
  syarat: (S) => S.stasiunAktif.has('edit'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'edit' && o.state === 'work');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => {
      for (let i = 0; i < 5; i++) {
        const p = spawn('steam', a.x + 4, a.y - 20);
        if (p) { p.vx = 18; p.vy = -2; }        // ditiup mendatar, bukan naik
      }
    });
  },
},

{
  id: 'coret-coret-pulpen-macet',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 3,
  syarat: (S) => S.stasiunAktif.has('edit') && RUANGAN.coretKertas < 3,
  tick(E) {
    // tiga goresan: dua nyaris tak terlihat, yang ketiga baru pekat
    RUANGAN.coretKertas = Math.min(3, Math.floor(E.umur / 0.8) + 1);
    pada(E, 2.4, () => spawn('ink', 262, 104));
  },
},

{
  id: 'tamu-di-ruang-tunggu',
  kelas: 'panggung', bobot: B.sedang, cooldown: 600, durasi: 50,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 15,
  mulai(E) {
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'melayani tamu';
    E.data.tamu = { x: -14, y: 288, fase: 'masuk' };
    a.goToXY(288, 282, 'right');
  },
  tick(E, dt) {
    const T = E.data.tamu, a = E.aktor[0];
    if (!T || !a) return;
    if (T.fase === 'masuk') {
      T.x = Math.min(300, T.x + 46 * dt);
      if (T.x >= 300) T.fase = 'tunggu';
    } else if (T.fase === 'pulang') {
      T.x -= 46 * dt;
    } else if (T.fase === 'ikut') {
      T.x += (292 - T.x) * Math.min(1, dt * 1.6);
      T.y += (168 - T.y) * Math.min(1, dt * 1.6);
    }
    if (a.diam && T.fase === 'tunggu') {
      hadapkan(a, T.x, T.y);
      if (Math.random() < 0.05) spawn('talk', T.x, T.y - 26);
      if (Math.random() < 0.05) spawn('talk', a.x, a.y - 26);
      pada(E, 16, () => a.say('mau legalisir, Pak'));
      pada(E, 26, () => { T.fase = 'ikut'; a.goToXY(286, 152, 'up'); });
    }
    pada(E, 38, () => { for (let i = 0; i < 5; i++) spawn('ink', 292, 140); });
    pada(E, 42, () => { T.fase = 'pulang'; T.y = 288; });
  },
  gambarProp(E) {
    const T = E.data.tamu;
    if (!T || T.x < -12) return;
    gambarOrangLuar(T.x, T.y, '#6b4a2a', '#d9ab5e', 'map-biru');
  },
  sortY: 300,
},

{
  id: 'apar-diperiksa',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 26,
  perluAktor: true,
  syarat: (S) => S.jam >= 8 && S.jam < 10 && !RUANGAN.kartuAPAR,
  mulai(E) {
    const a = pemeran(E, ['auditor', 'sandiman', 'teknisi']);
    if (a) { a.doingEvent = 'memeriksa APAR'; a.goToXY(335, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    // diangkat, lalu diguncang pelan untuk mengecek isinya
    if (E.umur > 4 && E.umur < 14) RUANGAN.aparAngkat = 6 + (Math.sin(now / 60) > 0 ? 1 : 0);
    pada(E, 14, () => { RUANGAN.aparAngkat = 0; });
    pada(E, 16, () => { for (let i = 0; i < 5; i++) spawn('ink', 341, 108); });
    pada(E, 18, () => { RUANGAN.kartuAPAR = true; a.say('kedaluwarsa bulan depan, dicatat dulu'); });
    pada(E, 23, () => { a.pose = 'salam'; });      // hormat kecil ke APAR
  },
  selesai(E) { RUANGAN.aparAngkat = 0; if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'kalender-dinas-diganti',
  kelas: 'latar', bobot: B.langka, cooldown: 2700, durasi: 24,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'menyobek kalender'; a.goToXY(166, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    pada(E, 4, () => {
      RUANGAN.kalenderBulan++;
      RUANGAN.bulanKalenderTanggal = new Date().getDate();
      spawn('lembar', 164, 76);
    });
    pada(E, 8, () => { a.pose = null; a.say('tanggal merahnya cuma satu'); });
    pada(E, 10, () => {
      const b = pemeranDekat(E, 200, 300, 220);
      if (b) { b.doingEvent = 'ikut menghitung tanggal'; b.goToXY(180, 152, 'up'); }
    });
  },
  selesai(E) { for (const o of E.aktor) o.pose = null; },
},

/* Penghitung `baca` yang menghentikan perilaku setelah tiga orang adalah inti
   event ini: sesudah itu seisi kantor sudah tahu isinya, dan berhenti berhenti
   membaca. Satu integer, tapi perubahannya benar-benar terlihat. */
{
  id: 'pengumuman-padam-ditempel',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 30,
  perluAktor: true,
  mulai(E) {
    E.data.baca = 0;
    const a = pemeran(E, ['humas', 'arsiparis']);
    if (a) { a.doingEvent = 'menempel pengumuman'; a.goToXY(178, 152, 'up'); }
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (a && a.diam && !E.data.tempel) {
      a.pose = 'duaangkat';
      pada(E, 4, () => {
        E.data.tempel = true;
        a.pose = null;
        for (let i = 0; i < 4; i++) spawn('paper', 184, 60);
        a.say('rabu depan padam dari jam sembilan');
      });
    }
    if (E.data.tempel && E.data.baca < 3) {
      for (const o of S.orang) {
        if (o.eventKerja || o.path.length || o.y > 200) continue;
        if (Math.abs(o.x - 184) > 16) continue;
        if (o.bacaSampai && now < o.bacaSampai) continue;
        o.bacaSampai = now + 2000;
        hadapkan(o, 184, 60);
        o.busyUntil = Math.max(o.busyUntil, now + 2000);
        E.data.baca++;
        if (E.data.baca === 2) o.say('wah, rabu depan');
        break;
      }
    }
  },
  gambarDinding(E) {
    if (!E.data.tempel) return;
    const x = 178, y = 52;
    const goyang = Math.sin(now / 900) > 0.9 ? 1 : 0;   // kena angin kipas
    r(x + goyang, y, 12, 16, P.paper);
    r(x + 2 + goyang, y + 2, 8, 1, P.red);
    for (let i = 0; i < 4; i++) r(x + 2 + goyang, y + 5 + i * 2, 8 - (i % 2) * 2, 1, '#b9c0ca');
    r(x + 10 + goyang, y + 14, 2, 2, '#e4e0d2');        // sudut menggulung
  },
},

{
  id: 'rapat-daring',
  babak: { kerja: 1.5, istirahat: .3, apel: 0 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'panggung', bobot: B.sedang, cooldown: 1080, durasi: 55,
  perluAktor: true,
  syarat: (S) => S.jam >= 9 && S.jam < 15 && kursiKosong() >= 8,
  mulai(E) {
    pinjamAktor(E, 2).forEach((a) => {
      a.doingEvent = 'rapat daring provinsi';
      a.goTo('rapat');
    });
  },
  tick(E) {
    // yang lewat depan meja rapat memelankan langkah — menjaga suara
    MOD.senyapDari = 152; MOD.senyapSampai = 340;
    const beku = Math.sin(E.umur / 8 * Math.PI * 2) > 0.86;
    E.data.beku = beku;
    if (!beku && Math.random() < 0.02) spawn('ping', 246, 178);
    if (beku && !E.data.sempatBicara) {
      E.data.sempatBicara = true;
      const a = E.aktor[0];
      if (a) a.say(pilih(['suaranya putus-putus, Pak', 'mohon izin, jaringan kami kurang stabil']));
    }
    if (!beku) E.data.sempatBicara = false;
  },
  gambarProp(E) {
    const x = 240, y = 178;
    r(x, y, 12, 8, E.data.beku ? '#6a7078' : '#1c4e8a');
    r(x, y - 1, 12, 1, '#9aa1a6');
    if (!E.data.beku) {
      const k = Math.floor(now / 260) % 3;
      for (let i = 0; i < 3; i++) r(x + 2, y + 2 + i * 2, 3 + i * 2, 1, i === k ? '#ffffff' : '#7aa5e8');
    }
    r(x - 1, y + 8, 14, 2, '#b6bcc1');
  },
  sortY: 200,
},

/* Paling jujur di kelompok rapat: tidak memindahkan siapa pun. Dipicu justru
   saat sembilan kursi memang penuh oleh peserta nyata dari Task/Workflow. */
{
  id: 'rapat-pleno-kursi-penuh',
  kelas: 'latar', bobot: B.jarang, cooldown: 300, durasi: 12,
  syarat: () => kursiKosong() === 0,
  tick(E) {
    MOD.lampuMin = Math.max(MOD.lampuMin, 0.15);
    const giliran = Math.floor(E.umur / 1.2);          // searah jarum jam
    if (giliran !== E.data.g) {
      E.data.g = giliran;
      const duduk = [...penghuni()].filter((o) => o.station === 'rapat');
      const o = duduk[giliran % Math.max(1, duduk.length)];
      if (o) { spawn('talk', o.x, o.y - 26); spawn('talk', o.x, o.y - 26); }
    }
    pada(E, 10, () => {
      for (const o of penghuni()) {
        if (o.station !== 'rapat') continue;
        spawn('paper', o.x, o.y - 20); spawn('paper', o.x, o.y - 20);
      }
    });
  },
  gambarProp() {
    r(238, 196, 10, 4, P.paper);          // tumpukan berkas di tengah meja
    r(238, 196, 10, 1, '#d9d4c2');
    r(252, 198, 2, 2, Math.sin(now / 300) > 0 ? '#e8453f' : '#5c2222');   // LED mik
  },
  sortY: 205,
},

);

