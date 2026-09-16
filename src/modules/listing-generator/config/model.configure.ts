/**
 * Single source of truth for every Gemini model/generation setting used by the
 * listing-generator module. Change the model, sampling parameters, or timeout
 * here - nothing else in this module should read process.env directly.
 */

export interface GeminiModelConfig {
  /** From GEMINI_API_KEY - set it in .env, never commit a real value. */
  apiKey: string;
  /** Gemini model id. Override via GEMINI_MODEL without touching code. */
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
  /** Request timeout in ms - a stuck Gemini call must never hang a replay. */
  timeoutMs: number;
}

export const GEMINI_MODEL_CONFIG: GeminiModelConfig = {
  apiKey: process.env.GEMINI_API_KEY ?? '',
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
  temperature: 0.9,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 1024,
  timeoutMs: 15000,
};
