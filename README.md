<div align='center'>
    <h1>wwws</h1>
    <h3>a worldwide (node, bun, & deno) websocket socks5/h proxy implementation.</h3>
</div>

<br><br>
<h2 align='center'>getting started with wwws</h2>

wwws is a global websocket proxy implementation that works on every flavor of the javascript runtime: node, deno, and bun (as well as with `require` AND `import`)!

you can install wwws using any of your favorite PMs:
- `bun add wwws` (recommended)
- `pnpm add wwws`
- `npm install wwws`
  
(yarn's main branch hasn't been updated in a year and is not recommended for everyday use, but you can if you wish)

wwws follows most of the syntax as the [ws](https://npmjs.com/ws) library. the only addition is the proxy param in the constructor:

```js
import { WWWebSocket } from 'wwws'; // the WWWebSocket is exported as both default and as "WWWebSocket"

const ws = new WWWebSocket('wss://ip.villainsrule.xyz', {
    proxy: 'socks5://user:pass@host:port' // can be socks5 or socks5h
});
```

the goal of WWWebSocket is to always work, no matter what environment you're in. if you're in an environment that doesn't work, open an [issue](https://github.com/VillainsRule/wwws/issues)!

<br><br>
<h2 align='center'>supported platforms</h2>

wwws supports:

- [nodejs](https://nodejs.org)
- [deno](https://deno.land)
- [bun](https://bun.sh)

it also supports both cjs & esm file formats.

> [!WARNING]
> wwws does NOT support fake node hosting platforms! the main example of this is cloudflare workers. the reason? many of these platforms rewrite node internals to the point where there is massive compatbility loss.

wwws requires several `node:*` internals to run. it does not rely on any npm packages or platform-specific features. deno & bun fully support all of these internals without issues, so wwws works smoothly on all 3 runtimes! if you need a checklist for some reason, here you go:

- `node:crypto`
  - `crypto.randomBytes` - required
- `node:dns`
  - `dns.lookup` - required only if using socks5 proxies, socks5h works without
- `node:net`
  - `net.connect` - required
- `node:tls`
  - `tls.connect` - required
- `node:zlib`
  - `zlib.deflateRaw` - required only if using the `permessage-deflate` feature
  - `zlib.inflateRaw` - required only if using the `permessage-deflate` feature

> [!NOTE]
> if you are building your own runtime, you should make sure all of the above modules can be imported without issues at the top level. it's probably also a smart idea to stub the things that aren't required "just in case".

<br><br>
<h2 align='center'>supported in-library</h2>

since this library rewrites the entire WebSocket object, the following things are supported:

### class params
- `headers`
- `proxy`

> [!NOTE]
> `agent` is supported to the extent that a proxy URL will try to be extracted from it. `agent` is not recommended and is only present so you can use wwws as a dropin solution.

### methods
- `send(message)`
- `close(code)`

### props
- static `CONNECTING` = 0
- static `OPEN` = 1
- static `CLOSING` = 2
- static `CLOSED` = 3
- binaryType (default 'nodebuffer') [TODO]
- url

### events
- onopen / open
- onerror / error
- onclose / close
- onmessage / message
- ping
- pong

> [!WARNING]
> events might not have all required properties on them; they are essentially polyfills...

if something here is missing that you require, you are encouraged to open an [issue](https://github.com/VillainsRule/wwws/issues) for support!

> [!NOTE]
> there are no plans to officially use `Deno.createHttpClient` [under the hood](https://github.com/denoland/deno/commit/97ae158610f8b2421929fe360bf5c334a70d7c55).

<br><br>
<h2 align='center'>this is obviously NOT spec compliant!</h2>

reading through hundreds of pages to add features 95% of users **will not use** is a waste of my time. if something is wrong or you need something implemented, open an [issue](https://github.com/VillainsRule/wwws/issues) and we'll figure out how to make it work.

<br><br>
<h5 align='center'>made with :heart: by villainsrule</h5>
