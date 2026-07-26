import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Messages {
	tokenLabel: string;
	tokenPlaceholder: string;
	loadSample: string;
	clear: string;
	decodeErrorFormat: string;
	decodeErrorBase64: string;
	decodeErrorJson: string;
	headerHeading: string;
	payloadHeading: string;
	signatureHeading: string;
	algorithmLabel: string;
	claimsHeading: string;
	issuedAtLabel: string;
	expiresAtLabel: string;
	notBeforeLabel: string;
	expiredBadge: string;
	validBadge: string;
	noStandardClaims: string;
	verifyHeading: string;
	verifyAlgorithmUnsupported: string;
	secretLabel: string;
	secretPlaceholder: string;
	publicKeyLabel: string;
	publicKeyPlaceholder: string;
	verifyButton: string;
	signatureValid: string;
	signatureInvalid: string;
	verifyEnterSecret: string;
	verifyEnterPublicKey: string;
	verifyInvalidPublicKey: string;
	localVerifyNotice: string;
	editHeading: string;
	editHeaderLabel: string;
	editPayloadLabel: string;
	resignButton: string;
	resignedTokenLabel: string;
	resignInvalidJson: string;
	resignUnsupportedAlgorithm: string;
	resignMissingSecret: string;
	copy: string;
	copied: string;
}

type DecodeErrorKind = 'format' | 'base64' | 'json';

interface DecodedToken {
	header: unknown;
	payload: unknown;
	headerB64: string;
	payloadB64: string;
	signatureB64: string;
}

type VerifyResult = 'valid' | 'invalid' | 'error' | null;
type AlgKind = 'hmac' | 'rsa' | 'other';

const HMAC_ALGS = new Set(['HS256', 'HS384', 'HS512']);
const RSA_ALGS = new Set(['RS256', 'RS384', 'RS512']);
const HASH_BY_ALG: Record<string, string> = {
	HS256: 'SHA-256',
	HS384: 'SHA-384',
	HS512: 'SHA-512',
	RS256: 'SHA-256',
	RS384: 'SHA-384',
	RS512: 'SHA-512',
};

const SAMPLE_TOKEN =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const SAMPLE_SECRET = 'your-256-bit-secret';

function algKind(alg: unknown): AlgKind {
	if (typeof alg !== 'string') return 'other';
	if (HMAC_ALGS.has(alg)) return 'hmac';
	if (RSA_ALGS.has(alg)) return 'rsa';
	return 'other';
}

function base64UrlToBytes(base64url: string): Uint8Array {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToString(base64url: string): string {
	return new TextDecoder().decode(base64UrlToBytes(base64url));
}

function stringToBase64Url(value: string): string {
	return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeToken(token: string): DecodedToken {
	const parts = token.trim().split('.');
	if (parts.length !== 3 || parts.some((p) => p === '')) {
		throw { kind: 'format' as DecodeErrorKind };
	}
	const [headerB64, payloadB64, signatureB64] = parts;
	let headerJson: string;
	let payloadJson: string;
	try {
		headerJson = base64UrlDecodeToString(headerB64);
		payloadJson = base64UrlDecodeToString(payloadB64);
	} catch {
		throw { kind: 'base64' as DecodeErrorKind };
	}
	let header: unknown;
	let payload: unknown;
	try {
		header = JSON.parse(headerJson);
		payload = JSON.parse(payloadJson);
	} catch {
		throw { kind: 'json' as DecodeErrorKind };
	}
	return { header, payload, headerB64, payloadB64, signatureB64 };
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
	const base64 = pem
		.replace(/-----BEGIN [^-]+-----/, '')
		.replace(/-----END [^-]+-----/, '')
		.replace(/\s+/g, '');
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

async function verifyHmac(signingInput: string, signatureB64: string, secret: string, alg: string): Promise<boolean> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: HASH_BY_ALG[alg] },
		false,
		['verify'],
	);
	return crypto.subtle.verify('HMAC', key, base64UrlToBytes(signatureB64), new TextEncoder().encode(signingInput));
}

async function verifyRsa(signingInput: string, signatureB64: string, publicKeyPem: string, alg: string): Promise<boolean> {
	const keyData = pemToArrayBuffer(publicKeyPem);
	const key = await crypto.subtle.importKey(
		'spki',
		keyData,
		{ name: 'RSASSA-PKCS1-v1_5', hash: HASH_BY_ALG[alg] },
		false,
		['verify'],
	);
	return crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		base64UrlToBytes(signatureB64),
		new TextEncoder().encode(signingInput),
	);
}

