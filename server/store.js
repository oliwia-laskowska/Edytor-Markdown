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
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    db.users ||= []; db.documents ||= [];
    db.documents.forEach(d => { d.versions ||= []; d.shared_with ||= []; });
    return db;
}
function writeDb(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
function versionFrom(doc, label = 'autosave') { return { id: id(), title: doc.title, content: doc.content, label, created_at: now() }; }

export const store = {
    dbPath, readDb, writeDb,
    publicUser(user) { return { id: user.id, username: user.username, email: user.email, role: user.role || 'user' }; },
    listUsers() { return readDb().users.map(u => this.publicUser(u)); },
    findUserById(userId) { return readDb().users.find(u => u.id === userId); },
    findUserByLogin(login) { const v = String(login || '').toLowerCase(); return readDb().users.find(u => u.username.toLowerCase() === v || u.email.toLowerCase() === v); },
    userExists(username, email) { const db = readDb(); return db.users.some(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase()); },
    createUser(data) { const db = readDb(); const user = { id: id(), username: data.username, email: data.email, password_hash: data.password_hash, role: data.role || 'user', created_at: now() }; db.users.push(user); writeDb(db); return user; },
    makeAdmin(userId) { const db = readDb(); const u = db.users.find(x => x.id === userId); if (!u) return null; u.role = 'admin'; writeDb(db); return this.publicUser(u); },
    canAccess(doc, user) { return !!doc && (user.role === 'admin' || doc.owner_id === user.id || (doc.shared_with || []).includes(user.id)); },
    canManage(doc, user) { return !!doc && (user.role === 'admin' || doc.owner_id === user.id); },
    listDocuments(user) {
        const db = readDb();
        const own = db.documents.filter(d => d.owner_id === user.id).map(d => ({ id: d.id, title: d.title, updated_at: d.updated_at, access: 'owner' }));
        const shared = db.documents.filter(d => d.owner_id !== user.id && (d.shared_with || []).includes(user.id)).map(d => ({ id: d.id, title: d.title, updated_at: d.updated_at, access: 'shared' }));
        return { own, shared };
    },
    getDocument(docId) { return readDb().documents.find(d => d.id === docId); },
    createDocument(ownerId, title, content = '') { const db = readDb(); const doc = { id: id(), owner_id: ownerId, title, content, shared_with: [], versions: [], created_at: now(), updated_at: now() }; doc.versions.push(versionFrom(doc, 'utworzenie')); db.documents.unshift(doc); writeDb(db); return doc; },
    updateDocument(docId, data, label = 'zapis') { const db = readDb(); const doc = db.documents.find(d => d.id === docId); if (!doc) return null; doc.versions ||= []; doc.shared_with ||= []; const changed = (data.title !== undefined && data.title !== doc.title) || (data.content !== undefined && data.content !== doc.content); doc.title = data.title ?? doc.title; doc.content = data.content ?? doc.content; doc.updated_at = now(); if (changed) doc.versions.unshift(versionFrom(doc, label)); doc.versions = doc.versions.slice(0, 30); writeDb(db); return doc; },
    listVersions(docId) { const doc = this.getDocument(docId); if (!doc) return []; return (doc.versions || []).map(v => ({ id: v.id, title: v.title, label: v.label, created_at: v.created_at })); },
    restoreVersion(docId, versionId) { const db = readDb(); const doc = db.documents.find(d => d.id === docId); if (!doc) return null; const version = (doc.versions || []).find(v => v.id === versionId); if (!version) return null; doc.title = version.title; doc.content = version.content; doc.updated_at = now(); doc.versions.unshift(versionFrom(doc, 'przywrócenie wersji')); writeDb(db); return doc; },
    shareDocument(docId, usernameOrEmail) { const db = readDb(); const doc = db.documents.find(d => d.id === docId); const user = db.users.find(u => u.username.toLowerCase() === String(usernameOrEmail).toLowerCase() || u.email.toLowerCase() === String(usernameOrEmail).toLowerCase()); if (!doc || !user) return null; doc.shared_with ||= []; if (user.id !== doc.owner_id && !doc.shared_with.includes(user.id)) doc.shared_with.push(user.id); writeDb(db); return doc; },
    unshareDocument(docId, userId) { const db = readDb(); const doc = db.documents.find(d => d.id === docId); if (!doc) return null; doc.shared_with = (doc.shared_with || []).filter(id => id !== userId); writeDb(db); return doc; },
    getSharedUsers(docId) { const db = readDb(); const doc = db.documents.find(d => d.id === docId); if (!doc) return []; return db.users.filter(u => (doc.shared_with || []).includes(u.id)).map(u => this.publicUser(u)); },
    deleteDocument(docId) { const db = readDb(); db.documents = db.documents.filter(d => d.id !== docId); writeDb(db); }
};
