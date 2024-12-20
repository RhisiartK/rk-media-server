// src/media/media-item.entity.ts

import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MediaLibrary } from './media-library.entity';

@Entity()
export class MediaItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  filename: string;

  @Column()
  filepath: string;

  @Column('bigint')
  size: number;

  @Column({ type: 'text', nullable: true }) // Allow null values and specify type
  duration: string | null; // e.g., "01:30:00" or null

  @ManyToOne(() => MediaLibrary, (library) => library.mediaItems)
  library: MediaLibrary;
}
