# Implementation Plan: AST-Based Emotion Check

## Background

The current detection logic in [`src/extension.ts`](src/extension.ts) is entirely regex-based. This leads to three known limitations:

1. **Only detects object-property styles** — misses `const style = css`...``
2. **Only detects member-access usage** (`styles.x`) — misses `css={x}`, interpolation, array usage
3. **No comment/string awareness** — a variable name in a comment counts as "used"

All three are symptoms of the same root cause: **regex cannot understand code structure**.

### Why AST?

Using the TypeScript Compiler API (`ts.createSourceFile`) gives us a proper syntax tree. This solves all three limitations in one architectural shift:

| Concern | Regex Approach | AST Approach |
|---------|---------------|--------------|
| Variable discovery | Fragile pattern matching | Walk `VariableDeclaration` and `PropertyAssignment` nodes |
| Usage detection | Can't distinguish code from comments | Only traverses actual code expressions |
| New patterns | Each needs a new regex | Naturally handled by node types |

### Parser Choice

`typescript` is already a devDependency (`^5.4.5`). We'll promote it to a runtime `dependency` and use **only** `ts.createSourceFile()` — a lightweight, single-file parser that doesn't need a full TypeScript program or type checker.

> **Bundle size note**: TypeScript is ~5MB when bundled with webpack in production mode. This is acceptable for a VS Code extension. If size becomes a concern, `@babel/parser` (~800KB) is an alternative that supports JSX/TSX but would need an additional dependency.

---

## Slice 1: AST Infrastructure + Variable Discovery

**Goal**: Replace regex-based variable discovery with AST traversal. Keep the existing regex-based usage check temporarily so we can ship incrementally.

### Changes

#### `package.json`
- Move `typescript` from `devDependencies` to `dependencies` (it needs to be available at runtime for parsing).

#### `src/parser.ts` [NEW]
Create a dedicated parser module with two responsibilities:

```typescript
import * as ts from 'typescript';

export interface EmotionVariable {
  name: string;       // The variable/property name
  start: number;      // Character offset in the document
  end: number;        // Character offset end
}

/**
 * Parse a document and find all css`` tagged template declarations.
 * Handles:
 *   - const myStyle = css`...`
 *   - let myStyle = css`...`
 *   - var myStyle = css`...`
 *   - { myStyle: css`...` }  (object property)
 */
export function findEmotionVariables(text: string, fileName: string): EmotionVariable[];

/**
 * Check if a file contains any css tagged template literals.
 * Replaces the old /css={/ regex pre-check.
 */
export function hasEmotionStyles(text: string, fileName: string): boolean;
```

**How it works**:
1. Call `ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind)` to parse the text. Derive `scriptKind` from the file extension (`.tsx` → `ts.ScriptKind.TSX`, etc.).
2. Recursively walk the AST.
3. For **variable declarations** (`ts.isVariableDeclaration(node)`): check if the initializer is a `TaggedTemplateExpression` where the tag is the identifier `css`.
4. For **property assignments** (`ts.isPropertyAssignment(node)`): same check on the initializer.
5. Return an array of `{ name, start, end }` for each match.

#### `src/extension.ts`
- Import `findEmotionVariables` and `hasEmotionStyles` from `./parser`.
- Replace the variable discovery regex (`/\w+\s?:.*?css\`/gm`) with `findEmotionVariables()`.
- Replace the `css={` pre-check with `hasEmotionStyles()`.
- **Keep** the existing usage regex (`\w+\.\bvariableName\b`) for now — it will be replaced in Slice 2.

### Verification
- Create a test `.tsx` file with both patterns:
  ```tsx
  const standalone = css`color: red;`;
  const styles = { objectProp: css`color: blue;` };
  ```
- Confirm both `standalone` and `objectProp` are detected and underlined.
- Confirm existing object-property detection still works (no regression).

---

## Slice 2: AST-Based Usage Detection

**Goal**: Replace regex-based usage checking with AST-based identifier reference counting. This is the highest-impact slice — it fixes the member-access-only limitation and naturally ignores comments.

### Changes

#### `src/parser.ts`
Add a new exported function:

```typescript
/**
 * Check if a variable name is referenced anywhere in the file
 * (excluding its own declaration).
 *
 * Matches any Identifier node with the given name that is NOT
 * the declaration itself. Covers:
 *   - styles.myVar (PropertyAccessExpression)
 *   - css={myVar} (JsxExpression)
 *   - css={[myVar, other]} (ArrayLiteralExpression)
 *   - `${myVar}` (TemplateSpan)
 *   - fn(myVar) (CallExpression argument)
 *   - <Comp css={myVar} /> (JsxAttribute)
 */
export function isVariableUsed(
  text: string,
  fileName: string,
  variableName: string,
  declarationStart: number
): boolean;
```

