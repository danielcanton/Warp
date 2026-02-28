import type { WaveformData } from "./waveform";

/**
 * Audio engine for gravitational wave sonification.
 *
 * The buffer duration exactly matches the waveform's visual duration so
 * that `AudioBufferSourceNode.playbackRate` keeps audio and visuals in
 * lockstep at any speed.
 *
 * We reconstruct an audible chirp by tracking the instantaneous frequency
 * and amplitude of h+(t) and synthesising a sine wave that sweeps through
 * the same frequency profile — but shifted into a comfortable hearing range.
 */
export class GWAudioEngine {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private _isPlaying = false;

  get isPlaying() {
    return this._isPlaying;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Build an AudioBuffer whose real-time duration equals the waveform's
   * visual duration.
   *
   * Approach: we extract the instantaneous amplitude envelope and phase
   * velocity from h+(t), then re-synthesise a sine wave whose frequency
   * is scaled into the 120–800 Hz range for audibility.
   */
  private buildBuffer(waveform: WaveformData): AudioBuffer {
    const ctx = this.ensureContext();
    const sr = ctx.sampleRate; // typically 44100 or 48000
    const bufferLen = Math.max(1, Math.floor(waveform.duration * sr));
    const buffer = ctx.createBuffer(1, bufferLen, sr);
    const out = buffer.getChannelData(0);

    const srcLen = waveform.hPlus.length;
    const hp = waveform.hPlus;
    const hc = waveform.hCross;

    // Pre-compute instantaneous amplitude envelope at waveform sample rate
    const ampEnv = new Float32Array(srcLen);
    for (let i = 0; i < srcLen; i++) {
      ampEnv[i] = Math.sqrt(hp[i] * hp[i] + hc[i] * hc[i]);
    }

    // Pre-compute instantaneous frequency at waveform sample rate
    // freq[i] = (1/2π) * d(phase)/dt where phase = atan2(hCross, hPlus)
    const instFreq = new Float32Array(srcLen);
    for (let i = 1; i < srcLen; i++) {
      const phase0 = Math.atan2(hc[i - 1], hp[i - 1]);
      const phase1 = Math.atan2(hc[i], hp[i]);
      let dPhase = phase1 - phase0;
      // Unwrap phase jumps
      if (dPhase > Math.PI) dPhase -= 2 * Math.PI;
      if (dPhase < -Math.PI) dPhase += 2 * Math.PI;
      instFreq[i] = Math.abs(dPhase * waveform.sampleRate / (2 * Math.PI));
    }
    instFreq[0] = instFreq[1];

    // Smooth the frequency estimate (5-sample moving average)
    const smoothFreq = new Float32Array(srcLen);
    for (let i = 0; i < srcLen; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(srcLen - 1, i + 2); j++) {
        sum += instFreq[j];
        count++;
      }
      smoothFreq[i] = sum / count;
    }

    // Find the peak frequency to set our scaling
    let maxFreq = 0;
    for (let i = 0; i < srcLen; i++) {
      if (smoothFreq[i] > maxFreq) maxFreq = smoothFreq[i];
    }
    // Scale so peak frequency maps to ~600 Hz (clearer on mobile speakers)
    const freqScale = maxFreq > 0 ? 600 / maxFreq : 1;
    // Ensure minimum frequency is at least ~120 Hz (mobile speaker friendly)
    const minTarget = 120;

    // Synthesise the audio chirp
    let phase = 0;
    for (let i = 0; i < bufferLen; i++) {
      // Map audio sample to waveform sample (linear interpolation)
      const tNorm = i / bufferLen;
      const srcFloat = tNorm * (srcLen - 1);
      const idx0 = Math.floor(srcFloat);
      const idx1 = Math.min(idx0 + 1, srcLen - 1);
      const frac = srcFloat - idx0;

      // Interpolated amplitude
      const amp = ampEnv[idx0] * (1 - frac) + ampEnv[idx1] * frac;

      // Interpolated frequency, scaled to audible range
      const rawFreq = smoothFreq[idx0] * (1 - frac) + smoothFreq[idx1] * frac;
      const freq = Math.max(rawFreq * freqScale, minTarget * amp);

      // Accumulate phase for continuous sine wave
      phase += (2 * Math.PI * freq) / sr;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

      const sample = amp * Math.sin(phase);

      // Fade in/out envelope (20ms) to avoid clicks
      const fadeLen = sr * 0.02;
      const envIn = Math.min(i / fadeLen, 1.0);
      const envOut = Math.min((bufferLen - i) / fadeLen, 1.0);

      out[i] = sample * Math.min(envIn, envOut) * 0.55;
    }

    return buffer;
  }

  /** Prepare the audio buffer for a waveform. Call when switching events. */
  prepare(waveform: WaveformData) {
    this.stop();
    this.buffer = this.buildBuffer(waveform);
  }

  /**
   * Start playback at the given visual position and speed.
   * @param normalizedTime - visual playback position [0, 1]
   * @param speed - playback speed multiplier
   */
  play(normalizedTime: number, speed: number) {
    this.stop();
    if (!this.buffer) return;

    const ctx = this.ensureContext();

    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = speed;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.5;

    // High-pass filter to clean up muddy bass on mobile speakers
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = "highpass";
    hpFilter.frequency.value = 120;
    hpFilter.Q.value = 0.7;

    // Light compressor to tame peaks on small speakers
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    this.source.connect(hpFilter);
    hpFilter.connect(compressor);
    compressor.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);

    const offset = normalizedTime * this.buffer.duration;
    this.source.start(0, offset);
    this._isPlaying = true;

    this.source.onended = () => {
      this._isPlaying = false;
    };
  }

  /** Update speed without restarting. The browser smoothly ramps the rate. */
  setSpeed(speed: number) {
    if (this.source && this._isPlaying) {
      this.source.playbackRate.value = speed;
    }
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    this._isPlaying = false;
  }

  setVolume(v: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, v));
    }
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
