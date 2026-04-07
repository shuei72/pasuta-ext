"use strict";

const vscode = require("vscode");

const LIGHT_THEME = "light-plus";
const DARK_THEME = "dark-plus";
const shikiCoreImport = import("shiki/core");
const shikiLangsImport = import("shiki/langs");
const shikiEngineImport = import("shiki/engine/oniguruma");
let shikiHighlighterPromise;

async function getShikiHighlighter() {
  if (!shikiHighlighterPromise) {
    shikiHighlighterPromise = createShikiHighlighter();
  }

  return shikiHighlighterPromise;
}

async function createShikiHighlighter() {
  const [{ createBundledHighlighter }, { bundledLanguages }, { createOnigurumaEngine }] = await Promise.all([
    shikiCoreImport,
    shikiLangsImport,
    shikiEngineImport
  ]);

  const createHighlighter = createBundledHighlighter({
    langs: bundledLanguages,
    themes: {
      [LIGHT_THEME]: () => import("@shikijs/themes/light-plus"),
      [DARK_THEME]: () => import("@shikijs/themes/dark-plus")
    },
    engine: createOnigurumaEngine(import("shiki/wasm"))
  });

  return await createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME]
  });
}

async function ensureShikiLanguageLoaded(highlighter, languageId) {
  const { bundledLanguages, bundledLanguagesAlias } = await shikiLangsImport;
  const language = resolveShikiLanguage(languageId, bundledLanguages, bundledLanguagesAlias);
  if (language === "text" || highlighter.getLoadedLanguages().includes(language)) {
    return language;
  }

  await highlighter.loadLanguage(language);
  return language;
}

/**
 * Tokenizes copied lines with Shiki and prepares a theme-aware render structure.
 * @param {Array<{ lineNumber: number; text: string }>} lines Prepared lines.
 * @param {{ lineNumberMode?: "none" | "colonLines" | "tabLines"; lineNumberWidth?: number; languageId: string; theme?: string; themeKind?: vscode.ColorThemeKind }} options Render options.
 * @returns {Promise<{ theme: string; backgroundColor: string; foregroundColor: string; lineNumberColor: string; lines: Array<Array<{ text: string; color: string }>> }>}
 */
async function buildHighlightedRenderData(lines, options) {
  const text = lines.map((line) => line.text).join("\n");
  const theme = options.theme || getShikiTheme(options.themeKind);
  const lineNumberMode = options.lineNumberMode || "none";
  const highlighter = await getShikiHighlighter();
  const language = await ensureShikiLanguageLoaded(highlighter, options.languageId);
  const result = await highlighter.codeToTokens(text, {
    lang: language,
    theme
  });
  const lineNumberWidth = lineNumberMode !== "none" ? options.lineNumberWidth || 0 : 0;

  return {
    theme,
    backgroundColor: result.bg || "#1e1e1e",
    foregroundColor: result.fg || "#d4d4d4",
    lineNumberColor: getLineNumberColor(theme),
    lines: result.tokens.map((tokens, index) => {
      const segments = [];
      if (lineNumberMode === "colonLines") {
        segments.push({
          text: `${String(lines[index].lineNumber).padStart(lineNumberWidth, " ")}: `,
          color: getLineNumberColor(theme)
        });
      }
      if (lineNumberMode === "tabLines") {
        segments.push({
          text: `${lines[index].lineNumber}\t`,
          color: getLineNumberColor(theme)
        });
      }

      for (const token of tokens) {
        segments.push({
          text: token.content,
          color: token.color || result.fg || "#d4d4d4"
        });
      }

      if (segments.length === 0) {
        segments.push({
          text: "",
          color: result.fg || "#d4d4d4"
        });
      }

      return segments;
    })
  };
}

/**
 * Chooses the bundled Shiki theme that matches the active VS Code theme family.
 * @param {vscode.ColorThemeKind | undefined} themeKind Active VS Code theme kind.
 * @returns {string}
 */
function getShikiTheme(themeKind) {
  if (themeKind === vscode.ColorThemeKind.Light || themeKind === vscode.ColorThemeKind.HighContrastLight) {
    return LIGHT_THEME;
  }

  return DARK_THEME;
}

/**
 * Returns the line-number color used for the selected bundled Shiki theme.
 * @param {string} theme Selected Shiki theme.
 * @returns {string}
 */
function getLineNumberColor(theme) {
  return theme === LIGHT_THEME ? "#237893" : "#858585";
}

/**
 * Resolves a VS Code language identifier to a bundled Shiki language.
 * @param {string} languageId Active document language id.
 * @param {Record<string, unknown>} bundledLanguages Shiki bundled languages.
 * @param {Record<string, string>} bundledLanguagesAlias Shiki language aliases.
 * @returns {string}
 */
function resolveShikiLanguage(languageId, bundledLanguages, bundledLanguagesAlias) {
  if (languageId === "plaintext") {
    return "text";
  }

  if (languageId in bundledLanguages) {
    return languageId;
  }

  const aliases = Object.entries(bundledLanguagesAlias);
  for (const [alias, target] of aliases) {
    if (alias === languageId) {
      return target;
    }
  }

  return "text";
}

