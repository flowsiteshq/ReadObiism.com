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
        tabBarActiveTintColor: "#151A52",
        tabBarButton: HapticTab,
        tabBarInactiveTintColor: "#777A9C",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "900", letterSpacing: 0.15 },
        tabBarStyle: {
          backgroundColor: "#FFF6E7",
          borderTopColor: "#DDD9EE",
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 9,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color }) => <IconSymbol size={23} name="safari.fill" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "My Edition", tabBarIcon: ({ color }) => <IconSymbol size={23} name="lock.shield.fill" color={color} /> }} />
    </Tabs>
  );
}
