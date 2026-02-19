import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";

const AiChatMonitor = () => {
    const [conversations, setConversations] = useState([]);
    const [selectedConv, setSelectedConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConversations();
    }, []);

    const fetchConversations = async () => {
        const { data, error } = await supabase
            .from('meta_conversations')
            .select('*, meta_messages(content, created_at)')
            .order('last_message_at', { ascending: false });

        if (!error) setConversations(data);
        setLoading(false);
    };

    const fetchMessages = async (convId) => {
        const { data, error } = await supabase
            .from('meta_messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });

        if (!error) setMessages(data);
    };

    const toggleStatus = async (convId, currentStatus) => {
        const newStatus = currentStatus === 'ai_handling' ? 'paused' : 'ai_handling';
        const { error } = await supabase
            .from('meta_conversations')
            .update({ status: newStatus })
            .eq('id', convId);

        if (!error) {
            setConversations(conversations.map(c => c.id === convId ? { ...c, status: newStatus } : c));
            if (selectedConv?.id === convId) setSelectedConv({ ...selectedConv, status: newStatus });
        }
    };

    if (loading) return <div className="p-4">Cargando conversaciones...</div>;

    return (
        <div className="ai-monitor-container" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: 'calc(100vh - 200px)', gap: '20px', padding: '20px' }}>
            {/* Sidebar: Conversations List */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '15px', borderBottom: '1px solid var(--glass-border)' }}>
                    <h4>💬 Conversaciones IA</h4>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {conversations.length === 0 ? (
                        <p className="text-muted text-center p-4">No hay conversaciones aún.</p>
                    ) : (
                        conversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => { setSelectedConv(conv); fetchMessages(conv.id); }}
                                style={{
                                    padding: '15px',
                                    borderBottom: '1px solid var(--glass-border)',
                                    cursor: 'pointer',
                                    background: selectedConv?.id === conv.id ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong>{conv.external_user_id}</strong>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{new Date(conv.last_message_at).toLocaleTimeString()}</span>
                                </div>
                                <p className="text-muted" style={{ fontSize: '0.8rem', margin: '5px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {conv.meta_messages?.[conv.meta_messages.length - 1]?.content || "Sin mensajes"}
                                </p>
                                <span className={`status-pill ${conv.status === 'ai_handling' ? 'success' : 'warning'}`} style={{ fontSize: '0.6rem' }}>
                                    {conv.status === 'ai_handling' ? '🤖 IA Activa' : '⏸️ Pausado'}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main: Chat View */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {selectedConv ? (
                    <>
                        <div style={{ padding: '15px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: 0 }}>{selectedConv.external_user_id}</h4>
                                <small className="text-muted">Plataforma: {selectedConv.platform}</small>
                            </div>
                            <button
                                className={`btn-${selectedConv.status === 'ai_handling' ? 'delete' : 'process'}`}
                                onClick={() => toggleStatus(selectedConv.id, selectedConv.status)}
                                style={{ fontSize: '0.8rem', padding: '8px 15px' }}
                            >
                                {selectedConv.status === 'ai_handling' ? "⏸️ Pausar IA" : "🤖 Activar IA"}
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.1)' }}>
                            {messages.map(msg => (
                                <div key={msg.id} style={{
                                    alignSelf: msg.sender_type === 'user' ? 'flex-start' : 'flex-end',
                                    maxWidth: '70%',
                                    padding: '10px 15px',
                                    borderRadius: '15px',
                                    background: msg.sender_type === 'user' ? 'rgba(255,255,255,0.05)' : msg.sender_type === 'ai' ? 'var(--primary)' : 'var(--accent)',
                                    color: msg.sender_type === 'user' ? 'inherit' : '#fff',
                                    border: msg.sender_type === 'user' ? '1px solid var(--glass-border)' : 'none'
                                }}>
                                    <div style={{ fontSize: '0.85rem' }}>{msg.content}</div>
                                    <div style={{ fontSize: '0.6rem', opacity: 0.7, marginTop: '5px', textAlign: 'right' }}>
                                        {new Date(msg.created_at).toLocaleTimeString()} {msg.sender_type === 'ai' ? '(IA)' : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <div className="text-center">
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>💬</div>
                            <p>Selecciona una conversación para ver el historial.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AiChatMonitor;
