import { useRef } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { BOOK_AUTHOR, BOOK_SUBTITLE } from "@/lib/book-data";

const COVER = require("../../assets/images/obi-ism-cover-000.jpg");

export default function ObiIsmWebsite() {
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const scrollTo = (top: number) => scrollRef.current?.scrollTo({ y: top, animated: true });

  return (
    <View style={styles.site}>
      <StatusBar style="light" backgroundColor="#062B24" />
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View style={styles.container}>
            <View style={styles.nav}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to the top of the OBI-ISM website" onPress={() => scrollTo(0)} style={styles.brandButton}>
                <Text style={styles.brand}>OBI–ISM</Text>
                <Text style={styles.brandDescriptor}>A philosophy of responsible living</Text>
              </TouchableOpacity>
              {isDesktop ? (
                <View style={styles.navLinks}>
                  <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(800)} style={styles.navLink}><Text style={styles.navLinkText}>The book</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(1290)} style={styles.navLink}><Text style={styles.navLinkText}>The philosophy</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(2000)} style={styles.navCta}><Text style={styles.navCtaText}>Get the reader</Text></TouchableOpacity>
                </View>
              ) : (
                <View style={styles.compactNavLinks}>
                  <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(920)} style={styles.compactNavLink}><Text style={styles.compactNavLinkText}>Explore</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(2500)} style={styles.compactNavCta}><Text style={styles.compactNavCtaText}>Get app</Text></TouchableOpacity>
                </View>
              )}
            </View>

            <View style={[styles.heroGrid, isDesktop && styles.heroGridDesktop]}>
              <View style={[styles.heroCopy, isDesktop && styles.heroCopyDesktop]}>
                <Text style={styles.overline}>THE BOOK · FIRST EDITION 2026</Text>
                <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>A just society begins with the character we choose to build.</Text>
                <View style={styles.goldRule} />
                <Text style={styles.heroBody}>{BOOK_SUBTITLE} is an invitation to rethink how we live, lead, and build together.</Text>
                <View style={styles.heroActions}>
                  <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(isDesktop ? 800 : 920)} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Discover the book</Text><Text style={styles.buttonArrow}>→</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/reader?chapterId=preface" as never)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Read the opening</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.heroMicrocopy}>
                  <View style={styles.liveDot} /><Text style={styles.heroMicrocopyText}>A premium, protected reader for iOS and Android.</Text>
                </View>
              </View>

              <View style={[styles.coverStage, isDesktop && styles.coverStageDesktop]}>
                <View style={styles.orbitLarge} />
                <View style={styles.orbitSmall} />
                <View style={styles.coverShadow} />
                <View style={styles.coverFrame}>
                  <Image source={COVER} contentFit="cover" transition={250} style={[styles.cover, isDesktop && styles.coverDesktop]} accessibilityLabel="OBI-ISM: Building a Just Society Through Character book cover" />
                </View>
                <View style={styles.editionTag}><Text style={styles.editionTagText}>DIGITAL{`\n`}EDITION</Text></View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.creamSection}>
          <View style={styles.container}>
            <View style={[styles.bookIntro, isDesktop && styles.bookIntroDesktop]}>
              <View style={styles.sectionIndex}><Text style={styles.sectionIndexNumber}>01</Text><View style={styles.sectionIndexLine} /><Text style={styles.sectionIndexText}>THE BOOK</Text></View>
              <View style={styles.bookStatement}>
                <Text style={styles.statement}>"The way we live matters."</Text>
                <Text style={styles.statementBody}>OBI-ISM translates a lived life into a practical philosophy of prudence, honesty, simplicity, justice, accountability, and service.</Text>
              </View>
            </View>

            <View style={[styles.statGrid, isDesktop && styles.statGridDesktop]}>
              <Stat index="01" value="29" label="chapters tracing a philosophy in action" />
              <Stat index="02" value="4" label="parts from formation to social renewal" />
              <Stat index="03" value="1" label="enduring question: what if we lived this way?" />
            </View>

            <View style={[styles.featureSpread, isDesktop && styles.featureSpreadDesktop]}>
              <View style={styles.featureQuotePanel}>
                <Text style={styles.featureQuoteMark}>“</Text>
                <Text style={styles.featureQuote}>The movement begins with a personal decision: principle over convenience, long-term flourishing over short-term gain.</Text>
                <Text style={styles.featureAttribution}>— FROM THE PREFACE</Text>
              </View>
              <View style={styles.featureDetailPanel}>
                <Text style={styles.overlineDark}>INSIDE THIS EDITION</Text>
                <Text style={styles.featureDetailTitle}>A book designed to be returned to.</Text>
                <Text style={styles.featureDetailBody}>From the formative lessons of the marketplace to the moral architecture of public life, the book connects individual choices with the societies they create.</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/reader?chapterId=introduction" as never)} style={styles.textLink}><Text style={styles.textLinkText}>Read the introduction</Text><Text style={styles.textLinkArrow}>→</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.greenSection}>
          <View style={styles.container}>
            <View style={[styles.sectionHeader, isDesktop && styles.sectionHeaderDesktop]}>
              <View style={styles.sectionIndex}><Text style={styles.sectionIndexNumberLight}>02</Text><View style={styles.sectionIndexLineLight} /><Text style={styles.sectionIndexTextLight}>THE PHILOSOPHY</Text></View>
              <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesktop]}>The principles that hold when everything else moves.</Text>
            </View>
            <View style={[styles.principleGrid, isDesktop && styles.principleGridDesktop]}>
              <Principle number="I" title="Prudence" description="Treating resources as a trust, not a stage for excess." />
              <Principle number="II" title="Honesty" description="Understanding truth as the invisible currency of civilization." />
              <Principle number="III" title="Simplicity" description="Choosing restraint as a form of strength and clarity." />
              <Principle number="IV" title="Justice" description="Building peace through fairness, dignity, and accountability." />
            </View>
          </View>
        </View>

        <View style={styles.creamSection}>
          <View style={styles.container}>
            <View style={[styles.readerSpread, isDesktop && styles.readerSpreadDesktop]}>
              <View style={styles.readerVisual}>
                <View style={styles.readerChrome}><Text style={styles.readerChromeWordmark}>OBI–ISM</Text><Text style={styles.readerChromeLabel}>CHAPTER SEVEN</Text></View>
                <View style={styles.readerPage}>
                  <Text style={styles.readerEyebrow}>PART II · THE FOUNDATIONS</Text>
                  <Text style={styles.readerHeadline}>Prudence: the discipline of sacred stewardship.</Text>
                  <View style={styles.readerRule} />
                  <Text style={styles.readerParagraph}>The question is not whether we have enough. The question is whether we recognize what we hold as a trust.</Text>
                  <View style={styles.readerProgress}><View style={styles.readerProgressFill} /></View>
                </View>
              </View>
              <View style={styles.readerCopy}>
                <Text style={styles.overlineDark}>THE READING EXPERIENCE</Text>
                <Text style={styles.readerCopyTitle}>Built to protect attention—and the work itself.</Text>
                <Text style={styles.readerCopyBody}>The mobile reader is deliberately quiet: a complete, carefully structured edition with progress markers, adjustable reading size, local bookmarks, and a composed editorial interface.</Text>
                <View style={styles.protectionList}>
                  <Protection item="Read-only presentation without public export or sharing controls." />
                  <Protection item="Personal device access and screen-capture deterrence on supported platforms." />
                  <Protection item="A focused, offline-friendly reading flow for iOS and Android." />
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={() => scrollTo(isDesktop ? 2750 : 3430)} style={styles.textLink}><Text style={styles.textLinkText}>How access works</Text><Text style={styles.textLinkArrow}>→</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.accessSection}>
          <View style={styles.container}>
            <View style={styles.accessHeader}>
              <Text style={styles.overline}>THE DIGITAL EDITION</Text>
              <Text style={[styles.accessTitle, isDesktop && styles.accessTitleDesktop]}>Read OBI-ISM in the place made for it.</Text>
              <Text style={styles.accessBody}>The companion website introduces the work. The full edition is read through the protected OBI-ISM mobile experience.</Text>
            </View>
            <View style={[styles.accessGrid, isDesktop && styles.accessGridDesktop]}>
              <View style={styles.storeCard}><Text style={styles.storeEyebrow}>FOR IPHONE & IPAD</Text><Text style={styles.storeName}>iOS reader</Text><Text style={styles.storeBody}>Native access, purchase restoration, and private reading controls.</Text><Text style={styles.storeStatus}>APP STORE LISTING IN PREPARATION</Text></View>
              <View style={styles.storeCard}><Text style={styles.storeEyebrow}>FOR ANDROID</Text><Text style={styles.storeName}>Android reader</Text><Text style={styles.storeBody}>The same considered edition, built for Google Play distribution.</Text><Text style={styles.storeStatus}>GOOGLE PLAY LISTING IN PREPARATION</Text></View>
            </View>
            <View style={styles.accessFootnote}><View style={styles.liveDot} /><Text style={styles.accessFootnoteText}>Store links and the available purchase methods will appear here following approval and launch configuration.</Text></View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.container, styles.footerInner]}>
            <View><Text style={styles.footerBrand}>OBI–ISM</Text><Text style={styles.footerSub}>Building a Just Society Through Character</Text></View>
            <Text style={styles.footerCredit}>© 2026 · {BOOK_AUTHOR}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ index, value, label }: { index: string; value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statIndex}>{index}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Principle({ number, title, description }: { number: string; title: string; description: string }) {
  return <View style={styles.principle}><Text style={styles.principleNumber}>{number}</Text><Text style={styles.principleTitle}>{title}</Text><Text style={styles.principleDescription}>{description}</Text></View>;
}

