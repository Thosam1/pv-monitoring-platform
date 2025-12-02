import { describe, it, expect } from 'vitest';
import { sanitizeLLMOutput, isNoiseOnlyText } from './text-sanitizer';

describe('sanitizeLLMOutput', () => {
  it('should remove Ollama python_tag token', () => {
    const input = '<|python_tag|>analyze_inverter_health(logger_id="925")';
    const result = sanitizeLLMOutput(input);
    expect(result).not.toContain('<|python_tag|>');
    expect(result).not.toContain('analyze_inverter_health');
  });

  it('should remove eot_id token', () => {
    const input = 'Here is the result<|eot_id|>';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('Here is the result');
  });

  it('should remove end_of_text token', () => {
    const input = 'Analysis complete<|end_of_text|>';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('Analysis complete');
  });

  it('should remove start_header_id/end_header_id blocks', () => {
    const input = '<|start_header_id|>system<|end_header_id|>You are an assistant';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('You are an assistant');
  });

  it('should remove im_start and im_end tokens', () => {
    const input = '<|im_start|>assistant<|im_end|>Hello';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('assistantHello');
  });

  it('should remove raw function calls on their own lines', () => {
    const input = 'Analyzing health...\nanalyze_inverter_health(logger_id="925")\nResults show anomalies.';
    const result = sanitizeLLMOutput(input);
    expect(result).not.toContain('analyze_inverter_health');
    expect(result).toContain('Analyzing health...');
    expect(result).toContain('Results show anomalies.');
  });

  it('should remove empty markdown code blocks', () => {
    const input = 'Text before``` ```text after';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('Text beforetext after');
  });

  it('should clean up excessive newlines', () => {
    const input = 'Line 1\n\n\n\nLine 2';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('Line 1\n\nLine 2');
  });

  it('should preserve legitimate text content', () => {
    const input = 'The system generated 45.2 kWh today. Performance ratio is 87%.';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('The system generated 45.2 kWh today. Performance ratio is 87%.');
  });

  it('should handle mixed content with tokens and text', () => {
    const input = '<|python_tag|>list_loggers()\n\nHere are your inverters:\n- Logger 925\n- Logger 942';
    const result = sanitizeLLMOutput(input);
    expect(result).not.toContain('<|python_tag|>');
    expect(result).not.toContain('list_loggers');
    expect(result).toContain('Here are your inverters:');
    expect(result).toContain('Logger 925');
  });

  it('should return empty string for null/undefined input', () => {
    expect(sanitizeLLMOutput(null as unknown as string)).toBe('');
    expect(sanitizeLLMOutput(undefined as unknown as string)).toBe('');
  });

  it('should handle non-string input gracefully', () => {
    expect(sanitizeLLMOutput(123 as unknown as string)).toBe('');
    expect(sanitizeLLMOutput({} as unknown as string)).toBe('');
  });

  it('should trim whitespace from result', () => {
    const input = '   Text with spaces   ';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('Text with spaces');
  });

  it('should preserve inline function references in sentences', () => {
    const input = 'I will use the get_power_curve() function to retrieve data.';
    const result = sanitizeLLMOutput(input);
    // This should be preserved because it's inline, not on its own line
    expect(result).toContain('get_power_curve()');
  });

  it('should handle multiple special tokens in one string', () => {
    const input = '<|python_tag|>tool_call()<|eot_id|><|end_of_text|>';
    const result = sanitizeLLMOutput(input);
    expect(result).toBe('');
  });
});

describe('isNoiseOnlyText', () => {
  it('should return true for text with only special tokens', () => {
    const input = '<|python_tag|><|eot_id|>';
    expect(isNoiseOnlyText(input)).toBe(true);
  });

  it('should return true for text with only function calls', () => {
    const input = 'analyze_health(id="925")';
    expect(isNoiseOnlyText(input)).toBe(true);
  });

  it('should return false for text with real content', () => {
    const input = 'The inverter generated 45.2 kWh today.';
    expect(isNoiseOnlyText(input)).toBe(false);
  });

  it('should return true for empty or whitespace-only strings', () => {
    expect(isNoiseOnlyText('')).toBe(true);
    expect(isNoiseOnlyText('   ')).toBe(true);
    expect(isNoiseOnlyText('\n\n')).toBe(true);
  });

  it('should return true for null/undefined', () => {
    expect(isNoiseOnlyText(null as unknown as string)).toBe(true);
    expect(isNoiseOnlyText(undefined as unknown as string)).toBe(true);
  });

  it('should return false for mixed content with real text', () => {
    const input = '<|python_tag|>Analyzing your solar data...';
    expect(isNoiseOnlyText(input)).toBe(false);
  });
});
