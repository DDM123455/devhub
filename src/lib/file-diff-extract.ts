// Turns the contents of a file into plain text so it can be fed to the Text Diff Checker.
// 100% client-side: bytes come from the user's own File object, heavy libraries (jszip, pdfjs,
// exceljs, mammoth) are loaded with dynamic import() only for the file type that needs them, and
// nothing is uploaded. The pure parts (type sniffing, XML -> text, PDF page assembly, Excel row
// formatting) have no DOM dependency and are unit-tested.
import { decodeBuffer } from './csv-encoding';

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
/** Safety net against zip bombs / absurd inputs: refuse XML or text larger than this many characters. */
export const MAX_XML_CHARS = 60_000_000;
/** Combined size of two texts above which a share link is not offered for file-sourced content. */
export const MAX_SHARE_CHARS = 200_000;

export type FileKind = 'text' | 'docx' | 'pdf' | 'xlsx' | 'odt' | 'ods' | 'odp' | 'pptx' | 'rtf';
export type DetectedKind = FileKind | 'legacyOffice' | 'ole' | 'image' | 'binary' | 'unknown';

export type ExtractErrorCode = 'tooLarge' | 'empty' | 'binary' | 'image' | 'encrypted' | 'legacy' | 'unsupported' | 'corrupt';

export class FileExtractError extends Error {
	code: ExtractErrorCode;
	constructor(code: ExtractErrorCode, message?: string) {
		super(message ?? code);
		this.code = code;
	}
}

export type ExtractWarning =
	| 'pdfNoText'
	| 'pdfEmptyPages'
	| 'imagesIgnored'
	| 'formattingLost'
	| 'valuesOnly'
	| 'hiddenSheetsSkipped'
	| 'encodingFallback'
	| 'trackedChanges'
	| 'noText'
	| 'rtfApprox'
	| 'columnsPossible';

export type Reliability = 'high' | 'medium' | 'low';

export interface ExtractOptions {
	/** Insert a separator line at page (PDF) / slide (PPTX, ODP) boundaries. */
	pageMarkers: boolean;
	/** PDF: join lines that were broken by the page layout back into paragraphs. */
	joinWraps: boolean;
	/** Word / OpenDocument / PowerPoint: keep headings (#), list bullets and tables as text. */
	structure: boolean;
	/** Excel: show the formula text instead of its cached value. */
	showFormulas: boolean;
	/** Separator between cells of a spreadsheet row or table row. */
	cellSeparator: 'tab' | 'pipe';
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
	pageMarkers: true,
	joinWraps: false,
	structure: true,
	showFormulas: false,
	cellSeparator: 'tab',
};

export interface ExtractResult {
	text: string;
	kind: FileKind;
	reliability: Reliability;
	warnings: Array<{ code: ExtractWarning; count?: number }>;
	pages?: number;
	slides?: number;
	/** Every sheet in the workbook (xlsx / ods), regardless of the current selection. */
	sheetNames?: string[];
	/** The sheets that ended up in `text`. */
	sheetsUsed?: string[];
	encoding?: string;
}

const TEXT_EXTENSIONS = new Set([
	'txt', 'text', 'md', 'markdown', 'mdx', 'json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'xml', 'xsd', 'xsl', 'xslt', 'svg', 'html', 'htm', 'xhtml',
	'css', 'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'astro', 'py', 'rb', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp',
	'cs', 'go', 'rs', 'swift', 'scala', 'lua', 'pl', 'r', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'sql', 'graphql', 'gql', 'proto', 'log', 'ini', 'conf', 'cfg',
	'properties', 'env', 'csv', 'tsv', 'tab', 'diff', 'patch', 'srt', 'vtt', 'tex', 'rst', 'gitignore', 'editorconfig', 'dockerfile', 'tf', 'hcl', 'lock',
]);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'avif']);
const LEGACY_OFFICE_EXTENSIONS = new Set(['doc', 'xls', 'ppt', 'dot', 'xlt', 'pps']);

function extensionOf(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? name;
	const dot = base.lastIndexOf('.');
	return dot === -1 ? base.toLowerCase().replace(/^\./, '') : base.slice(dot + 1).toLowerCase();
}

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

export type MagicKind = 'pdf' | 'zip' | 'ole' | 'rtf' | 'image' | null;

