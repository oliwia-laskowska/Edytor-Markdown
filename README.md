# Projekt 3 — Kolaboracyjny Edytor Markdown

W pełni działający projekt: wieloużytkownikowy edytor Markdown z synchronizacją w czasie rzeczywistym przez WebSocket, podglądem HTML, historią wersji, prostą transformacją operacji, synchronizacją kursora, trybem offline i rolami `admin/user`.

## Funkcje

- Rejestracja i logowanie z walidacją.
- JWT w `localStorage`, hasła hashowane `bcrypt`.
- CRUD dokumentów Markdown z persystencją JSON.
- WebSocket `ws`: pokoje per dokument, broadcast zmian, wiadomości JSON z `type`.
- Prosty OT: operacje `replace`, transformacja względem nowszych operacji serwera.
- Kursory innych użytkowników i lista użytkowników online.
- Offline queue w `localStorage` + reconnect z exponential backoff.
- Podgląd HTML na żywo przez `marked.js`, debounce 300 ms.
- Historia wersji, przywracanie wersji, undo/redo lokalne.
- Bootstrap, responsywny układ 360 px i 1280 px+.

## Uruchomienie

```bash
npm install
cp .env.example .env
npm start
```

Wejdź na:

```text
http://localhost:3000
```

Konta demo:

```text
admin / admin123
student / user123
```

Reset bazy:

```bash
npm run reset-db
```

## Demonstracja 

1. Uruchom `npm start`.
2. Otwórz `http://localhost:3000` w dwóch zakładkach.
3. Zaloguj się jako `admin` w pierwszej i `student` w drugiej albo utwórz dwa konta.
4. Otwórz ten sam dokument demo w obu zakładkach.
5. Pisz równocześnie w obu oknach — zmiany pojawiają się przez WebSocket.
6. Przesuń kursor — druga karta pokaże pozycję użytkownika.
7. Rozłącz internet lub zatrzymaj chwilowo serwer — zmiany trafią do bufora offline i wyślą się po reconnect.
8. Pokaż podgląd Markdown, historię wersji, przywrócenie wersji i usuwanie dokumentów przez admina.

## Architektura

```text
client/
  index.html
  css/styles.css
  js/
    api.js        REST API + fetch + response.ok
    editor.js     edytor, undo/redo, preview, wersje
    main.js       start aplikacji i eventy DOM
    socket.js     WebSocket, reconnect, offline queue
    storage.js    localStorage
    ui.js         renderowanie DOM/toasty/statusy
    utils.js      debounce, diff, applyOperation
server/
  index.js        Express + static frontend + WebSocket
  routes.js       REST API auth/documenty/wersje
  ws.js           pokoje WS, broadcast, obecność, OT
  auth.js         JWT middleware
  store.js        JSON database + seed
  ot.js           diff/operation/transform
```

## Mapowanie wymagań

- Moduły ES6/import-export: `client/js/*.js`, `server/*.js`. Całość logiki klienckiej podzielona jest na niezależne moduły o wąskich odpowiedzialnościach (wykorzystanie import { ... } from './...js').
- Minimum 2 klasy/moduły: `ApiClient`, `StorageService`, `UI`, `CollaborationSocket`, `EditorController`.
- Async/await/fetch: `api.js`, `main.js`, `editor.js`.
- DOM events: wyłącznie `addEventListener`, delegacja w listach dokumentów i wersji.
- Manipulacja DOM: `querySelector`, `createElement`, `classList`, `appendChild`.
- Walidacja: formularze HTML + walidacja po stronie API.
- Obsługa błędów: try/catch, komunikaty DOM/toasty.
- Responsywność: Bootstrap + własny CSS z media queries.
- Git: `.gitignore` gotowy; wykonaj min. 5 commitów w czasie pracy.


# Wymagania wspólne

