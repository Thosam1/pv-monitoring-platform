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

// Integra Sun constants
export const INTEGRA_TIMESTAMP = '2025-10-01 10:00:00';
export const INTEGRA_SERIAL = 'A1801100416';

/**
 * Integra Sun XML data builders (Meteocontrol format)
 */
export const integraXml = {
  /** Single inverter with P_AC */
  simple: (
    pAc: number,
    serial = INTEGRA_SERIAL,
    ts = INTEGRA_TIMESTAMP,
  ): string =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
      '<system interval="900" serial="20190276" utcOffset="+0">',
      '<md>',
      `<dp interval="300" timestamp="${ts}">`,
      `<inverter serial="${serial}" type="SG36KTL-M">`,
      `<mv type="P_AC">${pAc}</mv>`,
      '</inverter>',
      '</dp>',
      '</md>',
      '</system>',
      '</root>',
    ].join('\n'),

  /** Single inverter with multiple metrics */
  withMetrics: (
    metrics: Record<string, string>,
    serial = INTEGRA_SERIAL,
    ts = INTEGRA_TIMESTAMP,
  ): string => {
    const mvElements = Object.entries(metrics)
      .map(([type, value]) => `<mv type="${type}">${value}</mv>`)
      .join('\n');
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
      '<system serial="20190276"><md>',
      `<dp timestamp="${ts}">`,
      `<inverter serial="${serial}" type="SG36KTL-M">`,
      mvElements,
      '</inverter>',
      '</dp>',
      '</md></system>',
      '</root>',
    ].join('\n');
  },

  /** Multiple inverters at same timestamp */
  multipleInverters: (
    inverters: Array<{ serial: string; pAc: number }>,
    ts = INTEGRA_TIMESTAMP,
  ): string => {
    const invElements = inverters
      .map(
        (i) =>
          `<inverter serial="${i.serial}" type="SG36KTL-M"><mv type="P_AC">${i.pAc}</mv></inverter>`,
      )
      .join('\n');
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
      '<system serial="20190276"><md>',
      `<dp timestamp="${ts}">`,
      invElements,
      '</dp>',
      '</md></system>',
      '</root>',
    ].join('\n');
  },

  /** Multiple data points (timestamps) */
  multipleDataPoints: (
    dps: Array<{ ts: string; serial: string; pAc: number }>,
  ): string => {
    const dpElements = dps
      .map(
        (dp) =>
          `<dp timestamp="${dp.ts}"><inverter serial="${dp.serial}" type="SG36KTL-M"><mv type="P_AC">${dp.pAc}</mv></inverter></dp>`,
      )
      .join('\n');
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
      '<system serial="20190276"><md>',
      dpElements,
      '</md></system>',
      '</root>',
    ].join('\n');
  },

  /** With powermanagement (should be skipped) */
  withPowerManagement: (
    pAc: number,
    serial = INTEGRA_SERIAL,
    ts = INTEGRA_TIMESTAMP,
  ): string =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
      '<system serial="20190276"><md>',
      `<dp timestamp="${ts}">`,
      `<inverter serial="${serial}" type="SG36KTL-M"><mv type="P_AC">${pAc}</mv></inverter>`,
      '<powermanagement><mv type="DM">100</mv></powermanagement>',
      '</dp>',
      '</md></system>',
      '</root>',
    ].join('\n'),

  /** With error values (": --" and ": Run") */
  withErrors: (serial = INTEGRA_SERIAL, ts = INTEGRA_TIMESTAMP): string =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root>',
      '<system serial="20190276"><md>',
      `<dp timestamp="${ts}">`,
      `<inverter serial="${serial}" type="SG36KTL-M">`,
      '<mv type="ERROR">: --</mv>',
      '<mv type="STATE">: Run</mv>',
      '<mv type="P_AC">1500</mv>',
      '</inverter>',
      '</dp>',
      '</md></system>',
      '</root>',
    ].join('\n'),
};
