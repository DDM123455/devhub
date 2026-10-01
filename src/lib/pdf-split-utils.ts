/** Logic thuần cho Tách PDF: tách theo dung lượng, theo bookmark, mẫu tên file, trang lẻ/chẵn. */

export interface SizeGroup {
	/** Chỉ số bắt đầu (0-based, bao gồm). */
	start: number;
	/** Chỉ số kết thúc (không bao gồm). */
	end: number;
	/** true nếu chỉ riêng 1 trang đã vượt giới hạn. */
	oversize: boolean;
}

/**
 * Tách tuần tự thành các nhóm trang liên tiếp sao cho mỗi nhóm <= limitBytes (tham lam, tối đa trang
 * mỗi nhóm). `measure(start, endExclusive)` trả về dung lượng thật khi ghi các trang đó. Dùng
 * gallop (nhân đôi) + tìm nhị phân nên mỗi nhóm chỉ tốn ~2·log2(k) lần đo. Trang đơn đã vượt
 * giới hạn vẫn được xuất thành file riêng, đánh dấu oversize.
 */
export async function splitBySize(
	pageCount: number,
	measure: (start: number, endExclusive: number) => Promise<number>,
	limitBytes: number,
): Promise<SizeGroup[]> {
	const groups: SizeGroup[] = [];
	let start = 0;
	while (start < pageCount) {
		const remaining = pageCount - start;
		const single = await measure(start, start + 1);
		if (single > limitBytes) {
			groups.push({ start, end: start + 1, oversize: true });
			start += 1;
			continue;
		}
		let good = 1;
		let bad = 0;
		while (good < remaining) {
			const next = Math.min(remaining, good * 2);
			if ((await measure(start, start + next)) <= limitBytes) good = next;
			else {
				bad = next;
				break;
			}
		}
		while (bad - good > 1) {
			const mid = (good + bad) >> 1;
			if ((await measure(start, start + mid)) <= limitBytes) good = mid;
			else bad = mid;
		}
		groups.push({ start, end: start + good, oversize: false });
		start += good;
	}
	return groups;
}

export interface OutlineEntry {
	title: string;
	/** Chỉ số trang 0-based của đích bookmark. */
	pageIndex: number;
}

export interface BookmarkGroup {
	/** Chỉ số trang 0-based, bao gồm cả hai đầu. */
	start: number;
	end: number;
	title: string;
}

/**
 * Từ danh sách bookmark (đã giải đích sang số trang) tạo các đoạn: mỗi bookmark bắt đầu một đoạn
 * kéo tới trước bookmark kế. Bookmark trùng trang giữ cái đầu; trang trước bookmark đầu tiên
 * (nếu có) thành đoạn "front" (titleForFront). Đích ngoài phạm vi bị bỏ.
 */
export function bookmarkGroups(entries: OutlineEntry[], pageCount: number, titleForFront = ''): BookmarkGroup[] {
	const valid = entries
		.filter((e) => Number.isInteger(e.pageIndex) && e.pageIndex >= 0 && e.pageIndex < pageCount)
		.map((e, order) => ({ ...e, order }))
		.sort((a, b) => a.pageIndex - b.pageIndex || a.order - b.order);
	const unique: OutlineEntry[] = [];
	for (const entry of valid) {
		if (unique.length === 0 || unique[unique.length - 1].pageIndex !== entry.pageIndex) unique.push(entry);
	}
	if (unique.length === 0) return [];
	const groups: BookmarkGroup[] = [];
	if (unique[0].pageIndex > 0) groups.push({ start: 0, end: unique[0].pageIndex - 1, title: titleForFront });
	unique.forEach((entry, i) => {
		const next = unique[i + 1];
		groups.push({ start: entry.pageIndex, end: next ? next.pageIndex - 1 : pageCount - 1, title: entry.title });
	});
	return groups;
}

/** Làm sạch chuỗi để làm tên file (bỏ ký tự cấm, gom khoảng trắng, giới hạn độ dài). */
export function sanitizeFileName(input: string, fallback = 'file'): string {
	// eslint-disable-next-line no-control-regex
	const cleaned = input
		.replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
		.replace(/[. ]+$/, '')
		.slice(0, 80)
		.trim();
	return cleaned === '' ? fallback : cleaned;
}

export interface NameVars {
	name: string;
	n: number;
	range: string;
	title: string;
}

/**
 * Áp mẫu tên: {name} tên file gốc (không đuôi), {n} số thứ tự, {range} dải trang (vd 1-3),
 * {title} tiêu đề bookmark. Luôn đảm bảo đuôi .pdf. Mẫu rỗng -> trả null để dùng tên mặc định.
 */
export function applyNameTemplate(template: string, vars: NameVars): string | null {
	const trimmed = template.trim();
	if (trimmed === '') return null;
	const filled = trimmed
		.replace(/\{name\}/gi, vars.name)
		.replace(/\{n\}/gi, String(vars.n))
		.replace(/\{range\}/gi, vars.range)
		.replace(/\{title\}/gi, vars.title);
	const base = sanitizeFileName(filled.replace(/\.pdf$/i, ''), `part-${vars.n}`);
	return base + '.pdf';
}

export function rangeLabel(startPos: number, endPos: number): string {
	return startPos === endPos ? String(startPos) : `${startPos}-${endPos}`;
}

/** Vị trí (0-based) của trang lẻ / chẵn theo số thứ tự hiển thị 1-based. */
export function parityIndexes(count: number, parity: 'odd' | 'even'): number[] {
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const humanNumber = i + 1;
		if ((humanNumber % 2 === 1) === (parity === 'odd')) out.push(i);
	}
	return out;
}
