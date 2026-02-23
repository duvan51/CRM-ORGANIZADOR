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
    const [syncedAccounts, setSyncedAccounts] = useState([]);
    const [syncingPastMessages, setSyncingPastMessages] = useState(false);
    const [realtimeStatus, setRealtimeStatus] = useState("connecting");
    const messagesEndRef = useRef(null);
    const selectedConvRef = useRef(null);

    // Mantenemos una referencia actualizada para el listener de Realtime
    useEffect(() => {
        selectedConvRef.current = selectedConv;
    }, [selectedConv]);

    useEffect(() => {
        fetchConversations(true);
        fetchSyncedAccounts();

        let refreshTimer = null;
        const debouncedRefresh = () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                console.log("🔄 Ejecutando refresco debounced...");
                fetchConversations(false);
                if (selectedConvRef.current) fetchMessages(selectedConvRef.current);
            }, 500);
        };

        console.log("📡 DEBUG: clinicId en frontend:", clinicId);
        if (!clinicId) {
            console.error("❌ ERROR: No hay clinicId definido. Realtime no funcionará.");
            return;
        }

        const channel = supabase
            .channel(`meta-clean-${clinicId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'meta_messages',
                filter: `clinic_id=eq.${clinicId}`
            }, (payload) => {
                console.log("🔥 Cambio en Mensajes (Postgres):", payload);
                debouncedRefresh();
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'meta_conversations',
                filter: `clinic_id=eq.${clinicId}`
            }, (payload) => {
                console.log("🔥 Cambio en Chats/Conversaciones (Postgres):", payload);
                debouncedRefresh();
            })
            .on('broadcast', { event: 'CHATS_UPDATE' }, (payload) => {
                console.log("📢 Cambio detectado vía Broadcast:", payload);
                debouncedRefresh();
            })
            .subscribe((status, err) => {
                console.log("🛰️ Realtime Status para", clinicId, ":", status);
                setRealtimeStatus(status);
                if (err) console.error("❌ Error de suscripción Realtime:", err);
            });

        return () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            console.log("🔌 Desconectando canal de Realtime...");
            supabase.removeChannel(channel);
        };
    }, [clinicId]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const fetchSyncedAccounts = async () => {
        try {
            // Social Accounts (Messenger/IG)
            const { data: socialData } = await supabase
                .from('meta_social_accounts')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('is_active', true);

            // WhatsApp Config
            const { data: waData } = await supabase
                .from('ai_agent_config')
                .select('phone_id, is_active')
                .eq('clinic_id', clinicId)
                .single();

            const accounts = [...(socialData || [])];
            if (waData?.phone_id && waData.is_active) {
                accounts.push({
                    id: 'whatsapp-main',
                    platform: 'whatsapp',
                    name: `WA: ${waData.phone_id}`,
                    is_active: true
                });
            }

            setSyncedAccounts(accounts);
        } catch (err) {
            console.error("Error fetching synced accounts:", err);
        }
    };

    const fetchConversations = async (withLoading = false) => {
        if (withLoading) setLoadingConvs(true);
        try {
            let { data, error } = await supabase
                .from('meta_conversations')
                .select('*, meta_messages(content, created_at)')
                .eq('clinic_id', clinicId)
                .order('last_message_at', { ascending: false });

            if (!data || data.length === 0) {
                const { data: fallbackData } = await supabase
                    .from('meta_conversations')
                    .select('*, meta_messages(content, created_at)')
                    .order('last_message_at', { ascending: false })
                    .limit(50);
                if (fallbackData) data = fallbackData;
            }

            if (error) throw error;
            setConversations(data || []);
        } catch (err) {
            console.error("Error fetching conversations:", err);
        } finally {
            if (withLoading) setLoadingConvs(false);
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
        const textToSend = newMessage;
        setNewMessage("");

        try {
            const response = await fetch('https://tlezyskwzbhgdudmbfbn.supabase.co/functions/v1/meta-ai-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinic_id: clinicId,
                    is_human_reply: true,
                    external_user_id: selectedConv.external_user_id,
                    platform: selectedConv.platform,
                    text: textToSend
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Error al enviar mensaje a Meta");
            }
        } catch (err) {
            alert("Error: " + err.message);
            setNewMessage(textToSend);
        } finally {
            setSending(false);
        }
    };

    const syncPastMessages = async () => {
        if (syncingPastMessages) return;
        setSyncingPastMessages(true);
        try {
            const { data: result, error: invokeError } = await supabase.functions.invoke('sync-meta-ads', {
                body: { action: 'sync-conversations' }
            });

            if (invokeError) throw invokeError;

            if (result.diagnostics) {
                const summary = result.diagnostics.map(d => {
                    if (d.error) return `${d.account}: ❌ Error: ${d.error}`;
                    if (d.db_error) return `${d.account}: ❌ Error DB Chat: ${d.db_error}`;
                    if (d.msg_error) return `${d.account}: ❌ Error DB Mensaje: ${d.msg_error}`;
                    return `${d.account}: ✅ ${d.conversations_found || 0} chats / ${d.messages_synced || 0} msgs`;
                }).join('\n');
                alert(`Resultado de Sincronización:\n\n${summary}\n\nTotal mensajes importados: ${result.count || 0}`);
            } else {
                alert(`Sincronización completada. Se importaron ${result.count || 0} mensajes.`);
            }
            fetchConversations();
        } catch (err) {
            console.error("Error syncing past messages:", err);
            alert("Error al sincronizar: " + err.message);
        } finally {
            setSyncingPastMessages(false);
        }
    };

    return (
        <div className="conversations-manager-screen fade-in" style={{ display: 'flex', height: 'calc(100vh - 120px)', background: 'var(--card-bg)', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>

            {/* Sidebar de Chats */}
            <div className="chats-sidebar" style={{ width: '350px', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ padding: '25px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.4rem' }}>Conversaciones</h3>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span
                                title={realtimeStatus === 'SUBSCRIBED' ? 'Conectado en tiempo real' : 'Conectando/Error de tiempo real'}
                                style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: realtimeStatus === 'SUBSCRIBED' ? '#4ade80' : '#f87171',
                                    boxShadow: realtimeStatus === 'SUBSCRIBED' ? '0 0 10px #4ade80' : 'none'
                                }}
                            />
                            <button
                                className="btn-sync-mini"
                                onClick={syncPastMessages}
                                disabled={syncingPastMessages}
                                title="Sincronizar historial pasado"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '8px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-main)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                {syncingPastMessages ? '...' : '🔄 Sync'}
                            </button>
                        </div>
                    </div>

                    <div className="synced-accounts" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {syncedAccounts.length === 0 ? (
                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>⚠️ Sin cuentas vinculadas (Ve a Admin → Meta)</small>
                        ) : (
                            syncedAccounts.map(acc => (
                                <div key={acc.id} style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.65rem',
                                    background: acc.platform === 'messenger' ? 'rgba(0, 132, 255, 0.1)' :
                                        acc.platform === 'instagram' ? 'rgba(225, 48, 108, 0.1)' :
                                            'rgba(37, 211, 102, 0.1)',
                                    color: acc.platform === 'messenger' ? '#0084ff' :
                                        acc.platform === 'instagram' ? '#e1306c' :
                                            '#25d366',
                                    fontWeight: 'bold',
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    {acc.platform === 'messenger' ? '🔵' : acc.platform === 'instagram' ? '📸' : '🟢'} {acc.name}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                    {loadingConvs ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}>
                            <div className="spinner" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto 15px auto' }}></div>
                            <span className="text-muted" style={{ fontSize: '0.9rem' }}>Buscando chats...</span>
                        </div>
                    ) : conversations.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '15px', opacity: 0.3 }}>💬</div>
                            <p className="text-muted" style={{ fontSize: '0.9rem' }}>Aún no hay conversaciones registradas.</p>
                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>Escribe a tu página desde Facebook para iniciar.</small>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => fetchMessages(conv)}
                                style={{
                                    padding: '20px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    background: selectedConv?.id === conv.id ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent',
                                    borderLeft: selectedConv?.id === conv.id ? '4px solid var(--primary)' : '4px solid transparent',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                                className="chat-item-hover"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <strong style={{ fontSize: '0.95rem', color: selectedConv?.id === conv.id ? 'var(--primary)' : 'var(--text-main)' }}>
                                        {conv.external_user_name || conv.external_user_id.substring(0, 10)}
                                    </strong>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.6, fontWeight: 600 }}>
                                        {conv.last_message_at ? (
                                            new Date(conv.last_message_at).toLocaleDateString() === new Date().toLocaleDateString()
                                                ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                        ) : 'Reciente'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.6rem', padding: '2px 5px', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', color: 'var(--text-muted)' }}>
                                        {conv.platform.toUpperCase()}
                                    </span>
                                    <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                        {conv.meta_messages?.[conv.meta_messages.length - 1]?.content || 'Sin mensajes'}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Area de Chat */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)' }}>
                {selectedConv ? (
                    <>
                        <div style={{ padding: '20px 30px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{
                                    width: '45px',
                                    height: '45px',
                                    borderRadius: '50%',
                                    background: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.2rem',
                                    boxShadow: '0 4px 10px rgba(var(--primary-rgb), 0.3)'
                                }}>
                                    {selectedConv.external_user_id.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedConv.external_user_id}</h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                                        <small style={{ opacity: 0.6, fontSize: '0.75rem' }}>ID: {selectedConv.id.substring(0, 8)} | {selectedConv.platform}</small>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{
                                    padding: '6px 12px',
                                    borderRadius: '20px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    background: selectedConv.status === 'ai_handling' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: selectedConv.status === 'ai_handling' ? '#10b981' : '#f59e0b',
                                    border: `1px solid ${selectedConv.status === 'ai_handling' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                                }}>
                                    {selectedConv.status === 'ai_handling' ? '🧠 Agente IA Activo' : '👤 Atención Humana'}
                                </span>
                            </div>
                        </div>

                        <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }} className="custom-scrollbar">
                            {loadingMsgs ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}>Cargando historial...</div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const isUser = msg.sender_type === 'user';
                                    const isAI = msg.sender_type === 'ai';
                                    return (
                                        <div
                                            key={msg.id || idx}
                                            style={{
                                                alignSelf: isUser ? 'flex-start' : 'flex-end',
                                                maxWidth: '70%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: isUser ? 'flex-start' : 'flex-end'
                                            }}
                                        >
                                            <div style={{
                                                padding: '12px 18px',
                                                borderRadius: isUser ? '20px 20px 20px 5px' : '20px 20px 5px 20px',
                                                fontSize: '0.95rem',
                                                background: isUser ? 'rgba(255,255,255,0.05)' : isAI ? 'rgba(var(--primary-rgb), 0.2)' : 'var(--primary)',
                                                border: isUser ? '1px solid var(--glass-border)' : isAI ? '1px solid var(--primary)' : 'none',
                                                color: 'white',
                                                boxShadow: isUser ? 'none' : '0 4px 15px rgba(0,0,0,0.1)',
                                                wordBreak: 'break-word',
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: '1.4'
                                            }}>
                                                {msg.content}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '5px', display: 'flex', gap: '8px' }}>
                                                {isUser && <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>👤 CLIENTE</span>}
                                                {isAI && <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>🤖 IA</span>}
                                                {msg.sender_type === 'human' && <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>👤 TÚ</span>}
                                                <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSendMessage} style={{ padding: '25px 30px', background: 'var(--card-bg)', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '15px' }}>
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                placeholder={`Responder como ${selectedConv.status === 'ai_handling' ? 'humano (IA se pausará)' : 'humano'}...`}
                                style={{
                                    flex: 1,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'white',
                                    padding: '12px 20px',
                                    borderRadius: '12px',
                                    fontSize: '0.95rem',
                                    outline: 'none'
                                }}
                            />
                            <button
                                type="submit"
                                className="btn-process"
                                disabled={sending || !newMessage.trim()}
                                style={{
                                    padding: '0 25px',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 4px 15px rgba(var(--primary-rgb), 0.3)'
                                }}
                            >
                                {sending ? "..." : "Enviar ✈️"}
                            </button>
                        </form>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                        <div style={{ fontSize: '5rem', marginBottom: '20px' }}>🛰️</div>
                        <h3>Centro de Mensajería Omnicanal</h3>
                        <p>Selecciona un chat en la lista de la izquierda para ver el historial y responder.</p>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.2);
                }
                .chat-item-hover:hover {
                    background: rgba(255,255,255,0.05) !important;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            ` }} />
        </div>
    );
};

export default ConversationsManager;
