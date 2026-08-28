# Achievement Scavenger: Tracker & Guides

A cross-platform desktop companion app for hunting achievements. Achievement Scavenger sits alongside your games, automatically detects what you're playing, and gives you live progress tracking, interactive collectible checklists, step-by-step walkthroughs, missable warnings, community hints, a **Mobile Companion**, and Discord integration. All in one lightweight window.

Built with **Tauri (Rust + React/TypeScript)**.

![Achievement Scavenger Screenshot](https://achievementscavenger.batureren.com/assets/hero-screenshot.webp)

---

## Features

### Mobile Companion App
- **Live Local Server**: Start a lightweight local server directly from the app and scan a QR code to pull up a mobile-optimized tracker on your phone.
- **Seamless Sync**: Track achievements, check off interactive collectibles, and read guide walkthroughs on your phone while playing your game on the big screen.
- **Auto-Start**: Configure the companion server to start silently in the background every time you launch the app.

### Multi-Platform Tracking
- **Steam**: Auto-detects running games via the Windows registry (and Linux/Steam Deck VDF files), pulling live achievement status and global unlock percentages from the Steam Web API.
- **PlayStation Network (PSN)**: Connects securely via an NPSSO token to track PS4/PS5 trophies, game progress, and global rarity directly from Sony's servers.
- **Xbox Live**: Connects via OpenXBL to track Xbox titles, gamerscore, and achievement rarity.
- **RetroAchievements**: Tracks your recently played retro titles and syncs achievement progress, points, and TrueRatio.

### Live Game Detection
- Automatically switches to a game's tab the moment it launches (Steam, RA, Xbox, or PSN).
- Polls for new unlocks in real time while you play and shows toast notifications the instant an achievement pops.
- Automatically takes a desktop screenshot with the achievement icon overlaid the moment you unlock something.

### Guides, Checklists & Walkthroughs
- **Guide Playthroughs**: Follow step-by-step community walkthroughs that combine text instructions, embedded media, live achievement tracking, and checklist items into a single unified timeline.
- **Interactive Checklists**: Track collectibles, side-quests, and hidden items. Mark them off as you find them, complete with location tags, categories, and embedded video links.
- Pulls a community-maintained achievement database (hints, descriptions, chapters, missable flags, and guide links) from GitHub for supported games.
- **Missable achievement alerts** warn you before you progress past a point of no return.
- Spoiler-protected hints (blurred until hovered).

### Personalization & Organization
- **Customizable Layouts**: Adjust the achievement grid from 2 up to 6 columns to perfectly fit your monitor.
- Custom chapters/sections to organize achievements by story progress.
- Track specific achievements to a personal watchlist.
- Local notes and edits per achievement, saved independently of the community database.
- Sort by name, rarity, or chapter; filter by locked/unlocked/tracked/missable/spoiler.
- Filter out the noise: toggle filters to hide everything except what's relevant to your current chapter and tracked list.

### Quality of Life
- **Smart Window Memory**: Remembers your exact window coordinates, custom sizes, and maximized states perfectly across monitors and launches.
- **Cloud Sync**: Backup and restore your local history, settings, and custom checklists across multiple devices (like your PC and Steam Deck) using GitHub Gists.
- **Mini/Compact Mode**: A slimmed-down, always-on-top overlay with dedicated tabs for tracked achievements, checklists, and guides.
- **Discord Rich Presence** shows your current game and achievement hunting progress to friends.
- Multiple overlay styles (ghost, neon, tactical, frosted, MMO-style) with adjustable transparency.
- Adjustable window opacity, UI scale, and windowed/borderless/fullscreen modes.
- Global hotkey (`Ctrl+Shift+T`) to show/hide the tracker instantly.
- System tray icon with quick show/quit controls and minimize-to-tray support.
- Runs on startup (optional).
- Export your achievement checklist as JSON or a styled, shareable HTML page.
- Multi-language UI support.

---

## Installation

Download the latest installer from the [Releases](../../releases) page and run the `setup.exe`. The app will keep itself up to date automatically.

**Requirements:**
- Windows 10/11 or Linux/Steam Deck.
- A [Steam Web API key](https://steamcommunity.com/dev/apikey), a PlayStation Network account (NPSSO token), an [OpenXBL](https://xbl.io) API key, and/or a RetroAchievements account, depending on which platforms you want to track.

---

## Getting Started

1. Launch Achievement Scavenger and enter your API key(s) for the platform(s) you use.
2. Start playing a game, the app detects it automatically and pulls up its achievement list.
3. Turn on the **Mobile Companion** to track items on your phone, or switch to **Mini Mode** to keep a compact overlay on your screen.
4. Track achievements you're hunting, add notes, and organize by chapter.
5. Get warned before missable achievements slip by, and let Discord show off your progress.

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | [Tauri 2](https://tauri.app/) |
| Backend | Rust |
| Local Server | Axum + Tokio (WebSockets) |
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

You can contribute directly from the app: fill in hints, chapters, checklists, and missable flags for a game, then hit **"Create PR"** to copy the formatted code and open a pre-filled pull request. No manual JSON editing required.

Bug reports and feature requests for the app itself are welcome via [Issues](../../issues).

---

## License

GNU GENERAL PUBLIC LICENSE

---

## Credits

Developed by **sawworm Games**.