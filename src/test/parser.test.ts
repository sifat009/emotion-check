import * as assert from 'assert';
import { hasEmotionStyles, findEmotionVariables, isVariableUsed, findUnusedEmotionVariables } from '../parser';

suite('Parser Logic Tests (Slice 1)', () => {
	suite('hasEmotionStyles', () => {
		test('should return true when file contains css tagged template literal', () => {
			assert.strictEqual(hasEmotionStyles('const a = css`color: red;`', 'test.tsx'), true);
		});

		test('should return false when file does not contain the word css followed by backtick', () => {
			assert.strictEqual(hasEmotionStyles('const a = "color: red;"', 'test.tsx'), false);
		});

		test('should return true for css` even inside comments (fast pre-check accepts false positives)', () => {
			assert.strictEqual(hasEmotionStyles('// css`color: red;`', 'test.tsx'), true);
		});
	});

	suite('findEmotionVariables', () => {
		test('should find standalone const declaration', () => {
			const code = 'const myStyle = css`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			assert.strictEqual(vars[0].name, 'myStyle');
		});

		test('should find standalone let declaration', () => {
			const code = 'let myStyle = css`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			assert.strictEqual(vars[0].name, 'myStyle');
		});

		test('should find standalone var declaration', () => {
			const code = 'var myStyle = css`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			assert.strictEqual(vars[0].name, 'myStyle');
		});

		test('should find object property declaration', () => {
			const code = 'const styles = { myStyle: css`color: red;` };';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			assert.strictEqual(vars[0].name, 'myStyle');
		});

		test('should find shorthand object property declaration (should not match if no css)', () => {
			const code = 'const styles = { myStyle };';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 0);
		});
        
		test('should handle multiple declarations', () => {
			const code = `
				const styleA = css\`color: red;\`;
				const styles = {
					styleB: css\`color: blue;\`,
					styleC: css\`color: green;\`
				};
				let styleD = css\`color: yellow;\`;
			`;
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 4);
			assert.strictEqual(vars[0].name, 'styleA');
			assert.strictEqual(vars[1].name, 'styleB');
			assert.strictEqual(vars[2].name, 'styleC');
			assert.strictEqual(vars[3].name, 'styleD');
		});

		test('should return correct start and end positions', () => {
			const code = 'const myStyle = css`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start, end } = vars[0];
			assert.strictEqual(name, 'myStyle');
			// Verify that code.substring(start, end) exactly equals the identifier name
			assert.strictEqual(code.substring(start, end), 'myStyle');
		});

		test('should ignore other tagged template literals', () => {
			const code = 'const myStyle = styled.div`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 0);
		});

		test('should ignore regular template literals', () => {
			const code = 'const myStyle = \`css color: red;\`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 0);
		});

		test('should ignore non-identifier tags in tagged template literals', () => {
			const code = 'const myStyle = obj.css`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 0);
		});
		
		test('should ignore variables without initializers', () => {
			const code = 'let myStyle;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 0);
		});

		test('should handle different file extensions correctly (TSX vs JS)', () => {
			const code = 'const myStyle = css`color: red;`;';
			const varsTSX = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(varsTSX.length, 1);

			const varsJS = findEmotionVariables(code, 'test.js');
			assert.strictEqual(varsJS.length, 1);
		});

		test('should handle nested structures', () => {
			const code = `
				function getStyles() {
					return {
						inner: css\`color: purple;\`
					};
				}
			`;
			const vars = findEmotionVariables(code, 'test.ts');
			assert.strictEqual(vars.length, 1);
			assert.strictEqual(vars[0].name, 'inner');
		});
		
		test('should ignore css`` inside string literals or comments', () => {
			const code = `
				// const commentStyle = css\`ignored\`
				const str = "const stringStyle = css\`ignored\`";
				const actualStyle = css\`color: blue;\`;
			`;
			const vars = findEmotionVariables(code, 'test.tsx');
			// AST parser will correctly skip comments and strings for VariableDeclarations.
			assert.strictEqual(vars.length, 1);
			assert.strictEqual(vars[0].name, 'actualStyle');
		});
	});

	suite('isVariableUsed', () => {
		test('should return true when variable is used as member access', () => {
			const code = 'const styles = { myStyle: css`color: red;` }; <div css={styles.myStyle} />';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), true);
		});

		test('should return true when variable is used directly (JSX)', () => {
			const code = 'const myStyle = css`color: red;`; <div css={myStyle} />';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), true);
		});

		test('should return true when variable is used inside array', () => {
			const code = 'const myStyle = css`color: red;`; <div css={[myStyle, other]} />';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), true);
		});

		test('should return true when variable is used in template interpolation', () => {
			const code = 'const myStyle = css`color: red;`; const combined = css`${myStyle}`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 2);
			// The first one is `myStyle`. It is used in `combined`.
			const myStyleVar = vars.find(v => v.name === 'myStyle')!;
			assert.strictEqual(isVariableUsed(code, 'test.tsx', myStyleVar.name, myStyleVar.start), true);
		});

		test('should return false when variable name only appears in comments', () => {
			const code = `
				const unusedStyle = css\`color: blue;\`;
				// I really like unusedStyle
				/* unusedStyle is great */
			`;
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), false);
		});

		test('should return false when variable name only appears in strings', () => {
			const code = 'const unusedStyle = css`color: blue;`; const str = "unusedStyle";';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), false);
		});

		test('should ignore its own declaration', () => {
			const code = 'const myStyle = css`color: red;`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), false);
		});

		test('should return true when variable is used via destructured assignment', () => {
			const code = 'const styles = { myStyle: css`color: red;` }; const { myStyle } = styles; <div css={myStyle} />';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), true);
		});

		test('should return true when variable is used via renamed destructuring', () => {
			const code = 'const styles = { myStyle: css`color: red;` }; const { myStyle: otherName } = styles; <div css={otherName} />';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 1);
			const { name, start } = vars[0];
			assert.strictEqual(isVariableUsed(code, 'test.tsx', name, start), true);
		});

		test('should return true when variable is used inside spread or interpolation', () => {
			const code = 'const styles = { myStyle: css`color: red;` }; const combined = css`${styles.myStyle}`;';
			const vars = findEmotionVariables(code, 'test.tsx');
			assert.strictEqual(vars.length, 2);
			const myStyleVar = vars.find(v => v.name === 'myStyle')!;
			assert.strictEqual(isVariableUsed(code, 'test.tsx', myStyleVar.name, myStyleVar.start), true);
		});
	});

	suite('findUnusedEmotionVariables (Slice 3 Optimization)', () => {
		test('should return only unused variables in a single pass', () => {
			const code = `
				const used1 = css\`color: red;\`;
				const unused1 = css\`color: blue;\`;
				const styles = {
					used2: css\`font-size: 14px;\`,
					unused2: css\`padding: 8px;\`,
				};
				
				// unused1 is in this comment!
				const str = "unused2 is in this string!";

				const App = () => (
					<div>
						<span css={used1}>Direct usage</span>
						<span css={styles.used2}>Member access</span>
					</div>
				);
			`;
			const unused = findUnusedEmotionVariables(code, 'test.tsx');
			
			assert.strictEqual(unused.length, 2);
			const names = unused.map(u => u.name);
			assert.ok(names.includes('unused1'));
			assert.ok(names.includes('unused2'));
			assert.ok(!names.includes('used1'));
			assert.ok(!names.includes('used2'));
		});

		test('should handle variables shadowed by other objects gracefully', () => {
			const code = `
				const myStyle = css\`color: red;\`;
				const other = { myStyle: 123 }; // same name, used here
			`;
			const unused = findUnusedEmotionVariables(code, 'test.tsx');
			// Since myStyle is referenced again as a property assignment, our simplified AST tracker will see it and mark it as used.
			// This is a known acceptable false-negative behavior matching previous regex behavior.
			assert.strictEqual(unused.length, 0);
		});
	});
});
