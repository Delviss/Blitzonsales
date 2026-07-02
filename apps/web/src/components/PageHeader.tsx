import { ReactNode } from 'react';

export default function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div>
        <div className="kicker mb-1.5 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-gradient-to-r from-brand to-transparent" />
          {kicker}
        </div>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="text-steel2 text-sm mt-1.5 max-w-xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
