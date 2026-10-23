import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { SchoolsModule } from './schools/schools.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

const observeEnabled = Boolean(
  process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET,
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    SchoolsModule,
    ...(observeEnabled
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY!,
            appSecret: process.env.OBSERVE_APP_SECRET!,
            serviceId: process.env.OBSERVE_SERVICE_ID ?? 'sketchoo-backend-v2',
          }),
        ]
      : []),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
