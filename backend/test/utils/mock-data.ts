/**
 * Shared test data constants and builders
 * Reduces duplication in parser test suites
 */

// Common timestamp constants
export const LTI_TIMESTAMP = '2025-10-01 10:00:00';
export const GOODWE_TIMESTAMP = '20251001T100000';
export const DEFAULT_LOGGER = 'TESTLOGGER01'; // 12 chars - passes GoodWe validation (min 10, not all digits)

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

// Plexlog constants
export const PLEXLOG_TIMESTAMP = '2025-10-13T10:55:00.0000000';
export const PLEXLOG_SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * Plexlog SQLite data builders
 * Note: These return row objects matching tbl_inverterdata schema
 * Used for mocking better-sqlite3 query results
 */
export const plexlogData = {
  /** Inverter row with power and optional values */
  inverterRow: (
    id: number,
    power: number,
    timestamp = PLEXLOG_TIMESTAMP,
    optionalvalue?: string,
  ) => ({
    id_inverter: id,
    acproduction: power,
    timestamp,
    optionalvalue:
      optionalvalue ?? `T00:29.8;tot:381936;uac:235;p01:1843;u01:734`,
  }),

  /** Sensor row (irradiance) - device ID 10 */
  sensorRow: (
    id: number,
    irradiance: number,
    timestamp = PLEXLOG_TIMESTAMP,
  ) => ({
    id_inverter: id,
    acproduction: irradiance,
    timestamp,
    optionalvalue: `tce:25.0;tex:20.0;wds:0.5`,
  }),

  /** Meter row with grid values - device ID 2 */
  meterRow: (id: number, power: number, timestamp = PLEXLOG_TIMESTAMP) => ({
    id_inverter: id,
    acproduction: power,
    timestamp,
    optionalvalue: `exp:0.000;imp:0.000;frq:49.986;cos:1.000;ul1:20246;il1:0.000`,
  }),

  /** Row with null optionalvalue (minimal) */
  minimalRow: (id: number, power: number, timestamp = PLEXLOG_TIMESTAMP) => ({
    id_inverter: id,
    acproduction: power,
    timestamp,
    optionalvalue: null,
  }),

  /** Multiple inverter rows at same timestamp */
  multipleInverters: (
    inverters: Array<{ id: number; power: number; optionalvalue?: string }>,
    timestamp = PLEXLOG_TIMESTAMP,
  ) =>
    inverters.map((inv) => ({
      id_inverter: inv.id,
      acproduction: inv.power,
      timestamp,
      optionalvalue:
        inv.optionalvalue ?? `T00:25.0;tot:100000;uac:235;p01:${inv.power}`,
    })),
};

// SmartDog constants
export const SMARTDOG_TIMESTAMP = 1762152300; // Unix seconds
export const SMARTDOG_INVERTER_HEADER =
  'timestamp;address;bus;strings;stringid;pac;pdc;udc;temp';
export const SMARTDOG_SENSOR_HEADER = 'timestamp;value';

/**
 * SmartDog Logger CSV data builders
 */
