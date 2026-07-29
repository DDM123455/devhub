import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	placeholder: string;
	charsLabel: string;
	charsNoSpacesLabel: string;
	wordsLabel: string;
	sentencesLabel: string;
	paragraphsLabel: string;
	readingTimeLabel: string;
	readingTimeValue: string;
	speakingTimeLabel: string;
	speakingTimeValue: string;
	clear: string;
	copy: string;
	copied: string;
	download: string;
	charLimitLabel: string;
	charLimitNone: string;
	charLimitTwitter: string;
	charLimitMetaDescription: string;
	charLimitInstagram: string;
	charLimitYoutubeTitle: string;
	charLimitSms: string;
	charLimitRemaining: string;
	charLimitOver: string;
	readabilityHeading: string;
	readabilityScoreLabel: string;
	readabilityNotEnoughText: string;
	readabilityVeryEasy: string;
	readabilityEasy: string;
	readabilityFairlyEasy: string;
	readabilityStandard: string;
	readabilityFairlyDifficult: string;
	readabilityDifficult: string;
	readabilityVeryConfusing: string;
	keywordDensityHeading: string;
	keywordDensityWordColumn: string;
	keywordDensityCountColumn: string;
	keywordDensityPercentColumn: string;
}

type CharLimitPreset = 'none' | 'twitter' | 'meta-description' | 'instagram' | 'youtube-title' | 'sms';

const CHAR_LIMITS: Record<Exclude<CharLimitPreset, 'none'>, number> = {
	twitter: 280,
	'meta-description': 160,
	instagram: 2200,
	'youtube-title': 100,
	sms: 160,
};

interface TopWord {
	word: string;
	count: number;
	percent: number;
}

// Average reading speed (~200 wpm) and speaking/presenting speed (~130 wpm) are the
// two figures most word-count tools (WordCounter.net included) settle on.
const READING_WORDS_PER_MINUTE = 200;
const SPEAKING_WORDS_PER_MINUTE = 130;
const TOP_WORDS_LIMIT = 10;

function countStats(text: string) {
	const characters = text.length;
	const charactersNoSpaces = text.replace(/\s/g, '').length;
	const trimmed = text.trim();
	const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
	const sentences =
		trimmed === '' ? 0 : (trimmed.match(/[^.!?]*[.!?]+|[^.!?]+$/g) ?? []).filter((s) => s.trim() !== '').length;
	const paragraphs =
		trimmed === '' ? 0 : trimmed.split(/\n\s*\n/).filter((p) => p.trim() !== '').length;
	const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));
	const speakingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / SPEAKING_WORDS_PER_MINUTE));

	return { characters, charactersNoSpaces, words, sentences, paragraphs, readingMinutes, speakingMinutes };
}

// Keyword density: how often each distinct word occurs, as a share of total word
// count — deliberately NOT filtering out common words ("the", "and", ...), matching
// how WordCounter.net's own keyword density table works, since SEO users specifically
// want to see if a word (including a stop word used as a keyword) is over-repeated.
function computeTopWords(text: string, limit: number): TopWord[] {
	const trimmed = text.trim();
	if (trimmed === '') return [];
	const matches = trimmed.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
	if (matches.length === 0) return [];

	const counts = new Map<string, number>();
	for (const word of matches) {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}

	const total = matches.length;
	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([word, count]) => ({ word, count, percent: (count / total) * 100 }));
}

// Approximate English syllable counter (vowel-group heuristic with common English
// suffix adjustments) — the standard trick used by most lightweight readability tools,
// since browsers have no dictionary-based syllabifier built in. Meaningful for English
// text specifically; other languages will still get a number, just not a calibrated one.
function countSyllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, '');
	if (w.length === 0) return 0;
	if (w.length <= 3) return 1;
	const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
	const groups = trimmed.match(/[aeiouy]{1,2}/g);
	return groups ? Math.max(1, groups.length) : 1;
}

function fleschReadingEase(words: number, sentences: number, text: string): number | null {
	if (words === 0 || sentences === 0) return null;
	const wordList = text.trim().toLowerCase().match(/[a-z']+/g) ?? [];
	if (wordList.length === 0) return null;
	const syllables = wordList.reduce((sum, w) => sum + countSyllables(w), 0);
	const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / wordList.length);
	return Math.max(0, Math.min(100, score));
}

function readabilityLevel(score: number, messages: Messages): string {
	if (score >= 90) return messages.readabilityVeryEasy;
	if (score >= 80) return messages.readabilityEasy;
	if (score >= 70) return messages.readabilityFairlyEasy;
	if (score >= 60) return messages.readabilityStandard;
	if (score >= 50) return messages.readabilityFairlyDifficult;
	if (score >= 30) return messages.readabilityDifficult;
	return messages.readabilityVeryConfusing;
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={value === ''}
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? copiedLabel : label}
		</Button>
	);
}

