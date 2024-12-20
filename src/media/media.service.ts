import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaLibrary } from './media-library.entity';
import { MediaItem } from './media-item.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as ffprobe from 'ffprobe';
import * as ffprobeStatic from 'ffprobe-static';
import { FFProbeCustomResult } from './ffprobe-extended.interface';
import { ConfigService } from '@nestjs/config';
import sanitize from 'sanitize-filename';

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

export interface DirectoryNode {
  name: string;
  path: string;
  isDirectory: boolean;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly supportedExtensions = [
    '.mp4',
    '.mkv',
    '.avi',
    '.mov',
    '.flv',
  ];
  private readonly baseDir: string;

  constructor(
    @InjectRepository(MediaLibrary)
    private mediaLibraryRepository: Repository<MediaLibrary>,
    @InjectRepository(MediaItem)
    private mediaItemRepository: Repository<MediaItem>,
    private configService: ConfigService,
  ) {
    // Initialize baseDir with fallback
    const desiredBaseDir =
      this.configService.get<string>('MEDIA_SUBDIR') || 'Media';
    const userSpecifiedPath = path.isAbsolute(desiredBaseDir)
      ? desiredBaseDir
      : path.resolve(desiredBaseDir);

    const foundBaseDir = this.findExistingDir(userSpecifiedPath);

    if (foundBaseDir) {
      this.baseDir = foundBaseDir;
      this.logger.log(`Using base directory: ${this.baseDir}`);
    } else {
      throw new Error(
        `No valid base directory found starting from ${userSpecifiedPath} and moving upwards.`,
      );
    }
  }

  /**
   * Finds the nearest existing directory starting from startPath and moving upwards.
   * @param startPath - The initial directory path to check.
   * @returns The first existing directory path found, or null if none found.
   */
  private findExistingDir(startPath: string): string | null {
    let currentPath = path.resolve(startPath);

    while (true) {
      if (
        fs.existsSync(currentPath) &&
        fs.statSync(currentPath).isDirectory()
      ) {
        return currentPath;
      }

      const parentPath = path.dirname(currentPath);

      if (currentPath === parentPath) {
        // Reached the root without finding an existing directory
        break;
      }

      currentPath = parentPath;
    }

    return null;
  }

  // Create a new media library
  async createLibrary(name: string, pathStr: string): Promise<MediaLibrary> {
    // Validate and sanitize library name
    const sanitizedLibraryName = sanitize(name);
    if (sanitizedLibraryName !== name) {
      throw new BadRequestException('Invalid library name.');
    }

    // Check if library with the same name exists
    const existing = await this.mediaLibraryRepository.findOne({
      where: { name: sanitizedLibraryName },
    });
    if (existing) {
      throw new ConflictException(
        'Media library with this name already exists',
      );
    }

    // Resolve absolute path
    let absolutePath: string;
    if (path.isAbsolute(pathStr)) {
      absolutePath = pathStr;
    } else {
      absolutePath = path.resolve(this.baseDir, pathStr);
    }

    // Ensure the directory exists
    if (
      !fs.existsSync(absolutePath) ||
      !fs.statSync(absolutePath).isDirectory()
    ) {
      throw new NotFoundException(
        'The specified path does not exist or is not a directory',
      );
    }

    const library = this.mediaLibraryRepository.create({
      name: sanitizedLibraryName,
      path: absolutePath,
    });
    return this.mediaLibraryRepository.save(library);
  }

  // Get all media libraries
  async getAllLibraries(): Promise<MediaLibrary[]> {
    return this.mediaLibraryRepository.find({ relations: ['mediaItems'] });
  }

  // Delete a media library
  async deleteLibrary(id: number): Promise<void> {
    const library = await this.mediaLibraryRepository.findOne({
      where: { id },
    });
    if (!library) {
      throw new NotFoundException('Media library not found');
    }
    await this.mediaLibraryRepository.remove(library);
  }

