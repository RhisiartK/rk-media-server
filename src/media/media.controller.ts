import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FastifyRequest } from 'fastify';

export interface MultipartRequestBody {
  files: Array<{
    fieldname: string;
    filename: string;
    encoding: string;
    mimetype: string;
    data: Buffer;
    // Add other properties if necessary
  }>;
  // Include other form fields if your form includes them
}

@Controller('api/media')
@UseGuards(JwtAuthGuard) // Protect all routes in this controller
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // Add a new media library
  @Post('libraries')
  async addLibrary(@Body() body: { name: string; path: string }) {
    const library = await this.mediaService.createLibrary(body.name, body.path);
    return { message: 'Media library added successfully', library };
  }

  // Get all media libraries
  @Get('libraries')
  async getAllLibraries() {
    const libraries = await this.mediaService.getAllLibraries();
    return { libraries };
  }

  // Delete a media library
  @Delete('libraries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLibrary(@Param('id', ParseIntPipe) id: number) {
    await this.mediaService.deleteLibrary(id);
  }

  /**
   * GET /api/media/directories
   * Query Parameters:
   * - path: string (optional) - Absolute or relative path
   *
   * Returns a list of subdirectories within the specified path.
   */
  @Get('directories')
  async getDirectories(@Query('path') path: string = '') {
    try {
      const directories = await this.mediaService.getSubdirectories(path);
      return { directories };
    } catch (error) {
      throw new HttpException(
        error.message,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/media/movies
   * Query Parameters:
   * - path: string (optional) - Absolute or relative path
   *
   * Returns a list of scannable movies within the specified directory.
   */
  @Get('movies')
  async getMovies(@Query('path') path: string = '') {
    try {
      const movies = await this.mediaService.getScannableMovies(path);
      return { movies };
    } catch (error) {
      throw new HttpException(
        error.message,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('upload')
  async uploadDirectory(
    @Req() request: FastifyRequest,
    @Query('libraryId') libraryId: number,
  ) {
    try {
      if (!libraryId) {
        throw new HttpException(
          'libraryId query parameter is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Type assertion here
      const body = request.body as MultipartRequestBody;
      const files = body.files;

      if (!files || files.length === 0) {
        throw new HttpException('No files uploaded.', HttpStatus.BAD_REQUEST);
      }

      await this.mediaService.processUploadedFiles(files, libraryId);
      return { message: 'Directory uploaded and processed successfully.' };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * POST /api/media/scan
   * Query Parameters:
   * - libraryId: number
   *
   * Initiates scanning of the specified media library.
   */
  @Post('scan')
  async scanLibrary(@Query('libraryId') libraryId: number) {
    try {
      if (!libraryId) {
        throw new HttpException(
          'libraryId query parameter is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.mediaService.scanLibrary(libraryId);
      return { message: 'Media library scanned successfully.' };
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      error.message || 'Internal server error',
      error.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
