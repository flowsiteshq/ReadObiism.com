import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { chapters, type BookChapter } from "@/lib/book-data";
import { haptic } from "@/lib/haptics";
import { getBookmarks } from "@/lib/reader-storage";

const FILTERS = ["ALL", "FOUNDATIONS", "POWER", "FUTURE", "SAVED"] as const;
type Filter = (typeof FILTERS)[number];

const partForFilter: Record<Exclude<Filter, "ALL" | "SAVED">, string> = {
  FOUNDATIONS: "PART II",
  POWER: "PART III",
  FUTURE: "PART IV",
};

export default function ExploreScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  useFocusEffect(useCallback(() => { void getBookmarks().then(setBookmarks); }, []));

  const results = useMemo(() => chapters.filter((chapter) => {
    const text = `${chapter.label} ${chapter.title} ${chapter.summary} ${chapter.part ?? ""}`.toLowerCase();
    const matchesQuery = text.includes(query.trim().toLowerCase());
    const matchesFilter = filter === "ALL" || (filter === "SAVED" ? bookmarks.includes(chapter.id) : chapter.part === partForFilter[filter]);
    return matchesQuery && matchesFilter && chapter.kind !== "part";
  }), [bookmarks, filter, query]);

  const openSection = (section: BookChapter) => { haptic.light(); router.push(`/reader?chapterId=${section.id}` as never); };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <StatusBar style="light" backgroundColor="#FF5B55" />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <View style={styles.heroBlob} />
              <Text style={styles.kicker}>EXPLORE THE PHILOSOPHY</Text>
              <Text style={styles.title}>Find the thought{`\n`}that meets you now.</Text>
              <Text style={styles.subtitle}>Search the complete edition, revisit saved markers, or choose a path through the principles.</Text>
              <View style={styles.searchShell}><Text style={styles.searchIcon}>⌕</Text><TextInput accessibilityLabel="Search the OBI-ISM edition" value={query} onChangeText={setQuery} placeholder="Search chapters, themes, ideas" placeholderTextColor="#81778A" style={styles.searchInput} returnKeyType="search" /></View>
            </View>
            <View style={styles.filterStrip}>
              {FILTERS.map((item) => <TouchableOpacity key={item} accessibilityRole="button" onPress={() => { haptic.selection(); setFilter(item); }} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></TouchableOpacity>)}
            </View>
            <View style={styles.featureCard}>
              <Text style={styles.featureKicker}>THE FOUR-PART JOURNEY</Text>
              <Text style={styles.featureTitle}>From character formation to public renewal.</Text>
              <View style={styles.featureSteps}><Text style={styles.featureStep}>01 MAKE</Text><Text style={styles.featureStep}>02 GROUND</Text><Text style={styles.featureStep}>03 LEAD</Text><Text style={styles.featureStep}>04 BUILD</Text></View>
            </View>
            <View style={styles.resultsHeader}><Text style={styles.resultsTitle}>{filter === "SAVED" ? "Your saved markers" : query ? "Search results" : "Start anywhere"}</Text><Text style={styles.resultsCount}>{results.length} FOUND</Text></View>
          </>
        }
        renderItem={({ item, index }) => <TouchableOpacity accessibilityRole="button" onPress={() => openSection(item)} style={styles.resultRow}><View style={styles.resultNumber}><Text style={styles.resultNumberText}>{String(index + 1).padStart(2, "0")}</Text></View><View style={styles.resultCopy}><Text style={styles.resultLabel}>{item.label}</Text><Text style={styles.resultTitle}>{item.title}</Text><Text numberOfLines={2} style={styles.resultSummary}>{item.summary}</Text></View><Text style={styles.resultArrow}>→</Text></TouchableOpacity>}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyTitle}>No path found yet.</Text><Text style={styles.emptyBody}>Try a broader search, or open another reading path.</Text><TouchableOpacity onPress={() => { setQuery(""); setFilter("ALL"); }} style={styles.resetButton}><Text style={styles.resetButtonText}>RESET EXPLORE</Text></TouchableOpacity></View>}
        ListFooterComponent={<View style={styles.footerCard}><Text style={styles.footerCardKicker}>PROTECTED BY DESIGN</Text><Text style={styles.footerCardText}>Your search, saved markers, and reading route are private to this edition.</Text></View>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: "#FFF6E7", paddingBottom: 32 },
  hero: { backgroundColor: "#FF5B55", overflow: "hidden", paddingBottom: 25, paddingHorizontal: 22, paddingTop: 40 },
  heroBlob: { backgroundColor: "#DFFF4F", borderRadius: 112, height: 190, opacity: 0.9, position: "absolute", right: -104, top: -38, width: 190 },
  kicker: { color: "#151A52", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#151A52", fontFamily: "serif", fontSize: 37, fontWeight: "700", letterSpacing: -0.8, lineHeight: 41, marginTop: 8 },
  subtitle: { color: "#3F2452", fontSize: 13, lineHeight: 19, marginTop: 11, maxWidth: "82%" },
  searchShell: { alignItems: "center", backgroundColor: "#FFF6E7", flexDirection: "row", marginTop: 22, paddingHorizontal: 14 },
  searchIcon: { color: "#151A52", fontSize: 23, marginRight: 6 },
  searchInput: { color: "#151A52", flex: 1, fontSize: 13, minHeight: 47 },
  filterStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 22, paddingTop: 18 },
  filter: { borderColor: "#D7D2E5", borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  filterActive: { backgroundColor: "#151A52", borderColor: "#151A52" },
  filterText: { color: "#616276", fontSize: 9, fontWeight: "900", letterSpacing: 0.55 },
  filterTextActive: { color: "#DFFF4F" },
  featureCard: { backgroundColor: "#151A52", marginHorizontal: 22, marginTop: 20, overflow: "hidden", padding: 18 },
  featureKicker: { color: "#6CD9FF", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  featureTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 22, fontWeight: "700", lineHeight: 28, marginTop: 6 },
  featureSteps: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 15 },
  featureStep: { backgroundColor: "rgba(255,255,255,0.12)", color: "#DFFF4F", fontSize: 8, fontWeight: "900", letterSpacing: 0.6, paddingHorizontal: 8, paddingVertical: 7 },
  resultsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 28 },
  resultsTitle: { color: "#151A52", fontFamily: "serif", fontSize: 25, fontWeight: "700" },
  resultsCount: { color: "#FF5B55", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  resultRow: { alignItems: "flex-start", borderBottomColor: "#DED9E9", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, marginHorizontal: 22, paddingVertical: 19 },
  resultNumber: { alignItems: "center", backgroundColor: "#E5E2F3", height: 29, justifyContent: "center", width: 29 },
  resultNumberText: { color: "#151A52", fontSize: 9, fontWeight: "900" },
  resultCopy: { flex: 1 },
  resultLabel: { color: "#FF5B55", fontSize: 8, fontWeight: "900", letterSpacing: 0.85 },
  resultTitle: { color: "#151A52", fontFamily: "serif", fontSize: 19, fontWeight: "700", lineHeight: 24, marginTop: 3 },
  resultSummary: { color: "#6C6C7D", fontSize: 11, lineHeight: 16, marginTop: 5 },
  resultArrow: { color: "#151A52", fontSize: 19, marginTop: 14 },
  empty: { alignItems: "center", marginHorizontal: 22, paddingVertical: 48 },
  emptyIcon: { color: "#FF5B55", fontSize: 34 },
  emptyTitle: { color: "#151A52", fontFamily: "serif", fontSize: 25, fontWeight: "700", marginTop: 9 },
  emptyBody: { color: "#676979", fontSize: 12, marginTop: 6, textAlign: "center" },
  resetButton: { backgroundColor: "#151A52", marginTop: 17, paddingHorizontal: 14, paddingVertical: 11 },
  resetButtonText: { color: "#DFFF4F", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  footerCard: { backgroundColor: "#6CD9FF", marginHorizontal: 22, marginTop: 27, padding: 17 },
  footerCardKicker: { color: "#151A52", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  footerCardText: { color: "#151A52", fontFamily: "serif", fontSize: 17, fontWeight: "700", lineHeight: 23, marginTop: 6 },
});