/** Identify a container format from its first bytes. */
export function sniffMagic(bytes: Uint8Array): MagicKind {
	if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
	if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
	if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
	if (startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return 'rtf'; // {\rtf
	if (
		startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
		startsWith(bytes, [0xff, 0xd8, 0xff]) ||
		startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) ||
		startsWith(bytes, [0x42, 0x4d]) ||
		(startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
	)
		return 'image';
	return null;
}

/** Names inside a ZIP (and the optional ODF `mimetype` entry) -> the document type. */
export function detectZipKind(entryNames: string[], odfMimetype?: string): FileKind | null {
	if (odfMimetype) {
		const mime = odfMimetype.trim();
		if (mime === 'application/vnd.oasis.opendocument.text') return 'odt';
		if (mime === 'application/vnd.oasis.opendocument.spreadsheet') return 'ods';
		if (mime === 'application/vnd.oasis.opendocument.presentation') return 'odp';
	}
	const names = new Set(entryNames);
	if (names.has('word/document.xml')) return 'docx';
	if (names.has('xl/workbook.xml')) return 'xlsx';
	if (names.has('ppt/presentation.xml')) return 'pptx';
	return null;
}

/** True when the bytes look like binary (non-text) data. UTF-16 text is NOT binary. */
export function looksBinary(bytes: Uint8Array): boolean {
	const sample = bytes.subarray(0, 8192);
	if (sample.length === 0) return false;
	let nul = 0;
	let control = 0;
	for (const b of sample) {
		if (b === 0) nul++;
		else if (b < 9 || (b > 13 && b < 32 && b !== 27)) control++;
	}
	if (nul > 0) {
		// UTF-16 has NULs on purpose: let the BOM / ASCII-pattern sniffing in decodeBuffer decide.
		const { encoding } = decodeBuffer(sample);
		return !encoding.startsWith('utf-16');
	}
	return control / sample.length > 0.1;
}

/**
 * Decide how a file should be read, from its name / MIME type and first bytes. Archive-based
 * formats whose extension is missing or wrong are resolved later by `detectZipKind`
 * (reported here as `unknown` when the bytes are a ZIP).
 */
export function detectFileKind(name: string, mime: string, head: Uint8Array): DetectedKind {
	const ext = extensionOf(name);
	const magic = sniffMagic(head);
	if (magic === 'image' || IMAGE_EXTENSIONS.has(ext) || mime.startsWith('image/')) return ext === 'svg' && magic !== 'image' ? 'text' : 'image';
	if (magic === 'pdf' || ext === 'pdf') return magic === 'pdf' ? 'pdf' : looksBinary(head) ? 'binary' : 'text';
	if (magic === 'rtf') return 'rtf';
	if (magic === 'ole') return LEGACY_OFFICE_EXTENSIONS.has(ext) ? 'legacyOffice' : 'ole';
	if (magic === 'zip') {
		const byExt: Record<string, FileKind> = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', odt: 'odt', ods: 'ods', odp: 'odp' };
		return byExt[ext] ?? 'unknown';
	}
	if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) return looksBinary(head) ? 'binary' : 'text';
	if (LEGACY_OFFICE_EXTENSIONS.has(ext)) return looksBinary(head) ? 'legacyOffice' : 'text';
	if (TEXT_EXTENSIONS.has(ext)) return looksBinary(head) ? 'binary' : 'text';
	return looksBinary(head) ? 'binary' : 'text';
}

// ---------------------------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------------------------

export function decodeXmlEntities(value: string): string {
	return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
		const e = entity.toLowerCase();
		if (e === 'amp') return '&';
		if (e === 'lt') return '<';
		if (e === 'gt') return '>';
		if (e === 'quot') return '"';
		if (e === 'apos') return "'";
		const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
		if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
		try {
			return String.fromCodePoint(code);
		} catch {
			return match;
		}
	});
}

export function cellSeparatorString(sep: ExtractOptions['cellSeparator']): string {
	return sep === 'pipe' ? ' | ' : '\t';
}

/** Cells of one table / spreadsheet row -> one line (trailing empty cells are dropped). */
export function formatRow(cells: string[], separator: string): string {
	let end = cells.length;
	while (end > 0 && cells[end - 1].trim() === '') end--;
	return cells
		.slice(0, end)
		.map((c) => c.replace(/\r?\n|\r/g, ' ').replace(/\t/g, ' '))
		.join(separator);
}

export function pageMarker(n: number): string {
	return `--- Page ${n} ---`;
}
export function slideMarker(n: number): string {
	return `--- Slide ${n} ---`;
}

function collapseBlankLines(lines: string[]): string {
	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------------------------
// DOCX (word/document.xml)
// ---------------------------------------------------------------------------------------------

interface TableCtx {
	rows: string[][];
	row: string[];
	cell: string[];
}

function headingLevel(styleId: string): number {
	const s = styleId.toLowerCase().replace(/[\s_-]/g, '');
	if (s === 'title') return 1;
	if (s === 'subtitle') return 2;
	const m = /^heading(\d)$/.exec(s);
	return m ? Math.min(6, Math.max(1, parseInt(m[1], 10))) : 0;
}

const DOCX_TOKEN =
	/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>|<w:p[\s>]|<\/w:p>|<w:pStyle\s+w:val="([^"]*)"|<w:numPr>|<w:tbl>|<\/w:tbl>|<w:tr[\s>]|<\/w:tr>|<w:tc[\s>]|<\/w:tc>/g;

export interface DocxTextResult {
	text: string;
	trackedChanges: boolean;
}

/**
 * Converts WordprocessingML (`word/document.xml`) into text. Deleted tracked changes
 * (`w:delText`) are not part of the result, inserted ones are: the text equals what Word shows
 * after "accept all changes". Headers, footers, footnotes, text boxes' anchors and images are
 * not included.
 */
