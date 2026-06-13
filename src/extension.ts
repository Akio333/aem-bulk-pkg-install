import * as vscode from 'vscode';
import * as path from 'path';
import { AemClient, AemConfig } from './aemClient';
import { backupPackage } from './backupFlow';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('AEM Bulk Installer');
    context.subscriptions.push(outputChannel);

    const getAuthorConfig = (): AemConfig => {
        const config = vscode.workspace.getConfiguration('aemBulkInstaller');
        const defaultUrl = config.get<string>('server.url', 'http://localhost');
        const defaultPort = config.get<string>('server.port', '4502');
        const defaultUsername = config.get<string>('server.username', 'admin');
        const defaultPassword = config.get<string>('server.password', 'admin');

        return {
            url: config.get<string>('author.url') || defaultUrl,
            port: config.get<string>('author.port') || defaultPort,
            username: config.get<string>('author.username') || defaultUsername,
            password: config.get<string>('author.password') || defaultPassword
        };
    };

    const getPublishConfig = (): AemConfig => {
        const config = vscode.workspace.getConfiguration('aemBulkInstaller');
        return {
            url: config.get<string>('publish.url', 'http://localhost'),
            port: config.get<string>('publish.port', '4503'),
            username: config.get<string>('publish.username', 'admin'),
            password: config.get<string>('publish.password', 'admin')
        };
    };

    const processFiles = async (
        actionName: string,
        uris: vscode.Uri[],
        action: (authorClient: AemClient, publishClient: AemClient, filePath: string, outputDir: string) => Promise<void>
    ) => {
        if (!uris || uris.length === 0) {
            vscode.window.showWarningMessage('No files selected.');
            return;
        }

        const authorClient = new AemClient(getAuthorConfig());
        const publishClient = new AemClient(getPublishConfig());

        outputChannel.show(true);
        outputChannel.appendLine(`--- Starting: ${actionName} ---`);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `AEM: ${actionName}`,
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
                    await action(authorClient, publishClient, fsPath, path.dirname(fsPath));
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
        await processFiles('Upload files', urisToProcess, async (authorClient, publishClient, filePath) => {
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
         await processFiles('Install files', urisToProcess, async (authorClient, publishClient, filePath) => {
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
         await processFiles('Backup packages', urisToProcess, async (authorClient, publishClient, filePath, outputDir) => {
              await backupPackage(authorClient, filePath, outputDir);
         });
    });

    // Replicate Command
    let replicateCmd = vscode.commands.registerCommand('aem-bulk-installer.replicate', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        const urisToProcess = selectedUris || (_uri ? [_uri] : []);
        await processFiles('Replicate files', urisToProcess, async (authorClient, publishClient, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                outputChannel.appendLine(`    Uploading package to Author...`);
                const pkgPath = await authorClient.uploadPackage(filePath, true);
                outputChannel.appendLine(`    Uploading done, starting replication for ${pkgPath}...`);
                await authorClient.replicatePackage(pkgPath);
            } else if (ext === '.jar') {
                outputChannel.appendLine(`    Installing bundle to Publish...`);
                await publishClient.installBundle(filePath);
            } else {
                throw new Error('Unsupported check extension.');
            }
        });
    });

    // Install + Replicate Command
    let installReplicateCmd = vscode.commands.registerCommand('aem-bulk-installer.install-replicate', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        const urisToProcess = selectedUris || (_uri ? [_uri] : []);
        await processFiles('Install + Replicate files', urisToProcess, async (authorClient, publishClient, filePath) => {
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
                
                outputChannel.appendLine(`    Installing bundle to Publish...`);
                await publishClient.installBundle(filePath);
            } else {
                throw new Error('Unsupported check extension.');
            }
        });
    });

    context.subscriptions.push(uploadCmd, installCmd, backupCmd, replicateCmd, installReplicateCmd);
}

export function deactivate() {}
