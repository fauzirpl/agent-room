/* ==========================================================================
   GELOMBANG 2 — INSIDEN (17 event)
   ========================================================================== */

daftarEvent(

{
  id: 'bendera-terbelit-angin',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 40,
  perluAktor: true,
  mulai(E) {
    RUANGAN.benderaBelit = true;
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'membetulkan bendera';
    a.goToXY(146, LANE_DOWN, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam) {
      pada(E, 6, () => a.say('benderanya nyangkut'));
      pada(E, 8, () => { RUANGAN.benderaBelit = false; E.data.lepas = E.umur; });
    }
  },
},

{
  id: 'laci-arsip-macet',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 18,
  syarat: (S) => S.stasiunAktif.has('read') || S.stasiunAktif.has('search'),
  mulai(E, S) {
    // Salah prop di catatan aslinya: yang punya laci adalah drawFiling
    // (filing kabinet), bukan drawArsip (rak terbuka tanpa laci sama sekali).
    E.data.a = S.orang.find((o) => (o.station === 'read' || o.station === 'search') && o.state === 'work')
      || S.orang.find((o) => o.station === 'search');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { a.busyUntil = Math.max(a.busyUntil, now + 2500); a.say('macet lagi.'); });
    pada(E, 3, () => spawn('dust', 132, 128));
    pada(E, 5, () => {
      RUANGAN.laciBuka = 12;
      for (let i = 0; i < 10; i++) spawn('dust', 132, 128);
      spawn('paper', 132, 128); spawn('paper', 132, 128); spawn('paper', 132, 128);
    });
    pada(E, 6, () => { RUANGAN.laciCelah = 2; });
    pada(E, 6.5, () => {
      const tetangga = S.orang.find((o) => o !== a && jarakKe(o, 132, 152) < 70 && !o.eventKerja);
      if (tetangga) { hadapkan(tetangga, 132, 152); tetangga.say('hehe'); }
    });
  },
},

