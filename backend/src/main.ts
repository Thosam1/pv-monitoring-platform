import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Server } from 'node:http';

const app = await NestFactory.create(AppModule);

// Enable CORS for frontend communication
app.enableCors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
});

// Increase server timeout for large file uploads (5 minutes)
const server = app.getHttpServer() as Server;
server.setTimeout(300000);

await app.listen(process.env.PORT ?? 3000);
