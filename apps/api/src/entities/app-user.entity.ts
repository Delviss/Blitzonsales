import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Organisation } from './organisation.entity';
import { SalesRep } from './sales-rep.entity';

@Entity('app_user')
export class AppUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: false })
  email: string;

  @Column({ nullable: false })
  password: string;

  @Column({ nullable: false })
  rolle: string;

  @Column({ name: 'organisation_id', nullable: true })
  organisationId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ name: 'rep_id', nullable: true })
  repId: string | null;

  @ManyToOne(() => SalesRep, { nullable: true })
  @JoinColumn({ name: 'rep_id' })
  rep: SalesRep | null;

  @Column({ name: 'twofa_secret', nullable: true })
  twofaSecret: string | null;

  @Column({ name: 'twofa_enabled', default: false })
  twofaEnabled: boolean;
}
