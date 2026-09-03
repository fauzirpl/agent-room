#!/usr/bin/env node
// uji-tenggat.mjs :: penjaga satu kelas bug yang tidak bisa dilihat harness lain.
//
// `pada(E, detik, fn)` di room.js berbunyi:
//     if (E.umur < detik || E.tanda.has(detik)) return false;
// Jadi `pada(E, E.umur + 1.5, fn)` SELALU rugi: `E.umur < E.umur + 1.5` benar
// di setiap frame, sehingga fn TIDAK PERNAH dipanggil. Tidak ada exception,
// tidak ada NaN, tidak ada peringatan — event tetap "ok" di uji-event.mjs.
// Yang hilang cuma akibatnya: cap yang tidak pernah turun, lampu absen yang
// menggantung merah, tamu yang tidak pernah pulang, kabel yang tidak pernah
// rapi. Lima kejadian nyata pernah lolos ke main branch seperti itu.
//
// Dua lapis pemeriksaan di sini:
//   1. LINT — pindai semua public/event/*.js untuk pola `pada(E, E.umur ...)`
//      dan `pada(E, <apa pun yang memuat E.umur> ...)` di KODE (komentar
//      dilewati). Ini yang menahan seluruh kelas bug itu, bukan cuma lima
//      kejadian yang sudah diperbaiki.
//   2. AKIBAT — untuk lima event yang dulu rusak, jalankan tick() sepanjang
//      durasinya lewat sandbox uji-event.mjs dan pastikan akibat yang
//      dijanjikan definisinya BENAR-BENAR terjadi (RUANGAN berubah, E.data
//      terisi, fase tamu berganti), plus tidak ada aktor terlantar.
//
// Pakai:
//   node uji-tenggat.mjs           lint + akibat
//   node uji-tenggat.mjs --lint    cuma lint (cepat, tanpa sandbox)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  muatKonteks, bacaEventAcak, buatE, buatS, buatPristine, resetRuangan,
  EVENT_ACAK_DIR, merah, hijau, kuning, abu, tebal,
} from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let gagal = 0;
const lulus = (t) => console.log('  ' + hijau('✓') + ' ' + t);
const tolak = (t, ket) => { gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };

/* ------------------------------------------------------------------ lint --- */
// Buang komentar baris & blok dulu supaya penjelasan "dulu ditulis pada(E,
// E.umur + 1, ..)" di atas kode yang SUDAH diperbaiki tidak ikut kena.
function tanpaKomentar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, ' '));
}

