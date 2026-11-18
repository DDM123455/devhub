/**
 * Sinh file .ics (iCalendar) cho nút "Add to calendar" — tạo ngay trên trình duyệt,
 * không gọi dịch vụ lịch nào, đúng tinh thần không gửi dữ liệu đi đâu của site.
 */
import { formatIcsDate, addDays } from './date-offset';

/** Gấp dòng theo RFC 5545: dòng dài quá 75 ký tự phải xuống dòng và thụt đầu bằng một dấu cách. */
function fold(line: string): string {
	if (line.length <= 75) return line;
	const parts = [line.slice(0, 75)];
	for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
	return parts.join('\r\n');
}

/** Dấu phẩy, chấm phẩy, gạch chéo ngược và xuống dòng đều phải escape trong giá trị text. */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

export interface IcsEvent {
	/** Ngày diễn ra; sự kiện được tạo dạng cả ngày (all-day). */
	date: Date;
	title: string;
	description?: string;
	url?: string;
	/** Chuỗi duy nhất cho UID; mặc định suy từ ngày và tiêu đề. */
	uid?: string;
	/** Mốc tạo file; tách ra thành tham số để test cho kết quả ổn định. */
	stamp?: Date;
}

export function buildIcs({ date, title, description, url, uid, stamp = new Date() }: IcsEvent): string {
	const start = formatIcsDate(date);
	// DTEND của sự kiện cả ngày là mốc loại trừ: phải là ngày kế tiếp, nếu không Outlook hiểu thành 0 ngày.
	const end = formatIcsDate(addDays(date, 1));
	const slug = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//privatetoolhub.com//Date Calculator//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${uid ?? `${start}-${slug}@privatetoolhub.com`}`,
		`DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
		`DTSTART;VALUE=DATE:${start}`,
		`DTEND;VALUE=DATE:${end}`,
		`SUMMARY:${escapeText(title)}`,
		...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
		...(url ? [`URL:${escapeText(url)}`] : []),
		'END:VEVENT',
		'END:VCALENDAR',
	];
	return lines.map(fold).join('\r\n') + '\r\n';
}
