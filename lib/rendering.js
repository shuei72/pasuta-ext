"use strict";

const vscode = require("vscode");
const Prism = require("prismjs");
require("prismjs/components/prism-markup");
require("prismjs/components/prism-clike");
require("prismjs/components/prism-javascript");
require("prismjs/components/prism-typescript");
require("prismjs/components/prism-jsx");
require("prismjs/components/prism-tsx");
require("prismjs/components/prism-c");
require("prismjs/components/prism-cpp");
require("prismjs/components/prism-csharp");
require("prismjs/components/prism-java");
require("prismjs/components/prism-python");
require("prismjs/components/prism-bash");
require("prismjs/components/prism-powershell");
require("prismjs/components/prism-batch");
require("prismjs/components/prism-json");
require("prismjs/components/prism-yaml");
require("prismjs/components/prism-markdown");

const LIGHT_THEME = "light-plus";
const DARK_THEME = "dark-plus";
const LIGHT_FOREGROUND = "#383a42";
const DARK_FOREGROUND = "#abb2bf";
const LIGHT_BACKGROUND = "#fafafa";
const DARK_BACKGROUND = "#282c34";
const PRISM_LANGUAGE_ALIASES = {
  plaintext: "plain",
  text: "plain",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  javascriptreact: "jsx",
  typescriptreact: "tsx",
  html: "markup",
  xml: "markup",
  svg: "markup",
  mathml: "markup",
  ssml: "markup",
  xsl: "markup",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  dockerfile: "docker",
  bat: "batch",
  cmd: "batch",
  csharp: "cs",
  "objective-c": "objectivec",
  "objective-cpp": "objectivec",
  powershell: "powershell",
  vb: "visual-basic",
  kotlin: "kotlin",
  graphql: "graphql",
  makefile: "makefile"
};
const LIGHT_TOKEN_COLORS = {
  comment: "#a0a1a7",
  prolog: "#a0a1a7",
  doctype: "#a0a1a7",
  cdata: "#a0a1a7",
  punctuation: "#383a42",
  property: "#986801",
  tag: "#e45649",
  boolean: "#986801",
  number: "#986801",
  constant: "#986801",
  symbol: "#986801",
  deleted: "#e45649",
  selector: "#50a14f",
  "attr-name": "#c18401",
  string: "#50a14f",
  char: "#50a14f",
  builtin: "#c18401",
  inserted: "#50a14f",
  operator: "#383a42",
  entity: "#4078f2",
  url: "#50a14f",
  variable: "#e06c75",
  atrule: "#a626a4",
  "attr-value": "#50a14f",
  function: "#4078f2",
  keyword: "#a626a4",
  regex: "#50a14f",
  important: "#a626a4",
  namespace: "#a626a4",
  "class-name": "#c18401"
};
const DARK_TOKEN_COLORS = {
  comment: "#5c6370",
  prolog: "#5c6370",
  doctype: "#5c6370",
  cdata: "#5c6370",
  punctuation: "#abb2bf",
  property: "#d19a66",
  tag: "#e06c75",
  boolean: "#d19a66",
  number: "#d19a66",
  constant: "#d19a66",
  symbol: "#d19a66",
  deleted: "#e06c75",
  selector: "#98c379",
  "attr-name": "#d19a66",
  string: "#98c379",
  char: "#98c379",
  builtin: "#56b6c2",
  inserted: "#98c379",
  operator: "#56b6c2",
  entity: "#61afef",
  url: "#98c379",
  variable: "#e06c75",
  atrule: "#c678dd",
  "attr-value": "#98c379",
  function: "#61afef",
  keyword: "#c678dd",
  regex: "#98c379",
  important: "#c678dd",
  namespace: "#c678dd",
  "class-name": "#e5c07b"
};

/**
 * Tokenizes copied lines with Shiki and prepares a theme-aware render structure.
 * @param {Array<{ lineNumber: number; text: string }>} lines Prepared lines.
 * @param {{ lineNumberMode?: "none" | "colonLines" | "tabLines"; lineNumberWidth?: number; languageId: string; theme?: string; themeKind?: vscode.ColorThemeKind }} options Render options.
 * @returns {Promise<{ theme: string; backgroundColor: string; foregroundColor: string; lineNumberColor: string; lines: Array<Array<{ text: string; color: string }>> }>}
 */
async function buildHighlightedRenderData(lines, options) {
  const theme = options.theme || getShikiTheme(options.themeKind);
  const lineNumberMode = options.lineNumberMode || "none";
  const language = ensurePrismLanguageLoaded(options.languageId);
  const foregroundColor = getDefaultForegroundColor(theme);
  const backgroundColor = getDefaultBackgroundColor(theme);
  const lineNumberWidth = lineNumberMode !== "none" ? options.lineNumberWidth || 0 : 0;

  return {
    theme,
    backgroundColor,
    foregroundColor,
    lineNumberColor: getLineNumberColor(theme),
    lines: lines.map((line, index) => {
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

      segments.push(...tokenizeLineWithPrism(line.text, language, theme));

      if (segments.length === 0) {
        segments.push({
          text: "",
          color: foregroundColor
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
  return theme === LIGHT_THEME ? "#a0a1a7" : "#5c6370";
}

/**
 * Resolves a VS Code language identifier to a Prism language and loads it on demand.
 * @param {string} languageId Active document language id.
 * @returns {string}
 */
function ensurePrismLanguageLoaded(languageId) {
  const normalized = PRISM_LANGUAGE_ALIASES[languageId] || languageId;
  return normalized in Prism.languages ? normalized : "plain";
}

function tokenizeLineWithPrism(text, language, theme) {
  const grammar = language === "plain" ? undefined : Prism.languages[language];
  if (!grammar) {
    return [{
      text,
      color: getDefaultForegroundColor(theme)
    }];
  }

  const tokens = Prism.tokenize(text, grammar);
  const segments = flattenPrismTokens(tokens, [], theme);
  if (segments.length === 0) {
    return [{
      text,
      color: getDefaultForegroundColor(theme)
    }];
  }

  return mergeAdjacentSegments(segments);
}

function flattenPrismTokens(tokens, activeTypes, theme) {
  const segments = [];

  for (const token of tokens) {
    if (typeof token === "string") {
      segments.push({
        text: token,
        color: getTokenColor(activeTypes, theme)
      });
      continue;
    }

    const types = [...activeTypes, token.type, ...(token.alias ? [].concat(token.alias) : [])];
    const content = Array.isArray(token.content) ? token.content : [token.content];
    segments.push(...flattenPrismTokens(content, types, theme));
  }

  return segments;
}

function mergeAdjacentSegments(segments) {
  const merged = [];

  for (const segment of segments) {
    if (segment.text.length === 0) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && previous.color === segment.color) {
      previous.text += segment.text;
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

function getTokenColor(types, theme) {
  const palette = theme === LIGHT_THEME ? LIGHT_TOKEN_COLORS : DARK_TOKEN_COLORS;
  for (let index = types.length - 1; index >= 0; index -= 1) {
    const color = palette[types[index]];
    if (color) {
      return color;
    }
  }

  return getDefaultForegroundColor(theme);
}

function getDefaultForegroundColor(theme) {
  return theme === LIGHT_THEME ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

function getDefaultBackgroundColor(theme) {
  return theme === LIGHT_THEME ? LIGHT_BACKGROUND : DARK_BACKGROUND;
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
  ensurePrismLanguageLoaded,
  estimateMacThumbnailSize,
  getLineNumberColor,
  getRichTextFontFamily,
  getShikiTheme,
  getTokenColor,
  tokenizeLineWithPrism
};
