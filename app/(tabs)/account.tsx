import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";

export default function AccountScreen() {
  return (
    <ScreenContainer className="p-6" containerClassName="bg-background">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>READER ACCESS</Text>
        <Text style={styles.title}>Your license</Text>
        <Text style={styles.body}>This foundation keeps a clear record of the protections that will be connected to your verified account at launch.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACCESS MODEL</Text>
        <Text style={styles.cardTitle}>One account · one active device</Text>
        <Text style={styles.cardBody}>A production release will verify your purchase through the relevant app store and bind secure access to a registered device.</Text>
      </View>
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>Protection status</Text>
      <Text style={styles.row}>Screen-capture deterrence while reading</Text>
      <Text style={styles.row}>Read-only content; no export or sharing controls</Text>
      <Text style={styles.row}>Account, password, and device controls pending release setup</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.supportButton}>
        <Text style={styles.supportText}>Support for device changes</Text>
      </TouchableOpacity>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 26, marginTop: 8 },
  eyebrow: { color: "#B58B38", fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: "#15221E", fontSize: 31, fontWeight: "800", letterSpacing: -0.5, marginTop: 7 },
  body: { color: "#607168", fontSize: 15, lineHeight: 22, marginTop: 10 },
  card: { backgroundColor: "#073E32", borderRadius: 20, padding: 22 },
  cardLabel: { color: "#D7E4D9", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  cardTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", lineHeight: 28, marginTop: 8 },
  cardBody: { color: "#D7E4D9", fontSize: 14, lineHeight: 21, marginTop: 8 },
  divider: { backgroundColor: "#D9DED8", height: StyleSheet.hairlineWidth, marginVertical: 28 },
  sectionTitle: { color: "#15221E", fontSize: 17, fontWeight: "800", marginBottom: 10 },
  row: { borderBottomColor: "#E1E5E1", borderBottomWidth: StyleSheet.hairlineWidth, color: "#45554C", fontSize: 14, lineHeight: 20, paddingVertical: 13 },
  supportButton: { alignSelf: "flex-start", borderColor: "#073E32", borderRadius: 16, borderWidth: 1, marginTop: 26, paddingHorizontal: 16, paddingVertical: 12 },
  supportText: { color: "#073E32", fontSize: 14, fontWeight: "800" },
});