export function docxXmlToText(xml: string, structure: boolean, separator = '\t'): DocxTextResult {
	const out: string[] = [];
	const tables: TableCtx[] = [];
	let para: string | null = null;
	let style = '';
	let isList = false;
	const trackedChanges = /<w:(?:ins|del)\s/.test(xml);

	const emit = (line: string) => {
		const ctx = tables[tables.length - 1];
		if (ctx) ctx.cell.push(line);
		else out.push(line);
	};
	const endParagraph = () => {
		if (para === null) return;
		let line = para;
		if (structure) {
			const level = headingLevel(style);
			if (level > 0 && line.trim() !== '') line = `${'#'.repeat(level)} ${line}`;
			else if (isList && line.trim() !== '') line = `- ${line}`;
		}
		emit(line);
		para = null;
		style = '';
		isList = false;
	};
	const closeTable = () => {
		const ctx = tables.pop();
		if (!ctx) return;
		const lines = structure ? ctx.rows.map((r) => formatRow(r, separator)) : ctx.rows.flat().flatMap((c) => c.split('\n'));
		const parent = tables[tables.length - 1];
		if (parent) parent.cell.push(...lines.filter((l) => l.trim() !== ''));
		else out.push(...lines);
	};

	DOCX_TOKEN.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = DOCX_TOKEN.exec(xml)) !== null) {
		const tok = m[0];
		if (m[1] !== undefined) {
			if (para === null) para = '';
			para += decodeXmlEntities(m[1]);
		} else if (tok.startsWith('<w:tab')) {
			if (para === null) para = '';
			para += '\t';
		} else if (tok.startsWith('<w:br') || tok.startsWith('<w:cr')) {
			if (para === null) para = '';
			para += structure && tables.length > 0 ? ' ' : '\n';
		} else if (tok === '</w:p>') {
			endParagraph();
		} else if (tok.startsWith('<w:pStyle')) {
			style = m[2] ?? '';
		} else if (tok === '<w:numPr>') {
			isList = true;
		} else if (/^<w:p[\s>]/.test(tok)) {
			endParagraph();
			para = '';
		} else if (tok === '<w:tbl>') {
			endParagraph();
			tables.push({ rows: [], row: [], cell: [] });
		} else if (tok === '</w:tbl>') {
			endParagraph();
			closeTable();
		} else if (/^<w:tr[\s>]/.test(tok)) {
			const ctx = tables[tables.length - 1];
			if (ctx) ctx.row = [];
		} else if (tok === '</w:tr>') {
			const ctx = tables[tables.length - 1];
			if (ctx) {
				ctx.rows.push(ctx.row);
				ctx.row = [];
			}
		} else if (/^<w:tc[\s>]/.test(tok)) {
			const ctx = tables[tables.length - 1];
			if (ctx) ctx.cell = [];
		} else if (tok === '</w:tc>') {
			endParagraph();
			const ctx = tables[tables.length - 1];
			if (ctx) {
				ctx.row.push(ctx.cell.filter((l) => l.trim() !== '').join(structure ? ' ' : '\n'));
				ctx.cell = [];
			}
		}
	}
	endParagraph();
	while (tables.length) closeTable();
	return { text: collapseBlankLines(out), trackedChanges };
}

// ---------------------------------------------------------------------------------------------
// OpenDocument (content.xml of .odt / .ods / .odp)
// ---------------------------------------------------------------------------------------------

export interface OdfTextResult {
	text: string;
	/** ODS: sheet names in order. */
	sheetNames: string[];
	/** ODP: number of slides. */
	slides: number;
}

const ODF_SKIP_OPEN = new Set(['office:annotation', 'text:tracked-changes', 'text:note', 'office:forms', 'text:sequence-decls', 'text:variable-decls']);

/**
 * Converts ODF `content.xml` into text. For spreadsheets only sheets named in `sheets` (all when
 * null) are included; `separator` joins cells. Comments, footnotes and tracked deletions are skipped.
 */
