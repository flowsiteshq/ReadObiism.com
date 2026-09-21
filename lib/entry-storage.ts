import AsyncStorage from "@react-native-async-storage/async-storage";

const ENTRY_VISITED_KEY = "obi-ism.cinematic-entry-seen";

export async function hasSeenCinematicEntry(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENTRY_VISITED_KEY)) === "true";
}

export async function markCinematicEntrySeen(): Promise<void> {
  await AsyncStorage.setItem(ENTRY_VISITED_KEY, "true");
}
