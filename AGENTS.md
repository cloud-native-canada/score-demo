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

## Agent Skills

- Author, edit, and validate portable `score.yaml`: [`score`](.agents/skills/score/SKILL.md)
- Compile and run local Docker Compose stacks: [`score-compose`](.agents/skills/score-compose/SKILL.md)
- Generate Google Cloud Run Terraform manifests: [`score-cloudrun`](.agents/skills/score-cloudrun/SKILL.md)
