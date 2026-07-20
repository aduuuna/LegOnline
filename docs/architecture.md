# Architecture

## 1. Core idea

There is **one identity**, not two. Campus WiFi (`STUDENT`) runs WPA2-Enterprise → RADIUS → LDAP/Active Directory. That directory holds the student ID + password. We point **Asterisk at the same directory**, so a student's SIP account *is* their student ID and authenticates against the same source as their WiFi. No syncing two user databases.

```
                 ┌─────────────────────────────┐
                 │   University Identity Store  │
                 │      (LDAP / RADIUS / AD)    │
                 └───────────▲──────────▲───────┘
                             │          │
              WiFi auth      │          │   SIP auth
             (802.1X)        │          │  (res_config_ldap / RADIUS shim)
                             │          │
                    ┌────────┴───┐  ┌───┴─────────┐
                    │   STUDENT  │  │   Asterisk  │
                    │    WiFi    │  │  (chan_pjsip│
                    │  (RADIUS)  │  │  + WebRTC)  │
                    └────────────┘  └──────▲──────┘
                                           │ WSS (WebSocket) + DTLS-SRTP
                                           │
                                   ┌───────┴────────┐
                                   │  LegOnline app │
                                   │  (Expo dev     │
                                   │   build)       │
                                   └────────────────┘
```

**Important dependency:** this design requires cooperation from campus IT, who control RADIUS/LDAP. Until that access exists, develop against a local test Asterisk with hardcoded endpoints (see [phase0.md](phase0.md)) or a test LDAP.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Telephony server | **Asterisk**, `chan_pjsip`, WebRTC transport (WSS + DTLS-SRTP) | WebRTC path is the best-maintained way to reach RN clients |
| Endpoint auth | `res_config_ldap` (realtime) or RADIUS shim | reuse WiFi credentials |
| App framework | **Expo** with a **development build** (EAS Build / `expo prebuild`) | SIP/WebRTC needs native modules → **Expo Go will NOT work** |
| SIP signaling | **SIP.js** (or JsSIP) | JS SIP over WebSocket |
| Media/audio | **react-native-webrtc** | has an Expo config plugin |
| Native call UI + background | **react-native-callkeep** | CallKit (iOS) / ConnectionService (Android) |
| Push wake-up | PushKit/APNs (iOS) + FCM (Android) | receive calls when app is killed |
| Credential storage | **expo-secure-store** | Keychain / Keystore, encrypted |
| Local call history | expo-sqlite (or AsyncStorage) | on-device history for MVP |
| Push gateway | small Node/Express service | Asterisk → APNs/FCM bridge |

> Verify current versions and that the Expo config plugins still exist before pinning — these libraries move.

---

## 3. Repository structure (monorepo)

```
legonline/
├── readme.md
├── app/                          # Expo development build (the mobile app)
│   ├── app.json / eas.json / package.json
│   ├── App.tsx                   # root: nav + call provider bootstrap
│   └── src/
│       ├── screens/              # SignIn, Dial, InCall, History
│       ├── services/             # sip.ts, auth.ts, callkeep.ts, push.ts
│       ├── context/CallContext.tsx
│       ├── storage/history.ts
│       ├── navigation/index.tsx
│       └── config.ts             # WSS URL, SIP domain, gateway URL
│
├── server/                       # Asterisk configuration + deployment
│   ├── docker-compose.yml
│   ├── test-softphone.html       # browser SIP.js client for manual testing
│   └── asterisk/                 # pjsip.conf, extensions.conf, http.conf, rtp.conf, res_ldap.conf, extconfig.conf
│
├── push-gateway/                 # bridges Asterisk → APNs / FCM
│   └── src/                      # index.ts, apns.ts, fcm.ts
│
└── docs/
    ├── architecture.md           # this file
    └── phase0.md                 # detailed Phase 0 walkthrough
```

Split into separate repos **only** if separate teams or deploy pipelines emerge later.

---

## 4. Call & background architecture

### 4.1 Placing a call (foreground)
1. App is registered (SIP over WSS) as endpoint `<studentID>`.
2. User types the callee's student ID on the Dial screen.
3. SIP.js sends `INVITE` to Asterisk → dialplan resolves the callee endpoint → rings.
4. react-native-webrtc negotiates DTLS-SRTP audio. Done.

### 4.2 Receiving calls — the three tiers

| Tier | State | How it works | Phase |
|---|---|---|---|
| 1 | App **foreground** | WebSocket alive, SIP registered, INVITE arrives directly | MVP |
| 2 | App **backgrounded, alive** | **Android:** foreground service keeps socket alive. **iOS:** unreliable — needs push | MVP (Android), Phase 2 (iOS) |
| 3 | App **killed / swiped** | **Push-to-wake** required on both platforms | Phase 2 |

