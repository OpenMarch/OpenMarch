# Windows deploy script

These are hacky instructions for deploying on windows. Hope to get this in a powershell script

```bash
# COMMAND - validate that GitHub is authenticated

mkdir temp
cd temp
gh repo clone OpenMarch/OpenMarch
cd OpenMarch
# COMMAND - validate that the repository is updated

git fetch

# COMMAND - check out the latest tag
# COMMAND - validate that the latest tag has a release

# If errors pop up
winget install NSIS.NSIS

pnpm install

cd apps/desktop
pnpm run build
pnpm electron-builder --win --publish never

# COMMAND - find the path of the newly made .exe

cd "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64"
.\signtool.exe sign /n "Open Source Developer, Alexander Dumouchelle" /t http://time.certum.pl/ /fd sha256 /v $PATH_TO_EXE

cd $REPO
gh release upload $TAG {EXE AND BLOCKMAP FILES} --clobber
```
