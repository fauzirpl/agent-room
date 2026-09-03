/* ==========================================================================
   PERAYAAN — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'hari-korpri',
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 45,
  syarat: (S) => (new Date().getMonth() === 10 && S.tanggal === 29) || S.jam < 0,
  mulai(E, S) {
    E.data.asli = new Map();
    for (const a of S.orang) { E.data.asli.set(a, a.pal); a.pal = { ...a.pal, main: '#28406b', pattern: null }; }
    E.data.baris = S.orang.filter((o) => bisaDipinjam(o)).slice(0, 6);
    E.data.baris.forEach((a, i) => {
      a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a);
      a.goToXY(200 + i * 16, 234, 'up');
    });
  },
  tick(E) {
    pada(E, 6, () => { for (const a of E.data.baris) a.pose = 'hormat'; });
    pada(E, 16, () => {
      for (const a of E.data.baris) a.pose = null;
      if (E.data.baris[0]) E.data.baris[0].goToXY(300, 200, 'up');
    });
    pada(E, 24, () => {
      const s = E.data.baris[0];
      if (s) { spawn('talk', s.x, s.y - 24); s.say('panca prasetya'); }
    });
    pada(E, 34, () => { for (const a of E.data.baris) a.pose = 'tepuk'; });
  },
  selesai(E) {
    for (const [a, pal] of E.data.asli) a.pal = pal;
    for (const a of E.data.baris) a.pose = null;
  },
},

{
  id: 'hormat-bendera',
  kelas: 'panggung', bobot: B.langka, cooldown: 43200, durasi: 9,
  syarat: (S) => S.tanggal === 17 || (new Date().getDay() === 1 && S.jam > 7.2 && S.jam < 7.9),
  mulai(E, S) {
    E.data.orang = S.orang.filter((o) => !o.adaTugas);
    for (const o of E.data.orang) {
      o.bekuSampai = now + 8000;
      hadapkan(o, 300, 16);
      o.pose = 'hormat';
    }
  },
  gambarAtas() { ctx.globalAlpha = 0.05; r(0, 0, W, H, '#ffd9a0'); ctx.globalAlpha = 1; },
  selesai(E) { for (const o of E.data.orang) o.pose = null; },
},

{
  id: 'foto-bersama-grup-wa',
  kelas: 'panggung', bobot: B.jarang, cooldown: 3600, durasi: 16,
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 3,
  perluAktor: true,
  mulai(E, S) {
    E.data.orang = pinjamAktor(E, 6);
    E.data.orang.forEach((a, i) => a.goToXY(170 + i * 24, 246, 'down'));
  },
  tick(E) {
    pada(E, 6, () => { for (const a of E.data.orang) a.pose = 'silang'; });
  },
  gambarAtas(E) {
    if (E.umur > 7 && E.umur < 7.13) { ctx.globalAlpha = 0.55; r(0, 0, W, H, '#ffffff'); ctx.globalAlpha = 1; }
    else if (E.umur >= 7.13 && E.umur < 7.3) { ctx.globalAlpha = 0.2; r(0, 0, W, H, '#ffffff'); ctx.globalAlpha = 1; }
  },
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

{
  id: 'kembang-api-tahun-baru',
  kelas: 'latar', bobot: B.langka, cooldown: 8, durasi: 8,
  syarat: () => {
    const d = new Date();
    const bulan = d.getMonth(), tgl = d.getDate(), jamF = d.getHours() + d.getMinutes() / 60;
    return (bulan === 11 && tgl === 31 && jamF >= 23.5) || (bulan === 0 && tgl === 1 && jamF < 0.5);
  },
  mulai(E) { E.data.orang = pinjamAktor(E, 3); E.data.orang.forEach((a, i) => a.goToXY(200 + i * 20, 138, 'up')); },
  tick(E) {
    pada(E, 3, () => {
      for (let i = 0; i < 16; i++) spawn('confetti', JENDELA.x + JENDELA.w / 2, JENDELA.y + 20);
      for (const a of E.data.orang) spawn('talk', a.x, a.y - 24);
    });
    pada(E, 6.5, () => { for (let i = 0; i < 16; i++) spawn('confetti', JENDELA.x + JENDELA.w / 2, JENDELA.y + 20); });
  },
  selesai(E) { if (E.data.orang && E.data.orang[0]) E.data.orang[0].say('selamat tahun baru'); },
},

{
  id: 'penghargaan-zona-integritas',
  kelas: 'panggung', bobot: B.langka, cooldown: 5400, durasi: 35,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 4 && S.jam > 9 && S.jam < 15,
  mulai(E, S) {
    E.data.kadis = pemeran(E, ['kadis']);
    const calon = pinjamAktor(E, 4);
    E.data.penerima = calon[0];
    E.data.lain = calon.slice(1);
    if (E.data.kadis) E.data.kadis.goToXY(214, 232, 'up');
    if (E.data.penerima) E.data.penerima.goToXY(214, 250, 'down');
    E.data.lain.forEach((a, i) => a.goToXY(180 + i * 20, 220, 'down'));
  },
  tick(E) {
    pada(E, 10, () => {
      if (E.data.kadis && E.data.penerima) {
        for (let i = 0; i < 10; i++) spawn('idea', 214, 236, P.gold);
        E.data.kadis.say('selamat, ini hasil kerja satu tim');
      }
    });
    pada(E, 14, () => { for (const a of E.aktor) a.pose = 'tepuk'; });
    pada(E, 22, () => {
      RUANGAN.piagamDinding = true;
      for (const a of E.aktor) a.pose = null;
    });
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'piala-voli-dipajang',
  kelas: 'latar', bobot: B.langka, cooldown: 7200, durasi: 16,
  syarat: () => !RUANGAN.piala,
  perluAktor: true,
  mulai(E) {
    E.data.a = pemeran(E);
    if (!E.data.a) return;
    E.data.a.bawa = 'boks';
    E.data.a.goToXY(72, 138, 'up');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    if (a.diam && !E.data.taruh) {
      E.data.taruh = true;
      a.bawa = null;
      RUANGAN.piala = true;
      for (let i = 0; i < 3; i++) spawn('idea', 72, 130, '#e8d873');
      a.say('juara dua pun tetap juara');
    }
  },
},

{
  id: 'tumpeng-syukuran',
  kelas: 'panggung', bobot: B.langka, cooldown: 3000, durasi: 45,
  perluAktor: true,
  syarat: (S) => S.orang.filter((o) => bisaDipinjam(o)).length >= 3 && S.jam > 9 && S.jam < 14
    && !S.orang.some((o) => o.station === 'rapat'),
  mulai(E) {
    E.data.orang = pinjamAktor(E, 5);
    E.data.orang.forEach((a) => a.goTo('rapat'));
    E.data.baris = 12;
  },
  tick(E, dt) {
    pada(E, 5, () => {
      const a = E.data.orang.find((o) => o.diam);
      if (a) { a.pose = 'angkat'; E.data.pemotong = a; }
    });
    pada(E, 7, () => {
      for (let i = 0; i < 4; i++) spawn('idea', 246, 190, P.amber);
      if (E.data.pemotong) E.data.pemotong.pose = null;
      E.data.potong = true;
    });
    if (E.data.potong && E.data.baris > 0) {
      E.data.susutT = (E.data.susutT || 0) + dt;
      if (E.data.susutT > 8) { E.data.susutT = 0; E.data.baris -= 3; }
    }
    if (Math.random() < 0.4 * dt) spawn('steam', 246, 178);
  },
  gambarProp(E) {
    const cx = 246, base = 200;
    const baris = Math.max(0, E.data.baris);
    for (let i = 0; i < baris; i++) {
      const w = 18 - i * 1.4;
      r(cx - w / 2, base - i * 3, w, 3, '#f2c14e');
      r(cx + w / 2 - 2, base - i * 3, 2, 3, sh('#f2c14e', 0.72));
    }
    if (E.data.potong && baris > 0) r(cx - 1, base - baris * 3 - 2, 2, 2, '#c22b2b');
    r(cx - 8, base + 1, 16, 2, '#3e6b4f');
  },
  sortY: 200,
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

);
