/**
 * Unit tests for narrative-context.ts
 *
 * Tests context extraction, data quality helpers, and temporal context building.
 */
import {
  extractAnomalies,
  extractHealthScore,
  countBySeverity,
  createDefaultDataQuality,
  extractComparisonSeverity,
  extractSpreadPercent,
  buildTemporalContext,
  generateDeltaPhrase,
  AnomalyData,
  TemporalContext,
} from './narrative-context';
import { FleetStatusSnapshot } from '../types/flow-state';

describe('extractAnomalies', () => {
  it('should return empty array when anomalies is not present', () => {
    const data = {};
    expect(extractAnomalies(data)).toEqual([]);
  });

  it('should return empty array when anomalies is not an array', () => {
    const data = { anomalies: 'not an array' };
    expect(extractAnomalies(data)).toEqual([]);
  });

  it('should return empty array when anomalies is null', () => {
    const data = { anomalies: null };
    expect(extractAnomalies(data)).toEqual([]);
  });

  it('should return empty array when anomalies is undefined', () => {
    const data = { anomalies: undefined };
    expect(extractAnomalies(data)).toEqual([]);
  });

  it('should return empty array when anomalies is a number', () => {
    const data = { anomalies: 42 };
    expect(extractAnomalies(data)).toEqual([]);
  });

  it('should return anomalies array when valid', () => {
    const anomalies: AnomalyData[] = [
      {
        timestamp: '2025-01-15T10:00:00Z',
        type: 'power_drop',
        description: 'Power below threshold',
        severity: 'medium',
      },
    ];
    const data = { anomalies };
    expect(extractAnomalies(data)).toEqual(anomalies);
  });

  it('should return empty array when anomalies is empty', () => {
    const data = { anomalies: [] };
    expect(extractAnomalies(data)).toEqual([]);
  });
});

describe('extractHealthScore', () => {
  it('should return 100 when healthScore is not present', () => {
    const data = {};
    expect(extractHealthScore(data)).toBe(100);
  });

  it('should return 100 when healthScore is not a number', () => {
    const data = { healthScore: 'good' };
    expect(extractHealthScore(data)).toBe(100);
  });

  it('should return 100 when healthScore is null', () => {
    const data = { healthScore: null };
    expect(extractHealthScore(data)).toBe(100);
  });

  it('should return 100 when healthScore is undefined', () => {
    const data = { healthScore: undefined };
    expect(extractHealthScore(data)).toBe(100);
  });

  it('should return the health score when valid', () => {
    const data = { healthScore: 85 };
    expect(extractHealthScore(data)).toBe(85);
  });

  it('should return 0 when healthScore is 0', () => {
    const data = { healthScore: 0 };
    expect(extractHealthScore(data)).toBe(0);
  });

  it('should return decimal health scores', () => {
    const data = { healthScore: 75.5 };
    expect(extractHealthScore(data)).toBe(75.5);
  });
});

describe('countBySeverity', () => {
  it('should return zeros for empty array', () => {
    expect(countBySeverity([])).toEqual({ low: 0, medium: 0, high: 0 });
  });

  it('should count single low severity', () => {
    const anomalies: AnomalyData[] = [
      {
        timestamp: '2025-01-15T10:00:00Z',
        type: 'test',
        description: 'Test',
        severity: 'low',
      },
    ];
    expect(countBySeverity(anomalies)).toEqual({ low: 1, medium: 0, high: 0 });
  });

  it('should count single medium severity', () => {
    const anomalies: AnomalyData[] = [
      {
        timestamp: '2025-01-15T10:00:00Z',
        type: 'test',
        description: 'Test',
        severity: 'medium',
      },
    ];
    expect(countBySeverity(anomalies)).toEqual({ low: 0, medium: 1, high: 0 });
  });

  it('should count single high severity', () => {
    const anomalies: AnomalyData[] = [
      {
        timestamp: '2025-01-15T10:00:00Z',
        type: 'test',
        description: 'Test',
        severity: 'high',
      },
    ];
    expect(countBySeverity(anomalies)).toEqual({ low: 0, medium: 0, high: 1 });
  });

  it('should count multiple anomalies of mixed severity', () => {
    const anomalies: AnomalyData[] = [
      { timestamp: '1', type: 't', description: 'd', severity: 'low' },
      { timestamp: '2', type: 't', description: 'd', severity: 'low' },
      { timestamp: '3', type: 't', description: 'd', severity: 'medium' },
      { timestamp: '4', type: 't', description: 'd', severity: 'high' },
      { timestamp: '5', type: 't', description: 'd', severity: 'high' },
      { timestamp: '6', type: 't', description: 'd', severity: 'high' },
    ];
    expect(countBySeverity(anomalies)).toEqual({ low: 2, medium: 1, high: 3 });
  });
});

