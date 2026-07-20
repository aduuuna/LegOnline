import React, { useState } from "react";
import { Button, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../context/CallContext";
import { clearCredentials } from "../services/auth";

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

export default function DialScreen() {
  const { status, callState, call, unregister } = useCall();
  const [number, setNumber] = useState("");

  async function signOut() {
    await clearCredentials();
    await unregister().catch(() => {});
  }

  function press(key: string) {
    if (key === "⌫") {
      setNumber((n) => n.slice(0, -1));
    } else if (key) {
      setNumber((n) => n + key);
    }
  }

  const canCall = callState === "idle" && number.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.status}>{status}</Text>
        <Button title="Sign out" onPress={signOut} />
      </View>

      <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
        {number || " "}
      </Text>

      <View style={styles.pad}>
        {KEYS.map((row, r) => (
          <View key={r} style={styles.padRow}>
            {row.map((key, c) =>
              key ? (
                <Pressable
                  key={c}
                  style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                  onPress={() => press(key)}
                  onLongPress={() => key === "⌫" && setNumber("")}
                >
                  <Text style={styles.keyText}>{key}</Text>
                </Pressable>
              ) : (
                <View key={c} style={styles.keySpacer} />
              )
            )}
          </View>
        ))}
      </View>

      <View style={styles.callRow}>
        <Pressable
          style={[styles.callButton, !canCall && styles.callButtonDisabled]}
          onPress={() => call(number).catch(() => {})}
          disabled={!canCall}
          accessibilityLabel="Call"
        >
          <Ionicons name="call" size={32} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  status: { fontWeight: "bold", flexShrink: 1 },
  display: {
    fontSize: 40,
    textAlign: "center",
    marginVertical: 20,
    minHeight: 52,
    color: "#000",
    fontVariant: ["tabular-nums"],
  },
  pad: { flex: 1, justifyContent: "center", gap: 12 },
  padRow: { flexDirection: "row", justifyContent: "space-evenly" },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: "#ccc" },
  keySpacer: { width: 72, height: 72 },
  keyText: { fontSize: 28, color: "#000" },
  callRow: { alignItems: "center", marginVertical: 16 },
  callButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  callButtonDisabled: { backgroundColor: "#9cccaa" },
});
