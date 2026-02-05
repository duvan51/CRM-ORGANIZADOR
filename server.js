import express from 'express';
// import './frontend/server.js'; // COMENTAMOS EL PUENTE UN MOMENTO

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('<h1>SERVIDOR NODE EN RAIZ FUNCIONANDO</h1>'));
app.get('/test-node', (req, res) => res.send('TEST NODE OK'));

app.listen(port, '0.0.0.0', () => {
    console.log(`Server minimalista corriendo en puerto ${port}`);
});
