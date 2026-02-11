# Esports_Scoreboard_OBSTool

A local **OBS Dock + Browser Overlay** scoreboard tool for esports broadcasts.

It runs a small Node.js HTTP server that provides:
- A controller page (`/dock.html`) for use as an OBS Custom Dock.
- Two live overlay pages (`/team1.html`, `/team2.html`) for OBS Browser Sources.
- Optional OBS WebSocket v5 integration to also update native OBS text/image sources.

## Features

- Team 1 / Team 2 scores with `+1`, `-1` (clamped at `0`), and reset.
- Editable team names.
- Team logo dropdowns populated dynamically from `assets/logos/*.png`.
- Team name font color + trim color controls (`input[type=color]`).
- Live update pipeline via WebSocket (no browser source refresh required).
- Persistent state in `data/state.json`.
- Optional OBS WebSocket source mapping updates for text and image sources.

## Project structure

- `src/server.ts` — Express server, WebSocket broadcasting, persistence, OBS WebSocket integration.
- `public/controller.html` — Controller / dock UI.
- `public/team1.html` and `public/team2.html` — Overlay pages.
- `public/js/*.js` — Front-end logic.
- `public/css/*.css` — Styling.
- `assets/logos/` — Team logos (`.png`) used by dropdowns.
- `data/state.json` — Saved state, auto-generated.

## Install

```bash
npm install
```

## Run

Development mode (watch + restart):

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

Default server URL is:

- `http://localhost:3000`

## OBS setup

### 1) Add controller as a Custom Dock

In OBS:
- `Docks` -> `Custom Browser Docks...`
- Name: `Scoreboard Controller`
- URL: `http://127.0.0.1:3000/dock.html`

### 2) Add overlays as Browser Sources

Add two Browser Sources in your scene:
- Team 1 overlay URL: `http://127.0.0.1:3000/team1.html`
- Team 2 overlay URL: `http://127.0.0.1:3000/team2.html`

These overlays update live through WebSocket messages.

### 3) Optional: Connect OBS WebSocket v5

In OBS, ensure OBS WebSocket is enabled (OBS 28+ ships it by default):
- Tools -> WebSocket Server Settings
- Keep host/port/password available

In controller:
- Fill `Host`, `Port`, `Password`
- Click `Connect`

If connected, the app can update native OBS sources whenever state changes.

### 4) Source name mapping

Configure source names in the controller exactly as they appear in OBS:

- Team 1 Name text source
- Team 2 Name text source
- Team 1 Score text source
- Team 2 Score text source
- Team 1 Logo image source
- Team 2 Logo image source

On update, the tool sends:
- Text input settings (`text`) for mapped text sources
- File path input setting (`file`) for mapped image sources

If a source name is missing/invalid, the controller displays a status error while keeping overlays functional.

## Persistence details

State is auto-saved to `data/state.json` on every change. It includes:
- Team names
- Scores
- Selected logos
- Font/trim colors
- OBS host/port and mappings

Password behavior:
- Password is **not persisted** unless `Store password in local state.json` is checked.

## Adding logos

Drop additional PNG files into:

- `assets/logos/`

They will appear in both logo dropdowns automatically.

This repository intentionally does not commit binary placeholder logos. Add your own PNG files to begin using logos.

## Notes

- Overlays work even when OBS WebSocket is disconnected.
- OBS WebSocket source updates are optional and secondary to live HTML overlay updates.
