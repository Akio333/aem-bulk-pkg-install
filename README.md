# AEM Bulk Package Installer

A powerful Visual Studio Code extension designed for AEM (Adobe Experience Manager) developers. It allows you to select one or multiple AEM packages (`.zip`) or OSGi bundles (`.jar`) directly from the VS Code File Explorer and easily upload, install, or backup them to your local AEM server.

## Features

- **Upload & Install Packages**: Quickly deploy multiple `.zip` packages to AEM without leaving VS Code.
- **Install OSGi Bundles**: Deploys `.jar` bundles directly via the AEM OSGi Console.
- **Backup Packages**: Modify properties to append a `-backup` version, re-build it on the AEM server, and download the current state into your local workspace.
- **Bulk Operations**: Select multiple files in your workspace and trigger actions for all of them at once. Visual progress notification tracks the success or failure of each file.

## Before You Start

Make sure your AEM server configuration is set up properly.
1. Go to VS Code **Settings** (`Ctrl+,` or `Cmd+,`).
2. Search for `AEM Bulk Installer`.
3. Configure the following options according to your environment:
   - `Aem Bulk Installer > Server: Url`: The URL of your AEM instance (default: `http://localhost`)
   - `Aem Bulk Installer > Server: Port`: The HTTP port (default: `4502`)
   - `Aem Bulk Installer > Server: Username`: The administrator username (default: `admin`)
   - `Aem Bulk Installer > Server: Password`: The administrator password (default: `admin`)

## Step-by-Step Usage

1. Open your code project in VS Code that contains your compiled `.zip` Content Packages or `.jar` OSGi bundles.
2. Open the **VS Code File Explorer** view.
3. Locate the files you want to deploy.
4. **Select File(s)**:
   - Left-click a single file.
   - For bulk operations, hold down `Ctrl` (or `Cmd` on Mac) and click on multiple `.zip` or `.jar` files.
5. **Right-Click** any of the selected files to open the context menu.
6. Look for the `AEM` group at the bottom of the menu and choose one of the available commands:
   - **AEM: Upload file(s)**: Only uploads the package to the AEM Package Manager (doesn't install).
   - **AEM: Install file(s)**: Uploads and immediately installs the package or OSGi bundle.
   - **AEM: Backup package(s)**: Creates a backup clone from AEM (available for `.zip` files only).
7. Look at the bottom right corner of VS Code to see a native **Progress Notification** window indicating the status of the operation for each file.

## Requirements

- VS Code 1.80.0 or higher.
- A running local AEM instance (AEM 6.5+ or AEM as a Cloud Service SDK) reachable by your system.
