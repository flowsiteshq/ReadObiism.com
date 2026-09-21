import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { hasSeenCinematicEntry, markCinematicEntrySeen } from "@/lib/entry-storage";

export function CinematicEntry() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let active = true;
    const finish = () => {
        if (active) setVisible(false);
        void markCinematicEntrySeen();
    };
    // Never let an unavailable local store block the opening cover.
    let timer: ReturnType<typeof setTimeout> = setTimeout(finish, 2200);
    void hasSeenCinematicEntry().then((returning) => {
      if (!returning) return;
      clearTimeout(timer);
      timer = setTimeout(finish, 450);
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return <View pointerEvents="none" style={styles.overlay}><View style={styles.rule} /><Text style={styles.brand}>OBI–<Text style={styles.gold}>ISM</Text></Text><Text style={styles.tagline}>IDEAS · INTEGRITY · IMPACT</Text><Text style={styles.note}>A DIGITAL PUBLICATION</Text></View>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: "center", backgroundColor: "#030508", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0, zIndex: 30 },
  rule: { backgroundColor: "#E9C46A", height: 2, marginBottom: 18, width: 48 },
  brand: { color: "#FFFFFF", fontFamily: "serif", fontSize: 48, fontWeight: "700", letterSpacing: -1.2 },
  gold: { color: "#E9C46A" },
  tagline: { color: "#F2EEE6", fontSize: 9, fontWeight: "900", letterSpacing: 3.2, marginTop: 10 },
  note: { color: "#A8A8A4", fontSize: 8, fontWeight: "900", letterSpacing: 1.8, marginTop: 42 },
});
