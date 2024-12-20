import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './auth/user.entity';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MediaModule } from './media/media.module';
import { MediaLibrary } from './media/media-library.entity';
import { MediaItem } from './media/media-item.entity';
import { APP_FILTER } from '@nestjs/core';
import { NotFoundExceptionFilter } from './common/filters/not-found-exception.filter';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        MEDIA_SUBDIR: Joi.string().default('Media'),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRATION: Joi.string().default('3600s'),
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(
        __dirname,
        '..',
        '..',
        'rk-media-server-ui',
        'dist',
        'rk-media-server-ui',
        'browser',
      ),
      exclude: ['/api*'],
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'database.sqlite',
      entities: [User, MediaLibrary, MediaItem],
      synchronize: true, // For dev only
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60, // time window in seconds
        limit: 10, // max requests within time window
      },
    ]),
    AuthModule,
    MediaModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: NotFoundExceptionFilter,
    },
  ],
})
export class AppModule {}
