import React, { useEffect, useRef, useState } from "react";
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../context/CallContext";
import { SIP_CONFIG } from "../config";
import { loadCredentials, saveCredentials } from "../services/auth";

// Module-level so signing out doesn't re-trigger auto-login when this screen
// remounts — auto-login should only happen once per app launch.
let autoLoginAttempted = false;

export default function SignInScreen() {
  const { register, status } = useCall();

  const [extension, setExtension] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [server, setServer] = useState(SIP_CONFIG.wssUrl);
  const [domain, setDomain] = useState(SIP_CONFIG.domain);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function signIn(ext: string, pass: string, wssUrl: string, dom: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await register({ wssUrl, domain: dom, extension: ext, password: pass });
      await saveCredentials(ext, pass);
    } catch {
      // Already reported via the console log + status; stay on this screen.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Auto-login: if credentials were saved by a previous sign-in, register
  // silently on launch (architecture.md Phase 1 item).
  useEffect(() => {
    loadCredentials().then((saved) => {
      if (!saved) return;
      setExtension(saved.extension);
      setPassword(saved.password);
      if (!autoLoginAttempted) {
        autoLoginAttempted = true;
        signIn(saved.extension, saved.password, SIP_CONFIG.wssUrl, SIP_CONFIG.domain);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>LegOnline</Text>
      <Text style={styles.subtitle}>Sign in with your extension</Text>

      <Text style={styles.label}>Student ID / extension</Text>
      <TextInput
        style={styles.input}
        value={extension}
        onChangeText={setExtension}
        autoCapitalize="none"
        placeholder="e.g. 1001"
      />

      <Text style={styles.label}>Password</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!passwordVisible}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.eyeButton}
          onPress={() => setPasswordVisible((v) => !v)}
          hitSlop={8}
          accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
        >
          <Ionicons name={passwordVisible ? "eye-off" : "eye"} size={22} color="#000" />
        </Pressable>
      </View>

      <View style={styles.signInButton}>
        <Button
          title={busy ? "Signing in ..." : "Sign in"}
          onPress={() => signIn(extension.trim(), password, server.trim(), domain.trim())}
          disabled={busy || !extension.trim() || !password}
        />
      </View>

      <Text style={styles.status}>Status: {status}</Text>

      <Pressable onPress={() => setShowAdvanced((v) => !v)} hitSlop={8}>
        <Text style={styles.advancedToggle}>
          {showAdvanced ? "▾ Hide server settings" : "▸ Server settings (dev)"}
        </Text>
      </Pressable>
      {showAdvanced && (
        <View>
          <Text style={styles.label}>WebSocket server</Text>
          <TextInput style={styles.input} value={server} onChangeText={setServer} autoCapitalize="none" />
          <Text style={styles.label}>Domain</Text>
          <TextInput style={styles.input} value={domain} onChangeText={setDomain} autoCapitalize="none" />
          <Text style={styles.hint}>
            Auto-detected from the dev machine. After changing networks, run server/update-lan-ip.ps1 on the
            PC, then reload the app.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "bold", textAlign: "center", color: "#1A274A" },
  subtitle: { textAlign: "center", color: "#555", marginBottom: 24 },
  label: { marginTop: 10, marginBottom: 2 },
  input: { borderWidth: 1, borderColor: "#888", padding: 8, color: "#000" },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1 },
  eyeButton: { paddingHorizontal: 10, paddingVertical: 6 },
  signInButton: { marginTop: 16 },
  status: { marginTop: 12, textAlign: "center", fontWeight: "bold" },
  advancedToggle: { marginTop: 20, color: "#1A274A", fontWeight: "600" },
  hint: { marginTop: 8, fontSize: 12, color: "#666" },
});
