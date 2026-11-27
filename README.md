# Cloud Native Montreal — CNCF Score Demo (`dev/mtl`)

This repository demonstrates one platform-agnostic [`score.yaml`](score.yaml) deploying to local Docker Compose (`score-compose`) and Google Cloud Run (`score-cloudrun` + Terraform), plus Day-2 intent evolution.

Platform engineers govern [`score-compose.provisioners.yaml`](score-compose.provisioners.yaml), [`score-cloudrun.provisioners.yaml`](score-cloudrun.provisioners.yaml), and [`score-cloudrun.profiles.yaml`](score-cloudrun.profiles.yaml) centrally. Both targets expose the same five approved resource types (`environment`, `postgres`, `redis`, `s3`, `smtp`), and neither `compose.yaml` nor Terraform `.tf` files are committed upfront.

## Clean-Slate Check Before Act 1

Run the `Cleanup & Reset Between Rehearsals` commands at the bottom if you previously ran a demo locally, then confirm the workspace starts empty:

```bash
git status -s
ls -la score.yaml compose.yaml infra/gcp/
```

`score.yaml` and `compose.yaml` are absent (`No such file or directory`), and `infra/gcp/` contains only `.gitkeep`.

## Act 1: Inspect Platform Catalog & Generate `score.yaml` (`score` skill)

1. **Voice / `agy` CLI prompt (or deterministic CLI below)** — initialize both Score target state folders **once** and list the approved platform catalog:

   > *"Initialize Score and list the platform provisioners."*

```bash
# Creates gitignored .score-compose/ and registers only the platform team's 5 local recipes (skips sample score.yaml and built-in defaults)
score-compose init --no-sample --no-default-provisioners --project community --provisioners score-compose.provisioners.yaml
score-compose provisioners list

# Creates gitignored .score-cloudrun/ and loads the platform team's Cloud Run Terraform provisioners and profile (skips sample score.yaml)
score-cloudrun init --no-sample --provisioners score-cloudrun.provisioners.yaml --profiles score-cloudrun.profiles.yaml
score-cloudrun provisioners list
```

Notice both commands expose the exact same five resource types (`environment`, `postgres`, `redis`, `s3`, `smtp`).

2. **Voice / `agy` CLI prompt** — generate `score.yaml` from application context:

   > *"Create the Score file for this app."*

   *(Or detailed prompt: "Create a portable `score.yaml` for this app based on the `Dockerfile`, `.env.example`, `server/index.js`, and the available provisioners so I can run it locally with Docker Compose and deploy it to Cloud Run.")*

3. Continue into Acts 2 and 3 with zero edits to the generated file.

## Act 2: Run locally with `score-compose`

`.score-compose/` is already initialized from Act 1, so do not repeat `score-compose init`.

1. **Voice / `agy` CLI prompt** (creates `.env` with generated hex secrets from `.env.example`, compiles `compose.yaml`, boots containers, initializes MinIO, and bootstraps Postgres):

   > *"Run this app locally on port 3000."*

   Or run the deterministic CLI commands directly as fallback:

```bash
cp .env.example .env
SECRET=$(openssl rand -hex 32)
node -e 'const fs=require("fs"); fs.writeFileSync(".env", fs.readFileSync(".env","utf8").replace("replace-with-32-char-random-secret", process.argv[1]))' "$SECRET"

score-compose generate score.yaml --build app=. --publish 3000:web:3000
docker compose up -d --build --wait
docker compose run --rm --no-deps minio-init
docker compose run --rm web-app node server/bootstrap.js
```

2. Open the demo app at `http://localhost:3000` and Mailpit at `http://localhost:8025`.

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

A developer adds a new dependency in [`score.yaml`](score.yaml) with zero infrastructure YAML.

### 1. Update `score.yaml` & Test Locally (Voice / `agy` CLI, Manual Editor, or CLI)

- **Voice / `agy` CLI prompt (updates `score.yaml`, regenerates Compose, boots Redis 7, and verifies `PONG`):**

  > *"Add a Redis cache to this app and test it locally."*

  *(Or two-step voice prompts: "Add a Redis cache to this app" -> review `git diff score.yaml` -> "Now test Redis locally".)*

- **Manual edit (`vim score.yaml` or editor):** Add `REDIS_*` variables under `containers.app.variables` and `cache` under `resources`:

```yaml
containers:
  app:
    variables:
      # ...existing variables...
      REDIS_HOST: "${resources.cache.host}"
      REDIS_PORT: "${resources.cache.port}"
      REDIS_PASSWORD: "${resources.cache.password}"

resources:
  # ...existing resources...
  cache:
    type: redis
```

- **Copy-paste CLI one-liner:**

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

### 2. Demonstrate Local Compose (`score-compose`)

```bash
score-compose generate score.yaml --build app=. --publish 3000:web:3000
grep -n -C 3 "redis" compose.yaml
docker compose up -d --wait
docker compose exec redis redis-cli -a community ping
# Expected output: PONG
```

`score-compose` provisions a dedicated local Redis 7 container from [`score-compose.provisioners.yaml`](score-compose.provisioners.yaml).

### 3. Demonstrate Google Cloud Run Terraform (`score-cloudrun`)

```bash
score-cloudrun generate score.yaml \
  --project-id "$GCP_PROJECT_ID" \
  --location us-east4 \
  --image "$IMAGE_URI" \
  -o infra/gcp/manifests.tf

grep -n -C 3 'google_redis_instance\|redis.googleapis.com\|REDIS_PASSWORD' infra/gcp/manifests.tf
terraform -chdir=infra/gcp validate
terraform -chdir=infra/gcp plan
```

`score-cloudrun` enables `redis.googleapis.com`, provisions `google_redis_instance.cache` on the VPC, stores `auth_string` in Secret Manager, and injects `REDIS_PASSWORD` into Cloud Run via `value_source.secret_key_ref`.

## Cleanup & Reset Between Rehearsals

Stop local containers and remove `score.yaml` plus generated files so Act 1 starts clean:

```bash
[ -f compose.yaml ] && docker compose down -v || true
rm -rf .env compose.yaml score.yaml .score-compose .score-cloudrun
find infra/gcp -mindepth 1 -maxdepth 1 ! -name '.gitkeep' -exec rm -rf {} +
```

Run `git checkout -- score.yaml` to restore the reference `score.yaml` after the demo.
