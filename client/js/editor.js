import { debounce, diffToOperation, applyOperation } from './utils.js';

export class EditorController {
    // Inicjalizacja kontrolera, mapowanie zależności oraz ustawienie domyślnych stosów stanów i referencji DOM
    constructor(api, socket, ui, storage) {
        this.api = api;         // Instancja klienta HTTP API
        this.socket = socket;   // Wrapper klienta WebSocket
        this.ui = ui;           // Moduł renderujący komponenty interfejsu użytkownika
        this.storage = storage; // Magazyn danych sesji (np. token, dane profilu)
        this.docs = [];         // Lokalny bufor listy dokumentów
        this.users = [];        // Lista wszystkich zarejestrowanych użytkowników
        this.current = null;    // Referencja do aktualnie otwartego dokumentu
        this.clock = 0;         // Wersja logiczna (zegar) dokumentu synchronizowana z serwerem
        this.lastText = '';     // Kopia tekstu z poprzedniego kroku synchronizacji do wyliczania diffów
        this.undoStack = [];    // Stos cofania zmian (historia lokalna)
        this.redoStack = [];    // Stos ponawiania zmian
        this.textarea = document.querySelector('#markdownInput');
        this.preview = document.querySelector('#preview');
        this.titleInput = document.querySelector('#titleInput');

        // Optymalizacja renderowania podglądu HTML za pomocą debounce (ograniczenie obciążenia procesora przy pisaniu)
        this.renderPreviewDebounced = debounce(() => this.renderPreview(), 300);
    }

    // Wiązanie zdarzeń interfejsu użytkownika, formularzy i listenerów zdarzeń sieciowych WebSocket
    bind() {
        // Obsługa kliknięcia w dokument na liście bocznej (delegacja zdarzeń)
        document.querySelector('#docsList').addEventListener('click', (event) => {
            const button = event.target.closest('[data-id]');
            if (button) this.openDocument(button.dataset.id);
        });

        // Przywracanie historycznych wersji dokumentu za pośrednictwem API
        document.querySelector('#versionsList').addEventListener('click', async (event) => {
            const button = event.target.closest('[data-version-id]');
            if (button && this.current && confirm('Przywrócić tę wersję?')) {
                const { document } = await this.api.restore(this.current.id, button.dataset.versionId);
                await this.loadDocuments(document.id);
                this.ui.toast('Przywrócono wersję.', 'success');
            }
        });

        // Formularz tworzenia nowego dokumentu z automatycznym otwarciem po sukcesie
        document.querySelector('#newDocForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const title = new FormData(event.currentTarget).get('title').trim();
            if (title.length < 2) return this.ui.toast('Tytuł jest za krótki.', 'danger');
            try {
                const form = event.currentTarget;
                const { document } = await this.api.createDocument({ title, content: '# Nowy dokument\n' });
                form.reset();
                this.docs = [document, ...this.docs.filter(d => d.id !== document.id)];
                this.ui.renderDocuments(this.docs, document.id, this.storage.user?.id);
                await this.openDocument(document.id);
                this.ui.toast('Dokument utworzony i od razu widoczny na liście.', 'success');
            } catch (error) { this.ui.toast(error.message, 'danger'); }
        });

        // Obsługa akcji paska narzędziowego
        document.querySelector('#saveBtn').addEventListener('click', () => this.save());
        document.querySelector('#deleteBtn').addEventListener('click', () => this.deleteCurrent());
        document.querySelector('#undoBtn').addEventListener('click', () => this.undo());
        document.querySelector('#redoBtn').addEventListener('click', () => this.redo());

