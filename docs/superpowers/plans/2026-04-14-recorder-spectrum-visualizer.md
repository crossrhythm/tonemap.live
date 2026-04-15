# Recorder Spectrum Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken red waveform in the recorder dock with a live frequency spectrum line during recording.

**Architecture:** Use the existing `analyserNode` (already live on the mic source during recording) to read FFT data each animation frame. Apply exponential moving average smoothing via a persistent `Float32Array` in `recorderState`. Draw a smooth quadratic curve through log-spaced frequency sample points. Self-sustain the rAF loop during recording for 60fps.

**Tech Stack:** Vanilla JS, Web Audio API (`AnalyserNode.getByteFrequencyData`), Canvas 2D API.

---

### Task 1: Add spectrum constants and state fields

**Files:**
- Modify: `test.html` — recorder constants block (~line 4746) and `recorderState` object (~line 4777)

- [ ] **Step 1: Add spectrum constants after the existing recorder constants**

Find this block in `test.html` (around line 4746):
```js
  const RECORDER_MAX_DURATION_MS = 5 * 60 * 1000;
  const RECORDER_TIMELINE_TICK_MS = 10 * 1000;
  const RECORDER_TIP_STORAGE_KEY = "tonemap.live.recorderTipSeen";
```

Add three new constants immediately after `RECORDER_TIMELINE_TICK_MS`:
```js
  const RECORDER_MAX_DURATION_MS = 5 * 60 * 1000;
  const RECORDER_TIMELINE_TICK_MS = 10 * 1000;
  const RECORDER_SPECTRUM_POINTS = 48;
  const RECORDER_SPECTRUM_MIN_HZ = 80;
  const RECORDER_SPECTRUM_MAX_HZ = 8000;
  const RECORDER_SPECTRUM_EMA_ALPHA = 0.15;
  const RECORDER_TIP_STORAGE_KEY = "tonemap.live.recorderTipSeen";
```

- [ ] **Step 2: Add spectrum state fields to `recorderState`**

Find the end of `recorderState` (around line 4795):
```js
    downloadName: "",
    playbackOffsetMs: 0,
    playbackStartedAtMs: 0,
  };
```

Add two new fields:
```js
    downloadName: "",
    playbackOffsetMs: 0,
    playbackStartedAtMs: 0,
    spectrumSmoothed: null,
    spectrumFreqBuffer: null,
  };
```

- [ ] **Step 3: Reset spectrum state at recording start**

Find the block in `startRecording()` (around line 4125) that resets state:
```js
    recorderState.isRecording = true;
    recorderState.autoStopQueued = false;
    recorderState.pcmChunks = [];
    recorderState.totalSamples = 0;
    recorderState.sampleRate = audioContext.sampleRate;
    recorderState.durationMs = 0;
    recorderState.waveformPeaks = [];
```

Add the spectrum reset at the end of that block:
```js
    recorderState.isRecording = true;
    recorderState.autoStopQueued = false;
    recorderState.pcmChunks = [];
    recorderState.totalSamples = 0;
    recorderState.sampleRate = audioContext.sampleRate;
    recorderState.durationMs = 0;
    recorderState.waveformPeaks = [];
    recorderState.spectrumSmoothed = new Float32Array(RECORDER_SPECTRUM_POINTS);
    recorderState.spectrumFreqBuffer = analyserNode
      ? new Uint8Array(analyserNode.frequencyBinCount)
      : null;
```

- [ ] **Step 4: Verify the page still loads without errors**

Open `test.html` in a browser. Open devtools console — no errors expected. Start and stop recording — no errors expected.

- [ ] **Step 5: Commit**

```bash
git add test.html
git commit -m "feat: add spectrum state fields to recorderState"
```

---

### Task 2: Replace recording branch with live spectrum line

**Files:**
- Modify: `test.html` — `drawRecorderTimeline()` function (~line 6869)

- [ ] **Step 1: Replace the recording visual inside `drawRecorderTimeline`**

The current function draws a background, a center line, and then (inside `if (activeTotalMs > 0)`) draws the waveform peaks and playhead for both recording and playback states. We will split that block: when recording is active, draw the spectrum instead and return early; all other states fall through to the existing code unchanged.

Find the section starting at the background fill and running to the end of `drawRecorderTimeline` (around line 6885–6933):

