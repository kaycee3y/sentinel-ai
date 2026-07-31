/**
 * AI Provider abstraction agents call this interface, never an SDK directly.
 * This is what lets us swap or add AI providers without touching agent code.
 */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
}

export interface AICompletionResult {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  readonly name: string;

  complete(
    messages: AIMessage[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult>;
}

export interface AIProviderRegistry {
  get(name?: string): AIProvider;
  register(provider: AIProvider, opts?: { asDefault?: boolean }): void;
}