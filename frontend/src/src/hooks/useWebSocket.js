import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '../config'; // Importar configuración central

const useWebSocket = (onMessage) => {
    const ws = useRef(null);
    const reconnectTimeout = useRef(null);
    const isUnmounting = useRef(false);

    const [lastMessage, setLastMessage] = useState(null);

    useEffect(() => {
        isUnmounting.current = false;

        const connect = () => {
            if (isUnmounting.current) return;

            console.log('Connecting to WebSocket:', WS_URL);
            const socket = new WebSocket(WS_URL);

            socket.onopen = () => {
                if (!isUnmounting.current) {
                    console.log('WebSocket Connected');
                }
            };

            socket.onmessage = (event) => {
                if (isUnmounting.current) return;
                try {
                    const message = JSON.parse(event.data);
                    console.log('WebSocket Message Received:', message);
                    setLastMessage(message);
                    if (onMessage) onMessage(message);
                } catch (err) {
                    console.error('Error parsing WS message:', err);
                }
            };

            socket.onclose = () => {
                if (!isUnmounting.current) {
                    console.log('WebSocket Disconnected. Reconnecting in 3s...');
                    reconnectTimeout.current = setTimeout(connect, 3000);
                }
            };

            socket.onerror = (error) => {
                // Durante el montaje doble de React Strict Mode, esto es normal y benigno
                if (!isUnmounting.current) {
                    console.error('WebSocket Error:', error);
                }
                socket.close();
            };

            ws.current = socket;
        };

        connect();

        return () => {
            isUnmounting.current = true;
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (ws.current) {
                if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
                    ws.current.close();
                }
            }
        };
    }, []);

    return { lastMessage, socket: ws.current };
};

export default useWebSocket;
