let token = localStorage.getItem('token'),
    current = null;

const $ = s => document.querySelector(s),
    msg = $('#msg');

function show(t, ok = false) {
    msg.className = 'alert mt-3 alert-' + (ok ? 'success' : 'danger');
    msg.textContent = t;
}

async function api(p, o = {}) {
    const r = await fetch(p, {
        ...o,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            ...o.headers
        }
    });

    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Błąd');
    return d;
}

async function auth(path, form) {
    const d = await api(path, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        headers: {
            Authorization: ''
        }
    });
    token = d.token;
    localStorage.setItem('token', token);
    boot();
}

async function load() {
    const docs = await api('/api/documents');
    $('#docs').innerHTML = '';
    docs.forEach(d => {
        const a = document.createElement('button');
        a.className = 'list-group-item list-group-item-action';
        a.textContent = d.title;
        a.onclick = () => {
            current = d;
            $('#title').value = d.title;
            $('#editor').value = d.content || '';
        };
        $('#docs').appendChild(a);
    });
}

function boot() {
    $('#auth').classList.toggle('hidden', !!token);
    $('#app').classList.toggle('hidden', !token);
    if (token) load().catch(e => show(e.message));
}

$('#login').addEventListener('submit', e => {
    e.preventDefault();
    auth('/api/login', e.target).catch(e => show(e.message));
});

$('#register').addEventListener('submit', e => {
    e.preventDefault();
    auth('/api/register', e.target).catch(e => show(e.message));
});

$('#newDoc').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        current = await api('/api/documents', {
            method: 'POST',
            body: JSON.stringify({
                title: new FormData(e.target).get('title')
            })
        });
        e.target.reset();
        await load();
        show('Utworzono', true);
    } catch (err) {
        show(err.message);
    }
});

$('#save').onclick = () => current && api('/api/documents/' + current.id, {
    method: 'PUT',
    body: JSON.stringify({
        content: $('#editor').value
    })
}).then(() => show('Zapisano', true)).catch(e => show(e.message));

$('#delete').onclick = () => current && api('/api/documents/' + current.id, {
    method: 'DELETE'
}).then(() => {
    current = null;
    $('#editor').value = '';
    load();
    show('Usunięto', true);
}).catch(e => show(e.message));

$('#logout').onclick = () => {
    localStorage.clear();
    token = null;
    boot();
};

boot();