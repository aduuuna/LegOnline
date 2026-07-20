/**
 * Registers this device's FCM push token with the push-gateway, so Asterisk
 * can wake the phone for incoming calls when the app isn't running (Phase 2).
 *
 * Requires @react-native-firebase/app + /messaging AND a google-services.json
 * from a Firebase project, then a rebuild — see docs/phase2.md. Until then
 * this no-ops with a log line and everything else keeps working.
 */
import { Platform } from "react-native";
import { GATEWAY_URL } from "../config";

export async function registerForPush(extension: string, onLog: (message: string) => void): Promise<void> {
  if (Platform.OS !== "android") {
    onLog("Push: only Android is wired so far (Phase 2 is Android-first).");
    return;
  }
  let messaging: (() => { getToken(): Promise<string> }) | null = null;
  try {
    messaging = require("@react-native-firebase/messaging").default;
  } catch {
    onLog("Push: Firebase not set up yet — killed-state ringing inactive (docs/phase2.md).");
    return;
  }
  try {
    const token = await messaging!().getToken();
    const res = await fetch(`${GATEWAY_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extension, platform: "android", token }),
    });
    if (!res.ok) throw new Error(`gateway responded ${res.status}`);
    onLog(`Push: token registered with gateway for ${extension}.`);
  } catch (err) {
    onLog(`Push: registration failed — ${String(err)}`);
  }
}
