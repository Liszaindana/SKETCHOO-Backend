import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createApplication } from '../src/bootstrap.js';

let application: Promise<INestApplication> | undefined;

async function getApplication() {
  application ??= createApplication().then(async (app) => {
    await app.init();
    return app;
  });
  return application;
}

export default async function handler(request: Request, response: Response) {
  const app = await getApplication();
  return app.getHttpAdapter().getInstance()(request, response);
}
