Anonymous link-based Telegram bot.

Bundle hash: a20c28a9abcfee21c14a5c80a5c707b57fb55041027e9408d2f1a17ef62d939e

Code commit: 7d478aef7b9f4a7d90f38bb8f478f2ff170a4d33

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
