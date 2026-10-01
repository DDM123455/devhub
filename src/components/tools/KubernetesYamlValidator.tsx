import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	autoFixDeprecatedApiVersions,
	clearSchemaCache,
	validateK8sManifests,
	buildK8sJsonReport,
	K8S_VERSION_OPTIONS,
	DEFAULT_K8S_VERSION,
	type K8sDocumentResult,
	type K8sIssue,
	type SecurityFinding,
} from '@/lib/k8s-yaml-validator';
import { useCopyToClipboard } from './useCopyToClipboard';

const VALIDATE_DEBOUNCE_MS = 400;

function formatIssue(issue: K8sIssue, issueMessages: Record<string, string>): string {
	const template = issueMessages[issue.key];
	if (!template) return issue.message;
	return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => String(issue.params[name] ?? whole));
}
import { jumpTextareaToLine } from '@/lib/text-line-utils';

interface Messages {
	inputLabel: string;
	inputPlaceholder: string;
	dropHint: string;
	chooseFile: string;
	loadSample: string;
	clear: string;
	privacyNote: string;
	versionLabel: string;
	versionMaster: string;
	validating: string;
	documentHeading: string;
	kindBadge: string;
	noIssues: string;
	summaryLabel: string;
	severityError: string;
	severityWarning: string;
	jumpToLine: string;
	fixApiVersion: string;
	fixApiVersionCopied: string;
	multiDocHint: string;
	issueMessages: Record<string, string>;
	emptyState: string;
	retry: string;
	validationFailed: string;
	fileReadError: string;
	copyFailed: string;
	advanced: string;
	optCrd: string;
	optSkipUnknown: string;
	optSecurity: string;
	optCross: string;
	securityHeading: string;
	securityScore: string;
	securityCritical: string;
	securityAdvisory: string;
	securityFixLabel: string;
	securityAllGood: string;
	exportReport: string;
	schemaSourceCrd: string;
	securityChecks: Record<string, string>;
	securityFixes: Record<string, string>;
}

function fill(template: string | undefined, params: Record<string, string | number>, fallback: string): string {
	if (!template) return fallback;
	return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => String(params[name] ?? whole));
}

function scoreClass(score: number): string {
	if (score >= 80) return 'text-emerald-700 dark:text-emerald-400';
	if (score >= 50) return 'text-amber-700 dark:text-amber-400';
	return 'text-destructive';
}

