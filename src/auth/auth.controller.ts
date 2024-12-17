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

@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  @Post('signup')
  async signUp(@Body() body: { username: string; password: string }) {
    const user = await this.authService.signUp(body.username, body.password);
    return { message: 'User created', user: { username: user.username } };
  }

  @UseGuards(AuthGuard('local'))
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
