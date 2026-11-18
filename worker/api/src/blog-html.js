const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeText = value => escapeHtml(value).replace(/&amp;(amp|lt|gt|quot|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g, '&$1;');
const allowed = new Set(['p','h2','h3','h4','strong','b','em','i','ul','ol','li','blockquote','a','br']);
const blocked = new Set(['script','style','svg','math','iframe','object','embed','template']);
export function isHtmlArticle(value) {
  return /<\/?(?:p|h[2-4]|ul|ol|li|strong|em|blockquote|br)\b/i.test(String(value));
}
export function sanitizeArticleHtml(value) {
  const input = String(value);
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>/g;
  const stack = [];
  let output = '', last = 0, blockedTag = '';
  for (const match of input.matchAll(tokenPattern)) {
    if (!blockedTag) output += escapeText(input.slice(last, match.index));
    last = match.index + match[0].length;
    const token = match[0];
    const parsed = token.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!parsed) continue;
    const closing = Boolean(parsed[1]), tag = parsed[2].toLowerCase();
    if (blockedTag) { if (closing && tag === blockedTag) blockedTag = ''; continue; }
    if (blocked.has(tag)) { if (!closing && !/\/\s*>$/.test(token)) blockedTag = tag; continue; }
    if (!allowed.has(tag)) continue;
    if (closing) {
      const index = stack.lastIndexOf(tag);
      if (index < 0) continue;
      while (stack.length > index) output += '</' + stack.pop() + '>';
      continue;
    }
    if (tag === 'br') { output += '<br>'; continue; }
    let attrs = '';
    if (tag === 'a') {
      const href = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/i);
      const value = href && (href[1] || href[2] || href[3] || '');
      if (value && /^https?:\/\//i.test(value)) {
        try {
          const url = new URL(value);
          if (['http:','https:'].includes(url.protocol)) attrs = ' href="' + escapeHtml(url.href) + '" rel="noopener noreferrer"';
        } catch {}
      }
    }
    output += '<' + tag + attrs + '>';
    stack.push(tag);
  }
  if (!blockedTag) output += escapeText(input.slice(last));
  while (stack.length) output += '</' + stack.pop() + '>';
  return output;
}