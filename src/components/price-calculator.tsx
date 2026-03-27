"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";

interface PriceCalculatorProps {
  onApply: (priceCents: number) => void;
  defaultInkoopprijs?: number | null;
}

export function PriceCalculator({ onApply, defaultInkoopprijs }: PriceCalculatorProps) {
  const [inkoopprijs, setInkoopprijs] = useState<string>(
    defaultInkoopprijs ? defaultInkoopprijs.toString() : ""
  );
  const [factor, setFactor] = useState<number>(2.5);
  const [manualPrice, setManualPrice] = useState<string>("");

  const numericPrice = parseFloat(inkoopprijs) || 0;
  const calculated = numericPrice * factor;
  const base = Math.floor(Math.round(calculated) / 10) * 10;
  const candidates = [base - 1, base + 5, base + 9];
  const rounded = candidates.reduce((best, c) => Math.abs(Math.round(calculated) - c) < Math.abs(Math.round(calculated) - best) ? c : best);
  const priceCents = Math.round(rounded * 100);

  const manualPriceCents = Math.round(
    (parseFloat(manualPrice.replace(",", ".")) || 0) * 100
  );

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Calculator size={16} />
        Adviesprijs calculator
      </div>

      {/* Factor berekening */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Berekend met factor</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Inkoopprijs (excl. BTW)
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">&euro;</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={inkoopprijs}
                onChange={(e) => setInkoopprijs(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Factor</label>
            <select
              value={factor}
              onChange={(e) => setFactor(parseFloat(e.target.value))}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={2.5}>&times;2.5</option>
              <option value={3.0}>&times;3.0</option>
            </select>
          </div>
          {numericPrice > 0 && (
            <>
              <div className="rounded-lg bg-green-100 px-4 py-2 text-sm font-bold text-green-800">
                &euro; {rounded.toFixed(2).replace(".", ",")}
                <span className="ml-1 text-xs font-normal text-green-600">incl. BTW</span>
              </div>
              <Button
                size="sm"
                onClick={() => onApply(priceCents)}
              >
                Overnemen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Scheidingslijn */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">of</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Handmatige invoer */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Handmatig invullen</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Verkoopprijs (incl. BTW)
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">&euro;</span>
              <Input
                type="text"
                placeholder="0,00"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manualPriceCents > 0) {
                    onApply(manualPriceCents);
                    setManualPrice("");
                  }
                }}
                className="w-28"
              />
            </div>
          </div>
          {manualPriceCents > 0 && (
            <Button
              size="sm"
              onClick={() => {
                onApply(manualPriceCents);
                setManualPrice("");
              }}
            >
              Overnemen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
