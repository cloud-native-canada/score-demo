# Score `v1b1` Schema and Syntax Reference

Reference for the CNCF Score Workload Specification (`apiVersion: score.dev/v1b1`).

## Top-level structure

Required top-level keys: `apiVersion`, `metadata`, `containers`.
Optional top-level keys: `service`, `resources`.
No other top-level keys are allowed (`additionalProperties: false`).

## Naming rules (RFC 1123 labels)

These keys must match `^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$` (2–63 lowercase alphanumeric characters or `-`, cannot start or end with `-`):

- `metadata.name`
- Container names under `containers:`
- Port names under `service.ports:`
- Resource names under `resources:`
- Container names referenced under `containers.<name>.before:`

Resource `type` and `class` allow uppercase letters (`^[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]$`).
Resource `id` allows dot-separated RFC 1123 labels (up to 63 chars total).

## `metadata`

```yaml
metadata:
  name: my-app
  annotations:
    cloudrun.score.dev/workload-profile: default
```

- `name` (required): workload name. Also becomes the DNS hostname on the Compose network.
- `annotations` (optional): string-to-string map. Keys may include an optional RFC 1123 domain prefix before `/`.
- Extra custom metadata fields are permitted and can be referenced via `${metadata.<key>}`.

## `containers.<name>`

Required field: `image`.

```yaml
containers:
  app:
    image: .                       # "." means supply image via --build or --image
    command: ["/bin/sh"]           # overrides image ENTRYPOINT
    args: ["-c", "echo $${MSG}"]   # overrides image CMD; escape shell vars with $$
    variables:
      NODE_ENV: production
      PORT: "3000"                 # MUST be a string, not an unquoted integer
      DB_URL: postgres://${resources.db.username}:${resources.db.password}@${resources.db.host}:${resources.db.port}/${resources.db.database}
    files:
      /etc/app/config.json:
        content: |
          {"name": "${metadata.name}"}
        mode: "0644"               # octal string, e.g. "0600" or "0644"
      /etc/app/template.conf:
        source: ./config/app.conf  # relative to score.yaml; expands placeholders unless noExpand: true
        noExpand: false
      /etc/app/cert.der:
        binaryContent: "AQID"      # standard base64; never expanded
    volumes:
      /var/lib/app/data:
        source: ${resources.data}
        path: subdir               # optional subpath inside volume
        readOnly: false
    before:
      migrate:
        ready: complete            # enum: started | healthy | complete
    resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "1"
        memory: "512Mi"
    livenessProbe:
      httpGet:
        path: /healthz
        port: 3000
        scheme: HTTP               # HTTP | HTTPS (default HTTP)
    readinessProbe:
      exec:
        command: ["pg_isready"]
```

### Canonical map form for `files` and `volumes`

Always key `files` and `volumes` by their container mount path.
The legacy array syntax (`- target: /path`) is deprecated in `score.dev/v1b1`.
Do not set `target:` inside a map entry (the JSON schema rejects `target:` when using the map form).

### File content rules

Each entry under `files.<target_path>` must specify exactly one of:

- `content` (UTF-8 string): expands `${...}` unless `noExpand: true`.
- `source` (path relative to `score.yaml` or absolute): expands `${...}` unless `noExpand: true`.
- `binaryContent` (base64 string): never expands placeholders.

### Variable type rules

Every value under `containers.<name>.variables` must be a string.
Quote numbers and booleans (`"3000"`, `"true"`) so YAML parsers do not decode them as integers or booleans.

### Resource limits syntax

- `cpu`: whole/decimal CPUs or milli-CPUs (`"1"`, `"0.5"`, `"250m"`).
- `memory`: bytes with optional SI or binary unit (`"256M"`, `"512Mi"`, `"1.5Gi"`).

## `service.ports`

```yaml
service:
  ports:
    web:
      port: 8080          # required, 1–65535 (public service port)
      targetPort: 3000    # optional, 1–65535 (container listening port; defaults to port)
      protocol: TCP       # optional: TCP (default) | UDP
```

## `resources.<name>`

```yaml
resources:
  db:
    type: postgres        # required
    class: default        # optional specialization of type
    id: shared-db         # optional; matching type+class+id shares one resource across workloads
    metadata:
      annotations:
        compose.score.dev/publish-port: "5432"
    params:               # optional free-form parameters consumed by the provisioner
      extensions: ["pg_trgm"]
```

### Resource identity (UID)

A resource's unique identity is:

- Private to one workload (no `id`): `<type>.<class>#<workload>.<resource_name>`
- Shared across workloads (with `id`): `<type>.<class>#<id>`

When `class` is omitted, it defaults to `default`.
Two workloads with the same `type`, `class`, and `id` receive the same provisioned resource instance.
