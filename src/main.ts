import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(
    AppModule,
    process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
      ? { instrument: ObserveInstrument }
      : {},
  );

  app.setGlobalPrefix(process.env.API_V1_PREFIX ?? 'api/v1', {
    exclude: ['health'],
  });
  app.enableShutdownHooks();
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) =>
        new UnprocessableEntityException(
          errors.flatMap((error) => Object.values(error.constraints ?? {})),
        ),
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SKETCHOO API')
    .setDescription(
      'REST API untuk platform pembelajaran interaktif SKETCHOO.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

function validateEnvironment() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const prefix = process.env.API_V1_PREFIX ?? 'api/v1';
  if (prefix.startsWith('/') || prefix.endsWith('/')) {
    throw new Error('API_V1_PREFIX must not start or end with a slash');
  }

  if (Boolean(process.env.OBSERVE_APP_KEY) !== Boolean(process.env.OBSERVE_APP_SECRET)) {
    throw new Error('OBSERVE_APP_KEY and OBSERVE_APP_SECRET must be configured together');
  }
}

await bootstrap();