{
  id: 'pulpen-jatuh-menggelinding',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 3.5,
  syarat: () => kursiKosong() > 0,
  mulai(E, S) {
    const kandidat = S.orang.filter((o) => (o.station === 'think' || o.station === 'rapat') && o.diam);
    if (!kandidat.length) return;
    const a = pilih(kandidat);
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    const p = spawn('pulpen', a.x + 6, a.y - 20);
    if (p) p.dasar = a.station === 'rapat' ? 252 : 316;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 0.4, () => { a.pose = 'jongkok'; });
    pada(E, 1.5, () => { a.pose = null; a.goToXY(a.x + 8, a.y, a.face); });
    pada(E, 2.6, () => { a.goToXY(a.x - 8, a.y, a.face); });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'atap-bocor-musim-hujan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 120,
  syarat: () => CUACA.hujan > 0.6,
  perluAktor: true,
  mulai(E) {
    E.data.jeda = 0;
    const a = pemeran(E, ['arsiparis', 'magang']);
    if (a) { a.doingEvent = 'mengambil ember cadangan'; a.goToXY(440, 240, 'up'); }
  },
  tick(E, dt) {
    E.data.jeda -= dt;
    if (!E.data.emberSampai && E.data.jeda <= 0) {
      E.data.jeda = 2.6;
      const p = spawn('drip', 118, 12);
      if (p) { p.dasar = 252; p.onDrip = () => { if (RUANGAN.genanganAtap == null) RUANGAN.genanganAtap = 6; else RUANGAN.genanganAtap = Math.min(18, RUANGAN.genanganAtap + 1); }; }
    }
    const a = E.aktor[0];
    if (a && a.diam && !E.data.emberSampai) {
      pada(E, 1.5, () => { a.bawa = 'ember'; a.goToXY(118, 252, 'up'); });
      pada(E, 6, () => { E.data.emberSampai = true; a.bawa = null; a.say('ember, ember!'); RUANGAN.emberKedua = true; });
    }
  },
  gambarLantai() {
    if (!RUANGAN.genanganAtap || RUANGAN.emberKedua) return;
    ctx.globalAlpha = 0.2; ctx.fillStyle = '#8a9298';
    ctx.beginPath(); ctx.ellipse(118, 252, RUANGAN.genanganAtap, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  },
  gambarProp() { if (RUANGAN.emberKedua) { r(114, 246, 8, 6, '#4a7fd0'); r(114, 246, 8, 1, '#79b0e8'); } },
  sortY: 253,
  selesai(E) {
    RUANGAN.emberKedua = false; RUANGAN.genanganAtap = 0;
    if (E.aktor[0]) E.aktor[0].bawa = null;
  },
},

{
  id: 'berkas-tumpah',
  kelas: 'latar', bobot: B.jarang, cooldown: 1080, durasi: 12,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis']);
    if (!a) return;
    a.doingEvent = 'membereskan berkas roboh';
    a.goToXY(272, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    pada(E, 1, () => {
      RUANGAN.tumpukanStempel = 0;
      for (let i = 0; i < 10; i++) spawn('paper', 260, 90);
      for (let i = 0; i < 8; i++) spawn('dust', 260, 90);
      a.say('maaf, Pak');
    });
    if (a.diam) {
      pada(E, 3, () => { a.pose = 'jongkok'; });
      // satu lapis tersusun tiap 0,25 detik — pembalikan yang persis terbaca membereskan
      if (E.umur > 3 && RUANGAN.tumpukanStempel < 9 && Math.floor((E.umur - 3) / 0.25) > RUANGAN.tumpukanStempel) {
        RUANGAN.tumpukanStempel++;
      }
      pada(E, 5.5, () => { a.pose = null; });
    }
  },
  selesai(E) { RUANGAN.tumpukanStempel = 9; if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'bocor-baru-di-atas-arsip',
  kelas: 'latar', bobot: B.jarang, cooldown: 2700, durasi: 60,
  syarat: () => CUACA.hujan > 0.6,
  perluAktor: true,
  mulai(E) { E.data.jeda = 0; },
  tick(E, dt) {
    E.data.jeda -= dt;
    if (!E.data.beres && E.data.jeda <= 0) {
      E.data.jeda = 3;
      const p = spawn('drip', 96, 30);
      if (p) { p.dasar = 136; p.onDrip = () => { E.data.tetes = (E.data.tetes || 0) + 1; }; }
    }
    if (E.data.tetes >= 3 && !E.data.beres && !E.aktor.length) {
      const a = pemeran(E, ['arsiparis']);
      if (a) { a.doingEvent = 'menaruh ember di arsip'; a.goToXY(54, 152, 'up'); }
    }
    const a = E.aktor[0];
    if (a && a.diam && !E.data.beres) {
      E.data.beres = true;
      a.say('atapnya bocor lagi di sini');
      RUANGAN.emberArsip = true;
    }
  },
  gambarProp() { if (RUANGAN.emberArsip) { r(93, 130, 9, 7, '#4a7fd0'); r(93, 130, 9, 1, '#79b0e8'); } },
  sortY: 137,
  selesai() { RUANGAN.emberArsip = false; },
},

{
  id: 'bocor-baru-di-atas-rapat',
  kelas: 'latar', bobot: B.langka, cooldown: 2700, durasi: 90,
  syarat: () => CUACA.petir && kursiKosong() < KURSI_TOTAL,
  tick(E, dt) {
    E.data.jeda = (E.data.jeda || 0) - dt;
    if (!RUANGAN.emberRapat && E.data.jeda <= 0) {
      E.data.jeda = 3.4;
      const p = spawn('drip', 246, 20);
      if (p) {
        p.dasar = 186;
        p.onDrip = () => {
          E.data.tetes = (E.data.tetes || 0) + 1;
          RUANGAN.nodaKopi.push({ x: 240, y: 185, lebar: 3 });
        };
      }
    }
    // hitungan sendiri (E.data.tetes), BUKAN panjang RUANGAN.nodaKopi — array
    // itu dipakai bersama tumpahan-kopi-rapat, jadi noda kopi yang sudah ada
    // sebelum event ini mulai tidak boleh ikut terhitung sebagai tetesan hujan
    if (!E.data.diambil && (E.data.tetes || 0) >= 2) {
      E.data.diambil = true;
      const a = pemeranDekat(E, 250, 288, 220);
      if (a) { E.data.a = a; a.doingEvent = 'mengambil ember cadangan'; a.bawa = 'ember'; a.goToXY(246, 178, 'up'); }
    }
    if (E.data.a && E.data.a.diam && !RUANGAN.emberRapat) {
      RUANGAN.emberRapat = true;
      E.data.a.bawa = null;
      E.data.a.say('berkasnya digeser dulu, itu yang basah asli');
    }
  },
  gambarProp() { if (RUANGAN.emberRapat) { r(240, 180, 10, 7, '#4a7fd0'); r(240, 180, 10, 1, '#79b0e8'); } },
  sortY: 187,
  selesai() {
    RUANGAN.emberRapat = false;
    // noda yang sempat tercatat selama event ini tetap ada (dua elemen
    // terakhir yang baru saja ditambahkan) — sengaja tidak dibersihkan
  },
},

{
  id: 'dus-arsip-ambruk',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 38,
  perluAktor: true,
  /* Prasyarat "tumpukan >= 4" dari catatan aslinya butuh event dus-arsip-
     ditumpuk yang belum ada di gelombang mana pun — jadi dijadikan kejadian
     berdiri sendiri dengan cooldown panjangnya sendiri, bukan digantungkan
     ke penghitung yang tidak pernah terisi. */
  mulai(E) {
    const org = pinjamAktor(E, 2);
    org.forEach((a, i) => { a.doingEvent = 'memungut berkas tumpah'; a.goToXY(430 + i * 20, 300, 'down'); });
    for (let i = 0; i < 14; i++) spawn('paper', 436, 280);
    E.data.sisa = 8;
  },
  tick(E) {
    for (const a of E.aktor) {
      if (a.diam) {
        a.pose = 'jongkok';
        if (Math.floor(E.umur * 0.8) !== a._j && E.data.sisa > 0) {
          a._j = Math.floor(E.umur * 0.8);
          E.data.sisa--;
        }
      }
    }
    pada(E, 2, () => { const a = E.aktor[0]; if (a) a.say('sudah saya bilang jangan tinggi-tinggi.'); });
  },
  gambarProp(E) {
    // dus terguling selama belum beres; sesudahnya drawDus() bawaan sudah cukup
    if (E.data.sisa <= 0) return;
    r(410, 290, 20, 14, '#a37b4e');
    r(412, 292, 16, 10, '#b98d5e');
    for (let i = 0; i < Math.min(6, E.data.sisa); i++) r(400 + i * 11, 314, 3, 2, P.paper);
  },
  sortY: 305,
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

/* Berdiri sendiri, bukan dirantai — alasan yang sama dengan genset-nyala di
   berkas infrastruktur: peluang lanjutan() statis tidak bisa membaca jam. */
{
  id: 'genset-kehabisan-solar',
  kelas: 'panggung', bobot: B.langka, cooldown: 2400, durasi: 14,
  syarat: (S) => S.jam < 9 || S.jam >= 15.5,
  mulai(E, S) {
    const dua = S.orang.filter((o) => o.station === 'think' && bisaDipinjam(o)).slice(0, 2);
    for (const a of dua) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); a.goTo('idle'); }
    const pembawa = pemeran(E, ['teknisi']);
    E.data.pembawa = pembawa;
    if (pembawa) { pembawa.bawa = 'jerigen'; pembawa.doingEvent = 'mengambil solar'; pembawa.goToXY(430, 152, 'up'); }
  },
  tick(E) {
    MOD.lampu = E.umur < 1.5 ? Math.max(0.15, 1 - E.umur / 1.5) : (E.umur > 13 ? 1 : 0);
    MOD.upsSiaga = E.umur < 13 ? 1 : 0;
    const p = E.data.pembawa;
    if (p && p.diam) pada(E, 3, () => p.say('solarnya belum ditebus, Pak'));
  },
  selesai(E) { if (E.data.pembawa) E.data.pembawa.bawa = null; },
},

{
  id: 'kabel-utp-kesenggol',
  kelas: 'latar', bobot: B.sedang, cooldown: 240, durasi: 16,
  // Premis aslinya tidak didukung gambar: kabel menjuntai di y 50..74, jauh
  // di atas LANE_UP (y=164) — tidak ada agen yang lewat di situ. Dipicu dari
  // orang yang BEKERJA di rak server, bukan yang lewat di bawah kabel.
  syarat: (S) => S.stasiunAktif.has('server'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'server' && o.state === 'work');
  },
  tick(E) {
    MOD.lanPutus = !E.data.beres;
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => { a.busyUntil = Math.max(a.busyUntil, now + 2500); a.face = a.face === 'left' ? 'right' : 'left'; a.say('maaf, kesenggol… sudah saya colok lagi'); });
    pada(E, 2, () => { a.pose = 'jongkok'; });
    pada(E, 4, () => {
      E.data.beres = true; a.pose = null;
      for (let i = 0; i < 6; i++) spawn('data', 392, 132);
    });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'kursi-rapat-patah',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 26,
  syarat: () => kursiKosong() < KURSI_TOTAL - 1,
  mulai(E) {
    const bebas = [];
    for (let k = 0; k < KURSI_N; k++) if (!RUANGAN.kursiRusak.has(k)) bebas.push(k);
    if (!bebas.length) return;
    E.data.slot = pilih(bebas);
    RUANGAN.kursiRusak.add(E.data.slot);
    const korban = [...penghuni()].find((o) => o.station === 'rapat' && o.slotIdx === E.data.slot);
    if (korban) { korban.say('!'); korban.goTo('rapat'); }             // dipindah ulang lewat slotBebas()
  },
  tick(E) {
    if (E.data.slot == null) { E.selesaiCepat = true; return; }   // semua kursi jauh sudah rusak: batal
    pada(E, 6, () => {
      const a = pemeran(E, ['magang']);
      if (a) { a.doingEvent = 'mengganti kursi rusak'; a.bawa = 'kardus'; a.goToXY(RAPAT.cx + slotKe(E.data.slot), 190, 'up'); }
    });
  },
},

