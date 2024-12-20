// src/auth/auth.controller.ts

import {
  Body,
  Controller,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import { RequestWithUser } from './models/request-with-user.interface';
import { Throttle } from '@nestjs/throttler';

@Controller('api/auth')
// Removed @UseGuards(JwtAuthGuard) to allow public access to signup and signin
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  /**
   * Sign-Up Endpoint
   * This endpoint is now publicly accessible without requiring a JWT.
   */
  @Post('signup')
  async signUp(@Body() body: { username: string; password: string }) {
    try {
      const user = await this.authService.signUp(body.username, body.password);
      return { message: 'User created', user: { username: user.username } };
    } catch (error) {
      // Handle specific errors if necessary
      throw error;
    }
  }

  /**
   * Sign-In Endpoint
   * Protected by AuthGuard('local') to validate user credentials.
   * Throttled to prevent brute-force attacks.
   */
  @UseGuards(AuthGuard('local'))
  @Throttle({
    default: {
      limit: 5, // Maximum of 5 attempts
      ttl: 60, // Within 60 seconds
    },
  })
  @Post('signin')
  async signIn(@Request() req: RequestWithUser) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const payload = { username: user.username, sub: user.id };
    const token = this.jwtService.sign(payload);
    return { access_token: token };
  }
}
