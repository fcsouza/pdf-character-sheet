# End-to-end

Playwright against a real Foundry v14 in Docker, with this module installed.

```bash
pnpm build          # the harness copies dist/ into the container
pnpm test:e2e
```

Three environment variables are needed, because the container downloads a
licensed Foundry: `FOUNDRY_LICENSE_KEY`, `FOUNDRY_USERNAME` and
`FOUNDRY_PASSWORD`. The run stops with a message naming the ones that are
missing.

`scripts/foundry.mjs` boots the container, signs the licence over HTTP,
installs the blank system under `fixtures/` and the built module, writes a
world on them, and restarts into it. The browser only has to join. Foundry's
data lives in a named Docker volume, so the licensed download survives
between runs; the world and the config are rewritten every time.

The world runs on a system that contributes nothing. This module attaches to
`base` Actors and files its own Item sub-type under `pdf-character-sheet.pdf`,
so the system underneath does not matter.

Nothing here opens a PDF. Rendering one needs a file and the repository ships
none, so the run covers what does not: the sub-type and the sheets landing
under the module-prefixed key, an item of the type being created with its
schema defaults, the derived page offset, the text enricher, and the public
API on `game.modules.get('pdf-character-sheet').api`.

| Variable | What it changes |
| --- | --- |
| `E2E_KEEP_FOUNDRY=1` | Leave the container up after the run, to poke at the world |
| `E2E_PORT` | Published port. Default `30011` |
| `E2E_FOUNDRY_IMAGE` | The image. Default `felddy/foundryvtt:14` |
| `E2E_CORE_VERSION` | The `coreVersion` written into the world. Default `14` |
