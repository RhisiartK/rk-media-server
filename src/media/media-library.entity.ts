import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MediaItem } from './media-item.entity';

@Entity()
export class MediaLibrary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column()
  path: string;

  @OneToMany(() => MediaItem, (mediaItem) => mediaItem.library, {
    cascade: true,
  })
  mediaItems: MediaItem[];
}
