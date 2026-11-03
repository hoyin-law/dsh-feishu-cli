# Feishu CLI · DSH Plugin (dsh-feishu-cli)

English · [简体中文](README.md)

Brings the [official Feishu CLI](https://github.com/larksuite/cli) (`lark-cli`) into DeepSeek Harness (DSH) Desktop and Web: a **Feishu** panel in the sidebar for QR-code sign-in, and agent tools that can run any `lark-cli` command.

> This is a community plugin, not a product published by Feishu/Lark or DeepSeek. It drives the official Feishu CLI; every login, authorization and command runs under your own Feishu account and permissions.

## What it is

- **A DSH plugin**: adds a Feishu entry to the DSH sidebar with a main panel, and registers the `feishu_cli` and `feishu_auth` agent tools.
- **A wrapper around the official CLI**: the official `lark-cli` does the real work. The plugin locates and runs it, reads its state, and surfaces login QR codes and command output in the panel and the conversation.
- **The same capability boundary as the CLI**: anything the CLI can do, the plugin can do; nothing beyond that is promised.

## Features

- **App initialization**: when no Feishu app exists yet, the panel offers "Initialize Feishu app", which runs the official CLI's one-step app creation flow (scan or open the link).
- **Account sign-in**: "Sign in to Feishu" shows a QR code and an authorization link; the panel refreshes to "Signed in" automatically.
- **Scope selection**: sign in with all common permissions, or only the business domains you need (Messenger, Calendar, Docs, Base, Mail, Tasks, Video Conferencing, Contacts and more).
- **Identity status**: app ID, signed-in user, Open ID, granted scope count and expiry; sign-out and cancel an in-progress login.
- **Command console**: run `lark-cli` commands from the panel and read the output in a monospace view, with shortcuts for common commands.
- **CLI install onboarding**: if `lark-cli` is missing, the panel shows "Download and install Feishu CLI", notes that the download is about 50MB, and reports progress and phases.
- **Agent tools**: `feishu_cli` runs any `lark-cli` command; `feishu_auth` handles status, sign-in, waiting for sign-in, sign-out and user listing.
- **Chinese / English UI**: follows the DSH language setting.

Coverage comes from the official CLI: Messenger `im`, Docs `docs`, Base `base`, Sheets `sheets`, Calendar `calendar`, Mail `mail`, Tasks `task`, Video Conferencing `vc`, OKR, Approval `approval`, Contacts `contact`, Drive `drive`, Wiki `wiki`, Apps `apps` and more — **18 business domains, 200+ high-level commands (`+shortcut`)**, plus the **full OpenAPI** through `lark-cli api`.

## Requirements

- DeepSeek Harness Desktop, or `dsh web`, with support for profile bundles.
- Windows (x64 / ARM64), macOS (Intel / Apple silicon), Linux (x64 / ARM64 / RISC-V).
- A network connection on first use to download the official `lark-cli` for your platform (~50MB).
- A Feishu / Lark account. In an enterprise tenant, creating a custom app or granting scopes may require administrator approval.

## Install

Install from GitHub (source package from `main`):

```bash
# Desktop users: replace web with desktop
dsh plugin --profile web add github:hoyin-law/dsh-feishu-cli
```

```bash
# DSH Desktop
dsh plugin --profile desktop add github:hoyin-law/dsh-feishu-cli
```

If the package is published to npm, you can install it by name:

```bash
dsh plugin --profile web add dsh-feishu-cli
```

Restart DSH after installing; a Feishu icon appears in the sidebar. To uninstall:

```bash
dsh plugin --profile web remove dsh-feishu-cli
```

## First use: two QR-code steps

1. **Initialize the app** (first time only): open Feishu in the sidebar → under "Step 1 · Initialize Feishu app", click "Initialize Feishu app (about 1 minute)" → a Feishu authorization page opens in your browser, or scan the code → create and authorize the app. The app is then stored in the local `lark-cli` configuration.
2. **Sign in**: under "Sign in to Feishu", click "Sign in to Feishu" → scan the QR code with the Feishu app, or open the link → approve on your phone. The panel shows "Signed in · your name" when done.

After that, only step 2 is needed; the panel prompts you to sign in again when the session expires.

> Both steps are official CLI flows: initialization creates **your own** Feishu custom app, and sign-in authorizes **your own** Feishu user identity.

## Usage

### Panel

- **Account card**: app and sign-in status, sign in / sign out / cancel.
- **Command console**: type the part after `lark-cli`, for example:
  - `calendar +agenda` — today's agenda
  - `task +list` — my tasks
  - `im +chats-list` — chat list
  - `docs +search --query weekly` — search Docs
  - `base +records-list --app-token xxx --table-id xxx` — read Base records
  - `api GET /open-apis/calendar/v4/calendars` — call the OpenAPI directly
- **Shortcuts**: fill common commands with one click.

### Agent tools

`feishu_cli` runs any `lark-cli` command:

```text
feishu_cli command="calendar +agenda"
feishu_cli command="im +messages-send --chat-id oc_xxx --text hello"
feishu_cli command="docs +search --query weekly"
feishu_cli command="api GET /open-apis/calendar/v4/calendars"
```

Parameters: `command` (required; the full argv string after `lark-cli`, quoting supported, no shell), `cwd` (optional working directory), `timeout_ms` (optional, default 120000, range 1000–600000), `stdin` (optional; written to the child process's stdin).

`feishu_auth` handles login and identity:

```text
feishu_auth action="status"                      # CLI / app / sign-in status
feishu_auth action="login_start" mode="init"     # start app initialization
feishu_auth action="login_start" mode="login"    # start sign-in; returns link, QR code and login_id
feishu_auth action="login_wait" login_id="..."   # wait for the user to approve on their phone
feishu_auth action="logout"                      # sign out
feishu_auth action="list"                        # signed-in users
feishu_auth action="login_cancel" login_id="..."  # cancel an in-progress login
```

Conventions:

- Output is JSON by default; success means `ok == true` (or exit code 0).
- Use `--dry-run` to preview writes where the CLI supports it.
- Exit code `10` means `high-risk-write`: ask the user, then retry with `--yes` appended.
- Path arguments accept only paths relative to the command working directory; use `cwd` for another directory.
- Commands do not go through a shell: pipes, redirects and `&&` do not work. Use the CLI's own options instead.

## Where the Feishu CLI comes from

- **Recommended**: on first use the panel downloads the official `lark-cli` 1.0.98 for your platform, extracts it into `~/.dsh/feishu-cli/bin` (technically `$DSH_HOME/feishu-cli/bin`), verifies the file against a built-in SHA-256 checksum, and then runs it.
- **Download sources**: the npmmirror binary mirror is tried first, with GitHub Releases as the fallback; the archive is about 50MB.
- **Use an existing binary**: set `LARK_CLI_BIN` (full path) or its alias `LARK_CLI_PATH`. Useful for offline or intranet machines, or when you already installed `lark-cli` yourself. You can also put `lark-cli` on `PATH`.
- **Enterprise / offline deployment**: `FEISHU_CLI_HOME` changes the install root, and `FEISHU_CLI_DOWNLOAD_BASE` supplies one or more comma-separated download base URLs that are tried in order.

Lookup order: `LARK_CLI_BIN` → `LARK_CLI_PATH` → the download directory `~/.dsh/feishu-cli/bin` → a legacy `vendor/` directory → `PATH`.

> The plugin currently has no graphical Config page; the executable location is controlled through these environment variables, the download directory, or `PATH`.

## Security and permissions

- **Runs as your own Feishu identity**: the agent calls the Feishu API as the user you signed in with, limited to the scopes you granted. Grant the minimum you need.
- **High-risk writes need confirmation**: destructive commands (deleting docs, recalling messages, etc.) fail with exit code `10` and require you to confirm and retry with `--yes`. The plugin never confirms for you.
- **Credentials belong to `lark-cli`**: app credentials and login tokens are stored by the official CLI in `~/.lark-cli`, with tokens in the operating system credential store. The plugin does not keep its own copy of app secrets or access tokens, and does not write them to logs.
- **The local Web API is origin-checked**: `/feishu-cli/api/*` accepts only same-origin `application/json` POST requests.
- **Review third-party plugins before installing**: this is not an officially certified plugin, and its code runs with your user privileges. Uninstall it whenever you no longer need it.

See [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md) for details.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `lark-cli` not found | Click "Download and install Feishu CLI" in the panel again; or set `LARK_CLI_BIN` to an existing binary; or put `lark-cli` on `PATH` |
| CLI download or checksum fails | Check the network or proxy and retry; on an intranet, point `FEISHU_CLI_DOWNLOAD_BASE` at an internal mirror, or download manually and set `LARK_CLI_BIN` |
| QR code missing or unscannable | Click refresh; or open the authorization link from the panel in a browser |
| "Permission denied" after signing in | Sign out and sign in again with more business domains; in an enterprise tenant an administrator may also need to approve the scopes |
| Enterprise app creation fails | Enterprise tenants may restrict custom app creation; ask your Feishu administrator to enable it, or use an account with permission |
| Authorization page will not open | Check network / proxy; scanning with the Feishu mobile app usually bypasses browser network issues |
| `unsafe file path` | File arguments must be relative to the working directory; `cd` there or pass the tool's `cwd` |
| Exit code `10` | High-risk write; confirm with the user, then retry with `--yes` |
| No Feishu icon in the sidebar | Make sure the plugin is installed and enabled in the profile, then restart DSH; check the DSH plugin list |
| Panel status never refreshes | Close and reopen the panel; check that the DSH backend is running and inspect DSH logs |

## Known limitations

- **Meegle (Feishu Projects) is not covered**: it needs the separate `meegle-cli`. This plugin wraps `lark-cli` only.
- **Capabilities depend on permissions**: some APIs need specific scopes or enterprise administrator approval; the plugin cannot bypass the Feishu permission model.
- **Command syntax follows the official CLI**: commands may differ between `lark-cli` versions; use `<domain> --help` or `schema <service.resource.method>` first.
- **No shell**: `feishu_cli` spawns a child process directly and does not interpret pipes, redirects or variable expansion.
- **No graphical settings page**: there is no Config form today; use environment variables to choose the executable.
- **Community plugin**: this project is not an officially certified Feishu or DeepSeek plugin and provides no official support.

## Development and tests

There is no build step; the source is the artifact. After changes:

```bash
node --check index.js
node --check lib/cli.js
node --check lib/install.js
node --check lib/api.js
node --check lib/client.js
node --test tests/*.test.mjs
```

Install a local checkout for development:

```bash
dsh plugin --profile web add /path/to/feishu-cli-plugin
```

## Repository layout

```text
feishu-cli-plugin/
├── index.js              # Host entry: agent tools / system prompt / Web API mounting
├── lib/
│   ├── cli.js            # lark-cli discovery, execution, state and login sessions
│   ├── install.js        # runtime download and checksum verification of lark-cli
│   ├── api.js            # /feishu-cli Web API
│   └── client.js         # browser side: sidebar icon and main panel
├── locale/               # plugin metadata (zh / en)
├── icon.svg
├── cordis.patch.yml
├── tests/                # node:test unit tests
├── docs/                 # screenshots and release material
├── market/               # awesome-dsh-plugin entry draft
├── screenshots.json      # storefront screenshot list
├── README.md
├── README.en.md
├── SECURITY.md
├── PRIVACY.md
├── CHANGELOG.md
├── PUBLISHING.md
└── LICENSE
```

The `lark-cli` binary is not committed: neither the repository nor the npm package contains it. It is downloaded to `~/.dsh/feishu-cli/bin` on first use.

## License

The plugin code is MIT-licensed; see [LICENSE](LICENSE).

The [official Feishu CLI](https://github.com/larksuite/cli) it drives is also MIT-licensed, copyright Lark Technologies Pte. Ltd. Download and checksum details are in `vendor/README.md` and `vendor/LICENSE-lark-cli.txt`.
