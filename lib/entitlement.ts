import AsyncStorage from "@react-native-async-storage/async-storage";

import { chapters as bundledChapters, type BookChapter } from "@/lib/book-data";

/**
 * Client for the production entitlement worker (dashboard-worker.js).
 * Defaults to the live deployment; set EXPO_PUBLIC_API_URL to point at a
 * local `wrangler dev` instance while testing.
 */
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || "https://readobiism.com").replace(/\/+$/, "");
const DEVICE_KEY = "obi-ism.reader-device";
const SESSION_KEY = "obi-ism.session-token";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type AccessState = {
  authenticated: boolean;
  access: boolean;
  email: string | null;
  sessionId: string | null;
};

type RemoteChapter = {
  id: string;
  label: string;
  title: string;
  kind: BookChapter["kind"];
  summary?: string;
  paragraphs?: string[];
};

export type EditionResult = {
  chapters: BookChapter[];
  licensed: boolean;
};

/**
 * Device identity used by the worker's one-device binding.
 * Prefers the platform CSPRNG; falls back to Math.random on runtimes
 * without webcrypto (Hermes). Hardening: swap for expo-crypto once the
 * dependency tree is repaired.
 */
function randomToken(length = 32): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(length);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (input: Uint8Array) => Uint8Array } }).crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function getDeviceToken(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_KEY);
  if (stored) return stored;
  const token = randomToken(32);
  await AsyncStorage.setItem(DEVICE_KEY, token);
  return token;
}

export async function getSessionToken(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  clearEditionCache();
}

async function api<T>(
  path: string,
  options: { method?: string; body?: string; token?: string | null; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  Object.assign(headers, options.headers);
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(data?.error || `The edition service returned ${response.status}.`, response.status);
  }
  return data;
}

async function authenticate(path: string, email: string, password: string) {
  const data = await api<{ token?: string; account?: { email: string }; access?: boolean }>(path, {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (data.token) {
    await AsyncStorage.setItem(SESSION_KEY, data.token);
  } else {
    throw new ApiError("Sign-in did not return a native session token.", 500);
  }
  clearEditionCache();
  return data;
}

export function signIn(email: string, password: string) {
  return authenticate("/api/account/login", email, password);
}

export function createAccount(email: string, password: string) {
  return authenticate("/api/account/register", email, password);
}

export async function getAccess(): Promise<AccessState> {
  const token = await getSessionToken();
  if (!token) return { authenticated: false, access: false, email: null, sessionId: null };
  try {
    const data = await api<{ authenticated: boolean; access: boolean; email?: string; sessionId?: string | null }>(
      "/api/account/access",
      { token },
    );
    return {
      authenticated: Boolean(data.authenticated),
      access: Boolean(data.access),
      email: data.email ?? null,
      sessionId: data.sessionId ?? null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await AsyncStorage.removeItem(SESSION_KEY);
    }
    return { authenticated: false, access: false, email: null, sessionId: null };
  }
}

let editionCache: BookChapter[] | null = null;
let claimedSessionId: string | null = null;
const sectionCache = new Map<string, BookChapter>();

export function clearEditionCache(): void {
  editionCache = null;
  claimedSessionId = null;
  sectionCache.clear();
}

async function licensedReaderContext(currentAccess?: AccessState) {
  // Revalidate on every load. Expired sessions must never reuse cached text.
  const access = currentAccess ?? await getAccess();
  if (!access.access || !access.sessionId) throw new ApiError("Sign in with an active edition to continue reading.", 403);

  const sessionId = access.sessionId;
  const deviceToken = await getDeviceToken();
  if (claimedSessionId !== sessionId) {
    await api("/api/reader/claim", {
      method: "POST",
      token: await getSessionToken(),
      body: JSON.stringify({ session_id: sessionId, device_token: deviceToken }),
    });
    claimedSessionId = sessionId;
    editionCache = null;
    sectionCache.clear();
  }
  return { sessionId, deviceToken };
}

function mapChapter(chapter: RemoteChapter, withParagraphs = false): BookChapter {
  return {
    id: chapter.id,
    label: chapter.label,
    title: chapter.title,
    kind: chapter.kind,
    summary: chapter.summary ?? bundledChapters.find((item) => item.id === chapter.id)?.summary ?? "",
    paragraphs: withParagraphs ? chapter.paragraphs ?? [] : [],
  };
}

/** Loads licensed section metadata only; paragraph text is fetched separately. */
export async function loadEdition(): Promise<EditionResult> {
  const access = await getAccess();
  if (!access.access || !access.sessionId) return { chapters: bundledChapters, licensed: false };

  const { sessionId, deviceToken } = await licensedReaderContext(access);
  if (editionCache) return { chapters: editionCache, licensed: true };

  const remote = await api<{ chapters: RemoteChapter[] }>(
    `/api/reader?session_id=${encodeURIComponent(sessionId)}`,
    { headers: { "x-obi-device-token": deviceToken } },
  );
  const mapped = (remote.chapters ?? []).map((chapter) => mapChapter(chapter));
  if (!mapped.length) throw new ApiError("The protected edition is being prepared. Please retry shortly.", 503);

  editionCache = mapped;
  return { chapters: mapped, licensed: true };
}

/** Fetches one licensed section and keeps its text in memory only. */
export async function loadChapter(chapterId: string): Promise<BookChapter> {
  const { sessionId, deviceToken } = await licensedReaderContext();
  const cached = sectionCache.get(chapterId);
  if (cached) return cached;

  const remote = await api<{ chapter: RemoteChapter }>(
    `/api/reader?session_id=${encodeURIComponent(sessionId)}&section_id=${encodeURIComponent(chapterId)}`,
    { headers: { "x-obi-device-token": deviceToken } },
  );
  if (!remote.chapter) throw new ApiError("This section is not available.", 404);

  const chapter = mapChapter(remote.chapter, true);
  sectionCache.set(chapterId, chapter);
  return chapter;
}
