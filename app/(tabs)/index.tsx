import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { BOOK_AUTHOR, BOOK_SUBTITLE, BOOK_TITLE, chapters } from "@/lib/book-data";
import { getReadingPosition, type ReadingPosition } from "@/lib/reader-storage";

const COVER = require("../../assets/images/obi-ism-cover-000.jpg");

export default function LibraryScreen() {
  const [position, setPosition] = useState<ReadingPosition | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getReadingPosition().then(setPosition);
    }, []),
  );

  const activeChapter = chapters.find((chapter) => chapter.id === position?.chapterId) ?? chapters[0];
  const openReader = () => router.push(`/reader?chapterId=${activeChapter.id}` as never);

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <StatusBar style="dark" backgroundColor="#F6F1E5" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <View style={styles.hero}>
            <View style={styles.topLine} />
            <View style={styles.topbar}>
              <View>
                <Text style={styles.wordmark}>OBI–ISM</Text>
                <Text style={styles.wordmarkSub}>A philosophy of responsible living</Text>
              </View>
              <View style={styles.editionPill}>
                <Text style={styles.editionPillText}>PERSONAL EDITION</Text>
              </View>
            </View>

            <View style={styles.heroMain}>
              <View style={styles.coverFrame}>
                <Image source={COVER} contentFit="cover" transition={250} style={styles.coverImage} accessibilityLabel="OBI-ISM book cover" />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>NOW IN YOUR LIBRARY</Text>
                <Text style={styles.heroTitle}>{BOOK_TITLE}</Text>
                <View style={styles.shortRule} />
                <Text style={styles.heroSubtitle}>{BOOK_SUBTITLE}</Text>
                <Text style={styles.heroAuthor}>{BOOK_AUTHOR}</Text>
              </View>
            </View>

            <View style={styles.heroFooter}>
              <Text style={styles.heroFooterText}>A private, read-only edition for one licensed reader.</Text>
              <Text style={styles.heroFooterMark}>01</Text>
            </View>
          </View>

          <View style={styles.libraryBody}>
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionKicker}>YOUR READING ROOM</Text>
                <Text style={styles.sectionHeading}>{position ? "Continue the thought." : "Begin the conversation."}</Text>
              </View>
              <View style={styles.progressMedallion}>
                <Text style={styles.progressNumber}>{position ? "01" : "00"}</Text>
                <Text style={styles.progressCaption}>OF {String(chapters.length).padStart(2, "0")}</Text>
              </View>
            </View>

            <View style={styles.readingCard}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardKicker}>{position ? "CURRENTLY OPEN" : "OPENING SECTION"}</Text>
              <Text style={styles.cardTitle}>{activeChapter.title}</Text>
              <Text style={styles.cardBody}>{activeChapter.summary}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta}>{position ? "Reading position saved" : "Ready whenever you are"}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={openReader} style={styles.readButton}>
                  <Text style={styles.readButtonText}>{position ? "Continue reading" : "Open book"}</Text>
                  <Text style={styles.readArrow}>→</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/contents" as never)} style={styles.contentsPanel}>
              <View style={styles.contentsLine} />
              <View style={styles.contentsTextBlock}>
                <Text style={styles.contentsKicker}>EXPLORE THE EDITION</Text>
                <Text style={styles.contentsTitle}>Contents & reading markers</Text>
                <Text style={styles.contentsBody}>Move deliberately between the foundations and the philosophy.</Text>
              </View>
              <View style={styles.contentsCircle}><Text style={styles.contentsArrow}>→</Text></View>
            </TouchableOpacity>

            <View style={styles.protectionNote}>
              <View style={styles.protectionDot} />
              <Text style={styles.protectionText}>Protected reader mode activates when the book is open on supported devices.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  page: { alignSelf: "center", maxWidth: 600, width: "100%" },
  hero: { backgroundColor: "#062E26", overflow: "hidden", paddingBottom: 24, paddingHorizontal: 24, paddingTop: 31 },
  topLine: { backgroundColor: "#C6A44A", height: 3, left: 0, position: "absolute", right: 0, top: 0 },
  topbar: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", paddingTop: 12 },
  wordmark: { color: "#FFFDF6", fontSize: 20, fontWeight: "900", letterSpacing: 0.7 },
  wordmarkSub: { color: "#AAC0B1", fontSize: 10, letterSpacing: 0.45, marginTop: 2 },
  editionPill: { borderColor: "#54796B", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, marginTop: 3, paddingHorizontal: 9, paddingVertical: 6 },
  editionPillText: { color: "#D9E5D9", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  heroMain: { alignItems: "center", flexDirection: "row", gap: 22, marginTop: 30 },
  coverFrame: { backgroundColor: "#C6A44A", padding: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.35, shadowRadius: 18 },
  coverImage: { height: 208, width: 139 },
  heroCopy: { flex: 1, paddingBottom: 4 },
  eyebrow: { color: "#C6A44A", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#FFFDF6", fontSize: 33, fontWeight: "900", letterSpacing: -1.15, marginTop: 7 },
  shortRule: { backgroundColor: "#C6A44A", height: 2, marginBottom: 12, marginTop: 14, width: 38 },
  heroSubtitle: { color: "#E4EAE0", fontFamily: "serif", fontSize: 16, fontWeight: "700", lineHeight: 22 },
  heroAuthor: { color: "#AAC0B1", fontSize: 10, letterSpacing: 0.2, lineHeight: 15, marginTop: 14 },
  heroFooter: { alignItems: "center", borderTopColor: "#355F50", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 27, paddingTop: 15 },
  heroFooterText: { color: "#B6C7B9", flex: 1, fontSize: 11, lineHeight: 16 },
  heroFooterMark: { color: "#C6A44A", fontFamily: "serif", fontSize: 18, marginLeft: 16 },
  libraryBody: { backgroundColor: "#F6F1E5", paddingBottom: 38, paddingHorizontal: 24, paddingTop: 28 },
  sectionHeadingRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  sectionKicker: { color: "#9B7B31", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  sectionHeading: { color: "#17372E", fontFamily: "serif", fontSize: 26, fontWeight: "700", letterSpacing: -0.45, lineHeight: 33, marginTop: 6 },
  progressMedallion: { alignItems: "center", borderColor: "#CDBE96", borderRadius: 28, borderWidth: 1, height: 56, justifyContent: "center", width: 56 },
  progressNumber: { color: "#17372E", fontFamily: "serif", fontSize: 18, lineHeight: 19 },
  progressCaption: { color: "#8E8061", fontSize: 7, fontWeight: "800", letterSpacing: 0.45 },
  readingCard: { backgroundColor: "#FFFDF8", borderColor: "#E0D6BD", borderWidth: 1, marginTop: 23, overflow: "hidden", padding: 22 },
  cardAccent: { backgroundColor: "#C6A44A", bottom: 0, left: 0, position: "absolute", top: 0, width: 4 },
  cardKicker: { color: "#96752E", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  cardTitle: { color: "#17372E", fontFamily: "serif", fontSize: 25, fontWeight: "700", letterSpacing: -0.35, lineHeight: 31, marginTop: 8 },
  cardBody: { color: "#53665D", fontSize: 14, lineHeight: 21, marginTop: 9 },
  cardFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 19 },
  cardMeta: { color: "#79837A", flex: 1, fontSize: 10, lineHeight: 15, marginRight: 10 },
  readButton: { alignItems: "center", backgroundColor: "#17372E", flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  readButtonText: { color: "#FFFDF6", fontSize: 12, fontWeight: "900" },
  readArrow: { color: "#C6A44A", fontSize: 19, lineHeight: 20 },
  contentsPanel: { alignItems: "center", borderBottomColor: "#D9CFB8", borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: "#D9CFB8", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", marginTop: 26, paddingVertical: 20 },
  contentsLine: { backgroundColor: "#C6A44A", height: 45, marginRight: 14, width: 2 },
  contentsTextBlock: { flex: 1 },
  contentsKicker: { color: "#96752E", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  contentsTitle: { color: "#17372E", fontSize: 17, fontWeight: "800", marginTop: 5 },
  contentsBody: { color: "#68766D", fontSize: 12, lineHeight: 17, marginTop: 3 },
  contentsCircle: { alignItems: "center", borderColor: "#17372E", borderRadius: 18, borderWidth: 1, height: 36, justifyContent: "center", marginLeft: 12, width: 36 },
  contentsArrow: { color: "#17372E", fontSize: 18 },
  protectionNote: { alignItems: "center", flexDirection: "row", marginTop: 19 },
  protectionDot: { backgroundColor: "#5B9374", borderRadius: 4, height: 7, marginRight: 8, width: 7 },
  protectionText: { color: "#6B786E", flex: 1, fontSize: 10, lineHeight: 15 },
});
