import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { decodeToken, formatTimestamp, stringToBase64Url, timeStatus, type DecodeErrorKind } from '@/lib/jwt';
import {
	algFamily,
	checkClaims,
	CLAIM_KEYS,
	formatClaimValue,
	isJwtAlg,
	JwtKeyError,
	signJwtInput,
	verifyJwtSignature,
	type JwtAlg,
} from '@/lib/jwt-crypto';
import JwtEncoder, { type JwtEncoderMessages } from './JwtEncoder';
import { formatJsonLossless } from '@/lib/text-format';
import { useCopyToClipboard } from './useCopyToClipboard';

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
	audienceLabel: string;
	issuerLabel: string;
	subjectLabel: string;
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
	copyShareLink: string;
	algNoneWarning: string;
	notYetValidBadge: string;
	bigNumberWarning: string;
	verifyAlgNone: string;
	showSecret: string;
	hideSecret: string;
	copyFailed: string;
	copyHeaderAria: string;
	copyPayloadAria: string;
	copyNewTokenAria: string;
	secretIsBase64Url: string;
	privateKeyLabel: string;
	privateKeyPlaceholder: string;
	keyErr: Record<string, string>;
	claimsDetailHeading: string;
	claimDesc: Record<string, string>;
	checkHeading: string;
	expectedIssLabel: string;
	expectedAudLabel: string;
	clockSkewLabel: string;
	checkExpired: string;
	checkNotYetValid: string;
	checkIssMismatch: string;
	checkAudMismatch: string;
	checkOk: string;
	enc: JwtEncoderMessages;
}

function CopyButton({
	value,
	label,
	copiedLabel,
	failedLabel,
	ariaLabel,
}: {
	value: string;
	label: string;
	copiedLabel: string;
	failedLabel: string;
	ariaLabel?: string;
}) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button aria-live="polite" aria-label={ariaLabel} type="button" size="sm" variant="ghost" onClick={() => void copy(value)}>
			{copied ? copiedLabel : failed ? failedLabel : label}
		</Button>
	);
}

type VerifyResult = 'valid' | 'invalid' | 'error' | null;
type AlgKind = 'hmac' | 'asym' | 'other';

const SAMPLE_TOKEN =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const SAMPLE_SECRET = 'your-256-bit-secret';

function algKind(alg: unknown): AlgKind {
	if (!isJwtAlg(alg)) return 'other';
	return algFamily(alg) === 'hmac' ? 'hmac' : 'asym';
}

// `aud` is the only standard claim the JWT spec allows as either a single
// string or an array of strings (multiple intended audiences) — everything
// else here is always a plain string.
function formatStringOrArrayClaim(value: unknown): string | null {
	if (typeof value === 'string' && value !== '') return value;
	if (Array.isArray(value) && value.every((v) => typeof v === 'string') && value.length > 0) {
		return value.join(', ');
	}
	return null;
}

