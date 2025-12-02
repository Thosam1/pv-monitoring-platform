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
 * - Python code blocks (full function definitions with import, def, class)
 * - System prompt fragments (# Tool Selection Rules, # Output Formatting Rules)
 * - Raw output markers (Output: "...)
 * - Internal LLM reasoning patterns
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

    // Remove Python code blocks with function definitions
    // Matches: ```python\nimport...\ndef...\n```
    .replace(/```python\s+(?:import\s+|from\s+|def\s+|class\s+)[\s\S]*?```/g, '')
    .replace(/```\s+(?:import\s+|from\s+|def\s+|class\s+)[\s\S]*?```/g, '')

    // Remove inline Python code patterns (import, def, class keywords)
    .replace(/(?:^|\n)(?:import|from)\s+\w+(?:\.\w+)*(?:\s+import\s+\w+(?:,\s*\w+)*)?[\s\S]*?(?=\n\n|\n#|\n[A-Z]|$)/g, '')
    .replace(/(?:^|\n)(?:def|class)\s+\w+\s*\([^)]*\)[\s\S]*?(?=\n\n|\n#|\n[A-Z]|$)/g, '')

    // Remove system prompt headers and sections
    .replace(/^#+\s*(?:Tool Selection|Output Formatting|Input Processing|Response Generation|Error Handling)\s+Rules?\s*$/gm, '')
    .replace(/^#+\s*(?:System|Instructions|Guidelines|Context|Prompt)\s*$/gm, '')

    // Remove common system prompt instruction patterns
    .replace(/^You are (?:a|an)\s+.+$/gm, '')
    .replace(/^Your task is to\s+.+$/gm, '')
    .replace(/^When responding,?\s+(?:you should|always|never)\s+.+$/gm, '')
    .replace(/^Follow these steps:\s*$/gm, '')
    .replace(/^Important:\s+(?:Always|Never|Do not)\s+.+$/gm, '')

    // Remove raw output markers and execution traces
    .replace(/^Output:\s*["'][\s\S]*?["']\s*$/gm, '')
    .replace(/^Result:\s*["'][\s\S]*?["']\s*$/gm, '')
    .replace(/^Executing:\s+.+$/gm, '')
    .replace(/^Calling function:\s+.+$/gm, '')

    // Remove numbered instruction lists that look like system prompts
    .replace(/^\d+\.\s+(?:Always|Never|Do not|Ensure|Remember)\s+.+$/gm, '')

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
