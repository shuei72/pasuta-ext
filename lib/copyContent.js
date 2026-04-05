"use strict";

const vscode = require("vscode");

/**
 * Collects the current editor selections as whole-line text with tabs expanded to spaces.
 * @param {{ lineNumberMode: "none" | "colonLines" | "tabLines" }} _options Copy preparation options.
 * @returns {Promise<{ editor: vscode.TextEditor; lines: Array<{ lineNumber: number; text: string }>; lineNumberWidth: number } | undefined>}
 */
async function prepareCopyContent(_options) {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage("No active editor found.");
    return undefined;
  }

  const document = editor.document;
  const tabSize = await promptTabSize(editor);
  if (!tabSize) {
    return undefined;
  }

  const selections = editor.selections.length > 0 ? editor.selections : [editor.selection];
  const normalizedSelections = selections.map((selection) =>
    normalizeSelectionToWholeLines(document, selection)
  );

  const copiedText = normalizedSelections
    .flatMap((selection) => collectSelectionLines(document, selection, tabSize));

  return {
    editor,
    lines: copiedText,
    lineNumberWidth: String(document.lineCount).length
  };
}

/**
 * Prompts the user for the tab size used to expand tabs before copying.
 * @param {vscode.TextEditor} editor Active editor used to determine the default value.
 * @returns {Promise<number | undefined>}
 */
async function promptTabSize(editor) {
  const defaultTabSize = getEditorTabSize(editor);
  const input = await vscode.window.showInputBox({
    title: "Pasuta Tab Size",
    prompt: "Enter the tab size used when expanding tabs.",
    value: String(defaultTabSize),
    validateInput(value) {
      const parsed = Number.parseInt(value, 10);
      if (!/^\d+$/.test(value) || parsed < 1) {
        return "Enter an integer greater than or equal to 1.";
      }

      return undefined;
    }
  });

  if (input === undefined) {
    return undefined;
  }

  return Number.parseInt(input, 10);
}

/**
 * Resolves the editor tab size from per-editor options first and workspace settings second.
 * @param {vscode.TextEditor} editor Active editor.
 * @returns {number}
 */
function getEditorTabSize(editor) {
  const configured = editor.options.tabSize;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  const fallback = vscode.workspace.getConfiguration("editor", editor.document).get("tabSize");
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return 4;
}

/**
 * Reads editor typography settings so image rendering matches the user's editor closely.
 * @param {vscode.TextEditor} editor Active editor.
 * @returns {{ fontFamily: string; fontSize: number; lineHeight: number }}
 */
function getRenderOptions(editor) {
  const config = vscode.workspace.getConfiguration("editor", editor.document);
  const fontFamilySetting = config.get("fontFamily");
  const fontFamily = typeof fontFamilySetting === "string" && fontFamilySetting.trim()
    ? fontFamilySetting.split(",")[0].trim().replace(/^['"]|['"]$/g, "")
    : "Consolas";
  const fontSizeSetting = config.get("fontSize");
  const fontSize = typeof fontSizeSetting === "number" && Number.isFinite(fontSizeSetting) && fontSizeSetting > 0
    ? fontSizeSetting
    : 14;
  const lineHeightSetting = config.get("lineHeight");
  const lineHeight = typeof lineHeightSetting === "number" && Number.isFinite(lineHeightSetting) && lineHeightSetting > 0
    ? lineHeightSetting
    : Math.round(fontSize * 1.5);

  return {
    fontFamily,
    fontSize,
    lineHeight
  };
}

/**
 * Expands a selection so Pasuta always copies complete lines.
 * @param {vscode.TextDocument} document Active text document.
 * @param {vscode.Selection} selection Original selection.
 * @returns {vscode.Selection}
 */
function normalizeSelectionToWholeLines(document, selection) {
  const startLine = document.lineAt(selection.start.line);
  const endLine = document.lineAt(selection.end.line);
  return new vscode.Selection(startLine.range.start, endLine.range.end);
}

/**
 * Converts a line range into line-numbered text entries with tabs expanded.
 * @param {vscode.TextDocument} document Active text document.
 * @param {vscode.Selection} selection Whole-line selection.
 * @param {number} tabSize Number of spaces per tab.
 * @returns {Array<{ lineNumber: number; text: string }>}
 */
function collectSelectionLines(document, selection, tabSize) {
  const lines = [];

  for (let lineNumber = selection.start.line; lineNumber <= selection.end.line; lineNumber += 1) {
    const lineText = document.lineAt(lineNumber).text;
    const expanded = expandTabs(lineText, tabSize, 0);

    lines.push({
      lineNumber: lineNumber + 1,
      text: expanded
    });
  }

  return lines;
}

/**
 * Formats prepared lines for clipboard text output.
 * @param {Array<{ lineNumber: number; text: string }>} lines Prepared lines.
 * @param {"plain" | "colonLines" | "tabLines"} format Requested text format.
 * @param {number} [lineNumberWidth=0] Width used for aligned line numbers.
 * @returns {string}
 */
function formatLinesAsText(lines, format, lineNumberWidth = 0) {
  if (format === "plain") {
    return lines.map((line) => line.text).join("\n");
  }

  if (format === "tabLines") {
    return lines.map((line) => `${line.lineNumber}\t${line.text}`).join("\n");
  }

  return lines
    .map((line) => `${String(line.lineNumber).padStart(lineNumberWidth, " ")}: ${line.text}`)
    .join("\n");
}

/**
 * Returns the user-facing completion message for the selected text copy format.
 * @param {"plain" | "colonLines" | "tabLines"} format Requested text format.
 * @returns {string}
 */
function getTextCopyMessage(format) {
  if (format === "tabLines") {
    return "Copied with line numbers as tab-separated text.";
  }

  if (format === "colonLines") {
    return "Copied with expanded tabs and line numbers.";
  }

  return "Copied with expanded tabs.";
}

/**
 * Replaces tabs with spaces while preserving the current visual column.
 * @param {string} text Line text to expand.
 * @param {number} tabSize Number of spaces per tab stop.
 * @param {number} initialColumn Initial visual column.
 * @returns {string}
 */
function expandTabs(text, tabSize, initialColumn) {
  let column = initialColumn;
  let result = "";

  for (const char of text) {
    if (char === "\t") {
      const spaces = tabSize - (column % tabSize);
      result += " ".repeat(spaces);
      column += spaces;
      continue;
    }

    result += char;
    column += 1;
  }

  return result;
}

/**
 * Maps text copy modes to the line-number mode used by rich text and image rendering.
 * @param {"plain" | "colonLines" | "tabLines"} format Requested text format.
 * @returns {"none" | "colonLines" | "tabLines"}
 */
function getLineNumberMode(format) {
  if (format === "colonLines") {
    return "colonLines";
  }

  if (format === "tabLines") {
    return "tabLines";
  }

  return "none";
}

module.exports = {
  collectSelectionLines,
  expandTabs,
  formatLinesAsText,
  getEditorTabSize,
  getLineNumberMode,
  getRenderOptions,
  getTextCopyMessage,
  normalizeSelectionToWholeLines,
  prepareCopyContent,
  promptTabSize
};
