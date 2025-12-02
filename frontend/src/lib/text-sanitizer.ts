/**
 * Sanitizes LLM output by removing special tokens and raw function call syntax.
 *
 * This prevents internal LLM tokens (like Ollama's tool-calling markers) from
 * being displayed to end users.
 */

/**
 * Remove special LLM tokens and raw function call syntax from text.
 *
 * Filters out:
 * - Special tokens: <|python_tag|>, <|eot_id|>, <|start_header_id|>...<|end_header_id|>
 * - Raw function calls: function_name(args) on their own lines
 * - Empty markdown code blocks
 *
 * @param text - Raw text from LLM output
 * @returns Sanitized text safe for display to users
 */
export function sanitizeLLMOutput(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const sanitized = text
    // Remove Ollama special tokens
    .replace(/<\|python_tag\|>/g, '')
    .replace(/<\|eot_id\|>/g, '')
    .replace(/<\|end_of_text\|>/g, '')
    .replace(/<\|start_header_id\|>.*?<\|end_header_id\|>/gs, '')

    // Remove other common LLM special tokens
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')

    // Remove raw function calls that appear on their own lines
    // Matches: function_name(args) or function_name()
    .replace(/^\s*\w+\([^)]*\)\s*$/gm, '')

    // Remove empty markdown code blocks
    .replace(/```\s*```/g, '')
    .replace(/```\w*\s*```/g, '')

    // Clean up excessive whitespace (but preserve intentional spacing)
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive newlines
    .trim();

  return sanitized;
}

/**
 * Check if a text chunk contains only special tokens or function calls.
 * Used to filter out chunks entirely rather than displaying empty content.
 *
 * @param text - Text chunk to check
 * @returns true if text is only special tokens/noise
 */
export function isNoiseOnlyText(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return true;
  }

  const sanitized = sanitizeLLMOutput(text);
  return sanitized.trim().length === 0;
}
