// Sends Firebase Cloud Messaging notifications for new app notes.
// Runs on GitHub Actions every few minutes. Needs repository secrets:
//   FIREBASE_SERVICE_ACCOUNT  (full JSON of the service account key)
//   FIREBASE_DB_URL           (Realtime Database URL)
const crypto = require('crypto');

const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const cleanKey = v => String(v).replace(/[.$#\[\]\/\s]/g, '_');
const MAX_AGE_MS = 60 * 60 * 1000; // ignore notes older than one hour

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + b64u(sig),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  const db = (process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
  if (!sa.private_key || !db) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DB_URL secret');
  const tok = await accessToken(sa);
  const qs = `?access_token=${encodeURIComponent(tok)}`;
  const get = async p => (await fetch(`${db}/${p}.json${qs}`)).json();
  const put = (p, v) => fetch(`${db}/${p}.json${qs}`, { method: 'PUT', body: JSON.stringify(v) });

  const now = Date.now();
  const last = Number(await get('amaya_meta/pushLast')) || now - 10 * 60 * 1000;
  const notes = Object.values((await get('amaya/notes')) || {})
    .filter(n => n && n.at > last && n.at > now - MAX_AGE_MS)
    .sort((a, b) => a.at - b.at);
  if (!notes.length) { console.log('No new notes'); return; }

  const tokens = Object.values((await get('amaya/tokens')) || {}).filter(x => x && x.t);
  const runners = (await get('amaya/runners')) || {};
  const muted = new Set(Object.values(runners).filter(r => r && r.notif === false).map(r => r.id));
  const pick = x => (x && typeof x === 'object') ? x : { ar: String(x || ''), en: String(x || '') };
  const dead = new Set();
  let sent = 0, failed = 0;

  for (const n of notes) {
    const targets = tokens.filter(x => !dead.has(x.t) &&
      (n.to === 'all' || x.o === n.to || (n.to === 'staff' && x.o === 'mgr')) &&
      !(x.o !== 'mgr' && muted.has(x.o)));
    const ti = pick(n.title), bo = pick(n.body);
    const data = {
      title_ar: String(ti.ar || 'Amaya Heroes').slice(0, 120),
      title_en: String(ti.en || ti.ar || 'Amaya Heroes').slice(0, 120),
      body_ar: String(bo.ar || '').slice(0, 300),
      body_en: String(bo.en || bo.ar || '').slice(0, 300),
      kind: String(n.kind || 'info'),
    };
    for (const x of targets) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { token: x.t, data, webpush: { headers: { Urgency: 'high' } } } }),
      });
      if (r.ok) { sent++; continue; }
      failed++;
      const j = await r.json().catch(() => ({}));
      if (/UNREGISTERED|NOT_FOUND/.test(JSON.stringify(j))) dead.add(x.t);
    }
  }
  for (const t of dead) await fetch(`${db}/amaya/tokens/${cleanKey(t)}.json${qs}`, { method: 'DELETE' });
  await put('amaya_meta/pushLast', notes[notes.length - 1].at);
  console.log(`Notes: ${notes.length}, sent: ${sent}, failed: ${failed}, removed devices: ${dead.size}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
