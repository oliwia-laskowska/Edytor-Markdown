// Wyznacza minimalną operację typu 'replace' (zastąpienie) na podstawie porównania starego i nowego tekstu.
// Wykorzystuje algorytm dopasowywania wspólnego prefiksu i sufiksu (Dual-pointer/Heuristic Diff).
export function diffToOperation(oldText, newText) {
    let start = 0;
    // Przesuwa wskaźnik od początku, dopóki znaki w obu tekstach są identyczne (wspólny prefiks)
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;

    let oldEnd = oldText.length - 1;
    let newEnd = newText.length - 1;
    // Przesuwa wskaźniki od końca, dopóki znaki są identyczne (wspólny sufiks) i nie minęły punktu startu
    while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
        oldEnd--;
        newEnd--;
    }

    // Zwraca obiekt operacji: pozycję startową, liczbę usuwanych znaków oraz nową treść do wstawienia
    return {
        type: 'replace',
        pos: start,
        del: Math.max(0, oldEnd - start + 1),
        text: newText.slice(start, newEnd + 1)
    };
}

// Aplikuje operację tekstową (wstawienie/usunięcie/zamianę) na aktualnej zawartości dokumentu.
// Posiada zabezpieczenia (Math.min/Max) przed wyjściem poza zakres długości ciągu znaków.
export function applyOperation(content, op) {
    // Upewnia się, że pozycja modyfikacji mieści się w granicach obecnego tekstu
    const pos = Math.max(0, Math.min(Number(op.pos) || 0, content.length));
    // Upewnia się, że zakres usuwanych znaków nie przekracza dostępnego tekstu od pozycji 'pos'
    const del = Math.max(0, Math.min(Number(op.del) || 0, content.length - pos));
    const text = typeof op.text === 'string' ? op.text : '';

    // Składa nowy tekst: [przed modyfikacją] + [wstawiany tekst] + [po modyfikacji]
    return content.slice(0, pos) + text + content.slice(pos + del);
}

// Transformacja Operacyjna (OT) – modyfikuje pozycję (indeks) lokalnej operacji 'op' 
// biorąc pod uwagę, że na serwerze wykonała się już inna, zdalna operacja 'remote'.
export function transformOperation(op, remote) {
    const next = { ...op };
    // Różnica w długości tekstu po wykonaniu zdalnej operacji (dodane znaki minus usunięte znaki)
    const remoteDelta = (remote.text?.length || 0) - (remote.del || 0);

    // Jeśli zdalna modyfikacja miała miejsce przed naszą pozycją, musimy przesunąć nasz indeks o powstałą różnicę
    if (remote.pos < next.pos) next.pos = Math.max(0, next.pos + remoteDelta);
    // Jeśli pozycje są równe i obie strony wstawiają tekst, przesuwamy pozycję lokalną za tekst zdalny (arbitralne rozstrzygnięcie konfliktu)
    else if (remote.pos === next.pos && (remote.text?.length || 0) > 0 && next.text) next.pos += remote.text.length;

    return next;
}