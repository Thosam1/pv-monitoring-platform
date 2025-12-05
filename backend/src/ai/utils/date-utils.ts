/**
 * Date utilities for AI module, including demo mode support.
 *
 * When DEMO_DATE environment variable is set, getCurrentDate() returns the demo date
 * instead of the actual current date. This allows demos to show historical data
 * as "live" with appropriate greetings (e.g., "Good morning" at noon demo time).
 *
 * Example: DEMO_DATE="2025-12-05T12:00:00"
 */

/**
 * Get the current date, or demo date if DEMO_DATE env var is set.
 *
 * @returns Current Date object (real or mocked for demo)
 */
export function getCurrentDate(): Date {
  const demoDate = process.env.DEMO_DATE;
  if (demoDate) {
    const parsed = new Date(demoDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
    console.warn(`Invalid DEMO_DATE: ${demoDate}, using real time`);
  }
  return new Date();
}

/**
 * Get the current hour in UTC, respecting DEMO_DATE if set.
 *
 * @returns Hour in 24-hour format (0-23)
 */
export function getCurrentHourUTC(): number {
  return getCurrentDate().getUTCHours();
}

/**
 * Check if demo mode is enabled.
 *
 * @returns true if DEMO_DATE is set and valid
 */
export function isDemoMode(): boolean {
  const demoDate = process.env.DEMO_DATE;
  if (!demoDate) return false;
  const parsed = new Date(demoDate);
  return !Number.isNaN(parsed.getTime());
}
