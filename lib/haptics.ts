import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

function onDevice(action: () => Promise<void>) {
  if (Platform.OS !== "web") void action();
}

export const haptic = {
  light: () => onDevice(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => onDevice(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  selection: () => onDevice(() => Haptics.selectionAsync()),
  success: () => onDevice(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
