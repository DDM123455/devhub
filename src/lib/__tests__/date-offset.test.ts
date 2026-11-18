import { describe, expect, it } from 'vitest';
import {
	addDays,
	addWeeks,
	countWeekdaysBetween,
	dayOfYear,
	daysBetween,
	formatIcsDate,
	formatIsoDate,
	formatLongDate,
	formatWeekday,
	isWeekend,
	localTodayAsUtc,
	startOfUtcDay,
} from '../date-offset';
import { buildIcs } from '../ics';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('startOfUtcDay', () => {
	it('bỏ phần giờ phút', () => {
		expect(startOfUtcDay(new Date('2026-11-18T23:45:12Z')).toISOString()).toBe('2026-11-18T00:00:00.000Z');
	});
});

describe('addDays / addWeeks', () => {
	it('cộng qua ranh giới tháng và năm', () => {
		expect(formatIsoDate(addDays(d('2026-01-31'), 1))).toBe('2026-02-01');
		expect(formatIsoDate(addDays(d('2026-12-31'), 1))).toBe('2027-01-01');
	});
	it('năm nhuận: 2028 có 29/02', () => {
		expect(formatIsoDate(addDays(d('2028-02-28'), 1))).toBe('2028-02-29');
	});
	it('18 tuần = 126 ngày', () => {
		expect(daysBetween(d('2026-11-18'), addWeeks(d('2026-11-18'), 18))).toBe(126);
		expect(formatIsoDate(addWeeks(d('2026-11-18'), 18))).toBe('2027-03-24');
	});
	it('số âm = lùi về quá khứ', () => {
		expect(formatIsoDate(addDays(d('2026-03-01'), -1))).toBe('2026-02-28');
	});
	it('không bị lệch ở mốc đổi giờ mùa hè', () => {
		// 8/3/2026 là ngày Mỹ chuyển sang giờ mùa hè; cộng trên UTC nên vẫn ra đúng ngày.
		expect(formatIsoDate(addDays(d('2026-03-07'), 1))).toBe('2026-03-08');
		expect(formatIsoDate(addWeeks(d('2026-03-01'), 2))).toBe('2026-03-15');
	});
});

describe('isWeekend / countWeekdaysBetween', () => {
	it('nhận đúng thứ bảy và chủ nhật', () => {
		expect(isWeekend(d('2026-11-21'))).toBe(true); // thứ bảy
		expect(isWeekend(d('2026-11-22'))).toBe(true); // chủ nhật
		expect(isWeekend(d('2026-11-20'))).toBe(false);
	});
	it('một tuần tròn có 5 ngày làm việc', () => {
		expect(countWeekdaysBetween(d('2026-11-18'), d('2026-11-25'))).toBe(5);
	});
	it('không tính ngày bắt đầu, có tính ngày kết thúc', () => {
		// Thứ tư 18 -> thứ năm 19: đúng một ngày làm việc.
		expect(countWeekdaysBetween(d('2026-11-18'), d('2026-11-19'))).toBe(1);
		// Thứ sáu 20 -> chủ nhật 22: không có ngày làm việc nào.
		expect(countWeekdaysBetween(d('2026-11-20'), d('2026-11-22'))).toBe(0);
	});
	it('đảo thứ tự tham số vẫn ra kết quả như nhau', () => {
		expect(countWeekdaysBetween(d('2026-11-25'), d('2026-11-18'))).toBe(5);
	});
	it('cùng một ngày -> 0', () => {
		expect(countWeekdaysBetween(d('2026-11-18'), d('2026-11-18'))).toBe(0);
	});
});

describe('dayOfYear', () => {
	it('1/1 là ngày 1, 31/12 năm thường là ngày 365', () => {
		expect(dayOfYear(d('2026-01-01'))).toBe(1);
		expect(dayOfYear(d('2026-12-31'))).toBe(365);
	});
	it('năm nhuận có 366 ngày', () => {
		expect(dayOfYear(d('2028-12-31'))).toBe(366);
	});
});

describe('định dạng hiển thị', () => {
	it('ngày dài kiểu Mỹ', () => {
		expect(formatLongDate(d('2027-03-23'))).toBe('Tuesday, March 23, 2027');
		expect(formatWeekday(d('2027-03-23'))).toBe('Tuesday');
	});
	it('ngày cho lịch iCalendar', () => {
		expect(formatIcsDate(d('2027-03-23'))).toBe('20270323');
	});
});

describe('localTodayAsUtc', () => {
	it('lấy ngày theo múi giờ máy chứ không phải theo UTC', () => {
		// 23:30 giờ địa phương ngày 18 -> vẫn phải là ngày 18, dù UTC có thể đã sang 19.
		const now = new Date(2026, 10, 18, 23, 30);
		expect(formatIsoDate(localTodayAsUtc(now))).toBe('2026-11-18');
	});
});

describe('buildIcs', () => {
	const ics = buildIcs({
		date: d('2027-03-23'),
		title: '18 weeks from today',
		description: 'Counted from November 18, 2026',
		url: 'https://privatetoolhub.com/en/weeks-from-today/18/',
		stamp: new Date('2026-11-18T10:00:00Z'),
	});
	it('là một VEVENT cả ngày hợp lệ', () => {
		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('DTSTART;VALUE=DATE:20270323');
		expect(ics).toContain('END:VCALENDAR');
	});
	it('DTEND là ngày kế tiếp (mốc loại trừ)', () => {
		expect(ics).toContain('DTEND;VALUE=DATE:20270324');
	});
	it('dùng CRLF và escape dấu phẩy', () => {
		expect(ics).toContain('\r\n');
		expect(ics).toContain('Counted from November 18\\, 2026');
	});
	it('không có dòng nào quá 75 ký tự', () => {
		expect(ics.split('\r\n').filter((l) => l.length > 75)).toEqual([]);
	});
});
