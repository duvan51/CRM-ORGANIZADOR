import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws'; // USAR WS NATIVO
import cors from 'cors';
import multer from 'multer';
import { Op } from 'sequelize';
import sequelize from './api/database.js';
import { User, Agenda, Cita, Bloqueo, Alerta, HorarioAtencion, GlobalService, AgendaService, HorarioServicio } from './api/models.js';
import { authenticateToken, createToken, hashPassword, verifyPassword } from './api/auth.js';
import { analizarArchivos, procesarCitas } from './api/etl.js';

import fs from 'fs';

console.log('>>> [INFO]: INICIANDO SERVER.JS CON WS NATIVO <<<');

// Escribir en archivo de estado para saber SI O SI si Node arrancó
try {
    fs.writeFileSync('server_status.txt', `Iniciado en: ${new Date().toISOString()}\n`);
} catch (e) {
    console.error("No se pudo escribir status log");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// LOG DE REQUESTS DEBUG (LO MÁS ARRIBA POSIBLE)
app.use((req, res, next) => {
    console.log(`[INCOMING REQ]: ${req.method} ${req.url}`);
    next();
});

// ENDPOINT HEALTH CHECK (DIRECTO EN APP, NO ROUTER)
app.get('/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: "ok", db: "connected", time: new Date() });
    } catch (e) {
        res.json({ status: "error", db: "failed", error: e.message });
    }
});
app.get('/api/health', async (req, res) => { // Doble check
    try {
        await sequelize.authenticate();
        res.json({ status: "ok", db: "connected", time: new Date() });
    } catch (e) {
        res.json({ status: "error", db: "failed", error: e.message });
    }
});

// CONFIGURACIÓN WEBSOCKETS (REEMPLAZA A SOCKET.IO)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' }); // Escuchar en /ws

// Función para enviar mensajes a todos los clientes (Broadcast)
const broadcast = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // 1 = OPEN
            client.send(JSON.stringify(data));
        }
    });
};

wss.on('connection', (ws) => {
    console.log('[WS]: Cliente conectado');
    ws.on('error', console.error);
});

const PORT = process.env.PORT || 3005;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- LOG DE SEGURIDAD ---
app.use((req, res, next) => {
    console.log(`[REQUEST]: ${req.method} ${req.url}`);
    next();
});

// Sincronizar Base de Datos e Iniciar Admin si no existe
const initDb = async () => {
    try {
        console.log('>>> [1/5]: Verificando conexión física a MySQL (127.0.0.1)...');
        await sequelize.authenticate();
        console.log('>>> [2/5]: AUTENTICACIÓN EXITOSA. MySQL aceptó las llaves.');
        
        console.log('>>> [3/5]: Intentando crear/sincronizar tablas con sync({alter:true})...');
        await sequelize.sync({ alter: true }); 
        console.log('>>> [4/5]: TABLAS SINCRONIZADAS. Revisar phpMyAdmin ahora.');

        const admin = await User.findOne({ where: { username: 'admin' } });
        if (!admin) {
            console.log('>>> [5/5]: No existe Admin. Creando usuario "admin" con pass "admin123"...');
            const hashed = await hashPassword('admin123');
            await User.create({ username: 'admin', hashed_password: hashed, full_name: 'Super Administrador', role: 'superuser' });
            console.log('>>> [EXITO]: Todo listo. Admin creado.');
        } else {
            console.log('>>> [5/5]: Admin ya existe. Saltando paso.');
        }
    } catch (e) { 
        console.error('!!! [ERROR CRÍTICO EN DB] !!!');
        console.error('Mensaje:', e.message);
        console.error('Stack:', e.stack);
    }
};

// --- API ROUTES (con prefijo /api) ---

// ENDPOINT DE SALUD Y VERIFICACIÓN DE DB
api.get('/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: "ok", db_connected: true, time: new Date() });
    } catch (error) {
        res.status(500).json({ status: "error", db_connected: false, detail: error.message });
    }
});

