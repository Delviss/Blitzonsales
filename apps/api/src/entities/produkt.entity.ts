import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('produkt')
export class Produkt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false })
  energie: string;

  @Column({ default: false })
  bestand: boolean;
}