export const smartdogCsv = {
  /** Inverter data header */
  inverterHeader: SMARTDOG_INVERTER_HEADER,

  /** Sensor data header */
  sensorHeader: SMARTDOG_SENSOR_HEADER,

  /** Single inverter data row */
  inverterRow: (
    ts: number,
    pac: number,
    opts: {
      address?: number;
      bus?: number;
      strings?: number;
      stringid?: number;
      pdc?: number;
      udc?: number;
      temp?: number;
    } = {},
  ): string => {
    const {
      address = 1,
      bus = 1,
      strings = 4,
      stringid = 3,
      pdc = pac + 20,
      udc = 550,
      temp = 25,
    } = opts;
    return `${ts};${address};${bus};${strings};${stringid};${pac};${pdc};${udc};${temp}`;
  },

  /** Complete inverter file (header + rows) */
  inverterFile: (
    rows: Array<{
      ts: number;
      pac: number;
      address?: number;
      bus?: number;
      strings?: number;
      stringid?: number;
      pdc?: number;
      udc?: number;
      temp?: number;
    }>,
  ): string[] => [
    SMARTDOG_INVERTER_HEADER,
    ...rows.map((r) =>
      smartdogCsv.inverterRow(r.ts, r.pac, {
        address: r.address,
        bus: r.bus,
        strings: r.strings,
        stringid: r.stringid,
        pdc: r.pdc,
        udc: r.udc,
        temp: r.temp,
      }),
    ),
  ],

  /** Simple inverter file with single row */
  inverterSimple: (pac: number, ts = SMARTDOG_TIMESTAMP): string[] => [
    SMARTDOG_INVERTER_HEADER,
    smartdogCsv.inverterRow(ts, pac),
  ],

  /** Sensor data row (for modbus/onewire) - includes trailing -1 status */
  sensorRow: (ts: number, value: number): string => `${ts};${value};-1`,

  /** Complete sensor file (header + rows) */
  sensorFile: (rows: Array<{ ts: number; value: number }>): string[] => [
    SMARTDOG_SENSOR_HEADER,
    ...rows.map((r) => smartdogCsv.sensorRow(r.ts, r.value)),
  ],

  /** Simple sensor file with single row */
  sensorSimple: (value: number, ts = SMARTDOG_TIMESTAMP): string[] => [
    SMARTDOG_SENSOR_HEADER,
    smartdogCsv.sensorRow(ts, value),
  ],

  /** Headers only (no data) for error testing */
  inverterHeaderOnly: (): string[] => [SMARTDOG_INVERTER_HEADER],
  sensorHeaderOnly: (): string[] => [SMARTDOG_SENSOR_HEADER],

  /** Empty file */
  empty: (): string[] => [],
};

// Meteo Control constants
export const METEOCONTROL_TIMESTAMP = '12:45:00';
export const METEOCONTROL_DATUM = '251106'; // YYMMDD = Nov 6, 2025
export const METEOCONTROL_ANLAGE = 'Turnow-P. 1 FF - Strang N2';

/**
 * Meteo Control INI-style data builders (delta_analog format)
 * Returns arrays of strings (like ltiCsv) for use with parseAndCollect
 */
