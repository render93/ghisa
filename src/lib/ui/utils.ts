export function uid(prefix = 'x'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function fmtKg(kg: number | null | undefined): string {
  if (kg == null || isNaN(kg)) return '–';
  const n = Math.round(kg * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today))
    return 'oggi · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (same(d, yest))
    return 'ieri · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return (
    d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  );
}

export function fmtSec(s: number): string {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
