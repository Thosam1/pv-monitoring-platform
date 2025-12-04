/**
 * Centralized prompt templates for narrative generation.
 * Provides consistent system message and branch-specific templates.
 */

import {
  NarrativeBranch,
  SeverityBand,
  SEVERITY_TONE_HINTS,
  calculateSeverityBand,
  calculateHealthSeverityBand,
} from './narrative-branching';
import {
  NarrativePreferences,
  NarrativeTone,
  NarrativeVerbosity,
  NarrativePersona,
} from './narrative-preferences';
import {
  AGENT_IDENTITY,
  STYLE_RULES,
  UNCERTAINTY_HANDLING,
  formatExamplesForBranch,
} from './narrative-identity';
import { TemporalContext, generateDeltaPhrase } from './narrative-context';

/**
 * Options for narrative prompt building.
 */
export interface NarrativePromptOptions {
  /** Include example outputs for the branch */
  includeExamples?: boolean;
  /** Severity band for tone adjustment */
  severityBand?: SeverityBand;
  /** Temporal context for comparison phrases */
  temporalContext?: TemporalContext;
}

/**
 * System prompt for generating selection request prompts.
 * Maintains Sunny persona consistency when asking users to select options.
 */
export const REQUEST_PROMPT_SYSTEM = `You are Sunny, a friendly and knowledgeable solar energy advisor.
Generate a SHORT (1-2 sentences) prompt asking the user to select something.

PERSONA RULES:
- Sound warm and conversational, not robotic or clinical
- Use "your panels", "your system", "your solar installation" - NEVER use technical terms like "logger", "device ID", or "inverter ID"
- Be concise - this is a selection prompt, not a report
- End with a clear, friendly call-to-action
- If there's a pre-selected value, acknowledge it warmly

AVOID:
- Technical jargon (logger, device ID, serial number, API)
- Excessive enthusiasm or emojis
- Long explanations or multiple questions
- Robotic phrases like "Please select from the following options"

EXAMPLES OF GOOD PROMPTS:
- "I found your GoodWe system! Should I check its health, or would you like to pick a different one?"
- "Which of your solar installations would you like me to take a closer look at?"
- "Ready to compare some of your systems! Pick 2-5 and I'll show you how they stack up."

OUTPUT: Only the prompt text, nothing else.`;

/**
 * Forbidden terms that should not appear in selection prompts.
 * Used for validation of LLM-generated prompts.
 */
export const FORBIDDEN_TERMS = [
  'logger',
  'device ID',
  'device_id',
  'deviceId',
  'loggerId',
  'logger_id',
  'serial number',
  'API',
  'endpoint',
  'JSON',
  'request',
  'parameter',
  'database',
  'query',
  'schema',
  'tool call',
  'function call',
];

/**
 * Static fallback prompts for selection requests.
 * Used when LLM generation fails or for latency-sensitive scenarios.
 * Organized by argument type, then by flow type.
 */
export const REQUEST_PROMPT_FALLBACKS: Record<
  string,
  Record<string, string>
> = {
  single_logger: {
    health_check:
      'Which of your solar installations would you like me to check on?',
    financial_report: 'Which system should I calculate savings for?',
    performance_audit: 'Which of your panels would you like to start with?',
    morning_briefing:
      'Which installation would you like the morning update for?',
    free_chat: 'Which of your solar systems should I look at?',
  },
  multiple_loggers: {
    performance_audit:
      "Pick 2-5 of your systems and I'll show you how they compare.",
    morning_briefing:
      'Which installations would you like in your morning summary?',
    free_chat: 'Which of your systems would you like me to compare?',
  },
  date: {
    health_check: 'What date should I analyze for you?',
    financial_report: 'Which date would you like the savings report for?',
    performance_audit: 'What day should I compare performance for?',
    free_chat: 'What date should I look at?',
  },
  date_range: {
    financial_report: 'What period should I calculate savings for?',
    performance_audit: 'What date range should I compare?',
    morning_briefing: 'What time period should I summarize?',
    free_chat: 'What time period should I analyze?',
  },
};

/**
 * System prompt for narrative generation.
 * Combines agent identity with operational rules.
 */
