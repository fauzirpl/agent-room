#!/usr/bin/env node
// uji-suara.mjs :: penjaga suara ucap & daftar nama pegawai.
//
// Fitur ini punya satu janji yang gampang rusak diam-diam: "kalau apa pun
// gagal, ruangan tetap bunyi seperti biasa". Gagalnya ada banyak rupa —
// kunci belum dipasang, kunci salah, OpenRouter tumbang, kuota habis, model
// dicabut — dan SEMUANYA harus berujung sama: 204, halaman jatuh ke lonceng
// earcon, tidak ada pesan merah. Satu saja di antaranya bocor jadi 500 atau
// jadi exception, notifikasi yang tadinya cuma "tanpa suara ucap" berubah jadi
// notifikasi yang rusak. Itu yang dijaga berkas ini.
//
// Yang dijaga berikutnya: BIAYA. Klip yang sama tidak boleh pernah dibayar dua
// kali. Ada dua jalur yang bisa membocorkannya — cache yang meleset (hash-nya
// salah) dan permintaan serentak yang lolos dedupe — dan dua-duanya diuji
// dengan MENGHITUNG panggilan ke penyedia, bukan dengan melihat hasilnya benar.
//
// Cara kerjanya: menyalakan server.mjs sungguhan sebagai proses anak, dengan
// SELURUH env datanya diarahkan ke folder sementara, DAN dengan
// AGENT_ROOM_SUARA_URL diarahkan ke OpenRouter palsu di localhost. Uji ini
// tidak pernah benar-benar keluar jaringan dan tidak pernah butuh kunci
// sungguhan — kalau suatu hari dia mulai butuh, itu bug, bukan fitur.
//
// Pakai:
//   node uji-suara.mjs            jalankan semua kasus
//   node uji-suara.mjs --simpan   jangan hapus folder sementara (buat mengintip)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
/* Kosakata resep efek suara, diimpor dari skrip yang menghasilkan petanya.
   selaras-suara.mjs sengaja tidak menjalankan apa-apa waktu di-import —
   kalau suatu hari ia mulai menulis berkas dari sini, itu bug di sana. */
import vm from 'node:vm';
import { KOSAKATA } from './selaras-suara.mjs';
/* Sandbox vm milik harness event: room.js yang SUNGGUHAN dijalankan, jadi
   penyaring narasi yang hidup di halaman bisa diuji beneran, bukan cuma
   dicocokkan regex. Lihat kasus 20. */
import { muatKonteks } from './uji-event.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');
const ROOM = path.join(__dirname, 'public', 'room.js');
const EVENT_DIR = path.join(__dirname, 'public', 'event');
const PETA_SUARA = path.join(EVENT_DIR, '99-suara.js');
const SIMPAN = process.argv.includes('--simpan');

const berwarna = !process.env.NO_COLOR;
const warnai = (kode) => (s) => (berwarna ? '[' + kode + 'm' + s + '[0m' : String(s));
const merah = warnai(31);
const hijau = warnai(32);
const abu = warnai(90);
const tebal = warnai(1);

let gagal = 0;
let periksa = 0;
const lulus = (t) => { periksa++; console.log('  ' + hijau('✓') + ' ' + t); };
const tolak = (t, ket) => { periksa++; gagal++; console.log('  ' + merah('✗') + ' ' + t + (ket ? '\n      ' + merah(ket) : '')); };
const benar = (t, syarat, ket) => { if (syarat) lulus(t); else tolak(t, ket || ''); };
const sama = (t, dapat, harap) => {
  if (dapat === harap) lulus(t + ' ' + abu('= ' + JSON.stringify(dapat)));
  else tolak(t, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
};
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------- OpenRouter palsu --- */
/* Sengaja HTTP sungguhan, bukan fetch yang di-monkeypatch: yang mau diuji
   justru bentuk permintaan yang benar-benar keluar dari server (header, badan,
   response_format), dan itu cuma kelihatan kalau ada yang menerimanya. */
function openrouterPalsu() {
  const st = {
    panggil: 0,            // berapa kali /audio/speech benar-benar dipanggil
    badan: [],             // badan JSON tiap panggilan
    auth: [],              // header Authorization tiap panggilan
    tunda: 0,              // ms, buat menguji dedupe permintaan serentak
    balas: 'ok',           // 'ok' | '401' | '500' | 'kosong' | 'pcmSaja'
    formatDiminta: [],     // response_format tiap panggilan
    // 0,1 detik nada 440 Hz, PCM 16-bit mono 24 kHz — persis rupa balasan
    // Gemini TTS: byte mentah tanpa kepala apa pun.
    pcm: (() => {
      const n = 2400;
      const b = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
      return b;
    })(),
    modelMati: false,
    klip: Buffer.from('ID3klip-palsu-yang-berpura-pura-mp3'),
  };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/models') {
      if (st.modelMati) { res.writeHead(503).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { id: 'palsu/tts-satu', name: 'TTS Palsu Satu', pricing: { audio: '0.000015' },
            supported_voices: ['Zephyr', 'Puck', 'Kore'] },
          // supported_voices null = penyedia menerima voice bebas (mis. Fish Audio)
          { id: 'palsu/tts-dua', name: 'TTS Palsu Dua', pricing: { audio: '0.00003' },
            supported_voices: null },
        ],
      }));
      return;
    }
    if (u.pathname === '/audio/speech') {
      let b = '';
      for await (const c of req) b += c;
      st.panggil++;
      st.auth.push(req.headers.authorization || '');
      try { st.badan.push(JSON.parse(b)); } catch { st.badan.push(null); }
      try { st.formatDiminta.push(JSON.parse(b).response_format); } catch { st.formatDiminta.push(null); }
      /* Tiruan penolakan Gemini TTS yang sungguhan. Kalimatnya disalin apa
         adanya karena SUARA_PCM_SAJA di server mencocokkannya — kalau
         penyedianya suatu hari mengubah kalimatnya, uji ini yang harus
         ikut berubah, bukan diam-diam berhenti menggigit. */
      if (st.balas === 'pcmBase64') {
        res.writeHead(200, { 'content-type': 'audio/L16;rate=24000' });
        res.end(st.pcm.toString('base64'));
        return;
      }
      if (st.balas === 'pcmSaja') {
        let fmt = '';
        try { fmt = JSON.parse(b).response_format; } catch { fmt = ''; }
        if (fmt !== 'pcm') {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Gemini TTS only supports response_format="pcm". Got "' + fmt + '".' } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'audio/L16;rate=24000', 'content-length': st.pcm.length });
        res.end(st.pcm);
        return;
      }
      if (st.tunda) await tidur(st.tunda);
      if (st.balas === '401') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'User not found.' } }));
        return;
      }
      if (st.balas === '500') { res.writeHead(500).end('boom'); return; }
      if (st.balas === 'kosong') { res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(); return; }
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': st.klip.length });
      res.end(st.klip);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      resolve({
        st,
        suaraUrl: 'http://127.0.0.1:' + port + '/audio/speech',
        modelUrl: 'http://127.0.0.1:' + port + '/models',
        tutup: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

/* ------------------------------------------------- kantor sementara --- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-room-suara-'));
let nSandbox = 0;
function sandboxBaru(tag) {
  const d = path.join(TMP, tag + '-' + (++nSandbox));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const PORT_MULAI = Number(process.env.AGENT_ROOM_UJI_PORT_SUARA) || 4662;
let portBerikut = PORT_MULAI;
const kodeAnak = 'process.on(\'message\',(m)=>{if(m===\'tutup\')process.exit(0);});'
  + 'await import(' + JSON.stringify(pathToFileURL(SERVER).href) + ');';

async function coba(dir, port, palsu, tambahan) {
  const anak = spawn(process.execPath, ['--input-type=module', '-e', kodeAnak], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      AGENT_ROOM_PORT: String(port),
      AGENT_ROOM_HOST: '127.0.0.1',
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
      /* Katalog event: dialihkan ke sandbox supaya kalimat narasi yang diuji
         tidak ikut berubah tiap ada gelombang event baru di event-acak.json
         yang sungguhan. Kasus 16 yang menaruh isinya; kalau berkasnya tidak
         ada, servernya tetap menyala dan kalimatnya jatuh ke id event —
         itu justru salah satu yang diuji. */
      AGENT_ROOM_KATALOG: path.join(dir, 'event-acak.json'),
      AGENT_ROOM_NARASI: path.join(dir, 'narasi-event.json'),
      // inilah yang menjamin uji ini tidak pernah menyentuh openrouter.ai
      AGENT_ROOM_SUARA_URL: palsu.suaraUrl,
      AGENT_ROOM_SUARA_MODEL_URL: palsu.modelUrl,
      AGENT_ROOM_KUNCI: '',
      AGENT_ROOM_LAPOR: '',
      AGENT_ROOM_CUACA: 'off',
      AGENT_ROOM_PEGAWAI_TETAP: '',
      ...tambahan,
    },
  });
  const k = { anak, port, dir, palsu, log: [], alamat: 'http://127.0.0.1:' + port, mati: false };
  anak.stdout.on('data', (d) => k.log.push(String(d)));
  anak.stderr.on('data', (d) => k.log.push(String(d)));
  anak.on('exit', () => { k.mati = true; });
  /* Kesiapan dibaca dari konsol ANAK KITA SENDIRI, bukan dari /health: port
     yang kebetulan dipakai server lain akan menjawab /health dengan riang dan
     ujinya lalu bicara dengan kantor yang salah. Sama alasannya dengan
     uji-pegawai.mjs. */
  const batas = Date.now() + 15000;
  while (Date.now() < batas) {
    if (k.mati) return null;
    if (k.log.join('').includes('ruangan siap')) return k;
    await tidur(50);
  }
  return null;
}

async function buka(dir, palsu, tambahan = {}) {
  for (let i = 0; i < 12; i++) {
    const k = await coba(dir, portBerikut++, palsu, tambahan);
    if (k) return k;
  }
  throw new Error('server uji tidak mau menyala di port mana pun');
}

