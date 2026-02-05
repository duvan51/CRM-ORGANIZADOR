import { useState } from "react";
import { supabase } from "../supabase";

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
            // Limpiamos espacios accidentales
            const cleanEmail = username.trim();
            const cleanPassword = password.trim();

            const { data, error } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password: cleanPassword,
            });

            if (error) throw error;

            // Obtener perfil detallado (roles, agendas, etc.)
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
                // Si no hay perfil, creamos un objeto básico
                onLoginSuccess({ username: data.user.email, role: 'agent', agendas: [] });
            } else {
                // Formatear agendas para el frontend
                const formattedUser = {
                    ...profile,
                    agendas: profile.agendas.map(a => a.agendas)
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
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: "400px" }}>
                <h2 style={{ textAlign: "center", marginBottom: "24px" }}>Acceso Agentes</h2>
                <form onSubmit={handleSubmit}>
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
                    <div className="form-group" style={{ marginTop: "15px" }}>
                        <label>Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                        />
                    </div>
                    {error && <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: "10px" }}>{error}</p>}
                    <button
                        type="submit"
                        className="btn-process"
                        style={{ width: "100%", marginTop: "24px", justifyContent: "center" }}
                        disabled={loading}
                    >
                        {loading ? <div className="spinner" /> : "Ingresar"}
                    </button>
                </form>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "20px", textAlign: "center" }}>
                    Credenciales por defecto: admin / admin123
                </p>
            </div>
        </div>
    );
};

export default Login;
