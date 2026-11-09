import { Platform, Vibration } from 'react-native';

/**
 * Plays an audible notification chime and vibrates the device
 * Works across Web (via Web Audio API) and Native (iOS / Android vibration).
 */
export function playNotificationChime() {
  try {
    // 1. Mobile Device Vibration (Android / iOS)
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 200, 100, 250]);
    }

    // 2. Web Audio API chime on Web / Desktop
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Elegant double-tone chime (F#5 -> B5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(739.99, now); // F#5
        osc.frequency.setValueAtTime(987.77, now + 0.12); // B5

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
      }
    }
  } catch {
    // Audio context may be restricted before first user interaction
  }
}
