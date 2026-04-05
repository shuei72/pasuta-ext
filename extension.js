"use strict";

const vscode = require("vscode");

const {
  formatLinesAsText,
  getLineNumberMode,
  getRenderOptions,
  getTextCopyMessage,
  prepareCopyContent
} = require("./lib/copyContent");
const {
  buildHighlightedRenderData,
  copyHighlightedImage,
  copyHighlightedText
} = require("./lib/clipboard");

/**
 * Registers Pasuta commands that copy selections as formatted text or images.
 * @param {vscode.ExtensionContext} context VS Code extension context.
 */
function activate(context) {
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

/**
 * Copies the active selections as expanded plain text and falls back gracefully if rich copy fails.
 * @param {{ format: "plain" | "colonLines" | "tabLines" }} options Output format option.
 * @returns {Promise<void>}
 */
async function copySelectionsAsText({ format }) {
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

/**
 * Copies the active selections as a syntax-highlighted image using the current editor theme.
 * @param {{ lineNumberMode: "none" | "colonLines" | "tabLines" }} options Image render options.
 * @returns {Promise<void>}
 */
async function copySelectionsAsImage({ lineNumberMode }) {
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

  const message = lineNumberMode === "colonLines"
    ? "Copied image with expanded tabs and line numbers."
    : "Copied image with expanded tabs.";
  vscode.window.showInformationMessage(message);
}

/**
 * Exposes a deactivate hook for VS Code.
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate
};
