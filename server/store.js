import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/db.json');
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function emptyDb() { return { users: [], documents: [] }; }
function readDb() {
    if (!fs.existsSync(dbPath)) { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); fs.writeFileSync(dbPath, JSON.stringify(emptyDb(), null, 2)); }
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}
function writeDb(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

export const store = {
    dbPath,
    readDb,
    writeDb,
    publicUser(user) { return { id: user.id, username: user.username, email: user.email, role: user.role || 'user' }; },
    listUsers() { return readDb().users.map(u => this.publicUser(u)); },
    findUserById(userId) { return readDb().users.find(u => u.id === userId); },
    findUserByLogin(login) { const v = String(login || '').toLowerCase(); return readDb().users.find(u => u.username.toLowerCase() === v || u.email.toLowerCase() === v); },
    userExists(username, email) { const db = readDb(); return db.users.some(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase()); },
    createUser(data) { const db = readDb(); const user = { id: id(), username: data.username, email: data.email, password_hash: data.password_hash, role: data.role || 'user', created_at: now() }; db.users.push(user); writeDb(db); return user; },
    listDocuments(user) { return readDb().documents.filter(d => d.owner_id === user.id).map(d => ({ id: d.id, title: d.title, updated_at: d.updated_at })); },
    getDocument(docId) { return readDb().documents.find(d => d.id === docId); },
    createDocument(ownerId, title, content = '') { const db = readDb(); const doc = { id: id(), owner_id: ownerId, title, content, created_at: now(), updated_at: now() }; db.documents.unshift(doc); writeDb(db); return doc; },
    updateDocument(docId, data) { const db = readDb(); const doc = db.documents.find(d => d.id === docId); if (!doc) return null; doc.title = data.title ?? doc.title; doc.content = data.content ?? doc.content; doc.updated_at = now(); writeDb(db); return doc; },
    deleteDocument(docId) { const db = readDb(); db.documents = db.documents.filter(d => d.id !== docId); writeDb(db); }
};
