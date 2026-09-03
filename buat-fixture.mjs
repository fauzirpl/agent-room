#!/usr/bin/env node
// buat-fixture.mjs :: pembuat uji-ulang.fixture.jsonl — satu hari buku agenda
// sungguhan, DISAMARKAN, dipadatkan jadi bentuk kolumnar yang muat di repo.
//
// Kenapa ada: uji-ulang.mjs memutar ulang satu hari kerja penuh ke frame()/
// handle() asli public/room.js. Hari yang diputar harus HARI SUNGGUHAN —
// urutan, jeda, dan bentuk kejadiannya tidak bisa ditiru fixture karangan
// (71 subagent-start lawan 29 subagent-stop, rentetan gagal beruntun, rapat
// yang tidak pernah ditutup) — tapi buku agenda sungguhan berisi perintah
// shell, jalur berkas, kueri pencarian, dan pesan galat milik pemilik mesin.
// Berkas ini yang menjembatani keduanya: BENTUK harinya disimpan, ISINYA
// tidak.
//
// Empat jaminan yang dipegang berkas ini:
//
//   1. DAFTAR PUTIH BIDANG, bukan daftar hitam. Cuma bidang yang benar-benar
//      dibaca room.js (`ev.*`, lihat BIDANG_PUTIH) yang ikut. Bidang baru
//      yang suatu hari ditambahkan ke buku agenda TIDAK otomatis ikut bocor.
//
//   2. LABEL PENGGANTI YANG MEMBUKTIKAN DIRI. labelSintetis() tidak menyalin
//      logika room.js. Dia memuat room.js sungguhan lewat muatKonteks() milik
//      uji-event.mjs, memanggil stationFor() YANG ASLI untuk tahu meja tujuan
//      label aslinya, memilih pengganti dari katalog tetap, lalu MENGUJI
//      ULANG penggantinya lewat stationFor() yang sama. Kalau satu baris pun
//      berpindah meja, pembuatan fixture GAGAL dan menyebut barisnya. Jadi
//      "hari yang sama" itu klaim yang diperiksa mesin, bukan janji.
//
//   3. PERIKSA PRIVASI PER BIDANG. periksaPrivasi() menolak nilai string apa
//      pun yang tidak cocok dengan pola pseudonim atau katalog enum untuk
//      bidangnya sendiri. Bidang string yang tidak dikenal = GAGAL, bukan
//      dilewati. Fungsi ini diekspor dan dipanggil ULANG oleh uji-ulang.mjs
//      tiap kali CI jalan — bukan cuma sekali saat fixture dibuat.
//
//      EMPAT pagar, bukan satu, karena tiap pagar sebelumnya cuma menutup
//      sepotong berkas dan potongan sisanya selalu jadi jalur bebas hambatan:
//        periksaPrivasi()  baris yang SUDAH dibentangkan;
//        periksaKamus()    kamus di kepala — nilai yang tidak dirujuk baris
//                          mana pun (yatim) tidak pernah dilihat pagar pertama;
//        periksaKepala()   SELURUH kepala DI LUAR kamus — `catatan`, `dari`,
//                          `kolom`, dan kunci kepala apa pun yang tidak ada di
//                          daftar putih. Dulu kosong melompong: satu jalur
//                          Windows di `catatan` (teks bebas, ikut ter-commit,
//                          ikut terkirim ke npm) lolos HIJAU exit 0;
//        periksaLarik()    baris MENTAH yang belum dibentangkan. bentangkan()
//                          MEMBUANG kunci `tambahan` yang tidak dikenalnya,
//                          jadi nilai yang diselipkan ke sana tidak pernah
//                          sampai ke periksaPrivasi() — pagar yang paling
//                          mudah dilupakan justru karena pagar pertamanya
//                          kelihatan menyeluruh.
//      Empat-empatnya dipanggil ULANG oleh uji-ulang.mjs tiap CI jalan.
//      Gabungannya berarti: TIAP nilai string di berkas ini, di mana pun ia
//      berada, punya satu aturan yang menyetujuinya — atau fixture-nya merah.
//
//      Yang paling ketat dijaga: nama alat. Nama tool bukan isi pekerjaan, tapi
//      ia membocorkan apa yang terpasang di mesin pemilik, jadi:
//      tool mcp__ WAJIB jadi mcp__srv-N__alat-M, dan nama tool BIASA cuma boleh
//      lewat apa adanya kalau ia ada di ALAT_SAH — daftar nama yang public/
//      room.js sendiri sudah menyebut satu per satu. Nama di luar itu (tool
//      dari plugin, skrip pribadi, apa pun) ikut jalur pseudonim `alat-N`.
//      Konsekuensinya: label baris MCP disimpan KOSONG (labelnya sendiri adalah
//      nama server); lihat catatan di labelSintetis().
//
//   4. KASUS MERAH YANG IKUT TER-COMMIT. `node buat-fixture.mjs --uji-pagar`
//      menjalankan tabel kasus racun terhadap keempat pagar di atas dan pulang
//      exit 1 kalau ada satu saja yang lolos. Ini bukan hiasan: pagar privasi
//      di berkas ini pernah dilubangi balik ke bentuk lamanya dan SELURUH
//      harness repo tetap hijau, karena tidak ada satu pun berkas yang pernah
//      memberi pagar itu nilai yang HARUS ditolak. Uji yang cuma pernah
//      melihat masukan bersih tidak menguji apa-apa.
//
// Pakai:
//   node buat-fixture.mjs --dari <agenda.jsonl>          bikin fixture
//   node buat-fixture.mjs --periksa [--dari <agenda>]    uji kesetiaan stasiun
//   node buat-fixture.mjs --keluarkan-agenda <keluar.jsonl>
//                                                        bentangkan balik ke
//                                                        bentuk buku agenda,
//                                                        supaya bisa ditonton
//                                                        mata manusia lewat
//                                                        ?ulang=<tanggal>
//   node buat-fixture.mjs --uji-pagar                   tabel kasus merah
//                                                        untuk keempat pagar
// Bendera lain: --keluar <fixture.jsonl>, --maks-byte N, --tanggal YYYY-MM-DD
//
// ================================= EKOR SINTETIS ==========================
//
// Hari sungguhannya tidak memuat SEMUA jalur yang halaman punya, dan dua di
// antaranya tidak bisa dimuat walau ditunggu sampai kiamat:
//
//   kind 'nama'  DITOLAK masuk buku agenda (AGENDA_KIND_TOLAK di server.mjs:
//                "pengumuman, bukan kejadian"). Berapa pun hari sungguhan
//                dikumpulkan, baris ini TIDAK AKAN PERNAH ada di sana — jadi
//                pegawaiTetapPasang(), terimaPerkenalan(), dan wadah
//                pegawaiTetap mustahil teruji lewat hari sungguhan.
//   kind 'pagu'  boleh masuk buku agenda (server menyimpan ambang/persen/
//                pakai/pagu/minggu), tapi hari yang dipakai fixture ini
//                mendahului fiturnya, jadi nol baris.
//
// Karena itu fixture diberi EKOR SINTETIS: beberapa baris karangan yang
// ditempel SESUDAH baris sungguhan terakhir, dibangkitkan BARIS_SINTETIS() di
// berkas ini (bukan dari mesin siapa pun), dan dihitung terang-terangan di
// kepala sebagai `sintetis: N`. Jadi "hari sungguhan"-nya tetap bisa dibaca
// jujur: baris 0..(baris-sintetis-1) sungguhan, sisanya karangan, dan siapa
// pun bisa memeriksanya tanpa percaya komentar ini.
//
// Kenapa BUKAN disisipkan di tengah hari: urutan, jeda, dan tumpang tindih
// sesi itu justru satu-satunya hal yang tidak bisa ditiru fixture karangan
// (lihat alinea pembuka). Menempel di ekor menambah cakupan tanpa mengarang
// satu detik pun irama hari itu — dan kalau ekornya dibuang, yang tersisa
// masih persis hari sungguhannya, baris demi baris.
//
// Kenapa bukan cuma "invarian pemantau pegawaiTetap" tanpa baris sintetis:
// wadah yang tidak pernah diisi tidak bisa bocor. Penghitung pegawaiTetap
// tanpa satu pun baris 'nama' akan hijau selamanya di angka 0 — persis pola
// "hijau karena tidak pernah dieksekusi" yang jadi sebab ekor ini ada.
// Penghitungnya tetap ditambahkan di uji-ulang.mjs, tapi ia menjaga sesuatu
// hanya karena ekor ini mengisinya lebih dulu.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { muatKonteks, merah, hijau, kuning, abu, tebal } from './uji-event.mjs';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE = path.join(__dirname, 'uji-ulang.fixture.jsonl');
const MAKS_BYTE_BAWAAN = 96000;

/* ------------------------------------------------------- daftar putih ---- *
 * Diturunkan dari sapuan `ev.<nama>` di public/room.js — bukan dari bentuk
 * baris buku agenda. Yang tidak pernah dibaca room.js tidak ada gunanya
 * disimpan, dan tiap bidang yang tidak disimpan adalah satu bidang yang
 * tidak bisa bocor. Yang SENGAJA dibuang walau ada di buku agenda:
 *   v, id      penomoran internal server, tidak dibaca halaman
 *   durasi     cuma dipakai panel /agenda, bukan ruangan
 *   lambat, tunda, jenis   penanda server, tidak dibaca handle() */
export const BIDANG_PUTIH = new Set([
  'ts', 'kind', 'session', 'cwd', 'cabang', 'tool', 'label', 'ok',
  'galat', 'alasan', 'interupsi', 'model', 'nama', 'peran', 'mesin',
  'agen', 'agenId', 'panggilan', 'golongan', 'sebelumnya', 'peserta',
  'butuh', 'macet', 'akhir', 'aksi', 'keputusan',
  // kind:'pagu' — angka nota anggaran token. Server memang menyimpannya ke
  // buku agenda (lihat agendaBaris), jadi ini bukan bidang khusus ekor
  // sintetis: hari sungguhan yang lebih baru akan membawanya sendiri.
  'ambang', 'persen', 'pakai', 'pagu', 'minggu',
  // kind:'nama' ber-`tetap` — kursi formasi. Cuma bisa datang dari ekor
  // sintetis (server menolak kind 'nama' masuk buku agenda), tapi bidangnya
  // tetap didaftarkan di sini supaya pagarnya satu, bukan dua jalur.
  'tetap',
]);
export const BIDANG_BUANG = ['v', 'id', 'durasi', 'lambat', 'tunda', 'jenis'];

/* ------------------------------------------------------ katalog enum ----- *
 * Nilai yang BOLEH lewat apa adanya karena ia berasal dari kamus tetap sisi
 * server / room.js, bukan dari isi pekerjaan siapa pun. Dipakai dua kali:
 * saat menyamarkan, dan saat memeriksa privasi. */
export const KIND_SAH = new Set([
  'pre', 'post', 'prompt', 'stop', 'stop-gagal', 'session-start', 'session-end',
  'subagent-start', 'subagent-stop', 'compact', 'compact-selesai', 'notify',
  'izin-minta', 'izin-jawab', 'izin-tolak', 'promosi', 'antre', 'nama', 'peran',
  'tugas-mulai', 'tugas-bisu', 'pagu',
]);

