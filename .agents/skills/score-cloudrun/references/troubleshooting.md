# Troubleshooting `score-cloudrun`

Common errors, Cloud Run deployment caveats, and verified fixes.

## Quick diagnostic steps

1. Check CLI version: `score-cloudrun --version`.
2. Inspect active profiles and provisioners:
   `score-cloudrun profiles list --format table` and `score-cloudrun provisioners list --format table`.
3. Dry-run generation to stdout:
   `score-cloudrun generate score.yaml -p demo-proj -l us-east1 -i img:v1 -o -`.
4. Validate generated HCL: `terraform -chdir=<dir> init -backend=false && terraform -chdir=<dir> validate`.

## Common errors and fixes

### `"state directory does not exist, please run \"init\" first"`

- Run `score-cloudrun init --no-sample --provisioners <file> --profiles <file>` before `generate`.

### `failed to write output file: open <dir>/manifests.tf.tmp: no such file or directory`

- `score-cloudrun generate -o <dir>/manifests.tf` does not create parent directories automatically. Create `<dir>` first (`mkdir -p <dir>` or commit `<dir>/.gitkeep`) before running `generate`.

### `"no Google Cloud location specified"` or `"no Google Cloud Project ID specified"`

- Pass both `--location <region>` and `--project-id <project-id>` on every `score-cloudrun generate` call.

### `failed to convert '...' because container '...' has no image and --image was not provided`

- `score.yaml` uses `image: .`, so pass `--image <registry/repo/image:tag>` (and pass **exactly one** Score file when using `--image`, `--overrides-file`, or `--override-property`).

### `"resource '...' is not supported by any provisioner"`

- `score-cloudrun init` does not install default resource provisioners. Load a `*.provisioners.yaml` file covering every resource `type`, `class`, and `--output-format` in `score.yaml`.
- Verify what is loaded with `score-cloudrun provisioners list`.

### `"workload profile '...' with output format '...' is not supported"`

- Check `metadata.annotations["cloudrun.score.dev/workload-profile"]` and verify a matching profile exists in `score-cloudrun profiles list` for the chosen `--output-format` (`terraform` or `kcc`).

### `annotation 'cloudrun.score.dev/base-image' in the Score file needs to be set when using --source`

- Add `cloudrun.score.dev/base-image` under `metadata.annotations` when building Cloud Run Functions from source via `--source`.

### YAML decoding fails with `field ... not found in type ...`

- `score-cloudrun` enforces `KnownFields(true)` on provisioner and profile YAML files.
- Remove unsupported `score-compose` keys (such as `init`, `state`, `shared`, `expected_outputs`, `supported_params`, `services`, `volumes`), and verify `uri` has a valid URL scheme (e.g. `template://...`).

### YAML decoding fails with `did not find expected key`

- Wrap `outputs:` strings that contain Terraform double quotes (for example `'${var.url != "" ? var.url : "https://example.org"}'`) in YAML single quotes or a YAML block scalar (`|`).
- Make sure inner quotes do not terminate a double-quoted YAML scalar prematurely.

### Cloud Run rejects revision because `PORT` env var is reserved

- Custom profiles must exclude `PORT` when iterating `$container.Variables` (`{{- if ne $variableName "PORT" }}`). Cloud Run injects `PORT` from `ports.container_port`.

### First `terraform apply` fails reading Secret Manager secret (`Permission denied` or invalid secret ID)

- Make sure the Cloud Run service depends on `google_secret_manager_secret_iam_member` (by referencing `.secret_id` from the IAM member in the `gcpsm:` output) so IAM propagation completes before revision creation.
- Wrap the parsed secret name in Terraform `basename(...)` if `.secret_id` returns a full resource path (`projects/.../secrets/...`), and use short account IDs (Cloud Run service account IDs must be <= 30 chars).

### Stale provisioners or profiles after editing templates

- `score-cloudrun init` saves reverse-timestamped copies inside `.score-cloudrun/` and warns/skips the default profile if a custom `default` exists.
- When switching between sandbox provisioners and split-state lookup provisioners, remove `.score-cloudrun/` and re-run `score-cloudrun init` so old templates do not shadow new ones.
