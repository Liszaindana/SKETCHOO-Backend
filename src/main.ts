import { createApplication } from './bootstrap.js';

async function bootstrap() {
  const app = await createApplication();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

await bootstrap();
