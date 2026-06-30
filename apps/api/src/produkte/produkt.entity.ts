import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('produkt')
export class Produkt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  energie: string;

  @Column({ type: 'boolean', default: false })
  bestand: boolean;
}
