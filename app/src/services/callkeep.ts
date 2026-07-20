/**
 * Guarded wrapper around react-native-callkeep (native module — inert until
 * the next rebuild includes it). Presents incoming calls through the OS's
 * native call UI (Android ConnectionService / iOS CallKit) and routes that
 * UI's Answer/End buttons back into CallContext.
 */
import { Platform } from "react-native";

interface CallKeepModule {
  setup(options: object): Promise<unknown>;
  setAvailable(active: boolean): void;
  displayIncomingCall(
    uuid: string,
    handle: string,
    localizedCallerName?: string,
    handleType?: string,
    hasVideo?: boolean
  ): void;
  setCurrentCallActive(uuid: string): void;
  endCall(uuid: string): void;
  addEventListener(type: string, handler: (args: { callUUID: string }) => void): void;
}

function getModule(): CallKeepModule | null {
  try {
    const m = require("react-native-callkeep");
    return (m?.default ?? m) as CallKeepModule;
  } catch {
    return null;
  }
}

let setupDone = false;
let activeUuid: string | null = null;

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CallKeepHandlers {
  onAnswer: () => void;
  onEnd: () => void;
  onLog: (message: string) => void;
}

export async function setup(handlers: CallKeepHandlers): Promise<boolean> {
  const ck = getModule();
  if (!ck) {
    handlers.onLog("CallKeep: native module not in this build yet — using in-app call UI only.");
    return false;
  }
  if (setupDone) return true;
  try {
    await ck.setup({
      ios: { appName: "LegOnline" },
      android: {
        alertTitle: "Calling account needed",
        alertDescription: "LegOnline needs a phone account so incoming calls ring like normal calls.",
        cancelButton: "Cancel",
        okButton: "Allow",
        additionalPermissions: [],
        foregroundService: {
          channelId: "legonline_calls",
          channelName: "LegOnline calls",
          notificationTitle: "LegOnline call in progress",
        },
      },
    });
    ck.setAvailable(true);
    ck.addEventListener("answerCall", ({ callUUID }) => {
      activeUuid = callUUID;
      handlers.onAnswer();
    });
    ck.addEventListener("endCall", () => {
      handlers.onEnd();
    });
    setupDone = true;
    handlers.onLog("CallKeep ready — incoming calls will use the native call UI.");
    return true;
  } catch (err) {
    handlers.onLog(`CallKeep setup failed: ${String(err)} — falling back to in-app UI.`);
    return false;
  }
}

/** Returns true if the native incoming-call UI was shown. */
export function displayIncoming(from: string): boolean {
  const ck = getModule();
  if (!ck || !setupDone || Platform.OS === "web") return false;
  try {
    activeUuid = uuidv4();
    ck.displayIncomingCall(activeUuid, from, from, "number", false);
    return true;
  } catch {
    return false;
  }
}

export function reportAnswered(): void {
  const ck = getModule();
  if (ck && activeUuid) {
    try {
      ck.setCurrentCallActive(activeUuid);
    } catch {}
  }
}

export function reportEnded(): void {
  const ck = getModule();
  if (ck && activeUuid) {
    try {
      ck.endCall(activeUuid);
    } catch {}
  }
  activeUuid = null;
}
