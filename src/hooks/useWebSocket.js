import { useEffect } from 'react';
import { supabase } from '../supabase';

const useWebSocket = (onMessage) => {
    useEffect(() => {
        const channel = supabase
            .channel('db-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'citas' },
                (payload) => {
                    console.log('Realtime change received:', payload);
                    if (onMessage) {
                        onMessage({
                            type: payload.eventType === 'INSERT' ? 'REFRESH_CITAS' : 'REFRESH_CITAS',
                            data: payload.new
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [onMessage]);

    return { lastMessage: null, socket: null };
};

export default useWebSocket;
