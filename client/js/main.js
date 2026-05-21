import { StorageService } from './storage.js';
import { ApiClient } from './api.js';
import { UI } from './ui.js';
import { CollaborationSocket } from './socket.js';
import { EditorController } from './editor.js';

// Wyrażenie regularne wymuszające silne hasło: min 6 znaków, 1 duża litera, 1 cyfra, 1 znak specjalny
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// --- Inicjalizacja i Orkiestracja Modułów Aplikacji ---
const storage = new StorageService();
const api = new ApiClient(storage);
const ui = new UI();
const socket = new CollaborationSocket(storage, ui);
const editor = new EditorController(api, socket, ui, storage);

// Podpięcie listenerów zdarzeń DOM w kontrolerze edytora
editor.bind();

// --- Funkcje Pomocnicze (Helpers) ---

// Konwertuje pola formularza HTML bezpośrednio na płaski obiekt klucz-wartość (payload dla API)
function readForm(form) { return Object.fromEntries(new FormData(form).entries()); }

// Weryfikuje zgodność hasła tekstowego z globalną polityką bezpieczeństwa systemu
function validateStrongPassword(password) { return PASSWORD_RULE.test(password); }

// Wyświetla błąd uwierzytelniania w dedykowanym kontenerze panelu logowania/rejestracji
function showAuthError(message) {
    const box = document.querySelector('#authError');
    box.textContent = message;
    box.classList.remove('d-none');
}

// Ukrywa kontener błędów autoryzacji
function clearAuthError() { document.querySelector('#authError').classList.add('d-none'); }

// Centralna metoda realizująca proces logowania lub rejestracji i inicjująca sesję aplikacji
async function authenticate(action, payload) {
    try {
        clearAuthError();
        const data = await api[action](payload); // Wywołanie metody 'login' lub 'register' na kliencie API

        // Zapisanie danych sesji w pamięci trwałej przeglądarki
        storage.token = data.token;
        storage.user = data.user;

        // Przełączenie widoku interfejsu na aplikację i załadowanie dokumentów użytkownika
        ui.showApp(data.user);
        await editor.loadDocuments();
    } catch (error) { showAuthError(error.message); }
}

// --- Obsługa Zdarzeń Przełączania Widoków Autoryzacji ---

// Przełączenie interfejsu na panel logowania
document.querySelector('#showLoginBtn').addEventListener('click', (event) => {
    document.querySelector('#loginPanel').classList.remove('d-none');
    document.querySelector('#registerPanel').classList.add('d-none');

    // Wizualna zmiana stanu przycisków (aktywacja Logowania)
    event.currentTarget.className = 'btn btn-primary';
    document.querySelector('#showRegisterBtn').className = 'btn btn-outline-primary';

    clearAuthError();
});

// Przełączenie interfejsu na panel rejestracji konta
document.querySelector('#showRegisterBtn').addEventListener('click', (event) => {
    document.querySelector('#loginPanel').classList.add('d-none');
    document.querySelector('#registerPanel').classList.remove('d-none');

    // Wizualna zmiana stanu przycisków (aktywacja Rejestracji)
    event.currentTarget.className = 'btn btn-primary';
    document.querySelector('#showLoginBtn').className = 'btn btn-outline-primary';

    clearAuthError();
});

// --- Obsługa Formularzy Autoryzacyjnych i Administracyjnych ---

// Obsługa wysyłania formularza logowania z natywną walidacją HTML5
document.querySelector('#loginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    authenticate('login', readForm(form));
});

// Obsługa wysyłania formularza rejestracji z dodatkową walidacją złożoności hasła w JS
document.querySelector('#registerForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = readForm(form);
    if (!form.checkValidity()) return form.reportValidity();
    if (!validateStrongPassword(payload.password)) return showAuthError('Hasło musi mieć minimum 6 znaków, dużą literę, cyfrę i znak specjalny.');
    authenticate('register', payload);
});

