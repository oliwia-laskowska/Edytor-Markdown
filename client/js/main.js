import { ApiClient } from './api.js';
import { MarkdownEditor } from './editor.js';
import { RealtimeSocket } from './socket.js';
import {
    $,
    toast,
    formData,
    renderDocs
} from './ui.js';

const api = new ApiClient();
const socket = new RealtimeSocket(api);

let user = null;
let docs = {
    own: [],
    shared: []
};

let current = null;
let dirty = false;
let applyingRemote = false;
let canManage = false;

let undoStack = [];
let redoStack = [];
let lastSnapshot = '';

const editor = new MarkdownEditor(
    $('#markdownInput'),
    $('#preview')
);

function pushUndo(value) {
    if (value !== lastSnapshot) {
        undoStack.push(lastSnapshot);

        if (undoStack.length > 50) {
            undoStack.shift();
        }

        lastSnapshot = value;
        redoStack = [];
    }
}

editor.onChange = (value) => {
    dirty = true;

    if (!applyingRemote) {
        pushUndo(value);
        socket.sendEdit(value);
    }
};

socket.onStatus = (status) => {
    $('#connectionBadge').textContent = status;

    $('#connectionBadge').className =
        'badge ms-2 ' +
        (status === 'online'
            ? 'text-bg-success'
            : 'text-bg-secondary');
};

socket.onRemoteEdit = (content, remoteUser) => {
    applyingRemote = true;

    editor.setValue(content);
    lastSnapshot = content;

    applyingRemote = false;
    dirty = false;

    toast(`Zmiana od ${remoteUser.username}`);
};

socket.onPresence = (users) => {
    $('#onlineUsers').innerHTML = '';

    users.forEach((u) => {
        const li = document.createElement('li');

        li.textContent = u.username;

        $('#onlineUsers').appendChild(li);
    });
};

function showAuth() {
    $('#authView').classList.remove('d-none');
    $('#appView').classList.add('d-none');

    $('#logoutBtn').classList.add('d-none');
    $('#currentUser').textContent = '';

    socket.close();
}

function showApp() {
    $('#authView').classList.add('d-none');
    $('#appView').classList.remove('d-none');

    $('#logoutBtn').classList.remove('d-none');

    $('#currentUser').textContent =
        `${user.username} (${user.role})`;

    socket.connect();

    $('#adminPanel').classList.toggle(
        'd-none',
        user.role !== 'admin'
    );
}

async function loadDocs() {
    const data = await api.documents();

    docs = data.documents;

    renderDocs(
        $('#docsList'),
        docs.own,
        current?.id
    );

    renderDocs(
        $('#sharedDocsList'),
        docs.shared,
        current?.id
    );
}

async function loadUsers() {
    if (user?.role !== 'admin') {
        return;
    }

    const box = $('#usersList');

    box.innerHTML = '';

    const data = await api.users();

    data.users.forEach((u) => {
        const row = document.createElement('div');

        row.className =
            'list-group-item d-flex justify-content-between align-items-center';

        row.innerHTML = `
      <span>
        ${u.username}
        <small class="text-muted">${u.role}</small>
      </span>
    `;

        if (u.role !== 'admin') {
            const button = document.createElement('button');

            button.className =
                'btn btn-outline-primary btn-sm';

            button.textContent = 'Uczyń adminem';
            button.dataset.adminId = u.id;

            row.appendChild(button);
        }

        box.appendChild(row);
    });
}

function renderSharedUsers(users = []) {
    const box = $('#sharedUsersList');

    box.innerHTML = '';

    users.forEach((u) => {
        const row = document.createElement('div');

        row.className =
            'list-group-item d-flex justify-content-between align-items-center';

        row.innerHTML = `<span>${u.username}</span>`;

        if (canManage) {
            const button = document.createElement('button');

            button.className =
                'btn btn-outline-danger btn-sm';

            button.textContent = 'Odbierz';
            button.dataset.unshareId = u.id;

            row.appendChild(button);
        }

        box.appendChild(row);
    });

    $('#shareForm').classList.toggle(
        'd-none',
        !canManage
    );
}

async function loadVersions() {
    const box = $('#versionsList');

    box.innerHTML = '';

    if (!current) {
        return;
    }

    const data = await api.versions(current.id);

    data.versions.forEach((v) => {
        const button = document.createElement('button');

        button.className =
            'list-group-item list-group-item-action';

        button.dataset.versionId = v.id;

        button.innerHTML = `
      <strong>${v.label || 'wersja'}</strong><br>
      <span class="text-muted">
        ${new Date(v.created_at).toLocaleString()}
      </span>
    `;

        box.appendChild(button);
    });
}

async function openDoc(id) {
    if (dirty && current) {
        await saveDoc();
    }

    const data = await api.getDocument(id);

    current = data.document;
    canManage = !!data.canManage;

    dirty = false;

    undoStack = [];
    redoStack = [];

    lastSnapshot = current.content;

    $('#titleInput').value = current.title;

    editor.setValue(current.content);

    renderDocs(
        $('#docsList'),
        docs.own,
        current.id
    );

    renderDocs(
        $('#sharedDocsList'),
        docs.shared,
        current.id
    );

    socket.join(current.id);

    renderSharedUsers(data.sharedUsers || []);

    await loadVersions();
}

