/**
 * FCM (Android) push sending via firebase-admin.
 *
 * Needs a Firebase service-account key file — Firebase console → Project
 * settings → Service accounts → "Generate new private key". Point the
 * FCM_SERVICE_ACCOUNT env var at it (see .env.example). Until that file
 * exists the gateway still runs; /notify just reports FCM as unconfigured.
 */
import { existsSync, readFileSync } from "node:fs";
import admin from "firebase-admin";

let initialized = false;

export function initFcm(serviceAccountPath: string): boolean {
  if (!existsSync(serviceAccountPath)) {
    console.warn(`[fcm] service account file not found at "${serviceAccountPath}" — FCM disabled until provided.`);
    return false;
  }
  const credentials = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(credentials) });
  initialized = true;
  console.log(`[fcm] initialized for project "${credentials.project_id}".`);
  return true;
}

export function fcmReady(): boolean {
  return initialized;
}

/**
 * Data-only + high priority is deliberate: a "notification" message would be
 * displayed by the OS itself and would NOT wake the app's JS in the killed
 * state. A high-priority data message invokes the app's background handler,
 * which reports the call to CallKeep (full-screen incoming UI) and registers
 * with Asterisk.
 */
export async function sendCallPush(token: string, callee: string, caller: string): Promise<void> {
  if (!initialized) {
    throw new Error("FCM not configured — see push-gateway/.env.example.");
  }
  await admin.messaging().send({
    token,
    android: { priority: "high", ttl: 30_000 },
    data: {
      type: "incoming_call",
      callee,
      caller,
      sentAt: String(Date.now()),
    },
  });
}
