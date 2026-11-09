Anonymous link-based Telegram bot.

Bundle hash: d15d4186a1e11e664fda798292c124507bd452574ce8b21c8d82b2e62f902363

Code commit: eb2fd9b4d3f4a31575d40d8ef5c8e38c1d07349d

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
