import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Organisation } from './organisation.entity';

@Entity('commission_rule')
export class CommissionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  typ: string;

  @Column({ type: 'jsonb', nullable: false })
  bedingung: Record<string, any>;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  satz: number | null;

  @Column({ name: 'gueltig_ab', type: 'date', nullable: false })
  gueltigAb: string;

  @Column({ name: 'organisation_id', nullable: true })
  organisationId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;
}
