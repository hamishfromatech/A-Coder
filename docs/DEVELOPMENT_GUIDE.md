# A-Coder Development Guide

This guide covers how to develop, build, and package A-Coder for distribution.

## Prerequisites

- **Node.js**: Version `20.18.2` (required)
- **macOS**: For building macOS apps
- **npm**: Comes with Node.js

## Initial Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build React components:**
   ```bash
   npm run buildreact
   ```

## Development Workflow

### Running in Development Mode

1. **Start the build watchers** (using VS Code):
   - Press `Cmd+Shift+B` (or `Ctrl+Shift+B` on other platforms)
   - This will start watching for file changes and automatically recompile

   **OR** from the terminal:
   ```bash
   npm run watch
   ```

2. **Launch the app:**
   ```bash
   ./scripts/code.sh
   ```

3. **Reload changes:**
   - After making code changes, press `Cmd+R` (or `Ctrl+R`) in the A-Coder window to reload
   - React changes require rebuilding: `npm run buildreact`, then `Cmd+R`

### Build Commands

- **Watch mode** (auto-recompile on changes):
  ```bash
  npm run watch
  ```

- **Watch React only:**
  ```bash
  npm run watchreact
  ```

- **Build React once:**
  ```bash
  npm run buildreact
  ```

- **Compile TypeScript once:**
  ```bash
  npm run compile
  ```

## Building for Production

### Full Production Build

To create a production-ready build:

```bash
npm run gulp -- vscode-darwin-arm64
```

This will:
- Compile and minify all code
- Create a standalone `A-Coder.app` in `../VSCode-darwin-arm64/` (outside the repo)
- Take 30+ minutes to complete

**Note:** For faster builds without minification, use:
```bash
npm run gulp -- vscode-darwin-arm64
```

This creates the production app in `../VSCode-darwin-arm64/A-Coder.app`.

## Creating a DMG for Distribution

After running the production build, the standalone app will be created in a folder **outside** the void repo:

```
workspace/
├── void/                    # Your A-Coder repo
└── VSCode-darwin-arm64/     # Generated production build
    └── A-Coder.app          # Standalone app
```

To create a DMG from the production build:

```bash
hdiutil create -volname "A-Coder" -srcfolder ../VSCode-darwin-arm64/A-Coder.app -ov -format UDZO A-Coder.dmg
```

This will create `A-Coder.dmg` in the current directory (inside the void repo).

**Important:** The app in `.build/electron/A-Coder.app` is a **development build** and will not work properly when distributed. Always use the app from `../VSCode-darwin-arm64/` for distribution.

## Common Issues

### Build Errors

If you encounter build errors:

1. **Clear build artifacts:**
   ```bash
   rm -rf out/
   rm -rf .build/
   ```

2. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules/
   npm install
   ```

3. **Ensure correct Node version:**
   ```bash
   node --version  # Should be 20.18.2
   ```

### UI Not Updating

If changes aren't reflected in the app:

1. **Rebuild React:**
   ```bash
   npm run buildreact
   ```

2. **Hard reload:**
   - Press `Cmd+R` in the A-Coder window
   - Or restart the app: `./scripts/code.sh`

### Missing Electron App

If `.build/electron/A-Coder.app` doesn't exist:

```bash
npm run compile
```

This will download the Electron binary and create the app structure.

## Project Structure

- **`src/`** - TypeScript source code
- **`src/vs/workbench/contrib/void/`** - A-Coder specific code
- **`src/vs/workbench/contrib/void/browser/react/`** - React UI components
- **`out/`** - Compiled JavaScript output
- **`.build/electron/`** - Development build output (not for distribution)
- **`../VSCode-darwin-arm64/`** - Production build output (outside repo)

## Quick Reference

| Task | Command |
|------|---------|
| Start development | `Cmd+Shift+B` then `./scripts/code.sh` |
| Build React | `npm run buildreact` |
| Watch for changes | `npm run watch` |
| Reload app | `Cmd+R` in A-Coder window |
| Production build | `npm run gulp -- vscode-darwin-arm64` |
| Create DMG | `hdiutil create -volname "A-Coder" -srcfolder ../VSCode-darwin-arm64/A-Coder.app -ov -format UDZO A-Coder.dmg` |
| Remove quarantine | `sudo xattr -d com.apple.quarantine "/Applications/A-Coder.app` (required before running on macOS) |

## Additional Resources

- **Codebase Guide:** See `VOID_CODEBASE_GUIDE.md` for architecture details
- **Contributing:** See `HOW_TO_CONTRIBUTE.md` for contribution guidelines
- **VS Code Docs:** https://github.com/microsoft/vscode/wiki

## Support

For questions or issues:
- Discord: [Join our server]
- Email: hello@voideditor.com
