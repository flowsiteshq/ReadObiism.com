import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";

import { ScreenContainer } from "@/components/screen-container";

const COVER = require("../../assets/images/obi-ism-cover-000.jpg");

export default function AccountScreen() {
  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <StatusBar style="dark" backgroundColor="#F6F1E5" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <View style={styles.hero}>
            <Text style={styles.overline}>PRIVATE READING LICENSE</Text>
            <Text style={styles.heroTitle}>Your edition,{`\n`}protected by design.</Text>
            <Text style={styles.heroBody}>OBI-ISM is a personal, read-only experience. Access controls will be connected to your verified account at launch.</Text>
            <Image source={COVER} contentFit="cover" style={styles.coverGhost} />
          </View>

          <View style={styles.body}>
            <View style={styles.licenseCard}>
              <View style={styles.licenseCardHeader}>
                <Text style={styles.cardKicker}>YOUR ACCESS MODEL</Text>
                <Text style={styles.licenseSymbol}>◆</Text>
              </View>
              <Text style={styles.cardTitle}>One reader. One active device. One considered edition.</Text>
              <Text style={styles.cardBody}>When the production entitlement service is connected, your purchase and reading access will be verified across iOS and Android.</Text>
              <View style={styles.cardFooter}><Text style={styles.cardFooterText}>LICENSE SETUP IN PROGRESS</Text></View>
            </View>

            <Text style={styles.sectionLabel}>WHAT YOUR EDITION PROTECTS</Text>
            <View style={styles.securityList}>
              <SecurityRow index="01" title="Focused reading" body="Read-only presentation with no public export, share, or print flow." />
              <SecurityRow index="02" title="Protected reader mode" body="Screen-capture deterrence is enabled while reading on supported devices." />
              <SecurityRow index="03" title="Personal access" body="Account, password, purchase restore, and device controls are prepared for the production launch." />
            </View>

            <TouchableOpacity accessibilityRole="button" style={styles.supportButton}>
              <Text style={styles.supportButtonText}>Request device-change support</Text>
              <Text style={styles.supportButtonArrow}>→</Text>
            </TouchableOpacity>
            <Text style={styles.supportNote}>A controlled device-change route protects legitimate readers if a device is lost or replaced.</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SecurityRow({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <View style={styles.securityRow}>
      <Text style={styles.securityIndex}>{index}</Text>
      <View style={styles.securityCopy}>
        <Text style={styles.securityTitle}>{title}</Text>
        <Text style={styles.securityBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  page: { alignSelf: "center", maxWidth: 600, width: "100%" },
  hero: { backgroundColor: "#062E26", minHeight: 270, overflow: "hidden", paddingBottom: 26, paddingHorizontal: 26, paddingTop: 42 },
  overline: { color: "#C6A44A", fontSize: 10, fontWeight: "900", letterSpacing: 1.15 },
  heroTitle: { color: "#FFFDF6", fontFamily: "serif", fontSize: 31, fontWeight: "700", lineHeight: 38, marginTop: 10, position: "relative" },
  heroBody: { color: "#B7C9B9", fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: "72%", position: "relative" },
  coverGhost: { bottom: -48, height: 235, opacity: 0.37, position: "absolute", right: -21, transform: [{ rotate: "-8deg" }], width: 158 },
  body: { backgroundColor: "#F6F1E5", paddingBottom: 40, paddingHorizontal: 24, paddingTop: 27 },
  licenseCard: { backgroundColor: "#FFFDF8", borderColor: "#E0D5BC", borderWidth: 1, padding: 22 },
  licenseCardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardKicker: { color: "#98752E", fontSize: 9, fontWeight: "900", letterSpacing: 1.05 },
  licenseSymbol: { color: "#B79238", fontSize: 17 },
  cardTitle: { color: "#17372E", fontFamily: "serif", fontSize: 24, fontWeight: "700", lineHeight: 30, marginTop: 12 },
  cardBody: { color: "#5B6A61", fontSize: 13, lineHeight: 20, marginTop: 10 },
  cardFooter: { borderTopColor: "#E7DFCA", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 12 },
  cardFooterText: { color: "#7E897F", fontSize: 9, fontWeight: "900", letterSpacing: 0.75 },
  sectionLabel: { color: "#96752E", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 10, marginTop: 29 },
  securityList: { borderTopColor: "#D9CFB9", borderTopWidth: StyleSheet.hairlineWidth },
  securityRow: { borderBottomColor: "#D9CFB9", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, paddingVertical: 18 },
  securityIndex: { color: "#B18E3A", fontFamily: "serif", fontSize: 17, width: 24 },
  securityCopy: { flex: 1 },
  securityTitle: { color: "#17372E", fontSize: 15, fontWeight: "800" },
  securityBody: { color: "#637269", fontSize: 12, lineHeight: 18, marginTop: 4 },
  supportButton: { alignItems: "center", backgroundColor: "#17372E", flexDirection: "row", justifyContent: "space-between", marginTop: 27, paddingHorizontal: 18, paddingVertical: 15 },
  supportButtonText: { color: "#FFFDF6", fontSize: 13, fontWeight: "900" },
  supportButtonArrow: { color: "#C6A44A", fontSize: 19 },
  supportNote: { color: "#7D857D", fontSize: 10, fontStyle: "italic", lineHeight: 15, marginTop: 11, textAlign: "center" },
});
