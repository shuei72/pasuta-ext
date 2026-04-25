import * as vscode from "vscode";

export type TextCopyFormat = "plain" | "colonLines" | "tabLines";
export type LineNumberMode = "none" | "colonLines" | "tabLines";
export type ThemeName = "atom-one-light" | "atom-one-dark";

export interface PreparedLine {
  lineNumber: number;
  text: string;
  sourceText?: string;
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
  tabSize: number;
}

export interface BuildHighlightedRenderDataOptions {
  lineNumberMode?: LineNumberMode;
  lineNumberWidth?: number;
  languageId: string;
  documentUri?: vscode.Uri;
  tabSize?: number;
  theme?: ThemeName;
  themeKind?: vscode.ColorThemeKind;
}

export interface CopyHighlightedTextOptions {
  lines: PreparedLine[];
  lineNumberWidth: number;
  tabSize: number;
  documentUri: vscode.Uri;
  plainText: string;
  format: TextCopyFormat;
  languageId: string;
}

const LIGHT_THEME: ThemeName = "atom-one-light";
const DARK_THEME: ThemeName = "atom-one-dark";
const LIGHT_FOREGROUND = "#383a42";
const DARK_FOREGROUND = "#abb2bf";
const LIGHT_BACKGROUND = "#fafafa";
const DARK_BACKGROUND = "#282c34";

const SHIKI_LANGUAGE_ALIASES: Record<string, string> = {
  plaintext: "text",
  text: "text",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  javascriptreact: "jsx",
  typescriptreact: "tsx",
  html: "html",
  xml: "xml",
  svg: "xml",
  mathml: "xml",
  ssml: "xml",
  xsl: "xsl",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  dockerfile: "dockerfile",
  bat: "bat",
  cmd: "batch",
  csharp: "csharp",
  "objective-c": "objective-c",
  "objective-cpp": "objective-cpp",
  powershell: "powershell",
  vb: "vb",
  kotlin: "kotlin",
  graphql: "graphql",
  makefile: "makefile"
};

type ShikiLanguage = string;

interface ShikiToken {
  content: string;
  color?: string;
}

interface SemanticHighlight {
  start: number;
  end: number;
  tokenType: string;
  color: string;
}

let highlighterPromise: Promise<any> | undefined;
let languageLoadersPromise: Promise<Record<string, () => Promise<any>>> | undefined;
const loadedThemes = new Set<ThemeName>();
const loadedLanguages = new Set<string>();

const ATOM_ONE_LIGHT_THEME = {
  // Manual adjustments:
  // - Add or tweak TextMate scope colors here when a language still looks too plain.
  // - This affects Shiki's base syntax highlighting before semantic tokens are applied.
  name: LIGHT_THEME,
  displayName: "Atom One Light",
  type: "light",
  fg: LIGHT_FOREGROUND,
  bg: LIGHT_BACKGROUND,
  settings: [
    { settings: { foreground: LIGHT_FOREGROUND, background: LIGHT_BACKGROUND } },
    { scope: ["comment", "prolog", "doctype", "cdata"], settings: { foreground: "#a0a1a7" } },
    { scope: ["punctuation"], settings: { foreground: "#383a42" } },
    {
      scope: ["property", "tag", "deleted", "variable.other.constant", "constant.language"],
      settings: { foreground: "#e45649" }
    },
    {
      scope: ["boolean", "number", "constant", "symbol", "support.type"],
      settings: { foreground: "#986801" }
    },
    { scope: ["selector", "string", "char", "inserted", "url"], settings: { foreground: "#50a14f" } },
    {
      scope: ["attr-name", "builtin", "entity.name.type", "entity.name.class", "support.class"],
      settings: { foreground: "#c18401" }
    },
    { scope: ["operator"], settings: { foreground: "#383a42" } },
    { scope: ["keyword", "storage", "storage.type"], settings: { foreground: "#a626a4" } },
    {
      scope: ["entity", "function", "entity.name.function", "support.function"],
      settings: { foreground: "#4078f2" }
    },
    { scope: ["variable", "variable.parameter"], settings: { foreground: "#e06c75" } },
    { scope: ["atrule", "keyword", "important", "namespace"], settings: { foreground: "#a626a4" } },
    { scope: ["attr-value"], settings: { foreground: "#50a14f" } },
    { scope: ["regex"], settings: { foreground: "#50a14f" } },
    { scope: ["class-name"], settings: { foreground: "#c18401" } }
  ]
} as const;