async function saveDoc() {
    if (!current) {
        return;
    }

    const data = await api.saveDocument(
        current.id,
        {
            title: $('#titleInput').value,
            content: editor.getValue()
        }
    );

    current = data.document;

    dirty = false;
    lastSnapshot = current.content;

    await loadDocs();
    await loadVersions();

    toast('Zapisano plik');
}

async function afterLogin(data) {
    api.setToken(data.token);

    user = data.user;

    showApp();

    await loadDocs();
    await loadUsers();
}

$('#showLoginBtn').addEventListener(
    'click',
    () => {
        $('#loginForm').classList.remove('d-none');
        $('#registerForm').classList.add('d-none');
    }
);

$('#showRegisterBtn').addEventListener(
    'click',
    () => {
        $('#registerForm').classList.remove('d-none');
        $('#loginForm').classList.add('d-none');
    }
);

$('#loginForm').addEventListener(
    'submit',
    async (e) => {
        e.preventDefault();

        try {
            const data = await api.login(
                formData(e.target)
            );

            await afterLogin(data);
        } catch (err) {
            $('#authError').textContent = err.message;

            $('#authError').classList.remove('d-none');
        }
    }
);

$('#registerForm').addEventListener(
    'submit',
    async (e) => {
        e.preventDefault();

        try {
            const data = await api.register(
                formData(e.target)
            );

            await afterLogin(data);
        } catch (err) {
            $('#authError').textContent = err.message;

            $('#authError').classList.remove('d-none');
        }
    }
);

$('#logoutBtn').addEventListener(
    'click',
    () => {
        api.setToken('');

        user = null;
        current = null;

        showAuth();
    }
);

$('#newDocForm').addEventListener(
    'submit',
    async (e) => {
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
    }
);

$('#docsList').addEventListener(
    'click',
    (e) => {
        const button = e.target.closest('[data-id]');

        if (button) {
            openDoc(button.dataset.id);
        }
    }
);

$('#sharedDocsList').addEventListener(
    'click',
    (e) => {
        const button = e.target.closest('[data-id]');

        if (button) {
            openDoc(button.dataset.id);
        }
    }
);

$('#saveBtn').addEventListener(
    'click',
    () => {
        saveDoc().catch((err) => {
            toast(err.message);
        });
    }
);

$('#deleteBtn').addEventListener(
    'click',
    async () => {
        if (!current) {
            return;
        }

        if (!canManage) {
            return toast('Nie możesz usunąć tego pliku');
        }

        if (!confirm('Usunąć plik?')) {
            return;
        }

        await api.deleteDocument(current.id);

        current = null;
        dirty = false;

        socket.documentId = null;

        $('#titleInput').value = '';

        editor.setValue('');

        $('#versionsList').innerHTML = '';
        $('#sharedUsersList').innerHTML = '';

        await loadDocs();

        toast('Usunięto plik');
    }
);

$('#undoBtn').addEventListener(
    'click',
    () => {
        if (!undoStack.length) {
            return;
        }

        redoStack.push(editor.getValue());

        const value = undoStack.pop();

        applyingRemote = true;

        editor.setValue(value);

        applyingRemote = false;

        lastSnapshot = value;
        dirty = true;

        socket.sendEdit(value);
    }
);

$('#redoBtn').addEventListener(
    'click',
    () => {
        if (!redoStack.length) {
            return;
        }

        undoStack.push(editor.getValue());

        const value = redoStack.pop();

        applyingRemote = true;

        editor.setValue(value);

        applyingRemote = false;

        lastSnapshot = value;
        dirty = true;

        socket.sendEdit(value);
    }
);

$('#versionsList').addEventListener(
    'click',
    async (e) => {
        const button = e.target.closest(
            '[data-version-id]'
        );

        if (!button || !current) {
            return;
        }

        if (!confirm('Przywrócić tę wersję?')) {
            return;
        }

        const data = await api.restoreVersion(
            current.id,
            button.dataset.versionId
        );

        current = data.document;

        $('#titleInput').value = current.title;

        editor.setValue(current.content);

        lastSnapshot = current.content;
        dirty = false;

        await loadVersions();

        toast('Przywrócono wersję');
    }
);

$('#shareForm').addEventListener(
    'submit',
    async (e) => {
        e.preventDefault();

        if (!current || !canManage) {
            return;
        }

        try {
            const login = formData(e.target).login;

            const data = await api.shareDocument(
                current.id,
                login
            );

            e.target.reset();

            renderSharedUsers(data.sharedUsers);

            toast('Nadano dostęp');
        } catch (err) {
            toast(err.message);
        }
    }
);

$('#sharedUsersList').addEventListener(
    'click',
    async (e) => {
        const button = e.target.closest(
            '[data-unshare-id]'
        );

        if (
            !button ||
            !current ||
            !canManage
        ) {
            return;
        }

        const data = await api.unshareDocument(
            current.id,
            button.dataset.unshareId
        );

        renderSharedUsers(data.sharedUsers);

        toast('Odebrano dostęp');
    }
);

$('#usersList').addEventListener(
    'click',
    async (e) => {
        const button = e.target.closest(
            '[data-admin-id]'
        );

        if (!button) {
            return;
        }

        await api.makeAdmin(
            button.dataset.adminId
        );

        await loadUsers();

        toast('Użytkownik jest adminem');
    }
);

api.me()
    .then((data) => {
        user = data.user;

        showApp();

        loadDocs();
        loadUsers();
    })
    .catch(showAuth);