async function tutup(k) {
  if (!k || k.mati) return;
  k.anak.send('tutup');
  const batas = Date.now() + 5000;
  while (!k.mati && Date.now() < batas) await tidur(30);
  if (!k.mati) k.anak.kill();
}

/* ----------------------------------------------------------- klien --- */
const asal = (k) => ({ origin: 'http://127.0.0.1:' + k.port });
const ambil = (k, p, o = {}) => fetch(k.alamat + p, { ...o, headers: { ...asal(k), ...(o.headers || {}) } });
async function json(k, p, o) {
  const r = await ambil(k, p, o);
  const t = await r.text();
  try { return { s: r.status, d: JSON.parse(t) }; } catch { return { s: r.status, d: t }; }
}
const kirim = (k, p, body) => json(k, p, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const ucap = (k, teks, headers, jk) =>
  ambil(k, '/ucap?teks=' + encodeURIComponent(teks) + (jk ? '&jk=' + encodeURIComponent(jk) : ''), { headers });

const KUNCI = 'sk-or-v1-rahasia-uji-jangan-sampai-bocor-a3f9';
const SELESAI = (n) => 'Izin, ' + n + ' selesai';

/* ================================================================ kasus === */

async function kasus1(palsu) {
  console.log(tebal('\nKasus 1: apa pun yang gagal berujung 204, bukan galat'));
  const k = await buka(sandboxBaru('a'), palsu);
  palsu.st.panggil = 0;

  let r = await ucap(k, SELESAI('Oji'));
  sama('tanpa kunci: /ucap 204', r.status, 204);
  sama('  badannya kosong', (await r.text()).length, 0);
  sama('  penyedia tidak pernah dipanggil', palsu.st.panggil, 0);

  await kirim(k, '/suara/setelan', { kunci: KUNCI });
  r = await ucap(k, SELESAI('Oji'));
  sama('punya kunci tapi belum dinyalakan: /ucap 204', r.status, 204);
  sama('  penyedia masih tidak dipanggil', palsu.st.panggil, 0);

  await kirim(k, '/suara/setelan', { aktif: true });
  r = await ucap(k, SELESAI('Oji'));
  sama('nyala + berkunci: /ucap 200', r.status, 200);
  sama('  content-type audio/mpeg', r.headers.get('content-type'), 'audio/mpeg');
  benar('  badannya klip sungguhan', (await r.arrayBuffer()).byteLength === palsu.st.klip.length,
    'panjang klip tidak cocok');
  sama('  penyedia dipanggil sekali', palsu.st.panggil, 1);

  /* Tiga rupa kegagalan penyedia. Semuanya WAJIB 204: halaman tidak punya
     cara membedakannya, dan memang tidak perlu — loncengnya sudah bunyi. */
  for (const [nama, balas] of [['kunci ditolak (401)', '401'], ['penyedia meledak (500)', '500'], ['klip kosong', 'kosong']]) {
    palsu.st.balas = balas;
    const rr = await ucap(k, SELESAI('Nama Baru ' + balas));
    sama(nama + ': /ucap 204', rr.status, 204);
  }
  palsu.st.balas = 'ok';

  // penyedia mati total (soket ditolak) juga tidak boleh jadi 500
  const k2 = await buka(sandboxBaru('a-mati'), {
    suaraUrl: 'http://127.0.0.1:1/audio/speech', modelUrl: 'http://127.0.0.1:1/models',
  });
  await kirim(k2, '/suara/setelan', { kunci: KUNCI, aktif: true });
  sama('penyedia tidak bisa dihubungi: /ucap 204', (await ucap(k2, SELESAI('Oji'))).status, 204);
  benar('  servernya sendiri tetap hidup', !k2.mati, 'server anak mati gara-gara penyedia mati');
  await tutup(k2);

  await tutup(k);
}

async function kasus2(palsu) {
  console.log(tebal('\nKasus 2: bentuk permintaan yang benar-benar keluar'));
  const k = await buka(sandboxBaru('b'), palsu);
  palsu.st.panggil = 0; palsu.st.badan = []; palsu.st.auth = [];

  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, model: 'palsu/tts-satu', voice: 'nova' });
  await ucap(k, SELESAI('Sri Rahayu'));

  const b = palsu.st.badan[0] || {};
  sama('model diteruskan apa adanya', b.model, 'palsu/tts-satu');
  sama('input = kalimat yang diminta', b.input, 'Izin, Sri Rahayu selesai');
  sama('voice diteruskan', b.voice, 'nova');
  /* Yang paling gampang salah dan paling sunyi kalau salah: bawaan OpenRouter
     itu pcm, dan pcm tidak bisa dimainkan <audio> apa adanya. */
  sama('response_format mp3, BUKAN pcm bawaan', b.response_format, 'mp3');
  benar('speed tidak dikirim waktu kecepatan 1', !('speed' in b),
    'speed ikut terkirim padahal kecepatannya bawaan');
  sama('Authorization Bearer + kunci', palsu.st.auth[0], 'Bearer ' + KUNCI);

  await kirim(k, '/suara/setelan', { kecepatan: 1.25 });
  await ucap(k, SELESAI('Sri Rahayu'));
  sama('kecepatan bukan 1 ikut terkirim', (palsu.st.badan[1] || {}).speed, 1.25);

  await tutup(k);
}

async function kasus3(palsu) {
  console.log(tebal('\nKasus 3: klip yang sama tidak pernah dibayar dua kali'));
  const dir = sandboxBaru('c');
  const k = await buka(dir, palsu);
  palsu.st.panggil = 0;
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, model: 'palsu/tts-satu', voice: 'alloy' });

  await ucap(k, SELESAI('Oji'));
  sama('permintaan pertama memanggil penyedia', palsu.st.panggil, 1);
  await ucap(k, SELESAI('Oji'));
  await ucap(k, SELESAI('Oji'));
  sama('dua permintaan berikutnya dilayani cache', palsu.st.panggil, 1);

  await ucap(k, SELESAI('Sumala'));
  sama('nama lain = klip lain', palsu.st.panggil, 2);

  /* Inti kenapa model/voice ikut di-hash: ganti voice harus bikin klip baru,
     bukan memutar suara lama dengan voice yang sudah diganti. */
  await kirim(k, '/suara/setelan', { voice: 'nova' });
  await ucap(k, SELESAI('Oji'));
  sama('ganti voice = klip baru', palsu.st.panggil, 3);

  await kirim(k, '/suara/setelan', { model: 'palsu/tts-dua' });
  await ucap(k, SELESAI('Oji'));
  sama('ganti model = klip baru', palsu.st.panggil, 4);

  /* ...dan balik ke setelan lama harus GRATIS. Kalau ini merah, bolak-balik
     mencoba voice jadi berbayar tiap kali. */
  await kirim(k, '/suara/setelan', { model: 'palsu/tts-satu', voice: 'alloy' });
  await ucap(k, SELESAI('Oji'));
  sama('balik ke setelan lama dilayani klip lama', palsu.st.panggil, 4);

  const isi = fs.readdirSync(path.join(dir, 'suara'));
  sama('klipnya benar-benar mendarat di disk', isi.filter((n) => n.endsWith('.mp3')).length, 4);
  benar('tidak ada sisa .tmp yang setengah tulis', !isi.some((n) => n.endsWith('.tmp')),
    'ada berkas .tmp tertinggal: ' + isi.filter((n) => n.endsWith('.tmp')).join(', '));

  const c = (await json(k, '/suara/setelan')).d.cache;
  sama('panel melaporkan jumlah klip yang sama', c.jumlah, 4);
  benar('panel melaporkan ukuran > 0', c.byte > 0, 'ukuran cache dilaporkan ' + c.byte);

  const hapus = (await json(k, '/suara/cache', { method: 'DELETE' })).d;
  sama('kosongkan cache membuang semuanya', hapus.dibuang, 4);
  sama('  sesudahnya cache kosong', hapus.cache.jumlah, 0);
  await ucap(k, SELESAI('Oji'));
  sama('  dan klip berikutnya digenerate lagi', palsu.st.panggil, 5);

  await tutup(k);
}

async function kasus4(palsu) {
  console.log(tebal('\nKasus 4: permintaan serentak tidak boleh dobel bayar'));
  const k = await buka(sandboxBaru('d'), palsu);
  palsu.st.panggil = 0;
  palsu.st.tunda = 300;          // cukup lama supaya keenamnya benar-benar tumpang tindih
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });

  const enam = await Promise.all(Array.from({ length: 6 }, () => ucap(k, SELESAI('Oji'))));
  sama('enam permintaan serentak = SATU panggilan penyedia', palsu.st.panggil, 1);
  benar('  semuanya dijawab 200', enam.every((r) => r.status === 200),
    'status: ' + enam.map((r) => r.status).join(','));
  const panjang = await Promise.all(enam.map(async (r) => (await r.arrayBuffer()).byteLength));
  benar('  semuanya menerima klip yang sama', new Set(panjang).size === 1,
    'panjang badan berbeda-beda: ' + panjang.join(','));

  // sesudah selesai, peta in-flight harus bersih lagi — bukan menahan hash selamanya
  palsu.st.tunda = 0;
  await ucap(k, SELESAI('Sumala'));
  sama('hash lain sesudahnya tetap bisa jalan', palsu.st.panggil, 2);

  await tutup(k);
}

