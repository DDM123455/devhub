import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from './useCopyToClipboard';
import { computeTextStats, computeTopWords, fleschReadingEase, looksEnglish, type Duration } from '@/lib/word-count';

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
	uploadFile: string;
	textareaLabel: string;
	readingTimeHoursValue: string;
	speakingTimeHoursValue: string;
	readabilityEnglishOnly: string;
	readabilityCalibrationNote: string;
	fileReadError: string;
	copyFailed: string;
}

type CharLimitPreset = 'none' | 'twitter' | 'meta-description' | 'instagram' | 'youtube-title' | 'sms';

const CHAR_LIMITS: Record<Exclude<CharLimitPreset, 'none'>, number> = {
	twitter: 280,
	'meta-description': 160,
	instagram: 2200,
	'youtube-title': 100,
	sms: 160,
};

const TOP_WORDS_LIMIT = 10;

function readabilityLevel(score: number, messages: Messages): string {
	if (score >= 90) return messages.readabilityVeryEasy;
	if (score >= 80) return messages.readabilityEasy;
	if (score >= 70) return messages.readabilityFairlyEasy;
	if (score >= 60) return messages.readabilityStandard;
	if (score >= 50) return messages.readabilityFairlyDifficult;
	if (score >= 30) return messages.readabilityDifficult;
	return messages.readabilityVeryConfusing;
}

function CopyButton({
	value,
	label,
	copiedLabel,
	failedLabel,
}: {
	value: string;
	label: string;
	copiedLabel: string;
	failedLabel: string;
}) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button
			aria-live="polite"
			type="button"
			variant="outline"
			size="sm"
			disabled={value === ''}
			onClick={() => void copy(value)}
		>
			{copied ? copiedLabel : failed ? failedLabel : label}
		</Button>
	);
}

function formatDuration(duration: Duration, minutesTemplate: string, hoursTemplate: string): string {
	if (duration.hours > 0) {
		return hoursTemplate.replace('{{hours}}', String(duration.hours)).replace('{{minutes}}', String(duration.minutes));
	}
	return minutesTemplate.replace('{{minutes}}', String(duration.minutes));
}

export default function WordCounter({ messages, lang = 'en' }: { messages: Messages; lang?: string }) {
	const [text, setText] = useState('');
	const [charLimitPreset, setCharLimitPreset] = useState<CharLimitPreset>('none');
	const [uploadError, setUploadError] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { stats, wordList } = useMemo(() => computeTextStats(text, lang), [text, lang]);
	const topWords = useMemo(() => computeTopWords(wordList, TOP_WORDS_LIMIT), [wordList]);
	const isEnglishText = useMemo(() => looksEnglish(text), [text]);
	const readabilityScore = useMemo(
		() => (isEnglishText ? fleschReadingEase(text, stats.sentences) : null),
		[isEnglishText, text, stats.sentences],
	);

	const handleFileUpload = (input: HTMLInputElement) => {
		const file = input.files?.[0];
		if (!file) return;
		setUploadError(false);
		const reader = new FileReader();
		reader.onload = () => {
			// CRLF -> LF so Windows files don't differ from pasted text in any count.
			if (typeof reader.result === 'string') setText(reader.result.replace(/\r\n?/g, '\n'));
		};
		reader.onerror = () => setUploadError(true);
		reader.readAsText(file);
		// Allow re-selecting the same file afterwards.
		input.value = '';
	};

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
			value: formatDuration(stats.reading, messages.readingTimeValue, messages.readingTimeHoursValue),
		},
		{
			label: messages.speakingTimeLabel,
			value: formatDuration(stats.speaking, messages.speakingTimeValue, messages.speakingTimeHoursValue),
		},
	];

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={messages.placeholder}
				aria-label={messages.textareaLabel}
				rows={14}
				className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			/>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" variant="outline" size="sm" onClick={() => setText('')} disabled={text === ''}>
						{messages.clear}
					</Button>
					<CopyButton value={text} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
					<Button type="button" variant="outline" size="sm" onClick={download} disabled={text === ''}>
						{messages.download}
					</Button>
					<label
						htmlFor="word-counter-file-input"
						className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex h-7 cursor-pointer items-center rounded-md border border-border px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted"
					>
						{messages.uploadFile}
					</label>
					<input
						id="word-counter-file-input"
						ref={fileInputRef}
						type="file"
						accept=".txt,text/plain"
						className="sr-only"
						onChange={(event) => handleFileUpload(event.target)}
					/>
				</div>
				<div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
					<label htmlFor="word-counter-char-limit" className="text-xs text-muted-foreground">
						{messages.charLimitLabel}
					</label>
					<select
						id="word-counter-char-limit"
						value={charLimitPreset}
						onChange={(event) => setCharLimitPreset(event.target.value as CharLimitPreset)}
						className="min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
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

			{uploadError && (
				<p role="alert" className="text-sm text-destructive">
					{messages.fileReadError}
				</p>
			)}

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
				{text.trim() !== '' && !isEnglishText ? (
					<p className="text-sm text-muted-foreground">{messages.readabilityEnglishOnly}</p>
				) : readabilityScore === null ? (
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
				{readabilityScore !== null && lang !== 'en' && (
					<p className="text-xs text-muted-foreground">{messages.readabilityCalibrationNote}</p>
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
