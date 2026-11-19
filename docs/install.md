# Installing ElixirOffice

Download the package for your system from the [latest release](https://github.com/leag1234/elixiroffice/releases/latest).

The Windows and macOS packages are not yet signed with a paid publisher certificate. Windows and macOS therefore show a warning the first time you open them. The steps below are the normal, built-in way to confirm that you want to open an app you downloaded yourself. You do not need to turn off any protection.

Updates are different: the app only installs updates whose metadata is signed with the ElixirOffice update key, and it checks every downloaded file against that signed metadata.

## Windows 10 and 11

1. Download `ElixirOffice-<version>-win-x64.exe`.
2. If your browser says the file is not commonly downloaded, open the download menu, choose **Keep** (Edge: **…** > **Keep**, then **Keep anyway**).
3. Open the installer. If Windows shows **Windows protected your PC**, click **More info**, then **Run anyway**.
4. Follow the installer. You can choose the installation folder.

This warning appears only for the installer. Updates installed from inside the app do not show it again.

## macOS (Apple silicon)

1. Download `ElixirOffice-<version>-mac-arm64.dmg`, open it and drag **ElixirOffice** to **Applications**.
2. Open ElixirOffice from Applications. macOS shows a message that it could not verify the app. Click **Done** (do not move it to the Bin).
3. Open **System Settings** > **Privacy & Security**. Scroll down to **Security**: you see a line saying ElixirOffice was blocked. Click **Open Anyway**, then confirm with your password or Touch ID.
4. Open ElixirOffice again and click **Open**. macOS remembers your choice.

On macOS 14 (Sonoma) and earlier you can instead Control-click the app in Applications, choose **Open**, then **Open** again.

Intel Macs are not supported yet.

## Linux

- **.deb** (Debian, Ubuntu, Linux Mint, elementary OS, Zorin OS…): `sudo apt install ./ElixirOffice-<version>-linux-amd64.deb`
- **AppImage** (other distributions): make the file executable, then open it: `chmod +x ElixirOffice-<version>-x86_64.AppImage`
- **Arch Linux**: the community package `elixiroffice-bin` (AUR) repackages the released .deb.

More details: [Linux packages](desktop.md#linux-packages).

## Checking the download (optional)

Each release lists the SHA-256 of every file in `SHA256SUMS`. Compare it with the file you downloaded:

- Windows (PowerShell): `Get-FileHash .\ElixirOffice-<version>-win-x64.exe`
- macOS: `shasum -a 256 ElixirOffice-<version>-mac-arm64.dmg`
- Linux: `sha256sum ElixirOffice-<version>-x86_64.AppImage`

## Something went wrong?

[Open an issue](https://github.com/leag1234/elixiroffice/issues) with your system version, the package you used and what you saw (a screenshot helps).
