import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { publicationQuotes, type PublicationQuote } from "@/lib/publication-data";
import { getSavedQuotes, toggleSavedQuote } from "@/lib/reader-storage";

export default function QuotesScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const savedOnly = filter === "saved";

  useFocusEffect(useCallback(() => { void getSavedQuotes().then(setSavedIds); }, []));
  const quotes = useMemo(() => savedOnly ? publicationQuotes.filter((quote) => savedIds.includes(quote.id)) : publicationQuotes, [savedIds, savedOnly]);

  const toggleSave = async (quote: PublicationQuote) => {
    const next = await toggleSavedQuote(quote.id);
    setSavedIds(next);
    next.includes(quote.id) ? haptic.success() : haptic.selection();
  };
  const openQuote = (quote: PublicationQuote) => { haptic.light(); router.push(`/reader?chapterId=${quote.chapterId}` as never); };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#07090C" />
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.hero}><View style={styles.heroTop}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={savedOnly ? "Show all approved passages" : "Show saved quotes"} onPress={() => router.replace(savedOnly ? "/quotes" as never : "/quotes?filter=saved" as never)} style={styles.savedFilter}><Text style={styles.savedFilterText}>{savedOnly ? "ALL PASSAGES" : "SAVED"}</Text></TouchableOpacity></View><Text style={styles.kicker}>{savedOnly ? "YOUR SAVED PASSAGES" : "WORDS TO RETURN TO"}</Text><Text style={styles.title}>{savedOnly ? "Your private shelf." : "The text, held close."}</Text><Text style={styles.deck}>Every passage below comes directly from the approved manuscript. Save a passage privately or open its chapter to continue reading.</Text></View>}
        renderItem={({ item }) => <View style={styles.quoteCard}><Text style={styles.quoteMark}>“</Text><Text style={styles.quoteText}>{item.text}</Text><View style={styles.quoteFoot}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${item.chapterTitle}`} onPress={() => openQuote(item)}><Text style={styles.chapterLink}>{item.chapterTitle} →</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={savedIds.includes(item.id) ? "Remove saved quote" : "Save quote"} onPress={() => void toggleSave(item)} style={[styles.saveButton, savedIds.includes(item.id) && styles.saveButtonActive]}><Text style={[styles.saveText, savedIds.includes(item.id) && styles.saveTextActive]}>{savedIds.includes(item.id) ? "SAVED" : "SAVE"}</Text></TouchableOpacity></View></View>}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No saved passages yet.</Text><Text style={styles.emptyBody}>Save a passage from the full collection and it will appear on this private shelf.</Text><TouchableOpacity accessibilityRole="button" onPress={() => router.replace("/quotes" as never)} style={styles.emptyButton}><Text style={styles.emptyButtonText}>VIEW ALL PASSAGES</Text></TouchableOpacity></View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F8F3E8", flex: 1 },
  list: { paddingBottom: 30 },
  hero: { backgroundColor: "#07090C", paddingBottom: 30, paddingHorizontal: 23, paddingTop: 12 },
  heroTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backButton: { alignItems: "center", borderColor: "rgba(233,196,106,0.7)", borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  backText: { color: "#E9C46A", fontSize: 20 },
  savedFilter: { borderColor: "rgba(255,255,255,0.35)", borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  savedFilterText: { color: "#E9C46A", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  kicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginTop: 27 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 37, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: 7 },
  deck: { color: "#D4D2CB", fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: 360 },
  quoteCard: { backgroundColor: "#FFFFFF", borderColor: "#E2DCCF", borderWidth: 1, marginHorizontal: 18, marginTop: 16, padding: 19 },
  quoteMark: { color: "#E9C46A", fontFamily: "serif", fontSize: 53, height: 35, lineHeight: 53 },
  quoteText: { color: "#262623", fontFamily: "serif", fontSize: 18, lineHeight: 27, marginTop: 13 },
  quoteFoot: { alignItems: "center", borderTopColor: "#EEE9DE", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 18, paddingTop: 13 },
  chapterLink: { color: "#6E685B", fontSize: 9, fontWeight: "900", letterSpacing: 0.45, maxWidth: 220 },
  saveButton: { borderColor: "#C9C2B3", borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  saveButtonActive: { backgroundColor: "#171715", borderColor: "#171715" },
  saveText: { color: "#6E685B", fontSize: 8, fontWeight: "900", letterSpacing: 0.75 },
  saveTextActive: { color: "#E9C46A" },
  empty: { alignItems: "center", paddingHorizontal: 36, paddingVertical: 60 },
  emptyTitle: { color: "#171715", fontFamily: "serif", fontSize: 29, fontWeight: "700" },
  emptyBody: { color: "#69665D", fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: "center" },
  emptyButton: { backgroundColor: "#171715", marginTop: 20, paddingHorizontal: 14, paddingVertical: 12 },
  emptyButtonText: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
});