async function kasus5(palsu) {
  console.log(tebal('\nKasus 5: ETag — kenapa immutable akan salah'));
  const k = await buka(sandboxBaru('e'), palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, model: 'palsu/tts-satu', voice: 'alloy' });

  const r1 = await ucap(k, SELESAI('Oji'));
  const etag1 = r1.headers.get('etag');
  await r1.arrayBuffer();
  benar('balasan membawa ETag', Boolean(etag1), 'tidak ada header ETag');

  const r2 = await ucap(k, SELESAI('Oji'), { 'if-none-match': etag1 });
  sama('If-None-Match yang cocok dijawab 304', r2.status, 304);
  sama('  304 tanpa badan', (await r2.text()).length, 0);

  /* Inilah alasan header-nya no-cache, bukan immutable: URL-nya tidak berubah
     waktu voice diganti, jadi kalau peramban tidak pernah revalidasi, dia akan
     memutar suara lama selamanya. */
  await kirim(k, '/suara/setelan', { voice: 'nova' });
  const r3 = await ucap(k, SELESAI('Oji'), { 'if-none-match': etag1 });
  sama('sesudah voice diganti, ETag lama TIDAK cocok lagi', r3.status, 200);
  benar('  ETag-nya memang berubah', r3.headers.get('etag') !== etag1, 'ETag tidak berubah');
  await r3.arrayBuffer();

  const cc = r3.headers.get('cache-control') || '';
  benar('cache-control menyuruh revalidasi, bukan immutable',
    cc.includes('no-cache') && !cc.includes('immutable'), 'cache-control = ' + JSON.stringify(cc));

  await tutup(k);
}

async function kasus6(palsu) {
  console.log(tebal('\nKasus 6: kunci tidak pernah keluar dari server'));
  const k = await buka(sandboxBaru('f'), palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });

  const setelan = await json(k, '/suara/setelan');
  const teks = JSON.stringify(setelan.d);
  benar('GET /suara/setelan tidak memuat kunci', !teks.includes(KUNCI),
    'kunci utuh ikut terkirim ke halaman');
  sama('  cuma ada/tidaknya', setelan.d.punyaKunci, true);
  sama('  plus empat huruf terakhir', setelan.d.kunciEkor, KUNCI.slice(-4));

  benar('kunci tidak pernah tercetak ke konsol', !k.log.join('').includes(KUNCI),
    'kunci muncul di stdout/stderr server');

  const berkas = path.join(k.dir, '.agent-room-suara-kunci');
  benar('kunci diingat di berkasnya sendiri, bukan di suara.json',
    fs.existsSync(berkas) && !fs.readFileSync(path.join(k.dir, 'suara.json'), 'utf8').includes(KUNCI),
    'kunci bocor ke suara.json');

  /* Mengganti voice tidak boleh ikut menghapus kunci — `kunci` yang tidak
     dikirim artinya "jangan disentuh", bukan "kosongkan". */
  await kirim(k, '/suara/setelan', { voice: 'echo' });
  sama('menyimpan setelan lain tidak menghapus kunci',
    (await json(k, '/suara/setelan')).d.punyaKunci, true);

  const ngawur = await kirim(k, '/suara/setelan', { kunci: 'ada spasi di sini' });
  sama('kunci berspasi ditolak', ngawur.s, 400);
  sama('  kunci lama tetap terpasang', (await json(k, '/suara/setelan')).d.punyaKunci, true);

  const hapus = await kirim(k, '/suara/setelan', { kunci: '' });
  sama('kunci kosong = hapus', hapus.d.punyaKunci, false);
  sama('  fiturnya ikut mati sendiri', hapus.d.aktif, false);
  benar('  berkas kuncinya benar-benar dihapus', !fs.existsSync(berkas), 'berkas kunci masih ada');

  const nyala = await kirim(k, '/suara/setelan', { aktif: true });
  sama('menyalakan tanpa kunci ditolak halus', nyala.d.aktif, false);

  await tutup(k);
}

async function kasus7(palsu) {
  console.log(tebal('\nKasus 7: panaskan cache'));
  const k = await buka(sandboxBaru('g'), palsu);
  palsu.st.panggil = 0;

  const tanpaKunci = await kirim(k, '/suara/panasi', {});
  sama('tanpa kunci: 409, bukan diam-diam sukses', tanpaKunci.s, 409);

  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });
  await kirim(k, '/nama/daftar', { penuh: ['Oji', 'Sumala', 'Pak Kadis'] });

  const p1 = (await kirim(k, '/suara/panasi', {})).d;
  // 3 nama + 1 kalimat "mohon arahan"
  sama('sekali panasi = satu klip per nama, plus kalimat arahan', p1.dibuat, 4);
  sama('  tidak ada yang gagal', p1.gagal, 0);
  sama('  penyedia dipanggil persis sebanyak itu', palsu.st.panggil, 4);

  const p2 = (await kirim(k, '/suara/panasi', {})).d;
  sama('panasi kedua tidak membuat apa-apa lagi', p2.dibuat, 0);
  sama('  semuanya dihitung sudah ada', p2.sudah, 4);
  sama('  dan penyedia tidak dipanggil lagi', palsu.st.panggil, 4);

  /* Notifikasi sungguhan sesudah dipanaskan harus GRATIS — kalau ini merah,
     kalimat di room.js dan di server.mjs sudah hanyut (lihat kasus 10). */
  await ucap(k, SELESAI('Sumala'));
  sama('notifikasi sesudah dipanaskan tidak memanggil penyedia', palsu.st.panggil, 4);

  palsu.st.balas = '500';
  await kirim(k, '/nama/daftar', { penuh: ['Nama Yang Belum Ada'] });
  const p3 = (await kirim(k, '/suara/panasi', {})).d;
  sama('penyedia gagal: panasi tetap 200, bukan 500', p3.ok, true);
  benar('  kegagalannya dilaporkan apa adanya', p3.gagal > 0 && Boolean(p3.pesan),
    'gagal=' + p3.gagal + ' pesan=' + JSON.stringify(p3.pesan));
  palsu.st.balas = 'ok';

  await tutup(k);
}

async function kasus8(palsu) {
  console.log(tebal('\nKasus 8: daftar nama — bersih-bersih dan jaring pengaman'));
  const dir = sandboxBaru('h');
  const k = await buka(dir, palsu);

  const awal = (await json(k, '/nama/daftar')).d;
  sama('belum diatur = pakai daftar bawaan', awal.pakaiBawaan, true);
  benar('  daftar bawaannya ikut dikirim buat placeholder', (awal.bawaan || []).length >= 8,
    'bawaan cuma ' + (awal.bawaan || []).length + ' nama');
  sama('  dan daftar pilihan masih kosong', awal.penuh.length, 0);

  const simpan = await kirim(k, '/nama/daftar', {
    penuh: ['  Oji  ', 'Sumala', 'Oji', '', '   ', 'Nama Yang Kepanjangan Sekali Sampai Lewat Batas', 42, null],
  });
  sama('simpan: yang sah saja yang masuk', simpan.d.jumlah, 3);
  const isi = (await json(k, '/nama/daftar')).d.penuh;
  sama('  spasi berlebih dipangkas', isi[0].nama, 'Oji');
  sama('  urutan dipertahankan', isi[1].nama, 'Sumala');
  sama('  kembar dibuang', isi.filter((e) => e.nama === 'Oji').length, 1);
  sama('  dipotong 24 huruf', isi[2].nama.length, 24);
  benar('  yang bukan teks diabaikan tanpa melempar',
    isi.every((e) => e && typeof e.nama === 'string' && typeof e.peran === 'string'),
    'ada entri yang bentuknya bukan {nama, peran}');

  const kosong = await kirim(k, '/nama/daftar', { penuh: [] });
  sama('daftar kosong = kembali ke bawaan, bukan galat', kosong.d.pakaiBawaan, true);

  await tutup(k);

  /* Berkas rusak / versi masa depan tidak boleh mematikan kantor. Diuji dengan
     server BARU, sebab nama.json cuma dibaca saat start. */
  for (const [nama, teksBerkas] of [
    ['nama.json rusak (bukan JSON)', '{ ini bukan json '],
    ['nama.json versi masa depan', JSON.stringify({ v: 99, penuh: ['Entah Siapa'] })],
    ['nama.json tanpa medan penuh', JSON.stringify({ v: 1 })],
  ]) {
    const d2 = sandboxBaru('h-rusak');
    fs.writeFileSync(path.join(d2, 'nama.json'), teksBerkas);
    const k2 = await buka(d2, palsu);
    benar(nama + ': server tetap menyala', Boolean(k2) && !k2.mati, 'server anak gagal start');
    sama('  jatuh ke daftar bawaan', (await json(k2, '/nama/daftar')).d.pakaiBawaan, true);
    await tutup(k2);
  }
}

async function kasus9(palsu) {
  console.log(tebal('\nKasus 9: undi ulang menghormati nama pilihanmu'));
  const dir = sandboxBaru('i');
  const k = await buka(dir, palsu);
  await kirim(k, '/nama/daftar', { penuh: ['Oji', 'Sumala', 'Pak Kadis'] });

  /* Id sesi WAJIB 12 karakter di sini: server memotong id ke 12 char untuk
     kunci kursinya, jadi id yang lebih panjang bikin POST /nama menunjuk kursi
     yang tidak ada dan ujinya diam-diam menguji hal lain. */
  const hook = (sesi) => kirim(k, '/event', {
    hook_event_name: 'PreToolUse', session_id: sesi,
    cwd: path.join(dir, 'kantor-undi'), tool_name: 'Read', tool_input: { file_path: 'a.txt' },
  });
  await hook('sesiuji-aaa1');
  await hook('sesiuji-bbb2');
  await tidur(300);

  const nama = async () => Object.fromEntries(
    (await json(k, '/ruangan')).d.sesi.map((s) => [s.sesi, s.nama]));

  const n0 = await nama();
  benar('dua pegawai lahir dengan nama dari daftarmu',
    Object.values(n0).every((n) => ['Oji', 'Sumala', 'Pak Kadis'].includes(n)),
    'nama yang keluar: ' + JSON.stringify(n0));
  benar('  dan tidak kembar', new Set(Object.values(n0)).size === 2, 'dua kursi bernama sama');

  await kirim(k, '/nama', { sesi: 'sesiuji-aaa1', nama: 'Bu Ratna' });
  const undi = (await kirim(k, '/nama/undi-ulang', {})).d;
  sama('undi ulang melewati kursi bernama pilihanmu', undi.dilewati, 1);
  sama('  nama pilihanmu tidak berubah', (await nama())['sesiuji-aaa1'], 'Bu Ratna');

  /* Daftar dipersempit jadi SATU nama sementara ada dua kursi: yang kedua
     tidak boleh jadi kembar persis, dan tidak boleh jadi kosong. */
  await kirim(k, '/nama/daftar', { penuh: ['Oji'] });
  await kirim(k, '/nama/undi-ulang', {});
  const n1 = await nama();
  sama('daftar satu nama: kursi otomatis dapat nama itu', n1['sesiuji-bbb2'], 'Oji');
  benar('  tidak ada nama kosong', Object.values(n1).every(Boolean), JSON.stringify(n1));

  await tutup(k);
}

