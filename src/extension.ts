import * as vscode from 'vscode';
import * as path from 'path';
import { AemClient, AemConfig } from './aemClient';
import { backupPackage } from './backupFlow';

export function activate(context: vscode.ExtensionContext) {

    const getAemConfig = (): AemConfig => {
        const config = vscode.workspace.getConfiguration('aemBulkInstaller');
        return {
            url: config.get<string>('server.url', 'http://localhost'),
            port: config.get<string>('server.port', '4502'),
            username: config.get<string>('server.username', 'admin'),
            password: config.get<string>('server.password', 'admin')
        };
    };

    const processFiles = async (
        actionName: string,
        uris: vscode.Uri[],
        action: (client: AemClient, filePath: string, outputDir: string) => Promise<void>
    ) => {
        if (!uris || uris.length === 0) {
            vscode.window.showWarningMessage('No files selected.');
            return;
        }

        const client = new AemClient(getAemConfig());

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
                
                try {
                    await action(client, fsPath, path.dirname(fsPath));
                    successCount++;
                } catch (error: any) {
                    failCount++;
                    vscode.window.showErrorMessage(`Failed to process ${fileName}: ${error.message}`);
                }
            }

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
        await processFiles('Upload files', urisToProcess, async (client, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                await client.uploadPackage(filePath, true);
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
         await processFiles('Install files', urisToProcess, async (client, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.zip') {
                const pkgPath = await client.uploadPackage(filePath, true);
                await client.installPackage(pkgPath);
            } else if (ext === '.jar') {
                await client.installBundle(filePath);
            } else {
                 throw new Error('Unsupported check extension.');
            }
         });
    });

    // Backup Command
    let backupCmd = vscode.commands.registerCommand('aem-bulk-installer.backup', async (_uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
         const urisToProcess = selectedUris || (_uri ? [_uri] : []);
         await processFiles('Backup packages', urisToProcess, async (client, filePath, outputDir) => {
             await backupPackage(client, filePath, outputDir);
         });
    });

    context.subscriptions.push(uploadCmd, installCmd, backupCmd);
}

export function deactivate() {}
