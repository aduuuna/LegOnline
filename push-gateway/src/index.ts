/**
 * LegOnline push-gateway.
 *
 * Why this exists: Asterisk cannot talk to FCM/APNs itself. When a call
 * arrives for an endpoint with no registered contact (app killed/background),
 * the Asterisk dialplan hits POST /notify here; this service looks up the
 * callee's device push token and sends the wake-up push. The app, when it
 * signs in, reports its token via POST /register.
 *
 * Dev-simple by design: tokens persist in a JSON file, no auth on the
 * endpoints. Fine on a trusted LAN; both get hardened in a later phase.
 */
import express from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fcm from "./fcm.js";
import * as apns from "./apns.js";

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_FILE = join(ROOT, "data", "tokens.json");
const SERVICE_ACCOUNT = process.env.FCM_SERVICE_ACCOUNT ?? join(ROOT, "fcm-service-account.json");

interface DeviceRecord {
  platform: "android" | "ios";
  token: string;
  updatedAt: string;
}

// extension -> device
let devices: Record<string, DeviceRecord> = {};
if (existsSync(TOKENS_FILE)) {
  devices = JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
  console.log(`[store] loaded ${Object.keys(devices).length} device token(s).`);
}

function persist(): void {
  mkdirSync(dirname(TOKENS_FILE), { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify(devices, null, 2));
}

fcm.initFcm(SERVICE_ACCOUNT);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Asterisk's CURL() posts form-encoded

app.get("/health", (_req, res) => {
  res.json({ ok: true, fcm: fcm.fcmReady(), apns: apns.apnsReady(), devices: Object.keys(devices).length });
});

// App calls this after a successful SIP registration.
app.post("/register", (req, res) => {
  const { extension, platform, token } = req.body ?? {};
  if (!extension || !token || (platform !== "android" && platform !== "ios")) {
    res.status(400).json({ error: "expected { extension, platform: 'android'|'ios', token }" });
    return;
  }
  devices[String(extension)] = { platform, token: String(token), updatedAt: new Date().toISOString() };
  persist();
  console.log(`[register] ${extension} (${platform}) token …${String(token).slice(-8)}`);
  res.json({ ok: true });
});

// Asterisk dialplan calls this when the callee has no registered contact.
app.post("/notify", async (req, res) => {
  const callee = String(req.body?.ext ?? req.query?.ext ?? "");
  const caller = String(req.body?.from ?? req.query?.from ?? "unknown");
  if (!callee) {
    res.status(400).json({ error: "missing ext" });
    return;
  }
  const device = devices[callee];
  if (!device) {
    console.log(`[notify] ${caller} -> ${callee}: no token on file, cannot wake.`);
    res.status(404).json({ error: "no device token for extension" });
    return;
  }
  try {
    if (device.platform === "android") {
      await fcm.sendCallPush(device.token, callee, caller);
    } else {
      await apns.sendCallPush(device.token, callee, caller);
    }
    console.log(`[notify] ${caller} -> ${callee}: push sent (${device.platform}).`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[notify] ${caller} -> ${callee}: push FAILED —`, (err as Error).message);
    res.status(502).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`LegOnline push-gateway listening on :${PORT} (FCM ${fcm.fcmReady() ? "ready" : "NOT configured"})`);
});
