import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { join } from 'path';
import { readFileSync } from 'fs';

@Catch(NotFoundException)
export class NotFoundExceptionFilter implements ExceptionFilter {
  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    const indexPath = join(
      __dirname,
      '..',
      '..',
      'rk-media-server-ui',
      'dist',
      'rk-media-server-ui',
      'browser',
      'index.html',
    );
    const index = readFileSync(indexPath, 'utf-8');

    response.status(200).type('text/html').send(index);
  }
}
