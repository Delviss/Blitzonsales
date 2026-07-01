const config: Record<string, { label: string; cls: string }> = {
  'Liefertermin steht fest': { label: 'Liefertermin steht fest', cls: 'bg-green/10 text-green border-green/30' },
  'In Belieferung': { label: 'In Belieferung', cls: 'bg-green/10 text-green border-green/30' },
  'Im Wechsel': { label: 'Im Wechsel', cls: 'bg-amber/10 text-amber border-amber/30' },
  'Datencheck': { label: 'Datencheck', cls: 'bg-amber/10 text-amber border-amber/30' },
  'Exportiert': { label: 'Exportiert', cls: 'bg-red/10 text-red border-red/30' },
  'Abgelehnt': { label: 'Abgelehnt', cls: 'bg-red/10 text-red border-red/30' },
  'Widerruf': { label: 'Widerruf', cls: 'bg-red/10 text-red border-red/30' },
  'Storno': { label: 'Storno', cls: 'bg-red/10 text-red border-red/30' },
  'Kreditcheck nicht bestanden': { label: 'Kreditcheck nicht bestanden', cls: 'bg-red/10 text-red border-red/30' },
  'Manueller Kreditcheck': { label: 'Manueller Kreditcheck', cls: 'bg-amber/10 text-amber border-amber/30' },
};

export default function StatusPill({ status }: { status: string }) {
  const c = config[status] ?? { label: status, cls: 'bg-steel/10 text-steel2 border-line' };
  return (
    <span className={`inline-block text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.label}
    </span>
  );
}