export function odfXmlToText(
	xml: string,
	kind: 'odt' | 'ods' | 'odp',
	opts: { structure: boolean; separator: string; pageMarkers: boolean; sheets: string[] | null },
): OdfTextResult {
	const out: string[] = [];
	const sheetNames: string[] = [];
	let slides = 0;
	let buf: string | null = null;
	let headingLvl = 0;
	let inListItem = 0;
	let skipDepth = 0;
	const skipStack: string[] = [];
	let sheetIncluded = true;
	let row: string[] | null = null;
	let rowRepeat = 1;
	let cell: string[] | null = null;
	let tableDepth = 0;
	let tableRows: string[][] | null = null; // odt/odp tables

	const emitLine = (line: string) => {
		if (cell) cell.push(line);
		else out.push(line);
	};
	const endBlock = () => {
		if (buf === null) return;
		let line = buf;
		if (opts.structure && headingLvl > 0 && line.trim() !== '') line = `${'#'.repeat(Math.min(6, headingLvl))} ${line}`;
		else if (opts.structure && inListItem > 0 && line.trim() !== '' && kind !== 'ods') line = `- ${line}`;
		if (kind === 'ods') {
			if (cell) cell.push(line);
		} else emitLine(line);
		buf = null;
		headingLvl = 0;
	};

	const tokens = xml.match(/<[^>]+>|[^<]+/g) ?? [];
	for (const tok of tokens) {
		if (tok[0] !== '<') {
			if (skipDepth === 0 && buf !== null) buf += decodeXmlEntities(tok);
			continue;
		}
		const nm = /^<(\/?)([\w:.-]+)/.exec(tok);
		if (!nm) continue;
		const closing = nm[1] === '/';
		const name = nm[2];
		const selfClosing = tok.endsWith('/>');

		if (ODF_SKIP_OPEN.has(name)) {
			if (closing) {
				if (skipStack[skipStack.length - 1] === name) {
					skipStack.pop();
					skipDepth--;
				}
			} else if (!selfClosing) {
				skipStack.push(name);
				skipDepth++;
			}
			continue;
		}
		if (skipDepth > 0) continue;

		switch (name) {
			case 'text:p':
			case 'text:h':
				if (closing) endBlock();
				else if (!selfClosing) {
					buf = '';
					if (name === 'text:h') headingLvl = parseInt(/text:outline-level="(\d+)"/.exec(tok)?.[1] ?? '1', 10) || 1;
				} else if (kind !== 'ods') emitLine('');
				break;
			case 'text:s': {
				if (buf !== null) buf += ' '.repeat(Math.min(200, parseInt(/text:c="(\d+)"/.exec(tok)?.[1] ?? '1', 10) || 1));
				break;
			}
			case 'text:tab':
				if (buf !== null) buf += '\t';
				break;
			case 'text:line-break':
				if (buf !== null) buf += '\n';
				break;
			case 'text:list-item':
				inListItem += closing ? -1 : 1;
				if (inListItem < 0) inListItem = 0;
				break;
			case 'table:table': {
				if (closing) {
					tableDepth = Math.max(0, tableDepth - 1);
					if (kind !== 'ods' && tableRows && tableDepth === 0) {
						out.push(...tableRows.map((r) => formatRow(r, opts.structure ? opts.separator : '\n')));
						tableRows = null;
					}
				} else if (!selfClosing) {
					tableDepth++;
					if (kind === 'ods') {
						const sheetName = decodeXmlEntities(/table:name="([^"]*)"/.exec(tok)?.[1] ?? `Sheet${sheetNames.length + 1}`);
						sheetNames.push(sheetName);
						sheetIncluded = !opts.sheets || opts.sheets.includes(sheetName);
						if (sheetIncluded) {
							if (out.length) out.push('');
							out.push(`## Sheet: ${sheetName}`);
						}
					} else if (tableDepth === 1) tableRows = [];
				}
				break;
			}
			case 'table:table-row':
				if (closing) {
					if (kind === 'ods') {
						if (sheetIncluded && row) {
							const line = formatRow(row, opts.separator);
							if (line !== '') for (let i = 0; i < rowRepeat; i++) out.push(line);
						}
					} else if (tableRows && row) tableRows.push(row);
					row = null;
				} else if (!selfClosing) {
					row = [];
					rowRepeat = Math.min(50, parseInt(/table:number-rows-repeated="(\d+)"/.exec(tok)?.[1] ?? '1', 10) || 1);
				}
				break;
			case 'table:table-cell':
			case 'table:covered-table-cell': {
				if (closing) {
					if (row && cell) row.push(cell.join(' '));
					cell = null;
				} else if (selfClosing) {
					const rep = Math.min(50, parseInt(/table:number-columns-repeated="(\d+)"/.exec(tok)?.[1] ?? '1', 10) || 1);
					if (row) for (let i = 0; i < rep; i++) row.push('');
				} else {
					cell = [];
				}
				break;
			}
			case 'draw:page':
				if (!closing && kind === 'odp') {
					slides++;
					if (opts.pageMarkers) {
						if (out.length) out.push('');
						out.push(slideMarker(slides));
					}
				}
				break;
			default:
				break;
		}
	}
	endBlock();
	return { text: collapseBlankLines(out), sheetNames, slides };
}

// ---------------------------------------------------------------------------------------------
// PPTX
// ---------------------------------------------------------------------------------------------

/** Slide part names in presentation order (falls back to numeric order of `slideN.xml`). */
export function pptxSlideOrder(presentationXml: string, relsXml: string, allSlidePaths: string[]): string[] {
	const numeric = [...allSlidePaths].sort((a, b) => (parseInt(/slide(\d+)\.xml$/.exec(a)?.[1] ?? '0', 10) - parseInt(/slide(\d+)\.xml$/.exec(b)?.[1] ?? '0', 10)));
	const targets = new Map<string, string>();
	for (const rel of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
		const id = /\bId="([^"]*)"/.exec(rel)?.[1];
		const target = /\bTarget="([^"]*)"/.exec(rel)?.[1];
		if (id && target) targets.set(id, target.replace(/^\/?(ppt\/)?/, 'ppt/'));
	}
	const ordered: string[] = [];
	for (const m of presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]*)"/g)) {
		const target = targets.get(m[1]);
		if (target && allSlidePaths.includes(target)) ordered.push(target);
	}
	if (ordered.length === 0) return numeric;
	// Slides that are not referenced (shouldn't happen) are appended so no text is lost.
	for (const p of numeric) if (!ordered.includes(p)) ordered.push(p);
	return ordered;
}

