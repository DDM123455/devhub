import { base64ToBytes, cleanBase64Input, extractDataUri, fromUrlSafeOrStandard } from './base64';

/** Identify raster images from their bytes rather than trusting a filename or requiring a Data URI. */
export function detectImageMime(bytes: Uint8Array): string | null {
	const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
	if (starts(137,80,78,71,13,10,26,10)) return 'image/png';
	if (starts(255,216,255)) return 'image/jpeg';
	const ascii = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a,b));
	if (/^GIF8[79]a$/.test(ascii(0,6))) return 'image/gif';
	if (ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP') return 'image/webp';
	if (starts(66,77)) return 'image/bmp';
	if (starts(0,0,1,0)) return 'image/x-icon';
	if (ascii(4,8)==='ftyp' && /avif|avis/.test(ascii(8,32))) return 'image/avif';
	return null;
}

export function decodeBase64File(input: string, fallbackMime = 'application/octet-stream') {
	const cleaned = cleanBase64Input(input);
	if (!cleaned || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(cleaned) || cleaned.replace(/=+$/, '').length % 4 === 1) throw new Error('invalidBase64');
	if (cleaned.length > 28 * 1024 * 1024) throw new Error('tooLarge');
	const normalized = fromUrlSafeOrStandard(cleaned);
	const bytes = base64ToBytes(normalized);
	const mime = detectImageMime(bytes) ?? extractDataUri(input)?.mime ?? fallbackMime;
	return { bytes, mime, dataUri: `data:${mime};base64,${normalized}` };
}
