import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import process from 'node:process';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import nodemailer from 'nodemailer';
import pg from 'pg';

const port = Number(process.env.PORT || 3000);
const queueMode = process.env.QUEUE_MODE || 'worker';
const BANNER_KEY = 'public/devmtl-banner.svg';

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
pool?.on('error', (err) => console.error('[db]', err.message));

function getS3Client() {
	const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
	if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
	return new S3Client({
		endpoint: S3_ENDPOINT,
		region: S3_REGION || 'us-east-1',
		forcePathStyle: true,
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
		credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
	});
}

function escapeHtml(value) {
	return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function maskEmail(email) {
	const [user, domain] = String(email).split('@');
	if (!domain) return '***';
	return `${user.slice(0, 2)}***@${domain}`;
}

function buildBannerSvg(label) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" width="1200" height="420">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f172a"/><stop offset="60%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0ea5e9"/></linearGradient></defs>
  <rect width="1200" height="420" rx="20" fill="url(#bg)"/>
  <circle cx="1040" cy="95" r="140" fill="#38bdf8" fill-opacity="0.18"/>
  <text x="64" y="108" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="22" font-weight="700" letter-spacing="2">CLOUD NATIVE MONTREAL</text>
  <text x="64" y="184" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="52" font-weight="800">score.dev — Meet in the Middle</text>
  <text x="64" y="244" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="25">Same score.yaml locally (score-compose) and on Cloud Run (score-cloudrun)</text>
  <rect x="64" y="294" width="430" height="52" rx="10" fill="#0f172a" fill-opacity="0.72" stroke="#38bdf8" stroke-opacity="0.45"/>
  <text x="84" y="327" fill="#e0f2fe" font-family="monospace" font-size="18">${escapeHtml(label)}</text>
</svg>`;
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > 65_536) reject(new Error('Payload too large'));
			else chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

async function ensureSchema() {
	if (!pool) return { connected: false, event: null, rsvps: [] };
	try {
		await pool.query(`
			CREATE TABLE IF NOT EXISTS demo_events (slug TEXT PRIMARY KEY, title TEXT NOT NULL, venue TEXT NOT NULL, starts_at TEXT NOT NULL, summary TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS demo_rsvps (id BIGSERIAL PRIMARY KEY, event_slug TEXT NOT NULL REFERENCES demo_events(slug) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT NOT NULL, ticket_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
		`);
		await pool.query(
			`INSERT INTO demo_events (slug, title, venue, starts_at, summary) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO NOTHING`,
			[
				'cloud-native-montreal-devmtl',
				'Cloud Native Montreal — dev/mtl Special Edition',
				'Palais des congres, Montreal',
				'Nov 26, 2026 · 6:00 PM EST',
				'Live walkthrough of CNCF Score: score-compose locally and score-cloudrun + Terraform on Google Cloud.'
			]
		);
		const eventRes = await pool.query(`SELECT slug, title, venue, starts_at, summary FROM demo_events WHERE slug = 'cloud-native-montreal-devmtl'`);
		const rsvpRes = await pool.query(`SELECT name, email, ticket_hash, created_at FROM demo_rsvps ORDER BY id DESC LIMIT 12`);
		return { connected: true, event: eventRes.rows[0], rsvps: rsvpRes.rows };
	} catch (err) {
		console.error('[db]', err.message);
		return { connected: false, event: null, rsvps: [] };
	}
}

async function checkStorage() {
	const client = getS3Client();
	const bucket = process.env.S3_BUCKET;
	const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
	if (!client || !bucket) return { connected: false, bannerUrl: null };
	try {
		await client.send(new HeadObjectCommand({ Bucket: bucket, Key: BANNER_KEY }));
		return { connected: true, bannerUrl: `${base}/${BANNER_KEY}?t=${Date.now()}` };
	} catch {
		try {
			await client.send(new PutObjectCommand({ Bucket: bucket, Key: BANNER_KEY, Body: buildBannerSvg(`Initialized: ${new Date().toISOString().slice(0, 19)}Z`), ContentType: 'image/svg+xml', CacheControl: 'no-store' }));
			return { connected: true, bannerUrl: `${base}/${BANNER_KEY}?t=${Date.now()}` };
		} catch (err) {
			console.error('[s3]', err.message);
			return { connected: false, bannerUrl: null };
		}
	}
}

async function sendConfirmationEmail(to, name, ticket) {
	const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = process.env;
	if (!SMTP_HOST || !SMTP_PORT || !EMAIL_FROM) throw new Error('SMTP environment variables are incomplete.');
	const portNum = Number(SMTP_PORT);
	const transport = nodemailer.createTransport({
		host: SMTP_HOST,
		port: portNum,
		secure: portNum === 465,
		auth: SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
	});
	await transport.sendMail({
		from: EMAIL_FROM,
		to,
		subject: `RSVP Confirmed: Cloud Native Montreal (${ticket})`,
		text: `Bonjour ${name}! Your seat for Cloud Native Montreal (dev/mtl edition) is confirmed. Ticket code: ${ticket}`
	});
}

function sendJson(res, status, data) {
	res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
	res.end(JSON.stringify(data));
}

function renderPage({ host, notice, dbState, storageState }) {
	const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
	const secretConfigured = Boolean(process.env.BETTER_AUTH_SECRET);
	const badge = (ok, label) => `<span class="badge ${ok ? 'ok' : 'warn'}">${escapeHtml(label)}: ${ok ? 'Connected' : 'Pending'}</span>`;
	const event = dbState.event ?? {
		title: 'Cloud Native Montreal — dev/mtl Special Edition',
		venue: 'Palais des congres, Montreal',
		starts_at: 'Nov 26, 2026 · 6:00 PM EST',
		summary: 'Same score.yaml running locally with score-compose and on GCP Cloud Run with score-cloudrun.'
	};
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(event.title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; padding: 24px; line-height: 1.5; }
  .wrap { max-width: 960px; margin: 0 auto; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .badge { font-size: 13px; padding: 4px 10px; border-radius: 999px; font-weight: 600; border: 1px solid #334155; background: #1e293b; }
  .ok { border-color: #10b981; color: #6ee7b7; }
  .warn { border-color: #f59e0b; color: #fcd34d; }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 20px; margin-bottom: 18px; }
  .banner { width: 100%; border-radius: 10px; display: block; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #f8fafc; margin: 6px 0 12px; }
  button { background: #0ea5e9; color: #082f49; border: 0; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
  .notice { padding: 12px 14px; border-radius: 10px; background: #082f49; border: 1px solid #38bdf8; margin-bottom: 16px; }
  ul { padding-left: 18px; margin: 8px 0 0; }
  code { background: #1e293b; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <span class="badge">Host: ${escapeHtml(host)}</span>
    ${badge(dbState.connected, 'Postgres (resources.db)')}
    ${badge(storageState.connected, 'S3 / GCS (resources.storage)')}
    ${badge(smtpConfigured, 'SMTP (resources.mail)')}
    ${badge(secretConfigured, `Queue: ${queueMode}`)}
  </div>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <div class="card">
    ${storageState.bannerUrl ? `<img class="banner" src="${escapeHtml(storageState.bannerUrl)}" alt="Event banner served from S3 or GCS">` : ''}
    <h1>${escapeHtml(event.title)}</h1>
    <p><strong>${escapeHtml(event.starts_at)}</strong> · ${escapeHtml(event.venue)}</p>
    <p>${escapeHtml(event.summary)}</p>
    <form method="post" action="/banner"><button type="submit">Refresh Banner in S3 / GCS</button></form>
  </div>
  <div class="grid">
    <div class="card">
      <h2>RSVP &amp; Test SMTP</h2>
      <form method="post" action="/rsvp">
        <label>Name<input name="name" required placeholder="Alex Rivera"></label>
        <label>Email<input name="email" type="email" required placeholder="alex@example.org"></label>
        <button type="submit">RSVP &amp; Send Confirmation Email</button>
      </form>
    </div>
    <div class="card">
      <h2>Recent RSVPs (Postgres)</h2>
      ${dbState.rsvps.length ? `<ul>${dbState.rsvps.map((r) => `<li>${escapeHtml(r.name)} (${escapeHtml(maskEmail(r.email))}) — <code>${escapeHtml(r.ticket_hash)}</code></li>`).join('')}</ul>` : '<p>No RSVPs recorded yet.</p>'}
    </div>
  </div>
</div>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

	if (url.pathname === '/healthz') {
		return sendJson(res, 200, { ok: true, queueMode });
	}

	if (url.pathname === '/api/cron/run-due-jobs' && req.method === 'POST') {
		const secret = (process.env.CRON_SECRET || '').trim();
		if (secret.length < 16) return sendJson(res, 503, { ok: false, error: 'Cron secret not configured' });
		const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
		if (!match) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
		const actual = createHash('sha256').update(match[1]).digest();
		const expected = createHash('sha256').update(secret).digest();
		if (!timingSafeEqual(actual, expected)) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
		return sendJson(res, 200, { ok: true, completed: 0, failed: 0, deadlettered: 0, oldestDueSeconds: 0 });
	}

	if (url.pathname === '/banner' && req.method === 'POST') {
		try {
			const client = getS3Client();
			if (!client || !process.env.S3_BUCKET) throw new Error('Object storage not configured');
			await client.send(
				new PutObjectCommand({
					Bucket: process.env.S3_BUCKET,
					Key: BANNER_KEY,
					Body: buildBannerSvg(`S3 Write: ${new Date().toISOString().slice(0, 19)}Z`),
					ContentType: 'image/svg+xml',
					CacheControl: 'no-store'
				})
			);
			res.writeHead(303, { location: '/?notice=Banner+updated+in+S3+object+storage' });
			return res.end();
		} catch (err) {
			res.writeHead(303, { location: `/?notice=${encodeURIComponent(err.message)}` });
			return res.end();
		}
	}

	if (url.pathname === '/rsvp' && req.method === 'POST') {
		try {
			if (!pool) throw new Error('DATABASE_URL is not configured');
			const form = new URLSearchParams(await readBody(req));
			const name = (form.get('name') || '').trim();
			const email = (form.get('email') || '').trim().toLowerCase();
			if (!name || !email.includes('@')) throw new Error('Valid name and email are required.');
			const ticket = createHmac('sha256', process.env.BETTER_AUTH_SECRET || 'demo-secret')
				.update(`${email}:${Date.now()}`)
				.digest('hex')
				.slice(0, 8)
				.toUpperCase();
			await pool.query(
				`INSERT INTO demo_rsvps (event_slug, name, email, ticket_hash) VALUES ('cloud-native-montreal-devmtl', $1, $2, $3)`,
				[name, email, ticket]
			);
			await sendConfirmationEmail(email, name, ticket);
			res.writeHead(303, { location: `/?notice=${encodeURIComponent(`RSVP saved in Postgres and email sent (${ticket})`)}` });
			return res.end();
		} catch (err) {
			res.writeHead(303, { location: `/?notice=${encodeURIComponent(err.message)}` });
			return res.end();
		}
	}

	const [dbState, storageState] = await Promise.all([ensureSchema(), checkStorage()]);
	res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
	res.end(
		renderPage({
			host: req.headers.host || 'localhost:3000',
			notice: url.searchParams.get('notice'),
			dbState,
			storageState
		})
	);
});

server.listen(port, '0.0.0.0', () => {
	console.log(`[score-demo] Listening on http://0.0.0.0:${port}`);
});
