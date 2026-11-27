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

## Repository Conventions & Skill Routing

- **Speech-to-text tolerance:** Developer prompts may come from voice dictation (such as *"score file"*, *"score,yaml"*, *"score dot yaml"*, or *"score compose"*). Interpret intent naturally without asking the user to re-type file names.
- **Always load the matching skill first:** Before running any Score, Compose, or Cloud Run command, read and follow the corresponding `SKILL.md` below.
- **Repository constants for the skills:**
  - `score-compose` project name: `community` (using `score-compose.provisioners.yaml` with `--no-default-provisioners`).
  - `score-cloudrun` catalog: `score-cloudrun.provisioners.yaml` and `score-cloudrun.profiles.yaml` (default location `us-east4`).
  - Workload identity: `metadata.name: web`, container `app`, service port `web` (`3000`).
  - Environment bindings: bind `QUEUE_MODE`, `CRON_SECRET`, and `BETTER_AUTH_SECRET` from `resources.env` (`type: environment`).
  - Local post-up bootstrap: run `docker compose run --rm --no-deps minio-init` and `docker compose run --rm web-app node server/bootstrap.js`.
  - Day-2 Redis resource: `cache: { type: redis }` wired to `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` (tested locally with `redis-cli -a community ping`).

## Agent Skills

- Initialize Score targets, inspect provisioners, and author portable `score.yaml`: [`score`](.agents/skills/score/SKILL.md)
- Compile and run local Docker Compose stacks: [`score-compose`](.agents/skills/score-compose/SKILL.md)
- Generate Google Cloud Run Terraform manifests: [`score-cloudrun`](.agents/skills/score-cloudrun/SKILL.md)
