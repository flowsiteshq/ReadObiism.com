import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { BOOK_AUTHOR, BOOK_SUBTITLE, BOOK_TITLE, chapters } from "@/lib/book-data";
import { getReadingPosition, type ReadingPosition } from "@/lib/reader-storage";

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>OBI-ISM</Text>
          <View style={styles.licenseChip}><Text style={styles.licenseText}>READ ONLY</Text></View>
        </View>
        <View style={styles.hero}>
          <View style={styles.cover}>
            <View style={styles.coverStripe} />
            <Text style={styles.coverTitle}>OBI-ISM</Text>
            <Text style={styles.coverSub}>BUILDING A JUST SOCIETY{`\n`}THROUGH CHARACTER</Text>
            <View style={styles.coverRule} />
            <Text style={styles.coverAuthor}>ECHESI A. M. O. E.{`\n`}ONASONTAlRE</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>DIGITAL EDITION</Text>
            <Text style={styles.bookTitle}>{BOOK_TITLE}</Text>
            <Text style={styles.subtitle}>{BOOK_SUBTITLE}</Text>
            <Text style={styles.author}>{BOOK_AUTHOR}</Text>
          </View>
        </View>

        <View style={styles.securityBanner}>
          <Text style={styles.securityTitle}>Protected reading</Text>
          <Text style={styles.securityCopy}>Your book is designed for a personal, read-only experience. Capture deterrence is active during reading on supported devices.</Text>
        </View>

        <View style={styles.continueCard}>
          <Text style={styles.cardLabel}>{position ? "CONTINUE READING" : "BEGIN READING"}</Text>
          <Text style={styles.cardTitle}>{activeChapter.title}</Text>
          <Text style={styles.cardText}>{position ? "Your place is saved privately on this device." : "Your edition is ready to read on this device."}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={openReader} style={styles.readButton}>
            <Text style={styles.readButtonText}>{position ? "Continue" : "Open book"}</Text>
            <Text style={styles.readButtonArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/contents" as never)} style={styles.contentsRow}>
          <View>
            <Text style={styles.contentsLabel}>IN THIS EDITION</Text>
            <Text style={styles.contentsTitle}>{chapters.length} available sections</Text>
          </View>
          <Text style={styles.contentsArrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.note}>Full book content will be added after the final proofread manuscript is approved for release.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36, paddingHorizontal: 22, paddingTop: 18 },
  brandRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  brand: { color: "#073E32", fontSize: 19, fontWeight: "900", letterSpacing: 0.3 },
  licenseChip: { backgroundColor: "#E7F0E8", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  licenseText: { color: "#37624D", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  hero: { alignItems: "center", flexDirection: "row", gap: 20 },
  cover: { backgroundColor: "#073E32", borderRadius: 8, height: 220, justifyContent: "space-between", overflow: "hidden", padding: 16, shadowColor: "#000000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14, width: 142 },
  coverStripe: { backgroundColor: "#B58B38", height: 7, left: 0, position: "absolute", top: 0, width: "100%" },
  coverTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: -0.6, marginTop: 7 },
  coverSub: { color: "#F7F3E8", fontSize: 8, fontWeight: "900", letterSpacing: 0.25, lineHeight: 11 },
  coverRule: { backgroundColor: "#B58B38", height: 2, width: 30 },
  coverAuthor: { color: "#E5D3A7", fontSize: 7, fontWeight: "800", letterSpacing: 1.1, lineHeight: 10 },
  heroCopy: { flex: 1 },
  kicker: { color: "#B58B38", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  bookTitle: { color: "#15221E", fontSize: 31, fontWeight: "900", letterSpacing: -1.1, marginTop: 5 },
  subtitle: { color: "#073E32", fontSize: 16, fontWeight: "700", lineHeight: 22, marginTop: 4 },
  author: { color: "#69736D", fontSize: 12, lineHeight: 17, marginTop: 10 },
  securityBanner: { backgroundColor: "#E7F0E8", borderRadius: 16, marginTop: 28, padding: 16 },
  securityTitle: { color: "#073E32", fontSize: 14, fontWeight: "900" },
  securityCopy: { color: "#456250", fontSize: 13, lineHeight: 19, marginTop: 5 },
  continueCard: { backgroundColor: "#073E32", borderRadius: 20, marginTop: 16, padding: 20 },
  cardLabel: { color: "#B9D3C0", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  cardTitle: { color: "#FFFFFF", fontSize: 23, fontWeight: "800", lineHeight: 29, marginTop: 7 },
  cardText: { color: "#D7E4D9", fontSize: 14, lineHeight: 20, marginTop: 5 },
  readButton: { alignItems: "center", backgroundColor: "#B58B38", borderRadius: 14, flexDirection: "row", justifyContent: "space-between", marginTop: 18, paddingHorizontal: 16, paddingVertical: 14 },
  readButtonText: { color: "#172018", fontSize: 15, fontWeight: "900" },
  readButtonArrow: { color: "#172018", fontSize: 27, lineHeight: 20 },
  contentsRow: { alignItems: "center", borderBottomColor: "#D9DED8", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingVertical: 22 },
  contentsLabel: { color: "#7B847E", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  contentsTitle: { color: "#15221E", fontSize: 16, fontWeight: "800", marginTop: 4 },
  contentsArrow: { color: "#073E32", fontSize: 30 },
  note: { color: "#78817B", fontSize: 12, fontStyle: "italic", lineHeight: 18, marginTop: 22, textAlign: "center" },
});
