/**
 * NLP Intent Parser – rule-based, server-side only.
 * Replaces parseIntentWithGemini() with no external LLM calls.
 * Supports Vietnamese + English queries.
 */

const MIN_RECOMMENDATIONS = 20;

export interface ParsedIntent {
  intent: "similar_song" | "mood_search" | "general_chat";
  songTitle?: string | null;
  artistName?: string | null;
  mood?: string | null;
  languageHint?: string | null;
  genreHint?: string | null;
  count: number;
}

// ──────────────────────────────────────────────
// Normalisation helpers
// ──────────────────────────────────────────────

function stripDiacritics(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function norm(text: string): string {
  return stripDiacritics(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ──────────────────────────────────────────────
// Mood keyword → label map
// ──────────────────────────────────────────────

const MOOD_KEYWORDS: { pattern: RegExp; mood: string }[] = [
  { pattern: /(soi dong|nang luong|nang dong|quay|party|workout|gym|tap luyen|the thao|manh|bung|khi the)/, mood: "energetic" },
  { pattern: /(buon|sad|suy|tam trang|mua|nuoc mat|co don|nho|da cam|melancholic)/, mood: "sad" },
  { pattern: /(chill|thu gian|nhe nhang|hoc|tap trung|study|focus|ambient|smooth|relax)/, mood: "chill" },
  { pattern: /(vui|happy|hanh phuc|yeu doi|phan khich|tung bung|vui ve|hao hung)/, mood: "happy" },
  { pattern: /(tinh yeu|love|romance|lang man|ngot ngao|tam su)/, mood: "romantic" },
  { pattern: /(cang thang|stress|tuc gian|manh me|rock|metal|harsh|dark)/, mood: "intense" },
  { pattern: /(ngu|sleep|ru ngu|dem|dream|lo fi|lo-fi)/, mood: "sleepy" },
];

// ──────────────────────────────────────────────
// Genre keyword → hint map
// ──────────────────────────────────────────────

const GENRE_KEYWORDS: { pattern: RegExp; genre: string }[] = [
  { pattern: /(nhac pop|pop\b)/, genre: "pop" },
  { pattern: /(nhac rock|rock\b)/, genre: "rock" },
  { pattern: /(nhac jazz|jazz\b)/, genre: "jazz" },
  { pattern: /(nhac hip hop|hip.?hop|rap\b)/, genre: "hip-hop" },
  { pattern: /(nhac edm|edm\b|electronic|dj\b)/, genre: "edm" },
  { pattern: /(nhac r&b|r&b\b|rnb\b)/, genre: "r-n-b" },
  { pattern: /(nhac classical|classical|co dien|classical music)/, genre: "classical" },
  { pattern: /(nhac latin|latin\b|salsa)/, genre: "latin" },
  { pattern: /(nhac country|country\b)/, genre: "country" },
  { pattern: /(nhac viet|nhac viet nam|v-pop|vpop)/, genre: "v-pop" },
  { pattern: /(k-pop|kpop|nhac han)/, genre: "k-pop" },
];

// ──────────────────────────────────────────────
// Similar-song trigger patterns
// ──────────────────────────────────────────────

const SIMILAR_TRIGGERS = /\b(giong|tuong tu|nhu bai|nhu ca khuc|similar to|like|same as|sounds like|in style of|kieu|phong cach)\b/;

// ──────────────────────────────────────────────
// Extract song title + optional artist name
// ──────────────────────────────────────────────

interface SongExtraction {
  songTitle: string;
  artistName: string | null;
}

const TRIGGER_PHRASES = [
  // 1. Vietnamese with diacritics (ordered by length)
  /tương tự như ca khúc/i,
  /tương tự như bài hát/i,
  /phong cách như bài/i,
  /tương tự ca khúc/i,
  /tương tự bài hát/i,
  /giống như ca khúc/i,
  /giống như bài hát/i,
  /tương tự như bài/i,
  /kiểu như bài/i,
  /phong cách như/i,
  /tương tự bài/i,
  /giống như bài/i,
  /giống ca khúc/i,
  /giống bài hát/i,
  /kiểu như/i,
  /tương tự như/i,
  /giống như/i,
  /phong cách/i,
  /tương tự/i,
  /giống bài/i,
  /giống/i,
  /kiểu/i,

  // 2. Vietnamese without diacritics (ordered by length)
  /tuong tu nhu ca khuc/i,
  /tuong tu nhu bai hat/i,
  /phong cach nhu bai/i,
  /tuong tu ca khuc/i,
  /tuong tu bai hat/i,
  /giong nhu ca khuc/i,
  /giong nhu bai hat/i,
  /tuong tu nhu bai/i,
  /kieu nhu bai/i,
  /phong cach nhu/i,
  /tuong tu bai/i,
  /giong nhu bai/i,
  /giong ca khuc/i,
  /giong bai hat/i,
  /kieu nhu/i,
  /tuong tu nhu/i,
  /giong nhu/i,
  /phong cach/i,
  /tuong tu/i,
  /giong bai/i,
  /giong/i,
  /kieu/i,

  // 3. English (ordered by length)
  /similar to the track/i,
  /similar to the song/i,
  /in the style of/i,
  /similar to track/i,
  /similar to song/i,
  /sounds like/i,
  /sound like/i,
  /in style of/i,
  /similar to/i,
  /same as/i,
  /like/i,
];

function extractSongAndArtist(raw: string): SongExtraction | null {
  let remainder = "";
  let matchedTrigger = false;

  for (const pattern of TRIGGER_PHRASES) {
    const match = raw.match(pattern);
    if (match && match.index !== undefined) {
      // Extract everything after the matched trigger phrase
      remainder = raw.slice(match.index + match[0].length);
      matchedTrigger = true;
      break;
    }
  }

  // Fallback: if no trigger matched, strip basic starting words and treat the rest as the song title
  if (!matchedTrigger) {
    remainder = raw
      .replace(/\b(tim|tìm|chon|cho toi|cho mình|hay|gioi thieu|de xuat|playlist|nhac)\b/gi, "")
      .trim();
  }

  // Trailing cleanup: strip trailing polite/question words like "không", "được không", "nhé", etc.
  const trailingCleanup = /\s+(duoc khong|được không|khong|không|nhe|nhé|nha|di|đi|gium|giùm|giup|giúp|dum|dùm|voi|với|ve|về)\s*[?!.]*$/i;
  remainder = remainder.replace(trailingCleanup, "").trim();

  // Strip punctuation at the end
  remainder = remainder.replace(/[?!.,;]+$/, "").trim();

  if (remainder.length < 2) {
    return null;
  }

  // Split by separators: "của", "by", "-"
  const separators = [
    /\s+(?:cua|của|by)\s+/i,
    /\s+-\s+/,
  ];

  for (const sep of separators) {
    const parts = remainder.split(sep);
    if (parts.length >= 2) {
      const songTitle = parts[0]?.trim();
      const artistName = parts.slice(1).join(" ").trim();
      if (songTitle && songTitle.length >= 2) {
        return { songTitle, artistName };
      }
    }
  }

  return { songTitle: remainder, artistName: null };
}

// ──────────────────────────────────────────────
// Count extraction  ("cho tôi 30 bài")
// ──────────────────────────────────────────────

function extractCount(text: string): number {
  const m = text.match(/(\d+)\s*(?:bai|bài|ca khuc|songs?|tracks?)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return Math.max(MIN_RECOMMENDATIONS, Math.min(50, n));
  }
  return MIN_RECOMMENDATIONS;
}

// ──────────────────────────────────────────────
// Language hint
// ──────────────────────────────────────────────

function detectLanguageHint(text: string): string | null {
  if (/\b(nhac viet|v.?pop|viet nam|tieng viet)\b/i.test(norm(text))) return "vi";
  if (/\b(nhac anh|english|tieng anh)\b/i.test(norm(text))) return "en";
  if (/\b(k.?pop|nhac han|tieng han|korean)\b/i.test(norm(text))) return "ko";
  if (/\b(nhac nhat|japanese|j.?pop)\b/i.test(norm(text))) return "ja";
  return null;
}

// ──────────────────────────────────────────────
// General-chat short-circuit patterns
// ──────────────────────────────────────────────

const GENERAL_CHAT_PATTERNS = [
  /\b(hello|hi|chào|xin chào|hey|hola)\b/i,
  /\b(ban la ai|bạn là ai|you are|who are you)\b/i,
  /\b(cam on|cảm ơn|thank|thanks)\b/i,
  /\b(giup toi|help me|tro giup|huong dan)\b/i,
];

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Parse the user's latest message (and optional conversation history)
 * into a structured intent — fully local, no external LLM.
 */
export function parseIntent(
  _messages: { role: string; content: string }[],
  latestMessage: string,
): ParsedIntent {
  const raw = latestMessage.trim();
  const normalised = norm(raw);
  const count = extractCount(raw);
  const languageHint = detectLanguageHint(raw);

  // ── 1. General chat short-circuit ──────────────────────────────────────
  const noMusicKeywords = !/(nhac|bai|bài|song|music|playlist|track|nghe|hát|hat)/i.test(raw);
  if (noMusicKeywords && GENERAL_CHAT_PATTERNS.some((p) => p.test(raw))) {
    return { intent: "general_chat", count, languageHint };
  }

  // ── 2. Similar-song detection ───────────────────────────────────────────
  if (SIMILAR_TRIGGERS.test(normalised)) {
    const extraction = extractSongAndArtist(raw);
    if (extraction) {
      return {
        intent: "similar_song",
        songTitle: extraction.songTitle,
        artistName: extraction.artistName,
        count,
        languageHint,
      };
    }
    // Trigger detected but no title parsed → fall through to mood_search
  }

  // ── 3. Mood-search detection ────────────────────────────────────────────
  for (const { pattern, mood } of MOOD_KEYWORDS) {
    if (pattern.test(normalised)) {
      let genreHint: string | null = null;
      for (const g of GENRE_KEYWORDS) {
        if (g.pattern.test(normalised)) { genreHint = g.genre; break; }
      }
      return { intent: "mood_search", mood, genreHint, count, languageHint };
    }
  }

  // ── 4. Genre-only search → treat as mood_search ─────────────────────────
  for (const { pattern, genre } of GENRE_KEYWORDS) {
    if (pattern.test(normalised)) {
      return { intent: "mood_search", genreHint: genre, count, languageHint };
    }
  }

  // ── 5. "Tìm nhạc" without further qualifiers ────────────────────────────
  if (/\b(tim nhac|tìm nhạc|nghe nhac|muon nghe|muốn nghe|recommend|goi y|gợi ý)\b/i.test(normalised)) {
    return { intent: "mood_search", count, languageHint };
  }

  // ── 6. Default: general chat ────────────────────────────────────────────
  return { intent: "general_chat", count, languageHint };
}
