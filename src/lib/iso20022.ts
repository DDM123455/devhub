// ISO 20022 XML messages (pain, pacs, camt…): well-formedness, the message identifier in the namespace, the expected
// business element, the group header (MsgId, CreDtTm, NbOfTxs, CtrlSum) and the typed leaf values (IBAN, BIC, currency,
// text lengths). It does NOT validate against the published XSD files — those are large and versioned — so a message can
// pass here and still be rejected by a bank's schema check; the results say which rules were applied.

export interface Iso20022Deps {
	validBic(value: string): boolean;
	validCurrency(value: string): boolean;
	validIban(value: string): boolean;
}

export interface XNode {
	name: string;
	attrs: Record<string, string>;
	text: string;
	children: XNode[];
	line: number;
}

export type Iso20022Problem =
	| { reason: 'badXml'; params: { line: number; why: string } }
	| { reason: 'badIso20022Namespace'; params: { value: string } }
	| { reason: 'badIso20022Root'; params: { expected: string; got: string } }
	| { reason: 'badIso20022Header'; params: { element: string; why: string } }
	| { reason: 'badIso20022Count'; params: { expected: number; got: number } }
	| { reason: 'badIso20022CtrlSum'; params: { expected: string; got: string } }
	| { reason: 'badIso20022Iban'; params: { value: string } }
	| { reason: 'badIso20022Bic'; params: { value: string } }
	| { reason: 'badIso20022Currency'; params: { value: string } }
	| { reason: 'badIso20022Amount'; params: { value: string } }
	| { reason: 'badIso20022Length'; params: { element: string; max: number } };

export interface Iso20022Parse {
	ok: boolean;
	problem?: Iso20022Problem;
	messageId: string;
	messageName: string;
	rootElement: string;
	groupHeader: Array<[string, string]>;
	txCount: number;
	notes: string[];
}

// ---------------------------------------------------------------------------------------------------------
// minimal XML parser (elements, attributes, text, comments, CDATA, processing instructions; DOCTYPE is refused)

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
	s.replace(/&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
		if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
		return ENTITIES[e];
	});
const local = (n: string) => n.slice(n.indexOf(':') + 1);

