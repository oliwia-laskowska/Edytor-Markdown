export class ApiClient {
    constructor() {
        this.token = localStorage.getItem('token') || '';
    }

    setToken(token) {
        this.token = token || '';

        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    async request(path, options = {}) {
        const response = await fetch(`/api${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(this.token
                    ? { Authorization: `Bearer ${this.token}` }
                    : {}),
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'Błąd serwera');
        }

        return data;
    }

    login(body) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    register(body) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    me() {
        return this.request('/me');
    }

    users() {
        return this.request('/users');
    }

    makeAdmin(id) {
        return this.request(`/users/${id}/admin`, {
            method: 'POST'
        });
    }

    documents() {
        return this.request('/documents');
    }

    createDocument(title) {
        return this.request('/documents', {
            method: 'POST',
            body: JSON.stringify({ title })
        });
    }

    getDocument(id) {
        return this.request(`/documents/${id}`);
    }

    saveDocument(id, doc) {
        return this.request(`/documents/${id}`, {
            method: 'PUT',
            body: JSON.stringify(doc)
        });
    }

    deleteDocument(id) {
        return this.request(`/documents/${id}`, {
            method: 'DELETE'
        });
    }

    versions(id) {
        return this.request(`/documents/${id}/versions`);
    }

    restoreVersion(id, versionId) {
        return this.request(
            `/documents/${id}/versions/${versionId}/restore`,
            {
                method: 'POST'
            }
        );
    }

    shareDocument(id, login) {
        return this.request(`/documents/${id}/share`, {
            method: 'POST',
            body: JSON.stringify({ login })
        });
    }

    unshareDocument(id, userId) {
        return this.request(`/documents/${id}/share/${userId}`, {
            method: 'DELETE'
        });
    }
}