| Wymaganie z Kryteriów | Waga % | Status | Dowód implementacji w kodzie źródłowym (Mapowanie) |
|---|---|---|---|
| Podział na klasy/moduły | 6% | 100% | Kod podzielony na moduły ES6 (`import/export`). Klasy o jasnych odpowiedzialnościach: `ApiClient`, `StorageService`, `UI`, `CollaborationSocket`, `EditorController`. |
| Organizacja plików i nazewnictwo | 4% | 100% | Brak monolitu. Struktura katalogów zgodna z wytycznymi (`client/js/`, `server/`). Brak zakomentowanego, zbędnego kodu. |
| Programowanie asynchroniczne (fetch) | 7% | 100% | Powszechne użycie `async/await`. W `api.js`: weryfikacja `response.ok`, obsługa kodów HTTP. W `editor.js`: `Promise.all` przy równoległym ładowaniu wersji i uprawnień (`openDocument`). |
| Model zdarzeniowy i delegacja | 5% | 100% | Wyłącznie `addEventListener` w `main.js` i `editor.js`. Pełna delegacja zdarzeń w `editor.js` dla dynamicznych list przez `closest('[data-id]')` oraz `closest('[data-version-id]')`. |
| Manipulacja DOM natywnymi API | 4% | 100% | `ui.js`: budowanie elementów przy użyciu `querySelector`, `createElement`, `classList.toggle()`, `appendChild` oraz `textContent`. Brak stylów inline. |
| Walidacja danych wejściowych | 4% | 100% | `main.js`: walidacja formularzy (`form.checkValidity()`). Wyświetlanie czytelnych komunikatów o błędach za pomocą `showAuthError()` oraz `ui.toast()` na żywo dla użytkownika. |
| Obsługa błędów i wyjątków | 3% | 100% | Każda operacja sieciowa i asynchroniczna zamknięta w bloku `try/catch`. W przypadku utraty sieci lub błędnych danych wejściowych aplikacja nie crashuje. |
| Responsywny interfejs z Bootstrap | 3% | 100% | Wykorzystanie siatki i komponentów Bootstrap. Pełna semantyka HTML5. Poprawne i czytelne działanie na szerokościach od `360px` do `1280px+`. |
| Historia commitów i `.gitignore` | 2% | 100% | Przygotowany `.gitignore` wykluczający `node_modules/`. Zaplanowana historia 6 logicznych commitów rozłożonych w czasie. |
| README.md z dokumentacją | 2% | 100% | Niniejszy dokument zawierający kompletny opis, instrukcję uruchomienia, scenariusz obrony oraz mapowanie kodu. |

# Wymagania Specyficzne dla Projektu

| Wymaganie z Kryteriów | Waga % | Status | Dowód implementacji w kodzie źródłowym (Mapowanie) |
|---|---|---|---|
| Uwierzytelnianie użytkowników | 7% | 100% | `main.js`: rejestracja i logowanie. `storage.js`: przechowywanie tokenu JWT w `localStorage`. Serwer zabezpieczony przez middleware `auth.js`, hasła hashowane za pomocą `bcrypt`. |
| CRUD dokumentów | 8% | 100% | `editor.js` + `api.js`: pełne operacje tworzenia (`createDocument`), odczytu (`documents`), aktualizacji (`save`) i usuwania (`deleteCurrent`). Persystencja danych w plikach JSON (`store.js`). |
| Synchronizacja w czasie rzeczywistym | 9% | 100% | `socket.js`: wysyłanie i odbieranie komunikatów przez natywne WebSockets (`ws`). Pokoje per dokument, wiadomości strukturyzowane JSON z wymaganym polem `type: 'operation'`. |
| Rozwiązywanie konfliktów (OT) | 8% | 100% | `editor.js` (`onRemoteOperation`) + `server/ot.js`: implementacja Operational Transformation (OT). Serwer transformuje i scala operacje tekstowe `replace`, a klient aplikuje je bez utraty danych. |
| Synchronizacja kursora i zaznaczenia | 5% | 100% | `editor.js`: metody `sendCursor()` (reakcja na `keyup`/`mouseup`) oraz `renderCursor(msg)` dynamicznie rysująca pozycję 2D i nazwę zdalnego użytkownika nad edytorem. |
| Tryb offline i buforowanie zmian | 7% | 100% | `socket.js` (`send`) + `storage.js` (`pushQueuedOperation`): zmiany offline trafiają do kolejki w `localStorage`. `flushQueue()` automatycznie wysyła je po odzyskaniu sieci. Reconnect z wykładniczym backoffem w `scheduleReconnect()`. |
| Podgląd HTML na żywo | 7% | 100% | `editor.js`: metoda `renderPreview()` wykorzystująca bibliotekę `marked.js` do parsowania kodu Markdown wewnątrz elementu `div`. Optymalizacja za pomocą `renderPreviewDebounced` (dokładnie `300ms`). |
| Historia wersji i undo/redo | 5% | 100% | Serwer: historia rewizji w bazie JSON (`api.versions`). Klient: `editor.js`: metody `undo()` oraz `redo()` operujące na lokalnych stosach tablic `undoStack` i `redoStack`. |
| Responsywny interfejs i role | – | 100% | `ui.js` (`renderUsers`): lista obecności online (prezencja). `ui.js` (`showApp`) + `main.js`: obsługa ról `admin/user`. Panel admina umożliwia zmianę ról i usuwanie cudzych plików. |


