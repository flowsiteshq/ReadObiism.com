import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="#07090C" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.kicker}>PROFILE & PREFERENCES</Text><Text style={styles.title}>Your private edition, on your terms.</Text><Text style={styles.deck}>Reading controls stay quiet, personal, and within the boundaries of this protected publication.</Text></View>
        <View style={styles.body}>
          <Text style={styles.sectionKicker}>READING PREFERENCES</Text>
          <SettingRow title="Text size" body="Adjust type directly inside the reader with the Aᴬ control." action="READER" onPress={() => router.push("/reader?chapterId=preface" as never)} />
          <SettingRow title="Reading position" body="The latest section is kept privately on this device." action="JOURNEY" onPress={() => router.push("/(tabs)/account" as never)} />
          <Text style={styles.sectionKicker}>ACCESS & PRIVACY</Text>
          <SettingRow title="Protected reading" body="Supported native devices activate screen-capture deterrence while protected content is open." />
          <SettingRow title="Screenshots" body="No app can fully prevent screenshots in every environment; this edition uses best-effort deterrence where the platform supports it." />
          <SettingRow title="Devices & sessions" body="Account, password, and active-device controls will appear here when the production access service is connected." />
          <View style={styles.note}><Text style={styles.noteKicker}>PUBLICATION STATUS</Text><Text style={styles.noteBody}>The current reader is an interactive digital publication. Sensitive access decisions must be enforced by a production server, not only by interface controls.</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ title, body, action, onPress }: { title: string; body: string; action?: string; onPress?: () => void }) {
  const content = <><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingBody}>{body}</Text></View>{action ? <Text style={styles.settingAction}>{action} →</Text> : null}</>;
  return onPress ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} onPress={() => { haptic.light(); onPress(); }} style={styles.settingRow}>{content}</TouchableOpacity> : <View style={styles.settingRow}>{content}</View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F8F3E8", flex: 1 },
  scroll: { paddingBottom: 36 },
  hero: { backgroundColor: "#07090C", paddingBottom: 31, paddingHorizontal: 23, paddingTop: 12 },
  backButton: { alignItems: "center", borderColor: "rgba(233,196,106,0.7)", borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  backText: { color: "#E9C46A", fontSize: 20 },
  kicker: { color: "#E9C46A", fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginTop: 27 },
  title: { color: "#FFFFFF", fontFamily: "serif", fontSize: 37, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: 7 },
  deck: { color: "#D4D2CB", fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: 360 },
  body: { paddingHorizontal: 18, paddingTop: 25 },
  sectionKicker: { color: "#B08A31", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 10, marginTop: 10 },
  settingRow: { alignItems: "flex-start", backgroundColor: "#FFFFFF", borderBottomColor: "#E4DED2", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, justifyContent: "space-between", padding: 16 },
  settingCopy: { flex: 1 },
  settingTitle: { color: "#171715", fontFamily: "serif", fontSize: 19, fontWeight: "700" },
  settingBody: { color: "#666359", fontSize: 11, lineHeight: 16, marginTop: 5 },
  settingAction: { color: "#B08A31", fontSize: 8, fontWeight: "900", letterSpacing: 0.7, marginTop: 6 },
  note: { backgroundColor: "#E9C46A", marginTop: 26, padding: 18 },
  noteKicker: { color: "#171715", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  noteBody: { color: "#171715", fontFamily: "serif", fontSize: 17, fontWeight: "700", lineHeight: 23, marginTop: 7 },
});
