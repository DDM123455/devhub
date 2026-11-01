import { describe, expect, it } from 'vitest';
import { validateLine, validateText } from '../iso-validate';
import { parseXml } from '../iso20022';

const MT103 = `{1:F01BANKBEBBAXXX0000000000}{2:I103BANKDEFFXXXXN}{3:{108:MT103 001}}{4:
:20:REF20240315001
:23B:CRED
:32A:240315USD1000,50
:50K:/123456789
JOHN DOE
1 MAIN STREET
:59:/DE89370400440532013000
JANE ROE
:71A:SHA
-}`;

describe('SWIFT MT (ISO 15022)', () => {
	it('accepts a complete MT103 and reads header, type and fields', () => {
		const r = validateLine(MT103);
		expect(r.status).toBe('valid');
		const m = r.matches[0];
		expect(m.standard).toBe('swift');
		expect(m.details.find((x) => x.key === 'swiftType')!.value).toContain('MT103');
		expect(m.details.find((x) => x.key === 'sender')!.value).toBe('BANKBEBBXXX');
		expect(m.details.find((x) => x.key === 'receiver')!.value).toBe('BANKDEFFXXX');
		expect(m.details.filter((x) => x.key === 'field')).toHaveLength(6);
		expect(m.details.some((x) => x.key === 'field' && x.value.includes('2024-03-15 USD 1000.50'))).toBe(true);
	});
	it('treats the whole pasted text as one message', () => {
		const t = validateText(MT103);
		expect(t.rows).toHaveLength(1);
		expect(t.counts.valid).toBe(1);
	});
	it('names the missing mandatory tag', () => {
		const r = validateLine(MT103.replace(':71A:SHA\n', ''), 'swift');
		expect(r.matches[0].reason).toBe('swiftMissingTag');
		expect(r.matches[0].reasonParams).toMatchObject({ tag: '71A', mt: '103' });
	});
	it('checks the value of tag 32A: date, currency and amount', () => {
		expect(validateLine(MT103.replace(':32A:240315', ':32A:241315'), 'swift').matches[0].reason).toBe('badSwiftDate');
		expect(validateLine(MT103.replace(':32A:240315USD', ':32A:240315QQQ'), 'swift').matches[0].reason).toBe('badSwiftCurrency');
		expect(validateLine(MT103.replace('1000,50', '1000.50'), 'swift').matches[0].reason).toBe('badSwiftAmount');
	});
	it('checks code lists and line limits', () => {
		expect(validateLine(MT103.replace(':23B:CRED', ':23B:WIRE'), 'swift').matches[0].reason).toBe('badSwiftCode');
		expect(validateLine(MT103.replace(':71A:SHA', ':71A:XXX'), 'swift').matches[0].reason).toBe('badSwiftCode');
		expect(validateLine(MT103.replace('JANE ROE', 'J'.repeat(36)), 'swift').matches[0].reason).toBe('badSwiftLineLength');
		expect(validateLine(MT103.replace(':20:REF20240315001', ':20:' + 'R'.repeat(17)), 'swift').matches[0].reason).toBe('badSwiftTagFormat');
	});
	it('rejects a bad header BIC and a missing trailer', () => {
		expect(validateLine(MT103.replace('BANKBEBBAXXX', 'BANKQQQQAXXX'), 'swift').matches[0].reason).toBe('badSwiftHeader');
		expect(validateLine(MT103.replace('\n-}', '}'), 'swift').matches[0].reason).toBe('badSwiftBlocks');
	});
	it('accepts block 4 pasted on its own, with a note that the type is unknown', () => {
		const body = ':20:ABC\n:79:Hello there';
		const r = validateLine(body, 'swift').matches[0];
		expect(r.ok).toBe(true);
		expect(r.details.some((x) => x.key === 'note' && x.value === 'swiftNoType')).toBe(true);
	});
	it('validates a BIC in a 5xA tag', () => {
		const mt202 = `{1:F01BANKBEBBAXXX0000000000}{2:I202BANKDEFFXXXXN}{4:\n:20:REF1\n:21:REF2\n:32A:240315EUR5000,\n:58A:BANKDEFF\n-}`;
		expect(validateLine(mt202, 'swift').matches[0].ok).toBe(true);
		expect(validateLine(mt202.replace(':58A:BANKDEFF', ':58A:NOTABIC'), 'swift').matches[0].reason).toBe('badSwiftBic');
	});
});

