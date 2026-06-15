const BLOCKED_FILE_NAMES = new Set([
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    '.env.staging',
    '.env.test',
    'id_rsa',
    'id_ed25519',
    'id_ecdsa',
    'id_dsa',
]);

const BLOCKED_PATTERNS: RegExp[] = [
    /\.env(\.\w+)?$/,
    /\.(pem|key|cert|p12|pfx|crt|cer)$/i,
    /id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/,
    /secrets?\.(json|yaml|yml|toml)$/i,
    /credentials?\.(json|yaml|yml)$/i,
    /\.netrc$/,
    /\.pgpass$/,
];

const SECRET_REDACT_RULES: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
    { pattern: /sk-[a-zA-Z0-9]{48}/g, replacement: '[REDACTED_OPENAI_KEY]' },
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
    { pattern: /ghs_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
    {
        pattern: /(["']?\b(?:api[_-]?key|api[_-]?secret|auth[_-]?token|access[_-]?token|secret[_-]?key|private[_-]?key|password|passwd)\b["']?\s*[:=]\s*["'])[^"'\s]{8,}(["'])/gi,
        replacement: '$1[REDACTED]$2',
    },
];

export class SecurityFilter {
    /**
     * Returns true if the given file path should never be sent to the AI.
     */
    static isBlockedFile(filePath: string): boolean {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

        if (BLOCKED_FILE_NAMES.has(fileName.toLowerCase())) {
            return true;
        }

        return BLOCKED_PATTERNS.some(pattern => pattern.test(filePath));
    }

    /**
     * Strips known secret patterns from file content before sending to the AI.
     */
    static sanitizeContent(content: string): string {
        let sanitized = content;
        for (const rule of SECRET_REDACT_RULES) {
            sanitized = sanitized.replace(rule.pattern, rule.replacement);
        }
        return sanitized;
    }
}
