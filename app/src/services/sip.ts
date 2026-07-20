/**
 * SIP signaling + media for LegOnline, built on SIP.js's core API
 * (UserAgent/Registerer/Inviter/Invitation) rather than Web.SimpleUser, which
 * assumes a browser DOM (an <audio> element, etc.) that doesn't exist in
 * React Native.
 *
 * Signaling: SIP.js's default WebSocket transport just calls
 * `new WebSocket(...)` on the global — React Native provides that natively.
 *
 * Media: `registerGlobals()` from react-native-webrtc (called once below)
 * polyfills `navigator.mediaDevices` and `RTCPeerConnection` as globals.
 * SIP.js's default SessionDescriptionHandler is written against exactly those
 * two globals (verified in node_modules/sip.js/lib/platform/web/
 * session-description-handler/), so no custom sessionDescriptionHandlerFactory
 * is needed. There's no <audio> element in React Native — a received remote
 * audio track plays through the device's audio output automatically once the
 * peer connection is established; react-native-webrtc handles that natively.
 */
import { registerGlobals } from "react-native-webrtc";
import {
  Inviter,
  Invitation,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  UserAgent,
} from "sip.js";
import type { UserAgentOptions } from "sip.js";

registerGlobals();

export interface SipCredentials {
  wssUrl: string;
  domain: string;
  extension: string;
  password: string;
}

export interface CallEndedInfo {
  peer: string;
  direction: "incoming" | "outgoing";
  startedAt: number; // ms since epoch, when the call was placed/received
  answered: boolean;
  durationSeconds: number; // 0 if never answered
}

export interface SipDelegate {
  onLog: (message: string) => void;
  onStatusChange: (status: string) => void;
  onRegistered: () => void;
  onUnregistered: () => void;
  onCallReceived: (fromExtension: string) => void;
  onCallAnswered: () => void;
  onCallEnded: (info: CallEndedInfo) => void;
}

const AUDIO_ONLY = {
  sessionDescriptionHandlerOptions: {
    constraints: { audio: true, video: false },
  },
};

let userAgent: UserAgent | null = null;
let registerer: Registerer | null = null;
let currentDelegate: SipDelegate | null = null;
let currentDomain = "";

let session: Session | null = null;
let sessionPeer = "";
let sessionDirection: "incoming" | "outgoing" = "outgoing";
let sessionStartedAt = 0;
let sessionAnsweredAt: number | null = null;

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
    delegate: {
      onInvite: (invitation) => handleIncomingCall(invitation),
    },
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
  currentDelegate = delegate;
  currentDomain = creds.domain;

  try {
    delegate.onLog(`Connecting to ${creds.wssUrl} ...`);
    await ua.start();
    delegate.onLog("Connected. Registering ...");
    await reg.register();
  } catch (err) {
    userAgent = null;
    registerer = null;
    currentDelegate = null;
    await ua.stop().catch(() => {
      // Best effort — the UA may never have fully started.
    });
    throw err;
  }
}

export async function disconnectAndUnregister(): Promise<void> {
  if (!userAgent || !registerer) {
    throw new Error("Not connected.");
  }
  if (session) {
    await hangup().catch(() => {
      // Best effort — don't let a hangup failure block disconnecting.
    });
  }
  const ua = userAgent;
  const reg = registerer;
  userAgent = null;
  registerer = null;
  currentDelegate = null;
  try {
    await reg.unregister();
  } finally {
    await ua.stop();
  }
}

export async function call(targetExtension: string): Promise<void> {
  if (!userAgent || !currentDelegate) {
    throw new Error("Not connected — register first.");
  }
  if (session) {
    throw new Error("A call is already in progress.");
  }

  const target = UserAgent.makeURI(`sip:${targetExtension}@${currentDomain}`);
  if (!target) {
    throw new Error(`Invalid target extension "${targetExtension}".`);
  }

  const inviter = new Inviter(userAgent, target, AUDIO_ONLY);
  trackSession(inviter, targetExtension, "outgoing");
  currentDelegate.onStatusChange("calling");
  await inviter.invite();
}

export async function answer(): Promise<void> {
  if (!session || !(session instanceof Invitation)) {
    throw new Error("No incoming call to answer.");
  }
  await session.accept(AUDIO_ONLY);
}

export async function hangup(): Promise<void> {
  const s = session;
  if (!s) {
    throw new Error("No active call.");
  }
  switch (s.state) {
    case SessionState.Initial:
    case SessionState.Establishing:
      if (s instanceof Inviter) {
        await s.cancel();
      } else if (s instanceof Invitation) {
        await s.reject();
      }
      break;
    case SessionState.Established:
      await s.bye();
      break;
    default:
      // Already terminating/terminated — nothing to do.
      break;
  }
}

// Enables/disables the local (microphone) audio tracks of the active call.
// The default SDH doesn't type its peerConnection, so use a minimal shape.
interface MinimalSender {
  track: { enabled: boolean } | null;
}
interface MinimalPeerConnection {
  getSenders(): MinimalSender[];
}

export function setMuted(muted: boolean): void {
  if (!session) {
    throw new Error("No active call.");
  }
  const sdh = session.sessionDescriptionHandler as unknown as
    | { peerConnection?: MinimalPeerConnection }
    | undefined;
  const pc = sdh?.peerConnection;
  if (!pc) {
    throw new Error("Call has no media session yet.");
  }
  for (const sender of pc.getSenders()) {
    if (sender.track) {
      sender.track.enabled = !muted;
    }
  }
}

function handleIncomingCall(invitation: Invitation): void {
  const delegate = currentDelegate;
  if (!delegate) {
    invitation.reject().catch(() => {});
    return;
  }
  if (session) {
    delegate.onLog(`Rejected incoming call from ${invitation.remoteIdentity.uri.user ?? "unknown"} — already in a call.`);
    invitation.reject({ statusCode: 486 }).catch(() => {});
    return;
  }

  const from = invitation.remoteIdentity.uri.user ?? "unknown";
  trackSession(invitation, from, "incoming");
  delegate.onLog(`Incoming call from ${from}. Press Answer.`);
  delegate.onStatusChange("incoming call");
  delegate.onCallReceived(from);
}

function trackSession(s: Session, peer: string, direction: "incoming" | "outgoing"): void {
  session = s;
  sessionPeer = peer;
  sessionDirection = direction;
  sessionStartedAt = Date.now();
  sessionAnsweredAt = null;

  s.stateChange.addListener((state) => {
    const delegate = currentDelegate;
    switch (state) {
      case SessionState.Established:
        sessionAnsweredAt = Date.now();
        delegate?.onLog("Call answered — audio should be flowing.");
        delegate?.onStatusChange("in call");
        delegate?.onCallAnswered();
        break;
      case SessionState.Terminated: {
        if (session !== s) {
          break; // A newer call has already replaced this one.
        }
        const info: CallEndedInfo = {
          peer: sessionPeer,
          direction: sessionDirection,
          startedAt: sessionStartedAt,
          answered: sessionAnsweredAt !== null,
          durationSeconds:
            sessionAnsweredAt !== null ? Math.round((Date.now() - sessionAnsweredAt) / 1000) : 0,
        };
        session = null;
        sessionAnsweredAt = null;
        delegate?.onLog("Call ended.");
        delegate?.onStatusChange(userAgent ? "registered, idle" : "not connected");
        delegate?.onCallEnded(info);
        break;
      }
      default:
        break;
    }
  });
}
