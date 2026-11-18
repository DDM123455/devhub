/**
 * Số học ngày tháng cho các cụm trang "N weeks from today" / "N days ago" / "N hours from now".
 *
 * Mọi phép cộng ngày đều làm trên UTC: cộng vào giờ địa phương sẽ lệch một tiếng ở các mốc
 * đổi giờ mùa hè (DST), đủ để "7 tuần nữa" rơi sang ngày hôm trước ở vài múi giờ.
 * Phía client truyền vào ngày đã quy về nửa đêm theo múi giờ người dùng, nên kết quả vẫn
 * là ngày đúng với họ.
 */

const MS_PER_DAY = 86_400_000;

/** Nửa đêm (UTC) của chính ngày đó — bỏ phần giờ/phút để phép cộng luôn rơi đúng ngày. */
export function startOfUtcDay(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Nửa đêm của "hôm nay" theo múi giờ địa phương, biểu diễn bằng các trường UTC. */
export function localTodayAsUtc(now: Date = new Date()): Date {
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(from: Date, days: number): Date {
	return new Date(startOfUtcDay(from).getTime() + days * MS_PER_DAY);
}

export function addWeeks(from: Date, weeks: number): Date {
	return addDays(from, weeks * 7);
}

/** Thứ trong tuần: 0 = Chủ nhật. */
export function isWeekend(date: Date): boolean {
	const day = date.getUTCDay();
	return day === 0 || day === 6;
}

/**
 * Số ngày làm việc (T2–T6) giữa hai mốc, KHÔNG tính ngày bắt đầu và CÓ tính ngày kết thúc —
 * đúng cách người ta đếm "còn bao nhiêu ngày làm việc nữa". Thứ tự hai tham số không quan trọng.
 * Không trừ ngày lễ: lễ khác nhau theo từng nước nên trang có ghi rõ điều đó.
 */
export function countWeekdaysBetween(a: Date, b: Date): number {
	const start = startOfUtcDay(a < b ? a : b);
	const end = startOfUtcDay(a < b ? b : a);
	let count = 0;
	for (let t = start.getTime() + MS_PER_DAY; t <= end.getTime(); t += MS_PER_DAY) {
		if (!isWeekend(new Date(t))) count++;
	}
	return count;
}

/** Ngày thứ mấy trong năm (1–366). */
export function dayOfYear(date: Date): number {
	const day = startOfUtcDay(date);
	const jan1 = Date.UTC(day.getUTCFullYear(), 0, 1);
	return Math.round((day.getTime() - jan1) / MS_PER_DAY) + 1;
}

export function daysBetween(a: Date, b: Date): number {
	return Math.round((startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime()) / MS_PER_DAY);
}

const LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });

/** "Tuesday, March 23, 2027" */
export function formatLongDate(date: Date): string {
	return LONG.format(date);
}

/** "Mar 23, 2027" — dùng trong bảng mốc lân cận cho đỡ chật. */
export function formatShortDate(date: Date): string {
	return SHORT.format(date);
}

export function formatWeekday(date: Date): string {
	return WEEKDAY.format(date);
}

/** "2027-03-23" — cho thuộc tính datetime của thẻ <time> và cho ô nhập type="date". */
export function formatIsoDate(date: Date): string {
	return startOfUtcDay(date).toISOString().slice(0, 10);
}

/** "20270323" — định dạng ngày của lịch iCalendar. */
export function formatIcsDate(date: Date): string {
	return formatIsoDate(date).replace(/-/g, '');
}
