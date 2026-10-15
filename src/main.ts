import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ReceptionFilePolicy } from './storage/reception-file.policy';
import { installReceptionFileProtection } from './storage/reception-file.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Permite que OnApplicationShutdown detenga y limpie trabajos OCR en curso.
  app.enableShutdownHooks();
  // Antes de init/listen y del registro estático; el prefijo API no protege /files.
  installReceptionFileProtection(app, app.get(ReceptionFilePolicy));
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [
      'http://localhost:3000', // frontend
      'http://localhost:8080', // OnlyOffice
      'http://host.docker.internal', // OnlyOffice desde Docker
      'http://host.docker.internal:3001',
    ],

    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      enableDebugMessages: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('Documentación completa de la API del sistema de gestión')
    .setVersion('1.0')
    .addTag('auth', 'Endpoints de autenticación')
    .addTag('users', 'Gestión de usuarios')
    .addTag('documents', 'Gestión de documentos')
    .addTag('document-templates', 'Gestión de plantillas de documentos')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Ingresa tu token JWT',
        in: 'header',
      },
      'JWT-auth', // Este nombre se usará en los decoradores
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'API Docs',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
    ],
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.css',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.css',
    ],
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `🚀 Aplicación corriendo en: ${
      process.env.API_URL ?? 'http://localhost:3000'
    }`,
  );
  console.log(
    `📚 Documentación disponible en: ${process.env.API_URL ?? 'http://localhost:3000'}/api/docs`,
  );
}
bootstrap();
