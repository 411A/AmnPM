Anonymous link-based Telegram bot.

Bundle hash: f2472f44eadbf71395abe83ad5e24736de9b32485251438ef01b819723e3d93d

Code commit: 4746c228a4d429450903d3662dbabef99a0c165d

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
