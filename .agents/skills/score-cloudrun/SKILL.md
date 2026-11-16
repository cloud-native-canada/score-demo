---
name: score-cloudrun
description: Translate score.yaml into deterministic Cloud Run Terraform (infra/gcp/manifests.tf) using score-cloudrun and platform templates. Use when preparing or validating Google Cloud Run deployments without editing score.yaml.
---

# Deploy to Cloud Run (`score-cloudrun`)

Compile [`score.yaml`](../../score.yaml) into `infra/gcp/manifests.tf` with `score-cloudrun`.

## Core rules

- Keep `score.yaml` unchanged across local and cloud deploys.
- Never deploy Cloud Run with ad-hoc `gcloud run deploy --set-env-vars` commands.
- Apply Terraform before live demos so stage commands only inspect `infra/gcp/manifests.tf`.
- Store secrets in Secret Manager via `gcpsm:` outputs or `terraform.tfvars`.

## Generate manifests

1. Initialize `.score-cloudrun/` with our platform provisioners and profiles:

```bash
score-cloudrun init \
  --no-sample \
  --provisioners score-cloudrun.provisioners.yaml \
  --profiles score-cloudrun.profiles.yaml
```

2. Generate `infra/gcp/manifests.tf` for the target image URI:

```bash
score-cloudrun generate score.yaml \
  --project-id "$GCP_PROJECT_ID" \
  --location us-east4 \
  --image "$IMAGE_URI" \
  -o infra/gcp/manifests.tf
```

## Validate and apply

1. Run Terraform in `infra/gcp/`:

```bash
terraform -chdir=infra/gcp init
terraform -chdir=infra/gcp plan -var="app_image=$IMAGE_URI"
terraform -chdir=infra/gcp apply -var="app_image=$IMAGE_URI"
```

2. Run the database bootstrap job after deploying a new image:

```bash
gcloud run jobs execute community-db-bootstrap --region us-east4 --wait
```