const ATOM_ONE_DARK_THEME = {
  // Manual adjustments:
  // - Keep this in sync with the light theme above.
  // - If a token is colored incorrectly in dark mode, adjust the matching scope here.
  name: DARK_THEME,
  displayName: "Atom One Dark",
  type: "dark",
  fg: DARK_FOREGROUND,
  bg: DARK_BACKGROUND,
  settings: [
    { settings: { foreground: DARK_FOREGROUND, background: DARK_BACKGROUND } },
    { scope: ["comment", "prolog", "doctype", "cdata"], settings: { foreground: "#5c6370" } },
    { scope: ["punctuation"], settings: { foreground: "#abb2bf" } },
    {
      scope: ["property", "tag", "deleted", "variable.other.constant", "constant.language"],
      settings: { foreground: "#e06c75" }
    },
    {
      scope: ["boolean", "number", "constant", "symbol", "support.type"],
      settings: { foreground: "#d19a66" }
    },
    { scope: ["selector", "string", "char", "inserted", "url"], settings: { foreground: "#98c379" } },
    {
      scope: ["attr-name", "entity.name.type", "entity.name.class", "support.class"],
      settings: { foreground: "#d19a66" }
    },
    { scope: ["builtin"], settings: { foreground: "#56b6c2" } },
    { scope: ["operator"], settings: { foreground: "#56b6c2" } },
    { scope: ["keyword", "storage", "storage.type"], settings: { foreground: "#c678dd" } },
    {
      scope: ["entity", "function", "entity.name.function", "support.function"],
      settings: { foreground: "#61afef" }
    },
    { scope: ["variable", "variable.parameter"], settings: { foreground: "#e06c75" } },
    { scope: ["atrule", "keyword", "important", "namespace"], settings: { foreground: "#c678dd" } },
    { scope: ["attr-value"], settings: { foreground: "#98c379" } },
    { scope: ["regex"], settings: { foreground: "#98c379" } },
    { scope: ["class-name"], settings: { foreground: "#e5c07b" } }
  ]
} as const;

function getSingletonHighlighter(): Promise<any> {
  highlighterPromise ??= import("@shikijs/core").then(async ({ getSingletonHighlighterCore }) => {
    const { createJavaScriptRegexEngine } = await import("@shikijs/engine-javascript");

    return getSingletonHighlighterCore({
      engine: createJavaScriptRegexEngine()
    });
  });

  return highlighterPromise;
}

