import { describe, expect, it } from 'vitest';
import { buildDocumentXml, buildDocxBlob, buildDocxParts, splitParagraphs } from '../docx-export';

describe('splitParagraphs', () => {
	it('tách theo dòng và bỏ khoảng trắng thừa', () => {
		expect(splitParagraphs('  một  \nhai\n')).toEqual(['một', 'hai']);
	});
	it('bỏ dòng trống ở đầu và cuối, giữ dòng trống ở giữa', () => {
		expect(splitParagraphs('\n\nmột\n\nhai\n\n')).toEqual(['một', '', 'hai']);
	});
	it('chuẩn hoá xuống dòng kiểu Windows', () => {
		expect(splitParagraphs('một\r\nhai')).toEqual(['một', 'hai']);
	});
	it('loại ký tự điều khiển mà OCR có thể nhả ra', () => {
		expect(splitParagraphs('xin\u0000 chào')).toEqual(['xin chào']);
	});
	it('văn bản rỗng cho mảng rỗng', () => {
		expect(splitParagraphs('   \n  ')).toEqual([]);
	});
});

describe('buildDocumentXml', () => {
	it('mỗi đoạn là một thẻ w:p', () => {
		const xml = buildDocumentXml(['một', 'hai']);
		expect(xml.match(/<w:p>/g)).toHaveLength(2);
	});
	it('escape đủ năm ký tự XML', () => {
		const xml = buildDocumentXml(['a & b < c > d " e \' f']);
		expect(xml).toContain('a &amp; b &lt; c &gt; d &quot; e &apos; f');
		// Không được còn dấu & trần nào ngoài các thực thể đã escape.
		expect(xml.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toContain('&');
	});
	it('giữ nguyên tiếng Việt có dấu', () => {
		expect(buildDocumentXml(['Chuyển ảnh sang văn bản'])).toContain('Chuyển ảnh sang văn bản');
	});
	it('giữ khoảng trắng đầu dòng bằng xml:space', () => {
		expect(buildDocumentXml(['  thụt lề'])).toContain('xml:space="preserve"');
	});
});

describe('buildDocxParts', () => {
	const parts = buildDocxParts('Xin chào');
	it('có đủ ba phần bắt buộc của một .docx', () => {
		expect(Object.keys(parts).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
	});
	it('mỗi phần là XML hợp lệ, có khai báo đầu file', () => {
		for (const content of Object.values(parts)) {
			expect(content.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
		}
	});
	it('quan hệ gốc trỏ đúng vào word/document.xml', () => {
		expect(parts['_rels/.rels']).toContain('Target="word/document.xml"');
	});
});

describe('buildDocxBlob', () => {
	it('tạo được Blob mang đúng MIME của Word', async () => {
		const blob = await buildDocxBlob('Xin chào\nDòng hai');
		expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
		expect(blob.size).toBeGreaterThan(0);
	});
	it('là file ZIP thật (bắt đầu bằng chữ ký PK)', async () => {
		const bytes = new Uint8Array(await (await buildDocxBlob('Xin chào')).arrayBuffer());
		expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
	});
});