{
  id: 'rak-server-kepanasan',
  kelas: 'panggung', bobot: B.jarang, cooldown: 720, durasi: 60,
  // Rak juga panas kalau bebannya nyata: ≥3/4 agen nyata sedang bekerja
  // (S.sibukRatio) dan bukan cuma satu orang. `?? 0` buat potret lama/harness.
  syarat: (S) => S.orang.filter((o) => o.station === 'server').length >= 1
    || ((S.sibukRatio ?? 0) >= 0.75 && (S.sesi ?? 0) >= 2),
  mulai(E) {
    const a = pemeranDekat(E, 400, 268, 200);
    if (a) { a.doingEvent = 'mengarahkan kipas ke rak'; a.goToXY(400, 268, 'up'); }
  },
  tick(E) {
    MOD.rakPanas = E.umur < 40;
    if (Math.random() < 0.4) spawn('steam', 390, 30);
    const a = E.aktor[0];
    if (a && a.diam && !E.data.didorong) {
      pada(E, 3, () => a.say('kipasnya pinjam dulu buat rak'));
      pada(E, 5, () => { E.data.didorong = true; a.goToXY(400, 300, 'down'); });
    }
    if (E.data.didorong) MOD.kipasCx = 372;
  },
  selesai() { },
},

{
  id: 'rebutan-stempel',
  kelas: 'panggung', bobot: B.jarang, cooldown: 600, durasi: 13,
  // Stempel cuma diperebutkan kalau memang laris: begitu ada sesi nyata,
  // porsi Edit/Write (S.rasioEdit) harus ≥ 1/5 dari seluruh tool call.
  // Ruangan tanpa sesi (standby saja) tetap seperti dulu. `?? 0` buat harness.
  syarat: (S) => S.orang.filter((o) => o.station !== 'rapat' && bisaDipinjam(o)).length >= 2
    && (!(S.sesi ?? 0) || (S.rasioEdit ?? 0) >= 0.2),
  mulai(E, S) {
    const dua = S.orang.filter((o) => o.station !== 'rapat' && bisaDipinjam(o)).slice(0, 2);
    for (const a of dua) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); }
    const [a, b] = dua;
    if (a) a.goToXY(272, 152, 'right');
    if (b) b.goToXY(300, 152, 'left');
  },
  tick(E) {
    const [a, b] = E.aktor;
    if (!a || !b) return;
    if (a.diam && b.diam) { hadapkan(a, b.x, b.y); hadapkan(b, a.x, a.y); }
    if (Math.random() < 0.1) spawn('ink', (a.x + b.x) / 2, 140);
    pada(E, 7, () => {
      // yang berjabatan lebih rendah mengalah — urutan JABATAN sebagai proksi
      const urut = ['kadis', 'sekdis', 'kabid', 'kasi', 'analis_sistem', 'pranata_madya',
        'pranata_muda', 'pranata_pertama', 'sandiman', 'auditor', 'statistisi',
        'arsiparis', 'humas', 'analis_kebijakan', 'teknisi', 'magang'];
      const ia = urut.indexOf(a.peran), ib = urut.indexOf(b.peran);
      const kalah = ia < ib ? b : a, menang = kalah === a ? b : a;
      kalah.say('biar Pak Kadis saja yang putuskan');
      kalah.doingEvent = 'menghadap kadis'; kalah.goToXY(452, 152, 'up');
      hentakkanStempel(menang);
      menang.doingEvent = 'kembali ke meja'; menang.goTo('think');
    });
  },
},

