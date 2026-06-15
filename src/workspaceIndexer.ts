import * as vscode from 'vscode';
import * as path from 'path';
import { SecurityFilter } from './securityFilter';

const IGNORED_DIRS = new Set([
    'node_modules', '.git', 'vendor', 'tmp', 'log',
    'build', 'dist', 'coverage', 'out', '.next', '.nuxt',
    '__pycache__', '.svelte-kit', '.turbo', '.cache',
    '.vscode-test', 'target', 'bin', 'obj',
]);

const MAX_FILE_SIZE_BYTES = 200_000; // 200 KB

export interface FileResult {
    fsPath: string;
    relativePath: string;
    snippet?: string;
}

export class WorkspaceIndexer {
    /** Returns a text tree of the workspace, limited to `maxDepth` levels. */
    async getProjectTree(maxDepth = 4): Promise<string> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return '(No workspace opened)';
        }

        const lines: string[] = [];
        await this.buildTree(folders[0].uri.fsPath, '', lines, 0, maxDepth);
        return lines.join('\n');
    }

    private async buildTree(
        dirPath: string,
        prefix: string,
        lines: string[],
        depth: number,
        maxDepth: number,
    ): Promise<void> {
        if (depth > maxDepth) {
            return;
        }

        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
        } catch {
            return;
        }

        // Directories first, then files, both sorted alphabetically
        entries.sort(([nameA, typeA], [nameB, typeB]) => {
            if (typeA !== typeB) {
                return typeA === vscode.FileType.Directory ? -1 : 1;
            }
            return nameA.localeCompare(nameB);
        });

        for (const [name, type] of entries) {
            const isDir = type === vscode.FileType.Directory;
            if (isDir && (IGNORED_DIRS.has(name) || name.startsWith('.'))) {
                continue;
            }
            lines.push(`${prefix}${isDir ? '📁' : '📄'} ${name}`);
            if (isDir) {
                await this.buildTree(
                    path.join(dirPath, name),
                    prefix + '  ',
                    lines,
                    depth + 1,
                    maxDepth,
                );
            }
        }
    }

    /** Search files whose path/name contains the query string. */
    async searchFiles(query: string, limit = 20): Promise<FileResult[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return [];
        }

        const rootPath = folders[0].uri.fsPath;
        const queryLower = query.toLowerCase();
        const exclude = `**/{${[...IGNORED_DIRS].join(',')}}/**`;

        const uris = await vscode.workspace.findFiles('**/*', exclude, 200);
        const results: FileResult[] = [];

        for (const uri of uris) {
            if (SecurityFilter.isBlockedFile(uri.fsPath)) {
                continue;
            }
            const rel = path.relative(rootPath, uri.fsPath);
            if (rel.toLowerCase().includes(queryLower)) {
                results.push({ fsPath: uri.fsPath, relativePath: rel });
                if (results.length >= limit) {
                    break;
                }
            }
        }

        return results;
    }

    /** Search file contents for lines matching the query. */
    async searchContent(query: string, limit = 15): Promise<FileResult[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return [];
        }

        const rootPath = folders[0].uri.fsPath;
        const queryLower = query.toLowerCase();
        const exclude = `**/{${[...IGNORED_DIRS].join(',')}}/**`;

        const uris = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx,py,rb,go,java,cs,cpp,c,h,md,json,yaml,yml,toml,sh,swift,kt}',
            exclude,
            300,
        );

        const results: FileResult[] = [];

        for (const uri of uris) {
            if (SecurityFilter.isBlockedFile(uri.fsPath)) {
                continue;
            }
            try {
                const bytes = await vscode.workspace.fs.readFile(uri);
                if (bytes.byteLength > MAX_FILE_SIZE_BYTES) {
                    continue;
                }
                const content = Buffer.from(bytes).toString('utf8');
                if (!content.toLowerCase().includes(queryLower)) {
                    continue;
                }

                const matchLines = content
                    .split('\n')
                    .map((line, i) => ({ line, i }))
                    .filter(({ line }) => line.toLowerCase().includes(queryLower))
                    .slice(0, 4)
                    .map(({ line, i }) => `L${i + 1}: ${line.trim()}`);

                results.push({
                    fsPath: uri.fsPath,
                    relativePath: path.relative(rootPath, uri.fsPath),
                    snippet: matchLines.join('\n'),
                });

                if (results.length >= limit) {
                    break;
                }
            } catch {
                continue;
            }
        }

        return results;
    }

    /** Read a single file, returning null if blocked or unreadable. */
    async readFile(fsPath: string): Promise<string | null> {
        if (SecurityFilter.isBlockedFile(fsPath)) {
            return null;
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath));
            if (bytes.byteLength > MAX_FILE_SIZE_BYTES) {
                return `[File too large to include – ${bytes.byteLength} bytes]`;
            }
            const content = Buffer.from(bytes).toString('utf8');
            return SecurityFilter.sanitizeContent(content);
        } catch {
            return null;
        }
    }
}
