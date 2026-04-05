ObjC.import("AppKit");

function run(argv) {
  if (!argv || argv.length < 1) {
    throw new Error("PNG file path is required.");
  }

  const pngPath = argv[0];
  const image = $.NSImage.alloc.initWithContentsOfFile(pngPath);

  if (!image || !image.isValid) {
    throw new Error("Failed to load generated PNG.");
  }

  const pasteboard = $.NSPasteboard.generalPasteboard;
  pasteboard.clearContents();

  if (!pasteboard.writeObjects([image])) {
    throw new Error("Failed to write image to pasteboard.");
  }
}
