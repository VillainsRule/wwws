SELF_DIR=$(cd $(dirname $0); pwd)

node --env-file=$SELF_DIR/../.env $SELF_DIR/socks5h-test.js
deno run --env-file=$SELF_DIR/../.env --allow-env --allow-net $SELF_DIR/socks5h-test.js
bun run --env-file=$SELF_DIR/../.env $SELF_DIR/socks5h-test.js

echo "\n======================\n"

node --env-file=$SELF_DIR/../.env $SELF_DIR/socks5h-agent.js
deno run --env-file=$SELF_DIR/../.env --allow-env --allow-net $SELF_DIR/socks5h-agent.js
bun run --env-file=$SELF_DIR/../.env $SELF_DIR/socks5h-agent.js

echo "\n======================\n"

node $SELF_DIR/socks5-server.js & sleep 1

echo "\n======================\n"

node $SELF_DIR/socks5-test.js
deno run --allow-net $SELF_DIR/socks5-test.js
bun run $SELF_DIR/socks5-test.js

pkill -f socks5-server.js