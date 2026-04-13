import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import AndoLogo from "../assets/logoAndoCrm.png";
import "../login_premium.css";

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Cargar email recordado al montar
    useEffect(() => {
        const savedEmail = localStorage.getItem("rememberedEmail");
        if (savedEmail) {
            setUsername(savedEmail);
            setRememberMe(true);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const cleanEmail = username.trim();
            const cleanPassword = password.trim();

            const { data, error } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password: cleanPassword,
            });

            if (error) throw error;

            // Lógica de Recordarme
            if (rememberMe) {
                localStorage.setItem("rememberedEmail", cleanEmail);
            } else {
                localStorage.removeItem("rememberedEmail");
            }

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select(`
                    *,
                    agendas:agenda_users(
                        agendas(*)
                    )
                `)
                .eq('id', data.user.id)
                .single();

            if (profileError) {
                onLoginSuccess({ username: data.user.email, role: 'agent', agendas: [] });
            } else {
                const formattedUser = {
                    ...profile,
                    agendas: profile.agendas ? profile.agendas.map(a => a.agendas) : []
                };
                onLoginSuccess(formattedUser);
            }

        } catch (err) {
            console.error("Detalle del error:", err);
            setError(err.message || "Credenciales incorrectas o correo no confirmado");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        const email = prompt("Introduce tu correo electrónico de Superadmin para restablecer la contraseña:");
        if (!email) return;

        setLoading(true);
        try {
            const cleanEmail = email.trim();
            const isMasterAdmin = cleanEmail.toLowerCase() === "duvanaponteramirez@gmail.com";

            // 1. Verificar si existe un perfil superuser con ese username (o si es el Master Admin)
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('username, role')
                .eq('username', cleanEmail)
                .eq('role', 'superuser')
                .maybeSingle();

            if (profileError) throw profileError;

            if (!profile && !isMasterAdmin) {
                alert("Acceso denegado. Solo el correo del Súper Administrador está habilitado para recuperación automática.");
                return;
            }

            // 2. Si se detectó el perfil superuser o es el Master Admin, enviar correo
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: window.location.origin + '/#reset-password',
            });

            if (resetError) throw resetError;

            alert("¡Enlace de recuperación enviado! Revisa tu bandeja de entrada (incluyendo Spam).");
        } catch (err) {
            console.error("Error en recuperación:", err);
            alert("Error al procesar la solicitud: " + (err.message || "Error desconocido"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-brand">
                    <img src={AndoLogo} alt="AndoCRM Logo" style={{ width: '100px', height: '100px', marginBottom: '15px', objectFit: 'contain' }} />
                    <h1>AndoCRM</h1>
                    <p>Gestión Inteligente</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Correo Electrónico</label>
                        <input
                            type="email"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="tu@correo.com"
                        />
                    </div>

                    <div className="form-group">
                        <label>Contraseña</label>
                        <div className="password-wrapper">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                className="toggle-password-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex="-1"
                            >
                                {showPassword ? "👁️‍🗨️" : "👁️"}
                            </button>
                        </div>
                    </div>

                    <div className="login-options">
                        <label className="remember-me">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            Recordar usuario
                        </label>
                        <a href="#" className="forgot-password" onClick={handleForgotPassword}>
                            ¿Olvidaste tu contraseña?
                        </a>
                    </div>

                    {error && <div className="fade-in" style={{ color: "#f87171", fontSize: "0.85rem", textAlign: "center", background: "rgba(239, 68, 68, 0.1)", padding: "10px", borderRadius: "8px" }}>{error}</div>}

                    <button
                        type="submit"
                        className="btn-process"
                        style={{ width: "100%", justifyContent: "center", padding: "15px", fontSize: "1rem" }}
                        disabled={loading}
                    >
                        {loading ? <div className="spinner" /> : "Iniciar Sesión"}
                    </button>

                    <div className="login-divider">
                        <span>O continuar con</span>
                    </div>

                    <button
                        type="button"
                        className="btn-social google"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="18" height="18" />
                        Google
                    </button>
                </form>

                <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '10px' }}>¿Qué es AndoCRM?</h3>
                    <p style={{ fontSize: '0.8rem', opacity: 0.7, lineHeight: '1.6', marginBottom: '20px' }}>
                        Potencia tu clínica con nuestra plataforma todo en uno. Gestión inteligente de citas, 
                        automatización de redes sociales (YouTube, TikTok, Instagram) y marketing predictivo 
                        diseñado para profesionales de la salud.
                    </p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', fontSize: '0.7rem' }}>
                            📅 Agenda Pro
                        </div>
                        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', fontSize: '0.7rem' }}>
                            📱 Social Hub
                        </div>
                    </div>
                </div>

                <div className="login-footer" style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '15px', fontSize: '0.75rem' }}>
                        <a href="#privacy-policy" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Política de Privacidad</a>
                        <span style={{ opacity: 0.3 }}>|</span>
                        <a href="#terms-of-service" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Términos de Servicio</a>
                    </div>
                    <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                        © 2026 AndoCRM. Todos los derechos reservados.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
