import WWWebSocket from '../src/index.js';

const proxyUrl = 'socks5://user:pass@localhost:1080';

const ws = new WWWebSocket('wss://ip.villainsrule.xyz', { proxy: proxyUrl });

ws.onmessage = (msg) => {
    if (msg.data === 'Hello from Socks5hWebSocket!') ws.close();
}

ws.onclose = () => console.log(navigator.userAgent, '- Completed Lifecycle!');
ws.onerror = (err) => console.log('onerror:', err);

ws.addEventListener('open', () => {
    ws.send('Hello from Socks5hWebSocket!');
});