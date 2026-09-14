# PDF Character Sheet

[![GitHub release](https://img.shields.io/github/v/release/fcsouza/pdf-character-sheet)](https://github.com/fcsouza/pdf-character-sheet/releases)
[![Issues](https://img.shields.io/github/issues/fcsouza/pdf-character-sheet)](https://github.com/fcsouza/pdf-character-sheet/issues)
[![License](https://img.shields.io/github/license/fcsouza/pdf-character-sheet)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/fcsouza/pdf-character-sheet/total)](https://github.com/fcsouza/pdf-character-sheet/releases)

Play with the character sheet your game came with.

Some tables like the printed sheet. You have the PDF, it has boxes you can type
in, and everyone knows where everything is on it. This module puts that PDF
inside Foundry: you fill it in as usual, and what you type is saved on the
actor, not lost when you close the window.

It also keeps your books in the world. Drop the rulebook in, give it a short
code, and a link in chat opens it at the right page for whoever clicks it.

Requires Foundry v14 or newer.

## Install

In Foundry, open **Add-on Modules → Install Module**, paste this into the
**Manifest URL** box, and press Install:

```
https://github.com/fcsouza/pdf-character-sheet/releases/latest/download/module.json
```

Then turn it on in a world: **Game Settings → Manage Modules**.

## Using it

**Add a PDF.** Create an Item of type *PDF*, choose the file, and give it a
short code, like `PHB` or `OP`, so you can point at it from chat. If the book's
printed page 1 is not the file's page 1, the page offset sorts that out.

**Point an actor at it.** Right-click the actor in the sidebar and choose *PDF
sheet*, or open the sheet and use the button in its header. Choosing *None*
puts the actor back on the system's own sheet.

**Type in it.** What you write is saved on the actor. Where it lands depends on
the name of the field in the PDF: a field named after something the actor
already has, like `name` or `system.health.value`, writes there. Anything else
is kept by this module, so a sheet made for no particular game still remembers
what you type. The *Data paths* button lists every name the actor answers to,
which is what you name the fields after.

**Share a page.** Open a PDF and use the share button in the window header to
put the page you are on in front of the players you pick.

## Links in chat and journals

```
@PDF[OP]{the agent sheet}
@PDF[OP|page=12]{combat rules}
```

That becomes a link which opens the PDF at that page. A player who cannot see
that PDF reads the text without a link, rather than a link that goes nowhere.

## Commands

| Command | What it does |
|---|---|
| `/pdf size` | How much the local PDF cache is holding |
| `/pdf purge` | Empty it |
| `/pdf export` | Copy every PDF into a journal that survives uninstalling this module |

## Before you uninstall

PDF items belong to this module. Take the module away and Foundry no longer
knows what they are: nothing is deleted and nothing under them is destroyed,
but no sheet opens and they sit in the sidebar as an unavailable type until the
module comes back.

So run this first, while it is still installed:

```
/pdf export
```

It writes every PDF into a journal named PDFs, one page each, using Foundry's
own PDF page type. Those pages keep working with this module gone, on any
system. The code and the page offset are kept on each page.

Nothing is deleted. Your items stay where they are, so you can read the journal,
agree it came out right, and only then decide what to do with them. Running it
again replaces the pages it wrote last time rather than adding a second copy,
and leaves any page you added by hand alone.

## Coming from the old version

Version 2.0.0 rewrote the module, and 3.0.0 is the release for Foundry v14.
PDFs used to be journal entries; now they are items with their own type. A
world coming from the old version is migrated when it loads, and the old
journal entries are left where they are rather than deleted.

---

## For developers

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

[EXAMPLES.md](EXAMPLES.md) shows how a system can link its compendium entries
to a page in a book.

The old module vendored its own copy of pdf.js and drove that viewer's private
event bus. This one renders to a canvas with the npm `pdfjs-dist` build, and
the bundler owns the worker.

### Building from source

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
pnpm test:e2e    # Playwright against a real Foundry v14 in Docker
```

CI runs the unit tests, the typecheck, the build and `vttforge audit` on every
push and pull request. The end-to-end run needs a Foundry licence, so it runs
on pushes to `master` rather than on a pull request from a fork.

### Cutting a release

Run the **Cut a release** workflow from the Actions tab and pick patch, minor
or major. It bumps `package.json` and `module.json`, commits, and pushes the
tag. The tag starts the release workflow, which builds, zips, and attaches the
manifest and the archive to a GitHub Release.

Foundry and foundryvtt.com read the release's `latest/download/module.json`, so
an install updates itself with no further step.

It needs a `RELEASE_PAT` secret, a fine-grained token with Contents: write on
this repository. A tag pushed with the workflow's own token does not start
another workflow, so without it the tag would sit there and nothing would be
released.

### pdf.js version

Pinned to `pdfjs-dist` 5.x. 6.x is out; the bump is deliberately not taken.

The annotation layer is the part of that API this module leans on hardest, and
it is the part most likely to have moved in a major. The current rendering is
verified working against 5.x, so a bump belongs in its own change with that as
the baseline, not folded into anything else.

## Credits

Originally a fork of [PDFoundry](https://github.com/Djphoenix719/PDFoundry) by
Andrew Cuccinello, whose design of the fillable-sheet contract this still
follows.

Localization: Spanish by [José E. Lozano](https://github.com/lozalojo), French
by [Baktov](https://github.com/Baktov).

## License

[Apache-2.0](LICENSE)
