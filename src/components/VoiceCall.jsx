import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const VoiceCall = ({ clinicId, phoneNumber, onClose }) => {
    const [status, setStatus] = useState('initializing'); // initializing, ready, calling, active, ended, error
    const [errorMessage, setErrorMessage] = useState('');
    const [duration, setDuration] = useState(0);
    const timerRef = useRef(null);
    const isInitializing = useRef(false);

    useEffect(() => {
        if (!isInitializing.current) {
            isInitializing.current = true;
            setupZadarma();
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            // Zadarma clean up if needed
        };
    }, []);

    const setupZadarma = async () => {
        // --- 1. Definir Escuchadores ANTES de iniciar nada para capturar eventos V9 ---
        window.zadarmaOnStatus = (zadarmaStatus) => {
            console.log("☎️ Zadarma Status:", zadarmaStatus);
            if (zadarmaStatus === 'calling') setStatus('calling');
            if (zadarmaStatus === 'accepted') {
                setStatus('active');
                startTimer();
            }
            if (zadarmaStatus === 'terminated') {
                setStatus('ended');
                if (timerRef.current) clearInterval(timerRef.current);
            }
        };

        window.zadarmaOnEvent = (event) => {
            console.log("📢 Zadarma Event:", event);
        };

        try {
            console.log("Setting up Zadarma for clinic:", clinicId);
            const { data, error } = await supabase.functions.invoke('zadarma-token', {
                body: { clinicId }
            });

            if (error) throw error;
            if (!data.key) throw new Error("No Zadarma key received");

            console.log("Zadarma auth success. Launching widget...");

            const initWidget = (attempts = 0) => {
                if (window.zadarmaWidgetFn && window.zdrmWebrtcPhoneInterface) {
                    // Limpiar vestigios si los hay para evitar duplicados
                    const oldWidget = document.getElementById('zadarma-webrtc-widget') || document.querySelector('.zadarma-webrtc-widget');
                    if (oldWidget) oldWidget.remove();

                    console.log("Initializing Zadarma v9 for SIP:", data.sip);
                    window.zadarmaWidgetFn(
                        data.key,
                        data.sip,
                        'square',
                        'es',
                        true,
                        { right: '25px', bottom: '25px' }
                    );
                    setStatus('ready');
                } else if (attempts < 30) {
                    setTimeout(() => initWidget(attempts + 1), 250);
                } else {
                    console.error("Zadarma timeout: zdrmWebrtcPhoneInterface not found");
                    setStatus('error');
                    setErrorMessage("Tiempo de espera agotado al cargar el teléfono");
                }
            };
            initWidget();
        } catch (err) {
            console.error('Error completo de Zadarma:', err.message);
            setErrorMessage(err.message || "Error al configurar Zadarma");
            setStatus('error');
        }
    };


    const handleCall = () => {
        if (!window.Zadarma || !phoneNumber) return;

        try {
            const cleanNumber = phoneNumber.replace(/\s+/g, '').replace(/[()]/g, '');
            console.log("Initiating Zadarma call to:", cleanNumber);

            if (window.Zadarma.call) {
                window.Zadarma.call(cleanNumber);
                setStatus('calling');
            } else if (window.Zadarma.makeCall) {
                window.Zadarma.makeCall(cleanNumber);
                setStatus('calling');
            } else {
                throw new Error("Método de llamada no encontrado en el SDK");
            }
        } catch (err) {
            console.error("Error making Zadarma call:", err);
            setStatus('error');
            setErrorMessage(err.message);
        }
    };

    const handleEnd = () => {
        if (window.Zadarma && window.Zadarma.hangup) {
            window.Zadarma.hangup();
        }

        setStatus('ended');
        if (timerRef.current) clearInterval(timerRef.current);
        if (onClose) setTimeout(onClose, 2000);
    };

    const startTimer = () => {
        setDuration(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setDuration(prev => prev + 1);
        }, 1000);
    };

    const formatDuration = (s) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="voice-call-overlay" onClick={(e) => (status === 'ready' || status === 'error' || status === 'ended') && onClose ? onClose() : null}>
            <div className="voice-call-card" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        color: 'var(--text-muted)'
                    }}
                >
                    ✕
                </button>
                <div className="call-avatar">
                    {phoneNumber ? phoneNumber.replace(/\+/g, '').charAt(0) : '☎️'}
                </div>
                <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>{phoneNumber || "Número desconocido"}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Proveedor: ZADARMA</p>

                <div className={`status-text ${status}`} style={{
                    fontWeight: 'bold',
                    marginBottom: '10px',
                    color: status === 'active' ? '#4ade80' : status === 'calling' ? 'var(--accent)' : status === 'error' ? '#f87171' : 'var(--text-muted)'
                }}>
                    {status === 'initializing' && "Iniciando dispositivo..."}
                    {status === 'ready' && "Listo para llamar"}
                    {status === 'calling' && "Llamando..."}
                    {status === 'active' && `En llamada: ${formatDuration(duration)}`}
                    {status === 'ended' && "Llamada finalizada"}
                    {status === 'error' && (
                        <div style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '10px' }}>
                            Error: {errorMessage || "de configuración"}
                        </div>
                    )}
                </div>

                {/* Indicadores de Hardware y Seguridad */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginBottom: '20px',
                    fontSize: '0.8rem',
                    padding: '15px',
                    background: 'rgba(0,0,0,0.05)',
                    borderRadius: '12px',
                    textAlign: 'left'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: window.isSecureContext ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                        <span>Entorno Seguro:</span>
                        <span>{window.isSecureContext ? '✓ SÍ (OK)' : '✗ NO (BLOQUEADO)'}</span>
                    </div>

                    {!window.isSecureContext && (
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.7rem', color: '#f87171', lineHeight: '1.2' }}>
                            ⚠️ El micrófono NO FUNCIONARÁ. Zadarma requiere que uses <strong>HTTPS</strong> o <strong>localhost</strong>.
                        </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: window.zdrmWebrtcPhoneInterface ? '#4ade80' : '#f87171' }}>
                        <span>Librería Voz:</span>
                        <span>{window.zdrmWebrtcPhoneInterface ? '✓ LISTA' : '✗ CARGANDO...'}</span>
                    </div>

                    <button
                        onClick={async () => {
                            try {
                                if (!navigator.mediaDevices) throw new Error("Acceso a dispositivos de audio bloqueado por el navegador (Requiere HTTPS)");
                                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                alert("✅ ¡Micrófono detectado correctamente!");
                                stream.getTracks().forEach(track => track.stop());
                            } catch (e) {
                                alert("❌ Error de micrófono: " + e.message + "\n\nVerifica que el sitio sea HTTPS y que hayas dado permisos.");
                            }
                        }}
                        style={{
                            marginTop: '10px',
                            padding: '8px',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                        }}
                    >
                        🎤 Probar Micrófono del Navegador
                    </button>
                </div>

                <div className="call-actions" style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                    {status === 'ready' && (
                        <button
                            className="btn-call-circle start"
                            onClick={handleCall}
                            style={{
                                background: '#4ade80',
                                border: 'none',
                                width: '60px',
                                height: '60px',
                                borderRadius: '50%',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '1.5rem',
                                boxShadow: '0 4px 15px rgba(74, 222, 128, 0.4)'
                            }}
                            title="Llamar"
                        >
                            📞
                        </button>
                    )}
                    {(status === 'calling' || status === 'active') && (
                        <button
                            className="btn-call-circle end"
                            onClick={handleEnd}
                            style={{
                                background: '#f87171',
                                border: 'none',
                                width: '60px',
                                height: '60px',
                                borderRadius: '50%',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '1.5rem',
                                boxShadow: '0 4px 15px rgba(248, 113, 113, 0.4)'
                            }}
                            title="Colgar"
                        >
                            ❌
                        </button>
                    )}
                    {(status === 'ready' || status === 'error' || status === 'ended') && (
                        <button
                            className="btn-secondary"
                            onClick={onClose}
                            style={{ padding: '10px 20px', borderRadius: '10px' }}
                        >
                            Cerrar
                        </button>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .voice-call-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(5px);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10000;
                    animation: fadeIn 0.3s ease;
                }
                .voice-call-card {
                    background: #1a1a2e;
                    padding: 50px; border-radius: 30px;
                    text-align: center; width: 320px;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                .call-avatar {
                    width: 90px; height: 90px; border-radius: 50%;
                    background: linear-gradient(135deg, var(--primary), var(--accent));
                    margin: 0 auto 25px auto;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 2.5rem; color: white;
                    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.3);
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .status-text.calling {
                    animation: pulseText 1.5s infinite;
                }
                @keyframes pulseText {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                .btn-call-circle:hover {
                    transform: scale(1.1);
                    transition: transform 0.2s;
                }
            `}} />
        </div>
    );
};

export default VoiceCall;
