import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import * as sip from "../services/sip";
import type { SipCredentials } from "../services/sip";

interface CallContextValue {
  log: string[];
  status: string;
  registered: boolean;
  register: (creds: SipCredentials) => Promise<void>;
  unregister: () => Promise<void>;
  call: (targetExtension: string) => Promise<void>;
  answer: () => Promise<void>;
  hangup: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState("not connected");
  const [registered, setRegistered] = useState(false);
  const registeredRef = useRef(false);

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
        });
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
        addLog(`Calling ${targetExtension} ...`);
        await sip.call(targetExtension);
      } catch (err) {
        addLog(`ERROR: ${errText(err)}`);
        throw err;
      }
    },
    [addLog]
  );

  const answer = useCallback(async () => {
    try {
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

  return (
    <CallContext.Provider value={{ log, status, registered, register, unregister, call, answer, hangup }}>
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
