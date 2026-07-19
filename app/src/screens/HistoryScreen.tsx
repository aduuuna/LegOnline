import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Button, FlatList, StyleSheet, Text, View } from "react-native";
import { clearCallHistory, deleteCallHistoryEntry, getCallHistory } from "../storage/history";
import type { CallHistoryEntry } from "../storage/history";

export default function HistoryScreen() {
  const [entries, setEntries] = useState<CallHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    getCallHistory().then(setEntries);
  }, []);

  // Reload every time this screen becomes visible, since a call placed from
  // MainScreen writes to history while HistoryScreen isn't mounted.
  useFocusEffect(refresh);

  async function handleDelete(id: number) {
    await deleteCallHistoryEntry(id);
    refresh();
  }

  async function handleClearAll() {
    await clearCallHistory();
    refresh();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Call history</Text>
        <Button title="Clear all" onPress={handleClearAll} disabled={entries.length === 0} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={styles.empty}>No calls yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.peer}>
                {item.direction === "outgoing" ? "Called " : "From "}
                {item.peer}
              </Text>
              <Text style={styles.meta}>
                {new Date(item.timestamp).toLocaleString()} · {item.durationSeconds}s
              </Text>
            </View>
            <Button title="Delete" onPress={() => handleDelete(item.id)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontWeight: "bold", fontSize: 16 },
  empty: { marginTop: 20, textAlign: "center", color: "#666" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingVertical: 8,
  },
  rowText: { flexShrink: 1 },
  peer: { fontWeight: "bold" },
  meta: { color: "#555", fontSize: 12 },
});