async function kasus10() {
  console.log(tebal('\nKasus 10: kalimat di room.js dan server.mjs tidak boleh hanyut'));
  /* Kalimatnya memang hidup di dua tempat — room.js yang MEMINTA, server.mjs
     yang MEMANASKAN. Kalau keduanya berbeda satu huruf saja, "panaskan cache"
     memanaskan kalimat yang tidak pernah dipakai dan tiap notifikasi jadi
     berbayar lagi; dan itu tidak akan kelihatan sebagai galat apa pun. */
  const bersih = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const petik = (src, kunci) => {
    const m = new RegExp('const ' + kunci + ' = \\{([\\s\\S]*?)\\n\\};').exec(src);
    return m ? bersih(m[1]) : null;
  };
  const dariServer = petik(fs.readFileSync(SERVER, 'utf8'), 'suaraKalimat');
  const dariRoom = petik(fs.readFileSync(ROOM, 'utf8'), 'UCAP');

  benar('suaraKalimat ketemu di server.mjs', Boolean(dariServer), 'blok tidak ketemu — regexnya basi?');
  benar('UCAP ketemu di room.js', Boolean(dariRoom), 'blok tidak ketemu — regexnya basi?');
  benar('isinya sama persis', dariServer === dariRoom,
    'server: ' + dariServer + '\n      room  : ' + dariRoom);
  benar('kalimatnya memang memuat nama pegawai', /nama/.test(dariServer || ''),
    'templat selesai tidak lagi memakai nama — cache-nya jadi tidak ada gunanya');
}

async function kasus11(palsu) {
  console.log(tebal('\nKasus 11: daftar model buat panel'));
  const k = await buka(sandboxBaru('j'), palsu);

  const d = (await json(k, '/suara/model')).d;
  sama('daftar model diteruskan', d.ok, true);
  sama('  jumlahnya apa adanya', d.model.length, 2);
  sama('  id-nya utuh', d.model[0].id, 'palsu/tts-satu');
  benar('  harganya ikut kalau ada', Boolean(d.model[0].harga), 'harga tidak ikut');
  /* Tanpa ini kolom voice kembali jadi tebak-tebakan, dan voice yang salah
     ditolak penyedia — jenis kegagalan yang paling membingungkan waktu
     pertama kali menyambungkan kunci. */
  sama('  daftar voice ikut diteruskan', JSON.stringify(d.model[0].suara),
    JSON.stringify(['Zephyr', 'Puck', 'Kore']));
  sama('  voice bebas diteruskan sebagai null, bukan []', d.model[1].suara, null);

  palsu.st.modelMati = true;
  const mati = await json(k, '/suara/model');
  sama('penyedia daftar mati: tetap 200, bukan 500', mati.s, 200);
  sama('  ok:false supaya panel tahu', mati.d.ok, false);
  sama('  daftarnya kosong, bukan undefined', mati.d.model.length, 0);
  palsu.st.modelMati = false;

  await tutup(k);
}

async function kasus12() {
  console.log(tebal('\nKasus 12: rute yang dipanggil halaman harus ada di server'));
  /* Inilah kelas bug yang bikin panel menjawab "gagal" padahal kuncinya
     baik-baik saja: halaman memanggil rute yang server-nya tidak punya.
     Waktu itu sebabnya proses server masih versi lama, tapi sebab yang sama
     bisa datang dari salah ketik atau rute yang diganti nama sebelah sini
     saja — dan gejalanya persis sama, tanpa galat apa pun di sisi server. */
  const room = fs.readFileSync(ROOM, 'utf8');
  const src = fs.readFileSync(SERVER, 'utf8');

  const dipanggil = [...new Set(
    [...room.matchAll(/(?:panelJson|fetch)\(\s*'(\/(?:suara|nama|ucap)[^'?]*)/g)].map((m) => m[1]),
  )];
  benar('rute suara/nama di room.js ketemu', dipanggil.length >= 6,
    'cuma ' + dipanggil.length + ' yang ketemu — regexnya mungkin sudah basi');

  const dilayani = new Set(
    [...src.matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]),
  );
  const hilang = dipanggil.filter((r) => !dilayani.has(r));
  benar('setiap rute yang dipanggil halaman dilayani server.mjs ' + abu('(' + dipanggil.length + ' rute)'),
    hilang.length === 0,
    'tidak dilayani: ' + hilang.join(', ') + ' — panel akan menjawab "server masih versi lama"');
}

async function kasus13(palsu) {
  console.log(tebal('\nKasus 13: piket acak — orangnya berganti, jabatannya ikut'));
  const dir = sandboxBaru('m');
  const k = await buka(dir, palsu, { AGENT_ROOM_PENUGASAN: 'acak' });

  await kirim(k, '/nama/daftar', {
    penuh: [
      { nama: 'Bu Alis', peran: 'kabid' },
      { nama: 'Oji', peran: 'pranata_pertama' },
      { nama: 'Bu Mega', peran: 'kasi' },
      { nama: 'Odir', peran: 'statistisi' },
      { nama: 'Ijal', peran: 'teknisi' },
      { nama: 'Tendi', peran: 'analis_sistem' },
    ],
  });
  const daftar = (await json(k, '/nama/daftar')).d;
  sama('jabatan ikut tersimpan', daftar.berjabatan ?? daftar.penuh.filter((e) => e.peran).length, 6);
  sama('  mode yang berlaku', daftar.penugasan, 'acak');

  /* Satu kursi, dipakai berkali-kali oleh sesi yang datang-pergi. Di mode
     'tetap' namanya akan sama terus; di 'acak' harus berganti-ganti. Inilah
     inti keluhan "orangnya itu-itu aja". */
  const dilihat = new Map();
  let benar_nama = true;
  for (let n = 0; n < 24; n++) {
    const sesi = ('piket' + n + '-aaaaaa').slice(0, 12);
    await kirim(k, '/event', {
      hook_event_name: 'PreToolUse', session_id: sesi,
      cwd: path.join(dir, 'kantor-piket'), tool_name: 'Read', tool_input: { file_path: 'a.txt' },
    });
    await tidur(60);
    const o = (await json(k, '/ruangan')).d.sesi.find((x) => x.sesi === sesi);
    benar_nama = benar_nama && Boolean(o && o.nama);
    if (o && o.nama) dilihat.set(o.nama, o.peran);
    /* Pamitnya WAJIB SessionEnd, bukan Stop: cuma session-end yang memanggil
       pegawaiLepas() dan mengosongkan kursinya. Dengan Stop, kursinya menumpuk
       sampai FORMASI_MAKS lalu sesi berikutnya jalan tanpa nama sama sekali —
       dan ujinya diam-diam menguji hal lain. */
    await kirim(k, '/event', {
      hook_event_name: 'SessionEnd', session_id: sesi,
      cwd: path.join(dir, 'kantor-piket'), tool_name: null,
    });
    await tidur(60);
  }

  benar('tiap sesi kebagian nama', benar_nama, 'ada sesi yang lahir tanpa nama');
  benar('24 sesi berturut-turut memunculkan banyak orang berbeda '
    + abu('(' + dilihat.size + ' nama)'), dilihat.size >= 4,
  'cuma ' + dilihat.size + ' nama yang pernah muncul: ' + [...dilihat.keys()].join(', '));
  benar('  semuanya dari daftar', [...dilihat.keys()].every((n) => daftar.penuh.some((e) => e.nama === n)),
    'ada nama di luar daftar: ' + [...dilihat.keys()].join(', '));

  /* "menyesuaikan tingkat pekerjaan": jabatan menempel di ORANGNYA, jadi
     siapa pun yang muncul harus membawa jabatan yang benar — bukan jabatan
     bawaan urutan kursi. */
  const petaBenar = new Map(daftar.penuh.map((e) => [e.nama, e.peran]));
  const salah = [...dilihat.entries()].filter(([n, p]) => p !== petaBenar.get(n));
  benar('  tiap orang membawa jabatannya sendiri', salah.length === 0,
    salah.map(([n, p]) => n + ' dapat ' + JSON.stringify(p) + ', harusnya ' + petaBenar.get(n)).join(' | '));

  await tutup(k);
}

async function kasus14(palsu) {
  console.log(tebal('\nKasus 14: piket acak tetap menghormati yang kamu tetapkan'));
  const dir = sandboxBaru('n');
  const k = await buka(dir, palsu, { AGENT_ROOM_PENUGASAN: 'acak' });
  await kirim(k, '/nama/daftar', {
    penuh: [{ nama: 'Oji', peran: 'pranata_pertama' }, { nama: 'Odir', peran: 'statistisi' },
            { nama: 'Ijal', peran: 'teknisi' }, { nama: 'Tendi', peran: 'analis_sistem' }],
  });
  const proyek = path.join(dir, 'kantor-manual');
  const hook = (sesi) => kirim(k, '/event', {
    hook_event_name: 'PreToolUse', session_id: sesi,
    cwd: proyek, tool_name: 'Read', tool_input: { file_path: 'a.txt' },
  });
  await hook('manual-aaaa1');
  await tidur(150);
  await kirim(k, '/nama', { sesi: 'manual-aaaa1', nama: 'Pak Kadis' });
  await kirim(k, '/peran', { sesi: 'manual-aaaa1', peran: 'kadis' });

  const lihat = async (sesi) => (await json(k, '/ruangan')).d.sesi.find((x) => x.sesi === sesi);
  sama('nama pilihanmu terpasang', (await lihat('manual-aaaa1'))?.nama, 'Pak Kadis');

  /* Undi ulang berkali-kali: kursi manual tidak boleh tergeser sekali pun,
     dan jabatan yang kamu setel sendiri juga tidak. */
  for (let n = 0; n < 5; n++) await kirim(k, '/nama/undi-ulang', {});
  const o = await lihat('manual-aaaa1');
  sama('  lima kali undi ulang tidak menggesernya', o?.nama, 'Pak Kadis');
  sama('  jabatan yang kamu setel juga tidak', o?.peran, 'kadis');

  await tutup(k);
}

