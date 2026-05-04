/**
 * Sortering voor carpet-afmetingen: eerst rechthoekig (op oppervlak klein → groot),
 * dan rond (op diameter klein → groot). Een vierkant 200×200 is dus géén rond,
 * detectie gebeurt op de naam ("ROND").
 */
export function isRoundCarpet(name: string): boolean {
  return /\bROND\b/i.test(name);
}

export function compareCarpetDims<
  T extends { name: string; width_cm: number; height_cm: number }
>(a: T, b: T): number {
  const ar = isRoundCarpet(a.name);
  const br = isRoundCarpet(b.name);
  if (ar !== br) return ar ? 1 : -1;
  return a.width_cm * a.height_cm - b.width_cm * b.height_cm;
}
