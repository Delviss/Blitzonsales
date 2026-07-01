import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CommissionRun } from './commission-run.entity';
import { Contract } from './contract.entity';
import { SalesRep } from './sales-rep.entity';
import { CommissionRule } from './commission-rule.entity';

@Entity('commission_line')
export class CommissionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', nullable: true })
  runId: string | null;

  @ManyToOne(() => CommissionRun, { nullable: true })
  @JoinColumn({ name: 'run_id' })
  run: CommissionRun | null;

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

  @Column({ name: 'regel_id', nullable: true })
  regelId: string | null;

  @ManyToOne(() => CommissionRule, { nullable: true })
  @JoinColumn({ name: 'regel_id' })
  regel: CommissionRule | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: false })
  betrag: number;

  @Column({ default: 'normal' })
  typ: string;

  @Column({ name: 'storniert_durch', nullable: true })
  storniertDurch: string | null;

  @Column({ type: 'text', nullable: true })
  begruendung: string | null;
}
