import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { store } from './store.js';
import { parseWsUser } from './auth.js';
import { applyOperation, transformOperation } from './ot.js';

// Mapa przechowująca aktywne pokoje dokumentów (Klucz: documentId, Wartość: Set z połączeniami WS)
const rooms = new Map();
// Historia ostatnich operacji tekstowych do transformacji konfliktów (Klucz: documentId, Wartość: Array operacji)
const recentOps = new Map();

// Pomocnicza funkcja do bezpiecznego wysyłania danych JSON do pojedynczego klienta
const send = (ws, data) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(data));

// Rozsyła wiadomość do wszystkich użytkowników w danym pokoju (opcjonalnie z pominięciem nadawcy)
function broadcast(documentId, data, except) {
    for (const client of rooms.get(documentId) || []) if (client !== except) send(client, data);
}

// Zwraca uproszczoną listę zalogowanych użytkowników aktualnie przeglądających dany dokument
function roomUsers(documentId) {
    return [...(rooms.get(documentId) || [])].map(c => ({ id: c.user.id, username: c.user.username, role: c.user.role }));
}

// Sprawdza w bazie danych, czy użytkownik ma uprawnienia do wejścia do dokumentu
const canAccess = (user, doc) => store.hasDocumentAccess(user, doc);

export function attachWebSocket(server) {
    // Inicjalizacja serwera WebSocket na dedykowanej ścieżce /ws
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, 'http://localhost');
        // Ekstrakcja tokenu uwierzytelniającego oraz ID dokumentu z parametrów URL
        const user = parseWsUser(url.searchParams.get('token'));
        const documentId = url.searchParams.get('documentId');
        const doc = store.getDocument(documentId);

        // Autoryzacja: jeśli token jest zły lub brak praw dostępu, zamykamy połączenie
        if (!user || !canAccess(user, doc)) {
            send(ws, { type: 'error', message: 'Brak dostępu do WebSocket.' });
            ws.close();
            return;
        }

        // Przypisanie danych sesji bezpośrednio do obiektu połączenia
        ws.user = user;
        ws.documentId = documentId;

        // Rejestracja klienta w odpowiednim pokoju dokumentu
        if (!rooms.has(documentId)) rooms.set(documentId, new Set());
        rooms.get(documentId).add(ws);

        // Wysłanie danych startowych do nowo połączonego klienta (treść dokumentu + lista obecnych)
        send(ws, { type: 'init', document: doc, users: roomUsers(documentId) });
        // Powiadomienie pozostałych w pokoju, że ktoś dołączył
        broadcast(documentId, { type: 'presence', users: roomUsers(documentId) }, null);

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());

                // Obsługa ruchu kursorów (pozycja myszy/zaznaczenia w edytorze) – zwykły broadcast do innych
                if (msg.type === 'cursor') {
                    broadcast(documentId, { type: 'cursor', user, cursor: msg.cursor }, ws);
                    return;
                }

                if (msg.type !== 'operation') return; // Ignoruj nieznane typy wiadomości

                const current = store.getDocument(documentId);
                let op = msg.operation;
                const knownClock = Number(msg.clock || 0);
                const ops = recentOps.get(documentId) || [];

                // --- TRANSFORMCJA OPERACYJNA (OT) ---
                // Jeśli klient wysłał zmianę bazując na starszej wersji dokumentu (znany zegar < obecny),
                // transformujemy jego operację względem zmian, które w międzyczasie dotarły od innych.
                for (const remote of ops.filter(item => item.clock > knownClock)) {
                    op = transformOperation(op, remote.op);
                }

                // Zastosowanie przetransformowanej operacji na tekście i inkrementacja zegara logicznego
                const content = applyOperation(current.content, op);
                const clock = current.clock + 1;

                // Zapis nowej treści w pliku bazy danych
                store.applyContentUpdate(documentId, content, clock);

                // Dodanie operacji do historii najświeższych modyfikacji (ograniczenie do 100 wpisów)
                const stored = { id: nanoid(), op, clock, userId: user.id };
                recentOps.set(documentId, [...ops, stored].slice(-100));

                // Automatyczny punkt zapisu w historii wersji co 10 operacji lub na żądanie (forceVersion)
                if (clock % 10 === 0 || msg.forceVersion) {
                    store.addVersion(documentId, user.id, content, clock, 'Autosave WebSocket');
                }

                // Rozesłanie zmiany do pozostałych użytkowników
                broadcast(documentId, { type: 'operation', operation: op, clock, user }, ws);
                // Potwierdzenie (ACK) do nadawcy o pomyślnym przetworzeniu operacji
                send(ws, { type: 'ack', clock, content });

            } catch {
                send(ws, { type: 'error', message: 'Nieprawidłowa wiadomość WebSocket.' });
            }
        });

        // Sprzątanie po rozłączeniu się klienta
        ws.on('close', () => {
            rooms.get(documentId)?.delete(ws);
            // Aktualizacja listy obecności u osób, które zostały w pokoju
            broadcast(documentId, { type: 'presence', users: roomUsers(documentId) }, null);
        });
    });
}