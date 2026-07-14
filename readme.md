# LegonLine

Campus-WiFi VoIP calling for University of Ghana students. Each student's **student ID is their call line**, authenticated against the same credentials they already use to join the `STUDENT` WiFi. Built with Asterisk (server) and Expo / React Native (app).

No syncing separate user databases — Asterisk authenticates against the same directory as campus WiFi. Full design, tech stack, and call flow: [docs/architecture.md](docs/architecture.md).

## Status

- ✅ **Phase 0 — Asterisk core telephony proven.** Two hardcoded test endpoints registering and calling each other over WebRTC in Docker. Details: [docs/phase0.md](docs/phase0.md).
- ⬜ Phase 1 — minimal Expo app, foreground calling
- ⬜ Phase 2 — background/killed-state receiving (CallKeep + push)
- ⬜ Phase 3 — real LDAP-backed identity

Full roadmap: [docs/architecture.md](docs/architecture.md#5-implementation-roadmap).

## Repo layout

```
app/            Expo app (not started yet)
server/         Asterisk config + docker-compose — see server/readme.md
push-gateway/   Asterisk → APNs/FCM bridge (Phase 2)
docs/           architecture.md, phase0.md
```

## Quick start (server)

```bash
cd server
docker compose up -d
```
See [server/readme.md](server/readme.md) for testing it with a browser softphone.
