/**
 * APNs (iOS) — NOT IMPLEMENTED YET, deliberately.
 *
 * iOS killed-state wake requires a PushKit *VoIP* push (not a regular APNs
 * alert), which in turn requires an Apple Developer account, a VoIP Services
 * certificate/key, and an iOS build of the app. None of those exist yet —
 * current Phase 2 work is Android-first. When iOS happens, implement with
 * the `@parse/node-apn` package (or raw HTTP/2 to api.push.apple.com) using
 * the .p8 auth key, topic "<bundle-id>.voip", push-type "voip".
 */
export function apnsReady(): boolean {
  return false;
}

export async function sendCallPush(_token: string, _callee: string, _caller: string): Promise<void> {
  throw new Error("APNs (iOS) push is not implemented yet — Android-first. See the comment in src/apns.ts.");
}
