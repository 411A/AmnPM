Anonymous link-based Telegram bot.

Bundle hash: 286b9262ee2f20a8a5a1af3e3114e6a2463182583829a109c689c2e06ed829cb

Code commit: 328ad77653b5fe621f0ca5cb1b170c70be77002b

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). CI fails if
`build.js` or `release/manifest.json` is stale. The hash is a supply-chain
check, not proof of the running Telegram Serverless process.
