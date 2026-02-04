import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import { Op } from 'sequelize';
import sequelize from './api/database.js';
import { User, Agenda, Cita, Bloqueo, Alerta, HorarioAtencion, GlobalService, AgendaService, HorarioServicio } from './api/models.js';
import { authenticateToken, createToken, hashPassword, verifyPassword } from './api/auth.js';
import { analizarArchivos, procesarCitas } from './api/etl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3005;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sincronizar Base de Datos e Iniciar Admin si no existe
const initDb = async () => {
    try {
        console.log('[SISTEMA]: Iniciando sincronización de Base de Datos...');
        await sequelize.authenticate();
        console.log('[SISTEMA]: Conexión a MySQL exitosa.');

        await sequelize.sync({ alter: false }); 
        console.log('[SISTEMA]: Tablas sincronizadas correctamente.');

        const admin = await User.findOne({ where: { username: 'admin' } });
        if (!admin) {
            console.log("[SISTEMA]: No se encontró admin. Creando usuario inicial...");
            const hashed = await hashPassword('admin123');
            await User.create({
                username: 'admin',
                hashed_password: hashed,
                full_name: 'Super Administrador',
                role: 'superuser'
            });
            console.log("[SISTEMA]: Usuario 'admin' creado exitosamente con pass 'admin123'.");
        } else {
            console.log("[SISTEMA]: Usuario admin ya existe.");
        }
    } catch (e) { 
        console.error('[CRÍTICO]: Error fatal al iniciar la base de datos:', e);
    }
};

// --- AUTH ---
app.post('/token', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (user && await verifyPassword(password, user.hashed_password)) {
        res.json({ access_token: createToken(user), token_type: "bearer" });
    } else {
        res.status(401).json({ detail: "Credenciales inválidas" });
    }
});

app.get('/users/me', authenticateToken, async (req, res) => {
    const user = await User.findByPk(req.user.id, { include: [Agenda] });
    res.json(user);
});

// --- ADMIN / USERS ---
app.get('/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    const users = await User.findAll({ include: [Agenda] });
    res.json(users);
});

app.post('/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    const { username, password, full_name, role } = req.body;
    const hashed = await hashPassword(password);
    const user = await User.create({ username, hashed_password: hashed, full_name, role });
    res.json(user);
});

app.delete('/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    await User.destroy({ where: { id: req.params.id, username: { [Op.ne]: 'admin' } } });
    res.json({ status: "ok" });
});

// --- AGENDAS ---
app.get('/agendas', authenticateToken, async (req, res) => {
    if (req.user.role === 'superuser') return res.json(await Agenda.findAll({ include: [User] }));
    const user = await User.findByPk(req.user.id, { include: [Agenda] });
    res.json(user.Agendas || []);
});

app.post('/agendas', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    res.json(await Agenda.create(req.body));
});

app.put('/agendas/:id', authenticateToken, async (req, res) => {
    await Agenda.update(req.body, { where: { id: req.params.id } });
    res.json({ status: "ok" });
});

