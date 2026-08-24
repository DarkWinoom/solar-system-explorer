# 3D Earth Simulator

> A real-time Earth–Moon–Sun simulator with 4 views, accurate day/night terminator and live moon phase — pure frontend, no backend.

![status](https://img.shields.io/badge/status-v1.1-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![tech](https://img.shields.io/badge/Three.js-r185-000000?logo=three.js)
![no-backend](https://img.shields.io/badge/backend-none-brightgreen)

[Online Demo](https://3d-earth-simulator.netlify.app/)

English | [中文](./README.zh-CN.md)

## Overview

3D Earth Simulator is a single-page web application that renders a real-time Earth–Moon–Sun system in your browser. Built on Three.js, it computes the sun's position from the current UTC time to drive an accurate day/night terminator on Earth, derives the moon phase and orbital position from the same celestial state, and ships a 4-view interface (Overview / Sun / Earth / Moon) so you can explore the system at any scale.

On first load it auto-locates you from your public IP and tweens the camera to your home position. The InfoCard tracks your local time, sunrise / sunset, moon phase and day-of-year in real time. Every camera pose is recomputed from the current fov and aspect ratio, so the view stays comfortable from a vertical phone to a wide desktop.

The entire experience is self-contained: no backend, no API keys (except a public IP geolocation API for first-load location), no build server at runtime.

## Preview

| Overview | Earth |
| --- | --- |
| ![Overview en-US](./docs/screenshots/en-US-overview.png) | ![Earth en-US](./docs/screenshots/en-US.png) |

The terminator (day/night line) is computed from the current UTC sun position. The Overview view shows the Earth–Moon–Sun spatial relationship with both orbit guides; the Earth view shows the auto-located day/night terminator on the planet with NASA Black Marble city lights on the night side.

The page starts with a fast rotation (600× real-time) so you can immediately see the planet is alive.

After locating you, the camera tweens to your home position over 3 seconds while easing the spin back to 1×.

Use the 4-view tabs in the top bar to switch between Overview / Sun / Earth / Moon; drag to rotate, scroll to zoom.

## Features

- **Real-time day/night cycle** — sun position computed from current UTC time, terminator updates every frame
- **Sun–Earth–Moon (SEM) system** — v1.1: 4-view tabs (Overview / Sun / Earth / Moon) with deterministic camera poses; the sun direction in the Earth view is the actual scene sun (not a faux DirectionalLight)
- **Unified celestial state** — single `celestialState(instant)` is the only source for sun direction, Earth orientation, moon position and phase; scene / materials / camera / InfoCard all read from the same state
- **8-phase moon calendar** — moonPhase() returns one of 8 phase names + geometric illumination, displayed in InfoCard
- **1:1 Earth rotation** — Earth rotates at real-world speed (24h/revolution)
- **Auto-located view** — initial camera position points to your actual location (IP API + `Intl` fallback)
- **Drag & zoom** — `OrbitControls` for intuitive interaction
- **City lights at night** — NASA Black Marble overlay shows real city light patterns on the night side
- **Multilingual UI** — zh-CN / en-US out of the box, custom language packs via `window.appI18n.registerLocale()`
- **Dev URL params** — `?lan=en-US&loc=34.04,-118.25,-7&tz=America/Los_Angeles` for screenshots / demos / tests (force language + location + IANA tz name without VPN)
- **Self-hosted fonts** — Orbitron / Inter / JetBrains Mono served locally as woff2, no Google Fonts CDN dependency
- **Responsive layout** — works on mobile and desktop, TailwindCSS
- **Pure frontend** — single Vite + TypeScript codebase, deployable to GitHub Pages / Vercel / Netlify with zero config

## Tech Stack

| Layer | Choice |
| --- | --- |
| Renderer | [Three.js](https://threejs.org/) r160 |
| Build | [Vite](https://vitejs.dev/) 5 + TypeScript 5 |
| Styling | [TailwindCSS](https://tailwindcss.com/) 3 |
| Controls | `three/examples/jsm/controls/OrbitControls` |
| Geolocation | `ipapi.co` / `ipwho.is` (CORS-friendly, no key) |
| Testing | [Vitest](https://vitest.dev/) |

## Quick Start

Requirements: Node.js ≥ 18, [pnpm](https://pnpm.io/) ≥ 8 (or `npm` / `yarn`).

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
# → http://localhost:5173

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run tests
pnpm test
```

## Project Structure

```dir
3d-earth-simulator/
├── public/                 # Static assets (textures, fonts)
├── src/
│   ├── main.ts             # Entry point
│   ├── app.ts              # App initialization
│   ├── scene/              # Three.js scene modules
│   ├── shaders/            # GLSL shaders (earth day/night, atmosphere)
│   ├── geo/                # Geolocation logic
│   ├── i18n/               # Multilingual system
│   ├── ui/                 # UI components (top bar, info card, etc.)
│   ├── utils/              # Sun / time utilities
│   ├── styles/             # TailwindCSS + global styles
│   └── types/              # TypeScript type declarations
├── tests/                  # Vitest unit tests
├── index.html              # Vite entry
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
├── LICENSE
└── NOTICES.md
```

## Browser Support

- Chrome / Edge ≥ 100
- Firefox ≥ 100
- Safari ≥ 15
- Mobile Safari / Chrome Android (responsive layout)

Requires WebGL 2 support. No WebGL 1 fallback.

## Customization

### Change language at runtime

Open the browser console:

```js
window.appI18n.registerLocale('ja-JP', {
  'tz.label': 'タイムゾーン',
  'time.label': '現在時刻',
  // ...
});
window.appI18n.setLocale('ja-JP');
```

## License

[MIT](./LICENSE) — free for personal and commercial use.

## Acknowledgments

- [Three.js](https://threejs.org/) — the rendering engine
- [NASA Visible Earth](https://visibleearth.nasa.gov/) — Blue Marble and Black Marble textures (public domain)
- [Google Fonts](https://fonts.google.com/) — Orbitron, Inter, JetBrains Mono (OFL)

See [NOTICES.md](./NOTICES.md) for the full third-party license list.