async function signHmac(headerB64: string, payloadB64: string, secret: string, alg: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: HASH_BY_ALG[alg] },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
	return `${headerB64}.${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function formatTimestamp(value: unknown): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return new Date(value * 1000).toLocaleString();
}

function getClaim(payload: unknown, key: string): unknown {
	if (payload === null || typeof payload !== 'object') return undefined;
	return (payload as Record<string, unknown>)[key];
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onClick={() => {
				void navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? copiedLabel : label}
		</Button>
	);
}

export default function JwtDecoder({ messages }: { messages: Messages }) {
	const [tokenInput, setTokenInput] = useState('');
	const [secret, setSecret] = useState('');
	const [publicKeyPem, setPublicKeyPem] = useState('');
	const [verifyResult, setVerifyResult] = useState<VerifyResult>(null);
	const [verifying, setVerifying] = useState(false);
	const [headerEdit, setHeaderEdit] = useState('');
	const [payloadEdit, setPayloadEdit] = useState('');
	const [resignedToken, setResignedToken] = useState<string | null>(null);
	const [resignError, setResignError] = useState<string | null>(null);

	const decodeErrorMessages: Record<DecodeErrorKind, string> = {
		format: messages.decodeErrorFormat,
		base64: messages.decodeErrorBase64,
		json: messages.decodeErrorJson,
	};

	const { decoded, decodeError } = useMemo(() => {
		if (tokenInput.trim() === '') return { decoded: null, decodeError: null as string | null };
		try {
			return { decoded: decodeToken(tokenInput), decodeError: null as string | null };
		} catch (err) {
			const kind = (err as { kind: DecodeErrorKind }).kind ?? 'format';
			return { decoded: null, decodeError: decodeErrorMessages[kind] };
		}
	}, [tokenInput]);

	const alg = typeof getClaim(decoded?.header, 'alg') === 'string' ? (getClaim(decoded?.header, 'alg') as string) : null;
	const kind = algKind(alg);

	const headerPretty = decoded ? JSON.stringify(decoded.header, null, 2) : '';
	const payloadPretty = decoded ? JSON.stringify(decoded.payload, null, 2) : '';

	const exp = decoded ? getClaim(decoded.payload, 'exp') : undefined;
	const iat = decoded ? getClaim(decoded.payload, 'iat') : undefined;
	const nbf = decoded ? getClaim(decoded.payload, 'nbf') : undefined;
	const expText = formatTimestamp(exp);
	const iatText = formatTimestamp(iat);
	const nbfText = formatTimestamp(nbf);
	const isExpired = typeof exp === 'number' && exp * 1000 < Date.now();
	const hasStandardClaims = expText !== null || iatText !== null || nbfText !== null;

	const resetForNewToken = (value: string) => {
		setTokenInput(value);
		setVerifyResult(null);
		setResignedToken(null);
		setResignError(null);
		try {
			const next = decodeToken(value);
			setHeaderEdit(JSON.stringify(next.header, null, 2));
			setPayloadEdit(JSON.stringify(next.payload, null, 2));
		} catch {
			setHeaderEdit('');
			setPayloadEdit('');
		}
	};

	const handleLoadSample = () => {
		resetForNewToken(SAMPLE_TOKEN);
		setSecret(SAMPLE_SECRET);
	};

	const handleClear = () => {
		resetForNewToken('');
		setSecret('');
		setPublicKeyPem('');
	};

	const handleVerify = () => {
		if (!decoded || !alg) return;
		const signingInput = `${decoded.headerB64}.${decoded.payloadB64}`;
		setVerifying(true);
		setVerifyResult(null);
		const run =
			kind === 'hmac'
				? verifyHmac(signingInput, decoded.signatureB64, secret, alg)
				: kind === 'rsa'
					? verifyRsa(signingInput, decoded.signatureB64, publicKeyPem, alg)
					: Promise.resolve(null);
		run
			.then((result) => setVerifyResult(result === null ? null : result ? 'valid' : 'invalid'))
			.catch(() => setVerifyResult('error'))
			.finally(() => setVerifying(false));
	};

	const handleResign = () => {
		setResignError(null);
		setResignedToken(null);
		let headerObj: unknown;
		let payloadObj: unknown;
		try {
			headerObj = JSON.parse(headerEdit);
			payloadObj = JSON.parse(payloadEdit);
		} catch {
			setResignError(messages.resignInvalidJson);
			return;
		}
		const editedAlg = getClaim(headerObj, 'alg');
		if (typeof editedAlg !== 'string' || !HMAC_ALGS.has(editedAlg)) {
			setResignError(messages.resignUnsupportedAlgorithm);
			return;
		}
		if (secret.trim() === '') {
			setResignError(messages.resignMissingSecret);
			return;
		}
		const headerB64 = stringToBase64Url(JSON.stringify(headerObj));
		const payloadB64 = stringToBase64Url(JSON.stringify(payloadObj));
		void signHmac(headerB64, payloadB64, secret, editedAlg)
			.then((token) => setResignedToken(token))
			.catch(() => setResignError(messages.resignInvalidJson));
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<label htmlFor="jwt-token-input" className="text-sm font-medium text-foreground">
					{messages.tokenLabel}
				</label>
				<textarea
					id="jwt-token-input"
					value={tokenInput}
					onChange={(e) => resetForNewToken(e.target.value)}
					placeholder={messages.tokenPlaceholder}
					rows={4}
					spellCheck={false}
					className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs break-all text-foreground"
				/>
				<div className="flex gap-2">
					<Button type="button" size="sm" variant="outline" onClick={handleLoadSample}>
						{messages.loadSample}
					</Button>
					<Button type="button" size="sm" variant="outline" onClick={handleClear}>
						{messages.clear}
					</Button>
				</div>
			</div>

			{decodeError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{decodeError}
				</div>
			)}

			{decoded && (
				<>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.headerHeading}</span>
								<CopyButton value={headerPretty} label={messages.copy} copiedLabel={messages.copied} />
							</div>
							<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
								{headerPretty}
							</pre>
						</div>
						<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.payloadHeading}</span>
								<CopyButton value={payloadPretty} label={messages.copy} copiedLabel={messages.copied} />
							</div>
							<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
								{payloadPretty}
							</pre>
						</div>
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.claimsHeading}</span>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-foreground">
								{messages.algorithmLabel}: {alg ?? '?'}
							</span>
							{isExpired && (
								<span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
									{messages.expiredBadge}
								</span>
							)}
							{expText && !isExpired && (
								<span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
									{messages.validBadge}
								</span>
							)}
						</div>
						{hasStandardClaims ? (
							<dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
								{iatText && (
									<div>
										<dt className="text-muted-foreground">{messages.issuedAtLabel}</dt>
										<dd className="text-foreground">{iatText}</dd>
									</div>
								)}
								{expText && (
									<div>
										<dt className="text-muted-foreground">{messages.expiresAtLabel}</dt>
										<dd className="text-foreground">{expText}</dd>
									</div>
								)}
								{nbfText && (
									<div>
										<dt className="text-muted-foreground">{messages.notBeforeLabel}</dt>
										<dd className="text-foreground">{nbfText}</dd>
									</div>
								)}
							</dl>
						) : (
							<p className="text-sm text-muted-foreground">{messages.noStandardClaims}</p>
						)}
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.verifyHeading}</span>
						<p className="text-xs text-muted-foreground">{messages.localVerifyNotice}</p>
						{kind === 'other' ? (
							<p className="text-sm text-muted-foreground">{messages.verifyAlgorithmUnsupported}</p>
						) : (
							<>
								{kind === 'hmac' ? (
									<div className="flex flex-col gap-1">
										<label htmlFor="jwt-secret" className="text-xs text-muted-foreground">
											{messages.secretLabel}
										</label>
										<input
											id="jwt-secret"
											type="text"
											value={secret}
											onChange={(e) => {
												setSecret(e.target.value);
												setVerifyResult(null);
											}}
											placeholder={messages.secretPlaceholder}
											spellCheck={false}
											className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
										/>
									</div>
								) : (
									<div className="flex flex-col gap-1">
										<label htmlFor="jwt-public-key" className="text-xs text-muted-foreground">
											{messages.publicKeyLabel}
										</label>
										<textarea
											id="jwt-public-key"
											value={publicKeyPem}
											onChange={(e) => {
												setPublicKeyPem(e.target.value);
												setVerifyResult(null);
											}}
											placeholder={messages.publicKeyPlaceholder}
											rows={4}
											spellCheck={false}
											className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
										/>
									</div>
								)}
								<div>
									<Button
										type="button"
										size="sm"
										onClick={handleVerify}
										disabled={
											verifying || (kind === 'hmac' ? secret.trim() === '' : publicKeyPem.trim() === '')
										}
									>
										{messages.verifyButton}
									</Button>
								</div>
								{verifyResult === 'valid' && (
									<p className="text-sm font-medium text-primary">{messages.signatureValid}</p>
								)}
								{verifyResult === 'invalid' && (
									<p className="text-sm font-medium text-destructive">{messages.signatureInvalid}</p>
								)}
								{verifyResult === 'error' && (
									<p className="text-sm font-medium text-destructive">
										{kind === 'rsa' ? messages.verifyInvalidPublicKey : messages.signatureInvalid}
									</p>
								)}
							</>
						)}
					</div>

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.editHeading}</span>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="flex flex-col gap-1">
								<label htmlFor="jwt-edit-header" className="text-xs text-muted-foreground">
									{messages.editHeaderLabel}
								</label>
								<textarea
									id="jwt-edit-header"
									value={headerEdit}
									onChange={(e) => setHeaderEdit(e.target.value)}
									rows={6}
									spellCheck={false}
									className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="jwt-edit-payload" className="text-xs text-muted-foreground">
									{messages.editPayloadLabel}
								</label>
								<textarea
									id="jwt-edit-payload"
									value={payloadEdit}
									onChange={(e) => setPayloadEdit(e.target.value)}
									rows={6}
									spellCheck={false}
									className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
								/>
							</div>
						</div>
						<div>
							<Button type="button" size="sm" variant="outline" onClick={handleResign}>
								{messages.resignButton}
							</Button>
						</div>
						{resignError && <p className="text-sm text-destructive">{resignError}</p>}
						{resignedToken && (
							<div className="flex flex-col gap-1">
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">{messages.resignedTokenLabel}</span>
									<CopyButton value={resignedToken} label={messages.copy} copiedLabel={messages.copied} />
								</div>
								<textarea
									readOnly
									value={resignedToken}
									rows={4}
									className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs break-all text-foreground"
								/>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
