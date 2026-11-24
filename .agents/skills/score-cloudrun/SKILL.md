---
name: score-cloudrun
description: Compile score.yaml into deterministic Google Cloud Run Terraform (manifests.tf) or Config Connector (KCC) manifests with score-cloudrun using platform-provided provisioners and profiles. Use when generating or validating Cloud Run deployments, inspecting available Cloud Run resource types, or applying Score overrides. Do not use to author score.yaml from scratch (use score) or to run local Docker Compose stacks (use score-compose or local-dev).
---

# Deploy to Cloud Run with `score-cloudrun`

`score-cloudrun` compiles portable `score.yaml` workloads into deterministic Terraform HCL (default) or Config Connector (KCC) YAML for Google Cloud Run. Treat this skill as an advisory starting point. Platform engineers maintain governed `*.provisioners.yaml` and `*.profiles.yaml` templates centrally. Developers consume those templates with `init`, `provisioners list`, and `generate` rather than authoring Terraform or custom provisioners in daily work.

## Core rules

- Keep `score.yaml` unchanged across local Compose and Cloud Run deployments.
- Never deploy with ad-hoc `gcloud run deploy --set-env-vars` commands. Generate declarative manifests through `score-cloudrun`.
- Store secrets in Secret Manager and bind them via `value_source.secret_key_ref`, never plaintext `env.value` in Cloud Run revisions.
- Never embed `/cloudsql/` Unix sockets in `score.yaml`. Use Direct VPC Egress with Private IP `host:port`.

## Step 1: Discover repository context first

Inspect `docs/`, `AGENTS.md`, `infra/`, `.gitignore`, `*.provisioners.yaml` (including split-state `*.lookup.provisioners.yaml`), and `*.profiles.yaml` before running commands:

1. Reuse the repository's documented output path (often a gitignored `manifests.tf` inside an existing Terraform root), target region, provisioners, and profiles.
2. Check if the repository documents a split-state lookup provisioner file for production versus a sandbox provisioner file for demos.
3. Check for a post-deploy migration or bootstrap Cloud Run Job documented in `docs/` or `infra/`.

## Prerequisites

- `score-cloudrun` on `PATH` (`score-cloudrun --version`). Install from [score-spec/score-cloudrun](https://github.com/score-spec/score-cloudrun).
- `terraform` (`terraform version`) for Terraform output, or `kubectl` for KCC output.

Ask before installing tools globally.

## Core CLI workflow

`score-cloudrun init` creates gitignored `.score-cloudrun/`, writes the built-in `default-terraform.profiles.yaml` (unless overridden or `--no-default-profile` is passed), and installs **zero** default resource provisioners. Every resource declared in `score.yaml` needs a matching provisioner loaded via `--provisioners`:

```bash
score-cloudrun init \
  --no-sample \
  --provisioners <path-or-url-to.provisioners.yaml> \
  --profiles <path-or-url-to.profiles.yaml>
```

Inspect active state before generating:

```bash
score-cloudrun profiles list --format table
score-cloudrun provisioners list --format table
```

Generate Terraform (default `--output-format terraform`):

```bash
score-cloudrun generate score.yaml \
  --project-id "$GCP_PROJECT_ID" \
  --location "$GCP_REGION" \
  --image "$IMAGE_URI" \
  -o infra/gcp/manifests.tf
```

Validate the generated Terraform (and apply only when requested):

```bash
terraform -chdir=infra/gcp init
terraform -chdir=infra/gcp validate
terraform -chdir=infra/gcp plan
```

## Common tasks

### Target Cloud Run Jobs or source-based Functions

- **Cloud Run Job:** Set `metadata.annotations["cloudrun.score.dev/workload-profile"]: job` in `score.yaml` (or via `--overrides-file`) and load a `job` profile.
- **Source build (`--source`):** Pass `--source ./app` and set `metadata.annotations["cloudrun.score.dev/base-image"]` (required) plus optional `cloudrun.score.dev/function-name`.

### Generate Config Connector (KCC) manifests

Load `format: kcc` profiles and provisioners, then pass `--output-format kcc`:

```bash
score-cloudrun generate score.yaml \
  --output-format kcc \
  --project-id "$GCP_PROJECT_ID" \
  --location "$GCP_REGION" \
  --image "$IMAGE_URI" \
  -o manifests.yaml
```

### Apply overrides safely

```bash
score-cloudrun generate score.yaml \
  --project-id "$GCP_PROJECT_ID" \
  --location "$GCP_REGION" \
  --image "$IMAGE_URI" \
  --overrides-file prod.score.yaml \
  --override-property 'metadata.annotations.cloudrun\.score\.dev/workload-profile="job"'
```

`--image`, `--overrides-file`, and `--override-property` require **exactly one** Score file argument on `generate`.

## Unsupported Score fields

- Cloud Run Services do not support `readinessProbe` or `containers.*.resources.requests`.
- The built-in default profile skips `PORT` in `env` (Cloud Run reserves `PORT` and sets it from `service.ports.*.targetPort`) and does not render `files`, `volumes`, or `before`.

## Reference files

- [references/provisioners-and-profiles.md](references/provisioners-and-profiles.md) — Platform engineering reference: verified Go template contracts, Secret Manager `gcpsm:`, split-state lookup, Direct VPC, keyless GCS Workload Identity, and Cloud Run Jobs.
- [references/troubleshooting.md](references/troubleshooting.md) — Common CLI errors, `PORT` rejections, IAM/Secret Manager race fixes, and state resets.
