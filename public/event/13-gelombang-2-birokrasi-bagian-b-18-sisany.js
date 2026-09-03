/* ==========================================================================
   GELOMBANG 2 — BIROKRASI, bagian B (18 sisanya)
   ========================================================================== */

daftarEvent(

{
  id: 'inspektorat-mendadak',
  kelas: 'panggung', bobot: B.jarang, cooldown: 420, durasi: 16,
  // RUANGAN.gagalBeruntun = tiga kegagalan se-ruangan dalam 60 detik;
  // S.gagalBeruntun = satu agen gagal tiga kali BERTURUT-TURUT tanpa jeda
  // waktu. Yang kedua justru lebih layak diinspeksi: itu orang yang mengulang
  // kesalahan yang sama. `?? 0` buat potret yang belum membawanya.
  syarat: (S) => RUANGAN.gagalBeruntun.length >= 3 || (S.gagalBeruntun ?? 0) >= 3,
  mulai(E, S) {
    const target = S.orang.find((o) => (o.gagalBerturut || 0) >= 3 && !o.standby)
      || S.orang.find((o) => o.gagal > 0 && !o.standby) || S.orang.find((o) => !o.standby);
    E.data.target = target;
    RUANGAN.inspeksiLog.push(Date.now());
    if (RUANGAN.inspeksiLog.length > 20) RUANGAN.inspeksiLog.shift();
    const auditor = pemeran(E, ['auditor']);
    if (auditor && target) { auditor.doingEvent = 'inspeksi mendadak'; auditor.goToXY(target.x - 12, target.y, 'right'); }
    else if (auditor) { auditor.doingEvent = 'inspeksi mendadak'; auditor.goToXY(452, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0], target = E.data.target;
    if (!a) return;
    if (target) hadapkan(a, target.x, target.y);
    if (Math.floor(E.umur / 2) !== E.data.p) { E.data.p = Math.floor(E.umur / 2); spawn('paper', a.x, a.y - 20); }
    pada(E, 1, () => a.say('boleh lihat catatannya?'));
    pada(E, 3, () => { if (target) target.say('siap, sebentar'); });
    pada(E, 16 - 4, () => { a.doingEvent = 'melapor ke kadis'; a.goToXY(452, 152, 'up'); });
  },
},

{
  id: 'kadis-sidak-keliling',
  kelas: 'panggung', bobot: B.jarang, cooldown: 2700, durasi: 24,
  syarat: (S) => S.orang.length >= 3,
  mulai() { MOD.pintuKadis = true; },
  tick() {
    MOD.pintuKadis = true;
    MOD.sidak = true;   // drawMejaKerja membaca ini: semua laptop terang penuh
  },
  // MOD direset SETIAP frame oleh resetMod(), jadi selesai() tidak perlu
  // membersihkannya — dan justru TIDAK BOLEH: pintuKadis dipakai bersama
  // sebelas event lain, dan menulis false di sini membanting pintu yang
  // sedang ditahan terbuka event lain di frame yang sama. Konvensi di
  // seluruh katalog: pintuKadis hanya pernah ditulis TRUE.
  selesai() { MOD.sidak = false; },
},

{
  id: 'lapor-diri-pegawai-baru',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 9,
  mulai(E) {
    const a = antrianLaporDiri.shift();
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    a.doingEvent = 'lapor diri, mulai tugas';
    a.goToXY(452, 152, 'up');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a) return;
    // tugas selalu menang atas seremonial: kalau tool call sungguhan sudah
    // masuk untuk sesi ini, dia bukan lagi eventKerja milik event ini —
    // lepasDariEvent() di handle() sudah membereskannya, cukup deteksi di sini
    if (!a.eventKerja) { E.selesaiCepat = true; return; }
    if (a.diam) {
      pada(E, 2, () => { a.say('lapor, mulai tugas hari ini'); for (let i = 0; i < 3; i++) spawn('paper', a.x, a.y - 20); });
      pada(E, 0.5, () => menoleh(S.orang.filter((o) => o !== a && o.station === 'think'), a.x, a.y, 1500));
    }
  },
},

{
  id: 'lemari-arsip-kepenuhan',
  kelas: 'latar', bobot: B.sedang, cooldown: 1500, durasi: 20,
  syarat: () => !RUANGAN.arsipPenuh,
  mulai(E) {
    RUANGAN.arsipPenuh = true;
    RUANGAN.dusTambahanArsip = 2;
    const a = pemeranDekat(E, 54, 152, 220);
    if (a) { a.doingEvent = 'mendorong lemari arsip'; a.goToXY(54, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (a && a.diam) {
      a.pose = 'kipas';
      pada(E, 3, () => { a.pose = null; a.say('sudah tidak muat, Pak'); });
      pada(E, 3.5, () => { hadapkan(a, 54, 30); });
      pada(E, 7.5, () => { a.goTo('think'); });
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'menunggu-paraf',
  kelas: 'latar', bobot: B.sedang, cooldown: 540, durasi: 20,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menunggu paraf kadis';
    a.bawa = 'map';
    a.goToXY(452, 152, 'up');
  },
  tick(E) {
    MOD.jamOffset = Math.min(0.13, E.umur / 20 * 0.13);   // ~8 menit maju selama event
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    for (let i = 0; i < 3; i++) pada(E, 1 + i * 3.5, () => { a.pose = 'angkat'; });
    for (let i = 0; i < 3; i++) pada(E, 1.3 + i * 3.5, () => { a.pose = null; });
    pada(E, 16, () => {
      a.pose = null; a.bawa = null;
      RUANGAN.propLantai.push({ x: 444, y: 148, jenis: 'map-menunggu' });
      a.say('saya tinggal di meja Bapak ya');
      a.goTo('think');
    });
  },
  selesai(E) {
    if (E.aktor[0]) { E.aktor[0].pose = null; E.aktor[0].bawa = null; }
  },
},

{
  id: 'nomor-antrean-loket',
  kelas: 'latar', bobot: B.sering, cooldown: 360, durasi: 8,
  syarat: (S) => S.jam >= 8 && S.jam < 15 && S.orang.some((o) => o.station === 'idle'),
  tick(E) {
    pada(E, 0.3, () => {
      RUANGAN.antre = (RUANGAN.antre % 99) + 1;
      spawn('ping', 218, 34);
    });
    pada(E, 1.5, () => {
      const tamu = [...penghuni()].find((o) => o.station === 'idle');
      if (tamu) { tamu.doingEvent = 'dipanggil ke loket'; tamu.goTo('edit'); }
    });
  },
},

{
  id: 'pemadatan-arsip',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 12,
  syarat: () => RUANGAN.arsipPenuh,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['arsiparis']);
    if (!a) return;
    a.doingEvent = 'memadatkan arsip';
    a.goToXY(30, 200, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.umur > 5 && E.umur < 9 && Math.random() < 0.4) spawn('paper', 30, 195);
    pada(E, 9.5, () => {
      RUANGAN.arsipPenuh = false; RUANGAN.dusTambahanArsip = 0;
      a.say('muat lagi sekarang'); a.goTo('think');
    });
  },
},

{
  id: 'pengarahan-kadis',
  babak: { kerja: 1.5, apel: 0, istirahat: .3, lembur: .2, malam: 0, libur: .2 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'panggung', bobot: B.sedang, cooldown: 360, durasi: 22,
  syarat: (S) => S.orang.filter((o) => o.x > 240).length >= 2,
  bentrokDengan: ['rapat-pimpinan-dadakan'],
  mulai(E, S) {
    const titik = [[430, 158], [446, 166], [462, 158]];
    const org = pinjamAktor(E, 3, (o) => o.x > 240);
    org.forEach((a, i) => a.goToXY(titik[i][0], titik[i][1], 'left'));
    MOD.pintuKadis = true;
  },
  tick(E) {
    MOD.pintuKadis = true;
    if (Math.random() < 0.35) spawn('talk', 452, 126);
    pada(E, 3, () => { const a = E.aktor[0]; if (a) a.say('nanti tolong dikawal sampai selesai, ya'); });
    pada(E, 20, () => {
      for (const a of E.aktor) a.goTo(a.station === 'idle' ? 'think' : a.station);
      const c = E.aktor[0]; if (c) c.goTo('edit');
    });
  },
  // MOD direset SETIAP frame oleh resetMod(), jadi selesai() tidak perlu
  // membersihkannya — dan justru TIDAK BOLEH: pintuKadis dipakai bersama
  // sebelas event lain, dan menulis false di sini membanting pintu yang
  // sedang ditahan terbuka event lain di frame yang sama. Konvensi di
  // seluruh katalog: pintuKadis hanya pernah ditulis TRUE.
  // (selesai() jadi kosong, jadi dihapus sekalian.)
},

{
  id: 'pengumuman-lewat-toa',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 12,
  syarat: (S) => S.kerjaJam,
  mulai(E, S) {
    menoleh(S.orang.filter((o) => o.path.length), 196, 24, 2000);
  },
  tick(E) {
    if (Math.random() < 0.4) spawn('ping', 200, 26);
    pada(E, 6, () => {
      const a = pemeran(E, ['humas']);
      if (a) { a.doingEvent = 'dipanggil ke rapat'; a.goTo('rapat'); a.say('diberitahukan kepada seluruh pegawai...'); }
    });
  },
  gambarDinding(E) {
    if (E.umur > 1.5) return;
    const p = E.umur / 1.5;
    ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 1; ctx.globalAlpha = 1 - p;
    for (const r2 of [4, 8, 12]) { ctx.beginPath(); ctx.arc(206, 27, r2 * p, -0.6, 0.6); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  gambarProp() { r(196, 20, 10, 6, '#8b9098'); r(196, 20, 10, 1, '#aeb4ba'); },
  sortY: 26,
},

{
  id: 'plang-nama-ruangan',
  kelas: 'panggung', bobot: B.langka, cooldown: 999999, durasi: 32,
  syarat: () => !RUANGAN.plangBaru,
  mulai(E) {
    const dua = pinjamAktor(E, 2);
    dua.forEach((a, i) => a.goToXY(452 + (i ? 6 : -6), i ? 158 : 152, 'up'));
  },
  tick(E) {
    const [pemasang, pengarah] = E.aktor;
    if (pemasang && pemasang.diam) pemasang.pose = 'duaangkat';
    if (pengarah && pengarah.diam) { pengarah.pose = 'nunjuk'; pada(E, 6, () => pengarah.say('kirinya turun sedikit.')); }
    pada(E, 14, () => { RUANGAN.plangBaru = true; });
    pada(E, 26, () => { for (const a of E.aktor) a.pose = null; });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'rapat-evaluasi-dadakan',
  kelas: 'panggung', bobot: B.langka, cooldown: 1200, durasi: 40,
  syarat: () => {
    const batas = Date.now() - 600000;
    return RUANGAN.inspeksiLog.filter((t) => t > batas).length >= 2 && kursiKosong() >= 4;
  },
  bentrokDengan: ['audit-bpk', 'rapat-pimpinan-dadakan'],
  mulai(E, S) {
    const gagalDulu = S.orang.filter((o) => o.gagal > 0);
    const isi = gagalDulu.length >= 4 ? gagalDulu.slice(0, 4) : gagalDulu.concat(S.orang.filter((o) => o.standby)).slice(0, 4);
    const org = pinjamAktor(E, 4, (o) => isi.includes(o));
    if (org.length < 4) pinjamAktor(E, 4 - org.length).forEach((a) => org.push(a));
    for (const a of E.aktor) a.goTo('rapat');
  },
  tick(E) {
    if (Math.floor(E.umur / 1.5) !== E.data.g) {
      E.data.g = Math.floor(E.umur / 1.5);
      const a = E.aktor[E.data.g % Math.max(1, E.aktor.length)];
      if (a) spawn('talk', a.x, a.y - 26);
    }
    pada(E, 4, () => { const a = E.aktor[0]; if (a) a.say('kita bahas kendalanya'); });
  },
  selesai(E) {
    for (const a of E.aktor) if (!a.standby) a.gagal = 0;
    RUANGAN.inspeksiLog.length = 0;
  },
},

{
  id: 'rapat-pimpinan-dadakan',
  babak: { kerja: 1.5, istirahat: .3, apel: 0, pulang: .5, lembur: .3, malam: 0, libur: .2 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'panggung', bobot: B.sedang, cooldown: 480, durasi: 50,
  syarat: (S) => S.orang.filter((o) => o.standby || o.station === 'idle').length >= 3,
  mulai(E, S) {
    const org = pinjamAktor(E, 5, (o) => o.standby || o.station === 'idle');
    org.forEach((a) => { a.doingEvent = 'rapat pimpinan dadakan'; a.goTo('rapat'); });
    MOD.pintuKadis = true;
  },
  tick(E, dt, S) {
    MOD.pintuKadis = true;
    if (Math.floor(E.umur / 0.9) !== E.data.g) {
      E.data.g = Math.floor(E.umur / 0.9);
      const a = E.aktor[E.data.g % Math.max(1, E.aktor.length)];
      if (a) spawn('talk', a.x, a.y - 26);
    }
    pada(E, 1, () => { const a = E.aktor[0]; if (a) a.say('dipanggil rapat, tinggal dulu berkasnya'); });
    for (const o of S.orang) {
      if (E.aktor.includes(o) || o.eventKerja) continue;
      if (jarakKe(o, 246, 200) < 90 && !o.path.length) hadapkan(o, 246, 200);
    }
  },
  gambarDinding(E) {
    if (E.umur > 45) return;
    r(96, 40, Math.min(30, E.umur), 1, '#3565b0');
  },
  // MOD direset SETIAP frame oleh resetMod(), jadi selesai() tidak perlu
  // membersihkannya — dan justru TIDAK BOLEH: pintuKadis dipakai bersama
  // sebelas event lain, dan menulis false di sini membanting pintu yang
  // sedang ditahan terbuka event lain di frame yang sama. Konvensi di
  // seluruh katalog: pintuKadis hanya pernah ditulis TRUE.
  // (selesai() jadi kosong, jadi dihapus sekalian.)
},

{
  id: 'sandiman-razia-sandi',
  // durasi dilonggarkan dari 30 — alasan sama seperti nota-dinas-keliling:
  // keliling semua meja di MEJA_KERJA_X, sekarang 6 meja bukan 4.
  kelas: 'panggung', bobot: B.jarang, cooldown: 900, durasi: 42,
  syarat: (S) => S.orang.some((o) => o.peran === 'sandiman') && kursiKosong() > 0,
  mulai(E, S) {
    const sandiman = S.orang.find((o) => o.peran === 'sandiman' && bisaDipinjam(o));
    if (!sandiman) return;
    sandiman.eventKerja = E; sandiman.betahAsli = sandiman.betah; sandiman.betah = true; E.aktor.push(sandiman);
    sandiman.doingEvent = 'razia kata sandi';
    E.data.i = 0;
    sandiman.goToXY(MEJA_KERJA_X[0], 300, 'down');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    const target = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - MEJA_KERJA_X[E.data.i]) < 8);
    if (target) MOD.slotTerkunci = E.data.i;
    if (target) { target.busyUntil = Math.max(target.busyUntil, now + 4000); hadapkan(target, a.x, a.y); }
    if (E.umur - E.data.tibaPada > 4) {
      if (target) {
        MOD.slotTerkunci = -1;
        for (let k = 0; k < 4; k++) spawn('glyph', target.x, target.y - 20);
        target.say('...tadi sudah, Pak');
      }
      a.say('sandi wajib diganti bulan ini');
      E.data.i++;
      E.data.tibaPada = null;
      if (E.data.i >= MEJA_KERJA_X.length) { E.selesaiCepat = true; }
      else a.goToXY(MEJA_KERJA_X[E.data.i], 300, 'down');
    }
    if (Math.random() < 0.15) spawn('scan', a.x, a.y - 24);
  },
  selesai() { MOD.slotTerkunci = -1; },
},

{
  id: 'sppd-turun',
  kelas: 'latar', bobot: B.jarang, cooldown: 1500, durasi: 90,
  syarat: (S) => S.standby > 0,
  mulai(E, S) {
    const bendahara = pemeran(E, ['sekdis', 'kabid']);
    const sasaran = S.orang.find((o) => o.standby && bisaDipinjam(o) && o !== bendahara);
    E.data.sasaran = sasaran;
    if (bendahara && sasaran) { bendahara.doingEvent = 'menyerahkan SPPD'; bendahara.bawa = 'amplop-coklat'; bendahara.goToXY(sasaran.x + 12, sasaran.y, 'left'); }
    else E.selesaiCepat = true;
  },
  tick(E, dt, S) {
    const b = E.aktor[0], s = E.data.sasaran;
    if (!s) return;
    if (b && b.diam && !E.data.diberikan) {
      pada(E, 1, () => {
        E.data.diberikan = true;
        s.say('berangkat dulu, titip mejanya');
        b.bawa = null; b.doingEvent = 'kembali ke meja'; b.goTo('think');
        s.doingEvent = 'berangkat dinas luar';
        s.goToXY(-20, s.y, 'left');
        MOD.mejaPadam = s.station === 'think' ? s.slotIdx : -1;
      });
    }
    if (E.data.diberikan && !E.data.kembaliDijadwal) {
      E.data.kembaliDijadwal = true;
      E.data.kembaliPada = E.umur + acak(40, 70);
    }
    if (E.data.kembaliDijadwal && E.umur > E.data.kembaliPada && !E.data.kembali) {
      E.data.kembali = true;
      s.x = -20; s.y = LANE_DOWN; s.alpha = 1;
      s.bawa = 'koper';
      s.say('sudah balik, ini SPJ-nya');
      s.goTo('think');
      spawn('paper', s.x, 300);
      E.data.koperPada = E.umur + 3;      // pada(E, E.umur + 3, ..) tidak pernah jalan
    }
    if (E.data.koperPada && E.umur > E.data.koperPada && s.bawa) s.bawa = null;
  },
  selesai(E) {
    if (E.data.sasaran) E.data.sasaran.bawa = null;
    if (E.aktor[0]) E.aktor[0].bawa = null;
  },
},

{
  id: 'statistisi-keliling-tagih-data',
  // durasi dilonggarkan dari 24 — alasan sama: 6 meja sekarang, bukan 4.
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 34,
  syarat: (S) => S.orang.some((o) => o.peran === 'statistisi') && S.orang.filter((o) => o.station === 'think').length >= 2,
  mulai(E, S) {
    const statistisi = S.orang.find((o) => o.peran === 'statistisi' && bisaDipinjam(o));
    if (!statistisi) return;
    statistisi.eventKerja = E; statistisi.betahAsli = statistisi.betah; statistisi.betah = true; E.aktor.push(statistisi);
    E.data.i = 0;
    statistisi.doingEvent = 'menagih rekap angka';
    statistisi.goToXY(MEJA_KERJA_X[0], 300, 'down');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    const target = S.orang.find((o) => o.station === 'think' && Math.abs(o.x - MEJA_KERJA_X[E.data.i]) < 8);
    if (target && Math.random() < 0.2) spawn('data', target.x, target.y - 24);
    if (E.umur - E.data.tibaPada > 3) {
      if (target) { const siap = Math.random() < 0.6; target.say(siap ? undefined : 'besok pagi ya'); if (!siap) target.face = target.face === 'left' ? 'right' : 'left'; }
      E.data.i++; E.data.tibaPada = null;
      if (E.data.i >= MEJA_KERJA_X.length) { a.goTo('rapat'); E.data.grafik = true; E.data.grafikPada = E.umur; }
      else a.goToXY(MEJA_KERJA_X[E.data.i], 300, 'down');
    }
  },
  gambarAtas(E) {
    if (!E.data.grafik || !E.aktor[0]) return;
    const a = E.aktor[0], t = E.umur - E.data.grafikPada;
    if (t > 5) return;
    const tinggi = [2, 4, 3];
    ctx.globalAlpha = Math.max(0, 1 - t / 5);
    tinggi.forEach((h, i) => { if (t > i * 0.4) r(a.x - 4 + i * 4, a.y - 30 - h * 2, 2, h * 2, P.teal); });
    ctx.globalAlpha = 1;
  },
},

{
  id: 'stiker-inventaris',
  kelas: 'latar', bobot: B.jarang, cooldown: 2100, durasi: 60,
  syarat: () => RUANGAN.stikerTertempel.size < 7,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menempel stiker inventaris';
    a.bawa = 'kertas';
    E.data.urut = Object.keys(STIKER_TITIK).filter((n) => !RUANGAN.stikerTertempel.has(n));
    E.data.i = 0;
    const t0 = STIKER_TITIK[E.data.urut[0]];
    if (t0) a.goToXY(t0[0], 152, 'up'); else E.selesaiCepat = true;
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    if (E.data.tibaPada == null) E.data.tibaPada = E.umur;
    if (E.umur - E.data.tibaPada > 4) {
      RUANGAN.stikerTertempel.add(E.data.urut[E.data.i]);
      E.data.i++; E.data.tibaPada = null;
      if (E.data.i >= E.data.urut.length) { E.selesaiCepat = true; return; }
      const t = STIKER_TITIK[E.data.urut[E.data.i]];
      a.goToXY(t[0], 152, 'up');
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

{
  id: 'stok-kertas-habis',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 24,
  syarat: () => RUANGAN.kertasPrinter <= 0,
  perluAktor: true,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 260);
    if (a) { a.doingEvent = 'mengambil kertas printer'; a.say('kertasnya habis.'); a.goToXY(54, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 4, () => { spawn('dust', 60, 130); spawn('dust', 60, 130); spawn('dust', 60, 130); a.bawa = 'kertas'; a.goTo('web'); });
    pada(E, 8, () => { RUANGAN.kertasPrinter = 20; a.bawa = null; });
  },
  selesai(E) { RUANGAN.kertasPrinter = 20; if (E.aktor[0]) E.aktor[0].bawa = null; },
},

{
  id: 'tamu-dinas-kabupaten',
  kelas: 'panggung', bobot: B.jarang, cooldown: 1500, durasi: 60,
  syarat: (S) => S.jam >= 8 && S.jam < 15 && kursiKosong() >= 3,
  mulai(E, S) {
    const p = new Peserta('Tamu Kabupaten', 'kunjungan');
    p.setPeran('analis_kebijakan');
    p.pal = { ...p.pal, main: '#6b4a2a', pattern: '#d9ab5e' };
    peserta.push(p);
    p.masuk();
    E.data.tamu = p;
    const humas = pemeran(E, ['humas']);
    E.data.humas = humas;
    if (humas) { humas.doingEvent = 'menjamu tamu kabupaten'; humas.goTo('rapat'); }
  },
  tick(E) {
    pada(E, 1, () => { const h = E.data.humas; if (masihMain(E, h)) h.say('silakan, Pak, dari Kabupaten sebelah ya'); });
    if (Math.random() < 0.03) spawn('steam', 214, 210);
    if (Math.random() < 0.03) spawn('steam', 278, 210);
    pada(E, 55, () => {
      const h = E.data.humas;
      if (masihMain(E, h)) { h.pose = 'salam'; h.goToXY(-16, LANE_DOWN, 'left'); }
      if (E.data.tamu) E.data.tamu.bubar();
    });
  },
  selesai(E) {
    if (E.data.humas) E.data.humas.pose = null;
    if (E.data.tamu && !E.data.tamu.keluar) E.data.tamu.bubar();
  },
},

{
  id: 'tamu-nyasar',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 16,
  syarat: (S) => S.kerjaJam,
  mulai(E) {
    E.data.t = { x: -14, y: LANE_DOWN, fase: 'masuk' };
  },
  tick(E, dt, S) {
    const T = E.data.t;
    if (T.fase === 'masuk') {
      T.x = Math.min(246, T.x + 40 * dt);
      if (T.x >= 246) { T.fase = 'bingung'; T.putar = 0; }
    } else if (T.fase === 'bingung') {
      T.putar += dt;
      const arah = ['left', 'up', 'right', 'down'];
      T.hadap = arah[Math.floor(T.putar / 0.6) % 4];
      if (T.putar > 4.8 && !E.data.dibantu) {
        E.data.dibantu = true;
        const a = pemeranDekat(E, 246, 252, 220);
        if (a) { E.data.a = a; a.doingEvent = 'menunjukkan arah tamu'; a.goToXY(228, 252, 'right'); }
      }
    } else if (T.fase === 'keluar') {
      T.x += 40 * dt;
    }
    if (E.data.a && E.data.a.diam && T.fase === 'bingung') {
      E.data.a.pose = 'nunjuk';
      // Tamunya dulu tidak pernah pergi: pada(E, E.umur + 1.5, ..) targetnya
      // bergerak tiap frame jadi callback-nya mati. Tenggat disimpan sekali.
      if (E.data.tunjukPada == null) E.data.tunjukPada = E.umur + 1.5;
      else if (E.umur > E.data.tunjukPada) {
        T.fase = 'keluar'; T.hadap = 'right';
        E.data.a.pose = null;
        T.terimakasih = true;
      }
    }
  },
  gambarProp(E) {
    const T = E.data.t;
    if (T.x < -12 || T.x > W + 12) return;
    gambarOrangLuar(T.x, T.y, '#8b9098', null, null, '#3a3f45');
    r(Math.round(T.x) - 1, T.y - 26, 3, 5, '#e8453f');   // tanda tanya berkedip
  },
  sortY: 258,
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

);
