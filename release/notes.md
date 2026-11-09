Anonymous link-based Telegram bot.

Bundle hash: 73bfbfb7369a3fbbb9c9e8d394eb9e01d0d475fdeb86c2e9f649a08a1d6e4f90

Code commit: cc43c930dcae2ff3742b8129710f762f6db8f849

The bundle hash covers every `.js` file under `tgcloud/` except `build.js` and
`secret.js`, in sorted walk order (relative path + NUL + bytes). The same
algorithm is in `tools/bundle.mjs` and in the validator that `/security` sends.
The validator checks the public source at the pinned commit against this hash.
It does not prove what the Telegram Serverless runtime is executing.
