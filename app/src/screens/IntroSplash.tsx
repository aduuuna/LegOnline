/**
 * JS-side intro splash. The native splash (expo-splash-screen) shows the same
 * rounded logo, same size, centered on white — this screen renders on top of
 * the app with an identical layout, so the handoff is invisible. It then types
 * the tagline out, holds briefly, and fades away.
 *
 * The tagline lives here in JS, not baked into an image, so changing it never
 * requires a native rebuild.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

const TAGLINE = "Talk more. Pay nothing.";
const TYPE_INTERVAL_MS = 55;
const HOLD_AFTER_TYPED_MS = 600;
const FADE_MS = 350;

// Must match the native splash: imageWidth 200 in app.json, source is 565x688.
const LOGO_WIDTH = 200;
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * 688) / 565);

export default function IntroSplash({ onDone }: { onDone: () => void }) {
  const [typedCount, setTypedCount] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  // First paint of this screen replaces the native splash pixel-for-pixel.
  const handleLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTypedCount((n) => {
        if (n >= TAGLINE.length) {
          clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typedCount < TAGLINE.length) return;
    const hold = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => onDone());
    }, HOLD_AFTER_TYPED_MS);
    return () => clearTimeout(hold);
  }, [typedCount, opacity, onDone]);

  const typing = typedCount < TAGLINE.length;

  return (
    <Animated.View style={[styles.container, { opacity }]} onLayout={handleLayout}>
      <Image source={require("../../assets/logo-rounded.png")} style={styles.logo} />
      <View style={styles.taglineWrap}>
        <Text style={styles.tagline}>
          {TAGLINE.slice(0, typedCount)}
          {typing ? <Text>▍</Text> : null}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  // Absolutely positioned so the logo stays dead-center (matching the native
  // splash) no matter how much of the tagline has been typed.
  taglineWrap: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: LOGO_HEIGHT / 2 + 28,
    alignItems: "center",
  },
  tagline: { fontSize: 19, fontWeight: "600", color: "#1A274A", letterSpacing: 0.3 },
});
