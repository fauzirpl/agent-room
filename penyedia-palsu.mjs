#!/usr/bin/env node
/* penyedia-palsu.mjs :: penyedia tiruan untuk uji nol-jaringan.
 *
 * Repo ini punya satu janji yang gampang diucapkan dan gampang bocor:
 * `npm test` tidak boleh menyentuh jaringan. Sampai sekarang janji itu dijaga
 * satu-satu di tiap harness — `uji-suara.mjs` punya OpenRouter palsunya
 * sendiri, `uji-pagu.mjs` menghapus seluruh env `AGENT_ROOM_*`, sisanya
 * mengosongkan `AGENT_ROOM_LAPOR` dengan tangan. Tiga cara berbeda untuk satu
 * janji berarti cepat atau lambat ada yang lupa; `uji-jk.mjs` memang lupa.
 *
 * Berkas ini menaruh penyedia tiruannya di satu tempat supaya harness
 * berikutnya tidak perlu menulis ulang, dan supaya `uji-jaringan.mjs` punya
 * satu daftar resmi tentang env mana saja yang membuka jalur keluar.
 *
 * Semuanya HTTP sungguhan di 127.0.0.1, bukan `fetch` yang di-monkeypatch:
 * yang mau diuji justru bentuk permintaan yang benar-benar KELUAR dari server
 * (header, badan, format), dan itu cuma kelihatan kalau ada yang menerimanya.
 *
 * Nol dependency, seperti sisa repo ini.
 */

import http from 'node:http';

/* Daftar resmi env yang membuka jalur keluar dari server. Dipakai
   `uji-jaringan.mjs` sebagai kontrak, dan `envTanpaJalurKeluar()` di bawah
   sebagai penutupnya. Menambah jalur keluar baru di `server.mjs` berarti
   menambah namanya DI SINI JUGA — kalau tidak, gerbangnya tidak menjaganya. */
export const ENV_JALUR_KELUAR = [
  'AGENT_ROOM_LAPOR',          // nota dinas keluar (Slack/Discord)
  'AGENT_ROOM_LAPOR_SELESAI',  // menambah kabar 'selesai' ke nota di atas
  'AGENT_ROOM_CUACA',          // geojs.io + open-meteo.com
  'AGENT_ROOM_SUARA_URL',      // OpenRouter TTS
  'AGENT_ROOM_SUARA_MODEL_URL',// daftar model OpenRouter
];

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

function dengar(srv) {
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

async function badanJson(req) {
  let b = '';
  for await (const c of req) b += c;
  try { return JSON.parse(b); } catch { return null; }
}

/* ---------------------------------------------------- loket nota dinas ---
 * Penampung `AGENT_ROOM_LAPOR`. Mencatat tiap POST apa adanya supaya uji bisa
 * memeriksa BUKAN cuma "notanya terkirim", tapi juga "isinya memang cuma
 * metadata" — itu janji privasi yang tertulis di docs/02-ruangan.md dan sampai
 * sekarang tidak ada satu pun uji yang menjaganya.
 */
export async function loketNota() {
  const st = {
    nota: [],        // badan JSON tiap POST yang masuk
    header: [],      // header tiap POST
    balas: 'ok',     // 'ok' | '500' | 'sampah'
    tunda: 0,        // ms, buat menguji server tidak ikut tertahan
  };
  const srv = http.createServer(async (req, res) => {
    const b = await badanJson(req);
    st.nota.push(b);
    st.header.push({ ...req.headers });
    if (st.tunda) await tidur(st.tunda);
    if (st.balas === '500') { res.writeHead(500).end('boom'); return; }
    if (st.balas === 'sampah') { res.writeHead(200).end('bukan json'); return; }
    res.writeHead(204).end();
  });
  const port = await dengar(srv);
  return {
    st,
    url: 'http://127.0.0.1:' + port + '/nota',
    /* Menunggu nota ke-n datang. Nota dikirim server SESUDAH `publish()`, jadi
       uji tidak boleh menganggap ia sudah tiba begitu POST /event dijawab. */
    async tunggu(n = 1, batasMs = 5000) {
      const batas = Date.now() + batasMs;
      while (st.nota.length < n) {
        if (Date.now() > batas) return false;
        await tidur(25);
      }
      return true;
    },
    tutup: () => new Promise((r) => srv.close(r)),
  };
}

/* -------------------------------------------------------- OpenRouter TTS ---
 * Bentuknya mengikuti yang dipakai `uji-suara.mjs` supaya harness itu suatu
 * hari bisa memakai berkas ini tanpa mengubah satu pun kasusnya. Sengaja TIDAK
 * dipaksakan sekarang: menyatukannya adalah commit sendiri, bukan selundupan.
 */
export async function penyediaSuara() {
  const st = {
    panggil: 0,
    badan: [],
    auth: [],
    tunda: 0,
    balas: 'ok',                  // 'ok' | '401' | '500' | 'kosong'
    modelMati: false,
    klip: Buffer.from('ID3klip-palsu-yang-berpura-pura-mp3'),
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
          { id: 'palsu/tts-dua', name: 'TTS Palsu Dua', pricing: { audio: '0.00003' },
            supported_voices: null },
        ],
      }));
      return;
    }
    if (u.pathname === '/audio/speech') {
      st.panggil++;
      st.auth.push(req.headers.authorization || '');
      st.badan.push(await badanJson(req));
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
  const port = await dengar(srv);
  return {
    st,
    suaraUrl: 'http://127.0.0.1:' + port + '/audio/speech',
    modelUrl: 'http://127.0.0.1:' + port + '/models',
    tutup: () => new Promise((r) => srv.close(r)),
  };
}

