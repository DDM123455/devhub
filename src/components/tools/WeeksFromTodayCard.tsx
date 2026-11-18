import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	addWeeks,
	countWeekdaysBetween,
	dayOfYear,
	daysBetween,
	formatIsoDate,
	formatLongDate,
	formatWeekday,
	localTodayAsUtc,
} from '@/lib/date-offset';
import { buildIcs } from '@/lib/ics';
import { useCopyToClipboard } from './useCopyToClipboard';

export interface WeeksCardMessages {
	resultPrefix: string;
	countedFrom: string;
	statWeekday: string;
	statTotalDays: string;
	statWorkingDays: string;
	statDayOfYear: string;
	statDayOfYearValue: string;
	copyButton: string;
	copiedButton: string;
	copyFailed: string;
	calendarButton: string;
	calendarEventTitle: string;
	startDateLabel: string;
	weeksLabel: string;
	resetButton: string;
}

interface Props {
	/** Số tuần của trang này — cũng là giá trị khởi tạo của ô nhập. */
	weeks: number;
	/** Ngày build (YYYY-MM-DD), dùng làm kết quả có sẵn trong HTML cho trình thu thập đọc. */
	buildDateIso: string;
	messages: WeeksCardMessages;
}

const isoToUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export default function WeeksFromTodayCard({ weeks: initialWeeks, buildDateIso, messages }: Props) {
	// Khởi tạo đúng bằng giá trị đã render sẵn ở bước build, để lần render đầu phía client
	// khớp hệt HTML (không nhảy layout). Hiệu ứng bên dưới mới đổi sang ngày thật của máy.
	const [startIso, setStartIso] = useState(buildDateIso);
	const [weeks, setWeeks] = useState(initialWeeks);
	const { copy, copied, failed } = useCopyToClipboard();

	useEffect(() => {
		const today = formatIsoDate(localTodayAsUtc());
		if (today !== buildDateIso) setStartIso(today);
	}, [buildDateIso]);

	const result = useMemo(() => {
		const start = isoToUtcDate(startIso);
		if (Number.isNaN(start.getTime())) return null;
		const target = addWeeks(start, weeks);
		return {
			start,
			target,
			long: formatLongDate(target),
			weekday: formatWeekday(target),
			totalDays: daysBetween(start, target),
			workingDays: countWeekdaysBetween(start, target),
			dayOfYear: dayOfYear(target),
			yearLength: dayOfYear(new Date(Date.UTC(target.getUTCFullYear(), 11, 31))),
		};
	}, [startIso, weeks]);

	if (!result) return null;

	const downloadIcs = () => {
		const ics = buildIcs({
			date: result.target,
			title: messages.calendarEventTitle
				.replace('{{n}}', String(weeks))
				.replace('{{start}}', formatLongDate(result.start)),
			url: typeof location === 'undefined' ? undefined : location.href,
		});
		const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${weeks}-weeks-from-${formatIsoDate(result.start)}.ics`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const stats = [
		{ label: messages.statWeekday, value: result.weekday },
		{ label: messages.statTotalDays, value: String(result.totalDays) },
		{ label: messages.statWorkingDays, value: String(result.workingDays) },
		{
			label: messages.statDayOfYear,
			value: messages.statDayOfYearValue
				.replace('{{day}}', String(result.dayOfYear))
				.replace('{{total}}', String(result.yearLength)),
		},
	];

	return (
		<div className="flex flex-col gap-5 rounded-lg border border-border p-5">
			{/* min-height: giữ chỗ sẵn để lúc đổi sang ngày của máy người dùng không bị xô layout. */}
			<div className="min-h-24">
				<p className="text-sm text-muted-foreground">
					{messages.resultPrefix.replace('{{n}}', String(weeks))}
				</p>
				<p className="mt-1 text-heading-1 text-foreground">
					<time dateTime={formatIsoDate(result.target)}>{result.long}</time>
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{messages.countedFrom.replace('{{date}}', formatLongDate(result.start))}
				</p>
			</div>

			<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{stats.map((stat) => (
					<div key={stat.label} className="rounded-md border border-border px-3 py-2">
						<dt className="text-xs text-muted-foreground">{stat.label}</dt>
						<dd className="mt-0.5 text-sm font-medium text-foreground">{stat.value}</dd>
					</div>
				))}
			</dl>

			<div className="flex flex-wrap gap-2">
				<Button variant="outline" onClick={() => copy(result.long)}>
					{copied ? messages.copiedButton : failed ? messages.copyFailed : messages.copyButton}
				</Button>
				<Button variant="outline" onClick={downloadIcs}>
					{messages.calendarButton}
				</Button>
			</div>

			<div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
				<label className="flex flex-col gap-1 text-sm text-foreground">
					{messages.weeksLabel}
					<input
						type="number"
						min={1}
						max={520}
						value={weeks}
						onChange={(e) => setWeeks(Math.min(520, Math.max(1, Math.round(Number(e.target.value) || 1))))}
						className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm text-foreground">
					{messages.startDateLabel}
					<input
						type="date"
						value={startIso}
						onChange={(e) => e.target.value && setStartIso(e.target.value)}
						className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
					/>
				</label>
				<Button
					variant="ghost"
					onClick={() => {
						setStartIso(formatIsoDate(localTodayAsUtc()));
						setWeeks(initialWeeks);
					}}
				>
					{messages.resetButton}
				</Button>
			</div>
		</div>
	);
}
