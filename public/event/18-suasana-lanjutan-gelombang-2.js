/* ==========================================================================
   SUASANA — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'daun-tanaman-jatuh',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 3,
  mulai() {
    spawn('dust', 32, 270);
    if (RUANGAN.propLantai.filter((p) => p.jenis === 'daun').length < 2) {
      RUANGAN.propLantai.push({ x: 30 + Math.random() * 10, y: 278 + Math.random() * 6, jenis: 'daun' });
    }
  },
},

{
  id: 'debu-menari-di-berkas',
  kelas: 'latar', bobot: B.sering, cooldown: 20, durasi: 6,
  syarat: () => ambien().sinarA > 0.09,
  tick(E, dt, S) {
    if (Math.random() < dt) spawn('dust', 164 + Math.random() * 100, 120 + Math.random() * 60);
    if (!E.data.melintas) {
      const lewat = S.orang.find((o) => o.path.length && o.x > 164 && o.x < 266 && o.y > 100 && o.y < 200 && o.laju === 1);
      if (lewat) {
        E.data.melintas = lewat;
        for (let i = 0; i < 6; i++) spawn('dust', lewat.x, lewat.y);
        lewat.laju = 0.8;
        E.data.lajuSampai = E.umur + 1;
      }
    }
    if (E.data.lajuSampai && E.umur > E.data.lajuSampai && E.data.melintas) {
      E.data.melintas.laju = 1;
      E.data.melintas = null;
    }
  },
  selesai(E) { if (E.data.melintas) E.data.melintas.laju = 1; },
},

{
  id: 'kursi-digeser-berdecit',
  kelas: 'latar', bobot: B.sering, cooldown: 6, durasi: 2,
  syarat: (S) => Date.now() - RUANGAN.kursiBerderit > 20000 && S.orang.some((o) => o.station === 'rapat'),
  mulai(E, S) {
    const idx = (Math.random() * KURSI_N) | 0;
    RUANGAN.kursiBerderit = Date.now();
    RUANGAN.geserKursi[idx] = 3;
    const kx = RAPAT.cx + slotKe(idx);
    spawn('dust', kx - 6, 186); spawn('dust', kx + 6, 186);
    const dengar = S.orang.find((o) => o.station === 'rapat' && o.diam);
    if (dengar) menoleh([dengar], kx, 186, 1000);
  },
},

{
  id: 'laptop-ditutup-pelan',
  kelas: 'latar', bobot: B.sedang, cooldown: 300, durasi: 6,
  syarat: (S) => S.jam > 16 && S.orang.some((o) => o.station === 'think' && o.diam),
  perluAktor: true,
  mulai(E, S) {
    const a = S.orang.find((o) => o.station === 'think' && o.diam && bisaDipinjam(o));
    if (!a) return;
    a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
    E.data.a = a; E.data.slot = a.slotIdx;
  },
  tick(E) {
    if (E.data.slot == null) return;
    if (E.umur > 1) MOD.mejaPadam = E.data.slot;
    pada(E, 2, () => { if (E.data.a) { lepaskanAktor(E.data.a); E.data.a = null; } });
  },
},

{
  id: 'merenung-depan-kipas',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 12,
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1, (o) => now - Math.max(o.lastEvent, o.arrivedAt) > 12000)[0];
    if (!a) return;
    E.data.a = a;
    a.goToXY(400, 272, 'up');
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.diam) { E.data.diam = true; a.bekuSampai = now + 10000; a.pose = 'diam'; }
    if (E.data.diam) {
      for (const o of S.orang) {
        if (o !== a && o.path.length && jarakKe(o, a.x, a.y) < 40 && !o.eventKerja) {
          hadapkan(o, a.x, a.y);
          o.busyUntil = Math.max(o.busyUntil, now + 1200);
        }
      }
    }
    pada(E, 11, () => { if (a) { a.busyUntil = now + 3000; a.state = 'work'; } });
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; } },
},

{
  id: 'tetes-terakhir-ember',
  kelas: 'latar', bobot: B.sedang, cooldown: 600, durasi: 8,
  syarat: () => CUACA.hujan < 0.05,
  tick(E) {
    if (E.umur < 3) MOD.drip = 1.2;
    else if (E.umur < 6) MOD.drip = 2.5;
    else MOD.drip = 6;
    pada(E, 6.2, () => {
      E.data.a = pemeran(E);
      if (E.data.a) E.data.a.goToXY(347, 130, 'up');
    });
    pada(E, 7.5, () => { if (E.data.a) E.data.a.say('sudah, tenang'); });
  },
},

{
  id: 'berkas-pagi-berdebu',
  kelas: 'latar', bobot: B.sering, cooldown: 3600, durasi: 55,
  syarat: (S) => S.jam > 6.5 && S.jam < 8.5 && S.luar > 0.4,
  tick(E, dt, S) {
    MOD.sinar = 1.5;
    if (Math.random() < 2 * dt) spawn('dust', 190 + Math.random() * 60, 120 + Math.random() * 60);
    if (!E.data.a && E.umur > 3) {
      const lewat = S.orang.find((o) => o.path.length && o.x > 190 && o.x < 250 && o.y > 150 && o.y < 200);
      if (lewat) { E.data.a = lewat; lewat.bekuSampai = now + 5000; lewat.pose = 'usap'; E.data.lepasPada = E.umur + 5; }
    }
    if (E.data.lepasPada && E.umur > E.data.lepasPada && E.data.a) { E.data.a.pose = null; E.data.a = null; }
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; } },
},

{
  id: 'hujan-pertama-bau-tanah',
  kelas: 'latar', bobot: B.langka, cooldown: 3600, durasi: 35,
  syarat: () => CUACA.hujan > 0.5 && Date.now() - CUACA.hujanTinggiSejak > 1200000,
  mulai(E) {
    E.data.a = pemeran(E);
    if (E.data.a) E.data.a.goTo('web');
  },
  tick(E, dt, S) {
    if (Math.random() < 6 * dt) spawn('dust', JENDELA.x + JENDELA.w - 6, JENDELA.y + 4, '#c8b48a');
    const a = E.data.a;
    if (a && a.diam && !E.data.buka) {
      E.data.buka = true;
      a.say('wangi tanah');
      a.pose = 'angkat';
      a.bekuSampai = now + 8000;
      for (const o of S.orang) { if (o !== a && o.path.length) o.laju = 0.7; }
      E.data.lajuSampai = E.umur + 5;
    }
    if (E.data.lajuSampai && E.umur > E.data.lajuSampai && !E.data.direset) {
      E.data.direset = true;
      for (const o of S.orang) { if (o.laju === 0.7) o.laju = 1; }
    }
  },
  selesai(E) { if (E.data.a) { E.data.a.pose = null; E.data.a.bekuSampai = 0; } },
},

{
  id: 'jeda-maghrib',
  kelas: 'latar', bobot: B.sering, cooldown: 82800, durasi: 8,
  syarat: (S) => S.jam >= 18 && S.jam < 18.33 && S.orang.length >= 1,
  mulai(E, S) {
    E.data.orang = S.orang.filter((o) => !o.adaTugas);
    for (const o of E.data.orang) o.bekuSampai = now + 8000;
    const a = E.data.orang.find((o) => !o.path.length);
    if (a) hadapkan(a, 212, 40);
  },
  tick() { MOD.ambPlus = 0.04; },
},

{
  id: 'lembur-sampai-malam',
  babak: { lembur: 2, malam: 1 },   // pengali bobot per babak hari kerja (S.babak)
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 120,
  syarat: (S) => S.jam > 20 || S.jam < 4,
  mulai() { minDiLayarTimpa = 0; },
  tick() {
    MOD.neonMati[0] = 1;
    MOD.ambPlus = 0.05;
  },
  gambarProp(E, S) {
    for (const o of S.orang) {
      if (o.station === 'think' && o.diam) glow(o.x + 21, o.y - 10, 26, '#9fc3ff', 0.22);
    }
  },
  sortY: 349,
  selesai() { minDiLayarTimpa = null; },
},

{
  id: 'matahari-silau-monitor',
  kelas: 'latar', bobot: B.sedang, cooldown: 900, durasi: 45,
  syarat: (S) => S.jam > 15.5 && S.jam < 17 && S.luar > 0.6 && S.stasiunAktif.has('server'),
  perluAktor: true,
  mulai(E) { E.data.a = pemeranStasiun(E, 'server'); },
  tick(E, dt) {
    if (!E.data.a) return;
    pada(E, 2, () => { E.data.a.say('silau, ndan'); E.data.a.goTo('web'); });
    if (E.umur > 2 && E.umur < 10) RUANGAN.gordenKanan = Math.min(16, RUANGAN.gordenKanan + 5 * dt);
    pada(E, 10, () => { if (E.data.a) E.data.a.goTo('server'); });
  },
  gambarProp(E) {
    if (E.umur > 10) return;
    ctx.globalAlpha = 0.5 * Math.max(0, 1 - E.umur / 10);
    r(384, 108, 10, 14, '#ffffff');
    ctx.globalAlpha = 1;
  },
  sortY: 130,
},

{
  id: 'pelangi-selepas-hujan',
  kelas: 'latar', bobot: B.jarang, cooldown: 1800, durasi: 50,
  syarat: (S) => CUACA.hujan < 0.1 && S.jam > 15 && S.jam < 17.5 && Math.random() < 0.25,
  mulai(E) {
    E.data.orang = pinjamAktor(E, 3);
    E.data.orang.forEach((a, i) => a.goToXY(198 + i * 16, 138, 'up'));
    if (E.data.orang[0]) E.data.orang[0].say('eh, ada pelangi');
  },
  gambarAtas(E) {
    const fade = E.umur < 3 ? E.umur / 3 : (E.umur > 44 ? Math.max(0, 1 - (E.umur - 44) / 6) : 1);
    if (fade <= 0.01) return;
    klipJendela(() => {
      const warna = ['#c22b2b', '#e07a2c', '#e8c93a', '#3e6b4f', '#3565b0', '#4b2f8a', '#7a3f9c'];
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45 * fade;
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = warna[i];
        ctx.beginPath();
        ctx.arc(JENDELA.x + JENDELA.w / 2, JENDELA.y + JENDELA.h + 30, 46 - i, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  },
},

{
  id: 'ramadan-siang-sunyi',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 140,
  syarat: (S) => {
    const h = taksirHijri(new Date());
    return h.bulan === 9 && S.jam >= 6 && S.jam < 17.75;
  },
  tick() {
    MOD.ambPlus = 0.03;
    MOD.lajuGlobal = 0.8;
    RUANGAN.gordenKanan = Math.max(RUANGAN.gordenKanan, 12);
  },
  gambarProp() {
    r(462, 254, 18, 34, '#c9c3b0');
    r(462, 254, 18, 1, '#e2ddc8');
    for (let i = 0; i < 3; i++) r(464 + i * 5, 258, 1, 26, '#b0a98e');
  },
  sortY: 300,
},

{
  id: 'silau-sore-gorden',
  kelas: 'latar', bobot: B.sedang, cooldown: 3600, durasi: 60,
  syarat: (S) => S.jam > 16.5 && S.jam < 17.8 && S.luar > 0.5 && RUANGAN.gordenKanan <= 6,
  perluAktor: true,
  mulai(E, S) {
    const a = pinjamAktor(E, 1, (o) => o.station === 'think' && o.slotIdx === 0)[0] || pinjamAktor(E, 1)[0];
    E.data.a = a;
    if (a) a.pose = 'usap';
  },
  tick(E, dt) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 2, () => { a.pose = null; a.goTo('web'); });
    if (E.umur > 2 && E.umur < 4) RUANGAN.gordenKanan = Math.min(16, RUANGAN.gordenKanan + 5 * dt);
    pada(E, 4, () => { if (a) a.say('silau, ditutup ya'); });
    pada(E, 6, () => { if (a) a.goTo('think'); });
  },
  gambarProp(E) {
    if (E.umur > 6) return;
    ctx.globalAlpha = 0.16 * Math.max(0, 1 - E.umur / 6);
    ctx.beginPath();
    ctx.moveTo(186, 196); ctx.lineTo(238, 196); ctx.lineTo(300, 200); ctx.lineTo(150, 200);
    ctx.closePath(); ctx.fillStyle = '#ffd88a'; ctx.fill();
    ctx.globalAlpha = 1;
  },
  sortY: 113,
},

/* Siklus tahun anggaran: ritme birokrasi paling khas kantor dinas Indonesia,
   dua status musiman berlawanan seperti ramadan-siang-sunyi di atas — tapi
   digerakkan kalender Masehi, bukan Hijriah. */
{
  id: 'tahun-anggaran-baru',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 20,
  syarat: (S) => {
    const d = new Date();
    return d.getMonth() === 0 && d.getDate() <= 14 && S.jam >= 7 && S.jam < 17;
  },
  perluAktor: true,
  mulai(E) {
    const a = pinjamAktor(E, 1)[0];
    E.data.a = a;
    if (a) { a.bawa = 'map'; a.goTo('read'); }
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 8, () => {
      if (RUANGAN.mapDisposisi > 0) RUANGAN.mapDisposisi--;
      if (RUANGAN.tumpukanFiling > 0) RUANGAN.tumpukanFiling--;
      a.say('beres-beres arsip, tahun baru');
    });
    pada(E, 16, () => { a.bawa = null; a.goTo(stasiunPulang(a)); });
  },
},

{
  id: 'serapan-anggaran-akhir-tahun',
  kelas: 'latar', bobot: B.sedang, cooldown: 2400, durasi: 40,
  syarat: (S) => {
    const b = new Date().getMonth();
    return b >= 9 && S.jam >= 15 && S.jam < 19;
  },
  mulai(E) {
    const a = pinjamAktor(E, 1)[0];
    if (a) { E.data.a = a; a.pose = 'ngantuk'; }
  },
  tick(E, dt) {
    MOD.lajuGlobal = 0.85;
    const a = E.data.a;
    if (a) {
      pada(E, 3, () => a.say('SPJ akhir tahun belum kelar-kelar'));
      pada(E, 10, () => { a.pose = null; a.goTo(stasiunPulang(a)); });
    }
    if (E.umur > 2 && E.umur < 2 + dt * 2) {
      RUANGAN.mapDisposisi = Math.min(5, RUANGAN.mapDisposisi + 1);
      RUANGAN.tumpukanFiling = Math.min(6, RUANGAN.tumpukanFiling + 1);
    }
  },
},

);
