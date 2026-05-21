import express from 'express';
import bcrypt from 'bcryptjs';
import { store } from './store.js';
import { authMiddleware, signToken } from './auth.js';

export const router = express.Router();

// Reguła walidacji hasła: min. 6 znaków, przynajmniej jedna wielka litera, jedna cyfra i jeden znak specjalny
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// Skróty do sprawdzania uprawnień użytkownika w odniesieniu do konkretnego dokumentu
const canAccess = (user, doc) => store.hasDocumentAccess(user, doc);
const canManage = (user, doc) => store.canManageDocument(user, doc);

// Middleware sprawdzający czy zalogowany użytkownik posiada rolę administratora
const requireAdmin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Wymagane uprawnienia admina.' });

// Funkcja pomocnicza weryfikująca format hasła za pomocą wyrażenia regularnego
function validatePassword(password) {
    return typeof password === 'string' && PASSWORD_RULE.test(password);
}

// Wspólny budowniczy obiektu użytkownika z walidacją danych wejściowych z żądania HTTP
async function buildUserFromBody(body, role = 'user') {
    const username = (body.username || '').trim();
    const email = (body.email || '').trim();
    const { password } = body;

    // Walidacja poprawności danych rejestracyjnych
    if (username.length < 3 || username.length > 30) throw new Error('Nazwa użytkownika musi mieć 3–30 znaków.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj poprawny email.');
    if (!validatePassword(password)) throw new Error('Hasło musi mieć minimum 6 znaków, dużą literę, cyfrę i znak specjalny.');
    if (store.userExists(username, email)) throw new Error('Użytkownik lub email już istnieje.');

    // Haszowanie hasła przed zapisem do bazy (koszt soli: 10)
    return { username, email, password_hash: await bcrypt.hash(password, 10), role };
}

// Rejestracja nowego standardowego użytkownika
router.post('/auth/register', async (req, res) => {
    try {
        const userData = await buildUserFromBody(req.body, 'user');
        const user = store.createUser(userData);
        // Zwraca token JWT i publiczne dane profilu
        res.status(201).json({ token: signToken(user), user: store.publicUser(user) });
    } catch (error) {
        // Dobór odpowiedniego kodu błędu: 409 (Konflikt danych) lub 400 (Złe zapytanie)
        res.status(error.message.includes('istnieje') ? 409 : 400).json({ error: error.message || 'Błąd rejestracji.' });
    }
});

// Logowanie użytkownika do aplikacji
router.post('/auth/login', async (req, res) => {
    const { login, password } = req.body;
    const user = store.findUserByLogin(login);

    // Bezpieczne sprawdzenie hasła – zapobiega timing attacks
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
        return res.status(401).json({ error: 'Nieprawidłowe dane logowania.' });
    }
    res.json({ token: signToken(user), user: store.publicUser(user) });
});

// Pobranie profilu aktualnie zalogowanego użytkownika (na podstawie tokenu)
router.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));

// Pobranie listy wszystkich użytkowników systemu (wymaga bycia zalogowanym)
router.get('/users', authMiddleware, (req, res) => res.json({ users: store.listUsers() }));

// Panel Administratora: Bezpośrednie tworzenie nowego konta z uprawnieniami admina
router.post('/admin/users', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const userData = await buildUserFromBody(req.body, 'admin');
        const user = store.createAdmin(userData);
        res.status(201).json({ user: store.publicUser(user) });
    } catch (error) {
        res.status(error.message.includes('istnieje') ? 409 : 400).json({ error: error.message || 'Błąd tworzenia admina.' });
    }
});

// Panel Administratora: Zmiana roli wybranego użytkownika (admin / user)
router.patch('/admin/users/:id/role', authMiddleware, requireAdmin, (req, res) => {
    if (!['admin', 'user'].includes(req.body.role)) return res.status(400).json({ error: 'Rola musi być admin albo user.' });
    const user = store.setUserRole(req.params.id, req.body.role);
    if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    res.json({ user: store.publicUser(user) });
});

// Pobranie listy dokumentów, do których zalogowany użytkownik posiada uprawnienia dostępu
router.get('/documents', authMiddleware, (req, res) => res.json({ documents: store.listDocuments(req.user) }));

