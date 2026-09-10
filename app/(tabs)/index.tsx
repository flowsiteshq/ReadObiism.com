import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";

import { ScreenContainer } from "@/components/screen-container";
import { BOOK_AUTHOR, BOOK_SUBTITLE, BOOK_TITLE, chapters } from "@/lib/book-data";
import { haptic } from "@/lib/haptics";
import { getReadingPosition, getReadingPulse, type ReadingPosition, type ReadingPulse } from "@/lib/reader-storage";

const COVER = require("../../assets/images/obi-ism-cover-000.jpg");
const LANDMARK_VIDEO = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031545745/uXVqeNlDbhxxPulw.mp4";
const LANDMARK_POSTER = "/manus-storage/obi-ism-nigeria-landmarks-poster_bd8477a0.jpg";

const PRINCIPLES = [
  { label: "PRUDENCE", color: "#DFFF4F", text: "Use resources with intention." },
  { label: "HONESTY", color: "#6CD9FF", text: "Make trust your strongest currency." },
  { label: "JUSTICE", color: "#FFB5E8", text: "Build peace through fairness." },
];

export default function LibraryScreen() {
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [pulse, setPulse] = useState<ReadingPulse>({ weeklyGoal: 3, sectionsThisWeek: 0, activeDays: 0, bookmarks: 0 });
  const [videoReady, setVideoReady] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const player = useVideoPlayer(LANDMARK_VIDEO, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useFocusEffect(
    useCallback(() => {
      void Promise.all([getReadingPosition(), getReadingPulse()]).then(([savedPosition, savedPulse]) => {
        setPosition(savedPosition);
        setPulse(savedPulse);
      });
    }, []),
  );

  const activeChapter = chapters.find((chapter) => chapter.id === position?.chapterId) ?? chapters[0];
  const completion = Math.min(100, Math.round((pulse.sectionsThisWeek / pulse.weeklyGoal) * 100));
  const openReader = () => {
    haptic.light();
    router.push(`/reader?chapterId=${activeChapter.id}` as never);
  };
  const toggleVideo = () => {
    haptic.selection();
    if (videoPlaying) player.pause(); else player.play();
    setVideoPlaying((current) => !current);
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <StatusBar style="light" backgroundColor="#151A52" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <View style={styles.hero}>
            <View style={styles.heroOrbOne} />
            <View style={styles.heroOrbTwo} />
            <View style={styles.topbar}>
              <View><Text style={styles.wordmark}>OBI–ISM</Text><Text style={styles.wordmarkSub}>CHARACTER IS PUBLIC ARCHITECTURE</Text></View>
              <View style={styles.liveEdition}><View style={styles.liveDot} /><Text style={styles.liveEditionText}>FULL EDITION</Text></View>
            </View>

            <View style={styles.landmarkStage}>
              {!videoReady && <Image source={{ uri: LANDMARK_POSTER }} contentFit="cover" transition={250} style={styles.landmarkPoster} accessibilityLabel="Nigerian landmarks at blue hour" />}
              <VideoView style={styles.landmarkVideo} player={player} contentFit="cover" nativeControls={false} playsInline onFirstFrameRender={() => setVideoReady(true)} />
              <View style={styles.landmarkShade} />
              <View style={styles.landmarkCopy}><Text style={styles.landmarkKicker}>NIGERIA IN VIEW</Text><Text style={styles.landmarkTitle}>A shared future,{`\n`}built in character.</Text><Text style={styles.landmarkCaption}>LAGOS · ABUJA · A LIVING PHILOSOPHY</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={videoPlaying ? "Pause landmark video" : "Play landmark video"} onPress={toggleVideo} style={styles.landmarkControl}><Text style={styles.landmarkControlText}>{videoPlaying ? "PAUSE" : "PLAY"}</Text><Text style={styles.landmarkControlIcon}>{videoPlaying ? "Ⅱ" : "▶"}</Text></TouchableOpacity>
            </View>

            <View style={styles.heroMain}>
              <View style={styles.coverOrbit}><View style={styles.coverFrame}><Image source={COVER} contentFit="cover" transition={250} style={styles.coverImage} accessibilityLabel="OBI-ISM book cover" /></View></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>YOUR ACTIVE READING PATH</Text>
                <Text style={styles.heroTitle}>{BOOK_TITLE}</Text>
                <Text style={styles.heroSubtitle}>{BOOK_SUBTITLE}</Text>
                <Text style={styles.heroAuthor}>{BOOK_AUTHOR}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={openReader} style={styles.heroButton}>
                  <Text style={styles.heroButtonText}>{position ? "Continue your path" : "Start the opening"}</Text><Text style={styles.heroButtonArrow}>→</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroFooter}>
              <View><Text style={styles.heroFooterLabel}>CURRENT FOCUS</Text><Text style={styles.heroFooterTitle}>{activeChapter.title}</Text></View>
              <Text style={styles.heroFooterCounter}>{String(chapters.findIndex((chapter) => chapter.id === activeChapter.id) + 1).padStart(2, "0")}</Text>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>YOUR READING PULSE</Text><Text style={styles.sectionTitle}>Momentum, not pressure.</Text></View><View style={styles.pulseBadge}><Text style={styles.pulseBadgeNumber}>{pulse.activeDays}</Text><Text style={styles.pulseBadgeLabel}>DAYS{`\n`}ACTIVE</Text></View></View>
            <View style={styles.pulseCard}>
              <View style={styles.pulseTop}><View><Text style={styles.pulseLabel}>THIS WEEK’S INTENTION</Text><Text style={styles.pulseTitle}>{pulse.sectionsThisWeek} of {pulse.weeklyGoal} sections</Text></View><Text style={styles.pulsePercent}>{completion}%</Text></View>
              <View style={styles.pulseTrack}><View style={[styles.pulseFill, { width: `${completion}%` }]} /></View>
              <View style={styles.pulseFooter}><Text style={styles.pulseNote}>{pulse.bookmarks ? `${pulse.bookmarks} saved marker${pulse.bookmarks > 1 ? "s" : ""} waiting for you` : "Set a rhythm that works for you"}</Text><TouchableOpacity accessibilityRole="button" onPress={() => { haptic.selection(); router.push("/(tabs)/account" as never); }}><Text style={styles.pulseAction}>TUNE GOAL →</Text></TouchableOpacity></View>
            </View>

            <View style={styles.quickGrid}>
              <TouchableOpacity accessibilityRole="button" onPress={() => { haptic.light(); router.push("/(tabs)/explore" as never); }} style={[styles.quickCard, styles.quickCardSky]}><Text style={styles.quickIcon}>⌕</Text><Text style={styles.quickTitle}>Explore an idea</Text><Text style={styles.quickBody}>Search all {chapters.length} sections, parts, and principles.</Text><Text style={styles.quickArrow}>→</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => { haptic.light(); router.push("/contents" as never); }} style={[styles.quickCard, styles.quickCardCoral]}><Text style={styles.quickIcon}>↗</Text><Text style={styles.quickTitle}>Navigate the book</Text><Text style={styles.quickBody}>Move through four parts, chapters, and appendices.</Text><Text style={styles.quickArrow}>→</Text></TouchableOpacity>
            </View>

            <View style={styles.principleHeader}><View><Text style={styles.sectionKicker}>PRINCIPLE SIGNAL</Text><Text style={styles.principleTitle}>Small ideas. Large consequences.</Text></View><Text style={styles.principleCount}>01 / 03</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.principleRow}>
              {PRINCIPLES.map((principle) => <TouchableOpacity key={principle.label} accessibilityRole="button" onPress={() => { haptic.light(); router.push("/(tabs)/explore" as never); }} style={[styles.principleCard, { backgroundColor: principle.color }]}><Text style={styles.principleLabel}>{principle.label}</Text><Text style={styles.principleBody}>{principle.text}</Text><Text style={styles.principleArrow}>→</Text></TouchableOpacity>)}
            </ScrollView>

            <View style={styles.protectionNote}><View style={styles.protectionShield}>✦</View><Text style={styles.protectionText}>Private reader mode keeps this edition focused. Bookmarks, goals, and reading progress remain on your device.</Text></View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  page: { alignSelf: "center", maxWidth: 650, width: "100%" },
  hero: { backgroundColor: "#151A52", overflow: "hidden", paddingBottom: 22, paddingHorizontal: 22, paddingTop: 28 },
  heroOrbOne: { backgroundColor: "#FF5B55", borderRadius: 180, height: 240, opacity: 0.95, position: "absolute", right: -117, top: 72, width: 240 },
  heroOrbTwo: { borderColor: "#DFFF4F", borderRadius: 150, borderWidth: 1, height: 238, left: -128, opacity: 0.85, position: "absolute", top: 174, width: 238 },
  topbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 11 },
  wordmark: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", letterSpacing: 0.6 },
  wordmarkSub: { color: "#AEB4F2", fontSize: 8, fontWeight: "900", letterSpacing: 0.85, marginTop: 3 },
  liveEdition: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.11)", borderColor: "rgba(255,255,255,0.3)", borderRadius: 20, borderWidth: 1, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 7 },
  liveDot: { backgroundColor: "#DFFF4F", borderRadius: 4, height: 7, marginRight: 6, width: 7 },
  liveEditionText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  landmarkStage: { backgroundColor: "#0E123E", height: 178, marginTop: 20, overflow: "hidden", position: "relative" },
  landmarkVideo: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  landmarkPoster: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  landmarkShade: { backgroundColor: "rgba(10,13,46,0.20)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  landmarkCopy: { bottom: 16, left: 16, position: "absolute" },
  landmarkKicker: { color: "#DFFF4F", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  landmarkTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 23, fontWeight: "700", lineHeight: 27, marginTop: 4 },
  landmarkCaption: { color: "#D5D9FF", fontSize: 7, fontWeight: "900", letterSpacing: 0.65, marginTop: 8 },
  landmarkControl: { alignItems: "center", backgroundColor: "rgba(21,26,82,0.75)", borderColor: "rgba(255,255,255,0.55)", borderWidth: 1, flexDirection: "row", gap: 6, paddingHorizontal: 8, paddingVertical: 7, position: "absolute", right: 12, top: 12 },
  landmarkControlText: { color: "#FFFFFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  landmarkControlIcon: { color: "#DFFF4F", fontSize: 11 },
  heroMain: { alignItems: "center", flexDirection: "row", gap: 18, marginTop: 30 },
  coverOrbit: { alignItems: "center", borderColor: "#DFFF4F", borderRadius: 92, borderWidth: 1, height: 185, justifyContent: "center", width: 145 },
  coverFrame: { backgroundColor: "#DFFF4F", padding: 3, transform: [{ rotate: "-4deg" }] },
  coverImage: { height: 158, width: 106 },
  heroCopy: { flex: 1 },
  heroKicker: { color: "#DFFF4F", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  heroTitle: { color: "#FFFFFF", fontSize: 34, fontWeight: "900", letterSpacing: -1.4, marginTop: 4 },
  heroSubtitle: { color: "#F4F3FF", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 6 },
  heroAuthor: { color: "#B5BAF1", fontSize: 10, marginTop: 8 },
  heroButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#DFFF4F", flexDirection: "row", gap: 11, marginTop: 15, paddingHorizontal: 12, paddingVertical: 11 },
  heroButtonText: { color: "#151A52", fontSize: 11, fontWeight: "900" },
  heroButtonArrow: { color: "#151A52", fontSize: 18, lineHeight: 18 },
  heroFooter: { alignItems: "flex-end", borderTopColor: "rgba(255,255,255,0.23)", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 22, paddingTop: 14 },
  heroFooterLabel: { color: "#AEB4F2", fontSize: 8, fontWeight: "900", letterSpacing: 0.85 },
  heroFooterTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", marginTop: 4, maxWidth: 245 },
  heroFooterCounter: { color: "#DFFF4F", fontFamily: "serif", fontSize: 27 },
  body: { backgroundColor: "#FFF6E7", paddingBottom: 39, paddingHorizontal: 22, paddingTop: 28 },
  sectionHeading: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  sectionKicker: { color: "#FF5B55", fontSize: 9, fontWeight: "900", letterSpacing: 1.15 },
  sectionTitle: { color: "#151A52", fontFamily: "serif", fontSize: 28, fontWeight: "700", letterSpacing: -0.45, lineHeight: 33, marginTop: 6 },
  pulseBadge: { alignItems: "center", backgroundColor: "#151A52", borderRadius: 28, height: 56, justifyContent: "center", width: 56 },
  pulseBadgeNumber: { color: "#DFFF4F", fontFamily: "serif", fontSize: 18, lineHeight: 18 },
  pulseBadgeLabel: { color: "#FFFFFF", fontSize: 6, fontWeight: "900", letterSpacing: 0.35, lineHeight: 7, textAlign: "center" },
  pulseCard: { backgroundColor: "#FFFFFF", borderColor: "#DDD9EE", borderWidth: 1, marginTop: 21, padding: 18 },
  pulseTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  pulseLabel: { color: "#777A9C", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  pulseTitle: { color: "#1C1C26", fontFamily: "serif", fontSize: 22, fontWeight: "700", marginTop: 5 },
  pulsePercent: { color: "#FF5B55", fontSize: 22, fontWeight: "900" },
  pulseTrack: { backgroundColor: "#E6E4F4", height: 8, marginTop: 18, overflow: "hidden" },
  pulseFill: { backgroundColor: "#FF5B55", height: 8 },
  pulseFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 13 },
  pulseNote: { color: "#696A7C", flex: 1, fontSize: 10, lineHeight: 14, marginRight: 12 },
  pulseAction: { color: "#151A52", fontSize: 9, fontWeight: "900", letterSpacing: 0.45 },
  quickGrid: { flexDirection: "row", gap: 12, marginTop: 27 },
  quickCard: { flex: 1, minHeight: 182, overflow: "hidden", padding: 16 },
  quickCardSky: { backgroundColor: "#6CD9FF" },
  quickCardCoral: { backgroundColor: "#FF5B55" },
  quickIcon: { color: "#151A52", fontFamily: "serif", fontSize: 24 },
  quickTitle: { color: "#151A52", fontFamily: "serif", fontSize: 19, fontWeight: "700", lineHeight: 22, marginTop: 19 },
  quickBody: { color: "#25284D", fontSize: 11, lineHeight: 16, marginTop: 7 },
  quickArrow: { bottom: 13, color: "#151A52", fontSize: 22, position: "absolute", right: 15 },
  principleHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 32 },
  principleTitle: { color: "#151A52", fontFamily: "serif", fontSize: 24, fontWeight: "700", lineHeight: 29, marginTop: 5 },
  principleCount: { color: "#777A9C", fontSize: 9, fontWeight: "900", marginBottom: 5 },
  principleRow: { gap: 11, paddingTop: 16 },
  principleCard: { height: 167, justifyContent: "space-between", padding: 16, width: 195 },
  principleLabel: { color: "#151A52", fontSize: 9, fontWeight: "900", letterSpacing: 0.85 },
  principleBody: { color: "#151A52", fontFamily: "serif", fontSize: 19, fontWeight: "700", lineHeight: 24, maxWidth: 160 },
  principleArrow: { color: "#151A52", fontSize: 21 },
  protectionNote: { alignItems: "center", backgroundColor: "#E8E6F5", flexDirection: "row", marginTop: 30, padding: 14 },
  protectionShield: { color: "#151A52", fontSize: 17, marginRight: 10 },
  protectionText: { color: "#51536B", flex: 1, fontSize: 10, lineHeight: 15 },
});
