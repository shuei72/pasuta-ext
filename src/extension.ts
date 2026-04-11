import * as vscode from "vscode";
import {
  formatLinesAsText,
  getLineNumberMode,
  getRenderOptions,
  getTextCopyMessage,
  prepareCopyContent
} from "./copyContent";
import { copyHighlightedImage, copyHighlightedText } from "./clipboard";
import {
  buildHighlightedRenderData,
  type LineNumberMode,
  type TextCopyFormat
} from "./rendering";

export function activate(context: vscode.ExtensionContext): void {
  // Register all copy commands up front so the extension can stay activation-light.
  context.subscriptions.push(
    vscode.commands.registerCommand("pasuta.copyText", () => {
      return copySelectionsAsText({ format: "plain" });
    }),
    vscode.commands.registerCommand("pasuta.copyTextWithColonLines", () => {
      return copySelectionsAsText({ format: "colonLines" });
    }),
    vscode.commands.registerCommand("pasuta.copyTextWithTabLines", () => {
      return copySelectionsAsText({ format: "tabLines" });
    }),
    vscode.commands.registerCommand("pasuta.copyImage", () => {
      return copySelectionsAsImage({ lineNumberMode: "none" });
    }),
    vscode.commands.registerCommand("pasuta.copyImageWithColonLines", () => {
      return copySelectionsAsImage({ lineNumberMode: "colonLines" });
    })
  );
}

async function copySelectionsAsText(
  { format }: { format: TextCopyFormat }
): Promise<void> {
  // Normalize selections first so plain text and rich text share the same source lines.
  const prepared = await prepareCopyContent({ lineNumberMode: getLineNumberMode(format) });
  if (!prepared) {
    return;
  }

  const plainText = formatLinesAsText(prepared.lines, format, prepared.lineNumberWidth);
  const languageId = prepared.editor.document.languageId;

  try {
    await copyHighlightedText({
      lines: prepared.lines,
      lineNumberWidth: prepared.lineNumberWidth,
      plainText,
      format,
      languageId
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`Rich copy failed, copied plain text instead: ${detail}`);
    await vscode.env.clipboard.writeText(plainText);
  }

  vscode.window.showInformationMessage(getTextCopyMessage(format));
}

async function copySelectionsAsImage(
  { lineNumberMode }: { lineNumberMode: LineNumberMode }
): Promise<void> {
  // Image output uses the same prepared lines, but renders them with theme-aware colors.
  const prepared = await prepareCopyContent({ lineNumberMode });
  if (!prepared) {
    return;
  }

  const renderOptions = getRenderOptions(prepared.editor);
  const languageId = prepared.editor.document.languageId;

  try {
    const renderData = await buildHighlightedRenderData(prepared.lines, {
      lineNumberMode,
      lineNumberWidth: prepared.lineNumberWidth,
      languageId,
      themeKind: vscode.window.activeColorTheme.kind
    });
    await copyHighlightedImage(renderData, renderOptions);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to copy image: ${detail}`);
    return;
  }

  const message =
    lineNumberMode === "colonLines"
      ? "Copied image with expanded tabs and line numbers."
      : "Copied image with expanded tabs.";
  vscode.window.showInformationMessage(message);
}

export function deactivate(): void {}
