import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	autoFixDeprecatedApiVersions,
	validateK8sManifests,
	K8S_VERSION_OPTIONS,
	DEFAULT_K8S_VERSION,
	type K8sDocumentResult,
} from '@/lib/k8s-yaml-validator';
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
	const [copied, setCopied] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const requestIdRef = useRef(0);

	// Schema validation is async (fetches the schema over the network the
	// first time a kind/version combo is seen), unlike the nginx tool's
	// synchronous useMemo — a request counter guards against an in-flight
	// validation from a stale keystroke overwriting a newer one that
	// resolved first (same pattern as RegexTester's Web Worker requestId).
	useEffect(() => {
		const requestId = ++requestIdRef.current;
		if (input.trim() === '') {
			setDocuments([]);
			setIsValidating(false);
			return;
		}
		setIsValidating(true);
		void validateK8sManifests(input, k8sVersion).then((result) => {
			if (requestId !== requestIdRef.current) return;
			setDocuments(result.documents);
			setIsValidating(false);
		});
	}, [input, k8sVersion]);

	const hasAutoFixableApiVersion = documents.some((doc) => doc.suggestedApiVersion !== null);
	const fixedManifest = hasAutoFixableApiVersion ? autoFixDeprecatedApiVersions(input) : input;

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.readAsText(file);
	};

	const jumpToLine = (line: number | null) => {
		if (line === null || !textareaRef.current) return;
		jumpTextareaToLine(textareaRef.current, line);
	};

	const handleCopyFixed = () => {
		void navigator.clipboard.writeText(fixedManifest).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
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
				<div className="flex flex-wrap items-center justify-between gap-2">
					<label htmlFor="k8s-yaml-input" className="text-sm font-medium text-foreground">
						{messages.inputLabel}
					</label>
					<div className="flex flex-wrap items-center gap-2">
						<label htmlFor="k8s-version-select" className="text-xs text-muted-foreground">
							{messages.versionLabel}
						</label>
						<select
							id="k8s-version-select"
							value={k8sVersion}
							onChange={(e) => setK8sVersion(e.target.value)}
							className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
						>
							{K8S_VERSION_OPTIONS.map((version) => (
								<option key={version} value={version}>
									{version === 'master' ? messages.versionMaster : version}
								</option>
							))}
						</select>
						<label
							htmlFor="k8s-file-input"
							className="inline-flex cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
						>
							{messages.chooseFile}
						</label>
						<input
							id="k8s-file-input"
							type="file"
							accept=".yaml,.yml,.txt,text/yaml,text/plain"
							className="hidden"
							onChange={(e) => handleFile(e.target.files)}
						/>
						<Button type="button" size="sm" variant="outline" onClick={() => setInput(SAMPLE_MANIFEST)}>
							{messages.loadSample}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
				<p className="text-xs text-muted-foreground">{messages.multiDocHint}</p>
				<textarea
					id="k8s-yaml-input"
					ref={textareaRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={messages.inputPlaceholder}
					rows={18}
					spellCheck={false}
					className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" size="sm" variant="ghost" onClick={() => setInput('')}>
						{messages.clear}
					</Button>
					{hasAutoFixableApiVersion && (
						<Button type="button" size="sm" variant="secondary" aria-live="polite" onClick={handleCopyFixed}>
							{copied ? messages.fixApiVersionCopied : messages.fixApiVersion}
						</Button>
					)}
					{isValidating && <span role="status" className="text-xs text-muted-foreground">{messages.validating}</span>}
				</div>
				<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
					{messages.privacyNote}
				</p>
			</div>

			{documents.map((doc, docIndex) => {
				const errorCount = doc.issues.filter((i) => i.severity === 'error').length;
				const warningCount = doc.issues.filter((i) => i.severity === 'warning').length;
				return (
					<div key={docIndex} className="flex flex-col gap-2 rounded-lg border border-border p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="text-sm font-medium text-foreground">
								{messages.documentHeading.replace('{{index}}', String(docIndex + 1))}
							</span>
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
							<p className="text-sm text-muted-foreground">{messages.noIssues}</p>
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
											<span className="text-foreground">{issue.message}</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				);
			})}
		</div>
	);
}
