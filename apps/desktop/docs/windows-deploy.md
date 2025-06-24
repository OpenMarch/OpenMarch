# Windows deploy script

## Preparation

1. Install chocolately
1. Install required dependencies

   ```powershell
   choco install python
   choco install nodejs --version 20
   choco install gh
   choco install git
   choco install pnpm
   pnpm install -g node-gyp
   ```

1. Install visual studio (is this needed?)
1. Download windows sdk (for signtool)
   - https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

## Building and packaging

```powershell
gh repo clone OpenMarch/OpenMarch
cd OpenMarch

# Change to the desktop folder
cd apps/desktop

pnpm i

cd apps\desktop

# Build for production
pnpm run build

$env:GH_TOKEN = gh auth token
pnpm exec .\node_modules\.bin\electron-builder -w --publish=always

```

### Old instructions

These are hacky instructions for deploying on windows.
I hope to get this in a smoother powershell script.

This is also customized to work on my machine.
I tried using an EC2 instance but it was pretty slow at the tier I had it :/

```powershell
# Ensure node version 22
nvm use 22

# Login to GitHub CLI
gh auth login

# Clone a fresh repo
gh repo clone OpenMarch/OpenMarch
cd OpenMarch

# Change to the desktop folder
cd apps/desktop

# pnpm i

# Build for production
pnpm run build

# Clear this electron-builder cache
Remove-Item -Recurse -Force C:\Users\AlexD\AppData\Local\electron-builder\Cache

# Install NSIS
winget install NSIS.NSIS

# Package the app
# FIGURE OUT ENVIRONMENT VARIABLES
# IN ELEVATED SHELL
# CLOSE VSCODE OR CURSOR
.\node_modules\.bin\electron-builder --publish=never --win

cd "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64"
.\signtool.exe sign /n "Open Source Developer, Alexander Dumouchelle" /t http://time.certum.pl/ /fd sha256 /v $PATH_TO_EXE

cd $REPO
gh release upload $TAG {EXE AND BLOCKMAP FILES} --clobber
```
