import { useState, useEffect } from "react";

const AgendaForm = ({ selectedDate, onCitaCreated, onCancel, agendaId, token, agendas }) => {


    const [loading, setLoading] = useState(false);
    const [configServicios, setConfigServicios] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [validationError, setValidationError] = useState("");

    const [formData, setFormData] = useState({
        agenda_id: agendaId,
        mes: new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(selectedDate),
        cantidad: 1,
        dia: new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(selectedDate),
        fecha: selectedDate.toISOString().split('T')[0],
        hora: "08:00",
        servicios: "",
        tipo_servicio: "",
        nombres_completos: "",
        td: "CC",
        documento: "",
        celular: "",
        email: "",
        observaciones: "",
        factura: "",
        confirmacion: "Pendiente",
        vendedor: "",
        otros: ""
    });


    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const [sRes, hRes] = await Promise.all([
                    fetch(`http://localhost:8000/agendas/${agendaId}/services`, { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch(`http://localhost:8000/agendas/${agendaId}/horarios`, { headers: { "Authorization": `Bearer ${token}` } })
                ]);
                const [sData, hData] = await Promise.all([sRes.json(), hRes.json()]);
                setConfigServicios(Array.isArray(sData) ? sData : []);
                setHorarios(Array.isArray(hData) ? hData : []);
            } catch (e) { console.error(e); }
        };
        fetchConfig();
    }, [agendaId]);


    const validateTime = (hora, duracionMinutos) => {
        if (!hora || !duracionMinutos || horarios.length === 0) return true;

        const [h, m] = hora.split(":").map(Number);
        const start = h * 60 + m;
        const end = start + duracionMinutos;

        const dayOfWeek = (selectedDate.getDay() + 6) % 7;
        const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek);

        // Si no hay horarios definidos, permitimos todo (asumimos 24h)
        if (diaHorarios.length === 0) return true;

        const isInsideRange = diaHorarios.some(range => {
            const [rh_s, rm_s] = range.hora_inicio.split(":").map(Number);
            const [rh_e, rm_e] = range.hora_fin.split(":").map(Number);
            const rangeStart = rh_s * 60 + rm_s;
            const rangeEnd = rh_e * 60 + rm_e;
            return start >= rangeStart && end <= rangeEnd;
        });

        if (!isInsideRange) {
            setValidationError(`El procedimiento excede el horario laboral (terminaría a las ${Math.floor(end / 60).toString().padStart(2, '0')}:${(end % 60).toString().padStart(2, '0')})`);
            return false;
        }
        setValidationError("");
        return true;
    };


    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === "hora") {
            const s = configServicios.find(as => as.service.nombre === formData.tipo_servicio);
            validateTime(value, s ? s.service.duracion_minutos : 30);
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await fetch("http://localhost:8000/citas", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                onCitaCreated();
            } else {
                alert("Error al crear la cita");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content agenda-form-card">
                <h3>Agendar Cita - {formData.fecha}</h3>
                <form onSubmit={handleSubmit} className="agenda-grid-form">
                    <div className="form-group">
                        <label>Nombres Completos</label>
                        <input type="text" name="nombres_completos" value={formData.nombres_completos} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Documento (T.D y N°)</label>
                        <div style={{ display: "flex", gap: "5px" }}>
                            <select name="td" value={formData.td} onChange={handleChange} style={{ width: "70px" }}>
                                <option value="CC">CC</option>
                                <option value="TI">TI</option>
                                <option value="CE">CE</option>
                                <option value="PAS">PAS</option>
                            </select>
                            <input type="text" name="documento" value={formData.documento} onChange={handleChange} required style={{ flex: 1 }} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Celular</label>
                        <input type="text" name="celular" value={formData.celular} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="ejemplo@correo.com" />
                    </div>
                    <div className="form-group">
                        <label>Hora</label>
                        <input type="time" name="hora" value={formData.hora} onChange={handleChange} required />
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label>Tipo de Servicio / Consulta</label>
                        <select
                            name="tipo_servicio"
                            value={formData.tipo_servicio}
                            onChange={(e) => {
                                const s = configServicios.find(as => as.service.nombre === e.target.value);
                                if (s) {
                                    validateTime(formData.hora, s.service.duracion_minutos);
                                    setFormData(prev => ({
                                        ...prev,
                                        tipo_servicio: e.target.value,
                                        servicios: e.target.value,
                                        cantidad: s.service.slots
                                    }));
                                } else {
                                    setValidationError("");
                                    setFormData(prev => ({ ...prev, tipo_servicio: e.target.value, servicios: e.target.value }));
                                }
                            }}
                            required
                            className="custom-file-input"
                        >
                            <option value="">-- Seleccionar Servicio --</option>
                            {configServicios.map(as => (
                                <option key={as.id} value={as.service.nombre}>
                                    {as.service.nombre} ({as.service.duracion_minutos} min) -
                                    ${as.precio_final.toLocaleString()}
                                    {as.descuento_porcentaje > 0 ? ` (Dcto ${as.descuento_porcentaje}%)` : ""}
                                </option>
                            ))}
                        </select>
                        {validationError && <p style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: 5 }}>⚠️ {validationError}</p>}
                    </div>


                    <div className="form-group">
                        <label>Vendedor</label>
                        <input type="text" name="vendedor" value={formData.vendedor} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Factura #</label>
                        <input type="text" name="factura" value={formData.factura} onChange={handleChange} />
                    </div>
                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label>Observaciones</label>
                        <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows="2"></textarea>
                    </div>
                    <div className="form-actions" style={{ gridColumn: "span 2" }}>
                        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
                        <button type="submit" className="btn-process" disabled={loading || !!validationError}>
                            {loading ? "Guardando..." : "Guardar Cita"}
                        </button>

                    </div>
                </form>
            </div>
        </div>
    );
};

export default AgendaForm;
