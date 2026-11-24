# `score-cloudrun` Provisioners, Profiles, and Production Patterns

Verified against the `score-cloudrun` Go implementation and production Terraform deployment patterns.

## Template loader and schema contract

- **No `cmd://` provisioners:** `score-cloudrun` supports **only** Go-templated `manifests:` provisioners and profiles. External `cmd://` binary provisioners are **not** supported yet.
- **Strict YAML decoding (`KnownFields(true)`):** Unknown YAML fields cause `init` and `generate` to fail.
- **URI retrieval on `init`:** `--provisioners` and `--profiles` accept local file paths, `http://`, and `https://` URLs up to 10 MiB (`git-ssh://` and `oci://` are not supported).
- **Template engine:** Uses Go `text/template` with only `hclescape` registered (no `sprig` helpers). `hclescape` escapes `\`, `"`, `\n`, `\r`, `\t`, and control chars while leaving Terraform `${...}` and `%{...}` intact.

### Provisioner schema (`*.provisioners.yaml`)

Required fields: `uri` (valid URL with scheme, e.g. `template://...`), `type`. Optional: `class`, `format`, `description`, `inputs`, `outputs`, `manifests`.

- `outputs` values are static strings or Terraform `${...}` references (not evaluated as Go templates).
- `manifests` Go template context: `.WorkloadName`, `.Location`, `.ProjectId`.

### Workload profile schema (`*.profiles.yaml`)

Required fields: `id`, `name`, `format`. Optional: `description`, `manifests`.

- `manifests` Go template context: `.WorkloadName`, `.Spec`, `.Location`, `.ProjectId`, `.Image`, `.BuildConfig` (`.SourcePath`, `.BaseImage`, `.FunctionName`).

## Production Cloud Run patterns

### 1. Secret Manager `gcpsm:` refs with pinned versions

Never place secret values inside plaintext Cloud Run `env.value`. Use a `gcpsm:` prefix in provisioner `outputs` and resolve it into `value_source.secret_key_ref` inside the workload profile:

1. **In the provisioner (`outputs`):** Emit `"gcpsm:${google_secret_manager_secret_iam_member.<key>.secret_id}@${google_secret_manager_secret_version.<key>.version}"`.
   - Reference `google_secret_manager_secret_iam_member.<key>.secret_id` (not the secret resource directly) so Terraform orders IAM binding creation before Cloud Run creates the revision.
   - Pin `@${google_secret_manager_secret_version.<key>.version}` rather than unpinned `@latest` so secret rotation tracks Terraform state deterministically.
2. **In the workload profile (`manifests`):** Detect the `gcpsm:` prefix and emit `secret_key_ref`:

```hcl
{{- if and (ge (len $variableValue) 6) (eq (slice $variableValue 0 6) "gcpsm:") }}
env {
  name = "{{ hclescape $variableName }}"
  value_source {
    secret_key_ref {
      secret  = basename(split("@", "{{ hclescape (slice $variableValue 6) }}")[0])
      version = length(split("@", "{{ hclescape (slice $variableValue 6) }}")) > 1 ? split("@", "{{ hclescape (slice $variableValue 6) }}")[1] : "latest"
    }
  }
}
{{- end }}
```

Use `basename(...)` because Cloud Run expects the short secret ID, whereas IAM member `.secret_id` may return the full `projects/<p>/secrets/<id>` path. Also wrap composed connection strings such as `DATABASE_URL` in Secret Manager inside the profile instead of passing database passwords in plaintext `env.value`.

### 2. Reserved `PORT` env var guard in custom profiles

Cloud Run reserves `PORT` and injects it automatically based on `ports.container_port`. Always skip `PORT` in custom profile env loops:

```hcl
{{- range $variableName, $variableValue := $container.Variables }}
{{- if ne $variableName "PORT" }}
  ...
{{- end }}
{{- end }}
```

### 3. Provision-vs-Lookup split-state pattern

Keep `score.yaml` identical across ephemeral demos and split-state production:

- **Provision mode (`*.provisioners.yaml`):** Creates Cloud SQL, GCS buckets, and Secret Manager resources alongside the Cloud Run service in one Terraform root.
- **Lookup mode (`*.lookup.provisioners.yaml`):** Uses Terraform `data` sources (`data "google_sql_database_instance"`, `data "google_storage_bucket"`, `data "google_secret_manager_secret_version"`) to bind existing foundation infrastructure managed in a separate state.

Delete and re-initialize `.score-cloudrun/` whenever switching between provision and lookup provisioner files.

### 4. Direct VPC Egress + Private IP Cloud SQL

Attach Cloud Run Gen2 to a VPC subnet with `egress = "PRIVATE_RANGES_ONLY"` and output `host: "${google_sql_database_instance.<db>.private_ip_address}"` (`port: "5432"`). Standard TCP connections keep `score.yaml` identical across Docker Compose and Cloud Run without `/cloudsql/` socket overrides.

### 5. Keyless GCS Workload Identity (`s3` resource)

When running on Cloud Run, avoid static HMAC keys. Grant the workload service account `roles/storage.objectAdmin` on the GCS bucket (and `roles/iam.serviceAccountTokenCreator` on itself if signing V4 presigned URLs via IAM `signBlob`), and signal keyless mode via a provisioner output (such as `access_key_id: "workload-identity"`).

### 6. Scale-to-zero (`cpu_idle = true`) and migration Jobs

Set `cpu_idle = true` in custom profiles to scale to zero at minimal cost. Because request-throttled CPUs pause background polling timers, drive async work via HTTP webhooks (such as Cloud Scheduler) and run schema migrations and seeds inside a Cloud Run Job (`cloudrun.score.dev/workload-profile: job` or a companion `google_cloud_run_v2_job`) before routing live traffic.
