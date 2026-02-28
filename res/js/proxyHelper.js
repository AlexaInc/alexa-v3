const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const { URL } = require('url');

/**
 * Centrally manages proxy agents for the entire application.
 * Handles both SOCKS and HTTP/HTTPS proxies.
 */
class ProxyHelper {
    constructor() {
        this.proxyUrl = process.env.PROXY_URL;
        // New configuration options
        // Default to false for proxy rejectUnauthorized to be more compatible
        this.rejectUnauthorized = process.env.PROXY_REJECT_UNAUTHORIZED === 'true';
        // Increase default timeout to 120s for HF
        this.timeout = parseInt(process.env.PROXY_TIMEOUT || '120000', 10);
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
        // console.log(`ℹ️ Proxy Bypass Hosts: ${this.noProxy.join(', ')}`);

        this.agent = this._createAgent();
    }

    _createAgent() {
        if (!this.proxyUrl) return null;

        let finalProxyUrl = this.proxyUrl;

        // Universal Xray Sidecar Handling: Redirect all supported proxies to local sidecar
        const supportedProtocols = ['vmess://', 'vless://', 'ss://', 'trojan://', 'socks', 'http'];
        const isSupported = supportedProtocols.some(p => finalProxyUrl.startsWith(p));
        const isLocalSidecar = finalProxyUrl.includes('127.0.0.1:10808');

        if (isSupported && !isLocalSidecar) {
            console.log(`🚀 Proxy System: Protocol detected. Routing through local Xray sidecar (127.0.0.1:10809) ...`);
            finalProxyUrl = 'http://127.0.0.1:10809'; // Use HTTP inbound for better Node.js compatibility
        }

        const options = {
            keepAlive: true,
            timeout: this.timeout,
            rejectUnauthorized: false, // Force false for maximum compatibility
        };

        if (finalProxyUrl.startsWith('socks')) {
            console.log(`🚀 Proxy System: Initializing SOCKS Proxy Agent for ${finalProxyUrl.split('@').pop()}`);
            return new SocksProxyAgent(finalProxyUrl, options);
        } else {
            console.log(`🚀 Proxy System: Initializing HTTPS Proxy Agent for ${finalProxyUrl.split('@').pop()}`);
            return new HttpsProxyAgent(finalProxyUrl, options);
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
        // console.log(`[Proxy] Proxying: ${urlStr}`);
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
     * Checks full connectivity through the proxy.
     * @returns {Promise<boolean>}
     */
    async checkProxyConnectivity() {
        if (!this.proxyUrl) return true;

        try {
            const url = new URL(this.proxyUrl);
            const host = url.hostname;
            const port = parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10);

            console.log(`🔍 Testing Proxy Tunnel to ${host}:${port}...`);

            // Phase 1: TCP Check
            const tcpOk = await new Promise((resolve) => {
                const s = net.connect({ host, port, timeout: 5000 }, () => {
                    s.end();
                    resolve(true);
                });
                s.on('error', () => resolve(false));
            });

            if (!tcpOk) {
                console.error('❌ Proxy is UNREACHABLE (TCP failed). HF might be blocking this IP/Port.');
                return false;
            }
            console.log('✅ Proxy TCP connection ok.');

            // Phase 2: Tunnel Check (Minimal)
            try {
                // Use a fresh axios instance to avoid interceptor recursion
                const testAxios = axios.create({ timeout: 15000 });
                console.log('📡 Verifying HTTPS tunnel (google.com)...');
                await testAxios.get('https://www.google.com', {
                    httpsAgent: this.agent,
                    proxy: false // Don't use axios default proxy
                });
                console.log('✅ Proxy Tunnel is WORKING!');
                return true;
            } catch (err) {
                console.error(`⚠️ Proxy Tunnel VERIFICATION FAILED: ${err.message}`);
                console.log('ℹ️ Bot will still attempt connection, but failure is likely.');
                return true; // Don't block startup, but warn
            }
        } catch (e) {
            console.error('❌ Invalid Proxy Configuration:', e.message);
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
