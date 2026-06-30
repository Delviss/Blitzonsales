import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organisation } from '../organisationen/organisation.entity';
import { AppUser } from '../app-users/app-user.entity';
import { Contract } from '../contracts/contract.entity';
import { SalesRep } from '../sales-reps/sales-rep.entity';

@Entity('commission_rule')
export class CommissionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  typ: string;

  @Column({ type: 'jsonb' })
  bedingung: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  satz: number | null;

  @Column({ type: 'date' })
  gueltig_ab: string;

  @Column({ type: 'uuid', nullable: true })
  organisation_id: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;
}

@Entity('commission_run')
export class CommissionRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  periode: string;

  @Column({ type: 'uuid', nullable: true })
  organisation_id: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ type: 'text', default: 'entwurf' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  freigegeben_von: string | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'freigegeben_von' })
  freigegebener_user: AppUser | null;

  @Column({ type: 'timestamptz', nullable: true })
  freigegeben_am: Date | null;
}

@Entity('commission_line')
export class CommissionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  run_id: string;

  @ManyToOne(() => CommissionRun)
  @JoinColumn({ name: 'run_id' })
  run: CommissionRun;

  @Column({ type: 'uuid' })
  contract_id: string;

  @ManyToOne(() => Contract)
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  @Column({ type: 'uuid' })
  rep_id: string;

  @ManyToOne(() => SalesRep)
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep;

  @Column({ type: 'uuid', nullable: true })
  regel_id: string | null;

  @ManyToOne(() => CommissionRule, { nullable: true })
  @JoinColumn({ name: 'regel_id' })
  regel: CommissionRule | null;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  betrag: number;

  @Column({ type: 'text', default: 'normal' })
  typ: string;

  @Column({ type: 'uuid', nullable: true })
  storniert_durch: string | null;

  @ManyToOne(() => CommissionLine, { nullable: true })
  @JoinColumn({ name: 'storniert_durch' })
  storno_referenz: CommissionLine | null;

  @Column({ type: 'text', nullable: true })
  begruendung: string | null;
}