async function kasus15(palsu) {
  console.log(tebal('\nKasus 15: mode tetap masih benar-benar tetap'));
  const dir = sandboxBaru('o');
  const k = await buka(dir, palsu, { AGENT_ROOM_PENUGASAN: 'tetap' });
  await kirim(k, '/nama/daftar', {
    penuh: [{ nama: 'Oji' }, { nama: 'Odir' }, { nama: 'Ijal' }, { nama: 'Tendi' }, { nama: 'Bale' }],
  });
  sama('mode yang berlaku', (await json(k, '/nama/daftar')).d.penugasan, 'tetap');
  sama('  env mengunci saklar panel', (await json(k, '/nama/daftar')).d.penugasanTerkunci, true);

  const proyek = path.join(dir, 'kantor-tetap');
  const nama = new Set();
  for (let n = 0; n < 8; n++) {
    const sesi = ('tetap' + n + '-aaaaaa').slice(0, 12);
    await kirim(k, '/event', {
      hook_event_name: 'PreToolUse', session_id: sesi,
      cwd: proyek, tool_name: 'Read', tool_input: { file_path: 'a.txt' },
    });
    await tidur(60);
    const o = (await json(k, '/ruangan')).d.sesi.find((x) => x.sesi === sesi);
    if (o) nama.add(o.nama);
    await kirim(k, '/event', { hook_event_name: 'SessionEnd', session_id: sesi, cwd: proyek, tool_name: null });
    await tidur(60);
  }
  // Kursi yang sama dipakai bergantian: di mode tetap namanya WAJIB satu-satunya
  sama('delapan sesi bergantian di kursi yang sama = satu nama saja', nama.size, 1);

  await tutup(k);
}

/* Katalog kecil buat sandbox. Sengaja BUKAN salinan event-acak.json yang
   sungguhan: isinya berubah tiap gelombang event, dan uji yang kalimatnya ikut
   berubah tiap orang menambah event itu uji yang lama-lama dimatikan orang.
   Yang diuji di sini bentuk terjemahannya, bukan isi katalognya. */
const KATALOG_UJI = {
  events: [
    { id: 'cicak-jatuh-ke-berkas', nama: 'Cicak Jatuh ke Tumpukan Berkas',
      kategori: 'hewan-tamu', balon: 'astaghfirullah!' },
    { id: 'apar-diperiksa', nama: 'APAR diperiksa petugas', kategori: 'birokrasi', balon: '-' },
    { id: 'absen-fingerprint', nama: 'Absen finger print', kategori: 'birokrasi',
      balon: 'jarinya kering, ngulang' },
    { id: 'auditor-minta-bukti', nama: 'Auditor minta bukti dukung', kategori: 'birokrasi',
      balon: 'auditor: "boleh lihat lampirannya?" / pegawai: "sebentar, di lemari"' },
    { id: 'peserta-ketiduran', nama: 'Peserta Rapat Ketiduran', kategori: 'kultur-kantor',
      balon: '...zzz' },
  ],
};
// Cuma dua yang ditulis tangan, sengaja: sisanya membuktikan jenjang cadangan.
const NARASI_UJI = {
  narasi: {
    'cicak-jatuh-ke-berkas': 'Cicaknya jatuh ke tumpukan berkas saya, astaghfirullah.',
    'kabel-lan-lepas': 'Kabel LAN saya lepas, ternyata tadi cuma longgar.',
  },
};
const tulisKatalog = (dir) => {
  fs.writeFileSync(path.join(dir, 'event-acak.json'), JSON.stringify(KATALOG_UJI));
  fs.writeFileSync(path.join(dir, 'narasi-event.json'), JSON.stringify(NARASI_UJI));
};
const ucapEvent = (k, id, headers) =>
  ambil(k, '/ucap?event=' + encodeURIComponent(id), { headers });

async function kasus16(palsu) {
  console.log(tebal('\nKasus 16: narasi event — orang pertama, dan server yang mengejanya'));
  const dir = sandboxBaru('p');
  tulisKatalog(dir);
  const k = await buka(dir, palsu);
  palsu.st.panggil = 0; palsu.st.badan = [];
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });
  const dikirim = () => (palsu.st.badan[palsu.st.badan.length - 1] || {}).input;

  const r = await ucapEvent(k, 'cicak-jatuh-ke-berkas');
  sama('id event dilayani seperti kalimat biasa', r.status, 200);
  /* Inti fitur ini: yang dikirim halaman cuma 'cicak-jatuh-ke-berkas', dan
     yang sampai ke penyedia kalimat orang PERTAMA. Bukan judul kejadiannya —
     "Cicak jatuh ke tumpukan berkas" itu papan nama, dan papan nama yang
     dibacakan terdengar seperti pengumuman stasiun, bukan seperti ruangan
     yang berpenghuni. */
  sama('  kalimatnya orang pertama dari narasi-event.json',
    dikirim(), 'Cicaknya jatuh ke tumpukan berkas saya, astaghfirullah.');

  /* Jenjang 2: event yang barisnya belum ditulis jatuh ke kolom `balon` —
     dialog balon ucap di katalog, yang memang sudah orang pertama juga. */
  await ucapEvent(k, 'absen-fingerprint');
  sama('belum ditulis tangan: jatuh ke balon ucap katalog',
    dikirim(), 'Jarinya kering, ngulang');

  // balon dua pembicara: ambil giliran pertama, buang penanda pembicaranya
  await ucapEvent(k, 'auditor-minta-bukti');
  sama('  balon dua pembicara dipangkas jadi satu kalimat',
    dikirim(), 'Boleh lihat lampirannya?');

  /* Jenjang 3: balon yang cuma penggalan ('...zzz', '-') tidak bisa berdiri
     sendiri kalau dibacakan keras-keras, jadi dilewat — turun ke `nama`,
     dengan Title Case katalog diturunkan jadi sentence case. */
  await ucapEvent(k, 'peserta-ketiduran');
  sama('balon yang cuma penggalan dilewat, pakai nama kejadiannya',
    dikirim(), 'Peserta rapat ketiduran');

  await ucapEvent(k, 'apar-diperiksa');
  sama('  kata HURUF BESAR SEMUA tidak ikut diturunkan',
    dikirim(), 'APAR diperiksa petugas');

  /* Event di luar katalog TETAP berbunyi — dan yang ini kebetulan sudah
     ditulis tangan, jadi jenjang pertama yang menang walau katalognya tidak
     tahu apa-apa soal dia. */
  await ucapEvent(k, 'kabel-lan-lepas');
  sama('di luar katalog pun tetap orang pertama kalau sudah ditulis',
    dikirim(), 'Kabel LAN saya lepas, ternyata tadi cuma longgar.');

  // dan yang tidak ada di mana-mana: idnya sendiri, daripada bisu
  await ucapEvent(k, 'kursi-rapat-patah');
  sama('tidak ada di mana pun: jatuh ke idnya sendiri',
    dikirim(), 'Kursi rapat patah');

  /* Pagar biaya. `?event=` tidak boleh bisa dipakai mengirim kalimat karangan
     ke penyedia berbayar — cuma id yang bentuknya id yang dilayani. */
  const sebelum = palsu.st.panggil;
  for (const buruk of ['Halo dunia, tolong bacakan ini', '../rahasia', 'HURUF-BESAR', '']) {
    sama('id tidak berbentuk id: 204 ' + abu(JSON.stringify(buruk)),
      (await ucapEvent(k, buruk)).status, 204);
  }
  sama('  dan penyedia tidak dipanggil sekali pun', palsu.st.panggil, sebelum);

  // jalur lama tidak boleh ikut berubah artinya
  sama('?teks= masih jalan seperti dulu', (await ucap(k, SELESAI('Oji'))).status, 200);

  // narasi ikut cache & ETag yang sama dengan kalimat notifikasi
  const lagi = palsu.st.panggil;
  await ucapEvent(k, 'cicak-jatuh-ke-berkas');
  sama('narasi yang sama tidak dibayar dua kali', palsu.st.panggil, lagi);

  await tutup(k);
}

async function kasus17(palsu) {
  console.log(tebal('\nKasus 17: lingkup narasi — mati membungkam kejadian, bukan notifikasi'));
  const dir = sandboxBaru('q');
  tulisKatalog(dir);
  const k = await buka(dir, palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });

  sama('bawaannya `semua` — tiap kejadian dibacakan',
    (await json(k, '/suara/setelan')).d.narasi, 'semua');
  benar('panel diberi tahu berapa kejadian yang punya kalimat',
    (await json(k, '/suara/setelan')).d.narasiJumlah > 100,
    'narasiJumlah tidak masuk akal — daftar id event tidak terbaca?');

  await kirim(k, '/suara/setelan', { narasi: 'mati' });
  palsu.st.panggil = 0;
  sama('narasi mati: /ucap?event= 204', (await ucapEvent(k, 'apar-diperiksa')).status, 204);
  sama('  penyedia tidak dipanggil', palsu.st.panggil, 0);
  /* Yang dimatikan cuma naratornya. Notifikasi "tugas selesai" itu kabar
     untuk kamu, bukan suasana ruangan, dan tidak boleh ikut bisu. */
  sama('  tapi notifikasi tetap bersuara', (await ucap(k, SELESAI('Oji'))).status, 200);

  await kirim(k, '/suara/setelan', { narasi: 'panggung' });
  sama('lingkup lain tersimpan', (await json(k, '/suara/setelan')).d.narasi, 'panggung');
  /* 'panggung' disaring HALAMAN (server tidak tahu kelas event), jadi di sisi
     server ia harus tetap melayani — kalau tidak, narasi kejadian besar ikut
     hilang. */
  sama('  server tetap melayani (penyaringnya di halaman)',
    (await ucapEvent(k, 'apar-diperiksa')).status, 200);

  await kirim(k, '/suara/setelan', { narasi: 'ngawur' });
  sama('nilai yang tidak dikenal ditolak, setelan lama dipertahankan',
    (await json(k, '/suara/setelan')).d.narasi, 'panggung');

  // bertahan sesudah server dijalankan ulang
  await tutup(k);
  const k2 = await buka(dir, palsu);
  sama('lingkupnya bertahan sesudah server mati', (await json(k2, '/suara/setelan')).d.narasi, 'panggung');
  const isi = JSON.parse(fs.readFileSync(path.join(dir, 'suara.json'), 'utf8'));
  sama('  dan tercatat di suara.json', isi.narasi, 'panggung');
  sama('  versinya naik ke v3', isi.v, 3);
  await tutup(k2);
}

