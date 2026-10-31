import { StatusBar } from "expo-status-bar";
import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

type AppScreenProps = PropsWithChildren<{
  /** Colour painted behind the device status bar (signal, battery, clock). */
  statusBarColor?: string;
  /** Icon colour for the status bar. "light" = white icons (dark backdrop). */
  statusBarStyle?: "light" | "dark";
  /** Body colour used behind scroll content and inside the bottom inset. */
  backgroundColor?: string;
  edges?: Edge[];
}>;

/**
 * Full-screen shell that paints the status-bar inset itself.
 *
 * On Android (edge-to-edge in SDK 54) a plain SafeAreaView leaves the status
 * bar area transparent, so the light page colour shows through and the white
 * status-bar icons become invisible. This paints a solid strip behind them.
 */
export function AppScreen({
  children,
  statusBarColor = "#0B0F14",
  statusBarStyle = "light",
  backgroundColor = "#FFF6E7",
  edges = ["left", "right", "bottom"],
}: AppScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <StatusBar style={statusBarStyle} backgroundColor={statusBarColor} />
      <View style={[styles.statusStrip, { backgroundColor: statusBarColor, height: insets.top }]} />
      <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statusStrip: { width: "100%" },
  safe: { flex: 1 },
});
