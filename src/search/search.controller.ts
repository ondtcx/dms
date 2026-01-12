import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Búsqueda avanzada de documentos con full-text search' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  search(@Request() req, @Query() searchDto: SearchQueryDto) {
    return this.searchService.search(req.user.id, searchDto);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Obtener sugerencias de autocompletado' })
  @ApiQuery({ name: 'q', description: 'Término de búsqueda', required: true })
  @ApiQuery({ name: 'limit', description: 'Número máximo de sugerencias', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de sugerencias' })
  getSuggestions(
    @Query('q') query: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.searchService.getSuggestions(query, limit);
  }

  @Get('history')
  @ApiOperation({ summary: 'Obtener historial de búsquedas del usuario' })
  @ApiQuery({ name: 'limit', description: 'Número máximo de resultados', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Historial de búsqueda' })
  getHistory(
    @Request() req,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.searchService.getSearchHistory(req.user.id, limit);
  }

  @Delete('history')
  @ApiOperation({ summary: 'Limpiar historial de búsquedas del usuario' })
  @ApiResponse({ status: 200, description: 'Historial eliminado' })
  clearHistory(@Request() req) {
    return this.searchService.clearSearchHistory(req.user.id);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Obtener búsquedas populares (últimos 30 días)' })
  @ApiQuery({ name: 'limit', description: 'Número máximo de resultados', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Búsquedas populares' })
  getPopular(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.searchService.getPopularSearches(limit);
  }
}
