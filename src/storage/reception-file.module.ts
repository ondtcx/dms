import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceptionFilePolicy } from './reception-file.policy';

@Module({
  providers: [
    PrismaService,
    {
      provide: ReceptionFilePolicy,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new ReceptionFilePolicy(prisma),
    },
  ],
  exports: [ReceptionFilePolicy],
})
export class ReceptionFileModule {}
