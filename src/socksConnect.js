import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';

const socksConnect = ({ proxy, destHost, destPort, useTLS = false, resolveDnsLocally = false }) => new Promise((resolve, reject) => {
    const connectWithHost = (hostToUse) => {
        const hasAuth = proxy.username && proxy.password;
        const methods = hasAuth ? [0x00, 0x02] : [0x00];
        const socket = net.connect(proxy.port, proxy.hostname, () => {
            socket.write(Buffer.from([0x05, methods.length, ...methods]));
        });

        const sendConnect = () => {
            let req;
            // socks5 vs socks5h: in socks5, the hostname is resolved locally,
            // while in socks5h, the hostname is sent to the proxy for resolution
            // we have to handle this so that socks5 and socks5h are interchangeable
            if (resolveDnsLocally) {
                // socks5: send IPv4 address
                const ipParts = hostToUse.split('.').map(Number);
                req = Buffer.concat([
                    Buffer.from([0x05, 0x01, 0x00, 0x01]),
                    Buffer.from(ipParts),
                    Buffer.from([(destPort >> 8) & 0xff, destPort & 0xff])
                ]);
            } else {
                // socks5h: send domain name (i hate socks5h)
                const hostBuf = Buffer.from(hostToUse);
                req = Buffer.concat([
                    Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
                    hostBuf,
                    Buffer.from([(destPort >> 8) & 0xff, destPort & 0xff])
                ]);
            }
            socket.write(req);
            socket.once('data', (connRes) => {
                if (connRes[1] !== 0x00) return reject(new Error('SOCKS5 connect failed'));
                if (useTLS) {
                    const tlsSocket = tls.connect({ socket, servername: destHost });
                    resolve(tlsSocket);
                } else resolve(socket);
            });
        }

        socket.once('data', (res) => {
            if (res[0] !== 0x05) return reject(new Error('Not SOCKS5'));
            if (res[1] === 0x00) sendConnect(); // no auth
            else if (res[1] === 0x02 && hasAuth) {
                // basic username & password auth
                const uBuf = Buffer.from(proxy.username);
                const pBuf = Buffer.from(proxy.password);
                socket.write(Buffer.from([0x01, uBuf.length, ...uBuf, pBuf.length, ...pBuf]));
                socket.once('data', (authRes) => {
                    if (authRes[1] !== 0x00) return reject(new Error('SOCKS5 auth failed'));
                    sendConnect();
                });
            } else return reject(new Error('SOCKS5 handshake failed (unsupported method)'));
        });

        socket.on('error', reject);
    }

    if (resolveDnsLocally) {
        // socks5: must resolve DNS locally
        // this DOES work for cloudflare protected sites
        dns.lookup(destHost, { family: 4 }, (err, address) => {
            if (err) return reject(err);
            connectWithHost(address);
        });
    } else connectWithHost(destHost);
});

export default socksConnect;