describe('createDefaultDataQuality', () => {
  it('should return completeness of 100', () => {
    const quality = createDefaultDataQuality();
    expect(quality.completeness).toBe(100);
  });

  it('should return isExpectedWindow as true', () => {
    const quality = createDefaultDataQuality();
    expect(quality.isExpectedWindow).toBe(true);
  });

  it('should return confidence of 1', () => {
    const quality = createDefaultDataQuality();
    expect(quality.confidence).toBe(1);
  });

  it('should not include actualWindow', () => {
    const quality = createDefaultDataQuality();
    expect(quality.actualWindow).toBeUndefined();
  });

  it('should not include missingFields', () => {
    const quality = createDefaultDataQuality();
    expect(quality.missingFields).toBeUndefined();
  });
});

describe('extractComparisonSeverity', () => {
  it('should return undefined when comparisonSeverity is not present', () => {
    const data = {};
    expect(extractComparisonSeverity(data)).toBeUndefined();
  });

  it('should return undefined when comparisonSeverity is invalid', () => {
    const data = { comparisonSeverity: 'invalid' };
    expect(extractComparisonSeverity(data)).toBeUndefined();
  });

  it('should return undefined when comparisonSeverity is a number', () => {
    const data = { comparisonSeverity: 42 };
    expect(extractComparisonSeverity(data)).toBeUndefined();
  });

  it('should return "similar" when valid', () => {
    const data = { comparisonSeverity: 'similar' };
    expect(extractComparisonSeverity(data)).toBe('similar');
  });

  it('should return "moderate_difference" when valid', () => {
    const data = { comparisonSeverity: 'moderate_difference' };
    expect(extractComparisonSeverity(data)).toBe('moderate_difference');
  });

  it('should return "large_difference" when valid', () => {
    const data = { comparisonSeverity: 'large_difference' };
    expect(extractComparisonSeverity(data)).toBe('large_difference');
  });
});

describe('extractSpreadPercent', () => {
  it('should return 0 when spreadPercent is not present', () => {
    const data = {};
    expect(extractSpreadPercent(data)).toBe(0);
  });

  it('should return 0 when spreadPercent is not a number', () => {
    const data = { spreadPercent: 'high' };
    expect(extractSpreadPercent(data)).toBe(0);
  });

  it('should return 0 when spreadPercent is null', () => {
    const data = { spreadPercent: null };
    expect(extractSpreadPercent(data)).toBe(0);
  });

  it('should return the spread percent when valid', () => {
    const data = { spreadPercent: 15.5 };
    expect(extractSpreadPercent(data)).toBe(15.5);
  });

  it('should return 0 when spreadPercent is 0', () => {
    const data = { spreadPercent: 0 };
    expect(extractSpreadPercent(data)).toBe(0);
  });

  it('should return negative spread percent', () => {
    const data = { spreadPercent: -5 };
    expect(extractSpreadPercent(data)).toBe(-5);
  });
});

