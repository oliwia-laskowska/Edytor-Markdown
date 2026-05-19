export function $(selector) {
    return document.querySelector(selector);
}

export function toast(message) {
    const element = document.createElement('div');

    element.className = 'toast-msg';
    element.textContent = message;

    $('#toastBox').appendChild(element);

    setTimeout(() => {
        element.remove();
    }, 3000);
}

export function formData(form) {
    return Object.fromEntries(
        new FormData(form).entries()
    );
}

export function renderDocs(
    container,
    docs,
    currentId
) {
    container.innerHTML = '';

    docs.forEach((doc) => {
        const button = document.createElement('button');

        button.className =
            'list-group-item list-group-item-action' +
            (doc.id === currentId
                ? ' active'
                : '');

        button.dataset.id = doc.id;

        button.innerHTML = `
      <strong>${doc.title}</strong><br>
      <small class="text-muted">
        ${new Date(doc.updated_at).toLocaleString()}
      </small>
    `;

        container.appendChild(button);
    });
}