# X++ Source Viewer for Dynamics 365 F&O

Read the X++ source in your Dynamics 365 Finance & Operations metadata without
fighting the XML.

A D365FO metadata repository stores the source inside each artifact's XML file,
split across `CDATA` blocks. Reviewing a pull request that way is painful. This
extension reconstructs the equivalent `.xpp` and opens it next to the XML, with
syntax highlighting.

## Features

**X++ view of any artifact.** Press `Ctrl+Alt+X` on a metadata XML and the
reconstructed source opens. It is a read-only virtual document: nothing is
written to disk, so your metadata repository never fills up with generated
files.

**Complete form reconstruction.** A form's methods are spread across four levels
of the XML — the form itself, its data sources, the fields of each data source,
and the controls. All of them are recovered, nested the way the Visual Studio
designer shows them.

**Export to `.xpp`.** A single file, or an entire module tree.

**Control over when it shows up.** Automatic opening is off by default. If you
turn it on, you can limit it by artifact type or by path, and pause it with one
click from the status bar.

Supports `AxClass`, `AxTable`, `AxForm`, `AxQuery`, `AxView` and
`AxDataEntityView`. Artifacts that carry no source — `AxEnum`, `AxEdt`, the
`Ax*Extension` types — are reported as empty rather than as an error.

## Usage

| Command | Shortcut | What it does |
|---|---|---|
| **X++: View as X++** | `Ctrl+Alt+X` | From the XML it opens the view; from the view it goes back to the XML |
| **X++: Export to .xpp file** | — | Saves the X++ wherever you choose |
| **X++: Export metadata folder to .xpp** | — | Exports a whole tree, grouped by type |
| **X++: Pause or resume automatic opening** | — | Pauses automatic opening for the rest of the session |

The first two are also buttons in the editor title bar: the view button on the
XML, the export button on the X++ view.

## Settings

### When the view opens

| Setting | Default | What it controls |
|---|---|---|
| `xpp.transpile.autoPreview` | `never` | `never` · `ask` (notifies without stealing focus) · `onOpen` |
| `xpp.transpile.autoPreviewTypes` | `[]` | Restrict to certain types, e.g. `["AxClass","AxForm"]` |
| `xpp.transpile.include` | `[]` | Path globs where it is allowed. Empty = everywhere |
| `xpp.transpile.exclude` | `[]` | Globs where it never opens. Takes precedence over `include` |
| `xpp.transpile.skipEmpty` | `true` | Do not open artifacts that carry no source |

### Where it appears

| Setting | Default | What it controls |
|---|---|---|
| `xpp.transpile.viewColumn` | `beside` | `beside` · `active` · `replace` |
| `xpp.transpile.preserveFocus` | `true` | Keep the cursor in the XML when the view opens beside it |

### What gets generated

| Setting | Default | What it controls |
|---|---|---|
| `xpp.transpile.eol` | `crlf` | Line ending of the generated X++ |
| `xpp.transpile.stripDocComments` | `false` | Strip `///` documentation comments |
| `xpp.transpile.headerComment` | `false` | Header with type, name and origin |
| `xpp.transpile.outputDirectory` | *(empty)* | Target folder for exports |

### The status bar indicator

Shows whether the view will open on its own, and changes it with one click:

| Indicator | Means | One click |
|---|---|---|
| `X++` | Automatic opening is off | Opens the view |
| `X++ auto` | It is active | Pauses it |
| `X++ ask` | `ask` mode | Pauses it |
| `X++ paused` | Paused for this session | Resumes it |

The pause lasts for the session only: it does not change your settings.

## Requirements

None. The extension reads the XML directly: it does not need the D365FO
developer tools or any additional component installed.

## Known issues

- **The view is read-only.** Editing the X++ and writing it back into the XML is
  not supported.
- Artifacts with `<UnparsableSource>` — source that D365FO itself could not
  parse — are shown as-is, without reconstruction.

## How it works

The details of the reconstruction — how forms are assembled, which types use
`<Declaration>` and which do not, how it is verified — are in
[`docs/como-funciona.md`](docs/como-funciona.md) (in Spanish).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) (in Spanish). Tests run with
`npm test`, without opening VS Code.

## Release notes

See [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT. See [`LICENSE`](LICENSE).
