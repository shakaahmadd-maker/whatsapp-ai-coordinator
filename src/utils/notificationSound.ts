// Web Audio API notification chime (zero external audio asset dependencies)

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function unlockNotificationAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      // Browser may still require a direct click gesture
    });
  }
}

export function playIncomingNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const triggerChime = () => {
    const now = ctx.currentTime;

    // Pleasant two-note WhatsApp-style pop chime (G5 -> C6)
    const notes = [
      { freq: 783.99, start: now, duration: 0.14, peak: 0.18 },
      { freq: 1046.5, start: now + 0.11, duration: 0.22, peak: 0.2 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, note.start);

      gain.gain.setValueAtTime(0.0001, note.start);
      gain.gain.exponentialRampToValueAtTime(note.peak, note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, note.start + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(note.start);
      osc.stop(note.start + note.duration + 0.02);
    }
  };

  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(triggerChime)
      .catch(() => {
        // Ignore if autoplay blocked prior to user interaction
      });
  } else {
    triggerChime();
  }
}
