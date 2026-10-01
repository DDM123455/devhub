import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	autoFixTrivialIssues,
	parseNginxConfig,
	type NginxIssue,
	type RegexTestResult,
	type RewriteSimulationResult,
} from '@/lib/nginx-parser';
import type { NginxRegexRequest } from './nginxRegexWorker';
import { useCopyToClipboard } from './useCopyToClipboard';
import { useWorkerRequest } from './useWorkerRequest';
import { jumpTextareaToLine } from '@/lib/text-line-utils';

interface Messages {
	inputLabel: string;
	inputPlaceholder: string;
	dropHint: string;
	chooseFile: string;
	loadSample: string;
	clear: string;
	privacyNote: string;
	issuesHeading: string;
	noIssues: string;
	summaryLabel: string;
	severityError: string;
	severityWarning: string;
	jumpToLine: string;
	copyFixed: string;
	copyFixedCopied: string;
	regexTesterHeading: string;
	regexPatternLabel: string;
	regexCaseInsensitiveLabel: string;
	regexTestUrlLabel: string;
	regexMatched: string;
	regexNoMatch: string;
	regexPcreNote: string;
	rewriteHeading: string;
	rewritePatternLabel: string;
	rewriteReplacementLabel: string;
	rewriteTestUrlLabel: string;
	rewriteResultLabel: string;
	rewriteNoMatch: string;
	issueMessages: Record<string, string>;
	emptyState: string;
	fragmentLabel: string;
	fragmentAutoNote: string;
	regexTimeout: string;
	regexWorkerError: string;
	capturesLabel: string;
	fileReadError: string;
	copyFailed: string;
}

function formatIssue(issue: NginxIssue, issueMessages: Record<string, string>): string {
	const template = issueMessages[issue.key];
	if (!template) return issue.message;
	return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => String(issue.params[name] ?? whole));
}

const SAMPLE_CONFIG = `# Example reverse proxy in front of a Node.js app
events {
  worker_connections 1024;
}

http {
  server_tokens off;

  server {
    listen 80;
    server_name example.com;

    location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location /old-path {
      return 301 https://example.com$uri;
    }
  }
}
`;

