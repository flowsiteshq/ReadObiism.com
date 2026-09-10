import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BOOK_SUBTITLE, chapters } from "@/lib/book-data";

const COVER = require("../assets/images/obi-ism-cover-000.jpg");

export default function ContentsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" backgroundColor="#F6F1E5" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerMark}>CONTENTS</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.headerIntro}>
          <Image source={COVER} contentFit="cover" style={styles.coverThumb} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>THE EDITION</Text>
            <Text style={styles.headerTitle}>A deliberate path through character.</Text>
            <Text style={styles.headerBody}>{BOOK_SUBTITLE}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={chapters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.listLabel}>THE COMPLETE EDITION</Text>}
        renderItem={({ item, index }) =>
          item.kind === "part" ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => router.replace(`/reader?chapterId=${item.id}` as never)}
              style={styles.partRow}
            >
              <View>
                <Text style={styles.partLabel}>{item.label}</Text>
                <Text style={styles.partTitle}>{item.title}</Text>
                <Text style={styles.partSummary}>{item.summary}</Text>
              </View>
              <Text style={styles.partArrow}>→</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => router.replace(`/reader?chapterId=${item.id}` as never)}
              style={styles.chapterRow}
            >
              <Text style={styles.chapterNumber}>{String(index + 1).padStart(2, "0")}</Text>
              <View style={styles.chapterCopy}>
                <Text style={styles.chapterEyebrow}>{item.label}</Text>
                <Text style={styles.chapterTitle}>{item.title}</Text>
                <Text style={styles.chapterSummary}>{item.summary}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          )
        }
        ListFooterComponent={<Text style={styles.footer}>This edition contains the approved Preface, Introduction, four parts, twenty-nine chapters, Epilogue, Appendices, and Authors’ Note.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F6F1E5", flex: 1 },
  header: { backgroundColor: "#062E26", paddingBottom: 25, paddingHorizontal: 24, paddingTop: 26 },
  headerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  backText: { color: "#FFFDF6", fontSize: 20 },
  headerMark: { color: "#C6A44A", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  headerSpacer: { width: 40 },
  headerIntro: { alignItems: "center", flexDirection: "row", gap: 18, marginTop: 17 },
  coverThumb: { borderColor: "#C6A44A", borderWidth: 1, height: 98, width: 66 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#C6A44A", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  headerTitle: { color: "#FFFDF6", fontFamily: "serif", fontSize: 23, fontWeight: "700", lineHeight: 28, marginTop: 5 },
  headerBody: { color: "#B6C7B9", fontSize: 11, lineHeight: 16, marginTop: 6 },
  list: { paddingBottom: 30, paddingHorizontal: 24, paddingTop: 23 },
  listLabel: { color: "#96752E", fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 11 },
  chapterRow: { alignItems: "flex-start", borderTopColor: "#D8CFB9", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, paddingVertical: 21 },
  partRow: { backgroundColor: "#17372E", flexDirection: "row", justifyContent: "space-between", marginBottom: 4, marginTop: 8, padding: 19 },
  partLabel: { color: "#C6A44A", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 },
  partTitle: { color: "#FFFDF6", fontFamily: "serif", fontSize: 23, fontWeight: "700", lineHeight: 29, marginTop: 5, maxWidth: 280 },
  partSummary: { color: "#C5D4C7", fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 280 },
  partArrow: { color: "#C6A44A", fontSize: 20, marginLeft: 10, marginTop: 7 },
  chapterNumber: { color: "#B18E3A", fontFamily: "serif", fontSize: 21, lineHeight: 25, width: 27 },
  chapterCopy: { flex: 1 },
  chapterEyebrow: { color: "#8B8B78", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  chapterTitle: { color: "#17372E", fontFamily: "serif", fontSize: 22, fontWeight: "700", lineHeight: 27, marginTop: 4 },
  chapterSummary: { color: "#607067", fontSize: 13, lineHeight: 19, marginTop: 6 },
  arrow: { color: "#17372E", fontSize: 19, marginTop: 17 },
  footer: { borderTopColor: "#D8CFB9", borderTopWidth: StyleSheet.hairlineWidth, color: "#858575", fontSize: 11, fontStyle: "italic", lineHeight: 17, paddingTop: 18, textAlign: "center" },
});
