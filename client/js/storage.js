export class StorageService {
    // Inicjalizuje serwis pamięci podręcznej, definiując przestrzeń nazw (prefiks) dla kluczy w localStorage
    constructor(prefix = 'md-collab') { this.prefix = prefix; }

    // Tworzy unikalny, jednoznaczny klucz tekstowy łącząc prefiks aplikacji z nazwą zmiennej
    key(name) { return `${this.prefix}:${name}`; }

    // --- Akcesory dla Tokenu JWT ---
    // Pobiera zakodowany token autoryzacyjny sesji z pamięci przeglądarki
    get token() { return localStorage.getItem(this.key('token')); }
    // Zapisuje token lub całkowicie go usuwa w przypadku przekazania wartości pustej (wylogowanie)
    set token(value) { value ? localStorage.setItem(this.key('token'), value) : localStorage.removeItem(this.key('token')); }

    // --- Akcesory dla Profilu Użytkownika ---
    // Pobiera i deserializuje z formatu tekstowego JSON obiekt profilu zalogowanego użytkownika
    get user() { return JSON.parse(localStorage.getItem(this.key('user')) || 'null'); }
    // Serializuje dane profilu do ciągu tekstowego i umieszcza w localStorage lub czyści wpis
    set user(value) { value ? localStorage.setItem(this.key('user'), JSON.stringify(value)) : localStorage.removeItem(this.key('user')); }

    // --- Zarządzanie Kolejką Synchronizacji Offline (Zdarzenia Edytora) ---

    // Zwraca tablicę operacji edycyjnych, które zostały wykonane w trybie offline dla danego dokumentu
    getQueue(documentId) { return JSON.parse(localStorage.getItem(this.key(`queue:${documentId}`)) || '[]'); }

    // Nadpisuje trwale stan kolejki zmian oczekujących na wysłanie na serwer dla wybranego pliku
    setQueue(documentId, queue) { localStorage.setItem(this.key(`queue:${documentId}`), JSON.stringify(queue)); }

    // Dopisuje nową atomową operację tekstową na koniec lokalnej kolejki zmian (immutowalny push)
    pushQueuedOperation(documentId, op) { this.setQueue(documentId, [...this.getQueue(documentId), op]); }

    // Czyści i usuwa całą kolejkę bufora po pomyślnym przesłaniu danych przez gniazdo sieciowe
    clearQueue(documentId) { localStorage.removeItem(this.key(`queue:${documentId}`)); }
}