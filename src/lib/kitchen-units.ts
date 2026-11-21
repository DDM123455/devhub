/**
 * Quy đổi đơn vị đong trong bếp.
 *
 * Mọi đơn vị thể tích quy về millilitre rồi mới đổi tiếp, nên chỉ cần một hằng số cho mỗi
 * đơn vị thay vì một bảng tra chéo dễ sai.
 *
 * Hằng số theo hệ US customary — đây là hệ mà phần lớn công thức nấu ăn tiếng Anh dùng.
 * Thìa cà phê "metric" tròn 5 ml (Úc, châu Âu) lệch khoảng 1,4%; thìa canh Úc là 20 ml
 * chứ không phải 15, tức lệch hẳn một phần ba. Trang nào dùng các hằng số này đều phải
 * nói rõ là hệ US, nếu không người đọc Úc sẽ cân sai.
 */

export const ML_PER_TSP = 4.92892;
export const ML_PER_TBSP = 14.78676; // đúng bằng 3 tsp
export const ML_PER_FLOZ = 29.5735;
export const ML_PER_CUP = 236.588;

/** Thìa cà phê theo chuẩn mét (Úc, châu Âu, Canada): tròn 5 ml. */
export const ML_PER_METRIC_TSP = 5;
/** Thìa canh Úc: 20 ml, bằng 4 thìa cà phê chứ không phải 3. */
export const ML_PER_AUS_TBSP = 20;

export type VolumeUnit = 'tsp' | 'tbsp' | 'ml' | 'floz' | 'cup';

const ML_PER: Record<VolumeUnit, number> = {
	tsp: ML_PER_TSP,
	tbsp: ML_PER_TBSP,
	ml: 1,
	floz: ML_PER_FLOZ,
	cup: ML_PER_CUP,
};

export function convertVolume(value: number, from: VolumeUnit, to: VolumeUnit): number {
	return value * (ML_PER[from] / ML_PER[to]);
}

export interface Ingredient {
	id: string;
	/** Khối lượng riêng, gam trên millilitre. */
	density: number;
}

/**
 * Khối lượng riêng của các nguyên liệu hay gặp, lấy theo giá trị quy đổi thông dụng của
 * USDA FoodData Central. Đây là con số gần đúng: bột mì xúc đầy thìa rồi gạt ngang nặng hơn
 * bột rây, đường nâu tuỳ mức nén, muối hạt to nhẹ hơn muối tinh ở cùng thể tích. Cân vẫn
 * chính xác hơn đong, và công thức làm bánh nghiêm túc nào cũng cho khối lượng.
 */
export const INGREDIENTS: Ingredient[] = [
	{ id: 'water', density: 1.0 },
	{ id: 'sugar', density: 0.845 },
	{ id: 'brownSugar', density: 0.93 },
	{ id: 'salt', density: 1.217 },
	{ id: 'flour', density: 0.529 },
	{ id: 'butter', density: 0.911 },
	{ id: 'oliveOil', density: 0.918 },
	{ id: 'honey', density: 1.42 },
	{ id: 'bakingSoda', density: 0.97 },
	{ id: 'bakingPowder', density: 0.81 },
	{ id: 'cocoa', density: 0.51 },
	{ id: 'cinnamon', density: 0.53 },
];

export const DEFAULT_INGREDIENT = 'water';

export function findIngredient(id: string): Ingredient {
	return INGREDIENTS.find((item) => item.id === id) ?? INGREDIENTS[0];
}

/** Gam = thể tích (ml) × khối lượng riêng (g/ml). */
export function volumeToGrams(value: number, from: VolumeUnit, ingredientId: string): number {
	return convertVolume(value, from, 'ml') * findIngredient(ingredientId).density;
}

export function gramsToVolume(grams: number, to: VolumeUnit, ingredientId: string): number {
	return convertVolume(grams / findIngredient(ingredientId).density, 'ml', to);
}

/** Mẫu số mà bộ đong trong bếp thật sự có; 1/5 hay 1/7 thìa là vô nghĩa. */
const KITCHEN_DENOMINATORS = [2, 3, 4, 6, 8, 16];

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/**
 * Đổi số thập phân sang phân số đong được trong bếp, ví dụ 1.333 -> "1 1/3".
 * Trả về null khi không có phân số nào đủ gần (sai số trên 0,5%) — lúc đó hiển thị số thập
 * phân trung thực hơn là bịa ra một phân số sai.
 */
export function toKitchenFraction(value: number, tolerance = 0.005): string | null {
	if (!Number.isFinite(value) || value < 0) return null;
	const whole = Math.floor(value);
	const remainder = value - whole;

	if (remainder < tolerance) return whole === 0 && value > 0 ? null : String(whole);

	let best: { numerator: number; denominator: number; error: number } | null = null;
	for (const denominator of KITCHEN_DENOMINATORS) {
		const numerator = Math.round(remainder * denominator);
		if (numerator <= 0 || numerator >= denominator) continue;
		const error = Math.abs(remainder - numerator / denominator);
		if (!best || error < best.error) best = { numerator, denominator, error };
	}
	if (!best) {
		// Phần dư rất sát 1: làm tròn lên thành số nguyên kế tiếp.
		return 1 - remainder < tolerance ? String(whole + 1) : null;
	}
	if (best.error > tolerance) return null;

	const divisor = gcd(best.numerator, best.denominator);
	const fraction = `${best.numerator / divisor}/${best.denominator / divisor}`;
	return whole === 0 ? fraction : `${whole} ${fraction}`;
}

/**
 * Làm tròn để hiển thị: giữ đủ chữ số có nghĩa cho số nhỏ (0.25 ml) mà không kéo dài lê thê
 * cho số lớn (237 ml).
 */
export function formatAmount(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const abs = Math.abs(value);
	if (abs > 0 && abs < 0.001) return String(Number(value.toPrecision(3)));
	const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
	return String(Number(value.toFixed(decimals)));
}

/** "1-2" trong URL nghĩa là 1/2; "1" là 1; "1-1-2" là 1 1/2. */
export function parseUrlAmount(segment: string): number | null {
	const parts = segment.split('-');
	if (parts.some((part) => !/^\d+$/.test(part))) return null;
	const numbers = parts.map(Number);
	if (numbers.length === 1) return numbers[0];
	if (numbers.length === 2) return numbers[1] === 0 ? null : numbers[0] / numbers[1];
	if (numbers.length === 3) return numbers[2] === 0 ? null : numbers[0] + numbers[1] / numbers[2];
	return null;
}

/** Ngược lại với parseUrlAmount, để sinh đường dẫn. */
export function amountToUrl(value: number): string {
	if (Number.isInteger(value)) return String(value);
	const fraction = toKitchenFraction(value);
	if (!fraction) return String(value).replace('.', '-');
	return fraction.replace(/[ /]/g, '-');
}

/** Nhãn người đọc: 0.5 -> "1/2", 1.5 -> "1 1/2", 60 -> "60". */
export function amountToLabel(value: number): string {
	return toKitchenFraction(value) ?? formatAmount(value);
}
