import { useState, type ComponentProps } from 'react';
import JsonFormatter from './JsonFormatter';
import { Button } from '@/components/ui/button';
import { formatXmlStrict } from '@/lib/text-format';
import { useCopyToClipboard } from './useCopyToClipboard';

interface XmlMessages {
  selector: string; input: string; output: string; format: string; validate: string;
  valid: string; hint: string; invalid: string; location: string; clear: string;
  copy: string; copied: string; copyFailed: string; download: string; tooLarge: string;
}

export default function JsonXmlFormatter({ messages, xml }: {
  messages: ComponentProps<typeof JsonFormatter>['messages']; xml: XmlMessages;
}) {
  const [mode, setMode] = useState('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const { copy, copied, failed } = useCopyToClipboard();
  function run(validate: boolean) {
    if (input.length > 200_000) { setStatus({ error: true, text: xml.tooLarge }); return; }
    const result = formatXmlStrict(input);
    if ('error' in result) {
      const where = result.error.line ? xml.location.replace('{{line}}', String(result.error.line)).replace('{{column}}', String(result.error.column ?? 1)) : '';
      setStatus({ error: true, text: xml.invalid.replace('{{message}}', result.error.message) + ' ' + where });
      setOutput('');
    } else {
      if (!validate) setOutput(result.value);
      setStatus({ error: false, text: xml.valid });
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([output], { type: 'application/xml;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'formatted.xml'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-4">
    <label className="flex items-center gap-3 text-sm font-medium">{xml.selector}
      <select className="rounded-md border border-border bg-background p-2" value={mode} onChange={e => setMode(e.target.value)}>
        <option value="json">JSON</option><option value="xml">XML</option>
      </select>
    </label>
    <div hidden={mode !== 'json'}><JsonFormatter messages={messages} /></div>
    <div hidden={mode !== 'xml'} className="space-y-4">
      <p className="text-sm text-muted-foreground">{xml.hint}</p>
      <label className="block space-y-2"><span>{xml.input}</span>
        <textarea className="w-full rounded-md border border-border bg-background p-3 font-mono text-sm" rows={12} spellCheck={false} value={input}
          onChange={e => { setInput(e.target.value); setOutput(''); setStatus(null); }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(false); } }} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(false)}>{xml.format}</Button>
        <Button variant="outline" onClick={() => run(true)}>{xml.validate}</Button>
        <Button variant="ghost" onClick={() => { setInput(''); setOutput(''); setStatus(null); }}>{xml.clear}</Button>
      </div>
      {status && <p role={status.error ? 'alert' : 'status'} className={status.error ? 'text-destructive' : 'text-primary'}>{status.text}</p>}
      {output && <div className="space-y-2">
        <label className="block space-y-2"><span>{xml.output}</span><textarea readOnly value={output} rows={12} className="w-full rounded-md border border-border bg-background p-3 font-mono text-sm" /></label>
        <div className="flex gap-2"><Button variant="outline" onClick={() => copy(output)}>{copied ? xml.copied : failed ? xml.copyFailed : xml.copy}</Button><Button variant="outline" onClick={download}>{xml.download}</Button></div>
      </div>}
    </div>
  </div>;
}
