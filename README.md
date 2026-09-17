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

**Export to `.xpp`.** A single file, or an entire module tree. When exporting a
folder it walks every subfolder and asks how to lay out the result: mirroring the
source structure, or grouped by artifact type. Either way only the folders that
end up with a file are created — a directory whose XMLs carry no X++ leaves
nothing behind.

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
| **X++: Export metadata folder to .xpp** | — | Exports a whole tree, mirroring the source folders or grouped by type |
| **X++: Pause or resume automatic opening** | — | Pauses automatic opening for the rest of the session |

The first two are also buttons in the editor title bar: the view button on the
XML, the export button on the X++ view.

### Exporting a whole folder

`X++: Export metadata folder to .xpp` asks for a source folder, a destination
folder, and how to organise the output:

| Layout | Result |
|---|---|
| **Mirror source folders** | `out/MyModule/AxClass/Foo.xpp` — the same tree as the metadata repository |
| **Group by artifact type** | `out/AxClass/Foo.xpp` — one folder per type, flattened |
| **XppSource convention** | `out/MyModel/AxClass_Foo.xpp` — one folder per model, type as a prefix |

Mirroring is the one to pick when the export is going to be compared against the
repository it came from, and grouping by type is better for reading every
artifact of one kind in a row.

**XppSource is the one that buys you something you cannot get otherwise.** A
package deployed as binaries carries no source, so the debugger has nothing to
step into. Laid out this way the sources land where it looks for them, and X++
inside a binary-only package becomes debuggable. That is also why the type is
part of the file name rather than a folder: everything in a model shares one
directory, so without the prefix a class and a form with the same name would
overwrite each other.

The model for **XppSource** is taken from the folder that holds the artifact's
type folder, because a metadata repository stores everything as
`<Package>/<Model>/<Type>/<Name>.xml`. When a tree does not follow that
convention the containing folder is used as-is, rather than climbing a level and
picking up something that is not a model.

### Typing the folder instead of browsing for it

By default both folders are asked for with the operating system dialog. Setting
`xpp.transpile.folderPicker` to `quickPick` replaces it with a box at the top of
the editor that completes the path as you type: the subfolders that match what
you have written so far are offered below, and picking one with the arrow keys
appends it and keeps going, so you can walk down a tree without finishing a
single folder name. The first entry is always the path exactly as typed, to
accept it and stop there. The destination box starts from the source folder,
since the two are usually near each other.

It is worth turning on when you already know where you are going; the dialog
makes you browse a tree with the mouse even then.

Folders are created only when a file is actually written, so subfolders whose
XMLs carry no X++ — staging tables, enums, pure extensions — do not show up as
empty directories. `bin`, `XppMetadata` and `Descriptor` are skipped: they are
build output, not source.

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
| `xpp.transpile.preserveFocus` | `true` | Keep the cursor in the XML when the view opens **by itself**. The command and the shortcut always move focus |

### What gets generated

| Setting | Default | What it controls |
|---|---|---|
| `xpp.transpile.eol` | `crlf` | Line ending of the generated X++ |
| `xpp.transpile.stripDocComments` | `false` | Strip `///` documentation comments |
| `xpp.transpile.headerComment` | `false` | Header with type, name and origin |
| `xpp.transpile.outputDirectory` | *(empty)* | Target folder for exports |
| `xpp.transpile.folderPicker` | `dialog` | How folders are asked for: the OS dialog, or a box that completes the path as you type |

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
