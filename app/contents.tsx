import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BOOK_SUBTITLE, chapters } from "@/lib/book-data";

export default function ContentsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>OBI-ISM</Text>
          <Text style={styles.headerTitle}>Contents</Text>
        </View>
      </View>

      <FlatList
        data={chapters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={styles.introTitle}>{BOOK_SUBTITLE}</Text>
            <Text style={styles.introBody}>Select a section to begin or continue reading.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            onPress={() => router.replace(`/reader?chapterId=${item.id}` as never)}
            style={styles.chapterRow}
          >
            <Text style={styles.chapterNumber}>{String(index + 1).padStart(2, "0")}</Text>
            <View style={styles.chapterCopy}>
              <Text style={styles.chapterEyebrow}>{item.eyebrow}</Text>
              <Text style={styles.chapterTitle}>{item.title}</Text>
              <Text style={styles.chapterSummary}>{item.summary}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F3E8" },
  header: { alignItems: "center", flexDirection: "row", paddingHorizontal: 20, paddingVertical: 18 },
  backButton: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  backText: { color: "#073E32", fontSize: 38, lineHeight: 38 },
  headerCopy: { marginLeft: 12 },
  eyebrow: { color: "#B58B38", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  headerTitle: { color: "#15221E", fontSize: 22, fontWeight: "700", marginTop: 2 },
  list: { paddingBottom: 40 },
  intro: { borderBottomColor: "#D9D6CC", borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 24, paddingBottom: 22, paddingTop: 8 },
  introTitle: { color: "#073E32", fontSize: 22, fontWeight: "700", lineHeight: 28 },
  introBody: { color: "#607168", fontSize: 15, lineHeight: 22, marginTop: 8 },
  chapterRow: { alignItems: "center", borderBottomColor: "#DDD8CB", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, marginHorizontal: 24, paddingVertical: 22 },
  chapterNumber: { color: "#B58B38", fontSize: 13, fontWeight: "800", letterSpacing: 1, width: 26 },
  chapterCopy: { flex: 1 },
  chapterEyebrow: { color: "#6D766D", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  chapterTitle: { color: "#15221E", fontSize: 18, fontWeight: "700", lineHeight: 24, marginTop: 4 },
  chapterSummary: { color: "#607168", fontSize: 14, lineHeight: 20, marginTop: 5 },
  chevron: { color: "#073E32", fontSize: 28 },
});
