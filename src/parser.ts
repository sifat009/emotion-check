import * as ts from 'typescript';

export interface EmotionVariable {
	name: string;
	start: number;
	end: number;
}

/**
 * Check if a file contains any css tagged template literals.
 * Replaces the old /css={/ regex pre-check.
 */
export function hasEmotionStyles(text: string, fileName: string): boolean {
	return /css`/gm.test(text);
}

/**
 * Parse a document and find all css`` tagged template declarations.
 * Handles:
 *   - const myStyle = css`...`
 *   - let myStyle = css`...`
 *   - var myStyle = css`...`
 *   - { myStyle: css`...` }  (object property)
 */
export function findEmotionVariables(text: string, fileName: string): EmotionVariable[] {
	const variables: EmotionVariable[] = [];

	let scriptKind = ts.ScriptKind.Unknown;
	if (fileName.endsWith('.tsx')) {
		scriptKind = ts.ScriptKind.TSX;
	} else if (fileName.endsWith('.ts')) {
		scriptKind = ts.ScriptKind.TS;
	} else if (fileName.endsWith('.jsx')) {
		scriptKind = ts.ScriptKind.JSX;
	} else if (fileName.endsWith('.js')) {
		scriptKind = ts.ScriptKind.JS;
	}

	const sourceFile = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true, // setParentNodes
		scriptKind
	);

	function isEmotionCss(node: ts.Node): boolean {
		if (ts.isTaggedTemplateExpression(node)) {
			if (ts.isIdentifier(node.tag) && node.tag.text === 'css') {
				return true;
			}
		}
		return false;
	}

	function walk(node: ts.Node) {
		if (ts.isVariableDeclaration(node) && node.initializer) {
			if (isEmotionCss(node.initializer) && ts.isIdentifier(node.name)) {
				variables.push({
					name: node.name.text,
					start: node.name.getStart(sourceFile),
					end: node.name.getEnd(),
				});
			}
		}

		if (ts.isPropertyAssignment(node) && node.initializer) {
			if (isEmotionCss(node.initializer) && ts.isIdentifier(node.name)) {
				variables.push({
					name: node.name.text,
					start: node.name.getStart(sourceFile),
					end: node.name.getEnd(),
				});
			}
		}

		ts.forEachChild(node, walk);
	}

	walk(sourceFile);
	return variables;
}

/**
 * Check if a variable name is referenced anywhere in the file
 * (excluding its own declaration).
 */
export function isVariableUsed(
	text: string,
	fileName: string,
	variableName: string,
	declarationStart: number
): boolean {
	let scriptKind = ts.ScriptKind.Unknown;
	if (fileName.endsWith('.tsx')) {
		scriptKind = ts.ScriptKind.TSX;
	} else if (fileName.endsWith('.ts')) {
		scriptKind = ts.ScriptKind.TS;
	} else if (fileName.endsWith('.jsx')) {
		scriptKind = ts.ScriptKind.JSX;
	} else if (fileName.endsWith('.js')) {
		scriptKind = ts.ScriptKind.JS;
	}

	const sourceFile = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	);

	let used = false;

	function walk(node: ts.Node) {
		if (used) {
			return;
		}

		if (ts.isIdentifier(node) && node.text === variableName) {
			if (node.getStart(sourceFile) !== declarationStart) {
				used = true;
				return;
			}
		}

		ts.forEachChild(node, walk);
	}

	walk(sourceFile);
	return used;
}

export interface UnusedEmotionResult {
	name: string;
	start: number;
	end: number;
}

/**
 * Single-pass analysis: parse once, find declarations, check usage, return unused.
 * This is the optimized entry point for the extension (Slice 3).
 */
export function findUnusedEmotionVariables(text: string, fileName: string): UnusedEmotionResult[] {
	let scriptKind = ts.ScriptKind.Unknown;
	if (fileName.endsWith('.tsx')) {
		scriptKind = ts.ScriptKind.TSX;
	} else if (fileName.endsWith('.ts')) {
		scriptKind = ts.ScriptKind.TS;
	} else if (fileName.endsWith('.jsx')) {
		scriptKind = ts.ScriptKind.JSX;
	} else if (fileName.endsWith('.js')) {
		scriptKind = ts.ScriptKind.JS;
	}

	const sourceFile = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	);

	const declarations: { decl: UnusedEmotionResult; used: boolean }[] = [];

	function isEmotionCss(node: ts.Node): boolean {
		if (ts.isTaggedTemplateExpression(node)) {
			if (ts.isIdentifier(node.tag) && node.tag.text === 'css') {
				return true;
			}
		}
		return false;
	}

	function collectDeclarations(node: ts.Node) {
		if (ts.isVariableDeclaration(node) && node.initializer) {
			if (isEmotionCss(node.initializer) && ts.isIdentifier(node.name)) {
				declarations.push({
					decl: {
						name: node.name.text,
						start: node.name.getStart(sourceFile),
						end: node.name.getEnd(),
					},
					used: false,
				});
			}
		}

		if (ts.isPropertyAssignment(node) && node.initializer) {
			if (isEmotionCss(node.initializer) && ts.isIdentifier(node.name)) {
				declarations.push({
					decl: {
						name: node.name.text,
						start: node.name.getStart(sourceFile),
						end: node.name.getEnd(),
					},
					used: false,
				});
			}
		}

		ts.forEachChild(node, collectDeclarations);
	}

	function collectUsages(node: ts.Node) {
		if (ts.isIdentifier(node)) {
			const startPos = node.getStart(sourceFile);
			for (const item of declarations) {
				if (item.decl.name === node.text && startPos !== item.decl.start) {
					item.used = true;
				}
			}
		}
		ts.forEachChild(node, collectUsages);
	}

	collectDeclarations(sourceFile);

	if (declarations.length > 0) {
		collectUsages(sourceFile);
	}

	return declarations.filter(d => !d.used).map(d => d.decl);
}

