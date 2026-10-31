import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { chapters, type BookChapter } from "@/lib/book-data";
import { haptic } from "@/lib/haptics";
import { searchPublication } from "@/lib/publication-data";
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
  const publicationResults = useMemo(() => searchPublication(query), [query]);

  const openSection = useCallback((section: BookChapter) => { haptic.light(); router.push(`/reader?chapterId=${section.id}` as never); }, []);

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background" statusBarColor="#0B0F14">
      <StatusBar style="light" backgroundColor="#0B0F14" />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={10}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        windowSize={7}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <View style={styles.heroBlob} />
              <Text style={styles.kicker}>EXPLORE THE PHILOSOPHY</Text>
              <Text style={styles.title}>Find the thought{`\n`}that meets you now.</Text>
              <Text style={styles.subtitle}>Search the complete edition, revisit saved markers, or choose a path through the principles.</Text>
              <View style={styles.searchShell}><Text style={styles.searchIcon}>⌕</Text><TextInput accessibilityLabel="Search the OBI-ISM edition" value={query} onChangeText={setQuery} placeholder="Search chapters, themes, ideas" placeholderTextColor="#6B6E7E" style={styles.searchInput} returnKeyType="search" /></View>
            </View>
            <View style={styles.filterStrip}>
              {FILTERS.map((item) => <TouchableOpacity key={item} accessibilityRole="button" onPress={() => { haptic.selection(); setFilter(item); }} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></TouchableOpacity>)}
            </View>
            <View style={styles.featureCard}>
              <Text style={styles.featureKicker}>THE FOUR-PART JOURNEY</Text>
              <Text style={styles.featureTitle}>From character formation to public renewal.</Text>
              <View style={styles.featureSteps}><Text style={styles.featureStep}>01 MAKE</Text><Text style={styles.featureStep}>02 GROUND</Text><Text style={styles.featureStep}>03 LEAD</Text><Text style={styles.featureStep}>04 BUILD</Text></View>
            </View>
            <View style={styles.libraryLinks}><TouchableOpacity accessibilityRole="button" onPress={() => router.push("/principles" as never)} style={styles.libraryLink}><Text style={styles.libraryLinkKicker}>IDEAS</Text><Text style={styles.libraryLinkTitle}>Principles →</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => router.push("/quotes" as never)} style={styles.libraryLink}><Text style={styles.libraryLinkKicker}>PASSAGES</Text><Text style={styles.libraryLinkTitle}>Quotes →</Text></TouchableOpacity></View>
            {query && publicationResults.length > 0 ? <View style={styles.publicationSearch}><Text style={styles.publicationSearchKicker}>IDEAS & PASSAGES</Text>{publicationResults.map((result) => <TouchableOpacity key={`${result.kind}-${result.id}`} accessibilityRole="button" onPress={() => router.push(`/reader?chapterId=${result.chapterId}` as never)} style={styles.publicationSearchRow}><Text style={styles.publicationSearchType}>{result.kind.toUpperCase()}</Text><View style={styles.publicationSearchCopy}><Text numberOfLines={1} style={styles.publicationSearchTitle}>{result.title}</Text><Text numberOfLines={2} style={styles.publicationSearchSub}>{result.subtitle}</Text></View><Text style={styles.publicationSearchArrow}>→</Text></TouchableOpacity>)}</View> : null}
            <View style={styles.resultsHeader}><Text style={styles.resultsTitle}>{filter === "SAVED" ? "Your saved markers" : query ? "Search results" : "Start anywhere"}</Text><Text style={styles.resultsCount}>{results.length} FOUND</Text></View>
          </>
        }
        renderItem={({ item, index }) => <ResultRow item={item} index={index} onPress={openSection} />}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyTitle}>No path found yet.</Text><Text style={styles.emptyBody}>Try a broader search, or open another reading path.</Text><TouchableOpacity onPress={() => { setQuery(""); setFilter("ALL"); }} style={styles.resetButton}><Text style={styles.resetButtonText}>RESET EXPLORE</Text></TouchableOpacity></View>}
        ListFooterComponent={<View style={styles.footerCard}><Text style={styles.footerCardKicker}>PROTECTED BY DESIGN</Text><Text style={styles.footerCardText}>Your search, saved markers, and reading route are private to this edition.</Text></View>}
      />
    </ScreenContainer>
  );
}