        // Nadawanie uprawnień dostępu do pliku wybranemu użytkownikowi (ACL)
        document.querySelector('#grantAccessForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!this.current) return;
            const userId = new FormData(event.currentTarget).get('userId');
            if (!userId) return this.ui.toast('Wybierz użytkownika.', 'warning');
            try {
                const form = event.currentTarget;
                await this.api.grantAccess(this.current.id, userId);
                await this.loadAccess();
                await this.loadDocuments(this.current.id, false);
                form.reset();
                this.ui.toast('Nadano dostęp do dokumentu.', 'success');
            } catch (error) { this.ui.toast(error.message, 'danger'); }
        });

        // Odbieranie uprawnień dostępu (usuwanie wpisu ACL)
        document.querySelector('#accessList').addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-revoke-user-id]');
            if (!btn || !this.current) return;
            if (!confirm('Odebrać temu użytkownikowi dostęp?')) return;
            try {
                await this.api.revokeAccess(this.current.id, btn.dataset.revokeUserId);
                await this.loadAccess();
                await this.loadDocuments(this.current.id, false);
                this.ui.toast('Odebrano dostęp.', 'success');
            } catch (error) { this.ui.toast(error.message, 'danger'); }
        });

        // Listenery do śledzenia aktywności użytkownika w polu tekstowym
        this.textarea.addEventListener('input', () => this.handleInput());
        this.textarea.addEventListener('keyup', () => this.sendCursor());
        this.textarea.addEventListener('mouseup', () => this.sendCursor());

        // Subskrypcje zdarzeń socketowych przesyłanych w czasie rzeczywistym
        this.socket.on('init', (msg) => this.onInit(msg));
        this.socket.on('operation', (msg) => this.onRemoteOperation(msg));
        this.socket.on('ack', (msg) => { this.clock = msg.clock; }); // Potwierdzenie zapisu operacji przez serwer
        this.socket.on('presence', (msg) => this.ui.renderUsers(msg.users)); // Aktualizacja listy obecnych w pokoju
        this.socket.on('cursor', (msg) => this.renderCursor(msg)); // Aktualizacja pozycji wskaźników innych osób
        this.socket.on('error', (msg) => {
            if (msg.message !== this.lastSocketError) {
                this.lastSocketError = msg.message;
                this.ui.toast(msg.message, 'danger');
            }
        });
    }

    // Pobiera globalną listę użytkowników i aktualizuje widoki panelu administracyjnego
    async loadUsers() {
        const { users } = await this.api.users();
        this.users = users;
        const current = this.storage.user;
        if (current?.role === 'admin') this.ui.renderAdminUsers(users, current.id);
        return users;
    }

    // Inicjalne lub reaktywne ładowanie bazy dokumentów przypisanych do konta
    async loadDocuments(selectId = null, shouldOpen = true) {
        const [{ documents }] = await Promise.all([this.api.documents(), this.loadUsers().catch(() => ({ users: [] }))]);
        this.docs = documents;
        this.ui.renderDocuments(documents, selectId || this.current?.id, this.storage.user?.id);
        // Automatyczne otwieranie pierwszego dokumentu lub jawnie wskazanego identyfikatora
        if (documents.length && shouldOpen && (selectId || !this.current)) await this.openDocument(selectId || documents[0].id);
    }

    // Procedura ładowania dokumentu do edytora i przełączenia pokoju WebSocket
    async openDocument(id) {
        this.current = this.docs.find((doc) => doc.id === id);
        if (!this.current) return;
        this.titleInput.value = this.current.title;
        this.textarea.value = this.current.content;
        this.lastText = this.current.content;
        this.clock = this.current.clock;

        // Resetowanie lokalnych stosów cofania na potrzeby nowego dokumentu
        this.undoStack = [this.current.content];
        this.redoStack = [];

        this.ui.renderDocuments(this.docs, id, this.storage.user?.id);
        this.renderPreview();
        this.socket.connect(id); // Połączenie lub przełączenie pokoju na serwerze WS
        await Promise.all([this.loadVersions(), this.loadAccess()]);
    }

    // Handler wywoływany przy wejściu do pokoju współdzielenia - synchronizuje stan początkowy
    onInit(msg) {
        this.clock = msg.document.clock;
        this.current = { ...this.current, ...msg.document };
        // Nadpisanie tekstu tylko w sytuacji, gdy lokalny edytor różni się od danych autorytatywnych z serwera
        if (this.textarea.value !== msg.document.content) {
            this.textarea.value = msg.document.content;
            this.lastText = msg.document.content;
            this.renderPreview();
        }
        this.ui.renderUsers(msg.users);
    }

    // Reakcja na fizyczne wpisywanie tekstu przez użytkownika
    handleInput() {
        if (!this.current) return;
        this.applyLocalText(this.textarea.value, { recordHistory: true });
    }

    // Przetwarzanie lokalnej modyfikacji: obliczenie delty tekstu i wysłanie operacji przez WebSocket
    applyLocalText(newText, { recordHistory = true } = {}) {
        if (!this.current || newText === this.lastText) return;
        const oldText = this.lastText;

        // Konwersja różnicy tekstowej na atomową strukturę operacji (OT / Diff)
        const op = diffToOperation(oldText, newText);

        // Zapis stanu na stosie historii, o ile flaga nie została jawnie wyłączona (np. podczas operacji Undo)
        if (recordHistory) {
            if (this.undoStack.at(-1) !== oldText) this.undoStack.push(oldText);
            this.undoStack.push(newText);
            this.redoStack = []; // Wyczyszczenie drzewa Redo po wykonaniu nowej, unikalnej akcji
        }

        this.lastText = newText;
        // Wysłanie spakowanej mutacji wraz z aktualną wersją zegara logicznego użytkownika
        this.socket.send({ type: 'operation', operation: op, clock: this.clock });
        this.renderPreviewDebounced();
    }

    // Integracja zmian tekstowych napływających od innych edytujących w czasie rzeczywistym
    onRemoteOperation(msg) {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const before = this.textarea.value;

        // Zaaplikowanie zdalnej operacji na lokalnym tekście
        const after = applyOperation(before, msg.operation);
        this.textarea.value = after;
        this.lastText = after;
        this.clock = msg.clock; // Aktualizacja wspólnego zegara systemowego

        // Korekta pozycji kursora lokalnego użytkownika, by tekst nie "uciekał" podczas cudzej edycji
        const delta = (msg.operation.text?.length || 0) - (msg.operation.del || 0);
        const adjust = (p) => p > msg.operation.pos ? Math.max(0, p + delta) : p;
        this.textarea.setSelectionRange(adjust(start), adjust(end));

        this.renderPreviewDebounced();
    }

    // Ręczny twardy zapis dokumentu w bazie danych (tworzy nowy wpis w historii wersji)
    async save() {
        if (!this.current) return;
        const title = this.titleInput.value.trim();
        if (title.length < 2 || title.length > 80) return this.ui.toast('Tytuł musi mieć 2–80 znaków.', 'danger');
        try {
            const { document } = await this.api.updateDocument(this.current.id, { title, content: this.textarea.value });
            this.current = document;
            await this.loadDocuments(document.id, false);
            await this.loadVersions();
            this.ui.toast('Zapisano dokument.', 'success');
        } catch (error) { this.ui.toast(error.message, 'danger'); }
    }

    // Usuwanie aktualnie otwartego pliku, czyszczenie edytora i odłączenie od gniazda WS
    async deleteCurrent() {
        if (!this.current || !confirm('Usunąć dokument?')) return;
        try {
            await this.api.deleteDocument(this.current.id);
            this.socket.close();
            this.current = null;
            this.textarea.value = '';
            this.titleInput.value = '';
            this.preview.innerHTML = '';
            document.querySelector('#versionsList').innerHTML = '';
            document.querySelector('#accessList').innerHTML = '';
            await this.loadDocuments();
            this.ui.toast('Usunięto dokument.', 'success');
        } catch (error) { this.ui.toast(error.message, 'danger'); }
    }

    // Ładuje historię wersji zapisaną trwale na serwerze
    async loadVersions() {
        if (!this.current) return;
        const { versions } = await this.api.versions(this.current.id);
        this.ui.renderVersions(versions);
    }

    // Pobiera aktualny stan listy kontroli dostępu dla pliku
    async loadAccess() {
        if (!this.current) return;
        const { access, canManage } = await this.api.access(this.current.id);
        this.ui.renderAccess(access, this.users, canManage);
    }

    // Cofanie zmian w lokalnym edytorze (wyciągnięcie stanu z historii)
    undo() {
        if (this.undoStack.length < 2) return;
        const currentText = this.textarea.value;
        this.undoStack.pop(); // Usunięcie bieżącego stanu tekstowego
        const previous = this.undoStack.at(-1);
        this.redoStack.push(currentText); // Przeniesienie stanu na stos ponownych akcji
        this.textarea.value = previous;
        this.applyLocalText(previous, { recordHistory: false }); // Wysłanie zmiany bez mutowania stosu
        this.renderPreview();
    }

    // Ponawianie cofniętych zmian (przywracanie stanu ze stosu Redo)
    redo() {
        const next = this.redoStack.pop();
        if (next == null) return;
        this.undoStack.push(next);
        this.textarea.value = next;
        this.applyLocalText(next, { recordHistory: false });
        this.renderPreview();
    }

    // Kompilacja Markdown do czystego kodu HTML z wykorzystaniem zewnętrznej biblioteki Marked
    renderPreview() {
        const html = window.marked ? window.marked.parse(this.textarea.value) : this.textarea.value;
        this.preview.innerHTML = html;
    }

    // Emituje aktualną pozycję kursora lokalnego użytkownika przez protokół WebSocket
    sendCursor() {
        if (!this.current) return;
        this.socket.send({ type: 'cursor', cursor: { start: this.textarea.selectionStart, end: this.textarea.selectionEnd } });
    }

    // Renderuje wizualny wskaźnik kursora i nick innej osoby edytującej dokument
    renderCursor(msg) {
        const layer = document.querySelector('#remoteCursors');
        const id = `cursor-${msg.user.id}`;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'remote-cursor';
            layer.appendChild(el);
        }

        // Aproksymacja pozycji 2D kursora wewnątrz surowego kontenera textarea
        const pos = msg.cursor?.start || 0;
        const lines = this.textarea.value.slice(0, pos).split('\n');
        // Wyliczanie wysokości (top) na podstawie liczby linii oraz szerokości (left) na bazie liczby znaków
        el.style.top = `${Math.max(0, lines.length * 21)}px`;
        el.style.left = `${Math.min(85, lines.at(-1).length * 8)}px`;
        el.textContent = msg.user.username;

        // Automatyczne usuwanie widżetu kursora po 5 sekundach braku aktywności ze strony użytkownika
        setTimeout(() => el.remove(), 5000);
    }
}