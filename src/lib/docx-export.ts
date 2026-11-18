/**
 * Xuất văn bản ra file .docx ngay trên trình duyệt.
 *
 * Một file .docx chỉ là file ZIP chứa vài file XML, nên không cần thêm thư viện mới:
 * JSZip đã có sẵn trong dự án. Chỉ dựng phần tối thiểu để Word, LibreOffice và Google Docs
 * đều mở được — đoạn văn thuần, không định dạng, vì kết quả OCR vốn cũng là văn bản thuần.
 */

/** Năm ký tự phải escape trong XML; thiếu một cái là Word báo file hỏng. */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Ký tự điều khiển không hợp lệ trong XML 1.0. OCR thỉnh thoảng nhả ra vài ký tự như vậy
 * từ ảnh nhiễu, và chỉ một ký tự thôi cũng đủ làm Word từ chối mở cả file.
 */
function stripControlChars(value: string): string {
	// eslint-disable-next-line no-control-regex
	return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** Chia văn bản thành đoạn: một dòng trống trở lên là ranh giới đoạn. */
export function splitParagraphs(text: string): string[] {
	const paragraphs = stripControlChars(text)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.trim());
	// Giữ lại dòng trống ở giữa để bố cục không bị dồn thành một khối, nhưng bỏ ở đầu và cuối.
	while (paragraphs.length > 0 && paragraphs[0] === '') paragraphs.shift();
	while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === '') paragraphs.pop();
	return paragraphs;
}

export function buildDocumentXml(paragraphs: string[]): string {
	const body = paragraphs
		.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
}

/** Các file tạo nên một .docx tối thiểu. Tách riêng để test được mà không cần zip thật. */
export function buildDocxParts(text: string): Record<string, string> {
	return {
		'[Content_Types].xml': CONTENT_TYPES,
		'_rels/.rels': ROOT_RELS,
		'word/document.xml': buildDocumentXml(splitParagraphs(text)),
	};
}

/** Nén các phần trên thành một Blob .docx. JSZip nạp động để không nằm trong bundle đầu trang. */
export async function buildDocxBlob(text: string): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	for (const [path, content] of Object.entries(buildDocxParts(text))) zip.file(path, content);
	return zip.generateAsync({
		type: 'blob',
		mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		compression: 'DEFLATE',
	});
}
