export const debounce = (fn, delay = 300) => {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
};

export class MarkdownEditor {
    constructor(textarea, preview) {
        this.textarea = textarea;
        this.preview = preview;
        this.onChange = null;
        this.render = debounce(() => this.renderNow(), 300);

        textarea.addEventListener('input', () => {
            this.render();
            this.onChange?.(textarea.value);
        });
    }

    setValue(value) {
        this.textarea.value = value || '';
        this.renderNow();
    }

    getValue() {
        return this.textarea.value;
    }

    renderNow() {
        const value = this.textarea.value || '';
        this.preview.innerHTML = window.marked
            ? marked.parse(value)
            : value.replace(/\n/g, '<br>');
    }
}