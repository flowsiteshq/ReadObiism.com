// Shared deterministic transformation for the web API-client refactor.
export function useSharedApi(source) {
  const multiline = /const API_BASE = [^\n]+;\s*const apiFetch = \(path, options = \{\}\) => \{[\s\S]*?\n\s*\};/g;
  const compact = /const API_BASE=[\s\S]*?;const apiFetch=\(path,options=\{\}\)=>\{[\s\S]*?\}\)};/g;
  const matches = [...source.matchAll(multiline), ...source.matchAll(compact)];
  if (matches.length !== 1) throw new Error(`Expected one original API client, found ${matches.length}.`);
  return source.replace(matches[0][0], "const apiFetch = window.OBI_API.fetch;");
}
