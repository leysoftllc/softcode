import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ConversationMessage } from './contextBuilder';

export type ModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-8';

export const MODELS: Record<ModelId, { label: string; description: string }> = {
    'claude-haiku-4-5':  { label: 'Haiku',  description: 'Fast & affordable'   },
    'claude-sonnet-4-6': { label: 'Sonnet', description: 'Balanced · default'  },
    'claude-opus-4-8':   { label: 'Opus',   description: 'Most capable'        },
};

export interface StreamCallbacks {
    onText:     (text: string) => void;
    onComplete: (inputTokens: number, outputTokens: number) => void;
    onError:    (error: string) => void;
}

export class ClaudeClient {
    private client: Anthropic | null = null;

    setApiKey(apiKey: string): void {
        this.client = new Anthropic({ apiKey });
    }

    isConfigured(): boolean {
        return this.client !== null;
    }

    async streamMessage(
        model: ModelId,
        system: string,
        messages: ConversationMessage[],
        callbacks: StreamCallbacks,
        maxTokens = 4096,
        signal?: AbortSignal,
    ): Promise<void> {
        if (!this.client) {
            callbacks.onError(
                'API key not configured. Run the command "SoftCode AI: Configure API Key" to get started.',
            );
            return;
        }

        try {
            const stream = this.client.messages.stream({
                model,
                max_tokens: maxTokens,
                system,
                messages: messages.map((m): MessageParam => ({ role: m.role, content: m.content })),
            }, { signal });

            for await (const chunk of stream) {
                if (
                    chunk.type === 'content_block_delta' &&
                    chunk.delta.type === 'text_delta'
                ) {
                    callbacks.onText(chunk.delta.text);
                }
            }

            const final = await stream.finalMessage();
            callbacks.onComplete(
                final.usage.input_tokens,
                final.usage.output_tokens,
            );
        } catch (err: unknown) {
            if (signal?.aborted) {
                return;
            }
            const message =
                err instanceof Error ? err.message : 'Unknown error communicating with Claude API';
            callbacks.onError(message);
        }
    }
}
