import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createAuth } from './core/auth.js';
import { createDb } from './core/db.js';
import { createStorage } from './core/storage.js';

dotenv.config();

const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
};

const db = createDb({ connectionString: process.env.DATABASE_URL });
const auth = createAuth({ env: config.env, db });
const storage = createStorage(process.env);
const app = await createApp({ db, auth, storage, config });

app.listen(config.port, () => {
  console.log(`cafestudy API listening on ${config.port}`);
});
