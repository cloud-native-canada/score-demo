import process from 'node:process';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
	console.error('[bootstrap] DATABASE_URL is required.');
	process.exit(1);
}

function buildBannerSvg(updatedLabel) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" width="1200" height="420">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="55%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="420" rx="20" fill="url(#bg)"/>
  <circle cx="1050" cy="95" r="140" fill="#38bdf8" fill-opacity="0.16"/>
  <circle cx="130" cy="360" r="170" fill="#818cf8" fill-opacity="0.14"/>
  <text x="64" y="108" fill="#38bdf8" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" letter-spacing="2">CLOUD NATIVE MONTREAL</text>
  <text x="64" y="182" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="800">score.dev — Let's Meet in the Middle</text>
  <text x="64" y="242" fill="#cbd5e1" font-family="system-ui, -apple-system, sans-serif" font-size="26">One score.yaml across Docker Compose and Google Cloud Run</text>
  <rect x="64" y="294" width="380" height="54" rx="10" fill="#0f172a" fill-opacity="0.72" stroke="#38bdf8" stroke-opacity="0.45"/>
  <text x="86" y="328" fill="#e0f2fe" font-family="monospace" font-size="18">Updated: ${updatedLabel}</text>
</svg>`;
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS demo_events (
			slug TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			venue TEXT NOT NULL,
			starts_at TEXT NOT NULL,
			summary TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS demo_rsvps (
			id BIGSERIAL PRIMARY KEY,
			event_slug TEXT NOT NULL REFERENCES demo_events(slug) ON DELETE CASCADE,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			ticket_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);
	`);
	await pool.query(
		`INSERT INTO demo_events (slug, title, venue, starts_at, summary)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, venue = EXCLUDED.venue, starts_at = EXCLUDED.starts_at, summary = EXCLUDED.summary`,
		[
			'cloud-native-montreal-devmtl',
			'Cloud Native Montreal — dev/mtl Special Edition',
			'Palais des congres, Montreal',
			'Nov 26, 2026 · 6:00 PM EST',
			'Live walkthrough of CNCF Score: score-compose locally and score-cloudrun + Terraform on Google Cloud.'
		]
	);
	console.log('[bootstrap] Seeded demo_events and ensured demo_rsvps schema.');
} finally {
	await pool.end();
}

const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
	const s3 = new S3Client({
		endpoint: S3_ENDPOINT,
		region: S3_REGION || 'us-east-1',
		forcePathStyle: true,
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
		credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
	});
	await s3.send(
		new PutObjectCommand({
			Bucket: S3_BUCKET,
			Key: 'public/devmtl-banner.svg',
			Body: buildBannerSvg(new Date().toISOString().slice(0, 19) + 'Z'),
			ContentType: 'image/svg+xml',
			CacheControl: 'no-store'
		})
	);
	console.log('[bootstrap] Uploaded public/devmtl-banner.svg to object storage.');
}
