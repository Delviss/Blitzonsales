import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Organisation } from './organisation.entity';
import { AppUser } from './app-user.entity';

@Entity('commission_run')
export class CommissionRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  periode: string;

  @Column({ name: 'organisation_id', nullable: true })
  organisationId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ default: 'entwurf' })
  status: string;

  @Column({ name: 'freigegeben_von', nullable: true })
  freigegebenVon: string | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'freigegeben_von' })
  freigegebenVonUser: AppUser | null;

  @Column({ name: 'freigegeben_am', type: 'timestamptz', nullable: true })
  freigegebenAm: Date | null;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser: AppUser | null;
}
