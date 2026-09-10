import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";

import { ScreenContainer } from "@/components/screen-container";
import { chapters } from "@/lib/book-data";
import { haptic } from "@/lib/haptics";
import { getReadingPosition, type ReadingPosition } from "@/lib/reader-storage";

const LANDMARK_VIDEO = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031545745/uXVqeNlDbhxxPulw.mp4";
const LANDMARK_POSTER = "/manus-storage/obi-ism-nigeria-landmarks-poster_bd8477a0.jpg";

type MenuDestination = "/reader" | "/contents" | "/(tabs)/explore" | "/(tabs)/account";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const player = useVideoPlayer(LANDMARK_VIDEO, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useFocusEffect(
    useCallback(() => {
      void getReadingPosition().then(setPosition);
    }, []),
  );

  const activeChapter = chapters.find((chapter) => chapter.id === position?.chapterId) ?? chapters[0];

  const navigate = (destination: MenuDestination) => {
    haptic.light();
    setMenuOpen(false);
    if (destination === "/reader") {
      router.push(`/reader?chapterId=${activeChapter.id}` as never);
      return;
    }
    router.push(destination as never);
  };

  const toggleMotion = () => {
    haptic.selection();
    if (videoPlaying) player.pause(); else player.play();
    setVideoPlaying((current) => !current);
  };

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} className="p-0" containerClassName="bg-background">
      <StatusBar style="light" backgroundColor="rgba(8,12,37,0.18)" translucent />
      <View style={styles.stage}>
        {!videoReady && <Image source={{ uri: LANDMARK_POSTER }} contentFit="cover" transition={250} style={styles.backgroundMedia} accessibilityLabel="Nigerian landmarks at blue hour" />}
        <VideoView style={styles.backgroundMedia} player={player} contentFit="cover" nativeControls={false} playsInline onFirstFrameRender={() => setVideoReady(true)} />
        <View style={styles.videoVeil} />
        <View style={styles.bottomVeil} />

        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View>
            <Text style={styles.wordmark}>OBI–ISM</Text>
            <Text style={styles.descriptor}>BUILDING A JUST SOCIETY</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open OBI-ISM menu" onPress={() => { haptic.selection(); setMenuOpen(true); }} style={styles.menuButton}>
            <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLineShort} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.statementBlock}>
            <View style={styles.kickerRow}><View style={styles.kickerDot} /><Text style={styles.kicker}>NIGERIA IN VIEW</Text></View>
            <Text style={styles.title}>Character{`\n`}is public{`\n`}architecture.</Text>
            <Text style={styles.description}>A protected digital edition for people building a more just society.</Text>
          </View>

          <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Begin reading the current OBI-ISM chapter" onPress={() => navigate("/reader")} style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>{position ? "Continue reading" : "Begin reading"}</Text><Text style={styles.primaryArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open My Edition" onPress={() => navigate("/(tabs)/account")} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>My edition</Text>
            </TouchableOpacity>
            <View style={styles.footerRow}>
              <Text style={styles.location}>LAGOS · ABUJA · A SHARED FUTURE</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={videoPlaying ? "Pause landmark background motion" : "Play landmark background motion"} onPress={toggleMotion} style={styles.motionButton}>
                <Text style={styles.motionIcon}>{videoPlaying ? "Ⅱ" : "▶"}</Text><Text style={styles.motionLabel}>{videoPlaying ? "PAUSE" : "PLAY"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {menuOpen && (
          <View style={[styles.menuSheet, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.menuHeader}><Text style={styles.menuBrand}>OBI–ISM</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close OBI-ISM menu" onPress={() => setMenuOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></TouchableOpacity></View>
            <View style={styles.menuLinks}>
              <MenuItem number="01" label="Continue reading" onPress={() => navigate("/reader")} />
              <MenuItem number="02" label="Explore ideas" onPress={() => navigate("/(tabs)/explore")} />
              <MenuItem number="03" label="Contents" onPress={() => navigate("/contents")} />
              <MenuItem number="04" label="My edition" onPress={() => navigate("/(tabs)/account")} />
            </View>
            <Text style={styles.menuFoot}>PRIVATE DIGITAL EDITION</Text>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

function MenuItem({ number, label, onPress }: { number: string; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.menuItem}><Text style={styles.menuNumber}>{number}</Text><Text style={styles.menuItemText}>{label}</Text><Text style={styles.menuArrow}>→</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  stage: { backgroundColor: "#0B1035", flex: 1, minHeight: 650, overflow: "hidden", position: "relative" },
  backgroundMedia: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  videoVeil: { backgroundColor: "rgba(3, 8, 28, 0.22)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  bottomVeil: { backgroundColor: "rgba(7, 13, 52, 0.46)", bottom: 0, height: "58%", left: 0, position: "absolute", right: 0 },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24 },
  wordmark: { color: "#FFFFFF", fontSize: 27, fontWeight: "900", letterSpacing: 0.5 },
  descriptor: { color: "#D6DAFE", fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 3 },
  menuButton: { alignItems: "flex-end", justifyContent: "center", minHeight: 38, minWidth: 44, padding: 7 },
  menuLine: { backgroundColor: "#FFFFFF", height: 2, marginVertical: 3, width: 29 },
  menuLineShort: { backgroundColor: "#DFFF4F", height: 2, marginTop: 3, width: 16 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 84 },
  statementBlock: { maxWidth: 340 },
  kickerRow: { alignItems: "center", flexDirection: "row" },
  kickerDot: { backgroundColor: "#DFFF4F", borderRadius: 5, height: 9, marginRight: 8, width: 9 },
  kicker: { color: "#DFFF4F", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 51, fontWeight: "700", letterSpacing: -1.4, lineHeight: 52, marginTop: 15 },
  description: { color: "#F4F5FF", fontSize: 16, lineHeight: 24, marginTop: 20, maxWidth: 315 },
  actions: { gap: 11, paddingTop: 36 },
  primaryAction: { alignItems: "center", backgroundColor: "#DFFF4F", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 19, paddingVertical: 17 },
  primaryActionText: { color: "#11173E", fontSize: 14, fontWeight: "900" },
  primaryArrow: { color: "#11173E", fontSize: 21 },
  secondaryAction: { alignItems: "center", borderColor: "rgba(255,255,255,0.82)", borderWidth: 1, paddingHorizontal: 19, paddingVertical: 16 },
  secondaryActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  footerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  location: { color: "#D7DBFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  motionButton: { alignItems: "center", flexDirection: "row", gap: 5, padding: 6 },
  motionIcon: { color: "#DFFF4F", fontSize: 12 },
  motionLabel: { color: "#FFFFFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  menuSheet: { backgroundColor: "#10164B", bottom: 0, justifyContent: "space-between", left: 0, paddingHorizontal: 24, position: "absolute", right: 0, top: 0, zIndex: 8 },
  menuHeader: { alignItems: "center", borderBottomColor: "rgba(255,255,255,0.22)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingBottom: 20 },
  menuBrand: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: 0.5 },
  closeButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.5)", borderWidth: 1, height: 39, justifyContent: "center", width: 39 },
  closeButtonText: { color: "#FFFFFF", fontSize: 27, fontWeight: "300", lineHeight: 29 },
  menuLinks: { flex: 1, justifyContent: "center" },
  menuItem: { alignItems: "center", borderBottomColor: "rgba(255,255,255,0.18)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingVertical: 20 },
  menuNumber: { color: "#DFFF4F", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, width: 42 },
  menuItemText: { color: "#FFFFFF", flex: 1, fontFamily: "serif", fontSize: 29, fontWeight: "700" },
  menuArrow: { color: "#DFFF4F", fontSize: 23 },
  menuFoot: { color: "#BDC2F5", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
});