/* Nama tool yang boleh lewat APA ADANYA. Daftarnya bukan selera: isinya
 * PERSIS nama yang public/room.js sendiri sudah menyebut satu per satu —
 * TOOL_STATION, SHELL_TOOL, THINK_TOOL, KEGIATAN, FX_TOOL. Alasannya sederhana:
 * nama yang sudah tertulis di repo ini tidak membocorkan apa pun tentang mesin
 * pemilik, sedangkan nama di luarnya (tool dari plugin, MCP, skrip pribadi)
 * membocorkan tepat itu.
 *
 * Ini juga yang membuat penyamarannya tidak merusak kesetiaan stasiun:
 * stationFor() memberi meja khusus HANYA untuk nama di daftar ini; nama lain
 * sudah jatuh ke 'think' apa adanya, jadi menggantinya dengan `alat-N` tidak
 * memindahkan siapa pun.
 *
 * Batas kejujurannya, ditulis terang supaya tidak dikira lebih dari ini:
 * daftar ini disalin tangan dari room.js, bukan dibaca dari sana saat jalan.
 * Kalau room.js menambah nama tool baru, fixture akan MENYAMARKANNYA (aman,
 * cuma kehilangan sedikit kesetiaan), bukan membocorkannya. Arah sebaliknya —
 * nama di sini yang sudah hilang dari room.js — ditangkap kasus ALAT_SAH di
 * `--uji-pagar`.
 *
 * Daftarnya dua bagian dengan dasar yang berbeda: ALAT_ROOM (bisa dibuktikan
 * mesin: namanya ada di public/room.js) dan ALAT_LUAR (penilaian tangan,
 * dijaga pendek). Yang dipakai memeriksa adalah gabungannya, ALAT_SAH. */
export const ALAT_ROOM = new Set([
  // TOOL_STATION
  'Read', 'Glob', 'NotebookRead', 'Grep', 'Search', 'ToolSearch',
  'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Artifact',
  'WebFetch', 'WebSearch', 'Task', 'Agent', 'Workflow', 'TaskOutput', 'TaskStop',
  'Skill', 'SendMessage', 'TodoWrite', 'ExitPlanMode', 'EnterPlanMode',
  'AskUserQuestion',
  // SHELL_TOOL / FX_TOOL
  'Bash', 'PowerShell', 'BashOutput', 'KillShell',
]);

/* Kelompok KEDUA, dan sengaja dipisah karena dasarnya berbeda: nama tool
 * bawaan Claude Code yang room.js sendiri TIDAK pernah sebut. Isinya penilaian
 * tangan, bukan fakta yang bisa dibuktikan mesin, jadi ia dijaga tetap pendek
 * dan tiap entrinya harus punya alasan sendiri.
 *
 * `StructuredOutput` — tool yang dipakai subagen Workflow ber-`schema`.
 * Sekelas Task/Workflow: nama bawaan, nol isi pekerjaan, dan repo ini memang
 * banyak memakainya, jadi menyimpannya apa adanya membuat fixture lebih enak
 * dibaca manusia.
 *
 * Yang TIDAK benar, dan jangan dipakai sebagai alasan menambah entri baru:
 * "tanpa entri ini fixture jadi merah". Tidak. Sejak samarTool() memseudonimkan
 * semua nama di luar daftar, nama asing menjadi `alat-N` dan lolos dengan
 * tenang — kehilangannya cuma keterbacaan, bukan kehijauan. Karena itu jalur
 * pseudonim adalah BAWAAN yang aman, dan tiap entri di sini adalah pengecualian
 * yang harus dibayar dengan alasan, bukan dengan kenyamanan. */
export const ALAT_LUAR = new Set(['StructuredOutput']);
export const ALAT_LUAR_MAKS = 4;    // gerbang di --uji-pagar: jangan jadi got

export const ALAT_SAH = new Set([...ALAT_ROOM, ...ALAT_LUAR]);

/* Pagu pengganti untuk nota anggaran. Bulat dan jelas-jelas karangan supaya
 * tidak ada yang salah membacanya sebagai serapan sungguhan; `pakai`
 * dihitung darinya menurut persen, jadi kalimat notanya tetap masuk akal. */
export const PAGU_SINTETIS = 1000000;
// sebab macet/butuh — kamus tetap server.mjs
export const SEBAB_SAH = new Set([
  'server_error', 'invalid_request', 'rate_limit', 'overloaded', 'timeout',
  'jaringan', 'izin', 'tanya', 'rencana', 'galat', 'lainnya',
]);
export const FRASA_SEBAB = {
  server_error: 'server bermasalah', invalid_request: 'permintaan tidak sah',
  rate_limit: 'kena batas pemakaian', overloaded: 'server penuh',
  timeout: 'kehabisan waktu', jaringan: 'jaringan putus',
  izin: 'menunggu izin', tanya: 'menunggu jawaban', rencana: 'menunggu paraf rencana',
  galat: 'berhenti karena galat', lainnya: 'perlu perhatian',
};
export const FRASA_SAH = new Set(Object.values(FRASA_SEBAB));
// enam kalimat galat generik — menggantikan pesan galat sungguhan yang penuh
// jalur berkas, cuplikan kode, dan kadang isi transkrip
export const GALAT_KATALOG = [
  'perintah berhenti dengan kode bukan nol',
  'berkas yang diminta tidak ditemukan',
  'sambungan ke layanan luar gagal',
  'waktu tunggu habis sebelum ada jawaban',
  'masukan tidak sesuai bentuk yang diminta',
  'proses dihentikan sebelum selesai',
];
export const AKSI_SAH = new Set(['masuk', 'lahir', 'batal', 'gagal']);
export const KEPUTUSAN_SAH = new Set(['paraf', 'tolak', 'lewat']);
export const MODEL_SAH = new Set([
  'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-fable-5',
]);
export const LABEL_ENUM_SAH = new Set([
  '', 'otomatis', 'manual', 'startup', 'compact', 'other', 'clear', 'resume',
  ...GALAT_KATALOG, ...Object.values(FRASA_SEBAB),
]);
export const CABANG_SAH = new Set(['master', 'main']);

/* --------------------------------------------------------- pembacaan ----- */
/* Pola parse yang sama dengan agendaBacaHari() di server.mjs: baris rusak
   (append terpotong waktu server dimatikan) DILEWATI, bukan menggagalkan
   seluruh hari; hasilnya diurutkan naik menurut ts. */
export function bacaAgenda(berkas) {
  const teks = fs.readFileSync(berkas, 'utf8');
  const keluar = [];
  let rusak = 0;
  for (const t of teks.split('\n')) {
    if (!t.trim()) continue;
    let o = null;
    try { o = JSON.parse(t); } catch { rusak++; continue; }
    if (!o || !Number.isFinite(o.ts) || !o.kind) { rusak++; continue; }
    keluar.push(o);
  }
  keluar.sort((a, b) => a.ts - b.ts);
  return { baris: keluar, rusak };
}

/* --------------------------------------------------- penyamar pengenal --- */
/* Pemeta stabil pengenal -> pseudonim. `batas` membatasi berapa banyak
   pseudonim berbeda yang dibuat: sesudah kolamnya penuh, nilai baru dipetakan
   secara deterministik (cacah % batas) ke pseudonim yang sudah ada. Ini yang
   menahan kamus fixture tetap kecil — 1.800 nama berkas berbeda memakan
   seperempat anggaran 96 KB, sementara identitas berkasnya sendiri tidak
   pernah dibaca room.js (yang dibaca cuma stasiun tujuannya). */
function pemetaStabil(awalan, batas = Infinity) {
  const peta = new Map();
  return (nilai) => {
    const k = String(nilai);
    if (peta.has(k)) return peta.get(k);
    const n = peta.size < batas ? peta.size + 1 : (cacah(k) % batas) + 1;
    const v = awalan + '-' + n;
    peta.set(k, v);
    return v;
  };
}

/* --------------------------------------------------- label sintetis ----- *
 * Bagian paling penting berkas ini. TIDAK ada satu pun aturan stasiun yang
 * disalin ke sini: alat.stationFor adalah stationFor() ASLI dari room.js,
 * dijembatani lewat vm (dia `const` arrow function, jadi tidak otomatis jadi
 * properti global sandbox seperti `function` biasa).
 *
 * Cara kerjanya: hitung stasiun tujuan label ASLI, pilih pengganti dari
 * katalog menurut stasiun itu, lalu HITUNG ULANG stasiun penggantinya. Kalau
 * berbeda, ini lempar — jadi fixture tidak pernah lahir dalam keadaan bohong. */
export function buatAlat() {
  const ctx = muatKonteks();
  new vm.Script(
    'globalThis.__jembatanFixture__ = { stationFor, KEGIATAN_GIT };',
    { filename: 'jembatan-fixture.js' },
  ).runInContext(ctx);
  const J = ctx.__jembatanFixture__;
  if (typeof J.stationFor !== 'function') {
    throw new Error('stationFor() tidak terbaca dari public/room.js — buat-fixture perlu dibaca ulang');
  }
  if (!J.KEGIATAN_GIT || typeof J.KEGIATAN_GIT !== 'object') {
    throw new Error('KEGIATAN_GIT tidak terbaca dari public/room.js');
  }
  return { ctx, stationFor: J.stationFor, verbGit: Object.keys(J.KEGIATAN_GIT) };
}

const SHELL = /^(Bash|PowerShell|BashOutput|KillShell)$/;

export function buatPenyamar(alat) {
  const kolam = {
    berkas: pemetaStabil('berkas', 120), pola: pemetaStabil('pola', 40),
    kueri: pemetaStabil('kueri', 150), tugas: pemetaStabil('tugas', 40),
    skrip: pemetaStabil('skrip', 200),
  };
  const verbSet = new Set(alat.verbGit);

  /** Verb git dari perintah asli kalau memang salah satu yang dikenal
   *  KEGIATAN_GIT; kalau bukan (gh/glab/jj, atau subperintah asing) jatuh ke
   *  'status' — sama-sama menyeret pegawainya ke rak server. */
  const verbDari = (label) => {
    for (const kata of String(label || '').toLowerCase().split(/[^a-z-]+/)) {
      const v = kata.replace(/-.*$/, '');
      if (verbSet.has(v)) return v;
    }
    return 'status';
  };

  return function labelSintetis(kind, tool, labelAsli, indeks) {
    if (labelAsli == null || labelAsli === '') return labelAsli;

    // kind tanpa tool: labelnya bukan hasil stationFor, jadi tidak perlu
    // (dan tidak bisa) dibuktikan lewat stasiun — cukup dipetakan ke katalog.
    if (!tool) {
      switch (kind) {
        case 'compact': case 'compact-selesai':
        case 'session-start': case 'session-end':
          return LABEL_ENUM_SAH.has(labelAsli) ? labelAsli : 'otomatis';
        case 'stop-gagal': case 'notify':
          return 'perlu perhatian';                 // diisi ulang dari macet/butuh di samarkan()
        case 'subagent-start': case 'subagent-stop':
          return null;                              // diisi ulang dari agen tersamar
        case 'promosi':
          return null;                              // dirakit dari golongan/sebelumnya
        default:
          return kolam.tugas(labelAsli);            // prompt, izin-minta, apa pun yang lain
      }
    }

    const asli = alat.stationFor(tool, labelAsli, '');
    let ganti;
    switch (asli) {
      case 'server': ganti = 'git ' + verbDari(labelAsli); break;
      case 'read': case 'edit': ganti = kolam.berkas(labelAsli) + '.js'; break;
      case 'search': ganti = kolam.pola(labelAsli); break;
      case 'web': ganti = kolam.kueri(labelAsli); break;
      case 'rapat': ganti = kolam.tugas(labelAsli); break;
      // Baris MCP sengaja BERLABEL KOSONG, bukan berpseudonim: label baris MCP
      // di buku agenda PERSIS nama servernya ('Claude_Browser · preview_start'),
      // yaitu hal yang paling wajib disamarkan di berkas ini. Kosong aman
      // karena tidak ada yang membacanya: stationFor() menjawab 'agent' untuk
      // tool mcp__ tanpa melihat label, dan kegiatan() merakit keterangannya
      // dari srv+alat, bukan dari label. Terukur pada fixture hari ini: 148
      // baris (74 pre + 74 post, yaitu SEMUA baris MCP) berlabel '' — itu
      // disengaja, bukan bidang yang hilang waktu penyamaran.
      case 'agent': ganti = /^mcp__/i.test(tool) ? '' : kolam.tugas(labelAsli); break;
      case 'think':
        ganti = SHELL.test(tool) ? 'node ' + kolam.skrip(labelAsli) + '.mjs' : kolam.tugas(labelAsli);
        break;
      default: ganti = kolam.tugas(labelAsli); break;
    }
    const balik = alat.stationFor(tool, ganti, '');
    if (balik !== asli) {
      throw new Error(
        `label sintetis memindah meja pada baris #${indeks}: tool='${tool}' `
        + `stasiun asli '${asli}' -> stasiun pengganti '${balik}' (pengganti: '${ganti}'). `
        + 'Katalog label di labelSintetis() tidak sepadan dengan stationFor() room.js.',
      );
    }
    return ganti;
  };
}

