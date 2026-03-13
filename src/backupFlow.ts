import * as admZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';
import { AemClient } from './aemClient';
import * as vscode from 'vscode';

export async function backupPackage(client: AemClient, packagePath: string, outputDir: string): Promise<string> {
    const ext = path.extname(packagePath);
    if (ext.toLowerCase() !== '.zip') {
        throw new Error('Only .zip packages can be backed up.');
    }

    const zip = new admZip(packagePath);
    const propertiesEntry = zip.getEntry('META-INF/vault/properties.xml');

    if (!propertiesEntry) {
        throw new Error('META-INF/vault/properties.xml not found in the package.');
    }

    let propertiesXml = propertiesEntry.getData().toString('utf8');

    // Replace version with <vno>-backup
    const versionMatch = propertiesXml.match(/<entry key="version">([^<]+)<\/entry>/);
    let originalVersion = 'unknown';
    if (versionMatch && versionMatch[1]) {
        originalVersion = versionMatch[1];
        propertiesXml = propertiesXml.replace(
            /<entry key="version">([^<]+)<\/entry>/,
            `<entry key="version">$1-backup</entry>`
        );
    } else {
        // if no version, append one
        propertiesXml = propertiesXml.replace(
            /<\/properties>/,
            `  <entry key="version">1.0-backup</entry>\n</properties>`
        );
    }

    zip.updateFile('META-INF/vault/properties.xml', Buffer.from(propertiesXml, 'utf8'));

    // Try to update the name to avoid conflicting with the original file
    const basename = path.basename(packagePath, '.zip');
    const newFileName = `${basename}-backup.zip`;
    const tempFilePath = path.join(outputDir, newFileName);

    zip.writeZip(tempFilePath);

    // Upload to AEM
    const aemPackagePath = await client.uploadPackage(tempFilePath, true);

    // Build the package in AEM
    await client.buildPackage(aemPackagePath);

    // Download it back to local
    const downloadDestPath = path.join(outputDir, `${basename}-backup-built.zip`);
    await client.downloadPackage(aemPackagePath, downloadDestPath);

    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
    }

    return downloadDestPath;
}
