# LegonLine

Campus-WiFi VoIP calling for University of Ghana students. Each student's **student ID is their call line**, authenticated against the same credentials they already use to join the `STUDENT` WiFi. Built with Asterisk (server) and Expo / React Native (app).



---

## 1. Core idea (read this first)

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
                                   │  LegonLine app │
                                   │  (Expo dev     │
                                   │   build)       │
                                   └────────────────┘
```

**Important dependency:** the "one credential" design requires cooperation from campus IT, who control RADIUS/LDAP. Talk to them early. Until you have access, develop against a **local test LDAP or a static list of test student IDs**.

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

> Verify current versions and that the Expo config plugins still exist before pinning — these libraries move. `react-native-webrtc`, `react-native-callkeep`, and `expo-secure-store` are the ones to check.

---

## 3. Repository structure (monorepo)

```
legonline/
├── README.md
├── .gitignore
│
├── app/                          # Expo development build (the mobile app)
│   ├── app.json                  # Expo config + config plugins
│   ├── eas.json                  # EAS Build profiles (dev/preview/prod)
│   ├── package.json
│   ├── App.tsx                   # root: nav + call provider bootstrap
│   └── src/
│       ├── screens/
│       │   ├── SignInScreen.tsx  # student ID + password → register SIP
│       │   ├── DialScreen.tsx    # enter student ID, place/receive call
│       │   ├── InCallScreen.tsx  # active call: mute, hang up, timer
│       │   └── HistoryScreen.tsx # local call log
│       ├── services/
│       │   ├── sip.ts            # SIP.js + react-native-webrtc wrapper
│       │   ├── auth.ts           # SecureStore save/load/clear creds
│       │   ├── callkeep.ts       # native call UI + background lifecycle
│       │   └── push.ts           # register device token, handle wake push
│       ├── context/
│       │   └── CallContext.tsx   # global call state (idle/ringing/in-call)
│       ├── storage/
│       │   └── history.ts        # SQLite read/write for call history
│       ├── navigation/
│       │   └── index.tsx
│       └── config.ts             # WSS URL, SIP domain, gateway URL
│
├── server/                       # Asterisk configuration + deployment
│   ├── docker-compose.yml        # Asterisk container for local dev
│   ├── asterisk/
│   │   ├── pjsip.conf            # WebRTC transport + endpoint template
│   │   ├── extensions.conf       # dialplan: studentID → studentID
│   │   ├── http.conf             # WebSocket listener for WSS
│   │   ├── res_ldap.conf         # LDAP realtime mapping (when IT ready)
│   │   ├── extconfig.conf        # realtime table → LDAP wiring
│   │   └── certs/                # TLS certs for WSS (gitignored)
│   └── README.md                 # server-specific setup notes
│
├── push-gateway/                 # bridges Asterisk → APNs / FCM
│   ├── package.json
│   ├── src/
│   │   ├── index.ts              # POST /notify → send push
│   │   ├── apns.ts               # iOS VoIP push
│   │   └── fcm.ts                # Android high-priority data message
│   └── .env.example
│
└── docs/
    └── architecture.md           # diagrams, call flow, auth flow