/* ------------------------------------------------------------ samarkan --- */
export function samarkan(barisAsli, alat) {
  const labelSintetis = buatPenyamar(alat);
  const pSesi = pemetaStabil('sesi'), pCwd = pemetaStabil('proyek'),
    pCabang = pemetaStabil('cabang'), pAgen = pemetaStabil('agen'),
    pNama = pemetaStabil('nama'), pMesin = pemetaStabil('mesin');
  const pPanggilan = new Map(), pAgenId = new Map();
  const pSrv = new Map(), pAlat = new Map();

  // mcp__<server>__<tool>: bentuknya DIPERTAHANKAN (jalur pemecah MCP di
  // room.js kegiatan()/stationFor() harus tetap terlatih), namanya tidak —
  // daftar server MCP membocorkan apa saja yang terpasang di mesin pemilik.
  //
  // Nama tool BIASA lewat apa adanya HANYA kalau ada di ALAT_SAH. Sisanya
  // (tool dari plugin, wrapper pribadi, apa pun yang tidak disebut room.js)
  // ikut jalur pseudonim yang sama, dengan penomoran yang sama pula: satu
  // `alat-N` tidak pernah dipakai dua nama berbeda, mau ia muncul sendirian
  // atau di dalam bentuk mcp__srv-K__alat-N.
  const samarTool = (tool) => {
    if (!tool) return tool;
    if (!/^mcp__/i.test(tool)) {              // sama tidak peka kasusnya dengan RX.alat
      if (ALAT_SAH.has(tool)) return tool;
      if (!pAlat.has(tool)) pAlat.set(tool, 'alat-' + (pAlat.size + 1));
      return pAlat.get(tool);
    }
    const bagian = tool.split('__');
    const srv = bagian[1] || '';
    const sisa = bagian.slice(2).join('__') || '';
    if (!pSrv.has(srv)) pSrv.set(srv, 'srv-' + (pSrv.size + 1));
    if (!pAlat.has(tool)) pAlat.set(tool, 'alat-' + (pAlat.size + 1));
    return 'mcp__' + pSrv.get(srv) + '__' + (sisa ? pAlat.get(tool) : 'alat-0');
  };

  const keluar = [];
  barisAsli.forEach((o, i) => {
    const b = { ts: o.ts, kind: KIND_SAH.has(o.kind) ? o.kind : 'post' };
    b.session = o.session ? pSesi(o.session) : '';
    if (o.cwd) b.cwd = pCwd(o.cwd);
    if (o.cabang !== undefined) {
      b.cabang = o.cabang ? (CABANG_SAH.has(o.cabang) ? o.cabang : pCabang(o.cabang)) : '';
    }
    if (o.tool) b.tool = samarTool(o.tool);
    b.ok = o.ok !== false;
    if (o.interupsi) b.interupsi = true;
    if (o.model) b.model = MODEL_SAH.has(o.model) ? o.model : 'claude-opus-5';
    if (o.nama) b.nama = pNama(o.nama);
    if (o.mesin) b.mesin = pMesin(o.mesin);
    if (o.peran) b.peran = o.peran;                  // id jabatan, kamus tetap room.js
    if (o.akhir) b.akhir = true;
    if (o.aksi) b.aksi = AKSI_SAH.has(o.aksi) ? o.aksi : 'masuk';
    if (o.keputusan) b.keputusan = KEPUTUSAN_SAH.has(o.keputusan) ? o.keputusan : 'lewat';
    if (o.kind === 'pagu') {
      /* Nota pagu. Yang DIPERTAHANKAN cuma bentuk keputusannya: ada/tidaknya
         angka, dan di sisi mana ambangnya. Yang DIBUANG serapan token
         sungguhnya — `pakai`/`pagu` adalah angka pemakaian mesin pemilik, dan
         itu isi, bukan bentuk. Penggantinya dihitung dari persen supaya
         kalimat nota di terimaPagu() tetap konsisten dengan persentasenya
         (`840.000 dari 1.000.000 token (84%)`), bukan omong kosong. */
      if (Number.isFinite(o.ambang)) b.ambang = Math.round(o.ambang);
      if (Number.isFinite(o.persen)) b.persen = Math.round(o.persen);
      if (Number.isFinite(o.pakai) && Number.isFinite(o.pagu)) {
        const persen = Number.isFinite(b.persen) ? b.persen : Number(b.ambang) || 0;
        b.pagu = PAGU_SINTETIS;
        b.pakai = Math.round(PAGU_SINTETIS * persen / 100);
      }
      if (typeof o.minggu === 'string' && RX.tanggal.test(o.minggu)) b.minggu = o.minggu;
    }
    if (o.tetap && typeof o.tetap === 'object') {
      // Kursi formasi: nomor kursi, kapan dilantik, dan apakah kursinya baru.
      // Tiga angka tampilan, tidak ada nama & tidak ada jalur di dalamnya.
      b.tetap = {
        slot: Math.max(0, Math.round(Number(o.tetap.slot) || 0)),
        sejak: Number.isFinite(o.tetap.sejak) ? o.tetap.sejak : o.ts,
        baru: o.tetap.baru === true,
      };
    }
    if (o.panggilan) {
      if (!pPanggilan.has(o.panggilan)) pPanggilan.set(o.panggilan, pPanggilan.size + 1);
      b.panggilan = 'c-' + pPanggilan.get(o.panggilan);   // PASANGAN pre/post terjaga
    }
    if (o.agenId) {
      if (!pAgenId.has(o.agenId)) pAgenId.set(o.agenId, pAgenId.size + 1);
      b.agenId = 'ag-' + pAgenId.get(o.agenId);           // pasangan start/stop terjaga
    }
    if (o.agen) b.agen = pAgen(o.agen);
    if (Array.isArray(o.peserta)) {
      // PANJANG larik dipertahankan: itu yang menentukan kursiKosong()/bukaRapat()
      b.peserta = o.peserta.filter(Boolean).map((_, k) => 'peserta-' + (k + 1));
    }
    if (o.galat) b.galat = GALAT_KATALOG[cacah(o.galat) % GALAT_KATALOG.length];
    if (o.alasan) b.alasan = GALAT_KATALOG[cacah(o.alasan) % GALAT_KATALOG.length];
    for (const k of ['butuh', 'macet']) {
      const v = o[k];
      if (v === false) b[k] = false;
      else if (v && typeof v === 'object') {
        const sebab = SEBAB_SAH.has(v.sebab) ? v.sebab : 'lainnya';
        b[k] = { sebab, alasan: '', label: FRASA_SEBAB[sebab] };
      }
    }
    if (o.golongan) b.golongan = pangkatAman(o.golongan);
    if (o.sebelumnya) b.sebelumnya = pangkatAman(o.sebelumnya);

    let label = labelSintetis(b.kind, b.tool, o.label, i);
    if (label === null) {
      if (b.kind === 'promosi') label = 'naik pangkat ' + (b.sebelumnya || 'CPNS') + ' → ' + (b.golongan || 'Pengatur');
      else label = b.agen || 'agen-0';
    }
    if (b.kind === 'stop-gagal' || b.kind === 'notify') {
      const s = (b.macet && b.macet.sebab) || (b.butuh && b.butuh.sebab) || 'lainnya';
      label = FRASA_SEBAB[s];
    }
    if (label !== undefined && label !== null) b.label = label;
    keluar.push(b);
  });
  return keluar;
}

// Pangkat PNS: kamus tetap buku induk. Yang di luar daftar dipetakan ke
// 'Pengatur' — jangan sampai golongan karangan lolos sebagai teks bebas.
export const PANGKAT_SAH = ['CPNS', 'Juru', 'Pengatur', 'Penata', 'Pembina', 'Utama'];
const pangkatAman = (v) => (PANGKAT_SAH.includes(v) ? v : 'Pengatur');
const cacah = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/* ------------------------------------------------------- ekor sintetis --- *
 * Baris karangan yang ditempel SESUDAH baris sungguhan terakhir; alasannya
 * panjang lebar di kepala berkas ("EKOR SINTETIS"). Ringkasnya: kind 'nama'
 * TIDAK PERNAH bisa ada di buku agenda sungguhan (server menolaknya), dan kind
 * 'pagu' belum ada waktu hari ini direkam — jadi dua jalur halaman yang cukup
 * berisi (terimaPagu, terimaPerkenalan, wadah pegawaiTetap) berdiri tanpa satu
 * pun uji yang pernah menyentuhnya.
 *
 * Yang dijaga di sini supaya ekornya tidak diam-diam merusak invarian hari:
 *   * sesi yang dipakai HARUS sesi yang masih hidup di ujung hari (tidak punya
 *     session-end). Sesi yang sudah pulang akan DILAHIRKAN ULANG oleh
 *     agentFor() dan invarian H (jumlah sesi) uji-ulang.mjs langsung merah —
 *     benar-benar merah, bukan merah palsu: pegawai hantu memang bug;
 *   * baris 'pagu' ber-session KOSONG, persis seperti yang server kirim. Itu
 *     yang membuat baris ini menguji sesuatu: cabang `if (ev.kind === 'pagu')`
 *     di handle() WAJIB tetap berada di atas agentFor(), dan kalau ia turun
 *     satu baris saja, tiap nota melahirkan pegawai hantu bernama sesi kosong;
 *   * angkanya karangan bulat (PAGU_SINTETIS), bukan serapan siapa pun.
 *
 * Empat bentuk 'nama' sengaja dipakai semuanya — pelantikan pegawai BARU,
 * pelantikan pegawai LAMA (dua kalimat perkenalan yang berbeda), ganti nama
 * tanpa `tetap` (tidak boleh menerbitkan nota), dan nama kosong (menghapus
 * entri) — karena keempatnya cabang berbeda di case 'nama'. */
export const SINTETIS_MINGGU = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));      // mundur ke Senin
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};

/**
 * @param {object[]} disimpan  baris tersamar yang BENAR-BENAR disimpan
 * @returns {object[]} baris sintetis untuk ditempel di ekor (bisa kosong)
 */
