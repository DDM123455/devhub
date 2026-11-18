import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	INGREDIENTS,
	convertVolume,
	formatAmount,
	gramsToVolume,
	toKitchenFraction,
	volumeToGrams,
	type VolumeUnit,
} from '@/lib/kitchen-units';

export interface ConverterMessages {
	amountLabel: string;
	resultLabel: string;
	ingredientLabel: string;
	ingredientHint: string;
	swap: string;
	fractionNote: string;
	unitNames: Record<string, string>;
	ingredientNames: Record<string, string>;
}

interface Props {
	from: VolumeUnit;
	to: VolumeUnit | 'grams';
	initialValue: number;
	messages: ConverterMessages;
}

/** Đổi một chiều, dùng chung cho cả hai hướng nhập. */
function run(value: number, from: VolumeUnit | 'grams', to: VolumeUnit | 'grams', ingredient: string): number {
	if (from === 'grams' && to === 'grams') return value;
	if (from === 'grams') return gramsToVolume(value, to, ingredient);
	if (to === 'grams') return volumeToGrams(value, from, ingredient);
	return convertVolume(value, from, to);
}

export default function KitchenConverter({ from, to, initialValue, messages }: Props) {
	const [flipped, setFlipped] = useState(false);
	const [ingredient, setIngredient] = useState('water');
	// Giữ nguyên chuỗi người dùng gõ (kể cả "0." đang gõ dở) thay vì ép về số mỗi lần render.
	const [input, setInput] = useState(String(initialValue));

	const sourceUnit = flipped ? to : from;
	const targetUnit = flipped ? from : to;
	const amount = Number(input);
	const valid = input.trim() !== '' && Number.isFinite(amount) && amount >= 0;
	const output = valid ? run(amount, sourceUnit, targetUnit, ingredient) : 0;
	const fraction = valid ? toKitchenFraction(output) : null;
	const needsIngredient = from === 'grams' || to === 'grams';

	const unitName = (unit: string) => messages.unitNames[unit] ?? unit;

	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-5">
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
				<label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
					{messages.amountLabel.replace('{{unit}}', unitName(sourceUnit))}
					<input
						type="number"
						inputMode="decimal"
						min={0}
						step="any"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-base"
					/>
				</label>

				<Button variant="outline" size="sm" className="sm:mb-1" onClick={() => setFlipped((f) => !f)}>
					{messages.swap}
				</Button>

				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-sm text-foreground">
						{messages.resultLabel.replace('{{unit}}', unitName(targetUnit))}
					</span>
					<output className="block rounded-md border border-border bg-muted px-3 py-2 text-base font-medium text-foreground">
						{valid ? formatAmount(output) : '—'}
					</output>
				</div>
			</div>

			{fraction && fraction !== formatAmount(output) && (
				<p className="text-sm text-muted-foreground">
					{messages.fractionNote.replace('{{fraction}}', fraction).replace('{{unit}}', unitName(targetUnit))}
				</p>
			)}

			{needsIngredient && (
				<div className="flex flex-col gap-1 border-t border-border pt-4">
					<label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
						{messages.ingredientLabel}
						<select
							value={ingredient}
							onChange={(e) => setIngredient(e.target.value)}
							className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
						>
							{INGREDIENTS.map((item) => (
								<option key={item.id} value={item.id}>
									{messages.ingredientNames[item.id] ?? item.id}
								</option>
							))}
						</select>
					</label>
					<p className="text-xs text-muted-foreground">{messages.ingredientHint}</p>
				</div>
			)}
		</div>
	);
}
