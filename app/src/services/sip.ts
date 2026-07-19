/**
 * SIP signaling for LegonLine, built on SIP.js's platform-agnostic core API
 * (UserAgent/Registerer) rather than Web.SimpleUser, which assumes a browser
 * DOM (an <audio> element, window.navigator.mediaDevices, etc.) that doesn't
 * exist in React Native.
 *
 * connectAndRegister()/disconnectAndUnregister() are fully implemented and
 * real. SIP.js's default WebSocket transport just calls `new WebSocket(...)`
 * on the global — React Native provides that natively — so no extra native
 * wiring is needed for signaling. This was verified by reading SIP.js's
 * actual source (node_modules/sip.js/lib/platform/web/transport/transport.js)
 * rather than assumed.
 *
 * call()/answer()/hangup() are NOT implemented yet — deliberately. Placing or
 * answering a call requires a SessionDescriptionHandler backed by real media,
 * and the browser test page's version (test-softphone.html) relied on
 * getUserMedia()/RTCPeerConnection, which don't exist in React Native without
 * react-native-webrtc. The path to implement these, next:
 *   1. At app startup, call `registerGlobals()` from "react-native-webrtc" —
 *      it polyfills navigator.mediaDevices, RTCPeerConnection, etc. as
 *      globals (confirmed this export exists in the installed package).
 *   2. SIP.js's *default* SessionDescriptionHandler is written against those
 *      same browser-shaped globals, so it may work once they're polyfilled,
 *      without writing a fully custom handler — this needs verifying against
 *      a real device/build, not assumed.
 *   3. There's no <audio> element in React Native. A received MediaStream
 *      plays through the device's audio output automatically once attached
 *      to the peer connection — react-native-webrtc handles that natively.
 */
import { UserAgent, Registerer, RegistererState } from "sip.js";
import type { UserAgentOptions } from "sip.js";

export interface SipCredentials {
  wssUrl: string;
  domain: string;
  extension: string;
  password: string;
}

export interface SipDelegate {
  onLog: (message: string) => void;
  onStatusChange: (status: string) => void;
  onRegistered: () => void;
  onUnregistered: () => void;
}

let userAgent: UserAgent | null = null;
let registerer: Registerer | null = null;

export function isConnected(): boolean {
  return userAgent !== null;
}

export async function connectAndRegister(creds: SipCredentials, delegate: SipDelegate): Promise<void> {
  if (userAgent) {
    throw new Error("Already connected — call disconnectAndUnregister() first.");
  }

  const uri = UserAgent.makeURI(`sip:${creds.extension}@${creds.domain}`);
  if (!uri) {
    throw new Error(`Invalid SIP URI for extension "${creds.extension}" / domain "${creds.domain}".`);
  }

  const options: UserAgentOptions = {
    uri,
    transportOptions: { server: creds.wssUrl },
    authorizationUsername: creds.extension,
    authorizationPassword: creds.password,
  };

  const ua = new UserAgent(options);
  const reg = new Registerer(ua);

  reg.stateChange.addListener((state) => {
    if (state === RegistererState.Registered) {
      delegate.onLog(`Registered as ${creds.extension}.`);
      delegate.onStatusChange("registered, idle");
      delegate.onRegistered();
    } else if (state === RegistererState.Unregistered) {
      delegate.onLog("Unregistered.");
      delegate.onStatusChange("not connected");
      delegate.onUnregistered();
    }
  });

  userAgent = ua;
  registerer = reg;

  try {
    delegate.onLog(`Connecting to ${creds.wssUrl} ...`);
    await ua.start();
    delegate.onLog("Connected. Registering ...");
    await reg.register();
  } catch (err) {
    userAgent = null;
    registerer = null;
    throw err;
  }
}

export async function disconnectAndUnregister(): Promise<void> {
  if (!userAgent || !registerer) {
    throw new Error("Not connected.");
  }
  const ua = userAgent;
  const reg = registerer;
  userAgent = null;
  registerer = null;
  try {
    await reg.unregister();
  } finally {
    await ua.stop();
  }
}

// --- Calling: not implemented yet — see the file header comment above. ---

export async function call(_targetExtension: string): Promise<void> {
  throw new Error(
    "call() is not implemented yet — needs react-native-webrtc wired in as the SIP.js media handler. See the comment at the top of src/services/sip.ts."
  );
}

export async function answer(): Promise<void> {
  throw new Error("answer() is not implemented yet — see the comment at the top of src/services/sip.ts.");
}

export async function hangup(): Promise<void> {
  throw new Error("hangup() is not implemented yet — see the comment at the top of src/services/sip.ts.");
}
