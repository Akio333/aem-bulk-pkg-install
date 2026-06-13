# AEM Bulk Package Installer

A powerful Visual Studio Code extension designed for AEM (Adobe Experience Manager) developers. It allows you to select one or multiple AEM packages (`.zip`) or OSGi bundles (`.jar`) directly from the VS Code File Explorer and easily upload, install, or backup them to your local AEM server.

## Features

- **Upload & Install Packages**: Quickly deploy multiple `.zip` packages to AEM without leaving VS Code.
- **Install OSGi Bundles**: Deploys `.jar` bundles directly via the AEM OSGi Console.
- **Replicate Packages & Bundles**: Trigger replication of packages directly from Author to Publish, or deploy OSGi bundles directly to your Publish instance.
- **Install & Replicate (Combo Action)**: A combined action to install packages/bundles on the Author instance and simultaneously replicate them to the Publish instance.
- **Backup Packages**: Modify properties to append a `-backup` version, re-build it on the AEM server, and download the current state into your local workspace.
- **Bulk Operations**: Select multiple files in your workspace and trigger actions for all of them at once. Visual progress notification tracks the success or failure of each file.

## Installation

You can install the **AEM Bulk Package Installer** extension through any of the following methods:

### 1. From the Marketplace (Recommended)

Get the extension from the official extension marketplaces:

[<img src="https://img.shields.io/badge/VS%20Code%20Marketplace-Install-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="VS Code Marketplace" height="35">](https://marketplace.visualstudio.com/items?itemName=Akio333.aem-bulk-pkg-install)
[<img src="https://img.shields.io/open-vsx/v/Akio333/aem-bulk-pkg-install?style=for-the-badge&logo=eclipsevert-x&logoColor=white&label=Open%20VSX%20Registry&color=F6851F" alt="Open VSX Registry" height="35">](https://open-vsx.org/extension/Akio333/aem-bulk-pkg-install)

### 2. Manual Installation (.vsix)

You can download the compiled `.vsix` package of the latest release and install it manually:

1. Download the latest `.vsix` file from the [GitHub Releases](https://github.com/akio333/aem-bulk-pkg-install/releases/latest) page.
2. Open VS Code, open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Click on the `...` (Views and More Actions) menu in the top-right corner of the Extensions view.
4. Select **Install from VSIX...** and choose the downloaded file.

### 3. Build from Source

If you prefer to build the extension from source, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/akio333/aem-bulk-pkg-install.git
   cd aem-bulk-pkg-install
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Package the extension**:
   ```bash
   npm run package
   ```
   This will compile the TypeScript source, bundle the code with `esbuild`, and generate a `.vsix` file (e.g., `aem-bulk-pkg-install-X.Y.Z.vsix`) in the project root directory.

4. **Install the generated `.vsix`**:
   Install the generated `.vsix` file into your VS Code environment via the **Install from VSIX...** option.

## Before You Start

Make sure your AEM server configuration is set up properly.
1. Go to VS Code **Settings** (`Ctrl+,` or `Cmd+,`).
2. Search for `AEM Bulk Installer`.
3. Configure the settings for your AEM instances:
   - **Author Settings**:
     - `Aem Bulk Installer > Author: Url` (Falls back to the legacy `Server: Url` setting if empty)
     - `Aem Bulk Installer > Author: Port` (Falls back to `Server: Port` if empty)
     - `Aem Bulk Installer > Author: Username` (Falls back to `Server: Username` if empty)
     - `Aem Bulk Installer > Author: Password` (Falls back to `Server: Password` if empty)
   - **Publish Settings** (Used for replication and targeted bundle deployments):
     - `Aem Bulk Installer > Publish: Url` (Default: `http://localhost`)
     - `Aem Bulk Installer > Publish: Port` (Default: `4503`)
     - `Aem Bulk Installer > Publish: Username` (Default: `admin`)
     - `Aem Bulk Installer > Publish: Password` (Default: `admin`)
   - **Legacy settings (Fallback)**:
     - `Aem Bulk Installer > Server: Url` (Default: `http://localhost`)
     - `Aem Bulk Installer > Server: Port` (Default: `4502`)
     - `Aem Bulk Installer > Server: Username` (Default: `admin`)
     - `Aem Bulk Installer > Server: Password` (Default: `admin`)

## Step-by-Step Usage

1. Open your code project in VS Code that contains your compiled `.zip` Content Packages or `.jar` OSGi bundles.
2. Open the **VS Code File Explorer** view.
3. Locate the files you want to deploy.
4. **Select File(s)**:
   - Left-click a single file.
   - For bulk operations, hold down `Ctrl` (or `Cmd` on Mac) and click on multiple `.zip` or `.jar` files.
5. **Right-Click** any of the selected files to open the context menu.
6. Look for the `AEM` group at the bottom of the menu and choose one of the available commands:
   - **AEM: Upload file(s)**: Only uploads the package to the AEM Author Package Manager (doesn't install).
   - **AEM: Install file(s)**: Uploads and immediately installs the package or OSGi bundle on the AEM Author instance.
   - **AEM: Backup package(s)**: Creates a backup clone from AEM (available for `.zip` files only).
   - **AEM: Replicate file(s)**: Uploads and replicates packages from Author to Publish (`.zip`), or installs OSGi bundles directly to the Publish instance (`.jar`).
   - **AEM: Install + Replicate file(s)**: Uploads, installs, and replicates packages on both Author and Publish (`.zip`), or installs OSGi bundles on both Author and Publish instances (`.jar`).
7. Look at the bottom right corner of VS Code to see a native **Progress Notification** window indicating the status of the operation for each file.

## Requirements

- VS Code 1.80.0 or higher.
- A running local AEM instance (AEM 6.5+ or AEM as a Cloud Service SDK) reachable by your system.

## License

This extension is licensed under the terms described in the [LICENSE](./LICENSE) file. Copyright (c) 2024 Akio333.