const PPTX_TOKEN = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>|<a:br\b[^>]*\/>|<a:p[\s>]|<\/a:p>|<a:tbl>|<\/a:tbl>|<a:tr[\s>]|<\/a:tr>|<a:tc[\s>]|<\/a:tc>|<a:buChar\b|<a:buAutoNum\b/g;

/** Text of a single slide part (`ppt/slides/slideN.xml`). */
export function pptxSlideXmlToText(xml: string, structure: boolean, separator = '\t'): string {
	const out: string[] = [];
	let para: string | null = null;
	let bullet = false;
	let table: { rows: string[][]; row: string[]; cell: string[] } | null = null;
	const end = () => {
		if (para === null) return;
		let line = para;
		if (structure && bullet && line.trim() !== '') line = `- ${line}`;
		if (table) table.cell.push(line);
		else out.push(line);
		para = null;
		bullet = false;
	};
	PPTX_TOKEN.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = PPTX_TOKEN.exec(xml)) !== null) {
		const tok = m[0];
		if (m[1] !== undefined) {
			if (para === null) para = '';
			para += decodeXmlEntities(m[1]);
		} else if (tok.startsWith('<a:br')) {
			if (para === null) para = '';
			para += '\n';
		} else if (tok.startsWith('<a:bu')) bullet = true;
		else if (/^<a:p[\s>]/.test(tok)) {
			end();
			para = '';
		} else if (tok === '</a:p>') end();
		else if (tok === '<a:tbl>') {
			end();
			table = { rows: [], row: [], cell: [] };
		} else if (tok === '</a:tbl>') {
			end();
			if (table) out.push(...(structure ? table.rows.map((r) => formatRow(r, separator)) : table.rows.flat()));
			table = null;
		} else if (/^<a:tr[\s>]/.test(tok)) {
			if (table) table.row = [];
		} else if (tok === '</a:tr>') {
			if (table) table.rows.push(table.row);
		} else if (/^<a:tc[\s>]/.test(tok)) {
			if (table) table.cell = [];
		} else if (tok === '</a:tc>') {
			end();
			if (table) table.row.push(table.cell.filter((l) => l.trim() !== '').join(' '));
		}
	}
	end();
	return collapseBlankLines(out);
}

// ---------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------

export interface PdfItem {
	str: string;
	x: number;
	y: number;
	width: number;
	height: number;
	hasEOL?: boolean;
}

/** Positioned text fragments of one PDF page -> lines of text. */
export function pdfItemsToText(items: PdfItem[]): string {
	const lines: string[] = [];
	let line = '';
	let prev: PdfItem | null = null;
	const flush = () => {
		lines.push(line.replace(/[ \t]+$/, ''));
		line = '';
	};
	for (const item of items) {
		if (prev && item.str !== '') {
			const h = Math.max(item.height, prev.height, 1);
			if (Math.abs(item.y - prev.y) > h * 0.5 && line !== '') {
				flush();
			} else {
				const gap = item.x - (prev.x + prev.width);
				if (gap > h * 0.15 && !line.endsWith(' ') && !item.str.startsWith(' ')) line += ' ';
			}
		}
		line += item.str;
		if (item.str !== '') prev = item;
		if (item.hasEOL) {
			flush();
			prev = null;
		}
	}
	if (line !== '') flush();
	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const SENTENCE_END = /[.!?:;…。！？：；)\]"”’»]\s*$/;
const LIST_START = /^\s*(?:[-•*–·▪●○]|\(?\d+[.)]|\(?[a-zA-Z][.)])\s/;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

/** Join lines that the page layout broke in the middle of a sentence (heuristic). */
export function joinHardWraps(text: string): string {
	const lines = text.split('\n');
	const out: string[] = [];
	for (const next of lines) {
		const last = out[out.length - 1];
		if (last === undefined || last.trim() === '' || next.trim() === '' || LIST_START.test(next)) {
			out.push(next);
			continue;
		}
		const hyphenated = /\p{L}-$/u.test(last) && /^\p{Ll}/u.test(next.trim());
		const continues = !SENTENCE_END.test(last) && (/^\p{Ll}/u.test(next.trim()) || /[,]$/.test(last) || (CJK.test(last.slice(-1)) && CJK.test(next.trim()[0])));
		if (hyphenated) out[out.length - 1] = last.slice(0, -1) + next.trim();
		else if (continues) out[out.length - 1] = CJK.test(last.slice(-1)) && CJK.test(next.trim()[0]) ? last + next.trim() : `${last} ${next.trim()}`;
		else out.push(next);
	}
	return out.join('\n');
}

