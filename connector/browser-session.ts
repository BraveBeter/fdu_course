import { chromium, type Browser } from 'playwright';
export async function runInBrowser<T>(
  signal: AbortSignal,
  run: (browser: Browser) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const browser = await chromium.launch({ headless: true, timeout: 15000 });
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= browser.close());
  const onAbort = () => {
    void close().catch(() => console.error('Browser cleanup failed'));
  };
  try {
    signal.addEventListener('abort', onAbort, { once: true });
    signal.throwIfAborted();
    return await run(browser);
  } finally {
    signal.removeEventListener('abort', onAbort);
    await close();
  }
}