function loadLanguageLoaders(): Promise<Record<string, () => Promise<any>>> {
  languageLoadersPromise ??= Promise.resolve({
    "1c": () => import("@shikijs/langs/1c").then((mod) => mod.default),
    "1c-query": () => import("@shikijs/langs/1c-query").then((mod) => mod.default),
    c: () => import("@shikijs/langs/c").then((mod) => mod.default),
    cpp: () => import("@shikijs/langs/cpp").then((mod) => mod.default),
    cs: () => import("@shikijs/langs/cs").then((mod) => mod.default),
    csharp: () => import("@shikijs/langs/csharp").then((mod) => mod.default),
    java: () => import("@shikijs/langs/java").then((mod) => mod.default),
    javascript: () => import("@shikijs/langs/javascript").then((mod) => mod.default),
    js: () => import("@shikijs/langs/js").then((mod) => mod.default),
    jsx: () => import("@shikijs/langs/jsx").then((mod) => mod.default),
    ts: () => import("@shikijs/langs/ts").then((mod) => mod.default),
    tsx: () => import("@shikijs/langs/tsx").then((mod) => mod.default),
    typescript: () => import("@shikijs/langs/typescript").then((mod) => mod.default),
    python: () => import("@shikijs/langs/python").then((mod) => mod.default),
    py: () => import("@shikijs/langs/py").then((mod) => mod.default),
    bash: () => import("@shikijs/langs/bash").then((mod) => mod.default),
    sh: () => import("@shikijs/langs/sh").then((mod) => mod.default),
    shell: () => import("@shikijs/langs/shell").then((mod) => mod.default),
    shellscript: () => import("@shikijs/langs/shellscript").then((mod) => mod.default),
    zsh: () => import("@shikijs/langs/zsh").then((mod) => mod.default),
    powershell: () => import("@shikijs/langs/powershell").then((mod) => mod.default),
    ps1: () => import("@shikijs/langs/ps1").then((mod) => mod.default),
    html: () => import("@shikijs/langs/html").then((mod) => mod.default),
    xml: () => import("@shikijs/langs/xml").then((mod) => mod.default),
    xsl: () => import("@shikijs/langs/xsl").then((mod) => mod.default),
    json: () => import("@shikijs/langs/json").then((mod) => mod.default),
    yaml: () => import("@shikijs/langs/yaml").then((mod) => mod.default),
    markdown: () => import("@shikijs/langs/markdown").then((mod) => mod.default),
    dockerfile: () => import("@shikijs/langs/dockerfile").then((mod) => mod.default),
    bat: () => import("@shikijs/langs/bat").then((mod) => mod.default),
    batch: () => import("@shikijs/langs/batch").then((mod) => mod.default),
    cmd: () => import("@shikijs/langs/cmd").then((mod) => mod.default),
    "objective-c": () => import("@shikijs/langs/objective-c").then((mod) => mod.default),
    "objective-cpp": () => import("@shikijs/langs/objective-cpp").then((mod) => mod.default),
    vb: () => import("@shikijs/langs/vb").then((mod) => mod.default),
    makefile: () => import("@shikijs/langs/makefile").then((mod) => mod.default),
    graphql: () => import("@shikijs/langs/graphql").then((mod) => mod.default)
  });

  return languageLoadersPromise;
}

