# Contributing to A-Coder
### Welcome!
This is the official guide on how to contribute to A-Coder. If you have any questions, reach out via GitHub Issues or Discord.

There are a few ways to contribute:

- 💫 Complete items on the [Roadmap](https://github.com/hamishfromatech/A-Coder/projects)
- 💡 Make suggestions in our [Discord](https://discord.gg/RSNjgaugJs)
- 🪴 Start new Issues - see [Issues](https://github.com/hamishfromatech/A-Coder/issues)


### Codebase Guide

We recommend reading the [VOID_CODEBASE_GUIDE.md](./VOID_CODEBASE_GUIDE.md) guide on the source code if you'd like to add new features.

The repo is not as intimidating as it first seems if you read the guide!

All A-Coder code lives in `src/vs/workbench/contrib/void/`.



## Editing A-Coder's Code

If you're making changes to A-Coder's code as a contributor, you'll want to run a local version to test your changes.

### Prerequisites

**Mac:** Requires Python and XCode.

**Windows:** First get [Visual Studio 2022](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=Community) (recommended) or [VS Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools).

Go to the "Workloads" tab and select:
- `Desktop development with C++`
- `Node.js build tools`

Go to the "Individual Components" tab and select:
- `MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)`
- `C++ ATL for latest build tools with Spectre Mitigations`
- `C++ MFC for latest build tools with Spectre Mitigations`

**Linux:** Run `npm install -g node-gyp`. Then:
- Debian (Ubuntu, etc): `sudo apt-get install build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev python-is-python3`
- Red Hat (Fedora, etc): `sudo dnf install @development-tools gcc gcc-c++ make libsecret-devel krb5-devel libX11-devel libxkbfile-devel`
- SUSE (openSUSE, etc): `sudo zypper install patterns-devel-C-C++-devel_C_C++ krb5-devel libsecret-devel libxkbfile-devel libX11-devel`
- Others: see [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute)

### Developer Mode Instructions

Here's how to start changing A-Coder's code. These steps cover everything from cloning to opening a Developer Mode window where you can test your updates.

1. `git clone https://github.com/hamishfromatech/A-Coder` to clone the repo
2. `npm install` to install all dependencies
3. **Start the build watchers:**
   - Windows/Linux: Press `Ctrl+Shift+B`
   - Mac: Press `Cmd+Shift+B`
   - Or run `npm run watch` from terminal
   - Wait for compilation to complete (watch-client and watch-extensions)
4. **Launch the app:**
   - Mac/Linux: `./scripts/code.sh`
   - Windows: `./scripts/code.bat`
5. **Reload changes:**
   - Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux) in the window to reload
   - Or press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux) and select "Reload Window"
   - React changes require rebuilding: `npm run buildreact` then reload

**Optional:** Add flags `--user-data-dir ./.tmp/user-data --extensions-dir ./.tmp/extensions` to reset IDE changes by deleting the `.tmp` folder.

If you get any errors, scroll down for common fixes.

#### Common Fixes

- Make sure you followed the prerequisite steps above.
- Make sure you have Node version `22` (the version in `.nvmrc`). Use [nvm](https://github.com/nvm-sh/nvm): run `nvm install`, followed by `nvm use` to install the version in `.nvmrc` locally.
- Make sure the path to your A-Coder folder does not have any spaces in it.
- If you get `"TypeError: Failed to fetch dynamically imported module"`, make sure all imports end with `.js`.
- If you get an error with React, try running `NODE_OPTIONS="--max-old-space-size=8192" npm run buildreact`.
- If you see missing styles, wait a few seconds and then reload.
- If you get errors like `npm error libtool:   error: unrecognised option: '-static'`,  when running ./scripts/code.sh, make sure you have GNU libtool instead of BSD libtool (BSD is the default in macos)
- If you get errors like `The SUID sandbox helper binary was found, but is not configured correctly` when running ./scripts/code.sh, run
`sudo chown root:root .build/electron/chrome-sandbox && sudo chmod 4755 .build/electron/chrome-sandbox` and then run `./scripts/code.sh` again.
- If you get any other questions, feel free to [submit an issue](https://github.com/hamishfromatech/A-Coder/issues/new).



#### Building from Terminal

To build from the terminal instead of from inside VSCode, run `npm run watch`. The build is done when you see:

```
[watch-extensions] Finished compilation extensions with 0 errors
[watch-client    ] Finished compilation with 0 errors
```

### Distributing

A-Coder is distributed via releases. The build pipeline is a fork of VSCodium. See the [`void-builder`](https://github.com/voideditor/void-builder) repo for build instructions.

### Building a Local Executable

Not recommended - use Developer Mode instead. If you still need a local build:

```bash
# macOS
npm run gulp vscode-darwin-arm64    # Apple Silicon
npm run gulp vscode-darwin-x64      # Intel

# Windows
npm run gulp vscode-win32-x64
npm run gulp vscode-win32-arm64

# Linux
npm run gulp vscode-linux-x64
npm run gulp vscode-linux-arm64
```

Output is created in a folder outside the repo (e.g., `../VSCode-darwin-arm64/`).


## Pull Request Guidelines


- Please submit a pull request once you've made a change.
- No need to submit an Issue unless you're creating a new feature that might involve multiple PRs.
- Please don't use AI to write your PR 🙂




