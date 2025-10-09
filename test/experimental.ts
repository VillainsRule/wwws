import net from 'node:net';

const PORT = 1080;

const SOCKS_VERSION = 0x05;
const METHOD_NO_AUTH = 0x00;
const METHOD_USER_PASS = 0x02;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

const server = net.createServer((client) => {
    client.once('data', (handshake) => {
        console.log('[SERVER] socks5 proxy connection attempt');

        const nMethods = handshake[1];
        const methods = handshake.subarray(2, 2 + nMethods);
        let method = METHOD_NO_AUTH;
        if (methods.includes(METHOD_USER_PASS)) method = METHOD_USER_PASS;
        client.write(Buffer.from([SOCKS_VERSION, method]));

        const handleRequest = () => {
            client.once('data', async (req) => {
                if (req[0] !== SOCKS_VERSION || req[1] !== CMD_CONNECT) return client.end();
                let addr, offset = 3;
                const atyp = req[offset++];
                if (atyp === ATYP_IPV4) {
                    addr = Array.from(req.subarray(offset, offset + 4)).join('.');
                    offset += 4;
                } else if (atyp === ATYP_DOMAIN) {
                    const len = req[offset++];
                    addr = req.subarray(offset, offset + len).toString();
                    offset += len;
                } else if (atyp === ATYP_IPV6) {
                    addr = req.subarray(offset, offset + 16).toString('hex').match(/.{1,4}/g)!.join(':');
                    offset += 16;
                } else {
                    return client.end();
                }
                const port = req.readUInt16BE(offset);

                const remote = net.connect(port, addr, () => {
                    if (!remote.localAddress || !remote.localPort) return client.end();

                    const resp = Buffer.from([
                        SOCKS_VERSION, 0x00, 0x00, ATYP_IPV4,
                        ...remote.localAddress.split('.').map(Number),
                        (remote.localPort >> 8) & 0xff, remote.localPort & 0xff
                    ]);
                    client.write(resp);
                    client.pipe(remote).pipe(client);
                });
                remote.on('error', () => client.end());
            });
        }

        if (method === METHOD_USER_PASS) {
            client.once('data', (auth) => {
                const ulen = auth[1];
                const uname = auth.subarray(2, 2 + ulen).toString();
                const plen = auth[2 + ulen];
                const pass = auth.subarray(3 + ulen, 3 + ulen + plen).toString();

                console.log(`[SERVER] Auth attempt - username: ${uname}, password: ${pass}`);

                const isSpecialName = uname.includes('-');

                if (!isSpecialName) {
                    console.log('[SERVER] Auth SUCCESS - no query params passed');
                    client.write(Buffer.from([0x01, 0x00]));
                    handleRequest();
                } else {
                    const params = Object.fromEntries(uname.split('-').map(e => e.split('=')));
                    const expectedPassword = params.pass || 'password';

                    if (expectedPassword === pass) {
                        console.log('[SERVER] Auth SUCCESS - credentials match query params');
                        client.write(Buffer.from([0x01, 0x00]));
                        handleRequest();
                    } else {
                        console.log('[SERVER] Auth FAILED - credentials do not match query params');
                        console.log(`[SERVER] Expected: ${expectedPassword}`);
                        console.log(`[SERVER] Got: ${pass}`);
                        client.write(Buffer.from([0x01, 0x01]));
                        client.end();
                    }
                }
            });
        } else handleRequest();
    });
});

server.listen(PORT, () => {
    console.log(`socks5 server listening on port ${PORT}`);
    console.log('you will see a terminal message when a connection is made');
});