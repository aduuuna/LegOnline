import React, { useEffect, useRef, useState } from "react";
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../context/CallContext";
import { SIP_CONFIG } from "../config";
import { loadCredentials, saveCredentials } from "../services/auth";

export default function MainScreen() {
  const { log, status, registered, register, unregister, call, answer, hangup } = useCall();

  const [server, setServer] = useState(SIP_CONFIG.wssUrl);
  const [domain, setDomain] = useState(SIP_CONFIG.domain);
  const [extension, setExtension] = useState("1001");
  const [password, setPassword] = useState("1001pass");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [target, setTarget] = useState("1002");

  const logScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadCredentials().then((saved) => {
      if (saved) {
        setExtension(saved.extension);
        setPassword(saved.password);
      }
    });
  }, []);

  useEffect(() => {
    logScrollRef.current?.scrollToEnd({ animated: true });
  }, [log]);

  async function handleRegister() {
    await register({ wssUrl: server, domain, extension, password });
    await saveCredentials(extension, password);
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        <Text style={styles.label}>WebSocket server</Text>
        <TextInput style={styles.input} value={server} onChangeText={setServer} autoCapitalize="none" />

        <Text style={styles.label}>Domain</Text>
        <TextInput style={styles.input} value={domain} onChangeText={setDomain} autoCapitalize="none" />

        <Text style={styles.label}>Extension</Text>
        <TextInput style={styles.input} value={extension} onChangeText={setExtension} autoCapitalize="none" />

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

        <View style={styles.buttonRow}>
          <Button title="Connect & Register" onPress={handleRegister} disabled={registered} />
          <Button title="Unregister & Disconnect" onPress={unregister} disabled={!registered} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Call</Text>

        <Text style={styles.label}>Call extension</Text>
        <TextInput style={styles.input} value={target} onChangeText={setTarget} autoCapitalize="none" />

        <View style={styles.buttonRow}>
          <Button title="Call" onPress={() => call(target)} disabled={!registered} />
          <Button title="Answer" onPress={() => answer()} />
          <Button title="Hang up" onPress={() => hangup()} />
        </View>
      </View>

      <Text style={styles.status}>Status: {status}</Text>

      <ScrollView ref={logScrollRef} style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 6 },
  label: { marginTop: 6, marginBottom: 2 },
  input: { borderWidth: 1, borderColor: "#888", padding: 6, color: "#000" },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1 },
  eyeButton: { paddingHorizontal: 10, paddingVertical: 6 },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 8 },
  status: { fontWeight: "bold", marginBottom: 6 },
  log: { flex: 1, borderWidth: 1, borderColor: "#888", padding: 6 },
  logLine: { fontFamily: "monospace", fontSize: 12 },
});