export default function NginxConfigValidator({ messages }: { messages: Messages }) {
	const [input, setInput] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);
	const { copied, failed: copyFailed, copy } = useCopyToClipboard();
	const [forceFragment, setForceFragment] = useState(false);
	const [fileError, setFileError] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const [regexPattern, setRegexPattern] = useState('\\.(jpg|jpeg|png|gif|ico|css|js)$');
	const [regexCaseInsensitive, setRegexCaseInsensitive] = useState(false);
	const [regexTestUrl, setRegexTestUrl] = useState('/assets/logo.png');

	const [rewritePattern, setRewritePattern] = useState('^/old/(.*)$');
	const [rewriteReplacement, setRewriteReplacement] = useState('/new/$1');
	const [rewriteTestUrl, setRewriteTestUrl] = useState('/old/page.html');

	const result = useMemo(() => parseNginxConfig(input, { fragment: forceFragment ? true : 'auto' }), [input, forceFragment]);
	const errorCount = result.issues.filter((issue) => issue.severity === 'error').length;
	const warningCount = result.issues.filter((issue) => issue.severity === 'warning').length;

	const fixedConfig = useMemo(() => autoFixTrivialIssues(input, result), [input, result]);
	const hasTrivialFix = input.trim() !== '' && fixedConfig !== input.trimEnd();

	// Both simulators evaluate USER-WRITTEN regexes, which can backtrack catastrophically, so they
	// run in a Web Worker that is terminated after a timeout instead of on the main thread.
	const regexRequest = useMemo<NginxRegexRequest | null>(
		() =>
			regexPattern ? { kind: 'location', pattern: regexPattern, caseInsensitive: regexCaseInsensitive, testUrl: regexTestUrl } : null,
		[regexPattern, regexCaseInsensitive, regexTestUrl],
	);
	const rewriteRequest = useMemo<NginxRegexRequest | null>(
		() =>
			rewritePattern ? { kind: 'rewrite', pattern: rewritePattern, replacement: rewriteReplacement, testUrl: rewriteTestUrl } : null,
		[rewritePattern, rewriteReplacement, rewriteTestUrl],
	);
	const createRegexWorker = () => new Worker(new URL('./nginxRegexWorker.ts', import.meta.url), { type: 'module' });
	const regexTask = useWorkerRequest<NginxRegexRequest, RegexTestResult>({ createWorker: createRegexWorker, request: regexRequest });
	const rewriteTask = useWorkerRequest<NginxRegexRequest, RewriteSimulationResult>({ createWorker: createRegexWorker, request: rewriteRequest });
	const regexResult = regexTask.result;
	const rewriteResult = rewriteTask.result;

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setFileError(false);
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.onerror = () => setFileError(true);
		reader.readAsText(file);
	};

	const jumpToIssue = (issue: NginxIssue) => {
		if (textareaRef.current) jumpTextareaToLine(textareaRef.current, issue.line);
	};

	const handleCopyFixed = () => {
		void copy(fixedConfig);
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
				<div className="flex items-center justify-between">
					<label htmlFor="nginx-config-input" className="text-sm font-medium text-foreground">
						{messages.inputLabel}
					</label>
					<div className="flex gap-2">
						<label
							htmlFor="nginx-file-input"
							className="has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring inline-flex cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
						>
							{messages.chooseFile}
						</label>
						<input
							id="nginx-file-input"
							type="file"
							accept=".conf,.txt,text/plain"
							className="sr-only"
							onChange={(e) => {
								handleFile(e.target.files);
								e.target.value = '';
							}}
						/>
						<Button type="button" size="sm" variant="outline" onClick={() => setInput(SAMPLE_CONFIG)}>
							{messages.loadSample}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{messages.dropHint}</p>
				<textarea
					id="nginx-config-input"
					ref={textareaRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={messages.inputPlaceholder}
					rows={16}
					spellCheck={false}
					className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" size="sm" variant="ghost" onClick={() => setInput('')}>
						{messages.clear}
					</Button>
					<label className="flex items-center gap-1.5 text-xs text-muted-foreground" title={messages.fragmentAutoNote}>
						<input type="checkbox" checked={forceFragment} onChange={(e) => setForceFragment(e.target.checked)} />
						{messages.fragmentLabel}
					</label>
					{hasTrivialFix && (
						<Button type="button" size="sm" variant="secondary" aria-live="polite" onClick={handleCopyFixed}>
							{copied ? messages.copyFixedCopied : copyFailed ? messages.copyFailed : messages.copyFixed}
						</Button>
					)}
				</div>
				{fileError && <p role="alert" className="text-xs text-destructive">{messages.fileReadError}</p>}
				<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
					{messages.privacyNote}
				</p>
			</div>

			<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium text-foreground">{messages.issuesHeading}</span>
					{input.trim() !== '' && (
						<span role="status" className="text-xs text-muted-foreground">
							{messages.summaryLabel
								.replace('{{errors}}', String(errorCount))
								.replace('{{warnings}}', String(warningCount))}
						</span>
					)}
				</div>
				{input.trim() === '' ? (
					<p className="text-sm text-muted-foreground">{messages.emptyState}</p>
				) : result.issues.length === 0 ? (
					<p className="text-sm text-emerald-700 dark:text-emerald-400">{messages.noIssues}</p>
				) : (
					<ul className="flex flex-col gap-2">
						{result.issues.map((issue, i) => (
							<li key={i} className="rounded-md border border-border p-2.5 text-xs">
								<button
									type="button"
									onClick={() => jumpToIssue(issue)}
									className="flex w-full flex-col gap-1 rounded-md text-left hover:bg-accent"
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
										<span className="font-mono text-muted-foreground">
											{messages.jumpToLine.replace('{{line}}', String(issue.line))}
										</span>
									</div>
									<span className="text-foreground">{formatIssue(issue, messages.issueMessages)}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.regexTesterHeading}</span>
				<div className="flex flex-col gap-1">
					<label htmlFor="nginx-regex-pattern" className="text-xs text-muted-foreground">
						{messages.regexPatternLabel}
					</label>
					<input
						id="nginx-regex-pattern"
						type="text"
						value={regexPattern}
						onChange={(e) => setRegexPattern(e.target.value)}
						spellCheck={false}
						className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
					/>
				</div>
				<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<input
						type="checkbox"
						checked={regexCaseInsensitive}
						onChange={(e) => setRegexCaseInsensitive(e.target.checked)}
					/>
					{messages.regexCaseInsensitiveLabel}
				</label>
				<div className="flex flex-col gap-1">
					<label htmlFor="nginx-regex-test-url" className="text-xs text-muted-foreground">
						{messages.regexTestUrlLabel}
					</label>
					<input
						id="nginx-regex-test-url"
						type="text"
						value={regexTestUrl}
						onChange={(e) => setRegexTestUrl(e.target.value)}
						spellCheck={false}
						className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
					/>
				</div>
				{regexTask.status === 'timeout' && <p role="alert" className="text-xs text-destructive">{messages.regexTimeout}</p>}
				{regexTask.status === 'error' && <p role="alert" className="text-xs text-destructive">{messages.regexWorkerError}</p>}
				{regexResult && (
					<div role="status" className="flex flex-col gap-1">
						<p className={`text-xs ${regexResult.error ? 'text-destructive' : regexResult.matched ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
							{regexResult.error ?? (regexResult.matched ? messages.regexMatched : messages.regexNoMatch)}
						</p>
						{regexResult.matched && regexResult.groups.length > 1 && (
							<ul className="font-mono text-xs text-muted-foreground">
								{regexResult.groups.slice(1).map((g, i) => (
									<li key={i}>
										{messages.capturesLabel.replace('{{name}}', `$${i + 1}`)}: <span className="text-foreground">{g}</span>
									</li>
								))}
								{Object.entries(regexResult.named).map(([name, value]) => (
									<li key={name}>
										{messages.capturesLabel.replace('{{name}}', `$${name}`)}: <span className="text-foreground">{value}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
				<p className="text-xs text-muted-foreground">{messages.regexPcreNote}</p>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
				<span className="text-sm font-medium text-foreground">{messages.rewriteHeading}</span>
				<div className="flex flex-col gap-1">
					<label htmlFor="nginx-rewrite-pattern" className="text-xs text-muted-foreground">
						{messages.rewritePatternLabel}
					</label>
					<input
						id="nginx-rewrite-pattern"
						type="text"
						value={rewritePattern}
						onChange={(e) => setRewritePattern(e.target.value)}
						spellCheck={false}
						className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="nginx-rewrite-replacement" className="text-xs text-muted-foreground">
						{messages.rewriteReplacementLabel}
					</label>
					<input
						id="nginx-rewrite-replacement"
						type="text"
						value={rewriteReplacement}
						onChange={(e) => setRewriteReplacement(e.target.value)}
						spellCheck={false}
						className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="nginx-rewrite-test-url" className="text-xs text-muted-foreground">
						{messages.rewriteTestUrlLabel}
					</label>
					<input
						id="nginx-rewrite-test-url"
						type="text"
						value={rewriteTestUrl}
						onChange={(e) => setRewriteTestUrl(e.target.value)}
						spellCheck={false}
						className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
					/>
				</div>
				{rewriteTask.status === 'timeout' && <p role="alert" className="text-xs text-destructive">{messages.regexTimeout}</p>}
				{rewriteTask.status === 'error' && <p role="alert" className="text-xs text-destructive">{messages.regexWorkerError}</p>}
				{rewriteResult && (
					<div role="status" className="flex flex-col gap-1 text-xs">
						{rewriteResult.noMatch ? (
							<span className="text-muted-foreground">{messages.rewriteNoMatch}</span>
						) : rewriteResult.error ? (
							<span className="text-destructive">{rewriteResult.error}</span>
						) : (
							<>
								<p>
									<span className="text-muted-foreground">{messages.rewriteResultLabel} </span>
									<span className="font-mono break-all text-emerald-700 dark:text-emerald-400">{rewriteResult.outputUrl}</span>
								</p>
								{rewriteResult.captures.length > 1 && (
									<ul className="font-mono text-muted-foreground">
										{rewriteResult.captures.slice(1).map((g, i) => (
											<li key={i}>
												{messages.capturesLabel.replace('{{name}}', `$${i + 1}`)}: <span className="text-foreground">{g}</span>
											</li>
										))}
									</ul>
								)}
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
