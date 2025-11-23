/**
 * Utility functions for building CSV test data
 * Reduces duplication in parser test suites
 */

/**
 * Create a Buffer from CSV lines
 */
export function createCsvBuffer(lines: string[], delimiter = '\n'): Buffer {
  return Buffer.from(lines.join(delimiter), 'utf-8');
}

/**
 * Create LTI-format sectioned CSV buffer
 */
export function createLtiCsv(opts: {
  serial?: string;
  headers: string[];
  rows: string[][];
}): Buffer {
  const lines = [
    ...(opts.serial ? [`serial=${opts.serial}`] : []),
    '[data]',
    opts.headers.join(';'),
    ...opts.rows.map((r) => r.join(';')),
  ];
  return createCsvBuffer(lines);
}

/**
 * Create GoodWe-format EAV CSV buffer (timestamp,loggerId,key,value)
 */
export function createGoodWeCsv(
  rows: Array<{
    timestamp: string;
    loggerId: string;
    key: string;
    value: string;
  }>,
): Buffer {
  const lines = rows.map(
    (r) => `${r.timestamp},${r.loggerId},${r.key},${r.value}`,
  );
  return createCsvBuffer(lines);
}
