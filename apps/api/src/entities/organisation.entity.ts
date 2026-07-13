import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';

@Entity('organisation')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  name: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Organisation, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Organisation | null;

  @Column({ nullable: true })
  typ: string | null;

  // --- I-04 · Fachkonzept ch. 3 / 4.1 master-data extension ---

  /** blitzon_direct / internal / partner. See OrgType. */
  @Column({ name: 'org_typ', nullable: true })
  orgTyp: string | null;

  /** Partner compensation model (free text / keyed config reference). */
  @Column({ name: 'partner_verguetungsmodell', nullable: true })
  partnerVerguetungsmodell: string | null;
}