// Tworzenie nowego konta administratora z poziomu dedykowanego panelu zarządczego
document.querySelector('#createAdminForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = readForm(form);
    if (!form.checkValidity()) return form.reportValidity();
    if (!validateStrongPassword(payload.password)) return ui.toast('Hasło admina musi mieć min. 6 znaków, dużą literę, cyfrę i znak specjalny.', 'danger');
    try {
        await api.createAdmin(payload);
        form.reset();
        await editor.loadUsers(); // Odświeżenie listy użytkowników w panelu admina
        ui.toast('Utworzono admina.', 'success');
    } catch (error) { ui.toast(error.message, 'danger'); }
});

// Zmiana uprawnień (roli) użytkownika z poziomu listy w panelu administratora
document.querySelector('#adminUsersList').addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-role-user-id]');
    if (!btn) return;
    try {
        await api.setUserRole(btn.dataset.roleUserId, btn.dataset.nextRole);
        await editor.loadUsers();
        ui.toast('Zmieniono rolę użytkownika.', 'success');
    } catch (error) { ui.toast(error.message, 'danger'); }
});

// Procedura wylogowania – czyszczenie pamięci, zamknięcie gniazda i powrót do ekranu logowania
document.querySelector('#logoutBtn').addEventListener('click', () => {
    storage.token = null;
    storage.user = null;
    socket.close();
    ui.showAuth();
});

// --- Monitorowanie Stanu Sieci Przeglądarki (Natywne Zdarzenia Offline/Online) ---
window.addEventListener('online', () => ui.toast('Połączenie sieciowe wróciło.', 'success'));
window.addEventListener('offline', () => ui.toast('Brak sieci — zmiany będą buforowane lokalnie.', 'warning'));

// --- Inicjalny Cykl Życia (Auto-Login przy przeładowaniu strony) ---
if (storage.token && storage.user) {
    // Jeśli token istnieje, aplikacja od razu próbuje wejść do głównego widoku
    ui.showApp(storage.user);
    editor.loadDocuments().catch((error) => {
        // W przypadku wygasłego tokenu lub błędu sesja jest czyszczona, a użytkownik cofany do logowania
        ui.toast(error.message, 'danger');
        storage.token = null;
        storage.user = null;
        ui.showAuth();
    });
} else {
    // Brak sesji – wyświetlenie formularza autoryzacji na starcie
    ui.showAuth();
}
// Natychmiastowa reakcja interfejsu na fizyczne odłączenie przewodu sieciowego / Wi-Fi
window.addEventListener('offline', () => {
    // 1. Zmień stan w UI na offline
    ui.status('offline', 'secondary');
    ui.toast('Wykryto brak połączenia sieciowego. Przejście w tryb offline.', 'warning');
});

// Reakcja na powrót sieci i PEŁNĄ synchronizację gniazda wraz z pokojem
window.addEventListener('online', () => {
    ui.toast('Połączenie sieciowe przywrócone. Rekonstrukcja sesji...', 'success');

    // Sprawdź, czy użytkownik miał otwarty jakikolwiek dokument przed rozłączeniem
    if (editor && editor.currentDocumentId) {
        // Zamiast gołego socket.connect, wywołaj pełną procedurę otwarcia dokumentu.
        // Ona wewnętrznie połączy socket, wyśle komunikat 'join' do pokoju
        // oraz pobierze aktualny stan tekstu z serwera (fetch/API) za pomocą Promise.all!
        editor.openDocument(editor.currentDocumentId)
            .then(() => {
                ui.toast('Pomyślnie zsynchronizowano z pokojem dokumentu.', 'success');
            })
            .catch(err => {
                console.error('Błąd synchronizacji po powrocie sieci:', err);
                ui.toast('Błąd podczas odzyskiwania sesji dokumentu.', 'danger');
            });
    } else {
        // Jeśli nie było otwartego dokumentu, po prostu połącz gniazdo ogólne
        socket.connect();
    }
});