### 4.3 Push-to-wake flow (Phase 2)
```
Caller ──INVITE──▶ Asterisk
                     │  callee endpoint not currently registered?
                     ▼
              dialplan hook (ARI / AGI / webhook)
                     │  POST /notify {calleeId}
                     ▼
              push-gateway ──APNs VoIP push──▶ iOS device  ─┐
                          └──FCM data msg────▶ Android dev ─┤
                                                            ▼
                                          app wakes, reports to CallKit /
                                          ConnectionService, registers SIP
                                                            │
                     ◀──────── now-registered endpoint ─────┘
              Asterisk routes the INVITE → call connects
```
Asterisk cannot send APNs/FCM directly — that's the entire reason `push-gateway` exists.

---

## 5. Implementation roadmap

**Do not jump ahead. Each phase should fully work before the next.**

### Phase 0 — Prove telephony works (no app yet) — ✅ complete
- [x] Run Asterisk in Docker.
- [x] `pjsip.conf` with a WebRTC transport + two hardcoded test endpoints (`1001`, `1002`).
- [x] Dialplan: dialing an extension rings that endpoint.
- [x] Tested with a browser WebRTC softphone (`server/test-softphone.html`) — two tabs called each other through Asterisk, two-way audio confirmed.
- Full walkthrough and gotchas: [phase0.md](phase0.md).

### Phase 1 — Minimal app, foreground calling
- [x] `expo prebuild` / EAS **development build** (NOT Expo Go).
- [x] Install `react-native-webrtc`, `sip.js`, `expo-secure-store`, `expo-sqlite`.
- [x] **SignIn** screen → `sip.ts` registers against Asterisk using entered ID/password; store creds in SecureStore.
- [x] Auto-login: on launch, if SecureStore has creds → silently re-register → land on Dial.
- [x] **Dial** screen → place a call by student ID (phone-style tap dialpad).
- [x] **InCall** screen → mute + hang up + call timer (+ speaker toggle, answer/decline for incoming; full-screen overlay during any call).
- [x] **History** → write each call to SQLite, list it.
- [ ] ✅ **Milestone:** one phone calls another, both apps open, over campus WiFi. *(verified phone ↔ PC-browser so far; the two-phone run is the last gate — see phase1.md §6)*

### Phase 2 — Background & killed-state receiving
- [ ] Add `react-native-callkeep`; show native incoming-call UI.
- [ ] Android: foreground service to hold the socket while backgrounded.
- [ ] Build `push-gateway`; add the Asterisk dialplan hook that calls it.
- [ ] iOS PushKit VoIP push; Android FCM high-priority data message.
- [ ] Wake → register → answer flow end-to-end.
- ✅ **Milestone:** call a phone whose app is swiped away; it rings.

### Phase 3 — Real identity backend
- [ ] Replace hardcoded endpoints with `res_config_ldap` realtime against the university directory (needs IT).
- [ ] Endpoints resolve dynamically; auth delegates to LDAP/RADIUS.
- ✅ **Milestone:** any real student ID works, no per-user config.

### Later / optional
- WiFi auto-join on sign-in (iOS `NEHotspotConfiguration`, Android `WifiNetworkSuggestion`) — platform-restricted, prompty, likely needs MDM. Verify current OS API state before attempting.
- Call recording (server-side `MixMonitor`) — mind consent/legal rules.
- `STAFF` WiFi support / staff directory.

---

## 6. Config reference

**`app/src/config.ts`**
```ts
export const SIP = {
  wssUrl: "wss://asterisk.legon.example:8089/ws", // your WSS endpoint
  domain: "asterisk.legon.example",               // SIP domain
};
export const GATEWAY_URL = "https://push.legon.example"; // Phase 2
```

**`server/asterisk/pjsip.conf`** — see the file itself for the working Phase 0 version (WebRTC transport + two hardcoded endpoints, `external_media_address` set for local Docker testing). Phase 3 wires `aors`/`auth` to realtime LDAP instead.

**`server/asterisk/extensions.conf`**
```ini
[students]
exten => _X.,1,NoOp(Call to ${EXTEN})
 same => n,Dial(PJSIP/${EXTEN},30)
 same => n,Hangup()
```

---

## 7. Key decisions & honest caveats

- **Expo Go will not run this.** You need a development build. Plan for it from day one.
- **Background receiving is the hard part**, not the calling. Ship foreground first.
- **The one-credential design depends on campus IT** giving RADIUS/LDAP access. Have that conversation before Phase 3.
- **WiFi auto-join** is possible but platform-restricted and OS-version-sensitive — treat as optional, verify current APIs.
- **Recording** has consent/legal requirements (Ghana + campus policy). Deferred by choice.
- **Test on real devices.** WebRTC audio on simulators is unreliable.
- **Docker-in-the-middle NAT**: when Asterisk runs in a container and the client is on the host (all of local dev), RTP port ranges and `external_media_address` must be set deliberately or calls register but carry no audio — see [phase0.md](phase0.md) for what that looked like in practice.

---

## 8. Glossary
- **AOR** – Address of Record (where an endpoint is reachable)
- **CDR** – Call Detail Record (Asterisk's call log)
- **DTLS-SRTP** – encrypted media for WebRTC
- **WSS** – secure WebSocket (SIP signaling transport)
- **ConnectionService / CallKit** – native OS incoming-call UI (Android / iOS)