{
  id: 'tumpahan-kopi-rapat',
  kelas: 'latar', bobot: B.jarang, cooldown: 960, durasi: 18,
  syarat: () => kursiKosong() <= KURSI_TOTAL - 2,
  mulai(E) {
    RUANGAN.gelasGuling = pilih([190, 226, 266, 302]);
    for (let i = 0; i < 4; i++) spawn('ink', RUANGAN.gelasGuling, 210, '#6b4a2a');
    const duduk = [...penghuni()].filter((o) => o.station === 'rapat');
    menoleh(duduk, RUANGAN.gelasGuling, 210, 1500);
    const a = duduk.find((o) => bisaDipinjam(o));
    E.data.a = a;
  },
  tick(E) {
    pada(E, 8, () => {
      const a = E.data.a;
      if (!a) return;
      a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
      a.doingEvent = 'mengelap tumpahan';
      a.bawa = 'lap';
      a.goToXY(RUANGAN.gelasGuling, 200, 'up');
    });
    if (E.aktor[0] && E.aktor[0].diam) {
      pada(E, 12, () => { E.aktor[0].pose = 'kipas'; });
    }
    pada(E, 17, () => {
      RUANGAN.nodaKopi.push({ x: RUANGAN.gelasGuling - 4, y: 209, lebar: 8 });
      RUANGAN.gelasGuling = null;
      if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].bawa = null; }
    });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'ups-ngebul',
  kelas: 'panggung', bobot: B.langka, cooldown: 1500, durasi: 16,
  mulai(E) {
    const a = pemeranDekat(E, 390, 164, 220);
    if (a) { a.doingEvent = 'mengecek APAR'; a.goToXY(335, 152, 'up'); }
  },
  tick(E, dt, S) {
    if (!E.data.aman) {
      MOD.upsSiaga = 1;
      if (Math.random() < 0.6) spawn('asap', 390, 118);
      glow(390, 100, 18, '#e8453f', 0.12);
      // yang di dekat rak mundur dan menutup hidung
      for (const o of S.orang) {
        if (o.eventKerja || jarakKe(o, 390, 130) > 70 || o.path.length) continue;
        o.pose = 'hidung';
      }
    }
    const a = E.aktor[0];
    if (a && a.diam && !E.data.aman) {
      pada(E, 4, () => a.say('jangan dicolok dulu ya'));
      pada(E, 6, () => {
        RUANGAN.aparDiangkat = true;
        a.bawa = 'apar';
        a.goToXY(390, 152, 'up');
      });
      pada(E, 9, () => { E.data.aman = true; for (const o of S.orang) if (o.pose === 'hidung') o.pose = null; });
      pada(E, 12, () => { a.bawa = null; a.goToXY(335, 152, 'up'); });
      pada(E, 15, () => { RUANGAN.aparDiangkat = false; });
    }
  },
  selesai(E, S) {
    RUANGAN.aparDiangkat = false;
    if (E.aktor[0]) E.aktor[0].bawa = null;
    for (const o of S.orang) if (o.pose === 'hidung') o.pose = null;
  },
},

