import type { Page, PageGotoOptions } from '@playwright/test';

/**
 * Network errors that are transient infrastructure hiccups rather than
 * application faults: flaky CI runner networking, local adapters switching
 * (net::ERR_NETWORK_CHANGED), brief DNS blips, or the dev server accepting
 * the connection just before it is ready.
 */
const TRANSIENT_NETWORK_ERROR =
  /net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED|CONNECTION_REFUSED|CONNECTION_RESET|EMPTY_RESPONSE|INTERNET_DISCONNECTED|TIMED_OUT)/;

/**
 * Navigate to `url`, retrying on transient network errors so a single
 * infrastructure hiccup cannot fail an entire E2E run (CI jobs retry whole
 * tests, but a flake inside global-setup has no retry at all).
 */
export async function gotoRetryingTransientErrors(
  page: Page,
  url: string,
  options: PageGotoOptions = { waitUntil: 'domcontentloaded' },
  maxAttempts = 3
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, options);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = TRANSIENT_NETWORK_ERROR.test(message);
      if (!transient || attempt >= maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}
