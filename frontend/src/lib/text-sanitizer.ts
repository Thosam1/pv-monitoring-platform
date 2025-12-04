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

  // Handle case where an object was accidentally converted to string
  if (text === '[object Object]') {
    return '';
  }

  const sanitized = text
    // Remove raw JSON objects that look like tool call args
    // These appear when LLM outputs tool args as text instead of proper tool calls
    .replaceAll(/\{\s*"prompt"\s*:\s*"[^"]*"\s*,\s*"options"\s*:\s*\[[\s\S]*?\]\s*,\s*"selectionType"\s*:\s*"[^"]*"[^}]*\}/g, '')
    // Remove Ollama special tokens
    .replaceAll('<|python_tag|>', '')
    .replaceAll('<|eot_id|>', '')
    .replaceAll('<|end_of_text|>', '')
    .replaceAll(/<\|start_header_id\|>.*?<\|end_header_id\|>/gs, '')

    // Remove other common LLM special tokens
    .replaceAll('<|im_start|>', '')
    .replaceAll('<|im_end|>', '')
    .replaceAll('<|endoftext|>', '')

    // Remove Python code blocks with function definitions
    // Matches: ```python\nimport...\ndef...\n```
    .replaceAll(/```python\s+(?:import\s+|from\s+|def\s+|class\s+)[\s\S]*?```/g, '')
    .replaceAll(/```\s+(?:import\s+|from\s+|def\s+|class\s+)[\s\S]*?```/g, '')

    // Remove inline Python import statements (simplified regex)
    .replaceAll(/^import\s+\w+[\w.]*$/gm, '')
    .replaceAll(/^from\s+\w+[\w.]*\s+import\s+[\w,\s]+$/gm, '')
    // Remove Python def/class declarations (simplified regex)
    .replaceAll(/^def\s+\w+\([^)]*\):.*$/gm, '')
    .replaceAll(/^class\s+\w+\([^)]*\):.*$/gm, '')

    // Remove system prompt headers and sections
    .replaceAll(/^#+\s*(?:Tool Selection|Output Formatting|Input Processing|Response Generation|Error Handling)\s+Rules?\s*$/gm, '')
    .replaceAll(/^#+\s*(?:System|Instructions|Guidelines|Context|Prompt)\s*$/gm, '')

    // Remove common system prompt instruction patterns
    .replaceAll(/^You are (?:a|an)\s+.+$/gm, '')
    .replaceAll(/^Your task is to\s+.+$/gm, '')
    .replaceAll(/^When responding,?\s+(?:you should|always|never)\s+.+$/gm, '')
    .replaceAll(/^Follow these steps:\s*$/gm, '')
    .replaceAll(/^Important:\s+(?:Always|Never|Do not)\s+.+$/gm, '')

    // Remove raw output markers and execution traces
    .replaceAll(/^Output:\s*["'][\s\S]*?["']\s*$/gm, '')
    .replaceAll(/^Result:\s*["'][\s\S]*?["']\s*$/gm, '')
    .replaceAll(/^Executing:\s+.+$/gm, '')
    .replaceAll(/^Calling function:\s+.+$/gm, '')

    // Remove numbered instruction lists that look like system prompts
    .replaceAll(/^\d+\.\s+(?:Always|Never|Do not|Ensure|Remember)\s+.+$/gm, '')

    // Remove raw function calls that appear on their own lines
    // Matches: function_name(args) or function_name()
    .replaceAll(/^\s*\w+\([^)]*\)\s*$/gm, '')

    // Remove raw tool/function names in parentheses (leaked from LLM)
    // These appear when the LLM mentions a tool name instead of calling it
    .replaceAll('(render_ui_component)', '')
    .replaceAll('(request_user_selection)', '')
    .replaceAll('(list_loggers)', '')
    .replaceAll('(analyze_inverter_health)', '')
    .replaceAll('(get_power_curve)', '')
    .replaceAll('(compare_loggers)', '')
    .replaceAll('(calculate_financial_savings)', '')
    .replaceAll('(calculate_performance_ratio)', '')
    .replaceAll('(forecast_production)', '')
    .replaceAll('(diagnose_error_codes)', '')
    .replaceAll('(get_fleet_overview)', '')
    .replaceAll('(health_check)', '')

    // Remove internal prompt structure labels that leak from LLM output
    // Handles both plain and markdown bold versions (e.g., "Opening:" and "**Opening**:")
    .replaceAll(/^\*{0,2}Opening\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Insight\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Next Step\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Note\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Visualization\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Action\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Summary\*{0,2}:\s*/gm, '')
    .replaceAll(/^\*{0,2}Conclusion\*{0,2}:\s*/gm, '')

    // Remove visualization placeholder text patterns
    // These occur when the LLM describes rendering instead of actually rendering
    .replaceAll(/Visualizing (?:the )?data\.{0,3}/gi, '')
    .replaceAll(/\(?I(?:'m| am) rendering[^.]*\.?\)?/gi, '')
    .replaceAll(/(?:The )?chart (?:will be|is being|is) (?:rendered|displayed|shown)[^.]*\.?/gi, '')
    .replaceAll(/\(?(?:I'm |I am )?showing (?:you )?(?:a |the )?(?:chart|visualization|graph)[^.]*\.?\)?/gi, '')
    .replaceAll(/Let me (?:show|visualize|render|display)[^.]*\.?/gi, '')
    .replaceAll(/(?:Here(?:'s| is) |Below is )(?:a |the )?(?:chart|visualization|graph)[^.]*\.?/gi, '')
    .replaceAll(/\[Chart[^\]]*\]/gi, '')
    .replaceAll(/\[Visualiz[^\]]*\]/gi, '')
    .replaceAll(/\((?:Chart|Visualization|Graph)[^)]*\)/gi, '')

    // Remove empty markdown code blocks
    .replaceAll(/```\s*```/g, '')
    .replaceAll(/```\w*\s*```/g, '')

    // Clean up excessive whitespace (but preserve intentional spacing)
    .replaceAll(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive newlines
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
