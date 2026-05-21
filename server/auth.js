import jwt from 'jsonwebtoken';
import { store } from './store.js';

// Klucz szyfrujący pobierany ze zmiennych środowiskowych, z bezpiecznym fallbackiem dla środowiska deweloperskiego
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Generuje token JWT dla użytkownika, kodując w nim podstawowe dane identyfikacyjne. Token jest ważny przez 8 godzin.
export function signToken(user) {
    return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
}

// Globalny middleware Express do autoryzacji żądań HTTP za pomocą nagłówka Authorization Bearer
export function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    // Wyciągnięcie czystego tokenu z formatu "Bearer <token>"
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: 'Brak tokenu autoryzacji.' });

    try {
        // Weryfikacja autentyczności i ważności tokenu
        const payload = jwt.verify(token, JWT_SECRET);
        // Pobranie z bazy aktualnych, bezpiecznych danych profilu użytkownika
        const user = store.publicUser(store.findUserById(payload.id));

        if (!user) return res.status(401).json({ error: 'Użytkownik nie istnieje.' });

        // Doklejenie obiektu użytkownika do żądania (req), dzięki czemu jest dostępny w kolejnych handlerach
        req.user = user;
        next();
    } catch {
        return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token.' });
    }
}

// Funkcja pomocnicza do synchronicznej autoryzacji użytkownika przy nawiązywaniu połączenia przez WebSocket
export function parseWsUser(token) {
    if (!token) return null;
    try {
        // Weryfikacja tokenu przesłanego w query stringu połączenia WS
        const payload = jwt.verify(token, JWT_SECRET);
        // Zwraca publiczny obiekt użytkownika w przypadku sukcesu lub null przy błędzie
        return store.publicUser(store.findUserById(payload.id));
    } catch { return null; }
}