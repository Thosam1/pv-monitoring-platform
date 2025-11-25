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

// Meier-NT constants
export const MEIER_TIMESTAMP = '01.10.2025 01:50:00';
export const MEIER_SERIAL = '080000891';

// Meier-NT CSV structure
const MEIER_METADATA_LINES = (serial: string) => [
  `serial; ${serial}`,
  'usermail; monitoring@ranft-gruppe.de',
  'description; Test Installation',
];
const MEIER_HEADERS =
  '; GENERAL.Feed-In_Power; Kostal.1.2.Feed-In_Power; GENERAL.Generator_Power; GENERAL.Yield';
const MEIER_UNITS = '; W; W; W; Wh';

/**
 * Meier-NT Logger CSV data builders
 */
export const meierCsv = {
  /** Simple CSV with single data row */
  simple: (
    feedInPower: number,
    yieldWh: number,
    ts = MEIER_TIMESTAMP,
    serial = MEIER_SERIAL,
  ): string =>
    [
      ...MEIER_METADATA_LINES(serial),
      MEIER_HEADERS,
      MEIER_UNITS,
      `${ts}; ${feedInPower}; ${feedInPower}; 0; ${yieldWh}`,
    ].join('\n'),

  /** CSV with all values specified */
  withAllValues: (
    values: {
      ts?: string;
      feedInPower: number;
      kostalFeedInPower: number;
      generatorPower: number;
      yieldWh: number;
    },
    serial = MEIER_SERIAL,
  ): string =>
    [
      ...MEIER_METADATA_LINES(serial),
      MEIER_HEADERS,
      MEIER_UNITS,
      `${values.ts ?? MEIER_TIMESTAMP}; ${values.feedInPower}; ${values.kostalFeedInPower}; ${values.generatorPower}; ${values.yieldWh}`,
    ].join('\n'),

  /** CSV with multiple data rows */
  multipleRows: (
    rows: Array<{ ts: string; feedInPower: number; yieldWh: number }>,
    serial = MEIER_SERIAL,
  ): string =>
    [
      ...MEIER_METADATA_LINES(serial),
      MEIER_HEADERS,
      MEIER_UNITS,
      ...rows.map(
        (r) => `${r.ts}; ${r.feedInPower}; ${r.feedInPower}; 0; ${r.yieldWh}`,
      ),
    ].join('\n'),

  /** Headers only (no data) for error testing */
  headersOnly: (serial = MEIER_SERIAL): string =>
    [...MEIER_METADATA_LINES(serial), MEIER_HEADERS, MEIER_UNITS].join('\n'),

  /** Empty file */
  empty: (): string => '',

  /** Metadata lines for custom structures */
  metadataLines: MEIER_METADATA_LINES,
};

// MBMET constants
export const MBMET_TIMESTAMP = '2025_09_30 23:42:27';
export const MBMET_LOGGER_ID = '838176578';

// MBMET CSV headers
const MBMET_HEADERS =
  'Zeitstempel,Einstrahlung (Einstrahlung West),T_Zelle (Einstrahlung West),T_Umgebung (Einstrahlung West),Einstrahlung (Einstrahlung Ost),T_Zelle (Einstrahlung Ost),T_Umgebung (Einstrahlung Ost)';
const MBMET_UNITS = 'yyyy_MM_dd HH:mm:ss,W/m2,°C,°C,W/m2,°C,°C';

/**
 * MBMET 501FB Meteo Station CSV data builders
 */
export const mbmetCsv = {
  /** Simple CSV with single data row */
  simple: (irradianceWest: number, ts = MBMET_TIMESTAMP): string =>
    [
      MBMET_HEADERS,
      MBMET_UNITS,
      `${ts},${irradianceWest},10.4,9.2,0.0,10.9,8.8`,
    ].join('\n'),

  /** CSV with all values specified */
  withAllValues: (values: {
    ts?: string;
    irradianceWest: number;
    tZelleWest: number;
    tUmgebungWest: number;
    irradianceOst: number;
    tZelleOst: number;
    tUmgebungOst: number;
  }): string =>
    [
      MBMET_HEADERS,
      MBMET_UNITS,
      `${values.ts ?? MBMET_TIMESTAMP},${values.irradianceWest},${values.tZelleWest},${values.tUmgebungWest},${values.irradianceOst},${values.tZelleOst},${values.tUmgebungOst}`,
    ].join('\n'),

  /** CSV with multiple data rows */
  multipleRows: (rows: Array<{ ts: string; irradianceWest: number }>): string =>
    [
      MBMET_HEADERS,
      MBMET_UNITS,
      ...rows.map((r) => `${r.ts},${r.irradianceWest},10.4,9.2,0.0,10.9,8.8`),
    ].join('\n'),

  /** CSV without units row (edge case) */
  withoutUnits: (irradianceWest: number, ts = MBMET_TIMESTAMP): string =>
    [MBMET_HEADERS, `${ts},${irradianceWest},10.4,9.2,0.0,10.9,8.8`].join('\n'),

  /** Headers only (no data) for error testing */
  headersOnly: (): string => [MBMET_HEADERS, MBMET_UNITS].join('\n'),

  /** Empty file */
  empty: (): string => '',
};
