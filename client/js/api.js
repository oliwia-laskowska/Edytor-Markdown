export class ApiClient {
    // Inicjalizuje klienta API, przyjmując obiekt magazynu danych (np. stan aplikacji ze strukturą tokenu)
    constructor(storage) { this.storage = storage; this.base = '/api'; }

    // Centralna metoda wykonująca żądania HTTP, automatyzująca obsługę nagłówków i błędów
    async request(path, options = {}) {
        // Domyślny nagłówek dla danych w formacie JSON, rozszerzany o ewentualne niestandardowe nagłówki
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

        // Jeśli w magazynie znajduje się token JWT, jest on automatycznie dołączany do autoryzacji żądania
        if (this.storage.token) headers.Authorization = `Bearer ${this.storage.token}`;

        // Wykonanie niskopoziomowego zapytania fetch do serwera
        const response = await fetch(`${this.base}${path}`, { ...options, headers });
        const text = await response.text();

        // Bezpieczne parsowanie odpowiedzi tekstowej do obiektu JSON (lub pustego obiektu, jeśli brak body)
        const data = text ? JSON.parse(text) : {};

        // Rzucenie wyjątku z komunikatem błędu z serwera lub kodem statusu HTTP w przypadku niepowodzenia
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

        return data;
    }

    // --- Sekcja Autoryzacji ---

    // Autoryzuje użytkownika (login/email i hasło) i zwraca token oraz dane profilu
    login(payload) { return this.request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }); }

    // Rejestruje nowe konto standardowego użytkownika w systemie
    register(payload) { return this.request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }); }

    // --- Sekcja Zarządzania Dokumentami (CRUD) ---

    // Pobiera listę wszystkich dokumentów, do których zalogowany użytkownik ma dostęp
    documents() { return this.request('/documents'); }

    // Tworzy nowy dokument tekstowy o zadanym tytule
    createDocument(payload) { return this.request('/documents', { method: 'POST', body: JSON.stringify(payload) }); }

    // Aktualizuje treść lub tytuł istniejącego dokumentu na serwerze
    updateDocument(id, payload) { return this.request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); }

    // Bezpowrotnie usuwa wskazany dokument z bazy danych
    deleteDocument(id) { return this.request(`/documents/${id}`, { method: 'DELETE' }); }

    // --- Sekcja Historii Wersji ---

    // Pobiera pełną listę zapisanych punktów przywracania (wersji archiwalnych) dla danego pliku
    versions(id) { return this.request(`/documents/${id}/versions`); }

    // Przywraca treść dokumentu do stanu ze wskazanej wersji historycznej
    restore(id, versionId) { return this.request(`/documents/${id}/versions/${versionId}/restore`, { method: 'POST' }); }

    // --- Sekcja Panelu Administracyjnego ---

    // Pobiera listę wszystkich zarejestrowanych użytkowników systemu (na potrzeby selektorów lub zarządzania)
    users() { return this.request('/users'); }

    // Tworzy nowego użytkownika z uprawnieniami administratora (wymaga roli admina)
    createAdmin(payload) { return this.request('/admin/users', { method: 'POST', body: JSON.stringify(payload) }); }

    // Modyfikuje rolę określonego użytkownika (np. nadanie lub odebranie uprawnień admina)
    setUserRole(id, role) { return this.request(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); }

    // --- Sekcja Kontroli Dostępu (ACL) ---

    // Pobiera listę osób posiadających nadane uprawnienia współdzielenia do wskazanego dokumentu
    access(id) { return this.request(`/documents/${id}/access`); }

    // Nadaje wybranemu użytkownikowi prawa dostępu do dokumentu
    grantAccess(id, userId) { return this.request(`/documents/${id}/access`, { method: 'POST', body: JSON.stringify({ userId }) }); }

    // Cofa uprawnienia dostępu do dokumentu wybranemu użytkownikowi
    revokeAccess(id, userId) { return this.request(`/documents/${id}/access/${userId}`, { method: 'DELETE' }); }
}