  // Scan a directory for media files
  async scanLibrary(libraryId: number): Promise<void> {
    const library = await this.mediaLibraryRepository.findOne({
      where: { id: libraryId },
      relations: ['mediaItems'],
    });
    if (!library) {
      throw new NotFoundException('Media library not found');
    }

    const mediaItems: MediaItem[] = [];

    const traverseDirectory = async (dir: string) => {
      let files: string[];
      try {
        files = await readdir(dir);
      } catch (error) {
        this.logger.warn(`Cannot read directory ${dir}: ${error.message}`);
        return;
      }

      for (const file of files) {
        const filePath = path.join(dir, file);
        let fileStat: fs.Stats;
        try {
          fileStat = await stat(filePath);
        } catch (error) {
          this.logger.warn(`Cannot stat file ${filePath}: ${error.message}`);
          continue;
        }

        if (fileStat.isDirectory()) {
          await traverseDirectory(filePath);
        } else if (
          this.supportedExtensions.includes(path.extname(file).toLowerCase())
        ) {
          // Check if the media item already exists
          const existingItem = await this.mediaItemRepository.findOne({
            where: { filepath: filePath },
          });
          if (!existingItem) {
            // Get duration using ffprobe
            let duration: string | null = null;
            try {
              const probe = (await ffprobe(filePath, {
                path: ffprobeStatic.path,
              })) as FFProbeCustomResult;
              duration = probe.format?.duration
                ? this.secondsToHMS(parseFloat(probe.format.duration))
                : null;
            } catch (error) {
              this.logger.warn(
                `ffprobe failed for ${filePath}: ${error.message}`,
              );
            }

            const mediaItem = this.mediaItemRepository.create({
              filename: file,
              filepath: filePath,
              size: fileStat.size,
              duration, // Can be string or null
              library: library,
            });
            mediaItems.push(mediaItem);
          }
        }
      }
    };

    await traverseDirectory(library.path);

    if (mediaItems.length > 0) {
      await this.mediaItemRepository.save(mediaItems);
      this.logger.log(
        `Found and saved ${mediaItems.length} new media items in library "${library.name}"`,
      );
    } else {
      this.logger.log(`No new media items found in library "${library.name}"`);
    }
  }

  /**
   * Fetch subdirectories for a given directory path
   * @param currentPath - Absolute or relative path
   */
  async getSubdirectories(currentPath: string = ''): Promise<DirectoryNode[]> {
    let absolutePath: string;
    if (path.isAbsolute(currentPath)) {
      absolutePath = currentPath;
    } else {
      absolutePath = path.resolve(this.baseDir, currentPath);
    }

    // Ensure the path is a directory
    if (
      !fs.existsSync(absolutePath) ||
      !fs.statSync(absolutePath).isDirectory()
    ) {
      throw new NotFoundException('Directory does not exist.');
    }

    let items: fs.Dirent[];
    try {
      items = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      throw new ForbiddenException(`Cannot access directory: ${error.message}`);
    }

    const directories = items
      .filter((item) => item.isDirectory())
      .map((dir) => ({
        name: dir.name,
        path: path.join(currentPath, dir.name),
        isDirectory: true,
      }));

    return directories;
  }

  /**
   * Fetch scannable movies in a given directory path
   * @param directoryPath - Relative path from baseDir
   */
  async getScannableMovies(directoryPath: string = ''): Promise<any[]> {
    let absolutePath: string;
    if (path.isAbsolute(directoryPath)) {
      absolutePath = directoryPath;
    } else {
      absolutePath = path.resolve(this.baseDir, directoryPath);
    }

    // Ensure the path is a directory
    if (
      !fs.existsSync(absolutePath) ||
      !fs.statSync(absolutePath).isDirectory()
    ) {
      throw new NotFoundException('Directory does not exist.');
    }

    let items: fs.Dirent[];
    try {
      items = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      throw new ForbiddenException(`Cannot access directory: ${error.message}`);
    }

    const movies = items
      .filter(
        (item) =>
          item.isFile() &&
          this.supportedExtensions.includes(
            path.extname(item.name).toLowerCase(),
          ),
      )
      .map((file) => {
        const filePath = path.join(directoryPath, file.name);
        const absoluteFilePath = path.resolve(this.baseDir, filePath);
        let size = 0;
        try {
          const fileStat = fs.statSync(absoluteFilePath);
          size = fileStat.size;
        } catch (error) {
          this.logger.warn(
            `Cannot stat file ${absoluteFilePath}: ${error.message}`,
          );
        }

        return {
          name: file.name,
          path: filePath,
          size,
        };
      });

    return movies;
  }

