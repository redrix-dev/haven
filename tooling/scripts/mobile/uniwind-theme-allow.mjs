export function allowCommentMatches(text, rule) {
  const markerIndex = text.indexOf("uniwind-theme-allow");
  if (markerIndex === -1) return false;

  const tail = text.slice(markerIndex + "uniwind-theme-allow".length).trim();
  if (!tail) return true;
  if (/\ball\b/.test(tail)) return true;
  return tail.includes(rule);
}

/**
 * Prettier expands `<Component className="...">` across two lines, leaving an
 * allow comment immediately above the opening tag and two lines above the
 * flagged attribute. Keep that documented JSX form equivalent to same-line and
 * previous-line exceptions without allowing distant comments to leak.
 */
export function isThemeRuleAllowed(rawLines, lineIndex, rule) {
  return [lineIndex, lineIndex - 1, lineIndex - 2].some((index) =>
    allowCommentMatches(rawLines[index] ?? "", rule),
  );
}
