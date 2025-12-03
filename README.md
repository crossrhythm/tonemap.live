# Tonemap.Live
A browser-based visual tuner that maps pitch tendencies in real time.  
Live demo: https://tonemap.live

## Overview
Tonemap analyzes incoming audio, identifies pitch in real time, and visualizes intonation tendencies on a dynamic grid of "cells." Each cell represents a short musical event, allowing musicians to see sharp/flat tendencies across phrases, shifts, and articulations - not just instantaneous pitch.

The goal is to provide clear, actionable feedback during practice: where notes tend to sit, how articulations affect intonation, and how consistency improves over time.

## Features
- Real-time pitch detection in the browser (Web Audio API + custom smoothing).  
- Dynamic cell-based visual map showing sharp/flat tendencies over time.  
- Red needle "instantaneous pitch" indicator using spectral analysis.  
- Optional transposition for common orchestral instruments.  
- Lightweight, mobile-friendly UI (iOS, iPadOS, Android, desktop).  
- Runs entirely in the browser; no data is sent to any server.

## Tech Stack
- **HTML / CSS / JavaScript**  
- **Web Audio API** for audio capture and processing  
- **FFT + pitch tracking algorithms** for stable pitch estimation  
- **Client-only architecture** (no backend services)

## Running Locally
Clone the repo and open `index.html` in any modern browser:

```bash
git clone https://github.com/yourusername/tonemap.git
cd tonemap
open index.html   # or just drag it into your browser
```

## License
Tonemap.Live is licensed under the MIT License. See `LICENSE` for details.
