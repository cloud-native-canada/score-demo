---
name: score-compose
description: Translate score.yaml into compose.yaml using score-compose and start local Postgres, MinIO, and Mailpit containers. Use when running or testing the Score workload locally.
---

# Develop locally (`score-compose`)

Compile [`score.yaml`](../../score.yaml) into [`compose.yaml`](../../compose.yaml) with `score-compose`.

## Core rules

- Keep `score.yaml` free of local-only hostnames or credentials.
- Copy `.env.example` to `.env` before running containers.
- Regenerate `compose.yaml` after changing `score.yaml` or `score-compose.provisioners.yaml`.

## Generate and start

1. Initialize `.score-compose/` and generate `compose.yaml`:

```bash
score-compose init --no-sample --project community --provisioners score-compose.provisioners.yaml
score-compose generate score.yaml --build app=. --publish 3000:web:3000
```

2. Copy `.env.example` to `.env`, set `BETTER_AUTH_SECRET`, and start backing services:

```bash
cp .env.example .env
docker compose up -d --wait postgres minio mailpit
docker compose run --rm --no-deps minio-init
```

3. Run the database and object-storage bootstrap script, then start the app:

```bash
docker compose run --rm web-app node server/bootstrap.js
docker compose up -d --build web-app
```
