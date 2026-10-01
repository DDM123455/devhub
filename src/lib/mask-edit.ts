/** Logic thuần cho bộ chỉnh mask (brush Restore/Erase) của Xoá nền: toạ độ, nét vẽ, lịch sử undo/redo. */

export type BrushMode = 'erase' | 'restore';

export interface Point {
	x: number;
	y: number;
}

/** Một nét vẽ, toạ độ và bán kính ở không gian ẢNH GỐC (full-res) để phát lại ở mọi độ phân giải. */
export interface Stroke {
	mode: BrushMode;
	radius: number;
	points: Point[];
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Đổi toạ độ con trỏ (client) sang toạ độ ảnh gốc, dựa trên hình chữ nhật hiển thị của canvas. */
export function pointerToImage(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number; width: number; height: number },
	imageWidth: number,
	imageHeight: number,
): Point {
	if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
	return {
		x: ((clientX - rect.left) / rect.width) * imageWidth,
		y: ((clientY - rect.top) / rect.height) * imageHeight,
	};
}

/** Hộp bao (đã kẹp trong ảnh) của một đoạn nét tròn đầu từ a tới b với bán kính radius. */
export function segmentBounds(a: Point, b: Point, radius: number, width: number, height: number): Rect {
	const pad = radius + 2;
	const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad));
	const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad));
	const x1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) + pad));
	const y1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) + pad));
	return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Bán kính cọ (không gian ảnh gốc) từ kích thước cọ hiển thị (px màn hình) và tỉ lệ canvas→màn hình. */
export function brushRadiusInImage(brushSizeScreenPx: number, imageWidth: number, displayWidth: number): number {
	if (displayWidth <= 0) return Math.max(1, brushSizeScreenPx / 2);
	return Math.max(1, (brushSizeScreenPx / 2) * (imageWidth / displayWidth));
}

export interface MaskHistory {
	strokes: Stroke[];
	redoStack: Stroke[];
}

export const EMPTY_HISTORY: MaskHistory = { strokes: [], redoStack: [] };

/** Thêm nét mới; xoá hàng đợi redo (hành vi chuẩn). Giới hạn số nét lưu để không phình bộ nhớ. */
export function pushStroke(history: MaskHistory, stroke: Stroke, maxStrokes = 500): MaskHistory {
	const strokes = [...history.strokes, stroke];
	if (strokes.length > maxStrokes) strokes.splice(0, strokes.length - maxStrokes);
	return { strokes, redoStack: [] };
}

export function undoStroke(history: MaskHistory): MaskHistory {
	if (history.strokes.length === 0) return history;
	const strokes = history.strokes.slice(0, -1);
	return { strokes, redoStack: [...history.redoStack, history.strokes[history.strokes.length - 1]] };
}

export function redoStroke(history: MaskHistory): MaskHistory {
	if (history.redoStack.length === 0) return history;
	const redoStack = history.redoStack.slice(0, -1);
	return { strokes: [...history.strokes, history.redoStack[history.redoStack.length - 1]], redoStack };
}

/** Bỏ các điểm nằm quá gần điểm trước (giảm số điểm khi di chuột chậm). */
export function shouldAddPoint(last: Point | undefined, next: Point, minDistance: number): boolean {
	if (!last) return true;
	return Math.hypot(next.x - last.x, next.y - last.y) >= minDistance;
}
