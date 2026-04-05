"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const vscode = require("vscode");

const execFileAsync = promisify(execFile);

const {
  buildHighlightedRenderData,
  buildHtmlClipboard,
  buildSvgImage,
  estimateMacThumbnailSize,
  getRichTextFontFamily
} = require("./rendering");
const { getLineNumberMode } = require("./copyContent");

/**
 * Copies syntax-highlighted rich text when the platform supports HTML clipboard formats.
 * @param {{ lines: Array<{ lineNumber: number; text: string }>; lineNumberWidth: number; plainText: string; format: "plain" | "colonLines" | "tabLines"; languageId: string }} options Text copy options.
 * @returns {Promise<void>}
 */
async function copyHighlightedText({ lines, lineNumberWidth, plainText, format, languageId }) {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    await vscode.env.clipboard.writeText(plainText);
    return;
  }

  const renderData = await buildHighlightedRenderData(lines, {
    lineNumberMode: getLineNumberMode(format),
    lineNumberWidth,
    languageId,
    theme: "light-plus"
  });
  const html = buildHtmlClipboard(renderData, getRichTextFontFamily());

  if (process.platform === "win32") {
    await copyHighlightedTextWindows(plainText, html);
    return;
  }

  await copyHighlightedTextMac(plainText, html);
}

/**
 * Routes image clipboard generation to the platform-specific implementation.
 * @param {{ lines: Array<Array<{ text: string; color: string }>> }} renderData Prepared render data.
 * @param {{ fontFamily: string; fontSize: number; lineHeight: number }} options Render options.
 * @returns {Promise<void>}
 */
async function copyHighlightedImage(renderData, options) {
  if (process.platform === "win32") {
    return copyHighlightedImageWindows(renderData, options);
  }

  if (process.platform === "linux") {
    return copyHighlightedImageLinux(renderData, options);
  }

  if (process.platform === "darwin") {
    return copyHighlightedImageMac(renderData, options);
  }

  throw new Error("Image copy is currently supported on Windows, Linux, and macOS only.");
}

/**
 * Writes plain text and HTML fragments to a PowerShell helper that populates the Windows clipboard.
 * @param {string} plainText Plain text fallback text.
 * @param {string} html Rich HTML fragment.
 * @returns {Promise<void>}
 */
async function copyHighlightedTextWindows(plainText, html) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pasuta-"));
  const textPath = path.join(tempDir, "content.txt");
  const htmlPath = path.join(tempDir, "content.html");
  const scriptPath = path.join(__dirname, "..", "scripts", "copyRichTextToClipboard.ps1");

  try {
    await fs.writeFile(textPath, plainText, "utf8");
    await fs.writeFile(htmlPath, html, "utf8");
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Sta",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-TextFilePath",
        textPath,
        "-HtmlFilePath",
        htmlPath
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Renders JSON payloads through the bundled PowerShell helper and copies the result as an image on Windows.
 * @param {unknown} renderData Prepared render data.
 * @param {{ fontFamily: string; fontSize: number; lineHeight: number }} options Render options.
 * @returns {Promise<void>}
 */
async function copyHighlightedImageWindows(renderData, options) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pasuta-"));
  const jsonPath = path.join(tempDir, "content.json");
  const scriptPath = path.join(__dirname, "..", "scripts", "copyTextAsImage.ps1");

  try {
    await fs.writeFile(jsonPath, JSON.stringify(renderData), "utf8");

    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Sta",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-JsonFilePath",
        jsonPath,
        "-FontFamily",
        options.fontFamily,
        "-FontSize",
        String(options.fontSize),
        "-LineHeight",
        String(options.lineHeight)
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Pipes SVG markup into common Linux clipboard tools until one succeeds.
 * @param {unknown} renderData Prepared render data.
 * @param {{ fontFamily: string; fontSize: number; lineHeight: number }} options Render options.
 * @returns {Promise<void>}
 */
async function copyHighlightedImageLinux(renderData, options) {
  const svg = buildSvgImage(renderData, options);
  const attempts = [
    {
      command: "wl-copy",
      args: ["--type", "image/svg+xml"]
    },
    {
      command: "xclip",
      args: ["-selection", "clipboard", "-t", "image/svg+xml", "-i"]
    }
  ];
  const failures = [];

  for (const attempt of attempts) {
    try {
      await runCommandWithInput(attempt.command, attempt.args, svg);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${attempt.command}: ${detail}`);
    }
  }

  throw new Error(
    "No supported Linux clipboard command succeeded. Tried wl-copy, then xclip. " +
      "Install wl-clipboard or xclip. Details: " +
      failures.join(" | ")
  );
}

/**
 * Converts SVG markup to a PNG preview on macOS and places it on the clipboard.
 * @param {unknown} renderData Prepared render data.
 * @param {{ fontFamily: string; fontSize: number; lineHeight: number }} options Render options.
 * @returns {Promise<void>}
 */
async function copyHighlightedImageMac(renderData, options) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pasuta-"));
  const svgPath = path.join(tempDir, "content.svg");
  const pngDir = path.join(tempDir, "ql");
  const scriptPath = path.join(__dirname, "..", "scripts", "copyImageToClipboardMac.js");

  try {
    const svg = buildSvgImage(renderData, options);
    await fs.mkdir(pngDir, { recursive: true });
    await fs.writeFile(svgPath, svg, "utf8");

    const size = estimateMacThumbnailSize(renderData, options);
    await execFileAsync("qlmanage", ["-t", "-s", String(size), "-o", pngDir, svgPath], {
      maxBuffer: 1024 * 1024
    });

    const pngPath = await findGeneratedPng(pngDir);
    await execFileAsync("osascript", ["-l", "JavaScript", scriptPath, pngPath], {
      maxBuffer: 1024 * 1024
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Sends plain text and HTML fragments to the macOS clipboard helper script.
 * @param {string} plainText Plain text fallback text.
 * @param {string} html Rich HTML fragment.
 * @returns {Promise<void>}
 */
async function copyHighlightedTextMac(plainText, html) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pasuta-"));
  const textPath = path.join(tempDir, "content.txt");
  const htmlPath = path.join(tempDir, "content.html");
  const scriptPath = path.join(__dirname, "..", "scripts", "copyRichTextToClipboardMac.js");

  try {
    await fs.writeFile(textPath, plainText, "utf8");
    await fs.writeFile(htmlPath, html, "utf8");
    await execFileAsync("osascript", ["-l", "JavaScript", scriptPath, textPath, htmlPath], {
      maxBuffer: 1024 * 1024
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Finds the PNG preview generated by macOS Quick Look.
 * @param {string} directoryPath Directory containing generated previews.
 * @returns {Promise<string>}
 */
async function findGeneratedPng(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const pngEntry = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"));
  if (!pngEntry) {
    throw new Error("qlmanage did not generate a PNG preview.");
  }

  return path.join(directoryPath, pngEntry.name);
}

/**
 * Spawns a clipboard command and writes the provided text to stdin.
 * @param {string} command Executable name.
 * @param {string[]} args Command arguments.
 * @param {string} input Text payload written to stdin.
 * @returns {Promise<void>}
 */
function runCommandWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";

    child.on("error", reject);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });

    child.stdin.end(input, "utf8");
  });
}

module.exports = {
  buildHighlightedRenderData,
  copyHighlightedImage,
  copyHighlightedText,
  runCommandWithInput
};
