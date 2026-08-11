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

  useEffect(() => {
    void saveReadingPosition(chapter.id);
    void getBookmarks().then((saved) => setBookmarked(saved.includes(chapter.id)));
  }, [chapter.id]);

  const handleBookmark = async () => {
    const bookmarks = await toggleBookmark(chapter.id);
    setBookmarked(bookmarks.includes(chapter.id));
  };

  const changeChapter = (id: string) => {
    router.replace(`/reader?chapterId=${id}` as never);
  };

  return (
    <ProtectedReader>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.toolbar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to library" onPress={() => router.back()} style={styles.iconButton}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open table of contents" onPress={() => router.push("/contents" as never)} style={styles.contentsButton}>
            <Text style={styles.contentsText}>Contents</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Change text size"
            onPress={() => setFontSizeIndex((value) => (value + 1) % FONT_SIZES.length)}
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>aA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? "Remove bookmark" : "Bookmark this section"}
            onPress={() => void handleBookmark()}
            style={styles.iconButton}
          >
            <Text style={styles.bookmark}>{bookmarked ? "●" : "○"}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.protectionPill}>
            <Text style={styles.protectionText}>PROTECTED READING · LICENSED TO YOUR DEVICE</Text>
          </View>
          <Text style={styles.eyebrow}>{chapter.eyebrow}</Text>
          <Text style={styles.title}>{chapter.title}</Text>
          <View style={styles.rule} />
          {chapter.paragraphs.map((paragraph, index) => (
            <Text key={`${chapter.id}-${index}`} style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.56 }]}>
              {paragraph}
            </Text>
          ))}
          <View style={styles.navigator}>
            {previousChapter ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(previousChapter.id)} style={styles.secondaryNav}>
                <Text style={styles.secondaryNavLabel}>PREVIOUS</Text>
                <Text style={styles.secondaryNavText}>{previousChapter.title}</Text>
              </TouchableOpacity>
            ) : <View style={styles.emptyNav} />}
            {nextChapter ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => changeChapter(nextChapter.id)} style={styles.primaryNav}>
                <Text style={styles.primaryNavLabel}>NEXT SECTION</Text>
                <Text style={styles.primaryNavText}>{nextChapter.title}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ProtectedReader>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FCFAF2" },
  toolbar: { alignItems: "center", borderBottomColor: "#E4DFD1", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  iconButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  backIcon: { color: "#073E32", fontSize: 36, lineHeight: 36 },
  contentsButton: { paddingHorizontal: 8, paddingVertical: 8 },
  contentsText: { color: "#073E32", fontSize: 14, fontWeight: "700" },
  textButton: { alignItems: "center", borderColor: "#C9C4B6", borderRadius: 16, borderWidth: 1, height: 32, justifyContent: "center", width: 40 },
  textButtonLabel: { color: "#073E32", fontSize: 14, fontWeight: "700" },
  bookmark: { color: "#B58B38", fontSize: 25 },
  content: { paddingBottom: 48, paddingHorizontal: 25, paddingTop: 24 },
  protectionPill: { alignSelf: "flex-start", backgroundColor: "#E7F0E8", borderRadius: 10, marginBottom: 22, paddingHorizontal: 10, paddingVertical: 7 },
  protectionText: { color: "#37624D", fontSize: 9, fontWeight: "800", letterSpacing: 0.55 },
  eyebrow: { color: "#B58B38", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#15221E", fontFamily: "serif", fontSize: 34, fontWeight: "700", letterSpacing: -0.4, lineHeight: 40, marginTop: 10 },
  rule: { backgroundColor: "#B58B38", height: 3, marginBottom: 25, marginTop: 22, width: 44 },
  paragraph: { color: "#25322C", fontFamily: "serif", letterSpacing: 0.1, marginBottom: 19 },
  navigator: { flexDirection: "row", gap: 12, marginTop: 22 },
  emptyNav: { flex: 1 },
  secondaryNav: { flex: 1, paddingVertical: 12 },
  secondaryNavLabel: { color: "#6D766D", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  secondaryNavText: { color: "#073E32", fontSize: 14, fontWeight: "700", marginTop: 4 },
  primaryNav: { backgroundColor: "#073E32", borderRadius: 14, flex: 1, padding: 14 },
  primaryNavLabel: { color: "#D7E4D9", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  primaryNavText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", lineHeight: 19, marginTop: 4 },
});