{
  id: 'xbanner-roboh',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 20,
  mulai(E, S) {
    const dekat = S.orang.filter((o) => bisaDipinjam(o) && jarakKe(o, 30, 214) < 160).slice(0, 2);
    for (const a of dekat) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); }
    E.data.sendiri = E.aktor.length < 2;
    E.aktor.forEach((a, i) => a.goToXY(i === 0 ? 40 : 40, i === 0 ? 216 : 240, 'left'));
  },
  tick(E, dt) {
    const jatuh = E.data.sendiri ? [0, 6, 8, 14] : [0, 5];
    const t = E.umur;
    if (!E.data.roboh) {
      RUANGAN.xbanner.sudut = Math.min(1, t / 3);
      if (t >= 3 && !E.data.debu) { E.data.debu = true; for (let i = 0; i < 6; i++) spawn('dust', 30, 236); }
      if (t >= 3) E.data.roboh = true;
    } else if (!E.data.bangun) {
      const mulaiBangun = E.data.sendiri ? 8 : 5;
      if (E.aktor.every((a) => a.diam) && t > mulaiBangun) {
        if (E.data.sendiri && !E.data.gagalDulu) {
          // sendirian: sempat gagal sekali, banner naik separuh lalu jatuh lagi
          E.data.gagalDulu = true;
          RUANGAN.xbanner.sudut = 0.5;
          pada(E, mulaiBangun + 2, () => { RUANGAN.xbanner.sudut = 1; });
        } else {
          E.data.bangun = true;
          E.data.bangunPada = t;
        }
      }
    } else {
      const p = Math.min(1, (t - E.data.bangunPada) / 2);
      RUANGAN.xbanner.sudut = 1 - p;
      if (p >= 1) RUANGAN.xbanner.lipat = true;
    }
    pada(E, E.data.sendiri ? 9 : 6, () => { const a = E.aktor[0]; if (a) a.say('angin kipas, Bu.'); });
  },
  selesai() { RUANGAN.xbanner.sudut = 0; },
},

);

