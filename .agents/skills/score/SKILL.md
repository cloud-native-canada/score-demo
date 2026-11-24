---
name: score
description: Author, edit, migrate, and validate platform-agnostic CNCF Score workload files (score.yaml, score.dev/v1b1). Use when creating a score.yaml from an existing application or Dockerfile, migrating from docker-compose.yaml, adding backing resources or secrets, or checking portability across score-compose and score-cloudrun. Do not use for running Docker Compose or Terraform directly (use score-compose or score-cloudrun for target execution).
---

# Author portable Score workloads (`score.yaml`)

Write one platform-agnostic `score.yaml` (`score.dev/v1b1`) that compiles cleanly with both `score-compose` and `score-cloudrun`. Treat this skill as an advisory starting point and adapt conventions to your repository's platform contracts.

## Core rules

- Keep `score.yaml` free of cloud vendor names, static secrets, localhost URLs, and platform-specific endpoints.
- When creating `score.yaml` from scratch, derive it from application code, `Dockerfile`, env templates, and active provisioners. Never copy or recover a deleted `score.yaml` from `git status`, `git diff`, or `git log` unless asked.
- Use `image: .` when the repository builds its own container image from a `Dockerfile`.
- Express every backing dependency under `resources:` and wire it into `containers.<name>.variables` with `${resources.<name>.<output>}`.
- Pass runtime secrets through a `type: environment` resource, never as literal values in `score.yaml`.
- Use canonical `score.dev/v1b1` map syntax for `files:` and `volumes:` (never the deprecated array syntax with `target:`).
- Keep all `variables` values as YAML strings (quote numbers and booleans like `PORT: "3000"`).

## Discover repository context first

Inspect the repository before drafting or editing `score.yaml`:

1. Read `Dockerfile`, `.env.example`, and application config code to list every required env var, port, health route, and backing service.
2. Inspect `README.md`, `Makefile`, `package.json`, `docs/`, and `AGENTS.md` to reuse any expected workload name (`metadata.name`), container name (`containers.<name>`), or port key (`service.ports.<name>`). When creating `score.yaml` from scratch, do not copy deleted `score.yaml` files or previously generated `compose.yaml` or `manifests.tf` files.
3. Run `score-compose provisioners list` and `score-cloudrun provisioners list` (or read `*.provisioners.yaml` and `*.profiles.yaml`) to see which resource types and output keys the platform team publishes. Map each app variable to exact `outputs` keys across all target provisioners (including custom keys like `public_endpoint`, `public_base_url`, `from`, and custom `environment` outputs) instead of copying `.env.example` literals.

## Workflow 1: Create `score.yaml` from an existing app

1. **Name the workload.** Reuse the expected name from `infra/` or `README.md`, or pick a lowercase RFC 1123 name (`metadata.name`, 2–63 chars, `a-z`, `0-9`, `-`).
2. **Define the container.** Set `image: .` for a repo-built app (reusing any container key expected by build scripts), or pin an image tag for a prebuilt container.
3. **Declare the service port.** Add `service.ports.<name>` with `port` and `targetPort` matching the container's listening port (reusing any expected port key).
4. **Classify every env var from the app:**
   - **Static non-secret config** (such as `NODE_ENV: "production"`): set as a quoted string in `variables`.
   - **Backing service binding** (database, cache, object storage, SMTP, queue): declare a Score resource and wire `${resources.<name>.<output>}` using exact provisioner output keys.
   - **App secret or deploy-time toggle** (session secret, API key, feature flag): declare `env: { type: environment }` and wire `${resources.env.<VAR_NAME>}`.
5. **Add optional probes and files only when needed.** Check [references/portability-matrix.md](references/portability-matrix.md) so unsupported fields do not surprise the user.
6. **Validate the file** with every target generator configured in the repository.

### Portable starter template

```yaml
apiVersion: score.dev/v1b1

metadata:
  name: my-app

containers:
  app:
    image: .
    variables:
      NODE_ENV: production
      PORT: "3000"
      DATABASE_URL: postgres://${resources.db.username}:${resources.db.password}@${resources.db.host}:${resources.db.port}/${resources.db.database}
      APP_SECRET: ${resources.env.APP_SECRET}

service:
  ports:
    web:
      port: 3000
      targetPort: 3000

resources:
  env:
    type: environment
  db:
    type: postgres
```

