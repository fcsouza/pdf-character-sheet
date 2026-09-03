# PDF Character Sheet

Use form-fillable PDFs as character sheets in Foundry VTT. Point an actor at a
PDF, and the fields you filled in are the sheet.

Requires **Foundry v13 or newer**.

[![GitHub release](https://img.shields.io/github/v/release/fcsouza/pdf-character-sheet)](https://github.com/fcsouza/pdf-character-sheet/releases)
[![Issues](https://img.shields.io/github/issues/fcsouza/pdf-character-sheet)](https://github.com/fcsouza/pdf-character-sheet/issues)
[![License](https://img.shields.io/github/license/fcsouza/pdf-character-sheet)](LICENSE)

---

> **This is a rewrite, not the old module with patches.** Foundry v13 deprecated
> `Application` and `FormApplication`, removed `ui.windows`, and moved on from
> jQuery. The v10 code also vendored its own copy of pdf.js and drove that
> viewer's private event bus. So PDFs are now **items** with a real data model,
> the viewer draws to a canvas from the npm `pdfjs-dist`, and the bundler owns
> the worker. The behaviour you knew is the same; almost none of the code is.

## Install

Paste this into Foundry's **Install Module** dialog:

```
https://github.com/fcsouza/pdf-character-sheet/releases/latest/download/module.json
```

## Using it

**Add a PDF.** Create an Item of type *PDF*, set the file, and give it a short
code — `PHB`, `OP` — so you can reference it from chat. The page offset is
there for books whose printed page 1 is not the file's page 1.

**Point an actor at it.** Right-click the actor in the sidebar and choose *PDF
sheet*, or open the sheet and use the header button. Choosing *None* puts the
actor back on the system's own sheet.

**Field names decide where a value goes.** A field named for a document path —
`name`, `system.health.value` — writes there. Anything else is remembered under
the module's own flag, so a sheet drawn for no particular system still keeps
what you type. The *Data paths* button on the sheet lists every path the actor
exposes, which is what you name fields after.

**Share a page.** Open a PDF and use the share button in the window header to
send the page you are on to whichever players you pick.

## In chat and journals

```
@PDF[OP]{the agent sheet}
@PDF[OP|page=12]{combat rules}
```

Renders as a link that opens the PDF at that page. Readers who cannot see the
PDF get the text without a link, rather than a link they cannot follow.

## Commands

| Command | What it does |
|---|---|
| `/pdf size` | How much the local PDF cache is holding |
| `/pdf purge` | Empty it |
| `/pdf export` | Copy every PDF into a journal that survives uninstalling this module |

## API

On `game.modules.get('pdf-character-sheet').api`:

```ts
all()                                  // every PDF item in the world
find(codeOrName)                       // one, by code or by name
open(codeOrName, page?)                // open it locally
share(codeOrName, page?, userIds?)     // open it on other clients; null means everyone
preload(codeOrName, userIds?)          // warm the cache before a session
exportToJournal()                      // copy the library into core journal pages
```

`open` and `share` take the page as printed in the book. The item's offset is
applied for you.

`share` and `preload` are Gamemaster-only, and say so if a player calls them.
They reach other people's clients, and the receiving end drops a message that
did not come from a GM.

## Before you uninstall

PDF items are a document subtype this module owns. Remove the module and
Foundry no longer knows the type: the items are not deleted and nothing under
them is destroyed, but no sheet opens and they sit in the sidebar as an
unavailable type until the module comes back.

Run this first, while the module is still installed:

```
/pdf export
```

It writes every PDF to a journal named PDFs, one page each, using Foundry's own
`pdf` page type. Those pages keep working with this module gone, on any system.
The code and the page offset are kept in flags on each page.

Nothing is deleted. Your items stay where they are, so you can read the journal,
agree it came out right, and only then decide what to do with them. Running it
again replaces the pages it wrote last time rather than adding a second copy,
and leaves any page you added by hand alone.

## Building from source

```bash
pnpm install
pnpm build     # dist/ plus a release zip
pnpm dev       # builds, links dist/ into your Foundry data dir, and watches
```

`pnpm dev` asks where Foundry keeps its data on the first run and remembers the
answer. If Foundry runs in a container it cannot follow that symlink, and the
command prints the compose mount to use instead.

Built with the [VTTForge](https://vttforge.dev) SDK.

### Tests

```bash
pnpm test        # Vitest, against the Foundry mock from @vttforge/testing
pnpm typecheck   # covers the tests too
```

CI runs both on every push and pull request, plus the build and
`vttforge audit`.

## Cutting a release

Run the **Cut a release** workflow from the Actions tab and pick patch, minor
or major. It bumps `package.json` and `module.json`, commits, and pushes the
tag. The tag starts the release workflow, which builds, zips, and attaches the
manifest and the archive to a GitHub Release.

Foundry and foundryvtt.com read the release's
`latest/download/module.json`, so an install updates itself with no further
step.

It needs a `RELEASE_PAT` secret, a fine-grained token with Contents: write on
this repository. A tag pushed with the workflow's own token does not start
another workflow, so without it the tag would sit there and nothing would be
released.

## pdf.js version

Pinned to `pdfjs-dist` 5.x. 6.x is out; the bump is deliberately not taken.

The annotation layer is the part of that API this module leans on hardest,
and it is the part most likely to have moved in a major. The current
rendering is verified working against 5.x, so a bump belongs in its own
change with that as the baseline — not folded into anything else.

## Credits

Originally a fork of [PDFoundry](https://github.com/Djphoenix719/PDFoundry) by
Andrew Cuccinello, whose design of the fillable-sheet contract this still
follows.

Localization: Spanish by [José E. Lozano](https://github.com/lozalojo), French
by [Baktov](https://github.com/Baktov).

## License

[Apache-2.0](LICENSE)
