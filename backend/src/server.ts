import { buildApp } from './app.js';
import { loadConfig } from './config/index.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  try {
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`Arth backend service started successfully on ${address}`);
  } catch (err) {
    console.error('Fatal error starting Arth backend service:', err);
    process.exit(1);
  }
}

start();
