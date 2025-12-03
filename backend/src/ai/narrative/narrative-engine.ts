/**
 * NarrativeEngine - Centralized narrative generation with multi-step processing.
 *
 * Replaces inline narrative generation in flows with:
 * - Decompose → Branch → Generate → Conditional Refine pipeline
 * - Context-aware suggestions replacing static COMMON_SUGGESTIONS
 * - Consistent system message for stable outputs
 */

import { Logger } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';

import {
  NarrativeContext,
  extractAnomalies,
  extractHealthScore,
  countBySeverity,
  extractComparisonSeverity,
  AnomalyData,
} from './narrative-context';
import {
  NarrativePreferences,
  DEFAULT_NARRATIVE_PREFERENCES,
  VERBOSITY_WORD_TARGETS,
} from './narrative-preferences';
import {
  selectBranch,
  NarrativeBranch,
  isActionRequired,
  isDataQualityBranch,
  SeverityBand,
  calculateSeverityBand,
  calculateHealthSeverityBand,
} from './narrative-branching';
import {
  NARRATIVE_SYSTEM_PROMPT,
  buildNarrativePrompt,
  buildRefinementPrompt,
  generateFallbackNarrative,
  NarrativePromptOptions,
} from './narrative-prompts';
import { EnhancedSuggestion } from '../types/flow-state';

const logger = new Logger('NarrativeEngine');

/**
 * Supported model types for narrative generation.
 */
type ModelType =
  | ChatGoogleGenerativeAI
  | ChatAnthropic
  | ChatOpenAI
  | ChatOllama;

/**
 * Decomposed facts extracted from context data.
 */
interface DecomposedFacts {
  subject: string;
  flowType: string;
  primaryMetric: {
    name: string;
    value: number | string;
    unit?: string;
    benchmark?: number;
  };
  secondaryMetrics: Array<{
    name: string;
    value: number | string;
    unit?: string;
  }>;
  anomalies: AnomalyData[];
  anomalySummary: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  dataQualityNote?: string;
  period?: string;
  isFleet: boolean;
  fleetSize?: number;
}

/**
 * Result from narrative generation.
 */
export interface NarrativeResult {
  /** Generated narrative text */
  narrative: string;
  /** Confidence in the generation (0-1) */
  confidence: number;
  /** Whether fallback was used */
  usedFallback: boolean;
  /** Generation metadata for debugging */
  metadata: {
    branchPath: NarrativeBranch;
    wasRefined: boolean;
    retryCount: number;
    generationTimeMs: number;
  };
}

/**
 * NarrativeEngine class for centralized narrative generation.
 */
export class NarrativeEngine {
  private model: ModelType;

  constructor(model: ModelType) {
    this.model = model;
  }

  /**
   * Generate a narrative for the given context and preferences.
   * Uses multi-step generation: decompose → branch → generate → conditional refine
   */
  async generate(
    context: NarrativeContext,
    preferences: NarrativePreferences = DEFAULT_NARRATIVE_PREFERENCES,
  ): Promise<NarrativeResult> {
    const startTime = Date.now();
    const retryCount = 0;
    let wasRefined = false;

    // Step 1: Decompose context into structured facts
    const facts = this.decomposeFacts(context);

    // Step 2: Select narrative branch
    const branch = selectBranch(context);
    logger.debug(`Selected branch: ${branch} for ${context.subject}`);

    // Step 2.5: Calculate severity band for tone adjustment
    const severityBand = this.getSeverityBand(context);
    if (severityBand) {
      logger.debug(`Severity band: ${severityBand}`);
    }

    // Step 3: Generate raw narrative
    let narrative: string;
    let usedFallback = false;

    try {
      narrative = await this.generateRawNarrative(
        branch,
        facts,
        preferences,
        context,
        severityBand,
      );

      // Step 4: Conditional refinement
      const refinementNeeded = this.needsRefinement(narrative, preferences);
      if (refinementNeeded) {
        logger.debug(`Refining narrative: ${refinementNeeded}`);
        try {
          narrative = await this.refineNarrative(
            narrative,
            refinementNeeded,
            preferences,
          );
          wasRefined = true;
        } catch (refineError) {
          logger.warn(`Refinement failed, using original: ${refineError}`);
          // Keep original narrative if refinement fails
        }
      }
    } catch (error) {
      logger.warn(`Narrative generation failed: ${error}`);
      usedFallback = true;
      // Pass severity and temporal context to enhanced fallback
      narrative = generateFallbackNarrative(
        branch,
        {
          subject: facts.subject,
          healthScore: facts.primaryMetric.value,
          anomalyCount: facts.anomalySummary.total,
          period: facts.period,
          flowType: context.flowType,
          // Flow-specific data for fallback generation
          energyGenerated: context.data.energyGenerated,
          savings: context.data.savings,
          co2Offset: context.data.co2Offset,
          onlineCount: context.data.onlineCount,
          deviceCount: context.data.deviceCount,
          percentOnline: context.data.percentOnline,
          loggerIds: context.data.loggerIds,
          // Performance audit data
          spreadPercent: context.data.spreadPercent,
          bestPerformer: context.data.bestPerformer,
          worstPerformer: context.data.worstPerformer,
        },
        severityBand,
        context.temporalContext,
      );
    }

    const generationTimeMs = Date.now() - startTime;

    return {
      narrative,
      confidence: usedFallback ? 0.5 : 0.9,
      usedFallback,
      metadata: {
        branchPath: branch,
        wasRefined,
        retryCount,
        generationTimeMs,
      },
    };
  }