api.get('/server_status', (req, res) => {
    try {
        const fileCoords = path.resolve('server_status.txt');
        if (fs.existsSync(fileCoords)) {
             res.send(fs.readFileSync(fileCoords, 'utf8') + `\nCWD: ${process.cwd()}`);
        } else {
             res.send(`Server running but status file not found at ${fileCoords}\nCWD: ${process.cwd()}`);
        }
    } catch (e) { res.send(e.message); }
});

api.post('/token', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (user && await verifyPassword(password, user.hashed_password)) {
        res.json({ access_token: createToken(user), token_type: "bearer" });
    } else {
        res.status(401).json({ detail: "Credenciales inválidas" });
    }
});

api.get('/users/me', authenticateToken, async (req, res) => {
    const user = await User.findByPk(req.user.id, { include: [Agenda] });
    res.json(user);
});

api.get('/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    const users = await User.findAll({ include: [Agenda] });
    res.json(users);
});

api.post('/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    const { username, password, full_name, role } = req.body;
    const hashed = await hashPassword(password);
    const user = await User.create({ username, hashed_password: hashed, full_name, role });
    res.json(user);
});

api.delete('/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    await User.destroy({ where: { id: req.params.id, username: { [Op.ne]: 'admin' } } });
    res.json({ status: "ok" });
});

api.get('/agendas', authenticateToken, async (req, res) => {
    if (req.user.role === 'superuser') return res.json(await Agenda.findAll({ include: [User] }));
    const user = await User.findByPk(req.user.id, { include: [Agenda] });
    res.json(user.Agendas || []);
});

api.post('/agendas', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    res.json(await Agenda.create(req.body));
});

