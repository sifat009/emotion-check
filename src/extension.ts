import * as vscode from 'vscode';
import { findUnusedEmotionVariables, hasEmotionStyles } from './parser';

const supportedLanguages = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact'];

const decorationType = vscode.window.createTextEditorDecorationType({
	textDecoration: 'yellow wavy underline',
});

function highlightUnusedVariables(editor: vscode.TextEditor) {
	const document = editor.document;
	const text = document.getText();
	const fileName = document.fileName;

	if (!hasEmotionStyles(text, fileName)) {
		editor.setDecorations(decorationType, []);
		return;
	}

	const unused = findUnusedEmotionVariables(text, fileName);
	const unusedVars: vscode.DecorationOptions[] = [];

	for (const { start, end } of unused) {
		const startPos = document.positionAt(start);
		const endPos = document.positionAt(end);
		const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'Unused Emotion Variable' };
		unusedVars.push(decoration);
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