app.delete('/agendas/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    await Agenda.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

app.post('/agendas/:id/assign/:userId', authenticateToken, async (req, res) => {
    const agenda = await Agenda.findByPk(req.params.id);
    await agenda.addUser(req.params.userId);
    res.json({ status: "assigned" });
});

app.delete('/agendas/:id/unassign/:userId', authenticateToken, async (req, res) => {
    const agenda = await Agenda.findByPk(req.params.id);
    await agenda.removeUser(req.params.userId);
    res.json({ status: "unassigned" });
});

// --- SERVICIOS GLOBALES ---
app.get('/global-services', authenticateToken, async (req, res) => {
    res.json(await GlobalService.findAll());
});

app.post('/global-services', authenticateToken, async (req, res) => {
    res.json(await GlobalService.create(req.body));
});

app.put('/global-services/:id', authenticateToken, async (req, res) => {
    await GlobalService.update(req.body, { where: { id: req.params.id } });
    res.json({ status: "ok" });
});

app.delete('/global-services/:id', authenticateToken, async (req, res) => {
    await GlobalService.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

// --- AGENDA SERVICES (OFERTAS) ---
app.get('/agendas/:id/services', authenticateToken, async (req, res) => {
    res.json(await AgendaService.findAll({ where: { agenda_id: req.params.id }, include: ['service'] }));
});

app.post('/agenda-services', authenticateToken, async (req, res) => {
    const { agenda_id, service_id } = req.body;
    const gs = await GlobalService.findByPk(service_id);
    res.json(await AgendaService.create({ agenda_id, service_id, precio_final: gs.precio_base }));
});

app.put('/agenda-services/:id', authenticateToken, async (req, res) => {
    await AgendaService.update(req.body, { where: { id: req.params.id } });
    res.json({ status: "ok" });
});

app.delete('/agenda-services/:id', authenticateToken, async (req, res) => {
    await AgendaService.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

// --- CITAS ---
app.get('/citas/:agendaId', authenticateToken, async (req, res) => {
    res.json(await Cita.findAll({ where: { agenda_id: req.params.agendaId } }));
});

app.post('/citas', authenticateToken, async (req, res) => {
    const cita = await Cita.create({ ...req.body });
    io.emit('REFRESH_CITAS', { agenda_id: cita.agenda_id });
    res.json(cita);
});

app.put('/citas/:id', authenticateToken, async (req, res) => {
    await Cita.update(req.body, { where: { id: req.params.id } });
    const cita = await Cita.findByPk(req.params.id);
    io.emit('REFRESH_CITAS', { agenda_id: cita.agenda_id });
    res.json({ status: "ok" });
});

app.delete('/citas/:id', authenticateToken, async (req, res) => {
    const cita = await Cita.findByPk(req.params.id);
    await Cita.destroy({ where: { id: req.params.id } });
    io.emit('REFRESH_CITAS', { agenda_id: cita.agenda_id });
    res.json({ status: "ok" });
});

app.get('/citas/pending-confirmations/all', authenticateToken, async (req, res) => {
    res.json(await Cita.findAll({ where: { confirmacion: 'Pendiente' } }));
});

// --- BLOQUEOS / ALERTAS / HORARIOS ---
app.get('/agendas/:id/bloqueos', authenticateToken, async (req, res) => res.json(await Bloqueo.findAll({ where: { agenda_id: req.params.id } })));
app.post('/bloqueos', authenticateToken, async (req, res) => {
    const b = await Bloqueo.create(req.body);
    io.emit('REFRESH_BLOQUEOS', { agenda_id: b.agenda_id });
    res.json(b);
});
app.delete('/bloqueos/:id', authenticateToken, async (req, res) => {
    const b = await Bloqueo.findByPk(req.params.id);
    await Bloqueo.destroy({ where: { id: req.params.id } });
    io.emit('REFRESH_BLOQUEOS', { agenda_id: b.agenda_id });
    res.json({ status: "ok" });
});

app.get('/agendas/:id/alertas', authenticateToken, async (req, res) => res.json(await Alerta.findAll({ where: { agenda_id: req.params.id } })));
app.post('/alertas', authenticateToken, async (req, res) => res.json(await Alerta.create(req.body)));
app.delete('/alertas/:id', authenticateToken, async (req, res) => {
    await Alerta.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

app.get('/agendas/:id/horarios', authenticateToken, async (req, res) => res.json(await HorarioAtencion.findAll({ where: { agenda_id: req.params.id } })));
app.post('/horarios', authenticateToken, async (req, res) => res.json(await HorarioAtencion.create(req.body)));
app.delete('/horarios/:id', authenticateToken, async (req, res) => {
    await HorarioAtencion.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});
app.delete('/agendas/:id/horarios/dia/:day', authenticateToken, async (req, res) => {
    await HorarioAtencion.destroy({ where: { agenda_id: req.params.id, dia_semana: req.params.day } });
    res.json({ status: "ok" });
});

app.get('/agendas/:id/horarios-servicios', authenticateToken, async (req, res) => res.json(await HorarioServicio.findAll({ where: { agenda_id: req.params.id } })));
app.post('/horarios-servicios', authenticateToken, async (req, res) => res.json(await HorarioServicio.create(req.body)));
app.delete('/horarios-servicios/:id', authenticateToken, async (req, res) => {
    await HorarioServicio.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

// --- ETL ENPPOINTS ---
app.post('/analizar-excel', authenticateToken, upload.single('file'), (req, res) => {
    res.json(analizarArchivos(req.file.buffer));
});

app.post('/procesar-excel', authenticateToken, upload.single('file'), async (req, res) => {
    const mapping = JSON.parse(req.body.mapping);
    const agendaId = req.body.agenda_id;
    const citas = procesarCitas(req.file.buffer, mapping, agendaId);
    await Cita.bulkCreate(citas);
    io.emit('REFRESH_CITAS', { agenda_id: agendaId });
    res.json({ status: "success", count: citas.length });
});

// --- STATS ---
app.get('/stats/agent-sales', authenticateToken, async (req, res) => {
    const today = new Date();
    const monthStr = today.toLocaleString('es-ES', { month: 'long' });
    const count = await Cita.count({ where: { vendedor: req.user.sub, mes: { [Op.like]: `%${monthStr}%` }, confirmacion: 'Confirmada' } });
    res.json({ agent: req.user.sub, sales: count * 550000, count });
});

// --- FRONTEND ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// Iniciar servidor después de intentar conectar a la DB
initDb().then(() => {
    httpServer.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`CRM MONOLÍTICO (NODE.JS) EN PUERTO ${PORT}`);
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`=========================================`);
    });
});
