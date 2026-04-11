import * as vscode from "vscode";
import Prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-batch";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";

export type TextCopyFormat = "plain" | "colonLines" | "tabLines";
export type LineNumberMode = "none" | "colonLines" | "tabLines";
export type ThemeName = "light-plus" | "dark-plus";

export interface PreparedLine {
  lineNumber: number;
  text: string;
}

export interface RenderSegment {
  text: string;
  color: string;
}

export interface RenderData {
  theme: ThemeName;
  backgroundColor: string;
  foregroundColor: string;
  lineNumberColor: string;
  lines: RenderSegment[][];
}

export interface RenderOptions {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export interface PrepareCopyContentResult {
  editor: vscode.TextEditor;
  lines: PreparedLine[];
  lineNumberWidth: number;
}

export interface BuildHighlightedRenderDataOptions {
  lineNumberMode?: LineNumberMode;
  lineNumberWidth?: number;
  languageId: string;
  theme?: ThemeName;
  themeKind?: vscode.ColorThemeKind;
}

export interface CopyHighlightedTextOptions {
  lines: PreparedLine[];
  lineNumberWidth: number;
  plainText: string;
  format: TextCopyFormat;
  languageId: string;
}

const LIGHT_THEME: ThemeName = "light-plus";
const DARK_THEME: ThemeName = "dark-plus";
const LIGHT_FOREGROUND = "#383a42";
const DARK_FOREGROUND = "#abb2bf";
const LIGHT_BACKGROUND = "#fafafa";
const DARK_BACKGROUND = "#282c34";

const PRISM_LANGUAGE_ALIASES: Record<string, string> = {
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

const LIGHT_TOKEN_COLORS: Record<string, string> = {
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

const DARK_TOKEN_COLORS: Record<string, string> = {
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

type PrismToken = string | Prism.Token;

export async function buildHighlightedRenderData(
  lines: PreparedLine[],
  options: BuildHighlightedRenderDataOptions
): Promise<RenderData> {
  // Convert prepared lines into colored segments that both HTML and image output can reuse.
  const theme = options.theme ?? getShikiTheme(options.themeKind);
  const lineNumberMode = options.lineNumberMode ?? "none";
  const language = ensurePrismLanguageLoaded(options.languageId);
  const foregroundColor = getDefaultForegroundColor(theme);
  const lineNumberWidth = lineNumberMode !== "none" ? options.lineNumberWidth ?? 0 : 0;

  return {
    theme,
    backgroundColor: getDefaultBackgroundColor(theme),
    foregroundColor,
    lineNumberColor: getLineNumberColor(theme),
    lines: lines.map((line) => {
      const segments = [];

      if (lineNumberMode === "colonLines") {
        segments.push({
          text: `${String(line.lineNumber).padStart(lineNumberWidth, " ")}: `,
          color: getLineNumberColor(theme)
        });
      }

      if (lineNumberMode === "tabLines") {
        segments.push({
          text: `${line.lineNumber}\t`,
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

export function getShikiTheme(themeKind?: vscode.ColorThemeKind): ThemeName {
  if (
    themeKind === vscode.ColorThemeKind.Light ||
    themeKind === vscode.ColorThemeKind.HighContrastLight
  ) {
    return LIGHT_THEME;
  }

  return DARK_THEME;
}

export function getLineNumberColor(theme: ThemeName): string {
  return theme === LIGHT_THEME ? "#a0a1a7" : "#5c6370";
}

export function getDefaultForegroundColor(theme: ThemeName): string {
  return theme === LIGHT_THEME ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

export function getDefaultBackgroundColor(theme: ThemeName): string {
  return theme === LIGHT_THEME ? LIGHT_BACKGROUND : DARK_BACKGROUND;
}

export function estimateMacThumbnailSize(renderData: RenderData, options: RenderOptions): number {
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

export function buildSvgImage(renderData: RenderData, options: RenderOptions): string {
  // SVG keeps image generation dependency-light across platforms.
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
  const lineMarkup = renderData.lines
    .map((segments, index) => {
      const y =
        paddingY + ((index + 1) * options.lineHeight) - Math.max(2, options.lineHeight * 0.25);
      const segmentMarkup = segments
        .map((segment) => {
          const fill = escapeXmlAttribute(segment.color || renderData.foregroundColor);
          return `<tspan fill="${fill}">${escapeXmlText(segment.text)}</tspan>`;
        })
        .join("");

      return `<text x="${paddingX}" y="${y}" xml:space="preserve">${segmentMarkup}</text>`;
    })
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${escapeXmlAttribute(renderData.backgroundColor)}"/>`,
    `<style>text{font-family:${escapedFontFamily},monospace;font-size:${options.fontSize}px;dominant-baseline:alphabetic;}</style>`,
    lineMarkup,
    `</svg>`
  ].join("");
}

export function buildHtmlClipboard(renderData: RenderData, fontFamily: string): string {
  // Rich text is built as simple inline-colored spans for broad paste compatibility.
  const htmlLines = renderData.lines
    .map((segments) => {
      const spans = segments
        .map((segment) => {
          const color = escapeHtmlAttribute(segment.color || renderData.foregroundColor);
          return `<span style="color:${color};">${escapeHtmlTextPreservingSpaces(segment.text)}</span>`;
        })
        .join("");
      return `<div>${spans}</div>`;
    })
    .join("");

  return [
    "<!DOCTYPE html>",
    `<html><body style="margin:0;"><!--StartFragment--><div style="margin:0;padding:0;background:${escapeHtmlAttribute(renderData.backgroundColor)};color:${escapeHtmlAttribute(renderData.foregroundColor)};font-family:${escapeHtmlAttribute(fontFamily)};font-size:12pt;line-height:1.5;white-space:normal;">${htmlLines}</div><!--EndFragment--></body></html>`
  ].join("");
}

export function getRichTextFontFamily(): string {
  if (process.platform === "darwin") {
    return "Menlo, Monaco, 'Courier New', monospace";
  }

  return "Consolas, 'Courier New', monospace";
}

function ensurePrismLanguageLoaded(languageId: string): string {
  // VS Code language ids do not always match Prism names directly.
  const normalized = PRISM_LANGUAGE_ALIASES[languageId] ?? languageId;
  return normalized in Prism.languages ? normalized : "plain";
}

function tokenizeLineWithPrism(
  text: string,
  language: string,
  theme: ThemeName
): RenderSegment[] {
  const grammar = language === "plain" ? undefined : Prism.languages[language];
  if (!grammar) {
    return [{ text, color: getDefaultForegroundColor(theme) }];
  }

  const tokens = Prism.tokenize(text, grammar);
  const segments = flattenPrismTokens(tokens, [], theme);
  if (segments.length === 0) {
    return [{ text, color: getDefaultForegroundColor(theme) }];
  }

  return mergeAdjacentSegments(segments);
}

function flattenPrismTokens(
  tokens: PrismToken[],
  activeTypes: string[],
  theme: ThemeName
): RenderSegment[] {
  // Flatten nested Prism tokens so downstream renderers only need plain text segments.
  const segments: RenderSegment[] = [];

  for (const token of tokens) {
    if (typeof token === "string") {
      segments.push({
        text: token,
        color: getTokenColor(activeTypes, theme)
      });
      continue;
    }

    const aliases = token.alias === undefined
      ? []
      : Array.isArray(token.alias)
        ? token.alias
        : [token.alias];
    const types = [...activeTypes, token.type, ...aliases];
    const content = Array.isArray(token.content) ? token.content : [token.content];
    segments.push(...flattenPrismTokens(content, types, theme));
  }

  return segments;
}

function mergeAdjacentSegments(segments: RenderSegment[]): RenderSegment[] {
  const merged: RenderSegment[] = [];

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

function getTokenColor(types: string[], theme: ThemeName): string {
  const palette = theme === LIGHT_THEME ? LIGHT_TOKEN_COLORS : DARK_TOKEN_COLORS;

  for (let index = types.length - 1; index >= 0; index -= 1) {
    const color = palette[types[index]];
    if (color) {
      return color;
    }
  }

  return getDefaultForegroundColor(theme);
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtmlTextPreservingSpaces(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ /g, "&nbsp;");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
