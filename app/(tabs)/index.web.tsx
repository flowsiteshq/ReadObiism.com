import { useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";

const LANDMARK_VIDEO = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031545745/BaHpjaYMSfAHjKqb.mp4";

export default function ObiIsmWebsite() {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMotion = () => {
    const video = videoRef.current;
    if (!video) return;
    if (videoPlaying) video.pause(); else void video.play();
    setVideoPlaying((current) => !current);
  };

  const readOpening = () => router.push("/reader?chapterId=preface" as never);
  const explore = () => router.push("/(tabs)/explore" as never);

  return (
    <View style={[styles.page, { height }]}>
      <StatusBar style="light" backgroundColor="rgba(6,10,33,0.15)" />
      <video
        ref={videoRef}
        src={LANDMARK_VIDEO}
        autoPlay
        loop
        muted
        playsInline
        style={{ bottom: 0, height: "100%", left: 0, objectFit: "cover", position: "absolute", right: 0, top: 0, width: "100%" }}
      />
      <View style={styles.atmosphere} />
      <View style={styles.bottomGradient} />

      <View style={[styles.shell, desktop && styles.shellDesktop]}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="OBI-ISM welcome screen" onPress={() => setMenuOpen(false)} style={styles.brandButton}>
            <Text style={[styles.brand, desktop && styles.brandDesktop]}>OBI–ISM</Text>
            <Text style={styles.brandSub}>BUILDING A JUST SOCIETY THROUGH CHARACTER</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={() => setMenuOpen(true)} style={styles.menuButton}>
            <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLineAccent} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCopy, desktop && styles.heroCopyDesktop]}>
          <View style={styles.eyebrowRow}><View style={styles.eyebrowDot} /><Text style={styles.eyebrow}>NIGERIA IN VIEW</Text></View>
          <Text style={[styles.title, desktop && styles.titleDesktop]}>Character{`\n`}is public{`\n`}architecture.</Text>
          <Text style={[styles.description, desktop && styles.descriptionDesktop]}>A living philosophy for the people, institutions, and future we choose to build.</Text>
        </View>

        <View style={[styles.actionsArea, desktop && styles.actionsAreaDesktop]}>
          <View style={[styles.actions, desktop && styles.actionsDesktop]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Read the opening of OBI-ISM" onPress={readOpening} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Read the opening</Text><Text style={styles.primaryButtonArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore the OBI-ISM ideas" onPress={explore} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Explore the ideas</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomBar}>
            <Text style={styles.location}>LAGOS · ABUJA · A SHARED FUTURE</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={videoPlaying ? "Pause landmark video" : "Play landmark video"} onPress={toggleMotion} style={styles.motionButton}>
              <Text style={styles.motionIcon}>{videoPlaying ? "Ⅱ" : "▶"}</Text><Text style={styles.motionText}>{videoPlaying ? "PAUSE MOTION" : "PLAY MOTION"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {menuOpen && (
        <View style={styles.menuSheet}>
          <View style={[styles.menuShell, desktop && styles.shellDesktop]}>
            <View style={styles.header}>
              <Text style={styles.brand}>OBI–ISM</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={() => setMenuOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            </View>
            <View style={styles.menuItems}>
              <MenuItem index="01" label="Read the opening" onPress={readOpening} />
              <MenuItem index="02" label="Explore the ideas" onPress={explore} />
              <MenuItem index="03" label="View contents" onPress={() => router.push("/contents" as never)} />
              <MenuItem index="04" label="My edition" onPress={() => router.push("/(tabs)/account" as never)} />
            </View>
            <Text style={styles.menuFooter}>PRIVATE DIGITAL EDITION · 2026</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function MenuItem({ index, label, onPress }: { index: string; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.menuItem}><Text style={styles.menuIndex}>{index}</Text><Text style={styles.menuLabel}>{label}</Text><Text style={styles.menuArrow}>→</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#0A1038", flex: 1, minHeight: 720, overflow: "hidden", position: "relative" },
  backgroundMedia: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  atmosphere: { backgroundColor: "rgba(6, 10, 40, 0.1)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  bottomGradient: { backgroundColor: "rgba(7, 13, 56, 0.38)", bottom: 0, height: "63%", left: 0, position: "absolute", right: 0 },
  shell: { flex: 1, justifyContent: "space-between", paddingBottom: 25, paddingHorizontal: 24, paddingTop: 31 },
  shellDesktop: { alignSelf: "center", maxWidth: 1240, width: "100%" },
  header: { alignItems: "flex-start", borderBottomColor: "rgba(255,255,255,0.24)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingBottom: 19 },
  brandButton: { paddingVertical: 1 },
  brand: { color: "#FFFFFF", fontSize: 27, fontWeight: "900", letterSpacing: 0.55 },
  brandDesktop: { fontSize: 30 },
  brandSub: { color: "#E0E4FF", fontSize: 8, fontWeight: "900", letterSpacing: 0.9, marginTop: 4 },
  menuButton: { alignItems: "flex-end", justifyContent: "center", minHeight: 38, minWidth: 44, padding: 6 },
  menuLine: { backgroundColor: "#FFFFFF", height: 2, marginVertical: 3, width: 28 },
  menuLineAccent: { backgroundColor: "#DFFF4F", height: 2, marginTop: 3, width: 16 },
  heroCopy: { marginTop: 54, maxWidth: 370 },
  heroCopyDesktop: { marginTop: 78, maxWidth: 645 },
  eyebrowRow: { alignItems: "center", flexDirection: "row" },
  eyebrowDot: { backgroundColor: "#DFFF4F", borderRadius: 6, height: 9, marginRight: 8, width: 9 },
  eyebrow: { color: "#DFFF4F", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 53, fontWeight: "700", letterSpacing: -1.55, lineHeight: 52, marginTop: 15 },
  titleDesktop: { fontSize: 82, lineHeight: 76 },
  description: { color: "#F1F2FF", fontSize: 16, lineHeight: 24, marginTop: 20, maxWidth: 320 },
  descriptionDesktop: { fontSize: 19, lineHeight: 29, maxWidth: 450 },
  actionsArea: { marginTop: 18 },
  actionsAreaDesktop: { marginTop: 38 },
  actions: { gap: 11 },
  actionsDesktop: { flexDirection: "row", maxWidth: 525 },
  primaryButton: { alignItems: "center", backgroundColor: "#DFFF4F", flex: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 55, paddingHorizontal: 20 },
  primaryButtonText: { color: "#101642", fontSize: 14, fontWeight: "900" },
  primaryButtonArrow: { color: "#101642", fontSize: 21 },
  secondaryButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.86)", borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 55, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  bottomBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 17 },
  location: { color: "#E8EAFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.75 },
  motionButton: { alignItems: "center", flexDirection: "row", gap: 7, padding: 6 },
  motionIcon: { color: "#DFFF4F", fontSize: 12 },
  motionText: { color: "#FFFFFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.65 },
  menuSheet: { backgroundColor: "#10164B", bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 },
  menuShell: { flex: 1, justifyContent: "space-between", paddingBottom: 25, paddingHorizontal: 24, paddingTop: 31 },
  closeButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.55)", borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  closeText: { color: "#FFFFFF", fontSize: 27, fontWeight: "300", lineHeight: 30 },
  menuItems: { flex: 1, justifyContent: "center" },
  menuItem: { alignItems: "center", borderBottomColor: "rgba(255,255,255,0.19)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingVertical: 21 },
  menuIndex: { color: "#DFFF4F", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, width: 43 },
  menuLabel: { color: "#FFFFFF", flex: 1, fontFamily: "serif", fontSize: 29, fontWeight: "700" },
  menuArrow: { color: "#DFFF4F", fontSize: 23 },
  menuFooter: { color: "#C4CAF6", fontSize: 8, fontWeight: "900", letterSpacing: 0.95 },
});
