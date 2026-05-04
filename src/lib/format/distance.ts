export function formatKm(km: number): string {
  if (km < 1) return km.toFixed(2);
  if (km < 10) return km.toFixed(1);
  return Math.round(km).toLocaleString("he-IL");
}
