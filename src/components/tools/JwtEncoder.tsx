import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	algFamily,
	applyTimePreset,
	generateJwtKeyPair,
	JWT_ALGS,
	JwtKeyError,
	signJwtInput,
	type ExpPreset,
	type JwtAlg,
} from '@/lib/jwt-crypto';
import { stringToBase64Url } from '@/lib/jwt';
import { formatJsonLossless } from '@/lib/text-format';
import { useCopyToClipboard } from './useCopyToClipboard';

export interface JwtEncoderMessages {
	heading: string;
	intro: string;
	algLabel: string;
	headerLabel: string;
	payloadLabel: string;
	presetLabel: string;
	presetNone: string;
	preset15m: string;
	preset1h: string;
	preset24h: string;
	preset7d: string;
	preset30d: string;
	applyTime: string;
	secretLabel: string;
	secretBase64: string;
	privateKeyLabel: string;
	privateKeyPlaceholder: string;
	generateKeys: string;
	generating: string;
	generatedNote: string;
	publicKeyOut: string;
	signButton: string;
	tokenOut: string;
	invalidJson: string;
	genericError: string;
	copy: string;
	copied: string;
	copyFailed: string;
	useInDecoder: string;
}

const DEFAULT_PAYLOAD = '{\n  "sub": "1234567890",\n  "name": "John Doe"\n}';

function CopyBtn({ text, messages }: { text: string; messages: JwtEncoderMessages }) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button type="button" size="sm" variant="outline" className="min-h-9" aria-live="polite" disabled={!text} onClick={() => void copy(text)}>
			{copied ? messages.copied : failed ? messages.copyFailed : messages.copy}
		</Button>
	);
}

const fieldClass = 'w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground';

