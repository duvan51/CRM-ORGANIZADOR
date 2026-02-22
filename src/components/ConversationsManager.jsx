import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const ConversationsManager = ({ clinicId }) => {
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        fetchConversations();

        // Suscripción en tiempo real para nuevos mensajes
        const channel = supabase
            .channel('public:meta_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meta_messages' }, (payload) => {
                if (selectedConv && payload.new.conversation_id === selectedConv.id) {
                    setMessages(prev => [...prev, payload.new]);
                }
                fetchConversations(); // Refrescar lista para ver el último mensaje
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedConv]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const fetchConversations = async () => {
        try {
            const { data, error } = await supabase
                .from('meta_conversations')
                .select(`
                    *,
                    meta_messages (
                        content,
                        created_at
                    )
                `)
                .eq('clinic_id', clinicId)
                .order('last_message_at', { ascending: false });

            if (error) throw error;
            setConversations(data || []);
        } catch (err) {
            console.error("Error fetching conversations:", err);
        } finally {
            setLoadingConvs(false);
        }
    };

    const fetchMessages = async (conv) => {
        setSelectedConv(conv);
        setLoadingMsgs(true);
        try {
            const { data, error } = await supabase
                .from('meta_messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data || []);
        } catch (err) {
            console.error("Error fetching messages:", err);
        } finally {
            setLoadingMsgs(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConv || sending) return;

        setSending(true);
        try {
            // 1. Guardar en DB local
            const { error: insertError } = await supabase
                .from('meta_messages')
                .insert({
                    conversation_id: selectedConv.id,
                    sender_type: 'human',
                    content: newMessage
                });

            if (insertError) throw insertError;

            // 2. Enviar a través de la API de Meta (vía Edge Function)
            // Usamos la misma lógica que la IA pero forzando modo humano
            const response = await fetch('https://tlezyskwzbhgdudmbfbn.supabase.co/functions/v1/meta-ai-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinic_id: clinicId,
                    is_human_reply: true,
                    external_user_id: selectedConv.external_user_id,
                    platform: selectedConv.platform,
                    text: newMessage
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Error al enviar mensaje a Meta");
            }

            setNewMessage("");
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="conversations-container glass-panel" style={{ display: 'flex', height: '70vh', overflow: 'hidden', padding: 0 }}>
            {/* Sidebar de Chats */}
            <div style={{ width: '350px', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)' }}>
                    <h3 style={{ margin: 0 }}>Conversaciones</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loadingConvs ? (
                        <div style={{ padding: '20px', textAlign: 'center' }}>Cargando...</div>
                    ) : conversations.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>No hay chats activos.</div>
                    ) : (
                        conversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => fetchMessages(conv)}
                                style={{
                                    padding: '15px 20px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    background: selectedConv?.id === conv.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <strong style={{ fontSize: '0.9rem' }}>{conv.external_user_id}</strong>
                                    <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>
                                        {conv.platform === 'whatsapp' ? '🟢 WA' : conv.platform === 'messenger' ? '🔵 FB' : '🟣 IG'}
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {conv.meta_messages?.[conv.meta_messages.length - 1]?.content || 'Sin mensajes'}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Area de Chat */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
                {selectedConv ? (
                    <>
                        <div style={{ padding: '15px 25px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: 0 }}>{selectedConv.external_user_id}</h4>
                                <small style={{ opacity: 0.6 }}>Plataforma: {selectedConv.platform}</small>
                            </div>
                            <span style={{
                                padding: '4px 10px',
                                borderRadius: '10px',
                                fontSize: '0.7rem',
                                background: selectedConv.status === 'ai_handling' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: selectedConv.status === 'ai_handling' ? '#10b981' : '#f59e0b'
                            }}>
                                {selectedConv.status === 'ai_handling' ? 'Atendido por IA' : 'Atención Humana'}
                            </span>
                        </div>

                        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {loadingMsgs ? (
                                <div style={{ textAlign: 'center' }}>Cargando mensajes...</div>
                            ) : (
                                messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        style={{
                                            alignSelf: msg.sender_type === 'user' ? 'flex-start' : 'flex-end',
                                            maxWidth: '70%',
                                            padding: '10px 15px',
                                            borderRadius: '15px',
                                            fontSize: '0.9rem',
                                            background: msg.sender_type === 'user' ? 'rgba(255,255,255,0.05)' : 'var(--primary)',
                                            border: msg.sender_type === 'user' ? '1px solid var(--glass-border)' : 'none',
                                            color: 'white'
                                        }}
                                    >
                                        <div>{msg.content}</div>
                                        <div style={{ fontSize: '0.6rem', opacity: 0.5, textAlign: 'right', marginTop: '4px' }}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSendMessage} style={{ padding: '20px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                placeholder="Escribe un mensaje..."
                                style={{
                                    flex: 1,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'white',
                                    padding: '10px 15px',
                                    borderRadius: '10px'
                                }}
                            />
                            <button
                                type="submit"
                                className="btn-process"
                                disabled={sending}
                                style={{ padding: '10px 20px', borderRadius: '10px' }}
                            >
                                {sending ? '...' : 'Enviar'}
                            </button>
                        </form>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                        Selecciona una conversación para empezar
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConversationsManager;