async function kasus18(palsu) {
  console.log(tebal('\nKasus 18: panaskan narasi — ratusan klip, sekali bayar'));
  const dir = sandboxBaru('r');
  tulisKatalog(dir);
  const k = await buka(dir, palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });

  const nama = await kirim(k, '/suara/panasi', {});
  sama('tanpa lingkup: tetap daftar nama seperti dulu', nama.d.lingkup, 'nama');

  palsu.st.panggil = 0;
  const p1 = await kirim(k, '/suara/panasi', { lingkup: 'event' });
  sama('lingkup event dikenali', p1.d.lingkup, 'event');
  /* Daftarnya dibaca dari SUMBER EVENT yang benar-benar dikirim ke halaman,
     bukan dari katalog rancangan: katalog memuat ratusan id yang ditolak atau
     belum ditulis, dan klip untuk kejadian yang tidak akan pernah menyala itu
     uang yang dibuang. Sandbox ini katalognya cuma tiga baris, jadi angka di
     bawah membuktikan asalnya memang bukan dari sana. */
  benar('daftarnya dari event yang terdaftar, bukan dari katalog ' + abu('(' + p1.d.total + ')'),
    p1.d.total > 100, 'cuma ' + p1.d.total + ' — daftar id event tidak terbaca?');
  sama('  semuanya dibuat', p1.d.dibuat, p1.d.total);
  sama('  tidak ada yang gagal', p1.d.gagal, 0);

  const sesudah = palsu.st.panggil;
  const p2 = await kirim(k, '/suara/panasi', { lingkup: 'event' });
  sama('tekan kedua kali: tidak ada yang dibuat lagi', p2.d.dibuat, 0);
  sama('  semuanya dihitung "sudah ada"', p2.d.sudah, p1.d.total);
  sama('  dan penyedia tidak dipanggil sekali pun', palsu.st.panggil, sesudah);

  /* Kunci salah bikin SEMUANYA gagal. Dengan ratusan narasi, menghabiskannya
     sampai baris terakhir berarti ratusan permintaan yang sudah pasti gagal —
     lama, dan pada penyedia yang menghitung permintaan gagal, mahal. */
  await json(k, '/suara/cache', { method: 'DELETE' });
  palsu.st.balas = '401';
  palsu.st.panggil = 0;
  const p3 = await kirim(k, '/suara/panasi', { lingkup: 'event' });
  sama('penyedia menolak: tetap 200, bukan 500', p3.s, 200);
  sama('  berhenti sesudah 5 kegagalan beruntun, bukan ratusan', p3.d.gagal, 5);
  sama('  penyedia dipanggil 5 kali saja', palsu.st.panggil, 5);
  benar('  pesannya menyebutkan kenapa berhenti', /berturut-turut/.test(p3.d.pesan || ''),
    'pesan: ' + p3.d.pesan);
  palsu.st.balas = 'ok';

  await tutup(k);
}