describe('buildTemporalContext', () => {
  const currentStatus = {
    percentOnline: 80,
    offlineLoggers: ['925', '926'],
  };

  it('should return stable trend with 1 day tracked when no previous status', () => {
    const result = buildTemporalContext(currentStatus, undefined);
    expect(result.trend).toBe('stable');
    expect(result.daysTracked).toBe(1);
    expect(result.previousStatus).toBeUndefined();
  });

  it('should return improving trend when delta > 2%', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 70,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925', '926', '927'],
      healthScore: 85,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.trend).toBe('improving');
    expect(result.deltaPercentOnline).toBe(10);
    expect(result.daysTracked).toBe(2);
  });

  it('should return declining trend when delta < -2%', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 90,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925'],
      healthScore: 95,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.trend).toBe('declining');
    expect(result.deltaPercentOnline).toBe(-10);
  });

  it('should return stable trend when delta is between -2% and 2%', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 81,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925', '926'],
      healthScore: 90,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.trend).toBe('stable');
    expect(result.deltaPercentOnline).toBe(-1);
  });

  it('should detect newly online loggers', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 70,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925', '926', '927', '928'],
      healthScore: 85,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.newlyOnline).toEqual(['927', '928']);
  });

  it('should detect newly offline loggers', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 90,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: [],
      healthScore: 95,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.newlyOffline).toEqual(['925', '926']);
  });

  it('should not include newlyOnline when none came online', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 80,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925', '926'],
      healthScore: 90,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.newlyOnline).toBeUndefined();
  });

  it('should not include newlyOffline when none went offline', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 70,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925', '926', '927'],
      healthScore: 85,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.newlyOffline).toBeUndefined();
  });

  it('should include previousStatus in result', () => {
    const previous: FleetStatusSnapshot = {
      timestamp: '2025-01-14T00:00:00Z',
      percentOnline: 70,
      totalPower: 50000,
      totalEnergy: 250,
      offlineLoggers: ['925'],
      healthScore: 85,
    };
    const result = buildTemporalContext(currentStatus, previous);
    expect(result.previousStatus).toBe(previous);
  });
});

describe('generateDeltaPhrase', () => {
  it('should return undefined when deltaPercentOnline is undefined', () => {
    const temporal: TemporalContext = {
      trend: 'stable',
      daysTracked: 1,
    };
    expect(generateDeltaPhrase(temporal)).toBeUndefined();
  });

  it('should return undefined when delta is less than 1%', () => {
    const temporal: TemporalContext = {
      trend: 'stable',
      daysTracked: 2,
      deltaPercentOnline: 0.5,
    };
    expect(generateDeltaPhrase(temporal)).toBeUndefined();
  });

  it('should return undefined when delta is -0.5%', () => {
    const temporal: TemporalContext = {
      trend: 'stable',
      daysTracked: 2,
      deltaPercentOnline: -0.5,
    };
    expect(generateDeltaPhrase(temporal)).toBeUndefined();
  });

  it('should return undefined when delta is exactly 0', () => {
    const temporal: TemporalContext = {
      trend: 'stable',
      daysTracked: 2,
      deltaPercentOnline: 0,
    };
    expect(generateDeltaPhrase(temporal)).toBeUndefined();
  });

  it('should return "up X% from yesterday" for positive delta', () => {
    const temporal: TemporalContext = {
      trend: 'improving',
      daysTracked: 2,
      deltaPercentOnline: 5,
    };
    expect(generateDeltaPhrase(temporal)).toBe('up 5% from yesterday');
  });

  it('should return "down X% from yesterday" for negative delta', () => {
    const temporal: TemporalContext = {
      trend: 'declining',
      daysTracked: 2,
      deltaPercentOnline: -10,
    };
    expect(generateDeltaPhrase(temporal)).toBe('down 10% from yesterday');
  });

  it('should round decimal delta to integer', () => {
    const temporal: TemporalContext = {
      trend: 'improving',
      daysTracked: 2,
      deltaPercentOnline: 5.7,
    };
    expect(generateDeltaPhrase(temporal)).toBe('up 6% from yesterday');
  });

  it('should handle exactly 1% delta', () => {
    const temporal: TemporalContext = {
      trend: 'improving',
      daysTracked: 2,
      deltaPercentOnline: 1,
    };
    expect(generateDeltaPhrase(temporal)).toBe('up 1% from yesterday');
  });

  it('should handle exactly -1% delta', () => {
    const temporal: TemporalContext = {
      trend: 'declining',
      daysTracked: 2,
      deltaPercentOnline: -1,
    };
    expect(generateDeltaPhrase(temporal)).toBe('down 1% from yesterday');
  });
});