export const meteocontrolCsv = {
  /** Simple INI with single data row */
  simple: (
    irradiance: number,
    datum = METEOCONTROL_DATUM,
    time = METEOCONTROL_TIMESTAMP,
    anlage = METEOCONTROL_ANLAGE,
  ): string[] => [
    '[info]',
    `Anlage=${anlage}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6;G_M10;G_M18',
    ';s;W/m²;W/m²;W/m²',
    '',
    '[Start]',
    `${time};900;${irradiance};${irradiance - 20};${irradiance - 10}`,
  ],

  /** INI with custom columns and values */
  withColumns: (
    headers: string,
    units: string,
    ...dataRows: string[]
  ): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${METEOCONTROL_DATUM}`,
    '',
    '[messung]',
    headers,
    units,
    '',
    '[Start]',
    ...dataRows,
  ],

  /** INI with custom Datum */
  withDatum: (datum: string, time: string, irradiance: number): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6',
    ';s;W/m²',
    '',
    '[Start]',
    `${time};900;${irradiance}`,
  ],

  /** INI with custom Anlage */
  withAnlage: (anlage: string, irradiance: number): string[] => [
    '[info]',
    `Anlage=${anlage}`,
    `Datum=${METEOCONTROL_DATUM}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6',
    ';s;W/m²',
    '',
    '[Start]',
    `${METEOCONTROL_TIMESTAMP};900;${irradiance}`,
  ],

  /** INI with multiple data rows */
  multipleRows: (
    rows: Array<{ time: string; irradiance: number }>,
    datum = METEOCONTROL_DATUM,
  ): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6;G_M10',
    ';s;W/m²;W/m²',
    '',
    '[Start]',
    ...rows.map((r) => `${r.time};900;${r.irradiance};${r.irradiance - 20}`),
  ],

  /** INI with Info;Time marker lines (edge case) */
  withMarkerLines: (irradiance: number): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${METEOCONTROL_DATUM}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6',
    ';s;W/m²',
    '',
    '[Start]',
    `${METEOCONTROL_TIMESTAMP};900;${irradiance}`,
    'Info;Time',
    '12:50:00;900;660',
  ],

  /** INI with edge case values (-0, empty) */
  withEdgeCases: (): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${METEOCONTROL_DATUM}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6;G_M10;G_M18',
    ';s;W/m²;W/m²;W/m²',
    '',
    '[Start]',
    '00:00:00;900;-0;0;',
    '00:15:00;900;;5;10',
  ],

  /** INI with 24:00:00 timestamp edge case */
  with24Timestamp: (datum: string, irradiance: number): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6',
    ';s;W/m²',
    '',
    '[Start]',
    `24:00:00;900;${irradiance}`,
  ],

  /** Headers only (no data) for error testing */
  headersOnly: (): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${METEOCONTROL_DATUM}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;G_M6',
    ';s;W/m²',
    '',
    '[Start]',
  ],

  /** Empty file */
  empty: (): string[] => [],

  // ===== delta_inverter builders =====

  /** Simple inverter INI with single inverter row */
  inverterSimple: (
    serial: string,
    pacKw: number,
    eTagKwh: number,
    datum = METEOCONTROL_DATUM,
    time = METEOCONTROL_TIMESTAMP,
  ): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;Adresse;IP-Adresse;Serien Nummer;Pac;E_Tag;Uac_L1;Fac',
    ';s;;;kW;kWh;V;Hz',
    '',
    '[Start]',
    `${time};900;511;10.10.2.2;${serial};${pacKw};${eTagKwh};318.16;50.00`,
  ],

  /** Inverter INI with multiple inverters at same timestamp */
  inverterMultiple: (
    inverters: Array<{
      serial: string;
      pacKw: number;
      eTagKwh: number;
    }>,
    time = METEOCONTROL_TIMESTAMP,
    datum = METEOCONTROL_DATUM,
  ): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;Adresse;IP-Adresse;Serien Nummer;Pac;E_Tag;Uac_L1;Uac_L2;Uac_L3;Fac',
    ';s;;;kW;kWh;V;V;V;Hz',
    '',
    '[Start]',
    ...inverters.map(
      (inv, i) =>
        `${time};900;${511 + i};10.10.2.${i + 1};${inv.serial};${inv.pacKw};${inv.eTagKwh};318.16;318.55;318.74;50.00`,
    ),
  ],

  /** Inverter INI with full column set (realistic example) */
  inverterFull: (
    serial: string,
    pacKw: number,
    eTagKwh: number,
    datum = METEOCONTROL_DATUM,
    time = METEOCONTROL_TIMESTAMP,
  ): string[] => [
    '[info]',
    `Anlage=${METEOCONTROL_ANLAGE}`,
    `Datum=${datum}`,
    '',
    '[messung]',
    'Uhrzeit;Intervall;Adresse;IP-Adresse;Serien Nummer;Wartestatus;MPC;Upv_Ist;Upv0;Ipv;Ppv;Uac_L1;Uac_L2;Uac_L3;Fac;Pac;Riso;Tsc;Tpt100;Tkk;E_Total;E_Tag;E_Int;h_Total;h_On',
    ';s;;;;;;V;V;A;kW;V;V;V;Hz;kW;kOhm;°C;°C;°C;kWh;kWh;kWh;H;H',
    '',
    '[Start]',
    `${time};900;511;10.10.2.2;${serial};0;;10;0;5.1;0.5;318.16;318.55;318.74;50.00;${pacKw};0;17.0;0.0;7.24;12072483.3;${eTagKwh};0.5;49376.13;105985.96`,
  ],
};
