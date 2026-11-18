import type { VolumeUnit } from '@/lib/kitchen-units';

/**
 * Các cặp đơn vị có trang riêng.
 *
 * Chỉ mở trang con cho những giá trị người ta thật sự gõ vào ô tìm kiếm. Các cặp còn lại
 * chỉ có trang hub kèm bảng quy đổi đầy đủ — một bảng kín đáp ứng được mọi con số mà không
 * phải đẻ ra hàng trăm trang gần giống nhau.
 */
export interface ConvertPair {
	slug: string;
	from: VolumeUnit;
	/** 'grams' là quy đổi theo khối lượng, phụ thuộc nguyên liệu. */
	to: VolumeUnit | 'grams';
	/** Các giá trị có trang riêng; rỗng nghĩa là cặp này chỉ có hub. */
	values: number[];
	/** Cặp theo chiều ngược lại, để hai bên link qua lại. */
	reverse?: string;
	/** Các giá trị hiển thị trong bảng quy đổi trên hub. */
	tableValues: number[];
}

const FRACTIONS = [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const MILLILITRES = [1, 2.5, 5, 10, 15, 20, 30, 45, 60, 100, 120, 240, 250, 500];

export const CONVERT_PAIRS: ConvertPair[] = [
	{ slug: 'tsp-to-ml', from: 'tsp', to: 'ml', values: [0.25, 0.5, 0.75, 1, 2], reverse: 'ml-to-tsp', tableValues: FRACTIONS },
	{ slug: 'tsp-to-tbsp', from: 'tsp', to: 'tbsp', values: [3, 4, 6, 8], reverse: 'tbsp-to-tsp', tableValues: FRACTIONS },
	{ slug: 'tsp-to-grams', from: 'tsp', to: 'grams', values: [1], tableValues: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] },
	{ slug: 'tsp-to-cups', from: 'tsp', to: 'cup', values: [], tableValues: [1, 2, 3, 4, 6, 8, 12, 16, 24, 48] },
	{ slug: 'ml-to-oz', from: 'ml', to: 'floz', values: [60], reverse: 'oz-to-ml', tableValues: MILLILITRES },
	{ slug: 'ml-to-tbsp', from: 'ml', to: 'tbsp', values: [30], reverse: 'tbsp-to-ml', tableValues: MILLILITRES },
	{ slug: 'ml-to-tsp', from: 'ml', to: 'tsp', values: [], reverse: 'tsp-to-ml', tableValues: MILLILITRES },
	{ slug: 'tbsp-to-tsp', from: 'tbsp', to: 'tsp', values: [], reverse: 'tsp-to-tbsp', tableValues: FRACTIONS },
	{ slug: 'tbsp-to-ml', from: 'tbsp', to: 'ml', values: [], reverse: 'ml-to-tbsp', tableValues: FRACTIONS },
	{ slug: 'oz-to-ml', from: 'floz', to: 'ml', values: [], reverse: 'ml-to-oz', tableValues: FRACTIONS },
];

export function findPair(slug: string): ConvertPair | undefined {
	return CONVERT_PAIRS.find((pair) => pair.slug === slug);
}
