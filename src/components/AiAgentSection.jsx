import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";

const AiAgentSection = ({ clinicId }) => {
    const [config, setConfig] = useState({
        provider: 'openai',
        api_key: '',
        model: 'gpt-4o',
        system_prompt: '',
        phone_id: '',
        meta_access_token: '',
        verify_token: '',
        is_active: false
    });
    const [loading, setLoading] = useState(true);
    const [savingMeta, setSavingMeta] = useState(false);
    const [savingAi, setSavingAi] = useState(false);
    const [services, setServices] = useState([]);

    // Testing Modal States
    const [showTester, setShowTester] = useState(false);
    const [testInput, setTestInput] = useState("");
    const [testChat, setTestChat] = useState([]);
    const [isThinking, setIsThinking] = useState(false);

    useEffect(() => {
        fetchConfig();
        fetchServices();
    }, [clinicId]);

    const fetchConfig = async () => {
        try {
            const { data, error } = await supabase
                .from('ai_agent_config')
                .select('*')
                .eq('clinic_id', clinicId)
                .single();

            if (data) {
                setConfig(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchServices = async () => {
        const { data } = await supabase
            .from('global_services')
            .select('*')
            .eq('clinic_id', clinicId);
        setServices(data || []);
    };

    const saveMeta = async () => {
        setSavingMeta(true);
        try {
            const { error } = await supabase
                .from('ai_agent_config')
                .upsert({
                    clinic_id: clinicId,
                    phone_id: config.phone_id,
                    meta_access_token: config.meta_access_token,
                    verify_token: config.verify_token,
                    is_active: config.is_active
                }, { onConflict: 'clinic_id' });
            if (error) throw error;
            alert("Conexión Meta guardada con éxito.");
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setSavingMeta(false);
        }
    };

    const saveAi = async () => {
        setSavingAi(true);
        try {
            const { error } = await supabase
                .from('ai_agent_config')
                .upsert({
                    clinic_id: clinicId,
                    provider: config.provider,
                    api_key: config.api_key,
                    model: config.model || 'gpt-4o',
                    system_prompt: config.system_prompt
                }, { onConflict: 'clinic_id' });
            if (error) throw error;
            alert("Cerebro de IA guardado con éxito.");
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setSavingAi(false);
        }
    };

    const handleTestMessage = async (e) => {
        e.preventDefault();
        if (!testInput.trim() || isThinking) return;
        if (!config.api_key) {
            alert("Por favor, ingresa una API Key de la IA para probar.");
            return;
        }

        const userMsg = { role: 'user', content: testInput };
        const newHistory = [...testChat, userMsg];
        setTestChat(newHistory);
        setTestInput("");
        setIsThinking(true);

        try {
            // Local Simulation to avoid Edge Function deployment issues during dev
            const servicesText = services.length
                ? `\n\nSERVICIOS DISPONIBLES EN LA CLÍNICA:\n${services.map(s => {
                    const parent = s.parent_id ? services.find(p => p.id === s.parent_id) : null;
                    const name = parent ? `${s.nombre} (Variante de ${parent.nombre})` : s.nombre;
                    const detailIa = s.informacion_ia ? `\n   - INFO EXPERTA/DETALLES: ${s.informacion_ia}` : '';
                    return `- ${name}: $${s.precio_base} (${s.duracion_minutos} min). ${s.descripcion || ''}${detailIa}`;
                }).join('\n')}`
                : '';

            const systemContent = config.system_prompt + servicesText;

            const messages = [
                { role: 'system', content: systemContent },
                ...newHistory.slice(-5) // Send last 5 messages for context
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.api_key}`
                },
                body: JSON.stringify({
                    model: config.model || 'gpt-4o',
                    messages: messages
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const aiMsg = { role: 'assistant', content: data.choices[0].message.content };
            setTestChat(prev => [...prev, aiMsg]);
        } catch (err) {
            setTestChat(prev => [...prev, { role: 'assistant', content: "❌ Error: " + err.message }]);
        } finally {
            setIsThinking(false);
        }
    };

    if (loading) return <div>Cargando configuración...</div>;

    return (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🤖 Configuración de Agente de IA</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-secondary" onClick={() => setShowTester(true)}>🚀 Probador (Chat)</button>
                    <button className="btn-process" onClick={() => { saveMeta(); saveAi(); }}>💾 Guardar Todo</button>
                </div>
            </div>

            <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '20px' }}>
                <div className="card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <h4 style={{ marginBottom: '20px' }}>🔑 Conexión Meta (Apis/Webhooks)</h4>
                    <div className="premium-form-v" style={{ flex: 1 }}>
                        <div className="form-group">
                            <label>WhatsApp Phone ID</label>
                            <input
                                type="text"
                                value={config.phone_id}
                                onChange={e => setConfig({ ...config, phone_id: e.target.value })}
                                placeholder="Ej: 1092837465..."
                            />
                        </div>
                        <div className="form-group">
                            <label>Meta Access Token</label>
                            <input
                                type="password"
                                value={config.meta_access_token}
                                onChange={e => setConfig({ ...config, meta_access_token: e.target.value })}
                                placeholder="EAA..."
                            />
                        </div>
                        <div className="form-group">
                            <label>Webhook Verify Token</label>
                            <input
                                type="text"
                                value={config.verify_token}
                                onChange={e => setConfig({ ...config, verify_token: e.target.value })}
                                placeholder="token_secreto_para_meta"
                            />
                        </div>
                        <div className="form-group" style={{ flexDirection: 'row', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="checkbox"
                                checked={config.is_active}
                                onChange={e => setConfig({ ...config, is_active: e.target.checked })}
                                id="ai_active"
                            />
                            <label htmlFor="ai_active" style={{ cursor: 'pointer' }}>Activar Agente para Webhooks</label>
                        </div>
                    </div>
                    <button onClick={saveMeta} className="btn-secondary" disabled={savingMeta} style={{ marginTop: '20px', width: '100%', background: '#25D366', color: 'white' }}>
                        {savingMeta ? "..." : "💾 Guardar Meta Settings"}
                    </button>
                </div>

                <div className="card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <h4 style={{ marginBottom: '20px' }}>🧠 Cerebro e Instucciones (IA)</h4>
                    <div className="premium-form-v" style={{ flex: 1 }}>
                        <div className="form-group">
                            <label>Proveedor de IA</label>
                            <select
                                value={config.provider}
                                onChange={e => setConfig({ ...config, provider: e.target.value })}
                            >
                                <option value="openai">OpenAI (ChatGPT)</option>
                                <option value="gemini">Google Gemini</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>API Key de la IA</label>
                            <input
                                type="password"
                                value={config.api_key}
                                onChange={e => setConfig({ ...config, api_key: e.target.value })}
                                placeholder="sk-..."
                            />
                        </div>
                        <div className="form-group">
                            <label>Modelo</label>
                            <input
                                type="text"
                                value={config.model}
                                onChange={e => setConfig({ ...config, model: e.target.value })}
                                placeholder="gpt-4o"
                            />
                        </div>
                        <div className="form-group">
                            <label>System Prompt (Instrucciones)</label>
                            <textarea
                                value={config.system_prompt}
                                onChange={e => setConfig({ ...config, system_prompt: e.target.value })}
                                rows="5"
                                placeholder="Define cómo debe responder la IA..."
                                style={{ width: '100%', minHeight: '120px' }}
                            />
                        </div>
                    </div>
                    <button onClick={saveAi} className="btn-secondary" disabled={savingAi} style={{ marginTop: '20px', width: '100%', background: 'var(--primary)', color: 'white' }}>
                        {savingAi ? "..." : "💾 Guardar Config IA"}
                    </button>
                </div>
            </div>

            <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '20px' }}>
                <div className="card" style={{ padding: '20px', background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid var(--primary)' }}>
                    <h4>🔗 Webhook URL para Meta</h4>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>Pega esto en tu App Dashboard de Meta:</p>
                    <code style={{ background: '#000', padding: '10px', display: 'block', borderRadius: '8px', color: '#0f0', marginTop: '10px', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                        {import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ai-agent
                    </code>
                </div>

                <div className="card" style={{ padding: '20px', border: '1px solid var(--glass-border)' }}>
                    <h4>📚 Contexto de Servicios ({services.length})</h4>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>La IA usará estos servicios para responder:</p>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '10px' }}>
                        {services.length === 0 ? "No hay servicios registrados." : services.map(s => (
                            <div key={s.id} style={{ fontSize: '0.8rem', borderBottom: '1px solid var(--glass-border)', padding: '5px 0' }}>
                                <strong>{s.nombre}</strong> - ${s.precio_base}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {showTester && (
                <div className="modal-overlay" onClick={() => setShowTester(false)}>
                    <div className="modal-content animate-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header-pro">
                            <div>
                                <h2>🤖 Simulador de Chat IA</h2>
                                <p>Prueba cómo responderá el agente a tus clientes</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setTestChat([])}
                                    style={{ fontSize: '0.75rem', padding: '5px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px' }}
                                    title="Reiniciar conversación"
                                >
                                    🔄 Reiniciar
                                </button>
                                <button className="btn-close" onClick={() => setShowTester(false)}>×</button>
                            </div>
                        </div>

                        <div className="chat-container" style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {testChat.length === 0 && (
                                <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '20px' }}>
                                    <p>¡Hola! Soy tu asistente de prueba.</p>
                                    <p style={{ fontSize: '0.8rem' }}>Tengo acceso a tus {services.length} servicios y sigo tus instrucciones.</p>
                                </div>
                            )}
                            {testChat.map((msg, i) => (
                                <div key={i} style={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--glass-bg)',
                                    color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                                    padding: '10px 15px',
                                    borderRadius: msg.role === 'user' ? '15px 15px 2px 15px' : '15px 15px 15px 2px',
                                    maxWidth: '85%',
                                    boxShadow: 'var(--shadow-sm)'
                                }}>
                                    {msg.content}
                                </div>
                            ))}
                            {isThinking && (
                                <div style={{ alignSelf: 'flex-start', background: 'var(--glass-bg)', padding: '10px 15px', borderRadius: '15px' }}>
                                    Analizando servicios...
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleTestMessage} style={{ padding: '20px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={testInput}
                                onChange={e => setTestInput(e.target.value)}
                                placeholder="Hazme una pregunta sobre tus servicios..."
                                style={{ flex: 1, padding: '12px', borderRadius: '25px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}
                                disabled={isThinking}
                            />
                            <button type="submit" className="btn-primary" style={{ borderRadius: '50%', width: '45px', height: '45px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={isThinking}>
                                ➡
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AiAgentSection;
