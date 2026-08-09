import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	autoFixTrivialIssues,
	parseNginxConfig,
	simulateRewrite,
	testNginxLocationRegex,
	type NginxIssue,
} from '@/lib/nginx-parser';
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
	const [copied, setCopied] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const [regexPattern, setRegexPattern] = useState('\\.(jpg|jpeg|png|gif|ico|css|js)$');
	const [regexCaseInsensitive, setRegexCaseInsensitive] = useState(false);
	const [regexTestUrl, setRegexTestUrl] = useState('/assets/logo.png');

	const [rewritePattern, setRewritePattern] = useState('^/old/(.*)$');
	const [rewriteReplacement, setRewriteReplacement] = useState('/new/$1');
	const [rewriteTestUrl, setRewriteTestUrl] = useState('/old/page.html');

	const result = useMemo(() => parseNginxConfig(input), [input]);
	const errorCount = result.issues.filter((issue) => issue.severity === 'error').length;
	const warningCount = result.issues.filter((issue) => issue.severity === 'warning').length;

	const fixedConfig = useMemo(() => autoFixTrivialIssues(input, result), [input, result]);
	const hasTrivialFix = input.trim() !== '' && fixedConfig !== input.trimEnd();

	const regexResult = useMemo(
		() => (regexPattern ? testNginxLocationRegex(regexPattern, regexCaseInsensitive, regexTestUrl) : null),
		[regexPattern, regexCaseInsensitive, regexTestUrl],
	);
	const rewriteResult = useMemo(
		() => (rewritePattern ? simulateRewrite(rewritePattern, rewriteReplacement, rewriteTestUrl) : null),
		[rewritePattern, rewriteReplacement, rewriteTestUrl],
	);

	const handleFile = (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setInput(String(reader.result ?? ''));
		reader.readAsText(file);
	};

	const jumpToIssue = (issue: NginxIssue) => {
		if (textareaRef.current) jumpTextareaToLine(textareaRef.current, issue.line);
	};

	const handleCopyFixed = () => {
		void navigator.clipboard.writeText(fixedConfig).then(() => {
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
				<div className="flex items-center justify-between">
					<label htmlFor="nginx-config-input" className="text-sm font-medium text-foreground">
						{messages.inputLabel}
					</label>
					<div className="flex gap-2">
						<label
							htmlFor="nginx-file-input"
							className="inline-flex cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
						>
							{messages.chooseFile}
						</label>
						<input
							id="nginx-file-input"
							type="file"
							accept=".conf,.txt,text/plain"
							className="hidden"
							onChange={(e) => handleFile(e.target.files)}
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
					{hasTrivialFix && (
						<Button type="button" size="sm" variant="secondary" aria-live="polite" onClick={handleCopyFixed}>
							{copied ? messages.copyFixedCopied : messages.copyFixed}
						</Button>
					)}
				</div>
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
				{input.trim() === '' || result.issues.length === 0 ? (
					<p className="text-sm text-muted-foreground">{messages.noIssues}</p>
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
									<span className="text-foreground">{issue.message}</span>
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
				{regexResult && (
					<p role="status" className={`text-xs ${regexResult.error ? 'text-destructive' : regexResult.matched ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
						{regexResult.error ?? (regexResult.matched ? messages.regexMatched : messages.regexNoMatch)}
					</p>
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
				{rewriteResult && (
					<p role="status" className="text-xs">
						{rewriteResult.error ? (
							<span className="text-muted-foreground">{rewriteResult.error}</span>
						) : (
							<>
								<span className="text-muted-foreground">{messages.rewriteResultLabel} </span>
								<span className="font-mono text-emerald-700 dark:text-emerald-400">{rewriteResult.outputUrl}</span>
							</>
						)}
					</p>
				)}
			</div>
		</div>
	);
}
