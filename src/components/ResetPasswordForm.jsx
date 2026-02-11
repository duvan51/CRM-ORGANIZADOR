import { useState } from "react";
import { supabase } from "../supabase";

const ResetPasswordForm = ({ onComplete }) => {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            return setError("Las contraseñas no coinciden");
        }
        if (password.length < 6) {
            return setError("La contraseña debe tener al menos 6 caracteres");
        }

        setLoading(true);
        setError("");

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            alert("¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.");
            window.location.hash = ""; // Limpiar el hash
            onComplete();
        } catch (err) {
            console.error(err);
            setError(err.message || "Error al actualizar la contraseña");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-brand">
                    <img src="/andocrm.svg" alt="AndoCRM Logo" style={{ width: '80px', height: '80px', marginBottom: '15px' }} />
                    <h1>Nueva Contraseña</h1>
                    <p>Restablecer acceso de Superadmin</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Nueva Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="form-group">
                        <label>Confirmar Contraseña</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="fade-in" style={{ color: "#f87171", fontSize: "0.85rem", textAlign: "center", background: "rgba(239, 68, 68, 0.1)", padding: "10px", borderRadius: "8px" }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-process"
                        style={{ width: "100%", justifyContent: "center", padding: "15px", fontSize: "1rem" }}
                        disabled={loading}
                    >
                        {loading ? <div className="spinner" /> : "Actualizar Contraseña"}
                    </button>

                    <button
                        type="button"
                        className="btn-secondary"
                        style={{ width: "100%", marginTop: "10px" }}
                        onClick={() => { window.location.hash = ""; onComplete(); }}
                    >
                        Cancelar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPasswordForm;
