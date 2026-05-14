import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const dir = path.join(process.cwd(), 'data');
const file = path.join(dir, 'db.json');


export async function readDb() {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        await resetDatabase();
        return JSON.parse(await fs.readFile(file, 'utf8'));
    }
}

export async function writeDb(db) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 2));
}

export function strongPassword(p) {
    return typeof p === 'string' &&
        p.length >= 6 &&
        /[A-Z]/.test(p) &&
        /[0-9]/.test(p) &&
        /[^A-Za-z0-9]/.test(p);
}

export async function resetDatabase() {
    const admin = {
        id: uuid(),
        username: 'admin',
        passwordHash: await bcrypt.hash('Admin123!', 10),
        role: 'admin'
    };
    const student = {
        id: uuid(),
        username: 'student',
        passwordHash: await bcrypt.hash('User123!', 10),
        role: 'user'
    };

    await writeDb({
        users: [admin, student],
        documents: [{
            id: uuid(),
            title: 'Demo',
            content: '# Demo',
            ownerId: student.id,
            sharedWith: [],
            updatedAt: new Date().toISOString()
        }],
        versions: []
    });
}


export async function createUser(username, password) {
    const db = await readDb();

    if (!strongPassword(password)) {
        throw new Error('Haslo musi miec min. 6 znakow, duza litere, cyfre i znak specjalny.');
    }
    if (db.users.some(u => u.username === username)) {
        throw new Error('Uzytkownik istnieje.');
    }

    const user = {
        id: uuid(),
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'user'
    };

    db.users.push(user);
    await writeDb(db);
    return user;
}

export async function verifyUser(username, password) {
    const db = await readDb();
    const u = db.users.find(x => x.username === username);

    if (!u || !await bcrypt.compare(password, u.passwordHash)) {
        throw new Error('Bledny login lub haslo.');
    }
    return u;
}


export async function listDocs(user) {
    const db = await readDb();
    return db.documents.filter(d =>
        d.ownerId === user.id ||
        d.sharedWith.includes(user.id) ||
        user.role === 'admin'
    );
}

export async function createDoc(user, title) {
    const db = await readDb();
    const doc = {
        id: uuid(),
        title,
        content: '',
        ownerId: user.id,
        sharedWith: [],
        updatedAt: new Date().toISOString()
    };

    db.documents.push(doc);
    await writeDb(db);
    return doc;
}

export async function saveDoc(user, id, content) {
    const db = await readDb();
    const doc = db.documents.find(d => d.id === id);

    if (!doc) throw new Error('Brak dokumentu');

    const hasAccess = doc.ownerId === user.id ||
        doc.sharedWith.includes(user.id) ||
        user.role === 'admin';

    if (!hasAccess) throw new Error('Brak dostepu');

    doc.content = content;
    doc.updatedAt = new Date().toISOString();

    await writeDb(db);
    return doc;
}

export async function deleteDoc(user, id) {
    const db = await readDb();
    const i = db.documents.findIndex(d =>
        d.id === id && (d.ownerId === user.id || user.role === 'admin')
    );

    if (i < 0) throw new Error('Brak uprawnien');

    db.documents.splice(i, 1);
    await writeDb(db);
}