api.put('/agendas/:id', authenticateToken, async (req, res) => {
    await Agenda.update(req.body, { where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.delete('/agendas/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'superuser') return res.status(403).send("Forbidden");
    await Agenda.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.post('/agendas/:id/assign/:userId', authenticateToken, async (req, res) => {
    const agenda = await Agenda.findByPk(req.params.id);
    await agenda.addUser(req.params.userId);
    res.json({ status: "assigned" });
});

api.delete('/agendas/:id/unassign/:userId', authenticateToken, async (req, res) => {
    const agenda = await Agenda.findByPk(req.params.id);
    await agenda.removeUser(req.params.userId);
    res.json({ status: "unassigned" });
});

api.get('/global-services', authenticateToken, async (req, res) => {
    res.json(await GlobalService.findAll());
});

api.post('/global-services', authenticateToken, async (req, res) => {
    res.json(await GlobalService.create(req.body));
});

api.put('/global-services/:id', authenticateToken, async (req, res) => {
    await GlobalService.update(req.body, { where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.delete('/global-services/:id', authenticateToken, async (req, res) => {
    await GlobalService.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.get('/agendas/:id/services', authenticateToken, async (req, res) => {
    res.json(await AgendaService.findAll({ where: { agenda_id: req.params.id }, include: ['service'] }));
});

api.post('/agenda-services', authenticateToken, async (req, res) => {
    const { agenda_id, service_id } = req.body;
    const gs = await GlobalService.findByPk(service_id);
    res.json(await AgendaService.create({ agenda_id, service_id, precio_final: gs.precio_base }));
});

api.put('/agenda-services/:id', authenticateToken, async (req, res) => {
    await AgendaService.update(req.body, { where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.delete('/agenda-services/:id', authenticateToken, async (req, res) => {
    await AgendaService.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.get('/citas/:agendaId', authenticateToken, async (req, res) => {
    res.json(await Cita.findAll({ where: { agenda_id: req.params.agendaId } }));
});

api.post('/citas', authenticateToken, async (req, res) => {
    const cita = await Cita.create({ ...req.body });
    broadcast({ type: 'REFRESH_CITAS', agenda_id: cita.agenda_id }); // USAR BROADCAST
    res.json(cita);
});

api.put('/citas/:id', authenticateToken, async (req, res) => {
    await Cita.update(req.body, { where: { id: req.params.id } });
    const cita = await Cita.findByPk(req.params.id);
    broadcast({ type: 'REFRESH_CITAS', agenda_id: cita.agenda_id }); // USAR BROADCAST
    res.json({ status: "ok" });
});

api.delete('/citas/:id', authenticateToken, async (req, res) => {
    const cita = await Cita.findByPk(req.params.id);
    await Cita.destroy({ where: { id: req.params.id } });
    broadcast({ type: 'REFRESH_CITAS', agenda_id: cita.agenda_id }); // USAR BROADCAST
    res.json({ status: "ok" });
});

api.get('/citas/pending-confirmations/all', authenticateToken, async (req, res) => {
    res.json(await Cita.findAll({ where: { confirmacion: 'Pendiente' } }));
});

api.get('/agendas/:id/bloqueos', authenticateToken, async (req, res) => res.json(await Bloqueo.findAll({ where: { agenda_id: req.params.id } })));
api.post('/bloqueos', authenticateToken, async (req, res) => {
    const b = await Bloqueo.create(req.body);
    broadcast({ type: 'REFRESH_BLOQUEOS', agenda_id: b.agenda_id }); // USAR BROADCAST
    res.json(b);
});
api.delete('/bloqueos/:id', authenticateToken, async (req, res) => {
    const b = await Bloqueo.findByPk(req.params.id);
    await Bloqueo.destroy({ where: { id: req.params.id } });
    broadcast({ type: 'REFRESH_BLOQUEOS', agenda_id: b.agenda_id }); // USAR BROADCAST
    res.json({ status: "ok" });
});

api.get('/agendas/:id/alertas', authenticateToken, async (req, res) => res.json(await Alerta.findAll({ where: { agenda_id: req.params.id } })));
api.post('/alertas', authenticateToken, async (req, res) => res.json(await Alerta.create(req.body)));
api.delete('/alertas/:id', authenticateToken, async (req, res) => {
    await Alerta.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.get('/agendas/:id/horarios', authenticateToken, async (req, res) => res.json(await HorarioAtencion.findAll({ where: { agenda_id: req.params.id } })));
api.post('/horarios', authenticateToken, async (req, res) => res.json(await HorarioAtencion.create(req.body)));
api.delete('/horarios/:id', authenticateToken, async (req, res) => {
    await HorarioAtencion.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});
api.delete('/agendas/:id/horarios/dia/:day', authenticateToken, async (req, res) => {
    await HorarioAtencion.destroy({ where: { agenda_id: req.params.id, dia_semana: req.params.day } });
    res.json({ status: "ok" });
});

api.get('/agendas/:id/horarios-servicios', authenticateToken, async (req, res) => res.json(await HorarioServicio.findAll({ where: { agenda_id: req.params.id } })));
api.post('/horarios-servicios', authenticateToken, async (req, res) => res.json(await HorarioServicio.create(req.body)));
api.delete('/horarios-servicios/:id', authenticateToken, async (req, res) => {
    await HorarioServicio.destroy({ where: { id: req.params.id } });
    res.json({ status: "ok" });
});

api.post('/analizar-excel', authenticateToken, upload.single('file'), (req, res) => {
    res.json(analizarArchivos(req.file.buffer));
});

api.post('/procesar-excel', authenticateToken, upload.single('file'), async (req, res) => {
    const mapping = JSON.parse(req.body.mapping);
    const agendaId = req.body.agenda_id;
    const citas = procesarCitas(req.file.buffer, mapping, agendaId);
    await Cita.bulkCreate(citas);
    broadcast({ type: 'REFRESH_CITAS', agenda_id: agendaId }); // USAR BROADCAST
    res.json({ status: "success", count: citas.length });
});

api.get('/stats/agent-sales', authenticateToken, async (req, res) => {
    const today = new Date();
    const monthStr = today.toLocaleString('es-ES', { month: 'long' });
    const count = await Cita.count({ where: { vendedor: req.user.sub, mes: { [Op.like]: `%${monthStr}%` }, confirmacion: 'Confirmada' } });
    res.json({ agent: req.user.sub, sales: count * 550000, count });
});

// Montar el router en /api
app.use('/api', api);

// --- FRONTEND ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// Iniciar servidor SIEMPRE, falle o no la DB
initDb().finally(() => {
    httpServer.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`CRM MONOLÍTICO (NODE.JS + WS) EN PUERTO ${PORT}`);
        console.log(`URL: https://lightpink-cormorant-608039.hostingersite.com/`);
        console.log(`=========================================`);
    });
});
