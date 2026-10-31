import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { ApiError, createAccount, getAccess, signIn, signOut, type AccessState } from "@/lib/entitlement";
import { haptic } from "@/lib/haptics";

type Mode = "signin" | "register";

/**
 * Connects the app to the production entitlement worker: sign in, see whether
 * an edition is active, and unlock the licensed reader on this device.
 */
export function EditionAccessCard() {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void getAccess().then(setAccess);
    }, []),
  );

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || password.length < 8) {
      setMessage("Enter your email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      haptic.selection();
      if (mode === "signin") await signIn(email, password);
      else await createAccount(email, password);
      const next = await getAccess();
      setAccess(next);
      setPassword("");
      haptic.success();
      setMessage(next.access ? "Edition unlocked on this device." : "Signed in. No active purchase is linked to this email yet.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not reach the edition service. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    haptic.light();
    await signOut();
    setAccess({ authenticated: false, access: false, email: null, sessionId: null });
    setMessage("Signed out of this device.");
  };

  if (access?.authenticated) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>YOUR ACCOUNT</Text>
        <Text numberOfLines={1} style={styles.title}>{access.email}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, access.access ? styles.dotActive : styles.dotIdle]} />
          <Text style={styles.statusText}>{access.access ? "EDITION ACTIVE ON THIS DEVICE" : "NO ACTIVE EDITION YET"}</Text>
        </View>
        <Text style={styles.body}>
          {access.access
            ? "The licensed text now loads from the protected edition service."
            : "Purchase the edition on readobiism.com with this email and it unlocks here automatically."}
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign out of this device" onPress={() => void handleSignOut()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{mode === "signin" ? "ALREADY A READER" : "NEW READER"}</Text>
      <Text style={styles.title}>{mode === "signin" ? "Sign in to unlock your edition." : "Create your reader account."}</Text>
      <Text style={styles.body}>Use the email address you purchased with, so the protected edition can open on this device.</Text>

      <TextInput
        accessibilityLabel="Email address"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email address"
        placeholderTextColor="#6B6E7E"
        style={styles.input}
        value={email}
      />
      <TextInput
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        onChangeText={setPassword}
        placeholder="Password (8+ characters)"
        placeholderTextColor="#6B6E7E"
        secureTextEntry
        style={styles.input}
        value={password}
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={mode === "signin" ? "Sign in" : "Create account"}
        disabled={busy}
        onPress={() => void submit()}
        style={[styles.primaryButton, busy && styles.primaryButtonBusy]}
      >
        <Text style={styles.primaryButtonText}>{busy ? "CONNECTING…" : mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</Text>
        <Text style={styles.primaryButtonArrow}>→</Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={mode === "signin" ? "Create an account instead" : "Sign in instead"}
        onPress={() => {
          haptic.selection();
          setMode(mode === "signin" ? "register" : "signin");
          setMessage("");
        }}
        style={styles.switchButton}
      >
        <Text style={styles.switchText}>{mode === "signin" ? "New here? Create an account" : "Already a reader? Sign in"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3DCC8", borderWidth: 1, marginBottom: 18, padding: 17 },
  kicker: { color: "#9A6E1B", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#0B0F14", fontFamily: "serif", fontSize: 22, fontWeight: "700", lineHeight: 27, marginTop: 6 },
  body: { color: "#5A5F72", fontSize: 12, lineHeight: 18, marginTop: 7 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 10 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  dotActive: { backgroundColor: "#187660" },
  dotIdle: { backgroundColor: "#9A6E1B" },
  statusText: { color: "#0B0F14", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  input: { borderColor: "#E3DCC8", borderWidth: 1, color: "#0B0F14", fontSize: 14, marginTop: 12, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11 },
  message: { color: "#5A5F72", fontSize: 12, lineHeight: 17, marginTop: 11 },
  primaryButton: { alignItems: "center", backgroundColor: "#0B0F14", flexDirection: "row", justifyContent: "space-between", marginTop: 14, minHeight: 48, paddingHorizontal: 17, paddingVertical: 14 },
  primaryButtonBusy: { opacity: 0.7 },
  primaryButtonText: { color: "#E9C46A", fontSize: 11, fontWeight: "900", letterSpacing: 0.9 },
  primaryButtonArrow: { color: "#E9C46A", fontSize: 19 },
  secondaryButton: { alignItems: "center", alignSelf: "flex-start", borderColor: "#0B0F14", borderWidth: 1, justifyContent: "center", marginTop: 14, minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryButtonText: { color: "#0B0F14", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  switchButton: { alignItems: "center", justifyContent: "center", marginTop: 12, minHeight: 44, paddingVertical: 10 },
  switchText: { color: "#5A5F72", fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
});
