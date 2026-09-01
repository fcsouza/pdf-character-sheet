# PDF Character Sheet

PDF Character Sheet its just a fork of PDFoundry to use form fillable PDFs as character sheets for Foundry.

all credits to the base version goes to [Andrew Cuccinello.](https://github.com/lozalojo)

If you have a suggestion you are welcome to open a pull request and collaborate.

![GitHub release (latest by date)](https://img.shields.io/github/v/release/fcsouza/pdf-character-sheet)
![GitHub Workflow Status](https://img.shields.io/github/workflow/status/fcsouza/pdf-character-sheet/Release%20Module)
[![GitHub issues](https://img.shields.io/github/issues/fcsouza/pdf-character-sheet)](https://github.com/fcsouza/pdf-character-sheet/issues)
[![GitHub license](https://img.shields.io/github/license/fcsouza/pdf-character-sheet)](https://github.com/fcsouza/pdf-character-sheet/blob/master/LICENSE)
[![GitHub pull requests](https://img.shields.io/badge/pull%20requests-welcome-green)](https://github.com/fcsouza/pdf-character-sheet/compare)

![GitHub All Releases](https://img.shields.io/github/downloads/fcsouza/pdf-character-sheet/total)
![GitHub Releases](https://img.shields.io/github/downloads/fcsouza/pdf-character-sheet/latest/total)

PDF Character Sheet is a *fully featured* PDF viewer using the base version of PDFoundry for FoundryVTT to support PDF Fillable Forms to use as character sheets.

#### Thanks to
Spanish localization: [José E. Lozano (lozalojo)](https://github.com/lozalojo)

French localization: [Baktov](https://github.com/Baktov)

## Community Resources
[Tutorials and resources created by users of PDFoundry can be found here](https://github.com/fcsouza/pdf-character-sheet/wiki/Community-Resources)

## Setup
PDF Character Sheet is easily installable - find it in the modules list inside Foundry VTT. Alternatively, you can use the manifest link below.

### Manifest
> https://raw.githubusercontent.com/fcsouza/pdf-character-sheet/master/module.json

## System Developers
I highly recommend you do not bundle PDF Character Sheet - if you do however, the module version will disable itself and display a warning to the user. Instead, you can see the [documentation](https://fcsouza.github.io/pdf-character-sheet/index.html) for an example of checking for the presence of PDF Character Sheet, and enabling additional support if it is found.

### Building PDF Character Sheet
If you wish to build PDF Character Sheet yourself - most commonly because you want to contribute - you can do the following.

1. Clone the repository anywhere
2. Copy `foundryconfig.example.json` and rename it `foundryconfig.json`. Edit the dataPath to your data folder.
2. Open a terminal, navigate to the repository directory
3. Run `npm install`
4. Run `gulp build` to perform a one off build, or `gulp watch` to perform incremental builds as you change things

### API Examples

See the [documentation](https://fcsouza.github.io/pdf-character-sheet/index.html) for details and examples.

## pdf.js version

Pinned to `pdfjs-dist` 5.x. 6.x is out; the bump is deliberately not taken.

The annotation layer is the part of that API this module leans on hardest,
and it is the part most likely to have moved in a major. The current
rendering is verified working against 5.x, so a bump belongs in its own
change with that as the baseline — not folded into anything else.
