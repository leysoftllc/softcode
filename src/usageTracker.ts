import * as vscode from 'vscode';

export interface UsageRecord {
    timestamp: number;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
}

/** Pricing per 1 million tokens (USD). Update as Anthropic adjusts pricing. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5':  { input: 1.00, output: 5.00  },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-opus-4-8':   { input: 5.00, output: 25.00 },
};

const DEFAULT_PRICING = { input: 3.00, output: 15.00 };
const MAX_STORED_RECORDS = 1000;
const STATE_KEY = 'softcode.usageRecords';

export class UsageTracker {
    private records: UsageRecord[];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.records = context.globalState.get<UsageRecord[]>(STATE_KEY, []);
    }

    track(model: string, inputTokens: number, outputTokens: number): UsageRecord {
        const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
        const estimatedCostUsd =
            (inputTokens  / 1_000_000) * pricing.input +
            (outputTokens / 1_000_000) * pricing.output;

        const record: UsageRecord = {
            timestamp: Date.now(),
            model,
            inputTokens,
            outputTokens,
            estimatedCostUsd,
        };

        this.records.push(record);

        if (this.records.length > MAX_STORED_RECORDS) {
            this.records = this.records.slice(-MAX_STORED_RECORDS);
        }

        void this.context.globalState.update(STATE_KEY, this.records);
        return record;
    }

    getStats() {
        const oneDayAgo = Date.now() - 86_400_000;
        const dailyRecords = this.records.filter(r => r.timestamp > oneDayAgo);

        return {
            totalCost:     this.records.reduce((s, r) => s + r.estimatedCostUsd, 0),
            dailyCost:     dailyRecords.reduce((s, r) => s + r.estimatedCostUsd, 0),
            totalRequests: this.records.length,
            totalTokens:   this.records.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
        };
    }
}
