# 🍋 Ezeo CLI

[![npm](https://img.shields.io/npm/v/ezeo)](https://www.npmjs.com/package/ezeo)

**Talk to your SEO data.** The first conversational CLI for SEO and AI visibility.

```
$ ezeo chat
🍋 Ezeo AI — Connected as bryan@maxxusindustries.com
   3 projects loaded

ezeo > how's AquaProVac?

  AquaProVac (aquaprovac.com)

  Search Console (7d)
    Clicks: 2.8K ▲ +12%  |  Impressions: 45.2K ▲ +8%  |  CTR: 6.2%  |  Avg Position: 14.3

  Analytics (7d)
    Sessions: 3.1K ▲ +15%  |  Users: 2.4K  |  Bounce Rate: 42.1%

  AI Visibility (30d)
    Citations: 12  |  Citation Rate: 48.0%
    Platforms: ChatGPT: 5, Perplexity: 4, Gemini: 3

  Rankings
    Top 3: 8  |  Top 10: 24  |  Top 20: 47  |  Total tracked: 89

  Top Keywords
    #1  auto detailing vacuum (pos 2.1)
    #2  car steam cleaner (pos 4.3)
    #3  portable car vacuum (pos 6.7)
```

## Install

```bash
npm install -g ezeo
```

Or try without installing:

```bash
npx ezeo
```

## Quick Start

```bash
# 1. Set your Supabase key
echo 'EZEO_SUPABASE_ANON_KEY=your_key' > ~/.ezeo/.env

# 2. Login with your Ezeo account
ezeo login

# 3. Check your project status
ezeo status

# 4. Start chatting with your data
ezeo chat
```

## Commands

| Command | Description |
|---------|-------------|
| `ezeo login` | Authenticate with your Ezeo account |
| `ezeo logout` | Clear stored credentials |
| `ezeo whoami` | Show current user, project, token status |
| `ezeo projects` | List all your projects |
| `ezeo projects use <name>` | Set default project |
| `ezeo status [project]` | Dashboard overview with WoW deltas |
| `ezeo keywords [project]` | Top ranking keywords with position changes |
| `ezeo geo [project]` | AI visibility / citation metrics |
| `ezeo cro [project]` | CRO audit scores and findings |
| `ezeo alerts [project]` | Recent alerts and insights |
| `ezeo report [project]` | Full performance report |
| `ezeo readout [project]` | This week's Ezeo readout, exactly as the app composed it (`--week YYYY-MM-DD` for a past week) |
| `ezeo chat` | Interactive conversational mode |
| `ezeo doctor` | Check connectivity, auth, API access |
| `ezeo memory` | View memory system overview |
| `ezeo memory soul` | View CLI personality config |
| `ezeo memory <project>` | View project memory files |

### Chat Mode

In chat mode, ask natural questions:

- `"how's AquaProVac?"` - Full status with WoW deltas
- `"traffic"` - Search Console metrics (7d vs prev 7d)
- `"rankings"` - Keyword positions + top 5 keywords
- `"geo"` / `"citations"` - AI visibility across ChatGPT, Claude, Gemini, Perplexity and Google AI Overview
- `"insights"` - Recent alerts and detected issues
- `"projects"` - Switch between projects
- `"help"` - Show all commands

## Where the numbers come from

The CLI reads the same series the Ezeo dashboard does, so the two agree:

- **Search Console**: Google's site-wide daily totals, only days Google actually reported, in a window that ends 4 days ago (Search Console lags ~3 days). Position is impression-weighted.
- **Analytics**: the GA4 site-wide row per day. Per-page rows are never summed; a session touching three pages would count three times.
- **Rankings**: every tracked keyword's latest and previous check, via the same RPC as the Rankings page. Position 101 means "not in the top 100", not a position.
- A window with no data prints as unmeasured, never as 0.

## Memory System

Inspired by [OpenClaw](https://github.com/openclaw/openclaw), Ezeo CLI has a local memory system that makes it smarter over time:

```
~/.ezeo/
  soul.md                    # CLI personality, voice, content standards
  .env                       # API keys
  credentials.json           # Auth tokens
  memory/
    global.md                # Cross-project notes
    aquaprovac/
      context.md             # Brand voice, audience, products
      history.md             # Conversation log (auto-populated)
      insights.md            # Curated patterns
      content.md             # Published articles, ideas
    gutterprovac/
      ...
```

### soul.md

Controls the CLI's personality and content quality standards. Edit it to match your brand voice:

```markdown
## Voice
- Direct and data-driven. Lead with numbers, not fluff.
- Action-oriented. Every insight ends with what to do next.

## Anti-Patterns
- Never use generic advice without specifics
- Never write "in today's digital landscape"
```

### Project Memory

Each project gets its own memory folder. Fill in `context.md` with brand details to improve content quality in Phase 2:

```bash
# View memory status
ezeo memory aquaprovac

# Edit directly
vim ~/.ezeo/memory/aquaprovac/context.md
```

Chat queries are automatically logged to `history.md`, building a record of what you've asked and when.

## What is Ezeo?

[Ezeo AI](https://ezeo.ai) is a SEO + GEO (Generative Engine Optimization) platform. It tracks your visibility across Google, ChatGPT, Perplexity, Gemini, Claude and Google AI Overview.

This CLI gives you terminal access to all of it. No dashboards. Just ask.

## Roadmap

- [x] **Phase 1** - Auth, status with WoW, rankings, GEO, CRO, insights, memory system
- [x] **Phase 1.5** - Keywords command, bug fixes (position 101+ filter, keyword changes, `--json`)
- [ ] **Phase 2** - Content generation ("write me a blog about X"), audits
- [ ] **Phase 3** - Agent mode (proactive alerts, `ezeo watch`, scheduled reports)
- [ ] **Phase 4** - npm publish, CI/CD integration (`ezeo audit --ci --fail-below 80`)

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `EZEO_SUPABASE_ANON_KEY` | Supabase anon key for auth | Yes |
| `EZEO_SUPABASE_URL` | Custom Supabase URL (defaults to production) | No |

Set in `~/.ezeo/.env` or as environment variables.

## License

MIT - by [JAMAK AI](https://jamaklab.com)