```

Split into separate repos **only** if you later get separate teams or deploy pipelines. For now, one repo.

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

## 5. Implementation roadmap (build in this order)

**Do not jump ahead. Each phase should fully work before the next.**

### Phase 0 — Prove telephony works (no app yet)
- [ ] Run Asterisk in Docker (`server/docker-compose.yml`).
- [ ] Configure `pjsip.conf` with a WebRTC transport + **two hardcoded test endpoints** (`1001`, `1002`).
- [ ] Dialplan in `extensions.conf`: dialing an extension rings that endpoint.
- [ ] Test with a browser WebRTC softphone (e.g. a SIP.js demo page) — call `1001` → `1002`.
- ✅ **Milestone:** two browser tabs call each other through your Asterisk.

### Phase 1 — Minimal app, foreground calling
- [ ] `expo prebuild` / EAS **development build** (NOT Expo Go).
- [ ] Install `react-native-webrtc`, `sip.js`, `expo-secure-store`, `expo-sqlite`.
- [ ] **SignIn** screen → `sip.ts` registers against Asterisk using entered ID/password; store creds in SecureStore.
- [ ] Auto-login: on launch, if SecureStore has creds → silently re-register → land on Dial.
- [ ] **Dial** screen → place a call by student ID.
- [ ] **InCall** screen → mute + hang up + call timer.
- [ ] **History** → write each call to SQLite, list it.
- ✅ **Milestone:** one phone calls another, both apps open, over campus WiFi.

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
- WiFi auto-join on sign-in (iOS `NEHotspotConfiguration`, Android `WifiNetworkSuggestion`) — platform-restricted, prompty, likely needs MDM. **Verify current OS API state before attempting.**
- Call recording (server-side `MixMonitor`) — mind consent/legal rules.
- `STAFF` WiFi support / staff directory.

---

## 6. Setup

### Prerequisites
- Node.js LTS, npm/yarn
- Docker + Docker Compose (for local Asterisk)
- An Expo account + EAS CLI (`npm i -g eas-cli`)
- A physical Android/iOS device (simulators can't do real WebRTC audio well)

### Server (local dev)
```bash
cd server
docker compose up -d
# edit asterisk/pjsip.conf, extensions.conf, then:
docker compose exec asterisk asterisk -rx "core reload"
```

### App
```bash
cd app
npm install
npx expo prebuild            # generate native projects
eas build --profile development --platform android   # or ios
# install the dev build on your device, then:
npx expo start --dev-client
```

### Push gateway (Phase 2)
```bash
cd push-gateway
cp .env.example .env         # add APNs key + FCM credentials
npm install && npm run dev
```

---

## 7. Config you'll touch most

**`app/src/config.ts`**
```ts
export const SIP = {
  wssUrl: "wss://asterisk.legon.example:8089/ws", // your WSS endpoint
  domain: "asterisk.legon.example",               // SIP domain
};
export const GATEWAY_URL = "https://push.legon.example"; // Phase 2
```

**`server/asterisk/pjsip.conf`** (sketch — WebRTC transport + endpoint template)
```ini
[transport-wss]
type = transport
protocol = wss
bind = 0.0.0.0

[endpoint-template](!)
type = endpoint
context = students
disallow = all
allow = opus,ulaw
webrtc = yes
; ... aors/auth wired to realtime LDAP in Phase 3

[1001](endpoint-template)
auth = 1001-auth
aors = 1001
```

**`server/asterisk/extensions.conf`** (sketch — student ID dials student ID)
```ini
[students]
exten => _X.,1,NoOp(Call to ${EXTEN})
 same => n,Dial(PJSIP/${EXTEN},30)
 same => n,Hangup()
```

---

## 8. Key decisions & honest caveats

- **Expo Go will not run this.** You need a development build. Plan for it from day one.
- **Background receiving is the hard part**, not the calling. Ship foreground first.
- **The one-credential design depends on campus IT** giving you RADIUS/LDAP access. Have that conversation before Phase 3.
- **WiFi auto-join** is possible but platform-restricted and OS-version-sensitive — treat as optional, verify current APIs.
- **Recording** has consent/legal requirements (Ghana + campus policy). Deferred by choice.
- **Test on real devices.** WebRTC audio on simulators is unreliable.

---

## 9. Glossary
- **AOR** – Address of Record (where an endpoint is reachable)
- **CDR** – Call Detail Record (Asterisk's call log)
- **DTLS-SRTP** – encrypted media for WebRTC
- **WSS** – secure WebSocket (SIP signaling transport)
- **ConnectionService / CallKit** – native OS incoming-call UI (Android / iOS)