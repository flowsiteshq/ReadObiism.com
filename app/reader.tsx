import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProtectedReader } from "@/components/protected-reader";
import { chapters, getChapter } from "@/lib/book-data";
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

  useEffect(() => {
    void saveReadingPosition(chapter.id);
    void getBookmarks().then((saved) => setBookmarked(saved.includes(chapter.id)));
  }, [chapter.id]);

  const handleBookmark = async () => {
    const bookmarks = await toggleBookmark(chapter.id);
    setBookmarked(bookmarks.includes(chapter.id));
  };

  const changeChapter = (id: string) => router.replace(`/reader?chapterId=${id}` as never);

  return (
    <ProtectedReader>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topbar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to library" onPress={() => router.back()} style={styles.topButton}>
            <Text style={styles.topIcon}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open table of contents" onPress={() => router.push("/contents" as never)} style={styles.contentsControl}>
            <Text style={styles.contentsControlText}>TABLE OF CONTENTS</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change text size" onPress={() => setFontSizeIndex((value) => (value + 1) % FONT_SIZES.length)} style={styles.topButton}>
            <Text style={styles.textSizeControl}>Aᴬ</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>SECTION {String(chapterIndex + 1).padStart(2, "0")}</Text>
                <Text style={styles.protectedLabel}>PROTECTED READING</Text>
              </View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((chapterIndex + 1) / chapters.length) * 100}%` }]} /></View>
            </View>

            <Text style={styles.eyebrow}>{chapter.eyebrow}</Text>
            <Text style={styles.title}>{chapter.title}</Text>
            <Text style={styles.deck}>{chapter.summary}</Text>
            <View style={styles.goldRule} />

            <Text style={[styles.openingParagraph, { fontSize, lineHeight: fontSize * 1.58 }]}>
              <Text style={styles.dropCap}>{opening.charAt(0)}</Text>{opening.slice(1)}
            </Text>
            {chapter.paragraphs.slice(1).map((paragraph, index) => (
              <Text key={`${chapter.id}-${index + 1}`} style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.58 }]}>{paragraph}</Text>
            ))}

            <View style={styles.readerEnd}>
              <Text style={styles.readerEndText}>END OF THIS SECTION</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={bookmarked ? "Remove bookmark" : "Save a bookmark"} onPress={() => void handleBookmark()} style={styles.bookmarkButton}>
                <Text style={styles.bookmarkIcon}>{bookmarked ? "◆" : "◇"}</Text>
                <Text style={styles.bookmarkText}>{bookmarked ? "BOOKMARKED" : "SAVE MARKER"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.navigator}>
              {previousChapter ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(previousChapter.id)} style={styles.previousNav}>
                  <Text style={styles.navLabel}>← PREVIOUS</Text>
                  <Text style={styles.previousNavText}>{previousChapter.title}</Text>
                </TouchableOpacity>
              ) : <View style={styles.navSpacer} />}
              {nextChapter ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(nextChapter.id)} style={styles.nextNav}>
                  <Text style={styles.navLabelLight}>NEXT SECTION</Text>
                  <Text style={styles.nextNavText}>{nextChapter.title} →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ProtectedReader>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#FBF8F0", flex: 1 },
  topbar: { alignItems: "center", backgroundColor: "#062E26", flexDirection: "row", height: 58, justifyContent: "space-between", paddingHorizontal: 12 },
  topButton: { alignItems: "center", height: 38, justifyContent: "center", width: 42 },
  topIcon: { color: "#FFFDF6", fontSize: 19 },
  contentsControl: { paddingHorizontal: 8, paddingVertical: 10 },
  contentsControlText: { color: "#C6A44A", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 },
  textSizeControl: { color: "#FFFDF6", fontSize: 16, fontWeight: "800" },
  scrollContent: { flexGrow: 1 },
  column: { alignSelf: "center", maxWidth: 650, paddingBottom: 46, paddingHorizontal: 26, paddingTop: 27, width: "100%" },
  progressBlock: { marginBottom: 30 },
  progressHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progressLabel: { color: "#8D7437", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  protectedLabel: { color: "#65806E", fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  progressTrack: { backgroundColor: "#E6DECA", height: 2, width: "100%" },
  progressFill: { backgroundColor: "#C6A44A", height: 2 },
  eyebrow: { color: "#95752E", fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: "#16342B", fontFamily: "serif", fontSize: 35, fontWeight: "700", letterSpacing: -0.7, lineHeight: 42, marginTop: 10 },
  deck: { color: "#52665C", fontFamily: "serif", fontSize: 17, lineHeight: 26, marginTop: 12 },
  goldRule: { backgroundColor: "#C6A44A", height: 3, marginBottom: 28, marginTop: 23, width: 44 },
  openingParagraph: { color: "#263A31", fontFamily: "serif", letterSpacing: 0.12, marginBottom: 21 },
  dropCap: { color: "#17372E", fontFamily: "serif", fontSize: 55, fontWeight: "700", lineHeight: 49 },
  paragraph: { color: "#263A31", fontFamily: "serif", letterSpacing: 0.12, marginBottom: 21 },
  readerEnd: { alignItems: "center", borderBottomColor: "#DDD4BD", borderTopColor: "#DDD4BD", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingVertical: 15 },
  readerEndText: { color: "#8C8D7C", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bookmarkButton: { alignItems: "center", flexDirection: "row", gap: 6, padding: 5 },
  bookmarkIcon: { color: "#B79238", fontSize: 16 },
  bookmarkText: { color: "#17372E", fontSize: 9, fontWeight: "900", letterSpacing: 0.65 },
  navigator: { flexDirection: "row", gap: 12, marginTop: 22 },
  navSpacer: { flex: 1 },
  previousNav: { flex: 1, paddingTop: 7 },
  navLabel: { color: "#887B5E", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  previousNavText: { color: "#17372E", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 5 },
  nextNav: { backgroundColor: "#17372E", flex: 1, padding: 15 },
  navLabelLight: { color: "#C6D5C7", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  nextNavText: { color: "#FFFDF6", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 5 },
});
