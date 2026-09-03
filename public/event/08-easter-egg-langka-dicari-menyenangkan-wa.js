/* ==========================================================================
   EASTER EGG — langka, dicari, menyenangkan waktu ketemu
   ========================================================================== */

daftarEvent(

{
  id: 'cicak-di-dinding',
  kelas: 'latar', bobot: B.sering, cooldown: 300, durasi: 25,
  syarat: (S) => S.lampu > 0.3,
  lanjutan: [{ id: 'cicak-jatuh-ke-berkas', peluang: 0.12 }],
  mulai(E) { E.data.x = 180; E.data.jeda = 0; },
  tick(E, dt, S) {
    E.data.jeda -= dt;
    if (E.data.jeda <= 0) {
      E.data.x += 30 * dt;
      if (E.data.x > (E.data.pos || 192)) { E.data.pos = E.data.x + 12; E.data.jeda = 3; }
    }
    if (E.data.x > 250 && E.data.x < 258) menoleh(S.orang.filter((o) => o.y < 200), E.data.x, 38, 900);
  },
  gambarDinding(E) {
    // digambar SEBELUM jam dan foto: dia benar-benar masuk ke balik bingkai
    const x = Math.round(E.data.x), y = 38 + Math.round(Math.sin(x / 30) * 5);
    if (x > 266) return;
    r(x, y, 5, 2, '#8a8070');
    r(x + 5, y - 1, 2, 2, '#8a8070');
    r(x - 3, y + (Math.sin(now / 300) > 0 ? 0 : 1), 3, 1, '#9a9080');
    r(x + 1, y + 2, 1, 1, '#8a8070'); r(x + 3, y - 1, 1, 1, '#8a8070');
  },
},

{
  id: 'semut-antre-ubin-retak',
  kelas: 'latar', bobot: B.langka, cooldown: 1800, durasi: 28,
  mulai(E) { E.data.maju = 0; },
  tick(E, dt, S) {
    E.data.maju += 7 * dt;
    // yang berdiri di ruang tunggu menggeser kaki; barisannya juga memutar
    const orang = S.orang.find((o) => o.station === 'idle' && o.diam);
    E.data.hindar = orang ? orang.x : 0;
  },
  gambarLantai(E) {
    for (let i = 0; i < 14; i++) {
      const d = E.data.maju - i * 5;
      if (d < 0 || d > 210) continue;
      const x = 128 + d, y = 292 + Math.sin(d / 9) * 0.5
        + (E.data.hindar && Math.abs(x - E.data.hindar) < 20 ? -8 : 0);
      r(x, y, 1, 1, '#2c2620');
    }
  },
},

{
  id: 'kilau-garuda',
  kelas: 'latar', bobot: B.langka, cooldown: 2400, durasi: 2,
  tick(E, dt, S) {
    pada(E, 0.2, () => menoleh(S.orang.filter((o) => o.y < 200), 300, 16, 1200));
  },
  gambarDinding(E) {
    const p = E.umur / 0.7;
    if (p > 1) { if (E.umur < 1.2) glow(300, 16, 10, P.gold, 0.25 * (1.2 - E.umur) / 0.5); return; }
    ctx.save();
    ctx.beginPath(); ctx.rect(292, 4, 26, 26); ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff4c8';
    const sx = 288 + p * 34;
    ctx.beginPath();
    ctx.moveTo(sx, 2); ctx.lineTo(sx + 3, 2); ctx.lineTo(sx - 9, 32); ctx.lineTo(sx - 12, 32);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  },
},

{
  id: 'cocokkan-jam-tangan',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 3,
  syarat: (S) => S.orang.some((o) => o.diam && o.x > 150 && o.x < 190 && o.y < 200),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.diam && o.x > 150 && o.x < 190 && o.y < 200);
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    MOD.jamSorot = 1;
    pada(E, 0.3, () => { a.pose = 'angkat'; hadapkan(a, 168, 38); });
    pada(E, 2.2, () => { a.pose = null; a.say('jam kantor lebih benar'); });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'dua-sesi-sejabatan',
  kelas: 'latar', bobot: B.jarang, cooldown: 360, durasi: 5,
  syarat: () => cariSejabatan() != null,
  mulai(E) { E.data.p = cariSejabatan(); },
  tick(E) {
    const p = E.data.p;
    if (!p) return;
    const [a, b] = p;
    hadapkan(a, b.x, b.y); hadapkan(b, a.x, a.y);
    a.busyUntil = Math.max(a.busyUntil, now + 3000);
    b.busyUntil = Math.max(b.busyUntil, now + 3000);
    pada(E, 0.6, () => { a.pose = 'salam'; });
    pada(E, 0.9, () => { b.pose = 'salam'; spawn('idea', (a.x + b.x) / 2, a.y - 28); });
    pada(E, 2.4, () => { a.pose = null; b.pose = null; a.say('kembar seragam kita'); });
  },
  selesai(E) { for (const o of E.data.p || []) o.pose = null; },
},