function Protection({ item }: { item: string }) {
  return <View style={styles.protection}><View style={styles.protectionDot} /><Text style={styles.protectionText}>{item}</Text></View>;
}

const styles = StyleSheet.create({
  site: { backgroundColor: "#F4EFDF", flex: 1 },
  scrollContent: { flexGrow: 1 },
  container: { alignSelf: "center", maxWidth: 1180, paddingHorizontal: 24, width: "100%" },
  hero: { backgroundColor: "#062B24", overflow: "hidden", paddingBottom: 72, paddingTop: 24 },
  nav: { alignItems: "center", borderBottomColor: "rgba(232, 223, 198, 0.18)", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingBottom: 19 },
  brandButton: { paddingVertical: 3 },
  brand: { color: "#FFFDF5", fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  brandDescriptor: { color: "#B6C9BA", fontSize: 9, letterSpacing: 0.45, marginTop: 2 },
  navLinks: { alignItems: "center", flexDirection: "row", gap: 4 },
  compactNavLinks: { alignItems: "center", flexDirection: "row", gap: 6 },
  compactNavLink: { paddingHorizontal: 7, paddingVertical: 10 },
  compactNavLinkText: { color: "#D5E0D6", fontSize: 10, fontWeight: "800" },
  compactNavCta: { borderColor: "#C8A853", borderWidth: 1, paddingHorizontal: 9, paddingVertical: 9 },
  compactNavCtaText: { color: "#E8C76C", fontSize: 9, fontWeight: "900" },
  navLink: { paddingHorizontal: 9, paddingVertical: 11 },
  navLinkText: { color: "#D5E0D6", fontSize: 11, fontWeight: "700" },
  navCta: { borderColor: "#C8A853", borderWidth: 1, marginLeft: 5, paddingHorizontal: 10, paddingVertical: 10 },
  navCtaText: { color: "#E8C76C", fontSize: 10, fontWeight: "900" },
  heroGrid: { alignItems: "center", gap: 43, marginTop: 58 },
  heroGridDesktop: { flexDirection: "row", justifyContent: "space-between", marginTop: 92, minHeight: 470 },
  heroCopy: { width: "100%" },
  heroCopyDesktop: { maxWidth: 640, paddingRight: 20 },
  overline: { color: "#D9B75B", fontSize: 10, fontWeight: "900", letterSpacing: 1.35 },
  heroTitle: { color: "#FFFDF5", fontFamily: "serif", fontSize: 42, fontWeight: "700", letterSpacing: -0.9, lineHeight: 49, marginTop: 13 },
  heroTitleDesktop: { fontSize: 62, lineHeight: 68 },
  goldRule: { backgroundColor: "#C8A853", height: 3, marginBottom: 19, marginTop: 25, width: 55 },
  heroBody: { color: "#C5D3C8", fontSize: 17, lineHeight: 27, maxWidth: 520 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 29 },
  primaryButton: { alignItems: "center", backgroundColor: "#C8A853", flexDirection: "row", gap: 15, paddingHorizontal: 19, paddingVertical: 15 },
  primaryButtonText: { color: "#17352C", fontSize: 13, fontWeight: "900" },
  buttonArrow: { color: "#17352C", fontSize: 19, lineHeight: 19 },
  secondaryButton: { borderColor: "#5A7E6D", borderWidth: 1, paddingHorizontal: 18, paddingVertical: 15 },
  secondaryButtonText: { color: "#F5F2E8", fontSize: 13, fontWeight: "800" },
  heroMicrocopy: { alignItems: "center", flexDirection: "row", marginTop: 27 },
  liveDot: { backgroundColor: "#7CB58F", borderRadius: 4, height: 7, marginRight: 8, width: 7 },
  heroMicrocopyText: { color: "#AFC0B3", fontSize: 11 },
  coverStage: { alignItems: "center", height: 355, justifyContent: "center", position: "relative", width: "100%" },
  coverStageDesktop: { height: 465, width: 360 },
  orbitLarge: { borderColor: "rgba(202, 169, 83, 0.32)", borderRadius: 170, borderWidth: 1, height: 288, position: "absolute", transform: [{ rotate: "-20deg" }], width: 288 },
  orbitSmall: { borderColor: "rgba(229, 239, 229, 0.18)", borderRadius: 120, borderWidth: 1, height: 214, position: "absolute", transform: [{ rotate: "40deg" }], width: 214 },
  coverShadow: { backgroundColor: "#000000", bottom: 30, height: 26, opacity: 0.38, position: "absolute", transform: [{ scaleX: 0.7 }], width: 188 },
  coverFrame: { backgroundColor: "#D4B75F", padding: 4, transform: [{ rotate: "3deg" }], zIndex: 2 },
  cover: { height: 287, width: 191 },
  coverDesktop: { height: 370, width: 247 },
  editionTag: { backgroundColor: "#F4EFDF", bottom: 30, paddingHorizontal: 11, paddingVertical: 9, position: "absolute", right: "8%", transform: [{ rotate: "-5deg" }], zIndex: 3 },
  editionTagText: { color: "#17372E", fontSize: 8, fontWeight: "900", letterSpacing: 0.8, lineHeight: 11 },
  creamSection: { backgroundColor: "#F4EFDF", paddingBottom: 88, paddingTop: 81 },
  bookIntro: { gap: 25 },
  bookIntroDesktop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  sectionIndex: { alignItems: "center", flexDirection: "row" },
  sectionIndexNumber: { color: "#A98637", fontFamily: "serif", fontSize: 18 },
  sectionIndexLine: { backgroundColor: "#BDAA79", height: 1, marginHorizontal: 10, width: 34 },
  sectionIndexText: { color: "#8E805E", fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  bookStatement: { maxWidth: 725 },
  statement: { color: "#17372E", fontFamily: "serif", fontSize: 33, fontWeight: "700", letterSpacing: -0.5, lineHeight: 39 },
  statementBody: { color: "#53665D", fontSize: 17, lineHeight: 27, marginTop: 14, maxWidth: 650 },
  statGrid: { borderTopColor: "#D9CFB7", borderTopWidth: StyleSheet.hairlineWidth, gap: 20, marginTop: 48, paddingTop: 25 },
  statGridDesktop: { flexDirection: "row", gap: 0 },
  stat: { borderBottomColor: "#D9CFB7", borderBottomWidth: StyleSheet.hairlineWidth, flex: 1, minHeight: 130, paddingBottom: 19, paddingTop: 3 },
  statIndex: { color: "#AA8738", fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  statValue: { color: "#17372E", fontFamily: "serif", fontSize: 51, lineHeight: 56, marginTop: 4 },
  statLabel: { color: "#647169", fontSize: 12, lineHeight: 17, maxWidth: 205 },
  featureSpread: { gap: 18, marginTop: 63 },
  featureSpreadDesktop: { flexDirection: "row", gap: 0 },
  featureQuotePanel: { backgroundColor: "#17372E", minHeight: 320, padding: 28 },
  featureDetailPanel: { backgroundColor: "#FFFDF7", borderColor: "#E0D4BA", borderWidth: 1, padding: 28 },
  featureQuoteMark: { color: "#C8A853", fontFamily: "serif", fontSize: 65, height: 49, lineHeight: 70 },
  featureQuote: { color: "#F9F5E9", fontFamily: "serif", fontSize: 24, lineHeight: 33, marginTop: 18 },
  featureAttribution: { color: "#B7CDBA", fontSize: 9, fontWeight: "900", letterSpacing: 0.9, marginTop: 24 },
  overlineDark: { color: "#9B7B31", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  featureDetailTitle: { color: "#17372E", fontFamily: "serif", fontSize: 29, fontWeight: "700", lineHeight: 35, marginTop: 10 },
  featureDetailBody: { color: "#586A61", fontSize: 14, lineHeight: 22, marginTop: 13 },
  textLink: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 10, marginTop: 23, paddingVertical: 7 },
  textLinkText: { color: "#17372E", fontSize: 13, fontWeight: "900" },
  textLinkArrow: { color: "#A88330", fontSize: 20 },
  greenSection: { backgroundColor: "#123B31", paddingBottom: 85, paddingTop: 79 },
  sectionHeader: { gap: 25 },
  sectionHeaderDesktop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  sectionIndexNumberLight: { color: "#DBBA63", fontFamily: "serif", fontSize: 18 },
  sectionIndexLineLight: { backgroundColor: "#6E937D", height: 1, marginHorizontal: 10, width: 34 },
  sectionIndexTextLight: { color: "#BFD2C4", fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  sectionTitle: { color: "#FAF5E8", fontFamily: "serif", fontSize: 33, fontWeight: "700", lineHeight: 39, maxWidth: 650 },
  sectionTitleDesktop: { fontSize: 45, lineHeight: 51 },
  principleGrid: { borderTopColor: "#46715F", borderTopWidth: StyleSheet.hairlineWidth, gap: 24, marginTop: 49, paddingTop: 19 },
  principleGridDesktop: { flexDirection: "row", gap: 0 },
  principle: { flex: 1, minHeight: 165, paddingRight: 19 },
  principleNumber: { color: "#D5B356", fontFamily: "serif", fontSize: 22 },
  principleTitle: { color: "#FCF8ED", fontFamily: "serif", fontSize: 24, fontWeight: "700", marginTop: 18 },
  principleDescription: { color: "#BED0C2", fontSize: 13, lineHeight: 20, marginTop: 8 },
  readerSpread: { gap: 43 },
  readerSpreadDesktop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  readerVisual: { alignSelf: "center", backgroundColor: "#F8F3E7", boxShadow: "0px 20px 45px rgba(21, 46, 38, 0.16)", maxWidth: 430, width: "100%" },
  readerChrome: { alignItems: "center", backgroundColor: "#062B24", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 13 },
  readerChromeWordmark: { color: "#FDF8E8", fontSize: 13, fontWeight: "900", letterSpacing: 0.7 },
  readerChromeLabel: { color: "#D3B55E", fontSize: 8, fontWeight: "900", letterSpacing: 0.65 },
  readerPage: { minHeight: 310, padding: 26 },
  readerEyebrow: { color: "#9D7A2E", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  readerHeadline: { color: "#17372E", fontFamily: "serif", fontSize: 26, fontWeight: "700", lineHeight: 32, marginTop: 11 },
  readerRule: { backgroundColor: "#C8A853", height: 2, marginBottom: 17, marginTop: 18, width: 38 },
  readerParagraph: { color: "#495D53", fontFamily: "serif", fontSize: 15, lineHeight: 23 },
  readerProgress: { backgroundColor: "#DFD5BF", bottom: 25, height: 2, left: 26, position: "absolute", right: 26 },
  readerProgressFill: { backgroundColor: "#C8A853", height: 2, width: "42%" },
  readerCopy: { maxWidth: 480 },
  readerCopyTitle: { color: "#17372E", fontFamily: "serif", fontSize: 34, fontWeight: "700", lineHeight: 40, marginTop: 10 },
  readerCopyBody: { color: "#586960", fontSize: 15, lineHeight: 23, marginTop: 14 },
  protectionList: { marginTop: 20 },
  protection: { alignItems: "flex-start", flexDirection: "row", marginBottom: 10 },
  protectionDot: { backgroundColor: "#B28D38", borderRadius: 3, height: 6, marginRight: 9, marginTop: 7, width: 6 },
  protectionText: { color: "#596A61", flex: 1, fontSize: 12, lineHeight: 19 },
  accessSection: { backgroundColor: "#062B24", paddingBottom: 82, paddingTop: 82 },
  accessHeader: { alignItems: "center", marginHorizontal: "auto", maxWidth: 680, textAlign: "center" },
  accessTitle: { color: "#FFFDF5", fontFamily: "serif", fontSize: 38, fontWeight: "700", lineHeight: 45, marginTop: 11, textAlign: "center" },
  accessTitleDesktop: { fontSize: 52, lineHeight: 59 },
  accessBody: { color: "#C1D1C4", fontSize: 15, lineHeight: 24, marginTop: 14, textAlign: "center" },
  accessGrid: { gap: 14, marginTop: 40 },
  accessGridDesktop: { flexDirection: "row" },
  storeCard: { backgroundColor: "#103B31", borderColor: "#456A5C", borderWidth: 1, flex: 1, minHeight: 178, padding: 23 },
  storeEyebrow: { color: "#D1B35D", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  storeName: { color: "#FEFBF1", fontFamily: "serif", fontSize: 27, fontWeight: "700", marginTop: 9 },
  storeBody: { color: "#BED0C3", fontSize: 13, lineHeight: 19, marginTop: 8 },
  storeStatus: { color: "#8DB29C", fontSize: 8, fontWeight: "900", letterSpacing: 0.7, marginTop: 18 },
  accessFootnote: { alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 23 },
  accessFootnoteText: { color: "#AFC3B4", flexShrink: 1, fontSize: 10, lineHeight: 15, textAlign: "center" },
  footer: { backgroundColor: "#051F1A", paddingBottom: 32, paddingTop: 32 },
  footerInner: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  footerBrand: { color: "#FDF9EC", fontSize: 16, fontWeight: "900", letterSpacing: 0.8 },
  footerSub: { color: "#90AA9A", fontSize: 9, marginTop: 4 },
  footerCredit: { color: "#9FB4A5", fontSize: 10, maxWidth: 130, textAlign: "right" },
});
