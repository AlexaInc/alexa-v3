const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const http = require('http');
const https = require('https');
const net = require('net');

/**
 * Centrally manages proxy agents for the entire application.
 * Handles both SOCKS and HTTP/HTTPS proxies.
 */
class ProxyHelper {
    constructor() {
        this.proxyUrl = process.env.PROXY_URL;
        // New configuration options
        this.rejectUnauthorized = process.env.PROXY_REJECT_UNAUTHORIZED !== 'false';
        this.timeout = parseInt(process.env.PROXY_TIMEOUT || '60000', 10);
        this.disableGlobal = process.env.PROXY_DISABLE_GLOBAL === 'false';

        // Default bypasses + user provided + Aiven
        const defaultBypass = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '.aivencloud.com'];
        const userBypass = (process.env.NO_PROXY || '').split(',').map(h => h.trim()).filter(Boolean);
        const dbHost = process.env.DB_HOST || '';

        this.noProxy = [...new Set([...defaultBypass, ...userBypass, dbHost])];

        // --- CRITICAL: Add proxy host itself to noProxy to prevent infinite recursion ---
        if (this.proxyUrl) {
            try {
                const proxyHost = new URL(this.proxyUrl).hostname;
                if (!this.noProxy.some(h => h.trim() === proxyHost)) {
                    this.noProxy.push(proxyHost);
                }
            } catch (e) {
                console.error('⚠️ Could not parse PROXY_URL for bypass:', e.message);
            }
        }

        console.log(`ℹ️ Proxy System: rejectUnauthorized=${this.rejectUnauthorized}, timeout=${this.timeout}`);
        console.log(`ℹ️ Proxy Bypass Hosts: ${this.noProxy.join(', ')}`);

        this.agent = this._createAgent();
    }

    _createAgent() {
        if (!this.proxyUrl) return null;

        const options = {
            keepAlive: true,
            timeout: this.timeout,
            rejectUnauthorized: this.rejectUnauthorized,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Proxy-Connection': 'keep-alive'
            }
        };

        if (this.proxyUrl.startsWith('socks')) {
            console.log(`🚀 Initializing SOCKS Proxy Agent: ${this.proxyUrl}`);
            return new SocksProxyAgent(this.proxyUrl, options);
        } else {
            console.log(`🚀 Initializing HTTPS Proxy Agent: ${this.proxyUrl}`);
            return new HttpsProxyAgent(this.proxyUrl, options);
        }
    }

    /**
     * Checks if a URL should bypass the proxy.
     * @param {string} urlStr 
     * @returns {boolean}
     */
    shouldBypass(urlStr) {
        if (!urlStr) return true;
        try {
            const url = new URL(urlStr);
            const hostname = url.hostname.toLowerCase();

            return this.noProxy.some(host => {
                const h = host.trim().toLowerCase();
                if (!h) return false;

                // Direct match
                if (hostname === h) return true;

                // Wildcard/Domain match (e.g. .host.com matching sub.host.com)
                if (h.startsWith('.') && hostname.endsWith(h)) return true;

                // Basic contains match for common domains (safety fallback)
                if (h.includes('.') && hostname.includes(h)) return true;

                return false;
            });
        } catch (e) {
            return true;
        }
    }

    /**
     * Returns the appropriate agent for a given URL.
     * @param {string} urlStr 
     * @returns {object|null}
     */
    getAgent(urlStr) {
        if (!this.agent) return null;
        const bypass = this.shouldBypass(urlStr);
        if (bypass) {
            // console.log(`[Proxy] Bypassing: ${urlStr}`);
            return null;
        }
        console.log(`[Proxy] Proxying: ${urlStr}`);
        return this.agent;
    }

    /**
     * Configures a global axios instance or interceptor.
     */
    configureAxios() {
        if (!this.agent) return;

        // Apply to global axios
        axios.interceptors.request.use((config) => {
            const agent = this.getAgent(config.url);
            if (agent) {
                config.httpAgent = agent;
                config.httpsAgent = agent;
            }
            return config;
        });

        console.log('✅ Global Axios Proxy configured');
    }

    /**
     * Overrides global http and https agents.
     * WARNING: This may affect all outgoing requests in the process.
     */
    configureGlobal() {
        if (!this.agent || this.disableGlobal) {
            if (this.disableGlobal) console.log('ℹ️ Global Node.js Proxy override is DISABLED via PROXY_DISABLE_GLOBAL');
            return;
        }

        const agent = this.agent;

        // Wrap original request methods to apply proxy selectively
        const originalHttpRequest = http.request;
        const originalHttpsRequest = https.request;

        const wrapRequest = (originalConfig, defaultProtocol) => {
            return (options, ...args) => {
                let urlObj;
                let requestOptions;

                if (typeof options === 'string') {
                    urlObj = new URL(options);
                    requestOptions = {
                        protocol: urlObj.protocol,
                        hostname: urlObj.hostname,
                        port: urlObj.port,
                        path: urlObj.pathname + urlObj.search,
                        hash: urlObj.hash,
                    };
                } else if (options instanceof URL) {
                    urlObj = options;
                    requestOptions = {
                        protocol: urlObj.protocol,
                        hostname: urlObj.hostname,
                        port: urlObj.port,
                        path: urlObj.pathname + urlObj.search,
                    };
                } else {
                    requestOptions = { ...options };
                    const protocol = requestOptions.protocol || defaultProtocol;
                    const host = requestOptions.hostname || requestOptions.host || 'localhost';
                    const path = requestOptions.path || '';
                    try {
                        urlObj = new URL(`${protocol}//${host}${path}`);
                    } catch (e) {
                        return originalConfig.call(null, options, ...args);
                    }
                }

                if (!this.shouldBypass(urlObj.href)) {
                    requestOptions.agent = agent;
                }

                return originalConfig.call(null, requestOptions, ...args);
            };
        };

        http.request = wrapRequest(originalHttpRequest, 'http:');
        https.request = wrapRequest(originalHttpsRequest, 'https:');

        console.log('✅ Global Node.js Proxy (HTTP/HTTPS) configured');
    }

    /**
     * Checks TCP connectivity to the proxy server.
     * @returns {Promise<boolean>}
     */
    async checkProxyConnectivity() {
        if (!this.proxyUrl) return true;

        try {
            const url = new URL(this.proxyUrl);
            const host = url.hostname;
            const port = url.port || (url.protocol === 'https:' ? 443 : 80);

            console.log(`🔍 Testing Proxy Connectivity to ${host}:${port}...`);

            return new Promise((resolve) => {
                const socket = new net.Socket();
                socket.setTimeout(this.timeout);

                socket.on('connect', () => {
                    console.log('✅ Proxy is REACHABLE');
                    socket.destroy();
                    resolve(true);
                });

                socket.on('timeout', () => {
                    console.error(`❌ Proxy connection TIMEOUT (${this.timeout}ms). Firewall might be blocking port ${port}.`);
                    socket.destroy();
                    resolve(false);
                });

                socket.on('error', (err) => {
                    console.error(`❌ Proxy connection FAILED: ${err.message}`);
                    socket.destroy();
                    resolve(false);
                });

                socket.connect(port, host);
            });
        } catch (e) {
            console.error('❌ Invalid Proxy URL:', e.message);
            return false;
        }
    }

    /**
     * Gets Puppeteer launch arguments for proxy.
     */
    getPuppeteerArgs() {
        if (!this.proxyUrl) return [];
        return [`--proxy-server=${this.proxyUrl}`];
    }
}

const proxyHelper = new ProxyHelper();
module.exports = proxyHelper;
