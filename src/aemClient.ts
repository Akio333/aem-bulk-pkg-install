import axios, { AxiosInstance } from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export interface AemConfig {
    url: string;
    port: string;
    username?: string;
    password?: string;
}

export class AemClient {
    private client: AxiosInstance;

    constructor(private config: AemConfig) {
        const baseURL = `${this.config.url.replace(/\/$/, '')}:${this.config.port}`;
        this.client = axios.create({
            baseURL,
            auth: {
                username: this.config.username || 'admin',
                password: this.config.password || 'admin'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
    }

    async uploadPackage(filePath: string, force: boolean = true): Promise<string> {
        const formData = new FormData();
        formData.append('package', fs.createReadStream(filePath));
        formData.append('force', force.toString());

        const response = await this.client.post('/crx/packmgr/service/.json/?cmd=upload', formData, {
            headers: formData.getHeaders()
        });

        if (response.data && response.data.success) {
            return response.data.path; // e.g. /etc/packages/my_packages/test-1.0.zip
        } else {
            throw new Error(`Upload failed: ${response.data ? response.data.msg : response.statusText}`);
        }
    }

    async installPackage(packagePath: string): Promise<void> {
        const url = `/crx/packmgr/service/.json${packagePath}?cmd=install`;
        const response = await this.client.post(url);

        if (!(response.data && response.data.success)) {
            throw new Error(`Install failed: ${response.data ? response.data.msg : response.statusText}`);
        }
    }

    async buildPackage(packagePath: string): Promise<void> {
        const url = `/crx/packmgr/service/.json${packagePath}?cmd=build`;
        const response = await this.client.post(url);

        if (!(response.data && response.data.success)) {
            throw new Error(`Build failed: ${response.data ? response.data.msg : response.statusText}`);
        }
    }

    async downloadPackage(packagePath: string, destPath: string): Promise<void> {
        const url = packagePath; // e.g., /etc/packages/my_packages/test-1.0.zip
        const response = await this.client.get(url, { responseType: 'stream' });
        
        const writer = fs.createWriteStream(destPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    async installBundle(filePath: string): Promise<void> {
        const formData = new FormData();
        formData.append('action', 'install');
        formData.append('bundlestart', 'true');
        formData.append('refreshPackages', 'true');
        formData.append('bundlefile', fs.createReadStream(filePath));

        const response = await this.client.post('/system/console/bundles', formData, {
            headers: formData.getHeaders()
        });

        if (response.status !== 200 && response.status !== 302) {
             throw new Error(`Bundle install failed: ${response.statusText}`);
        }
    }
}
