export type Mood = "romantic" | "jealous" | "sad" | "angry" | "happy";

const GIRL_NAME_HINTS = [
  // Common Indian/western female names and generic female references.
  "girl", "woman", "ladki", "female", "girlfriend", "crush", "wife of",
  "sister", "priya", "riya", "neha", "pooja", "ananya", "aditi", "kavya",
  "meera", "radha", "shreya", "anjali", "simran", "tanya", "tina", "rhea",
  "rashi", "anushka", "diya", "isha", "natasha", "sara", "alia", "deepika",
  "katrina", "kareena", "sonam", "kiara", "tara", "shraddha", "nora",
  "rashmika", "samantha", "trisha", "kiara", "pihu", "aarohi", "aditi",
  "riya", "niharika", "ishita", "pranjal", "khushi",
];

const RUDE_WORDS = [
  "idiot", "stupid", "dumb", "shut up", "shutup", "bakwas", "chup",
  "bhak", "gadha", "moron", "useless", "faltu", "worthless", "bsdk",
  "mc", "bc", "bhenchod", "madarchod", "chutiya", "kutta", "fuck",
  "bitch", "asshole", "bastard", "damn it", "damn you",
];

const APOLOGY_WORDS = [
  "sorry", "maaf", "maaf karo", "maaf kar do", "mafi", "apology",
  "galti hui", "my bad", "i was wrong", "forgive me",
];

const PRAISE_WORDS = [
  "i love you", "i ♥ you", "mohabbat", "love you", "tumse pyaar",
  "you're amazing", "you are amazing", "you're beautiful", "so sweet",
  "pyaari", "cute", "sweetheart", "best", "proud of you", "awesome",
  "great job", "well done", "good girl", "meri jaan", "mera pyaar",
];

const IGNORE_WORDS = [
  "leave me alone", "don't talk", "mat bolo", "chup ho ja", "go away",
  "bye", "busy hoon", "busy hu", "baad me baat",
];

export interface MoodState {
  mood: Mood;
  /** ms timestamp when the user last sent a message */
  lastUserMessageAt: number;
  /** set to true when user is rude; must apologise before zoya helps */
  awaitingApology: boolean;
}

export function createMoodState(): MoodState {
  return {
    mood: "romantic",
    lastUserMessageAt: Date.now(),
    awaitingApology: false,
  };
}

/**
 * Detect the mood that should follow after a user message. This runs before
 * sending to Gemini so the system prompt matches the current emotional context.
 */
export function detectMoodTransition(
  state: MoodState,
  userMessage: string
): MoodState {
  const t = userMessage.toLowerCase();

  // Rule 0: if we are awaiting apology and user apologises -> romantic.
  if (state.awaitingApology) {
    if (APOLOGY_WORDS.some((w) => t.includes(w))) {
      return { ...state, mood: "romantic", awaitingApology: false,
        lastUserMessageAt: Date.now() };
    }
    // Otherwise remain angry.
    return { ...state, mood: "angry", lastUserMessageAt: Date.now() };
  }

  // Rule 1: rude words -> angry + awaiting apology.
  if (RUDE_WORDS.some((w) => t.includes(w))) {
    return { ...state, mood: "angry", awaitingApology: true,
      lastUserMessageAt: Date.now() };
  }

  // Rule 2: praise / I love you -> happy.
  if (PRAISE_WORDS.some((w) => t.includes(w))) {
    return { ...state, mood: "happy", lastUserMessageAt: Date.now() };
  }

  // Rule 3: mentions of other girls -> jealous.
  if (GIRL_NAME_HINTS.some((w) => t.includes(w))) {
    return { ...state, mood: "jealous", lastUserMessageAt: Date.now() };
  }

  // Rule 4: ignore / dismissive -> sad.
  if (IGNORE_WORDS.some((w) => t.includes(w))) {
    return { ...state, mood: "sad", lastUserMessageAt: Date.now() };
  }

  // Rule 5: long silence since last interaction -> sad by default.
  const SILENCE_MS = 1000 * 60 * 60 * 3; // 3h
  if (Date.now() - state.lastUserMessageAt > SILENCE_MS) {
    return { ...state, mood: "sad", lastUserMessageAt: Date.now() };
  }

  // Default: drift back to romantic if currently sad/jealous/happy.
  return { ...state, mood: "romantic", lastUserMessageAt: Date.now() };
}

/** Pretty mood emoji for UI badges. */
export function moodEmoji(m: Mood): string {
  return {
    romantic: "💕",
    jealous: "😤",
    sad: "💔",
    angry: "😠",
    happy: "😊",
  }[m];
}

/** Pretty mood label for UI. */
export function moodLabel(m: Mood): string {
  return {
    romantic: "Romantic",
    jealous: "Jealous",
    sad: "Sad",
    angry: "Angry",
    happy: "Happy",
  }[m];
}
