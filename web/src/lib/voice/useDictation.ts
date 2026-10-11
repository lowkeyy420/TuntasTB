"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTE_MAX } from "@/lib/checkin/schema";

/**
 * Browser speech recognition into the note field (Bahasa Indonesia).
 *
 * Only text is produced: no audio is recorded, stored or uploaded by this app.
 * (On Chrome for Android the browser vendor's speech service does the
 * recognition, which is why the screen tells people not to say names or
 * addresses; our redaction runs on the server, after the text arrives.)
 */

export const DICTATION_LANG = "id-ID";

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  results: { readonly length: number; [index: number]: RecognitionResult };
}
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

/** The browser's recognition constructor, or null when the device has none. */
export function speechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Joins what was already typed with the transcript so far, within the note limit. */
export function joinNote(base: string, transcript: string): string {
  const spoken = transcript.trim();
  const head = base.trimEnd();
  return (head === "" ? spoken : spoken === "" ? head : `${head} ${spoken}`).slice(0, NOTE_MAX);
}

/**
 * `null` while the device cannot do it (the microphone button is then not
 * rendered at all); otherwise the state and toggle for the button. Interim and
 * final transcripts are written into the note as they arrive.
 */
export function useDictation(note: string, setNote: (value: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const base = useRef("");
  const latestNote = useRef(note);

  useEffect(() => {
    latestNote.current = note;
  }, [note]);

  // Detected after mount so server and first client render agree.
  useEffect(() => {
    setSupported(speechRecognitionCtor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const toggle = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = DICTATION_LANG;
    rec.interimResults = true;
    rec.continuous = false;
    base.current = latestNote.current;
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) transcript += `${event.results[i][0].transcript} `;
      setNote(joinNote(base.current, transcript));
    };
    const finish = () => {
      recognition.current = null;
      setListening(false);
    };
    rec.onend = finish;
    rec.onerror = finish;
    recognition.current = rec;
    setListening(true);
    rec.start();
  }, [setNote]);

  return supported ? { listening, toggle } : null;
}