function getClaim(payload: unknown, key: string): unknown {
	if (payload === null || typeof payload !== 'object') return undefined;
	return (payload as Record<string, unknown>)[key];
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
	const [showSecret, setShowSecret] = useState(false);
	const [secretIsBase64Url, setSecretIsBase64Url] = useState(false);
	const [privateKeyPem, setPrivateKeyPem] = useState('');
	const [expectedIss, setExpectedIss] = useState('');
	const [expectedAud, setExpectedAud] = useState('');
	const [clockSkew, setClockSkew] = useState(0);
	// Every verify run gets an id; a result is only applied if it is still the latest one,
	// so editing the token/secret/key while a verification is in flight can never show a
	// stale "valid" next to the new input.
	const verifyRunRef = useRef(0);

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
							const kind = (err as { kind?: DecodeErrorKind }).kind ?? 'format';
			return { decoded: null, decodeError: decodeErrorMessages[kind] };
		}
	}, [tokenInput]);

	const alg = typeof getClaim(decoded?.header, 'alg') === 'string' ? (getClaim(decoded?.header, 'alg') as string) : null;
	const kind = algKind(alg);
	// `alg: none` is a valid JWT header per spec, but it means the token carries
	// no signature at all — anyone can forge one. Flagged separately from the
	// "unsupported algorithm" case since this isn't a tooling gap, it's a
	// security property of the token itself worth calling out explicitly.
	const isAlgNone = alg?.toLowerCase() === 'none';

	const headerPretty = decoded?.headerPretty ?? '';
	const payloadPretty = decoded?.payloadPretty ?? '';

	const exp = decoded ? getClaim(decoded.payload, 'exp') : undefined;
	const iat = decoded ? getClaim(decoded.payload, 'iat') : undefined;
	const nbf = decoded ? getClaim(decoded.payload, 'nbf') : undefined;
	const expText = formatTimestamp(exp);
	const iatText = formatTimestamp(iat);
	const nbfText = formatTimestamp(nbf);
	const status = decoded ? timeStatus(decoded.payload, Date.now()) : 'unknown';
	const isExpired = status === 'expired';
	const isNotYetValid = status === 'notYetValid';

	const audText = decoded ? formatStringOrArrayClaim(getClaim(decoded.payload, 'aud')) : null;
	const issText = decoded ? formatStringOrArrayClaim(getClaim(decoded.payload, 'iss')) : null;
	const subText = decoded ? formatStringOrArrayClaim(getClaim(decoded.payload, 'sub')) : null;

	const hasStandardClaims =
		expText !== null || iatText !== null || nbfText !== null || audText !== null || issText !== null || subText !== null;

	const resetForNewToken = (value: string) => {
		setTokenInput(value);
		verifyRunRef.current += 1;
		setVerifying(false);
		setVerifyResult(null);
		setResignedToken(null);
		setResignError(null);
		try {
			const next = decodeToken(value);
							setHeaderEdit(next.headerPretty);
			setPayloadEdit(next.payloadPretty);
		} catch {
			setHeaderEdit('');
			setPayloadEdit('');
		}
	};

	// Mirrors jwt.io's `?token=` deep-link convention: lets a "Copy share link"
	// button hand off a token under inspection (e.g. to a teammate) without
	// retyping it. Read once on mount only — this is a one-way import, not a
	// synced URL state, so typing a new token doesn't rewrite the address bar.
	// The token travels in the URL HASH (never sent to a server or written to access logs,
	// unlike a query string). The legacy ?token= form is still read, then removed from the
	// address bar so the token doesn't linger in history/screenshots.
	useEffect(() => {
		const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
		const url = new URL(window.location.href);
		const fromQuery = url.searchParams.get('token');
		const fromUrl = fromHash ?? fromQuery;
		if (fromQuery) {
			url.searchParams.delete('token');
			window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
		}
		if (fromUrl) resetForNewToken(fromUrl);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// `window` doesn't exist during Astro's build-time SSR pass (this component
	// still renders once in Node then), so this stays empty on that first
	// pre-render and fills in for real once hydrated in the browser.
	const shareLink =
		decoded && typeof window !== 'undefined'
			? `${window.location.origin}${window.location.pathname}#token=${encodeURIComponent(decoded.headerB64 + '.' + decoded.payloadB64 + '.' + decoded.signatureB64)}`
			: '';

	const handleLoadSample = () => {
		resetForNewToken(SAMPLE_TOKEN);
		setSecret(SAMPLE_SECRET);
	};

	const handleClear = () => {
		resetForNewToken('');
		setShowSecret(false);
		setSecret('');
		setPublicKeyPem('');
		setPrivateKeyPem('');
	};

	const keyErrorText = (err: unknown): string | null =>
		err instanceof JwtKeyError ? (messages.keyErr[err.code] ?? null) : null;
	const [verifyErrorText, setVerifyErrorText] = useState<string | null>(null);

	const handleVerify = () => {
		if (!decoded || !alg || !isJwtAlg(alg)) return;
		const signingInput = `${decoded.headerB64}.${decoded.payloadB64}`;
		const runId = ++verifyRunRef.current;
		setVerifying(true);
		setVerifyResult(null);
		setVerifyErrorText(null);
		const headerKid = getClaim(decoded.header, 'kid');
		verifyJwtSignature(alg as JwtAlg, signingInput, decoded.signatureB64, kind === 'hmac' ? secret : publicKeyPem, {
			secretIsBase64Url,
			kid: typeof headerKid === 'string' ? headerKid : undefined,
		})
			.then((result) => {
				if (runId === verifyRunRef.current) setVerifyResult(result ? 'valid' : 'invalid');
			})
			.catch((err) => {
				if (runId !== verifyRunRef.current) return;
				setVerifyErrorText(keyErrorText(err));
				setVerifyResult('error');
			})
			.finally(() => {
				if (runId === verifyRunRef.current) setVerifying(false);
			});
	};

	const handleResign = () => {
		setResignError(null);
		setResignedToken(null);
		let headerObj: unknown;
		const headerCompact = formatJsonLossless(headerEdit, true);
		const payloadCompact = formatJsonLossless(payloadEdit, true);
		try {
			headerObj = JSON.parse(headerEdit);
			JSON.parse(payloadEdit);
		} catch {
			setResignError(messages.resignInvalidJson);
			return;
		}
		if (!headerCompact || !payloadCompact) {
			setResignError(messages.resignInvalidJson);
			return;
		}
		const editedAlg = getClaim(headerObj, 'alg');
		if (!isJwtAlg(editedAlg)) {
			setResignError(messages.resignUnsupportedAlgorithm);
			return;
		}
		const editedKey = algFamily(editedAlg) === 'hmac' ? secret : privateKeyPem;
		if (editedKey.trim() === '') {
			setResignError(messages.resignMissingSecret);
			return;
		}
		// Compact, order- and precision-preserving serialisation of what the user edited.
		const headerB64 = stringToBase64Url(headerCompact.value);
		const payloadB64 = stringToBase64Url(payloadCompact.value);
		const headerKid = getClaim(headerObj, 'kid');
		void signJwtInput(editedAlg, `${headerB64}.${payloadB64}`, editedKey, {
			secretIsBase64Url,
			kid: typeof headerKid === 'string' ? headerKid : undefined,
		})
			.then((signature) => setResignedToken(`${headerB64}.${payloadB64}.${signature}`))
			.catch((err) => setResignError(keyErrorText(err) ?? messages.resignInvalidJson));
	};

	const claimIssues = decoded
		? checkClaims(decoded.payload, { nowMs: Date.now(), expectedIss, expectedAud, clockSkewSec: clockSkew })
		: [];
	const payloadEntries =
		decoded && decoded.payload !== null && typeof decoded.payload === 'object' && !Array.isArray(decoded.payload)
			? Object.entries(decoded.payload as Record<string, unknown>)
			: [];

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
					{decoded && (
						<CopyButton value={shareLink} label={messages.copyShareLink} copiedLabel={messages.copied} failedLabel={messages.copyFailed} />
					)}
				</div>
			</div>

			{decodeError && (
				<div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{decodeError}
				</div>
			)}

			{decoded && (
				<>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.headerHeading}</span>
								<CopyButton value={headerPretty} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} ariaLabel={messages.copyHeaderAria} />
							</div>
							<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
								{headerPretty}
							</pre>
						</div>
						<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">{messages.payloadHeading}</span>
								<CopyButton value={payloadPretty} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} ariaLabel={messages.copyPayloadAria} />
							</div>
							<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
								{payloadPretty}
							</pre>
						</div>
					</div>

											{decoded.hasUnsafeNumbers && (
							<p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
								{messages.bigNumberWarning}
							</p>
						)}
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.claimsHeading}</span>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-foreground">
								{messages.algorithmLabel}: {alg ?? '?'}
							</span>
							{isAlgNone && (
								<span role="alert" className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
									{messages.algNoneWarning}
								</span>
							)}
							{isExpired && (
								<span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
									{messages.expiredBadge}
								</span>
							)}
							{isNotYetValid && (
								<span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
									{messages.notYetValidBadge}
								</span>
							)}
							{expText && !isExpired && !isNotYetValid && (
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
								{subText && (
									<div>
										<dt className="text-muted-foreground">{messages.subjectLabel}</dt>
										<dd className="break-all text-foreground">{subText}</dd>
									</div>
								)}
								{issText && (
									<div>
										<dt className="text-muted-foreground">{messages.issuerLabel}</dt>
										<dd className="break-all text-foreground">{issText}</dd>
									</div>
								)}
								{audText && (
									<div>
										<dt className="text-muted-foreground">{messages.audienceLabel}</dt>
										<dd className="break-all text-foreground">{audText}</dd>
									</div>
								)}
							</dl>
						) : (
							<p className="text-sm text-muted-foreground">{messages.noStandardClaims}</p>
						)}
					</div>

					{payloadEntries.length > 0 && (
						<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
							<span className="text-sm font-medium text-foreground">{messages.claimsDetailHeading}</span>
							<dl className="flex flex-col gap-2 text-xs">
								{payloadEntries.map(([name, value]) => (
									<div key={name} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
										<dt className="font-mono font-semibold text-foreground sm:w-28 sm:shrink-0">{name}</dt>
										<dd className="text-muted-foreground [overflow-wrap:anywhere]">
											<code className="text-foreground">{formatClaimValue(value)}</code>
											{(CLAIM_KEYS as readonly string[]).includes(name) && messages.claimDesc[name] && (
												<span> - {messages.claimDesc[name]}</span>
											)}
										</dd>
									</div>
								))}
							</dl>
							<div className="flex flex-col gap-2 border-t border-border pt-3">
								<span className="text-xs font-medium text-foreground">{messages.checkHeading}</span>
								<div className="grid gap-2 sm:grid-cols-3">
									<label className="flex flex-col gap-1 text-xs text-muted-foreground">
										{messages.expectedIssLabel}
										<input type="text" value={expectedIss} onChange={(e) => setExpectedIss(e.target.value)} spellCheck={false} className="min-h-9 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground" />
									</label>
									<label className="flex flex-col gap-1 text-xs text-muted-foreground">
										{messages.expectedAudLabel}
										<input type="text" value={expectedAud} onChange={(e) => setExpectedAud(e.target.value)} spellCheck={false} className="min-h-9 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground" />
									</label>
									<label className="flex flex-col gap-1 text-xs text-muted-foreground">
										{messages.clockSkewLabel}
										<input
											type="number"
											min={0}
											value={clockSkew}
											onChange={(e) => setClockSkew(Math.max(0, Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0))}
											className="min-h-9 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
										/>
									</label>
								</div>
								<ul role="status" className="flex flex-col gap-1 text-xs">
									{claimIssues.length === 0 ? (
										<li className="text-primary">{messages.checkOk}</li>
									) : (
										claimIssues.map((issue) => (
											<li key={issue} className="text-destructive">
												{issue === 'expired'
													? messages.checkExpired
													: issue === 'notYetValid'
														? messages.checkNotYetValid
														: issue === 'issMismatch'
															? messages.checkIssMismatch
															: messages.checkAudMismatch}
											</li>
										))
									)}
								</ul>
							</div>
						</div>
					)}

					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<span className="text-sm font-medium text-foreground">{messages.verifyHeading}</span>
						<p className="text-xs text-muted-foreground">{messages.localVerifyNotice}</p>
													{kind === 'other' ? (
							<p className="text-sm text-muted-foreground">{isAlgNone ? messages.verifyAlgNone : messages.verifyAlgorithmUnsupported}</p>
						) : (
							<>
								{kind === 'hmac' ? (
									<div className="flex flex-col gap-1">
										<label htmlFor="jwt-secret" className="text-xs text-muted-foreground">
											{messages.secretLabel}
										</label>
										<div className="flex gap-2">
											<input
												id="jwt-secret"
												type={showSecret ? 'text' : 'password'}
												autoComplete="off"
												value={secret}
												onChange={(e) => {
													verifyRunRef.current += 1;
													setVerifying(false);
													setSecret(e.target.value);
													setVerifyResult(null);
												}}
												placeholder={messages.secretPlaceholder}
												spellCheck={false}
												className="min-w-0 flex-1 rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
											/>
											<Button type="button" size="sm" variant="outline" className="min-h-9" aria-pressed={showSecret} onClick={() => setShowSecret((v) => !v)}>
												{showSecret ? messages.hideSecret : messages.showSecret}
											</Button>
										</div>
										<label className="flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
											<input
												type="checkbox"
												checked={secretIsBase64Url}
												onChange={(e) => {
													verifyRunRef.current += 1;
													setVerifying(false);
													setVerifyResult(null);
													setSecretIsBase64Url(e.target.checked);
												}}
											/>
											{messages.secretIsBase64Url}
										</label>
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
												verifyRunRef.current += 1;
												setVerifying(false);
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
								{!verifying && (kind === 'hmac' ? secret.trim() === '' : publicKeyPem.trim() === '') && (
									<p className="text-xs text-muted-foreground">
										{kind === 'hmac' ? messages.verifyEnterSecret : messages.verifyEnterPublicKey}
									</p>
								)}
								{verifyResult === 'valid' && (
									<p role="status" className="text-sm font-medium text-primary">{messages.signatureValid}</p>
								)}
								{verifyResult === 'invalid' && (
									<p role="alert" className="text-sm font-medium text-destructive">{messages.signatureInvalid}</p>
								)}
								{verifyResult === 'error' && (
									<p role="alert" className="text-sm font-medium text-destructive">
										{verifyErrorText ?? (kind === 'asym' ? messages.verifyInvalidPublicKey : messages.signatureInvalid)}
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
						{kind === 'asym' && (
							<div className="flex flex-col gap-1">
								<label htmlFor="jwt-resign-private" className="text-xs text-muted-foreground">
									{messages.privateKeyLabel}
								</label>
								<textarea
									id="jwt-resign-private"
									value={privateKeyPem}
									onChange={(e) => setPrivateKeyPem(e.target.value)}
									placeholder={messages.privateKeyPlaceholder}
									rows={4}
									spellCheck={false}
									autoComplete="off"
									className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
								/>
							</div>
						)}
						<div>
							<Button type="button" size="sm" variant="outline" onClick={handleResign}>
								{messages.resignButton}
							</Button>
						</div>
						{resignError && <p role="alert" className="text-sm text-destructive">{resignError}</p>}
						{resignedToken && (
							<div className="flex flex-col gap-1">
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">{messages.resignedTokenLabel}</span>
									<CopyButton value={resignedToken} label={messages.copy} copiedLabel={messages.copied} failedLabel={messages.copyFailed} ariaLabel={messages.copyNewTokenAria} />
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

			<JwtEncoder messages={messages.enc} keyErrors={messages.keyErr} onUseToken={(token) => resetForNewToken(token)} />
		</div>
	);
}
