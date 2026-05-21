export class CollaborationSocket {
    // Inicjalizacja klienta WebSocket, mapowanie zależności UI i magazynu danych oraz przygotowanie flag stanu sieci
    constructor(storage, ui) {
        this.storage = storage;          // Magazyn lokalny przechowujący tokeny oraz kolejki zmian offline
        this.ui = ui;                    // Interfejs użytkownika do aktualizacji etykiet statusowych i powiadomień
        this.ws = null;                  // Referencja do aktywnej instancji natywnego obiektu WebSocket
        this.documentId = null;          // Identyfikator aktualnie subskrybowanego dokumentu (pokoju)
        this.handlers = new Map();       // Rejestr callbacków przypisanych do konkretnych typów wiadomości (np. 'operation', 'cursor')
        this.reconnectAttempt = 0;       // Licznik kolejnych, nieudanych prób automatycznego reconnectu
        this.manualClose = false;        // Flaga zabezpieczająca przed ponownym łączeniem po świadomym wylogowaniu
        this.lastOfflineToastAt = 0;     // Znacznik czasu ograniczający natężenie powtarzających się komunikatów o błędach sieci
    }

    // Rejestruje funkcję obsługującą dany typ pakietu przychodzącego z serwera
    on(type, handler) { this.handlers.set(type, handler); }

    // Ręczne, lokalne wywołanie zarejestrowanego handlera (używane w testach lub synchronizacji wewnętrznej)
    emitLocal(type, data) { this.handlers.get(type)?.(data); }

    // Inicjuje bezpieczne lub standardowe połączenie z serwerem WebSocket dla konkretnego pliku
    connect(documentId) {
        this.close(false); // Zamknięcie poprzedniego połączenia bez czyszczenia identyfikatora dokumentu
        this.manualClose = false;
        this.documentId = documentId;

        // Dynamiczne dopasowanie protokołu gniazda (ws lub wss) do aktualnego protokołu aplikacji (http lub https)
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        // Konstrukcja adresu URL z przekazaniem tokenu JWT oraz ID dokumentu w parametrach zapytania (Query String)
        const url = `${protocol}://${location.host}/ws?token=${encodeURIComponent(this.storage.token)}&documentId=${encodeURIComponent(documentId)}`;

        this.ws = new WebSocket(url);
        this.ui.status('łączenie', 'warning');

        // Zdarzenie 1: Pomyślne ustanowienie kanału komunikacyjnego
        this.ws.addEventListener('open', () => {
            this.reconnectAttempt = 0; // Reset licznika prób po udanym połączeniu
            this.ui.status('online', 'success');
            this.flushQueue(); // Natychmiastowe opróżnienie bufora operacji zebranych w trybie offline
        });

        // Zdarzenie 2: Odebranie nowej wiadomości tekstowej z serwera i przekazanie jej do odpowiedniego handlera
        this.ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            this.handlers.get(msg.type)?.(msg);
        });

        // Zdarzenie 3: Zerwanie połączenia (np. restart serwera, błąd sieci przełączenia stacji bazowej)
        this.ws.addEventListener('close', () => {
            this.ui.status('offline', 'secondary');
            // Uruchomienie procedury reconnectu tylko wtedy, gdy rozłączenie nie było intencjonalne
            if (!this.manualClose && this.documentId) this.scheduleReconnect();
        });

        // Zdarzenie 4: Wystąpienie błędu sieciowego gniazda
        this.ws.addEventListener('error', () => {
            this.ui.status('błąd WS', 'danger');
            const now = Date.now();
            // Throttling powiadomień: dymek błędu pojawi się maksymalnie raz na 8 sekund, by nie frustrować użytkownika
            if (now - this.lastOfflineToastAt > 8000) {
                this.lastOfflineToastAt = now;
                this.ui.toast('Połączenie WebSocket niedostępne. Zmiany będą buforowane.', 'warning');
            }
        });
    }

    // Planuje kolejną próbę połączenia z wykorzystaniem algorytmu wykładniczego cofania (Exponential Backoff)
    scheduleReconnect() {
        if (!this.documentId || this.manualClose) return;
        // Obliczenie opóźnienia: każda próba podwaja czas oczekiwania (500ms, 1s, 2s, 4s...), maksymalnie do 30 sekund
        const delay = Math.min(30000, 500 * 2 ** this.reconnectAttempt++);
        setTimeout(() => {
            if (!this.manualClose && this.documentId) this.connect(this.documentId);
        }, delay);
    }

    // Wysyła pakiet danych na serwer, a w przypadku braku sieci zabezpiecza go w lokalnym buforze
    send(message) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else if (message.type === 'operation' && this.documentId) {
            // Jeśli sieć nie działa, mutacje edytora trafiają do IndexedDB/LocalStorage, zapobiegając utracie pracy
            this.storage.pushQueuedOperation(this.documentId, message);
        }
    }

    // Pobiera i przesyła serwerowi operacje wykonane przez użytkownika w czasie, gdy nie miał połączenia z siecią
    flushQueue() {
        const queue = this.storage.getQueue(this.documentId);
        queue.forEach((message) => this.send(message));
        if (queue.length) {
            this.ui.toast(`Zsynchronizowano ${queue.length} zmian offline.`, 'success');
        }
        this.storage.clearQueue(this.documentId); // Wyczyszczenie wysłanej kolejki z pamięci podręcznej
    }

    // Zamknięcie aktywnego połączenia WebSocket i zatrzymanie wszelkich pętli automatycznego reconnectu
    close(clearDocument = true) {
        this.manualClose = true;
        if (this.ws) {
            this.ws.onclose = null; // Usunięcie listenera, aby wywołanie .close() nie triggerowało algorytmu scheduleReconnect
            this.ws.close();
        }
        this.ws = null;
        if (clearDocument) this.documentId = null;
    }
}