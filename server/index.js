import 'dotenv/config'; // Automatycznie ładuje zmienne środowiskowe z pliku .env do process.env
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './routes.js';
import './store.js'; // Inicjalizacja instancji bazy danych (JsonStore)
import { attachWebSocket } from './ws.js';

// Odpowiednik __filename i __dirname w środowisku ES Modules (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Rejestracja globalnych mechanizmów middleware
app.use(cors()); // Zezwolenie na zapytania Cross-Origin (CORS)
app.use(express.json({ limit: '2mb' })); // Parsowanie body żądań do formatu JSON z limitem rozmiaru do 2MB

// Podłączenie endpointów API
app.use('/api', router);

// Serwowanie statycznych plików frontendowych z katalogu 'client'
app.use(express.static(path.join(__dirname, '../client')));

// Obsługa routingu SPA (Single Page Application) – każde niepasujące żądanie zwraca główny plik index.html
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../client/index.html')));

// Utworzenie serwera HTTP na bazie aplikacji Express i podpięcie protokołu WebSocket
const server = http.createServer(app);
attachWebSocket(server);

// Uruchomienie serwera na wskazanym porcie
server.listen(PORT, () => console.log(`Markdown Collab Editor: http://localhost:${PORT}`));