export const NARRATIVE_SYSTEM_PROMPT = `${AGENT_IDENTITY}

${STYLE_RULES}

${UNCERTAINTY_HANDLING}

OPERATIONAL RULES:
1. Never mention tools, APIs, JSON, or technical internals
2. Never say "I'm about to show" or "Here's a chart" - visualizations appear automatically
3. For recurrent issues, mention this is a pattern without being repetitive
4. Focus on what matters to the user: performance, savings, and actions

PERFORMANCE COMPARISON GUIDANCE (for comparison branches):
When comparing multiple loggers/inverters:
- Adopt a calm, analytical, consultative voice
- Structure: Impression → Standout → Variation Insight → Optional Suggestion
- Never mention charts, graphs, or UI elements
- Express variation as actionable insight (e.g., "worth investigating" vs just stating numbers)
- Frame underperformance neutrally - focus on optimization opportunity, not blame

OUTPUT FORMAT:
- Generate ONLY the narrative text, nothing else
- No markdown formatting, no bullet points
- No placeholders like [Chart] or [Visualization]
- Natural flowing sentences appropriate for spoken conversation`;

/**
 * Tone modifiers for prompt customization.
 */
const TONE_MODIFIERS: Record<NarrativeTone, string> = {
  casual: `Use a friendly, conversational tone. Use contractions (it's, you're, that's).
Include occasional encouragement like "Great news!" or "Looking good!".`,
  professional: `Use a clear, measured tone. Be factual without being cold.
Avoid excessive enthusiasm but remain approachable.`,
  technical: `Include specific numbers and percentages where relevant.
Use technical terms appropriate for solar industry professionals.`,
};

/**
 * Verbosity modifiers for prompt customization.
 */
const VERBOSITY_MODIFIERS: Record<NarrativeVerbosity, string> = {
  brief: `Keep it to 1-2 sentences maximum. Headline style - just the key point.`,
  standard: `Use 2-3 sentences. Balance between context and brevity.`,
  detailed: `Use 3-5 sentences. Provide full context, implications, and reasoning.`,
};

/**
 * Persona modifiers for prompt customization.
 */
const PERSONA_MODIFIERS: Record<NarrativePersona, string> = {
  advisor: `Frame insights as proactive recommendations.
Suggest what to do next based on the findings.`,
  analyst: `Focus on data comparisons and trends.
Emphasize metrics and performance benchmarks.`,
  helper: `Focus on tasks and actions the user can take.
Keep language simple and action-oriented.`,
};

/**
 * Branch-specific prompt templates.
 * Each template receives facts and produces tailored narrative.
 */