const ResultRow = memo(function ResultRow({ item, index, onPress }: { item: BookChapter; index: number; onPress: (section: BookChapter) => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => onPress(item)} style={styles.resultRow}>
      <View style={styles.resultNumber}><Text style={styles.resultNumberText}>{String(index + 1).padStart(2, "0")}</Text></View>
      <View style={styles.resultCopy}>
        <Text style={styles.resultLabel}>{item.label}</Text>
        <Text style={styles.resultTitle}>{item.title}</Text>
        <Text numberOfLines={2} style={styles.resultSummary}>{item.summary}</Text>
      </View>
      <Text style={styles.resultArrow}>→</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  list: { backgroundColor: "#FFF6E7", paddingBottom: 32 },
  hero: { backgroundColor: "#0B0F14", overflow: "hidden", paddingBottom: 25, paddingHorizontal: 22, paddingTop: 40 },
  heroBlob: { backgroundColor: "#E9C46A", borderRadius: 112, height: 190, opacity: 0.9, position: "absolute", right: -104, top: -38, width: 190 },
  kicker: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#FFF6E7", fontFamily: "serif", fontSize: 37, fontWeight: "700", letterSpacing: -0.8, lineHeight: 41, marginTop: 8 },
  subtitle: { color: "#C9C4B8", fontSize: 13, lineHeight: 19, marginTop: 11, maxWidth: "82%" },
  searchShell: { alignItems: "center", backgroundColor: "#FFF6E7", flexDirection: "row", marginTop: 22, paddingHorizontal: 14 },
  searchIcon: { color: "#0B0F14", fontSize: 23, marginRight: 6 },
  searchInput: { color: "#0B0F14", flex: 1, fontSize: 13, minHeight: 47 },
  filterStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 22, paddingTop: 18 },
  filter: { alignItems: "center", borderColor: "#DED5BE", borderRadius: 18, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 13, paddingVertical: 10 },
  filterActive: { backgroundColor: "#0B0F14", borderColor: "#0B0F14" },
  filterText: { color: "#5A5F72", fontSize: 10, fontWeight: "900", letterSpacing: 0.55 },
  filterTextActive: { color: "#E9C46A" },
  featureCard: { backgroundColor: "#0B0F14", marginHorizontal: 22, marginTop: 20, overflow: "hidden", padding: 18 },
  featureKicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  featureTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 22, fontWeight: "700", lineHeight: 28, marginTop: 6 },
  featureSteps: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 15 },
  featureStep: { backgroundColor: "rgba(255,255,255,0.12)", color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 0.6, paddingHorizontal: 8, paddingVertical: 7 },
  libraryLinks: { flexDirection: "row", gap: 10, marginHorizontal: 22, marginTop: 18 },
  libraryLink: { backgroundColor: "#FFFFFF", borderColor: "#E3DCC8", borderWidth: 1, flex: 1, padding: 13 },
  libraryLinkKicker: { color: "#9A6E1B", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  libraryLinkTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 18, fontWeight: "700", marginTop: 4 },
  publicationSearch: { backgroundColor: "#FFFFFF", borderColor: "#E3DCC8", borderWidth: 1, marginHorizontal: 22, marginTop: 18, paddingTop: 14 },
  publicationSearchKicker: { color: "#9A6E1B", fontSize: 9, fontWeight: "900", letterSpacing: 0.9, paddingHorizontal: 14 },
  publicationSearchRow: { alignItems: "center", borderTopColor: "#E8DFC9", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  publicationSearchType: { color: "#0B0F14", fontSize: 9, fontWeight: "900", letterSpacing: 0.55, width: 51 },
  publicationSearchCopy: { flex: 1 },
  publicationSearchTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 16, fontWeight: "700" },
  publicationSearchSub: { color: "#5A5F72", fontSize: 10, lineHeight: 14, marginTop: 3 },
  publicationSearchArrow: { color: "#9A6E1B", fontSize: 17 },
  resultsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 28 },
  resultsTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 25, fontWeight: "700" },
  resultsCount: { color: "#9A6E1B", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  resultRow: { alignItems: "flex-start", borderBottomColor: "#E3DCC8", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, marginHorizontal: 22, paddingVertical: 19 },
  resultNumber: { alignItems: "center", backgroundColor: "#F2EAD3", height: 29, justifyContent: "center", width: 29 },
  resultNumberText: { color: "#0B0F14", fontSize: 9, fontWeight: "900" },
  resultCopy: { flex: 1 },
  resultLabel: { color: "#9A6E1B", fontSize: 9, fontWeight: "900", letterSpacing: 0.85 },
  resultTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 19, fontWeight: "700", lineHeight: 24, marginTop: 3 },
  resultSummary: { color: "#5A5F72", fontSize: 11, lineHeight: 16, marginTop: 5 },
  resultArrow: { color: "#0B0F14", fontSize: 19, marginTop: 14 },
  empty: { alignItems: "center", marginHorizontal: 22, paddingVertical: 48 },
  emptyIcon: { color: "#9A6E1B", fontSize: 34 },
  emptyTitle: { color: "#0B0F14", fontFamily: "serif", fontSize: 25, fontWeight: "700", marginTop: 9 },
  emptyBody: { color: "#5A5F72", fontSize: 12, marginTop: 6, textAlign: "center" },
  resetButton: { alignItems: "center", backgroundColor: "#0B0F14", justifyContent: "center", marginTop: 17, minHeight: 44, paddingHorizontal: 16, paddingVertical: 12 },
  resetButtonText: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  footerCard: { backgroundColor: "#E9C46A", marginHorizontal: 22, marginTop: 27, padding: 17 },
  footerCardKicker: { color: "#0B0F14", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  footerCardText: { color: "#0B0F14", fontFamily: "serif", fontSize: 17, fontWeight: "700", lineHeight: 23, marginTop: 6 },
});
