import { describe, expect, it } from 'vitest';
import {
	ML_PER_TSP,
	amountToLabel,
	amountToUrl,
	convertVolume,
	formatAmount,
	gramsToVolume,
	parseUrlAmount,
	toKitchenFraction,
	volumeToGrams,
} from '../kitchen-units';

const near = (actual: number, expected: number, places = 2) => expect(actual).toBeCloseTo(expected, places);

describe('convertVolume', () => {
	it('các con số then chốt trong spec', () => {
		near(convertVolume(1, 'tsp', 'ml'), 4.93);
		near(convertVolume(4, 'tsp', 'tbsp'), 1.333, 3);
		near(convertVolume(60, 'ml', 'floz'), 2.03);
		near(convertVolume(30, 'ml', 'tbsp'), 2.03);
	});
	it('3 thìa cà phê đúng bằng 1 thìa canh', () => {
		near(convertVolume(3, 'tsp', 'tbsp'), 1, 6);
		near(convertVolume(1, 'tbsp', 'tsp'), 3, 6);
	});
	it('1 cup = 16 thìa canh = 48 thìa cà phê', () => {
		near(convertVolume(1, 'cup', 'tbsp'), 16, 2);
		near(convertVolume(1, 'cup', 'tsp'), 48, 1);
	});
	it('1 US fl oz = 2 thìa canh', () => {
		near(convertVolume(1, 'floz', 'tbsp'), 2, 2);
	});
	it('đổi đi rồi đổi lại ra số ban đầu', () => {
		near(convertVolume(convertVolume(7, 'tsp', 'cup'), 'cup', 'tsp'), 7, 6);
	});
	it('cùng một đơn vị thì giữ nguyên', () => {
		expect(convertVolume(12.5, 'ml', 'ml')).toBe(12.5);
	});
});

describe('volumeToGrams', () => {
	it('nước: 1 ml = 1 g nên 1 tsp = 4.93 g', () => {
		near(volumeToGrams(1, 'tsp', 'water'), ML_PER_TSP);
	});
	it('các giá trị quy đổi thông dụng', () => {
		near(volumeToGrams(1, 'tsp', 'sugar'), 4.16, 1);
		near(volumeToGrams(1, 'tsp', 'salt'), 6.0, 1);
		near(volumeToGrams(1, 'tsp', 'flour'), 2.61, 1);
		near(volumeToGrams(1, 'tsp', 'honey'), 7.0, 1);
	});
	it('nguyên liệu lạ thì về mặc định là nước chứ không ném lỗi', () => {
		near(volumeToGrams(1, 'tsp', 'khong-co-that'), ML_PER_TSP);
	});
	it('gramsToVolume là phép ngược lại', () => {
		near(gramsToVolume(volumeToGrams(2, 'tbsp', 'butter'), 'tbsp', 'butter'), 2, 6);
	});
});

describe('toKitchenFraction', () => {
	it('đổi được các phân số hay dùng', () => {
		expect(toKitchenFraction(0.5)).toBe('1/2');
		expect(toKitchenFraction(0.25)).toBe('1/4');
		expect(toKitchenFraction(0.75)).toBe('3/4');
		expect(toKitchenFraction(1.5)).toBe('1 1/2');
	});
	it('4 tsp = 1 1/3 tbsp', () => {
		expect(toKitchenFraction(convertVolume(4, 'tsp', 'tbsp'))).toBe('1 1/3');
	});
	it('8 tsp = 2 2/3 tbsp', () => {
		expect(toKitchenFraction(convertVolume(8, 'tsp', 'tbsp'))).toBe('2 2/3');
	});
	it('rút gọn phân số', () => {
		expect(toKitchenFraction(0.5)).toBe('1/2'); // không phải 8/16
		expect(toKitchenFraction(2.25)).toBe('2 1/4');
	});
	it('số nguyên không có phần phân số', () => {
		expect(toKitchenFraction(3)).toBe('3');
		expect(toKitchenFraction(0)).toBe('0');
	});
	it('phần dư sát 1 thì làm tròn lên', () => {
		expect(toKitchenFraction(1.999)).toBe('2');
	});
	it('trả null khi không có phân số bếp nào đủ gần', () => {
		expect(toKitchenFraction(2.03)).toBeNull(); // 60 ml sang fl oz: phải hiện số thập phân
		expect(toKitchenFraction(-1)).toBeNull();
		expect(toKitchenFraction(Number.NaN)).toBeNull();
	});
});

describe('formatAmount', () => {
	it('số càng lớn càng ít số lẻ', () => {
		expect(formatAmount(236.588)).toBe('237');
		expect(formatAmount(14.78676)).toBe('14.8');
		expect(formatAmount(4.92892)).toBe('4.93');
		expect(formatAmount(0.202884)).toBe('0.203');
	});
	it('bỏ số 0 thừa ở cuối', () => {
		expect(formatAmount(2.5)).toBe('2.5');
		expect(formatAmount(3)).toBe('3');
	});
});

describe('parseUrlAmount / amountToUrl', () => {
	it('đọc được số nguyên và phân số trong URL', () => {
		expect(parseUrlAmount('1')).toBe(1);
		expect(parseUrlAmount('1-2')).toBe(0.5);
		expect(parseUrlAmount('3-4')).toBe(0.75);
		expect(parseUrlAmount('1-1-2')).toBe(1.5);
	});
	it('từ chối đoạn URL không hợp lệ', () => {
		expect(parseUrlAmount('abc')).toBeNull();
		expect(parseUrlAmount('1-0')).toBeNull();
		expect(parseUrlAmount('')).toBeNull();
		expect(parseUrlAmount('1.5')).toBeNull();
	});
	it('sinh URL rồi đọc lại ra đúng số ban đầu', () => {
		for (const value of [0.25, 0.5, 0.75, 1, 1.5, 2, 4, 60]) {
			expect(parseUrlAmount(amountToUrl(value))).toBeCloseTo(value, 6);
		}
	});
});

describe('amountToLabel', () => {
	it('ưu tiên phân số, không được thì dùng thập phân', () => {
		expect(amountToLabel(0.5)).toBe('1/2');
		expect(amountToLabel(60)).toBe('60');
		expect(amountToLabel(2.0288)).toBe('2.03');
	});
});
