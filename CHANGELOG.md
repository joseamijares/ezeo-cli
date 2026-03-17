# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-16

### Fixed
- **#8** `status --json` no longer leaks spinner output into JSON. Spinner now writes to `process.stderr` in both `status` and `keywords` commands.
- **#9** `fetchTopKeywords` RPC path now filters out positions > 100, matching the fallback path behaviour.
- **#10** Keyword position change (`change` field) is now computed with proper `Number()` coercion and treats `previous_position = 0` as "no previous data", preventing stale or misleading change values.

### Added
- `--verbose` / `-v` global flag: enables debug logging throughout all commands. Key internal messages are suppressed unless this flag is set.

## [0.2.0] - 2025-11-01

### Added
- `keywords` command — ranked keyword list with position changes, top-3 / top-10 / improved / dropped summary, and `--json` support.
- `--limit` / `-n` option on `keywords` command to control how many keywords are shown (default: 20).

### Fixed
- Projects list: `---` placeholder shown correctly when a domain or integration is not set.
- `status` command: project lookup by partial name / domain now case-insensitive.

### Changed
- TypeScript strict-mode cleanup across `src/lib/api.ts` and `src/lib/globals.ts`.
- ESLint + CI pipeline added (GitHub Actions on push / PR to `main`).
- Dependabot configured for weekly npm updates.

## [0.1.0] - 2025-10-01

### Added
- Initial release.
- `login` / `logout` / `whoami` — email + password authentication via Supabase.
- `projects` / `projects use <name>` — list projects and set a default.
- `status [project]` — GSC, GA4, GEO, rankings, and top keyword dashboard.
- `report [project]` — full performance report with `--json` / `--md` output.
- `alerts [project]` — recent insights and ranking change notifications.
- `geo [project]` — AI visibility / citation rate by platform.
- `cro [project]` — CRO audit scores, findings, and deliverables.
- `doctor` — connectivity and auth health check.
- `chat` — interactive conversational mode (default command when no subcommand given).
- `memory [target]` — view soul, global, or project-specific memory files.
- `api-key create / list / revoke` — programmatic API key management.
- `setup` — guided first-run wizard.
- Global flags: `--json`, `--no-color`, `-q/--quiet`, `--project`, `--format`.
