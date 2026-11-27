# AGENTS.md — CNCF Score Demo

Always-on repository rules for coding agents working in `score-demo`.

## Git & Pull Request Guardrails

- **Never commit or push directly to `main`.**
- Create a feature branch and open a Pull Request for every change in this repository.
- Ask the user before pushing a branch, opening a Pull Request, or posting comments.

## Generated Files & State Guardrails

- Keep `.env`, `compose.yaml`, `.score-compose/`, `.score-cloudrun/`, `infra/gcp/manifests.tf`, `.terraform/`, and `*.tfstate*` untracked and uncommitted.
- Keep `infra/gcp/.gitkeep` intact so `score-cloudrun generate -o infra/gcp/manifests.tf` works on a fresh clone.
- Never copy or recover a deleted `score.yaml` from git history when authoring from scratch.

## Voice & Developer Workflow Conventions (Acts 1, 2 & 4)

- **Speech-to-text tolerance:** Developer prompts may come from voice dictation (such as *"score file"*, *"score,yaml"*, *"score dot yaml"*, or *"score compose"*). Interpret intent naturally without asking the user to re-type file names.
- **Initialize & list platform catalog (Act 1a):** When `.score-compose/` or `.score-cloudrun/` is missing — or when asked to initialize Score or list provisioners — run in the repository root and keep both state folders on disk:
  - `score-compose init --no-sample --no-default-provisioners --project community --provisioners score-compose.provisioners.yaml` and `score-compose provisioners list`
  - `score-cloudrun init --no-sample --provisioners score-cloudrun.provisioners.yaml --profiles score-cloudrun.profiles.yaml` and `score-cloudrun provisioners list`
  - If the user only asked to initialize Score or list provisioners, display both tables and stop before creating `score.yaml`.
- **Workload contract (Act 1b):** Derive `score.yaml` from `Dockerfile`, `.env.example`, `server/index.js`, and active provisioners using `metadata.name: web`, container `app`, and service port `web` (`3000`). Bind `QUEUE_MODE`, `CRON_SECRET`, and `BETTER_AUTH_SECRET` from `resources.env` (`type: environment`). Validate with `-o - > /dev/null` against the existing `.score-compose/` and `.score-cloudrun/` folders without deleting them.
- **Run locally on port 3000 (Act 2):** Reuse `.score-compose/` (initialize first only if missing). If `.env` is missing or contains `replace-with-` placeholders, create `.env` from `.env.example` and replace each `replace-with-*` value with a fresh `openssl rand -hex 32` value without printing secrets. Then run `score-compose generate score.yaml --build app=. --publish 3000:web:3000`, `docker compose up -d --build --wait`, `docker compose run --rm --no-deps minio-init`, and `docker compose run --rm web-app node server/bootstrap.js`.
- **Day-2 Redis addition (Act 4):** When asked to add Redis, declare `cache: { type: redis }` under `resources`, wire `REDIS_HOST: "${resources.cache.host}"`, `REDIS_PORT: "${resources.cache.port}"`, and `REDIS_PASSWORD: "${resources.cache.password}"` under `containers.app.variables`, and show `git diff score.yaml`. When also asked to run or test Redis locally, run `score-compose generate score.yaml --build app=. --publish 3000:web:3000`, `grep -n -C 3 "redis" compose.yaml`, `docker compose up -d --wait`, and `docker compose exec redis redis-cli -a community ping`. Leave Cloud Run Terraform generation in Acts 3 and 4 to platform CLI commands unless explicitly requested.

## Agent Skills

- Initialize Score targets, inspect provisioners, and author portable `score.yaml`: [`score`](.agents/skills/score/SKILL.md)
- Compile and run local Docker Compose stacks: [`score-compose`](.agents/skills/score-compose/SKILL.md)
- Generate Google Cloud Run Terraform manifests: [`score-cloudrun`](.agents/skills/score-cloudrun/SKILL.md)
