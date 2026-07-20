import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../context/CallContext";
import SignInScreen from "../screens/SignInScreen";
import DialScreen from "../screens/DialScreen";
import HistoryScreen from "../screens/HistoryScreen";
import ConsoleScreen from "../screens/ConsoleScreen";
import InCallScreen from "../screens/InCallScreen";

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dial: "call",
  History: "time",
  Console: "terminal",
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] ?? "ellipse"} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Dial" component={DialScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Console" component={ConsoleScreen} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { registered, callState } = useCall();

  return (
    <NavigationContainer>
      {registered ? <MainTabs /> : <SignInScreen />}
      {callState !== "idle" && <InCallScreen />}
    </NavigationContainer>
  );
}
