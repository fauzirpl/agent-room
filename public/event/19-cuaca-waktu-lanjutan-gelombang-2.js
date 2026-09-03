/* ==========================================================================
   CUACA & WAKTU — lanjutan gelombang 2
   ========================================================================== */

daftarEvent(

{
  id: 'kilat-menyambar',
  kelas: 'latar', bobot: B.jarang, cooldown: 40, durasi: 3,
  syarat: () => CUACA.petir,
  mulai(E, S) {
    for (const o of S.orang) { if (!o.eventKerja) o.bekuSampai = now + 800; }
    for (let i = 0; i < 6; i++) spawn('dust', 60 + Math.random() * 360, 3);
    const a = pilih(S.orang);
    if (a && Math.random() < 0.5) a.say('waduh');
  },
  tick(E) {
    if (E.umur > 0.9 && E.umur < 1.9) MOD.getar = 1.4 * Math.max(0, 1 - (E.umur - 0.9));
  },
},

{
  id: 'gelombang-panas-siang',
  kelas: 'latar', bobot: B.sering, cooldown: 900, durasi: 120,
  syarat: (S) => S.jam > 11 && S.jam < 14 && S.luar > 0.9 && CUACA.hujan < 0.05,
  mulai(E) {
    E.data.kipas = pinjamAktor(E, 2, (o) => o.station === 'think');
    for (const a of E.data.kipas) a.pose = 'mengipas';
  },
  tick(E, dt) {
    MOD.ambPlus = 0.05;
    MOD.kipas = 1.7;
    if (Math.random() < 0.15 * dt) spawn('splash', 466, 262, '#bcd9ee');
    if (!E.data.idle && E.umur > 5) {
      const a = pinjamAktor(E, 1, (o) => o.station !== 'think')[0];
      if (a) { E.data.idle = a; a.goTo('idle'); }
    }
  },
  selesai(E) { for (const a of E.data.kipas) a.pose = null; },
},

{
  id: 'kabut-asap',
  kelas: 'latar', bobot: B.langka, cooldown: 2400, durasi: 130,
  syarat: (S) => S.jam >= 6 && S.jam < 10 && CUACA.hujan < 0.05,
  mulai(E) {
    E.data.masker = pinjamAktor(E, 2);
    for (const a of E.data.masker) a.masker = true;
  },
  tick() {
    MOD.luar = 0.5;
    MOD.ambPlus = 0.08;
    MOD.kipas = 0;
  },
  selesai(E) { for (const a of E.data.masker) a.masker = false; },
},

{
  id: 'kabut-embun-jendela',
  kelas: 'latar', bobot: B.sedang, cooldown: 2400, durasi: 120,
  syarat: (S) => (S.jam > 5.4 && S.jam < 7.2) || (Date.now() - CUACA.hujanTinggiSejak < 180000 && CUACA.hujan < 0.1),
  tick(E) {
    MOD.kacaBuram = Math.min(1, 0.3 + 0.5 * Math.sin(E.umur / 8));
    if (!E.data.a && E.umur > 6) {
      const a = pemeranStasiun(E, 'web') || pemeran(E);
      if (a) { E.data.a = a; a.goTo('web'); }
    }
    if (E.data.a && E.data.a.diam && !E.data.usap) {
      E.data.usap = true;
      E.data.a.pose = 'lap';
      E.data.a.say('cerah juga hari ini');
      E.data.lapSampai = E.umur + 3;
    }
    if (E.data.lapSampai && E.umur > E.data.lapSampai) MOD.kacaBuram = 0.15;
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'panas-terik-siang',
  kelas: 'latar', bobot: B.sering, cooldown: 480, durasi: 80,
  syarat: (S) => S.jam > 11 && S.jam < 14.5 && !sedangJalan('gelombang-panas-siang') && !sedangJalan('kabut-asap'),
  mulai(E) {
    E.data.orang = pinjamAktor(E, 2, (o) => o.station === 'think');
    for (const a of E.data.orang) a.pose = 'mengipas';
  },
  tick(E, dt) {
    MOD.ambPlus = 0.06;
    MOD.kipas = 1.5;
    if (Math.random() < 0.1 * dt) spawn('splash', 466, 258, '#bcd9ee');
  },
  selesai(E) { for (const a of E.data.orang) a.pose = null; },
},

{
  id: 'senyap-magrib',
  kelas: 'latar', bobot: B.sedang, cooldown: 82800, durasi: 12,
  syarat: (S) => S.jam >= 17.9 && S.jam < 18.02,
  tick(E) {
    MOD.ambPlus = 0.04 * Math.min(1, E.umur / 3);
    MOD.hening = true;
    MOD.lajuGlobal = 0.7;
  },
  gambarAtas(E) {
    for (const rTime of [0, 1.2, 2.4]) {
      const t = E.umur - rTime;
      if (t < 0 || t > 3) continue;
      const rad = 8 + (t / 3) * 62;
      ctx.globalAlpha = 0.25 * (1 - t / 3);
      ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(JENDELA.x + JENDELA.w / 2, JENDELA.y + JENDELA.h / 2, rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
},

);
