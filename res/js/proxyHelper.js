const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const http = require('http');
const https = require('https');

/**
 * Centrally manages proxy agents for the entire application.
 * Handles both SOCKS and HTTP/HTTPS proxies.
 */
class ProxyHelper {
    constructor() {
        this.proxyUrl = process.env.PROXY_URL;
        const dbHost = process.env.DB_HOST || '';
        this.noProxy = (process.env.NO_PROXY || 'localhost,127.0.0.1,::1,0.0.0.0,' + dbHost).split(',');
        this.agent = this._createAgent();
    }

    _createAgent() {
        if (!this.proxyUrl) return null;

        if (this.proxyUrl.startsWith('socks')) {
            return new SocksProxyAgent(this.proxyUrl);
        } else {
            return new HttpsProxyAgent(this.proxyUrl);
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
            return this.noProxy.some(host => {
                const trimmedHost = host.trim();
                return url.hostname.includes(trimmedHost) || (trimmedHost.startsWith('.') && url.hostname.endsWith(trimmedHost));
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
        if (!this.agent || this.shouldBypass(urlStr)) return null;
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
        if (!this.agent) return;

        const agent = this.agent;

        // Wrap original request methods to apply proxy selectively
        const originalHttpRequest = http.request;
        const originalHttpsRequest = https.request;

        http.request = (options, callback) => {
            let url;
            if (typeof options === 'string') {
                url = options;
            } else if (options instanceof URL) {
                url = options.toString();
            } else {
                const protocol = options.protocol || 'http:';
                const host = options.hostname || options.host || 'localhost';
                const path = options.path || '';
                url = `${protocol}//${host}${path}`;
            }

            if (!this.shouldBypass(url)) {
                if (typeof options === 'object' && !(options instanceof URL)) {
                    options.agent = agent;
                }
            }
            return originalHttpRequest.call(http, options, callback);
        };

        https.request = (options, callback) => {
            let url;
            if (typeof options === 'string') {
                url = options;
            } else if (options instanceof URL) {
                url = options.toString();
            } else {
                const protocol = options.protocol || 'https:';
                const host = options.hostname || options.host || 'localhost';
                const path = options.path || '';
                url = `${protocol}//${host}${path}`;
            }

            if (!this.shouldBypass(url)) {
                if (typeof options === 'object' && !(options instanceof URL)) {
                    options.agent = agent;
                }
            }
            return originalHttpsRequest.call(https, options, callback);
        };

        console.log('✅ Global Node.js Proxy (HTTP/HTTPS) configured');
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
