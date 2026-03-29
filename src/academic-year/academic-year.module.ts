import { Module } from '@nestjs/common';
import { AcademicYearController } from './academic-year.controller';
import { AcademicYearService } from './academic-year.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AcademicYearController],
  providers: [AcademicYearService, PrismaService],
  exports: [AcademicYearService],
})
export class AcademicYearModule {}
