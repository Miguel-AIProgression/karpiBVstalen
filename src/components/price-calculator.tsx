"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";

interface PriceCalculatorProps {
  onApply: (priceCents: number) => void;
}

export function PriceCalculator({ onApply }: PriceCalculatorProps) {
  const [inkoopprijs, setInkoopprijs] = useState<string>("");
  const [factor, setFactor] = useState<number>(2.5);

  const numericPrice = parseFloat(inkoopprijs) || 0;
  const calculated = numericPrice * factor * 1.21;
  const rounded = Math.ceil(calculated / 10) * 10 - 1;
  const priceCents = Math.round(rounded * 100);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Calculator size={16} />
        Adviesprijs calculator
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Inkoopprijs (excl. BTW)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={inkoopprijs}
            onChange={(e) => setInkoopprijs(e.target.value)}
            className="w-32"
          />
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
              &euro; {(rounded).toFixed(2)}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onApply(priceCents)}
            >
              Overnemen
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
