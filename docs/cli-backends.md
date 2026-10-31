# CLI protocol notes

Prism uses the installed CLIs with their existing login, rather than extracting credentials or calling a subscription service directly. API-key configuration remains a separate feature.

## Codex CLI

The adapter invokes `codex exec --json` with ephemeral history, ignored user configuration/rules, disabled native shell/web/extension tools, and a named read-only workspace permission profile. It accepts ChatGPT login status and forces that authentication method during generation. Prompts arrive through stdin. Review responses use an output JSON schema; completed message and turn events provide text and token usage. The built-in default is used when the model selector says **Codex default**, because user model configuration is intentionally ignored for these isolated runs.

References: [non-interactive mode](https://developers.openai.com/codex/noninteractive) and [configuration reference](https://developers.openai.com/codex/config-reference). The implementation was also checked against installed CLI help and exercised with Codex 0.165.0.

## Claude Code

The adapter invokes print mode with JSONL output and partial text messages. Safe mode suppresses user/project customizations while preserving login support; restricted mode, an empty native tool list, and an empty strict MCP configuration constrain the run. Organization-managed policy remains applicable. Bare mode is not used because it ignores OAuth/keychain login. Session persistence is disabled. The parser checks the result's error field even when the process exits successfully.

References: [programmatic usage](https://code.claude.com/docs/en/headless) and [CLI reference](https://code.claude.com/docs/en/cli-reference). Required flags and live generation were checked against Claude Code 2.1.314. See [verification](verification.md) for the checks performed.

## Shared behavior

Each run uses a temporary directory inside Prism's ignored `data/cli-runs`. Prompts never become command-line arguments, and credential values are neither returned nor logged by Prism. The CLIs manage their own authentication/runtime storage. Neither backend receives the source project directory as a working directory.

The subprocess environment preserves `HOME`, `USER`, and `LOGNAME` so the CLI can resolve the same OS login identity as the user's terminal. Removing `USER` and `LOGNAME` caused a misleading Claude login-expiration error during local verification. API-key/OAuth token overrides and SSH-agent sockets are still excluded; Prism does not read or copy saved credentials.

Review output requests Prism's existing list/read/search/diagnostic/proposal tools. Prism validates those requests and revisions; files change only through Apply. Manual Type calls the CLI once and animates its generated text locally. Stop cancels the process group and discards uninserted text. A three-minute timeout and 2 MB stdout guard bound generation; the requested token allowance is a prompt instruction, not a hard CLI token cap.

Subscription model allowances do not have a comparable per-token price in Prism. The editor keeps explicit/default CLI model choices instead of routing them through the API cheapest-model catalog. No automatic model/provider fallback is configured by Prism.
