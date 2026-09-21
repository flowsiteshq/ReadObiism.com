import { useCallback, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";

import { CinematicEntry } from "@/components/cinematic-entry";
import { ScreenContainer } from "@/components/screen-container";
import { chapters } from "@/lib/book-data";
import { PORTRAIT_HERO_COPY, PORTRAIT_HERO_IMAGE } from "@/lib/hero-art";
import { haptic } from "@/lib/haptics";
import { LANDMARK_TOUR_SECONDS, LANDMARK_TOUR_VIDEO } from "@/lib/landmark-tour";
import { getReadingPosition, type ReadingPosition } from "@/lib/reader-storage";

type MenuDestination = "/reader" | "/contents" | "/(tabs)/explore" | "/(tabs)/account";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const player = useVideoPlayer(LANDMARK_TOUR_VIDEO, (videoPlayer) => {
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
  const returningReader = Boolean(position);
  const readingCompletion = Math.round(((chapters.findIndex((chapter) => chapter.id === activeChapter.id) + 1) / chapters.length) * 100);

  const navigate = (destination: MenuDestination) => {
    haptic.light();
    setMenuOpen(false);
    if (destination === "/reader") {
      router.push(`/reader?chapterId=${activeChapter.id}` as never);
      return;
    }
    router.push(destination as never);
  };

  const openFuture = () => {
    haptic.light();
    router.push("/reader?chapterId=epilogue" as never);
  };
  const openPrinciples = () => {
    haptic.light();
    router.push("/principles" as never);
  };
  const openQuotes = () => {
    haptic.light();
    router.push("/quotes?filter=saved" as never);
  };

  const toggleMotion = () => {
    haptic.selection();
    if (videoPlaying) player.pause(); else player.play();
    setVideoPlaying((current) => !current);
  };

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} className="p-0" containerClassName="bg-background">
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <View style={styles.stage}>
        <VideoView style={styles.backgroundMedia} player={player} contentFit="cover" nativeControls={false} playsInline />
        <Image accessibilityIgnoresInvertColors source={{ uri: PORTRAIT_HERO_IMAGE }} style={styles.portraitHero} resizeMode="cover" />
        <View pointerEvents="none" style={styles.leftVeil} />
        <View pointerEvents="none" style={styles.bottomVeil} />

        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="OBI-ISM welcome screen" onPress={() => setMenuOpen(false)}>
            <Text style={styles.wordmark}>OBI–<Text style={styles.gold}>ISM</Text></Text>
            <Text style={styles.descriptor}>{PORTRAIT_HERO_COPY.brandLine}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open OBI-ISM menu" onPress={() => { haptic.selection(); setMenuOpen(true); }} style={styles.menuButton}>
            <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLineGold} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.statementBlock}>
            <Text style={styles.kicker}>{returningReader ? "WELCOME BACK" : PORTRAIT_HERO_COPY.eyebrow}</Text>
            <View style={styles.kickerRule} />
            <Text style={styles.title}>{returningReader ? <>You stopped{`\n`}<Text style={styles.gold}>here.</Text></> : <>Character{`\n`}Builds{`\n`}<Text style={styles.gold}>Nations.</Text></>}</Text>
            <Text style={styles.description}>{returningReader ? `${activeChapter.title} · ${readingCompletion}% complete` : PORTRAIT_HERO_COPY.description}</Text>
          </View>

          <View style={[styles.actionsArea, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.actions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Begin reading the current OBI-ISM chapter" onPress={() => navigate("/reader")} style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>{returningReader ? "Continue reading" : "Read the opening"}</Text><Text style={styles.primaryArrow}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore OBI-ISM ideas" onPress={() => navigate("/(tabs)/explore")} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Explore the ideas</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.discoveryRail}>
              <DiscoveryItem icon="▤" label="CHAPTERS" onPress={() => navigate("/contents")} />
              <DiscoveryItem icon="✦" label="PRINCIPLES" onPress={openPrinciples} />
              <DiscoveryItem icon="◇" label="SAVED" onPress={openQuotes} />
              <DiscoveryItem icon="↗" label="THE FUTURE" onPress={openFuture} />
            </View>
            <View style={styles.footerRow}>
              <Text style={styles.footerMotto}>READ · REFLECT · REBUILD</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={videoPlaying ? "Pause landmark background film" : "Play landmark background film"} onPress={toggleMotion} style={styles.motionButton}>
                <View style={[styles.liveDot, videoPlaying && styles.liveDotActive]} /><Text style={styles.motionLabel}>{videoPlaying ? `${LANDMARK_TOUR_SECONDS}S FILM` : "PLAY FILM"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {menuOpen && (
          <View style={[styles.menuSheet, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.menuHeader}><Text style={styles.menuBrand}>OBI–<Text style={styles.gold}>ISM</Text></Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close OBI-ISM menu" onPress={() => setMenuOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></TouchableOpacity></View>
            <View style={styles.menuLinks}>
              <MenuItem number="01" label="Continue reading" onPress={() => navigate("/reader")} />
              <MenuItem number="02" label="Principles" onPress={openPrinciples} />
              <MenuItem number="03" label="Quotes" onPress={() => router.push("/quotes" as never)} />
              <MenuItem number="04" label="My journey" onPress={() => navigate("/(tabs)/account")} />
              <MenuItem number="05" label="Profile" onPress={() => router.push("/profile" as never)} />
            </View>
            <Text style={styles.menuFoot}>A PRIVATE DIGITAL EDITION · 2026</Text>
          </View>
        )}
        <CinematicEntry />
      </View>
    </ScreenContainer>
  );
}

function DiscoveryItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.discoveryItem}><Text style={styles.discoveryIcon}>{icon}</Text><Text style={styles.discoveryLabel}>{label}</Text><View style={styles.discoveryAccent} /></TouchableOpacity>;
}

