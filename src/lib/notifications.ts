"use client";

// Per-device notification preferences (localStorage) plus the actual alert:
// a short tone generated with Web Audio (no audio file) and, when the tab is
// hidden and the user allowed it, a desktop notification.

export type NotificationPrefs = { sound: boolean; desktop: boolean };

const KEY = "chat:notifications";
const DEFAULTS: NotificationPrefs = { sound: true, desktop: false };

export function readPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return DEFAULTS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULTS;
    }
    return {
      sound: "sound" in parsed ? parsed.sound === true : DEFAULTS.sound,
      desktop: "desktop" in parsed ? parsed.desktop === true : DEFAULTS.desktop,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writePrefs(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked (private mode): preferences just won't persist.
  }
}

let audio: AudioContext | undefined;

/** Browsers keep audio suspended until the page gets a click or key press. */
export function unlockAudioOnGesture() {
  const unlock = () => {
    try {
      audio ??= new AudioContext();
      void audio.resume();
    } catch {
      // No Web Audio support: messages still show in the UI.
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

// Two-note chime (E5 -> A5): soft attack, long fade.
const CHIME = [
  { frequency: 659.25, start: 0, length: 0.45 },
  { frequency: 880, start: 0.14, length: 0.6 },
];

function playNote(ctx: AudioContext, note: (typeof CHIME)[number]) {
  const at = ctx.currentTime + note.start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = note.frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + note.length + 0.02);
}

function playTone() {
  try {
    audio ??= new AudioContext();
    for (const note of CHIME) {
      playNote(audio, note);
    }
  } catch {
    // Autoplay restrictions: the badge and title still show the message.
  }
}

export function notify(message: { title: string; body: string; url: string }) {
  const prefs = readPrefs();
  if (prefs.sound) {
    playTone();
  }
  if (
    prefs.desktop &&
    document.hidden &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const n = new Notification(message.title, {
      body: message.body.slice(0, 140),
      tag: message.url,
    });
    n.addEventListener("click", () => {
      window.focus();
      window.location.assign(message.url);
    });
  }
}
