#!/usr/bin/env node
/* uji-skp.mjs :: papan SKP menilai MUTU, bukan cuma volume.
 *
 * Sampai kemarin `/skp` cuma menjumlah: tool call, gagal, durasi, tertahan.
 * Dua ratus tool call yang rapi dan dua ratus tool call karena mengulang Edit
 * yang sama empat puluh kali terlihat persis sama di papan. Sekarang ada lima
 * sumbu perilaku dan satu nilai gabungan 0-100 — dan justru karena itu sebuah
 * angka, dia gampang sekali salah tanpa ada yang sadar.
 *
 * Uji KOTAK HITAM, nol dependency, nol jaringan: `server.mjs` dinyalakan
 * sebagai proses sendiri di port bebas dengan SELURUH env data diarahkan ke
 * folder sementara. Buku agendanya DITULIS SENDIRI oleh uji ini baris demi
 * baris, jadi tiap angka yang keluar punya jawaban yang sudah diketahui
 * sebelum servernya ditanya. Berkas data sungguhan tidak pernah disentuh.
 *
 * ---------------------------------------------------------------------------
 * Yang dijaga, dan kenapa masing-masing pantas dijaga:
 *
 *  1. Sesi bersih bernilai PENUH. Kalau tidak, seluruh sisa papan tidak punya
 *     titik nol yang berarti.
 *  2. Tiap sumbu menurunkan nilai SENDIRI-SENDIRI dan MONOTON. Sumbu yang
 *     tidak bergerak adalah sumbu yang tidak ada; sumbu yang bergerak
 *     bersama-sama berarti rumusnya bocor antar-sumbu.
 *  3. Di atas titik jenuh, nilainya BERHENTI turun. Hukuman tak berbatas
 *     membuat satu sesi buruk menenggelamkan seluruh rentang.
 *  4. Sumbu yang TIDAK TERUKUR tidak menyamar jadi nol. Ini yang membedakan
 *     "bersih" dari "tidak ada yang bisa dilihat": bobotnya dikeluarkan dari
 *     pembagi, dan `bobotDipakai` menyebut namanya.
 *  5. Bolak-balik cuma dihitung dari label yang LAYAK dibandingkan. Label yang
 *     ditutup '…' oleh clip() dan label tool MCP (isinya nama server saja)
 *     tidak boleh dianggap kembar. Tanpa pagar ini, indikatornya mengukur
 *     tabrakan label, bukan pengulangan — di empat hari data nyata bedanya
 *     p50 19% (salah) lawan p50 8,9% (benar).
 *  6. Rapat yatim ditutup di `session-end` SAJA, bukan di `stop`. `stop`
 *     terbit tiap giliran selesai; memakainya sebagai batas melaporkan 136
 *     yatim di hari sungguhan padahal yang sungguhan 35. Kasus 7 adalah
 *     penjaga regresi khusus untuk itu.
 *  7. Ctrl+C tidak menghukum dua kali. `interupsi` cuma diset waktu tool
 *     gagal, jadi event yang sama SUDAH masuk `gagal`. Nilainya dihitung dari
 *     `gagalBersih` = gagal - interupsi, dan sesi yang dihentikan pemiliknya
 *     harus bernilai LEBIH TINGGI daripada sesi yang alatnya benar-benar
 *     rusak. Sikap itu sudah tertulis di server.mjs dan room.js.
 *  8. Bentuk LAMA /skp tidak berubah. `skpGambar()` dan `notaMingguanHTML()`
 *     membacanya; field baru boleh, field lama tidak boleh hilang atau
 *     berganti arti.
 *  9. Kerja sementara (ring pengulangan, Set rapat terbuka, stempel tahan)
 *     tidak ikut ke respons. Set yang lolos JSON.stringify jadi `{}` tanpa
 *     memberi tahu siapa pun.
 * 10. Agregat proyek konsisten dengan sesi-sesinya, dan cache 30 detik
 *     menjawab hal yang sama.
 * 11. Hari SUNGGUHAN dikunci golden. Ditulis terang di sini: hari itu tidak
 *     memuat satu pun `interupsi` maupun objek `butuh`, jadi yang benar-benar
 *     dikunci golden cuma bolak-balik, gagal beruntun, rapat yatim, dan
 *     tool-per-prompt. `durasiRata` null di sana karena BIDANG_BUANG di
 *     buat-fixture.mjs membuang `durasi` — itu benar, bukan bug.
 *
 * Pakai:
 *   node uji-skp.mjs              jalankan semua kasus
 *   node uji-skp.mjs --perbarui   tulis ulang uji-skp.golden.json dengan sengaja
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { muatFixture } from './buat-fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const GOLDEN = path.join(__dirname, 'uji-skp.golden.json');
const PERBARUI = process.argv.includes('--perbarui');

const warna = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (n) => (s) => (warna ? '\x1b[' + n + 'm' + s + '\x1b[0m' : s);
const merah = c(31); const hijau = c(32); const abu = c(90); const tebal = c(1);

let periksa = 0; let gagal = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => { periksa++; gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const catatan = (t) => console.log('  ' + abu('! ' + t));
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

function portBebas(mulai) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () => resolve(portBebas(mulai + 1)));
    s.once('listening', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.listen(mulai, '127.0.0.1');
    setTimeout(() => reject(new Error('portBebas menggantung')), 5000).unref?.();
  });
}

const ENV_DATA = (dir) => ({
  AGENT_ROOM_FORMASI: path.join(dir, 'formasi.json'),
  AGENT_ROOM_BUKU_INDUK: path.join(dir, 'buku-induk.json'),
  AGENT_ROOM_AGENDA_DIR: path.join(dir, 'agenda'),
  AGENT_ROOM_TUNDA_DIR: path.join(dir, 'tunda'),
  AGENT_ROOM_TOKEN_LOG: path.join(dir, 'token-riwayat.jsonl'),
  AGENT_ROOM_KLIPING_LOG: path.join(dir, 'kliping.jsonl'),
  AGENT_ROOM_PAGU: path.join(dir, 'pagu.json'),
  AGENT_ROOM_NAMA: path.join(dir, 'nama.json'),
  AGENT_ROOM_SUARA: path.join(dir, 'suara.json'),
  AGENT_ROOM_SUARA_KUNCI: path.join(dir, '.agent-room-suara-kunci'),
  AGENT_ROOM_SUARA_DIR: path.join(dir, 'suara'),
  AGENT_ROOM_SOP: path.join(dir, 'sop.json'),
  AGENT_ROOM_LOKET: path.join(dir, 'loket.json'),
});

let kantor = null;

async function bukaKantor(dir, tambahan = {}) {
  const port = await portBebas(4860);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  Object.assign(env, {
    AGENT_ROOM_PORT: String(port), AGENT_ROOM_HOST: '127.0.0.1',
    AGENT_ROOM_CUACA: 'off', AGENT_ROOM_LAPOR: '',
  }, ENV_DATA(dir), tambahan);

  const proc = spawn(process.execPath, [SERVER], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const k = { proc, port, dir, alamat: 'http://127.0.0.1:' + port, log: '' };
  kantor = k;
  proc.stdout.setEncoding('utf8'); proc.stdout.on('data', (s) => { k.log += s; });
  proc.stderr.setEncoding('utf8'); proc.stderr.on('data', (s) => { k.log += s; });

  const batas = Date.now() + 20000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error('server mati saat start:\n' + k.log);
    try { const r = await fetch(k.alamat + '/health'); if (r.ok) { await r.arrayBuffer(); break; } } catch { /* belum */ }
    if (Date.now() > batas) throw new Error('server tidak menjawab /health dalam 20 detik');
    await tidur(120);
  }
  return k;
}