/**
 * Estimates a square thumbnail size that keeps the generated macOS preview legible.
 * @param {{ lines: Array<Array<{ text: string }>> }} renderData Prepared render data.
 * @param {{ fontSize: number; lineHeight: number }} options Render dimensions.
 * @returns {number}
 */
function estimateMacThumbnailSize(renderData, options) {
  const paddingX = 5;
  const paddingY = 5;
  const charWidth = options.fontSize * 0.62;
  const maxLineLength = renderData.lines.reduce((max, line) => {
    const length = line.reduce((sum, segment) => sum + segment.text.length, 0);
    return Math.max(max, length);
  }, 0);
  const width = Math.max(1, Math.ceil((maxLineLength * charWidth) + (paddingX * 2)));
  const height = Math.max(1, Math.ceil((renderData.lines.length * options.lineHeight) + (paddingY * 2)));
  return Math.max(width, height);
}

/**
 * Builds SVG markup used for image clipboard formats on Linux and macOS.
 * @param {{ backgroundColor: string; foregroundColor: string; lines: Array<Array<{ text: string; color: string }>> }} renderData Prepared render data.
 * @param {{ fontFamily: string; fontSize: number; lineHeight: number }} options Render options.
 * @returns {string}
 */
function buildSvgImage(renderData, options) {
  const paddingX = 5;
  const paddingY = 5;
  const charWidth = options.fontSize * 0.62;
  const maxLineLength = renderData.lines.reduce((max, line) => {
    const length = line.reduce((sum, segment) => sum + segment.text.length, 0);
    return Math.max(max, length);
  }, 0);
  const width = Math.max(1, Math.ceil((maxLineLength * charWidth) + (paddingX * 2)));
  const height = Math.max(1, Math.ceil((renderData.lines.length * options.lineHeight) + (paddingY * 2)));
  const escapedFontFamily = escapeXmlAttribute(options.fontFamily);
  const lineMarkup = renderData.lines.map((segments, index) => {
    const y = paddingY + ((index + 1) * options.lineHeight) - Math.max(2, options.lineHeight * 0.25);
    const segmentMarkup = segments.map((segment) => {
      const fill = escapeXmlAttribute(segment.color || renderData.foregroundColor);
      return `<tspan fill="${fill}">${escapeXmlText(segment.text)}</tspan>`;
    }).join("");

    return `<text x="${paddingX}" y="${y}" xml:space="preserve">${segmentMarkup}</text>`;
  }).join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${escapeXmlAttribute(renderData.backgroundColor)}"/>`,
    `<style>text{font-family:${escapedFontFamily},monospace;font-size:${options.fontSize}px;dominant-baseline:alphabetic;}</style>`,
    lineMarkup,
    `</svg>`
  ].join("");
}

/**
 * Builds clipboard-safe HTML that preserves coloring and spacing for rich text paste targets.
 * @param {{ backgroundColor: string; foregroundColor: string; lines: Array<Array<{ text: string; color: string }>> }} renderData Prepared render data.
 * @param {string} fontFamily Rich text font stack.
 * @returns {string}
 */
function buildHtmlClipboard(renderData, fontFamily) {
  const htmlLines = renderData.lines.map((segments) => {
    const spans = segments.map((segment) => {
      const color = escapeHtmlAttribute(segment.color || renderData.foregroundColor);
      return `<span style="color:${color};">${escapeHtmlTextPreservingSpaces(segment.text)}</span>`;
    }).join("");
    return `<div>${spans}</div>`;
  }).join("");

  return [
    "<!DOCTYPE html>",
    `<html><body style="margin:0;"><!--StartFragment--><div style="margin:0;padding:0;background:${escapeHtmlAttribute(renderData.backgroundColor)};color:${escapeHtmlAttribute(renderData.foregroundColor)};font-family:${escapeHtmlAttribute(fontFamily)};font-size:12pt;line-height:1.5;white-space:normal;">${htmlLines}</div><!--EndFragment--></body></html>`
  ].join("");
}

/**
 * Returns the monospaced font stack used for rich text clipboard output.
 * @returns {string}
 */
function getRichTextFontFamily() {
  if (process.platform === "darwin") {
    return "Menlo, Monaco, 'Courier New', monospace";
  }

  return "Consolas, 'Courier New', monospace";
}

/**
 * Escapes text nodes for XML output.
 * @param {string} value Source text.
 * @returns {string}
 */
function escapeXmlText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escapes XML attribute values.
 * @param {string} value Source text.
 * @returns {string}
 */
function escapeXmlAttribute(value) {
  return escapeXmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escapes HTML text while preserving spaces for code copy output.
 * @param {string} value Source text.
 * @returns {string}
 */
function escapeHtmlTextPreservingSpaces(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ /g, "&nbsp;");
}

/**
 * Escapes HTML attribute values.
 * @param {string} value Source text.
 * @returns {string}
 */
function escapeHtmlAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  buildHighlightedRenderData,
  buildHtmlClipboard,
  buildSvgImage,
  estimateMacThumbnailSize,
  getLineNumberColor,
  getRichTextFontFamily,
  getShikiTheme,
  resolveShikiLanguage
};
