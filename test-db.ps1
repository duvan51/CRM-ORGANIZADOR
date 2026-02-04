import { Sequelize } from 'sequelize';

const dbName = 'u843449532_andofunnel';
const dbUser = 'u843449532_duvanAponte';
const dbPass = 'Duvan1234789149#';
const dbHost = 'localhost'; // CAMBIAR ESTO si probamos desde fuera de Hostinger

console.log('--- TEST DE CONEXIÓN ---');
console.log(`Intentando conectar a ${dbName} como ${dbUser}...`);

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    dialect: 'mysql',
    logging: console.log
});

async function test() {
    try {
        await sequelize.authenticate();
        console.log('✅ EXITO: Conexión establecida correctamente.');
        
        console.log('Sincronizando tablas...');
        await sequelize.sync({ force: false });
        console.log('✅ EXITO: Tablas creadas/verificadas.');
        
    } catch (error) {
        console.error('❌ ERROR de conexión:', error.message);
        if (error.message.includes('ENOTFOUND')) {
            console.error('Sugerencia: El Host es incorrecto.');
        } else if (error.message.includes('ER_ACCESS_DENIED_ERROR')) {
            console.error('Sugerencia: Usuario o Contraseña incorrectos.');
        }
    } finally {
        await sequelize.close();
        process.exit();
    }
}

test();
