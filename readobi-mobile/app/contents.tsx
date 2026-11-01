import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Stack, router } from "expo-router";

import { AppScreen } from "@/components/app-screen";
import { BOOK_SUBTITLE, chapters } from "@/lib/book-data";
import { haptic } from "@/lib/haptics";

const COVER = require("../assets/images/obi-ism-cover-000.jpg");
const PART_COLORS = ["#F0E0B8", "#E9C46A", "#F2EAD3", "#E3CF9E"];

export default function ContentsScreen() {
  return (
    <AppScreen backgroundColor="#FFF6E7" statusBarColor="#0B0F14" statusBarStyle="light">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <View style={styles.headerTop}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => { haptic.light(); router.back(); }} style={styles.backButton}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.headerMark}>YOUR READING MAP</Text><View style={styles.headerSpacer} /></View>
        <View style={styles.headerIntro}><View style={styles.coverOrbit}><Image source={COVER} contentFit="cover" style={styles.coverThumb} /></View><View style={styles.headerCopy}><Text style={styles.eyebrow}>39 PLACES TO BEGIN</Text><Text style={styles.headerTitle}>Choose a route through the conversation.</Text><Text style={styles.headerBody}>{BOOK_SUBTITLE}</Text></View></View>
      </View>
      <FlatList
        data={chapters}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<View style={styles.listIntro}><Text style={styles.listLabel}>THE COMPLETE EDITION</Text><Text style={styles.listSub}>Every part, chapter, appendix, and closing note is ready when you are.</Text></View>}
        renderItem={({ item, index }) => item.kind === "part" ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => { haptic.light(); router.replace(`/reader?chapterId=${item.id}` as never); }} style={[styles.partRow, { backgroundColor: PART_COLORS[Math.max(0, Math.min(3, Math.floor(index / 8)))] }]}><View style={styles.partNumberBubble}><Text style={styles.partNumber}>{String(index + 1).padStart(2, "0")}</Text></View><View style={styles.partCopy}><Text style={styles.partLabel}>{item.label}</Text><Text style={styles.partTitle}>{item.title}</Text><Text numberOfLines={3} style={styles.partSummary}>{item.summary}</Text></View><Text style={styles.partArrow}>↗</Text></TouchableOpacity>
        ) : (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => { haptic.light(); router.replace(`/reader?chapterId=${item.id}` as never); }} style={styles.chapterRow}><View style={styles.chapterNumber}><Text style={styles.chapterNumberText}>{String(index + 1).padStart(2, "0")}</Text></View><View style={styles.chapterCopy}><Text style={styles.chapterEyebrow}>{item.label}</Text><Text style={styles.chapterTitle}>{item.title}</Text><Text numberOfLines={2} style={styles.chapterSummary}>{item.summary}</Text></View><Text style={styles.arrow}>→</Text></TouchableOpacity>
        )}
        ListFooterComponent={<View style={styles.footer}><Text style={styles.footerKicker}>END OF THE MAP</Text><Text style={styles.footerText}>You never have to read it in order. The important part is returning to the thought.</Text></View>}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#FFF6E7", flex: 1 }, statusBuffer: { backgroundColor: "#0B0F14", height: 14 }, header: { backgroundColor: "#0B0F14", overflow: "hidden", paddingBottom: 24, paddingHorizontal: 22, paddingTop: 11 }, headerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, backButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", height: 44, justifyContent: "center", width: 44 }, backText: { color: "#FFFFFF", fontSize: 20 }, headerMark: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 }, headerSpacer: { width: 44 }, headerIntro: { alignItems: "center", flexDirection: "row", gap: 16, marginTop: 19 }, coverOrbit: { alignItems: "center", borderColor: "#9A6E1B", borderRadius: 47, borderWidth: 2, height: 96, justifyContent: "center", width: 72 }, coverThumb: { height: 82, transform: [{ rotate: "-4deg" }], width: 55 }, headerCopy: { flex: 1 }, eyebrow: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 }, headerTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 24, fontWeight: "700", lineHeight: 29, marginTop: 5 }, headerBody: { color: "#C9C4B8", fontSize: 10, lineHeight: 15, marginTop: 5 }, list: { backgroundColor: "#FFF6E7", paddingBottom: 30, paddingHorizontal: 22, paddingTop: 22 }, listIntro: { marginBottom: 12 }, listLabel: { color: "#9A6E1B", fontSize: 10, fontWeight: "900", letterSpacing: 1.15 }, listSub: { color: "#5A5F72", fontSize: 12, lineHeight: 17, marginTop: 5 }, partRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, marginBottom: 6, marginTop: 15, padding: 17 }, partNumberBubble: { alignItems: "center", backgroundColor: "rgba(21,26,82,0.15)", height: 31, justifyContent: "center", width: 31 }, partNumber: { color: "#0B0F14", fontSize: 9, fontWeight: "900" }, partCopy: { flex: 1 }, partLabel: { color: "#0B0F14", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 }, partTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 23, fontWeight: "700", lineHeight: 28, marginTop: 3 }, partSummary: { color: "#3A3324", fontSize: 11, lineHeight: 16, marginTop: 7 }, partArrow: { color: "#0B0F14", fontSize: 21, marginTop: 3 }, chapterRow: { alignItems: "flex-start", borderBottomColor: "#E3DCC8", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, paddingVertical: 18 }, chapterNumber: { alignItems: "center", backgroundColor: "#F2EAD3", height: 30, justifyContent: "center", width: 30 }, chapterNumberText: { color: "#0B0F14", fontSize: 9, fontWeight: "900" }, chapterCopy: { flex: 1 }, chapterEyebrow: { color: "#9A6E1B", fontSize: 9, fontWeight: "900", letterSpacing: 0.75 }, chapterTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 20, fontWeight: "700", lineHeight: 25, marginTop: 4 }, chapterSummary: { color: "#5A5F72", fontSize: 11, lineHeight: 16, marginTop: 5 }, arrow: { color: "#0B0F14", fontSize: 19, marginTop: 15 }, footer: { backgroundColor: "#0B0F14", marginTop: 27, padding: 19 }, footerKicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 }, footerText: { color: "#FFFFFF", fontFamily: "serif", fontSize: 20, fontWeight: "700", lineHeight: 26, marginTop: 6 },
});
