import { Stack } from "expo-router";

/** The web experience is a focused companion site rather than the mobile tab shell. */
export default function WebLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
