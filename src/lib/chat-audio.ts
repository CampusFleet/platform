/**
 * Web Audio API Notification Sound Engine
 * Synthesizes crisp, ultra-low latency notification chimes without external mp3 downloads.
 * Works seamlessly across mobile browsers, desktop, and offline PWAs.
 */

export const NOTIFICATION_TONES = [
  "Soft ping",
  "Classic",
  "Chime",
  "Pop",
  "Digital",
  "Subtle",
] as const;

export type NotificationToneName = (typeof NOTIFICATION_TONES)[number];

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playNotificationTone(
  tone: string = "Classic",
  volume: number = 0.6
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.min(Math.max(volume, 0), 1), now);
    masterGain.connect(ctx.destination);

    switch (tone) {
      case "Soft ping": {
        // High, pure gentle sine ping (880Hz - A5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.28);
        break;
      }

      case "Classic": {
        // Two-tone rising harmonic chime: D5 (587Hz) -> A5 (880Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.12);

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, now + 0.07);
        gain2.gain.setValueAtTime(0.4, now + 0.07);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(now + 0.07);
        osc2.stop(now + 0.32);
        break;
      }

      case "Chime": {
        // Tri-tone glass bell chord (C5 - E5 - G5)
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + idx * 0.06;
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(start);
          osc.stop(start + 0.35);
        });
        break;
      }

      case "Pop": {
        // Quick bubble pitch drop (480Hz -> 120Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }

      case "Digital": {
        // Fast dual electronic blip
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = "square";
        osc1.frequency.setValueAtTime(920, now);
        gain1.gain.setValueAtTime(0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.05);

        osc2.type = "square";
        osc2.frequency.setValueAtTime(1380, now + 0.06);
        gain2.gain.setValueAtTime(0.2, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(now + 0.06);
        osc2.stop(now + 0.14);
        break;
      }

      case "Subtle": {
        // Mellow warm frequency (440Hz) with gentle lowpass
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(600, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.22);
        break;
      }

      default: {
        // Fallback to Classic
        playNotificationTone("Classic", volume);
      }
    }
  } catch (err) {
    // Silently suppress audio failures on locked user agent policy
  }
}
