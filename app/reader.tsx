import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProtectedReader } from "@/components/protected-reader";
import { chapters, getChapter } from "@/lib/book-data";
import { haptic } from "@/lib/haptics";
import { getBookmarks, saveReadingPosition, toggleBookmark } from "@/lib/reader-storage";

const FONT_SIZES = [18, 20, 22];

export default function ReaderScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId?: string }>();
  const chapter = getChapter(chapterId);
  const [fontSizeIndex, setFontSizeIndex] = useState(1);
  const [bookmarked, setBookmarked] = useState(false);
  const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
  const nextChapter = chapters[chapterIndex + 1];
  const previousChapter = chapters[chapterIndex - 1];
  const fontSize = FONT_SIZES[fontSizeIndex];
  const opening = chapter.paragraphs[0];
  const completion = Math.round(((chapterIndex + 1) / chapters.length) * 100);

  useEffect(() => {
    void saveReadingPosition(chapter.id);
    void getBookmarks().then((saved) => setBookmarked(saved.includes(chapter.id)));
  }, [chapter.id]);

  const handleBookmark = async () => {
    const bookmarks = await toggleBookmark(chapter.id);
    const isSaved = bookmarks.includes(chapter.id);
    setBookmarked(isSaved);
    isSaved ? haptic.success() : haptic.selection();
  };
  const changeChapter = (id: string) => { haptic.light(); router.replace(`/reader?chapterId=${id}` as never); };
  const changeType = () => { haptic.selection(); setFontSizeIndex((value) => (value + 1) % FONT_SIZES.length); };

  return (
    <ProtectedReader>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" backgroundColor="#151A52" />
        <View style={styles.statusBuffer} />
        <View style={styles.topbar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to library" onPress={() => { haptic.light(); router.back(); }} style={styles.topButton}><Text style={styles.topIcon}>←</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open table of contents" onPress={() => { haptic.light(); router.push("/contents" as never); }} style={styles.contentsControl}><Text style={styles.contentsControlText}>OPEN PATH</Text><Text style={styles.contentsControlArrow}>↗</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change text size" onPress={changeType} style={styles.topButton}><Text style={styles.textSizeControl}>Aᴬ</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={styles.signalCard}>
              <View style={styles.signalTop}><View><Text style={styles.signalKicker}>YOU ARE HERE</Text><Text style={styles.signalLabel}>{chapter.label}</Text></View><View style={styles.progressCircle}><Text style={styles.progressCircleNumber}>{completion}</Text><Text style={styles.progressCircleLabel}>%</Text></View></View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completion}%` }]} /></View>
              <Text style={styles.signalFoot}>SECTION {String(chapterIndex + 1).padStart(2, "0")} OF {String(chapters.length).padStart(2, "0")} · PRIVATE READER MODE</Text>
            </View>

            <View style={styles.chapterHeader}><Text style={styles.eyebrow}>{chapter.kind === "chapter" ? "THE OBI-ISM READER" : "THE COMPLETE EDITION"}</Text><Text style={styles.title}>{chapter.title}</Text><Text style={styles.deck}>{chapter.summary}</Text><View style={styles.accentRow}><View style={styles.accentCoral} /><View style={styles.accentSky} /><View style={styles.accentLime} /></View></View>

            <Text style={[styles.openingParagraph, { fontSize, lineHeight: fontSize * 1.58 }]}><Text style={styles.dropCap}>{opening.charAt(0)}</Text>{opening.slice(1)}</Text>
            {chapter.paragraphs.slice(1).map((paragraph, index) => <Text key={`${chapter.id}-${index + 1}`} style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.58 }]}>{paragraph}</Text>)}

            <View style={styles.readerEnd}>
              <View><Text style={styles.readerEndKicker}>PAUSE WITH THE IDEA</Text><Text style={styles.readerEndText}>Save this place, return when ready.</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={bookmarked ? "Remove bookmark" : "Save a bookmark"} onPress={() => void handleBookmark()} style={[styles.bookmarkButton, bookmarked && styles.bookmarkButtonSaved]}><Text style={styles.bookmarkIcon}>{bookmarked ? "✦" : "＋"}</Text><Text style={styles.bookmarkText}>{bookmarked ? "SAVED" : "MARK"}</Text></TouchableOpacity>
            </View>
            <View style={styles.reflectionCard}>
              <Text style={styles.reflectionKicker}>THE IDEA</Text>
              <Text style={styles.reflectionText}>{chapter.summary}</Text>
              <View style={styles.reflectionRule} />
              <Text style={styles.reflectionSource}>DRAWN FROM THIS APPROVED SECTION</Text>
              {nextChapter ? <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(nextChapter.id)} style={styles.reflectionContinue}><Text style={styles.reflectionContinueText}>CONTINUE</Text><Text style={styles.reflectionContinueArrow}>→</Text></TouchableOpacity> : <TouchableOpacity accessibilityRole="button" onPress={() => router.replace("/(tabs)/account" as never)} style={styles.reflectionContinue}><Text style={styles.reflectionContinueText}>RETURN TO JOURNEY</Text><Text style={styles.reflectionContinueArrow}>→</Text></TouchableOpacity>}
            </View>
            <View style={styles.navigator}>
              {previousChapter ? <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(previousChapter.id)} style={styles.previousNav}><Text style={styles.navLabel}>← BACK</Text><Text numberOfLines={2} style={styles.previousNavText}>{previousChapter.title}</Text></TouchableOpacity> : <View style={styles.navSpacer} />}
              {nextChapter ? <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(nextChapter.id)} style={styles.nextNav}><Text style={styles.navLabelLight}>KEEP GOING</Text><Text numberOfLines={2} style={styles.nextNavText}>{nextChapter.title} →</Text></TouchableOpacity> : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ProtectedReader>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#FFF6E7", flex: 1 }, statusBuffer: { backgroundColor: "#151A52", height: 14 },
  topbar: { alignItems: "center", backgroundColor: "#151A52", flexDirection: "row", height: 58, justifyContent: "space-between", paddingHorizontal: 12 },
  topButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.09)", height: 37, justifyContent: "center", width: 42 }, topIcon: { color: "#FFFFFF", fontSize: 19 },
  contentsControl: { alignItems: "center", flexDirection: "row", gap: 6, paddingHorizontal: 9, paddingVertical: 10 }, contentsControlText: { color: "#DFFF4F", fontSize: 9, fontWeight: "900", letterSpacing: 0.85 }, contentsControlArrow: { color: "#DFFF4F", fontSize: 15 }, textSizeControl: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  scrollContent: { flexGrow: 1 }, column: { alignSelf: "center", maxWidth: 650, paddingBottom: 46, paddingHorizontal: 23, paddingTop: 23, width: "100%" },
  signalCard: { backgroundColor: "#151A52", overflow: "hidden", padding: 16 }, signalTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, signalKicker: { color: "#6CD9FF", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 }, signalLabel: { color: "#FFFFFF", fontFamily: "serif", fontSize: 19, fontWeight: "700", marginTop: 5 },
  progressCircle: { alignItems: "center", backgroundColor: "#DFFF4F", borderRadius: 22, height: 44, justifyContent: "center", width: 44 }, progressCircleNumber: { color: "#151A52", fontFamily: "serif", fontSize: 17, fontWeight: "700", lineHeight: 17 }, progressCircleLabel: { color: "#151A52", fontSize: 7, fontWeight: "900" },
  progressTrack: { backgroundColor: "#545995", height: 5, marginTop: 16 }, progressFill: { backgroundColor: "#FF5B55", height: 5 }, signalFoot: { color: "#C6C9EA", fontSize: 8, fontWeight: "900", letterSpacing: 0.42, marginTop: 9 },
  chapterHeader: { marginTop: 29 }, eyebrow: { color: "#FF5B55", fontSize: 9, fontWeight: "900", letterSpacing: 1.15 }, title: { color: "#151A52", fontFamily: "serif", fontSize: 36, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: 8 }, deck: { color: "#525568", fontFamily: "serif", fontSize: 17, lineHeight: 26, marginTop: 13 },
  accentRow: { flexDirection: "row", gap: 5, marginBottom: 27, marginTop: 22 }, accentCoral: { backgroundColor: "#FF5B55", height: 4, width: 35 }, accentSky: { backgroundColor: "#6CD9FF", height: 4, width: 22 }, accentLime: { backgroundColor: "#DFFF4F", height: 4, width: 13 },
  openingParagraph: { color: "#262736", fontFamily: "serif", letterSpacing: 0.12, marginBottom: 21 }, dropCap: { color: "#FF5B55", fontFamily: "serif", fontSize: 58, fontWeight: "700", lineHeight: 49 }, paragraph: { color: "#262736", fontFamily: "serif", letterSpacing: 0.12, marginBottom: 21 },
  readerEnd: { alignItems: "center", backgroundColor: "#E8E6F5", flexDirection: "row", justifyContent: "space-between", marginTop: 9, padding: 16 }, readerEndKicker: { color: "#FF5B55", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, readerEndText: { color: "#151A52", fontFamily: "serif", fontSize: 15, fontWeight: "700", marginTop: 4 }, bookmarkButton: { alignItems: "center", backgroundColor: "#151A52", flexDirection: "row", gap: 5, paddingHorizontal: 11, paddingVertical: 10 }, bookmarkButtonSaved: { backgroundColor: "#FF5B55" }, bookmarkIcon: { color: "#DFFF4F", fontSize: 15 }, bookmarkText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900", letterSpacing: 0.55 },
  reflectionCard: { backgroundColor: "#151A52", marginTop: 16, padding: 18 }, reflectionKicker: { color: "#DFFF4F", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 }, reflectionText: { color: "#FFFFFF", fontFamily: "serif", fontSize: 19, fontWeight: "700", lineHeight: 27, marginTop: 8 }, reflectionRule: { backgroundColor: "#FF5B55", height: 3, marginTop: 17, width: 35 }, reflectionSource: { color: "#C6C9EA", fontSize: 7, fontWeight: "900", letterSpacing: 0.75, marginTop: 10 }, reflectionContinue: { alignItems: "center", backgroundColor: "#DFFF4F", flexDirection: "row", justifyContent: "space-between", marginTop: 18, paddingHorizontal: 14, paddingVertical: 13 }, reflectionContinueText: { color: "#151A52", fontSize: 9, fontWeight: "900", letterSpacing: 0.85 }, reflectionContinueArrow: { color: "#151A52", fontSize: 20 },
  navigator: { flexDirection: "row", gap: 12, marginTop: 22 }, navSpacer: { flex: 1 }, previousNav: { backgroundColor: "#FFFFFF", borderColor: "#DCD8E8", borderWidth: 1, flex: 1, padding: 15 }, navLabel: { color: "#777A9C", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, previousNavText: { color: "#151A52", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 6 }, nextNav: { backgroundColor: "#FF5B55", flex: 1, padding: 15 }, navLabelLight: { color: "#421F4C", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, nextNavText: { color: "#151A52", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 6 },
});
