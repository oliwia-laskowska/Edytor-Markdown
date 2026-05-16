import jwt from 'jsonwebtoken';
import { store } from './store.js';
const secret = process.env.JWT_SECRET || 'dev-secret';
export function signToken(user) { return jwt.sign({ id: user.id }, secret, { expiresIn: '7d' }); }
export function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
        const payload = jwt.verify(token, secret);
        const user = store.findUserById(payload.id);
        if (!user) return res.status(401).json({ error: 'Brak autoryzacji.' });
        req.user = store.publicUser(user);
        next();
    } catch { res.status(401).json({ error: 'Brak autoryzacji.' }); }
}
