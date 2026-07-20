import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform, Vibration } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as sip from "../services/sip";
import type { SipCredentials } from "../services/sip";
import * as callkeep from "../services/callkeep";
import { registerForPush } from "../services/push";
import { addCallToHistory } from "../storage/history";

export type CallState = "idle" | "calling" | "incoming" | "in-call";

// react-native-incall-manager is a native module that isn't in the installed
// binary until the next rebuild — resolve it lazily and treat any failure as
// "feature not available yet".
function getInCallManager(): {
  start?: (o: object) => void;
  stop?: () => void;
  setSpeakerphoneOn?: (on: boolean) => void;
  startRingtone?: (ringtone: string) => void;
  stopRingtone?: () => void;
} | null {
  try {
    const m = require("react-native-incall-manager");
    return m?.default ?? m ?? null;
  } catch {
    return null;
  }
}

async function ensureMicPermission(addLog: (message: string) => void): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (already) {
    addLog("Microphone permission: already granted.");
    return true;
  }
  addLog("Requesting microphone permission ...");
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: "Microphone",
    message: "LegOnline needs your microphone to make calls.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });
  const granted = result === PermissionsAndroid.RESULTS.GRANTED;
  addLog(granted ? "Microphone permission granted." : `Microphone permission: ${result}.`);
  return granted;
}

