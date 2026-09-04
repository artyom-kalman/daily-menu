/** Fail closed: missing/empty expected secret is unauthorized. */
export function isAuthorizedWebhook(
  expectedSecret: string | undefined,
  provided: string | null,
): boolean {
  return Boolean(expectedSecret) && provided === expectedSecret;
}
