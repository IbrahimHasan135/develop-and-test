// sw.js
self.addEventListener('install', (evt) => { self.skipWaiting(); });
self.addEventListener('activate', (evt) => { evt.waitUntil(self.clients.claim()); });

const API_PATH = '/api/get-hex';
const MIN_T = 16, MAX_T = 30;

function b64ToHex(b64) {
  if (!b64) return null;
  // atob → binary string → hex
  const bin = atob(b64);
  let hex = '';
  for (let i = 0; i < bin.length; i++) {
    const h = bin.charCodeAt(i).toString(16).padStart(2, '0');
    hex += h;
  }
  return hex.toUpperCase();
}

async function handleGetHex(request) {
  try {
    const body = await request.json().catch(() => ({}));
    let { model, mode } = body || {};
    if (!model || !mode) {
      return new Response(JSON.stringify({ error: 'model & mode wajib' }), {
        status: 400, headers: { 'content-type': 'application/json' }
      });
    }
    model = String(model).trim();
    mode  = String(mode).trim().toLowerCase(); // "low|mid|high|auto|quiet"

    // Ambil JSON SmartIR di /.allcodes/<model>.json
    // Pastikan file ini dapat diakses secara publik (same-origin).
    const url = `/.allcodes/${encodeURIComponent(model)}.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `model ${model} tidak ditemukan` }), {
        status: 404, headers: { 'content-type': 'application/json' }
      });
    }
    const data = await res.json();

    // Struktur acuan: data.commands.off, data.commands.cool[mode][temp]
    // NB: file SmartIR pakai Base64 (commandsEncoding: "Base64") → kita konversi ke HEX.
    const out = {};
    // OFF
    const offB64 = data?.commands?.off || null;
    if (offB64) out.off = b64ToHex(offB64);

    // COOL + FAN=mode
    const coolByFan = data?.commands?.cool?.[mode];
    if (!coolByFan) {
      return new Response(JSON.stringify({ error: `mode fan "${mode}" tidak tersedia untuk model ${model}` }), {
        status: 400, headers: { 'content-type': 'application/json' }
      });
    }

    // Loop suhu 16..30; ambil yang ada saja
    for (let t = MIN_T; t <= MAX_T; t++) {
      const key = String(t);
      const b64 = coolByFan[key];
      if (b64) out[key] = b64ToHex(b64);
    }

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
}

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);
  if (url.pathname === API_PATH && evt.request.method === 'POST') {
    evt.respondWith(handleGetHex(evt.request));
  }
});
