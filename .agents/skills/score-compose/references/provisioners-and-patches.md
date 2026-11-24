# Custom Provisioners and Patch Templates (`score-compose`)

Extend `score-compose` with custom `*.provisioners.yaml` files, `cmd://` binaries, patch templates, or runtime Compose overrides while keeping `score.yaml` clean.

## Custom provisioner loading and precedence

Load provisioners at `init` time (supports multiple `--provisioners` flags):

```bash
score-compose init --no-sample --provisioners ./custom.provisioners.yaml
```

Supported URI schemes for `--provisioners` and `--patch-templates`:

- Local file path (`./custom.provisioners.yaml`) or `-` (stdin)
- `http://host/file` and `https://host/file`
- `git-ssh://git@host/repo.git/file` and `git-https://host/repo.git/file`
- `oci://[registry/][namespace/]repository[:tag|@digest][#file]`

Files in `.score-compose/*.provisioners.yaml` load in lexicographic order. The first provisioner matching `(type, class, id)` wins. Downloaded files use a reverse-timestamp prefix so custom files automatically sort ahead of `zz-default.provisioners.yaml`.

## `template://` provisioners schema

Supported YAML fields on each item in `*.provisioners.yaml`:

- `uri` (required, `template://...`), `type` (required), `class` (optional), `id` (optional), `description`
- Go text templates (`sprig` functions included): `init`, `state`, `shared`, `outputs`, `directories`, `files`, `networks`, `volumes`, `services`, `models`, `info_logs`
- Metadata lists: `supported_params`, `expected_outputs`

Template context variables include `.Uid`, `.Id`, `.Params`, `.Metadata`, `.SourceWorkload`, `.WorkloadServices`, `.State`, `.Shared`, `.Init`, `.ComposeProjectName`, and `.MountsDirectory`.

Add `labels: { dev.score.compose.labels.is-init-container: "true" }` on one-shot setup containers (bucket creation, DB scripts) so the generated `wait-for-resources` service waits for `service_completed_successfully`.

### Generic example 1: Local Mailpit (`smtp`)

```yaml
- uri: template://custom/smtp
  type: smtp
  description: Local Mailpit SMTP server and web inbox.
  outputs: |
    host: mailpit
    port: 1025
    username: local
    password: local
    from: App <no-reply@app.localhost>
  services: |
    mailpit:
      image: axllent/mailpit:v1.27
      restart: unless-stopped
      environment:
        MP_SMTP_AUTH_ACCEPT_ANY: "1"
        MP_SMTP_AUTH_ALLOW_INSECURE: "1"
      ports:
        - target: 1025
          published: "1025"
        - target: 8025
          published: "8025"
      healthcheck:
        test: ["CMD", "/mailpit", "readyz"]
        interval: 2s
        timeout: 2s
        retries: 15
  expected_outputs: [host, port, username, password, from]
```

### Generic example 2: Maintained MinIO (`s3`) with bucket init

Use a maintained fork such as `pgsty/minio` when `quay.io/minio/minio` is unavailable:

```yaml
- uri: template://custom/s3
  type: s3
  description: Local MinIO bucket with public read prefix and init container.
  outputs: |
    bucket: app-assets
    endpoint: http://minio:9000
    public_endpoint: http://localhost:9000
    public_base_url: http://localhost:9000/app-assets
    region: us-east-1
    access_key_id: localkey
    secret_key: localsecret
  volumes: |
    minio-data:
      driver: local
  services: |
    minio:
      image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
      command: ["server", "/data", "--console-address", ":9001"]
      environment:
        MINIO_ROOT_USER: localkey
        MINIO_ROOT_PASSWORD: localsecret
      ports:
        - target: 9000
          published: "9000"
      volumes:
        - type: volume
          source: minio-data
          target: /data
      healthcheck:
        test: ["CMD-SHELL", "mc alias set local http://localhost:9000 localkey localsecret"]
        interval: 2s
        timeout: 2s
        retries: 15
    minio-bucket-init:
      image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
      entrypoint: ["/bin/sh", "-c"]
      command: ["mc alias set local http://minio:9000 localkey localsecret && mc mb -p local/app-assets"]
      labels:
        dev.score.compose.labels.is-init-container: "true"
      depends_on:
        minio:
          condition: service_healthy
          restart: true
  expected_outputs: [bucket, endpoint, public_endpoint, public_base_url, region, access_key_id, secret_key]
```

## External `cmd://` provisioners

Use `cmd://` to run an external script or binary instead of a Go template:

```yaml
- uri: cmd://./scripts/provision-redis.sh
  type: redis
  args: ["--tier", "local"]
  supported_params: []
  expected_outputs: [host, port, username, password]
```

- Supported URI forms: `cmd:///abs/path`, `cmd://~/bin/tool`, `cmd://./rel/path`, `cmd://../rel/path`, or `cmd://binary-on-path` (with no user info, query params, or port).
- `score-compose` passes JSON on `stdin` (`resource_uid`, `resource_type`, `resource_class`, `resource_id`, `resource_params`, `resource_metadata`, `source_workload`, `workload_services`, `resource_state`, `shared_state`, `compose_project_name`, `mount_directory_path`).
- The command prints strict JSON to `stdout` (`resource_state`, `resource_outputs`, `shared_state`, `relative_directories`, `relative_file_contents`, `compose_networks`, `compose_volumes`, `compose_services`, `compose_models`).

## Patch templates (`--patch-templates`)

Patch templates post-process the generated `compose.yaml` using Go `text/template` + `sprig`:

```bash
score-compose init --no-sample --patch-templates ./patch.tpl
```

The template receives `.Compose` and `.Workloads` and must render a YAML or JSON array of objects with `op` (`set` or `delete`), `path` (dot-separated JSON path), `value` (for `set`), and optional `description`:

```yaml
{{ range $name, $cfg := .Compose.services }}
  {{ if ne (dig "annotations" "compose.score.dev/workload-name" "" $cfg) "" }}
- op: set
  path: services.{{ $name }}.read_only
  value: true
  description: Make workload containers read-only
  {{ end }}
{{ end }}
```

## Exposing resource ports and layering Compose files

- Publish a provisioned resource port with its UID and output key (quote `#`):
  `score-compose generate score.yaml --publish '15432:postgres.default#my-app.db.host:5432'`
- For Compose-only runtime extras (profiles, watch blocks, extra bind mounts) without touching `score.yaml`, layer a second Compose file:
  `docker compose -f compose.yaml -f compose.override.yaml up -d`
