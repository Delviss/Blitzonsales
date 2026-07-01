import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AppUser } from '../app-users/app-user.entity';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  entity: string;

  @Column({ type: 'uuid', nullable: true })
  entity_id: string | null;

  @Column({ type: 'text' })
  aktion: string;

  @Column({ type: 'jsonb', nullable: true })
  alt: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  neu: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: AppUser | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  zeitpunkt: Date;
}
