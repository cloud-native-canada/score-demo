# Cloud Native Montreal — CNCF Score Demo (`dev/mtl`)

This repository demonstrates one platform-agnostic [`score.yaml`](score.yaml) deploying to local Docker Compose (`score-compose`) and Google Cloud Run (`score-cloudrun` + Terraform), plus Day-2 intent evolution.

Platform engineers govern [`score-compose.provisioners.yaml`](score-compose.provisioners.yaml), [`score-cloudrun.provisioners.yaml`](score-cloudrun.provisioners.yaml), and [`score-cloudrun.profiles.yaml`](score-cloudrun.profiles.yaml) centrally. Both targets expose the same five approved resource types (`environment`, `postgres`, `redis`, `s3`, `smtp`), and neither `compose.yaml` nor Terraform `.tf` files are committed upfront.

## Act 1: Generate `score.yaml` from the app (`score` skill)

[`score.yaml`](score.yaml) is pre-committed so visitors can inspect the contract immediately. To demonstrate creating it live from application code:

1. Remove [`score.yaml`](score.yaml) (`rm score.yaml`).
2. Inspect approved platform resource types and outputs:

```bash
score-compose init --no-sample --no-default-provisioners --project community --provisioners score-compose.provisioners.yaml
score-compose provisioners list

score-cloudrun init --no-sample --provisioners score-cloudrun.provisioners.yaml --profiles score-cloudrun.profiles.yaml
score-cloudrun provisioners list
```

3. Ask your coding agent (using [`.agents/skills/score/SKILL.md`](.agents/skills/score/SKILL.md)) to generate a portable `score.yaml` from [`Dockerfile`](Dockerfile), [`.env.example`](.env.example), [`server/index.js`](server/index.js), and the platform `*.provisioners.yaml` contracts without reading git history.
4. Continue into Acts 2 and 3 with zero edits to the generated file.

## Act 2: Run locally with `score-compose`

1. Copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET`:

```bash
cp .env.example .env
```

2. Generate `compose.yaml` fresh (gitignored, not tracked in Git) and start the stack:

```bash
score-compose init --no-sample --no-default-provisioners --project community --provisioners score-compose.provisioners.yaml
score-compose generate score.yaml --build app=. --publish 3000:web:3000
docker compose up -d --build --wait
docker compose run --rm --no-deps minio-init
docker compose run --rm web-app node server/bootstrap.js
```

3. Open the demo app at `http://localhost:3000` and Mailpit at `http://localhost:8025`.

## Act 3: Generate Cloud Run Terraform with `score-cloudrun`

Notice `infra/gcp/` starts empty and zero edits to [`score.yaml`](score.yaml) are needed for Google Cloud in `us-east4` (idle sandbox cost ~$8–$9/month).

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

terraform -chdir=infra/gcp init
terraform -chdir=infra/gcp validate
terraform -chdir=infra/gcp plan
```

See [`.agents/skills/score-cloudrun/SKILL.md`](.agents/skills/score-cloudrun/SKILL.md) for generic Cloud Run workflow guidance. Split-state production lookup templates are provided in [`score-cloudrun.lookup.provisioners.yaml`](score-cloudrun.lookup.provisioners.yaml).

## Act 4: Day-2 Evolution — Add a new `redis` intent to `score.yaml`

A developer adds a new dependency in [`score.yaml`](score.yaml) with zero infrastructure YAML:

1. Add `REDIS_*` variables under `containers.app.variables` and `cache` under `resources`:

```yaml
    variables:
      # ...existing variables...
      REDIS_HOST: ${resources.cache.host}
      REDIS_PORT: ${resources.cache.port}
      REDIS_PASSWORD: ${resources.cache.password}

resources:
  # ...existing resources...
  cache:
    type: redis
```

2. Regenerate both targets from the exact same `score.yaml`:

```bash
score-compose generate score.yaml --build app=. --publish 3000:web:3000
score-cloudrun generate score.yaml \
  --project-id "$GCP_PROJECT_ID" \
  --location us-east4 \
  --image "$IMAGE_URI" \
  -o infra/gcp/manifests.tf
```

- `score-compose` provisions a dedicated local Redis 7 container from `score-compose.provisioners.yaml`.
- `score-cloudrun` provisions `google_redis_instance.cache` (Memorystore on the VPC), enables `redis.googleapis.com`, stores `auth_string` in Secret Manager, and injects `REDIS_PASSWORD` into Cloud Run via `value_source.secret_key_ref`.
