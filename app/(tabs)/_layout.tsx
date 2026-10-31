import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 11 : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: "#0B0F14",
        tabBarButton: HapticTab,
        // Keep the bar out of the way of the keyboard instead of letting it
        // float over the inputs (which ate taps on the account/explore forms).
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: "#5A5F72",
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "900", letterSpacing: 0.15 },
        tabBarStyle: {
          backgroundColor: "#FFF6E7",
          borderTopColor: "#E3DCC8",
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 9,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} />, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color }) => <IconSymbol size={23} name="safari.fill" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "My Edition", tabBarIcon: ({ color }) => <IconSymbol size={23} name="lock.shield.fill" color={color} /> }} />
    </Tabs>
  );
}