export default function WordCounter({ messages }: { messages: Messages }) {
	const [text, setText] = useState('');
	const [charLimitPreset, setCharLimitPreset] = useState<CharLimitPreset>('none');
	const stats = useMemo(() => countStats(text), [text]);
	const topWords = useMemo(() => computeTopWords(text, TOP_WORDS_LIMIT), [text]);
	const readabilityScore = useMemo(
		() => fleschReadingEase(stats.words, stats.sentences, text),
		[stats.words, stats.sentences, text],
	);

	const download = () => {
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'text.txt';
		link.click();
		URL.revokeObjectURL(url);
	};

	const charLimit = charLimitPreset === 'none' ? null : CHAR_LIMITS[charLimitPreset];
	const charLimitRemaining = charLimit === null ? null : charLimit - stats.characters;

	const statItems: Array<{ label: string; value: string | number }> = [
		{ label: messages.wordsLabel, value: stats.words },
		{ label: messages.charsLabel, value: stats.characters },
		{ label: messages.charsNoSpacesLabel, value: stats.charactersNoSpaces },
		{ label: messages.sentencesLabel, value: stats.sentences },
		{ label: messages.paragraphsLabel, value: stats.paragraphs },
		{
			label: messages.readingTimeLabel,
			value: messages.readingTimeValue.replace('{{minutes}}', String(stats.readingMinutes)),
		},
		{
			label: messages.speakingTimeLabel,
			value: messages.speakingTimeValue.replace('{{minutes}}', String(stats.speakingMinutes)),
		},
	];

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={messages.placeholder}
				rows={14}
				className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			/>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" variant="outline" size="sm" onClick={() => setText('')} disabled={text === ''}>
						{messages.clear}
					</Button>
					<CopyButton value={text} label={messages.copy} copiedLabel={messages.copied} />
					<Button type="button" variant="outline" size="sm" onClick={download} disabled={text === ''}>
						{messages.download}
					</Button>
				</div>
				<div className="flex items-center gap-2">
					<label htmlFor="word-counter-char-limit" className="text-xs text-muted-foreground">
						{messages.charLimitLabel}
					</label>
					<select
						id="word-counter-char-limit"
						value={charLimitPreset}
						onChange={(event) => setCharLimitPreset(event.target.value as CharLimitPreset)}
						className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
					>
						<option value="none">{messages.charLimitNone}</option>
						<option value="twitter">{messages.charLimitTwitter}</option>
						<option value="meta-description">{messages.charLimitMetaDescription}</option>
						<option value="instagram">{messages.charLimitInstagram}</option>
						<option value="youtube-title">{messages.charLimitYoutubeTitle}</option>
						<option value="sms">{messages.charLimitSms}</option>
					</select>
				</div>
			</div>

			{charLimitRemaining !== null && (
				<p
					role="status"
					className={`text-sm font-medium ${charLimitRemaining < 0 ? 'text-destructive' : charLimitRemaining <= (charLimit ?? 0) * 0.1 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
				>
					{charLimitRemaining < 0
						? messages.charLimitOver.replace('{{count}}', String(-charLimitRemaining))
						: messages.charLimitRemaining.replace('{{count}}', String(charLimitRemaining))}
				</p>
			)}

			<dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{statItems.map((item) => (
					<div key={item.label} className="rounded-md border border-border p-3">
						<dt className="text-xs text-muted-foreground">{item.label}</dt>
						<dd className="mt-1 text-lg font-semibold text-foreground">{item.value}</dd>
					</div>
				))}
			</dl>

			<div className="flex flex-col gap-2 rounded-md border border-border p-3">
				<h2 className="text-sm font-semibold text-foreground">{messages.readabilityHeading}</h2>
				{readabilityScore === null ? (
					<p className="text-sm text-muted-foreground">{messages.readabilityNotEnoughText}</p>
				) : (
					<div className="flex items-center gap-3">
						<span className="text-2xl font-bold text-foreground">{Math.round(readabilityScore)}</span>
						<div className="flex flex-col">
							<span className="text-xs text-muted-foreground">{messages.readabilityScoreLabel}</span>
							<span className="text-sm font-medium text-foreground">{readabilityLevel(readabilityScore, messages)}</span>
						</div>
					</div>
				)}
			</div>

			{topWords.length > 0 && (
				<div className="flex flex-col gap-2">
					<h2 className="text-sm font-semibold text-foreground">{messages.keywordDensityHeading}</h2>
					<div className="overflow-x-auto rounded-md border border-border">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-b border-border text-xs text-muted-foreground">
									<th className="px-3 py-2 font-medium">{messages.keywordDensityWordColumn}</th>
									<th className="px-3 py-2 font-medium">{messages.keywordDensityCountColumn}</th>
									<th className="px-3 py-2 font-medium">{messages.keywordDensityPercentColumn}</th>
								</tr>
							</thead>
							<tbody>
								{topWords.map((item) => (
									<tr key={item.word} className="border-b border-border last:border-0">
										<td className="px-3 py-2 text-foreground">{item.word}</td>
										<td className="px-3 py-2 text-foreground">{item.count}</td>
										<td className="px-3 py-2 text-foreground">{item.percent.toFixed(1)}%</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
