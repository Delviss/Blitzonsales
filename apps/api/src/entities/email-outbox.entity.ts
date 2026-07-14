import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A dispatched email, persisted so every notification the tool sends is
 * verifiable and auditable (I-32 acceptance: "a lead + email are produced and
 * verifiable"). The default `EmailSender` records the message here (and logs it)
 * instead of talking to an external MTA, because the concrete mail sender /
 * recipient list is an open input — a real transport can be dropped in behind
 * the same interface without touching callers.
 */
@Entity('email_outbox')
export class EmailOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Comma-separated recipient list. */
  @Column({ nullable: false })
  empfaenger: string;

  @Column({ nullable: false })
  betreff: string;

  @Column({ type: 'text', nullable: false })
  koerper: string;

  /** What produced the mail, e.g. "wiedervorlage". */
  @Column({ nullable: true })
  anlass: string | null;

  /** Optional reference id (e.g. the Wiedervorlage id). */
  @Column({ name: 'referenz_id', nullable: true })
  referenzId: string | null;

  /** Transport used: "log" for the default recording sender. */
  @Column({ nullable: false, default: 'log' })
  transport: string;

  @CreateDateColumn({ name: 'gesendet_am', type: 'timestamptz' })
  gesendetAm: Date;
}