export function barisSintetis(disimpan) {
  if (!disimpan || !disimpan.length) return [];
  const pulang = new Set(disimpan.filter((b) => b.kind === 'session-end').map((b) => b.session));
  const hidup = [];
  for (const b of disimpan) {
    if (b.session && !pulang.has(b.session) && !hidup.includes(b.session)) hidup.push(b.session);
  }
  const proyek = [];
  for (const b of disimpan) if (b.cwd && !proyek.includes(b.cwd)) proyek.push(b.cwd);
  const c1 = proyek[0] || 'proyek-1';
  const c2 = proyek[1] || c1;
  const akhir = disimpan[disimpan.length - 1].ts;
  const minggu = SINTETIS_MINGGU(akhir);
  let ts = akhir;
  const maju = (ms) => (ts += ms);
  const keluar = [];

  // --- kursi formasi (kind 'nama'): butuh sesi yang masih di ruangan ---
  if (hidup.length) {
    const s1 = hidup[0], s2 = hidup[1] || hidup[0];
    keluar.push({
      ts: maju(1500), kind: 'nama', session: s1, cwd: c1, ok: true, nama: 'nama-1',
      tetap: { slot: 1, sejak: akhir - 3600000, baru: true },
    });
    // cwd-nya sengaja c1 untuk KEDUA baris: handle() memakai ev.cwd untuk
    // memindahkan proyek pegawainya, dan memindahkan sesi sungguhan ke folder
    // lain di detik terakhir hari itu adalah mengarang, bukan menambah cakupan.
    keluar.push({
      ts: maju(2000), kind: 'nama', session: s2, cwd: c1, ok: true, nama: 'nama-2',
      tetap: { slot: 2, sejak: akhir - 7200000, baru: false },
    });
    // ganti nama biasa: TIDAK boleh menerbitkan nota lapor masuk
    keluar.push({ ts: maju(1000), kind: 'nama', session: s1, cwd: c1, ok: true, nama: 'nama-3' });
    // tanpa `nama`: menghapus entri namaPanggilan
    keluar.push({ ts: maju(1000), kind: 'nama', session: s1, cwd: c1, ok: true });
  }

  // --- nota pagu (kind 'pagu'): session SENGAJA kosong, seperti server ---
  keluar.push({
    ts: maju(2000), kind: 'pagu', session: '', cwd: c1, ok: true,
    ambang: 80, persen: 84, pakai: Math.round(PAGU_SINTETIS * 0.84), pagu: PAGU_SINTETIS, minggu,
  });
  keluar.push({
    ts: maju(2000), kind: 'pagu', session: '', cwd: c2, ok: true,
    ambang: 100, persen: 118, pakai: Math.round(PAGU_SINTETIS * 1.18), pagu: PAGU_SINTETIS, minggu,
  });
  // Nota lama tanpa angka: jalur "ANGKANYA BISA TIDAK ADA" di terimaPagu(),
  // yang harus menulis persen dari `ambang` dan TIDAK menulis "NaN dari NaN".
  keluar.push({ ts: maju(2000), kind: 'pagu', session: '', cwd: c1, ok: true, ambang: 80, minggu });
  return keluar;
}

/* ------------------------------------------------------ periksa privasi --- *
 * Per BIDANG, bukan satu regex besar untuk semua nilai. Bidang string yang
 * tidak ada aturannya = GAGAL — bukan dilewati. Itu bedanya daftar putih dan
 * daftar hitam: bidang baru yang suatu hari muncul di fixture akan menabrak
 * pagar ini, bukan menyelinap lewat. */
const RX = {
  sesi: /^(sesi-\d+)?$/,
  proyek: /^proyek-\d+$/,
  cabang: /^(master|main|cabang-\d+)?$/,
  panggilan: /^c-\d+$/,
  agenId: /^ag-\d+$/,
  agen: /^agen-\d+$/,
  peserta: /^peserta-\d+$/,
  nama: /^nama-\d+$/,
  mesin: /^mesin-\d+$/,
  /* DUA bentuk pseudonim alat, tidak ada cabang generik lagi. Yang lama
     — /^(?!mcp__)[A-Za-z][A-Za-z0-9_]{0,40}$/ — menolak awalan mcp__ (itu
     benar dan tetap dipertahankan lewat bentuk yang wajib srv-N/alat-M), tapi
     sisanya menerima APA SAJA sepanjang polanya cocok: `curl`, `KlienRahasiaPT`,
     `sk_live_abcdef`, dan nama tool plugin apa pun lolos utuh, karena
     samarTool() dulu meneruskan semua nama non-mcp apa adanya. Yang membuat
     fixture hari ini bersih cuma kebetulan bahwa mesin pemiliknya memakai
     tool bawaan. Sekarang: bawaan lewat ALAT_SAH (lihat toolAman), selain itu
     wajib pseudonim. */
  alat: /^(alat-\d+|mcp__srv-\d+__alat-\d+)$/,
  berkas: /^berkas-\d+\.[a-z0-9]{1,5}$/,
  skrip: /^node skrip-\d+\.mjs$/,
  pola: /^(pola|kueri|tugas)-\d+$/,
  promosi: /^naik pangkat [A-Za-z]+ → [A-Za-z]+$/,
  tanggal: /^\d{4}-\d{2}-\d{2}$/,
};

/** Nama tool yang boleh berdiri di fixture: bawaan yang disebut room.js, atau
 *  pseudonim bernomor. Tidak ada cabang "nama bebas yang kelihatan sopan". */
export const toolAman = (v) => typeof v === 'string' && (ALAT_SAH.has(v) || RX.alat.test(v));

function labelAman(nilai, verbGit) {
  if (LABEL_ENUM_SAH.has(nilai)) return true;
  if (RX.berkas.test(nilai) || RX.skrip.test(nilai) || RX.pola.test(nilai)) return true;
  if (RX.agen.test(nilai) || RX.peserta.test(nilai) || RX.promosi.test(nilai)) return true;
  const g = /^git ([a-z]+)$/.exec(nilai);
  if (g && verbGit.has(g[1])) return true;
  return false;
}

/**
 * @param {object[]} baris  baris agenda yang SUDAH dibentangkan (bukan kolumnar)
 * @param {string[]} verbGit  kunci KEGIATAN_GIT dari room.js asli
 * @returns {{indeks:number, jalur:string, nilai:string}[]} pelanggaran
 */
export function periksaPrivasi(baris, verbGit) {
  const verb = new Set(verbGit || []);
  const langgar = [];
  const tolak = (i, jalur, nilai) => langgar.push({ indeks: i, jalur, nilai: String(nilai).slice(0, 160) });

  baris.forEach((b, i) => {
    for (const [k, v] of Object.entries(b)) {
      if (!BIDANG_PUTIH.has(k)) { tolak(i, k, 'bidang di luar daftar putih'); continue; }
      switch (k) {
        case 'ts': if (!Number.isFinite(v)) tolak(i, k, v); break;
        case 'ok': case 'interupsi': case 'akhir':
          if (typeof v !== 'boolean') tolak(i, k, v); break;
        case 'kind': if (!KIND_SAH.has(v)) tolak(i, k, v); break;
        case 'session': if (!RX.sesi.test(v)) tolak(i, k, v); break;
        case 'cwd': if (!RX.proyek.test(v)) tolak(i, k, v); break;
        case 'cabang': if (!RX.cabang.test(v)) tolak(i, k, v); break;
        case 'panggilan': if (!RX.panggilan.test(v)) tolak(i, k, v); break;
        case 'agenId': if (!RX.agenId.test(v)) tolak(i, k, v); break;
        case 'agen': if (!RX.agen.test(v)) tolak(i, k, v); break;
        case 'nama': if (!RX.nama.test(v)) tolak(i, k, v); break;
        case 'mesin': if (!RX.mesin.test(v)) tolak(i, k, v); break;
        case 'tool': if (!toolAman(v)) tolak(i, k, v); break;
        case 'model': if (!MODEL_SAH.has(v)) tolak(i, k, v); break;
        case 'peran': if (!/^[a-z_]{2,30}$/.test(v)) tolak(i, k, v); break;
        case 'aksi': if (!AKSI_SAH.has(v)) tolak(i, k, v); break;
        case 'keputusan': if (!KEPUTUSAN_SAH.has(v)) tolak(i, k, v); break;
        case 'golongan': case 'sebelumnya':
          if (!PANGKAT_SAH.includes(v)) tolak(i, k, v); break;
        /* Nota pagu. Angka, bukan teks — jadi aturannya bentuk angka, dan
           `pakai`/`pagu` WAJIB persis pasangan sintetis yang dipasang
           samarkan(): serapan token sungguhan milik pemilik mesin tidak boleh
           ikut ter-commit walau ia "cuma angka". */
        case 'ambang': case 'persen':
          if (!Number.isInteger(v) || v < 0 || v > 1000) tolak(i, k, v); break;
        case 'pagu':
          if (v !== PAGU_SINTETIS) tolak(i, k, v); break;
        case 'pakai':
          if (!Number.isInteger(v) || v < 0 || v > 100 * PAGU_SINTETIS) tolak(i, k, v); break;
        case 'minggu': if (!RX.tanggal.test(v)) tolak(i, k, v); break;
        case 'tetap': {
          if (!v || typeof v !== 'object' || Array.isArray(v)) { tolak(i, k, v); break; }
          for (const [kk, vv] of Object.entries(v)) {
            if (kk === 'slot') { if (!Number.isInteger(vv) || vv < 0 || vv > 999) tolak(i, `${k}.slot`, vv); }
            else if (kk === 'sejak') { if (!Number.isFinite(vv)) tolak(i, `${k}.sejak`, vv); }
            else if (kk === 'baru') { if (typeof vv !== 'boolean') tolak(i, `${k}.baru`, vv); }
            else tolak(i, `${k}.${kk}`, 'bidang di luar daftar putih');
          }
          break;
        }
        case 'galat': case 'alasan':
          if (!GALAT_KATALOG.includes(v)) tolak(i, k, v); break;
        case 'label': if (!labelAman(String(v), verb)) tolak(i, k, v); break;
        case 'peserta':
          if (!Array.isArray(v)) { tolak(i, k, v); break; }
          v.forEach((p, j) => { if (!RX.peserta.test(String(p))) tolak(i, `${k}[${j}]`, p); });
          break;
        case 'butuh': case 'macet': {
          if (v === false) break;
          if (!v || typeof v !== 'object') { tolak(i, k, v); break; }
          for (const [kk, vv] of Object.entries(v)) {
            if (kk === 'sebab') { if (!SEBAB_SAH.has(vv)) tolak(i, `${k}.sebab`, vv); }
            else if (kk === 'alasan') { if (vv !== '') tolak(i, `${k}.alasan`, vv); }
            else if (kk === 'label') { if (!FRASA_SAH.has(vv)) tolak(i, `${k}.label`, vv); }
            else tolak(i, `${k}.${kk}`, 'bidang di luar daftar putih');
          }
          break;
        }
        default: tolak(i, k, 'bidang tanpa aturan privasi'); break;
      }
    }
  });
  return langgar;
}

/* ------------------------------------------------- periksa kamus kepala --- *
 * periksaPrivasi() di atas bekerja atas baris yang SUDAH dibentangkan, jadi ia
 * hanya pernah melihat nilai yang benar-benar DIRUJUK sebuah baris. Entri
 * kamus yang tidak ditunjuk baris mana pun — yatim — lewat tanpa disentuh.
 * Itu celah nyata: kamus ikut ter-commit apa adanya, dan satu jalur berkas
 * yang diselipkan tangan ke kamus.label akan lolos walau tidak ada baris yang
 * memakainya. Fixture yang dibuat berkas ini memang tidak punya yatim lagi
 * (muatkanKeAnggaran() membangun kamus dari baris yang benar-benar disimpan),
 * tapi yang menutup celahnya PEMERIKSAAN ini, bukan cara pembuatannya —
 * fixture bisa disunting tangan, dan uji-ulang.mjs memanggil fungsi ini tiap
 * kali CI jalan. */
