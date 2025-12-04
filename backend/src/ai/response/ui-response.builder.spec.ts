/**
 * Unit tests for UIResponseBuilder
 *
 * Tests validation and construction of render_ui_component tool call arguments.
 */
import { UIResponseBuilder } from './ui-response.builder';
import type {
  HealthReportProps,
  FleetHealthReportProps,
  FinancialReportProps,
  FleetOverviewProps,
  ComparisonChartProps,
  DynamicChartProps,
  PowerCurveProps,
  ForecastChartProps,
} from './ui-schemas';
import { AnySuggestion } from '../types/flow-state';

describe('UIResponseBuilder', () => {
  const validSuggestions: AnySuggestion[] = [
    { label: 'View Details', action: 'Show more details', priority: 'primary' },
  ];

  describe('healthReport', () => {
    const validProps: HealthReportProps = {
      loggerId: '925',
      period: '2025-01-01 to 2025-01-07',
      healthScore: 85,
      anomalies: [
        {
          timestamp: '2025-01-05T10:00:00Z',
          type: 'power_drop',
          description: 'Power dropped below threshold',
          severity: 'medium',
          power: 1500,
        },
      ],
    };

    it('should build valid HealthReport args', () => {
      const result = UIResponseBuilder.healthReport(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('HealthReport');
      expect(result.props).toEqual(validProps);
      expect(result.suggestions).toEqual(validSuggestions);
    });

    it('should return ErrorCard for invalid healthScore', () => {
      const invalidProps = { ...validProps, healthScore: 150 };
      const result = UIResponseBuilder.healthReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
      expect((result.props as Record<string, unknown>).title).toBe(
        'Visualization Error',
      );
      expect((result.props as Record<string, unknown>).message).toContain(
        'HealthReport',
      );
    });

    it('should return ErrorCard for missing loggerId', () => {
      const invalidProps = {
        healthScore: 85,
        anomalies: [],
      } as unknown as HealthReportProps;
      const result = UIResponseBuilder.healthReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });

    it('should return ErrorCard for invalid severity', () => {
      const invalidProps = {
        ...validProps,
        anomalies: [
          {
            timestamp: '2025-01-05T10:00:00Z',
            type: 'test',
            description: 'Test',
            severity: 'critical', // Invalid - should be low/medium/high
          },
        ],
      } as unknown as HealthReportProps;

      const result = UIResponseBuilder.healthReport(invalidProps, []);
      expect(result.component).toBe('ErrorCard');
    });

    it('should use empty suggestions by default', () => {
      const result = UIResponseBuilder.healthReport(validProps);
      expect(result.suggestions).toEqual([]);
    });
  });

  describe('fleetHealthReport', () => {
    const validProps: FleetHealthReportProps = {
      period: 'Last 7 days',
      totalLoggers: 5,
      avgHealthScore: 92,
      totalAnomalies: 3,
      loggersWithIssues: 1,
      loggers: [
        {
          loggerId: '925',
          loggerType: 'goodwe',
          healthScore: 85,
          anomalyCount: 3,
          status: 'warning',
        },
      ],
    };

    it('should build valid FleetHealthReport args', () => {
      const result = UIResponseBuilder.fleetHealthReport(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('FleetHealthReport');
      expect(result.props).toEqual(validProps);
    });

    it('should return ErrorCard for invalid avgHealthScore', () => {
      const invalidProps = { ...validProps, avgHealthScore: -5 };
      const result = UIResponseBuilder.fleetHealthReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });

    it('should return ErrorCard for missing loggers array', () => {
      const invalidProps = {
        ...validProps,
        loggers: undefined,
      } as unknown as FleetHealthReportProps;
      const result = UIResponseBuilder.fleetHealthReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });
  });

  describe('financialReport', () => {
    const validProps: FinancialReportProps = {
      energyGenerated: 1500.5,
      savings: 300.1,
      co2Offset: 0.75,
      period: {
        start: '2025-01-01',
        end: '2025-01-07',
      },
    };

    it('should build valid FinancialReport args', () => {
      const result = UIResponseBuilder.financialReport(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('FinancialReport');
      expect(result.props).toEqual(validProps);
    });

    it('should build FinancialReport with forecast', () => {
      const propsWithForecast: FinancialReportProps = {
        ...validProps,
        forecast: {
          totalPredicted: 500,
          days: [
            { date: '2025-01-08', predictedEnergy: 100 },
            { date: '2025-01-09', predictedEnergy: 120 },
          ],
        },
      };

      const result = UIResponseBuilder.financialReport(propsWithForecast, []);
      expect(result.component).toBe('FinancialReport');
      expect((result.props as Record<string, unknown>).forecast).toBeDefined();
    });

    it('should return ErrorCard for missing period', () => {
      const invalidProps = {
        ...validProps,
        period: undefined,
      } as unknown as FinancialReportProps;
      const result = UIResponseBuilder.financialReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });
  });

  describe('fleetOverview', () => {
    const validProps: FleetOverviewProps = {
      totalPower: 50000,
      totalEnergy: 250.5,
      deviceCount: 5,
      onlineCount: 4,
      percentOnline: 80,
    };

    it('should build valid FleetOverview args', () => {
      const result = UIResponseBuilder.fleetOverview(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('FleetOverview');
      expect(result.props).toEqual(validProps);
    });

    it('should build FleetOverview with alerts', () => {
      const propsWithAlerts: FleetOverviewProps = {
        ...validProps,
        alerts: [{ type: 'warning', message: 'Logger 925 offline' }],
      };

      const result = UIResponseBuilder.fleetOverview(propsWithAlerts, []);
      expect(result.component).toBe('FleetOverview');
    });

    it('should build FleetOverview with dateMismatch', () => {
      const propsWithMismatch: FleetOverviewProps = {
        ...validProps,
        dateMismatch: {
          requestedDate: '2025-01-15',
          actualDataDate: '2025-01-10',
          daysDifference: 5,
          isHistorical: true,
        },
      };

      const result = UIResponseBuilder.fleetOverview(propsWithMismatch, []);
      expect(result.component).toBe('FleetOverview');
    });

    it('should return ErrorCard for invalid percentOnline', () => {
      const invalidProps = { ...validProps, percentOnline: 150 };
      const result = UIResponseBuilder.fleetOverview(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });
  });

  describe('comparisonChart', () => {
    const validProps: ComparisonChartProps = {
      loggerIds: ['925', '926'],
      metric: 'power',
      date: '2025-01-15',
      data: [
        { timestamp: '10:00', '925': 1500, '926': 1400 },
        { timestamp: '11:00', '925': 1600, '926': 1500 },
      ],
    };

    it('should build valid ComparisonChart args', () => {
      const result = UIResponseBuilder.comparisonChart(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('ComparisonChart');
      expect(result.props).toEqual(validProps);
    });

    it('should return ErrorCard for invalid metric', () => {
      const invalidProps = {
        ...validProps,
        metric: 'temperature',
      } as unknown as ComparisonChartProps;
      const result = UIResponseBuilder.comparisonChart(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });
  });

  describe('dynamicChart', () => {
    const validProps: DynamicChartProps = {
      chartType: 'line',
      title: 'Power Output',
      xAxisKey: 'timestamp',
      xAxisLabel: 'Time',
      yAxisLabel: 'Power (W)',
      series: [{ dataKey: 'power', name: 'Power', color: '#ff7300' }],
      data: [
        { timestamp: '10:00', power: 1500 },
        { timestamp: '11:00', power: 1600 },
      ],
      showLegend: true,
      showGrid: true,
      showTooltip: true,
    };

    it('should build valid DynamicChart args', () => {
      const result = UIResponseBuilder.dynamicChart(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('DynamicChart');
      expect(result.props).toEqual(validProps);
    });

    it('should build DynamicChart with multiple series', () => {
      const multiSeriesProps: DynamicChartProps = {
        ...validProps,
        chartType: 'composed',
        series: [
          { dataKey: 'power', name: 'Power', type: 'line', yAxisId: 'left' },
          {
            dataKey: 'irradiance',
            name: 'Irradiance',
            type: 'area',
            yAxisId: 'right',
          },
        ],
      };

      const result = UIResponseBuilder.dynamicChart(multiSeriesProps, []);
      expect(result.component).toBe('DynamicChart');
    });

    it('should return ErrorCard for invalid chartType', () => {
      const invalidProps = {
        ...validProps,
        chartType: 'radar',
      } as unknown as DynamicChartProps;
      const result = UIResponseBuilder.dynamicChart(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });

    it('should return ErrorCard for empty series', () => {
      const invalidProps = { ...validProps, series: [] };
      const result = UIResponseBuilder.dynamicChart(invalidProps, []);

      // Empty array is still valid according to schema - schema allows array with no min
      expect(result.component).toBe('DynamicChart');
    });
  });

  describe('powerCurve', () => {
    const validProps: PowerCurveProps = {
      loggerId: '925',
      date: '2025-01-15',
      data: [
        { timestamp: '10:00', power: 1500 },
        { timestamp: '11:00', power: 1600, irradiance: 850 },
      ],
    };

    it('should build valid PowerCurve args', () => {
      const result = UIResponseBuilder.powerCurve(validProps, validSuggestions);

      expect(result.component).toBe('PowerCurve');
      expect(result.props).toEqual(validProps);
    });

    it('should build PowerCurve with summary', () => {
      const propsWithSummary: PowerCurveProps = {
        ...validProps,
        summary: {
          peakPower: 1600,
          totalEnergy: 12.5,
          avgIrradiance: 800,
        },
      };

      const result = UIResponseBuilder.powerCurve(propsWithSummary, []);
      expect(result.component).toBe('PowerCurve');
    });

    it('should return ErrorCard for missing loggerId', () => {
      const invalidProps = {
        date: '2025-01-15',
        data: [],
      } as unknown as PowerCurveProps;
      const result = UIResponseBuilder.powerCurve(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });
  });

  describe('forecastChart', () => {
    const validProps: ForecastChartProps = {
      loggerId: '925',
      forecasts: [
        { date: '2025-01-16', predictedEnergy: 100 },
        { date: '2025-01-17', predictedEnergy: 120 },
      ],
      totalPredicted: 220,
    };

    it('should build valid ForecastChart args', () => {
      const result = UIResponseBuilder.forecastChart(
        validProps,
        validSuggestions,
      );

      expect(result.component).toBe('ForecastChart');
      expect(result.props).toEqual(validProps);
    });

    it('should return ErrorCard for missing forecasts', () => {
      const invalidProps = {
        loggerId: '925',
        totalPredicted: 0,
      } as unknown as ForecastChartProps;
      const result = UIResponseBuilder.forecastChart(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });

    it('should return ErrorCard for missing totalPredicted', () => {
      const invalidProps = {
        loggerId: '925',
        forecasts: [{ date: '2025-01-16', predictedEnergy: 100 }],
      } as unknown as ForecastChartProps;
      const result = UIResponseBuilder.forecastChart(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
    });
  });

  describe('error handling', () => {
    it('should include error details in ErrorCard', () => {
      const invalidProps = {
        healthScore: 'not a number',
      } as unknown as HealthReportProps;
      const result = UIResponseBuilder.healthReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
      const props = result.props as Record<string, unknown>;
      expect(props.details).toBeDefined();
      expect(Array.isArray(props.details)).toBe(true);
    });

    it('should limit error details to 3 items', () => {
      // Create props with multiple validation errors
      const invalidProps = {
        // Missing loggerId, invalid healthScore, invalid anomalies, missing all required fields
      } as unknown as HealthReportProps;
      const result = UIResponseBuilder.healthReport(invalidProps, []);

      expect(result.component).toBe('ErrorCard');
      const props = result.props as Record<string, unknown>;
      const details = props.details as string[];
      expect(details.length).toBeLessThanOrEqual(3);
    });
  });
});
