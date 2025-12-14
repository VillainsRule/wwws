import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';

import socksConnect from './socksConnect.js';

export interface WWWebSocketOptions {
    headers?: Record<string, string>;
    proxy?: string;
    agent?: any;
}

export type WWWebSocketEvent = 'open' | 'message' | 'error' | 'close' | 'ping' | 'pong';

class WWWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    binaryType = 'nodebuffer';
    readyState = WWWebSocket.CONNECTING;
    rejectUnauthorized = true;

    url = '';

    onopen: ((this: WWWebSocket, ev: any) => any) | null = null;
    onerror: ((this: WWWebSocket, ev: any) => any) | null = null;
    onclose: ((this: WWWebSocket, ev: any) => any) | null = null;
    onmessage: ((this: WWWebSocket, ev: { data: any }) => any) | null = null;

    $socket: net.Socket | tls.TLSSocket | null = null;
    $connectionHeaders: Record<string, string> = {};
    $perMessageDeflate = false;
    $listeners: Record<string, Function[]>;

    constructor(wsUrl: string, options: WWWebSocketOptions = {}) {
        if (typeof options !== 'object') options = {};

        if (options.agent) {
            const protocol = options.agent.shouldLookup ? 'socks5' : 'socks5h';
            const authString = options.agent.proxy.userId ? `${options.agent.proxy.userId}:${options.agent.proxy.password}@` : '';
            const proxyUrl = `${protocol}://${authString}${options.agent.proxy.host}:${options.agent.proxy.port}`;

            options.proxy = proxyUrl;
        }

        this.url = wsUrl;
        this.readyState = WWWebSocket.CONNECTING;

        this.$listeners = { open: [], message: [], error: [], close: [] };
        this.$socket = null;
        this.$connect(wsUrl, options.headers || {}, options.proxy);
    }

    async $connect(wsUrl: string, headerObject: Record<string, string>, proxyUrl?: string) {
        try {
            const ws = new URL(wsUrl);
            const useTLS = ws.protocol === 'wss:';
            const destHost = ws.hostname;
            const destPort = ws.port ? Number(ws.port) : (useTLS ? 443 : 80);

            if (proxyUrl) {
                const proxy = new URL(proxyUrl);
                const scheme = proxy.protocol.replace(':', '');
                const resolveDnsLocally = scheme === 'socks5';
                if (!['socks5', 'socks5h'].includes(scheme)) {
                    throw new Error(`Unsupported proxy protocol: ${scheme}`);
                }

                this.$socket = await socksConnect({
                    proxy: {
                        hostname: proxy.hostname,
                        port: Number(proxy.port),
                        username: proxy.username,
                        password: proxy.password
                    },
                    destHost,
                    destPort,
                    useTLS,
                    resolveDnsLocally,
                    rejectUnauthorized: this.rejectUnauthorized
                });
            } else {
                if (useTLS) {
                    const tlsOptions: tls.ConnectionOptions = { host: destHost, port: destPort, rejectUnauthorized: this.rejectUnauthorized };
                    const isIpAddress = /^(\d+\.){3}\d+$/.test(destHost) || destHost === '::1' || /^::/.test(destHost);
                    if (!isIpAddress) tlsOptions.servername = destHost;
                    this.$socket = tls.connect(tlsOptions);
                } else this.$socket = net.connect(destPort, destHost);
            }

            if (!this.$socket) throw new Error('Failed to create socket');

            const key = crypto.randomBytes(16).toString('base64');

            const headers = {
                ...Object.fromEntries(Object.entries(headerObject).map(([k, v]) => [k.toLowerCase(), v])),
                'host': destHost,
                'upgrade': 'websocket',
                'connection': 'Upgrade',
                'sec-websocket-key': key,
                'sec-websocket-version': '13'
            };

            this.$connectionHeaders = headers;

            this.$socket.write(
                `GET ${ws.pathname}${ws.search} HTTP/1.1` +
                Object.entries(headers).map(([k, v]) => `\r\n${k}: ${v}`).join('') +
                '\r\n\r\n'
            );

            let handshake = '';
            this.$socket.on('data', (chunk) => {
                if (this.readyState !== WWWebSocket.CONNECTING || !this.$socket) return;
                handshake += chunk.toString();
                if (handshake.includes('\r\n\r\n')) {
                    if (!handshake.includes('101 Switching Protocols')) {
                        this.$emit('error', new Error('WebSocket handshake failed'));
                        this.close();
                        return;
                    }
                    this.$perMessageDeflate = handshake.toLowerCase().includes('sec-websocket-extensions') &&
                        handshake.toLowerCase().includes('permessage-deflate');
                    this.readyState = WWWebSocket.OPEN;
                    this.$emit('open');
                    // we need to find out where the headers end, since we don't care about those
                    const leftover = chunk.slice(chunk.indexOf('\r\n\r\n') + 4);
                    if (leftover.length > 0) this.$readFrame(leftover);
                    this.$socket.on('data', (data) => this.$readFrame(data));
                    this.$socket.on('close', (info) => this.$emit('close', info));
                    this.$socket.on('error', (err) => this.$emit('error', err));
                }
            });
        } catch (err) {
            console.error(err);
            this.$emit('error', err);
            this.close();
        }
    }

    // this was the worst thing i've ever written
    $readFrame(data: any) {
        let offset = 0;
        while (offset < data.length) {
            if (offset + 2 > data.length) return; // malformed message
            const byte1 = data[offset++];
            const opcode = byte1 & 0x0f;
            const rsv1 = (byte1 & 0x40) !== 0;
            const byte2 = data[offset++];
            const mask = (byte2 & 0x80) !== 0;
            let len = byte2 & 0x7f;
            if (len === 126) {
                if (offset + 2 > data.length) return;
                len = data.readUInt16BE(offset);
                offset += 2;
            } else if (len === 127) {
                if (offset + 8 > data.length) return;
                len = Number(data.readBigUInt64BE(offset));
                offset += 8;
            }
            let maskingKey;
            if (mask) {
                if (offset + 4 > data.length) return;
                maskingKey = data.slice(offset, offset + 4);
                offset += 4;
            }
            if (offset + len > data.length) return;
            let payload = data.slice(offset, offset + len);
            offset += len;
            if (mask && maskingKey) {
                payload = Buffer.from(payload.map((b: number, i: number) => b ^ maskingKey[i % 4]));
            }

            if (
                (opcode === 0x1 || opcode === 0x2) &&
                this.$connectionHeaders['sec-websocket-extensions']?.includes('permessage-deflate') &&
                rsv1
            ) {
                // decompress
                zlib.inflateRaw(payload, (err, result) => {
                    if (err) return this.$emit('error', err);

                    if (opcode === 0x1) {
                        this.$emit('message', { data: result.toString() });
                    } else {
                        let dataOut;
                        if (this.binaryType === 'arraybuffer') dataOut = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
                        else dataOut = result;
                        this.$emit('message', { data: dataOut });
                    }
                });
            } else if (opcode === 0x1) { // text frame
                this.$emit('message', { data: payload.toString() });
            } else if (opcode === 0x2) { // binary frame
                let dataOut;
                if (this.binaryType === 'arraybuffer') dataOut = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
                else dataOut = payload; // nodebuffer
                this.$emit('message', { data: dataOut });
            } else if (opcode === 0x8) { // close frame
                let code, reason;
                if (payload.length >= 2) {
                    code = payload.readUInt16BE(0);
                    reason = payload.slice(2).toString();
                }
                this.$emit('close', { code, reason });
                if (this.readyState === WWWebSocket.CLOSING) {
                    this.$socket?.end();
                    this.readyState = WWWebSocket.CLOSED;
                } else this.close(code, reason);
            } else if (opcode === 0x9) { // ping frame
                this.pong(payload);
                this.$emit('ping', { data: payload });
            } else if (opcode === 0xA) { // pong frame
                this.$emit('pong', { data: payload });
            }
        }
    }

    ping(data = '') {
        if (this.readyState !== WWWebSocket.OPEN || !this.$socket) throw new Error('WebSocket not open');
        const payload = Buffer.from(data);
        const header = Buffer.alloc(2);
        header[0] = 0x89; // FIN + ping frame
        header[1] = payload.length | 0x80; // mask bit set
        const maskingKey = crypto.randomBytes(4);
        const masked = Buffer.from(payload.map((b, i) => b ^ maskingKey[i % 4]));
        this.$socket.write(Buffer.concat([header, maskingKey, masked]));
    }

    pong(data = '') {
        if (this.readyState !== WWWebSocket.OPEN || !this.$socket) throw new Error('WebSocket not open');
        const payload = Buffer.from(data);
        const header = Buffer.alloc(2);
        header[0] = 0x8A; // FIN + pong frame
        header[1] = payload.length | 0x80; // mask bit set
        const maskingKey = crypto.randomBytes(4);
        const masked = Buffer.from(payload.map((b, i) => b ^ maskingKey[i % 4]));
        this.$socket.write(Buffer.concat([header, maskingKey, masked]));
    }

    send(data: any) {
        if (this.readyState !== 1 || !this.$socket) throw new Error('WebSocket not open');
        const payload = Buffer.from(data);
        const isText = typeof data === 'string';
        const opcode = isText ? 0x1 : 0x2;
        const compress = this.$perMessageDeflate && isText;
        const sendFrame = (finalPayload: Buffer, useRsv1 = false) => {
            let header = Buffer.alloc(2);
            header[0] = 0x80 | (useRsv1 ? 0x40 : 0x00) | opcode; // FIN + RSV1 if compressed + opcode
            if (finalPayload.length < 126) {
                header[1] = finalPayload.length | 0x80;
            } else if (finalPayload.length < 65536) {
                header = Buffer.alloc(4);
                header[0] = 0x80 | (useRsv1 ? 0x40 : 0x00) | opcode;
                header[1] = 126 | 0x80;
                header.writeUInt16BE(finalPayload.length, 2);
            } else {
                header = Buffer.alloc(10);
                header[0] = 0x80 | (useRsv1 ? 0x40 : 0x00) | opcode;
                header[1] = 127 | 0x80;
                header.writeBigUInt64BE(BigInt(finalPayload.length), 2);
            }
            const maskingKey = crypto.randomBytes(4);
            const masked = Buffer.from(finalPayload.map((b, i) => b ^ maskingKey[i % 4]));
            this.$socket!.write(Buffer.concat([header, maskingKey, masked]));
        };
        if (compress) zlib.deflateRaw(payload, (err, compressed) => {
            if (err) {
                this.$emit('error', err);
                return;
            }
            sendFrame(compressed, true);
        });
        else sendFrame(payload, false);
    }

    close(code?: number, reason?: string) {
        if (this.readyState === WWWebSocket.CLOSING) return;
        this.readyState = WWWebSocket.CLOSING;
        if (this.$socket) {
            // send close frame
            let payload;
            if (code) {
                payload = Buffer.alloc(2 + (reason ? Buffer.byteLength(reason) : 0));
                payload.writeUInt16BE(code, 0);
                if (reason) payload.write(reason, 2);
            } else payload = Buffer.alloc(0);

            const header = Buffer.alloc(2);
            header[0] = 0x88; // FIN + close frame
            header[1] = payload.length | 0x80; // mask bit set
            const maskingKey = crypto.randomBytes(4);
            const masked = Buffer.from(payload.map((b, i) => b ^ maskingKey[i % 4]));
            this.$socket.write(Buffer.concat([header, maskingKey, masked]));
            // Do not end socket immediately; wait for peer's close frame
        }
    }

    addEventListener(event: WWWebSocketEvent, listener: Function) {
        if (this.$listeners[event]) this.$listeners[event].push(listener);
    }

    removeEventListener(event: WWWebSocketEvent, listener: Function) {
        if (!this.$listeners[event]) return;
        this.$listeners[event] = this.$listeners[event].filter(l => l !== listener);
    }

    $emit(event: WWWebSocketEvent, arg: any = null) {
        if (event === 'message' && typeof this.onmessage === 'function') this.onmessage(arg);
        if (event === 'close' && typeof this.onclose === 'function') this.onclose(arg);
        if (event === 'error' && typeof this.onerror === 'function') this.onerror(arg);
        if (event === 'open' && typeof this.onopen === 'function') this.onopen(arg);

        this.$listeners[event].forEach(l => l(arg));
    }
}

export default WWWebSocket;