import { ReactNode } from 'react';

type Tone = 'brand' | 'neutral' | 'warn' | 'danger';

const toneCls: Record<Tone, { value: string; icon: string }> = {
  brand: { value: 'text-brand-soft', icon: 'text-brand bg-brand/10 border-brand/25' },
  neutral: { value: 'text-white', icon: 'text-steel2 bg-navy2 border-line' },
  warn: { value: 'text-amber', icon: 'text-amber bg-amber/10 border-amber/25' },
  danger: { value: 'text-red', icon: 'text-red bg-red/10 border-red/25' },
};

export default function StatCard({
  label,
  value,
  icon,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  const t = toneCls[tone];
  const loading = value === undefined || value === null || value === '—';
  return (
    <div className="card card-hover p-5 group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-steel uppercase tracking-wider font-semibold">{label}</div>
          {loading ? (
            <div className="skeleton h-8 w-24 mt-2" />
          ) : (
            <div className={`text-[26px] font-extrabold tracking-tight mt-1 tabular-nums ${t.value}`}>{value}</div>
          )}
          {hint && <div className="text-[11px] text-steel mt-1">{hint}</div>}
        </div>
        {icon && (
          <div className={`shrink-0 h-10 w-10 rounded-xl border flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${t.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