**How it works**:
1. Parse the file with `ts.createSourceFile()` (can cache/reuse the source file from Slice 1).
2. Walk all nodes. For every `ts.isIdentifier(node)` where `node.text === variableName`:
   - Skip if `node.getStart() === declarationStart` (it's the declaration itself).
   - If found elsewhere → the variable is used.
3. Return `true` if any non-declaration reference exists, `false` otherwise.

> **Key insight**: We don't need to understand *how* the variable is used (JSX prop, member access, interpolation, etc.). We just need to know if the identifier appears anywhere in actual code outside its declaration. The AST naturally excludes comments.

#### `src/extension.ts`
- Replace the usage regex with `isVariableUsed()`.
- Remove the old regex construction: `new RegExp(\`\\w+\\.\\b${variableName}\\b\`, 'gm')`.

### Verification
- Test file:
  ```tsx
  const used1 = css`color: red;`;
  const unused1 = css`color: blue;`;
  const styles = {
    used2: css`font-size: 14px;`,
    unused2: css`padding: 8px;`,
  };

  // unused1 appears in this comment but should still be flagged
  const App = () => (
    <div>
      <span css={used1}>Direct usage</span>
      <span css={styles.used2}>Member access</span>
    </div>
  );
  ```
- Expected: `unused1` and `unused2` are underlined. `used1` and `used2` are NOT.
- Verify comment containing `unused1` does NOT prevent it from being flagged.

---

## Slice 3: Performance — Cache the AST

**Goal**: Avoid parsing the file multiple times per check. Currently Slice 1 and 2 each call `ts.createSourceFile()`. On every keystroke (`onDidChangeTextDocument`), this means 1 + N parses (1 for discovery + 1 per variable for usage). Consolidate to a single parse.

### Changes

#### `src/parser.ts`
Refactor to expose a single entry point:

```typescript
export interface UnusedEmotionResult {
  name: string;
  start: number;
  end: number;
}

/**
 * Single-pass analysis: parse once, find declarations, check usage, return unused.
 */
export function findUnusedEmotionVariables(
  text: string,
  fileName: string
): UnusedEmotionResult[];
```

**How it works**:
1. Parse once with `ts.createSourceFile()`.
2. First pass: collect all `css` tagged template declarations → `Map<string, { start, end }>`.
3. Second pass: walk all identifiers. For each that matches a declared name and is NOT at the declaration position, mark it as "used".
4. Return only the entries that were never marked as used.

This reduces parsing from `1 + N` to **1 parse + 2 walks** (both walks are O(nodes), so total is O(nodes)).

#### `src/extension.ts`
- Replace separate `findEmotionVariables` + `isVariableUsed` calls with single `findUnusedEmotionVariables()`.
- The `highlightUnusedVariables` function becomes very simple:
  ```typescript
  function highlightUnusedVariables(editor: vscode.TextEditor) {
    const text = editor.document.getText();
    const fileName = editor.document.fileName;
    const unused = findUnusedEmotionVariables(text, fileName);

    const decorations = unused.map(v => ({
      range: new vscode.Range(
        editor.document.positionAt(v.start),
        editor.document.positionAt(v.end)
      ),
      hoverMessage: 'Unused Emotion Variable',
    }));

    editor.setDecorations(decorationType, decorations);
  }
  ```

### Verification
- Same test cases as Slice 2 — behavior should be identical.
- Open a large file and type rapidly to confirm no visible lag.

---

## Slice 4: Edge Cases & Robustness

**Goal**: Handle remaining edge cases that a basic AST walk might miss.

### 4a. Destructured re-exports

```typescript
const styles = { title: css`...`, body: css`...` };
const { title } = styles; // destructured
<div css={title} />       // used via destructured name
```

Currently Slice 2 would find `title` as an identifier reference and correctly mark it as used. ✅ No extra work needed here — the identifier `title` appears at the destructuring site AND at the JSX site.

### 4b. Renamed destructuring

```typescript
const { title: myTitle } = styles;
<div css={myTitle} />
```

Here `title` from the declaration is never referenced by its original name. The AST walk for `title` as an identifier would find it at `{ title: myTitle }` — `title` appears as a property name in the binding pattern. We need to verify whether `ts.isIdentifier` picks it up there. If not, we'll need to also check `BindingElement` nodes.

### 4c. Spread usage

```typescript
const combined = css`${styles.title}; ${styles.body};`;
```

The identifier `title` appears inside a `PropertyAccessExpression`. The AST walk will find `title` as an identifier. ✅ Works.

### 4d. Dynamic keys (out of scope)

```typescript
const key = 'title';
styles[key]; // dynamic — cannot resolve statically
```

This is inherently unsolvable without type checking / flow analysis. We'll **document this as a known limitation** and not attempt to handle it.

### Changes

#### `src/parser.ts`
- Add handling for `BindingElement` property names if needed (4b).
- Add unit-level comments documenting what is and isn't supported.

### Verification
- Test file covering scenarios 4a–4c.
- Document 4d as a known limitation in README.

---

## Summary

| Slice | What | Key Outcome | Depends On |
|-------|------|-------------|------------|
| **1** | AST variable discovery + pre-check | Detects `const x = css`...`` | — |
| **2** | AST usage detection | Finds `css={x}`, ignores comments | Slice 1 |
| **3** | Single-parse optimization | One parse per keystroke, not 1+N | Slice 2 |
| **4** | Edge cases & robustness | Destructuring, spreads, docs | Slice 3 |

Each slice is independently shippable. Slice 1 alone is a meaningful improvement over the current regex-only approach.
