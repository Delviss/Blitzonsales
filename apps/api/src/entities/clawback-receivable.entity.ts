import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Contract } from './contract.entity';
import { SalesRep } from './sales-rep.entity';

/**
 * Clawback receivable posting object (I-25, Fachkonzept ch. 9.4 / 7.5).
 *
 * An SWA clawback (under-consumption, cancellation before delivery,
 * insolvency/death/mis-booking) is passed on causer-accurately and offset in a
 * fixed order: storno account → current commission → open retention commission
 * → invoice to a departed employee → collections. Every field required to
 * reconstruct the remaining balance is stored: contract no., original payout,
 * reason, pass-through, the offsets applied (jsonb list of {target, applied}),
 * invoice reference/payment, remaining balance and collections status.
 */
@Entity('clawback_receivable')
@Index('idx_clawback_receivable_rep', ['repId'])
@Index('idx_clawback_receivable_contract', ['contractId'])
export class ClawbackReceivable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', nullable: true })
  contractId: string | null;

  @ManyToOne(() => Contract, { nullable: true })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract | null;

  /** SWA order number — the traceable key for the receivable (I-03). */
  @Column({ name: 'swa_order_number', nullable: true })
  swaOrderNumber: string | null;

  /** Causer of the clawback — the rep whose commission is offset. */
  @Column({ name: 'rep_id', nullable: true })
  repId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep | null;

  /** Reason (under-consumption / cancellation / insolvency / mis-booking / …). */
  @Column({ name: 'grund', type: 'text', nullable: true })
  grund: string | null;

  /** The full SWA clawback amount (absolute €). */
  @Column({ name: 'swa_clawback', type: 'numeric', precision: 12, scale: 2, default: 0 })
  swaClawback: number;

  /** The causer's share (e.g. 0.5 for a 50% employee share). */
  @Column({ name: 'causer_share', type: 'numeric', precision: 6, scale: 4, default: 1 })
  causerShare: number;

  /** Causer-accurate pass-through = |clawback| × causerShare. */
  @Column({ name: 'pass_through', type: 'numeric', precision: 12, scale: 2, default: 0 })
  passThrough: number;

  /** The offsets applied, in the fixed order: [{ target, applied }]. */
  @Column({ name: 'offsets', type: 'jsonb', nullable: true })
  offsets: Array<{ target: string; applied: number }> | null;

  /** Remaining receivable after the offsets (always reconstructable). */
  @Column({ name: 'remaining', type: 'numeric', precision: 12, scale: 2, default: 0 })
  remaining: number;

  /** Invoice reference when the remainder is billed to a departed employee. */
  @Column({ name: 'rechnung_ref', nullable: true })
  rechnungRef: string | null;

  /** Amount paid against the invoice. */
  @Column({ name: 'zahlung', type: 'numeric', precision: 12, scale: 2, default: 0 })
  zahlung: number;

  /** ausgeglichen | offen | rechnung | inkasso (see CollectionsStatus). */
  @Column({ name: 'inkasso_status', default: 'offen' })
  inkassoStatus: string;

  @Column({ name: 'erstellt_von', nullable: true })
  erstelltVon: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
