import { FastifyRequest } from 'fastify';
import { User } from '../user.entity';

export interface RequestWithUser extends FastifyRequest {
  user: User;
}
