# bigfred-wizard

Party/event kiosk for [BigFred](https://github.com/dcc-bigfred/bigfred) on the hub tablet (`:8091`).

Organizer signs in via BigFred OAuth2 SSO; participants use fullscreen tiles for accounts, handset pairing (Z21 / WiThrottle), and locomotive CV programming.

Hub OS pulls the static **linux/arm64** binary from this repo’s CI artifacts (same pattern as [micronet](https://github.com/dcc-bigfred/micronet)).

## Layout

| Path | Role |
|------|------|
| `src/` | Axum server: OAuth token proxy, BigFred HTTP reverse proxy, resilient dcc-bus WS client, programming HTTP API |
| `web/` | Vite + MUI SPA (embedded via `rust-embed`) |
| `.github/workflows/` | CI (SPA + musl arm64/amd64) and tagged releases |

## Build

```bash
make web-build          # npm ci && vite build → web/dist
make host               # native binary
make release-musl       # dist/bigfred-wizard-linux-arm64 (static musl)
make test
```

## Local development

```bash
# Terminal 1 — backend (:8091), data under ./.dev-data
make dev-backend

# Terminal 2 — Vite (:5175) proxies /api to the backend
make dev-web
```

On first start the daemon lazy-creates
`$BIGFRED_DATA_DIR/etc/bigfred/oauth-clients/bigfred-wizard.json`
(0640, group `bigfred`). Point BigFred at the **same** data dir so it picks
up the drop-in (hot-reload), e.g.:

```bash
BIGFRED_DATA_DIR=$PWD/.dev-data bigfred …
# or: export BIGFRED_DATA_DIR=/data   # both processes
```

`bigfredUrl` must be loopback `http://` (no TLS in this binary).

Phone onboarding QR codes: `GET /api/v1/wizard/qr.svg?target=android|bigfred`
(from `androidAppUrl` / `bigfredPublicUrl` in the JSON config).

## Hub config

On the device: `/data/etc/bigfred/wizard/bigfred-wizard.json` (seed ships disabled; `.example` is rewritten beside it on each start). Overlays (init.d, microinit, microdns) live in [bigfred-os](https://github.com/dcc-bigfred/bigfred-os).

```json
{
  "http": "0.0.0.0:8091",
  "enabled": true,
  "bigfredUrl": "http://127.0.0.1:8080",
  "bigfredPublicUrl": "http://bigfred.local:8080",
  "androidAppUrl": "https://play.google.com/store/apps/details?id=…",
  "ssoClientId": "bigfred-wizard",
  "dccPerUser": 25,
  "idleTimeoutSecs": 86400
}
```

## License

MIT
