# openit - say what to open

[![CI](https://github.com/franzenzenhofer/openit/actions/workflows/ci.yml/badge.svg)](https://github.com/franzenzenhofer/openit/actions/workflows/ci.yml)

**Say what you want opened. openit works out what you meant and which app should open it, then
opens it.**

```console
$ openit latest screenshot
→ ~/Desktop/Screenshot 2026-09-07 at 21.58.04.png

$ openit last rechnung
→ ~/Downloads/A1-Telekom-Rechnung-20260030.pdf

$ openit the cdai readme in sublime
→ ~/dev/cdai/README.md with Sublime Text

$ openit gsc
→ https://search.google.com/search-console
```

macOS only. `openit` is the sibling of [cdai](https://github.com/franzenzenhofer/cdai): the same
matcher, the same frecency, the same closed-set AI tier, all shared through
[intent-core](https://github.com/franzenzenhofer/intent-core). cdai takes you somewhere; openit
opens something. That difference is the whole design, because `cd` cannot hurt you and `open` can.

## Install

Requires Node.js 20+ and macOS.

```bash
brew install franzenzenhofer/tap/openit
```

Then teach it where you keep things, and check what it can see:

```bash
openit setup
openit doctor
```

Completion, optionally:

| Shell | Config file | Add this line |
|---|---|---|
| zsh | `~/.zshrc` | `eval "$(openit init zsh)"` |
| Bash | `~/.bashrc` | `eval "$(openit init bash)"` |
| Fish | `~/.config/fish/config.fish` | `openit init fish \| source` |

There is no shell wrapper function to install. `open` hands the request to LaunchServices and the
effect lands outside this process tree, so unlike `cd` there is nothing for a wrapper to apply.

## How it decides

Six tiers, cheapest first. Each one runs only because the one before it was unsure.

| Tier | What it is | Cost |
|---|---|---|
| 0 | a path or URL you spelled out | nothing: it is the answer |
| 0.5 | a name you taught (`openit link add gsc …`) or an answer you confirmed once | one file read |
| 1 | apps, the directory index, your document folders, your bookmarks | cached JSON |
| 1b | the children of the directories that matched best | one shallow listing |
| 2 | Spotlight, scoped to the roots that are actually indexed | one `mdfind` per root |
| 3 | a model, choosing by number from a closed list | one CLI call |

On the machine openit was written on, tiers 0 to 1b answer `latest screenshot` in 89ms and
`last rechnung` in 112ms, with no Spotlight and no model involved. That is the product; everything
after it is upside.

### The words

| You type | It means |
|---|---|
| `with <app>`, `in <app>` | open it with that app |
| `in <folder>` | only look in there |
| `in finder`, `reveal`, `finder` | show it, launch nothing |
| `latest`, `last`, `newest`, `recent` | the newest one |
| `oldest`, `first` | the oldest one |
| `new` | a new instance (`-n`) |
| `in the background`, `bg` | do not raise it (`-g`) |
| `2025` | a year that must appear in the name |
| `pdf`, `screenshot`, `image`, `deck`, `sheet`, `note`, `video`, `audio`, `zip` | that kind of file |

`rechnung`, `invoice` and `bill` are deliberately **not** kinds. 2045 files on the author's machine
are literally named `Rechnung-*.pdf`; turning the strongest search token into a silent extension
filter would destroy the exact query the feature exists for.

## What it will not do

openit can run code. `open -a Terminal notes.txt` executes `notes.txt`; a `.app` is a folder;
`shortcuts://` is a URL that does things. So there is a consent ladder, and every step is derived
from what a thing structurally **is**, never from what it is called.

| Level | What happens |
|---|---|
| `allow` | it opens, silently |
| `confirm` | `[Y/n]` on `/dev/tty` |
| `verify` | you type a word openit derived from the class - `application`, `script`, `run` |
| `refuse` | it does not open, and no flag changes that |

There is no `--yes`, no `--force` and no `OPENIT_ASSUME_YES`. Consent that can be scripted away is
not consent. To script an open, read `openit plan -- <words>` and run `open` yourself.

The rules, in short:

- **A directory is not automatically safe.** Anything containing `Contents/MacOS/` is an
  application, extension or not.
- **Magic bytes outrank names.** A file with no extension starting `\xcf\xfa\xed\xfe` is an
  executable; a file *named* `x.app` is not an application.
- **Quarantine, not the Downloads folder, is the signal.** A quarantined document asks once more;
  a quarantined executable is refused outright.
- **A `.webloc` is judged twice**: as the file it is, and as the place it points at. The stricter
  answer wins.
- **`javascript:`, `data:`, `vbscript:` and `about:` are never opened**, from any origin, at any
  level. `file:` is collapsed to a path and re-judged; openit never emits `-u file://…`.
- **The model can never cause code execution.** It may pick a document, a folder or a web page.
  Anything else it picks is refused rather than asked about.
- **A terminal-class handler always needs a typed word**, and is refused outright over anything a
  model picked.

## What the model is told

The AI tier only runs when everything deterministic was unsure, and it is off in one line
(`openit setup --no-ai`).

- It sees your words and a numbered list, and answers with **one integer**. A hallucinated target
  is structurally impossible: the only thing it can get wrong is a number that is not on the list.
- It never sees file contents, a full URL (a link is `{"site":"github.com","route":"/octocat"}` -
  no query string, no fragment, no userinfo), your home directory's real name, or anything outside
  a configured root.
- Every label is stripped of the code points a filename could lie with: bidi overrides, zero-width
  characters, the Unicode tag block, private use areas.
- At most 40 candidates, 200 bytes each, 16 KiB in total. Over the cap the tier does not run.
- Whatever it picks is re-read from disk, re-classified and re-checked for root containment before
  you are asked anything.

Its reason is printed quoted and attributed, never in openit's own voice.

## Exit codes

cdai's exit code is a request. openit's is a receipt: every non-zero code carries the guarantee
that **nothing was launched**, and that is what the test suite asserts hardest.

| Code | Meaning |
|---|---|
| 0 | it was opened; the side effect already happened |
| 1 | openit's own fault: usage, config, corrupt state |
| 3 | it asked and the answer was no - including "there is nobody to ask" |
| 4 | the words named nothing openable |
| 5 | it was found, and policy forbade it; no question was asked |
| 6 | consent was given and `open(1)` itself failed |

## stdout is the machine channel

| Mode | stdout |
|---|---|
| default | nothing - the action is the output |
| `--dry-run` | one line: the exact POSIX-quoted argv that would run |
| `plan -- <words>` | one JSON object, one line |
| `which -- <words>` | one line: the resolved path or URL (withheld when refused) |
| `complete` | newline-delimited completions |

Everything a person reads goes to stderr, which is why `eval "$(openit --dry-run x)"` does exactly
what openit would have done.

## Commands

```bash
openit <words>                      open the thing you mean
openit --with <app> <words>         name the handler yourself
openit --reveal <words>             show it in Finder, launch nothing
openit --new | --background | --wait
openit --dry-run <words>            print the plan, spawn nothing
openit plan -- <words>              one JSON object on stdout
openit which -- <words>             one path or URL on stdout

openit link add gsc https://search.google.com/search-console
openit link list | forget gsc
openit alias list | add <thing> -- <words> | forget -- <words>
openit handler set --kind pdf --app Preview
openit handler set --ext md --command /usr/bin/env --args "code,{target}"
openit handler list | forget --kind pdf
openit index [--refresh] [--dirs|--docs|--apps|--links]
openit setup | doctor | init <zsh|bash|fish> | complete | --version
```

A taught command handler is execution by definition, so it is user-authored only, never selectable
by a model, resolved to an absolute executable when it is taught, passed as an argv array with
exactly one `{target}`, and confirmed with a typed word every single time.

## What it remembers, and where

Everything is local, in `~/.config/openit` and `~/.local/share/openit`, both `0700`.

| File | What is in it |
|---|---|
| `config.json` | roots, document roots, taught handlers, whether the AI tier and history are on |
| `index.json` | the directory index |
| `apps.json` | installed applications |
| `url-index.json` | bookmarks, and history if you turned it on |
| `links.json` | names you taught |
| `aliases.json` | answers you confirmed, as actions |
| `db.json` | what you have opened, for frecency |

Browser history is **off** by default; `openit setup --history` turns it on. It is read through a
copy, opened `immutable=1`, deleted afterwards. Bookmarks are read from Chromium browsers only -
Safari's live behind TCC, and openit will not raise a permission dialog you did not ask for.

## A stated non-goal

openit never writes LaunchServices defaults. `openit doctor` reports what the secure plist and
`duti` say, and stops there. Having `duti` installed makes changing your system-wide file
associations tempting; a tool you run to open one file should not quietly change what every other
program does.

## Development

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

All four must pass on every change. The suite uses no mocks anywhere: real temp trees, a real
`com.apple.quarantine` attribute written by `xattr(1)`, a real sqlite database, four real `/bin/sh`
shims standing in for `open(1)`, a real pseudo-terminal driven by `expect(1)`, and one test that
runs the real `/usr/bin/open` with inputs that can only fail, so an OS upgrade that rewords its
errors fails the build instead of silently degrading them.

The highest-value assertions are the negative ones: for every refusal and every decline, the shim's
argv log **must not exist**.

## License

MIT
