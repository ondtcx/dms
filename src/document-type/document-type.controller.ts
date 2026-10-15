import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';
import { RequirePermission } from '../auth/decorators/permission.decorator';

@ApiTags('document-types')
@ApiBearerAuth('JWT-auth')
@Controller('document-types')
export class DocumentTypeController {
  constructor(private readonly documentTypeService: DocumentTypeService) {}

  @Post()
  @RequirePermission('document-types.manage')
  @ApiOperation({ summary: 'Crear un nuevo tipo de documento' })
  @ApiResponse({ status: 201, description: 'Tipo creado correctamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un tipo con ese nombre en la categoría',
  })
  create(@Body() dto: CreateDocumentTypeDto) {
    return this.documentTypeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los tipos de documento' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Filtrar por categoría',
  })
  @ApiResponse({ status: 200, description: 'Lista de tipos' })
  findAll(@Query('categoryId') categoryId?: string) {
    return this.documentTypeService.findAll(
      categoryId ? +categoryId : undefined,
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar tipos activos' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Filtrar por categoría',
  })
  @ApiResponse({ status: 200, description: 'Lista de tipos activos' })
  findActive(@Query('categoryId') categoryId?: string) {
    return this.documentTypeService.findActive(
      categoryId ? +categoryId : undefined,
    );
  }

  @Get('default')
  @ApiOperation({ summary: 'Obtener el tipo predeterminado activo' })
  @ApiResponse({ status: 200, description: 'Tipo predeterminado activo o null' })
  findDefault() {
    return this.documentTypeService.findDefault();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un tipo de documento por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Tipo encontrado' })
  @ApiResponse({ status: 404, description: 'Tipo no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.documentTypeService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('document-types.manage')
  @ApiOperation({ summary: 'Actualizar un tipo de documento' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Tipo actualizado correctamente',
  })
  @ApiResponse({ status: 404, description: 'Tipo no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.documentTypeService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('document-types.manage')
  @ApiOperation({ summary: 'Eliminar un tipo de documento' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Tipo eliminado correctamente' })
  @ApiResponse({
    status: 400,
    description: 'No se puede eliminar por tener documentos asociados',
  })
  @ApiResponse({ status: 404, description: 'Tipo no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.documentTypeService.remove(id);
  }
}