interface CallContextValue {
  log: string[];
  status: string;
  registered: boolean;
  callState: CallState;
  callPeer: string | null;
  callStartedAt: number | null;
  muted: boolean;
  speakerOn: boolean;
  register: (creds: SipCredentials) => Promise<void>;
  unregister: () => Promise<void>;
  call: (targetExtension: string) => Promise<void>;
  answer: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const RING_VIBRATION_PATTERN = [400, 800];

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState("not connected");
  const [registered, setRegistered] = useState(false);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callPeer, setCallPeer] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const registeredRef = useRef(false);
  const speakerOnRef = useRef(false);

  const addLog = useCallback((message: string) => {
    setLog((prev) => [...prev, `[${timestamp()}] ${message}`]);
  }, []);

  const register = useCallback(
    async (creds: SipCredentials) => {
      try {
        await sip.connectAndRegister(creds, {
          onLog: addLog,
          onStatusChange: setStatus,
          onRegistered: () => {
            registeredRef.current = true;
            setRegistered(true);
          },
          onUnregistered: () => {
            registeredRef.current = false;
            setRegistered(false);
          },
          onCallReceived: (fromExtension) => {
            setCallPeer(fromExtension);
            setCallState("incoming");
            // Prefer the OS-native incoming-call UI (CallKeep) — it rings and
            // vibrates by itself. Fall back to our own ringtone + vibration.
            const nativeUiShown = callkeep.displayIncoming(fromExtension);
            if (!nativeUiShown) {
              Vibration.vibrate(RING_VIBRATION_PATTERN, true);
              try {
                getInCallManager()?.startRingtone?.("_DEFAULT_");
              } catch {}
            }
          },
          onCallAnswered: () => {
            Vibration.cancel();
            try {
              getInCallManager()?.stopRingtone?.();
            } catch {}
            callkeep.reportAnswered();
            setCallState("in-call");
            setCallStartedAt(Date.now());
            setMuted(false);
            activateKeepAwakeAsync().catch(() => {});
            try {
              getInCallManager()?.start?.({ media: "audio" });
              if (speakerOnRef.current) {
                getInCallManager()?.setSpeakerphoneOn?.(true);
              }
            } catch {
              // Native module not in this build yet — audio still works,
              // just without routing control.
            }
          },
          onCallEnded: (info) => {
            Vibration.cancel();
            try {
              getInCallManager()?.stopRingtone?.();
            } catch {}
            callkeep.reportEnded();
            setCallState("idle");
            setCallPeer(null);
            setCallStartedAt(null);
            setMuted(false);
            setSpeakerOn(false);
            speakerOnRef.current = false;
            deactivateKeepAwake().catch(() => {});
            try {
              getInCallManager()?.stop?.();
            } catch {}
            addCallToHistory({
              peer: info.peer,
              direction: info.direction,
              timestamp: info.startedAt,
              durationSeconds: info.durationSeconds,
            }).catch((err) => addLog(`ERROR saving call to history: ${errText(err)}`));
          },
        });
        // Phase 2: tell the push-gateway where to reach this device. No-ops
        // with a log line until Firebase is configured (docs/phase2.md).
        registerForPush(creds.extension, addLog).catch(() => {});
      } catch (err) {
        addLog(`ERROR: ${errText(err)}`);
        setStatus("error");
        throw err;
      }
    },
    [addLog]
  );

  const unregister = useCallback(async () => {
    try {
      await sip.disconnectAndUnregister();
    } catch (err) {
      addLog(`ERROR: ${errText(err)}`);
      throw err;
    }
  }, [addLog]);

  const call = useCallback(
    async (targetExtension: string) => {
      try {
        if (!(await ensureMicPermission(addLog))) {
          throw new Error("Microphone permission denied — enable it in Settings > Apps > LegOnline.");
        }
        addLog(`Calling ${targetExtension} ...`);
        setCallPeer(targetExtension);
        setCallState("calling");
        await sip.call(targetExtension);
      } catch (err) {
        setCallState("idle");
        setCallPeer(null);
        addLog(`ERROR: ${errText(err)}`);
        throw err;
      }
    },
    [addLog]
  );

  const answer = useCallback(async () => {
    try {
      Vibration.cancel();
      if (!(await ensureMicPermission(addLog))) {
        throw new Error("Microphone permission denied — enable it in Settings > Apps > LegOnline.");
      }
      await sip.answer();
    } catch (err) {
      addLog(`ERROR: ${errText(err)}`);
      throw err;
    }
  }, [addLog]);

  const hangup = useCallback(async () => {
    try {
      await sip.hangup();
    } catch (err) {
      addLog(`ERROR: ${errText(err)}`);
      throw err;
    }
  }, [addLog]);

  // CallKeep: wire the native call UI's Answer/End buttons to our SIP layer.
  // setup() is internally idempotent and self-disables if the native module
  // isn't in this build yet.
  useEffect(() => {
    callkeep.setup({
      onAnswer: () => {
        answer().catch(() => {});
      },
      onEnd: () => {
        hangup().catch(() => {});
      },
      onLog: addLog,
    });
  }, [answer, hangup, addLog]);

  const toggleMute = useCallback(() => {
    try {
      sip.setMuted(!muted);
      setMuted(!muted);
      addLog(!muted ? "Microphone muted." : "Microphone unmuted.");
    } catch (err) {
      addLog(`ERROR: ${errText(err)}`);
    }
  }, [muted, addLog]);

  const toggleSpeaker = useCallback(() => {
    const icm = getInCallManager();
    if (!icm?.setSpeakerphoneOn) {
      addLog("Speaker toggle needs the next app rebuild (react-native-incall-manager).");
      return;
    }
    try {
      icm.setSpeakerphoneOn(!speakerOn);
      speakerOnRef.current = !speakerOn;
      setSpeakerOn(!speakerOn);
      addLog(!speakerOn ? "Speaker on." : "Speaker off — earpiece.");
    } catch {
      addLog("Speaker toggle needs the next app rebuild (react-native-incall-manager).");
    }
  }, [speakerOn, addLog]);

  return (
    <CallContext.Provider
      value={{
        log,
        status,
        registered,
        callState,
        callPeer,
        callStartedAt,
        muted,
        speakerOn,
        register,
        unregister,
        call,
        answer,
        hangup,
        toggleMute,
        toggleSpeaker,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall() must be used inside a <CallProvider>.");
  return ctx;
}

function errText(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const e = err as { name?: string; message?: string };
    return e.name ? `${e.name}: ${e.message ?? ""}` : String(e.message ?? err);
  }
  return String(err);
}
