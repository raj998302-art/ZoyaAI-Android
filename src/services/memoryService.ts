/**
 * Zoya's memory. Stored client-side in localStorage so it persists across
 * sessions even when offline. The embedded Android bridge also mirrors
 * basic profile fields so native notifications can address the user by name.
 */

export interface ZoyaMemory {
  userName?: string;
  userNickname?: string;
  birthday?: string;        // YYYY-MM-DD
  anniversary?: string;     // YYYY-MM-DD
  favorites?: string[];     // e.g. ["coffee", "chess"]
  routine?: string;         // freeform
  importantContacts?: { name: string; phone?: string; relation?: string }[];
  facts?: string[];         // misc things zoya has "learned"
}

const KEY = "zoya.memory.v1";

export function loadMemory(): ZoyaMemory {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ZoyaMemory;
  } catch {
    return {};
  }
}

export function saveMemory(mem: ZoyaMemory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {}
  // mirror minimal profile to the native side for idle-notifications.
  const w = window as any;
  try {
    w?.Android?.setUserProfile?.(mem.userName || "", mem.userNickname || "");
  } catch {}
}

export function updateMemory(patch: Partial<ZoyaMemory>): ZoyaMemory {
  const cur = loadMemory();
  const next: ZoyaMemory = { ...cur, ...patch };
  saveMemory(next);
  return next;
}

export function addFact(fact: string): ZoyaMemory {
  const cur = loadMemory();
  const facts = [...(cur.facts || []), fact].slice(-200);
  return updateMemory({ facts });
}

export function addFavorite(fav: string): ZoyaMemory {
  const cur = loadMemory();
  const favorites = Array.from(new Set([...(cur.favorites || []), fav]));
  return updateMemory({ favorites });
}

export function addImportantContact(name: string, phone?: string, relation?: string): ZoyaMemory {
  const cur = loadMemory();
  const list = cur.importantContacts || [];
  const next = [...list.filter((c) => c.name.toLowerCase() !== name.toLowerCase()),
    { name, phone, relation }];
  return updateMemory({ importantContacts: next });
}

/**
 * Lightweight regex-based fact extractor. Runs on user messages so Zoya
 * gradually learns things like nickname, birthday, favourite food etc.
 * This is a best-effort heuristic — it never overwrites existing data.
 */
export function autoLearnFromMessage(msg: string): ZoyaMemory {
  const lower = msg.toLowerCase();
  const mem = loadMemory();
  const patch: Partial<ZoyaMemory> = {};

  const nameMatch = lower.match(/\bmy name is ([a-z][a-z\s]{1,30})/);
  if (nameMatch && !mem.userName) {
    patch.userName = capitalize(nameMatch[1].trim());
  }
  const nickMatch = lower.match(/\bcall me ([a-z][a-z\s]{1,30})/);
  if (nickMatch && !mem.userNickname) {
    patch.userNickname = capitalize(nickMatch[1].trim());
  }
  const bdayMatch = lower.match(/\bmy birthday is ([0-9a-z\s,]{3,30})/);
  if (bdayMatch && !mem.birthday) {
    patch.birthday = bdayMatch[1].trim();
  }
  const anniMatch = lower.match(/\b(our )?anniversary is ([0-9a-z\s,]{3,30})/);
  if (anniMatch && !mem.anniversary) {
    patch.anniversary = anniMatch[2].trim();
  }
  const favMatch = lower.match(/\bi (?:love|like)\s+([a-z][a-z\s]{1,30})/);
  if (favMatch) {
    const fav = favMatch[1].trim();
    if (fav && !["you", "u"].includes(fav)) {
      const cur = new Set(mem.favorites || []);
      cur.add(fav);
      patch.favorites = Array.from(cur).slice(-20);
    }
  }

  if (Object.keys(patch).length === 0) return mem;
  return updateMemory(patch);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
