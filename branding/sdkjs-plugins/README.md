# Plugin runtime (sdkjs-plugins/v1)

Base files that every editor plugin loads (`../v1/plugins.js`, `plugins-ui.js`, `plugins.css`), copied
unmodified from https://github.com/ONLYOFFICE/onlyoffice.github.io, folder `sdkjs-plugins/v1`, commit
`307c80bfeb12b5b25f5c2316053a820df555041f` (2026-11-03). Licence: AGPL-3.0 (see the file headers).

The server image installs this directory as `<documentserver>/sdkjs-plugins/`. The document service lists every
plugin folder with a `config.json` there (`/plugins.json`), so a deployment adds plugins by placing them in that
directory (for example with a volume). No plugin is installed by default.

SHA-256 of the copied files:

```
d0fabc8d79c8c4fa677f399df7e433dea1c7f77bf33e0653c530b55367e08abd  v1/plugins.css
1bc0bd71eebcb477ceaaee3ab00ed1a10ce7eae117ec68ae8024645c435f524e  v1/plugins.js
4896dd856c75b7efb764447295582a3c0c93769c1f3b3574ac256f6bf33f6f5a  v1/plugins-ui.js
```