function lint() {
  console.log(tebal('\nLint: pada() dengan tenggat bergerak'));
  const berkas = fs.readdirSync(EVENT_ACAK_DIR).filter((f) => f.endsWith('.js')).sort();
  let temuan = 0;
  for (const f of berkas) {
    const src = tanpaKomentar(fs.readFileSync(path.join(EVENT_ACAK_DIR, f), 'utf8'));
    const baris = src.split('\n');
    baris.forEach((teks, i) => {
      // argumen kedua pada( ... ) yang memuat E.umur / .umur
      const m = teks.match(/\bpada\s*\(\s*E\s*,([^,]*)/);
      if (m && /\bE?\.?umur\b/.test(m[1])) {
        temuan++;
        tolak(`${f}:${i + 1} tenggat pada() ikut bergerak: pada(E,${m[1].trim()}, ...)`,
          'simpan tenggatnya SEKALI di E.data lalu bandingkan manual (if (E.data.xPada && E.umur > E.data.xPada))');
      }
    });
  }
  if (!temuan) lulus(`${berkas.length} berkas event: tidak ada pada() bertenggat bergerak`);
  return temuan;
}

/* ---------------------------------------------------------------- akibat --- */
// Tiap kasus: id event, keadaan awal yang dipaksa, dan pemeriksa akibat.
// `jalankan` mengembalikan { E, ctx } sesudah tick() sepanjang durasi.
const KASUS = [
  {
    id: 'absen-fingerprint',
    judul: 'absen-fingerprint: LED merah padam sendiri & tidak ada aktor terlantar',
    jam: 7.5, ramai: true,
    periksa({ E, ctx, S }) {
      const { RUANGAN } = ctx.__jembatan__;
      // Semua orang yang eventKerja-nya menunjuk E WAJIB masih ada di E.aktor,
      // kalau tidak dia tidak akan pernah dilepas matikanEvent() dan betah-nya
      // menggantung selamanya (bug q.shift() tanpa lepaskanAktor).
      const terlantar = S.orang.filter((o) => o.eventKerja === E && !E.aktor.includes(o));
      if (terlantar.length) return `${terlantar.length} aktor dipegang event tapi sudah keluar dari E.aktor`;
      if (RUANGAN.absensiMerah && !E.data.merahSampai) return 'absensiMerah menggantung tanpa tenggat';
      return null;
    },
  },
  {
    id: 'auditor-catat-temuan-rak-server',
    judul: 'auditor-catat-temuan-rak-server: kabel benar-benar jadi rapi',
    jam: 10, ramai: true,
    periksa({ E, ctx }) {
      if (!E.data.teknisi) return null;                 // tidak ada teknisi: memang tidak dijanjikan
      if (!ctx.__jembatan__.RUANGAN.kabelRapi) return 'teknisi dipanggil tapi RUANGAN.kabelRapi tetap false';
      return null;
    },
  },
  {
    id: 'fotokopi-kilat',
    judul: 'fotokopi-kilat: capnya benar-benar turun',
    jam: 10, ramai: true,
    siap({ ctx, S }) {
      // Event ini baru mengecap kalau pemerannya sampai di meja stempel.
      // Fixture-nya tidak menggerakkan orang, jadi dipaksa di sini.
      for (const o of S.orang) { o.station = 'edit'; o.path = []; }
    },
    periksa({ E }) {
      if (!E.data.ambil) return null;                   // belum sampai tahap ambil kertas
      if (!E.data.cap) return 'sudah di meja stempel sepanjang durasi tapi E.data.cap tidak pernah true';
      return null;
    },
  },
  {
    id: 'sppd-turun',
    judul: 'sppd-turun: koper dilepas setelah kembali',
    jam: 10, ramai: true,
    periksa({ E }) {
      if (!E.data.kembali) return null;                 // durasinya belum sampai fase kembali
      if (E.data.koperPada == null) return 'fase kembali jalan tapi tenggat koperPada tidak pernah dipasang';
      return null;
    },
  },
  {
    id: 'tamu-nyasar',
    judul: 'tamu-nyasar: tamunya benar-benar pulang',
    jam: 10, ramai: true,
    periksa({ E }) {
      const T = E.data.t;
      if (!T) return 'E.data.t hilang';
      if (!E.data.a) return null;                       // tidak ada yang membantu: memang tetap bingung
      if (E.data.tunjukPada == null) return 'sudah ditunjukkan arah tapi tenggat tunjukPada tidak dipasang';
      if (T.fase !== 'keluar') return `sudah ditunjukkan arah + tenggat lewat, tapi fase masih '${T.fase}'`;
      return null;
    },
  },
];

function jalankanKasus(ctx, pristine, k) {
  // WAJIB lewat __jembatan__: EVENT_ACAK/eventById/MOD/RUANGAN adalah const
  // di room.js, jadi TIDAK jadi properti objek konteks vm — `ctx.eventById`
  // kebetulan menabrak global lain dan mengembalikan objek yang salah.
  const def = ctx.__jembatan__.eventById.get(k.id);
  if (!def) return `id '${k.id}' tidak terdaftar`;
  resetRuangan(ctx, pristine);
  const S = buatS(ctx, { jam: k.jam, hujan: 0, petir: false, ramai: k.ramai });
  ctx.__jembatan__.setS(S);
  const E = buatE(def);
  if (k.siap) k.siap({ ctx, S, E });
  try {
    if (def.mulai) def.mulai(E, S);
    const dt = 0.25;
    for (let t = 0; t < (def.durasi || 10); t += dt) {
      E.umur += dt; E.sisa -= dt;
      if (def.tick) def.tick(E, dt, S);
    }
    const hasil = k.periksa({ E, ctx, S });
    if (def.selesai) def.selesai(E, S);
    return hasil;
  } catch (e) {
    return 'exception: ' + e.message;
  }
}

/* ------------------------------------------- pemeran yang sudah direbut --- */
// Aturan pertama proyek: tool call sungguhan SELALU menang atas event acak.
// handle() memanggil lepasDariEvent() → lepaskanAktor(). Tapi potret pemeran
// yang disimpan event sendiri (E.data.a, E.data.antre, variabel tangkapan)
// tidak ikut terpangkas, sementara perintah tertunda tetap jalan beberapa
// detik kemudian — ruangan lalu menyeret pegawai yang di panel jelas-jelas
// sedang mengerjakan tool call, atau melempar karena orangnya sudah undefined.
//
// Ujinya semantik, bukan regex: jalankan mulai(), REBUT semua pemeran, lalu
// tick() sampai habis dan hitung berapa kali event masih menyuruh mereka
// bergerak. Meminjam ulang orang yang sudah bebas itu SAH, jadi yang dihitung
// hanya perintah yang datang selagi orangnya bukan milik event ini.
function ujiDirebut(ctx, pristine) {
  console.log(tebal('\nRebutan: event berhenti menyuruh pemeran yang direbut tool call'));
  const { eventById } = ctx.__jembatan__;
  let diuji = 0;
  const kena = [];
  for (const [id, def] of eventById) {
    resetRuangan(ctx, pristine);
    const S = buatS(ctx, { jam: 10, hujan: 0, petir: false, ramai: true });
    ctx.__jembatan__.setS(S);
    const E = buatE(def);
    try { if (def.mulai) def.mulai(E, S); } catch (e) { continue; }
    // Banyak event baru meminjam pemerannya di tick(), bukan di mulai() —
    // versi pertama uji ini melewatkan mereka semua ("if (!E.aktor.length)
    // continue" tepat sesudah mulai) dan dua bug nyata lolos karenanya.
    // Jalankan dulu sepertiga durasinya supaya peminjaman menyusul ikut kena.
    const dtAwal = 0.25;
    try {
      for (let t = 0; t < (def.durasi || 10) / 3 && !E.aktor.length; t += dtAwal) {
        E.umur += dtAwal; E.sisa -= dtAwal;
        if (def.tick) def.tick(E, dtAwal, S);
      }
    } catch (e) { continue; }
    if (!E.aktor.length) continue;                 // benar-benar tidak meminjam siapa pun
    diuji++;
    const dilepas = [...E.aktor];
    const dipanggil = [];
    for (const a of dilepas) {
      a.goTo = () => { if (a.eventKerja !== E) dipanggil.push('goTo'); };
      a.goToXY = () => { if (a.eventKerja !== E) dipanggil.push('goToXY'); };
    }
    // Direbut tool call sungguhan: bukan cuma dilepas, tapi juga langsung
    // punya tugas — itu yang membuat "menyeretnya balik" jadi kebohongan.
    try {
      for (const a of dilepas) { ctx.lepaskanAktor(a); a.adaTugas = true; a.state = 'work'; }
    } catch (e) { /* abaikan */ }
    try {
      const dt = 0.25;
      for (let t = E.umur; t < (def.durasi || 10); t += dt) {
        E.umur += dt; E.sisa -= dt;
        if (def.tick) def.tick(E, dt, S);
      }
      if (def.selesai) def.selesai(E, S);
    } catch (e) {
      kena.push([id, 'melempar sesudah pemerannya direbut: ' + e.message]);
      continue;
    }
    if (dipanggil.length) kena.push([id, `masih menyuruh jalan ${dipanggil.length}x sesudah direbut`]);
  }
  if (!kena.length) { lulus(`${diuji} event peminjam aktor: semua berhenti menyuruh begitu pemerannya direbut`); return; }
  for (const [id, ket] of kena) {
    tolak(`${id}: ${ket}`,
      'saring dengan masihMain(E, a) / yangMasihMain(E, daftar) / pangkasLepas(E, antrean) dari 00-dasar.js sebelum menyuruh siapa pun bergerak');
  }
}

/* ------------------------------------------------------------------ main --- */
const hanyaLint = process.argv.includes('--lint');
lint();

if (!hanyaLint) {
  console.log(tebal('\nAkibat: tenggat yang dijanjikan definisi event benar-benar terjadi'));
  const ctx = muatKonteks();
  const pristine = buatPristine(ctx);
  for (const k of KASUS) {
    const ket = jalankanKasus(ctx, pristine, k);
    if (ket) tolak(k.judul, ket); else lulus(k.judul);
  }
  ujiDirebut(ctx, pristine);
}

console.log();
if (gagal) { console.log(merah(tebal(`${gagal} pemeriksaan gagal`))); process.exit(1); }
console.log(hijau(tebal('semua pemeriksaan tenggat lulus')));
