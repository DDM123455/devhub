// Extra analysis helpers for the Word Counter: stop-word filtered keyword density with
// n-grams, SMS segment math, grade-level readability formulas (English only), page and
// handwriting estimates.

import { countSyllables } from './word-count';

/* ------------------------------------------------------------------ stop words */

const STOP_WORDS_EN = new Set(
	(
		'a about above after again against all am an and any are aren\'t as at be because been before being below between both but by can can\'t cannot could couldn\'t did didn\'t do does doesn\'t doing don\'t down during each few for from further had hadn\'t has hasn\'t have haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him himself his how how\'s i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s me more most mustn\'t my myself no nor not of off on once only or other ought our ours ourselves out over own same shan\'t she she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their theirs them themselves then there there\'s these they they\'d they\'ll they\'re they\'ve this those through to too under until up very was wasn\'t we we\'d we\'ll we\'re we\'ve were weren\'t what what\'s when when\'s where where\'s which while who who\'s whom why why\'s with won\'t would wouldn\'t you you\'d you\'ll you\'re you\'ve your yours yourself yourselves will just also may might must shall us via per yet'
	).split(' '),
);

// Common Vietnamese function words (lower-case, with diacritics).
const STOP_WORDS_VI = new Set(
	(
		'và của là có một những các cho được trong khi với này đó để không đã sẽ đang cũng như từ về theo tại hay hoặc nhưng nếu thì mà rất lại ra vào lên xuống đến bởi do vì nên còn đều chỉ cả mỗi mọi nhiều ít vẫn đã rồi sau trước trên dưới giữa ngoài khác cùng nhau tôi bạn anh chị em ông bà họ chúng ta mình nó đây kia ấy thế vậy sao gì ai nào đâu bao nhiêu chưa chẳng không phải sẽ cần muốn bị'
	).split(' '),
);

export function isStopWord(word: string): boolean {
	const w = word.toLowerCase().replace(/’/g, "'");
	return STOP_WORDS_EN.has(w) || STOP_WORDS_VI.has(w);
}

/* ------------------------------------------------------------------ keyword density */

export interface KeywordRow {
	phrase: string;
	count: number;
	percent: number;
}

export interface KeywordOptions {
	limit: number;
	/** 1 = single words, 2 = bigrams, 3 = trigrams. */
	size: 1 | 2 | 3;
	excludeStopWords: boolean;
}

// Counts phrases of `size` consecutive words. With `excludeStopWords`, single stop words are
// dropped, and n-grams that START or END with a stop word are dropped (so "in the" never
// ranks but "search engine optimisation" does). Percent is relative to the number of
// phrases of that size (words - size + 1) before filtering.
export function computeKeywordRows(wordList: string[], options: KeywordOptions): KeywordRow[] {
	const { size, limit, excludeStopWords } = options;
	const words = wordList.map((w) => w.toLowerCase());
	const total = words.length - size + 1;
	if (total <= 0) return [];
	const counts = new Map<string, number>();
	for (let i = 0; i < total; i++) {
		const gram = words.slice(i, i + size);
		if (excludeStopWords && (isStopWord(gram[0]) || isStopWord(gram[size - 1]))) continue;
		if (/^\d+$/.test(gram.join(''))) continue;
		const key = gram.join(' ');
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.filter(([, count]) => size === 1 || count > 1)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([phrase, count]) => ({ phrase, count, percent: (count / total) * 100 }));
}

/* ------------------------------------------------------------------ SMS */

// GSM 03.38 basic character set + extension table (extension chars cost 2 septets).
const GSM_BASIC =
	'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

export interface SmsInfo {
	encoding: 'GSM-7' | 'UCS-2';
	/** Billable units: septets for GSM-7, UTF-16 code units for UCS-2. */
	units: number;
	segments: number;
	perSegment: number;
}

export function smsSegments(text: string): SmsInfo {
	if (text === '') return { encoding: 'GSM-7', units: 0, segments: 0, perSegment: 160 };
	let septets = 0;
	let gsm = true;
	for (const ch of text) {
		if (GSM_BASIC.includes(ch)) septets += 1;
		else if (GSM_EXTENDED.includes(ch)) septets += 2;
		else {
			gsm = false;
			break;
		}
	}
	if (gsm) {
		const segments = septets <= 160 ? 1 : Math.ceil(septets / 153);
		return { encoding: 'GSM-7', units: septets, segments, perSegment: segments === 1 ? 160 : 153 };
	}
	const units = text.length; // UTF-16 code units
	const segments = units <= 70 ? 1 : Math.ceil(units / 67);
	return { encoding: 'UCS-2', units, segments, perSegment: segments === 1 ? 70 : 67 };
}

/* ------------------------------------------------------------------ readability (English) */

export interface GradeMetrics {
	fleschKincaidGrade: number;
	gunningFog: number;
}

// Flesch-Kincaid Grade Level = 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
// Gunning Fog = 0.4 * ((words/sentences) + 100*(complexWords/words)); complex = 3+ syllables.
export function gradeMetrics(text: string, sentences: number): GradeMetrics | null {
	if (sentences === 0) return null;
	const words = text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? [];
	if (words.length === 0) return null;
	let syllables = 0;
	let complex = 0;
	for (const word of words) {
		const s = countSyllables(word);
		syllables += s;
		if (s >= 3) complex += 1;
	}
	const wordsPerSentence = words.length / sentences;
	return {
		fleschKincaidGrade: Math.max(0, 0.39 * wordsPerSentence + 11.8 * (syllables / words.length) - 15.59),
		gunningFog: Math.max(0, 0.4 * (wordsPerSentence + 100 * (complex / words.length))),
	};
}

/* ------------------------------------------------------------------ pages / handwriting */

export const WORDS_PER_PAGE_SINGLE = 500;
export const WORDS_PER_PAGE_DOUBLE = 250;
export const HANDWRITING_WORDS_PER_MINUTE = 25;

export function estimatePages(words: number): { single: number; double: number } {
	return {
		single: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_PAGE_SINGLE)),
		double: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_PAGE_DOUBLE)),
	};
}

/* ------------------------------------------------------------------ goals & presets */

export type GoalUnit = 'words' | 'characters';

export function goalProgress(current: number, goal: number): { percent: number; reached: boolean } {
	if (!(goal > 0)) return { percent: 0, reached: false };
	return { percent: Math.min(100, (current / goal) * 100), reached: current >= goal };
}

export interface LimitPreset {
	id: string;
	limit: number;
	unit: 'characters';
}

// Platform limits shown in the dropdown (ids map to i18n labels). Values are widely published
// limits at the time of writing and can change; the UI says so.
export const LIMIT_PRESETS: LimitPreset[] = [
	{ id: 'twitter', limit: 280, unit: 'characters' },
	{ id: 'meta-title', limit: 60, unit: 'characters' },
	{ id: 'meta-description', limit: 160, unit: 'characters' },
	{ id: 'linkedin-post', limit: 3000, unit: 'characters' },
	{ id: 'tiktok-caption', limit: 2200, unit: 'characters' },
	{ id: 'instagram', limit: 2200, unit: 'characters' },
	{ id: 'youtube-title', limit: 100, unit: 'characters' },
	{ id: 'sms', limit: 160, unit: 'characters' },
];
