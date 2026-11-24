# Troubleshooting `score-compose`

Common errors, causes, and fixes (verified on `score-compose 0.49.0`).

## Quick diagnostic steps

1. Check CLI version: `score-compose --version` or `score-compose check-version '>=0.49.0'`.
2. Re-run with verbose logging: `score-compose generate score.yaml -vv`.
3. Inspect active provisioners and outputs:
   `score-compose provisioners list` and `score-compose resources get-outputs '<uid>' --format yaml`.
4. Verify the resolved Compose config: `docker compose config`.

## Common errors and fixes

### `"state directory does not exist, please run \"init\" first"`

- Run `score-compose init --no-sample` in the working directory before `generate`.
- If a repo uses a managed runner (Mode A) with cached state in a subfolder, use the repo runner instead of creating `.score-compose/` in the repo root.

### Container `image: .` fails during `generate`

- Pass `--build <container>=.` or `--image <img:tag>` with a **single** Score file argument.
- Multiple Score files on one `generate` call do not allow `--build` or `--image`. Run `generate` one file at a time (state accumulates across calls).

### `--publish` disappears on the next `generate`

- `score-compose` does not persist `--publish` inside `.score-compose/state.yaml`.
- Pass `--publish` on the final `generate` command, or switch to a `route` resource, a custom provisioner port mapping, or a `compose.override.yaml` layer.
- Always quote resource UID flags (`--publish '15432:postgres.default#app.db.host:5432'`) so shells do not treat `#` as a comment or split on whitespace.

### `unknown flag: --override-file`

- The real flag is plural: `--overrides-file`. CLI `--help` examples misspell it as singular.
- `--overrides-file` and `--override-property` work only when passing **one** Score file.

### `.env` file overwritten by `--env-file`

- `score-compose generate --env-file <path>` replaces the entire target file.
- Always write to a sample or cache path (`--env-file sample.env`), never directly to a developer `.env` that holds secrets.

### MinIO (`s3`) fails to pull `quay.io/minio/minio`

- Upstream `quay.io/minio/minio` images are no longer publicly pullable.
- Supply a custom `s3` provisioner using a maintained image (such as `pgsty/minio`) via `init --provisioners`. See [provisioners-and-patches.md](provisioners-and-patches.md).

### Port already allocated across git worktrees or checkouts

- Fixed host ports in custom provisioners collide when multiple checkouts or services run at once.
- When the repo has a `local-dev` runner (`scripts/dev/start.mjs`), let the runner assign per-checkout ports and start containers.

### Shell variable `${VAR}` fails substitution or vanishes

- `score-compose` expands `${...}` in `variables`, `command`, `args`, `files.<path>.content`, and `files.<path>.source`.
- Write `$${VAR}` for literal shell or runtime container interpolation, or set `noExpand: true` on `files.<path>`.

### Resetting stale `.score-compose/` state without losing database data

- `rm -rf .score-compose compose.yaml` resets Score state, generated service names, and passwords.
- Re-run `init` and `generate`. Note that Docker volumes persist until `docker compose down -v` is run.
- Because default Postgres and Redis provisioners generate random passwords per `init`, existing named volumes with old passwords will fail auth after a state reset unless `docker compose down -v` clears those volumes or a custom provisioner sets fixed local credentials.