/** Per-page texts -> one document. Pages are separated by a marker line or a blank line. */
export function assemblePdfPages(pages: string[], opts: { pageMarkers: boolean; joinWraps: boolean }): string {
	const parts = pages.map((p, i) => {
		const body = opts.joinWraps ? joinHardWraps(p) : p;
		return opts.pageMarkers ? `${pageMarker(i + 1)}\n${body}` : body;
	});
	return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Heuristic: the PDF carries (almost) no text layer, so it is most likely a scan. */
export function isProbablyScannedPdf(pages: string[]): boolean {
	const chars = pages.reduce((n, p) => n + p.replace(/\s/g, '').length, 0);
	return chars < Math.max(20, pages.length * 5);
}

// ---------------------------------------------------------------------------------------------
// Excel cell values (exceljs shapes)
// ---------------------------------------------------------------------------------------------

function pad(n: number, w = 2) {
	return String(n).padStart(w, '0');
}

export function formatDateValue(d: Date): string {
	if (Number.isNaN(d.getTime())) return '';
	const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
	const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
	return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : date;
}

/** Converts an exceljs `cell.value` into display text. */
export function cellValueToString(value: unknown, showFormulas: boolean): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
	if (value instanceof Date) return formatDateValue(value);
	if (typeof value === 'object') {
		const v = value as Record<string, unknown>;
		if ('error' in v && typeof v.error === 'string') return v.error;
		if ('formula' in v || 'sharedFormula' in v) {
			if (showFormulas) {
				const f = typeof v.formula === 'string' ? v.formula : typeof v.sharedFormula === 'string' ? v.sharedFormula : '';
				return f ? `=${f}` : cellValueToString(v.result, false);
			}
			return cellValueToString(v.result, false);
		}
		if ('richText' in v && Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
		if ('text' in v && v.text !== undefined) return cellValueToString(v.text, false);
		if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink;
	}
	return '';
}

// ---------------------------------------------------------------------------------------------
// RTF (simple)
// ---------------------------------------------------------------------------------------------

const RTF_SKIP_DESTINATIONS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'bkmkstart', 'bkmkend']);

/** Very small RTF -> text converter (paragraphs, tabs, escapes, \\uN, \\'hh). Layout is lost. */
export function rtfToText(rtf: string): string {
	let out = '';
	const stack: Array<{ skip: boolean; uc: number }> = [];
	let skip = false;
	let uc = 1;
	let skipChars = 0;
	const win1252 = new TextDecoder('windows-1252');
	let i = 0;
	const n = rtf.length;
	while (i < n) {
		const ch = rtf[i];
		if (ch === '{') {
			stack.push({ skip, uc });
			i++;
			// destination groups: {\*\xxx ...} or {\fonttbl ...}
			if (rtf[i] === '\\' && rtf[i + 1] === '*') {
				skip = true;
			} else if (rtf[i] === '\\') {
				const w = /^\\([a-zA-Z]+)/.exec(rtf.slice(i, i + 24));
				if (w && RTF_SKIP_DESTINATIONS.has(w[1])) skip = true;
			}
		} else if (ch === '}') {
			const prev = stack.pop();
			if (prev) {
				skip = prev.skip;
				uc = prev.uc;
			}
			i++;
		} else if (ch === '\\') {
			const next = rtf[i + 1];
			if (next === '\\' || next === '{' || next === '}') {
				if (!skip && skipChars === 0) out += next;
				else if (skipChars > 0) skipChars--;
				i += 2;
			} else if (next === "'") {
				const hex = rtf.slice(i + 2, i + 4);
				if (!skip) {
					if (skipChars > 0) skipChars--;
					else out += win1252.decode(new Uint8Array([parseInt(hex, 16) || 63]));
				}
				i += 4;
			} else if (next === '~') {
				if (!skip) out += ' ';
				i += 2;
			} else if (next === '-' || next === '_') {
				if (!skip) out += next === '_' ? '-' : '';
				i += 2;
			} else {
				const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
				if (!m) {
					i += 2;
					continue;
				}
				const word = m[1];
				const param = m[2] !== undefined ? parseInt(m[2], 10) : undefined;
				i += m[0].length;
				if (skip) continue;
				if (word === 'par' || word === 'line' || word === 'row') out += '\n';
				else if (word === 'tab' || word === 'cell') out += '\t';
				else if (word === 'emdash') out += '—';
				else if (word === 'endash') out += '–';
				else if (word === 'bullet') out += '•';
				else if (word === 'lquote') out += '‘';
				else if (word === 'rquote') out += '’';
				else if (word === 'ldblquote') out += '“';
				else if (word === 'rdblquote') out += '”';
				else if (word === 'uc' && param !== undefined) uc = param;
				else if (word === 'u' && param !== undefined) {
					out += String.fromCharCode(param < 0 ? param + 65536 : param);
					skipChars = uc;
				}
			}
		} else {
			if (ch !== '\r' && ch !== '\n') {
				if (!skip) {
					if (skipChars > 0) skipChars--;
					else out += ch;
				}
			}
			i++;
		}
	}
	return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------------------------
// Orchestration (async, uses lazy libraries)
// ---------------------------------------------------------------------------------------------

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, '\n');

async function loadZip(buffer: ArrayBuffer) {
	const { default: JSZip } = await import('jszip');
	try {
		return await JSZip.loadAsync(buffer);
	} catch (error) {
		if (error instanceof Error && /encrypt/i.test(error.message)) throw new FileExtractError('encrypted');
		throw new FileExtractError('corrupt');
	}
}

async function readXml(zip: Awaited<ReturnType<typeof loadZip>>, path: string): Promise<string | null> {
	const entry = zip.file(path);
	if (!entry) return null;
	const xml = await entry.async('string');
	if (xml.length > MAX_XML_CHARS) throw new FileExtractError('tooLarge');
	return xml;
}

let pdfWorkerConfigured = false;

