import { StatusBar } from "expo-status-bar";
import { CallProvider } from "./src/context/CallContext";
import Navigation from "./src/navigation";

export default function App() {
  return (
    <CallProvider>
      <Navigation />
      <StatusBar style="auto" />
    </CallProvider>
  );
}
