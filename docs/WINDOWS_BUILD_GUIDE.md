# A-Coder Windows Build Guide

This guide covers how to build and package A-Coder for Windows distribution.

## Prerequisites

- **Node.js**: Version `20.18.2` (required - see `.nvmrc`)
- **Windows 10/11**: For building Windows executables
- **npm**: Comes with Node.js
- **Python**: Version 3.x (required for node-gyp)
- **Visual Studio Build Tools**: Required for native modules

## Initial Setup

### 1. Install Visual Studio Build Tools

Download and install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with:
- Desktop development with C++
- Windows 10/11 SDK

### 2. Install Node.js

```bash
# Install the required Node.js version
nvm install 20.18.2
nvm use 20.18.2
```

### 3. Clone and Install Dependencies

```bash
git clone https://github.com/hamishfromatech/void.git
cd void
npm install
```

This will take several minutes as it downloads and compiles dependencies.

## Development Mode

### Running A-Coder in Development

1. **Build the project:**
   - Press `Ctrl+Shift+B` in VS Code
   - Select "npm: watch" from the task list

2. **Launch the app:**
   ```bash
   .\scripts\code.bat
   ```

3. **Reload changes:**
   - Press `Ctrl+R` in the A-Coder window to reload after making changes

## Production Build

### Building for Windows

To create a production build for distribution:

```bash
# For 64-bit Windows (most common)
npm run gulp -- vscode-win32-x64

# For ARM64 Windows
npm run gulp -- vscode-win32-arm64
```

This will:
- Compile and bundle all code
- Create a standalone executable in `../VSCode-win32-x64/` (outside the repo)
- Take 30+ minutes to complete

**Note:** The production build is created in a folder **outside** the void repo:

```
workspace/
├── void/                    # Your A-Coder repo
└── VSCode-win32-x64/        # Generated production build
    └── A-Coder.exe          # Standalone executable
```

## Creating an Installer

### Option 1: Portable ZIP

The simplest distribution method is a portable ZIP:

```bash
# Navigate to the build output
cd ../VSCode-win32-x64

# Create a ZIP file
powershell Compress-Archive -Path * -DestinationPath A-Coder-Windows-x64.zip
```

### Option 2: Inno Setup Installer

For a professional installer, use [Inno Setup](https://jrsoftware.org/isinfo.php):

1. **Install Inno Setup:**
   - Download from https://jrsoftware.org/isdl.php
   - Install with default options

2. **Create installer script** (`A-Coder-Setup.iss`):

```iss
[Setup]
AppName=A-Coder
AppVersion=1.0.0
DefaultDirName={autopf}\A-Coder
DefaultGroupName=A-Coder
OutputDir=.
OutputBaseFilename=A-Coder-Setup-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64

[Files]
Source: "..\VSCode-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\A-Coder"; Filename: "{app}\A-Coder.exe"
Name: "{autodesktop}\A-Coder"; Filename: "{app}\A-Coder.exe"

[Run]
Filename: "{app}\A-Coder.exe"; Description: "Launch A-Coder"; Flags: nowait postinstall skipifsilent
```

3. **Compile the installer:**
   - Right-click `A-Coder-Setup.iss`
   - Select "Compile"
   - Output: `A-Coder-Setup-x64.exe`

### Option 3: MSI Installer (Advanced)

For enterprise deployment, use [WiX Toolset](https://wixtoolset.org/):

```bash
# Install WiX Toolset
dotnet tool install --global wix

# Create MSI (requires WiX configuration - see WiX documentation)
```

## Updating the App Icon

To use a custom icon for the Windows executable:

1. **Convert PNG to ICO:**
   - Use an online converter or ImageMagick
   - Create sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256

2. **Replace the icon:**
   ```bash
   copy a-coder.ico resources\win32\code.ico
   ```

3. **Rebuild:**
   ```bash
   npm run gulp -- vscode-win32-x64
   ```

## Troubleshooting

### Build Errors

**"MSBuild not found"**
- Install Visual Studio Build Tools with C++ workload

**"Python not found"**
- Install Python 3.x and add to PATH

**"node-gyp rebuild failed"**
- Ensure Visual Studio Build Tools are installed
- Run: `npm config set msvs_version 2022`

### Performance Issues

**Slow compilation:**
- Close other applications
- Use `npm run gulp -- vscode-win32-x64` (non-minified) instead of `vscode-win32-x64-min`

**Out of memory:**
- Increase Node.js memory: `set NODE_OPTIONS=--max-old-space-size=8192`

## Project Structure

Key directories:
- **`src/vs/workbench/contrib/void/`** - A-Coder specific code
- **`src/vs/workbench/contrib/void/browser/react/`** - React UI components
- **`out/`** - Compiled JavaScript output
- **`../VSCode-win32-x64/`** - Production build output (outside repo)

## Quick Reference

| Task | Command |
|------|---------|
| Start development | `Ctrl+Shift+B` then `.\scripts\code.bat` |
| Production build (x64) | `npm run gulp -- vscode-win32-x64` |
| Production build (ARM64) | `npm run gulp -- vscode-win32-arm64` |
| Create ZIP | `powershell Compress-Archive -Path * -DestinationPath A-Coder.zip` |

## Additional Resources

- [VS Code Build Documentation](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [Inno Setup Documentation](https://jrsoftware.org/ishelp/)
- [WiX Toolset Documentation](https://wixtoolset.org/docs/)

## Support

For issues or questions, please open an issue on the [GitHub repository](https://github.com/hamishfromatech/void).