  // Helper to convert seconds to HH:MM:SS
  private secondsToHMS(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [hours, minutes, seconds]
      .map((v) => v.toString().padStart(2, '0'))
      .join(':');
  }

  /**
   * Process uploaded files (if implementing file uploads)
   * @param files - Array of uploaded files
   */
  async processUploadedFiles(files: any[], libraryId: number): Promise<void> {
    const mediaItems: MediaItem[] = [];

    // Fetch the library to associate media items
    const library = await this.mediaLibraryRepository.findOne({
      where: { id: libraryId },
    });
    if (!library) {
      throw new NotFoundException('Media library not found');
    }

    for (const file of files) {
      let relativePath = file.filename; // Contains relative path if using webkitdirectory
      let absoluteFilePath = path.resolve(this.baseDir, relativePath);

      // Sanitize the relative path to prevent path traversal
      relativePath = path
        .normalize(relativePath)
        .replace(/^(\.\.(\/|\\|$))+/, '');
      absoluteFilePath = path.resolve(this.baseDir, relativePath);

      // Check if file already exists in the database
      const existingItem = await this.mediaItemRepository.findOne({
        where: { filepath: absoluteFilePath },
      });

      if (!existingItem) {
        // Ensure the directory exists before processing
        const fileDir = path.dirname(absoluteFilePath);
        if (!fs.existsSync(fileDir)) {
          // Implement fallback: find the nearest existing directory upwards
          const fallbackDir = this.findExistingDir(fileDir);
          if (fallbackDir) {
            this.logger.log(
              `Falling back to existing directory: ${fallbackDir}`,
            );
            absoluteFilePath = path.join(
              fallbackDir,
              path.basename(absoluteFilePath),
            );
            relativePath = path.relative(this.baseDir, absoluteFilePath);
          } else {
            this.logger.warn(
              `No valid directory found for file: ${absoluteFilePath}`,
            );
            continue; // Skip if no valid directory is found
          }
        }

        // Save the uploaded file to the filesystem
        try {
          await fs.promises.writeFile(absoluteFilePath, file.buffer);
          this.logger.log(`Saved file: ${absoluteFilePath}`);
        } catch (error) {
          this.logger.warn(
            `Failed to save file ${absoluteFilePath}: ${error.message}`,
          );
          continue;
        }

        // Get duration using ffprobe
        let duration: string | null = null;
        try {
          const probe = (await ffprobe(absoluteFilePath, {
            path: ffprobeStatic.path,
          })) as FFProbeCustomResult;
          duration = probe.format?.duration
            ? this.secondsToHMS(parseFloat(probe.format.duration))
            : null;
        } catch (error) {
          this.logger.warn(
            `ffprobe failed for ${absoluteFilePath}: ${error.message}`,
          );
        }

        const mediaItem = this.mediaItemRepository.create({
          filename: path.basename(file.name),
          filepath: absoluteFilePath,
          size: file.size,
          duration,
          library: library,
        });
        mediaItems.push(mediaItem);
      }
    }

    if (mediaItems.length > 0) {
      await this.mediaItemRepository.save(mediaItems);
      this.logger.log(
        `Processed and saved ${mediaItems.length} new media items.`,
      );
    } else {
      this.logger.log(`No new media items to process.`);
    }
  }
}
