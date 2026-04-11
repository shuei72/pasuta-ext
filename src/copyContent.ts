import * as vscode from "vscode";
import type {
  LineNumberMode,
  PrepareCopyContentResult,
  PreparedLine,
  RenderOptions,
  TextCopyFormat
} from "./rendering";

export async function prepareCopyContent(
  _options: { lineNumberMode: LineNumberMode }
): Promise<PrepareCopyContentResult | undefined> {
  // Gather editor state once here so every copy path works from the same normalized input.
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
  const copiedText = normalizedSelections.flatMap((selection) =>
    collectSelectionLines(document, selection, tabSize)
  );

  return {
    editor,
    lines: copiedText,
    lineNumberWidth: String(document.lineCount).length
  };
}

export async function promptTabSize(
  editor: vscode.TextEditor
): Promise<number | undefined> {
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

export function getEditorTabSize(editor: vscode.TextEditor): number {
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

export function getRenderOptions(editor: vscode.TextEditor): RenderOptions {
  // Reuse the editor's typography settings so copied images feel close to the source view.
  const config = vscode.workspace.getConfiguration("editor", editor.document);
  const fontFamilySetting = config.get("fontFamily");
  const fontFamily =
    typeof fontFamilySetting === "string" && fontFamilySetting.trim()
      ? fontFamilySetting.split(",")[0].trim().replace(/^['"]|['"]$/g, "")
      : "Consolas";
  const fontSizeSetting = config.get("fontSize");
  const fontSize =
    typeof fontSizeSetting === "number" && Number.isFinite(fontSizeSetting) && fontSizeSetting > 0
      ? fontSizeSetting
      : 14;
  const lineHeightSetting = config.get("lineHeight");
  const lineHeight =
    typeof lineHeightSetting === "number" &&
    Number.isFinite(lineHeightSetting) &&
    lineHeightSetting > 0
      ? lineHeightSetting
      : Math.round(fontSize * 1.5);

  return {
    fontFamily,
    fontSize,
    lineHeight
  };
}

export function normalizeSelectionToWholeLines(
  document: vscode.TextDocument,
  selection: vscode.Selection
): vscode.Selection {
  const startLine = document.lineAt(selection.start.line);
  const endLine = document.lineAt(selection.end.line);

  return new vscode.Selection(startLine.range.start, endLine.range.end);
}

export function collectSelectionLines(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  tabSize: number
): PreparedLine[] {
  // Tabs are expanded line by line so alignment is stable after paste.
  const lines: PreparedLine[] = [];

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

export function formatLinesAsText(
  lines: PreparedLine[],
  format: TextCopyFormat,
  lineNumberWidth = 0
): string {
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

export function getTextCopyMessage(format: TextCopyFormat): string {
  if (format === "tabLines") {
    return "Copied with line numbers as tab-separated text.";
  }

  if (format === "colonLines") {
    return "Copied with expanded tabs and line numbers.";
  }

  return "Copied with expanded tabs.";
}

export function expandTabs(text: string, tabSize: number, initialColumn: number): string {
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

export function getLineNumberMode(format: TextCopyFormat): LineNumberMode {
  if (format === "colonLines") {
    return "colonLines";
  }

  if (format === "tabLines") {
    return "tabLines";
  }

  return "none";
}
