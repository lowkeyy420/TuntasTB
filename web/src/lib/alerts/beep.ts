"use client";

/**
 * A short two-tone beep for a new RED alert. No spoken words, so a speaker in a
 * shared room reveals nothing. Browsers only allow sound after the first user
 * interaction, so the audio context is created on the first click, tap or key
 * press; a beep before that is silently skipped.
 */
export interface Beeper {
  /** Starts listening for the first interaction. Returns a function that stops listening. */
  arm: () => () => void;
  beep: () => void;
}

type AudioCtor = typeof AudioContext;

export function createBeeper(win: Window | undefined = typeof window === "undefined" ? undefined : window): Beeper {
  let ctx: AudioContext | null = null;

  const Ctor = (): AudioCtor | undefined =>
    win ? ((win as unknown as { AudioContext?: AudioCtor }).AudioContext ?? undefined) : undefined;

  const unlock = () => {
    const C = Ctor();
    if (!ctx && C) {
      try {
        ctx = new C();
      } catch {
        ctx = null;
      }
    }
    void ctx?.resume?.();
  };

  return {
    arm() {
      if (!win) return () => undefined;
      const events = ["pointerdown", "keydown"] as const;
      const handler = () => {
        unlock();
        for (const e of events) win.removeEventListener(e, handler);
      };
      for (const e of events) win.addEventListener(e, handler);
      return () => {
        for (const e of events) win.removeEventListener(e, handler);
      };
    },
    beep() {
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      for (const [i, freq] of [880, 660].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.22);
        osc.stop(now + i * 0.22 + 0.21);
      }
    },
  };
}