```js
    ctx.fillStyle = "rgba(2,6,23,0.18)";
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const totalMs = recorderState.durationMs;
    const activeTotalMs = recorderState.isRecording ? Math.max(recorderState.durationMs, 1000) : totalMs;
    const midY = Math.round(displayHeight / 2);
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY + 0.5);
    ctx.lineTo(displayWidth, midY + 0.5);
    ctx.stroke();

    if (activeTotalMs > 0) {
      ctx.strokeStyle = "rgba(148,163,184,0.26)";
      ctx.lineWidth = 1;
      for (let tickMs = RECORDER_TIMELINE_TICK_MS; tickMs < activeTotalMs; tickMs += RECORDER_TIMELINE_TICK_MS) {
        const x = (tickMs / activeTotalMs) * displayWidth;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 2);
        ctx.lineTo(x + 0.5, displayHeight - 2);
        ctx.stroke();
      }

      const peaks = sampleRecorderWaveform(recorderState.waveformPeaks, Math.max(1, Math.floor(displayWidth / 2)));
      if (peaks.length) {
        ctx.strokeStyle = recorderState.isRecording ? "rgba(248,113,113,0.88)" : "rgba(248,250,252,0.82)";
        ctx.lineWidth = 1;
        peaks.forEach((peak, index) => {
          const normalized = Math.max(0.04, Math.min(1, peak || 0));
          const x = (index / Math.max(1, peaks.length - 1)) * displayWidth;
          const halfHeight = Math.max(1, normalized * (displayHeight * 0.42));
          ctx.beginPath();
          ctx.moveTo(x + 0.5, midY - halfHeight);
          ctx.lineTo(x + 0.5, midY + halfHeight);
          ctx.stroke();
        });
      }

      const cursorMs = recorderState.isRecording ? recorderState.durationMs : getRecorderCursorMs();
      const playheadX = Math.max(0, Math.min(displayWidth, (cursorMs / activeTotalMs) * displayWidth));
      ctx.strokeStyle = recorderState.isRecording ? "#ef4444" : "rgba(34,197,94,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX + 0.5, 0);
      ctx.lineTo(playheadX + 0.5, displayHeight);
      ctx.stroke();
    }
  }
```

Replace it with:

```js
    ctx.fillStyle = "rgba(2,6,23,0.18)";
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    if (recorderState.isRecording) {
      if (analyserNode && recorderState.spectrumFreqBuffer && recorderState.spectrumSmoothed) {
        analyserNode.getByteFrequencyData(recorderState.spectrumFreqBuffer);

        const binHz = sampleRate / analyserNode.fftSize;
        const logMin = Math.log(RECORDER_SPECTRUM_MIN_HZ);
        const logMax = Math.log(RECORDER_SPECTRUM_MAX_HZ);

        for (let i = 0; i < RECORDER_SPECTRUM_POINTS; i++) {
          const freq = Math.exp(logMin + (logMax - logMin) * (i / (RECORDER_SPECTRUM_POINTS - 1)));
          const bin = Math.min(analyserNode.frequencyBinCount - 1, Math.round(freq / binHz));
          const raw = recorderState.spectrumFreqBuffer[bin] / 255;
          recorderState.spectrumSmoothed[i] += (raw - recorderState.spectrumSmoothed[i]) * RECORDER_SPECTRUM_EMA_ALPHA;
        }

        const pts = [];
        for (let i = 0; i < RECORDER_SPECTRUM_POINTS; i++) {
          pts.push({
            x: (i / (RECORDER_SPECTRUM_POINTS - 1)) * displayWidth,
            y: displayHeight - 1 - recorderState.spectrumSmoothed[i] * (displayHeight - 2),
          });
        }

        ctx.strokeStyle = "rgba(248,113,113,0.88)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }

      // Self-sustain at ~60fps while recording
      queueRecorderTimelineDraw();
      return;
    }

    const totalMs = recorderState.durationMs;
    const activeTotalMs = totalMs;
    const midY = Math.round(displayHeight / 2);
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY + 0.5);
    ctx.lineTo(displayWidth, midY + 0.5);
    ctx.stroke();

    if (activeTotalMs > 0) {
      ctx.strokeStyle = "rgba(148,163,184,0.26)";
      ctx.lineWidth = 1;
      for (let tickMs = RECORDER_TIMELINE_TICK_MS; tickMs < activeTotalMs; tickMs += RECORDER_TIMELINE_TICK_MS) {
        const x = (tickMs / activeTotalMs) * displayWidth;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 2);
        ctx.lineTo(x + 0.5, displayHeight - 2);
        ctx.stroke();
      }

      const peaks = sampleRecorderWaveform(recorderState.waveformPeaks, Math.max(1, Math.floor(displayWidth / 2)));
      if (peaks.length) {
        ctx.strokeStyle = "rgba(248,250,252,0.82)";
        ctx.lineWidth = 1;
        peaks.forEach((peak, index) => {
          const normalized = Math.max(0.04, Math.min(1, peak || 0));
          const x = (index / Math.max(1, peaks.length - 1)) * displayWidth;
          const halfHeight = Math.max(1, normalized * (displayHeight * 0.42));
          ctx.beginPath();
          ctx.moveTo(x + 0.5, midY - halfHeight);
          ctx.lineTo(x + 0.5, midY + halfHeight);
          ctx.stroke();
        });
      }

      const playheadX = Math.max(0, Math.min(displayWidth, (getRecorderCursorMs() / activeTotalMs) * displayWidth));
      ctx.strokeStyle = "rgba(34,197,94,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX + 0.5, 0);
      ctx.lineTo(playheadX + 0.5, displayHeight);
      ctx.stroke();
    }
  }
```

- [ ] **Step 2: Verify spectrum in browser**

Open `test.html`. Open the recorder (click launcher or press Z). Start recording by pressing Z or clicking the record button. Confirm:
- The spectrum line appears — a smooth red curve flowing left (low freq) to right (high freq)
- The line responds to audio input (hum or speak into the mic)
- After stopping recording, the canvas switches to the white waveform + green playhead (or empty state)
- No console errors

- [ ] **Step 3: Commit**

```bash
git add test.html
git commit -m "feat: replace recorder waveform with live spectrum line during recording"
```
