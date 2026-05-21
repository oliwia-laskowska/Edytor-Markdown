// Ogranicza częstotliwość wykonywania funkcji (Debouncing) – przydatne przy optymalizacji zdarzeń typu 'input'
export function debounce(fn, delay = 300) {
    let timer; // Przechowuje identyfikator aktywnego timera w domknięciu (closure)
    return (...args) => {
        clearTimeout(timer); // Resetuje poprzednio zaplanowane wywołanie, jeśli użytkownik nadal wprowadza dane
        timer = setTimeout(() => fn(...args), delay); // Rejestruje nowe wywołanie po upływie zdefiniowanego czasu opóźnienia
    };
}

// Algorytm wyliczania minimalnej różnicy (Diff) między dwiema wersjami tekstu
// Konwertuje zmianę w atomową operację edycyjną typu 'replace' (pozycja, liczba usuniętych znaków, wstawiony tekst)
export function diffToOperation(oldText, newText) {
    let start = 0;
    // Iteracja od początku tekstu w celu znalezienia pierwszego indeksu, na którym znaki zaczynają się różnić
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;

    let oldEnd = oldText.length - 1;
    let newEnd = newText.length - 1;
    // Iteracja od końca tekstu w celu zlokalizowania punktu zakończenia modyfikacji (z uwzględnieniem indeksu startowego)
    while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) { oldEnd--; newEnd--; }

    // Zwraca spakowany obiekt operacji:
    // pos  - indeks rozpoczęcia edycji
    // del  - liczba znaków wyciętych ze starego tekstu
    // text - nowy ciąg znaków wstawiany w miejsce usuniętych
    return {
        type: 'replace',
        pos: start,
        del: Math.max(0, oldEnd - start + 1),
        text: newText.slice(start, newEnd + 1)
    };
}

// Aplikuje otrzymaną operację edycyjną na przekazanej zawartości tekstowej i zwraca zmodyfikowany ciąg znaków
export function applyOperation(content, op) {
    // Łączy niezmieniony lewy segment, nowy wstawiany tekst oraz niezmieniony prawy segment (pomijając znaki usunięte)
    return content.slice(0, op.pos) + (op.text || '') + content.slice(op.pos + (op.del || 0));
}

// Bezpiecznie konwertuje znaki specjalne tekstu na encje HTML przy użyciu wbudowanego mechanizmu przeglądarki
// Zapobiega atakom typu Cross-Site Scripting (XSS) podczas renderowania niezweryfikowanej zawartości
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text; // Przypisanie jako textContent powoduje automatyczne zakodowanie znaków takich jak <, >, &
    return div.innerHTML;   // Pobranie przetworzonego, bezpiecznego kodu źródłowego HTML
}