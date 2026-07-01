import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('organisation')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @ManyToOne(() => Organisation, (o) => o.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Organisation | null;

  @OneToMany(() => Organisation, (o) => o.parent)
  children: Organisation[];

  @Column({ type: 'text' })
  typ: string;
}
