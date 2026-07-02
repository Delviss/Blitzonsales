type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const tones: Record<Tone, string> = {
  good: 'bg-green/10 text-green border-green/30',
  warn: 'bg-amber/10 text-amber border-amber/30',
  bad: 'bg-red/10 text-red border-red/30',
  neutral: 'bg-steel/10 text-steel2 border-line',
};

const dot: Record<Tone, string> = {
  good: 'bg-green',
  warn: 'bg-amber',
  bad: 'bg-red',
  neutral: 'bg-steel',
};

const statusTone: Record<string, Tone> = {
  'Liefertermin steht fest': 'good',
  'In Belieferung': 'good',
  'Im Wechsel': 'warn',
  'Datencheck': 'warn',
  'Manueller Kreditcheck': 'warn',
  'Exportiert': 'bad',
  'Abgelehnt': 'bad',
  'Widerruf': 'bad',
  'Storno': 'bad',
  'Kreditcheck nicht bestanden': 'bad',
};

export default function StatusPill({ status }: { status: string }) {
  const tone = statusTone[status] ?? 'neutral';
  return (
    <span className={`chip ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {status}
    </span>
  );
}

/** Draft/released pill used by Provisionslauf views. */
export function RunStatusPill({ status }: { status: string }) {
  const released = status === 'freigegeben';
  return (
    <span className={`chip ${released ? tones.good : tones.warn}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${released ? dot.good : dot.warn}`} />
      {released ? 'Freigegeben' : 'Entwurf'}
    </span>
  );
}
