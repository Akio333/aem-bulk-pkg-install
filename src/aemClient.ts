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

    async installPackage(packagePath: string, onLog?: (msg: string) => void): Promise<void> {
        if (!onLog) {
            const url = `/crx/packmgr/service/.json${packagePath}?cmd=install`;
            const response = await this.client.post(url);

            if (!(response.data && response.data.success)) {
                throw new Error(`Install failed: ${response.data ? response.data.msg : response.statusText}`);
            }
            return;
        }

        const url = `/crx/packmgr/service/script.html${packagePath}?cmd=install`;
        const response = await this.client.post(url, undefined, { responseType: 'stream' });

        return new Promise((resolve, reject) => {
            let buffer = '';
            let hasError = false;
            let errorMsg = '';

            const processBuffer = () => {
                // Match the JS callbacks
                const regex = /callback\(\s*'([\s\S]*?)'\s*\);?/g;
                let match;
                while ((match = regex.exec(buffer)) !== null) {
                    let cleanMsg = match[1];
                    cleanMsg = cleanMsg.replace(/\\r/g, '').replace(/\\n/g, '\n');
                    cleanMsg = cleanMsg.replace(/\\\//g, '/');
                    
                    const lines = cleanMsg.split('\n');
                    for (let line of lines) {
                        // Strip HTML tags like <span>, <b>, <br>
                        line = line.replace(/<[^>]+>/g, '').trim();
                        // Unescape HTML entities
                        line = line.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

                        if (line) {
                            onLog(`    ${line}`);
                            if (line.toLowerCase().includes('error')) {
                                hasError = true;
                                errorMsg += line + ' ';
                            }
                        }
                    }
                    
                    buffer = buffer.substring(match.index + match[0].length);
                    regex.lastIndex = 0;
                }

                // Match arbitrary HTML spans that aren't inside callbacks (like the latter half of the log)
                // e.g. <span class="saving approx 0 nodes..."><b>saving approx 0 nodes...</b>&nbsp;</span><br>
                // We shouldn't parse HTML with regex generally, but since we are just stripping it, we can split by \n or <br> and strip.
                let parts = buffer.split(/(?:<br\s*\/?>|\n)/i);
                // Keep the last part in buffer as it might be incomplete
                buffer = parts.pop() || '';
                
                for (let part of parts) {
                    let isErrorNode = part.toLowerCase().includes('class="error"');
                    // Strip HTML
                    let text = part.replace(/<[^>]+>/g, '').trim();
                    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    
                    if (text) {
                        // Avoid duplicating JS callback text if it was somehow caught in parts
                        if (!text.startsWith("function ") && !text.startsWith("console.log") && text !== "}") {
                            onLog(`    ${text}`);
                            if (isErrorNode || text.toLowerCase().includes('error')) {
                                hasError = true;
                                errorMsg += text + ' ';
                            }
                        }
                    }
                }

                // Check for JSON messages like {"success":true,"msg":"Package installed"}
                const jsonRegex = /\{"success":\s*(true|false)\s*,\s*"msg":\s*"([^"]+)"\}/g;
                while ((match = jsonRegex.exec(buffer)) !== null) {
                    onLog(`    ${match[2]}`);
                    if (match[1] === 'false') {
                        hasError = true;
                        errorMsg += match[2] + ' ';
                    }
                    buffer = buffer.substring(match.index + match[0].length);
                    jsonRegex.lastIndex = 0;
                }
            };

            response.data.on('data', (chunk: Buffer) => {
                buffer += chunk.toString('utf8');
                processBuffer();
            });

            response.data.on('end', () => {
                processBuffer(); // Process any remaining
                
                if (hasError) {
                    reject(new Error(`Install failed: ${errorMsg.trim() || 'Please check logs.'}`));
                } else {
                    resolve();
                }
            });

            response.data.on('error', (err: any) => {
                reject(err);
            });
        });
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
