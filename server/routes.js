import express from 'express';
import bcrypt from 'bcryptjs';
import { store } from './store.js';
import { authMiddleware, signToken } from './auth.js';

export const router = express.Router();
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
function validatePassword(password) { return typeof password === 'string' && PASSWORD_RULE.test(password); }
async function buildUser(body) {
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    const password = body.password || '';
    if (username.length < 3 || username.length > 30) throw new Error('Nazwa użytkownika musi mieć 3–30 znaków.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj poprawny email.');
    if (!validatePassword(password)) throw new Error('Hasło musi mieć minimum 6 znaków, dużą literę, cyfrę i znak specjalny.');
    if (store.userExists(username, email)) throw new Error('Użytkownik lub email już istnieje.');
    return { username, email, password_hash: await bcrypt.hash(password, 10), role: 'user' };
}
router.post('/auth/register', async (req, res) => { try { const user = store.createUser(await buildUser(req.body)); res.status(201).json({ token: signToken(user), user: store.publicUser(user) }); } catch (e) { res.status(400).json({ error: e.message }); } });
router.post('/auth/login', async (req, res) => { const user = store.findUserByLogin(req.body.login); if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ error: 'Nieprawidłowe dane logowania.' }); res.json({ token: signToken(user), user: store.publicUser(user) }); });
router.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));
router.get('/documents', authMiddleware, (req, res) => res.json({ documents: store.listDocuments(req.user) }));
router.post('/documents', authMiddleware, (req, res) => { const title = String(req.body.title || '').trim(); if (title.length < 2 || title.length > 80) return res.status(400).json({ error: 'Tytuł musi mieć 2–80 znaków.' }); res.status(201).json({ document: store.createDocument(req.user.id, title, '') }); });
router.get('/documents/:id', authMiddleware, (req, res) => { const doc = store.getDocument(req.params.id); if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' }); if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Brak dostępu.' }); res.json({ document: doc }); });
router.put('/documents/:id', authMiddleware, (req, res) => { const doc = store.getDocument(req.params.id); if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' }); if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Brak dostępu.' }); const title = String(req.body.title || doc.title).trim(); if (title.length < 2 || title.length > 80) return res.status(400).json({ error: 'Tytuł musi mieć 2–80 znaków.' }); res.json({ document: store.updateDocument(doc.id, { title, content: String(req.body.content || '') }) }); });
router.delete('/documents/:id', authMiddleware, (req, res) => { const doc = store.getDocument(req.params.id); if (!doc) return res.status(404).json({ error: 'Nie znaleziono dokumentu.' }); if (doc.owner_id !== req.user.id) return res.status(403).json({ error: 'Brak dostępu.' }); store.deleteDocument(doc.id); res.json({ ok: true }); });
