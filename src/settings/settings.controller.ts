import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { extname } from 'path';
import { SettingsService } from './settings.service';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { UpdateDocumentsDto } from './dto/update-documents.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener configuración del sistema' })
  @ApiResponse({ status: 200, description: 'Configuración actual del sistema' })
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch('institution')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar datos de la institución' })
  @ApiResponse({
    status: 200,
    description: 'Datos de institución actualizados',
  })
  updateInstitution(@Body() dto: UpdateInstitutionDto) {
    return this.settingsService.updateInstitution(dto);
  }

  @Post('institution/logo')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Subir logo de la institución' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/temp',
        filename: (_req, file, cb) => {
          cb(null, `logo_tmp_${Date.now()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp|svg\+xml)$/)) {
          return cb(
            new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP, SVG)'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  updateLogo(@UploadedFile() file: Express.Multer.File) {
    return this.settingsService.updateLogo(file);
  }

  @Patch('school-year')
  @Roles(UserRole.ADMIN, UserRole.RECTOR)
  @ApiOperation({ summary: 'Actualizar ciclo escolar' })
  @ApiResponse({ status: 200, description: 'Ciclo escolar actualizado' })
  updateSchoolYear(@Body() dto: UpdateSchoolYearDto) {
    return this.settingsService.updateSchoolYear(dto);
  }

  @Patch('appearance')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuración de apariencia' })
  @ApiResponse({ status: 200, description: 'Apariencia actualizada' })
  updateAppearance(@Body() dto: UpdateAppearanceDto) {
    return this.settingsService.updateAppearance(dto);
  }

  @Patch('documents')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuración de documentos' })
  @ApiResponse({
    status: 200,
    description: 'Configuración de documentos actualizada',
  })
  updateDocuments(@Body() dto: UpdateDocumentsDto) {
    return this.settingsService.updateDocuments(dto);
  }

  @Patch('notifications')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuración de notificaciones' })
  @ApiResponse({
    status: 200,
    description: 'Configuración de notificaciones actualizada',
  })
  updateNotifications(@Body() dto: UpdateNotificationsDto) {
    return this.settingsService.updateNotifications(dto);
  }

  @Patch('security')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuración de seguridad' })
  @ApiResponse({
    status: 200,
    description: 'Configuración de seguridad actualizada',
  })
  updateSecurity(@Body() dto: UpdateSecurityDto) {
    return this.settingsService.updateSecurity(dto);
  }
}