export const BRANCH_PROMPTS: Record<NarrativeBranch, string> = {
  healthy_all_clear: `Generate a positive message about excellent system performance.

FACTS:
{{facts}}

The system is performing excellently with no issues. Celebrate this while being genuine.
Mention the key metric (health score or energy production) naturally.`,

  healthy_minor_notes: `Generate a balanced message about good system performance with minor observations.

FACTS:
{{facts}}

The system is healthy overall but there are minor observations worth noting.
Acknowledge the good performance while mentioning any observations briefly.`,

  warning_single_anomaly: `Generate a balanced message about a detected issue.

FACTS:
{{facts}}

One anomaly was detected but it's not critical. Be informative without causing alarm.
Describe the issue and naturally suggest what the user might want to do next.`,

  warning_multiple_anomalies: `Generate a message about multiple detected issues.

FACTS:
{{facts}}

Several issues were detected that deserve attention. Prioritize the most important finding.
Be direct about what was found without being alarming. Guide toward next steps.`,

  critical_high_severity: `Generate an urgent but calm message about a critical issue.

FACTS:
{{facts}}

A high-severity issue requires attention. Be direct about the severity while staying calm.
Clearly indicate this needs investigation and suggest immediate next steps.`,

  critical_fleet_wide: `Generate a message about fleet-wide issues affecting multiple devices.

FACTS:
{{facts}}

Multiple devices across the fleet are affected. Summarize the scope systematically.
This may indicate a common cause - suggest systematic investigation.`,

  data_incomplete: `Generate a helpful message when data is limited or missing.

FACTS:
{{facts}}

The requested data is incomplete or partially unavailable. Explain this naturally.
Focus on what information IS available and offer alternatives for getting more data.`,

  data_stale: `Generate a message explaining data is from an unexpected time window.

FACTS:
{{facts}}

The data available is from a different time period than expected. Clarify this clearly.
Explain the actual date range available and why this might be the case.`,

  recurrent_issue: `Generate a message about a recurring pattern or issue.

FACTS:
{{facts}}

This issue has been seen before - it's a pattern. Note this is recurring without being repetitive.
Since it's a pattern, suggest investigating the root cause.`,

  trend_degrading: `Generate a message about declining performance over time.

FACTS:
{{facts}}

Performance has been trending downward. Highlight this trend objectively.
Suggest proactive action before the situation worsens.`,

  comparison_consistent: `Generate a positive message about consistent performance across loggers.

FACTS:
{{facts}}

All loggers are performing within a tight range (< 10% variation). This is excellent fleet health.
Structure: Brief impression → Highlight best performer → Affirm consistency → Optional optimization suggestion.

EXEMPLAR OUTPUT 1:
"Your 3 inverters are running neck-and-neck! SN-1234 edges ahead slightly with 4.2 kW average, but all units are performing within 8% of each other—exactly what you want to see in a healthy system."

EXEMPLAR OUTPUT 2:
"Great news—your fleet shows remarkably consistent output. Unit A leads at 5.1 kW average, with the others trailing by less than 5%. This tight grouping suggests well-matched installations and optimal conditions across all sites."`,

  comparison_moderate: `Generate a balanced message about moderate performance variation.

FACTS:
{{facts}}

Loggers show noticeable variation (10-30% spread). Worth investigating but not alarming.
Structure: Neutral observation → Identify best and weakest → Frame gap as optimization opportunity → Suggest next step.

EXEMPLAR OUTPUT 1:
"Comparing your 4 inverters reveals some variation worth exploring. INV-5678 leads at 6.8 kW average, while INV-9012 sits 18% lower at 5.6 kW. This gap could point to shading, orientation differences, or maintenance needs."

EXEMPLAR OUTPUT 2:
"Your inverters show moderate spread in output. The top performer averages 3.9 kW, outpacing the lowest by 22%. Not critical, but investigating the lower units might reveal tuning opportunities."`,

  comparison_significant: `Generate a direct message about large performance gaps requiring attention.

FACTS:
{{facts}}

Loggers show significant variation (> 30% spread). Requires investigation.
Structure: Clear statement of gap → Quantify difference → Suggest likely causes → Recommend action.

EXEMPLAR OUTPUT 1:
"There's a notable gap in your fleet performance. Logger X is your star at 7.2 kW average, while Logger Z trails at just 4.5 kW—a 38% shortfall. This size of difference often indicates equipment issues, heavy shading, or connectivity problems worth diagnosing."

EXEMPLAR OUTPUT 2:
"Your comparison reveals a significant performance imbalance. Unit A produces 5.8 kW on average, but Unit C lags at 3.6 kW—nearly 40% less. Gaps this large typically signal maintenance needs, panel soiling, or inverter faults that deserve immediate attention."`,
};

/**
 * Build the complete prompt for narrative generation.
 * Uses layered approach: branch template → severity tone → temporal context → preferences
 *
 * @param branch - Selected narrative branch
 * @param facts - Structured facts to include
 * @param preferences - User narrative preferences
 * @param options - Optional severity and temporal context
 * @returns Complete prompt string
 */
export function buildNarrativePrompt(
  branch: NarrativeBranch,
  facts: string,
  preferences: NarrativePreferences,
  options?: NarrativePromptOptions,
): string {
  const branchTemplate = BRANCH_PROMPTS[branch];
  const toneModifier = TONE_MODIFIERS[preferences.tone];
  const verbosityModifier = VERBOSITY_MODIFIERS[preferences.verbosity];
  const personaModifier = PERSONA_MODIFIERS[preferences.persona];

  const populatedTemplate = branchTemplate.replace('{{facts}}', facts);

  const layers: string[] = [populatedTemplate];

  // Add severity tone hint if provided
  if (options?.severityBand) {
    layers.push(SEVERITY_TONE_HINTS[options.severityBand]);
  }

  // Add temporal comparison hint if available
  if (options?.temporalContext) {
    const deltaPhrase = generateDeltaPhrase(options.temporalContext);
    if (deltaPhrase) {
      layers.push(
        `TEMPORAL COMPARISON: Include a comparison to previous status. Use: "${deltaPhrase}"`,
      );
    }
  }

  // Add preference modifiers
  layers.push(`TONE: ${toneModifier}`);
  layers.push(`LENGTH: ${verbosityModifier}`);
  layers.push(`PERSPECTIVE: ${personaModifier}`);

  // Add examples if requested
  if (options?.includeExamples) {
    const examples = formatExamplesForBranch(branch);
    if (examples) {
      layers.push(examples);
    }
  }

  return layers.join('\n\n');
}

/**
 * Build a refinement prompt when output doesn't match preferences.
 *
 * @param narrative - Original narrative to refine
 * @param issue - What needs to be fixed
 * @param preferences - Target preferences
 * @returns Refinement prompt
 */
