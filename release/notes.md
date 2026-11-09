Anonymous link-based Telegram bot.

Bundle hash: c2eac3899f6552ecd22d9ce8675400a846103827e55d3ae9cdd956cc08b9c537

Code commit: b24e2918715dea7a7745e7014505f6def1c5d6c5

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
