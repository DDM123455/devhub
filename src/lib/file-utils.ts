/** Tách tên file thành [base, ext] (ext gồm dấu chấm, hoặc ''). */
export function splitExt(name: string): [string, string] {
	const i = name.lastIndexOf('.');
	if (i <= 0) return [name, ''];
	return [name.slice(0, i), name.slice(i)];
}

/**
 * Trả về tên chưa dùng (so sánh KHÔNG phân biệt hoa thường), thêm hậu tố -1, -2... trước đuôi.
 * `used` được cập nhật (lưu dạng lowercase).
 */
export function dedupeName(name: string, used: Set<string>): string {
	let candidate = name;
	if (used.has(candidate.toLowerCase())) {
		const [base, ext] = splitExt(name);
		let n = 1;
		do {
			candidate = base + '-' + n + ext;
			n++;
		} while (used.has(candidate.toLowerCase()));
	}
	used.add(candidate.toLowerCase());
	return candidate;
}

/** Tên gốc không đuôi, an toàn để ghép đuôi mới (trả fallback nếu rỗng). */
export function baseNameOf(name: string, fallback = 'file'): string {
	const [base] = splitExt(name);
	const cleaned = base.trim();
	return cleaned === '' ? fallback : cleaned;
}

/** Dung lượng nhỏ hơn: trả về số byte tiết kiệm (>=0) và % (0..100, không NaN). */
export function computeReduction(originalSize: number, newSize: number): { savedBytes: number; percent: number } {
	if (!Number.isFinite(originalSize) || !Number.isFinite(newSize) || originalSize <= 0) {
		return { savedBytes: 0, percent: 0 };
	}
	const savedBytes = Math.max(0, originalSize - newSize);
	const percent = Math.min(100, Math.max(0, Math.round((savedBytes / originalSize) * 100)));
	return { savedBytes, percent };
}
