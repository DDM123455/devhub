import { describe, it, expect } from 'vitest';
import { safeVideoExt, isVideoFile } from '../media-ext';

describe('media-ext', () => {
	it('ưu tiên đuôi whitelist', () => {
		expect(safeVideoExt({ name: 'Clip.MOV', type: '' })).toBe('mov');
	});
	it('không có đuôi -> suy từ mime', () => {
		expect(safeVideoExt({ name: 'clip', type: 'video/webm' })).toBe('webm');
		expect(safeVideoExt({ name: 'clip', type: '' })).toBe('mp4');
	});
	it('đuôi lạ -> mp4 hoặc mime', () => {
		expect(safeVideoExt({ name: 'a.exe', type: '' })).toBe('mp4');
		expect(safeVideoExt({ name: 'a.xyz', type: 'video/x-matroska' })).toBe('mkv');
	});
	it('isVideoFile', () => {
		expect(isVideoFile({ name: 'a.txt', type: 'text/plain' })).toBe(false);
		expect(isVideoFile({ name: 'a.mkv', type: '' })).toBe(true);
		expect(isVideoFile({ name: 'a', type: 'video/mp4' })).toBe(true);
	});
});
