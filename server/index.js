import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createUser, verifyUser, listDocs, createDoc, saveDoc, deleteDoc } from './store.js';
import { auth, signUser } from './auth.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));


app.post('/api/register', async (req, res) => {
    try {
        const u = await createUser(req.body.username?.trim(), req.body.password);
        res.status(201).json({
            token: signUser(u),
            user: u
        });
    } catch (e) {
        res.status(400).json({
            message: e.message
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const u = await verifyUser(req.body.username?.trim(), req.body.password);
        res.json({
            token: signUser(u),
            user: u
        });
    } catch (e) {
        res.status(401).json({
            message: e.message
        });
    }
});

// --- Endpointy CRUD Dokumentów ---

app.get('/api/documents', auth, async (req, res) => {
    res.json(await listDocs(req.user));
});

app.post('/api/documents', auth, async (req, res) => {
    try {
        const doc = await createDoc(req.user, req.body.title || 'Nowy dokument');
        res.status(201).json(doc);
    } catch (e) {
        res.status(400).json({
            message: e.message
        });
    }
});

app.put('/api/documents/:id', auth, async (req, res) => {
    try {
        const doc = await saveDoc(req.user, req.params.id, req.body.content || '');
        res.json(doc);
    } catch (e) {
        res.status(400).json({
            message: e.message
        });
    }
});

app.delete('/api/documents/:id', auth, async (req, res) => {
    try {
        await deleteDoc(req.user, req.params.id);
        res.json({
            ok: true
        });
    } catch (e) {
        res.status(403).json({
            message: e.message
        });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Etap 2: http://localhost:${PORT}`);
});