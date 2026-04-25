import { execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import * as vscode from "vscode";
import { getLineNumberMode } from "./copyContent";
import {
  buildHighlightedRenderData,
  buildHtmlClipboard,
  buildSvgImage,
  estimateMacThumbnailSize,
  getRichTextFontFamily,
  getShikiTheme
} from "./rendering";
import type { CopyHighlightedTextOptions, RenderData, RenderOptions } from "./rendering";

const execFileAsync = promisify(execFile);

export async function copyHighlightedText({
  lines,
  lineNumberWidth,
  plainText,
  format,
  languageId
}: CopyHighlightedTextOptions): Promise<void> {
  // Rich clipboard formats are platform-specific, so unsupported platforms fall back to plain text.
  if (process.platform !== "win32" && process.platform !== "darwin") {
    await vscode.env.clipboard.writeText(plainText);
    return;
  }

  const renderData = await buildHighlightedRenderData(lines, {
    lineNumberMode: getLineNumberMode(format),
    lineNumberWidth,
    languageId,
    theme: getShikiTheme(vscode.window.activeColorTheme.kind)
  });
  const html = buildHtmlClipboard(renderData, getRichTextFontFamily());

  if (process.platform === "win32") {
    await copyHighlightedTextWindows(plainText, html);
    return;
  }

  await copyHighlightedTextMac(plainText, html);
}

export async function copyHighlightedImage(
  renderData: RenderData,
  options: RenderOptions
): Promise<void> {
  // Route to the native clipboard path for the current OS.
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

async function copyHighlightedTextWindows(plainText: string, html: string): Promise<void> {
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

async function copyHighlightedImageWindows(
  renderData: RenderData,
  options: RenderOptions
): Promise<void> {
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

async function copyHighlightedImageLinux(
  renderData: RenderData,
  options: RenderOptions
): Promise<void> {
  // Try Wayland first, then fall back to the common X11 tool.
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
  const failures: string[] = [];

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

async function copyHighlightedImageMac(
  renderData: RenderData,
  options: RenderOptions
): Promise<void> {
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

async function copyHighlightedTextMac(plainText: string, html: string): Promise<void> {
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

async function findGeneratedPng(directoryPath: string): Promise<string> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const pngEntry = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png")
  );
  if (!pngEntry) {
    throw new Error("qlmanage did not generate a PNG preview.");
  }

  return path.join(directoryPath, pngEntry.name);
}

export function runCommandWithInput(
  command: string,
  args: string[],
  input: string
): Promise<void> {
  // Small wrapper so clipboard helpers can stream generated content over stdin.
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";

    child.on("error", reject);
    child.stderr.on("data", (chunk: Buffer | string) => {
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
