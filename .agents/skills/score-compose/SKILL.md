---
name: score-compose
description: Compile score.yaml into Docker Compose with score-compose, inspect provisioned resources, and author custom *.provisioners.yaml or --patch-templates. Use when generating or validating local Compose output, wiring or debugging local resource provisioners, exposing ports, or applying Score overrides. Do not use to author score.yaml from scratch (use score) or to run ordinary app startup when a repo runner like local-dev exists.
---

# Run Score locally with `score-compose`

`score-compose` compiles one or more `score.yaml` workloads into a Docker Compose project and provisions declared resources locally.

## Step 1: Discover repository context first

Inspect `AGENTS.md`, `.agents/skills/`, `.gitignore`, `docs/`, and `package.json` or `Makefile` before running commands.

### Mode A: Managed repo runner detected (such as `local-dev` or `scripts/dev/start.mjs`)

Treat `score-compose` strictly as the **compiler**, and treat the repo runner as the **app orchestrator**:

1. Use `score-compose` on `PATH`, or fall back to a repo-cached binary such as `.local-dev/bin/score-compose-*`.
2. Validate `score.yaml` and provisioner edits in memory (`score-compose generate score.yaml ... -o - > /dev/null`) inside a throwaway `/tmp` dir or the runner's cache state dir.
3. Never run `docker compose up` against a root `compose.yaml` (avoids host port conflicts across git worktrees and skipped migrations). Delegate container boot, port isolation, migrations, seed, and dev server startup to the repo runner (such as `node scripts/dev/start.mjs --prepare` or `start.mjs`).
4. Refresh a root `compose.yaml` only when `git ls-files --error-unmatch compose.yaml` succeeds **and** `score.yaml` or `*.provisioners.yaml` changed. Run the repo's documented generate command inside a clean temp directory, or run the repo's Compose parity check.

### Mode B: Standalone Score repository (no wrapper)

```bash
score-compose init --no-sample [--project <name>] [--provisioners <file-or-uri>]
score-compose generate score.yaml [--build <container>=<dir> | --image <img:tag>] [--publish <host>:<workload>:<port>]
docker compose up -d --wait
```

## Prerequisites

- Docker with the Compose plugin (`docker compose version`).
- `score-compose` on `PATH` (`score-compose --version`). Install with `brew install score-spec/tap/score-compose` or from [GitHub releases](https://github.com/score-spec/score-compose/releases).

If `score-compose` is missing in Mode B, tell the user how to install it. Ask before installing system-wide tools.

## Core CLI mechanics and state

- `init` creates `.score-compose/` (keep it out of git). Run `init` first, or `generate` fails with `"state directory does not exist"`.
- **State accumulates.** Running `generate a.yaml` then `generate b.yaml` combines both workloads. Running `generate` with no arguments regenerates from stored workloads.
- Re-running `generate` reuses stored resource names and passwords in `.score-compose/state.yaml`. Delete `.score-compose/` to reset state.
- Check installed versions in scripts or CI with `score-compose check-version '>=0.49.0'`.
- Always confirm active provisioners and outputs instead of guessing:

```bash
score-compose provisioners list
score-compose resources list
score-compose resources get-outputs 'postgres.default#my-app.db' --format yaml
```

## Common tasks

### Expose ports to the host

Nothing publishes to host ports by default. Pass `--publish` on the **last** `generate` call because `--publish` is not saved in state:

```bash
score-compose generate score.yaml --publish 8080:my-app:80
score-compose generate score.yaml --publish '15432:postgres.default#my-app.db.host:5432'
```

Quote arguments containing `#`. Host ports must be greater than `1`.

### Build or supply local container images

When `score.yaml` uses `image: .`, supply `--build` or `--image` with a single Score file:

```bash
score-compose generate score.yaml --build app=.
score-compose generate score.yaml --build 'app={"context":"./app","dockerfile":"Dockerfile.dev"}'
score-compose generate score.yaml --image my-app:dev
```

### Apply overrides and host env vars

```bash
score-compose generate score.yaml --overrides-file dev.score.yaml
score-compose generate score.yaml --override-property 'containers.app.variables.DEBUG="true"'
score-compose generate score.yaml --override-property 'resources.cache='
```

- Pass `--overrides-file` (plural), even though CLI `--help` examples print `--override-file`.
- `--image`, `--build`, `--overrides-file`, and `--override-property` require **exactly one** Score file on the command line.
- `type: environment` emits `${VAR}` into `compose.yaml` so Docker Compose reads `.env` or shell vars at startup.
- `--env-file <path>` **overwrites** existing files. Write to `sample.env` or a cache file, never directly to `.env`.

### Multi-workload links and custom provisioners

- Use `type: service-port` with `params: { workload: <name>, port: <port-key> }` to expose `${resources.<res>.hostname}` and `${resources.<res>.port}`. Docker Compose does not enforce startup order across workloads, so callers must retry until peers listen (`wait-for-resources` only waits for resource containers).
- Both `files.<path>.content` and `files.<path>.source` expand `${...}` unless `noExpand: true`. Escape literal container variables as `$${VAR}`.
- For custom provisioners, `cmd://` executables, and `--patch-templates`, see [references/provisioners-and-patches.md](references/provisioners-and-patches.md).

## Unsupported Score fields

- `containers.*.resources.limits` and `requests` validate, then are ignored.
- `containers.*.livenessProbe` and `readinessProbe` validate, then are ignored.
- `files.<path>.mode` is not applied yet.

## Reference files

- [references/resources.md](references/resources.md) — All 15 built-in provisioners, outputs, params, annotations, and MinIO image warning.
- [references/provisioners-and-patches.md](references/provisioners-and-patches.md) — Custom `template://` and `cmd://` provisioners, URI schemes, `--patch-templates`, and Compose overrides.
- [references/troubleshooting.md](references/troubleshooting.md) — Verified CLI errors, escaping issues, port clashes, and state resets.
