/** Logic thuần cho Gộp PDF: sắp xếp theo file, đánh số trang, nhận diện loại file, đọc EXIF orientation. */

export type MergeSortMode = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

export interface MergeFileMeta {
	name: string;
	lastModified: number;
}

export interface SortablePage {
	fileId: string;
	kind: 'pdf' | 'image' | 'blank';
}

/**
 * Sắp xếp các "nhóm trang" theo file (tên tự nhiên A→Z/Z→A hoặc ngày sửa). Thứ tự trang trong cùng
 * một file giữ nguyên. Trang trắng dính vào nhóm của trang đứng ngay trước nó (trang trắng đầu
 * danh sách thành nhóm riêng luôn nằm đầu). Sort ổn định: key bằng nhau giữ thứ tự cũ.
 */
export function sortPageGroups<T extends SortablePage>(
	pages: T[],
	meta: Map<string, MergeFileMeta>,
	mode: MergeSortMode,
): T[] {
	const groups: { fileId: string; pages: T[]; leadingBlank: boolean }[] = [];
	for (const page of pages) {
		const last = groups[groups.length - 1];
		if (page.kind === 'blank') {
			if (last) last.pages.push(page);
			else groups.push({ fileId: page.fileId, pages: [page], leadingBlank: true });
			continue;
		}
		const existing = groups.find((g) => g.fileId === page.fileId && !g.leadingBlank);
		if (existing) {
			// Cùng file nhưng bị chen bởi file khác (do kéo thả): gom về nhóm đầu tiên của file đó.
			existing.pages.push(page);
		} else {
			groups.push({ fileId: page.fileId, pages: [page], leadingBlank: false });
		}
	}
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
	const indexed = groups.map((group, index) => ({ group, index }));
	indexed.sort((a, b) => {
		if (a.group.leadingBlank !== b.group.leadingBlank) return a.group.leadingBlank ? -1 : 1;
		const ma = meta.get(a.group.fileId);
		const mb = meta.get(b.group.fileId);
		let diff = 0;
		if (ma && mb) {
			if (mode === 'name-asc') diff = collator.compare(ma.name, mb.name);
			else if (mode === 'name-desc') diff = collator.compare(mb.name, ma.name);
			else if (mode === 'date-asc') diff = ma.lastModified - mb.lastModified;
			else diff = mb.lastModified - ma.lastModified;
		}
		return diff !== 0 ? diff : a.index - b.index;
	});
	return indexed.flatMap((entry) => entry.group.pages);
}

export interface PageNumberPlacement {
	x: number;
	y: number;
	/** Góc xoay của chữ (độ, ngược chiều kim đồng hồ - quy ước PDF). */
	rotate: number;
}

/**
 * Vị trí số trang ở giữa mép dưới NHÌN THẤY của trang (đã tính /Rotate của trang). width/height là
 * kích thước chưa xoay (page.getSize()). textWidth là bề rộng chữ ở cỡ đang dùng, margin cách mép.
 */
export function computePageNumberPlacement(
	width: number,
	height: number,
	rotationAngle: number,
	textWidth: number,
	margin = 18,
): PageNumberPlacement {
	const angle = (((rotationAngle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
	switch (angle) {
		case 90:
			return { x: width - margin, y: height / 2 - textWidth / 2, rotate: 90 };
		case 180:
			return { x: width / 2 + textWidth / 2, y: height - margin, rotate: 180 };
		case 270:
			return { x: margin, y: height / 2 + textWidth / 2, rotate: 270 };
		default:
			return { x: width / 2 - textWidth / 2, y: margin, rotate: 0 };
	}
}

export function isPdfFile(file: { name: string; type: string }): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

export function isMergeImageFile(file: { name: string; type: string }): boolean {
	return IMAGE_TYPES.has(file.type) || IMAGE_EXT.test(file.name);
}

export function isJpegFile(file: { name: string; type: string }): boolean {
	return file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
}

export function isPngFile(file: { name: string; type: string }): boolean {
	return file.type === 'image/png' || /\.png$/i.test(file.name);
}

/** Đọc EXIF Orientation (1..8) của JPEG. Trả 1 nếu không có / không đọc được. */
export function readJpegOrientation(bytes: Uint8Array): number {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
	let offset = 2;
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) return 1;
		const marker = bytes[offset + 1];
		if (marker === 0xd9 || marker === 0xda) return 1;
		const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
		if (marker === 0xe1 && offset + 10 <= bytes.length) {
			const isExif =
				bytes[offset + 4] === 0x45 &&
				bytes[offset + 5] === 0x78 &&
				bytes[offset + 6] === 0x69 &&
				bytes[offset + 7] === 0x66 &&
				bytes[offset + 8] === 0 &&
				bytes[offset + 9] === 0;
			if (isExif) {
				const tiff = offset + 10;
				const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
				const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
				if (!little && !big) return 1;
				const u16 = (p: number) =>
					p + 1 < bytes.length ? (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]) : 0;
				const u32 = (p: number) =>
					little
						? (u16(p) | (u16(p + 2) << 16)) >>> 0
						: ((u16(p) << 16) | u16(p + 2)) >>> 0;
				const ifd = tiff + u32(tiff + 4);
				const count = u16(ifd);
				for (let i = 0; i < count; i++) {
					const entry = ifd + 2 + i * 12;
					if (entry + 12 > bytes.length) return 1;
					if (u16(entry) === 0x0112) {
						const value = u16(entry + 8);
						return value >= 1 && value <= 8 ? value : 1;
					}
				}
				return 1;
			}
		}
		offset += 2 + size;
	}
	return 1;
}