## Workflow 2: Migrate from `docker-compose.yaml`

1. Identify the application service (the workload) versus backing services (Postgres, Redis, MinIO, Mailpit, RabbitMQ).
2. Move only the application service into `containers:` and `service.ports:` in `score.yaml`.
3. Replace each backing service with a typed `resources:` entry (`postgres`, `redis`, `s3`, `smtp`, `amqp`, `volume`).
4. Replace hardcoded hostnames and passwords with `${resources.<name>.<output>}` placeholders.
5. Move host-only settings (fixed host ports, bind mounts for live reload, local credentials) out of `score.yaml` into `--publish`, custom `*.provisioners.yaml`, or a Compose override file.

## Workflow 3: Add or change a backing resource

1. Choose a standard resource type (`postgres`, `redis`, `s3`, `smtp`, `environment`, `dns`, `route`, `volume`, `service-port`).
2. Confirm every target implementation has a provisioner for that `type` (and optional `class`) that exposes the exact output keys you reference.
3. Prefer portable output keys across targets:
   - Postgres: use `${resources.db.database}`, not `${resources.db.name}` (`score-cloudrun` outputs `database`, not `name`).
   - S3 / Object storage: wire `endpoint`, `bucket`, `region`, `access_key_id`, `secret_key` (and custom outputs like `public_base_url` only when every target provisioner provides them).
4. Add `id: <shared-id>` only when multiple workloads must share one resource instance. Without `id`, each workload gets an isolated instance.

## Placeholders and escaping

- `${resources.<name>.<output>}` resolves resource outputs at generate time.
- `${metadata.<key>}` resolves workload metadata (such as `${metadata.name}`).
- Escape a literal dot inside a key with a backslash (`\.`).
- Write `$${VAR}` to emit a literal `${VAR}` into the container or target manifest (required for shell variables in `command` or `args`).
- Both inline `files.<path>.content` and external `files.<path>.source` expand `${...}` placeholders by default. Set `noExpand: true` to disable expansion. `binaryContent` is base64 and never expands.

## Cross-target portability guardrails

Read [references/portability-matrix.md](references/portability-matrix.md) for the full `score-compose` vs `score-cloudrun` matrix. Key rules:

- Never encode cloud-specific paths in `score.yaml` (such as `/cloudsql/...` Unix sockets). Use standard `host:port` placeholders so local Compose and Cloud Run Direct VPC use the same file.
- `score-cloudrun`'s default profile strips `PORT` from `env` because Cloud Run reserves it and sets `PORT` from `service.ports.*.targetPort`. Keep `service.ports.*.targetPort` accurate and make sure the app reads `PORT`.
- Keep implementation-specific hints in `metadata.annotations` (such as `cloudrun.score.dev/workload-profile`) or `--overrides-file`, never by forking `score.yaml`.
- When deploying to Kubernetes later, the same portable `score.yaml` also works with `score-k8s`.

## Validate `score.yaml`

Run target generators in a throwaway temp directory (or use existing initialized state with `-o - > /dev/null`) so validation leaves no untracked `.score-compose/`, `.score-cloudrun/`, or `manifests.tf` files behind. Pass `--build <container>=.` or `--image <img:tag>` when `image: .` is set:

```bash
# Dry-run with score-compose (add --provisioners <file> if the repo provides custom provisioners)
score-compose init --no-sample
score-compose generate score.yaml --build app=. -o - > /dev/null

# Dry-run with score-cloudrun when targeting Google Cloud Run
score-cloudrun init --no-sample --provisioners <provisioners.yaml> --profiles <profiles.yaml>
score-cloudrun generate score.yaml --project-id demo-proj --location us-east1 --image example/app:dev -o - > /dev/null
```

## Reference files

- [references/schema-and-syntax.md](references/schema-and-syntax.md) — Complete `score.dev/v1b1` field reference, naming constraints, canonical maps, probes, and `before` ordering.
- [references/portability-matrix.md](references/portability-matrix.md) — Feature support and output-key compatibility across `score-compose` and `score-cloudrun`.
