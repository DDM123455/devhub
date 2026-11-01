// BER-TLV parser for EMV chip data (ISO/IEC 7816-4 / EMV Book 3), used to unpack DE 55 of an ISO 8583 message.
import { EMV_TAGS } from './iso-data/iso8583-codes';

export interface TlvItem {
	tag: string;
	name: string;
	/** value as hex */
	value: string;
	/** nested items when the tag is constructed */
	children?: TlvItem[];
}

const nameOf = (tag: string): string => EMV_TAGS[tag] ?? (tag.startsWith('DF') || tag.startsWith('FF') ? EMV_TAGS['DF'] : 'Unknown tag');

/** Parses hex into TLV items; null when the bytes are not well-formed BER-TLV. Zero padding between items is skipped. */
export function parseTlv(hex: string, depth = 0): TlvItem[] | null {
	if (!/^(?:[0-9A-Fa-f]{2})*$/.test(hex) || hex === '' || depth > 4) return null;
	const bytes = hex.match(/../g)!.map((h) => parseInt(h, 16));
	const items: TlvItem[] = [];
	let i = 0;
	while (i < bytes.length) {
		if (bytes[i] === 0x00) {
			i++;
			continue;
		}
		const start = i;
		const first = bytes[i++];
		if ((first & 0x1f) === 0x1f) {
			let more = true;
			while (more) {
				if (i >= bytes.length) return null;
				more = (bytes[i] & 0x80) !== 0;
				i++;
			}
		}
		const tag = bytes
			.slice(start, i)
			.map((b) => b.toString(16).padStart(2, '0').toUpperCase())
			.join('');
		if (i >= bytes.length) return null;
		let len = bytes[i++];
		if (len & 0x80) {
			const n = len & 0x7f;
			if (n < 1 || n > 2 || i + n > bytes.length) return null;
			len = 0;
			for (let k = 0; k < n; k++) len = (len << 8) | bytes[i++];
		}
		if (i + len > bytes.length) return null;
		const value = bytes
			.slice(i, i + len)
			.map((b) => b.toString(16).padStart(2, '0').toUpperCase())
			.join('');
		i += len;
		const item: TlvItem = { tag, name: nameOf(tag), value };
		if (first & 0x20 && value !== '') {
			const kids = parseTlv(value, depth + 1);
			if (kids) item.children = kids;
		}
		items.push(item);
	}
	return items.length > 0 ? items : null;
}

/** A readable form of a few well-known primitive values; null when there is nothing useful to add. */
export function explainTlvValue(tag: string, value: string): string | null {
	switch (tag) {
		case '5F2A':
		case '9F1A':
		case '5F28':
			return `code ${value.replace(/^0+(?=\d{3}$)/, '').padStart(3, '0')}`;
		case '9A':
		case '5F24':
		case '5F25':
			return value.length === 6 ? `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}` : null;
		case '9F21':
			return value.length === 6 ? `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}` : null;
		case '9F02':
		case '9F03':
			return /^\d{12}$/.test(value) ? `${Number(value)} (minor units)` : null;
		case '9C':
			return { '00': 'purchase', '01': 'cash withdrawal', '09': 'purchase with cashback', '20': 'refund', '31': 'balance inquiry' }[value] ?? null;
		case '9F27': {
			const kind = parseInt(value, 16) & 0xc0;
			return kind === 0x40 ? 'TC, approved offline' : kind === 0x80 ? 'ARQC, go online' : kind === 0 ? 'AAC, declined offline' : null;
		}
		case '5A':
		case '57':
			return null;
		case '4F':
		case '84':
		case '9F06': {
			const rid = value.slice(0, 10);
			const known: Record<string, string> = {
				A000000003: 'Visa',
				A000000004: 'Mastercard',
				A000000025: 'American Express',
				A000000065: 'JCB',
				A000000152: 'Discover',
				A000000333: 'UnionPay',
				A000000727: 'NAPAS',
			};
			return known[rid] ?? null;
		}
		default: {
			// text-looking primitive values
			if (['50', '5F20', '9F12'].includes(tag)) {
				const text = (value.match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join('');
				return /^[\x20-\x7e]+$/.test(text) ? `"${text.trim()}"` : null;
			}
			return null;
		}
	}
}

/** Flattens a TLV tree into display lines "9F26 · Application cryptogram: 1A2B…". */
export function tlvLines(items: TlvItem[], indent = ''): string[] {
	const out: string[] = [];
	for (const it of items) {
		const note = it.children ? '' : explainTlvValue(it.tag, it.value);
		out.push(`${indent}${it.tag} · ${it.name}${it.children ? '' : `: ${it.value}`}${note ? ` (${note})` : ''}`);
		if (it.children) out.push(...tlvLines(it.children, indent + '  '));
	}
	return out;
}
