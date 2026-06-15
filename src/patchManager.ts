import * as vscode from 'vscode';

export interface CodePatch {
    fsPath: string;
    original: string;
    replacement: string;
    description: string;
}

export class PatchManager {
    /**
     * Shows a confirmation dialog and applies the patch if the user approves.
     * Returns true if the patch was applied successfully.
     */
    async applyWithConfirmation(patch: CodePatch): Promise<boolean> {
        const answer = await vscode.window.showInformationMessage(
            `SoftCode AI: Apply changes to ${vscode.workspace.asRelativePath(patch.fsPath)}?\n${patch.description}`,
            { modal: true },
            'Apply Changes',
            'Cancel',
        );

        if (answer !== 'Apply Changes') {
            return false;
        }

        return this.applyPatch(patch);
    }

    async applyPatch(patch: CodePatch): Promise<boolean> {
        const uri = vscode.Uri.file(patch.fsPath);

        let doc: vscode.TextDocument;
        try {
            doc = await vscode.workspace.openTextDocument(uri);
        } catch {
            vscode.window.showErrorMessage(`SoftCode AI: Could not open ${patch.fsPath}`);
            return false;
        }

        const text = doc.getText();
        if (!text.includes(patch.original)) {
            vscode.window.showWarningMessage(
                'SoftCode AI: Could not locate the original code to replace. The file may have changed.',
            );
            return false;
        }

        const newText = text.replace(patch.original, patch.replacement);
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(text.length),
        );
        edit.replace(uri, fullRange, newText);

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            vscode.window.showInformationMessage('SoftCode AI: Changes applied successfully.');
        } else {
            vscode.window.showErrorMessage('SoftCode AI: Failed to apply changes.');
        }
        return success;
    }
}