/* Prototipe null, bukan objek biasa: dengan objek biasa, kamus bernama
   'toString' atau 'constructor' lolos `nama in ATURAN_KAMUS` lewat warisan
   Object.prototype, lalu nilainya "diperiksa" oleh fungsi yang bukan pemeriksa
   dan hasilnya truthy. Fixture bisa disunting tangan; pagar privasi tidak
   boleh punya pintu belakang senonjol itu. */
const ATURAN_KAMUS = Object.assign(Object.create(null), {
  kind: (v) => KIND_SAH.has(v),
  sesi: (v) => RX.sesi.test(v),
  cwd: (v) => RX.proyek.test(v),
  tool: (v) => toolAman(v),
  cabang: (v) => RX.cabang.test(v),
  agen: (v) => RX.agen.test(v),
  model: (v) => MODEL_SAH.has(v),
  label: null,                       // butuh daftar verb git — ditangani khusus
});

/**
 * @param {object} kamus     kepala.kamus dari fixture (nama -> larik nilai)
 * @param {string[]} verbGit kunci KEGIATAN_GIT dari room.js asli
 * @returns {{indeks:number, jalur:string, nilai:string}[]} pelanggaran
 */
export function periksaKamus(kamus, verbGit) {
  const verb = new Set(verbGit || []);
  const langgar = [];
  const tolak = (jalur, nilai) => langgar.push({ indeks: -1, jalur, nilai: String(nilai).slice(0, 160) });
  if (!kamus || typeof kamus !== 'object') {
    tolak('kamus', 'kamus hilang dari kepala fixture');
    return langgar;
  }
  for (const [nama, isi] of Object.entries(kamus)) {
    if (!(nama in ATURAN_KAMUS)) { tolak('kamus.' + nama, 'kamus di luar daftar putih'); continue; }
    if (!Array.isArray(isi)) { tolak('kamus.' + nama, 'bukan larik'); continue; }
    isi.forEach((v, i) => {
      const sah = typeof v === 'string'
        && (nama === 'label' ? labelAman(v, verb) : ATURAN_KAMUS[nama](v));
      if (!sah) tolak(`kamus.${nama}[${i}]`, v);
    });
  }
  return langgar;
}

/* ------------------------------------------------ periksa kepala fixture --- *
 * Pagar KETIGA, dan yang paling lama tidak ada. periksaPrivasi() memakan
 * `baris`, periksaKamus() memakan `kepala.kamus` — dan SELURUH kepala di luar
 * kamus tidak diperiksa siapa pun. Itu bukan lubang teoretis: `catatan` adalah
 * teks bebas 230 karakter yang ikut ter-commit dan ikut terkirim ke npm
 * (package.json "files"), jadi satu jalur Windows atau satu nama server MCP
 * yang diselipkan ke sana pulang HIJAU exit 0 — sementara nilai yang SAMA
 * PERSIS di `kamus.label` ditolak keras. Penyunting tangan cuma perlu
 * memindahkan nilainya satu baris ke atas.
 *
 * Karena itu kepala diperlakukan sama seperti kamus: daftar putih kunci yang
 * WAJIB lengkap dan tidak boleh lebih, dan tiap nilainya punya bentuk pasti.
 * Tidak ada satu pun bidang kepala yang berupa teks bebas — `catatan`
 * disamakan dengan satu konstanta, bukan diperiksa polanya, karena memang
 * tidak ada alasan sah untuk mengubahnya per-fixture. */
export const KEPALA_PUTIH = [
  'fixture', 'versi', 'dari', 'mulai', 'kolom', 'kamus', 'catatan', 'baris', 'sintetis',
];
export const CATATAN = 'Label & pengenal SINTETIS, bukan isi sungguhan. Dibuat buat-fixture.mjs; '
  + 'kesetiaan stasiun dijaga stationFor() asli room.js, privasi diperiksa ulang tiap CI '
  + 'lewat periksaPrivasi(). `sintetis` = jumlah baris karangan di EKOR (jalur pagu & '
  + 'pegawai tetap yang tidak bisa masuk buku agenda sungguhan); sisanya hari sungguhan '
  + 'apa adanya. JANGAN disunting tangan — jalankan buat-fixture.mjs.';

/**
 * @param {object} kepala  baris pertama fixture, `kamus` diperiksa terpisah
 * @returns {{indeks:number, jalur:string, nilai:string}[]} pelanggaran
 */
export function periksaKepala(kepala) {
  const langgar = [];
  const tolak = (jalur, nilai) => langgar.push({ indeks: -1, jalur, nilai: String(nilai).slice(0, 160) });
  if (!kepala || typeof kepala !== 'object' || Array.isArray(kepala)) {
    tolak('kepala', 'kepala fixture hilang atau bukan objek');
    return langgar;
  }
  const putih = new Set(KEPALA_PUTIH);
  for (const k of Object.keys(kepala)) {
    if (!putih.has(k)) tolak('kepala.' + k, 'kunci kepala di luar daftar putih');
  }
  for (const k of KEPALA_PUTIH) {
    if (!(k in kepala)) tolak('kepala.' + k, 'kunci kepala wajib ini hilang');
  }
  const K = kepala;
  if (K.fixture !== 'agenda-hari') tolak('kepala.fixture', K.fixture);
  if (K.versi !== 1) tolak('kepala.versi', K.versi);
  if (typeof K.dari !== 'string' || !RX.tanggal.test(K.dari)) tolak('kepala.dari', K.dari);
  if (!Number.isFinite(K.mulai) || K.mulai <= 0) tolak('kepala.mulai', K.mulai);
  if (!Number.isInteger(K.baris) || K.baris < 1) tolak('kepala.baris', K.baris);
  if (!Number.isInteger(K.sintetis) || K.sintetis < 0
    || (Number.isInteger(K.baris) && K.sintetis > K.baris)) tolak('kepala.sintetis', K.sintetis);
  if (!Array.isArray(K.kolom) || K.kolom.length !== KOLOM.length
    || K.kolom.some((v, i) => v !== KOLOM[i])) tolak('kepala.kolom', JSON.stringify(K.kolom));
  if (K.catatan !== CATATAN) tolak('kepala.catatan', K.catatan);
  return langgar;
}

/* --------------------------------------------------------- kolumnar ------ */
export const KOLOM =['dt', 'kind', 'sesi', 'cwd', 'tool', 'label', 'ok', 'panggilan', 'cabang', 'tambahan'];

export function kolomkan(baris, tanggal) {
  const kamus = { kind: [], sesi: [], cwd: [], tool: [], label: [], cabang: [], agen: [], model: [] };
  const idx = {};
  for (const k of Object.keys(kamus)) idx[k] = new Map();
  const ambil = (nama, nilai) => {
    if (nilai === undefined || nilai === null) return -1;
    const m = idx[nama];
    if (!m.has(nilai)) { m.set(nilai, kamus[nama].length); kamus[nama].push(nilai); }
    return m.get(nilai);
  };
  const nomor = (s, awalan) => (s ? Number(String(s).slice(awalan.length)) : 0);

  let sebelum = baris.length ? baris[0].ts : 0;
  const larik = baris.map((b) => {
    const dt = b.ts - sebelum;
    sebelum = b.ts;
    const t = {};
    if (b.model) t.m = ambil('model', b.model);
    if (b.agen) t.a = ambil('agen', b.agen);
    if (b.agenId) t.g = nomor(b.agenId, 'ag-');
    if (b.peserta) t.p = b.peserta.length;
    if (b.galat) t.e = GALAT_KATALOG.indexOf(b.galat);
    if (b.alasan) t.l = GALAT_KATALOG.indexOf(b.alasan);
    if (b.macet !== undefined) t.k = b.macet === false ? 0 : [...SEBAB_SAH].indexOf(b.macet.sebab) + 1;
    if (b.butuh !== undefined) t.b = b.butuh === false ? 0 : [...SEBAB_SAH].indexOf(b.butuh.sebab) + 1;
    if (b.golongan) t.G = PANGKAT_SAH.indexOf(b.golongan);
    if (b.sebelumnya) t.S = PANGKAT_SAH.indexOf(b.sebelumnya);
    if (b.nama) t.n = b.nama;
    if (b.mesin) t.s = b.mesin;
    if (b.peran) t.r = b.peran;
    if (b.interupsi) t.i = 1;
    if (b.akhir) t.h = 1;
    if (b.aksi) t.x = b.aksi;
    if (b.keputusan) t.q = b.keputusan;
    // nota pagu; `pakai`/`pagu` boleh 0, jadi diperiksa undefined, bukan truthy
    if (b.ambang !== undefined) t.A = b.ambang;
    if (b.persen !== undefined) t.P = b.persen;
    if (b.pakai !== undefined) t.u = b.pakai;
    if (b.pagu !== undefined) t.U = b.pagu;
    if (b.minggu) t.w = b.minggu;
    // kursi formasi jadi tiga angka: [slot, sejak, baru]
    if (b.tetap) t.T = [b.tetap.slot, b.tetap.sejak, b.tetap.baru ? 1 : 0];
    const inti = [
      dt,
      ambil('kind', b.kind),
      ambil('sesi', b.session),
      ambil('cwd', b.cwd),
      ambil('tool', b.tool),
      ambil('label', b.label),
      b.ok ? 1 : 0,
      nomor(b.panggilan, 'c-'),
      ambil('cabang', b.cabang),
    ];
    if (Object.keys(t).length) inti.push(t);
    return inti;
  });

  const kepala = {
    fixture: 'agenda-hari', versi: 1, dari: tanggal,
    mulai: baris.length ? baris[0].ts : 0,
    kolom: KOLOM, kamus,
    catatan: CATATAN,
  };
  return { kepala, larik };
}

/** Kebalikan kolomkan(): kembali ke bentuk baris buku agenda yang dimakan handle(). */
export function bentangkan(kepala, larik) {
  const K = kepala.kamus;
  const sebab = [...SEBAB_SAH];
  let ts = kepala.mulai || 0;
  return larik.map((r) => {
    ts += r[0];
    const b = { ts, kind: K.kind[r[1]], session: K.sesi[r[2]] };
    if (r[3] >= 0) b.cwd = K.cwd[r[3]];
    if (r[4] >= 0) b.tool = K.tool[r[4]];
    if (r[5] >= 0) b.label = K.label[r[5]];
    b.ok = r[6] === 1;
    if (r[7]) b.panggilan = 'c-' + r[7];
    if (r[8] >= 0) b.cabang = K.cabang[r[8]];
    const t = r[9];
    if (t) {
      if (t.m !== undefined) b.model = K.model[t.m];
      if (t.a !== undefined) b.agen = K.agen[t.a];
      if (t.g !== undefined) b.agenId = 'ag-' + t.g;
      if (t.p !== undefined) b.peserta = Array.from({ length: t.p }, (_, i) => 'peserta-' + (i + 1));
      if (t.e !== undefined) b.galat = GALAT_KATALOG[t.e];
      if (t.l !== undefined) b.alasan = GALAT_KATALOG[t.l];
      if (t.k !== undefined) b.macet = t.k === 0 ? false : { sebab: sebab[t.k - 1], alasan: '', label: FRASA_SEBAB[sebab[t.k - 1]] };
      if (t.b !== undefined) b.butuh = t.b === 0 ? false : { sebab: sebab[t.b - 1], alasan: '', label: FRASA_SEBAB[sebab[t.b - 1]] };
      if (t.G !== undefined) b.golongan = PANGKAT_SAH[t.G];
      if (t.S !== undefined) b.sebelumnya = PANGKAT_SAH[t.S];
      if (t.n !== undefined) b.nama = t.n;
      if (t.s !== undefined) b.mesin = t.s;
      if (t.r !== undefined) b.peran = t.r;
      if (t.i) b.interupsi = true;
      if (t.h) b.akhir = true;
      if (t.x) b.aksi = t.x;
      if (t.q) b.keputusan = t.q;
      if (t.A !== undefined) b.ambang = t.A;
      if (t.P !== undefined) b.persen = t.P;
      if (t.u !== undefined) b.pakai = t.u;
      if (t.U !== undefined) b.pagu = t.U;
      if (t.w !== undefined) b.minggu = t.w;
      if (Array.isArray(t.T)) b.tetap = { slot: t.T[0], sejak: t.T[1], baru: t.T[2] === 1 };
    }
    return b;
  });
}

