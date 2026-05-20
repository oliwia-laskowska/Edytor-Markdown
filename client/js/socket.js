export class RealtimeSocket {
    constructor(api) {
        this.api = api;

        this.ws = null;
        this.documentId = null;

        this.onRemoteEdit = null;
        this.onPresence = null;
        this.onStatus = null;
        this.onOfflineEdit = null;

        this.reconnectTimer = null;
        this.reconnectAttempts = 0;

        this.manualClose = false;
        this.offlineNotified = false;
    }

    connect() {
        if (!this.api.token) return;

        this.manualClose = false;

        if (
            this.ws &&
            [WebSocket.OPEN, WebSocket.CONNECTING].includes(
                this.ws.readyState
            )
        ) {
            return;
        }

        const protocol =
            location.protocol === 'https:' ? 'wss' : 'ws';

        this.ws = new WebSocket(
            `${protocol}://${location.host}?token=${encodeURIComponent(
                this.api.token
            )}`
        );

        this.ws.addEventListener('open', () => {
            this.reconnectAttempts = 0;
            this.offlineNotified = false;

            this.onStatus?.('online');

            if (this.documentId) {
                this.join(this.documentId);
            }
        });

        this.ws.addEventListener('close', () => {
            this.ws = null;

            this.onStatus?.('offline');

            if (!this.manualClose) {
                this.scheduleReconnect();
            }
        });

        this.ws.addEventListener('error', () => {
            this.onStatus?.('offline');
        });

        this.ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'edit') {
                this.onRemoteEdit?.(
                    message.content,
                    message.user
                );
            }

            if (message.type === 'presence') {
                this.onPresence?.(message.users || []);
            }
        });
    }

    scheduleReconnect() {
        clearTimeout(this.reconnectTimer);

        const delay = Math.min(
            30_000,
            1_000 * 2 ** this.reconnectAttempts
        );

        this.reconnectAttempts += 1;

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    join(documentId) {
        this.documentId = documentId;

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(
                JSON.stringify({
                    type: 'join',
                    documentId,
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
                    content,
                })
            );

            return true;
        }

        this.onOfflineEdit?.(
            this.documentId,
            content
        );

        return false;
    }

    close() {
        this.manualClose = true;

        clearTimeout(this.reconnectTimer);

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}