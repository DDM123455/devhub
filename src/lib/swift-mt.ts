// SWIFT FIN messages (ISO 15022 syntax): the {1:…}{2:…}{3:…}{4:…-}{5:…} block structure and the :tag:value fields of
// block 4, with the format rules of the tags used by the common customer and institution transfers (MT103, MT202) and
// the free-format n99 messages. Everything runs on pasted text; nothing is sent anywhere.

export interface SwiftDeps {
	validBic(value: string): boolean;
	validCurrency(value: string): boolean;
	validIban(value: string): boolean;
}

export interface SwiftField {
	tag: string;
	name: string;
	value: string;
	lines: string[];
	/** readable form of a composite value (date / currency / amount, party, …) */
	info?: string;
}

export type SwiftProblem =
	| { reason: 'badSwiftBlocks'; params: { why: string } }
	| { reason: 'badSwiftHeader'; params: { block: string } }
	| { reason: 'swiftMissingTag'; params: { tag: string; mt: string } }
	| { reason: 'badSwiftTagFormat'; params: { tag: string; rule: string } }
	| { reason: 'badSwiftDate'; params: { tag: string; value: string } }
	| { reason: 'badSwiftCurrency'; params: { tag: string; value: string } }
	| { reason: 'badSwiftAmount'; params: { tag: string; value: string } }
	| { reason: 'badSwiftCode'; params: { tag: string; value: string; allowed: string } }
	| { reason: 'badSwiftBic'; params: { tag: string; value: string } }
	| { reason: 'badSwiftLineLength'; params: { tag: string; max: number } }
	| { reason: 'badSwiftLineCount'; params: { tag: string; max: number } };

export interface SwiftParse {
	ok: boolean;
	problem?: SwiftProblem;
	/** three-digit message type, '' when only block 4 was pasted */
	mt: string;
	mtName: string;
	sender: string;
	receiver: string;
	blocksSeen: string[];
	fields: SwiftField[];
}

const MT_NAMES: Record<string, string> = {
	'103': 'Single Customer Credit Transfer',
	'110': 'Advice of Cheque(s)',
	'199': 'Free Format Message',
	'200': 'Financial Institution Transfer for its Own Account',
	'202': 'General Financial Institution Transfer',
	'205': 'Financial Institution Transfer Execution',
	'299': 'Free Format Message',
	'300': 'Foreign Exchange Confirmation',
	'515': 'Client Confirmation of Purchase or Sale',
	'540': 'Receive Free',
	'541': 'Receive Against Payment',
	'542': 'Deliver Free',
	'543': 'Deliver Against Payment',
	'564': 'Corporate Action Notification',
	'700': 'Issue of a Documentary Credit',
	'799': 'Free Format Message',
	'900': 'Confirmation of Debit',
	'910': 'Confirmation of Credit',
	'940': 'Customer Statement Message',
	'941': 'Balance Report',
	'942': 'Interim Transaction Report',
	'950': 'Statement Message',
	'999': 'Free Format Message',
};

const TAG_NAMES: Record<string, string> = {
	'13C': 'Time indication',
	'20': 'Transaction reference number',
	'21': 'Related reference',
	'23B': 'Bank operation code',
	'23E': 'Instruction code',
	'25': 'Account identification',
	'26T': 'Transaction type code',
	'28C': 'Statement number / sequence number',
	'32A': 'Value date / currency / interbank settled amount',
	'33B': 'Currency / instructed amount',
	'36': 'Exchange rate',
	'50A': 'Ordering customer (BIC)',
	'50F': 'Ordering customer (party identifier)',
	'50K': 'Ordering customer (name and address)',
	'51A': "Sending institution",
	'52A': 'Ordering institution (BIC)',
	'52D': 'Ordering institution (name and address)',
	'53A': "Sender's correspondent (BIC)",
	'53B': "Sender's correspondent (location)",
	'54A': "Receiver's correspondent (BIC)",
	'55A': 'Third reimbursement institution',
	'56A': 'Intermediary institution (BIC)',
	'56D': 'Intermediary institution (name and address)',
	'57A': 'Account with institution (BIC)',
	'57D': 'Account with institution (name and address)',
	'58A': 'Beneficiary institution (BIC)',
	'58D': 'Beneficiary institution (name and address)',
	'59': 'Beneficiary customer (name and address)',
	'59A': 'Beneficiary customer (BIC)',
	'59F': 'Beneficiary customer (party identifier)',
	'60F': 'Opening balance (final)',
	'60M': 'Opening balance (intermediate)',
	'61': 'Statement line',
	'62F': 'Closing balance (booked, final)',
	'62M': 'Closing balance (booked, intermediate)',
	'64': 'Closing available balance',
	'65': 'Forward available balance',
	'70': 'Remittance information',
	'71A': 'Details of charges',
	'71F': "Sender's charges",
	'71G': "Receiver's charges",
	'72': 'Sender to receiver information',
	'77B': 'Regulatory reporting',
	'77T': 'Envelope contents',
	'79': 'Narrative',
	'86': 'Information to account owner',
};

