# Cross-Implementation Portability Matrix (`score-compose` vs `score-cloudrun`)

Use this matrix to keep a single `score.yaml` working cleanly across local Docker Compose (`score-compose`) and Google Cloud Run (`score-cloudrun`).

## Workload feature support

| Score field | `score-compose` | `score-cloudrun` (default Terraform profile) | Portable guidance |
|---|---|---|---|
| `metadata.name` | Service prefix and network alias | Cloud Run service name & service account ID | Keep short (<= 20 chars) so Cloud Run SA IDs (`<= 30 chars`) and prefixes fit safely. |
| `containers.<name>.image: "."` | Requires `--build` or `--image` on `generate` | Requires `--image` on `generate` | Standard pattern for repo-built containers. |
| `containers.<name>.variables` | Written to Compose `environment` | Written to Cloud Run `env` (except `PORT`, which is stripped) | Always quote non-strings. Read `PORT` from runtime env in app code. |
| `containers.<name>.command` / `args` | Mapped to Compose `entrypoint` / `command` | Mapped to Cloud Run `command` / `args` | Escape literal shell vars with `$$`. |
| `containers.<name>.files` | Written to `.score-compose/mounts/files/` and bind-mounted (`mode` ignored) | Loaded/expanded into `.Spec.Containers.*.Files`, not rendered by built-in default profile | Prefer env vars for config when targeting Cloud Run, or render files in a custom profile (e.g. Secret Manager volume mounts). |
| `containers.<name>.volumes` | Mounted from `type: volume` resource | Not rendered by built-in default profile | Prefer object storage (`type: s3`) for durable app assets. |
| `containers.<name>.before` | Mapped to Compose `depends_on` (`started`, `healthy`, `complete`) | Not rendered by built-in default profile | For DB migrations on Cloud Run, use a separate bootstrap Cloud Run Job rather than relying only on `before`. |
| `containers.<name>.resources.limits` | Validated, then ignored | Ignored by built-in default profile (can be rendered in custom profile) | Set limits in custom Cloud Run profiles or keep sensible values in `score.yaml` if a custom profile reads `.Spec`. |
| `containers.<name>.resources.requests` | Validated, then ignored | Not supported by Cloud Run | Do not rely on `requests` for scheduling parity. |
| `containers.<name>.livenessProbe.httpGet` | Validated, then ignored | Rendered as Cloud Run `liveness_probe.http_get` | Safe to include for Cloud Run health monitoring. |
| `containers.<name>.readinessProbe` | Validated, then ignored | Not supported by Cloud Run Services | Do not depend on `readinessProbe` on Cloud Run. |
| `service.ports` | Internal Compose port (publish with `--publish` or `route`) | First port's `targetPort` (or `port`) sets Cloud Run `container_port` | Define one primary HTTP port matching the app's `PORT`. |

## Portable resource output contracts

Verify actual outputs with `score-compose provisioners list` and `score-cloudrun provisioners list` in the target repo.

| Resource `type` | Portable output keys | Watch-outs across targets |
|---|---|---|
| `environment` | Any `<VAR_NAME>` referenced as `${resources.env.<VAR_NAME>}` | `score-compose` writes `${VAR_NAME}` for Docker Compose `.env`. `score-cloudrun` requires a custom `environment` provisioner (bind secrets via Secret Manager, not plaintext). |
| `postgres` | `host`, `port`, `database`, `username`, `password` | Use `database`, **not** `name`. `score-compose` default outputs both `name` and `database`, while `score-cloudrun` outputs only `database`. Connect via TCP `host:port` (Direct VPC Private IP on Cloud Run), never `/cloudsql/` sockets in `score.yaml`. |
| `redis` | `host`, `port`, `username`, `password` | Default `score-compose` sets `username: default`. Memorystore Redis may use empty username or IAM auth depending on provisioner. |
| `s3` | `bucket`, `endpoint`, `region`, `access_key_id`, `secret_key` | Default `score-compose` uses MinIO (`quay.io/minio/minio` may fail to pull. Override with a custom provisioner). Extra outputs like `public_endpoint` or `public_base_url` require matching custom provisioners on every target. |
| `smtp` | `host`, `port`, `username`, `password` (optional `from`) | Neither `score-compose` nor `score-cloudrun` ships a default `smtp` provisioner. Both targets need custom provisioners with identical output keys. |
| `dns` | `host` | `score-compose` outputs `*.localhost`. `score-cloudrun` uses default Cloud Run URI or external DNS provisioner. |
| `route` | Params: `host`, `path`, `port` (no required outputs) | In `score-compose`, `params.port` is the **named key** under `service.ports` (e.g., `web`). Check your `score-cloudrun` provisioner before combining `route` across both targets. |

## Secrets portability rule

1. Never put real secrets or default production passwords in `score.yaml`.
2. Declare a `type: environment` resource for application secrets (session keys, API tokens, webhook secrets).
3. In `score-compose`, Compose reads those variables from the host shell or gitignored `.env`.
4. In `score-cloudrun`, map them in your platform provisioner to Secret Manager references (`value_source.secret_key_ref`) rather than plaintext `env.value`.

## `PORT` environment variable gotcha

Cloud Run reserves `PORT` and rejects revisions that define `PORT` explicitly in `env`.
`score-cloudrun`'s default profile skips any container variable named `PORT` and sets `ports.container_port` from `service.ports`.
Make sure:

- `service.ports.<name>.targetPort` matches the port your app expects.
- Your application reads `process.env.PORT` (or equivalent) with a sensible fallback.
- Custom `score-cloudrun` profiles keep the `{{- if ne $variableName "PORT" }}` guard.
