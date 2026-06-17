import * as vscode from 'vscode';
import * as path from 'path';
import { AemClient, AemConfig } from './aemClient';
import { backupPackage } from './backupFlow';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('AEM Bulk Installer');
    context.subscriptions.push(outputChannel);

    interface EnvironmentConfig {
        name: string;
        isProd?: boolean;
        author: AemConfig;
    }

    const getEnvironments = (): EnvironmentConfig[] => {
        const config = vscode.workspace.getConfiguration('aemBulkInstaller');
        let envs = config.get<EnvironmentConfig[]>('environments') || [];
        
        if (envs.length === 0) {
            envs = [
                {
                    name: 'local',
                    isProd: false,
                    author: {
                        url: 'http://localhost',
                        port: '4502',
                        username: 'admin',
                        password: 'admin'
                    }
                }
            ];
        }

        // Apply robust fallbacks for individual fields to prevent undefined errors
        return envs.map(env => ({
            name: env.name || 'unnamed',
            isProd: !!env.isProd,
            author: {
                url: env.author?.url || 'http://localhost',
                port: env.author?.port || '4502',
                username: env.author?.username || 'admin',
                password: env.author?.password || 'admin'
            }
        }));
    };

    const selectEnvironment = async (actionName: string): Promise<EnvironmentConfig | undefined> => {
        const envs = getEnvironments();
        if (envs.length === 0) {
            vscode.window.showErrorMessage('No AEM environments configured.');
            return undefined;
        }

        let selectedEnv: EnvironmentConfig;

        if (envs.length === 1) {
            selectedEnv = envs[0];
        } else {
            const items = envs.map(env => ({
                label: env.name,
                description: `${env.author.url}:${env.author.port} (Author)${env.isProd ? ' [PROD]' : ''}`,
                env: env
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select target environment for '${actionName}'`
            });

            if (!selected) {
                return undefined;
            }
            selectedEnv = selected.env;
        }

        if (selectedEnv.isProd) {
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to perform '${actionName}' on the production environment '${selectedEnv.name}'?`,
                { modal: true },
                'Yes'
            );
            if (confirmation !== 'Yes') {
                return undefined;
            }
        }

        return selectedEnv;
    };

    const processFiles = async (
        actionName: string,
        uris: vscode.Uri[],
        action: (authorClient: AemClient, filePath: string, outputDir: string) => Promise<void>
    ) => {
        if (!uris || uris.length === 0) {
            vscode.window.showWarningMessage('No files selected.');
            return;
        }

        const env = await selectEnvironment(actionName);
        if (!env) {
            return;
        }

        const authorClient = new AemClient(env.author);

        outputChannel.show(true);
        outputChannel.appendLine(`--- Starting: ${actionName} on environment [${env.name}] ---`);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `AEM: ${actionName} (${env.name})`,
            cancellable: false
        }, async (progress) => {
            const total = uris.length;
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < total; i++) {
                const fsPath = uris[i].fsPath;
                const fileName = path.basename(fsPath);
                progress.report({ message: `Processing ${fileName} (${i + 1}/${total})...`, increment: 100 / total });
                outputChannel.appendLine(`[${i + 1}/${total}] Processing: ${fileName}...`);
                
                try {
                    await action(authorClient, fsPath, path.dirname(fsPath));
                    successCount++;
                    outputChannel.appendLine(`[${i + 1}/${total}] SUCCESS: ${fileName}`);
                } catch (error: any) {
                    failCount++;
                    outputChannel.appendLine(`[${i + 1}/${total}] FAILED: ${fileName} - ${error.message}`);
                    vscode.window.showErrorMessage(`Failed to process ${fileName}: ${error.message}`);
                }
            }

            outputChannel.appendLine(`--- Completed ${actionName}: ${successCount} succeeded, ${failCount} failed. ---\n`);

            if (failCount === 0) {
                vscode.window.showInformationMessage(`Successfully completed ${actionName} for ${successCount} file(s).`);
            } else {
                vscode.window.showWarningMessage(`Completed ${actionName}: ${successCount} succeeded, ${failCount} failed.`);
            }
        });
    };

    // Upload Command
    let uploadCmd = vscode.commands.registerCommand('aem-bulk-installer.upload', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        const urisToProcess = selectedUris || (_uri ? [_uri] : []);
        await processFiles('Upload files', urisToProcess, async (authorClient, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                await authorClient.uploadPackage(filePath, true);
            } else if (ext === '.jar') {
                throw new Error('Upload without install is not supported for OSGi bundles (.jar). Use Install instead.');
            } else {
                throw new Error('Unsupported check extension.');
            }
        });
    });

    // Install Command
    let installCmd = vscode.commands.registerCommand('aem-bulk-installer.install', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
         const urisToProcess = selectedUris || (_uri ? [_uri] : []);
         await processFiles('Install files', urisToProcess, async (authorClient, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                const pkgPath = await authorClient.uploadPackage(filePath, true);
                
                outputChannel.appendLine(`    Uploading done, starting install for ${pkgPath}...`);
                await authorClient.installPackage(pkgPath, (msg) => {
                    outputChannel.appendLine(msg);
                });
            } else if (ext === '.jar') {
                await authorClient.installBundle(filePath);
            } else {
                 throw new Error('Unsupported check extension.');
            }
         });
    });

    // Backup Command
    let backupCmd = vscode.commands.registerCommand('aem-bulk-installer.backup', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
         const urisToProcess = selectedUris || (_uri ? [_uri] : []);
         await processFiles('Backup packages', urisToProcess, async (authorClient, filePath, outputDir) => {
              await backupPackage(authorClient, filePath, outputDir);
         });
    });

    // Replicate Command
    let replicateCmd = vscode.commands.registerCommand('aem-bulk-installer.replicate', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        const urisToProcess = selectedUris || (_uri ? [_uri] : []);
        await processFiles('Replicate files', urisToProcess, async (authorClient, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                outputChannel.appendLine(`    Uploading package to Author...`);
                const pkgPath = await authorClient.uploadPackage(filePath, true);
                outputChannel.appendLine(`    Uploading done, starting replication for ${pkgPath}...`);
                await authorClient.replicatePackage(pkgPath);
            } else if (ext === '.jar') {
                throw new Error('Direct replication of OSGi bundles (.jar) to Publish is no longer supported.');
            } else {
                throw new Error('Unsupported check extension.');
            }
        });
    });

    // Install + Replicate Command
    let installReplicateCmd = vscode.commands.registerCommand('aem-bulk-installer.install-replicate', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        const urisToProcess = selectedUris || (_uri ? [_uri] : []);
        await processFiles('Install + Replicate files', urisToProcess, async (authorClient, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                outputChannel.appendLine(`    Uploading package to Author...`);
                const pkgPath = await authorClient.uploadPackage(filePath, true);
                
                outputChannel.appendLine(`    Uploading done, starting install on Author for ${pkgPath}...`);
                await authorClient.installPackage(pkgPath, (msg) => {
                    outputChannel.appendLine(msg);
                });
                
                outputChannel.appendLine(`    Starting replication for ${pkgPath}...`);
                await authorClient.replicatePackage(pkgPath);
            } else if (ext === '.jar') {
                outputChannel.appendLine(`    Installing bundle to Author...`);
                await authorClient.installBundle(filePath);
                
                outputChannel.appendLine(`    Note: Direct replication of OSGi bundles (.jar) to Publish is no longer supported.`);
            } else {
                throw new Error('Unsupported check extension.');
            }
        });
    });

    const handleCreatePackage = async (action: 'create' | 'build' | 'replicate') => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor.');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        if (!text.trim()) {
            vscode.window.showErrorMessage('No text selected.');
            return;
        }

        const paths = text.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('/'));

        if (paths.length === 0) {
            vscode.window.showErrorMessage("No valid JCR paths (starting with '/') found in selection.");
            return;
        }

        // Prompt for Package Name
        const packageName = await vscode.window.showInputBox({
            prompt: 'Enter package name',
            placeHolder: 'e.g. my-content-package',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Package name is required';
                }
                if (!/^[a-zA-Z0-9_\-]+$/.test(value)) {
                    return 'Package name can only contain alphanumeric characters, underscores, and hyphens';
                }
                return null;
            }
        });
        if (!packageName) {
            return;
        }

        // Prompt for Category (default: 'my_packages')
        const category = await vscode.window.showInputBox({
            prompt: 'Enter category (group name)',
            value: 'my_packages',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Category is required';
                }
                return null;
            }
        });
        if (!category) {
            return;
        }

        // Prompt for Version (default: '1.0.0')
        const version = await vscode.window.showInputBox({
            prompt: 'Enter version',
            value: '1.0.0',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Version is required';
                }
                return null;
            }
        });
        if (!version) {
            return;
        }

        // Determine action name for the environment prompt and logs
        const actionLabel = action === 'create' ? 'Create package' 
                            : action === 'build' ? 'Create + Build package' 
                            : 'Create + Build + Replicate package';

        const env = await selectEnvironment(actionLabel);
        if (!env) {
            return;
        }

        const authorClient = new AemClient(env.author);

        outputChannel.show(true);
        outputChannel.appendLine(`--- Starting: ${actionLabel} on environment [${env.name}] ---`);
        outputChannel.appendLine(`Package: ${category}/${packageName}-${version}`);
        outputChannel.appendLine(`Paths:`);
        paths.forEach(p => outputChannel.appendLine(`  - ${p}`));

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `AEM: ${actionLabel} (${env.name})`,
            cancellable: false
        }, async (progress) => {
            try {
                // Step 1: Create Package
                progress.report({ message: 'Creating package...' });
                outputChannel.appendLine(`[1/3] Creating package on Author...`);
                const pkgPath = await authorClient.createPackage(packageName, category, version);
                outputChannel.appendLine(`SUCCESS: Package created at: ${pkgPath}`);

                // Step 2: Update Filters
                progress.report({ message: 'Updating package filters...' });
                outputChannel.appendLine(`[2/3] Updating package filters...`);
                await authorClient.updatePackageFilters(pkgPath, packageName, category, version, paths);
                outputChannel.appendLine(`SUCCESS: Package filters updated.`);

                // The package path after updatePackageFilters might have the version appended by AEM
                const finalPkgPath = version ? `/etc/packages/${category}/${packageName}-${version}.zip` : pkgPath;

                // Step 3 (Optional): Build Package
                if (action === 'build' || action === 'replicate') {
                    progress.report({ message: 'Building package...' });
                    outputChannel.appendLine(`[3/3] Building package on Author...`);
                    await authorClient.buildPackage(finalPkgPath);
                    outputChannel.appendLine(`SUCCESS: Package built successfully.`);
                }

                // Step 4 (Optional): Replicate Package
                if (action === 'replicate') {
                    progress.report({ message: 'Replicating package...' });
                    outputChannel.appendLine(`[Replicate] Replicating package to Publish...`);
                    await authorClient.replicatePackage(finalPkgPath);
                    outputChannel.appendLine(`SUCCESS: Package replicated successfully.`);
                }

                outputChannel.appendLine(`--- Completed ${actionLabel}: SUCCESS ---\n`);
                vscode.window.showInformationMessage(`Successfully completed ${actionLabel} for package ${packageName}.`);
            } catch (error: any) {
                outputChannel.appendLine(`FAILED: ${error.message}`);
                outputChannel.appendLine(`--- Completed ${actionLabel}: FAILED ---\n`);
                vscode.window.showErrorMessage(`Failed to perform '${actionLabel}': ${error.message}`);
            }
        });
    };

    // Create Package Command
    let createPkgCmd = vscode.commands.registerCommand('aem-bulk-installer.create-package', async () => {
        await handleCreatePackage('create');
    });

    // Create + Build Package Command
    let createBuildPkgCmd = vscode.commands.registerCommand('aem-bulk-installer.create-build-package', async () => {
        await handleCreatePackage('build');
    });

    // Create + Build + Replicate Package Command
    let createBuildReplicatePkgCmd = vscode.commands.registerCommand('aem-bulk-installer.create-build-replicate-package', async () => {
        await handleCreatePackage('replicate');
    });

    context.subscriptions.push(
        uploadCmd,
        installCmd,
        backupCmd,
        replicateCmd,
        installReplicateCmd,
        createPkgCmd,
        createBuildPkgCmd,
        createBuildReplicatePkgCmd
    );
}

export function deactivate() {}