const MANDATORY: Record<string, Array<string | string[]>> = {
	'103': ['20', '23B', '32A', ['50A', '50F', '50K'], ['59', '59A', '59F'], '71A'],
	'202': ['20', '21', '32A', ['58A', '58D']],
	'199': ['20', '79'],
	'299': ['20', '79'],
	'799': ['20', '79'],
	'999': ['20', '79'],
	'940': ['20', '25', '28C', ['60F', '60M'], ['62F', '62M']],
	'950': ['20', '25', '28C', ['60F', '60M'], ['62F', '62M']],
};

const BANK_OPERATION_CODES = ['CRED', 'CRTS', 'SPAY', 'SPRI', 'SSTD'];
const CHARGE_CODES = ['BEN', 'OUR', 'SHA'];

function validDate(yymmdd: string): boolean {
	if (!/^\d{6}$/.test(yymmdd)) return false;
	const m = Number(yymmdd.slice(2, 4));
	const day = Number(yymmdd.slice(4, 6));
	const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return m >= 1 && m <= 12 && day >= 1 && day <= days[m - 1];
}

/** Extracts the top-level {n:…} blocks; nested braces (block 3 and 5) stay inside their block. */
function splitBlocks(text: string): { blocks: Record<string, string>; error?: string } {
	const blocks: Record<string, string> = {};
	let i = 0;
	while (i < text.length) {
		if (/\s/.test(text[i])) {
			i++;
			continue;
		}
		const m = text.slice(i).match(/^\{([1-5]):/);
		if (!m) return { blocks, error: 'unexpected' };
		let depth = 0;
		let j = i;
		for (; j < text.length; j++) {
			if (text[j] === '{') depth++;
			else if (text[j] === '}') {
				depth--;
				if (depth === 0) break;
			}
		}
		if (depth !== 0) return { blocks, error: `unclosed${m[1]}` };
		blocks[m[1]] = text.slice(i + 3, j);
		i = j + 1;
	}
	return { blocks };
}

function parseFields(body: string): { fields: SwiftField[]; error?: string } {
	const fields: SwiftField[] = [];
	const lines = body.replace(/\r\n?/g, '\n').split('\n');
	let current: SwiftField | null = null;
	for (const line of lines) {
		if (line === '-' || line === '') continue;
		const m = line.match(/^:(\d{2}[A-Z]?):(.*)$/);
		if (m) {
			current = { tag: m[1], name: TAG_NAMES[m[1]] ?? 'Field', value: '', lines: [m[2]] };
			fields.push(current);
		} else if (current) {
			current.lines.push(line);
		} else {
			return { fields, error: 'text before first tag' };
		}
	}
	for (const f of fields) f.value = f.lines.join('\n');
	return { fields };
}

function checkParty(f: SwiftField, deps: SwiftDeps): SwiftProblem | null {
	// 50K / 59 / 5xD: optional /account line, then up to four (or five) lines of 35 characters
	const max = f.tag === '59' || f.tag.startsWith('50') ? 5 : 4;
	if (f.lines.length > max) return { reason: 'badSwiftLineCount', params: { tag: f.tag, max } };
	if (f.lines.some((l) => l.length > 35)) return { reason: 'badSwiftLineLength', params: { tag: f.tag, max: 35 } };
	if (f.lines.every((l) => l.trim() === '')) return { reason: 'badSwiftTagFormat', params: { tag: f.tag, rule: '35x' } };
	void deps;
	return null;
}

function checkField(f: SwiftField, deps: SwiftDeps): SwiftProblem | null {
	const tag = f.tag;
	const v = f.lines[0];
	switch (tag) {
		case '20':
		case '21':
			if (f.lines.length > 1 || v.length < 1 || v.length > 16 || /^\/|\/$|\/\//.test(v)) return { reason: 'badSwiftTagFormat', params: { tag, rule: '16x' } };
			return null;
		case '23B':
			if (!BANK_OPERATION_CODES.includes(v)) return { reason: 'badSwiftCode', params: { tag, value: v, allowed: BANK_OPERATION_CODES.join(', ') } };
			return null;
		case '32A':
		case '33B': {
			const m = tag === '32A' ? v.match(/^(\d{6})([A-Z]{3})(.+)$/) : v.match(/^([A-Z]{3})(.+)$/);
			if (!m) return { reason: 'badSwiftTagFormat', params: { tag, rule: tag === '32A' ? '6!n3!a15d' : '3!a15d' } };
			const date = tag === '32A' ? m[1] : '';
			const ccy = tag === '32A' ? m[2] : m[1];
			const amount = tag === '32A' ? m[3] : m[2];
			if (tag === '32A' && !validDate(date)) return { reason: 'badSwiftDate', params: { tag, value: date } };
			if (!deps.validCurrency(ccy)) return { reason: 'badSwiftCurrency', params: { tag, value: ccy } };
			if (!/^\d{1,14},\d{0,13}$/.test(amount) || amount.length > 15) return { reason: 'badSwiftAmount', params: { tag, value: amount } };
			f.info = `${date ? `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)} ` : ''}${ccy} ${amount.replace(',', '.').replace(/\.$/, '')}`;
			return null;
		}
		case '71A':
			if (!CHARGE_CODES.includes(v)) return { reason: 'badSwiftCode', params: { tag, value: v, allowed: CHARGE_CODES.join(', ') } };
			return null;
		case '36':
			if (!/^\d{1,12},\d{0,11}$/.test(v) || v.length > 12) return { reason: 'badSwiftTagFormat', params: { tag, rule: '12d' } };
			return null;
		case '50A':
		case '52A':
		case '53A':
		case '54A':
		case '55A':
		case '56A':
		case '57A':
		case '58A':
		case '59A': {
			// optional /account on the first line, then the BIC
			const bicLine = v.startsWith('/') ? f.lines[1] ?? '' : v;
			if (!deps.validBic(bicLine.trim())) return { reason: 'badSwiftBic', params: { tag, value: bicLine.trim() } };
			return null;
		}
		case '50K':
		case '50F':
		case '59':
		case '59F':
		case '52D':
		case '53D':
		case '56D':
		case '57D':
		case '58D':
			return checkParty(f, deps);
		case '70':
			if (f.lines.length > 4) return { reason: 'badSwiftLineCount', params: { tag, max: 4 } };
			if (f.lines.some((l) => l.length > 35)) return { reason: 'badSwiftLineLength', params: { tag, max: 35 } };
			return null;
		case '72':
			if (f.lines.length > 6) return { reason: 'badSwiftLineCount', params: { tag, max: 6 } };
			if (f.lines.some((l) => l.length > 35)) return { reason: 'badSwiftLineLength', params: { tag, max: 35 } };
			return null;
		case '79':
			if (f.lines.length > 35) return { reason: 'badSwiftLineCount', params: { tag, max: 35 } };
			if (f.lines.some((l) => l.length > 50)) return { reason: 'badSwiftLineLength', params: { tag, max: 50 } };
			return null;
		default:
			return null;
	}
}

