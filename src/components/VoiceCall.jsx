import React, { useState, useEffect, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';
import { supabase } from '../supabase';

const VoiceCall = ({ clinicId, phoneNumber, onEnd }) => {
    const [device, setDevice] = useState(null);
    const [call, setCall] = useState(null);
    const [status, setStatus] = useState('initializing'); // initializing, ready, calling, active, ended, error
    const [duration, setDuration] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        setupDevice();
        return () => {
            if (device) {
                console.log("Destroying Twilio device...");
                device.destroy();
            }
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const setupDevice = async () => {
        try {
            console.log("Fetching Twilio token for clinic:", clinicId);
            const { data, error } = await supabase.functions.invoke('twilio-token', {
                body: { clinicId }
            });

            if (error) throw error;
            if (!data.token) throw new Error("No token received");

            const newDevice = new Device(data.token, {
                codecPreferences: ['opus', 'pcmu'],
                fakeLocalAudio: true,
                enableIceRestart: true,
            });

            newDevice.on('registered', () => {
                setStatus('ready');
                console.log('Twilio Device registered');
            });

            newDevice.on('error', (err) => {
                console.error('Twilio Device Error:', err);
                setStatus('error');
            });

            await newDevice.register();
            setDevice(newDevice);
        } catch (err) {
            console.error('Error setting up Twilio device:', err);
            setStatus('error');
        }
    };

    const handleCall = async () => {
        if (!device || !phoneNumber) return;

        try {
            const params = {
                To: phoneNumber,
                number: phoneNumber,
            };

            console.log("Initiating call to:", phoneNumber);
            const newCall = await device.connect({ params });
            setCall(newCall);
            setStatus('calling');

            newCall.on('accept', () => {
                console.log("Call accepted");
                setStatus('active');
                startTimer();
            });

            newCall.on('disconnect', () => {
                console.log("Call disconnected");
                handleEnd();
            });

            newCall.on('reject', () => {
                console.log("Call rejected");
                handleEnd();
            });
        } catch (err) {
            console.error("Error connecting call:", err);
            setStatus('error');
        }
    };

    const handleEnd = () => {
        if (call) {
            call.disconnect();
            setCall(null);
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
                    {phoneNumber ? phoneNumber.replace(/\+/g, '').charAt(0) : '📞'}
                </div>
                <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>{phoneNumber || "Número desconocido"}</h3>

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
                    {status === 'error' && "Error de configuración"}
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
