import { useState } from "react";
import { supabase } from "../supabase";
import "../login_premium.css";

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

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

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-brand">
                    <h1>CRM Admin</h1>
                    <p>Acceso Profesional</p>
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
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                        />
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
                </form>

                <div className="login-footer">
                    <p>
                        Usa tus credenciales autorizadas.<br />
                        Default: <code>admin@test.com</code> / <code>admin123</code>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
