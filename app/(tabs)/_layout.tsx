import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 11 : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#17372E",
        tabBarButton: HapticTab,
        tabBarInactiveTintColor: "#7A867E",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.15 },
        tabBarStyle: {
          backgroundColor: "#FBF8F0",
          borderTopColor: "#D8CFB9",
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Library", tabBarIcon: ({ color }) => <IconSymbol size={23} name="books.vertical.fill" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "My Edition", tabBarIcon: ({ color }) => <IconSymbol size={23} name="lock.shield.fill" color={color} /> }} />
    </Tabs>
  );
}
