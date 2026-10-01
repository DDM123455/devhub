import { describe, expect, it } from 'vitest';
import {
	buildBitcoinPayload,
	buildEventPayload,
	buildGeoPayload,
	buildMeCardPayload,
	buildPhonePayload,
	buildWhatsAppPayload,
	DEFAULT_QR_DESIGN,
	escapeIcsText,
	escapeMeCardValue,
	parseQrDesignJson,
	pdfPlacement,
	sanitizeQrDesign,
	toIcsDateTime,
} from '../qr-encode';

describe('phone / whatsapp', () => {
	it('builds tel: keeping + and digits only', () => {
		expect(buildPhonePayload({ phone: '+84 (90) 123-4567' })).toBe('tel:+84901234567');
		expect(buildPhonePayload({ phone: '  ' })).toBe('');
		expect(buildPhonePayload({ phone: 'abc' })).toBe('');
	});
	it('builds wa.me with digits only and encoded text', () => {
		expect(buildWhatsAppPayload({ phone: '+84 90 123 4567', message: 'Xin chào & hi' })).toBe(
			'https://wa.me/84901234567?text=Xin%20ch%C3%A0o%20%26%20hi',
		);
		expect(buildWhatsAppPayload({ phone: '0084901234567', message: '' })).toBe('https://wa.me/84901234567');
		expect(buildWhatsAppPayload({ phone: '', message: 'x' })).toBe('');
	});
});

describe('MeCard', () => {
	it('escapes reserved characters', () => {
		expect(escapeMeCardValue('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
	});
	it('builds the payload with N:last,first and double terminator', () => {
		const out = buildMeCardPayload({
			firstName: 'An',
			lastName: 'Nguyen',
			phone: '+84 90 123',
			email: 'a@b.co',
			url: 'https://x.vn',
			address: '1 Road; City',
			note: '',
		});
		expect(out).toBe('MECARD:N:Nguyen,An;TEL:+8490123;EMAIL:a@b.co;URL:https\\://x.vn;ADR:1 Road\\; City;;');
	});
	it('returns empty when nothing set', () => {
		expect(buildMeCardPayload({ firstName: '', lastName: '', phone: '', email: '', url: '', address: '', note: '' })).toBe('');
	});
});

describe('geo', () => {
	it('builds geo URI', () => {
		expect(buildGeoPayload({ lat: '21.0285', lng: '105.8542' })).toBe('geo:21.0285,105.8542');
		expect(buildGeoPayload({ lat: '-33,86', lng: '151.2' })).toBe('geo:-33.86,151.2');
	});
	it('rejects invalid / out of range', () => {
		expect(buildGeoPayload({ lat: '91', lng: '0' })).toBe('');
		expect(buildGeoPayload({ lat: '0', lng: '181' })).toBe('');
		expect(buildGeoPayload({ lat: 'x', lng: '0' })).toBe('');
		expect(buildGeoPayload({ lat: '', lng: '' })).toBe('');
	});
});

describe('vEvent', () => {
	it('formats date-times', () => {
		expect(toIcsDateTime('2026-10-01T09:30', false)).toBe('20261001T093000');
		expect(toIcsDateTime('2026-10-01', true)).toBe('20261001');
		expect(toIcsDateTime('2026-10-01', false)).toBeNull();
		expect(toIcsDateTime('bad', false)).toBeNull();
	});
	it('escapes text', () => {
		expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
	});
	it('builds a timed event', () => {
		const out = buildEventPayload({
			title: 'Meet, greet',
			start: '2026-10-01T09:30',
			end: '2026-10-01T10:00',
			allDay: false,
			location: 'HN',
			description: '',
		});
		expect(out).toBe(
			['BEGIN:VEVENT', 'SUMMARY:Meet\\, greet', 'DTSTART:20261001T093000', 'DTEND:20261001T100000', 'LOCATION:HN', 'END:VEVENT'].join('\r\n'),
		);
	});
	it('builds an all-day event and requires title + start', () => {
		const out = buildEventPayload({ title: 'Day', start: '2026-10-01', end: '', allDay: true, location: '', description: '' });
		expect(out).toContain('DTSTART;VALUE=DATE:20261001');
		expect(buildEventPayload({ title: '', start: '2026-10-01', end: '', allDay: true, location: '', description: '' })).toBe('');
		expect(buildEventPayload({ title: 'x', start: '', end: '', allDay: false, location: '', description: '' })).toBe('');
	});
});

describe('bitcoin', () => {
	it('builds BIP-21 with amount and encoded label', () => {
		expect(buildBitcoinPayload({ address: ' bc1qxyz ', amount: '0.001', label: 'Cafe & Co', message: '' })).toBe(
			'bitcoin:bc1qxyz?amount=0.001&label=Cafe%20%26%20Co',
		);
	});
	it('drops invalid amounts and handles bare address', () => {
		expect(buildBitcoinPayload({ address: 'bc1qxyz', amount: '1e3', label: '', message: '' })).toBe('bitcoin:bc1qxyz');
		expect(buildBitcoinPayload({ address: 'bc1qxyz', amount: '-1', label: '', message: '' })).toBe('bitcoin:bc1qxyz');
		expect(buildBitcoinPayload({ address: 'bc1qxyz', amount: '0,5', label: '', message: '' })).toBe('bitcoin:bc1qxyz?amount=0.5');
		expect(buildBitcoinPayload({ address: '', amount: '1', label: '', message: '' })).toBe('');
	});
});

describe('design templates', () => {
	it('sanitizes untrusted data', () => {
		const d = sanitizeQrDesign({ fgColor: 'red', bgColor: '#FFEEDD', dotsType: 'evil', level: 'Z', size: 9999, cornerSquareType: 'dot', cornerDotColor: '#123456' });
		expect(d).not.toBeNull();
		expect(d!.fgColor).toBe(DEFAULT_QR_DESIGN.fgColor);
		expect(d!.bgColor).toBe('#ffeedd');
		expect(d!.dotsType).toBe('square');
		expect(d!.level).toBe('M');
		expect(d!.size).toBe(512);
		expect(d!.cornerSquareType).toBe('dot');
		expect(d!.cornerDotColor).toBe('#123456');
	});
	it('parses JSON safely', () => {
		expect(parseQrDesignJson('not json')).toBeNull();
		expect(parseQrDesignJson('[]')).toBeNull();
		expect(parseQrDesignJson(JSON.stringify(DEFAULT_QR_DESIGN))).toEqual(DEFAULT_QR_DESIGN);
	});
});

describe('pdfPlacement', () => {
	it('centres on A4', () => {
		const p = pdfPlacement(1024, 'a4');
		expect(p.pageW).toBeCloseTo(595.28);
		expect(p.x * 2 + p.size).toBeCloseTo(p.pageW);
	});
	it('fit page wraps the code with margin', () => {
		const p = pdfPlacement(400, 'fit');
		expect(p.pageW).toBe(p.size + 48);
	});
});
