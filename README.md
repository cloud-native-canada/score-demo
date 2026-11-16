# Cloud Native Montreal — CNCF Score Demo (`dev/mtl`)

This repository demonstrates one platform-agnostic [`score.yaml`](score.yaml) deploying to local Docker Compose (`score-compose`) and Google Cloud Run (`score-cloudrun` + Terraform).

## Act 1: Run locally with `score-compose`

1. Copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET`:

```bash
cp .env.example .env
```

2. Generate `compose.yaml` from `score.yaml` and start the stack:

```bash
score-compose init --no-sample --project community --provisioners score-compose.provisioners.yaml
score-compose generate score.yaml --build app=. --publish 3000:web:3000
docker compose up -d --build --wait
docker compose run --rm --no-deps minio-init
docker compose run --rm web-app node server/bootstrap.js
```

3. Open the demo app at `http://localhost:3000` and Mailpit at `http://localhost:8025`.

## Act 2: Generate Cloud Run Terraform with `score-cloudrun`

Notice zero edits to [`score.yaml`](score.yaml) are needed for Google Cloud in `us-east4` (idle sandbox cost `~\$8`–`\$9`/month).

```bash
score-cloudrun init \
  --no-sample \
  --provisioners score-cloudrun.provisioners.yaml \
  --profiles score-cloudrun.profiles.yaml

score-cloudrun generate score.yaml \
  --project-id "$GCP_PROJECT_ID" \
  --location us-east4 \
  --image "$IMAGE_URI" \
  -o infra/gcp/manifests.tf
```

See [`.agents/skills/score-cloudrun/SKILL.md`](.agents/skills/score-cloudrun/SKILL.md) for Terraform apply and Cloud Run Job bootstrap commands.