export function parseXml(xml: string): { root: XNode } | { error: { line: number; why: string } } {
	const lineAt = (pos: number) => xml.slice(0, pos).split('\n').length;
	const stack: XNode[] = [];
	let root: XNode | null = null;
	let i = 0;
	if (xml.charCodeAt(0) === 0xfeff) i = 1;
	const fail = (pos: number, why: string) => ({ error: { line: lineAt(pos), why } });
	while (i < xml.length) {
		if (xml[i] !== '<') {
			const next = xml.indexOf('<', i);
			const chunk = xml.slice(i, next < 0 ? xml.length : next);
			if (stack.length > 0) stack[stack.length - 1].text += decode(chunk);
			else if (chunk.trim() !== '') return fail(i, 'text outside the root element');
			i = next < 0 ? xml.length : next;
			continue;
		}
		if (xml.startsWith('<!--', i)) {
			const end = xml.indexOf('-->', i + 4);
			if (end < 0) return fail(i, 'unterminated comment');
			i = end + 3;
		} else if (xml.startsWith('<![CDATA[', i)) {
			const end = xml.indexOf(']]>', i);
			if (end < 0 || stack.length === 0) return fail(i, 'bad CDATA section');
			stack[stack.length - 1].text += xml.slice(i + 9, end);
			i = end + 3;
		} else if (xml.startsWith('<?', i)) {
			const end = xml.indexOf('?>', i);
			if (end < 0) return fail(i, 'unterminated processing instruction');
			i = end + 2;
		} else if (xml.startsWith('<!', i)) {
			return fail(i, 'DOCTYPE and entity declarations are not allowed in ISO 20022 messages');
		} else if (xml.startsWith('</', i)) {
			const end = xml.indexOf('>', i);
			if (end < 0) return fail(i, 'unterminated closing tag');
			const name = xml.slice(i + 2, end).trim();
			const open = stack.pop();
			if (!open) return fail(i, `unexpected closing tag </${name}>`);
			if (open.name !== name) return fail(i, `closing tag </${name}> does not match <${open.name}> opened on line ${open.line}`);
			i = end + 1;
		} else {
			const m = xml.slice(i).match(/^<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/);
			if (!m) return fail(i, 'malformed tag');
			const attrs: Record<string, string> = {};
			for (const a of m[2].matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
			const node: XNode = { name: m[1], attrs, text: '', children: [], line: lineAt(i) };
			if (stack.length > 0) stack[stack.length - 1].children.push(node);
			else if (root) return fail(i, 'more than one root element');
			else root = node;
			if (m[3] !== '/') stack.push(node);
			i += m[0].length;
		}
	}
	if (stack.length > 0) return fail(xml.length, `<${stack[stack.length - 1].name}> opened on line ${stack[stack.length - 1].line} is never closed`);
	if (!root) return fail(0, 'no root element');
	return { root };
}

// ---------------------------------------------------------------------------------------------------------
// message families

interface Family {
	name: string;
	/** the business element that must be the first child of Document */
	body: string;
	/** the repeated transaction element, when the message has one */
	tx?: string;
}

const FAMILIES: Record<string, Family> = {
	'pain.001': { name: 'Customer Credit Transfer Initiation', body: 'CstmrCdtTrfInitn', tx: 'CdtTrfTxInf' },
	'pain.002': { name: 'Customer Payment Status Report', body: 'CstmrPmtStsRpt' },
	'pain.008': { name: 'Customer Direct Debit Initiation', body: 'CstmrDrctDbtInitn', tx: 'DrctDbtTxInf' },
	'pacs.002': { name: 'FI to FI Payment Status Report', body: 'FIToFIPmtStsRpt' },
	'pacs.003': { name: 'FI to FI Customer Direct Debit', body: 'FIToFICstmrDrctDbt', tx: 'DrctDbtTxInf' },
	'pacs.004': { name: 'Payment Return', body: 'PmtRtr', tx: 'TxInf' },
	'pacs.008': { name: 'FI to FI Customer Credit Transfer', body: 'FIToFICstmrCdtTrf', tx: 'CdtTrfTxInf' },
	'pacs.009': { name: 'Financial Institution Credit Transfer', body: 'FICdtTrf', tx: 'CdtTrfTxInf' },
	'camt.029': { name: 'Resolution of Investigation', body: 'RsltnOfInvstgtn' },
	'camt.052': { name: 'Bank to Customer Account Report', body: 'BkToCstmrAcctRpt' },
	'camt.053': { name: 'Bank to Customer Statement', body: 'BkToCstmrStmt' },
	'camt.054': { name: 'Bank to Customer Debit Credit Notification', body: 'BkToCstmrDbtCdtNtfctn' },
	'camt.056': { name: 'FI to FI Payment Cancellation Request', body: 'FIToFIPmtCxlReq' },
};

const NS = /^urn:iso:std:iso:20022:tech:xsd:([a-z]{4}\.\d{3}\.\d{3}\.\d{2})$/;

function walk(node: XNode, visit: (n: XNode) => void) {
	visit(node);
	for (const c of node.children) walk(c, visit);
}
const childText = (n: XNode, name: string) => n.children.find((c) => local(c.name) === name)?.text.trim();
const ISO_DATETIME = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/;
const MAX35 = new Set(['MsgId', 'PmtInfId', 'InstrId', 'EndToEndId', 'TxId', 'UETR']);

export function looksLikeIso20022(input: string): boolean {
	return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:\w+:)?(?:Document|AppHdr)\b/.test(input);
}

