import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { AppUser } from './app-user.entity';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ nullable: true })
  aktion: string | null;

  @Column({ type: 'jsonb', nullable: true })
  alt: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  neu: Record<string, any> | null;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: AppUser | null;

  @CreateDateColumn({ name: 'zeitpunkt', type: 'timestamptz' })
  zeitpunkt: Date;
}
