/** Site-posted cafeteria notices (closed / holiday), not dish names. */
const NOTICE_RE =
  /휴무|쉽니다|미운영|방학|공휴일|휴일|휴점|closed|운영하지|오늘은\s*쉽/i;

export function looksLikeCafeteriaNotice(names: string[]): boolean {
  return names.some((name) => NOTICE_RE.test(name));
}