// Utworzenie nowego dokumentu (użytkownik automatycznie staje się jego właścicielem)
router.post('/documents', authMiddleware, (req, res) => {
    const title = (req.body.title || '').trim();
    if (title.length < 2 || title.length > 80) return res.status(400).json({ error: 'Tytuł musi mieć 2–80 znaków.' });
    res.status(201).json({ document: store.createDocument(req.user.id, title, typeof req.body.content === 'string' ? req.body.content : '') });
});

// Pobranie szczegółów konkretnego dokumentu wraz z weryfikacją uprawnień do jego odczytu
router.get('/documents/:id', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canAccess(req.user, doc)) return res.status(403).json({ error: 'Brak dostępu.' });
    res.json({ document: store.hydrateDocument(doc) });
});

// Aktualizacja tytułu i treści dokumentu (tworzy nową wersję w historii zapisu)
router.put('/documents/:id', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canAccess(req.user, doc)) return res.status(403).json({ error: 'Brak dostępu.' });

    const title = (req.body.title || doc.title).trim();
    if (title.length < 2 || title.length > 80) return res.status(400).json({ error: 'Tytuł musi mieć 2–80 znaków.' });

    const updated = store.updateDocument(doc.id, { title, content: typeof req.body.content === 'string' ? req.body.content : doc.content }, req.user.id);
    res.json({ document: updated });
});

// Soft-delete dokumentu (wymaga uprawnień administratora lub bycia właścicielem)
router.delete('/documents/:id', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canManage(req.user, doc)) return res.status(403).json({ error: 'Tylko właściciel lub admin może usunąć dokument.' });
    store.deleteDocument(doc.id);
    res.json({ ok: true });
});

// Pobranie listy uprawnień i współdzielenia dla konkretnego dokumentu
router.get('/documents/:id/access', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canAccess(req.user, doc)) return res.status(403).json({ error: 'Brak dostępu.' });
    res.json({ access: store.listDocumentAccess(doc.id), canManage: canManage(req.user, doc) });
});

// Przyznanie dostępu (rola: edytor) do dokumentu kolejnemu użytkownikowi
router.post('/documents/:id/access', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canManage(req.user, doc)) return res.status(403).json({ error: 'Tylko właściciel lub admin może nadawać dostęp.' });

    const access = store.grantDocumentAccess(doc.id, req.body.userId, 'editor');
    if (!access) return res.status(404).json({ error: 'Nie znaleziono użytkownika albo dokumentu.' });
    res.json({ access });
});

// Odebranie wybranemu użytkownikowi praw dostępu do dokumentu (blokada usunięcia samego właściciela)
router.delete('/documents/:id/access/:userId', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canManage(req.user, doc)) return res.status(403).json({ error: 'Tylko właściciel lub admin może odbierać dostęp.' });
    if (doc.owner_id === req.params.userId) return res.status(400).json({ error: 'Nie można odebrać dostępu właścicielowi dokumentu.' });

    store.revokeDocumentAccess(doc.id, req.params.userId);
    res.json({ access: store.listDocumentAccess(doc.id) });
});

// Pobranie osi czasu i historii wersji (rewizji) dla wskazanego dokumentu
router.get('/documents/:id/versions', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' });
    if (!canAccess(req.user, doc)) return res.status(403).json({ error: 'Brak dostępu.' });
    res.json({ versions: store.listVersions(req.params.id) });
});

// Przywrócenie treści dokumentu z wybranej wersji historycznej (tworzy nowy wpis rewizji w bazie)
router.post('/documents/:id/versions/:versionId/restore', authMiddleware, (req, res) => {
    const doc = store.getDocument(req.params.id);
    const version = store.getVersion(req.params.id, req.params.versionId);
    if (!doc || !version) return res.status(404).json({ error: 'Nie znaleziono wersji.' });
    if (!canAccess(req.user, doc)) return res.status(403).json({ error: 'Brak dostępu.' });

    const updated = store.updateDocument(doc.id, { content: version.content }, req.user.id, 'Przywrócenie wersji');
    res.json({ document: updated });
});