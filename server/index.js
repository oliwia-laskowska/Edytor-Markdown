import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', router);
app.use(express.static(path.join(__dirname, '../client')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.listen(PORT, () => console.log(`Etap 3: http://localhost:${PORT}`));
