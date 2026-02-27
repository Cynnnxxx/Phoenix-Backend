const http = require('http');

const username = process.argv[2] || 'Kaudy';
const port = 3013;

const options = {
    hostname: 'localhost',
    port: port,
    path: `/api/reset-level/${encodeURIComponent(username)}`,
    method: 'POST'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const result = JSON.parse(data);
            console.log('\n✅ Sucesso!');
            console.log(JSON.stringify(result, null, 2));
        } catch (e) {
            console.log('\n📄 Resposta:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('\n❌ Erro:', error.message);
    console.log('\nCertifique-se de que o servidor está rodando na porta', port);
});

req.end();

console.log(`\n🔄 Resetando level do usuário: ${username}...`);
