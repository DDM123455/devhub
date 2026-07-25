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
	keywordDensityHeading: string;
	keywordDensityWordColumn: string;
	keywordDensityCountColumn: string;
	keywordDensityPercentColumn: string;
}

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

export default function WordCounter({ messages }: { messages: Messages }) {
	const [text, setText] = useState('');
	const stats = useMemo(() => countStats(text), [text]);
	const topWords = useMemo(() => computeTopWords(text, TOP_WORDS_LIMIT), [text]);

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

			<div className="flex items-center justify-between">
				<Button type="button" variant="outline" size="sm" onClick={() => setText('')} disabled={text === ''}>
					{messages.clear}
				</Button>
			</div>

			<dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{statItems.map((item) => (
					<div key={item.label} className="rounded-md border border-border p-3">
						<dt className="text-xs text-muted-foreground">{item.label}</dt>
						<dd className="mt-1 text-lg font-semibold text-foreground">{item.value}</dd>
					</div>
				))}
			</dl>

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