export async function buildHighlightedRenderData(
  lines: PreparedLine[],
  options: BuildHighlightedRenderDataOptions
): Promise<RenderData> {
  // Convert prepared lines into colored segments that both HTML and image output can reuse.
  const theme = options.theme ?? getShikiTheme(options.themeKind);
  const lineNumberMode = options.lineNumberMode ?? "none";
  const language = await ensureShikiLanguageLoaded(options.languageId);
  const semanticHighlights = await getSemanticHighlights(
    options.documentUri,
    lines,
    options.tabSize,
    theme
  );
  const code = lines.map((line) => line.text).join("\n");
  const highlighted = await tokenizeCodeWithShiki(code, language, theme);
  const foregroundColor = highlighted.foregroundColor;
  const backgroundColor = highlighted.backgroundColor;
  const lineNumberWidth = lineNumberMode !== "none" ? options.lineNumberWidth ?? 0 : 0;

  return {
    theme,
    backgroundColor,
    foregroundColor,
    lineNumberColor: getLineNumberColor(theme),
    lines: lines.map((line, index) => {
      const segments: RenderSegment[] = [];

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

      segments.push(
        ...applySemanticHighlights(
          line,
          highlighted.lines[index] ?? [],
          semanticHighlights[index] ?? [],
          foregroundColor,
          theme
        )
      );

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

async function ensureShikiLanguageLoaded(languageId: string): Promise<ShikiLanguage> {
  // VS Code language ids do not always match Shiki names directly.
  const normalized = SHIKI_LANGUAGE_ALIASES[languageId] ?? languageId;
  const loaders = await loadLanguageLoaders();
  const loader = loaders[normalized];
  if (!loader) {
    return "text";
  }

  if (!loadedLanguages.has(normalized)) {
    const highlighter = await getSingletonHighlighter();
    await highlighter.loadLanguage(await loader());
    loadedLanguages.add(normalized);
  }

  return normalized;
}

async function ensureThemeLoaded(theme: ThemeName): Promise<void> {
  if (loadedThemes.has(theme)) {
    return;
  }

  const highlighter = await getSingletonHighlighter();
  if (theme === LIGHT_THEME) {
    highlighter.loadThemeSync(ATOM_ONE_LIGHT_THEME);
  } else {
    highlighter.loadThemeSync(ATOM_ONE_DARK_THEME);
  }
  loadedThemes.add(theme);
}

async function tokenizeCodeWithShiki(
  code: string,
  language: ShikiLanguage,
  theme: ThemeName
): Promise<{ lines: RenderSegment[][]; foregroundColor: string; backgroundColor: string }> {
  const highlighter = await getSingletonHighlighter();
  await Promise.all([ensureThemeLoaded(theme), ensureShikiLanguageLoaded(language)]);
  const tokens = await highlighter.codeToTokens(code, {
    lang: language,
    theme
  });

  const foregroundColor = tokens.fg ?? getDefaultForegroundColor(theme);
  const backgroundColor = tokens.bg ?? getDefaultBackgroundColor(theme);
  const lines = (tokens.tokens as ShikiToken[][]).map((line: ShikiToken[]) => {
    const segments = line.map((token: ShikiToken) => ({
      text: token.content,
      color: token.color ?? foregroundColor
    }));

    return mergeAdjacentSegments(segments);
  });

  return {
    lines,
    foregroundColor,
    backgroundColor
  };
}

async function getSemanticHighlights(
  documentUri: vscode.Uri | undefined,
  lines: PreparedLine[],
  tabSize: number | undefined,
  theme: ThemeName
): Promise<SemanticHighlight[][]> {
  // Manual adjustments:
  // - Expand the tokenType -> color mapping below if VS Code emits a useful semantic token
  //   type for a language you care about.
  // - This is the shared override path for "semantic" coloring across all languages.
  // - The offsets from VS Code are based on the raw document text, so we convert them to
  //   expanded columns with buildExpandedColumnMap() before overlaying colors.
  if (!documentUri || lines.length === 0) {
    return lines.map(() => []);
  }

  const safeTabSize = tabSize && tabSize > 0 ? tabSize : 4;
  const documentLineToPreparedIndexes = new Map<number, number[]>();

  lines.forEach((line, index) => {
    const existing = documentLineToPreparedIndexes.get(line.lineNumber - 1);
    if (existing) {
      existing.push(index);
      return;
    }

    documentLineToPreparedIndexes.set(line.lineNumber - 1, [index]);
  });

  let legend: vscode.SemanticTokensLegend | undefined;
  let tokens: vscode.SemanticTokens | undefined;

  try {
    [legend, tokens] = await Promise.all([
      vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
        "vscode.provideDocumentSemanticTokensLegend",
        documentUri
      ),
      vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
        "vscode.provideDocumentSemanticTokens",
        documentUri
      )
    ]);
  } catch {
    return lines.map(() => []);
  }

  if (!legend || !tokens?.data || legend.tokenTypes.length === 0) {
    return lines.map(() => []);
  }

  const semanticHighlights: SemanticHighlight[][] = lines.map(() => []);
  const data = tokens.data;
  let currentLine = 0;
  let currentChar = 0;

  for (let offset = 0; offset + 4 < data.length; offset += 5) {
    const deltaLine = data[offset];
    const deltaStart = data[offset + 1];
    const length = data[offset + 2];
    const tokenTypeIndex = data[offset + 3];

    currentLine += deltaLine;
    currentChar = deltaLine === 0 ? currentChar + deltaStart : deltaStart;

    const tokenType = legend.tokenTypes[tokenTypeIndex];
    const color = tokenType ? getSemanticTokenColor(tokenType, theme) : undefined;
    if (!tokenType || !color) {
      continue;
    }

    const preparedIndexes = documentLineToPreparedIndexes.get(currentLine);
    if (!preparedIndexes || length === 0) {
      continue;
    }

    for (const preparedIndex of preparedIndexes) {
      const preparedLine = lines[preparedIndex];
      const sourceText = preparedLine.sourceText ?? preparedLine.text;
      const columnMap = buildExpandedColumnMap(sourceText, safeTabSize);
      const start = Math.min(currentChar, sourceText.length);
      const end = Math.min(currentChar + length, sourceText.length);
      if (end <= start) {
        continue;
      }

      const expandedStart = columnMap[start];
      const expandedEnd = columnMap[end];
      if (expandedEnd <= expandedStart) {
        continue;
      }

      semanticHighlights[preparedIndex].push({
        start: expandedStart,
        end: expandedEnd,
        tokenType,
        color
      });
    }
  }

  return semanticHighlights;
}

function getSemanticTokenColor(tokenType: string, theme: ThemeName): string | undefined {
  // Manual adjustments:
  // - Add new tokenType cases here when a language exposes a semantic token that should
  //   override the normal Shiki/TextMate color.
  // - Return undefined to leave the token unchanged.
  const palette = theme === LIGHT_THEME
    ? {
        classLike: "#c18401",
        functionLike: "#4078f2",
        propertyLike: "#e45649",
        variableLike: "#e06c75",
        keywordLike: "#a626a4",
        constantLike: "#986801"
      }
    : {
        classLike: "#e5c07b",
        functionLike: "#61afef",
        propertyLike: "#e06c75",
        variableLike: "#e06c75",
        keywordLike: "#c678dd",
        constantLike: "#d19a66"
      };

  if (
    tokenType === "class" ||
    tokenType === "enum" ||
    tokenType === "interface" ||
    tokenType === "struct" ||
    tokenType === "type" ||
    tokenType === "typeParameter" ||
    tokenType === "namespace"
  ) {
    return palette.classLike;
  }

  if (tokenType === "function" || tokenType === "method") {
    return palette.functionLike;
  }

  if (tokenType === "property") {
    return palette.propertyLike;
  }

  if (tokenType === "parameter" || tokenType === "variable") {
    return palette.variableLike;
  }

  if (tokenType === "enumMember" || tokenType === "constant") {
    return palette.constantLike;
  }

  if (tokenType === "keyword" || tokenType === "operator") {
    return palette.keywordLike;
  }

  return undefined;
}

function buildExpandedColumnMap(text: string, tabSize: number): number[] {
  // Convert raw document character offsets into display columns after tab expansion.
  const map = new Array<number>(text.length + 1);
  let column = 0;
  map[0] = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\t") {
      const spaces = tabSize - (column % tabSize);
      column += spaces;
    } else {
      column += 1;
    }

    map[index + 1] = column;
  }

  return map;
}

