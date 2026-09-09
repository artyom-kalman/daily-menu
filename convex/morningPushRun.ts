/**
 * Run a morning push attempt. On failure: log, alert operators, then rethrow
 * so callers can fail the action once fetch work is done (or keep retrying).
 */
export async function runMorningPush(
  runPush: () => Promise<unknown>,
  sendAlert: (text: string) => Promise<unknown>,
): Promise<void> {
  try {
    await runPush();
  } catch (err) {
    const message = (err as Error).message;
    console.error(`morning push failed: ${message}`);
    try {
      await sendAlert(`⚠️ daily-menu: morning push failed: ${message}`);
    } catch (alertErr) {
      console.error(
        `morning push admin alert failed: ${(alertErr as Error).message}`,
      );
    }
    throw err;
  }
}
