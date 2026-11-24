# `score-compose` Built-in Provisioners Reference

Default resource provisioners installed by `score-compose init` into `.score-compose/zz-default.provisioners.yaml` (verified on `score-compose 0.49.0`).

Always run `score-compose provisioners list` in the active workspace to see custom overrides.

## Built-in resource types (15 total)

| Type | Params | Outputs | Notes |
|---|---|---|---|
| `amqp` | — | `host`, `port`, `vhost`, `username`, `password` | Dedicated RabbitMQ vhost on a shared instance (`rabbitmq:3-management-alpine`). |
| `dns` | — | `host` | Outputs a random `*.localhost` domain. |
| `elasticsearch` | — | `host`, `port`, `username`, `password` | Single-node Elasticsearch with generated TLS CA. Defaults to publishing port `9200`. |
| `environment` | — | Dynamic (`${VAR}`) | Maps `${resources.<res>.<VAR>}` to `${VAR}` in `compose.yaml`. |
| `kafka-topic` | — | `host`, `port`, `name`, `num_partitions` | Dedicated Kafka topic (3 partitions) on shared `apache/kafka` broker. |
| `mongodb` | — | `host`, `port`, `username`, `password`, `connection` | Dedicated `mongo:8` container and data volume. |
| `mssql` | — | `server`, `port`, `connection`, `database`, `username`, `password` | Shared MS SQL Server instance (`ACCEPT_EULA: "Y"`). |
| `mysql` | — | `host`, `port`, `name`, `database`, `username`, `password` | Dedicated database on shared `mysql:8`. Use `database` for cloud portability. |
| `postgres` | — | `host`, `port`, `name`, `database`, `username`, `password` | Dedicated database on shared `postgres:17-alpine`. Always use `${resources.<res>.database}` (portable with `score-cloudrun`), not `name`. |
| `postgres-instance` | — | `host`, `port`, `username`, `password` | Dedicated PostgreSQL 17 instance (`postgres` superuser). |
| `redis` | — | `host`, `port`, `username`, `password` | Dedicated `redis:7-alpine` container (`username: default`). |
| `route` | `host`, `port`, `path` | — | Shared Nginx reverse proxy on port `8080`. `params.port` is the named key under `service.ports`. |
| `s3` | — | `bucket`, `endpoint`, `region`, `access_key_id`, `secret_key`, `aws_access_key_id`, `aws_secret_key` | Shared MinIO instance. See the MinIO image warning below. |
| `service-port` | `workload`, `port` | `hostname`, `port` | Resolves another Score workload's service hostname and internal target port. |
| `volume` | — | `source`, `type` | Named Docker Compose local volume. |

## Built-in resource annotations

Set annotations under `resources.<name>.metadata.annotations` in `score.yaml` or `--overrides-file`:

| Annotation | Applies to | Effect |
|---|---|---|
| `compose.score.dev/publish-port` | `postgres`, `postgres-instance`, `s3`, `amqp`, `mysql`, `kafka-topic`, `elasticsearch`, `mssql` | Publishes the service or management port on the host (e.g. `"5432"`). |
| `compose.score.dev/publish-management-port` | `amqp` | Publishes the RabbitMQ management UI port `15672` on the host. |
| `compose.score.dev/route-provisioner-path-type` | `route` | Set to `"Exact"` to disable automatic prefix location matching (default `"Prefix"`). |
| `compose.score.dev/route-provisioner-server-snippet` | `route` | Extra Nginx directives inside the `server` block. |
| `compose.score.dev/route-provisioner-location-snippet` | `route` | Extra Nginx directives inside the matched `location` block. |
| `compose.score.dev/license` | `elasticsearch` | Sets `xpack.license.self_generated.type` (default `"basic"`). |
| `compose.score.dev/stack-version` | `elasticsearch` | Sets the Elasticsearch image tag (default `"8.14.0"`). |
| `compose.score.dev/es-mem-limit` | `elasticsearch` | Sets `mem_limit` in bytes (default `"1073741824"`). |

## Important warnings

- **MinIO (`s3`) public image availability:** The default `s3` provisioner pulls `quay.io/minio/minio`, which is no longer publicly hosted. Supply a custom `s3` provisioner pinned to a maintained mirror or community fork (such as `pgsty/minio`) when using `type: s3`.
- **No built-in `smtp` provisioner:** `score-compose` does not include an `smtp` provisioner by default. Add a custom provisioner (for example `axllent/mailpit`) in `*.provisioners.yaml` when an app declares `type: smtp`.
- **Shared vs isolated resources:** Omit `id:` to create an isolated resource per workload. Add `id: <shared-id>` on resources with matching `type` and `class` to share one instance across workloads.
