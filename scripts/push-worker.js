// Amaya Heroes — instant push notifications (Cloudflare Worker).
// The app calls POST /kick right after it creates a notification; the Worker sends every new
// note to the phones through Firebase Cloud Messaging. A cron trigger (every minute) is a backup.
// It never takes message text from the request: it only sends notes already saved in the database.
// Secrets (Worker > Settings > Variables and secrets, type "Secret"):
//   FIREBASE_SERVICE_ACCOUNT  = full JSON of the Firebase service account key
//   FIREBASE_DB_URL           = Realtime Database URL
const MAX_AGE_MS = 60 * 60 * 1000;
const ORIGINS = [/^https:\/\/abdualdore-dev\.github\.io$/, /^https:\/\/([a-z0-9-]+\.)*amaya[a-z0-9-]*\.[a-z.]+$/i, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64uStr = s => b64u(new TextEncoder().encode(s));
const cleanKey = v => String(v).replace(/[.$#\[\]\/\s]/g, '_');

let tokCache = null;
async function accessToken(sa) {
  if (tokCache && tokCache.exp > Date.now() + 60e3) return tokCache.t;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64uStr(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + b64u(sig),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j).slice(0, 200));
  tokCache = { t: j.access_token, exp: Date.now() + 3500e3 };
  return j.access_token;
}

async function sendNew(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '{}');
  const db = String(env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
  if (!sa.private_key || !db) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DB_URL secret');
  const tok = await accessToken(sa);
  const qs = `?access_token=${encodeURIComponent(tok)}`;
  const get = async p => (await fetch(`${db}/${p}.json${qs}`)).json();
  const put = (p, v) => fetch(`${db}/${p}.json${qs}`, { method: 'PUT', body: JSON.stringify(v) });

  const now = Date.now();
  const last = Number(await get('amaya_meta/pushLast')) || now - 10 * 60 * 1000;
  const notes = Object.values((await get('amaya/notes')) || {})
    .filter(n => n && n.at > last && n.at > now - MAX_AGE_MS && n.at <= now + 60e3)
    .sort((a, b) => a.at - b.at);
  if (!notes.length) return { notes: 0, sent: 0 };
  // claim these notes first so a second run at the same moment does not send them again
  await put('amaya_meta/pushLast', notes[notes.length - 1].at);

  const tokens = Object.values((await get('amaya/tokens')) || {}).filter(x => x && x.t);
  const runners = (await get('amaya/runners')) || {};
  const muted = new Set(Object.values(runners).filter(r => r && r.notif === false).map(r => r.id));
  const pick = x => (x && typeof x === 'object') ? x : { ar: String(x || ''), en: String(x || '') };
  const dead = new Set();
  let sent = 0, failed = 0;
  const jobs = [];
  for (const n of notes) {
    const targets = tokens.filter(x => (n.to === 'all' || x.o === n.to || (n.to === 'staff' && x.o === 'mgr')) && !(x.o !== 'mgr' && muted.has(x.o)));
    const ti = pick(n.title), bo = pick(n.body);
    const data = {
      title_ar: String(ti.ar || 'Amaya Heroes').slice(0, 120), title_en: String(ti.en || ti.ar || 'Amaya Heroes').slice(0, 120),
      body_ar: String(bo.ar || '').slice(0, 300), body_en: String(bo.en || bo.ar || '').slice(0, 300), kind: String(n.kind || 'info'),
    };
    for (const x of targets) jobs.push(fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: x.t, data, webpush: { headers: { Urgency: 'high', TTL: '3600' } } } }),
    }).then(async r => {
      if (r.ok) { sent++; return; }
      failed++;
      const j = await r.json().catch(() => ({}));
      if (/UNREGISTERED|NOT_FOUND/.test(JSON.stringify(j))) dead.add(x.t);
    }).catch(() => { failed++; }));
  }
  await Promise.all(jobs);
  await Promise.all([...dead].map(t => fetch(`${db}/amaya/tokens/${cleanKey(t)}.json${qs}`, { method: 'DELETE' })));
  return { notes: notes.length, sent, failed, removed: dead.size };
}

const cors = origin => {
  const ok = origin && ORIGINS.some(r => r.test(origin));
  return { 'access-control-allow-origin': ok ? origin : 'https://abdualdore-dev.github.io', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
};

export default {
  async fetch(req, env, ctx) {
    const h = cors(req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (url.pathname === '/kick' && req.method === 'POST') {
      try { const r = await sendNew(env); return Response.json({ ok: true, ...r }, { headers: h }); }
      catch (e) { return Response.json({ ok: false, error: String(e.message || e) }, { status: 500, headers: h }); }
    }
    if (url.pathname === '/' || url.pathname === '/health') return Response.json({ ok: true, service: 'amaya-push' }, { headers: h });
    return new Response('Not found', { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(sendNew(env).catch(() => {})); },
};
