Anonymous link-based Telegram bot.

Bundle hash: c7a7f6ecd4c238546d0dcebb571863a454425ec47480c4607d6c287afd25290c

Code commit: 0a8af7a20410ecefdfed1f5b279a6a6689cd35f3

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
