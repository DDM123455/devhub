import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from './useCopyToClipboard';
import { computeTextStats, fleschReadingEase, looksEnglish, toDuration, type Duration } from '@/lib/word-count';
import {
	computeKeywordRows,
	estimatePages,
	goalProgress,
	gradeMetrics,
	HANDWRITING_WORDS_PER_MINUTE,
	smsSegments,
	WORDS_PER_PAGE_DOUBLE,
	WORDS_PER_PAGE_SINGLE,
} from '@/lib/word-count-extra';
import { extractTextFromFile, MAX_DOCUMENT_BYTES } from '@/lib/doc-extract';

export interface WordCounterExtraMessages {
	presetMetaTitle: string;
	presetLinkedin: string;
	presetTiktok: string;
	presetSmsSegments: string;
	presetNote: string;
	smsInfo: string;
	goalHeading: string;
	goalLabel: string;
	goalWords: string;
	goalCharacters: string;
	goalProgress: string;
	goalReached: string;
	keywordSizeLabel: string;
	keywordSingle: string;
	keywordBigram: string;
	keywordTrigram: string;
	keywordStopWords: string;
	keywordNone: string;
	uploadDocHint: string;
	uploading: string;
	uploadTooLarge: string;
	uploadFailed: string;
	draftSaved: string;
	gradeHeading: string;
	fleschKincaid: string;
	gunningFog: string;
	gradeUnit: string;
	pagesLabel: string;
	pagesValue: string;
	handwritingLabel: string;
}

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
	x: WordCounterExtraMessages;
}

type CharLimitPreset = 'none' | 'twitter' | 'meta-title' | 'meta-description' | 'linkedin-post' | 'tiktok-caption' | 'instagram' | 'youtube-title' | 'sms' | 'sms-segments';

const DRAFT_KEY = 'word-counter-draft';

const CHAR_LIMITS: Record<Exclude<CharLimitPreset, 'none'>, number> = {
	twitter: 280,
	'meta-title': 60,
	'meta-description': 160,
	'linkedin-post': 3000,
	'tiktok-caption': 2200,
	instagram: 2200,
	'youtube-title': 100,
	sms: 160,
	'sms-segments': 160,
};

