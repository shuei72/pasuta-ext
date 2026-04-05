ObjC.import("AppKit");
ObjC.import("Foundation");

function run(argv) {
  if (!argv || argv.length < 2) {
    throw new Error("Plain text and HTML file paths are required.");
  }

  const plainText = readUtf8File(argv[0]);
  const html = readUtf8File(argv[1]);
  const pasteboard = $.NSPasteboard.generalPasteboard;

  pasteboard.clearContents();
  pasteboard.setStringForType($(plainText), $.NSPasteboardTypeString);
  pasteboard.setStringForType($(html), $.NSPasteboardTypeHTML);
}

function readUtf8File(filePath) {
  const nsString = $.NSString.stringWithContentsOfFileEncodingError(
    $(filePath),
    $.NSUTF8StringEncoding,
    null
  );

  if (!nsString) {
    throw new Error(`Failed to read file: ${filePath}`);
  }

  return ObjC.unwrap(nsString);
}
