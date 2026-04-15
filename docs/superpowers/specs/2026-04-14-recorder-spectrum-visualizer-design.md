# Recorder Spectrum Visualizer

**Date:** 2026-04-14

## Summary

Replace the broken red waveform in the recorder dock's timeline canvas with a live frequency spectrum line during recording. Post-recording state (white waveform + green playhead during playback) is unchanged.

## Approach

**Option A — Reuse existing analyserNode.** The pitch-detection `analyserNode` (fftSize 2048, smoothingTimeConstant 0) is already connected to `micSourceNode` and live whenever the mic is running, which includes during recording. No new audio nodes are created. The change is entirely contained within `drawRecorderTimeline()` and a small addition to `recorderState`.

## Visual Design

- **X axis:** Logarithmic frequency scale from ~80 Hz to ~8000 Hz (the musically relevant range matching the app's pitch detection window). Log scaling gives appropriate resolution in the bass and midrange.
- **Y axis:** Amplitude, 0 at the bottom, full canvas height = loud.
- **Rendering:** Smooth quadratic bezier curve connecting sampled frequency bin peaks — a single red stroke (`rgba(248,113,113,0.88)` matching existing recording red), no fill.
- **Smoothing:** Exponential moving average (EMA) applied per animation frame to a persistent `Float32Array` in `recorderState`. Alpha ~0.15 per frame yields smooth, responsive motion without jitter at 60 fps.
- **Bin sampling:** Map ~48 evenly log-spaced frequency points between 80 Hz and 8000 Hz to their corresponding FFT bins. At fftSize 2048 and a typical 44100 Hz sample rate, bin resolution is ~21.5 Hz/bin, giving good coverage across the range.

## State Changes

Add to `recorderState`:
- `spectrumSmoothed`: `Float32Array` of length matching the number of sample points (~48), initialized to zeros on first use. Reset to zeros when recording starts.

## Behavioral Contract

- Spectrum is drawn **only when `recorderState.isRecording` is true**.
- When not recording, `drawRecorderTimeline()` behavior is identical to current (waveform + playhead, or empty state).
- The existing `queueRecorderTimelineDraw` / `requestAnimationFrame` loop drives the spectrum — no new animation loop is needed.
- The spectrum draw calls `analyserNode.getByteFrequencyData()` each frame; if `analyserNode` is null the draw is skipped gracefully.

## What Does Not Change

- Post-recording waveform (white peaks + green playhead) during playback — unchanged.
- Empty state ("No take yet" text overlay) — unchanged.
- All audio graph connections — unchanged.
- `recorderProcessorNode` PCM capture path — unchanged.
