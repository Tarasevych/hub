// Compatibiliteitslaag voor de vroegere AppDeploy `ai`-API.
// Fase A: AI is UITGESCHAKELD. Elke aanroep gooit een duidelijke fout `AI_NOT_CONFIGURED`
// (met statusCode/responseText zoals een AppDeploy-RPC-fout), zodat de aanroepers hun
// bestaande foutpad volgen: cloud gebruikt de ingebouwde deterministische fallback,
// vertalen en handschrift-OCR geven een nette 503 terug.
// Later: een provider kiezen via AI_PROVIDER/AI_API_KEY en hier implementeren.
export class AiNotConfiguredError extends Error {
  readonly code = 'AI_NOT_CONFIGURED';
  readonly statusCode = 503;
  readonly responseText = 'AI_NOT_CONFIGURED';
  constructor() {
    super('AI_NOT_CONFIGURED');
    this.name = 'AiNotConfiguredError';
  }
}

export const aiConfigured = () => false;

const notConfigured = async (_options?: unknown): Promise<never> => {
  throw new AiNotConfiguredError();
};

export const ai = {
  extract: notConfigured as (options: Record<string, unknown>) => Promise<{ data: unknown; text: string; attempts: number }>,
  ocr: notConfigured as (options: Record<string, unknown>) => Promise<{ text: string; data?: unknown; attempts: number }>,
  generate: notConfigured as (options: Record<string, unknown>) => Promise<{ text: string }>,
};