export function looksLikeSwift(input: string): boolean {
	const t = input.trimStart();
	return /^\{[1-5]:/.test(t) || /^:20:/.test(t);
}

export function parseSwiftMt(input: string, deps: SwiftDeps): SwiftParse {
	const out: SwiftParse = { ok: false, mt: '', mtName: '', sender: '', receiver: '', blocksSeen: [], fields: [] };
	const text = input.trim();
	let body = text;
	if (text.startsWith('{')) {
		const { blocks, error } = splitBlocks(text);
		out.blocksSeen = Object.keys(blocks);
		if (error) {
			out.problem = { reason: 'badSwiftBlocks', params: { why: error } };
			return out;
		}
		if (blocks['1'] !== undefined) {
			const m = blocks['1'].match(/^F01([A-Z0-9]{8})([A-Z0-9])([A-Z0-9]{3})(\d{4})(\d{6})$/);
			if (!m || !deps.validBic(m[1])) {
				out.problem = { reason: 'badSwiftHeader', params: { block: '1' } };
				return out;
			}
			out.sender = m[1] + m[3];
		}
		if (blocks['2'] !== undefined) {
			const m = blocks['2'].match(/^I(\d{3})([A-Z0-9]{8})([A-Z0-9])([A-Z0-9]{3})([NUS]?)(\d?)(\d{0,3})$/) ?? blocks['2'].match(/^O(\d{3})(\d{4})(\d{6}[A-Z0-9]{0,6})/);
			if (!m) {
				out.problem = { reason: 'badSwiftHeader', params: { block: '2' } };
				return out;
			}
			out.mt = m[1];
			if (blocks['2'].startsWith('I')) {
				if (!deps.validBic(m[2])) {
					out.problem = { reason: 'badSwiftHeader', params: { block: '2' } };
					return out;
				}
				out.receiver = m[2] + m[4];
			}
		}
		if (blocks['4'] === undefined) {
			out.problem = { reason: 'badSwiftBlocks', params: { why: 'noBlock4' } };
			return out;
		}
		body = blocks['4'];
		if (!/(?:^|\n)-\s*$/.test(body.replace(/\r/g, ''))) {
			out.problem = { reason: 'badSwiftBlocks', params: { why: 'noTrailer' } };
			return out;
		}
	}
	out.mtName = out.mt ? (MT_NAMES[out.mt] ?? '') : '';
	const { fields, error } = parseFields(body);
	out.fields = fields;
	if (error || fields.length === 0) {
		out.problem = { reason: 'badSwiftBlocks', params: { why: 'noFields' } };
		return out;
	}
	for (const f of fields) {
		const p = checkField(f, deps);
		if (p) {
			out.problem = p;
			return out;
		}
	}
	const needed = out.mt ? MANDATORY[out.mt] : undefined;
	if (needed) {
		for (const req of needed) {
			const options = Array.isArray(req) ? req : [req];
			if (!fields.some((f) => options.includes(f.tag))) {
				out.problem = { reason: 'swiftMissingTag', params: { tag: options.join(' / '), mt: out.mt } };
				return out;
			}
		}
	}
	out.ok = true;
	return out;
}
