/**
 * Cụm trang "N weeks from today".
 *
 * Chỉ sinh trang cho những mốc người ta thật sự tìm, mỗi mốc có một đoạn nội dung riêng
 * (xem `cluster-weeks.json`). Cố tình KHÔNG sinh đủ 1–52: 52 trang gần giống nhau trên một
 * tên miền còn non là đúng thứ mà chính sách "scaled content abuse" của Google nhắm tới.
 * Bảng trên trang hub vẫn tính sẵn kết quả cho cả 1–52 nên không ai bị thiếu thông tin.
 */
export const WEEK_MILESTONES = [1, 2, 3, 4, 6, 7, 9, 12, 13, 15, 18, 24, 40, 52] as const;

export type WeekMilestone = (typeof WEEK_MILESTONES)[number];

/** Toàn bộ các mốc hiển thị trong bảng tra nhanh của trang hub. */
export const WEEK_TABLE_ROWS = Array.from({ length: 52 }, (_, i) => i + 1);

export function hasWeekPage(n: number): n is WeekMilestone {
	return (WEEK_MILESTONES as readonly number[]).includes(n);
}

/** Mốc có trang gần nhất ở hai phía, dùng cho link "điều hướng lân cận". */
export function neighbouringWeeks(n: number): { previous?: number; next?: number } {
	const sorted = [...WEEK_MILESTONES].sort((a, b) => a - b);
	return {
		previous: [...sorted].reverse().find((m) => m < n),
		next: sorted.find((m) => m > n),
	};
}