async function extractPdfPages(buffer: ArrayBuffer): Promise<string[]> {
	const pdfjsLib = await import('pdfjs-dist');
	if (!pdfWorkerConfigured) {
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
		pdfWorkerConfigured = true;
	}
	// pdfjs transfers/detaches the buffer it is given: pass a copy so the original stays reusable.
	const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
	try {
		const pdf = await loadingTask.promise;
		const pages: string[] = [];
		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i);
			const content = await page.getTextContent();
			const items: PdfItem[] = [];
			for (const item of content.items) {
				if (!('str' in item)) continue;
				items.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, hasEOL: item.hasEOL });
			}
			pages.push(pdfItemsToText(items));
			page.cleanup();
		}
		return pages;
	} catch (error) {
		const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
		if (name === 'PasswordException') throw new FileExtractError('encrypted');
		if (error instanceof FileExtractError) throw error;
		throw new FileExtractError('corrupt');
	} finally {
		void loadingTask.destroy();
	}
}

interface MinimalWorksheet {
	name: string;
	state?: string;
	eachRow: (opts: { includeEmpty: boolean }, cb: (row: { values: unknown; cellCount: number; eachCell: (opts: { includeEmpty: boolean }, cb: (cell: { value: unknown; col: number }) => void) => void }) => void) => void;
}

async function extractXlsx(buffer: ArrayBuffer, opts: ExtractOptions, sheets: string[] | null) {
	const ExcelJS = (await import('exceljs')).default;
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer.slice(0));
	} catch (error) {
		if (error instanceof Error && /encrypt|password/i.test(error.message)) throw new FileExtractError('encrypted');
		throw new FileExtractError('corrupt');
	}
	const separator = cellSeparatorString(opts.cellSeparator);
	const sheetNames: string[] = [];
	const used: string[] = [];
	const blocks: string[] = [];
	let hiddenSkipped = 0;
	for (const ws of workbook.worksheets as unknown as MinimalWorksheet[]) {
		if (ws.state && ws.state !== 'visible') {
			hiddenSkipped++;
			continue;
		}
		sheetNames.push(ws.name);
		if (sheets && !sheets.includes(ws.name)) continue;
		used.push(ws.name);
		const lines: string[] = [];
		ws.eachRow({ includeEmpty: false }, (row) => {
			const cells: string[] = [];
			row.eachCell({ includeEmpty: true }, (cell) => {
				cells[cell.col - 1] = cellValueToString(cell.value, opts.showFormulas);
			});
			for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
			lines.push(formatRow(cells, separator));
		});
		blocks.push([`## Sheet: ${ws.name}`, ...lines].join('\n'));
	}
	return { text: blocks.join('\n\n'), sheetNames, used, hiddenSkipped };
}

