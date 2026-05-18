export function $(s) {
    return document.querySelector(s);
}

export function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = message;

    $('#toastBox').appendChild(el);

    setTimeout(() => el.remove(), 3000);
}

export function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
}

export function renderDocs(container, docs, currentId) {
    container.innerHTML = '';

    docs.forEach(doc => {
        const btn = document.createElement('button');
        btn.className = 'list-group-item list-group-item-action' + (doc.id === currentId ? ' active' : '');
        btn.dataset.id = doc.id;
        btn.innerHTML = `<strong>${doc.title}</strong><br><small class="text-muted">${new Date(doc.updated_at).toLocaleString()}</small>`;

        container.appendChild(btn);
    });
}