export function parseIso20022(input: string, deps: Iso20022Deps): Iso20022Parse {
	const out: Iso20022Parse = { ok: false, messageId: '', messageName: '', rootElement: '', groupHeader: [], txCount: 0, notes: [] };
	const parsed = parseXml(input.trim());
	if ('error' in parsed) {
		out.problem = { reason: 'badXml', params: { line: parsed.error.line, why: parsed.error.why } };
		return out;
	}
	const doc = parsed.root;
	const rootName = local(doc.name);
	const ns = doc.attrs[doc.name.includes(':') ? `xmlns:${doc.name.split(':')[0]}` : 'xmlns'] ?? '';
	if (rootName !== 'Document' && rootName !== 'AppHdr') {
		out.problem = { reason: 'badIso20022Root', params: { expected: 'Document', got: rootName } };
		return out;
	}
	const m = ns.match(NS);
	if (!m) {
		out.problem = { reason: 'badIso20022Namespace', params: { value: ns || '(none)' } };
		return out;
	}
	out.messageId = m[1];
	const family = FAMILIES[m[1].slice(0, 8)];
	out.messageName = m[1].startsWith('head.') ? 'Business Application Header' : (family?.name ?? '');
	if (rootName === 'AppHdr') {
		out.ok = true;
		out.rootElement = 'AppHdr';
		return out;
	}
	const body = doc.children[0];
	out.rootElement = body ? local(body.name) : '';
	if (!family) out.notes.push('unknownFamily');
	if (family && out.rootElement !== family.body) {
		out.problem = { reason: 'badIso20022Root', params: { expected: family.body, got: out.rootElement || '(empty)' } };
		return out;
	}
	if (!body) {
		out.problem = { reason: 'badIso20022Root', params: { expected: 'business element', got: '(empty)' } };
		return out;
	}

	// group header
	const hdr = body.children.find((c) => local(c.name) === 'GrpHdr');
	if (!hdr) {
		out.problem = { reason: 'badIso20022Header', params: { element: 'GrpHdr', why: 'missing' } };
		return out;
	}
	const msgId = childText(hdr, 'MsgId');
	if (!msgId) {
		out.problem = { reason: 'badIso20022Header', params: { element: 'MsgId', why: 'missing' } };
		return out;
	}
	if (msgId.length > 35) {
		out.problem = { reason: 'badIso20022Length', params: { element: 'MsgId', max: 35 } };
		return out;
	}
	const created = childText(hdr, 'CreDtTm');
	if (!created || !ISO_DATETIME.test(created)) {
		out.problem = { reason: 'badIso20022Header', params: { element: 'CreDtTm', why: created ? 'format' : 'missing' } };
		return out;
	}
	out.groupHeader.push(['MsgId', msgId], ['CreDtTm', created]);

	// transactions and totals
	let txCount = 0;
	const amounts: string[] = [];
	walk(body, (n) => {
		const name = local(n.name);
		if (family?.tx && name === family.tx) txCount++;
		if (name === 'InstdAmt' || name === 'IntrBkSttlmAmt') amounts.push(n.text.trim());
	});
	out.txCount = txCount;
	const nb = childText(hdr, 'NbOfTxs');
	if (nb !== undefined) {
		out.groupHeader.push(['NbOfTxs', nb]);
		if (!/^\d{1,15}$/.test(nb)) {
			out.problem = { reason: 'badIso20022Header', params: { element: 'NbOfTxs', why: 'format' } };
			return out;
		}
		if (family?.tx && Number(nb) !== txCount) {
			out.problem = { reason: 'badIso20022Count', params: { expected: Number(nb), got: txCount } };
			return out;
		}
	}
	const ctrl = childText(hdr, 'CtrlSum');
	if (ctrl !== undefined) {
		out.groupHeader.push(['CtrlSum', ctrl]);
		// pain.001 repeats CtrlSum per payment info, so the group total is the sum of every instructed amount
		const cents = amounts.reduce((a, v) => a + Math.round(Number(v) * 100), 0);
		if (amounts.length > 0 && Math.abs(cents - Math.round(Number(ctrl) * 100)) > 0) {
			out.problem = { reason: 'badIso20022CtrlSum', params: { expected: (cents / 100).toFixed(2), got: ctrl } };
			return out;
		}
	}

	// typed leaves
	let problem: Iso20022Problem | null = null;
	walk(body, (n) => {
		if (problem) return;
		const name = local(n.name);
		const text = n.text.trim();
		if (name === 'IBAN' && !deps.validIban(text)) problem = { reason: 'badIso20022Iban', params: { value: text } };
		else if ((name === 'BIC' || name === 'BICFI' || name === 'AnyBIC') && !deps.validBic(text)) problem = { reason: 'badIso20022Bic', params: { value: text } };
		else if (n.attrs.Ccy !== undefined) {
			if (!deps.validCurrency(n.attrs.Ccy)) problem = { reason: 'badIso20022Currency', params: { value: n.attrs.Ccy } };
			else if (!/^\d{1,18}(\.\d{1,5})?$/.test(text) || Number(text) <= 0) problem = { reason: 'badIso20022Amount', params: { value: text } };
		} else if (MAX35.has(name) && text.length > 35) problem = { reason: 'badIso20022Length', params: { element: name, max: 35 } };
		else if (name === 'Ustrd' && text.length > 140) problem = { reason: 'badIso20022Length', params: { element: name, max: 140 } };
	});
	if (problem) {
		out.problem = problem;
		return out;
	}
	out.ok = true;
	return out;
}
