import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter();

  // Register the @fastify/multipart plugin
  fastifyAdapter.register(fastifyMultipart, {
    addToBody: true, // Adds parsed files to request.body.files
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB file size limit
      files: 100, // Maximum number of files
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );
  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `Media server running on http://localhost:${process.env.PORT ?? 3000}`,
  );
}

bootstrap();