function tutupKantor() {
  if (!kantor) return;
  try { kantor.proc.kill(); } catch { /* sudah mati */ }
  kantor = null;
}

/* ————— buku agenda sintetis ————— */

/* Versi skema dibaca dari server.mjs, bukan ditulis angka di sini: baris yang
   versinya lebih tua diam-diam dimigrasi dan yang lebih baru diam-diam
   dibuang, jadi angka yang basi di sini akan membuat seluruh harness hijau
   di atas nol baris. */
function skemaAgenda() {
  const src = fs.readFileSync(SERVER, 'utf8');
  const m = /const SKEMA = \{[^}]*agenda:\s*(\d+)/.exec(src);
  if (!m) throw new Error('SKEMA.agenda tidak ketemu di server.mjs — bentuknya berubah?');
  return Number(m[1]);
}
const V = skemaAgenda();

const hariKe = (n) => {
  const d = new Date(Date.now() - n * 24 * 3600 * 1000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};

/* Satu sesi kanonik, dirakit dari tombol-tombol yang saling lepas supaya tiap
   kasus bisa menggerakkan SATU sumbu saja dan membiarkan sisanya diam. */
function bikinSesi(o) {
  const {
    sesi, cwd = 'proyek-uji', tanggal,
    panggilan = 20,            // jumlah pasangan pre/post
    gagalIndeks = [],          // panggilan ke berapa yang ok:false
    interupsiIndeks = [],      // di antara yang gagal, mana yang Ctrl+C
    ulang = 0,                 // berapa pre pertama yang labelnya diulang
    labelGaya = 'biasa',       // 'biasa' | 'potong' | 'mcp'
    tertahan = 0,              // berapa event izin-minta
    rapat = 0, rapatTutup = 0, // subagent-start / subagent-stop
    stopDiTengah = false,      // sisipkan `stop` sebelum rapatnya ditutup
    sesiSelesai = true,        // tulis session-end
    prompt = 1,
  } = o;
  const baris = [];
  let n = 0;
  const dasar = Date.parse(tanggal + 'T02:00:00');
  const tulis = (b) => { baris.push({ v: V, id: sesi + '-' + n, ts: dasar + (n++) * 1000, session: sesi, cwd, ...b }); };

  for (let i = 0; i < prompt; i++) tulis({ kind: 'prompt', ok: true });
  for (let i = 0; i < tertahan; i++) tulis({ kind: 'izin-minta', ok: true });
  for (let i = 0; i < rapat; i++) tulis({ kind: 'subagent-start', agenId: sesi + '-agen-' + i, ok: true });
  if (stopDiTengah) tulis({ kind: 'stop', ok: true });
  for (let i = 0; i < rapatTutup; i++) tulis({ kind: 'subagent-stop', agenId: sesi + '-agen-' + i, ok: true });

  const gagalSet = new Set(gagalIndeks);
  const intSet = new Set(interupsiIndeks);
  for (let i = 0; i < panggilan; i++) {
    // `ulang` pertama memakai label yang sama persis dan BERURUTAN, jadi
    // semuanya jatuh di dalam jendela pengulangan berapa pun panjangnya
    const ke = i < ulang + 1 ? 0 : i;
    let tool = 'Read'; let label = 'berkas-' + ke + '.js';
    if (labelGaya === 'potong') label = 'perintah panjang yang sama sekali tidak muat ' + ke + '…';
    if (labelGaya === 'mcp') { tool = 'mcp__Alat_Uji__jalan'; label = 'Alat_Uji · jalan'; }
    tulis({ kind: 'pre', tool, label, ok: true });
    const b = { kind: 'post', tool, label, ok: !gagalSet.has(i), durasi: 100 };
    if (gagalSet.has(i)) { b.galat = 'gagal-uji'; if (intSet.has(i)) b.interupsi = true; }
    tulis(b);
  }
  if (sesiSelesai) tulis({ kind: 'session-end', ok: true });
  return baris;
}

function tulisHari(dir, tanggal, sesiDaftar) {
  const agenda = path.join(dir, 'agenda');
  fs.mkdirSync(agenda, { recursive: true });
  const baris = sesiDaftar.flatMap((s) => bikinSesi({ ...s, tanggal }));
  baris.sort((a, b) => a.ts - b.ts);
  fs.writeFileSync(path.join(agenda, tanggal + '.jsonl'), baris.map((b) => JSON.stringify(b)).join('\n') + '\n');
  return baris.length;
}

const ambilSkp = async (k, tgl) => {
  const r = await fetch(k.alamat + '/skp?dari=' + tgl + '&sampai=' + tgl);
  if (!r.ok) throw new Error('/skp ' + r.status);
  return r.json();
};
/* Server memotong id sesi; yang dicari di sini id PENUH yang ditulis uji,
   jadi cocoknya diperiksa terbalik — id server harus jadi awalan id penuh.
   Membandingkan 12 karakter pertama pernah menyatukan empat sesi berbeda. */
const sesiDari = (d, id) => (d.sesi || []).find((s) => s.sesi.length && id.startsWith(s.sesi));

/* ————— kasus ————— */

async function jalan() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-skp-'));

  /* Semua skenario ditulis DULU, masing-masing di tanggalnya sendiri. Rentang
     yang berbeda = kunci cache yang berbeda, jadi kasus tidak saling menyela
     lewat cache 30 detik yang memang sengaja ada di server. */
  const H = {};
  let hari = 1;
  const pakai = (nama) => (H[nama] = hariKe(hari++));

  tulisHari(dir, pakai('bersih'), [{ sesi: 'bersih-000001', rapat: 2, rapatTutup: 2 }]);

  /* Empat tingkat per sumbu: bersih · di bawah jenuh · lewat jenuh · jauh
     lewat jenuh. Yang bikin ini tidak sepele: beberapa sumbu TERIKAT secara
     struktural — tidak ada rentetan gagal tanpa gagal, dan tidak ada gagal
     tanpa rentetan minimal satu. Jadi tingkat 1-3 tiap sumbu sengaja dirancang
     supaya SEMUA sumbu lain persis sama di ketiganya:
       rasioGagal    kegagalannya selang-seling, rentetannya tetap 1
       gagalBeruntun jumlah gagalnya tetap delapan, cuma susunannya berubah
       rapatYatim    rapat yang dibuka tetap empat, cuma yang ditutup berubah
     Tingkat 0 (bersih) memang beda di sumbu terikat itu, dan itu diakui: yang
     dibandingkan "sumbu lain diam" cuma tingkat 1-3. */
  const TINGKAT = {
    rasioGagal: [
      { gagalIndeks: [] },                                          // 0%
      { gagalIndeks: [0] },                                         // 5%   di bawah jenuh 10
      { gagalIndeks: [0, 2, 4] },                                   // 15%  lewat
      { gagalIndeks: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18] },         // 50%  jauh lewat
    ],
    bolakBalik: [{ ulang: 0 }, { ulang: 3 }, { ulang: 8 }, { ulang: 15 }],
    // per 100 tool call, jadi penyebutnya dibuat 100 supaya angkanya terbaca apa adanya
    tertahan: [{ tertahan: 0 }, { tertahan: 2 }, { tertahan: 5 }, { tertahan: 20 }],
    gagalBeruntun: [
      { gagalIndeks: [] },                                          // rentetan 0
      { gagalIndeks: [0, 2, 4, 6, 8, 10, 12, 14] },                 // rentetan 1
      { gagalIndeks: [0, 1, 2, 3, 4, 5, 10, 12] },                  // rentetan 6, gagal tetap 8
      { gagalIndeks: [0, 1, 2, 3, 4, 5, 6, 7] },                    // rentetan 8, gagal tetap 8
    ],
    rapatYatim: [
      { rapat: 4, rapatTutup: 4 },                                  // 0%
      { rapat: 4, rapatTutup: 3 },                                  // 25%  di bawah jenuh 50
      { rapat: 4, rapatTutup: 1 },                                  // 75%  lewat
      { rapat: 4, rapatTutup: 0 },                                  // 100% jauh lewat
    ],
  };
  /* Id sesi dipotong server, jadi yang membedakan tingkat harus jatuh di
     awal: `gagalBeruntun` 13 karakter dan keempat tingkatnya sempat berbagi
     12 karakter pertama — empat sesi berbeda terbaca sebagai satu. */
  const idTingkat = (nama, i) => (nama.slice(0, 8) + '-' + i + '-000000').slice(0, 14);
  for (const [nama, daftar] of Object.entries(TINGKAT)) {
    tulisHari(dir, pakai(nama), daftar.map((setel, i) => ({
      sesi: idTingkat(nama, i), cwd: 'p-' + nama + '-' + i,
      panggilan: nama === 'tertahan' ? 100 : 20,
      rapat: 1, rapatTutup: 1, ...setel,
    })));
  }

  tulisHari(dir, pakai('buta'), [
    { sesi: 'tanpa-rapat-01', cwd: 'p-tanpa-rapat', rapat: 0 },
    { sesi: 'sedikit-label1', cwd: 'p-sedikit', panggilan: 5, rapat: 1, rapatTutup: 1 },
  ]);
  tulisHari(dir, pakai('label'), [
    { sesi: 'label-biasa-01', cwd: 'p-lbl-biasa', ulang: 12, labelGaya: 'biasa' },
    { sesi: 'label-potong-1', cwd: 'p-lbl-potong', ulang: 12, labelGaya: 'potong' },
    { sesi: 'label-mcp-001', cwd: 'p-lbl-mcp', ulang: 12, labelGaya: 'mcp' },
  ]);
  tulisHari(dir, pakai('rapat'), [
    { sesi: 'lewat-stop-01', cwd: 'p-lewat-stop', rapat: 1, rapatTutup: 1, stopDiTengah: true },
    { sesi: 'benar-yatim-1', cwd: 'p-benar-yatim', rapat: 2, rapatTutup: 0 },
    { sesi: 'masih-jalan-1', cwd: 'p-masih-jalan', rapat: 2, rapatTutup: 0, sesiSelesai: false },
  ]);
  tulisHari(dir, pakai('ctrlc'), [
    { sesi: 'alat-rusak-01', cwd: 'p-alat-rusak', gagalIndeks: [0, 2, 4, 6] },
    { sesi: 'pemilik-stop1', cwd: 'p-pemilik-stop', gagalIndeks: [0, 2, 4, 6], interupsiIndeks: [0, 2, 4, 6] },
  ]);
  tulisHari(dir, pakai('agregat'), [
    { sesi: 'gabung-a-0001', cwd: 'p-gabung', panggilan: 10, ulang: 2, gagalIndeks: [3, 4, 5], rapat: 2, rapatTutup: 1 },
    { sesi: 'gabung-b-0001', cwd: 'p-gabung', panggilan: 30, ulang: 5, gagalIndeks: [1], rapat: 1, rapatTutup: 1 },
  ]);

  const k = await bukaKantor(dir);

  /* ---- Kasus 1 — titik nolnya berarti ---- */
  console.log(tebal('\nKasus 1 — sesi bersih bernilai penuh'));
  const bersih = await ambilSkp(k, H.bersih);
  const sBersih = sesiDari(bersih, 'bersih-000001');
  benar('sesinya terbaca', Boolean(sBersih), JSON.stringify((bersih.sesi || []).map((s) => s.sesi)));
  sama('  nilainya 100', sBersih.nilai, 100);
  sama('  kelima sumbu benar-benar terukur', (sBersih.bobotDipakai || []).length, 5);
  sama('  bobot berjumlah 100', Object.values(bersih.bobot).reduce((a, b) => a + b, 0), 100);
  sama('  tiap bobot punya titik jenuhnya',
    Object.keys(bersih.bobot).filter((x) => !Number.isFinite(bersih.jenuh[x])).length, 0);
  sama('  dasar bolak-balik disebut', bersih.bolakBalikDasar, 'tool+label');

  /* ---- Kasus 2 & 3 — tiap sumbu turun sendiri, lalu berhenti ---- */
  console.log(tebal('\nKasus 2 — tiap sumbu menurunkan nilai sendiri-sendiri dan monoton'));
  const MEDAN = {
    rasioGagal: 'rasioGagalBersih', bolakBalik: 'bolakBalikRasio', tertahan: 'tertahanPer100',
    gagalBeruntun: 'gagalBeruntunMaks', rapatYatim: 'rapatYatimRasio',
  };
  const potretSumbu = {};
  for (const nama of Object.keys(TINGKAT)) {
    const d = await ambilSkp(k, H[nama]);
    const baris = [0, 1, 2, 3].map((i) => sesiDari(d, idTingkat(nama, i)));
    benar(nama + ': keempat tingkatnya terbaca', baris.every(Boolean),
      JSON.stringify((d.sesi || []).map((x) => x.sesi)));
    if (!baris.every(Boolean)) continue;
    potretSumbu[nama] = { d, baris };
    const nilai = baris.map((b) => b.nilai);
    const ukur = baris.map((b) => b[MEDAN[nama]]);
    benar('  indikatornya naik: ' + ukur.join(' → '),
      ukur.every((x, i) => i === 0 || x > ukur[i - 1]), JSON.stringify(ukur));
    benar('  nilainya turun lalu berhenti: ' + nilai.join(' → '),
      nilai[0] > nilai[1] && nilai[1] > nilai[2] && nilai[3] <= nilai[2], JSON.stringify(nilai));
    sama('  yang bersih tetap 100', nilai[0], 100);
    /* Sumbu lain harus DIAM di tingkat 1-3. Ini yang membedakan lima sumbu
       sungguhan dari satu sumbu yang dihitung lima kali dengan nama berbeda. */
    const lain = Object.entries(MEDAN).filter(([n]) => n !== nama).map(([, m]) => m);
    const bergerak = lain.filter((m) => baris[1][m] !== baris[2][m] || baris[2][m] !== baris[3][m]);
    sama('  sumbu lain diam di tingkat 1–3', bergerak.join(',') || 'diam', 'diam');
  }

  console.log(tebal('\nKasus 3 — di atas titik jenuh, hukumannya berhenti'));
  for (const [nama, { d, baris }] of Object.entries(potretSumbu)) {
    const jenuh = d.jenuh[nama];
    const b2 = baris[2]; const b3 = baris[3];
    benar(nama + ': dua tingkat teratas memang sudah lewat jenuh ' + jenuh,
      b2[MEDAN[nama]] > jenuh && b3[MEDAN[nama]] > jenuh,
      JSON.stringify([b2[MEDAN[nama]], b3[MEDAN[nama]], jenuh]));
    sama('  ' + b3[MEDAN[nama]] + ' tidak lebih dihukum daripada ' + b2[MEDAN[nama]], b3.nilai, b2.nilai);
    /* Dan tingkat 1 yang di BAWAH jenuh harus kena sebagian, bukan penuh —
       kalau tidak, "jenuh" cuma saklar dan bukan tanjakan. */
    const penuh = Math.round((d.bobot[nama] / Object.values(d.bobot).reduce((a, x) => a + x, 0)) * 100);
    benar('  yang di bawah jenuh kena sebagian saja',
      100 - baris[1].nilai < 100 - baris[2].nilai && baris[1].nilai < 100,
      JSON.stringify({ bawah: baris[1].nilai, lewat: baris[2].nilai, bobotPenuh: penuh }));
  }

  /* ---- Kasus 4 — buta ≠ bersih ---- */
  console.log(tebal('\nKasus 4 — sumbu yang tidak terukur tidak menyamar jadi nol'));
  const buta = await ambilSkp(k, H.buta);
  const tanpaRapat = sesiDari(buta, 'tanpa-rapat-01');
  sama('sesi tanpa rapat: rasio yatimnya null, bukan 0', tanpaRapat.rapatYatimRasio, null);
  benar('  rapatYatim keluar dari bobot yang dipakai',
    !tanpaRapat.bobotDipakai.includes('rapatYatim'), JSON.stringify(tanpaRapat.bobotDipakai));
  sama('  dan nilainya tetap 100 karena sisanya bersih', tanpaRapat.nilai, 100);
  const sedikit = sesiDari(buta, 'sedikit-label1');
  benar('sesi dengan panggilan terlalu sedikit: bolak-balik tidak dinilai',
    sedikit.bolakBalikRasio === null && !sedikit.bobotDipakai.includes('bolakBalik'),
    JSON.stringify({ rasio: sedikit.bolakBalikRasio, dipakai: sedikit.bobotDipakai }));
  sama('  ambangnya disebut di respons', Number.isFinite(buta.ulangMin), true);

  /* ---- Kasus 5 — label yang layak dibandingkan ---- */
  console.log(tebal('\nKasus 5 — bolak-balik cuma dari label yang layak dibandingkan'));
  const lbl = await ambilSkp(k, H.label);
  const biasa = sesiDari(lbl, 'label-biasa-01');
  const potong = sesiDari(lbl, 'label-potong-1');
  const mcp = sesiDari(lbl, 'label-mcp-001');
  sama('label utuh yang berulang memang dihitung', biasa.bolakBalik, 12);
  sama('  label yang ditutup … tidak dihitung', potong.bolakBalik, 0);
  sama('    dan tidak dinilai sama sekali', potong.bolakBalikDari, 0);
  sama('  label tool MCP tidak dihitung', mcp.bolakBalik, 0);
  sama('    dan tidak dinilai sama sekali', mcp.bolakBalikDari, 0);
  benar('  yang tidak layak dinilai bernilai penuh, bukan dihukum',
    potong.nilai === 100 && mcp.nilai === 100, JSON.stringify([potong.nilai, mcp.nilai]));
  benar('  yang berulang sungguhan justru turun', biasa.nilai < 100, String(biasa.nilai));
  sama('  jendela pengulangan disebut di respons', Number.isFinite(lbl.jendelaUlang), true);

  /* ---- Kasus 6 — batas rapat yatim ---- */
  console.log(tebal('\nKasus 6 — rapat yatim ditutup session-end, bukan stop'));
  const rpt = await ambilSkp(k, H.rapat);
  const lewatStop = sesiDari(rpt, 'lewat-stop-01');
  sama('subagent yang ditutup SESUDAH `stop` bukan yatim', lewatStop.rapatYatim, 0);
  sama('  rapatnya tetap tercatat pernah dibuka', lewatStop.rapat, 1);
  const yatimBenar = sesiDari(rpt, 'benar-yatim-1');
  sama('subagent yang tidak pernah ditutup sampai session-end = yatim', yatimBenar.rapatYatim, 2);
  sama('  rasionya 100%', yatimBenar.rapatYatimRasio, 100);
  const masihJalan = sesiDari(rpt, 'masih-jalan-1');
  sama('sesi yang belum session-end tidak divonis yatim', masihJalan.rapatYatim, 0);
  benar('  tapi rapatnya tetap terhitung dibuka', masihJalan.rapat === 2, String(masihJalan.rapat));

  /* ---- Kasus 7 — Ctrl+C tidak menghukum dua kali ---- */
  console.log(tebal('\nKasus 7 — Ctrl+C tindakan pemilik, bukan alat yang rusak'));
  const cc = await ambilSkp(k, H.ctrlc);
  const rusak = sesiDari(cc, 'alat-rusak-01');
  const pemilik = sesiDari(cc, 'pemilik-stop1');
  sama('dua sesi itu sama-sama gagal empat kali', rusak.gagal, pemilik.gagal);
  sama('  `gagal` mentahnya tidak diutak-atik', pemilik.gagal, 4);
  sama('  tapi gagal bersihnya nol untuk yang dihentikan pemilik', pemilik.gagalBersih, 0);
  sama('  dan interupsinya dilaporkan apa adanya', pemilik.interupsi, 4);
  benar('  yang dihentikan pemilik bernilai lebih tinggi: ' + pemilik.nilai + ' > ' + rusak.nilai,
    pemilik.nilai > rusak.nilai, JSON.stringify([pemilik.nilai, rusak.nilai]));
  sama('  interupsi tidak punya bobot sendiri', Object.keys(cc.bobot).includes('interupsi'), false);

  /* ---- Kasus 8 — bentuk lama tidak berubah ---- */
  console.log(tebal('\nKasus 8 — bentuk lama /skp tidak berubah'));
  const LAMA_PROYEK = ['nama', 'sesi', 'toolCall', 'gagal', 'rasioGagal', 'durasiRata', 'campuranTool',
                       'token', 'jamDinasRentang', 'jamDinas', 'golongan', 'fanOut'];
  const LAMA_SESI = ['sesi', 'proyek', 'cabang', 'model', 'mulai', 'selesai', 'toolCall', 'gagal',
                     'tertahan', 'toolTeratas'];
  const ag = await ambilSkp(k, H.agregat);
  const p0 = ag.proyek[0]; const s0 = ag.sesi[0];
  sama('tiap kunci lama proyek masih ada', LAMA_PROYEK.filter((x) => !(x in p0)).join(',') || 'lengkap', 'lengkap');
  sama('tiap kunci lama sesi masih ada', LAMA_SESI.filter((x) => !(x in s0)).join(',') || 'lengkap', 'lengkap');
  benar('  rasioGagal lama tetap dihitung dari gagal MENTAH',
    p0.rasioGagal === Math.round((p0.gagal / p0.toolCall) * 1000) / 10,
    JSON.stringify({ rasioGagal: p0.rasioGagal, gagal: p0.gagal, toolCall: p0.toolCall }));
  sama('  rentang & keterangan lama masih ada',
    Boolean(ag.rentang && ag.rentang.dari && ag.keterangan), true);

  /* ---- Kasus 9 — kerja sementara tidak bocor ---- */
  console.log(tebal('\nKasus 9 — kerja sementara tidak ikut ke respons'));
  const teks = JSON.stringify(ag);
  for (const kunci of ['ulangRing', 'rapatBuka', 'tahanSejak', 'gagalRun'])
    sama('  ' + kunci + ' tidak ada di respons', teks.includes('"' + kunci + '"'), false);

  /* ---- Kasus 10 — agregat proyek & cache ---- */
  console.log(tebal('\nKasus 10 — agregat proyek konsisten, cache menjawab hal yang sama'));
  const pg = ag.proyek.find((p) => p.nama === 'p-gabung');
  const sesiPg = ag.sesi.filter((s) => s.proyek === 'p-gabung');
  sama('proyek gabungan punya dua sesi', sesiPg.length, 2);
  sama('  Σ tool call sesi == tool call proyek',
    sesiPg.reduce((a, s) => a + s.toolCall, 0), pg.toolCall);
  sama('  Σ bolak-balik sesi == bolak-balik proyek',
    sesiPg.reduce((a, s) => a + s.bolakBalik, 0), pg.bolakBalik);
  sama('  Σ rapat yatim sesi == rapat yatim proyek',
    sesiPg.reduce((a, s) => a + s.rapatYatim, 0), pg.rapatYatim);
  sama('  gagal beruntun proyek diambil MAKS, bukan dijumlah',
    pg.gagalBeruntunMaks, Math.max(...sesiPg.map((s) => s.gagalBeruntunMaks)));
  const ulang2 = await ambilSkp(k, H.agregat);
  sama('  panggilan kedua dijawab cache', ulang2.cache, true);
  const bandingCache = (x) => JSON.stringify({ ...x, cache: 0, dihitung: 0 });
  sama('    isinya sama persis', bandingCache(ulang2) === bandingCache(ag) ? 'sama' : 'beda', 'sama');

  tutupKantor();

  /* ---- Kasus 11 — AGENT_ROOM_ISI=off ---- */
  console.log(tebal('\nKasus 11 — tanpa label, sumbu bolak-balik mati dengan jujur'));
  const kMati = await bukaKantor(dir, { AGENT_ROOM_ISI: 'off' });
  const mati = await ambilSkp(kMati, H.label);
  sama('dasarnya disebut `mati`', mati.bolakBalikDasar, 'mati');
  const biasaMati = sesiDari(mati, 'label-biasa-01');
  sama('  tidak ada satu pun yang dinilai bolak-balik', biasaMati.bolakBalikDari, 0);
  benar('  sumbunya keluar dari bobot yang dipakai',
    !biasaMati.bobotDipakai.includes('bolakBalik'), JSON.stringify(biasaMati.bobotDipakai));
  benar('  dan nilainya BUKAN nol gara-gara buta', biasaMati.nilai === 100, String(biasaMati.nilai));
  tutupKantor();

  /* ---- Kasus 12 — hari sungguhan, dikunci golden ---- */
  console.log(tebal('\nKasus 12 — hari sungguhan dari fixture, dikunci golden'));
  const dirF = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-skp-fx-'));
  const fx = muatFixture();
  /* Fixture menyimpan hari aslinya (2026-09-03); harinya digeser ke rentang
     simpan agenda supaya agendaMuat() tidak membuangnya waktu berkasnya sudah
     lebih tua dari AGENT_ROOM_AGENDA_HARI. Yang digeser cuma NAMA BERKAS dan
     `ts`; urutan, sesi, dan isinya tidak disentuh. */
  const tglF = hariKe(1);
  const geser = Date.parse(tglF + 'T00:00:00') - Date.parse(fx.kepala.dari + 'T00:00:00');
  fs.mkdirSync(path.join(dirF, 'agenda'), { recursive: true });
  fs.writeFileSync(path.join(dirF, 'agenda', tglF + '.jsonl'),
    fx.baris.map((b) => JSON.stringify({ ...b, v: V, ts: b.ts + geser })).join('\n') + '\n');
  const kF = await bukaKantor(dirF);
  const nyata = await ambilSkp(kF, tglF);

  catatan('hari ini TIDAK memuat `interupsi` maupun objek `butuh` — dua sumbu itu memang diam di sini');
  sama('  interupsi di seluruh hari', nyata.proyek.reduce((a, p) => a + p.interupsi, 0), 0);
  catatan('durasiRata null karena BIDANG_BUANG di buat-fixture.mjs membuang `durasi` — itu benar');

  const potret = {
    proyek: nyata.proyek.map((p) => ({
      nama: p.nama, sesi: p.sesi, toolCall: p.toolCall, gagal: p.gagal, nilai: p.nilai,
      bolakBalik: p.bolakBalik, bolakBalikDari: p.bolakBalikDari,
      gagalBeruntunMaks: p.gagalBeruntunMaks, rapat: p.rapat, rapatYatim: p.rapatYatim,
      prompt: p.prompt, toolPerPrompt: p.toolPerPrompt, bobotDipakai: p.bobotDipakai,
    })).sort((a, b) => (a.nama < b.nama ? -1 : 1)),
    sesi: nyata.sesi.length,
    bobot: nyata.bobot, jenuh: nyata.jenuh,
  };
  if (PERBARUI) {
    fs.writeFileSync(GOLDEN, JSON.stringify(potret, null, 2) + '\n');
    console.log('  ' + abu('golden ditulis ulang: ' + path.basename(GOLDEN)));
  } else {
    const emas = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    sama('potret hari sungguhan cocok dengan golden',
      JSON.stringify(potret) === JSON.stringify(emas) ? 'cocok' : 'beda', 'cocok');
    if (JSON.stringify(potret) !== JSON.stringify(emas)) {
      console.log('      ' + abu('jalankan `node uji-skp.mjs --perbarui` kalau perubahannya memang disengaja'));
    }
  }
  // invarian yang berlaku hari apa pun, jadi tetap merah walau golden diperbarui
  const perProyek = new Map();
  for (const s of nyata.sesi) perProyek.set(s.proyek, (perProyek.get(s.proyek) || 0) + s.toolCall);
  const beda = nyata.proyek.filter((p) => (perProyek.get(p.nama) || 0) !== p.toolCall);
  sama('  Σ tool call sesi == tool call proyek, untuk tiap proyek', beda.length, 0);
  const liar = nyata.sesi.filter((s) => s.nilai != null && (s.nilai < 0 || s.nilai > 100));
  sama('  tiap nilai ada di [0,100]', liar.length, 0);
  const rasioLiar = nyata.sesi.filter((s) => s.bolakBalikRasio != null
    && (s.bolakBalikRasio < 0 || s.bolakBalikRasio > 100));
  sama('  tiap rasio bolak-balik ada di [0,100]', rasioLiar.length, 0);
  tutupKantor();

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* biar OS yang bersihkan */ }
  try { fs.rmSync(dirF, { recursive: true, force: true }); } catch { /* biar OS yang bersihkan */ }
}

jalan().then(() => {
  tutupKantor();
  console.log();
  if (gagal) { console.log(merah(tebal('GAGAL ' + gagal + ' dari ' + periksa + ' pemeriksaan'))); process.exit(1); }
  console.log(hijau(tebal('LULUS ' + periksa + ' pemeriksaan')));
}).catch((err) => {
  tutupKantor();
  console.error(merah('\nuji-skp meledak: ' + (err && err.stack || err)));
  process.exit(1);
});