  /**
   * Get severity band based on flow type and context data.
   * Returns undefined if no severity calculation is applicable.
   */
  private getSeverityBand(context: NarrativeContext): SeverityBand | undefined {
    // Fleet-based severity for morning briefing
    if (context.flowType === 'morning_briefing') {
      const percentOnline = context.data.percentOnline as number;
      if (typeof percentOnline === 'number') {
        return calculateSeverityBand(percentOnline);
      }
    }

    // Health-based severity for health check
    if (context.flowType === 'health_check') {
      const healthScore = context.data.healthScore as number;
      if (typeof healthScore === 'number') {
        return calculateHealthSeverityBand(healthScore);
      }
    }

    return undefined;
  }

  /**
   * Generate contextual suggestions based on narrative context.
   * Replaces static COMMON_SUGGESTIONS with context-aware recommendations.
   */
  generateSuggestions(
    context: NarrativeContext,
    maxSuggestions: number = 3,
  ): EnhancedSuggestion[] {
    const branch = selectBranch(context);
    // Note: getSuggestionPriority is available for future use to set default priority
    const suggestions: EnhancedSuggestion[] = [];

    // Add branch-specific suggestions
    if (isDataQualityBranch(branch)) {
      suggestions.push({
        label: 'Try different date',
        action: 'Show me data from the most recent available date',
        priority: 'suggested',
        reason: 'Data may be available for other dates',
        icon: 'chart',
      });
    }

    if (isActionRequired(branch)) {
      // Critical or warning branches
      const anomalies = extractAnomalies(context.data);
      const hasHighSeverity = anomalies.some((a) => a.severity === 'high');

      if (hasHighSeverity) {
        suggestions.push({
          label: 'Diagnose issues',
          action: `Diagnose the issues found for ${context.subject}`,
          priority: 'urgent',
          reason: 'High-severity anomalies detected',
          badge: '!',
          icon: 'alert',
        });
      }

      suggestions.push({
        label: 'View power curve',
        action: `Show me the power curve for ${context.subject}`,
        priority: 'recommended',
        reason: 'See when issues occurred',
        badge: '*',
        icon: 'chart',
      });
    }

    // Add flow-specific suggestions
    if (context.flowType === 'health_check') {
      if (!isActionRequired(branch)) {
        suggestions.push({
          label: 'Check savings',
          action: `How much have I saved with ${context.subject}?`,
          priority: 'suggested',
          reason: 'System is healthy - check financial impact',
          badge: '>',
          icon: 'dollar',
        });
      }

      if (!context.isFleetAnalysis) {
        suggestions.push({
          label: 'Compare devices',
          action: 'Compare all my inverters',
          priority: 'optional',
          reason: 'See how this device compares to others',
          icon: 'chart',
        });
      }
    }

    // Morning briefing suggestions
    if (context.flowType === 'morning_briefing') {
      if (!isActionRequired(branch)) {
        suggestions.push({
          label: 'Check efficiency',
          action: 'Show me the efficiency breakdown',
          priority: 'suggested',
          reason: 'System is healthy - optimize performance',
          badge: '>',
          icon: 'chart',
        });
      } else {
        suggestions.push({
          label: 'Diagnose issues',
          action: 'Diagnose the offline devices',
          priority: 'urgent',
          reason: 'Some devices need attention',
          badge: '!',
          icon: 'alert',
        });
      }

      suggestions.push({
        label: 'View power curve',
        action: 'Show me the power curve for today',
        priority: 'optional',
        reason: 'See production throughout the day',
        icon: 'chart',
      });
    }

    // Financial report suggestions
    if (context.flowType === 'financial_report') {
      suggestions.push({
        label: 'Monthly trend',
        action: 'Show me the monthly savings trend',
        priority: 'suggested',
        reason: 'Compare with previous months',
        badge: '>',
        icon: 'chart',
      });

      suggestions.push({
        label: 'Forecast next month',
        action: 'What are my projected savings for next month?',
        priority: 'optional',
        reason: 'Plan ahead with forecasting',
        icon: 'lightbulb',
      });
    }

    // Performance audit suggestions - context-aware based on severity
    if (context.flowType === 'performance_audit') {
      const severity = extractComparisonSeverity(context.data);
      const worstPerformer = context.data.worstPerformer as
        | { loggerId: string }
        | undefined;
      const bestPerformer = context.data.bestPerformer as
        | { loggerId: string }
        | undefined;

      // For significant differences, prioritize investigating underperformer
      if (severity === 'large_difference' && worstPerformer) {
        suggestions.push({
          label: 'Diagnose underperformer',
          action: `Check health of ${worstPerformer.loggerId}`,
          priority: 'recommended',
          reason: 'Large performance gap detected',
          badge: '*',
          icon: 'alert',
        });
      }

      // Always offer to analyze best performer
      if (bestPerformer) {
        suggestions.push({
          label: 'Analyze top performer',
          action: `Show detailed metrics for ${bestPerformer.loggerId}`,
          priority: 'suggested',
          reason: 'Understand what makes it perform better',
          badge: '>',
          icon: 'chart',
        });
      }

      // Offer to compare on different metric
      suggestions.push({
        label: 'Compare on energy',
        action: 'Compare total energy production instead of power',
        priority: 'optional',
        reason: 'See if the pattern holds for daily totals',
        icon: 'chart',
      });
    }

    // Always offer to check another device if single logger
    if (!context.isFleetAnalysis) {
      suggestions.push({
        label: 'Check another device',
        action: 'Check health of a different inverter',
        priority: 'optional',
        reason: 'Analyze other devices in your fleet',
        icon: 'settings',
      });
    }

    // Sort by priority and limit
    const priorityOrder = {
      urgent: 0,
      recommended: 1,
      suggested: 2,
      optional: 3,
    };
    return suggestions
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, maxSuggestions);
  }

  /**
   * Decompose context into structured facts for prompts.
   */
  private decomposeFacts(context: NarrativeContext): DecomposedFacts {
    const anomalies = extractAnomalies(context.data);
    const healthScore = extractHealthScore(context.data);
    const severityCounts = countBySeverity(anomalies);

    // Group anomalies by type
    const byType = anomalies.reduce(
      (acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Build data quality note if needed
    let dataQualityNote: string | undefined;
    if (context.dataQuality.completeness < 100) {
      dataQualityNote = `Data completeness: ${context.dataQuality.completeness}%`;
      if (context.dataQuality.missingFields?.length) {
        dataQualityNote += `. Missing: ${context.dataQuality.missingFields.join(', ')}`;
      }
    }
    if (
      !context.dataQuality.isExpectedWindow &&
      context.dataQuality.actualWindow
    ) {
      const actual = context.dataQuality.actualWindow;
      dataQualityNote = `Data is from ${actual.start} to ${actual.end} (different from requested window)`;
    }

    return {
      subject: context.subject,
      flowType: context.flowType,
      primaryMetric: {
        name: 'Health Score',
        value: healthScore,
        unit: '%',
        benchmark: 95,
      },
      secondaryMetrics: [
        {
          name: 'Anomalies',
          value: anomalies.length,
        },
        {
          name: 'Period',
          value: (context.data.period as string) || 'Last 7 days',
        },
      ],
      anomalies,
      anomalySummary: {
        total: anomalies.length,
        byType,
        bySeverity: severityCounts,
      },
      dataQualityNote,
      period: (context.data.period as string) || 'Last 7 days',
      isFleet: context.isFleetAnalysis || false,
      fleetSize: context.fleetSize,
    };
  }

  /**
   * Generate raw narrative using LLM.
   * Includes severity band and temporal context for enhanced prompts.
   */
  private async generateRawNarrative(
    branch: NarrativeBranch,
    facts: DecomposedFacts,
    preferences: NarrativePreferences,
    context: NarrativeContext,
    severityBand?: SeverityBand,
  ): Promise<string> {
    // Format facts as string for prompt
    const factsString = this.formatFactsForPrompt(facts);

    // Build prompt options with severity and temporal context
    const options: NarrativePromptOptions = {
      severityBand,
      temporalContext: context.temporalContext,
      // Include examples for detailed verbosity to help train style
      includeExamples: preferences.verbosity === 'detailed',
    };

    // Build the complete prompt with options
    const userPrompt = buildNarrativePrompt(
      branch,
      factsString,
      preferences,
      options,
    );

    // Invoke model with system message
    const response = await this.model.invoke([
      new SystemMessage(NARRATIVE_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);

    const content = response.content;
    let narrative = '';

    if (typeof content === 'string') {
      narrative = content.trim();
    } else if (Array.isArray(content)) {
      // Handle array content (shouldn't happen for narrative generation)
      const textParts = content
        .filter((part) => typeof part === 'string' || part.type === 'text')
        .map((part) =>
          typeof part === 'string' ? part : (part as { text: string }).text,
        );
      narrative = textParts.join(' ').trim();
    }

    // Validate the narrative - check for common signs of invalid output
    // (e.g., system prompt leak, empty response, or too short)
    if (
      !narrative ||
      narrative.length < 10 ||
      narrative.includes('RULES:') ||
      narrative.includes('OUTPUT FORMAT:')
    ) {
      throw new Error('Invalid or malformed LLM response');
    }

    return narrative;
  }

  /**
   * Check if narrative needs refinement based on preferences.
   */
  private needsRefinement(
    narrative: string,
    preferences: NarrativePreferences,
  ): 'too_long' | 'too_short' | 'wrong_tone' | null {
    const wordCount = narrative.split(/\s+/).length;
    const target = VERBOSITY_WORD_TARGETS[preferences.verbosity];

    if (wordCount > target.max * 1.3) {
      return 'too_long';
    }
    if (wordCount < target.min * 0.7) {
      return 'too_short';
    }

    // Tone checking would require more sophisticated analysis
    // For now, we only refine based on length
    return null;
  }

  /**
   * Refine narrative to match preferences.
   */
  private async refineNarrative(
    narrative: string,
    issue: 'too_long' | 'too_short' | 'wrong_tone',
    preferences: NarrativePreferences,
  ): Promise<string> {
    const refinementPrompt = buildRefinementPrompt(
      narrative,
      issue,
      preferences,
    );

    const response = await this.model.invoke([
      new SystemMessage(NARRATIVE_SYSTEM_PROMPT),
      new HumanMessage(refinementPrompt),
    ]);

    const content = response.content;
    if (typeof content === 'string') {
      return content.trim();
    }

    return narrative; // Return original if refinement fails
  }

  /**
   * Format decomposed facts as a string for the prompt.
   */
  private formatFactsForPrompt(facts: DecomposedFacts): string {
    const lines: string[] = [];

    lines.push(`Subject: ${facts.subject}`);
    lines.push(
      `${facts.primaryMetric.name}: ${facts.primaryMetric.value}${facts.primaryMetric.unit || ''}`,
    );

    for (const metric of facts.secondaryMetrics) {
      lines.push(`${metric.name}: ${metric.value}${metric.unit || ''}`);
    }

    if (facts.anomalySummary.total > 0) {
      lines.push(`Total anomalies: ${facts.anomalySummary.total}`);
      const severities = Object.entries(facts.anomalySummary.bySeverity)
        .filter(([, count]) => count > 0)
        .map(([sev, count]) => `${count} ${sev}`)
        .join(', ');
      if (severities) {
        lines.push(`Severity breakdown: ${severities}`);
      }
      const types = Object.entries(facts.anomalySummary.byType)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');
      if (types) {
        lines.push(`Anomaly types: ${types}`);
      }
    }

    if (facts.dataQualityNote) {
      lines.push(`Note: ${facts.dataQualityNote}`);
    }

    if (facts.isFleet) {
      lines.push(`Fleet analysis: ${facts.fleetSize} devices`);
    }

    return lines.join('\n');
  }
}
