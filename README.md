# 🍋 Ezeo CLI

**Talk to your SEO data.** The first conversational CLI for SEO and AI visibility.

```
$ ezeo chat
🍋 Ezeo AI — Connected as bryan@maxxusindustries.com
   3 projects loaded

ezeo > how's AquaProVac?

  AquaProVac (aquaprovac.com)

  Search Console (7d)
    Clicks: 2.8K  |  Impressions: 45.2K  |  CTR: 6.2%  |  Avg Position: 14.3

  Analytics (7d)
    Sessions: 3.1K  |  Users: 2.4K  |  Bounce Rate: 42.1%

  AI Visibility (30d)
    Citations: 12  |  Citation Rate: 48.0%
    Platforms: ChatGPT: 5, Perplexity: 4, Gemini: 3

  Rankings
    Top 3: 8  |  Top 10: 24  |  Top 20: 47  |  Total tracked: 89
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
# 1. Login with your Ezeo account
ezeo login

# 2. Check your project status
ezeo status

# 3. Start chatting with your data
ezeo chat
```

## Commands

| Command | Description |
|---------|-------------|
| `ezeo login` | Authenticate with your Ezeo account |
| `ezeo logout` | Clear stored credentials |
| `ezeo projects` | List all your projects |
| `ezeo projects use <name>` | Set default project |
| `ezeo status [project]` | Dashboard overview with all metrics |
| `ezeo chat` | Interactive conversational mode |

### Chat Mode

In chat mode, you can ask natural questions:

- `"how's AquaProVac?"` - Full status dashboard
- `"traffic"` - Search Console metrics (7d)
- `"rankings"` - Keyword positions summary
- `"geo"` / `"citations"` - AI visibility across platforms
- `"insights"` - Recent alerts and issues
- `"projects"` - Switch between projects

## What is Ezeo?

[Ezeo AI](https://ezeo.ai) is an AI-powered SEO and GEO (Generative Engine Optimization) platform. It tracks your visibility across Google, ChatGPT, Perplexity, Gemini, Claude, Grok, and Bing Copilot.

This CLI gives you instant access to your data from the terminal. No dashboards, no clicking around. Just ask.

## Roadmap

- [x] **Phase 1** - Auth + read-only queries (status, traffic, rankings, GEO, insights)
- [ ] **Phase 2** - Content generation ("write me a blog about X")
- [ ] **Phase 3** - Agent mode (memory, proactive alerts, `ezeo watch`)
- [ ] **Phase 4** - CI/CD integration (`ezeo audit --ci --fail-below 80`)

## License

MIT - by [JAMAK AI](https://jamaklab.com)
