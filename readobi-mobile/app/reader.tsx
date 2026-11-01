import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import { AppScreen } from "@/components/app-screen";
import type { BookChapter } from "@/lib/book-data";
import { ProtectedReader } from "@/components/protected-reader";
import { haptic } from "@/lib/haptics";
import { loadChapter } from "@/lib/entitlement";
import { useEdition } from "@/lib/use-edition";
import { getBookmarks, saveReadingPosition, toggleBookmark } from "@/lib/reader-storage";

const FONT_SIZES = [18, 20, 22, 24, 26];

export default function ReaderScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId?: string }>();
  const { chapters, licensed, loading, error, reload } = useEdition();
  const chapter = chapters.find((item) => item.id === chapterId) ?? chapters[0];
  const [fontSizeIndex, setFontSizeIndex] = useState(1);
  const [bookmarked, setBookmarked] = useState(false);
  const [section, setSection] = useState<BookChapter | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionAttempt, setSectionAttempt] = useState(0);
  const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
  const nextChapter = chapters[chapterIndex + 1];
  const previousChapter = chapters[chapterIndex - 1];
  const fontSize = FONT_SIZES[fontSizeIndex];
  const opening = section?.paragraphs[0] ?? "";
  const completion = Math.round(((chapterIndex + 1) / chapters.length) * 100);

  useEffect(() => {
    void saveReadingPosition(chapter.id);
    void getBookmarks().then((saved) => setBookmarked(saved.includes(chapter.id)));
  }, [chapter.id]);

  useEffect(() => {
    let active = true;
    setSection(null);
    setSectionError(null);
    if (!licensed) {
      setSectionLoading(false);
      return () => { active = false; };
    }

    setSectionLoading(true);
    void loadChapter(chapter.id)
      .then((result) => {
        if (active) setSection(result);
      })
      .catch((cause: unknown) => {
        if (active) setSectionError(cause instanceof Error ? cause.message : "We could not load this section.");
      })
      .finally(() => {
        if (active) setSectionLoading(false);
      });
    return () => { active = false; };
  }, [chapter.id, licensed, sectionAttempt]);

  const handleBookmark = async () => {
    const bookmarks = await toggleBookmark(chapter.id);
    const isSaved = bookmarks.includes(chapter.id);
    setBookmarked(isSaved);
    isSaved ? haptic.success() : haptic.selection();
  };
  const changeChapter = (id: string) => { haptic.light(); router.replace(`/reader?chapterId=${id}` as never); };
  const changeType = () => { haptic.selection(); setFontSizeIndex((value) => (value + 1) % FONT_SIZES.length); };

  if (loading || sectionLoading || !licensed || sectionError || !section) {
    const stateError = sectionError ?? error;
    const stateTitle = loading || sectionLoading ? "Preparing your edition…" : stateError ? "We couldn’t open this section." : "Your edition is locked.";
    const stateBody = loading || sectionLoading
      ? "Verifying your licence and loading only this section."
      : stateError ?? "Sign in with the account used for your purchase to read the complete edition.";
    return (
      <ProtectedReader>
        <AppScreen backgroundColor="#FFF6E7" statusBarColor="#0B0F14" statusBarStyle="light">
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.stateContainer}>
            <View style={styles.stateCard}>
              <Text style={styles.stateKicker}>OBI-ISM SECURE READER</Text>
              <Text style={styles.stateTitle}>{stateTitle}</Text>
              <Text style={styles.stateBody}>{stateBody}</Text>
              {!loading && !sectionLoading ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => stateError ? (licensed ? setSectionAttempt((value) => value + 1) : reload()) : router.replace("/(tabs)/account" as never)}
                  style={styles.stateButton}
                >
                  <Text style={styles.stateButtonText}>{stateError ? "RETRY" : "SIGN IN / CHECK ACCESS"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </AppScreen>
      </ProtectedReader>
    );
  }

  return (
    <ProtectedReader>
      <AppScreen backgroundColor="#FFF6E7" statusBarColor="#0B0F14" statusBarStyle="light">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topbar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to library" onPress={() => { haptic.light(); router.back(); }} style={styles.topButton}><Text style={styles.topIcon}>←</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open table of contents" onPress={() => { haptic.light(); router.push("/contents" as never); }} style={styles.contentsControl}><Text style={styles.contentsControlText}>OPEN PATH</Text><Text style={styles.contentsControlArrow}>↗</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change text size" onPress={changeType} style={styles.topButton}><Text style={styles.textSizeControl}>Aᴬ</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={styles.signalCard}>
              <View style={styles.signalTop}><View><Text style={styles.signalKicker}>YOU ARE HERE</Text><Text style={styles.signalLabel}>{chapter.label}</Text></View><View style={styles.progressCircle}><Text style={styles.progressCircleNumber}>{completion}<Text style={styles.progressCircleLabel}>%</Text></Text></View></View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completion}%` }]} /></View>
              <Text style={styles.signalFoot}>SECTION {String(chapterIndex + 1).padStart(2, "0")} OF {String(chapters.length).padStart(2, "0")} · {licensed ? "LICENSED EDITION" : "PREVIEW EDITION"}</Text>
            </View>

            <View style={styles.chapterHeader}><Text style={styles.eyebrow}>{chapter.kind === "chapter" ? "THE OBI-ISM READER" : "THE COMPLETE EDITION"}</Text><Text style={styles.title}>{chapter.title}</Text><Text style={styles.deck}>{chapter.summary}</Text><View style={styles.accentRow}><View style={styles.accentCoral} /><View style={styles.accentSky} /><View style={styles.accentLime} /></View></View>

            <Text style={[styles.openingParagraph, { fontSize, lineHeight: fontSize * 1.58 }]}><Text style={styles.dropCap}>{opening.charAt(0)}</Text>{opening.slice(1)}</Text>
            {section.paragraphs.slice(1).map((paragraph, index) => <Text key={`${chapter.id}-${index + 1}`} style={[styles.paragraph, { fontSize, lineHeight: fontSize * 1.58 }]}>{paragraph}</Text>)}

            <View style={styles.readerEnd}>
              <View><Text style={styles.readerEndKicker}>PAUSE WITH THE IDEA</Text><Text style={styles.readerEndText}>Save this place, return when ready.</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={bookmarked ? "Remove bookmark" : "Save a bookmark"} onPress={() => void handleBookmark()} style={[styles.bookmarkButton, bookmarked && styles.bookmarkButtonSaved]}><Text style={[styles.bookmarkIcon, bookmarked && styles.bookmarkIconSaved]}>{bookmarked ? "✦" : "＋"}</Text><Text style={[styles.bookmarkText, bookmarked && styles.bookmarkTextSaved]}>{bookmarked ? "SAVED" : "MARK"}</Text></TouchableOpacity>
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
      </AppScreen>
    </ProtectedReader>
  );
}

const styles = StyleSheet.create({
  stateContainer: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  stateCard: { backgroundColor: "#0B0F14", maxWidth: 460, padding: 28, width: "100%" },
  stateKicker: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  stateTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 30, fontWeight: "700", lineHeight: 36, marginTop: 12 },
  stateBody: { color: "#C6C9EA", fontSize: 15, lineHeight: 23, marginTop: 12 },
  stateButton: { backgroundColor: "#E9C46A", marginTop: 22, minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  stateButtonText: { color: "#15120D", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textAlign: "center" },
  safeArea: { backgroundColor: "#FFF6E7", flex: 1 }, statusBuffer: { backgroundColor: "#0B0F14", height: 14 },
  topbar: { alignItems: "center", backgroundColor: "#0B0F14", flexDirection: "row", height: 58, justifyContent: "space-between", paddingHorizontal: 12 },
  topButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.09)", height: 44, justifyContent: "center", width: 44 }, topIcon: { color: "#FFFFFF", fontSize: 19 },
  contentsControl: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 9, paddingVertical: 13 }, contentsControlText: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 0.85 }, contentsControlArrow: { color: "#E9C46A", fontSize: 15 }, textSizeControl: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  scrollContent: { flexGrow: 1 }, column: { alignSelf: "center", maxWidth: 650, paddingBottom: 46, paddingHorizontal: 23, paddingTop: 23, width: "100%" },
  signalCard: { backgroundColor: "#0B0F14", overflow: "hidden", padding: 16 }, signalTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, signalKicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 }, signalLabel: { color: "#FFFFFF", fontFamily: "serif", fontSize: 19, fontWeight: "700", marginTop: 5 },
  progressCircle: { alignItems: "center", backgroundColor: "#E9C46A", borderRadius: 22, height: 44, justifyContent: "center", width: 44 }, progressCircleNumber: { color: "#15120D", fontFamily: "serif", fontSize: 17, fontWeight: "700", lineHeight: 19 }, progressCircleLabel: { color: "#15120D", fontSize: 8, fontWeight: "900" },
  progressTrack: { backgroundColor: "#333B49", height: 5, marginTop: 16 }, progressFill: { backgroundColor: "#E9C46A", height: 5 }, signalFoot: { color: "#C6C9EA", fontSize: 9, fontWeight: "900", letterSpacing: 0.42, marginTop: 9 },
  chapterHeader: { marginTop: 29 }, eyebrow: { color: "#9A6E1B", fontSize: 10, fontWeight: "900", letterSpacing: 1.15 }, title: { color: "#15120D", fontFamily: "serif", fontSize: 36, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: 8 }, deck: { color: "#525568", fontFamily: "serif", fontSize: 17, lineHeight: 26, marginTop: 13 },
  accentRow: { flexDirection: "row", gap: 5, marginBottom: 27, marginTop: 22 }, accentCoral: { backgroundColor: "#E9C46A", height: 4, width: 35 }, accentSky: { backgroundColor: "#9A6E1B", height: 4, width: 22 }, accentLime: { backgroundColor: "#F2EAD3", height: 4, width: 13 },
  openingParagraph: { color: "#262736", fontFamily: "serif", letterSpacing: 0.12, marginBottom: 21 }, dropCap: { color: "#9A6E1B", fontFamily: "serif", fontSize: 58, fontWeight: "700", lineHeight: 49 }, paragraph: { color: "#262736", fontFamily: "serif", letterSpacing: 0.12, marginBottom: 21 },
  readerEnd: { alignItems: "center", backgroundColor: "#F2EAD3", flexDirection: "row", justifyContent: "space-between", marginTop: 9, padding: 16 }, readerEndKicker: { color: "#9A6E1B", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, readerEndText: { color: "#15120D", fontFamily: "serif", fontSize: 15, fontWeight: "700", marginTop: 4 }, bookmarkButton: { alignItems: "center", backgroundColor: "#0B0F14", flexDirection: "row", gap: 5, minHeight: 44, paddingHorizontal: 11, paddingVertical: 13 }, bookmarkButtonSaved: { backgroundColor: "#E9C46A" }, bookmarkIcon: { color: "#E9C46A", fontSize: 15 }, bookmarkIconSaved: { color: "#15120D" }, bookmarkText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.55 }, bookmarkTextSaved: { color: "#15120D" },
  reflectionCard: { backgroundColor: "#0B0F14", marginTop: 16, padding: 18 }, reflectionKicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 }, reflectionText: { color: "#FFFFFF", fontFamily: "serif", fontSize: 19, fontWeight: "700", lineHeight: 27, marginTop: 8 }, reflectionRule: { backgroundColor: "#E9C46A", height: 3, marginTop: 17, width: 35 }, reflectionSource: { color: "#C6C9EA", fontSize: 8, fontWeight: "900", letterSpacing: 0.75, marginTop: 10 }, reflectionContinue: { alignItems: "center", backgroundColor: "#E9C46A", flexDirection: "row", justifyContent: "space-between", minHeight: 44, marginTop: 18, paddingHorizontal: 14, paddingVertical: 14 }, reflectionContinueText: { color: "#15120D", fontSize: 10, fontWeight: "900", letterSpacing: 0.85 }, reflectionContinueArrow: { color: "#15120D", fontSize: 20 },
  navigator: { flexDirection: "row", gap: 12, marginTop: 22 }, navSpacer: { flex: 1 }, previousNav: { backgroundColor: "#FFFFFF", borderColor: "#E3DCC8", borderWidth: 1, flex: 1, padding: 15 }, navLabel: { color: "#5A5F72", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, previousNavText: { color: "#15120D", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 6 }, nextNav: { backgroundColor: "#E9C46A", flex: 1, padding: 15 }, navLabelLight: { color: "#15120D", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, nextNavText: { color: "#15120D", fontFamily: "serif", fontSize: 15, fontWeight: "700", lineHeight: 20, marginTop: 6 },
});
