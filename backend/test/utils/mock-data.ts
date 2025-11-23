/**
 * Shared test data constants and builders
 * Reduces duplication in parser test suites
 */

// Common timestamp constants
export const LTI_TIMESTAMP = '2025-10-01 10:00:00';
export const GOODWE_TIMESTAMP = '20251001T100000';
export const DEFAULT_LOGGER = 'LOGGER001';

/**
 * LTI CSV data builders
 */
export const ltiCsv = {
  /** Simple [data] section with P_AC */
  simple: (value: number) => [
    '[data]',
    'timestamp;P_AC',
    `${LTI_TIMESTAMP};${value}`,
  ],

  /** [data] section with custom header and rows */
  withHeader: (header: string, ...rows: string[]) => [
    '[data]',
    header,
    ...rows,
  ],

  /** CSV with serial in header metadata */
  withSerial: (serial: string, header: string, ...rows: string[]) => [
    `serial=${serial}`,
    '[data]',
    header,
    ...rows,
  ],

  /** Full sectioned CSV with [header] block */
  fullHeader: (serial: string, csvHeader: string, ...dataRows: string[]) => [
    '[header]',
    `serial=${serial}`,
    'model=LTi5000',
    'firmware=1.2.3',
    '',
    '[data]',
    csvHeader,
    ...dataRows,
  ],

  /** Header-only (no data rows) for error testing */
  headerOnly: (serial: string, csvHeader: string) => [
    '[header]',
    `serial=${serial}`,
    '[data]',
    csvHeader,
  ],
};

/**
 * GoodWe CSV data builders (EAV format: timestamp,loggerId,key,value)
 */
export const goodweCsv = {
  /** Single EAV row */
  row: (
    key: string,
    value: string,
    ts = GOODWE_TIMESTAMP,
    logger = DEFAULT_LOGGER,
  ) => `${ts},${logger},${key},${value}`,

  /** Multiple EAV rows for same timestamp/logger */
  rows: (
    entries: Array<{
      key: string;
      value: string;
      ts?: string;
      logger?: string;
    }>,
  ) =>
    entries.map(
      (e) =>
        `${e.ts ?? GOODWE_TIMESTAMP},${e.logger ?? DEFAULT_LOGGER},${e.key},${e.value}`,
    ),

  /** Basic metrics (pac + e_day) */
  basicMetrics: (
    pac: string,
    eDay: string,
    ts = GOODWE_TIMESTAMP,
    logger = DEFAULT_LOGGER,
  ) => [`${ts},${logger},pac,${pac}`, `${ts},${logger},e_day,${eDay}`],
};
