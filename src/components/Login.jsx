import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import AndoLogo from "../assets/logoAndoCrm.png";
import LoginIllustration from "../assets/login_illustration.png";
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
            <div className="login-wrapper">
                {/* Columna Izquierda: Showcase de AndoCRM (Visible en Desktop/Tablet) */}
                <div className="login-showcase">
                    <div className="showcase-content">
                        <div className="showcase-badge">Premium Experience</div>
                        <h1>Impulsa tu <span className="text-gradient">Clínica</span> al siguiente nivel</h1>
                        <p className="showcase-description">
                            AndoCRM es la plataforma inteligente que transforma la gestión de tu centro de salud. 
                            Automatiza procesos, escala tu presencia en redes y fideliza a tus pacientes con IA.
                        </p>
                        
                        <div className="features-grid">
                            <div className="feature-item">
                                <div className="feature-icon">📅</div>
                                <div className="feature-text">
                                    <strong>Agenda Pro</strong>
                                    <span>Gestión de citas ultra rápida</span>
                                </div>
                            </div>
                            <div className="feature-item">
                                <div className="feature-icon">🤖</div>
                                <div className="feature-text">
                                    <strong>IA Marketing</strong>
                                    <span>Marketing predictivo inteligente</span>
                                </div>
                            </div>
                            <div className="feature-item">
                                <div className="feature-icon">📱</div>
                                <div className="feature-text">
                                    <strong>Social Hub</strong>
                                    <span>TikTok, IG & YT Automatizado</span>
                                </div>
                            </div>
                            <div className="feature-item">
                                <div className="feature-icon">📈</div>
                                <div className="feature-text">
                                    <strong>Analytics</strong>
                                    <span>Control total en tiempo real</span>
                                </div>
                            </div>
                        </div>

                        <div className="showcase-visual">
                            <img src={LoginIllustration} alt="AndoCRM Illustration" className="illustration-img" />
                        </div>
                    </div>
                </div>

                {/* Columna Derecha: Formulario de Login */}
                <div className="login-card-side">
                    <div className="login-card">
                        <div className="login-brand">
                            <img src={AndoLogo} alt="AndoCRM Logo" className="mobile-only-logo" />
                            <h1>Bienvenido a <span className="text-gradient">AndoCRM</span></h1>
                            <p>Gestión Inteligente para Profesionales</p>
                        </div>

                        <form className="login-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Correo Electrónico</label>
                                <input
                                    type="email"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    placeholder="ejemplo@andocrm.com"
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

                            {error && <div className="error-message fade-in">{error}</div>}

                            <button
                                type="submit"
                                className="btn-process"
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

                        <div className="login-footer">
                            <div className="footer-links">
                                <a href="#privacy">Privacidad</a>
                                <span>•</span>
                                <a href="#terms">Términos</a>
                            </div>
                            <p>© 2026 AndoCRM. Powered by Advanced AI.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
};

export default Login;
