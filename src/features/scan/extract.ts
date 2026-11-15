// ============================================================================
// Reads the text of one solicitation letter and guesses the transmittal fields.
// Every guess gets a confidence so the review screen can highlight what to check.
// Pure functions (no browser / database) so they can be unit-tested.
// ============================================================================
import { iso } from '@/lib/dates';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface Guess {
  value: string;
  confidence: Confidence;
}

export interface Extracted {
  name: Guess; // requesting person (signature block)
  organization: Guess;
  barangay: Guess;
  request: Guess;
  purpose: Guess;
  dateReceived: Guess; // yyyy-mm-dd (date written on the letter)
  eventDate: Guess; // free text, e.g. "December 20, 2026"
  contact: Guess;
  diagnosis: Guess; // medical letters
}

const none: Guess = { value: '', confidence: 'none' };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/** Lower-case, no accents, Brgy./Sta./Sto./St. spelled out, Arabic 1–5 → I–V, single spaces. */
export function norm(s: string): string {
  return ` ${s} `
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/​/g, '')
    .replace(/\bbrgy\.?\s*/g, 'barangay ')
    .replace(/\bsta\.?\s/g, 'santa ')
    .replace(/\bsto\.?\s/g, 'santo ')
    .replace(/\bst\.\s/g, 'saint ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/ (\d)\b/g, (_, d: string) => ' ' + (['', 'i', 'ii', 'iii', 'iv', 'v'][Number(d)] || d))
    .replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------- dates

interface FoundDate {
  iso: string;
  text: string;
  index: number; // position in the text
}

export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  const add = (y: number, m: number, d: number, t: string, index: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return;
    out.push({ iso: iso(y, m, d), text: t.trim(), index });
  };
  // November 20, 2026 · Nov. 20 2026 · Nov 20-21, 2026
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi'))) {
    add(Number(m[3]), MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))) + 1, Number(m[2]), m[0], m.index ?? 0);
  }
  // 20 November 2026
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?,?\\s+(\\d{4})`, 'gi'))) {
    add(Number(m[3]), MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3))) + 1, Number(m[1]), m[0], m.index ?? 0);
  }
  // 11/20/2026 · 11-20-26
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    add(y, Number(m[1]), Number(m[2]), m[0], m.index ?? 0);
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- contact

export function findContact(text: string): Guess {
  const m = text.match(/(?:\+?\s*63|0)\s*9\d{2}[\s.-]*\d{3}[\s.-]*\d{4}/);
  if (!m) return none;
  return { value: m[0].replace(/\D/g, '').replace(/^63/, '0'), confidence: 'high' };
}

// ---------------------------------------------------------------- directory matches

/** Longest list entry that appears in the text (word-boundary match after normalizing). */
export function bestListMatch(text: string, list: string[]): { value: string; at: number } | null {
  const t = norm(text);
  let best: { value: string; at: number; len: number } | null = null;
  for (const item of list) {
    const n = norm(item).trim();
    if (n.length < 3) continue;
    const at = t.indexOf(` ${n} `);
    if (at >= 0 && (!best || n.length > best.len)) best = { value: item, at, len: n.length };
  }
  return best ? { value: best.value, at: best.at } : null;
}

export function findBarangay(text: string, barangays: string[]): Guess {
  const m = bestListMatch(text, barangays);
  if (!m) return none;
  // "Barangay Salitran II" / "Brgy. Salitran II" is a strong sign.
  const strong = norm(text).includes(`barangay ${norm(m.value).trim()}`);
  return { value: m.value, confidence: strong ? 'high' : 'medium' };
}

const ORG_WORDS =
  /\b(association|assoc\.?|federation|club|council|chapter|organization|org\.?|inc\.?|hoa|homeowners?|youth|senior citizens?|pwd|solo parents?|fraternity|sorority|church|ministry|ministries|school|alumni|brotherhood|eagles|tau gamma|guardians|kbdm|cooperative|coop|foundation|league|network|movement|parish|society|union|group)\b/i;

export function findOrganization(text: string, orgs: string[]): Guess {
  const m = bestListMatch(text, orgs);
  if (m) return { value: m.value, confidence: 'high' };
  const line = text
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => ORG_WORDS.test(l) && l.length <= 220 && !/^(dear|hon|sir|madam|good|respectfully|sincerely)/i.test(l));
  if (!line) return none;
  // Keep only the name part: "Greetings! The KBDM Chapter of Brgy. Salitran II will hold…" → "KBDM Chapter"
  const phrase = line.match(
    /((?:[A-Z0-9][\w'’.&-]*\s+){0,6}?(?:[A-Z][\w'’.&-]*\s+)*(?:Association|Assoc\.?|Federation|Club|Council|Chapter|Organization|Inc\.?|HOA|Homeowners?|Youth|Senior Citizens?|PWD|Solo Parents?|Fraternity|Sorority|Church|Ministry|Ministries|School|Alumni|Brotherhood|Eagles|Tau Gamma(?: Phi)?|Guardians|KBDM|Cooperative|Foundation|League|Network|Movement|Parish|Society|Union|Group)\b(?:\s+(?:Chapter|Association|Federation|Club|Council|Organization|Alumni|Youth|Group))*(?:,?\s+Inc\.?)?)/,
  );
  const value = (phrase ? phrase[1] : line)
    .replace(/^(?:greetings[!,.]?\s*)?(?:the|ang|kami ng|we,? the)\s+/i, '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.)]+$/g, '')
    .trim();
  return { value, confidence: phrase ? 'medium' : 'low' };
}

// ---------------------------------------------------------------- name (signature block)

const CLOSINGS = /^(respectfully(\s+yours)?|sincerely(\s+yours)?|very truly yours|truly yours|yours truly|thank you|thank you( and)? god bless|god bless|more power|maraming salamat|lubos na gumagalang|gumagalang)[,.!]*$/i;
const NOT_A_NAME = /\b(barangay|brgy|city|dasmari|cavite|president|chairman|chairperson|secretary|treasurer|officer|adviser|noted|approved|received|street|subdivision|phase|block|lot|contact|tel|cell|mobile|email|date|the|of|and|for|to)\b|\d/i;

export function looksLikeName(line: string): boolean {
  const l = line.trim().replace(/\s+/g, ' ');
  if (l.length < 5 || l.length > 45 || NOT_A_NAME.test(l)) return false;
  const words = l.split(' ');
  if (words.length < 2 || words.length > 6) return false;
  // Every word starts with a capital (Juan Dela Cruz / JUAN DELA CRUZ / Ma. Clara D. Santos)
  return words.every((w) => /^[A-ZÑ][A-Za-zñÑ.'-]*$/.test(w));
}

export function findName(text: string): Guess {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  // 1) the line(s) after a closing ("Respectfully yours,")
  for (let i = lines.length - 1; i >= 0; i--) {
    if (CLOSINGS.test(lines[i])) {
      for (const l of lines.slice(i + 1, i + 5)) if (looksLikeName(l)) return { value: tidyName(l), confidence: 'medium' };
    }
  }
  // 2) "Name: ..." / "Requested by: ..."
  const m = text.match(/\b(?:name|requested by|requestor|solicitor|contact person)\s*[:\-]\s*([^\n]{4,45})/i);
  if (m && looksLikeName(m[1])) return { value: tidyName(m[1]), confidence: 'medium' };
  // 3) the last name-like line of the letter (signatures are at the bottom)
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12); i--) if (looksLikeName(lines[i])) return { value: tidyName(lines[i]), confidence: 'low' };
  return none;
}

/** JUAN DELA CRUZ → Juan Dela Cruz (keeps initials like "D."). */
export function tidyName(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------- request / purpose / diagnosis

export function findRequest(text: string): Guess {
  const t = text.toLowerCase();
  const raffle = /\braffle/.test(t);
  const cash = /\b(cash|monetary|financial (assistance|support|aid|help)|pondo|halaga)\b/.test(t);
  const kind = /\bin[- ]?kind\b|\bdonation of\b|\bitems?\b.*\bdonat/.test(t);
  const food = /\b(food|snacks|groceries|grocery)\b/.test(t);
  let value = '';
  if (raffle && cash) value = 'Cash/Raffle';
  else if (raffle) value = 'Raffle';
  else if (cash && kind) value = 'Cash/In-Kind';
  else if (/financial (assistance|support|aid)/.test(t)) value = 'Financial Assistance';
  else if (cash) value = 'Cash';
  else if (kind) value = 'In-Kind';
  else if (food) value = 'Food';
  else if (/\b(any (kind of )?(form of )?(assistance|support|help))\b/.test(t)) value = 'Any kind of assistance';
  return value ? { value, confidence: 'medium' } : none;
}

const PURPOSE_RULES: [RegExp, string][] = [
  [/christmas|pasko|yuletide/i, 'Christmas Party'],
  [/sports?\s*fest|\bliga\b|league|tournament|basketball|volleyball|palaro/i, 'Sports Fest / Liga'],
  [/anniversary|founding/i, 'Anniversary'],
  [/fiesta|kapistahan/i, 'Fiesta'],
  [/outreach|feeding|gift.?giving/i, 'Outreach Program'],
  [/medical mission/i, 'Medical Mission'],
  [/fire|calamity|typhoon|flood|emergency|nasunog|sunog/i, 'Emergency Assistance'],
  [/seminar|training|workshop|orientation/i, 'Seminar / Training'],
];

const MEDICAL_RULES: [RegExp, string][] = [
  [/maintenance/i, 'For Maintenance'],
  [/hospital bill|billing|hospital expenses|bill\b/i, 'For Hospital Bill'],
  [/operation|surgery|surgical/i, 'For Operation'],
  [/therapy|treatment|dialysis|chemo/i, 'For Treatment/Therapy'],
  [/laboratory|lab test|x-?ray|ct.?scan|mri|ultrasound|ecg/i, 'For Laboratory'],
  [/medicine|medicines|gamot|prescription/i, 'For Medicine'],
];

export function findPurpose(text: string, medical: boolean): Guess {
  for (const [re, v] of medical ? MEDICAL_RULES : PURPOSE_RULES) if (re.test(text)) return { value: v, confidence: 'medium' };
  return none;
}

export function findDiagnosis(text: string): Guess {
  const m = text.match(/\b(?:diagnosed with|diagnosis|dx|suffering from|confined (?:due to|for)|ill with)\s*[:\-]?\s*([^\n.;]{3,80})/i);
  return m ? { value: m[1].trim().replace(/[,]+$/, ''), confidence: 'low' } : none;
}

// ---------------------------------------------------------------- whole letter

export function extractLetter(text: string, ctx: { barangays: string[]; orgs: string[]; medical: boolean }): Extracted {
  const clean = text.replace(/​/g, '').replace(/\r/g, '');
  const dates = findDates(clean);
  // The letter date is usually near the top; the event date follows words like "on" / "to be held".
  const topLimit = clean.length * 0.35;
  const letterDate = dates.find((d) => d.index <= topLimit);
  const eventDate =
    dates.find((d) => /\b(on|held|scheduled|happen|celebrat|gaganapin|sa darating na)\b[^\n]{0,40}$/i.test(clean.slice(Math.max(0, d.index - 50), d.index))) ??
    dates.find((d) => d !== letterDate && d.iso >= (letterDate?.iso ?? ''));

  return {
    name: findName(clean),
    organization: findOrganization(clean, ctx.orgs),
    barangay: findBarangay(clean, ctx.barangays),
    request: findRequest(clean),
    purpose: findPurpose(clean, ctx.medical),
    dateReceived: letterDate ? { value: letterDate.iso, confidence: 'medium' } : none,
    eventDate: eventDate ? { value: eventDate.text.replace(/\s+/g, ' '), confidence: 'low' } : none,
    contact: findContact(clean),
    diagnosis: ctx.medical ? findDiagnosis(clean) : none,
  };
}

// ---------------------------------------------------------------- splitting pages into letters

const OPENING = /\b(dear|honorable|hon\.|greetings|good day|magandang araw|sir\s*\/\s*madam|to whom it may concern)\b/i;
const CLOSING_ANY = /\b(respectfully|sincerely|truly yours|thank you|god bless|maraming salamat|gumagalang)\b/i;

/**
 * Decides which pages belong together: a page starts a new letter when it has a greeting or a date
 * near its top, or when the previous page already ended with a closing.
 */
export function splitPages(pages: string[]): number[][] {
  const groups: number[][] = [];
  pages.forEach((p, i) => {
    const head = p.slice(0, Math.max(200, p.length * 0.3));
    const prev = i > 0 ? pages[i - 1] : '';
    const prevTail = prev.slice(-Math.max(250, prev.length * 0.35));
    const startsNew = i === 0 || OPENING.test(head) || findDates(head).length > 0 || CLOSING_ANY.test(prevTail) || !p.trim();
    if (startsNew || !groups.length) groups.push([i]);
    else groups[groups.length - 1].push(i);
  });
  return groups;
}
