import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { PORTRAIT_HERO_IMAGE } from "@/lib/hero-art";
import { haptic } from "@/lib/haptics";
import { publicationPrinciples } from "@/lib/publication-data";
import { WEBSITE_STATUS, WEBSITE_VALUE_POINTS } from "@/lib/website-content";

export default function WebsiteScreen() {
  const readEdition = () => { haptic.light(); router.push("/reader?chapterId=preface" as never); };
  const exploreIdeas = () => { haptic.light(); router.push("/principles" as never); };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#050608" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image accessibilityIgnoresInvertColors source={{ uri: PORTRAIT_HERO_IMAGE }} style={styles.heroArt} resizeMode="cover" />
          <View pointerEvents="none" style={styles.heroVeil} />
          <View pointerEvents="none" style={styles.heroFade} />
          <View style={styles.pageWidth}>
            <View style={styles.topbar}><TouchableOpacity accessibilityRole="button" accessibilityLabel="OBI-ISM public website" onPress={() => router.replace("/website" as never)}><Text style={styles.brand}>OBI–<Text style={styles.gold}>ISM</Text></Text><Text style={styles.brandSub}>IDEAS · INTEGRITY · IMPACT</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the OBI-ISM reader" onPress={readEdition} style={styles.readOnlineButton}><Text style={styles.readOnlineText}>READ ONLINE</Text><Text style={styles.readOnlineArrow}>→</Text></TouchableOpacity></View>
            <View style={styles.heroCopy}><Text style={styles.heroKicker}>{WEBSITE_STATUS}</Text><Text style={styles.heroTitle}>Building a just society through <Text style={styles.gold}>character.</Text></Text><Text style={styles.heroDeck}>A digital publication for the people, institutions, and future we choose to build together.</Text><View style={styles.heroActions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Read the complete OBI-ISM edition" onPress={readEdition} style={styles.primaryButton}><Text style={styles.primaryButtonText}>READ THE OPENING</Text><Text style={styles.primaryArrow}>→</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore OBI-ISM principles" onPress={exploreIdeas} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>EXPLORE THE IDEAS</Text></TouchableOpacity></View></View>
            <View style={styles.heroFoot}><Text style={styles.heroFootText}>A COMPLETE, INTERACTIVE DIGITAL EDITION</Text><Text style={styles.heroFootStatus}>BROWSER EDITION · AVAILABLE NOW</Text></View>
          </View>
        </View>

        <View style={styles.creamSection}>
          <View style={styles.pageWidth}>
            <View style={styles.intro}><Text style={styles.sectionKicker}>THE PUBLICATION</Text><Text style={styles.introTitle}>A book for readers who believe national renewal begins with the character we practice every day.</Text><Text style={styles.introBody}>OBI-ISM is designed as a focused digital edition—not a campaign platform and not a generic ebook shelf. Read in sequence, return to a chapter, follow an idea, or keep a private passage close.</Text></View>
            <View style={styles.valueGrid}>{WEBSITE_VALUE_POINTS.map((item) => <View key={item.number} style={styles.valueCard}><Text style={styles.valueNumber}>{item.number}</Text><Text style={styles.valueTitle}>{item.title}</Text><Text style={styles.valueBody}>{item.body}</Text></View>)}</View>
          </View>
        </View>

        <View style={styles.darkSection}>
          <View style={styles.pageWidth}>
            <Text style={styles.sectionKickerGold}>THE IDEAS</Text><Text style={styles.darkTitle}>Begin wherever the thought meets you.</Text><Text style={styles.darkDeck}>The reader organizes the full manuscript into a living path of chapters, principles, and source-backed passages.</Text>
            <View style={styles.principleList}>{publicationPrinciples.slice(0, 3).map((principle, index) => <TouchableOpacity key={principle.id} accessibilityRole="button" accessibilityLabel={`Read ${principle.title}`} onPress={() => router.push(`/reader?chapterId=${principle.chapterId}` as never)} style={styles.principleRow}><Text style={styles.principleNumber}>{String(index + 1).padStart(2, "0")}</Text><View style={styles.principleCopy}><Text style={styles.principleTitle}>{principle.title}</Text><Text numberOfLines={2} style={styles.principleBody}>{principle.explanation}</Text></View><Text style={styles.principleArrow}>↗</Text></TouchableOpacity>)}</View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore all OBI-ISM principles" onPress={exploreIdeas} style={styles.textAction}><Text style={styles.textActionText}>EXPLORE ALL PRINCIPLES</Text><Text style={styles.textActionArrow}>→</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.protectionSection}>
          <View style={styles.pageWidth}><Text style={styles.sectionKicker}>THE EDITION</Text><Text style={styles.protectionTitle}>Designed for a focused, private reading experience.</Text><View style={styles.protectionGrid}><ProtectionItem number="01" title="Read-only by design" body="The interactive edition keeps the reading experience focused on the approved work." /><ProtectionItem number="02" title="Personal reading journey" body="Your reading position, saved markers, and private passages remain part of your edition." /><ProtectionItem number="03" title="Native safeguards" body="Supported native reader screens enable best-effort screen-capture deterrence; no platform can guarantee absolute prevention." /></View><View style={styles.publicCta}><View><Text style={styles.publicCtaKicker}>START READING</Text><Text style={styles.publicCtaTitle}>The opening is ready whenever you are.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Read OBI-ISM online" onPress={readEdition} style={styles.publicCtaButton}><Text style={styles.publicCtaButtonText}>READ ONLINE</Text><Text style={styles.publicCtaButtonArrow}>→</Text></TouchableOpacity></View></View>
        </View>

        <View style={styles.footer}><View style={styles.pageWidth}><Text style={styles.footerBrand}>OBI–<Text style={styles.gold}>ISM</Text></Text><Text style={styles.footerTag}>IDEAS · INTEGRITY · IMPACT</Text><View style={styles.footerRule} /><Text style={styles.footerText}>Browser edition available now. Native iOS and Android editions are in preparation.</Text></View></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProtectionItem({ number, title, body }: { number: string; title: string; body: string }) {
  return <View style={styles.protectionItem}><Text style={styles.protectionNumber}>{number}</Text><Text style={styles.protectionItemTitle}>{title}</Text><Text style={styles.protectionBody}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F1E4", flex: 1 },
  scroll: { flexGrow: 1 },
  pageWidth: { alignSelf: "center", maxWidth: 1180, width: "100%" },
  hero: { backgroundColor: "#040609", minHeight: 760, overflow: "hidden", paddingHorizontal: 25, position: "relative" },
  heroArt: { bottom: 0, height: "100%", opacity: 0.96, position: "absolute", right: 0, width: "100%" },
  heroVeil: { backgroundColor: "rgba(3, 8, 15, 0.48)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  heroFade: { backgroundColor: "rgba(0,0,0,0.86)", bottom: 0, height: "33%", left: 0, position: "absolute", right: 0 },
  topbar: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", paddingTop: 20 },
  brand: { color: "#FFFFFF", fontFamily: "serif", fontSize: 40, fontWeight: "700", letterSpacing: -1.1, lineHeight: 38 },
  gold: { color: "#E9C46A" },
  brandSub: { color: "#F4F2EB", fontSize: 8, fontWeight: "900", letterSpacing: 2.7, marginTop: 8 },
  readOnlineButton: { alignItems: "center", borderColor: "rgba(233,196,106,0.85)", borderWidth: 1, flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  readOnlineText: { color: "#E9C46A", fontSize: 8, fontWeight: "900", letterSpacing: 0.85 },
  readOnlineArrow: { color: "#E9C46A", fontSize: 17 },
  heroCopy: { marginTop: 110, maxWidth: 535 },
  heroKicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  heroTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 53, fontWeight: "700", letterSpacing: -1.8, lineHeight: 57, marginTop: 13, maxWidth: 500 },
  heroDeck: { color: "#F0EFEB", fontSize: 17, lineHeight: 26, marginTop: 18, maxWidth: 400 },
  heroActions: { gap: 12, marginTop: 29, maxWidth: 390 },
  primaryButton: { alignItems: "center", backgroundColor: "#E9C46A", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 21, paddingVertical: 17 },
  primaryButtonText: { color: "#17150F", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  primaryArrow: { color: "#17150F", fontSize: 23 },
  secondaryButton: { alignItems: "center", borderColor: "rgba(255,255,255,0.75)", borderWidth: 1, paddingVertical: 16 },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  heroFoot: { alignItems: "flex-start", borderTopColor: "rgba(255,255,255,0.24)", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 76, paddingBottom: 26, paddingTop: 15 },
  heroFootText: { color: "#F5F2E8", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  heroFootStatus: { color: "#E9C46A", fontSize: 8, fontWeight: "900", letterSpacing: 0.8, textAlign: "right" },
  creamSection: { backgroundColor: "#F7F1E4", paddingHorizontal: 25, paddingVertical: 64 },
  intro: { maxWidth: 810 },
  sectionKicker: { color: "#AD7F1F", fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  introTitle: { color: "#171715", fontFamily: "serif", fontSize: 36, fontWeight: "700", lineHeight: 43, marginTop: 12 },
  introBody: { color: "#5E5C55", fontSize: 15, lineHeight: 23, marginTop: 17, maxWidth: 690 },
  valueGrid: { gap: 12, marginTop: 33 },
  valueCard: { backgroundColor: "#FFFFFF", borderColor: "#E2DBCB", borderWidth: 1, padding: 18 },
  valueNumber: { color: "#E0B348", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  valueTitle: { color: "#171715", fontFamily: "serif", fontSize: 22, fontWeight: "700", marginTop: 11 },
  valueBody: { color: "#615E56", fontSize: 12, lineHeight: 18, marginTop: 7 },
  darkSection: { backgroundColor: "#080A0D", paddingHorizontal: 25, paddingVertical: 64 },
  sectionKickerGold: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  darkTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 38, fontWeight: "700", lineHeight: 44, marginTop: 12, maxWidth: 570 },
  darkDeck: { color: "#D0CEC7", fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 630 },
  principleList: { borderTopColor: "rgba(255,255,255,0.2)", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 27 },
  principleRow: { alignItems: "flex-start", borderBottomColor: "rgba(255,255,255,0.18)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 13, paddingVertical: 18 },
  principleNumber: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 0.8, width: 27 },
  principleCopy: { flex: 1 },
  principleTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 22, fontWeight: "700", lineHeight: 27 },
  principleBody: { color: "#BEBBB3", fontSize: 12, lineHeight: 18, marginTop: 5 },
  principleArrow: { color: "#E9C46A", fontSize: 19 },
  textAction: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 25, paddingVertical: 5 },
  textActionText: { color: "#E9C46A", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  textActionArrow: { color: "#E9C46A", fontSize: 19 },
  protectionSection: { backgroundColor: "#F7F1E4", paddingHorizontal: 25, paddingVertical: 64 },
  protectionTitle: { color: "#171715", fontFamily: "serif", fontSize: 36, fontWeight: "700", lineHeight: 42, marginTop: 12, maxWidth: 650 },
  protectionGrid: { gap: 12, marginTop: 30 },
  protectionItem: { borderTopColor: "#D7CDB7", borderTopWidth: 2, paddingTop: 13 },
  protectionNumber: { color: "#AD7F1F", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  protectionItemTitle: { color: "#171715", fontFamily: "serif", fontSize: 21, fontWeight: "700", marginTop: 8 },
  protectionBody: { color: "#615E56", fontSize: 12, lineHeight: 18, marginTop: 6 },
  publicCta: { backgroundColor: "#E9C46A", gap: 18, marginTop: 40, padding: 22 },
  publicCtaKicker: { color: "#3A2E12", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  publicCtaTitle: { color: "#17150F", fontFamily: "serif", fontSize: 27, fontWeight: "700", lineHeight: 33, marginTop: 8 },
  publicCtaButton: { alignItems: "center", backgroundColor: "#171715", flexDirection: "row", gap: 8, justifyContent: "center", paddingHorizontal: 15, paddingVertical: 13 },
  publicCtaButtonText: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  publicCtaButtonArrow: { color: "#E9C46A", fontSize: 18 },
  footer: { backgroundColor: "#050608", paddingHorizontal: 25, paddingVertical: 42 },
  footerBrand: { color: "#FFFFFF", fontFamily: "serif", fontSize: 35, fontWeight: "700", letterSpacing: -0.9 },
  footerTag: { color: "#F1F0EB", fontSize: 8, fontWeight: "900", letterSpacing: 2.3, marginTop: 7 },
  footerRule: { backgroundColor: "#E9C46A", height: 2, marginTop: 27, width: 36 },
  footerText: { color: "#BDBBB5", fontSize: 11, lineHeight: 17, marginTop: 13, maxWidth: 430 },
});
