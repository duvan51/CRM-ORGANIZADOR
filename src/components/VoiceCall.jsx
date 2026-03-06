import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const VoiceCall = ({ clinicId, phoneNumber, onEnd }) => {
    const [status, setStatus] = useState('initializing'); // initializing, ready, calling, active, ended, error
    const [errorMessage, setErrorMessage] = useState('');
    const [duration, setDuration] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        setupZadarma();

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            // Zadarma clean up if needed
        };
    }, []);

    const setupZadarma = async () => {
        try {
            console.log("Setting up Zadarma for clinic:", clinicId);
            const { data, error } = await supabase.functions.invoke('zadarma-token', {
                body: { clinicId }
            });

            if (error) throw error;
            if (!data.key) throw new Error("No Zadarma key received");

            // Load Zadarma script
            if (!window.Zadarma) {
                const script = document.createElement('script');
                script.src = "https://my.zadarma.com/webrtc/widget.js";
                script.async = true;
                script.onload = () => initializeZadarmaWidget(data.key);
                document.body.appendChild(script);
            } else {
                initializeZadarmaWidget(data.key);
            }
        } catch (err) {
            console.error('Error setting up Zadarma:', err);
            setStatus('error');
            setErrorMessage(err.message || "Error al configurar Zadarma");
        }
    };

    const initializeZadarmaWidget = (key) => {
        if (!window.Zadarma) return;

        console.log("Initializing Zadarma with key:", key);

        // Standard Zadarma WebRTC config object
        window.zadarmaConfig = {
            key: key,
            onReady: () => {
                console.log("Zadarma WebRTC Ready");
                setStatus('ready');
            },
            onCallStart: () => {
                console.log("Zadarma Call Started");
                setStatus('active');
                startTimer();
            },
            onCallEnd: () => {
                console.log("Zadarma Call Ended");
                handleEnd();
            },
            onError: (err) => {
                console.error("Zadarma WebRTC Error:", err);
                if (status === 'initializing') {
                    setStatus('error');
                    setErrorMessage("Error de conexión con Zadarma");
                }
            }
        };

        // Initialize Zadarma
        try {
            if (window.Zadarma.prepare) {
                window.Zadarma.prepare(window.zadarmaConfig);
            } else if (window.Zadarma.init) {
                window.Zadarma.init(window.zadarmaConfig);
            }
        } catch (e) {
            console.error("Fail to init Zadarma:", e);
        }

        // Fallback if onReady is not called
        setTimeout(() => {
            if (status === 'initializing') {
                console.log("Forcing ready status (timeout)");
                setStatus('ready');
            }
        }, 5000);
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
        if (onEnd) setTimeout(onEnd, 2000);
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
        <div className="voice-call-overlay" onClick={(e) => status === 'ready' || status === 'error' || status === 'ended' ? onEnd() : null}>
            <div className="voice-call-card" onClick={e => e.stopPropagation()}>
                <div className="call-avatar">
                    {phoneNumber ? phoneNumber.replace(/\+/g, '').charAt(0) : '☎️'}
                </div>
                <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>{phoneNumber || "Número desconocido"}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Proveedor: ZADARMA</p>

                <p className={`status-text ${status}`} style={{
                    fontWeight: 'bold',
                    marginBottom: '30px',
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
                </p>

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
                            onClick={onEnd}
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