function MenuItem({ number, label, onPress }: { number: string; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.menuItem}><Text style={styles.menuNumber}>{number}</Text><Text style={styles.menuItemText}>{label}</Text><Text style={styles.menuArrow}>→</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  stage: { backgroundColor: "#020304", flex: 1, minHeight: 700, overflow: "hidden", position: "relative" },
  backgroundMedia: { bottom: 0, left: 0, opacity: 0.64, position: "absolute", right: 0, top: 0 },
  portraitHero: { bottom: 0, height: "100%", opacity: 0.94, position: "absolute", right: 0, width: "100%" },
  leftVeil: { backgroundColor: "rgba(2, 8, 16, 0.76)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  bottomVeil: { backgroundColor: "rgba(0, 0, 0, 0.84)", bottom: 0, height: "36%", left: 0, position: "absolute", right: 0 },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 25 },
  wordmark: { color: "#FFFFFF", fontFamily: "serif", fontSize: 41, fontWeight: "700", letterSpacing: -1.1, lineHeight: 39 },
  gold: { color: "#E9C46A" },
  descriptor: { color: "#F0F0EC", fontSize: 8, fontWeight: "900", letterSpacing: 2.8, marginTop: 9 },
  menuButton: { alignItems: "flex-end", justifyContent: "center", minHeight: 43, minWidth: 46, padding: 6 },
  menuLine: { backgroundColor: "#FFFFFF", height: 2, marginVertical: 3, width: 31 },
  menuLineGold: { backgroundColor: "#E9C46A", height: 2, marginTop: 3, width: 17 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: 25, paddingTop: 60 },
  statementBlock: { maxWidth: 312 },
  kicker: { color: "#F4F2EC", fontSize: 10, fontWeight: "800", letterSpacing: 2.75, lineHeight: 19, maxWidth: 195 },
  kickerRule: { backgroundColor: "#E9C46A", height: 3, marginTop: 14, width: 38 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 60, fontWeight: "700", letterSpacing: -2.3, lineHeight: 53, marginTop: 24 },
  description: { color: "#F2F1ED", fontSize: 16, lineHeight: 24, marginTop: 20, maxWidth: 303 },
  actionsArea: { marginTop: 16 },
  actions: { gap: 12 },
  primaryAction: { alignItems: "center", backgroundColor: "#E9C46A", borderRadius: 31, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 23, paddingVertical: 17 },
  primaryActionText: { color: "#15120D", fontSize: 16, fontWeight: "900" },
  primaryArrow: { color: "#15120D", fontSize: 26 },
  secondaryAction: { alignItems: "center", borderColor: "rgba(255,255,255,0.78)", borderRadius: 31, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16 },
  secondaryActionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  discoveryRail: { flexDirection: "row", marginTop: 23 },
  discoveryItem: { alignItems: "center", borderRightColor: "rgba(255,255,255,0.28)", borderRightWidth: StyleSheet.hairlineWidth, flex: 1, minHeight: 63, paddingHorizontal: 2 },
  discoveryIcon: { color: "#FFFFFF", fontSize: 20, lineHeight: 22 },
  discoveryLabel: { color: "#F3F1EB", fontSize: 7, fontWeight: "900", letterSpacing: 0.9, marginTop: 7, textAlign: "center" },
  discoveryAccent: { backgroundColor: "#E9C46A", height: 2, marginTop: 9, width: 23 },
  footerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 17 },
  footerMotto: { color: "#EFE9D9", fontSize: 7, fontWeight: "900", letterSpacing: 2.05 },
  motionButton: { alignItems: "center", flexDirection: "row", gap: 5, padding: 5 },
  liveDot: { backgroundColor: "#65696E", borderRadius: 4, height: 7, width: 7 },
  liveDotActive: { backgroundColor: "#E9C46A" },
  motionLabel: { color: "#F0ECE0", fontSize: 7, fontWeight: "900", letterSpacing: 0.75 },
  menuSheet: { backgroundColor: "#07090C", bottom: 0, justifyContent: "space-between", left: 0, paddingHorizontal: 25, position: "absolute", right: 0, top: 0, zIndex: 8 },
  menuHeader: { alignItems: "center", borderBottomColor: "rgba(255,255,255,0.2)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingBottom: 19 },
  menuBrand: { color: "#FFFFFF", fontFamily: "serif", fontSize: 37, fontWeight: "700", letterSpacing: -1 },
  closeButton: { alignItems: "center", borderColor: "rgba(233,196,106,0.72)", borderWidth: 1, borderRadius: 22, height: 42, justifyContent: "center", width: 42 },
  closeButtonText: { color: "#E9C46A", fontSize: 29, fontWeight: "300", lineHeight: 31 },
  menuLinks: { flex: 1, justifyContent: "center" },
  menuItem: { alignItems: "center", borderBottomColor: "rgba(255,255,255,0.16)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingVertical: 20 },
  menuNumber: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, width: 42 },
  menuItemText: { color: "#FFFFFF", flex: 1, fontFamily: "serif", fontSize: 29, fontWeight: "700" },
  menuArrow: { color: "#E9C46A", fontSize: 23 },
  menuFoot: { color: "#BAB7B0", fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
});
