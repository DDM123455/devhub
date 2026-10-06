import { describe, expect, it } from 'vitest';
import {
	assemblePdfPages,
	cellValueToString,
	decodeXmlEntities,
	detectFileKind,
	detectZipKind,
	docxXmlToText,
	extractFromBuffer,
	FileExtractError,
	formatRow,
	isProbablyScannedPdf,
	joinHardWraps,
	looksBinary,
	MAX_FILE_BYTES,
	odfXmlToText,
	pdfItemsToText,
	pptxSlideOrder,
	pptxSlideXmlToText,
	rtfToText,
	sniffMagic,
} from '../file-diff-extract';

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => new TextEncoder().encode(s);

describe('file type detection', () => {
	it('sniffs magic bytes', () => {
		expect(sniffMagic(ascii('%PDF-1.7'))).toBe('pdf');
		expect(sniffMagic(bytes(0x50, 0x4b, 0x03, 0x04))).toBe('zip');
		expect(sniffMagic(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe('ole');
		expect(sniffMagic(ascii('{\\rtf1\\ansi'))).toBe('rtf');
		expect(sniffMagic(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image');
		expect(sniffMagic(ascii('hello'))).toBeNull();
	});
	it('detects kinds by name + bytes', () => {
		expect(detectFileKind('a.txt', 'text/plain', ascii('hi'))).toBe('text');
		expect(detectFileKind('a.PDF', '', ascii('%PDF-1.4'))).toBe('pdf');
		expect(detectFileKind('a.docx', '', bytes(0x50, 0x4b, 3, 4))).toBe('docx');
		expect(detectFileKind('a.xlsx', '', bytes(0x50, 0x4b, 3, 4))).toBe('xlsx');
		expect(detectFileKind('a.odt', '', bytes(0x50, 0x4b, 3, 4))).toBe('odt');
		expect(detectFileKind('noext', '', bytes(0x50, 0x4b, 3, 4))).toBe('unknown');
		expect(detectFileKind('a.rtf', '', ascii('{\\rtf1 x}'))).toBe('rtf');
		expect(detectFileKind('photo.png', 'image/png', bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image');
		expect(detectFileKind('x.svg', 'image/svg+xml', ascii('<svg/>'))).toBe('text');
	});
	it('flags legacy Office and encrypted OOXML (OLE containers)', () => {
		const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
		expect(detectFileKind('a.doc', '', ole)).toBe('legacyOffice');
		expect(detectFileKind('a.xls', '', ole)).toBe('legacyOffice');
		expect(detectFileKind('a.docx', '', ole)).toBe('ole');
	});
	it('refuses unknown binary content but accepts unknown text extensions', () => {
		expect(detectFileKind('a.exe', '', bytes(0x4d, 0x5a, 0, 1, 2, 0, 0, 3))).toBe('binary');
		expect(detectFileKind('Makefile', '', ascii('all:\n\tgcc'))).toBe('text');
		expect(detectFileKind('a.docx', '', ascii('just text pretending'))).toBe('text');
	});
	it('does not treat UTF-16 text as binary', () => {
		const utf16 = new Uint8Array([0xff, 0xfe, 0x68, 0, 0x69, 0, 0x21, 0]);
		expect(looksBinary(utf16)).toBe(false);
		expect(looksBinary(bytes(1, 2, 3, 0, 0, 4, 5, 6))).toBe(true);
	});
	it('maps zip entries to a document kind', () => {
		expect(detectZipKind(['word/document.xml', '[Content_Types].xml'])).toBe('docx');
		expect(detectZipKind(['xl/workbook.xml'])).toBe('xlsx');
		expect(detectZipKind(['ppt/presentation.xml'])).toBe('pptx');
		expect(detectZipKind(['content.xml'], 'application/vnd.oasis.opendocument.spreadsheet')).toBe('ods');
		expect(detectZipKind(['a.txt'])).toBeNull();
	});
});

describe('decodeXmlEntities / formatRow', () => {
	it('decodes entities', () => {
		expect(decodeXmlEntities('a &amp; b &lt;c&gt; &#65;&#x42; &quot;&apos;')).toBe('a & b <c> AB "\'');
		expect(decodeXmlEntities('&#99999999;')).toBe('&#99999999;');
	});
	it('formats rows, trimming trailing empty cells and stray tabs/newlines', () => {
		expect(formatRow(['a', 'b', '', ''], '\t')).toBe('a\tb');
		expect(formatRow(['a', '', 'c'], ' | ')).toBe('a |  | c');
		expect(formatRow(['x\ty', 'l1\nl2'], '\t')).toBe('x y\tl1 l2');
		expect(formatRow(['', ''], '\t')).toBe('');
	});
});

const W = (body: string) => `<w:document><w:body>${body}</w:body></w:document>`;
describe('docxXmlToText', () => {
	const xml = W(
		`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title &amp; more</w:t></w:r></w:p>` +
			`<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:t>world</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>x</w:t></w:r></w:p>` +
			`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>item</w:t></w:r></w:p>` +
			`<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr>` +
			`<w:tr><w:tc><w:p><w:r><w:t>A2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
			`<w:p><w:r><w:t>end</w:t></w:r><w:del w:id="1"><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>`,
	);
	it('keeps headings, lists and tables in structure mode', () => {
		const r = docxXmlToText(xml, true, ' | ');
		expect(r.text).toBe('# Title & more\nHello world\tx\n- item\nA1 | B1\nA2 | B2\nend');
		expect(r.trackedChanges).toBe(true);
	});
	it('plain mode drops markers and puts each cell paragraph on its own line', () => {
		const r = docxXmlToText(xml, false);
		expect(r.text).toBe('Title & more\nHello world\tx\nitem\nA1\nB1\nA2\nB2\nend');
	});
	it('excludes deleted text and handles line breaks', () => {
		const r = docxXmlToText(W('<w:p><w:r><w:t>a</w:t><w:br/><w:t>b</w:t></w:r></w:p>'), true);
		expect(r.text).toBe('a\nb');
		expect(r.trackedChanges).toBe(false);
	});
	it('does not mistake tab stops for tabs and handles nested tables', () => {
		const nested = W(
			'<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>t</w:t></w:r></w:p>' +
				'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>outer</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>inner</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc><w:tc><w:p><w:r><w:t>c2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
		);
		expect(docxXmlToText(nested, true, ' | ').text).toBe('t\nouter inner | c2');
	});
});

describe('odfXmlToText', () => {
	it('converts an ODT with headings, spaces, lists and skips comments', () => {
		const xml =
			'<office:text><text:h text:outline-level="2">Head</text:h><text:p>a<text:s text:c="2"/>b<text:tab/>c<text:line-break/>d</text:p>' +
			'<text:list><text:list-item><text:p>one</text:p></text:list-item></text:list>' +
			'<text:p>keep<office:annotation><text:p>COMMENT</text:p></office:annotation> this</text:p>' +
			'<table:table table:name="T"><table:table-row><table:table-cell><text:p>x</text:p></table:table-cell><table:table-cell><text:p>y</text:p></table:table-cell></table:table-row></table:table></office:text>';
		const r = odfXmlToText(xml, 'odt', { structure: true, separator: ' | ', pageMarkers: true, sheets: null });
		expect(r.text).toBe('## Head\na  b\tc\nd\n- one\nkeep this\nx | y');
	});
	it('converts an ODS per sheet with repeated cells/rows and a sheet filter', () => {
		const xml =
			'<office:spreadsheet>' +
			'<table:table table:name="S1"><table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/><table:table-cell><text:p>d</text:p></table:table-cell></table:table-row>' +
			'<table:table-row table:number-rows-repeated="2"><table:table-cell><text:p>r</text:p></table:table-cell></table:table-row></table:table>' +
			'<table:table table:name="S2"><table:table-row><table:table-cell><text:p>z</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>';
		const all = odfXmlToText(xml, 'ods', { structure: true, separator: '\t', pageMarkers: true, sheets: null });
		expect(all.sheetNames).toEqual(['S1', 'S2']);
		expect(all.text).toBe('## Sheet: S1\na\t\t\td\nr\nr\n\n## Sheet: S2\nz');
		const only = odfXmlToText(xml, 'ods', { structure: true, separator: '\t', pageMarkers: true, sheets: ['S2'] });
		expect(only.text).toBe('## Sheet: S2\nz');
	});
	it('counts slides in an ODP', () => {
		const xml = '<draw:page draw:name="p1"><text:p>one</text:p></draw:page><draw:page draw:name="p2"><text:p>two</text:p></draw:page>';
		const r = odfXmlToText(xml, 'odp', { structure: true, separator: '\t', pageMarkers: true, sheets: null });
		expect(r.slides).toBe(2);
		expect(r.text).toBe('--- Slide 1 ---\none\n\n--- Slide 2 ---\ntwo');
	});
});

describe('pptx', () => {
	it('extracts paragraphs, bullets, breaks and tables from a slide', () => {
		const xml =
			'<p:sld><a:p><a:r><a:t>Title</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="x"/></a:pPr><a:r><a:t>Point &amp; co</a:t></a:r><a:br/><a:r><a:t>more</a:t></a:r></a:p>' +
			'<a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>c1</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>c2</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></p:sld>';
		expect(pptxSlideXmlToText(xml, true, ' | ')).toBe('Title\n- Point & co\nmore\nc1 | c2');
		expect(pptxSlideXmlToText(xml, false)).toBe('Title\nPoint & co\nmore\nc1\nc2');
	});
	it('orders slides by presentation.xml, falling back to numeric order', () => {
		const pres = '<p:sldIdLst><p:sldId id="1" r:id="rId3"/><p:sldId id="2" r:id="rId2"/></p:sldIdLst>';
		const rels = '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>';
		const paths = ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'];
		expect(pptxSlideOrder(pres, rels, paths)).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide1.xml']);
		expect(pptxSlideOrder('', '', ['ppt/slides/slide10.xml', 'ppt/slides/slide2.xml'])).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide10.xml']);
	});
});

describe('PDF assembly', () => {
	it('turns positioned items into lines and spaces', () => {
		const items = [
			{ str: 'Hello', x: 10, y: 100, width: 25, height: 10 },
			{ str: 'world', x: 40, y: 100, width: 25, height: 10 },
			{ str: 'Sec', x: 10, y: 80, width: 15, height: 10 },
			{ str: 'ond', x: 25, y: 80, width: 15, height: 10 },
			{ str: 'Third', x: 10, y: 60, width: 25, height: 10, hasEOL: true },
		];
		expect(pdfItemsToText(items)).toBe('Hello world\nSecond\nThird');
	});
	it('joins hard-wrapped lines but keeps sentences, lists and hyphenation sane', () => {
		expect(joinHardWraps('This is a long\nsentence that wraps.\nNew sentence here.')).toBe('This is a long sentence that wraps.\nNew sentence here.');
		expect(joinHardWraps('inter-\nnational trade')).toBe('international trade');
		expect(joinHardWraps('Intro text\n- bullet one\n- bullet two')).toBe('Intro text\n- bullet one\n- bullet two');
		expect(joinHardWraps('para one ends.\n\nnext para')).toBe('para one ends.\n\nnext para');
		expect(joinHardWraps('Xin chào các\nbạn')).toBe('Xin chào các bạn');
	});
	it('assembles pages with or without markers', () => {
		expect(assemblePdfPages(['a', 'b'], { pageMarkers: true, joinWraps: false })).toBe('--- Page 1 ---\na\n\n--- Page 2 ---\nb');
		expect(assemblePdfPages(['a', 'b'], { pageMarkers: false, joinWraps: false })).toBe('a\n\nb');
	});
	it('recognises a scanned PDF (no text layer)', () => {
		expect(isProbablyScannedPdf(['', '  ', '\n'])).toBe(true);
		expect(isProbablyScannedPdf(['This page has plenty of selectable text on it.'])).toBe(false);
	});
});

describe('cellValueToString', () => {
	it('handles scalar, date, rich text, formula, error and hyperlink values', () => {
		expect(cellValueToString(null, false)).toBe('');
		expect(cellValueToString(12.5, false)).toBe('12.5');
		expect(cellValueToString(true, false)).toBe('TRUE');
		expect(cellValueToString(new Date(Date.UTC(2024, 0, 5)), false)).toBe('2024-01-05');
		expect(cellValueToString(new Date(Date.UTC(2024, 0, 5, 13, 4, 9)), false)).toBe('2024-01-05 13:04:09');
		expect(cellValueToString({ richText: [{ text: 'a' }, { text: 'b' }] }, false)).toBe('ab');
		expect(cellValueToString({ formula: 'A1+B1', result: 7 }, false)).toBe('7');
		expect(cellValueToString({ formula: 'A1+B1', result: 7 }, true)).toBe('=A1+B1');
		expect(cellValueToString({ error: '#DIV/0!' }, false)).toBe('#DIV/0!');
		expect(cellValueToString({ text: 'site', hyperlink: 'https://x' }, false)).toBe('site');
	});
});

describe('rtfToText', () => {
	it('extracts text, paragraphs, escapes and unicode, skipping font tables', () => {
		const B = '\\';
		const rtf = ['{', B, 'rtf1', B, 'ansi{', B, 'fonttbl{', B, 'f0 Arial;}}{', B, '*', B, 'generator Foo;}', B, 'pard Hello ', B, "'e9t", B, "'e9", B, 'tab x', B, 'par Second ', B, 'u8364?', B, 'par ', B, '{ok', B, '}', B, 'par}'].join('');
		expect(rtfToText(rtf)).toBe('Hello été\tx\nSecond €\n{ok}');
	});
});

describe('extractFromBuffer guards', () => {
	it('rejects empty, oversized, image, legacy and encrypted files', async () => {
		const code = async (name: string, buf: ArrayBuffer) => {
			try {
				await extractFromBuffer(name, '', buf);
			} catch (e) {
				return (e as FileExtractError).code;
			}
			return 'ok';
		};
		expect(await code('a.txt', new ArrayBuffer(0))).toBe('empty');
		expect(await code('a.txt', new ArrayBuffer(MAX_FILE_BYTES + 1))).toBe('tooLarge');
		expect(await code('a.png', bytes(0x89, 0x50, 0x4e, 0x47, 1, 2).buffer as ArrayBuffer)).toBe('image');
		const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0).buffer as ArrayBuffer;
		expect(await code('a.doc', ole)).toBe('legacy');
		expect(await code('a.docx', ole)).toBe('encrypted');
		expect(await code('a.bin', bytes(1, 2, 3, 0, 0, 0, 4, 5).buffer as ArrayBuffer)).toBe('binary');
	});
	it('reads text files with BOM / fallback encodings', async () => {
		const utf8 = await extractFromBuffer('a.md', 'text/markdown', new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]).buffer as ArrayBuffer);
		expect(utf8.text).toBe('hi');
		expect(utf8.kind).toBe('text');
		const latin = await extractFromBuffer('a.txt', '', new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer as ArrayBuffer);
		expect(latin.text).toBe('café');
		expect(latin.warnings.map((w) => w.code)).toContain('encodingFallback');
	});
});

describe('extractFromBuffer end-to-end (generated archives)', { timeout: 30000 }, () => {
	it('reads a .docx built with jszip', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('word/document.xml', W('<w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World</w:t></w:r></w:p>'));
		zip.file('[Content_Types].xml', '<Types/>');
		const buf = await zip.generateAsync({ type: 'arraybuffer' });
		const r = await extractFromBuffer('a.docx', '', buf);
		expect(r.kind).toBe('docx');
		expect(r.text).toBe('Hello\nWorld');
		// wrong/missing extension: archive contents decide
		const r2 = await extractFromBuffer('attachment', '', buf);
		expect(r2.kind).toBe('docx');
	});
	it('reads an .ods with a sheet filter', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
		zip.file(
			'content.xml',
			'<office:spreadsheet><table:table table:name="A"><table:table-row><table:table-cell><text:p>1</text:p></table:table-cell></table:table-row></table:table><table:table table:name="B"><table:table-row><table:table-cell><text:p>2</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>',
		);
		const buf = await zip.generateAsync({ type: 'arraybuffer' });
		const r = await extractFromBuffer('x.ods', '', buf, undefined, ['B']);
		expect(r.sheetNames).toEqual(['A', 'B']);
		expect(r.text).toBe('## Sheet: B\n2');
	});
	it('rejects an ODF file whose manifest declares encryption', async () => {
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		zip.file('content.xml', '<x/>');
		zip.file('META-INF/manifest.xml', '<manifest:encryption-data/>');
		const buf = await zip.generateAsync({ type: 'arraybuffer' });
		await expect(extractFromBuffer('x.odt', '', buf)).rejects.toMatchObject({ code: 'encrypted' });
	});
	it('reads an .xlsx made with exceljs (values, formulas, sheet choice)', async () => {
		const ExcelJS = (await import('exceljs')).default;
		const wb = new ExcelJS.Workbook();
		const s1 = wb.addWorksheet('Data');
		s1.addRow(['name', 'qty', 'total']);
		s1.addRow(['apple', 2, { formula: 'B2*3', result: 6 }]);
		const s2 = wb.addWorksheet('Other');
		s2.addRow(['x']);
		const hidden = wb.addWorksheet('Hid', { state: 'hidden' });
		hidden.addRow(['secret']);
		const out = await wb.xlsx.writeBuffer();
		const buf = (out as ArrayBuffer).slice ? (out as ArrayBuffer) : new Uint8Array(out as never).buffer;
		const r = await extractFromBuffer('t.xlsx', '', buf as ArrayBuffer);
		expect(r.sheetNames).toEqual(['Data', 'Other']);
		expect(r.text).toBe('## Sheet: Data\nname\tqty\ttotal\napple\t2\t6\n\n## Sheet: Other\nx');
		expect(r.warnings.map((w) => w.code)).toContain('hiddenSheetsSkipped');
		const f = await extractFromBuffer('t.xlsx', '', buf as ArrayBuffer, { ...{ pageMarkers: true, joinWraps: false, structure: true, cellSeparator: 'pipe' as const }, showFormulas: true }, ['Data']);
		expect(f.text).toBe('## Sheet: Data\nname | qty | total\napple | 2 | =B2*3');
	}, 90000);
});
