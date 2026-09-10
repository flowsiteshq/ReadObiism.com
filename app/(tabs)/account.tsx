import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { getReadingPulse, saveReadingGoal, type ReadingGoal, type ReadingPulse } from "@/lib/reader-storage";

const COVER = require("../../assets/images/obi-ism-cover-000.jpg");
const GOALS: ReadingGoal[] = [3, 5, 7];

export default function AccountScreen() {
  const [pulse, setPulse] = useState<ReadingPulse>({ weeklyGoal: 3, sectionsThisWeek: 0, activeDays: 0, bookmarks: 0 });
  useFocusEffect(useCallback(() => { void getReadingPulse().then(setPulse); }, []));

  const chooseGoal = async (goal: ReadingGoal) => {
    haptic.selection();
    await saveReadingGoal(goal);
    setPulse((current) => ({ ...current, weeklyGoal: goal }));
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <StatusBar style="light" backgroundColor="#151A52" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <View style={styles.hero}>
            <View style={styles.heroCircle} /><View style={styles.heroLine} />
            <Text style={styles.kicker}>YOUR PRIVATE EDITION</Text>
            <Text style={styles.heroTitle}>Make the philosophy part of your rhythm.</Text>
            <Text style={styles.heroBody}>Your reading path lives here—private, personal, and protected by design.</Text>
            <Image source={COVER} contentFit="cover" style={styles.cover} />
          </View>
          <View style={styles.body}>
            <View style={styles.statsRow}>
              <Stat value={String(pulse.sectionsThisWeek).padStart(2, "0")} label="SECTIONS{`\n`}THIS WEEK" accent="#FF5B55" />
              <Stat value={String(pulse.activeDays).padStart(2, "0")} label="DAYS{`\n`}OF FOCUS" accent="#6CD9FF" />
              <Stat value={String(pulse.bookmarks).padStart(2, "0")} label="SAVED{`\n`}MARKERS" accent="#DFFF4F" />
            </View>

            <View style={styles.goalCard}>
              <Text style={styles.cardKicker}>SET YOUR WEEKLY INTENTION</Text>
              <Text style={styles.goalTitle}>How many sections will you make room for?</Text>
              <View style={styles.goalOptions}>{GOALS.map((goal) => <TouchableOpacity key={goal} accessibilityRole="button" onPress={() => void chooseGoal(goal)} style={[styles.goalOption, pulse.weeklyGoal === goal && styles.goalOptionActive]}><Text style={[styles.goalValue, pulse.weeklyGoal === goal && styles.goalValueActive]}>{goal}</Text><Text style={[styles.goalLabel, pulse.weeklyGoal === goal && styles.goalLabelActive]}>SECTIONS</Text></TouchableOpacity>)}</View>
              <Text style={styles.goalNote}>This stays on your device and only helps shape your reading rhythm.</Text>
            </View>

            <Text style={styles.sectionKicker}>YOUR EDITION, PROTECTED</Text>
            <View style={styles.securityCard}><SecurityRow mark="01" title="Personal access" body="A single-reader edition prepared for account and device controls at launch." /><SecurityRow mark="02" title="Focused format" body="No public export, social sharing, or print pathway inside the reader." /><SecurityRow mark="03" title="Capture deterrence" body="Supported devices activate reader-time screen-capture deterrence." /></View>
            <TouchableOpacity accessibilityRole="button" onPress={() => haptic.light()} style={styles.supportButton}><Text style={styles.supportButtonText}>Request a device-change review</Text><Text style={styles.supportButtonArrow}>→</Text></TouchableOpacity>
            <Text style={styles.supportNote}>When access services are connected, this route will keep genuine readers from being locked out after a device replacement.</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent: string }) { return <View style={[styles.stat, { borderTopColor: accent }]}><Text style={[styles.statValue, { color: accent }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function SecurityRow({ mark, title, body }: { mark: string; title: string; body: string }) { return <View style={styles.securityRow}><Text style={styles.securityMark}>{mark}</Text><View style={styles.securityCopy}><Text style={styles.securityTitle}>{title}</Text><Text style={styles.securityBody}>{body}</Text></View></View>; }

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 }, page: { alignSelf: "center", maxWidth: 650, width: "100%" },
  hero: { backgroundColor: "#151A52", minHeight: 290, overflow: "hidden", paddingHorizontal: 23, paddingTop: 43 },
  heroCircle: { backgroundColor: "#FF5B55", borderRadius: 135, height: 255, opacity: 0.92, position: "absolute", right: -120, top: 14, width: 255 },
  heroLine: { borderColor: "#DFFF4F", borderRadius: 114, borderWidth: 1, height: 228, position: "absolute", right: -75, top: 45, width: 228 },
  kicker: { color: "#DFFF4F", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, maxWidth: "61%" },
  heroTitle: { color: "#FFFFFF", fontFamily: "serif", fontSize: 34, fontWeight: "700", lineHeight: 40, marginTop: 8, maxWidth: "76%" },
  heroBody: { color: "#C4C9FB", fontSize: 12, lineHeight: 18, marginTop: 10, maxWidth: "64%" },
  cover: { bottom: -28, height: 177, position: "absolute", right: 10, transform: [{ rotate: "-8deg" }], width: 118 },
  body: { backgroundColor: "#FFF6E7", paddingBottom: 40, paddingHorizontal: 22, paddingTop: 24 },
  statsRow: { flexDirection: "row", gap: 9 },
  stat: { backgroundColor: "#FFFFFF", borderTopWidth: 6, flex: 1, minHeight: 96, padding: 10 },
  statValue: { fontFamily: "serif", fontSize: 27, fontWeight: "700" },
  statLabel: { color: "#6B6D82", fontSize: 7, fontWeight: "900", letterSpacing: 0.35, lineHeight: 10, marginTop: 8 },
  goalCard: { backgroundColor: "#6CD9FF", marginTop: 23, padding: 18 },
  cardKicker: { color: "#151A52", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  goalTitle: { color: "#151A52", fontFamily: "serif", fontSize: 24, fontWeight: "700", lineHeight: 29, marginTop: 6 },
  goalOptions: { flexDirection: "row", gap: 8, marginTop: 16 },
  goalOption: { backgroundColor: "rgba(255,255,255,0.55)", flex: 1, paddingVertical: 12 },
  goalOptionActive: { backgroundColor: "#151A52" },
  goalValue: { color: "#151A52", fontFamily: "serif", fontSize: 23, fontWeight: "700", textAlign: "center" },
  goalValueActive: { color: "#DFFF4F" }, goalLabel: { color: "#151A52", fontSize: 7, fontWeight: "900", letterSpacing: 0.45, marginTop: 2, textAlign: "center" }, goalLabelActive: { color: "#FFFFFF" },
  goalNote: { color: "#253660", fontSize: 9, lineHeight: 13, marginTop: 12 },
  sectionKicker: { color: "#FF5B55", fontSize: 9, fontWeight: "900", letterSpacing: 1.05, marginTop: 31 },
  securityCard: { backgroundColor: "#FFFFFF", borderColor: "#DDD9EE", borderWidth: 1, marginTop: 10 },
  securityRow: { borderBottomColor: "#E5E2F0", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 12, padding: 15 },
  securityMark: { color: "#FF5B55", fontFamily: "serif", fontSize: 17, width: 25 }, securityCopy: { flex: 1 }, securityTitle: { color: "#151A52", fontSize: 14, fontWeight: "900" }, securityBody: { color: "#696B7E", fontSize: 11, lineHeight: 16, marginTop: 4 },
  supportButton: { alignItems: "center", backgroundColor: "#151A52", flexDirection: "row", justifyContent: "space-between", marginTop: 23, paddingHorizontal: 17, paddingVertical: 15 }, supportButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, supportButtonArrow: { color: "#DFFF4F", fontSize: 20 }, supportNote: { color: "#717185", fontSize: 10, lineHeight: 15, marginTop: 10, textAlign: "center" },
});
