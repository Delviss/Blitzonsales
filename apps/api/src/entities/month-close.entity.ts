import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Month-end close & freeze (I-34, Fachkonzept ch. 12.3 / 5.2).
 *
 * An explicit close per billing month after which that month's volumes, tiers,
 * payouts and KPIs are immutable. Later SWA information for a closed month
 * appears only as an addendum in the *current* month (referencing the original
 * capture month + SWA order number); it never reopens the closed month. Only
 * Founder/Admin may reopen/reset, and every close/reopen is audited.
 *
 * The `snapshot` freezes the month's figures at close time so the immutable
 * state is provable and an addendum can tell "already booked" from "newly
 * commissionable" without recomputing the closed month.
 */
@Entity('month_close')
export class MonthClose {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Billing month JJJJ-MM. Unique — a month is closed at most once at a time. */
  @Column({ nullable: false, unique: true })
  periode: string;

  /** 'offen' | 'geschlossen'. */
  @Column({ default: 'geschlossen' })
  status: string;

  /** Frozen figures of the month at close time (repSummaries, totals, swaTier). */
  @Column({ name: 'snapshot', type: 'jsonb', nullable: true })
  snapshot: unknown | null;

  /**
   * Contract ids that carried a commissionable line in the closed month — the
   * "already booked" set. A later contract in this month not in this set and now
   * commissionable is booked as an addendum in the current month (I-34/I-17).
   */
  @Column({ name: 'gebuchte_vertrag_ids', type: 'jsonb', nullable: true })
  gebuchteVertragIds: string[] | null;

  @Column({ name: 'geschlossen_am', type: 'timestamptz', nullable: true })
  geschlossenAm: Date | null;

  @Column({ name: 'geschlossen_von', nullable: true })
  geschlossenVon: string | null;

  /** Last reopen (Founder/Admin only, audited). */
  @Column({ name: 'wieder_geoeffnet_am', type: 'timestamptz', nullable: true })
  wiederGeoeffnetAm: Date | null;

  @Column({ name: 'wieder_geoeffnet_von', nullable: true })
  wiederGeoeffnetVon: string | null;

  @Column({ name: 'reopen_grund', type: 'text', nullable: true })
  reopenGrund: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
