import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Contract } from './contract.entity';
import { SalesRep } from './sales-rep.entity';
import { CommissionRun } from './commission-run.entity';

/**
 * Commercial reserve posting object (I-24, Fachkonzept ch. 10.2 / 10.3).
 *
 * The 20% reserve on commercial profit is *non-freely-available liquidity*: it
 * is held per contract (and rolls up to a total), booked only on actually
 * received SWA payments, flagged red when under-funded (`ist < soll`), and
 * released only after contract end / final billing. This is a persisted posting
 * object rather than a bare ledger line so the reserve's lifecycle (funded →
 * released) and under-funding are queryable for the dashboard.
 *
 * One row per (contract, run) — a re-run replaces the run's rows.
 */
@Entity('commercial_reserve')
@Index('idx_commercial_reserve_run', ['runId'])
@Index('idx_commercial_reserve_contract', ['contractId'])
export class CommercialReserve {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id', nullable: true })
  contractId: string | null;

  @ManyToOne(() => Contract, { nullable: true })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract | null;

  @Column({ name: 'rep_id', nullable: true })
  repId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep | null;

  @Column({ name: 'run_id', nullable: true })
  runId: string | null;

  @ManyToOne(() => CommissionRun, { nullable: true })
  @JoinColumn({ name: 'run_id' })
  run: CommissionRun | null;

  /** Billing month (JJJJ-MM) the reserve was booked for. */
  @Column({ name: 'periode', nullable: true })
  periode: string | null;

  /** SWA revenue actually received that this reserve is computed on. */
  @Column({ name: 'swa_revenue', type: 'numeric', precision: 12, scale: 2, default: 0 })
  swaRevenue: number;

  /** Profit before reserve = max(0, SWA − payout − employer cost − overheads). */
  @Column({ name: 'profit_before_reserve', type: 'numeric', precision: 12, scale: 2, default: 0 })
  profitBeforeReserve: number;

  /** Target reserve (20% × profit-before-reserve). */
  @Column({ name: 'reserve_target', type: 'numeric', precision: 12, scale: 2, default: 0 })
  reserveTarget: number;

  /** Reserve actually set aside; under-funding is `reserveActual < reserveTarget`. */
  @Column({ name: 'reserve_actual', type: 'numeric', precision: 12, scale: 2, default: 0 })
  reserveActual: number;

  /** gebucht | unterdeckt | freigegeben (see ReserveStatus). */
  @Column({ name: 'status', default: 'gebucht' })
  status: string;

  @Column({ name: 'freigegeben_am', type: 'timestamptz', nullable: true })
  freigegebenAm: Date | null;

  @Column({ name: 'freigegeben_von', nullable: true })
  freigegebenVon: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
