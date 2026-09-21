import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { PORTRAIT_HERO_COPY, PORTRAIT_HERO_IMAGE } from "@/lib/hero-art";
import { formatLandmarkTourTime, getLandmarkForSecond, LANDMARK_TOUR_VIDEO } from "@/lib/landmark-tour";

export default function ObiIsmWebsite() {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoSecond, setVideoSecond] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeLandmark = getLandmarkForSecond(videoSecond);
  const formattedVideoTime = formatLandmarkTourTime(videoSecond);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const startMotion = () => {
      video.muted = true;
      video.defaultMuted = true;
      video.playbackRate = 1.25;
      void video.play().then(() => setVideoPlaying(true)).catch(() => setVideoPlaying(false));
    };
    const updateLiveTime = () => setVideoSecond(Math.floor(video.currentTime));

    startMotion();
    video.addEventListener("canplay", startMotion);
    video.addEventListener("timeupdate", updateLiveTime);
    return () => {
      video.removeEventListener("canplay", startMotion);
      video.removeEventListener("timeupdate", updateLiveTime);
    };
  }, []);

  const toggleMotion = () => {
    const video = videoRef.current;
    if (!video) return;
    if (videoPlaying) {
      video.pause();
      setVideoPlaying(false);
      return;
    }
    void video.play().then(() => setVideoPlaying(true)).catch(() => setVideoPlaying(false));
  };

  const readOpening = () => router.push("/reader?chapterId=preface" as never);
  const explore = () => router.push("/(tabs)/explore" as never);
  const openChapters = () => router.push("/contents" as never);
  const openEdition = () => router.push("/(tabs)/account" as never);
  const openFuture = () => router.push("/reader?chapterId=epilogue" as never);

  return (
    <View style={[styles.page, { minHeight: Math.max(height, 760) }]}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <video
        ref={videoRef}
        src={LANDMARK_TOUR_VIDEO}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onCanPlay={(event) => { event.currentTarget.playbackRate = 1.25; void event.currentTarget.play(); }}
        onPlaying={() => setVideoPlaying(true)}
        onPause={() => setVideoPlaying(false)}
        style={styles.motionFilm}
      />
      <img
        src={PORTRAIT_HERO_IMAGE}
        alt=""
        style={{
          bottom: 0,
          height: "100%",
          objectFit: "cover",
          objectPosition: desktop ? "right center" : "center top",
          opacity: desktop ? 0.91 : 0.94,
          position: "absolute",
          right: 0,
          width: desktop ? "68%" : "100%",
        }}
      />
      <View pointerEvents="none" style={styles.leftVeil} />
      <View pointerEvents="none" style={styles.bottomVeil} />

      <View style={[styles.shell, desktop && styles.shellDesktop]}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="OBI-ISM welcome screen" onPress={() => setMenuOpen(false)} style={styles.brandButton}>
            <Text style={[styles.brand, desktop && styles.brandDesktop]}>OBI–<Text style={styles.brandGold}>ISM</Text></Text>
            <Text style={styles.brandSub}>{PORTRAIT_HERO_COPY.brandLine}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={() => setMenuOpen(true)} style={styles.menuButton}>
            <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLineGold} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCopy, desktop && styles.heroCopyDesktop]}>
          <Text style={styles.eyebrow}>{PORTRAIT_HERO_COPY.eyebrow}</Text>
          <View style={styles.eyebrowRule} />
          <Text style={[styles.title, desktop && styles.titleDesktop]}>Character{`\n`}Builds{`\n`}<Text style={styles.titleGold}>Nations.</Text></Text>
          <Text style={[styles.description, desktop && styles.descriptionDesktop]}>{PORTRAIT_HERO_COPY.description}</Text>
        </View>

        <View style={[styles.actionZone, desktop && styles.actionZoneDesktop]}>
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Read the opening of OBI-ISM" onPress={readOpening} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Read the opening</Text><Text style={styles.primaryButtonArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore the OBI-ISM ideas" onPress={explore} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Explore the ideas</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.discoveryRail}>
            <DiscoveryItem icon="▤" label="CHAPTERS" onPress={openChapters} />
            <DiscoveryItem icon="✦" label="KEY IDEAS" onPress={explore} />
            <DiscoveryItem icon="◇" label="SAVED" onPress={openEdition} />
            <DiscoveryItem icon="↗" label="THE FUTURE" onPress={openFuture} />
          </View>
          <View style={styles.footerRow}>
            <Text style={styles.footerMotto}>READ · REFLECT · REBUILD</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={videoPlaying ? "Pause landmark film" : "Play landmark film"} onPress={toggleMotion} style={styles.motionButton}>
              <View style={[styles.liveDot, videoPlaying && styles.liveDotActive]} />
              <Text style={styles.motionText}>{videoPlaying ? `FILM · ${activeLandmark.toUpperCase()} · ${formattedVideoTime}` : "PLAY NIGERIAN FILM"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {menuOpen && (
        <View style={styles.menuSheet}>
          <View style={[styles.menuShell, desktop && styles.shellDesktop]}>
            <View style={styles.header}>
              <Text style={styles.menuBrand}>OBI–<Text style={styles.brandGold}>ISM</Text></Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={() => setMenuOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            </View>
            <View style={styles.menuItems}>
              <MenuItem index="01" label="Read the opening" onPress={readOpening} />
              <MenuItem index="02" label="Explore the ideas" onPress={explore} />
              <MenuItem index="03" label="View chapters" onPress={openChapters} />
              <MenuItem index="04" label="My edition" onPress={openEdition} />
            </View>
            <Text style={styles.menuFooter}>A PRIVATE DIGITAL EDITION · 2026</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function DiscoveryItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.discoveryItem}><Text style={styles.discoveryIcon}>{icon}</Text><Text style={styles.discoveryLabel}>{label}</Text><View style={styles.discoveryAccent} /></TouchableOpacity>;
}

function MenuItem({ index, label, onPress }: { index: string; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.menuItem}><Text style={styles.menuIndex}>{index}</Text><Text style={styles.menuLabel}>{label}</Text><Text style={styles.menuArrow}>→</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#020304", flex: 1, overflow: "hidden", position: "relative" },
  motionFilm: { bottom: 0, height: "100%", left: 0, objectFit: "cover", opacity: 0.62, position: "absolute", right: 0, top: 0, width: "100%" },
  leftVeil: { backgroundColor: "rgba(2, 8, 16, 0.77)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  bottomVeil: { backgroundColor: "rgba(0, 0, 0, 0.83)", bottom: 0, height: "34%", left: 0, position: "absolute", right: 0 },
  shell: { flex: 1, justifyContent: "space-between", paddingBottom: 24, paddingHorizontal: 26, paddingTop: 31 },
  shellDesktop: { alignSelf: "center", maxWidth: 1240, width: "100%" },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  brandButton: { paddingVertical: 2 },
  brand: { color: "#FFFFFF", fontFamily: "serif", fontSize: 42, fontWeight: "700", letterSpacing: -1.2, lineHeight: 39 },
  brandDesktop: { fontSize: 51, lineHeight: 48 },
  brandGold: { color: "#E9C46A" },
  brandSub: { color: "#EEF0F3", fontSize: 8, fontWeight: "900", letterSpacing: 3.1, marginTop: 10 },
  menuButton: { alignItems: "flex-end", justifyContent: "center", minHeight: 48, minWidth: 46, padding: 7 },
  menuLine: { backgroundColor: "#FFFFFF", height: 2, marginVertical: 3, width: 31 },
  menuLineGold: { backgroundColor: "#E9C46A", height: 2, marginTop: 3, width: 17 },
  heroCopy: { marginTop: 46, maxWidth: 325 },
  heroCopyDesktop: { marginTop: 72, maxWidth: 515 },
  eyebrow: { color: "#F4F2EC", fontSize: 11, fontWeight: "800", letterSpacing: 3, lineHeight: 20, maxWidth: 200 },
  eyebrowRule: { backgroundColor: "#E9C46A", height: 3, marginTop: 15, width: 39 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 60, fontWeight: "700", letterSpacing: -2.4, lineHeight: 54, marginTop: 26 },
  titleDesktop: { fontSize: 91, lineHeight: 79, marginTop: 34 },
  titleGold: { color: "#E9C46A" },
  description: { color: "#F1F1ED", fontSize: 17, lineHeight: 25, marginTop: 20, maxWidth: 315 },
  descriptionDesktop: { fontSize: 20, lineHeight: 30, maxWidth: 430 },
  actionZone: { marginTop: 18 },
  actionZoneDesktop: { maxWidth: 570 },
  actions: { gap: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#E9C46A", borderRadius: 32, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: 24 },
  primaryButtonText: { color: "#12100D", fontSize: 16, fontWeight: "900" },
  primaryButtonArrow: { color: "#12100D", fontSize: 27, fontWeight: "400" },
  secondaryButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.78)", borderRadius: 32, borderWidth: 1, justifyContent: "center", minHeight: 57, paddingHorizontal: 20 },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  discoveryRail: { flexDirection: "row", marginTop: 23 },
  discoveryItem: { alignItems: "center", borderRightColor: "rgba(255,255,255,0.28)", borderRightWidth: StyleSheet.hairlineWidth, flex: 1, minHeight: 65, paddingHorizontal: 3 },
  discoveryIcon: { color: "#FFFFFF", fontSize: 20, lineHeight: 23 },
  discoveryLabel: { color: "#F4F2EC", fontSize: 7, fontWeight: "900", letterSpacing: 1.05, marginTop: 7, textAlign: "center" },
  discoveryAccent: { backgroundColor: "#E9C46A", height: 2, marginTop: 9, width: 25 },
  footerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 17 },
  footerMotto: { color: "#EAE6D8", fontSize: 7, fontWeight: "900", letterSpacing: 2.25 },
  motionButton: { alignItems: "center", flexDirection: "row", gap: 6, padding: 6 },
  liveDot: { backgroundColor: "#65696E", borderRadius: 4, height: 7, width: 7 },
  liveDotActive: { backgroundColor: "#E9C46A" },
  motionText: { color: "#EAE6D8", fontSize: 7, fontWeight: "900", letterSpacing: 0.75 },
  menuSheet: { backgroundColor: "#07090C", bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 10 },
  menuShell: { flex: 1, justifyContent: "space-between", paddingBottom: 28, paddingHorizontal: 26, paddingTop: 31 },
  menuBrand: { color: "#FFFFFF", fontFamily: "serif", fontSize: 39, fontWeight: "700", letterSpacing: -1 },
  closeButton: { alignItems: "center", borderColor: "rgba(233,196,106,0.72)", borderWidth: 1, borderRadius: 22, height: 43, justifyContent: "center", width: 43 },
  closeText: { color: "#E9C46A", fontSize: 29, fontWeight: "300", lineHeight: 31 },
  menuItems: { flex: 1, justifyContent: "center" },
  menuItem: { alignItems: "center", borderBottomColor: "rgba(255,255,255,0.16)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingVertical: 22 },
  menuIndex: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 1, width: 42 },
  menuLabel: { color: "#FFFFFF", flex: 1, fontFamily: "serif", fontSize: 29, fontWeight: "700" },
  menuArrow: { color: "#E9C46A", fontSize: 24 },
  menuFooter: { color: "#B6B6B4", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
});
