import { useState } from "react";
import { API_URL } from "../config";

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const params = new URLSearchParams();
        params.append("username", username);
        params.append("password", password);

        try {
            const response = await fetch(`${API_URL}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params,
            });


            if (response.ok) {
                const data = await response.json();
                localStorage.setItem("token", data.access_token);

                // Obtener datos del usuario
                const userRes = await fetch(`${API_URL}/users/me`, {
                    headers: { "Authorization": `Bearer ${data.access_token}` }
                });
                const userData = await userRes.json();

                onLoginSuccess(userData);
            } else {
                setError("Usuario o contraseña incorrectos");
            }
        } catch (err) {
            setError("Error de conexión con el servidor");
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
                        <label>Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="Ej: admin"
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