{
  id: 'kursi-kosong-berputar-sendiri',
  kelas: 'latar', bobot: B.jarang, cooldown: 900, durasi: 4,
  syarat: (S) => S.sesi === 0 || S.orang.every((o) => o.standby),
  gambarProp(E) {
    // sandaran menyusut lalu melebar: ilusi kursi berputar, dua kali, meredam
    const redam = Math.max(0, 1 - E.umur / 4);
    const lw = 7 - Math.round(Math.abs(Math.sin(E.umur * 3)) * 4 * redam);
    const x = KURSI_DEKAT[0].x, y = KURSI_DEKAT[0].y;
    r(x - (lw >> 1), y - 16, lw, 7, '#6a4a32');
    r(x - (lw >> 1), y - 16, lw, 1, '#8a6844');
  },
  sortY: 254,
},

{
  id: 'seragam-salah-hari',
  kelas: 'latar', bobot: B.langka, cooldown: 43200, durasi: 14,
  syarat: (S) => S.orang.length >= 3,
  mulai(E, S) {
    const a = pilih(S.orang);
    if (!a) return;
    E.data.a = a;
    E.data.asli = a.pal;
    // dibalik: yang batik jadi polos, yang polos jadi batik
    a.pal = a.pal.pattern
      ? { ...a.pal, pattern: null, main: '#c9bd93' }
      : { ...a.pal, pattern: '#d9ab5e', main: '#6b4a2a' };
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => {
      menoleh(S.orang.filter((o) => o !== a && jarakKe(o, a.x, a.y) < 90), a.x, a.y, 1500);
      a.say('lho, hari ini bukan batik?');
    });
  },
  selesai(E) { if (E.data.a) E.data.a.pal = E.data.asli; },
},

{
  id: 'titip-absen',
  kelas: 'latar', bobot: B.langka, cooldown: 21600, durasi: 8,
  perluAktor: true,
  syarat: (S) => S.jam >= 7 && S.jam < 9,
  mulai(E) {
    const a = pemeran(E);
    if (a) { a.doingEvent = 'absen'; a.goToXY(424, 152, 'up'); }
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    pada(E, 1.5, () => { a.pose = 'angkat'; E.data.hijau = 1; });
    pada(E, 3, () => { E.data.hijau = 0; });
    pada(E, 3.6, () => { a.pose = 'duaangkat'; E.data.hijau = 1; });   // jempol kedua
    pada(E, 5, () => {
      E.data.hijau = 0; a.pose = null;
      a.say('sekalian punya Pak Budi, macet di jalan');
    });
    // menoleh cepat kiri lalu kanan — itu seluruh leluconnya
    pada(E, 5.4, () => { a.face = 'left'; });
    pada(E, 5.8, () => { a.face = 'right'; });
    pada(E, 6.2, () => { a.face = 'up'; });
  },
  gambarDinding(E) {
    r(424, 96, 9, 13, '#dfe2e6');                  // mesin absen sidik jari
    r(424, 96, 9, 1, '#f2f4f6');
    r(426, 99, 5, 4, E.data.hijau ? '#57d06a' : '#20242c');
    r(426, 105, 5, 2, '#9aa1a6');
  },
},

);

/* Dua sesi nyata berjabatan sama yang kebetulan berdekatan. Dicek atas agents
   saja — belasan, jadi O(n^2)-nya murah. */
function cariSejabatan() {
  const list = [...agents.values()].filter((a) => a.diam && !a.eventKerja);
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      if (list[i].peran !== list[k].peran) continue;
      if (jarakKe(list[i], list[k].x, list[k].y) > 36) continue;
      return [list[i], list[k]];
    }
  }
  return null;
}

