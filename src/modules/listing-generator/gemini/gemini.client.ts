import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI, Schema } from '@google/genai';
import { GEMINI_MODEL_CONFIG } from '../config/model.configure';

/**
 * Thin wrapper around the Gemini SDK: one method, structured JSON in and out.
 * Every model/generation setting lives in model.configure.ts, not here.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly client: GoogleGenAI;

  constructor() {
    if (!GEMINI_MODEL_CONFIG.apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set - listing generation will fail until it is configured in .env',
      );
    }
    this.client = new GoogleGenAI({ apiKey: GEMINI_MODEL_CONFIG.apiKey });
  }

  async generateJson<T>(prompt: string, responseSchema: Schema): Promise<T> {
    try {
      const response = await this.client.models.generateContent({
        model: GEMINI_MODEL_CONFIG.model,
        contents: prompt,
        config: {
          temperature: GEMINI_MODEL_CONFIG.temperature,
          topP: GEMINI_MODEL_CONFIG.topP,
          topK: GEMINI_MODEL_CONFIG.topK,
          maxOutputTokens: GEMINI_MODEL_CONFIG.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema,
          httpOptions: { timeout: GEMINI_MODEL_CONFIG.timeoutMs },
        },
      });

      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response');
      return JSON.parse(text) as T;
    } catch (error) {
      this.logger.error(
        'Gemini generateContent failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Listing field generation is temporarily unavailable',
      );
    }
  }
}
