# Pasuta

Pasuta is a VS Code extension for copying code as text or images with tabs expanded to spaces.  
Copy commands support optional line numbers and syntax-highlighted output.

## Commands

`Pasuta: Copy Text`  
Copies the current selection as text.

`Pasuta: Copy Text with Colon Lines`  
Copies the current selection as text in `lineNumber: code` format.

`Pasuta: Copy Text with Tab Lines`  
Copies the current selection as text in `lineNumber<TAB>code` format.

`Pasuta: Copy Image`  
Copies the current selection as an image.

`Pasuta: Copy Image with Colon Lines`  
Copies the current selection as an image in `lineNumber: code` format.

## Features

- Treats selections as full-line selections during copy.
- Supports multiple selections and joins them from top to bottom.
- Prompts for tab size and expands tabs to spaces before copy.
- Applies syntax highlighting that follows the current theme (`light` or `dark`).
- Copies rich text together with plain text on Windows and macOS.

## Development

### PowerShell

```powershell
npm.cmd install
npm.cmd run compile
npm.cmd run package
```

### Command Prompt

```cmd
npm install
npm run compile
npm run package
```

## Other

- This extension was created with Codex.

## License

MIT License
