import { Sequelize } from 'sequelize';

// Credenciales que me pasaste
const dbName = 'u843449532_andofunnel';
const dbUser = 'u843449532_duvanAponte';
const dbPass = 'Duvan1234789149#';
const dbHost = 'localhost'; // Necesitamos la IP externa de Hostinger para que funcione desde aquí

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    dialect: 'mysql',
    logging: false
});

async function test() {
    console.log(`Intentando conectar a ${dbHost}...`);
    try {
        await sequelize.authenticate();
        console.log('✅ CONEXIÓN EXITOSA.');
        await sequelize.sync();
        console.log('✅ TABLAS CREADAS.');
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        await sequelize.close();
    }
}

test();