daftarEvent(

/* Lanjutan dari cicak-di-dinding (gelombang 1) — bukan dari 'cicak-berburu-
   di-neon' yang disebut catatan aslinya (event itu tidak pernah dibuat).
   Dipicu lewat lanjutan(), jadi hanya jalan kalau cicak dasarnya baru saja ada. */
{
  id: 'cicak-jatuh-ke-berkas',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 12,
  syarat: (S) => S.stasiunAktif.has('edit'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'edit' && o.state === 'work');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 0.3, () => {
      for (let i = 0; i < 3; i++) spawn('paper', 262, 60);
      a.busyUntil = Math.max(a.busyUntil, now + 4000);
      a.goToXY(a.x, a.y + 6, a.face);
      a.say('astaghfirullah!');
      E.data.miring = true;
    });
    pada(E, 4, () => { a.goTo('edit'); });
  },
  gambarProp(E) {
    // lari zig-zag ke kanan lalu masuk ke celah rak surat dan hilang
    if (E.umur > 3) return;
    const x = 262 + Math.round(E.umur * 7), y = 62 + Math.round(Math.sin(E.umur * 14) * 2);
    r(x, y, 5, 2, '#8a8070');
    r(x + 5, y - 1, 2, 2, '#8a8070');
  },
  gambarDinding(E) {
    if (!E.data.miring) return;
    // tumpukan berkas digambar miring 1 px sampai akhir event — tanda berantakan
    r(255, 51, 14, 1, sh('#e4ddc8', 0.7));
  },
  sortY: 90,
  selesai(E) {},
},

);

