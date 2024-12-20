import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaLibrary } from './media-library.entity';
import { MediaItem } from './media-item.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaLibrary, MediaItem]),
    AuthModule, // To protect media routes with authentication
  ],
  providers: [MediaService],
  controllers: [MediaController],
})
export class MediaModule {}