export function buildRefinementPrompt(
  narrative: string,
  issue: 'too_long' | 'too_short' | 'wrong_tone',
  preferences: NarrativePreferences,
): string {
  const issueInstructions: Record<typeof issue, string> = {
    too_long: `Condense this narrative while preserving the key facts and tone.
Target: ${VERBOSITY_MODIFIERS[preferences.verbosity]}`,
    too_short: `Expand this narrative with more context while maintaining the tone.
Target: ${VERBOSITY_MODIFIERS[preferences.verbosity]}`,
    wrong_tone: `Adjust the tone of this narrative.
Target: ${TONE_MODIFIERS[preferences.tone]}`,
  };

  return `Refine the following narrative:

"${narrative}"

INSTRUCTION: ${issueInstructions[issue]}

OUTPUT FORMAT: Only the refined narrative text, no explanations.`;
}

/**
 * Generate fallback narratives when LLM fails.
 * Enhanced with severity awareness and temporal context.
 *
 * @param branch - Selected narrative branch
 * @param facts - Facts about the current state
 * @param severityBand - Optional severity band for tone adjustment
 * @param temporalContext - Optional temporal context for delta phrases
 */
export function generateFallbackNarrative(
  branch: NarrativeBranch,
  facts: Record<string, unknown>,
  severityBand?: SeverityBand,
  temporalContext?: TemporalContext,
): string {
  const subject = (facts.subject as string) || 'your system';
  const healthScore = (facts.healthScore as number) || 100;
  const anomalyCount = (facts.anomalyCount as number) || 0;
  const period = (facts.period as string) || 'the past 7 days';
  const flowType = facts.flowType as string | undefined;

  // Flow-specific enhanced fallbacks
  if (flowType === 'morning_briefing') {
    return generateMorningBriefingFallback(
      facts,
      severityBand,
      temporalContext,
    );
  }

  if (flowType === 'financial_report') {
    return generateFinancialFallback(facts);
  }

  if (flowType === 'performance_audit') {
    return generatePerformanceAuditFallback(facts);
  }

  if (flowType === 'health_check') {
    return generateHealthCheckFallback(facts, severityBand);
  }

  // Generic branch-based fallbacks (enhanced)
  return generateGenericBranchFallback(
    branch,
    subject,
    healthScore,
    anomalyCount,
    period,
  );
}

/**
 * Generate severity-aware fallback for morning briefing.
 */
function generateMorningBriefingFallback(
  facts: Record<string, unknown>,
  severityBand?: SeverityBand,
  temporalContext?: TemporalContext,
): string {
  const deviceCount = (facts.deviceCount as number) || 0;
  const onlineCount = (facts.onlineCount as number) || 0;
  const percentOnline = (facts.percentOnline as number) || 100;

  // Calculate severity if not provided
  const severity = severityBand || calculateSeverityBand(percentOnline);

  // Add temporal comparison if available
  const deltaPhrase = temporalContext
    ? generateDeltaPhrase(temporalContext)
    : undefined;
  const deltaText = deltaPhrase ? `, ${deltaPhrase}` : '';

  switch (severity) {
    case 'excellent':
      return `Great news - all ${deviceCount} devices are online and running smoothly${deltaText}!`;

    case 'good':
      return `Your fleet is looking good with ${onlineCount} of ${deviceCount} devices online (${percentOnline.toFixed(0)}%)${deltaText}.`;

    case 'attention':
      return `Most of your fleet is operational - ${onlineCount}/${deviceCount} devices online (${percentOnline.toFixed(0)}%)${deltaText}. A few need attention.`;

    case 'concern':
      return `Several devices need attention - only ${onlineCount} of ${deviceCount} are currently online (${percentOnline.toFixed(0)}%)${deltaText}.`;

    case 'urgent':
      return `Your fleet has significant issues - only ${onlineCount}/${deviceCount} devices online (${percentOnline.toFixed(0)}%)${deltaText}. This needs immediate attention.`;

    default:
      return `Fleet status: ${onlineCount}/${deviceCount} devices online (${percentOnline.toFixed(0)}%)${deltaText}.`;
  }
}

/**
 * Generate fallback for financial report.
 */
function generateFinancialFallback(facts: Record<string, unknown>): string {
  const energyGenerated = (facts.energyGenerated as number) || 0;
  const savings = (facts.savings as number) || 0;
  const co2Offset = (facts.co2Offset as number) || 0;
  const period = (facts.period as string) || 'the analysis period';

  if (energyGenerated === 0 && savings === 0) {
    return `I couldn't calculate savings for this period. This might mean there's no production data available for ${period}.`;
  }

  return `Your solar system generated ${energyGenerated.toFixed(1)} kWh during ${period}, saving you $${savings.toFixed(2)} and offsetting ${co2Offset.toFixed(1)} kg of CO2.`;
}

