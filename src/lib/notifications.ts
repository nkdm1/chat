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

function playTone() {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.26);
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
