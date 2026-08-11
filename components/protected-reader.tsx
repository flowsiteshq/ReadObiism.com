import * as ScreenCapture from "expo-screen-capture";
import { PropsWithChildren, useEffect } from "react";
import { Platform } from "react-native";

/**
 * Applies native, best-effort screen-capture safeguards while paid reading
 * content is in view. The web preview intentionally does not claim protection.
 */
export function ProtectedReader({ children }: PropsWithChildren) {
  useEffect(() => {
    if (Platform.OS === "web") return;

    void ScreenCapture.preventScreenCaptureAsync("obi-ism-reader");
    if (Platform.OS === "ios") {
      void ScreenCapture.enableAppSwitcherProtectionAsync(0.72);
    }

    return () => {
      void ScreenCapture.allowScreenCaptureAsync("obi-ism-reader");
      if (Platform.OS === "ios") {
        void ScreenCapture.disableAppSwitcherProtectionAsync();
      }
    };
  }, []);

  return children;
}
