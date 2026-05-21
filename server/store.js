import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

// Konfiguracja ścieżki do bazy danych opartej na pliku JSON
const DATA_DIR = 'server/data';
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// Zwraca strukturę czystej bazy danych dla nowego pliku
function blank() { return { users: [], documents: [], versions: [], document_access: [] }; }
// Pomocnicza funkcja generująca aktualny znacznik czasu w formacie ISO
function now() { return new Date().toISOString(); }

export class JsonStore {
    constructor(file = DATA_FILE) {
        this.file = file;
        // Upewnia się, że katalog dla pliku bazy danych istnieje
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // Tworzy pusty plik bazy danych, jeśli jeszcze nie istnieje
        if (!fs.existsSync(file)) this.write(blank());
        // Uruchamia migracje struktury danych i tworzy domyślnych użytkowników
        this.migrate();
        this.ensureSeedUsers();
    }

    // Odczytuje i parsuje dane z pliku JSON
    read() { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    // Zapisuje zaktualizowane dane do pliku JSON z formatowaniem (2 spacje)
    write(data) { fs.writeFileSync(this.file, JSON.stringify(data, null, 2)); }

    // Migruje strukturę bazy, upewniając się, że wszystkie tablice istnieją
    // oraz że właściciele dokumentów mają jawnie przyznane prawa 'owner'
    migrate() {
        const data = this.read();
        data.users ||= [];
        data.documents ||= [];
        data.versions ||= [];
        data.document_access ||= [];

        // Zapewnienie wpisów dostępowych dla właścicieli starych dokumentów
        for (const doc of data.documents) {
            if (!data.document_access.some(a => a.document_id === doc.id && a.user_id === doc.owner_id)) {
                data.document_access.push({ document_id: doc.id, user_id: doc.owner_id, role: 'owner', granted_at: doc.created_at || now() });
            }
        }
        this.write(data);
    }

    // Tworzy domyślnych użytkowników (admin, student) oraz dokument demonstracyjny przy pierwszym uruchomieniu
    ensureSeedUsers() {
        const data = this.read();
        if (data.users.length) return; // Jeśli są już jacyś użytkownicy, pomija generowanie seedów

        const adminId = nanoid();
        const userId = nanoid();

        // Rejestracja domyślnych kont z zahaszowanymi hasłami
        data.users.push({ id: adminId, username: 'admin', email: 'admin@example.com', password_hash: bcrypt.hashSync('Admin123!', 10), role: 'admin', created_at: now() });
        data.users.push({ id: userId, username: 'student', email: 'student@example.com', password_hash: bcrypt.hashSync('User123!', 10), role: 'user', created_at: now() });

        // Treść startowa dokumentu demonstracyjnego Markdown
        const content = '# Wspólny dokument\n\nOtwórz aplikację w dwóch kartach i zacznij pisać.\n\n- synchronizacja WebSocket\n- podgląd Markdown\n- historia wersji\n- nadawanie dostępu innym użytkownikom\n';

        // Utworzenie dokumentu demo i powiązanie go z uprawnieniami oraz historią wersji
        const doc = { id: nanoid(), owner_id: adminId, title: 'Demo Markdown', content, clock: 1, deleted: 0, created_at: now(), updated_at: now() };
        data.documents.push(doc);
        data.document_access.push({ document_id: doc.id, user_id: adminId, role: 'owner', granted_at: now() });
        data.document_access.push({ document_id: doc.id, user_id: userId, role: 'editor', granted_at: now() });
        data.versions.push({ id: nanoid(), document_id: doc.id, user_id: adminId, content, clock: 1, label: 'Wersja startowa', created_at: now() });

        this.write(data);
    }

    // Czyści całą bazę danych i ponownie generuje dane startowe
    reset() { this.write(blank()); this.ensureSeedUsers(); }

    // Odfiltrowuje wrażliwe dane (np. hasło) przed wysłaniem obiektu użytkownika do klienta
    publicUser(user) { return user ? { id: user.id, username: user.username, email: user.email, role: user.role } : null; }

    // Szukanie użytkownika po nazwie użytkownika lub adresie e-mail (przydatne przy logowaniu)
    findUserByLogin(login) { const d = this.read(); return d.users.find(u => u.username === login || u.email === login); }
    // Szukanie użytkownika po jego unikalnym ID
    findUserById(id) { return this.read().users.find(u => u.id === id); }

    // Tworzy nowego użytkownika w systemie
    createUser({ username, email, password_hash, role = 'user' }) {
        const data = this.read();
        const user = { id: nanoid(), username, email, password_hash, role, created_at: now() };
        data.users.push(user); this.write(data); return user;
    }
    // Szybkie tworzenie użytkownika z rolą administratora
    createAdmin({ username, email, password_hash }) { return this.createUser({ username, email, password_hash, role: 'admin' }); }
    // Sprawdza, czy nazwa użytkownika lub e-mail są już zajęte
    userExists(username, email) { return this.read().users.some(u => u.username === username || u.email === email); }

    // Zwraca posortowaną alfabetycznie listę użytkowników z bezpiecznymi (publicznymi) danymi
    listUsers() { return this.read().users.map(u => this.publicUser(u)).sort((a,b) => a.username.localeCompare(b.username)); }
    // Zmienia rolę wybranego użytkownika (np. nadanie uprawnień admina)
    setUserRole(userId, role) {
        const data = this.read(); const user = data.users.find(u => u.id === userId);
        if (!user) return null; user.role = role; this.write(data); return user;
    }

    // Weryfikuje czy użytkownik ma dostęp do dokumentu (jako admin, właściciel lub zaproszony gość)
    hasDocumentAccess(user, doc) {
        if (!doc || !user) return false;
        if (user.role === 'admin' || doc.owner_id === user.id) return true;
        return this.read().document_access.some(a => a.document_id === doc.id && a.user_id === user.id);
    }
    // Sprawdza czy użytkownik ma prawo zarządzać dokumentem (tylko admin lub właściciel)
    canManageDocument(user, doc) { return !!doc && !!user && (user.role === 'admin' || doc.owner_id === user.id); }

    // Pobiera listę aktywnych dokumentów, do których dany użytkownik ma prawo wglądu
    listDocuments(user) {
        const data = this.read();
        return data.documents.filter(d => !d.deleted && this.hasDocumentAccess(user, d))
            .map(doc => ({ ...doc, owner_name: data.users.find(u => u.id === doc.owner_id)?.username || 'unknown', access_count: data.document_access.filter(a => a.document_id === doc.id).length }))
            .sort((a,b) => b.updated_at.localeCompare(a.updated_at));
    }
    // Dołącza do obiektu dokumentu czytelne informacje o właścicielu oraz liczbie osób z dostępem
    hydrateDocument(doc) {
        if (!doc) return null;
        const data = this.read();
        return { ...doc, owner_name: data.users.find(u => u.id === doc.owner_id)?.username || 'unknown', access_count: data.document_access.filter(a => a.document_id === doc.id).length };
    }
    // Pobiera pojedynczy dokument po ID (pod warunkiem, że nie został usunięty)
    getDocument(id) { return this.read().documents.find(d => d.id === id && !d.deleted); }

    // Tworzy nowy dokument, nadaje uprawnienia właściciela oraz zapisuje pierwszą wersję w historii
    createDocument(ownerId, title, content = '') {
        const data = this.read(); const t = now();
        const doc = { id: nanoid(), owner_id: ownerId, title, content, clock: 1, deleted: 0, created_at: t, updated_at: t };
        data.documents.push(doc);
        data.document_access.push({ document_id: doc.id, user_id: ownerId, role: 'owner', granted_at: t });
        data.versions.push({ id: nanoid(), document_id: doc.id, user_id: ownerId, content, clock: 1, label: 'Utworzenie dokumentu', created_at: t });
        this.write(data); return this.hydrateDocument(doc);
    }

    // Ręczna aktualizacja dokumentu (np. zmiana tytułu/treści) wraz z dodaniem nowej wersji historycznej
    updateDocument(id, patch, userId, label = 'Zapis ręczny') {
        const data = this.read(); const doc = data.documents.find(d => d.id === id && !d.deleted);
        if (!doc) return null;
        doc.title = patch.title ?? doc.title; doc.content = patch.content ?? doc.content; doc.clock = (patch.clock ?? doc.clock + 1); doc.updated_at = now();
        data.versions.push({ id: nanoid(), document_id: id, user_id: userId, content: doc.content, clock: doc.clock, label, created_at: now() });
        this.write(data); return this.hydrateDocument(doc);
    }

    // Bezpośrednie nadpisanie treści i zegara (clock) – najczęściej używane przy synchronizacji przez WebSockety
    applyContentUpdate(id, content, clock) {
        const data = this.read(); const doc = data.documents.find(d => d.id === id && !d.deleted);
        if (!doc) return null; doc.content = content; doc.clock = clock; doc.updated_at = now(); this.write(data); return doc;
    }
    // Jawne dodanie punktu zapisu (wersji) do historii dokumentu
    addVersion(documentId, userId, content, clock, label) {
        const data = this.read(); data.versions.push({ id: nanoid(), document_id: documentId, user_id: userId, content, clock, label, created_at: now() }); this.write(data);
    }
    // Miękkie usuwanie dokumentu (soft delete) poprzez oznaczenie flagi flagi 'deleted'
    deleteDocument(id) { const data = this.read(); const doc = data.documents.find(d => d.id === id && !d.deleted); if (!doc) return false; doc.deleted = 1; doc.updated_at = now(); this.write(data); return true; }

    // Pobiera historię zmian dokumentu (maksymalnie 50 ostatnich wersji, posortowane od najnowszej)
    listVersions(documentId) {
        const data = this.read();
        return data.versions.filter(v => v.document_id === documentId).map(v => ({ ...v, username: data.users.find(u => u.id === v.user_id)?.username || 'unknown' })).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,50);
    }
    // Pobiera konkretną wersję dokumentu z historii
    getVersion(documentId, versionId) { return this.read().versions.find(v => v.document_id === documentId && v.id === versionId); }