async function extractDocxFallback(buffer: ArrayBuffer): Promise<string> {
	// The pre-bundled browser build avoids Node-only dependencies (fs/zlib shims).
	// @ts-ignore - no type declarations for this deep path; the API matches mammoth's index.d.ts
	const module = await import('mammoth/mammoth.browser.js');
	const mammoth = (module.default ?? module) as { extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
	return (await mammoth.extractRawText({ arrayBuffer: buffer.slice(0) })).value;
}

export function reliabilityFor(kind: FileKind): Reliability {
	if (kind === 'text' || kind === 'xlsx' || kind === 'ods') return 'high';
	if (kind === 'docx' || kind === 'odt' || kind === 'pptx' || kind === 'odp') return 'medium';
	if (kind === 'pdf') return 'medium';
	return 'low';
}

/**
 * Reads the text out of an in-memory file. `sheets` limits which sheets of a workbook are
 * included (null = all). Throws FileExtractError for files that cannot be handled.
 */
export async function extractFromBuffer(
	name: string,
	mime: string,
	buffer: ArrayBuffer,
	options: ExtractOptions = DEFAULT_EXTRACT_OPTIONS,
	sheets: string[] | null = null,
): Promise<ExtractResult> {
	if (buffer.byteLength > MAX_FILE_BYTES) throw new FileExtractError('tooLarge');
	if (buffer.byteLength === 0) throw new FileExtractError('empty');
	const bytes = new Uint8Array(buffer);
	let detected = detectFileKind(name, mime, bytes.subarray(0, 8192));
	let zip: Awaited<ReturnType<typeof loadZip>> | null = null;
	if (detected === 'unknown') {
		zip = await loadZip(buffer);
		const mimetype = zip.file('mimetype') ? (await zip.file('mimetype')!.async('string')).slice(0, 100) : undefined;
		const kind = detectZipKind(Object.keys(zip.files), mimetype);
		if (!kind) throw new FileExtractError('unsupported');
		detected = kind;
	}
	if (detected === 'image') throw new FileExtractError('image');
	if (detected === 'binary') throw new FileExtractError('binary');
	if (detected === 'legacyOffice') throw new FileExtractError('legacy');
	if (detected === 'ole') throw new FileExtractError('encrypted');

	const warnings: ExtractResult['warnings'] = [];
	const finish = (r: Omit<ExtractResult, 'warnings' | 'reliability'> & { warnings?: ExtractResult['warnings'] }): ExtractResult => {
		const all = [...warnings, ...(r.warnings ?? [])];
		if (r.text.trim() === '' && !all.some((w) => w.code === 'pdfNoText')) all.push({ code: 'noText' });
		return { ...r, reliability: reliabilityFor(r.kind), warnings: all };
	};

	switch (detected) {
		case 'text': {
			const decoded = decodeBuffer(bytes);
			if (decoded.text.length > MAX_XML_CHARS) throw new FileExtractError('tooLarge');
			const w: ExtractResult['warnings'] = decoded.encoding === 'windows-1252' ? [{ code: 'encodingFallback' }] : [];
			return finish({ text: decoded.text, kind: 'text', encoding: decoded.encoding, warnings: w });
		}
		case 'rtf': {
			const decoded = decodeBuffer(bytes);
			return finish({ text: rtfToText(decoded.text), kind: 'rtf', warnings: [{ code: 'rtfApprox' }, { code: 'formattingLost' }] });
		}
		case 'pdf': {
			const pages = await extractPdfPages(buffer);
			const scanned = isProbablyScannedPdf(pages);
			const w: ExtractResult['warnings'] = [{ code: 'formattingLost' }, { code: 'columnsPossible' }];
			if (scanned) w.unshift({ code: 'pdfNoText' });
			else {
				const empty = pages.filter((p) => p.trim() === '').length;
				if (empty > 0) w.unshift({ code: 'pdfEmptyPages', count: empty });
			}
			const text = scanned ? '' : assemblePdfPages(pages, options);
			return finish({ text, kind: 'pdf', pages: pages.length, warnings: w });
		}
		case 'xlsx': {
			const r = await extractXlsx(buffer, options, sheets);
			const w: ExtractResult['warnings'] = [];
			if (!options.showFormulas) w.push({ code: 'valuesOnly' });
			if (r.hiddenSkipped > 0) w.push({ code: 'hiddenSheetsSkipped', count: r.hiddenSkipped });
			return finish({ text: r.text, kind: 'xlsx', sheetNames: r.sheetNames, sheetsUsed: r.used, warnings: w });
		}
		case 'docx': {
			zip ??= await loadZip(buffer);
			const xml = await readXml(zip, 'word/document.xml');
			if (xml === null) throw new FileExtractError('corrupt');
			const sep = cellSeparatorString(options.cellSeparator);
			let { text, trackedChanges } = docxXmlToText(xml, options.structure, sep);
			if (text.trim() === '' && /<w:t[\s>]/.test(xml)) text = normalizeNewlines(await extractDocxFallback(buffer));
			const w: ExtractResult['warnings'] = [{ code: 'imagesIgnored' }, { code: 'formattingLost' }];
			if (trackedChanges) w.push({ code: 'trackedChanges' });
			return finish({ text, kind: 'docx', warnings: w });
		}
		case 'pptx': {
			zip ??= await loadZip(buffer);
			const slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
			if (slidePaths.length === 0) throw new FileExtractError('corrupt');
			const presentation = (await readXml(zip, 'ppt/presentation.xml')) ?? '';
			const rels = (await readXml(zip, 'ppt/_rels/presentation.xml.rels')) ?? '';
			const ordered = pptxSlideOrder(presentation, rels, slidePaths);
			const sep = cellSeparatorString(options.cellSeparator);
			const parts: string[] = [];
			for (let i = 0; i < ordered.length; i++) {
				const xml = await readXml(zip, ordered[i]);
				const body = pptxSlideXmlToText(xml ?? '', options.structure, sep);
				parts.push(options.pageMarkers ? `${slideMarker(i + 1)}\n${body}` : body);
			}
			return finish({ text: parts.join('\n\n').trim(), kind: 'pptx', slides: ordered.length, warnings: [{ code: 'imagesIgnored' }, { code: 'formattingLost' }] });
		}
		case 'odt':
		case 'ods':
		case 'odp': {
			zip ??= await loadZip(buffer);
			const manifest = await readXml(zip, 'META-INF/manifest.xml');
			if (manifest && /encryption-data/.test(manifest)) throw new FileExtractError('encrypted');
			const xml = await readXml(zip, 'content.xml');
			if (xml === null) throw new FileExtractError('corrupt');
			const r = odfXmlToText(xml, detected, {
				structure: options.structure,
				separator: cellSeparatorString(options.cellSeparator),
				pageMarkers: options.pageMarkers,
				sheets,
			});
			const w: ExtractResult['warnings'] = detected === 'ods' ? [{ code: 'valuesOnly' }] : [{ code: 'imagesIgnored' }, { code: 'formattingLost' }];
			return finish({
				text: r.text,
				kind: detected,
				slides: detected === 'odp' ? r.slides : undefined,
				sheetNames: detected === 'ods' ? r.sheetNames : undefined,
				sheetsUsed: detected === 'ods' ? r.sheetNames.filter((s) => !sheets || sheets.includes(s)) : undefined,
				warnings: w,
			});
		}
		default:
			throw new FileExtractError('unsupported');
	}
}

/** Final text cleanup for non-plain-text sources (text files keep their original line endings). */
export function finalizeExtractedText(result: ExtractResult): string {
	return result.kind === 'text' ? result.text.replace(/^﻿/, '') : normalizeNewlines(result.text);
}