async function kasus19() {
  console.log(tebal('\nKasus 19: efek suara event — peta, kamus, dan pemanggilnya'));
  const room = fs.readFileSync(ROOM, 'utf8');
  const peta = fs.readFileSync(PETA_SUARA, 'utf8');

  /* Kamus EFEK dibaca dari room.js apa adanya. Nama resep di peta yang tidak
     ada di kamus TIDAK melempar apa pun waktu jalan — resepEfek() cuma
     mengembalikan null dan eventnya diam. Salah ketik satu huruf berarti satu
     kejadian kehilangan bunyinya, selamanya, tanpa satu pun galat muncul. */
  const blokEfek = /const EFEK = \{([\s\S]*?)\n\};/.exec(room);
  benar('kamus EFEK ketemu di room.js', Boolean(blokEfek), 'blok tidak ketemu — regexnya basi?');
  const kamus = new Set([...(blokEfek ? blokEfek[1] : '').matchAll(/^ {2}([a-zA-Z]+)\(/gm)].map((m) => m[1]));
  benar('  isinya banyak resep ' + abu('(' + kamus.size + ')'), kamus.size >= 30,
    'cuma ' + kamus.size + ' resep terbaca');

  const dipakai = [...new Set([...peta.matchAll(/:\s*(?:\[)?'([a-zA-Z]+)'/g)].map((m) => m[1]))];
  const asing = dipakai.filter((n) => !kamus.has(n));
  benar('setiap resep di 99-suara.js ada di kamus EFEK ' + abu('(' + dipakai.length + ' resep dipakai)'),
    asing.length === 0, 'tidak ada di kamus: ' + asing.join(', ') + ' — eventnya akan diam');

  // KOSAKATA di selaras-suara.mjs adalah salinan kamus; salinan yang hanyut
  // membuat skrip menerima resep yang sebenarnya tidak ada
  const kurang = [...kamus].filter((n) => !KOSAKATA.has(n));
  const lebih = [...KOSAKATA].filter((n) => !kamus.has(n));
  benar('KOSAKATA di selaras-suara.mjs sama dengan kamus EFEK',
    kurang.length === 0 && lebih.length === 0,
    'cuma di room.js: ' + kurang.join(', ') + ' | cuma di selaras-suara: ' + lebih.join(', '));

  /* Id di peta harus id event yang sungguhan. Regexnya sama dengan yang
     dipakai uji-katalog.mjs dan narasiDaftarId() di server. */
  const sumber = fs.readdirSync(EVENT_DIR).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(EVENT_DIR, f), 'utf8')).join('');
  const terdaftar = new Set([...sumber.matchAll(/^\s{2}id: '([^']+)'/gm)].map((m) => m[1]));
  const idPeta = [...peta.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
  const hantu = idPeta.filter((id) => !terdaftar.has(id));
  benar('setiap id di 99-suara.js benar-benar event yang terdaftar ' + abu('(' + idPeta.length + ')'),
    hantu.length === 0, 'id tidak dikenal: ' + hantu.slice(0, 5).join(', '));

  /* Yang paling mudah hilang waktu nyalakanEvent() disunting orang lain: dua
     baris pemanggilnya. Tanpa keduanya seluruh fitur ini mati tanpa gejala —
     tidak ada galat, cuma ruangan yang kembali sunyi. */
  const blokNyala = /function nyalakanEvent\(def\) \{([\s\S]*?)\n\}/.exec(room);
  /* KODEnya saja. Blok itu memang menjelaskan panjang lebar kenapa keduanya
     dipanggil di sana, dan tanpa membuang komentar, "// ucapEvent(def);" —
     yaitu persis cara orang mematikan sesuatu sementara lalu lupa
     menyalakannya lagi — masih lolos lint ini. Terbukti: mutasi itu sempat
     tidak tertangkap. */
  const kodeNyala = (blokNyala ? blokNyala[1] : '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  benar('nyalakanEvent memanggil efekEvent()', /efekEvent\(def/.test(kodeNyala),
    'efek suara event tidak pernah dibunyikan');
  benar('nyalakanEvent memanggil ucapEvent()', /ucapEvent\(def/.test(kodeNyala),
    'narasi event tidak pernah diminta');

  // berkas peta tidak berguna kalau tidak ikut disambung ke /event-acak.js
  const manifest = JSON.parse(fs.readFileSync(path.join(EVENT_DIR, 'manifest.json'), 'utf8'));
  benar('99-suara.js terdaftar di manifest.json', manifest.berkas.includes('99-suara.js'),
    'petanya tidak akan pernah sampai ke halaman');
}

async function kasus20() {
  console.log(tebal('\nKasus 20: penyaring narasi di HALAMAN, dijalankan sungguhan'));
  /* Lingkup 'panggung' dan "satu narator" hidup di room.js, bukan di server —
     server tidak tahu kelas event, dan tidak berhak tahu. Jadi keduanya tidak
     bisa diuji lewat HTTP seperti kasus 17, dan lint teks tidak menggigit:
     mengganti `if (narasiSibuk)` jadi `if (false)` lolos dari regex mana pun
     yang masuk akal. Terbukti — mutasi itu sempat lewat.

     Yang dipakai di sini sandbox vm milik uji-event.mjs: room.js yang
     SUNGGUHAN dijalankan, lalu ucapEvent() dipanggil beneran. `Audio` disulih
     supaya URL yang diminta bisa dibaca dan supaya tidak ada yang mencoba
     memutar apa pun. */
  const ctx = muatKonteks();
  const diminta = [];
  ctx.Audio = class {
    constructor(url) { diminta.push(url); this.volume = 1; }
    play() { return { catch() { /* klipnya "sedang dimuat": narator tetap sibuk */ } }; }
  };
  /* ucapNyala/narasiLingkup/narasiSibuk itu `let`, jadi BUKAN properti context
     — menulisnya dari host tidak menembus binding lexical aslinya. Jembatan
     ini dieksekusi DI DALAM context yang sama, persis pola setS/setNow yang
     sudah dipakai uji-event.mjs. */
  vm.runInContext(`globalThis.__narasi__ = {
    nyala: (v) => { ucapNyala = v; },
    lingkup: (v) => { narasiLingkup = v; },
    bebas: () => narasiBebas(),
    sibuk: () => narasiSibuk,
  };`, ctx);
  const N = ctx.__narasi__;
  const panggung = { id: 'rapat-pleno', kelas: 'panggung' };
  const latar = { id: 'cicak-di-dinding', kelas: 'latar' };

  N.nyala(false); N.lingkup('semua'); N.bebas();
  sama('suara ucap mati: tidak ada narasi', ctx.ucapEvent(panggung), false);

  N.nyala(true); N.lingkup('mati'); N.bebas();
  sama('lingkup mati: tidak ada narasi', ctx.ucapEvent(panggung), false);

  N.lingkup('panggung'); N.bebas();
  sama('lingkup panggung: event latar dilewat', ctx.ucapEvent(latar), false);
  sama('  event panggung tetap dibacakan', ctx.ucapEvent(panggung), true);
  /* Event latar boleh menumpuk, jadi dua narasi bisa diminta di detik yang
     sama. Yang kedua harus DIBUANG, bukan diantrekan: narasi yang telat
     sepuluh detik menceritakan kejadian yang sudah lewat. */
  sama('  selagi narator bicara, yang berikutnya dibuang', ctx.ucapEvent(panggung), false);
  sama('  dan memang cuma satu klip yang diminta', diminta.length, 1);
  sama('  URL-nya membawa id, bukan kalimat', diminta[0], '/ucap?event=rapat-pleno');

  /* Jenis kelamin pemerannya ikut dititipkan — kalimatnya orang pertama, jadi
     suaranya harus suara dia. Halaman TIDAK memilih voice-nya sendiri: itu
     setelan server, dan halaman cuma tahu siapa yang bicara. */
  N.bebas();
  ctx.ucapEvent(panggung, { jk: 'P' });
  sama('  pemeran perempuan dititipkan di URL', diminta[1], '/ucap?event=rapat-pleno&jk=P');
  N.bebas();
  ctx.ucapEvent(panggung, { jk: 'L' });
  sama('  pemeran laki-laki juga', diminta[2], '/ucap?event=rapat-pleno&jk=L');
  N.bebas();
  ctx.ucapEvent(panggung, { jk: '' });
  sama('  pemeran tanpa jenis kelamin: tidak ada jk di URL', diminta[3], '/ucap?event=rapat-pleno');

  N.bebas();
  sama('sesudah klipnya selesai, narator bebas lagi', ctx.ucapEvent(latar), false);  // masih 'panggung'
  N.lingkup('semua'); N.bebas();
  sama('lingkup semua: event latar ikut dibacakan', ctx.ucapEvent(latar), true);
  sama('  klipnya bertambah satu', diminta.length, 5);

  /* Id event tidak pernah lolos mentah-mentah ke URL. Tidak ada id yang perlu
     dikodekan hari ini, tapi ini yang menahan hari waktu ada yang menambah
     satu — dan `&` di query string bukan gejala yang bakal ketahuan sendiri. */
  N.bebas();
  ctx.ucapEvent({ id: 'aneh&sekali', kelas: 'latar' });
  sama('id dikodekan buat URL', diminta[5], '/ucap?event=aneh%26sekali');
}

async function kasus21() {
  console.log(tebal('\nKasus 21: tiap event punya kalimat orang pertamanya sendiri'));
  /* Jenjang cadangan (balon, lalu nama) memang ada supaya event baru tidak
     pernah bisu — tapi cadangan itu terdengar beda: balon sering penggalan,
     nama itu papan nama. Yang bikin ruangan ini terasa berpenghuni kalimat
     tulisan tangan, dan kalimat tulisan tangan tidak akan pernah menyusul
     sendiri kalau tidak ada yang menagihnya. Kasus ini yang menagih. */
  const berkas = path.join(__dirname, 'narasi-event.json');
  let o = null;
  try { o = JSON.parse(fs.readFileSync(berkas, 'utf8')); } catch (e) { o = null; }
  benar('narasi-event.json terbaca sebagai JSON', Boolean(o && o.narasi),
    'berkasnya hilang atau rusak — semua narasi turun ke jenjang cadangan');
  const narasi = (o && o.narasi) || {};

  const sumber = fs.readdirSync(EVENT_DIR).filter((f) => f.endsWith('.js') && f !== '99-suara.js')
    .map((f) => fs.readFileSync(path.join(EVENT_DIR, f), 'utf8')).join('');
  const terdaftar = [...new Set([...sumber.matchAll(/^\s{2}id: '([^']+)'/gm)].map((m) => m[1]))];

  const belum = terdaftar.filter((id) => !narasi[id]);
  benar('setiap event terdaftar punya kalimatnya ' + abu('(' + terdaftar.length + ' event)'),
    belum.length === 0,
    belum.length + ' belum ditulis: ' + belum.slice(0, 8).join(', ')
      + ' — tulis satu kalimat orang pertama di narasi-event.json');

  const hantu = Object.keys(narasi).filter((id) => !terdaftar.includes(id));
  benar('tidak ada kalimat untuk event yang sudah tidak ada', hantu.length === 0,
    'id tidak dikenal: ' + hantu.slice(0, 8).join(', '));

  /* Pagar bentuk, bukan selera. Kalimat yang kepanjangan bikin narasi masih
     berbunyi waktu kejadiannya sudah lewat (event terpendek durasinya 3
     detik), dan kalimat berkutip bikin JSON-nya rewel disunting tangan. */
  const isi = Object.entries(narasi);
  const panjang = isi.filter(([, t]) => t.length > 90).map(([id]) => id);
  benar('tidak ada kalimat lebih dari 90 huruf', panjang.length === 0,
    panjang.slice(0, 5).join(', '));
  const kosong = isi.filter(([, t]) => typeof t !== 'string' || t.trim().length < 8).map(([id]) => id);
  benar('tidak ada kalimat kosong atau sepenggal', kosong.length === 0, kosong.slice(0, 5).join(', '));
  const berkutip = isi.filter(([, t]) => /["]/.test(t)).map(([id]) => id);
  benar('tidak ada tanda kutip di dalam kalimat', berkutip.length === 0, berkutip.slice(0, 5).join(', '));

  const rata = isi.reduce((a, [, t]) => a + t.length, 0) / (isi.length || 1);
  lulus('rata-rata ' + rata.toFixed(0) + ' huruf per kalimat ' + abu('(' + isi.length + ' kalimat)'));
}

async function kasus22(palsu) {
  console.log(tebal('\nKasus 22: suara ikut jenis kelamin yang mengucapkannya'));
  const dir = sandboxBaru('s');
  tulisKatalog(dir);
  const k = await buka(dir, palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true, voice: 'netral' });
  const voiceTerakhir = () => (palsu.st.badan[palsu.st.badan.length - 1] || {}).voice;

  /* Bawaannya KOSONG, dan itu keputusan, bukan kelalaian: tidak ada satu pun
     sumber yang bisa dicek yang menyebutkan voice mana laki-laki dan mana
     perempuan — OpenRouter cuma mengirim nama, dokumen Google cuma menyebut
     sifat ("Bright", "Soft"). Menebaknya berarti mengarang fakta lalu
     memakainya seolah data. Jadi selama belum dipilih manusia, semua orang
     memakai voice utama — persis seperti sebelum fitur ini ada. */
  const awal = (await json(k, '/suara/setelan')).d;
  sama('voice laki-laki bawaannya kosong', awal.voiceL, '');
  sama('voice perempuan bawaannya kosong', awal.voiceP, '');

  palsu.st.panggil = 0; palsu.st.badan = [];
  await ucap(k, SELESAI('Oji'), null, 'L');
  sama('belum dipasang: laki-laki tetap voice utama', voiceTerakhir(), 'netral');
  await ucap(k, SELESAI('Sri'), null, 'P');
  sama('  perempuan juga', voiceTerakhir(), 'netral');
  const sebelum = palsu.st.panggil;

  await kirim(k, '/suara/setelan', { voiceL: 'Charon', voiceP: 'Leda' });
  await ucap(k, SELESAI('Oji'), null, 'L');
  sama('sesudah dipasang: laki-laki memakai voice-nya', voiceTerakhir(), 'Charon');
  await ucap(k, SELESAI('Sri'), null, 'P');
  sama('  perempuan memakai voice-nya', voiceTerakhir(), 'Leda');
  await ucap(k, SELESAI('Tamu'));
  sama('  tidak diketahui tetap voice utama', voiceTerakhir(), 'netral');
  for (const buruk of ['X', 'laki', '1', 'l']) {
    await ucap(k, SELESAI('Ngawur ' + buruk), null, buruk);
    sama('jk ngawur ' + abu(JSON.stringify(buruk)) + ' = tidak diketahui, bukan galat',
      voiceTerakhir(), 'netral');
  }

  /* Kalimat yang SAMA dengan jenis kelamin berbeda itu dua klip, dan itu
     memang harusnya begitu — tapi yang dihash voice EFEKTIF, bukan `jk`-nya.
     Bedanya kelihatan waktu voice-nya dikosongkan lagi: klip lama langsung
     kepakai kembali, tanpa satu pun panggilan baru. */
  palsu.st.panggil = 0;
  await ucap(k, SELESAI('Kembar'), null, 'L');
  await ucap(k, SELESAI('Kembar'), null, 'P');
  sama('kalimat sama, dua jenis kelamin = dua klip', palsu.st.panggil, 2);
  await ucap(k, SELESAI('Kembar'), null, 'L');
  sama('  yang kedua kali dilayani cache', palsu.st.panggil, 2);

  await kirim(k, '/suara/setelan', { voiceL: '', voiceP: '' });
  palsu.st.panggil = 0;
  await ucap(k, SELESAI('Oji'), null, 'L');
  sama('dikosongkan lagi: klip voice utama yang lama kepakai, nol panggilan',
    palsu.st.panggil, 0);
  benar('  dan klip "netral" itu memang yang dibuat di awal tadi', sebelum === 2,
    'panggilan awal: ' + sebelum);

  // narasi event ikut jalur yang sama
  await kirim(k, '/suara/setelan', { voiceL: 'Charon', voiceP: 'Leda' });
  await ambil(k, '/ucap?event=cicak-jatuh-ke-berkas&jk=P');
  sama('narasi event ikut jenis kelamin pemerannya', voiceTerakhir(), 'Leda');
  await ambil(k, '/ucap?event=cicak-jatuh-ke-berkas');
  sama('  event tanpa pemeran jatuh ke voice utama', voiceTerakhir(), 'netral');

  // ETag harus ikut berubah, kalau tidak peramban memutar suara yang salah
  const eL = (await ambil(k, '/ucap?event=cicak-jatuh-ke-berkas&jk=L')).headers.get('etag');
  const eP = (await ambil(k, '/ucap?event=cicak-jatuh-ke-berkas&jk=P')).headers.get('etag');
  benar('ETag beda antar jenis kelamin', Boolean(eL && eP && eL !== eP),
    'L: ' + eL + ' P: ' + eP + ' — peramban akan memutar suara yang salah');

  // audisi per kolom
  const cobaP = await ambil(k, '/suara/coba?jk=P');
  sama('audisi ?jk=P: 200', cobaP.status, 200);
  sama('  memakai voice perempuan', voiceTerakhir(), 'Leda');

  /* Panaskan cache: nama SUDAH membawa jenis kelaminnya (jkDari), jadi tiap
     nama tetap satu klip — bukan dua. Yang tidak bisa ditebak cuma kalimat
     tanpa nama ("mohon arahan"), dan itu memang dipanaskan tiga kali. */
  await kirim(k, '/nama/daftar', { penuh: ['Budi', 'Sri Rahayu', 'Oji'] });
  await json(k, '/suara/cache', { method: 'DELETE' });
  const p1 = await kirim(k, '/suara/panasi', { lingkup: 'nama' });
  sama('panaskan nama: tiga nama + tiga rupa "mohon arahan"', p1.d.total, 6);
  sama('  semuanya dibuat', p1.d.dibuat, 6);
  /* Bukan cuma JUMLAHNYA yang benar — voice-nya juga. Kalau panasi memakai
     voice utama untuk semua nama, angka totalnya tetap 6 dan tidak ada yang
     kelihatan salah; yang meleset baru ketahuan waktu notifikasi sungguhan
     datang dan ternyata masih harus digenerate. Itu yang diperiksa di sini:
     nol panggilan baru untuk ketiga nama, di jenis kelamin masing-masing. */
  palsu.st.panggil = 0;
  await ucap(k, SELESAI('Budi'), null, 'L');
  await ucap(k, SELESAI('Sri Rahayu'), null, 'P');
  await ucap(k, SELESAI('Oji'));
  sama('  dan yang dipanaskan memang voice yang nanti dipakai', palsu.st.panggil, 0);

  /* Dan inilah bagian yang paling gampang membengkak tanpa disadari: narasi
     event tidak tahu siapa pemerannya, jadi ketiga kemungkinan dipanaskan.
     Dengan dua voice terpasang itu 3x jumlah event; begitu dikosongkan lagi,
     ketiganya kembali jadi satu hash dan daftarnya menyusut sendiri. */
  const e3 = await kirim(k, '/suara/panasi', { lingkup: 'event' });
  await kirim(k, '/suara/setelan', { voiceL: '', voiceP: '' });
  const e1 = await kirim(k, '/suara/panasi', { lingkup: 'event' });
  sama('narasi event dengan dua voice = tiga kali lipat', e3.d.total, e1.d.total * 3);

  await tutup(k);
}

async function kasus23(palsu) {
  console.log(tebal('\nKasus 23: model yang menolak mp3 — pcm dibungkus WAV, sekali koreksi'));
  /* Kejadian sungguhan, dan justru melawan yang tertulis di rancangan awal:
     `response_format: 'mp3'` dulu ditulis sebagai TETAPAN, dengan alasan yang
     benar (pcm mentah tidak bisa dimainkan <audio>) tapi kesimpulan yang
     salah. Gemini TTS membalas 400 "only supports response_format=pcm", dan
     seluruh fitur suara mati tanpa jalan keluar dari panel. */
  const dir = sandboxBaru('t');
  tulisKatalog(dir);
  const k = await buka(dir, palsu);
  await kirim(k, '/suara/setelan', { kunci: KUNCI, aktif: true });
  sama('bawaannya tetap mp3', (await json(k, '/suara/setelan')).d.format, 'mp3');

  palsu.st.balas = 'pcmSaja';
  palsu.st.panggil = 0; palsu.st.formatDiminta = [];

  const r = await ucap(k, SELESAI('Oji'));
  sama('penyedia menolak mp3: klipnya tetap sampai, bukan 204', r.status, 200);
  sama('  dicoba mp3 dulu, lalu pcm', palsu.st.formatDiminta.join(','), 'mp3,pcm');
  sama('  content-type jadi audio/wav', r.headers.get('content-type'), 'audio/wav');

  /* Yang paling gampang salah: pcm mentah dikirim apa adanya. Peramban tidak
     akan melapor — <audio> cuma diam. Jadi yang diperiksa kepalanya. */
  const buf = Buffer.from(await r.arrayBuffer());
  sama('  badannya WAV, bukan pcm telanjang', buf.toString('latin1', 0, 4), 'RIFF');
  sama('  penanda WAVE di tempatnya', buf.toString('latin1', 8, 12), 'WAVE');
  sama('  laju cuplikan dari content-type penyedia', buf.readUInt32LE(24), 24000);
  sama('  mono', buf.readUInt16LE(22), 1);
  sama('  16 bit', buf.readUInt16LE(34), 16);
  sama('  panjang data cocok dengan pcm-nya', buf.readUInt32LE(40), palsu.st.pcm.length);
  sama('  dan seluruh badan = 44 byte kepala + pcm', buf.length, 44 + palsu.st.pcm.length);

  /* Diingat, bukan ditebak ulang tiap kali. Tanpa ini tiap klip pertama
     sesudah server hidup selalu membuang satu permintaan yang sudah pasti
     gagal — dan pada penyedia yang menghitung permintaan gagal, itu dibayar. */
  sama('formatnya diingat di setelan', (await json(k, '/suara/setelan')).d.format, 'pcm');
  const isi = JSON.parse(fs.readFileSync(path.join(dir, 'suara.json'), 'utf8'));
  sama('  dan tercatat di suara.json', isi.format, 'pcm');

  palsu.st.formatDiminta = [];
  const lain = await ucap(k, SELESAI('Sri Rahayu'));
  sama('kalimat berikutnya langsung pcm, tanpa mencoba mp3 lagi',
    palsu.st.formatDiminta.join(','), 'pcm');
  sama('  dan tetap WAV', lain.headers.get('content-type'), 'audio/wav');

  // klipnya disimpan sebagai .wav, dan "kosongkan" harus ikut membuangnya
  const berkas = fs.readdirSync(path.join(dir, 'suara'));
  benar('klip disimpan sebagai .wav ' + abu('(' + berkas.join(', ') + ')'),
    berkas.length === 2 && berkas.every((n) => n.endsWith('.wav')),
    'isi folder: ' + berkas.join(', '));
  sama('cache menghitungnya', (await json(k, '/suara/setelan')).d.cache.jumlah, 2);
  const bersih = await json(k, '/suara/cache', { method: 'DELETE' });
  sama('kosongkan ikut membuang .wav', bersih.d.dibuang, 2);

  /* Format ikut di-hash. Kalau tidak, klip mp3 lama akan disajikan sebagai
     audio/wav sesudah formatnya berpindah — diam, tanpa galat apa pun. */
  await kirim(k, '/suara/setelan', { format: 'mp3' });
  palsu.st.balas = 'ok';
  const mp3 = await ucap(k, SELESAI('Oji'));
  sama('dipaksa balik ke mp3 dari panel', mp3.headers.get('content-type'), 'audio/mpeg');
  const nama = fs.readdirSync(path.join(dir, 'suara'));
  benar('  klipnya berkas .mp3 yang berbeda', nama.length === 1 && nama[0].endsWith('.mp3'),
    'isi folder: ' + nama.join(', '));

  /* PCM yang datang masih ter-base64. Google API sendiri mengembalikannya
     begitu, dan tidak ada jaminan setiap perantara sudah membukanya. Tanpa
     penjaga, yang terjadi bukan galat melainkan klip berisi DERAU — kepala
     WAV yang benar di atas teks ASCII, dan tidak ada satu pun yang
     melapor. */
  await kirim(k, '/suara/setelan', { format: 'pcm' });
  await json(k, '/suara/cache', { method: 'DELETE' });
  palsu.st.balas = 'pcmBase64';
  const b64 = await ucap(k, SELESAI('Base Enam Empat'));
  const isiB64 = Buffer.from(await b64.arrayBuffer());
  sama('pcm yang masih ter-base64 dibuka dulu', isiB64.length, 44 + palsu.st.pcm.length);
  benar('  isinya pcm yang benar, bukan teks ASCII berkepala WAV',
    isiB64.subarray(44).equals(palsu.st.pcm), 'badannya bukan pcm aslinya');
  palsu.st.balas = 'ok';

  await tutup(k);
}

/* ================================================================= main === */
const palsu = await openrouterPalsu();
try {
  await kasus1(palsu);
  await kasus2(palsu);
  await kasus3(palsu);
  await kasus4(palsu);
  await kasus5(palsu);
  await kasus6(palsu);
  await kasus7(palsu);
  await kasus8(palsu);
  await kasus9(palsu);
  await kasus10();
  await kasus11(palsu);
  await kasus12();
  await kasus13(palsu);
  await kasus14(palsu);
  await kasus15(palsu);
  await kasus16(palsu);
  await kasus17(palsu);
  await kasus18(palsu);
  await kasus19();
  await kasus20();
  await kasus21();
  await kasus22(palsu);
  await kasus23(palsu);
} finally {
  await palsu.tutup();
  if (!SIMPAN) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* biarkan */ } }
  else console.log(abu('\nfolder sementara disimpan: ' + TMP));
}

console.log();
if (gagal) {
  console.log(merah(tebal('GAGAL: ' + gagal + ' dari ' + periksa + ' pemeriksaan')));
  process.exit(1);
}
console.log(hijau(tebal('LULUS: ' + periksa + ' pemeriksaan')));
