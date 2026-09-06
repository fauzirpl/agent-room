#!/usr/bin/env node
// uji-musik.mjs :: musik lofi kantor ikut suasana ruangan, dan tetap latar.
//
// Musiknya sekarang punya sebelas gaya (LOFI_GAYA di room.js) yang dipilih
// dari babak hari, cuaca, dan kesibukan sesi. Yang gampang rusak diam-diam di
// fitur seperti ini ada empat, dan empat-empatnya TIDAK melempar exception —
// musiknya cuma jadi salah, dan orang yang mendengarnya menyangka itu memang
// begitu:
//
//   1. Salah ketik nama nada. `nadaHz('H3')` mengembalikan 0 (sengaja), jadi
//      satu akor bisa kehilangan satu nada tanpa satu pun galat. Ujinya
//      menyisir SELURUH bank akor lewat musikGayaDari() dan menolak 0 Hz.
//   2. Babak hari baru ditambah di babakHari(), gayanya lupa didaftarkan.
//      Akibatnya jam itu jatuh ke 'kerja' — beat jam sepuluh pagi di jam
//      istirahat, tanpa tanda apa pun. Ujinya menyisir jam 0..24 dan menuntut
//      tiap babak yang keluar punya gayanya sendiri.
//   3. Nama drum salah ketik di tabel gaya. Fallback-nya 'penuh', jadi gaya
//      yang niatnya sunyi malah ramai. Dicocokkan ke musikDrumNama().
//   4. Dua gaya kembar. Kalau tempo/bank/drum/cutoff-nya persis sama, telinga
//      tidak akan pernah bisa membedakannya — barisnya ada di kode tapi tidak
//      ada di dunia. Ditolak sebagai duplikat.
//
// Plus satu janji yang bukan soal bug, tapi soal rasa: ini LATAR. Tidak ada
// gaya yang boleh naik melewati plafon volume, dan ayunan swing tidak boleh
// sampai membalik urutan langkah.
//
// Pemilih suasananya (musikSuasanaDari) sengaja fungsi murni dari fakta yang
// dioper, jadi seluruh kombinasi bisa diuji tanpa memalsukan satu ruangan
// penuh agen — yang diperiksa di sini aturannya, bukan kebetulan satu potret.
//
// Pakai:
//   node uji-musik.mjs

import { muatKonteks, merah, hijau, tebal } from './uji-event.mjs';