/**
 * Generate fallback for performance audit.
 */
function generatePerformanceAuditFallback(
  facts: Record<string, unknown>,
): string {
  const loggerIds = facts.loggerIds as string[] | undefined;
  const loggerCount = loggerIds?.length || 2;
  const spreadPercent = (facts.spreadPercent as number) || 0;
  const bestPerformer = facts.bestPerformer as
    | { loggerId: string; average: number }
    | undefined;
  const worstPerformer = facts.worstPerformer as
    | { loggerId: string; average: number }
    | undefined;

  if (spreadPercent < 10) {
    return `Your ${loggerCount} inverters are running neck-and-neck with less than ${spreadPercent.toFixed(0)}% variation - exactly what you want to see!`;
  } else if (spreadPercent < 30 && bestPerformer && worstPerformer) {
    return `Your ${loggerCount} inverters show some variation worth exploring. ${bestPerformer.loggerId} leads at ${bestPerformer.average.toFixed(1)}W average, while ${worstPerformer.loggerId} trails by ${spreadPercent.toFixed(0)}%.`;
  } else if (bestPerformer && worstPerformer) {
    return `There's a notable gap in your fleet. ${bestPerformer.loggerId} outperforms ${worstPerformer.loggerId} by ${spreadPercent.toFixed(0)}% - worth investigating.`;
  }

  return `Comparing power output across ${loggerCount} devices. Check the comparison to see how each one performed.`;
}

/**
 * Generate severity-aware fallback for health check.
 */
function generateHealthCheckFallback(
  facts: Record<string, unknown>,
  severityBand?: SeverityBand,
): string {
  const healthScore = (facts.healthScore as number) || 100;
  const anomalyCount = (facts.anomalyCount as number) || 0;
  const subject = (facts.subject as string) || 'Your system';

  // Use severity band if provided for tone adjustment
  const severity = severityBand || calculateHealthSeverityBand(healthScore);

  if (anomalyCount === 0 && (healthScore >= 95 || severity === 'excellent')) {
    return `${subject} is in excellent health with a ${healthScore.toFixed(0)}% score. No issues detected!`;
  }

  if (anomalyCount === 1) {
    return `${subject} has a health score of ${healthScore.toFixed(0)}%. One issue was detected that may need attention.`;
  }

  if (anomalyCount > 1) {
    return `${subject} has a health score of ${healthScore.toFixed(0)}%. ${anomalyCount} issues were detected during the analysis period.`;
  }

  return `${subject} has a health score of ${healthScore.toFixed(0)}%.`;
}

/**
 * Generate generic branch-based fallback.
 */
function generateGenericBranchFallback(
  branch: NarrativeBranch,
  subject: string,
  healthScore: number,
  anomalyCount: number,
  period: string,
): string {
  const fallbacks: Record<NarrativeBranch, string> = {
    healthy_all_clear: `Great news - ${subject} is performing excellently with a ${healthScore.toFixed(0)}% health score!`,

    healthy_minor_notes: `${subject} is healthy overall with a ${healthScore.toFixed(0)}% score. A few minor observations were noted but nothing requiring action.`,

    warning_single_anomaly: `${subject} is mostly healthy, but one issue was detected during ${period} that deserves attention.`,

    warning_multiple_anomalies: `${subject} has ${anomalyCount} issues that need attention. Health score: ${healthScore.toFixed(0)}%.`,

    critical_high_severity: `${subject} has a high-severity issue that needs immediate attention. Health score: ${healthScore.toFixed(0)}%.`,

    critical_fleet_wide: `Multiple devices in your fleet are experiencing issues. ${anomalyCount} problems detected across the fleet.`,

    data_incomplete: `I only have partial data for ${subject}. The analysis may not reflect the complete picture.`,

    data_stale: `The data shown for ${subject} is from an earlier time period than requested.`,

    recurrent_issue: `This looks familiar - ${subject} has a recurring issue that was seen before. This pattern may indicate something systematic.`,

    trend_degrading: `${subject} is showing declining performance over time. Proactive investigation is recommended.`,

    comparison_consistent: `Your inverters are performing consistently with minimal variation - a healthy fleet!`,

    comparison_moderate: `Your inverters show moderate variation in output. Some units may benefit from inspection.`,

    comparison_significant: `Significant performance gap detected between your inverters. Investigation recommended.`,
  };

  return fallbacks[branch];
}
