import * as vscode from 'vscode';

const supportedLanguages = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact'];

const decorationType = vscode.window.createTextEditorDecorationType({
	textDecoration: 'yellow wavy underline',
});

function highlightUnusedVariables(editor: vscode.TextEditor) {
	const text = editor.document.getText();
	const regex = /\w+\s?:\s?css`/gm;
	let match;
	const unusedVars: vscode.DecorationOptions[] = [];

	while ((match = regex.exec(text)) !== null) {
		const variableName = match[0].split(':')[0].trim();
		const isUsed = new RegExp(`\\w+\.\\b${variableName}\\b`, 'gm').test(text);

		if (!isUsed) {
			const startPos = editor.document.positionAt(match.index);
			const endPos = editor.document.positionAt(match.index + variableName.length);
			const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'Unused Emotion Variable' };
			unusedVars.push(decoration);
		}
	}

	// Clear previous decorations and apply new ones
	editor.setDecorations(decorationType, []);
	editor.setDecorations(decorationType, unusedVars);
}

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('extension.checkUnusedEmotion', () => {
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			highlightUnusedVariables(editor);
		}
	});

	context.subscriptions.push(disposable);

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && supportedLanguages.includes(activeEditor.document.languageId)) {
		highlightUnusedVariables(activeEditor);
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && supportedLanguages.includes(document.languageId)) {
				highlightUnusedVariables(editor);
			}
		}),
	);

	vscode.workspace.onDidChangeTextDocument((event) => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			highlightUnusedVariables(editor);
		}
	});
}

export function deactivate() {}
