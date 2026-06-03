import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('Sifat.emotion-check'));
	});

	test('should activate and register commands', async () => {
		const ext = vscode.extensions.getExtension('Sifat.emotion-check');
		assert.ok(ext, 'Extension not found');
		await ext.activate();
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('extension.scanWorkspaceEmotion'));
		assert.ok(commands.includes('extension.checkUnusedEmotion'));
	});
});
