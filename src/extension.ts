import * as vscode from 'vscode';
import { findUnusedEmotionVariables, hasEmotionStyles } from './parser';

const supportedLanguages = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact'];

const decorationType = vscode.window.createTextEditorDecorationType({
	textDecoration: 'yellow wavy underline',
});

let diagnosticCollection: vscode.DiagnosticCollection;

// Convert offset to Position manually if we don't have a TextDocument (workspace scan)
function getPositionAt(text: string, offset: number): vscode.Position {
	let line = 0;
	let character = 0;
	for (let i = 0; i < offset; i++) {
		if (text[i] === '\n') {
			line++;
			character = 0;
		} else {
			character++;
		}
	}
	return new vscode.Position(line, character);
}

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

export async function scanFile(uri: vscode.Uri, document?: vscode.TextDocument) {
	try {
		let text = '';
		const fileName = uri.fsPath;
		
		if (document) {
			text = document.getText();
		} else {
			const data = await vscode.workspace.fs.readFile(uri);
			text = Buffer.from(data).toString('utf8');
		}

		if (!hasEmotionStyles(text, fileName)) {
			diagnosticCollection.delete(uri);
			return;
		}

		const unused = findUnusedEmotionVariables(text, fileName);
		const diagnostics: vscode.Diagnostic[] = [];

		for (const { name, start, end } of unused) {
			const startPos = document ? document.positionAt(start) : getPositionAt(text, start);
			const endPos = document ? document.positionAt(end) : getPositionAt(text, end);
			const range = new vscode.Range(startPos, endPos);
			const diagnostic = new vscode.Diagnostic(
				range,
				`Unused emotion variable: '${name}'`,
				vscode.DiagnosticSeverity.Warning
			);
			diagnostic.source = 'emotion-check';
			diagnostics.push(diagnostic);
		}

		diagnosticCollection.set(uri, diagnostics);
	} catch (error) {
		console.error(`Failed to scan file ${uri.fsPath}`, error);
	}
}

export async function scanWorkspace() {
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Scanning workspace for unused emotion variables...",
		cancellable: false
	}, async (progress) => {
		const uris = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx}', '**/node_modules/**');
		for (const uri of uris) {
			await scanFile(uri);
		}
	});
}

export function activate(context: vscode.ExtensionContext) {
	diagnosticCollection = vscode.languages.createDiagnosticCollection('emotion-check');
	context.subscriptions.push(diagnosticCollection);

	const disposableCheck = vscode.commands.registerCommand('extension.checkUnusedEmotion', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			highlightUnusedVariables(editor);
		}
	});

	const disposableScan = vscode.commands.registerCommand('extension.scanWorkspaceEmotion', () => {
		scanWorkspace();
	});

	context.subscriptions.push(disposableCheck, disposableScan);

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
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document) {
				highlightUnusedVariables(editor);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (supportedLanguages.includes(document.languageId)) {
				scanFile(document.uri, document);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			diagnosticCollection.delete(document.uri);
		})
	);

	// Initial workspace scan
	scanWorkspace();
}

export function deactivate() {
	if (diagnosticCollection) {
		diagnosticCollection.clear();
		diagnosticCollection.dispose();
	}
}