const PAIN001 = (extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>MSG-0001</MsgId>
      <CreDtTm>2024-03-15T10:00:00Z</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>150.50</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT1</PmtInfId>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>E2E-1</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">100.00</InstdAmt></Amt>
        <CdtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>Invoice 1</Ustrd></RmtInf>
      </CdtTrfTxInf>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>E2E-2</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">50.50</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><BICFI>DEUTDEFF</BICFI></FinInstnId></CdtrAgt>
      </CdtTrfTxInf>${extra}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

describe('ISO 20022 XML', () => {
	it('accepts a consistent pain.001 and reports what it found', () => {
		const r = validateLine(PAIN001());
		expect(r.status).toBe('valid');
		const m = r.matches[0];
		expect(m.standard).toBe('iso20022');
		expect(m.details.find((x) => x.key === 'messageType')!.value).toBe('pain.001.001.09');
		expect(m.details.find((x) => x.key === 'messageName')!.value).toContain('Credit Transfer Initiation');
		expect(m.details.find((x) => x.key === 'txCount')!.value).toBe('2');
		expect(m.details.some((x) => x.key === 'note' && x.value === 'schemaNotChecked')).toBe(true);
	});
	it('is read as one message, not one value per line', () => {
		expect(validateText(PAIN001()).rows).toHaveLength(1);
	});
	it('catches a wrong transaction count and a wrong control sum', () => {
		expect(validateLine(PAIN001().replace('<NbOfTxs>2<', '<NbOfTxs>3<'), 'iso20022').matches[0].reason).toBe('badIso20022Count');
		const r = validateLine(PAIN001().replace('<CtrlSum>150.50<', '<CtrlSum>150.00<'), 'iso20022').matches[0];
		expect(r.reason).toBe('badIso20022CtrlSum');
		expect(r.reasonParams).toMatchObject({ expected: '150.50', got: '150.00' });
	});
	it('checks IBAN, BIC, currency and amount values', () => {
		expect(validateLine(PAIN001().replace('DE89370400440532013000', 'DE89370400440532013001'), 'iso20022').matches[0].reason).toBe('badIso20022Iban');
		expect(validateLine(PAIN001().replace('DEUTDEFF', 'NOTABIC'), 'iso20022').matches[0].reason).toBe('badIso20022Bic');
		expect(validateLine(PAIN001().replace(/Ccy="EUR">50.50/, 'Ccy="QQQ">50.50'), 'iso20022').matches[0].reason).toBe('badIso20022Currency');
		expect(validateLine(PAIN001().replace('>50.50<', '>-50.50<').replace('150.50', '49.50'), 'iso20022').matches[0].reason).toBe('badIso20022Amount');
	});
	it('checks text lengths', () => {
		expect(validateLine(PAIN001().replace('E2E-1', 'E'.repeat(36)), 'iso20022').matches[0].reason).toBe('badIso20022Length');
	});
	it('reports XML that is not well-formed, with the line', () => {
		const r = validateLine(PAIN001().replace('</GrpHdr>', '</GrpHdx>'), 'iso20022').matches[0];
		expect(r.reason).toBe('badXml');
		expect(Number(r.reasonParams!.line)).toBeGreaterThan(1);
	});
	it('refuses DOCTYPE declarations (entity expansion attacks)', () => {
		const r = validateLine('<!DOCTYPE x [<!ENTITY a "b">]>' + PAIN001(), 'iso20022').matches[0];
		expect(r.reason).toBe('badXml');
	});
	it('checks the namespace and the business element', () => {
		expect(validateLine(PAIN001().replace('urn:iso:std:iso:20022:tech:xsd:pain.001.001.09', 'http://example.com'), 'iso20022').matches[0].reason).toBe('badIso20022Namespace');
		expect(validateLine(PAIN001().replace(/CstmrCdtTrfInitn/g, 'FIToFICstmrCdtTrf'), 'iso20022').matches[0].reason).toBe('badIso20022Root');
	});
	it('requires the group header fields', () => {
		expect(validateLine(PAIN001().replace(/<MsgId>.*<\/MsgId>/, ''), 'iso20022').matches[0].reason).toBe('badIso20022Header');
		expect(validateLine(PAIN001().replace('2024-03-15T10:00:00Z', '15/03/2024'), 'iso20022').matches[0].reason).toBe('badIso20022Header');
	});
});

describe('parseXml', () => {
	it('decodes entities, CDATA and attributes', () => {
		const r = parseXml('<a x="1 &amp; 2"><b>a &lt; b</b><c><![CDATA[<raw>]]></c></a>');
		expect('root' in r).toBe(true);
		if ('root' in r) {
			expect(r.root.attrs.x).toBe('1 & 2');
			expect(r.root.children[0].text).toBe('a < b');
			expect(r.root.children[1].text).toBe('<raw>');
		}
	});
	it('rejects unclosed and extra roots', () => {
		expect('error' in parseXml('<a><b></a>')).toBe(true);
		expect('error' in parseXml('<a></a><b></b>')).toBe(true);
		expect('error' in parseXml('<a>')).toBe(true);
	});
});
