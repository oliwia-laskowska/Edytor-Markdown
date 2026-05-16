import { ApiClient } from './api.js';
import { MarkdownEditor } from './editor.js';
import { $, toast, formData, renderDocs } from './ui.js';

const api = new ApiClient();
let user = null, docs = [], current = null, dirty = false;

const editor = new MarkdownEditor($('#markdownInput'), $('#preview'));
editor.onChange = () => { dirty = true };

function showAuth() {
    $('#authView').classList.remove('d-none');
    $('#appView').classList.add('d-none');
    $('#logoutBtn').classList.add('d-none');
    $('#currentUser').textContent = '';
}

function showApp() {
    $('#authView').classList.add('d-none');
    $('#appView').classList.remove('d-none');
    $('#logoutBtn').classList.remove('d-none');
    $('#currentUser').textContent = user.username;
}

async function loadDocs() {
    const data = await api.documents();
    docs = data.documents;
    renderDocs($('#docsList'), docs, current?.id);
}

async function openDoc(id) {
    if (dirty && current) await saveDoc();
    const data = await api.getDocument(id);
    current = data.document;
    dirty = false;
    $('#titleInput').value = current.title;
    editor.setValue(current.content);
    renderDocs($('#docsList'), docs, current.id);
}

async function saveDoc() {
    if (!current) return;
    const data = await api.saveDocument(current.id, {
        title: $('#titleInput').value,
        content: editor.getValue()
    });
    current = data.document;
    dirty = false;
    await loadDocs();
    toast('Zapisano plik');
}

async function afterLogin(data) {
    api.setToken(data.token);
    user = data.user;
    showApp();
    await loadDocs();
}

$('#showLoginBtn').addEventListener('click', () => {
    $('#loginForm').classList.remove('d-none');
    $('#registerForm').classList.add('d-none');
});

$('#showRegisterBtn').addEventListener('click', () => {
    $('#registerForm').classList.remove('d-none');
    $('#loginForm').classList.add('d-none');
});

$('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        await afterLogin(await api.login(formData(e.target)));
    } catch (err) {
        $('#authError').textContent = err.message;
        $('#authError').classList.remove('d-none');
    }
});

$('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        await afterLogin(await api.register(formData(e.target)));
    } catch (err) {
        $('#authError').textContent = err.message;
        $('#authError').classList.remove('d-none');
    }
});

$('#logoutBtn').addEventListener('click', () => {
    api.setToken('');
    user = null;
    current = null;
    showAuth();
});

$('#newDocForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        const title = formData(e.target).title;
        const data = await api.createDocument(title);
        e.target.reset();
        await loadDocs();
        await openDoc(data.document.id);
        toast('Utworzono plik');
    } catch (err) {
        toast(err.message);
    }
});

$('#docsList').addEventListener('click', e => {
    const btn = e.target.closest('[data-id]');
    if (btn) openDoc(btn.dataset.id);
});

$('#saveBtn').addEventListener('click', () => saveDoc().catch(err => toast(err.message)));

$('#deleteBtn').addEventListener('click', async () => {
    if (!current) return;
    if (!confirm('Usunąć plik?')) return;
    await api.deleteDocument(current.id);
    current = null;
    dirty = false;
    $('#titleInput').value = '';
    editor.setValue('');
    await loadDocs();
    toast('Usunięto plik');
});

api.me()
    .then(d => {
        user = d.user;
        showApp();
        loadDocs();
    })
    .catch(showAuth);