function applySemanticHighlights(
  line: PreparedLine,
  baseSegments: RenderSegment[],
  semanticHighlights: SemanticHighlight[],
  fallbackColor: string,
  theme: ThemeName
): RenderSegment[] {
  const expandedText = line.text;
  if (expandedText.length === 0) {
    return baseSegments.length > 0 ? mergeAdjacentSegments(baseSegments) : [];
  }

  const colors = new Array<string>(expandedText.length).fill(fallbackColor);
  let cursor = 0;

  for (const segment of baseSegments) {
    const color = segment.color || fallbackColor;
    for (let index = 0; index < segment.text.length && cursor + index < colors.length; index += 1) {
      colors[cursor + index] = color;
    }
    cursor += segment.text.length;
  }

  for (const highlight of semanticHighlights) {
    const color = highlight.color || fallbackColor;
    for (let index = Math.max(0, highlight.start); index < Math.min(highlight.end, colors.length); index += 1) {
      colors[index] = color;
    }
  }

  const merged: RenderSegment[] = [];
  let runColor = colors[0];
  let runText = expandedText[0];

  for (let index = 1; index < expandedText.length; index += 1) {
    if (colors[index] === runColor) {
      runText += expandedText[index];
      continue;
    }

    merged.push({ text: runText, color: runColor });
    runColor = colors[index];
    runText = expandedText[index];
  }

  merged.push({ text: runText, color: runColor });
  return merged;
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