/* --------------------------------------------- periksa larik mentah ------ *
 * Pagar KEEMPAT. Tiga pagar sebelumnya semuanya memeriksa hasil AKHIR:
 * periksaPrivasi() memakan baris yang sudah lewat bentangkan(), dan
 * bentangkan() DIAM-DIAM MEMBUANG apa yang tidak dikenalnya —
 * `{"zz":"C:\\Users\\..."}` di kolom `tambahan` tidak pernah jadi bidang mana
 * pun, jadi tidak pernah ditolak siapa pun, tapi tetap terbaca utuh oleh siapa
 * saja yang membuka berkasnya. Begitu juga indeks kamus di luar jangkauan dan
 * nilai bertipe salah di sembilan kolom inti.
 *
 * Jadi pagar ini memeriksa BENTUK MENTAHnya: sembilan kolom inti wajib
 * bilangan bulat dalam jangkauan kamusnya, kolom kesepuluh (kalau ada) wajib
 * objek biasa yang SETIAP kuncinya ada di ATURAN_TAMBAHAN dengan tipe yang
 * benar. Nilai stringnya sendiri sudah diurus periksaPrivasi()/periksaKamus();
 * yang di sini memastikan tidak ada tempat sembunyi di luar jangkauan mereka. */
const ATURAN_TAMBAHAN = Object.assign(Object.create(null), {
  m: (v, K) => Number.isInteger(v) && v >= 0 && v < ((K.model || []).length),
  a: (v, K) => Number.isInteger(v) && v >= 0 && v < ((K.agen || []).length),
  g: (v) => Number.isInteger(v) && v >= 0 && v < 100000,
  p: (v) => Number.isInteger(v) && v >= 0 && v <= 64,
  e: (v) => Number.isInteger(v) && v >= 0 && v < GALAT_KATALOG.length,
  l: (v) => Number.isInteger(v) && v >= 0 && v < GALAT_KATALOG.length,
  k: (v) => Number.isInteger(v) && v >= 0 && v <= SEBAB_SAH.size,
  b: (v) => Number.isInteger(v) && v >= 0 && v <= SEBAB_SAH.size,
  G: (v) => Number.isInteger(v) && v >= 0 && v < PANGKAT_SAH.length,
  S: (v) => Number.isInteger(v) && v >= 0 && v < PANGKAT_SAH.length,
  n: (v) => typeof v === 'string' && RX.nama.test(v),
  s: (v) => typeof v === 'string' && RX.mesin.test(v),
  r: (v) => typeof v === 'string' && /^[a-z_]{2,30}$/.test(v),
  i: (v) => v === 1,
  h: (v) => v === 1,
  x: (v) => typeof v === 'string' && AKSI_SAH.has(v),
  q: (v) => typeof v === 'string' && KEPUTUSAN_SAH.has(v),
  A: (v) => Number.isInteger(v) && v >= 0 && v <= 1000,
  P: (v) => Number.isInteger(v) && v >= 0 && v <= 1000,
  u: (v) => Number.isInteger(v) && v >= 0 && v <= 100 * PAGU_SINTETIS,
  U: (v) => v === PAGU_SINTETIS,
  w: (v) => typeof v === 'string' && RX.tanggal.test(v),
  T: (v) => Array.isArray(v) && v.length === 3
    && Number.isInteger(v[0]) && v[0] >= 0 && v[0] <= 999
    && Number.isFinite(v[1]) && (v[2] === 0 || v[2] === 1),
});

/**
 * @param {object} kepala  kepala fixture (dipakai untuk panjang kamus)
 * @param {any[][]} larik  baris kolumnar MENTAH, belum dibentangkan
 * @returns {{indeks:number, jalur:string, nilai:string}[]} pelanggaran
 */
export function periksaLarik(kepala, larik) {
  const langgar = [];
  const tolak = (i, jalur, nilai) => langgar.push({ indeks: i, jalur, nilai: String(nilai).slice(0, 160) });
  const K = (kepala && kepala.kamus) || {};
  // Kolom inti: [nama kamus, boleh -1?] — -1 berarti "bidang ini tidak ada".
  const INTI = [
    null, ['kind', false], ['sesi', false], ['cwd', true], ['tool', true],
    ['label', true], null, null, ['cabang', true],
  ];
  if (!Array.isArray(larik)) { tolak(-1, 'larik', 'bukan larik'); return langgar; }
  larik.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 9 || r.length > 10) {
      tolak(i, 'baris', Array.isArray(r) ? `${r.length} kolom, harus 9 atau 10` : 'bukan larik');
      return;
    }
    if (!Number.isInteger(r[0])) tolak(i, 'dt', r[0]);
    if (r[6] !== 0 && r[6] !== 1) tolak(i, 'ok', r[6]);
    if (!Number.isInteger(r[7]) || r[7] < 0) tolak(i, 'panggilan', r[7]);
    for (let c = 1; c < 9; c++) {
      const aturan = INTI[c];
      if (!aturan) continue;
      const [nama, bolehKosong] = aturan;
      const isi = Array.isArray(K[nama]) ? K[nama] : [];
      if (!Number.isInteger(r[c])) { tolak(i, KOLOM[c], r[c]); continue; }
      if (r[c] === -1 && bolehKosong) continue;
      if (r[c] < 0 || r[c] >= isi.length) tolak(i, KOLOM[c], `indeks ${r[c]} di luar kamus.${nama} (${isi.length})`);
    }
    const t = r[9];
    if (t === undefined) return;
    if (!t || typeof t !== 'object' || Array.isArray(t)) { tolak(i, 'tambahan', t); return; }
    for (const [k, v] of Object.entries(t)) {
      if (!(k in ATURAN_TAMBAHAN)) { tolak(i, 'tambahan.' + k, 'kunci tambahan di luar daftar putih'); continue; }
      if (!ATURAN_TAMBAHAN[k](v, K)) tolak(i, 'tambahan.' + k, JSON.stringify(v));
    }
  });
  return langgar;
}

/** Baca fixture kolumnar dari disk dan langsung bentangkan. */
export function muatFixture(berkas = FIXTURE) {
  const teks = fs.readFileSync(berkas, 'utf8').split('\n').filter((t) => t.trim());
  if (!teks.length) throw new Error('fixture kosong: ' + berkas);
  const kepala = JSON.parse(teks[0]);
  if (kepala.fixture !== 'agenda-hari') throw new Error('bukan fixture agenda-hari: ' + berkas);
  const larik = teks.slice(1).map((t) => JSON.parse(t));
  return { kepala, larik, baris: bentangkan(kepala, larik) };
}

