/**
 * Dev-only diagnostics tab: the live SIP/status log that used to sit on the
 * old combined Main screen. Remove (or hide behind a build flag) for real
 * end users in a later phase.
 */
import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useCall } from "../context/CallContext";

export default function ConsoleScreen() {
  const { log, status } = useCall();
  const logScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    logScrollRef.current?.scrollToEnd({ animated: true });
  }, [log]);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>Status: {status}</Text>
      <ScrollView ref={logScrollRef} style={styles.log} contentContainerStyle={styles.logContent}>
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
  status: { fontWeight: "bold", marginBottom: 6 },
  log: { flex: 1, borderWidth: 1, borderColor: "#888", padding: 6, marginBottom: 8 },
  logContent: { paddingBottom: 16 },
  logLine: { fontFamily: "monospace", fontSize: 12 },
});
