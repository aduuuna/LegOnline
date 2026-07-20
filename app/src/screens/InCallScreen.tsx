/**
 * Full-screen call UI, rendered as an overlay above navigation whenever a
 * call is incoming, being placed, or in progress (architecture.md's "InCall"
 * screen: mute + hang up + call timer, plus answer/decline for incoming).
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../context/CallContext";

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function RoundButton({
  icon,
  color,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <View style={styles.roundWrap}>
      <Pressable
        style={({ pressed }) => [
          styles.round,
          { backgroundColor: color },
          active && styles.roundActive,
          pressed && styles.roundPressed,
        ]}
        onPress={onPress}
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={30} color="#fff" />
      </Pressable>
      <Text style={styles.roundLabel}>{label}</Text>
    </View>
  );
}

export default function InCallScreen() {
  const { callState, callPeer, callStartedAt, muted, speakerOn, answer, hangup, toggleMute, toggleSpeaker } =
    useCall();
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    if (callStartedAt === null) {
      setCallSeconds(0);
      return;
    }
    setCallSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
    const timer = setInterval(() => {
      setCallSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [callStartedAt]);

  const heading =
    callState === "incoming" ? "Incoming call" : callState === "calling" ? "Calling ..." : "In call";

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.peer}>{callPeer ?? "unknown"}</Text>
      {callState === "in-call" && <Text style={styles.timer}>{formatDuration(callSeconds)}</Text>}

      <View style={styles.controls}>
        {callState === "in-call" && (
          <View style={styles.buttonRow}>
            <RoundButton
              icon={muted ? "mic-off" : "mic"}
              color="#3a4a75"
              active={muted}
              label={muted ? "Unmute" : "Mute"}
              onPress={toggleMute}
            />
            <RoundButton
              icon={speakerOn ? "volume-high" : "volume-medium"}
              color="#3a4a75"
              active={speakerOn}
              label="Speaker"
              onPress={toggleSpeaker}
            />
          </View>
        )}
        <View style={styles.buttonRow}>
          {callState === "incoming" && (
            <RoundButton icon="call" color="#1DB954" label="Answer" onPress={() => answer().catch(() => {})} />
          )}
          <RoundButton
            icon="call"
            color="#E53935"
            label={callState === "incoming" ? "Decline" : callState === "calling" ? "Cancel" : "Hang up"}
            onPress={() => hangup().catch(() => {})}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#1A274A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 20,
  },
  heading: { color: "#B8C0D8", fontSize: 18 },
  peer: { color: "#FFFFFF", fontSize: 40, fontWeight: "bold", marginTop: 8 },
  timer: { color: "#B8C0D8", fontSize: 20, marginTop: 8, fontVariant: ["tabular-nums"] },
  controls: { position: "absolute", bottom: 56, left: 24, right: 24 },
  buttonRow: { flexDirection: "row", justifyContent: "space-evenly", marginTop: 20 },
  roundWrap: { alignItems: "center" },
  round: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  roundActive: { borderWidth: 3, borderColor: "#fff" },
  roundPressed: { opacity: 0.7 },
  roundLabel: { color: "#B8C0D8", marginTop: 6, fontSize: 12 },
});
