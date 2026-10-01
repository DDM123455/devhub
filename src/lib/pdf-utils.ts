export interface PositionRange {
	start: number;
	end: number;
}

export class RangeParseError extends Error {
	constructor(public token: string) {
		super('Invalid page range: ' + token);
	}
}

/**
 * Phân tích chuỗi khoảng trang "1-3, 5, 7 - 9". Cho phép khoảng trắng quanh dấu '-' (và – —).
 * Chuỗi rỗng = từng trang một.
 */
export function parseRanges(input: string, pageCount: number): PositionRange[] {
	const trimmed = input.trim();
	if (trimmed === '') {
		return Array.from({ length: pageCount }, (_, index) => ({ start: index + 1, end: index + 1 }));
	}
	return trimmed.split(/[,;]/).map((token) => {
		const part = token.trim();
		const singleMatch = /^(\d+)$/.exec(part);
		const rangeMatch = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part);
		let start: number;
		let end: number;
		if (singleMatch) {
			start = end = Number(singleMatch[1]);
		} else if (rangeMatch) {
			start = Number(rangeMatch[1]);
			end = Number(rangeMatch[2]);
		} else {
			throw new RangeParseError(part);
		}
		if (start < 1 || end < start || end > pageCount) throw new RangeParseError(part);
		return { start, end };
	});
}

export function everyNRanges(n: number, pageCount: number): PositionRange[] {
	const chunks: PositionRange[] = [];
	for (let start = 1; start <= pageCount; start += n) {
		chunks.push({ start, end: Math.min(start + n - 1, pageCount) });
	}
	return chunks;
}

/** Cộng góc xoay người dùng chọn với /Rotate gốc của trang, chuẩn hoá về 0..359. */
export function combineRotation(baseAngle: number, userRotation: number): number {
	return (((baseAngle + userRotation) % 360) + 360) % 360;
}

/** Lỗi do PDF có mật khẩu (pdf.js PasswordException hoặc pdf-lib EncryptedPDFError). */
export function isPasswordError(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const e = err as { name?: string; message?: string };
	return (
		e.name === 'PasswordException' ||
		e.name === 'EncryptedPDFError' ||
		/encrypted|password/i.test(e.message ?? '')
	);
}