export default function JwtEncoder({
	messages,
	keyErrors,
	onUseToken,
}: {
	messages: JwtEncoderMessages;
	keyErrors: Record<string, string>;
	onUseToken: (token: string) => void;
}) {
	const [alg, setAlg] = useState<JwtAlg>('HS256');
	const [headerText, setHeaderText] = useState('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
	const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD);
	const [preset, setPreset] = useState<ExpPreset>('1h');
	const [secret, setSecret] = useState('');
	const [secretIsBase64Url, setSecretIsBase64Url] = useState(false);
	const [privateKey, setPrivateKey] = useState('');
	const [publicKeyOut, setPublicKeyOut] = useState('');
	const [generating, setGenerating] = useState(false);
	const [token, setToken] = useState('');
	const [error, setError] = useState<string | null>(null);
	const family = algFamily(alg);

	const describeError = (err: unknown) => (err instanceof JwtKeyError ? (keyErrors[err.code] ?? messages.genericError) : messages.genericError);

	const handleAlgChange = (next: JwtAlg) => {
		setAlg(next);
		setToken('');
		setError(null);
		setPublicKeyOut('');
		// Keep the header in step with the chosen algorithm (preserving other header fields).
		try {
			const parsed = JSON.parse(headerText);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				setHeaderText(JSON.stringify({ ...parsed, alg: next }, null, 2));
			}
		} catch {
			setHeaderText(JSON.stringify({ alg: next, typ: 'JWT' }, null, 2));
		}
	};

	const handleApplyTime = () => setPayloadText(applyTimePreset(payloadText, preset, Date.now()));

	const handleGenerate = async () => {
		setGenerating(true);
		setError(null);
		try {
			const pair = await generateJwtKeyPair(alg);
			setPrivateKey(pair.privatePem);
			setPublicKeyOut(pair.publicPem + '\n\n' + JSON.stringify(pair.publicJwk, null, 2));
			setToken('');
		} catch (err) {
			setError(describeError(err));
		} finally {
			setGenerating(false);
		}
	};

	const handleSign = async () => {
		setError(null);
		setToken('');
		const header = formatJsonLossless(headerText, true);
		const payload = formatJsonLossless(payloadText, true);
		let headerObj: unknown;
		try {
			headerObj = JSON.parse(headerText);
			JSON.parse(payloadText);
		} catch {
			setError(messages.invalidJson);
			return;
		}
		if (!header || !payload) {
			setError(messages.invalidJson);
			return;
		}
		// The header's alg is authoritative for what gets signed; the dropdown just edits it.
		const headerAlg = (headerObj as { alg?: unknown } | null)?.alg;
		const signAlg = typeof headerAlg === 'string' && (JWT_ALGS as string[]).includes(headerAlg) ? (headerAlg as JwtAlg) : alg;
		const signingInput = `${stringToBase64Url(header.value)}.${stringToBase64Url(payload.value)}`;
		try {
			const key = algFamily(signAlg) === 'hmac' ? secret : privateKey;
			const signature = await signJwtInput(signAlg, signingInput, key, { secretIsBase64Url });
			setToken(`${signingInput}.${signature}`);
		} catch (err) {
			setError(describeError(err));
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
			<span className="text-sm font-medium text-foreground">{messages.heading}</span>
			<p className="text-xs text-muted-foreground">{messages.intro}</p>

			<label className="flex items-center gap-2 text-sm text-foreground">
				{messages.algLabel}
				<select
					value={alg}
					onChange={(e) => handleAlgChange(e.target.value as JwtAlg)}
					className="min-h-9 rounded-md border border-border bg-background px-2 font-mono text-sm"
				>
					{JWT_ALGS.map((a) => (
						<option key={a} value={a}>
							{a}
						</option>
					))}
				</select>
			</label>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label htmlFor="jwt-enc-header" className="text-xs text-muted-foreground">
						{messages.headerLabel}
					</label>
					<textarea id="jwt-enc-header" value={headerText} onChange={(e) => setHeaderText(e.target.value)} rows={6} spellCheck={false} className={fieldClass} />
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="jwt-enc-payload" className="text-xs text-muted-foreground">
						{messages.payloadLabel}
					</label>
					<textarea id="jwt-enc-payload" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} rows={6} spellCheck={false} className={fieldClass} />
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<label className="flex items-center gap-2 text-sm text-foreground">
					{messages.presetLabel}
					<select value={preset} onChange={(e) => setPreset(e.target.value as ExpPreset)} className="min-h-9 rounded-md border border-border bg-background px-2 text-sm">
						<option value="none">{messages.presetNone}</option>
						<option value="15m">{messages.preset15m}</option>
						<option value="1h">{messages.preset1h}</option>
						<option value="24h">{messages.preset24h}</option>
						<option value="7d">{messages.preset7d}</option>
						<option value="30d">{messages.preset30d}</option>
					</select>
				</label>
				<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={handleApplyTime}>
					{messages.applyTime}
				</Button>
			</div>

			{family === 'hmac' ? (
				<div className="flex flex-col gap-2">
					<label htmlFor="jwt-enc-secret" className="text-xs text-muted-foreground">
						{messages.secretLabel}
					</label>
					<input
						id="jwt-enc-secret"
						type="password"
						autoComplete="off"
						value={secret}
						onChange={(e) => setSecret(e.target.value)}
						spellCheck={false}
						className={fieldClass}
					/>
					<label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
						<input type="checkbox" checked={secretIsBase64Url} onChange={(e) => setSecretIsBase64Url(e.target.checked)} />
						{messages.secretBase64}
					</label>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					<label htmlFor="jwt-enc-private" className="text-xs text-muted-foreground">
						{messages.privateKeyLabel}
					</label>
					<textarea
						id="jwt-enc-private"
						value={privateKey}
						onChange={(e) => setPrivateKey(e.target.value)}
						placeholder={messages.privateKeyPlaceholder}
						rows={5}
						spellCheck={false}
						autoComplete="off"
						className={fieldClass}
					/>
					<div>
						<Button type="button" size="sm" variant="outline" className="min-h-9" disabled={generating} onClick={() => void handleGenerate()}>
							{generating ? messages.generating : messages.generateKeys}
						</Button>
					</div>
					{publicKeyOut && (
						<div className="flex flex-col gap-1">
							<span className="text-xs text-muted-foreground">{messages.publicKeyOut}</span>
							<textarea readOnly value={publicKeyOut} rows={8} spellCheck={false} aria-label={messages.publicKeyOut} className={fieldClass} />
							<p className="text-xs text-muted-foreground">{messages.generatedNote}</p>
						</div>
					)}
				</div>
			)}

			<div>
				<Button type="button" size="sm" className="min-h-9" onClick={() => void handleSign()}>
					{messages.signButton}
				</Button>
			</div>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{token && (
				<div className="flex flex-col gap-1">
					<span className="text-xs text-muted-foreground">{messages.tokenOut}</span>
					<textarea readOnly value={token} rows={4} aria-label={messages.tokenOut} className={`${fieldClass} break-all`} />
					<div className="flex flex-wrap gap-2">
						<CopyBtn text={token} messages={messages} />
						<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => onUseToken(token)}>
							{messages.useInDecoder}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