/* ------------------------------------------------------------- tulis ----- */
function rakit(kepala, larik) {
  return JSON.stringify(kepala) + '\n' + larik.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

/* Baris TERBANYAK yang muat di anggaran, dipangkas dari EKOR (harinya jadi
   lebih pendek, bukan berlubang di tengah).

   Kolumnarnya dibangun ULANG untuk tiap calon panjang, bukan lariknya saja
   yang dipotong. Itu bedanya dengan cara lama, dan bukan soal kerapian:
   kolomkan() atas SELURUH hari lalu memotong lariknya meninggalkan kamus yang
   masih menyimpan nilai milik baris yang sudah dibuang — 187 label, 5 tool,
   dan 2 kind yatim ikut ter-commit di fixture lama, tanpa satu baris pun
   merujuknya. Membangun kamus dari baris yang benar-benar disimpan membuat
   yatim mustahil ada, dan mengembalikan ~4 KB anggaran untuk baris sungguhan.

   Ukurannya naik monoton terhadap n, jadi pencarian binernya sah; 13 kali
   kolomkan() atas ~5.500 baris tidak terasa (di bawah satu detik).

   EKOR SINTETIS ikut dihitung di dalam tiap calon, bukan ditempel sesudah
   anggarannya habis: kamusnya harus memuat nilai ekor juga, dan ekornya harus
   ikut menekan berapa banyak baris sungguhan yang muat. Ekornya dibangkitkan
   ULANG untuk tiap n karena ts-nya menyambung baris sungguhan terakhir. */
function muatkanKeAnggaran(tersamar, hari, maksByte) {
  const coba = (n) => {
    const inti = tersamar.slice(0, n);
    const ekor = barisSintetis(inti);
    const { kepala, larik } = kolomkan(inti.concat(ekor), hari);
    kepala.baris = n + ekor.length;
    kepala.sintetis = ekor.length;
    const isi = rakit(kepala, larik);
    return { kepala, larik, isi, byte: Buffer.byteLength(isi, 'utf8'), nyata: n, ekor };
  };
  let lo = 1, hi = Math.max(1, tersamar.length);
  let terbaik = coba(lo);                       // invarian: terbaik === coba(lo)
  if (terbaik.byte > maksByte) return terbaik;  // kepala saja sudah melewati batas
  while (lo < hi) {
    const tengah = Math.ceil((lo + hi) / 2);
    const c = coba(tengah);
    if (c.byte <= maksByte) { lo = tengah; terbaik = c; } else hi = tengah - 1;
  }
  return terbaik;
}

/* ----------------------------------------------------------------- CLI --- */
const bendera = (argv, nama, bawaan = null) => {
  const i = argv.indexOf(nama);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : bawaan;
};
const jamHari = (ts) => {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/* ------------------------------------------------------------ uji pagar --- *
 * KASUS MERAH YANG IKUT TER-COMMIT.
 *
 * Kenapa mode ini ada, ditulis terang supaya tidak dihapus orang berikutnya
 * sebagai "uji yang mengulang isi kode": keempat pagar di berkas ini sampai
 * hari ini cuma pernah dijalankan atas fixture BERSIH — yaitu jalur yang
 * selalu lulus. Waktu pemeriksa mengembalikan RX.tool ke bentuk bolongnya yang
 * lama, `node uji-ulang.mjs` tetap hijau exit 0 dan tidak ada satu berkas pun
 * di repo yang menyadarinya. Pagar tanpa kasus merah bukan pagar; ia cuma
 * kalimat.
 *
 * Tabelnya sengaja memuat DUA arah. Kasus 'tolak' membuktikan pagarnya
 * menggigit; kasus 'lolos' membuktikan ia tidak asal menggigit — tanpa itu,
 * `() => false` lulus semua kasus merah dengan gemilang.
 *
 * Tabelnya TIDAK cuma hidup di mode CLI ini. uji-ulang.mjs — yang memang
 * sudah terdaftar di CI — menjalankan jalankanPagar() tiap kali ia jalan, dan
 * merah kalau ada kasus yang meleset. Itu disengaja: kalau kasus merahnya cuma
 * bisa dipanggil lewat perintah yang harus diingat orang, ia akan bernasib
 * sama seperti pagar yang dijaganya. Mode CLI di bawah cuma versi yang
 * mencetak tabelnya untuk dibaca manusia.
 *
 * UTANG (tugas penutup, bukan tugas ini): mendaftarkan `node buat-fixture.mjs
 * --uji-pagar` ke skrip `test` di package.json dan ke .github/workflows/uji.yml
 * supaya tabelnya bisa dibaca sendiri di CI. Kedua berkas itu di luar
 * jangkauan tugas yang menulis mode ini.
 *
 * @param {string[]} verbGit kunci KEGIATAN_GIT dari room.js asli
 * @returns {{pagar:string, nama:string, harusTolak:boolean, benar:boolean, ket:string}[]}
 */
export function kasusPagar(verbGit) {
  const verb = verbGit;
  const B = (over) => ({ ts: 1788442967738, kind: 'post', session: 'sesi-1', ok: true, ...over });
  const KAMUS_CONTOH = () => ({
    kind: ['post'], sesi: ['sesi-1'], cwd: ['proyek-1'], tool: ['Bash'],
    label: ['git status'], cabang: ['master'], agen: ['agen-1'], model: ['claude-opus-5'],
  });
  const KEPALA = (over) => ({
    fixture: 'agenda-hari', versi: 1, dari: '2026-09-03', mulai: 1788442967738,
    kolom: KOLOM.slice(), kamus: KAMUS_CONTOH(), catatan: CATATAN, baris: 1, sintetis: 0,
    ...over,
  });
  const R = (over = {}) => {
    const r = [0, 0, 0, 0, 0, 0, 1, 0, 0];
    if (over.t) r.push(over.t);
    return r;
  };
  // Nilai racun yang dipakai berulang: jalur Windows sungguhan, nama server
  // MCP sungguhan, dan sesuatu yang berbentuk rahasia.
  const JALUR = 'C:\\Users\\Fauzi\\rahasia-tak-dirujuk.txt';
  const SRV = 'mcp__Claude_Browser__navigate';

  const kasus = [
    // ---- pagar 1: periksaPrivasi() atas baris ----
    ['privasi', 'tool = nama server MCP sungguhan', true, () => periksaPrivasi([B({ tool: SRV })], verb)],
    ['privasi', 'tool = MCP__Rahasia__alat (kasus lain)', true, () => periksaPrivasi([B({ tool: 'MCP__Rahasia__alat' })], verb)],
    ['privasi', 'tool = mCp__x__y (kasus campur)', true, () => periksaPrivasi([B({ tool: 'mCp__x__y' })], verb)],
    ['privasi', 'tool = curl (nama bebas non-mcp)', true, () => periksaPrivasi([B({ tool: 'curl' })], verb)],
    ['privasi', 'tool = KlienRahasiaPT', true, () => periksaPrivasi([B({ tool: 'KlienRahasiaPT' })], verb)],
    ['privasi', 'tool = sk_live_abcdef', true, () => periksaPrivasi([B({ tool: 'sk_live_abcdef' })], verb)],
    ['privasi', 'label = jalur Windows', true, () => periksaPrivasi([B({ label: JALUR })], verb)],
    ['privasi', 'cwd = jalur proyek sungguhan', true, () => periksaPrivasi([B({ cwd: 'I:\\NGODING\\JS\\agent-room' })], verb)],
    ['privasi', 'nama = nama orang', true, () => periksaPrivasi([B({ nama: 'Fauzi' })], verb)],
    ['privasi', 'bidang baru di luar daftar putih', true, () => periksaPrivasi([B({ jejak: JALUR })], verb)],
    ['privasi', 'pagu bukan PAGU_SINTETIS (serapan sungguhan)', true,
      () => periksaPrivasi([B({ kind: 'pagu', session: '', pagu: 743219, pakai: 620183 })], verb)],
    ['privasi', 'minggu bukan YYYY-MM-DD', true, () => periksaPrivasi([B({ kind: 'pagu', session: '', minggu: 'minggu lalu' })], verb)],
    ['privasi', 'tetap.<bidang asing>', true,
      () => periksaPrivasi([B({ kind: 'nama', tetap: { slot: 1, sejak: 1, baru: true, rahasia: JALUR } })], verb)],
    ['privasi', 'tool bawaan & pseudonim & label sah', false, () => [
      ...periksaPrivasi([B({ tool: 'Bash', label: 'git status' })], verb),
      ...periksaPrivasi([B({ tool: 'mcp__srv-1__alat-2', label: '' })], verb),
      ...periksaPrivasi([B({ tool: 'alat-7', label: 'berkas-1.js' })], verb),
    ]],
    ['privasi', 'baris pagu & nama sintetis yang sah', false, () => [
      ...periksaPrivasi([B({
        kind: 'pagu', session: '', cwd: 'proyek-1', ambang: 80, persen: 84,
        pakai: 840000, pagu: PAGU_SINTETIS, minggu: '2026-08-31',
      })], verb),
      ...periksaPrivasi([B({ kind: 'nama', nama: 'nama-1', tetap: { slot: 1, sejak: 1788442967738, baru: true } })], verb),
    ]],

    // ---- pagar 2: periksaKamus() atas kamus kepala ----
    ['kamus', 'kamus di luar daftar putih', true, () => periksaKamus({ rahasia: [JALUR] }, verb)],
    ['kamus', "kamus bernama 'toString' (pintu belakang prototipe)", true, () => periksaKamus({ toString: [JALUR] }, verb)],
    ['kamus', 'jalur Windows di kamus.label (entri yatim)', true, () => periksaKamus({ label: [JALUR] }, verb)],
    ['kamus', 'nama server MCP di kamus.tool', true, () => periksaKamus({ tool: [SRV] }, verb)],
    ['kamus', 'nama tool bebas di kamus.tool', true, () => periksaKamus({ tool: ['curl'] }, verb)],
    ['kamus', 'kamus sah apa adanya', false, () => periksaKamus(KAMUS_CONTOH(), verb)],

    // ---- pagar 3: periksaKepala() ----
    ['kepala', 'catatan diganti teks bebas berisi jalur', true, () => periksaKepala(KEPALA({ catatan: JALUR + ' — token sk-ant-xyz' }))],
    ['kepala', 'kunci kepala baru (jejak)', true, () => periksaKepala(KEPALA({ jejak: [JALUR, SRV] }))],
    ['kepala', 'dari = jalur berkas', true, () => periksaKepala(KEPALA({ dari: JALUR }))],
    ['kepala', 'kolom tidak sama dengan KOLOM', true, () => periksaKepala(KEPALA({ kolom: ['dt', 'kind'] }))],
    ['kepala', 'sintetis lebih banyak daripada baris', true, () => periksaKepala(KEPALA({ baris: 3, sintetis: 9 }))],
    ['kepala', 'kunci kepala wajib hilang (sintetis)', true, () => {
      const k = KEPALA(); delete k.sintetis; return periksaKepala(k);
    }],
    ['kepala', 'kepala sah apa adanya', false, () => periksaKepala(KEPALA())],

    // ---- pagar 4: periksaLarik() atas baris mentah ----
    ['larik', 'kunci tambahan asing (dibuang bentangkan)', true,
      () => periksaLarik(KEPALA(), [R({ t: { zz: JALUR } })])],
    ['larik', 'tambahan.n berisi nama orang', true, () => periksaLarik(KEPALA(), [R({ t: { n: 'Fauzi' } })])],
    ['larik', 'tambahan.w berisi teks bebas', true, () => periksaLarik(KEPALA(), [R({ t: { w: JALUR } })])],
    ['larik', 'indeks kamus di luar jangkauan', true, () => periksaLarik(KEPALA(), [[0, 99, 0, 0, 0, 0, 1, 0, 0]])],
    ['larik', 'jumlah kolom salah', true, () => periksaLarik(KEPALA(), [[0, 0, 0, 0, 0, 0, 1, 0]])],
    ['larik', 'kolom ok bukan 0/1', true, () => periksaLarik(KEPALA(), [[0, 0, 0, 0, 0, 0, 2, 0, 0]])],
    ['larik', 'string di kolom inti', true, () => periksaLarik(KEPALA(), [[0, 0, 0, 0, 0, 0, 1, 0, JALUR]])],
    ['larik', 'baris mentah sah (dengan & tanpa tambahan)', false, () => [
      ...periksaLarik(KEPALA(), [R()]),
      ...periksaLarik(KEPALA(), [R({ t: { A: 80, P: 84, u: 840000, U: PAGU_SINTETIS, w: '2026-08-31' } })]),
      ...periksaLarik(KEPALA(), [R({ t: { T: [1, 1788442967738, 1] } })]),
    ]],
  ];

  /* ALAT_ROOM bukan daftar selera: tiap namanya WAJIB masih disebut room.js
     (sebagai kunci TOOL_STATION/KEGIATAN atau cabang SHELL_TOOL/THINK_TOOL,
     jadi yang dicari kata utuhnya, bukan yang berkutip). Kalau room.js
     membuang satu nama tool, daftar ini ikut menyusut — kalau tidak, ia
     perlahan berubah jadi daftar hitam yang menua diam-diam.
     ALAT_LUAR diperiksa dari arah SEBALIKNYA: yang ternyata sudah disebut
     room.js harus pindah ke ALAT_ROOM, dan jumlahnya dibatasi supaya tidak
     jadi got tempat membuang nama tool baru tanpa alasan. */
  const sumberRoom = fs.readFileSync(path.join(__dirname, 'public', 'room.js'), 'utf8');
  const disebutRoom = (n) => new RegExp('(^|[^A-Za-z0-9_])' + n + '([^A-Za-z0-9_]|$)').test(sumberRoom);
  const alatYatim = [...ALAT_ROOM].filter((n) => !disebutRoom(n));
  const luarSalahTempat = [...ALAT_LUAR].filter((n) => disebutRoom(n));
  kasus.push(['konsistensi', `ALAT_ROOM (${ALAT_ROOM.size} nama) masih disebut room.js`, false,
    () => alatYatim.map((n) => ({ indeks: -1, jalur: 'ALAT_ROOM', nilai: n + ' tidak ada lagi di room.js' }))]);
  kasus.push(['konsistensi', `ALAT_LUAR ${ALAT_LUAR.size}/${ALAT_LUAR_MAKS} entri tangan`, false,
    () => luarSalahTempat.map((n) => ({ indeks: -1, jalur: 'ALAT_LUAR', nilai: n + ' sudah disebut room.js, pindahkan ke ALAT_ROOM' }))
      .concat(ALAT_LUAR.size > ALAT_LUAR_MAKS
        ? [{ indeks: -1, jalur: 'ALAT_LUAR', nilai: `${ALAT_LUAR.size} entri, batas ${ALAT_LUAR_MAKS}` }] : [])]);

  return kasus.map(([pagar, nama, harusTolak, jalan]) => {
    let langgar = [], lempar = null;
    try { langgar = jalan(); } catch (e) { lempar = e; }
    const ditolak = !lempar && langgar.length > 0;
    return {
      pagar, nama, harusTolak, benar: !lempar && ditolak === harusTolak,
      ket: lempar ? 'melempar: ' + lempar.message
        : (harusTolak ? `${langgar.length} pelanggaran`
          : `${langgar.length} pelanggaran (harus 0)`
            + (langgar.length ? ' :: ' + langgar.slice(0, 2).map((p) => `${p.jalur}=${JSON.stringify(p.nilai)}`).join(', ') : '')),
    };
  });
}

/** Ringkas untuk pemanggil non-CLI (uji-ulang.mjs): daftar kasus yang meleset. */
export function jalankanPagar(verbGit) {
  return kasusPagar(verbGit).filter((k) => !k.benar);
}

function ujiPagar() {
  const alat = buatAlat();
  const verb = alat.verbGit;
  const hasil = kasusPagar(verb);
  let gagal = 0, pagarLalu = '';
  for (const k of hasil) {
    if (k.pagar !== pagarLalu) { console.log(abu('  ' + k.pagar)); pagarLalu = k.pagar; }
    if (!k.benar) gagal++;
    console.log(`${k.benar ? hijau('  ok  ') : merah('  XX  ')}`
      + `${k.harusTolak ? 'tolak' : 'lolos'}  ${k.nama}  ${k.benar ? abu(k.ket) : merah(k.ket)}`);
  }

  // Dan yang paling penting: fixture yang BENAR-BENAR ter-commit harus lulus
  // keempat pagar tadi. Kalau tidak, kasus merah di atas cuma teori.
  console.log(abu('  fixture'));
  if (fs.existsSync(FIXTURE)) {
    const F = muatFixture(FIXTURE);
    const langgar = [
      ...periksaPrivasi(F.baris, verb), ...periksaKamus(F.kepala.kamus, verb),
      ...periksaKepala(F.kepala), ...periksaLarik(F.kepala, F.larik),
    ];
    if (langgar.length) {
      gagal++;
      console.log(merah(`  XX  fixture ter-commit TIDAK lulus pagarnya sendiri: ${langgar.length} pelanggaran`));
      for (const p of langgar.slice(0, 8)) console.log(merah(`        ${p.jalur} = ${JSON.stringify(p.nilai)}`));
    } else {
      const s = Number(F.kepala.sintetis) || 0;
      console.log(hijau('  ok  ') + `fixture ter-commit lulus keempat pagar `
        + abu(`(${F.baris.length - s} baris sungguhan + ${s} sintetis)`));
    }
  } else {
    console.log(kuning('  ..  fixture belum ada, pemeriksaan fixture dilewati'));
  }

  const total = hasil.length + (fs.existsSync(FIXTURE) ? 1 : 0);
  console.log(gagal
    ? merah(`\n✗ uji pagar: ${gagal} dari ${total} kasus MELESET`)
    : hijau(`\n✓ uji pagar: ${total} kasus benar semua`));
  return gagal ? 1 : 0;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--uji-pagar')) { process.exit(ujiPagar()); }
  const tanggal = bendera(argv, '--tanggal', null);
  /* --tanggal masuk mentah-mentah ke kepala.dari, jadi ia jalur bangun yang
     bisa menaruh teks apa pun di kepala fixture tanpa menyunting tangan.
     Bentuknya dikunci di sini, bukan cuma di periksaKepala() — supaya
     salahnya ketahuan sebelum lima menit pembuatan fixture, bukan sesudah. */
  if (tanggal !== null && !RX.tanggal.test(tanggal)) {
    console.log(merah('--tanggal harus YYYY-MM-DD, bukan ' + JSON.stringify(tanggal)));
    process.exit(1);
  }
  const dariBawaan = path.join(__dirname, 'agenda', (tanggal || 'hari-ini') + '.jsonl');
  const dari = bendera(argv, '--dari', dariBawaan);
  const keluar = bendera(argv, '--keluar', FIXTURE);
  const maksByte = Number(bendera(argv, '--maks-byte', MAKS_BYTE_BAWAAN));
  const keAgenda = bendera(argv, '--keluarkan-agenda', null);

  // Membentangkan fixture yang sudah ada balik ke bentuk buku agenda supaya
  // bisa ditonton di peramban lewat ?ulang=<tanggal>. Tidak perlu sumbernya.
  if (keAgenda) {
    const { kepala, baris } = muatFixture(keluar);
    const hari = path.basename(keAgenda).replace(/\.jsonl$/, '');
    // digeser per HARI, bukan ke tengah malam: jam-of-day hari aslinya
    // dipertahankan supaya yang ditonton benar-benar irama hari itu
    const geser = tanggalMulai(hari) - tanggalMulai(kepala.dari);
    const teks = baris.map((b, i) => JSON.stringify({
      v: 1, id: i + 1, ...b, ts: b.ts + geser,
    })).join('\n') + '\n';
    fs.mkdirSync(path.dirname(keAgenda), { recursive: true });
    fs.writeFileSync(keAgenda, teks);
    console.log(hijau(`${baris.length} baris ditulis ke ${keAgenda}`));
    console.log(abu(`tonton: http://127.0.0.1:4517/?ulang=${hari}&laju=60`));
    return;
  }

  if (!fs.existsSync(dari)) {
    console.log(merah('sumber buku agenda tidak ada: ' + dari));
    console.log(abu('pakai --dari <berkas.jsonl>; SALIN dulu berkas harian yang masih ditulis server'));
    process.exit(1);
  }

  const alat = buatAlat();
  const { baris: mentah, rusak } = bacaAgenda(dari);
  /* Nol baris terpakai itu SELALU salah pilih berkas, dan penyebab yang paling
     sering: menunjuk --dari ke fixture yang sudah jadi, bukan ke buku agenda
     mentah. Tanpa penjaga ini yang muncul cuma "Cannot read properties of
     undefined (reading 'ts')" — stack trace yang tidak memberi tahu apa pun. */
  if (!mentah.length) {
    console.log(merah('tidak ada satu pun baris yang terpakai dari ' + dari
      + (rusak ? ` (${rusak} baris rusak dilewati)` : '')));
    console.log('  --dari harus menunjuk BUKU AGENDA mentah (agenda/YYYY-MM-DD.jsonl),'
      + ' bukan fixture yang sudah jadi.');
    console.log('  Untuk memeriksa fixture yang sudah ter-commit: node buat-fixture.mjs --uji-pagar');
    process.exit(1);
  }
  let tersamar;
  try {
    tersamar = samarkan(mentah, alat);
  } catch (e) {
    console.log(merah('penyamaran GAGAL: ' + e.message));
    process.exit(1);
  }

  const langgar = periksaPrivasi(tersamar, alat.verbGit);
  if (langgar.length) {
    console.log(merah(`periksa privasi GAGAL: ${langgar.length} nilai melanggar`));
    for (const p of langgar.slice(0, 12)) console.log(merah(`  baris #${p.indeks} ${p.jalur} = ${JSON.stringify(p.nilai)}`));
    process.exit(1);
  }

  const hari = tanggal || tanggalDari(dari) || new Date(mentah[0].ts).toISOString().slice(0, 10);

  if (argv.includes('--periksa')) {
    // Kesetiaan stasiun: label sintetis yang barusan dihitung ulang dari
    // sumber HARUS mendarat di meja yang sama dengan label aslinya, dan
    // fixture yang sudah di-commit harus setuju dengan hasil itu.
    let cocok = 0, beda = 0;
    for (let i = 0; i < mentah.length; i++) {
      const a = alat.stationFor(mentah[i].tool || '', mentah[i].label || '', '');
      const b = alat.stationFor(tersamar[i].tool || '', tersamar[i].label || '', '');
      if (a === b) cocok++;
      else { beda++; if (beda <= 5) console.log(merah(`  baris #${i}: '${a}' -> '${b}' (tool ${mentah[i].tool})`)); }
    }
    let catatanFixture = '';
    if (fs.existsSync(keluar)) {
      const F = muatFixture(keluar);
      // EKOR SINTETIS tidak punya padanan di sumber — ia memang bukan dari
      // sana. Yang dibandingkan cuma bagian hari sungguhannya.
      const nyata = F.baris.length - (Number(F.kepala.sintetis) || 0);
      let bedaF = 0;
      for (let i = 0; i < nyata && i < tersamar.length; i++) {
        const x = F.baris[i], y = tersamar[i];
        if ((x.tool || '') !== (y.tool || '') || (x.label || '') !== (y.label || '')
          || x.kind !== y.kind || x.session !== y.session) bedaF++;
      }
      catatanFixture = `, fixture tersimpan ${F.baris.length} baris `
        + `(${nyata} sungguhan + ${F.baris.length - nyata} sintetis), ${bedaF} beda dari sumber`;
      if (bedaF) beda += bedaF;
    }
    const pesan = `${mentah.length} baris, ${cocok} stasiun cocok, ${beda} beda${catatanFixture}`;
    console.log(beda ? merah(pesan) : hijau(pesan));
    process.exit(beda ? 1 : 0);
  }

  const { kepala, larik: dipakai, isi, byte, nyata, ekor } = muatkanKeAnggaran(tersamar, hari, maksByte);
  if (byte > maksByte) {
    console.log(merah(`ukuran akhir ${byte} byte masih melewati batas ${maksByte}`));
    process.exit(1);
  }
  /* Tiga pagar sisanya, atas berkas yang PERSIS akan ditulis. Baris sintetis
     ikut lewat periksaPrivasi() lagi di sini — ia karangan, tapi karangan pun
     tidak dapat kekebalan; kalau suatu hari ada yang menyelipkan sesuatu ke
     BARIS_SINTETIS, pagarnya yang sama yang menemukannya. */
  const langgarSisa = [
    ...periksaPrivasi(ekor, alat.verbGit),
    ...periksaKamus(kepala.kamus, alat.verbGit),
    ...periksaKepala(kepala),
    ...periksaLarik(kepala, dipakai),
  ];
  if (langgarSisa.length) {
    console.log(merah(`periksa kepala/kamus/larik GAGAL: ${langgarSisa.length} nilai melanggar`));
    for (const p of langgarSisa.slice(0, 12)) {
      console.log(merah(`  ${p.indeks >= 0 ? 'baris #' + p.indeks + ' ' : ''}${p.jalur} = ${JSON.stringify(p.nilai)}`));
    }
    process.exit(1);
  }
  fs.writeFileSync(keluar, isi);

  const tsAwal = tersamar[0].ts, tsAkhir = tersamar[nyata - 1].ts;
  const kindEkor = [...new Set(ekor.map((b) => b.kind))].join('/') || '-';
  console.log(hijau(`fixture ditulis: ${path.basename(keluar)}`));
  console.log(`  sumber       : ${dari} (${mentah.length} baris, ${rusak} rusak dilewati)`);
  console.log(`  disimpan     : ${tebal(String(nyata))} baris sungguhan dari ${tersamar.length} `
    + abu(`(dipangkas dari ekor; ${jamHari(tsAwal)}–${jamHari(tsAkhir)})`));
  console.log(`  ekor sintetis: ${ekor.length} baris ${abu('(' + kindEkor + '; ditandai kepala.sintetis)')}`);
  console.log(`  ukuran       : ${byte} byte (batas ${maksByte}, sisa ${maksByte - byte})`);
  console.log(`  kamus        : ` + Object.entries(kepala.kamus).map(([k, v]) => `${k} ${v.length}`).join(', ')
    + abu(' (tanpa yatim: dibangun dari baris yang disimpan)'));
  console.log(hijau(`  privasi      : lulus — ${tersamar.length} baris + ${ekor.length} sintetis + `
    + `${Object.values(kepala.kamus).reduce((n, v) => n + v.length, 0)} entri kamus + kepala + larik mentah, `
    + '0 pelanggaran'));
}

const tanggalDari = (p) => (path.basename(p).match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
function tanggalMulai(hari) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hari);
  if (!m) return Date.now();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