    // Pobiera listę użytkowników, którzy mają przyznany dostęp do danego dokumentu
    listDocumentAccess(documentId) {
        const data = this.read();
        return data.document_access.filter(a => a.document_id === documentId).map(a => ({ ...a, user: this.publicUser(data.users.find(u => u.id === a.user_id)) })).filter(a => a.user).sort((a,b) => a.user.username.localeCompare(b.user.username));
    }
    // Nadaje uprawnienia (np. edytora) użytkownikowi do konkretnego dokumentu lub aktualizuje istniejące
    grantDocumentAccess(documentId, userId, role = 'editor') {
        const data = this.read();
        const doc = data.documents.find(d => d.id === documentId && !d.deleted);
        const user = data.users.find(u => u.id === userId);
        if (!doc || !user) return null;
        const existing = data.document_access.find(a => a.document_id === documentId && a.user_id === userId);
        if (existing) existing.role = existing.role === 'owner' ? 'owner' : role; // Blokada przed odebraniem roli właściciela
        else data.document_access.push({ document_id: documentId, user_id: userId, role, granted_at: now() });
        this.write(data); return this.listDocumentAccess(documentId);
    }
    // Odbiera użytkownikowi uprawnienia do dokumentu (właścicielowi nie można odebrać dostępu)
    revokeDocumentAccess(documentId, userId) {
        const data = this.read();
        const doc = data.documents.find(d => d.id === documentId && !d.deleted);
        if (!doc || doc.owner_id === userId) return false;
        const before = data.document_access.length;
        data.document_access = data.document_access.filter(a => !(a.document_id === documentId && a.user_id === userId));
        this.write(data); return before !== data.document_access.length;
    }
}

// Eksport domyślnej, zainicjalizowanej instancji bazy danych magazynu JSON
export const store = new JsonStore();