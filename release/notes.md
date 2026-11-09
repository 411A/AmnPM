Anonymous link-based Telegram bot.

Bundle hash: adf56623d72599cde1cf4106e5999c6c30f8c7c0290afe381984405849627450

Code commit: 5d983ff49d53c5aabde28f4116eadbcbd566384b

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
