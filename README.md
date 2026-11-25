# Cloud Native Montreal — CNCF Score Demo (`dev/mtl`)

This repository demonstrates one platform-agnostic [`score.yaml`](score.yaml) deploying to local Docker Compose (`score-compose`) and Google Cloud Run (`score-cloudrun` + Terraform), plus Day-2 intent evolution.

Platform engineers govern [`score-compose.provisioners.yaml`](score-compose.provisioners.yaml), [`score-cloudrun.provisioners.yaml`](score-cloudrun.provisioners.yaml), and [`score-cloudrun.profiles.yaml`](score-cloudrun.profiles.yaml) centrally. Both targets expose the same five approved resource types (`environment`, `postgres`, `redis`, `s3`, `smtp`), and neither `compose.yaml` nor Terraform `.tf` files are committed upfront.

## Clean-Slate Check Before Act 1

Confirm the repository has no committed `compose.yaml` and no Terraform `.tf` files before starting:

```bash
git status -s
ls -la compose.yaml infra/gcp/
```

`compose.yaml` is missing (`No such file or directory`), and `infra/gcp/` contains only `.gitkeep`.

## Act 1: Inspect Platform Catalog & Generate `score.yaml` (`score` skill)

[`score.yaml`](score.yaml) is pre-committed so visitors can inspect the contract immediately. To demonstrate creating it live from application code:

1. Remove [`score.yaml`](score.yaml) (`rm score.yaml`).
2. Initialize both Score target state folders **once** for the demo and list the approved platform catalog:

```bash
# Creates gitignored .score-compose/ and registers only the platform team's 5 local recipes (skips sample score.yaml and built-in defaults)
score-compose init --no-sample --no-default-provisioners --project community --provisioners score-compose.provisioners.yaml
score-compose provisioners list

# Creates gitignored .score-cloudrun/ and loads the platform team's Cloud Run Terraform provisioners and profile (skips sample score.yaml)
score-cloudrun init --no-sample --provisioners score-cloudrun.provisioners.yaml --profiles score-cloudrun.profiles.yaml
score-cloudrun provisioners list
```

Notice both commands expose the exact same five resource types (`environment`, `postgres`, `redis`, `s3`, `smtp`).

3. Ask your coding agent (using [`.agents/skills/score/SKILL.md`](.agents/skills/score/SKILL.md)) to generate a portable `score.yaml` from [`Dockerfile`](Dockerfile), [`.env.example`](.env.example), [`server/index.js`](server/index.js), and the `provisioners list` contracts without reading git history.
4. Continue into Acts 2 and 3 with zero edits to the generated file.

## Act 2: Run locally with `score-compose` skill

`.score-compose/` is already initialized from Act 1, so do not repeat `score-compose init`.

1. Copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET`:

```bash
cp .env.example .env
```

2. Ask your coding agent using [`.agents/skills/score-compose/SKILL.md`](.agents/skills/score-compose/SKILL.md):
   *"Use the `score-compose` skill to generate `compose.yaml` and run this app locally on port 3000."*

   Or run the deterministic CLI commands directly as fallback:

```bash
score-compose generate score.yaml --build app=. --publish 3000:web:3000
docker compose up -d --build --wait
docker compose run --rm --no-deps minio-init
docker compose run --rm web-app node server/bootstrap.js
```

3. Open the demo app at `http://localhost:3000` and Mailpit at `http://localhost:8025`.

## Act 3: Generate Cloud Run Terraform with `score-cloudrun`

`.score-cloudrun/` is already initialized from Act 1, so do not repeat `score-cloudrun init`.

1. Verify `score.yaml` has zero platform-specific edits and `infra/gcp/` still has zero `.tf` files:

```bash
git status -s
ls -la infra/gcp/
```

2. Run the deterministic `score-cloudrun` and Terraform commands for Google Cloud `us-east4` (idle sandbox cost ~$8–$9/month):

```bash
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

1. Either ask your coding agent (*"Use the `score` skill to add a `redis` cache resource (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) to `score.yaml`."*) or run this one-liner from the repo root:

```bash
node -e '
const fs = require("fs");
let y = fs.readFileSync("score.yaml", "utf8").trimEnd() + "\n";
y = y.replace(/^([ \t]+)(DATABASE_URL:.*)$/m, "$1$2\n$1REDIS_HOST: \"${resources.cache.host}\"\n$1REDIS_PORT: \"${resources.cache.port}\"\n$1REDIS_PASSWORD: \"${resources.cache.password}\"");
const m = y.match(/^([ \t]+)db:\s*$/m);
const ind = m ? m[1] : "  ";
y += `${ind}cache:\n${ind}  type: redis\n`;
fs.writeFileSync("score.yaml", y);
' && git diff score.yaml
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

## Cleanup & Reset Between Rehearsals

Stop local containers, remove generated files, and restore `score.yaml` (`rm score.yaml` afterward if priming for Act 1):

```bash
[ -f compose.yaml ] && docker compose down -v || true
rm -rf .env compose.yaml .score-compose .score-cloudrun
find infra/gcp -mindepth 1 -maxdepth 1 ! -name '.gitkeep' -exec rm -rf {} +
git checkout -- score.yaml
```
