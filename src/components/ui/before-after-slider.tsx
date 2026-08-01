import * as React from "react"

import { cn } from "@/lib/utils"

interface BeforeAfterSliderProps extends Omit<React.ComponentProps<"div">, "onChange"> {
  beforeSrc: string
  afterSrc: string
  beforeAlt: string
  afterAlt: string
  value: number
  onValueChange: (value: number) => void
  label: string
  // Result images with real transparency (background removal) need a
  // checkerboard behind the "after" pane so transparent areas read as
  // transparent instead of an ambiguous solid color — plain lossy/lossless
  // re-encodes (compression, format conversion) never have that concern.
  checkerboard?: boolean
}

function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  value,
  onValueChange,
  label,
  checkerboard = false,
  className,
  ...props
}: BeforeAfterSliderProps) {
  return (
    <div
      data-slot="before-after-slider"
      className={cn(
        "relative aspect-square w-24 shrink-0 select-none overflow-hidden rounded-md border border-border",
        className,
      )}
      {...props}
    >
      <img src={beforeSrc} alt={beforeAlt} className="absolute inset-0 h-full w-full object-cover" />
      <div
        className={cn(
          "absolute inset-0 overflow-hidden",
          checkerboard && "bg-[repeating-conic-gradient(#d4d4d4_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]",
        )}
        style={{ clipPath: `inset(0 0 0 ${value}%)` }}
      >
        <img src={afterSrc} alt={afterAlt} className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
        style={{ left: `${value}%` }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        aria-label={label}
      />
    </div>
  )
}

export { BeforeAfterSlider }