/* --------------------------------------------------- loket paraf tiruan ---
 * Kantor palsu untuk `mcp-izin.mjs`: melayani `POST /izin/tanya` dan
 * `GET /izin/tunggu` dengan bentuk yang sama seperti server sungguhan, tapi
 * jawabannya diatur uji.
 *
 * Kenapa perlu kantor palsu padahal kantor sungguhan ada: loket paraf yang
 * asli cuma menjawab kalau ada rekaman tugas di `jalan`, dan rekaman itu baru
 * lahir waktu server men-spawn biner claude. `npm test` tidak boleh punya satu
 * pun biner luar — jadi tanpa ini, seluruh jalur allow/deny `mcp-izin.mjs`
 * (satu-satunya pintu paraf yang dipakai sesi lahiran halaman) tidak bisa
 * disentuh sama sekali.
 *
 * Sekalian: loket ini MENCATAT apa saja yang benar-benar sampai. Itu satu-
 * satunya cara membuktikan janji privasi yang tertulis di kepala
 * `mcp-izin.mjs` — isi perintah tidak pernah ikut, cuma ringkasan ≤300
 * karakter dan nama pola risiko.
 */
export async function loketParaf() {
  const st = {
    tanya: [],            // badan tiap POST /izin/tanya
    tunggu: [],           // query tiap GET /izin/tunggu
    lain: [],             // rute lain yang tersentuh — harus tetap kosong
    tanyaBalas: 'ok',     // 'ok' | '403'
    id: 'izin-palsu-01',
    /* Antrean jawaban untuk /izin/tunggu, dikonsumsi satu per satu. Yang
       terakhir dipakai terus sesudah antreannya habis, jadi uji cukup
       menuliskan babak yang menarik saja. Bentuk yang dikenal:
         { tunggu: true }                 server menahan (long-poll biasa)
         { keputusan: 'paraf' }
         { keputusan: 'tolak', pesan }
         { http: 404 }                    permintaannya sudah hilang
         { http: 500 }                    gangguan sesaat */
    antrean: [],
    tetap: { keputusan: 'paraf' },
  };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (kode, obj) => {
      res.writeHead(kode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (u.pathname === '/izin/tanya' && req.method === 'POST') {
      st.tanya.push(await badanJson(req));
      if (st.tanyaBalas === '403') return json(403, { ok: false, pesan: 'kunci izin tidak cocok' });
      return json(200, { ok: true, id: st.id });
    }
    if (u.pathname === '/izin/tunggu') {
      st.tunggu.push(Object.fromEntries(u.searchParams));
      const j = st.antrean.length ? st.antrean.shift() : st.tetap;
      if (j && j.http) { res.writeHead(j.http).end(); return; }
      return json(200, j);
    }
    st.lain.push(u.pathname);
    res.writeHead(404).end();
  });
  const port = await dengar(srv);
  return {
    st,
    url: 'http://127.0.0.1:' + port,
    /* Menunggu permintaan ke-n benar-benar sampai. mcp-izin bicara lewat
       proses lain, jadi uji tidak boleh menganggap ia sudah bertanya begitu
       barisnya ditulis ke stdin-nya. */
    async tungguTanya(n = 1, batasMs = 5000) {
      const batas = Date.now() + batasMs;
      while (st.tanya.length < n) {
        if (Date.now() > batas) return false;
        await tidur(20);
      }
      return true;
    },
    tutup: () => new Promise((r) => srv.close(r)),
  };
}

/* ------------------------------------------------------------- env bersih ---
 * Satu tempat untuk menutup SEMUA jalur keluar sekaligus. Harness baru cukup
 * memanggil ini; yang lama boleh tetap dengan caranya sendiri selama
 * `uji-jaringan.mjs` masih hijau.
 *
 * `dasar` biasanya `process.env`. Yang dikembalikan salinan — bukan
 * `process.env` yang disunting — supaya proses uji sendiri tidak ikut berubah.
 */
export function envTanpaJalurKeluar(dasar = process.env, tambahan = {}) {
  const env = { ...dasar };
  // Buang SEMUA env kantor yang mungkin ikut dari shell pemanggil. Menghapus
  // lebih aman daripada mengosongkan satu-satu: env baru yang ditambahkan
  // nanti ikut tertutup tanpa harus diingat di sini.
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_ROOM_')) delete env[k];
  for (const k of ENV_JALUR_KELUAR) env[k] = '';
  env.AGENT_ROOM_CUACA = 'off';   // '' berarti "tebak dari IP"; yang mematikan adalah 'off'
  return Object.assign(env, tambahan);
}
