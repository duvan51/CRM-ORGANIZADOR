import { DataTypes } from 'sequelize';
import sequelize from './database.js';

// Tabla intermedia Usuarios-Agendas
export const AgendaUsers = sequelize.define('agenda_users', {
    user_id: { type: DataTypes.INTEGER, primary_key: true },
    agenda_id: { type: DataTypes.INTEGER, primary_key: true }
}, { timestamps: false });

export const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    hashed_password: { type: DataTypes.STRING, allowNull: false },
    full_name: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING, defaultValue: 'agent' },
    is_active: { type: DataTypes.INTEGER, defaultValue: 1 }
}, { tableName: 'users' });

export const Agenda = sequelize.define('Agenda', {
    name: { type: DataTypes.STRING, unique: true, allowNull: false },
    description: { type: DataTypes.STRING },
    slots_per_hour: { type: DataTypes.INTEGER, defaultValue: 1 }
}, { tableName: 'agendas' });

export const Cita = sequelize.define('Cita', {
    mes: { type: DataTypes.STRING },
    cantidad: { type: DataTypes.INTEGER },
    dia: { type: DataTypes.STRING },
    fecha: { type: DataTypes.STRING },
    hora: { type: DataTypes.STRING },
    servicios: { type: DataTypes.STRING },
    tipo_servicio: { type: DataTypes.STRING },
    nombres_completos: { type: DataTypes.STRING },
    td: { type: DataTypes.STRING },
    documento: { type: DataTypes.STRING },
    celular: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    observaciones: { type: DataTypes.TEXT },
    factura: { type: DataTypes.STRING },
    confirmacion: { type: DataTypes.STRING },
    vendedor: { type: DataTypes.STRING },
    otros: { type: DataTypes.TEXT },
    agenda_id: { type: DataTypes.INTEGER }
}, { tableName: 'citas' });

export const GlobalService = sequelize.define('GlobalService', {
    nombre: { type: DataTypes.STRING, unique: true },
    duracion_minutos: { type: DataTypes.INTEGER, defaultValue: 30 },
    precio_base: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    slots: { type: DataTypes.INTEGER, defaultValue: 1 },
    concurrency: { type: DataTypes.INTEGER, defaultValue: 1 },
    color: { type: DataTypes.STRING, defaultValue: '#3b82f6' },
    image_url: { type: DataTypes.STRING },
    descripcion: { type: DataTypes.TEXT }
}, { tableName: 'global_services' });

export const AgendaService = sequelize.define('AgendaService', {
    agenda_id: { type: DataTypes.INTEGER },
    service_id: { type: DataTypes.INTEGER },
    descuento_porcentaje: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    precio_final: { type: DataTypes.FLOAT, defaultValue: 0.0 },
    activo: { type: DataTypes.INTEGER, defaultValue: 1 }
}, { tableName: 'agenda_services' });

export const Bloqueo = sequelize.define('Bloqueo', {
    agenda_id: { type: DataTypes.INTEGER },
    fecha_inicio: { type: DataTypes.STRING },
    fecha_fin: { type: DataTypes.STRING },
    hora_inicio: { type: DataTypes.STRING },
    hora_fin: { type: DataTypes.STRING },
    es_todo_el_dia: { type: DataTypes.INTEGER, defaultValue: 0 },
    motivo: { type: DataTypes.STRING },
    service_id: { type: DataTypes.INTEGER },
    tipo: { type: DataTypes.INTEGER, defaultValue: 1 }
}, { tableName: 'bloqueos' });

export const Alerta = sequelize.define('Alerta', {
    agenda_id: { type: DataTypes.INTEGER },
    mensaje: { type: DataTypes.STRING },
    tipo: { type: DataTypes.STRING },
    activa: { type: DataTypes.INTEGER, defaultValue: 1 }
}, { tableName: 'alertas' });

export const HorarioAtencion = sequelize.define('HorarioAtencion', {
    agenda_id: { type: DataTypes.INTEGER },
    dia_semana: { type: DataTypes.INTEGER },
    hora_inicio: { type: DataTypes.STRING },
    hora_fin: { type: DataTypes.STRING }
}, { tableName: 'horarios_atencion' });

export const HorarioServicio = sequelize.define('HorarioServicio', {
    agenda_id: { type: DataTypes.INTEGER },
    service_id: { type: DataTypes.INTEGER },
    dia_semana: { type: DataTypes.INTEGER },
    hora_inicio: { type: DataTypes.STRING },
    hora_fin: { type: DataTypes.STRING }
}, { tableName: 'horarios_servicios' });

// RELACIONES
User.belongsToMany(Agenda, { through: AgendaUsers, foreignKey: 'user_id' });
Agenda.belongsToMany(User, { through: AgendaUsers, foreignKey: 'agenda_id' });

Agenda.hasMany(Cita, { foreignKey: 'agenda_id' });
Cita.belongsTo(Agenda, { foreignKey: 'agenda_id' });

Agenda.hasMany(Bloqueo, { foreignKey: 'agenda_id' });
Bloqueo.belongsTo(Agenda, { foreignKey: 'agenda_id' });

Agenda.hasMany(Alerta, { foreignKey: 'agenda_id' });
Alerta.belongsTo(Agenda, { foreignKey: 'agenda_id' });

Agenda.hasMany(HorarioAtencion, { foreignKey: 'agenda_id' });
HorarioAtencion.belongsTo(Agenda, { foreignKey: 'agenda_id' });

Agenda.hasMany(AgendaService, { foreignKey: 'agenda_id' });
AgendaService.belongsTo(Agenda, { foreignKey: 'agenda_id' });

GlobalService.hasMany(AgendaService, { foreignKey: 'service_id' });
AgendaService.belongsTo(GlobalService, { foreignKey: 'service_id', as: 'service' });

Agenda.hasMany(HorarioServicio, { foreignKey: 'agenda_id' });
HorarioServicio.belongsTo(Agenda, { foreignKey: 'agenda_id' });

GlobalService.hasMany(HorarioServicio, { foreignKey: 'service_id' });
HorarioServicio.belongsTo(GlobalService, { foreignKey: 'service_id', as: 'service' });
