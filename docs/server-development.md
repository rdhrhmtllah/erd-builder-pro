# Server HMR development

The development UI can run separately from the production web bundle while it
uses the same production API and database. API calls stay same-origin in the
browser and are proxied by Vite to the production backend.

```bash
ERD_DEV_PUBLIC_URL=https://dev-server-diagram.ajt.my.id \
ERD_DEV_PROXY_TARGET=http://127.0.0.1:3101 \
npx vite --host 127.0.0.1 --port 5174 --strictPort
```

On the self-hosted server this command is installed as the persistent
`erd-builder-pro-hmr.service`, with automatic startup and restart on failure.

Do not set `VITE_API_URL` for this setup. A `VITE_` variable is embedded in the
browser bundle, while `ERD_DEV_PROXY_TARGET` remains server-only.

The development hostname is intentionally public while active. Stop the HMR
process or remove its Cloudflare ingress when development is finished.

## Restore points

Create and verify a PostgreSQL restore point before every large feature:

```bash
./scripts/create-server-restore-point.sh feature-name
```

Each restore point includes a custom-format dump, SHA-256 checksum, Git commit,
and deployed image ID. Restore only during a maintenance window because it
briefly stops the production app:

```bash
./scripts/restore-server-restore-point.sh \
  /absolute/path/to/restore-point.dump --confirm
```

The restore command automatically creates one additional `pre-restore` safety
point before replacing the database.
