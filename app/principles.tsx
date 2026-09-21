import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { publicationPrinciples, type PublicationPrinciple } from "@/lib/publication-data";

export default function PrinciplesScreen() {
  const openPrinciple = (principle: PublicationPrinciple) => {
    haptic.light();
    router.push(`/reader?chapterId=${principle.chapterId}` as never);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#07090C" />
      <FlatList
        data={publicationPrinciples}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.hero}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.kicker}>THE OBI-ISM PRINCIPLES</Text><Text style={styles.title}>Ideas built for a life that holds.</Text><Text style={styles.deck}>Each card begins in an approved chapter. Open any principle to return to its full source in the protected reader.</Text></View>}
        renderItem={({ item, index }) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Read ${item.title}`} onPress={() => openPrinciple(item)} style={styles.card}><View style={styles.cardTop}><Text style={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</Text><Text style={styles.cardAction}>READ SOURCE →</Text></View><Text style={styles.cardTitle}>{item.title}</Text><Text numberOfLines={3} style={styles.cardBody}>{item.explanation}</Text><View style={styles.excerpt}><Text numberOfLines={3} style={styles.excerptText}>{item.excerpt}</Text><Text style={styles.excerptSource}>FROM THE APPROVED EDITION</Text></View></TouchableOpacity>}
        ListFooterComponent={<View style={styles.footer}><Text style={styles.footerKicker}>THE SOURCE MATTERS</Text><Text style={styles.footerText}>These ideas are not generated summaries. Each one opens back into the manuscript that carries it.</Text></View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F8F3E8", flex: 1 },
  list: { paddingBottom: 34 },
  hero: { backgroundColor: "#07090C", paddingBottom: 31, paddingHorizontal: 23, paddingTop: 12 },
  backButton: { alignItems: "center", borderColor: "rgba(233,196,106,0.7)", borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  backText: { color: "#E9C46A", fontSize: 20 },
  kicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginTop: 27 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 37, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: 7, maxWidth: 360 },
  deck: { color: "#D4D2CB", fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: 360 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E2DCCF", borderWidth: 1, marginHorizontal: 18, marginTop: 16, padding: 18 },
  cardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardNumber: { color: "#B08A31", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  cardAction: { color: "#5B5B56", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  cardTitle: { color: "#171715", fontFamily: "serif", fontSize: 25, fontWeight: "700", lineHeight: 30, marginTop: 11 },
  cardBody: { color: "#57564F", fontSize: 12, lineHeight: 18, marginTop: 8 },
  excerpt: { borderLeftColor: "#E9C46A", borderLeftWidth: 3, marginTop: 16, paddingLeft: 12 },
  excerptText: { color: "#30302D", fontFamily: "serif", fontSize: 14, lineHeight: 20 },
  excerptSource: { color: "#8B887F", fontSize: 7, fontWeight: "900", letterSpacing: 0.75, marginTop: 9 },
  footer: { backgroundColor: "#E9C46A", marginHorizontal: 18, marginTop: 23, padding: 18 },
  footerKicker: { color: "#171715", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  footerText: { color: "#171715", fontFamily: "serif", fontSize: 20, fontWeight: "700", lineHeight: 26, marginTop: 7 },
});
