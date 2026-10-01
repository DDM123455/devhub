const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');

/** Serialize JSON-LD an toàn để nhúng vào <script>: escape < (chặn "</script>"), U+2028/2029. */
export function jsonLd(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, '\\u003c')
		.replace(LS, '\\u2028')
		.replace(PS, '\\u2029');
}
