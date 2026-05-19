export class RealtimeSocket {
    constructor(api) {
        this.api = api;

        this.ws = null;
        this.documentId = null;

        this.onRemoteEdit = null;
        this.onPresence = null;
        this.onStatus = null;

        this.silent = false;
    }

    connect() {
        if (!this.api.token) {
            return;
        }

        this.close();

        const protocol =
            location.protocol === 'https:'
                ? 'wss'
                : 'ws';

        this.ws = new WebSocket(
            `${protocol}://${location.host}?token=${encodeURIComponent(
                this.api.token
            )}`
        );

        this.ws.addEventListener(
            'open',
            () => {
                this.onStatus?.('online');

                if (this.documentId) {
                    this.join(this.documentId);
                }
            }
        );

        this.ws.addEventListener(
            'close',
            () => {
                this.onStatus?.('offline');
            }
        );

        this.ws.addEventListener(
            'message',
            (e) => {
                const msg = JSON.parse(e.data);

                if (msg.type === 'edit') {
                    this.onRemoteEdit?.(
                        msg.content,
                        msg.user
                    );
                }

                if (msg.type === 'presence') {
                    this.onPresence?.(
                        msg.users || []
                    );
                }
            }
        );
    }

    join(documentId) {
        this.documentId = documentId;

        if (
            this.ws?.readyState === WebSocket.OPEN
        ) {
            this.ws.send(
                JSON.stringify({
                    type: 'join',
                    documentId
                })
            );
        }
    }

    sendEdit(content) {
        if (
            this.ws?.readyState === WebSocket.OPEN &&
            this.documentId
        ) {
            this.ws.send(
                JSON.stringify({
                    type: 'edit',
                    content
                })
            );
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}