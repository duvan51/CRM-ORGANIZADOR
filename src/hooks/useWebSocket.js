import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase';

const useWebSocket = (onMessage) => {
    const [lastMessage, setLastMessage] = useState(null);
    // store callback in ref so we don't have to add it to deps array
    const onMessageRef = useRef(onMessage);

    // update ref whenever callback changes (this itself doesn't trigger subscription rerun)
    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    useEffect(() => {
        const channel = supabase
            .channel('db-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'citas' },
                (payload) => {
                    console.log('Realtime change received:', payload);

                    const msg = {
                        type: payload.eventType === 'INSERT' ? 'REFRESH_CITAS' : 'REFRESH_CITAS',
                        data: payload.new,
                        agenda_id: payload.new?.agenda_id
                    };

                    setLastMessage(msg);
                    if (onMessageRef.current) {
                        onMessageRef.current(msg);
                    }
                }
            )
            .subscribe();

        // no need to keep socket in state; we don't expose it anywhere
        // but we could return it if necessary

        return () => {
            supabase.removeChannel(channel);
        };
    }, []); // run once on mount

    return { lastMessage };
};

export default useWebSocket;
