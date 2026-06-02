# Project Understanding: Emotion Check

`emotion-check` is a Visual Studio Code extension designed to identify and highlight unused **Emotion** (CSS-in-JS) style variables in JavaScript and TypeScript files.

---

## 📂 Project Structure

Below is an overview of the key files and directories in the workspace:

```text
emotion-check/
├── .github/
│   └── workflows/
│       └── main.yml        # CI/CD workflow for deploying to the VS Code Marketplace
├── images/
│   ├── logo-96x96.png     # Extension icon
│   └── preview.gif        # Extension preview GIF showing usage/demo
├── src/
│   └── extension.ts       # Core logic of the extension (TypeScript)
├── .eslintrc.json         # ESLint configuration for code style and linting
├── .vscode-test.mjs       # Test runner configuration for VS Code extension tests
├── package.json           # Extension manifest containing configuration, scripts, and dependencies
├── tsconfig.json          # TypeScript compiler configuration
└── webpack.config.js      # Webpack configuration for compiling and bundling the extension
```

---

## ⚙️ Core Architecture & Logic

The extension's main functionality resides in [src/extension.ts](file:///Users/sifathaque/Desktop/emotion-check/src/extension.ts).

### 1. Activation & Events
The extension activates when files of the following languages are opened:
* `javascript`
* `typescript`
* `typescriptreact` (TSX)
* `javascriptreact` (JSX)

It registers the command `extension.checkUnusedEmotion` and hooks into several editor lifecycle events to perform checks automatically:
* **Active Editor Change**: Triggers when switching tabs or focusing a new editor.
* **Document Open**: Triggers when a new text document is opened.
* **Document Edit**: Triggers on every keystroke/text change (`onDidChangeTextDocument`), keeping the highlights updated in real-time.

### 2. Scanning and Highlighting Logic (`highlightUnusedVariables`)
When a document is analyzed, the extension follows these steps:
1. **Pre-check**: It searches the document text for the string `css={` using a regular expression (`/css={/gm`). If it doesn't find it, it assumes Emotion is not used in the file and exits immediately to conserve resources.
2. **Regex Parsing**:
   * It finds potential Emotion variables using the regex `/\w+\s?:.*?css`/gm`.
   * For every match, it extracts the variable name by splitting on `:` (e.g., matching `title: css`...` gets `title`).
3. **Usage Verification**:
   * For each discovered variable name, it checks if it is referenced elsewhere in the document using the regex:
     ```typescript
     new RegExp(`\\w+\\.\\b\${variableName}\\b`, 'gm')
     ```
     This matches patterns like `styles.title` or `classes.title` (where `\w+` is any word character representing the container object, followed by a dot `.` and the variable name).
4. **Applying Decorations**:
   * If the variable is **not** used, a VS Code decoration is created for its location.
   * It applies a `yellow wavy underline` decoration type with the hover message `"Unused Emotion Variable"`.

---

## 🛠️ Tooling & Scripts

* **Bundling**: Compiles and bundles TypeScript into a single file at `dist/extension.js` using **Webpack** and `ts-loader` for distribution.
* **Linting**: Uses **ESLint** with `@typescript-eslint` plugins to enforce style conventions.
* **Testing**: Set up to run VS Code extension tests via `@vscode/test-cli`.
* **CI/CD / Release**:
  * Located in `.github/workflows/main.yml`.
  * Runs automatically on GitHub release publishing or manually via `workflow_dispatch`.
  * Installs dependencies, sets up git user, and publishes the extension directly to the VS Code Marketplace using `vsce publish --yarn`.

---

## ⚠️ Limitations & Potential Edge Cases

Based on a code review of [src/extension.ts](file:///Users/sifathaque/Desktop/emotion-check/src/extension.ts#L9-L36), here are some limitations in the current implementation:

1. **Object Properties Only**:
   * The regex `/\w+\s?:.*?css`/gm` expects a colon `:` between the property and `css``. This is tailored for styles declared inside an object, e.g.:
     ```javascript
     const styles = {
       unusedStyle: css`color: red;`
     };
     ```
   * It will **not** detect styles declared as standalone variables, e.g.:
     ```javascript
     const unusedStyle = css`color: red;`;
     ```
2. **Strict Member Access Check**:
   * The usage regex `\w+\.\bvariableName\b` requires the variable to be accessed as a property on an object (e.g. `styles.unusedStyle`).
   * If a standalone variable is used directly as `<div css={unusedStyle}>`, it won't match, and the variable will be incorrectly marked as unused even if it is used.
3. **Substring / Context Blindness**:
   * Since the checks are regex-based rather than utilizing an AST parser (like Babel or TypeScript Compiler API), comments containing the variable name or unrelated text matching the patterns could result in false negatives (marking a variable as used when it is not).
