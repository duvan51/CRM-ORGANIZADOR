import { useState, useEffect } from "react";
import { API_URL } from "../config";

const AgendaForm = ({ selectedDate, onCitaCreated, onCancel, agendaId, token, userRole, initialData = null, currentUserName = "" }) => {


    const [loading, setLoading] = useState(false);
    const [configServicios, setConfigServicios] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [horariosServicios, setHorariosServicios] = useState([]);
    const [bloqueos, setBloqueos] = useState([]);
    const [availableServices, setAvailableServices] = useState([]);
    const [validationError, setValidationError] = useState("");

    const [formData, setFormData] = useState(initialData || {
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
        vendedor: currentUserName || "",
        otros: ""
    });


    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const [sRes, hRes, bRes, hsRes] = await Promise.all([
                    fetch(`${API_URL}/agendas/${agendaId}/services`, { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch(`${API_URL}/agendas/${agendaId}/horarios`, { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch(`${API_URL}/agendas/${agendaId}/bloqueos`, { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch(`${API_URL}/agendas/${agendaId}/horarios-servicios`, { headers: { "Authorization": `Bearer ${token}` } })
                ]);
                const [sData, hData, bData, hsData] = await Promise.all([sRes.json(), hRes.json(), bRes.json(), hsRes.json()]);
                setConfigServicios(Array.isArray(sData) ? sData : []);
                setHorarios(Array.isArray(hData) ? hData : []);
                setBloqueos(Array.isArray(bData) ? bData : []);
                setHorariosServicios(Array.isArray(hsData) ? hsData : []);
            } catch (e) { console.error(e); }
        };
        fetchConfig();
    }, [agendaId]);

    // Filtrar servicios disponibles según el día de la semana
    useEffect(() => {
        if (!configServicios || configServicios.length === 0) {
            setAvailableServices([]);
            return;
        }

        const dayIndex = (selectedDate.getDay() + 6) % 7; // 0=Lunes, 6=Domingo

        const filtered = configServicios.filter(as => {
            // Verificar si el servicio tiene reglas específicas en esta agenda
            const hasSpecificRules = horariosServicios.some(hs => hs.service_id === as.service_id);

            if (!hasSpecificRules) return true; // Si no tiene reglas, asume horario general (disponible)

            // Si tiene reglas, DEBE tener una regla para ESTE día
            const ruleForToday = horariosServicios.some(hs =>
                hs.service_id === as.service_id && hs.dia_semana === dayIndex
            );
            return ruleForToday;
        });

        setAvailableServices(filtered);
    }, [configServicios, horariosServicios, selectedDate]);


    const validateTime = (hora, duracionMinutos) => {
        const dateStr = selectedDate.toISOString().split('T')[0];

        // Verificar Habilitaciones (Exception Tipo 2)
        const hasEnablement = bloqueos.some(b =>
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            b.tipo === 2 &&
            (b.es_todo_el_dia || (b.hora_inicio <= hora && b.hora_fin > hora))
        );

        if (hasEnablement) {
            setValidationError("");
            return true;
        }

        const dayOfWeek = (selectedDate.getDay() + 6) % 7;
        const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek);

        // Si no hay horarios definidos y no hay habilitación, está cerrado
        if (diaHorarios.length === 0) {
            setValidationError("No hay horario de atención definido para este día");
            return false;
        }

        const [h, m] = hora.split(":").map(Number);
        const start = h * 60 + m;
        const end = start + duracionMinutos;

        const isInsideRange = diaHorarios.some(range => {
            const [rh_s, rm_s] = range.hora_inicio.split(":").map(Number);
            const [rh_e, rm_e] = range.hora_fin.split(":").map(Number);
            const rangeStart = rh_s * 60 + rm_s;
            const rangeEnd = rh_e * 60 + rm_e;
            return start >= rangeStart && end <= rangeEnd;
        });

        if (!isInsideRange) {
            setValidationError(`El horario excede el rango laboral definido`);
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

        // Bloqueo de fechas pasadas para agentes
        if (userRole !== "superuser" && userRole !== "admin") {
            const now = new Date();
            const appointmentDate = new Date(`${formData.fecha}T${formData.hora}`);
            if (appointmentDate < now) {
                alert("No puedes agendar citas en el pasado. Contacta a un administrador.");
                return;
            }
        }

        setLoading(true);
        try {
            const url = initialData
                ? `${API_URL}/citas/${initialData.id}`
                : `${API_URL}/citas`;
            const method = initialData ? "PUT" : "POST";

            const response = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                onCitaCreated();
            } else {
                if (response.status === 401) {
                    alert("Tu sesión ha expirado o no es válida. Por favor, cierra sesión e ingresa nuevamente.");
                } else {
                    const err = await response.json();
                    alert(err.detail || "Error al procesar la cita");
                }
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
                <h3>{initialData ? "Editar Cita" : "Agendar Cita"} - {formData.fecha}</h3>
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
                            {availableServices.map(as => (
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
                        <input
                            type="text"
                            name="vendedor"
                            value={formData.vendedor}
                            onChange={handleChange}
                            required
                            readOnly={!!currentUserName}
                            style={currentUserName ? { opacity: 0.7, background: 'rgba(0,0,0,0.1)' } : {}}
                        />
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
                            {loading ? "Guardando..." : (initialData ? "Guardar Cambios" : "Guardar Cita")}
                        </button>

                    </div>
                </form>
            </div >
        </div >
    );
};

export default AgendaForm;
