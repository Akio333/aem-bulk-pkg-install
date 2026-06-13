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
        publish: AemConfig;
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
                    },
                    publish: {
                        url: 'http://localhost',
                        port: '4503',
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
            },
            publish: {
                url: env.publish?.url || 'http://localhost',
                port: env.publish?.port || '4503',
                username: env.publish?.username || 'admin',
                password: env.publish?.password || 'admin'
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
                description: `${env.author.url}:${env.author.port} (Author) | ${env.publish.url}:${env.publish.port} (Publish)${env.isProd ? ' [PROD]' : ''}`,
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
        action: (authorClient: AemClient, publishClient: AemClient, filePath: string, outputDir: string) => Promise<void>
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
        const publishClient = new AemClient(env.publish);

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