const TOP_WORDS_LIMIT = 10;
const KEYWORD_LIMIT = 15;

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
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [goalValue, setGoalValue] = useState('');
	const [goalUnit, setGoalUnit] = useState<'words' | 'characters'>('words');
	const [keywordSize, setKeywordSize] = useState<1 | 2 | 3>(1);
	const [excludeStopWords, setExcludeStopWords] = useState(false);
	const [draftRestored, setDraftRestored] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { stats, wordList } = useMemo(() => computeTextStats(text, lang), [text, lang]);
	const topWords = useMemo(
		() => computeKeywordRows(wordList, { limit: keywordSize === 1 && !excludeStopWords ? TOP_WORDS_LIMIT : KEYWORD_LIMIT, size: keywordSize, excludeStopWords }),
		[wordList, keywordSize, excludeStopWords],
	);
	const grades = useMemo(() => (looksEnglish(text) ? gradeMetrics(text, stats.sentences) : null), [text, stats.sentences]);
	const pages = estimatePages(stats.words);
	const handwriting = toDuration(stats.words, HANDWRITING_WORDS_PER_MINUTE);
	const sms = useMemo(() => smsSegments(text), [text]);
	const goalNumber = Number(goalValue);
	const goal = goalProgress(goalUnit === 'words' ? stats.words : stats.characters, goalNumber);

	// Autosave the draft (localStorage may be unavailable: private mode, quota, SSR pass).
	useEffect(() => {
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			if (saved) {
				setText(saved);
				setDraftRestored(true);
			}
		} catch {
			// storage unavailable - start empty
		}
	}, []);
	useEffect(() => {
		const timer = setTimeout(() => {
			try {
				if (text === '') localStorage.removeItem(DRAFT_KEY);
				else localStorage.setItem(DRAFT_KEY, text);
			} catch {
				// ignore quota / private mode
			}
		}, 600);
		return () => clearTimeout(timer);
	}, [text]);

	const isEnglishText = useMemo(() => looksEnglish(text), [text]);
	const readabilityScore = useMemo(
		() => (isEnglishText ? fleschReadingEase(text, stats.sentences) : null),
		[isEnglishText, text, stats.sentences],
	);

	const handleFileUpload = (input: HTMLInputElement) => {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		setUploadError(null);
		if (file.size > MAX_DOCUMENT_BYTES) {
			setUploadError(messages.x.uploadTooLarge.replace('{{max}}', String(MAX_DOCUMENT_BYTES / 1024 / 1024)));
			return;
		}
		setUploading(true);
		extractTextFromFile(file)
			.then((extracted) => setText(extracted))
			.catch(() => setUploadError(file.name.match(/\.(docx|pdf)$/i) ? messages.x.uploadFailed : messages.fileReadError))
			.finally(() => setUploading(false));
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
			label: messages.x.pagesLabel,
			value: messages.x.pagesValue
				.replace('{{single}}', String(pages.single))
				.replace('{{double}}', String(pages.double))
				.replace('{{singleWords}}', String(WORDS_PER_PAGE_SINGLE))
				.replace('{{doubleWords}}', String(WORDS_PER_PAGE_DOUBLE)),
		},
		{
			label: messages.x.handwritingLabel,
			value: formatDuration(handwriting, messages.readingTimeValue, messages.readingTimeHoursValue),
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
						accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
						<option value="meta-title">{messages.x.presetMetaTitle}</option>
						<option value="meta-description">{messages.charLimitMetaDescription}</option>
						<option value="linkedin-post">{messages.x.presetLinkedin}</option>
						<option value="tiktok-caption">{messages.x.presetTiktok}</option>
						<option value="instagram">{messages.charLimitInstagram}</option>
						<option value="youtube-title">{messages.charLimitYoutubeTitle}</option>
						<option value="sms">{messages.charLimitSms}</option>
						<option value="sms-segments">{messages.x.presetSmsSegments}</option>
					</select>
				</div>
			</div>

			{uploading && (
				<p role="status" className="text-xs text-muted-foreground">
					{messages.x.uploading}
				</p>
			)}
			{uploadError && (
				<p role="alert" className="text-sm text-destructive">
					{uploadError}
				</p>
			)}
			{draftRestored && text !== '' && <p className="text-xs text-muted-foreground">{messages.x.draftSaved}</p>}
			<p className="text-xs text-muted-foreground">{messages.x.uploadDocHint}</p>

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

			{charLimitPreset === 'sms-segments' && text !== '' && (
				<p role="status" className="text-sm text-foreground">
					{messages.x.smsInfo
						.replace('{{segments}}', String(sms.segments))
						.replace('{{encoding}}', sms.encoding)
						.replace('{{units}}', String(sms.units))
						.replace('{{per}}', String(sms.perSegment))}
				</p>
			)}
			{charLimitPreset !== 'none' && <p className="text-xs text-muted-foreground">{messages.x.presetNote}</p>}

			<div className="flex flex-col gap-2 rounded-md border border-border p-3">
				<h2 className="text-sm font-semibold text-foreground">{messages.x.goalHeading}</h2>
				<div className="flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-2 text-sm text-foreground">
						{messages.x.goalLabel}
						<input
							type="number"
							min={1}
							inputMode="numeric"
							value={goalValue}
							onChange={(event) => setGoalValue(event.target.value)}
							className="min-h-9 w-28 rounded-md border border-border bg-background px-2 text-sm"
						/>
					</label>
					<select
						value={goalUnit}
						onChange={(event) => setGoalUnit(event.target.value as 'words' | 'characters')}
						aria-label={messages.x.goalLabel}
						className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
					>
						<option value="words">{messages.x.goalWords}</option>
						<option value="characters">{messages.x.goalCharacters}</option>
					</select>
				</div>
				{goalNumber > 0 && (
					<div className="flex flex-col gap-1">
						<div
							role="progressbar"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.round(goal.percent)}
							aria-label={messages.x.goalHeading}
							className="h-2 w-full overflow-hidden rounded-full bg-muted"
						>
							<div className={goal.reached ? 'h-full bg-primary' : 'h-full bg-primary/60'} style={{ width: `${goal.percent}%` }} />
						</div>
						<p role="status" className="text-xs text-muted-foreground">
							{goal.reached
								? messages.x.goalReached
								: messages.x.goalProgress
										.replace('{{percent}}', String(Math.floor(goal.percent)))
										.replace('{{remaining}}', String(Math.max(0, goalNumber - (goalUnit === 'words' ? stats.words : stats.characters))))}
						</p>
					</div>
				)}
			</div>

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
				{grades && (
					<dl className="grid grid-cols-2 gap-3 text-sm">
						<div>
							<dt className="text-xs text-muted-foreground">{messages.x.fleschKincaid}</dt>
							<dd className="font-semibold text-foreground">{messages.x.gradeUnit.replace('{{grade}}', grades.fleschKincaidGrade.toFixed(1))}</dd>
						</div>
						<div>
							<dt className="text-xs text-muted-foreground">{messages.x.gunningFog}</dt>
							<dd className="font-semibold text-foreground">{messages.x.gradeUnit.replace('{{grade}}', grades.gunningFog.toFixed(1))}</dd>
						</div>
					</dl>
				)}
				{readabilityScore !== null && lang !== 'en' && (
					<p className="text-xs text-muted-foreground">{messages.readabilityCalibrationNote}</p>
				)}
			</div>

			{wordList.length > 0 && (
				<div className="flex flex-col gap-2">
					<h2 className="text-sm font-semibold text-foreground">{messages.keywordDensityHeading}</h2>
					<div className="flex flex-wrap items-center gap-3">
						<label className="flex items-center gap-2 text-sm text-foreground">
							{messages.x.keywordSizeLabel}
							<select
								value={keywordSize}
								onChange={(event) => setKeywordSize(Number(event.target.value) as 1 | 2 | 3)}
								className="min-h-9 rounded-md border border-border bg-background px-2 text-sm"
							>
								<option value={1}>{messages.x.keywordSingle}</option>
								<option value={2}>{messages.x.keywordBigram}</option>
								<option value={3}>{messages.x.keywordTrigram}</option>
							</select>
						</label>
						<label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
							<input type="checkbox" checked={excludeStopWords} onChange={(event) => setExcludeStopWords(event.target.checked)} />
							{messages.x.keywordStopWords}
						</label>
					</div>
					{topWords.length === 0 ? (
						<p className="text-sm text-muted-foreground">{messages.x.keywordNone}</p>
					) : (
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
										<tr key={item.phrase} className="border-b border-border last:border-0">
											<td className="px-3 py-2 text-foreground [overflow-wrap:anywhere]">{item.phrase}</td>
											<td className="px-3 py-2 text-foreground">{item.count}</td>
											<td className="px-3 py-2 text-foreground">{item.percent.toFixed(1)}%</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
