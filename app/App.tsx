import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { CallProvider } from "./src/context/CallContext";
import Navigation from "./src/navigation";
import IntroSplash from "./src/screens/IntroSplash";

// Keep the native splash up until IntroSplash has painted its first frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [introDone, setIntroDone] = useState(false);

  return (
    <CallProvider>
      <Navigation />
      {!introDone && <IntroSplash onDone={() => setIntroDone(true)} />}
      <StatusBar style="auto" />
    </CallProvider>
  );
}
