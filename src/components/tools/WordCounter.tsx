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
	clear: string;
}

function countStats(text: string) {
	const characters = text.length;
	const charactersNoSpaces = text.replace(/\s/g, '').length;
	const trimmed = text.trim();
	const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
	const sentences =
		trimmed === '' ? 0 : (trimmed.match(/[^.!?]*[.!?]+|[^.!?]+$/g) ?? []).filter((s) => s.trim() !== '').length;
	const paragraphs =
		trimmed === '' ? 0 : trimmed.split(/\n\s*\n/).filter((p) => p.trim() !== '').length;
	const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / 200));

	return { characters, charactersNoSpaces, words, sentences, paragraphs, readingMinutes };
}

export default function WordCounter({ messages }: { messages: Messages }) {
	const [text, setText] = useState('');
	const stats = useMemo(() => countStats(text), [text]);

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
		</div>
	);
}