const SAMPLE_MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
`;

export default function KubernetesYamlValidator({ messages }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [k8sVersion, setK8sVersion] = useState(DEFAULT_K8S_VERSION);
	const [isDragOver, setIsDragOver] = useState(false);
	const [isValidating, setIsValidating] = useState(false);
	const [documents, setDocuments] = useState<K8sDocumentResult[]>([]);
	const { copied, failed: copyFailed, copy } = useCopyToClipboard();
	const [retryCount, setRetryCount] = useState(0);
	const [validationFailed, setValidationFailed] = useState(false);
	const [fileError, setFileError] = useState(false);
	const [crdCatalog, setCrdCatalog] = useState(true);
	const [skipUnknownKinds, setSkipUnknownKinds] = useState(false);
	const [security, setSecurity] = useState(true);
	const [crossCheck, setCrossCheck] = useState(true);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const requestIdRef = useRef(0);

	// Schema validation is async (fetches the schema over the network the
	// first time a kind/version combo is seen), unlike the nginx tool's
	// synchronous useMemo — a request counter guards against an in-flight
	// validation from a stale keystroke overwriting a newer one that
	// resolved first (same pattern as RegexTester's Web Worker requestId).
	// Debounced (typing in a large manifest must not re-validate on every keystroke) and
	// guarded on every path: a rejected validation clears the spinner instead of leaving it
	// spinning forever (.catch + .finally).
	useEffect(() => {
		const requestId = ++requestIdRef.current;
		if (input.trim() === '') {
			setDocuments([]);
			setIsValidating(false);
			setValidationFailed(false);
			return;
		}
		setIsValidating(true);
		const timer = setTimeout(() => {
			validateK8sManifests(input, k8sVersion, { crdCatalog, skipUnknownKinds, security, crossCheck })
				.then((result) => {
					if (requestId !== requestIdRef.current) return;
					setDocuments(result.documents);
					setValidationFailed(false);
				})
				.catch(() => {
					if (requestId !== requestIdRef.current) return;
					setDocuments([]);
					setValidationFailed(true);
				})
				.finally(() => {
					if (requestId === requestIdRef.current) setIsValidating(false);
				});
		}, VALIDATE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [input, k8sVersion, retryCount, crdCatalog, skipUnknownKinds, security, crossCheck]);

	const hasAutoFixableApiVersion = documents.some((doc) => doc.suggestedApiVersion !== null);
	const fixedManifest = hasAutoFixableApiVersion ? autoFixDeprecatedApiVersions(input) : input;

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setFileError(false);
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.onerror = () => setFileError(true);
		reader.readAsText(file);
	};

	const jumpToLine = (line: number | null) => {
		if (line === null || !textareaRef.current) return;
		jumpTextareaToLine(textareaRef.current, line);
	};

	const handleExportReport = () => {
		const report = buildK8sJsonReport({ documents }, k8sVersion);
		const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'kubernetes-validation-report.json';
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const options: [string, boolean, (v: boolean) => void, string][] = [
		['k8s-opt-crd', crdCatalog, setCrdCatalog, messages.optCrd],
		['k8s-opt-skip', skipUnknownKinds, setSkipUnknownKinds, messages.optSkipUnknown],
		['k8s-opt-security', security, setSecurity, messages.optSecurity],
		['k8s-opt-cross', crossCheck, setCrossCheck, messages.optCross],
	];

	const renderFinding = (finding: SecurityFinding, key: number) => (
		<li key={key} className="rounded-md border border-border p-2.5 text-xs">
			<button
				type="button"
				onClick={() => jumpToLine(finding.line ?? null)}
				disabled={finding.line == null}
				className="flex min-h-9 w-full flex-col gap-1 rounded-md text-left enabled:hover:bg-accent disabled:cursor-default"
			>
				<div className="flex items-center gap-2">
					<span
						className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
							finding.severity === 'critical' ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
						}`}
					>
						{finding.severity === 'critical' ? messages.securityCritical : messages.securityAdvisory}
					</span>
					{finding.line != null && (
						<span className="font-mono text-muted-foreground">{messages.jumpToLine.replace('{{line}}', String(finding.line))}</span>
					)}
				</div>
				<span className="break-words text-foreground">{fill(messages.securityChecks[finding.id], finding.params, finding.id)}</span>
				<span className="break-words text-muted-foreground">
					{messages.securityFixLabel} {messages.securityFixes[finding.id] ?? ''}
				</span>
			</button>
		</li>
	);

	const handleCopyFixed = () => {
		void copy(fixedManifest);
	};

	return (
		<div className="flex flex-col gap-4">
			<div
				className={`flex flex-col gap-2 rounded-lg border-2 border-dashed p-4 transition-colors ${
					isDragOver ? 'border-primary bg-primary/5' : 'border-border'
				}`}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					handleFile(e.dataTransfer.files);
				}}
			>
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
					<label htmlFor="k8s-yaml-input" className="text-sm font-medium text-foreground">
						{messages.inputLabel}
					</label>
					<div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
						<label htmlFor="k8s-version-select" className="text-xs text-muted-foreground">
							{messages.versionLabel}
						</label>
						<select
							id="k8s-version-select"
							value={k8sVersion}
							onChange={(e) => setK8sVersion(e.target.value)}
							className="min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
						>
							{K8S_VERSION_OPTIONS.map((version) => (
								<option key={version} value={version}>
									{version === 'master' ? messages.versionMaster : version}
								</option>
							))}
						</select>
						<label
							htmlFor="k8s-file-input"
							className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
						>
							{messages.chooseFile}
						</label>
						<input
							id="k8s-file-input"
							type="file"
							accept=".yaml,.yml,.txt,text/yaml,text/plain"
							className="sr-only"
							onChange={(e) => {
								handleFile(e.target.files);
								e.target.value = '';
							}}
						/>
						<Button type="button" size="sm" variant="outline" onClick={() => setInput(SAMPLE_MANIFEST)}>
							{messages.loadSample}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
				<p className="text-xs text-muted-foreground">{messages.multiDocHint}</p>
					<details className="rounded-md border border-border px-3 py-2">
						<summary className="min-h-9 cursor-pointer text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
							{messages.advanced}
						</summary>
						<div className="mt-2 flex flex-col gap-2">
							{options.map(([id, checked, setChecked, label]) => (
								<label key={id} htmlFor={id} className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-foreground">
									<input id={id} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-4" />
									<span className="min-w-0 break-words">{label}</span>
								</label>
							))}
						</div>
					</details>
				<textarea
					id="k8s-yaml-input"
					ref={textareaRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={messages.inputPlaceholder}
					rows={18}
					spellCheck={false}
					className="box-border w-full min-w-0 max-w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" size="sm" variant="ghost" onClick={() => setInput('')}>
						{messages.clear}
					</Button>
					{hasAutoFixableApiVersion && (
						<Button type="button" size="sm" variant="secondary" aria-live="polite" onClick={handleCopyFixed}>
							{copied ? messages.fixApiVersionCopied : copyFailed ? messages.copyFailed : messages.fixApiVersion}
						</Button>
					)}
											{documents.length > 0 && (
							<Button type="button" size="sm" variant="outline" onClick={handleExportReport}>
								{messages.exportReport}
							</Button>
						)}
						{isValidating && <span role="status" className="text-xs text-muted-foreground">{messages.validating}</span>}
					{fileError && <span role="alert" className="text-xs text-destructive">{messages.fileReadError}</span>}
					{validationFailed && <span role="alert" className="text-xs text-destructive">{messages.validationFailed}</span>}
				</div>
				<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
					{messages.privacyNote}
				</p>
			</div>

			{input.trim() === '' && (
				<p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{messages.emptyState}</p>
			)}

			{documents.map((doc, docIndex) => {
				const errorCount = doc.issues.filter((i) => i.severity === 'error').length;
				const warningCount = doc.issues.filter((i) => i.severity === 'warning').length;
				return (
					<div key={docIndex} className="flex flex-col gap-2 rounded-lg border border-border p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="text-sm font-medium text-foreground">
								{messages.documentHeading.replace('{{index}}', String(docIndex + 1))}
							</span>
															{doc.schemaSource === 'crd' && (
									<span className="text-xs text-muted-foreground">{messages.schemaSourceCrd}</span>
								)}
								{doc.kind && (
								<span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs text-foreground">
									{messages.kindBadge.replace('{{kind}}', doc.kind).replace('{{apiVersion}}', doc.apiVersion ?? '?')}
								</span>
							)}
							<span role="status" className="text-xs text-muted-foreground">
								{messages.summaryLabel.replace('{{errors}}', String(errorCount)).replace('{{warnings}}', String(warningCount))}
							</span>
						</div>
						{doc.issues.length === 0 ? (
							<p className="text-sm text-emerald-700 dark:text-emerald-400">{messages.noIssues}</p>
						) : (
							<ul className="flex flex-col gap-2">
								{doc.issues.map((issue, i) => (
									<li key={i} className="rounded-md border border-border p-2.5 text-xs">
										<button
											type="button"
											onClick={() => jumpToLine(issue.line)}
											disabled={issue.line === null}
											className="flex w-full flex-col gap-1 rounded-md text-left enabled:hover:bg-accent disabled:cursor-default"
										>
											<div className="flex items-center gap-2">
												<span
													className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
														issue.severity === 'error'
															? 'bg-destructive/15 text-destructive'
															: 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
													}`}
												>
													{issue.severity === 'error' ? messages.severityError : messages.severityWarning}
												</span>
												{issue.line !== null && (
													<span className="font-mono text-muted-foreground">
														{messages.jumpToLine.replace('{{line}}', String(issue.line))}
													</span>
												)}
											</div>
											<span className="break-words text-foreground">{formatIssue(issue, messages.issueMessages)}</span>
										</button>
										{issue.ruleId === 'schema-unavailable' && (
											<Button
												type="button"
												size="xs"
												variant="outline"
												className="mt-1.5"
												onClick={() => {
													clearSchemaCache();
													setRetryCount((n) => n + 1);
												}}
											>
												{messages.retry}
											</Button>
										)}
									</li>
								))}
							</ul>
							)}
							{doc.security && (
								<div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="text-sm font-medium text-foreground">{messages.securityHeading}</span>
										<span role="status" className={`text-xs font-semibold ${scoreClass(doc.security.score)}`}>
											{messages.securityScore
												.replace('{{score}}', String(doc.security.score))
												.replace('{{passed}}', String(doc.security.passed))
												.replace('{{checked}}', String(doc.security.checked))}
										</span>
									</div>
									{doc.security.findings.length === 0 ? (
										<p className="text-sm text-emerald-700 dark:text-emerald-400">{messages.securityAllGood}</p>
									) : (
										<ul className="flex flex-col gap-2">
											{[...doc.security.findings]
												.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
												.map((finding, i) => renderFinding(finding, i))}
										</ul>
									)}
								</div>
							)}
						</div>
					);
				})}
		</div>
	);
}
