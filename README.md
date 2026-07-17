# Achievement Scavenger: Tracker & Guides

A cross-platform desktop companion app for hunting achievements. Achievement Scavenger sits alongside your games, automatically detects what you're playing, and gives you live progress tracking, missable warnings, community hints, and Discord integration. All in one lightweight window.

Built with **Tauri (Rust + React/TypeScript)**.

![Achievement Scavenger Screenshot](https://achievementscavenger.batureren.com/assets/hero-screenshot.webp)

---

## Features

### Multi-Platform Tracking
- **Steam**: Auto-detects running games via the Windows registry, pulls live achievement status and global unlock percentages from the Steam Web API.
- **PlayStation Network (PSN)**: Connects securely via an NPSSO token to track PS4/PS5 trophies, game progress, and global rarity directly from Sony's servers.
- **Xbox Live**: Connects via OpenXBL to track Xbox titles, gamerscore, and achievement rarity.
- **RetroAchievements**: Tracks your recently played retro titles and syncs achievement progress, points, and TrueRatio.

### Live Game Detection
- Automatically switches to a game's tab the moment it launches (Steam, RA, Xbox, or PSN).
- Polls for new unlocks in real time while you play and shows toast notifications the instant an achievement pops.
- Automatically takes a desktop screenshot with the achievement icon overlaid the moment you unlock something.

### Community-Powered Guides
- Pulls a community-maintained achievement database (hints, descriptions, chapters, missable flags, and guide links) from GitHub for supported games.
- **Missable achievement alerts** warn you before you progress past a point of no return.
- Spoiler-protected hints (blurred until hovered).
- Submit your own achievement data back to the community database directly from the app via a one-click GitHub PR flow.

### Personalization & Organization
- Custom chapters/sections to organize achievements by story progress.
- Track specific achievements to a personal watchlist.
- Local notes and edits per achievement, saved independently of the community database.
- Sort by name, rarity, or chapter; filter by locked/unlocked/tracked/missable/spoiler.
- "Guided Mode" hides everything except what's relevant to your current chapter and tracked list.

### Quality of Life
- **Discord Rich Presence** shows your current game and achievement hunting progress to friends.
- **Mini Mode** a compact, always-on-top overlay showing just your tracked achievements.
- Multiple overlay styles (ghost, neon, tactical, frosted, MMO-style) with adjustable transparency.
- Adjustable window opacity, UI scale, and windowed/borderless/fullscreen modes.
- Global hotkey (`Ctrl+Shift+T`) to show/hide the tracker instantly.
- System tray icon with quick show/quit controls.
- Runs on startup (optional).
- Export your achievement checklist as JSON or a styled, shareable HTML page.
- Multi-language UI support.

---

## Installation

Download the latest installer from the [Releases](../../releases) page and run the `setup.exe`. The app will keep itself up to date automatically.

**Requirements:**
- Windows 10/11 (Steam status detection relies on the Windows registry)
- A [Steam Web API key](https://steamcommunity.com/dev/apikey), a PlayStation Network account (NPSSO token), an [OpenXBL](https://xbl.io) API key, and/or a RetroAchievements account, depending on which platforms you want to track.

---

## Getting Started

1. Launch Achievement Scavenger and enter your API key(s) for the platform(s) you use.
2. Start playing a game, the app detects it automatically and pulls up its achievement list.
3. Track achievements you're hunting, add notes, and organize by chapter.
4. Get warned before missable achievements slip by, and let Discord show off your progress.

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | [Tauri 2](https://tauri.app/) |
| Backend | Rust |
| Frontend | React + TypeScript |
| Discord integration | `discord-rich-presence` |
| Screen capture | `xcap` + `image` |
| Auto-updates | Tauri Updater plugin |

---

## Building from Source

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Production build (installer + auto-update artifacts)
npm run tauri build
```

> Auto-update artifacts (`.sig`) are only generated when a Tauri signing key is set via the `TAURI_SIGNING_PRIVATE_KEY` environment variable and `createUpdaterArtifacts` is enabled in `tauri.conf.json`.

---

## Contributing

The achievement hint/chapter/missable database that powers community guides lives in a separate repository:  
[**achievement-scavenger-database**](https://github.com/batureren/achievement-scavenger-database)

You can contribute directly from the app: fill in hints, chapters, and missable flags for a game, then hit **"Submit to GitHub"** to open a pre-filled pull request. No manual JSON editing required.

Bug reports and feature requests for the app itself are welcome via [Issues](../../issues).

---

## License

GNU GENERAL PUBLIC LICENSE

---

## Credits

Developed by **sawworm games**.