let gagal = 0;
const lulus = (t) => console.log('  ' + hijau('✓') + ' ' + t);
const tolak = (t, ket) => { gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const periksa = (ok, t, ket) => (ok ? lulus(t) : tolak(t, ket));

const ctx = muatKonteks();
const { nadaHz, musikGayaNama, musikDrumNama, musikGayaDari, musikSuasanaDari, babakHari } = ctx;
const NAMA = musikGayaNama();
const DRUM = musikDrumNama();

console.log(tebal('\nMusik lofi: gayanya ikut suasana ruangan'));

/* ------------------------------------------------------------ nama nada -- */
{
  const dekat = (a, b) => Math.abs(a - b) < 0.01;
  periksa(dekat(nadaHz('A4'), 440) && dekat(nadaHz('C4'), 261.63) && dekat(nadaHz('A#2'), 116.54),
    'nadaHz(): A4 = 440 Hz, C4 = 261,63 Hz, A#2 = 116,54 Hz');
  periksa(nadaHz('H3') === 0 && nadaHz('C') === 0 && nadaHz('') === 0,
    'nadaHz(): nama yang tidak dikenal jadi 0 Hz, bukan NaN yang menular ke seluruh akor');
}

/* ---------------------------------------------------- semua bank berbunyi - */
{
  const rusak = [];
  for (const nama of NAMA) {
    const g = musikGayaDari(nama);
    if (!Array.isArray(g.kord) || !g.kord.length) { rusak.push(`${nama}: bank '${g.bank}' tidak ada`); continue; }
    g.kord.forEach((k, i) => {
      if (!Array.isArray(k) || k.length < 3) { rusak.push(`${nama} akor #${i}: kurang dari 3 nada`); return; }
      k.forEach((f, j) => {
        if (!Number.isFinite(f) || f <= 0) rusak.push(`${nama} akor #${i} nada #${j}: ${f} Hz (nama nada salah ketik?)`);
        else if (f < 40 || f > 1200) rusak.push(`${nama} akor #${i} nada #${j}: ${f.toFixed(1)} Hz di luar jangkauan pad`);
      });
      for (let j = 1; j < k.length; j++) {
        if (k[j] <= k[j - 1]) rusak.push(`${nama} akor #${i}: nada #${j} tidak lebih tinggi dari sebelumnya`);
      }
    });
  }
  periksa(!rusak.length, `${NAMA.length} gaya, semua akornya berbunyi dan tersusun naik`, rusak.join('; '));
}

/* ------------------------------------------- tiap babak hari punya gayanya - */
{
  const babak = new Set();
  const rabu = new Date(2026, 3, 15);      // hari kerja, bukan libur nasional
  for (let jam = 0; jam < 24; jam += 0.25) babak.add(babakHari(jam, rabu));
  const yatim = [...babak].filter((b) => !NAMA.includes(b));
  periksa(!yatim.length,
    `${babak.size} babak hari (${[...babak].join(', ')}) semuanya punya gaya musik sendiri`,
    yatim.length ? `babak tanpa gaya: ${yatim.join(', ')} — tambahkan barisnya di LOFI_GAYA (room.js), jangan biarkan jatuh ke 'kerja'` : '');
}

/* ---------------------------------------------------------- tabel gayanya - */
{
  const drumAsing = NAMA.filter((n) => !DRUM.includes(musikGayaDari(n).drum));
  periksa(!drumAsing.length, `semua gaya memakai pola drum yang terdaftar (${DRUM.join('/')})`,
    drumAsing.length ? `salah ketik: ${drumAsing.map((n) => n + ' -> ' + musikGayaDari(n).drum).join(', ')}` : '');

  const sidik = new Map();
  const kembar = [];
  for (const n of NAMA) {
    const g = musikGayaDari(n);
    const s = [g.bank, g.bpm, g.drum, g.cut].join('|');
    if (sidik.has(s)) kembar.push(`${sidik.get(s)} == ${n} (${s})`); else sidik.set(s, n);
  }
  periksa(!kembar.length, 'tidak ada dua gaya yang kembar — tiap suasana benar-benar kedengaran beda',
    kembar.join('; '));

  const liar = [];
  for (const n of NAMA) {
    const g = musikGayaDari(n, { hujan: 0.5, sibuk: 9 });   // kombinasi paling ekstrem yang tidak ganti gaya
    if (g.pad > 1.3) liar.push(`${n}: pad ${g.pad}`);
    if (g.bass > 0.8) liar.push(`${n}: bass ${g.bass}`);
    if (g.kilau > 0.8) liar.push(`${n}: kilau ${g.kilau}`);
    if (g.kresek > 2.5) liar.push(`${n}: kresek ${g.kresek}`);
    if (g.bpm < 50 || g.bpm > 100) liar.push(`${n}: ${g.bpm} bpm`);
    if (g.ayun >= 0.5) liar.push(`${n}: ayun ${g.ayun} (langkah bisa jadi nol/negatif)`);
    if (!(g.langkahDur > 0.1 && g.langkahDur < 0.35)) liar.push(`${n}: langkahDur ${g.langkahDur}`);
  }
  periksa(!liar.length, 'semua gaya tetap latar: volume, tempo, dan ayunannya di dalam pagar',
    liar.join('; '));
}

/* ------------------------------------------------------ urutan prioritas -- */
{
  const semua = [];
  for (const babak of NAMA) {
    for (const hujan of [0, 0.3, 0.6, 1]) {
      for (const sibuk of [0, 2, 5]) {
        for (const tunggu of [0, 1, 3]) {
          for (const gagal2 of [0, 2, 4]) {
            for (const petir of [false, true]) semua.push({ babak, hujan, petir, sibuk, tunggu, gagal: gagal2 });
          }
        }
      }
    }
  }
  const asing = semua.map(musikSuasanaDari).filter((n) => !NAMA.includes(n));
  periksa(!asing.length, `${semua.length} kombinasi fakta ruangan, semuanya jatuh ke gaya yang ada`,
    [...new Set(asing)].join(', '));

  periksa(semua.filter((f) => f.petir).every((f) => musikSuasanaDari(f) === 'badai'),
    'petir mengalahkan apa pun: selalu badai');
  periksa(musikSuasanaDari({ babak: 'malam', gagal: 4 }) === 'tegang'
    && musikSuasanaDari({ babak: 'kerja', hujan: 1, tunggu: 3 }) === 'tegang',
    'sesi yang macet/menunggu mengalahkan cuaca dan jam dinding');
  periksa(musikSuasanaDari({ babak: 'lembur', hujan: 0.6 }) === 'hujan'
    && musikSuasanaDari({ babak: 'lembur', hujan: 0.5 }) === 'lembur',
    'hujan deras (>= 0,55) mengambil alih; gerimis tidak');
  periksa(musikSuasanaDari({ babak: 'kerja', sibuk: 5 }) === 'gaduh'
    && musikSuasanaDari({ babak: 'malam', sibuk: 9 }) === 'malam',
    "'gaduh' cuma muncul di jam kerja — lembur ramai tetap kedengaran lembur");
  periksa(musikSuasanaDari({}) === 'kerja' && musikSuasanaDari({ babak: 'entah' }) === 'kerja',
    "babak yang tidak dikenal jatuh ke 'kerja', bukan ke undefined");
}

/* --------------------------------------------- gerimis & kesibukan halus -- */
{
  const kering = musikGayaDari('kerja');
  const gerimis = musikGayaDari('kerja', { hujan: 0.3 });
  periksa(gerimis.nama === 'kerja' && gerimis.cut < kering.cut && gerimis.kresek > kering.kresek,
    'gerimis tidak mengganti gaya, cuma menutup pad dan menebalkan desis vinyl',
    `cut ${kering.cut}->${gerimis.cut}, kresek ${kering.kresek}->${gerimis.kresek}`);

  const sepi = musikGayaDari('kerja', { sibuk: 0 });
  const rame = musikGayaDari('kerja', { sibuk: 2 });
  const rameSekali = musikGayaDari('kerja', { sibuk: 20 });
  periksa(rame.bpm > sepi.bpm && rameSekali.bpm - sepi.bpm <= 6
    && rameSekali.langkahDur < sepi.langkahDur,
    'kesibukan menaikkan denyut, tapi ada plafonnya (maks +6 bpm)',
    `${sepi.bpm} -> ${rame.bpm} -> ${rameSekali.bpm} bpm`);

  const hujanGaya = musikGayaDari('hujan', { hujan: 1 });
  periksa(hujanGaya.cut === musikGayaDari('hujan').cut,
    "gaya 'hujan'/'badai' tidak kena potongan cutoff dua kali");
}

/* ------------------------------------------------------- potret sungguhan - */
{
  // Jalur lengkapnya sekali: baca ruangan sungguhan (jam palsu harness, cuaca
  // kering, nol agen) -> nama gaya -> gaya siap main. Yang dijaga cuma bahwa
  // rangkaiannya nyambung; aturannya sudah diuji satu-satu di atas.
  const g = ctx.musikGayaKini();
  periksa(NAMA.includes(g.nama) && Array.isArray(g.kord) && g.kord.length > 0 && g.langkahDur > 0,
    `musikGayaKini() merakit gaya utuh dari ruangan sungguhan (dapat '${g.nama}', ${g.bpm} bpm)`);
}

console.log();
if (gagal) { console.log(merah(tebal(`${gagal} pemeriksaan gagal`))); process.exit(1); }
console.log(hijau(tebal('semua pemeriksaan musik lulus')));
