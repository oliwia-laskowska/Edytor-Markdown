export class UI {
    // Mapowanie elementów drzewa DOM do właściwości instancji w celu szybkiego dostępu (buforowanie referencji)
    constructor() {
        this.authView = document.querySelector('#authView');                 // Ekran autoryzacji (logowanie/rejestracja)
        this.appView = document.querySelector('#appView');                   // Główny panel aplikacji po zalogowaniu
        this.toastBox = document.querySelector('#toastBox');                 // Kontener na powiadomienia asynchroniczne
        this.connectionBadge = document.querySelector('#connectionBadge');   // Wizualny wskaźnik stanu gniazda WebSocket
        this.currentUser = document.querySelector('#currentUser');           // Etykieta profilu aktualnego użytkownika
    }

    // Przełącza interfejs w tryb zalogowanego użytkownika i konfiguruje widoczność modułów na podstawie przypisanej roli
    showApp(user) {
        this.authView.classList.add('d-none');
        this.appView.classList.remove('d-none');
        this.currentUser.textContent = `${user.username} (${user.role})`;
        document.querySelector('#logoutBtn').classList.remove('d-none');

        // Dynamiczne wyświetlanie/ukrywanie panelu administracyjnego na podstawie uprawnień użytkownika
        document.querySelector('#adminPanel')?.classList.toggle('d-none', user.role !== 'admin');
    }

    // Przywraca stan początkowy interfejsu (ekran logowania) oraz czyści metadane sesji w widoku
    showAuth() {
        this.authView.classList.remove('d-none');
        this.appView.classList.add('d-none');
        this.currentUser.textContent = '';
        document.querySelector('#logoutBtn').classList.add('d-none');
    }

    // Tworzy dynamicznie i zarządza cyklem życia krótkotrwałych komunikatów powiadomień (Toast)
    toast(message, variant = 'dark') {
        const div = document.createElement('div');
        div.className = `app-toast bg-${variant}`;
        div.textContent = message;
        this.toastBox.appendChild(div);

        // Automatyczne usuwanie elementu z drzewa DOM po upływie 3.5 sekundy
        setTimeout(() => div.remove(), 3500);
    }

    // Aktualizuje tekst oraz klasy CSS badge'a sieciowego, informując o bieżącym statusie połączenia
    status(label, variant) {
        this.connectionBadge.textContent = label;
        this.connectionBadge.className = `badge text-bg-${variant} ms-2`;
    }

    // Generuje strukturę list dokumentów z podziałem na pliki własne użytkownika oraz udostępnione przez innych
    renderDocuments(docs, selectedId, currentUserId) {
        const box = document.querySelector('#docsList');
        box.innerHTML = ''; // Czyszczenie listy przed ponownym renderowaniem

        const groups = [
            { title: 'Moje pliki', items: docs.filter(d => d.owner_id === currentUserId) },
            { title: 'Udostępnione mi', items: docs.filter(d => d.owner_id !== currentUserId) }
        ];

        groups.forEach((group) => {
            const heading = document.createElement('div');
            heading.className = 'text-uppercase small fw-bold text-muted px-2 mt-2 mb-1';
            heading.textContent = group.title;
            box.appendChild(heading);

            // Renderowanie etykiety zastępczej w przypadku pustej grupy plików
            if (!group.items.length) {
                const empty = document.createElement('div');
                empty.className = 'small text-muted px-2 mb-2';
                empty.textContent = 'Brak';
                box.appendChild(empty);
            }

            // Iteracja po elementach i wstrzykiwanie węzłów przycisków z metadanymi
            group.items.forEach((doc) => {
                const button = document.createElement('button');
                button.className = `list-group-item list-group-item-action ${doc.id === selectedId ? 'active' : ''}`;
                button.dataset.id = doc.id; // Przechowywanie ID w atrybucie danych dla kontrolera
                button.innerHTML = `<strong>${doc.title}</strong><br><span class="text-muted">właściciel: ${doc.owner_name || ''} • dostęp: ${doc.access_count || 1}</span>`;
                box.appendChild(button);
            });
        });
    }

    // Wyświetla listę użytkowników aktualnie przeglądających lub edytujących dokument w czasie rzeczywistym
    renderUsers(users) {
        const ul = document.querySelector('#onlineUsers');
        ul.innerHTML = '';
        users.forEach((user) => {
            const li = document.createElement('li');
            li.textContent = `● ${user.username}`;
            ul.appendChild(li);
        });
    }

    // Renderuje historię rewizji i punktów zapisu (wersji) aktualnego dokumentu z bazy danych
    renderVersions(versions) {
        const list = document.querySelector('#versionsList');
        list.innerHTML = '';
        versions.forEach((version) => {
            const item = document.createElement('button');
            item.className = 'list-group-item list-group-item-action';
            item.dataset.versionId = version.id;
            item.innerHTML = `<strong>${version.label}</strong><br><span class="text-muted">${version.username}, clock ${version.clock}<br>${version.created_at}</span>`;
            list.appendChild(item);
        });
    }

    // Zarządza panelem kontroli dostępu: wyświetla uprawnionych oraz filtruje listę wyboru dla nowych nadań
    renderAccess(access, users, canManage) {
        const list = document.querySelector('#accessList');
        const select = document.querySelector('#accessUserSelect');
        const form = document.querySelector('#grantAccessForm');

        list.innerHTML = '';
        select.innerHTML = '<option value="">Wybierz użytkownika...</option>';

        // Ukrywanie formularza nadawania praw, jeśli bieżący użytkownik nie ma uprawnień właściciela (canManage)
        form.classList.toggle('d-none', !canManage);

        // Renderowanie listy podmiotów posiadających prawa do dokumentu
        access.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center gap-2';
            item.innerHTML = `<span><strong>${entry.user.username}</strong><br><small>${entry.role} • ${entry.user.email}</small></span>`;

            // Jeśli użytkownik zarządza plikiem, dodawany jest przycisk umożliwiający odebranie uprawnień (z wyłączeniem właściciela)
            if (canManage && entry.role !== 'owner') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-outline-danger btn-sm';
                btn.dataset.revokeUserId = entry.user.id;
                btn.textContent = 'Odbierz';
                item.appendChild(btn);
            }
            list.appendChild(item);
        });

        // Odfiltrowanie i budowanie listy rozwijanej (select) – pokazuje tylko tych, którzy nie mają jeszcze dostępu
        const granted = new Set(access.map(a => a.user.id));
        users.filter(u => !granted.has(u.id)).forEach((user) => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.username} (${user.email})`;
            select.appendChild(option);
        });
    }

    // Renderuje listę wszystkich użytkowników systemu w panelu administracyjnym, umożliwiając zmianę ról
    renderAdminUsers(users, currentUserId) {
        const list = document.querySelector('#adminUsersList');
        list.innerHTML = '';
        users.forEach((user) => {
            const row = document.createElement('div');
            row.className = 'list-group-item d-flex justify-content-between align-items-center gap-2';
            row.innerHTML = `<span><strong>${user.username}</strong><br><small>${user.email} • ${user.role}</small></span>`;

            // Blokada uniemożliwiająca administratorowi odebranie uprawnień samemu sobie w widoku
            if (user.id !== currentUserId) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-outline-secondary btn-sm';
                btn.dataset.roleUserId = user.id;
                // Obliczanie nowej roli docelowej (przełącznik admin <-> user)
                btn.dataset.nextRole = user.role === 'admin' ? 'user' : 'admin';
                btn.textContent = user.role === 'admin' ? 'Zmień na user' : 'Zmień na admin';
                row.appendChild(btn);
            }
            list.appendChild(row);
        });
    }
}