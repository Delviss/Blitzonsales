import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Organisation } from '../organisationen/organisation.entity';

@Entity('app_user')
export class AppUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text' })
  password_hash: string;

  @Column({ type: 'text' })
  rolle: string;

  @Column({ type: 'uuid', nullable: true })
  organisation_id: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'organisation_id' })
  organisation: Organisation | null;

  @Column({ type: 'text', nullable: true })
  twofa_secret: string | null;

  @Column({ type: 'boolean', default: false })
  twofa_enabled: boolean;
}
