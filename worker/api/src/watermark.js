// Invisible forensic watermark. The payload is the purchase/session reference,
// encoded as zero-width characters so copied text can be traced to a copy.
const ZERO = "\u200b";
const ONE = "\u200c";
const START = "\u2060\u200b\u2060";
const END = "\u2060\u200c\u2060";

export function encodeWatermark(value) {
  const text = String(value ?? "");
  if (!text) return "";
  const bits = [...text]
    .map((character) => character.charCodeAt(0).toString(2).padStart(8, "0"))
    .join("");
  return START + [...bits].map((bit) => (bit === "1" ? ONE : ZERO)).join("") + END;
}

export function decodeWatermarks(value) {
  const source = String(value ?? "");
  const found = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(START, cursor);
    if (start < 0) break;
    const end = source.indexOf(END, start + START.length);
    if (end < 0) break;
    const bits = [...source.slice(start + START.length, end)]
      .map((character) => (character === ZERO ? "0" : character === ONE ? "1" : ""))
      .join("");
    let decoded = "";
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      const code = Number.parseInt(bits.slice(index, index + 8), 2);
      if (code > 0) decoded += String.fromCharCode(code);
    }
    if (decoded) found.push(decoded);
    cursor = end + END.length;
  }
  return [...new Set(found)];
}
