/* ==========================================================================
   GELOMBANG 2 — BIROKRASI, bagian A (19 dari 38 — lihat catatan di README
   soal sobek-kalender-dinding yang sengaja tidak dibuat: duplikat fungsional
   dari kalender-dinas-diganti gelombang 1)
   ========================================================================== */

daftarEvent(

{
  id: 'absen-fingerprint',
  kelas: 'panggung', bobot: B.sering, cooldown: 90, durasi: 12,
  syarat: (S) => (S.jam >= 7 && S.jam < 8.25) || (S.jam >= 15.75 && S.jam < 16.75),
  mulai(E) {
    const org = pinjamAktor(E, 3);
    org.forEach((a, i) => { a.doingEvent = 'absen sidik jari'; a.goToXY(462 - i * 10, 152, 'up'); });
  },
  tick(E) {
    const q = E.aktor;
    if (!q.length) return;
    if (E.data.berikut == null) E.data.berikut = 2;
    if (E.umur > E.data.berikut && q[0] && q[0].diam) {
      const a = q.shift();
      const gagal = Math.random() < 0.2;
      RUANGAN.absensiMerah = gagal;
      if (gagal) {
        a.pose = 'angkat';
        pada(E, E.umur + 1, () => { RUANGAN.absensiMerah = false; a.pose = null; });
        a.say('jarinya kering, ngulang');
      } else {
        for (let i = 0; i < 3; i++) spawn('ping', 428, 106);
        lepaskanAktor(a);
      }
      if (!gagal) { q.forEach((o, i) => o.goToXY(462 - i * 10, 152, 'up')); E.data.berikut = E.umur + 2.5; }
      else E.data.berikut = E.umur + 1.6;
    }
  },
  selesai() { RUANGAN.absensiMerah = false; },
},

{
  id: 'bagan-struktur-organisasi-diperbarui',
  kelas: 'latar', bobot: B.jarang, cooldown: 3600, durasi: 24,
  syarat: () => RUANGAN.baganKotak < 2,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'memperbarui bagan struktur';
    a.goToXY(118, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    if (Math.random() < 0.2) spawn('paper', 118, 44);
    pada(E, 10, () => { RUANGAN.baganKotak = Math.min(2, RUANGAN.baganKotak + 1); a.pose = null; a.say('kotaknya nambah satu'); });
    pada(E, 14, () => {
      const b = pemeranDekat(E, 120, 152, 200);
      if (b) { b.doingEvent = 'membaca bagan'; b.goToXY(126, 152, 'up'); }
    });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'basahi-jari-hitung-berkas',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 3,
  syarat: (S) => S.stasiunAktif.has('read') || S.stasiunAktif.has('search'),
  mulai(E, S) {
    E.data.a = S.orang.find((o) => (o.station === 'read' || o.station === 'search') && o.state === 'work');
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    a.pose = 'angkat';
    if (Math.random() < 0.4) spawn('paper', a.x, a.y - 20);
    pada(E, 2, () => { a.say('kurang satu, ulang'); });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'berkas-lama-dibuka',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 9,
  mulai(E, S) {
    const baru = S.orang.find((o) => Date.now() - (o.sejak || 0) < 30000 && !o.standby);
    E.data.a = baru || (S.orang.find((o) => o.station === 'search' && bisaDipinjam(o)));
    if (E.data.a) { E.data.a.doingEvent = 'membuka berkas lama'; E.data.a.goToXY(132, 152, 'up'); }
  },
  tick(E, dt, S) {
    const a = E.data.a;
    if (!a) return;
    pada(E, 1, () => {
      RUANGAN.laciBuka = 10;
      for (let i = 0; i < 25; i++) spawn('dust', 132, 128);
      a.mulut = true;
      a.say('hatsyi!');
    });
    pada(E, 1.3, () => { a.mulut = false; });
    pada(E, 1.5, () => {
      let jeda = 0;
      for (const o of S.orang) {
        if (o === a || o.eventKerja || jarakKe(o, a.x, a.y) > 60 || o.path.length) continue;
        jeda += 0.4;
        o.busyUntil = Math.max(o.busyUntil, now + 1000 + jeda * 1000);
      }
    });
  },
},

{
  id: 'ketuk-kertas-rata-di-meja',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 2,
  syarat: () => !RUANGAN.stempelRapi,
  mulai(E, S) {
    E.data.a = S.orang.find((o) => o.station === 'edit') || S.orang.find(bisaDipinjam);
  },
  tick(E) {
    const a = E.data.a;
    if (!a) return;
    a.pose = 'jongkok';
    pada(E, 1.5, () => { RUANGAN.stempelRapi = true; a.pose = null; });
  },
  selesai(E) { if (E.data.a) E.data.a.pose = null; },
},

{
  id: 'surat-edaran-ditempel',
  kelas: 'latar', bobot: B.jarang, cooldown: 1200, durasi: 25,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E, ['humas']);
    if (!a) return;
    a.doingEvent = 'menempel surat edaran';
    a.goToXY(10, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    a.pose = 'angkat';
    pada(E, 6, () => {
      a.pose = null;
      for (const e of RUANGAN.edaran) e.kusam = true;
      RUANGAN.edaran.push({ miring: false, kusam: false });
      if (RUANGAN.edaran.length > 4) RUANGAN.edaran.shift();
      a.say('cuti bersama turun');
    });
    pada(E, 10, () => {
      const b = pemeranDekat(E, 12, 152, 220);
      if (b) { b.doingEvent = 'membaca edaran'; b.goToXY(16, 152, 'up'); }
    });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].pose = null; },
},

{
  id: 'arsip-dipinjam-bidang',
  kelas: 'latar', bobot: B.sedang, cooldown: 720, durasi: 300,
  syarat: () => RUANGAN.boksHilang < 0,
  mulai(E) {
    RUANGAN.boksHilang = (Math.random() * 6) | 0;
    E.data.kembaliPada = E.umur + acak(120, 240);
  },
  tick(E, dt, S) {
    pada(E, 0.3, () => {
      const arsiparis = S.orang.find((o) => o.station === 'read' && bisaDipinjam(o));
      if (arsiparis) { hadapkan(arsiparis, 40, 152); spawn('ink', 66, 134); }
    });
    if (E.umur > E.data.kembaliPada) { E.selesaiCepat = true; }
    if (E.umur > E.data.kembaliPada - 30 && !E.data.diingatkan) {
      E.data.diingatkan = true;
      const a = pemeranDekat(E, 54, 152, 220);
      if (a) { a.doingEvent = 'menengok lemari arsip'; a.goToXY(40, 152, 'up'); a.say('boksnya belum balik dari kemarin'); }
    }
  },
  selesai() { RUANGAN.boksHilang = -1; },
},

/* Sengaja hanya menyasar STANDBY: hook di arrive('read') akan menunda efek
   stasiun 6 detik, dan itu tidak boleh terjadi pada tool call sungguhan yang
   memang sedang melapor sesuatu — jadi dijadikan event mandiri, bukan hook. */
{
  id: 'arsiparis-minta-isi-buku-pinjam',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 13,
  syarat: (S) => S.orang.some((o) => o.peran === 'arsiparis') && S.standby > 0,
  mulai(E, S) {
    const arsiparis = S.orang.find((o) => o.peran === 'arsiparis' && bisaDipinjam(o));
    const peminjam = S.orang.find((o) => o.standby && o !== arsiparis && bisaDipinjam(o));
    if (!arsiparis || !peminjam) return;
    for (const a of [arsiparis, peminjam]) { a.eventKerja = E; a.betahAsli = a.betah; a.betah = true; E.aktor.push(a); }
    arsiparis.goToXY(46, 152, 'up');
    peminjam.goToXY(60, 152, 'up');
  },
  tick(E) {
    const [ar, pe] = E.aktor;
    if (!ar || !pe) return;
    if (ar.diam && pe.diam) {
      pada(E, 1, () => { hadapkan(ar, pe.x, pe.y); pe.pose = 'jongkok'; for (let i = 0; i < 3; i++) spawn('ink', 60, 145, '#c22b2b'); });
      pada(E, 1.5, () => ar.say('tanda tangan di kolom peminjam ya'));
      pada(E, 7, () => { pe.pose = null; pe.say('siap, Bu'); RUANGAN.laciBuka = 6; spawn('dust', 60, 130); });
    }
  },
  selesai(E) { for (const a of E.aktor) a.pose = null; },
},

{
  id: 'audit-bpk',
  kelas: 'panggung', bobot: B.langka, cooldown: 3600, durasi: 75,
  syarat: (S) => S.orang.length >= 3 && kursiKosong() >= 4,
  mulai(E) {
    const duaAuditor = pinjamAktor(E, 2, (o) => o.peran === 'auditor')
      .concat(pinjamAktor(E, Math.max(0, 2 - E.aktor.length)));
    duaAuditor.forEach((a) => { a.doingEvent = 'pemeriksaan BPK'; a.goTo('rapat'); });
    const arsiparis = pemeran(E, ['arsiparis']);
    E.data.arsiparis = arsiparis;
    if (arsiparis) { arsiparis.doingEvent = 'mengantar berkas ke BPK'; arsiparis.bawa = 'map'; arsiparis.goToXY(54, 152, 'up'); }
  },
  tick(E) {
    const ar = E.data.arsiparis;
    if (ar && ar.diam) {
      for (let rit = 0; rit < 3; rit++) {
        pada(E, 5 + rit * 22, () => { spawn('dust', 60, 130); ar.goTo('rapat'); });
        pada(E, 10 + rit * 22, () => { ar.say('SPJ triwulan tiga ada di dus yang bawah'); });
        pada(E, 15 + rit * 22, () => { ar.goToXY(54, 152, 'up'); });
      }
    }
    pada(E, 70, () => { if (ar) { ar.bawa = null; } });
  },
  gambarProp(E) {
    if (E.umur > 68) return;
    for (let d = 0; d < 3; d++) { r(196 + d * 12, 246, 14, 10, '#a37b4e'); r(198 + d * 12, 248, 10, 6, '#b98d5e'); }
  },
  sortY: 256,
  selesai(E) { if (E.data.arsiparis) E.data.arsiparis.bawa = null; },
},

{
  id: 'auditor-catat-temuan-rak-server',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 21,
  syarat: (S) => S.orang.some((o) => o.peran === 'auditor') && S.stasiunAktif.has('server'),
  mulai(E, S) {
    const auditor = S.orang.find((o) => o.peran === 'auditor' && bisaDipinjam(o));
    if (!auditor) return;
    auditor.eventKerja = E; auditor.betahAsli = auditor.betah; auditor.betah = true; E.aktor.push(auditor);
    auditor.doingEvent = 'mencatat temuan rak server';
    auditor.bawa = 'papan';
    RUANGAN.papanJalan = 0;
    auditor.goTo('server');
  },
  tick(E, dt, S) {
    const a = E.aktor[0];
    if (!a || !a.diam) return;
    for (let i = 0; i < 3; i++) pada(E, 5 + i * 5, () => { RUANGAN.papanJalan = Math.min(3, RUANGAN.papanJalan + 1); });
    const teknisi = S.orang.find((o) => o !== a && (o.peran === 'teknisi' || o.peran === 'pranata_muda') && bisaDipinjam(o));
    if (teknisi && !E.data.teknisi) {
      E.data.teknisi = teknisi;
      teknisi.eventKerja = E; teknisi.betahAsli = teknisi.betah; teknisi.betah = true; E.aktor.push(teknisi);
      teknisi.doingEvent = 'merapikan kabel'; teknisi.pose = 'jongkok'; teknisi.goTo('server');
      pada(E, E.umur + 8, () => { RUANGAN.kabelRapi = true; teknisi.pose = null; teknisi.say('minggu ini beres, Bu'); });
    }
    pada(E, 16, () => { a.say('kabel belum berlabel, saya catat ya'); });
    pada(E, 19, () => { spawn('paper', a.x, a.y - 20); a.bawa = null; });
  },
  selesai(E) { for (const a of E.aktor) { a.pose = null; a.bawa = null; } },
},

{
  id: 'auditor-minta-bukti-dukung',
  kelas: 'latar', bobot: B.sedang, cooldown: 420, durasi: 22,
  syarat: (S) => S.orang.some((o) => o.peran === 'auditor') && S.orang.some((o) => o.station === 'think'),
  mulai(E, S) {
    const auditor = S.orang.find((o) => o.peran === 'auditor' && bisaDipinjam(o));
    const target = S.orang.find((o) => o.station === 'think' && o !== auditor);
    if (!auditor || !target) return;
    auditor.eventKerja = E; auditor.betahAsli = auditor.betah; auditor.betah = true; E.aktor.push(auditor);
    auditor.doingEvent = 'meminta bukti dukung';
    auditor.bawa = 'papan'; RUANGAN.papanJalan = 0;
    auditor.goToXY(target.x - 14, target.y, 'right');
    E.data.target = target;
    E.data.targetId = target.id;
  },
  tick(E, dt, S) {
    const a = E.aktor[0], target = E.data.target;
    if (!a) return;
    const masihAda = target && S.orang.includes(target);
    if (a.diam) {
      pada(E, 1, () => a.say('boleh lihat lampirannya?'));
      for (let i = 0; i < 3; i++) pada(E, 4 + i * 4, () => { RUANGAN.papanJalan = Math.min(3, RUANGAN.papanJalan + 1); });
    }
    if (masihAda && !E.data.pergi && a.diam) {
      pada(E, 2, () => { target.doingEvent = 'mengambil bukti dukung'; target.goToXY(54, 152, 'up'); });
      pada(E, 6, () => { spawn('dust', 60, 130); target.bawa = 'map-kuning'; target.goToXY(a.x + 14, a.y, 'left'); });
      pada(E, 12, () => {
        E.data.pergi = true; spawn('paper', a.x, a.y - 20); target.bawa = null;
        a.say('boleh lihat lampirannya?'); a.bawa = null;
      });
    }
    if (!masihAda && E.umur > 12 && !E.data.pergi) {
      E.data.pergi = true;
      a.say('belum disetujui');   // bukti tidak datang: papan dicoret, ke ruang kadis
      a.doingEvent = 'melapor ke kadis'; a.bawa = null; a.goToXY(452, 152, 'up');
    }
  },
  selesai(E) { for (const a of E.aktor) a.bawa = null; },
},

{
  id: 'berkas-menumpuk-di-pojok',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 40,
  // Reuse penghitung nyata yang sudah ada (backlog disposisi), bukan penanda
  // baru — dan TIDAK menyentuh route(): titik belok tambahan di pencari jalur
  // tunggal yang dipakai semua agen adalah risiko yang tidak sepadan di sini.
  syarat: () => RUANGAN.mapDisposisi >= 4,
  tick() {
    if (Math.random() < 0.02) spawn('dust', 30, 200, '#cbb897');
  },
  gambarProp() {
    const n = Math.min(3, Math.max(0, RUANGAN.mapDisposisi - 3));
    for (let d = 0; d < n; d++) { r(24 - d * 6, 200 - d * 2, 18, 14, '#a37b4e'); r(26 - d * 6, 202 - d * 2, 14, 10, '#b98d5e'); }
  },
  sortY: 210,
},

{
  id: 'cetak-massal-undangan',
  kelas: 'latar', bobot: B.sedang, cooldown: 480, durasi: 30,
  syarat: (S) => S.orang.filter((o) => o.station === 'rapat').length >= 3 || Math.random() < 0.3,
  perluAktor: true,
  mulai(E) {
    const a = pemeran(E);
    if (!a) return;
    a.doingEvent = 'menunggu cetakan massal';
    a.goTo('web');
  },
  tick(E) {
    if (E.umur < 24 && Math.random() < 0.5) spawn('paper', 214, 96);
    const a = E.aktor[0];
    if (a && a.diam) {
      if (Math.floor(now / 400) !== a._g) { a._g = Math.floor(now / 400); hadapkan(a, 168, 38); }
    }
    pada(E, 6, () => { if (a) a.say('dua belas rangkap, satu untuk arsip'); });
    pada(E, 25, () => {
      if (!a) return;
      a.bawa = 'kertas';
      a.doingEvent = 'mengantar cetakan ke rapat';
      a.goTo('rapat');
    });
    pada(E, 29, () => { if (a) a.bawa = null; });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

{
  id: 'disposisi-ditolak',
  kelas: 'latar', bobot: B.sedang, cooldown: 360, durasi: 9,
  mulai(E) {
    MOD.pintuKadis = true;
  },
  tick(E, dt, S) {
    MOD.pintuKadis = E.umur < 0.5;
    pada(E, 0.5, () => {
      for (let i = 0; i < 4; i++) spawn('ink', 448, 150);
      RUANGAN.propLantai.push({ x: 444, y: 148, jenis: 'map-merah' });
      const a = pemeranDekat(E, 448, 150, 220);
      if (a) {
        E.data.a = a; a.doingEvent = 'memungut disposisi ditolak';
        a.goToXY(448, 152, 'up');
      }
    });
    if (E.data.a && E.data.a.diam && !E.data.dipungut) {
      E.data.dipungut = true;
      RUANGAN.propLantai.pop();
      E.data.a.bawa = 'map-merah';
      E.data.a.say('belum disetujui');
      const slot = E.data.a.slotIdx;
      MOD.mejaPadam = E.data.a.station === 'think' ? slot : -1;
      E.data.a.doingEvent = 'kembali dengan lesu';
      E.data.a.goTo('think');
    }
    pada(E, 8, () => { if (E.data.a) E.data.a.bawa = null; });
  },
  selesai() {
    if (RUANGAN.propLantai.length && RUANGAN.propLantai[RUANGAN.propLantai.length - 1].jenis === 'map-merah') {
      RUANGAN.propLantai.pop();
    }
  },
},

{
  id: 'fotokopi-kilat',
  kelas: 'latar', bobot: B.sering, cooldown: 180, durasi: 14,
  mulai(E) {
    const a = pemeranDekat(E, 212, 164, 220);
    if (a) { a.doingEvent = 'mengambil hasil fotokopi'; a.goTo('web'); }
  },
  tick(E) {
    if (E.umur < 2 && Math.random() < 0.5) spawn('ping', 213, 90);
    const a = E.aktor[0];
    if (a && a.diam && !E.data.ambil) {
      pada(E, 2.2, () => {
        E.data.ambil = true; a.bawa = 'kertas';
        a.doingEvent = 'mengecap hasil fotokopi'; a.goTo('edit');
      });
    }
    if (E.data.ambil && a && a.diam && a.station === 'edit' && !E.data.cap) {
      pada(E, E.umur + 1.5, () => { E.data.cap = true; hentakkanStempel(a); a.bawa = null; });
    }
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

/* MIN_DI_LAYAR ditekan lewat minDiLayarTimpa, bukan MIN_DI_LAYAR langsung —
   nilai bawaannya harus selalu bisa dipulihkan walau event dibatalkan paksa
   (mis. server-side reload). durasi di sini SATU SIKLUS keliling, bukan
   sepanjang hari — dipicu ulang sendiri lewat bobot yang tinggi selama syarat
   tanggalnya masih benar. */
{
  id: 'hari-kejepit-nasional',
  kelas: 'panggung', bobot: B.sedang, cooldown: 300, durasi: 150,
  syarat: (S) => HARI_KEJEPIT.has(S.tanggal + '-' + (new Date().getMonth() + 1)),
  mulai() {
    minDiLayarTimpa = 1;
    RUANGAN.propLantai.push({ x: 446, y: 146, jenis: 'map-menunggu' });
  },
  tick(E, dt, S) {
    const urut = ['read', 'search', 'web', 'edit', 'server'];
    const idx = Math.min(urut.length - 1, Math.floor(E.umur / 25));
    // real agent didahulukan supaya balonnya benar-benar terlihat — standby
    // dibungkam total lewat Standby.say(), jadi kalau cuma dia yang ada,
    // eventnya tetap jalan tapi memang tanpa balon.
    const sendirian = S.orang.find((o) => !o.standby) || S.orang.find((o) => o.standby);
    if (sendirian && sendirian.station !== urut[idx] && !sendirian.path.length) sendirian.goTo(urut[idx]);
    pada(E, 4, () => { if (sendirian) sendirian.say('sepi ya hari ini'); });
  },
  selesai() {
    minDiLayarTimpa = null;
    const i = RUANGAN.propLantai.findIndex((p) => p.jenis === 'map-menunggu');
    if (i >= 0) RUANGAN.propLantai.splice(i, 1);
  },
},

{
  id: 'humas-buru-kutipan-kadis',
  kelas: 'latar', bobot: B.jarang, cooldown: 720, durasi: 20,
  syarat: (S) => S.orang.some((o) => o.peran === 'humas'),
  mulai(E, S) {
    const humas = S.orang.find((o) => o.peran === 'humas' && bisaDipinjam(o));
    if (!humas) return;
    humas.eventKerja = E; humas.betahAsli = humas.betah; humas.betah = true; E.aktor.push(humas);
    humas.doingEvent = 'mengejar kutipan kadis';
    humas.goToXY(452, 152, 'up');
  },
  tick(E) {
    const a = E.aktor[0];
    if (!a) return;
    MOD.pintuKadis = a.diam && E.umur < 10;
    pada(E, 1, () => a.say('satu kalimat saja, Pak, buat rilis'));
    pada(E, 6, () => { a.bawa = 'kertas'; a.doingEvent = 'membaca kutipan'; a.goToXY(30, 216, 'up'); });
    pada(E, 14, () => { a.bawa = null; });
  },
  selesai(E) { if (E.aktor[0]) E.aktor[0].bawa = null; },
},

);

/* Daftar hari kejepit sederhana: "tanggal-bulan". Cukup untuk demo/hiasan,
   tidak berusaha jadi kalender libur nasional yang akurat. */
const HARI_KEJEPIT = new Set(['2-5', '31-5', '9-6', '28-3', '3-1']);

