# Server (Asterisk) — local dev

Phase 0 setup: a hardcoded two-endpoint Asterisk instance for proving WebRTC calling works, before any app or LDAP integration exists. See [../docs/phase0.md](../docs/phase0.md) for the full walkthrough — this file is just the "run it" quick reference.

## Run it

```bash
cd server
docker compose up -d
docker compose logs -f asterisk    # watch startup, Ctrl+C to stop watching
```

Check it came up correctly:

```bash
docker compose exec asterisk asterisk -rx "pjsip show endpoints"
docker compose exec asterisk asterisk -rx "pjsip show transports"
```

You should see `1001` and `1002` listed as endpoints and `transport-ws` listed as a transport.

Live CLI (useful while debugging registration/call issues):

```bash
docker compose exec asterisk asterisk -rvvv
```

Inside the CLI, `pjsip set logger on` shows every SIP message.

## Test credentials (hardcoded, dev only)

| Endpoint | Username | Password |
|---|---|---|
| 1001 | `1001` | `1001pass` |
| 1002 | `1002` | `1002pass` |

## Signaling transport: plain WS, not WSS

This local setup deliberately uses **unencrypted WebSocket (`ws://localhost:8088/ws`)** instead of WSS. Two reasons:
- Avoids self-signed-certificate trust prompts while proving the telephony core works.
- Browsers treat `localhost` as a secure context, so `getUserMedia`/WebRTC still work fine over plain `ws://` at this stage.

Call **media** is still encrypted (DTLS-SRTP, via `media_encryption = dtls` in `pjsip.conf`) — only the SIP signaling channel is unencrypted, and only because it never leaves your machine. **Do not deploy this http.conf/pjsip.conf pair anywhere reachable over a real network.** Switching to real WSS (TLS termination + `tlsbindaddr` in `http.conf`) is part of getting this off `localhost` in a later phase.

## Why `rtp.conf` exists and the RTP port range matters

Asterisk runs inside the container, but your browser runs on the host — outside it. Two things had to line up for that to work:

- **`rtp.conf` pins `rtpstart`/`rtpend` to `10000-10020`**, a small range on purpose. Docker Desktop on Windows spins up one `docker-proxy` process per published UDP port; a large range (e.g. the Asterisk default `10000-20000`) is slow to bind and was flaky in testing (a transient "port already in use" error even though nothing else was actually using it). 21 ports is plenty for two hardcoded test endpoints.
- **`docker-compose.yml`'s port mapping must be 1:1** (`10000-10020:10000-10020/udp`, not e.g. `15000-15100:10000-10100`). If host and container port numbers differ, Asterisk advertises its *container-internal* port in ICE/SDP, but Docker only actually published a *different* host port — so the browser's ICE negotiation points at a port nothing is listening on. Keep these numbers identical if you ever change the range.
- **`pjsip.conf`'s `[transport-ws]` sets `external_media_address`/`external_signaling_address` to `127.0.0.1`** — otherwise Asterisk advertises its own container-internal IP (e.g. `172.x.x.x`, invisible from the host) instead of an address the host browser can actually reach.

## Testing with a browser softphone

`test-softphone.html` in this folder is a minimal self-contained SIP.js softphone built for this exact setup (WS server, domain, extension, and password fields all prefilled or easy to fill in) — no separate demo project needed.

1. Open `server/test-softphone.html` directly in a browser tab (double-click it, or drag it into the browser). If the mic permission prompt never appears or `getUserMedia` errors show up in the log, serve it over plain HTTP instead: `npx serve server` (or `python -m http.server 8080` from inside `server/`) and open `http://localhost:8080/test-softphone.html`.
2. Open a **second** tab the same way (use one normal window + one incognito window so they don't share any state).
3. Tab A: leave Extension `1001` / Password `1001pass`, click **Connect & Register**. Watch the log for `Registered as 1001.`
4. Tab B: change Extension to `1002`, Password to `1002pass`, click **Connect & Register**.
5. Tab A: set "Call extension" to `1002`, click **Call**.
6. Tab B: click **Answer** when the log shows an incoming call.
7. You should hear audio both ways (use headphones to avoid feedback since both tabs are on the same machine). Click **Hang up** on either side to end.

While testing, `docker compose exec asterisk asterisk -rx "pjsip show endpoints"` should now show a `Contact:` line under each registered endpoint and the state should flip from `Unavailable` to `Not in use` (or `In use` mid-call). See [../docs/phase0.md](../docs/phase0.md) §5 for the milestone checklist.

## Stopping / resetting

```bash
docker compose down
```

Config changes to `http.conf` / `pjsip.conf` / `extensions.conf` take effect on container restart, or live via:

```bash
docker compose exec asterisk asterisk -rx "core reload"
```
