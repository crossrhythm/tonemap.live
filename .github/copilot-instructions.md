# Tonemap Live - AI Assistant Guide

## Project Overview
Tonemap Live is a web-based musical pitch visualization tool that displays real-time pitch detection in a grid layout. The application creates a "heatmap" of played notes, helping users visualize their intonation patterns.

## Architecture & Key Components

### Core Components
- **Audio Processing**: Uses Web Audio API and the `pitchy` library for pitch detection
- **Grid Visualization**: Dynamic grid system showing notes with color-coded intonation feedback
- **User Interface**: Split layout with grid display and control panel

### Key Files
- `index.html`: Single-file application containing HTML, CSS, and JavaScript

## Essential Patterns & Conventions

### State Management
- Central state object tracks active notes and grid cell states
- Grid cells store historical data in `cellState` object:
  ```javascript
  cellState[midiNote] = {
    totalVoiceMs: 0,
    segments: [],
    colorRGB: {r:0,g:0,b:0},
    visited: false
  }
  ```

### Audio Processing Pipeline
- Uses `AudioContext` with `AnalyserNode`
- Pitch detection configuration:
  - FFT Size: 2048
  - Sample Rate: Dynamic based on system
  - Frequency Range: 20Hz - 8200Hz

### Visual Feedback System
1. Easy Mode (default):
   - Deadzone: ~0.23% pitch deviation
   - Minimum Hold: 100ms
2. Hard Mode:
   - Deadzone: ~0.12% pitch deviation
   - Minimum Hold: 50ms

### History Modes
- Short: 3 seconds accumulated voiced time
- Long: 20 seconds accumulated voiced time

## Project-Specific Patterns

### CSS Color Variables
```css
--bg-main: #0f172a
--bg-panel: #1e293b
--text-dim: #94a3b8
--text-lite: #f8fafc
--accent-green: rgb(34,197,94)
```

### Grid Layout
- Dynamic sizing based on selected note range
- Organized in octaves (12 semitones per row)
- Cell colors indicate intonation accuracy:
  - Green: In tune
  - Yellow: Sharp
  - Blue: Flat

### Responsive Design
- Mobile-first with landscape orientation preference
- Fluid grid sizing using CSS Grid and Flexbox
- Breakpoint handling for portrait orientation warning

## Integration Points
- External dependency: `pitchy@4.0.1` for pitch detection
- Web Audio API integration for microphone input
- MediaDevices API for audio capture permissions

## Common Tasks

### Adding New Controls
1. Add HTML in right column (`right-scroll` section)
2. Include status panel updates in `updateDebugPanel()`
3. Wire up event listeners in initialization section

### Modifying Grid Behavior
1. Update relevant constants (e.g., `FULL_CONF_MS`, `LED_OFF_DELAY_MS`)
2. Modify color calculation in `computeColorBiasFromErr()`
3. Update grid cell rendering in `renderHeatmap()`

### Important Data Structures
- `midiToCellEl`: Maps MIDI notes to grid cell elements
- `cellState`: Stores note history and visualization data
- `activeNoteInfo`: Tracks currently playing note data