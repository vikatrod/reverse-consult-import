const express = require('express');
const bodyParser = require('body-parser');
const CIDR = require('ip-cidr');
const dns = require('dns').promises;
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Usuário e senha para autenticação básica
const BASIC_USER = process.env.BASIC_USER;
const BASIC_PASS = process.env.BASIC_PASS;

app.use(bodyParser.json());

// 🔵 Middleware de Autenticação Básica
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Protected"');
    return res.status(401).send('Authentication required.');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [user, pass] = credentials.split(':');

  if (user === BASIC_USER && pass === BASIC_PASS) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Protected"');
    return res.status(401).send('Invalid credentials.');
  }
});

// 🔥 Middleware global para logar todas requisições
app.use((req, res, next) => {
  const start = Date.now();

  console.log(`🚀 [${new Date().toISOString()}] Nova requisição: ${req.method} ${req.originalUrl}`);
  console.log(`📥 Body recebido:`, JSON.stringify(req.body, null, 2));

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`📤 Resposta ${res.statusCode} enviada em ${duration}ms\n`);
  });

  next();
});

// Função para gerar todos IPs a partir do bloco CIDR
function listIps(cidr) {
  if (!CIDR.isValidCIDR(cidr)) {
    throw new Error('Bloco CIDR inválido!');
  }
  const cidrRange = new CIDR(cidr);
  return cidrRange.toArray();
}

// Função para resolver PTR reverso de um IP
async function resolvePtr(ip) {
  try {
    const result = await dns.reverse(ip);
    return result[0] || null;
  } catch {
    return null;
  }
}

// Converte IP para nome de reverso (ex: 1.0.168.195.in-addr.arpa)
function ipToReverse(ip) {
  return ip.split('.').reverse().join('.') + '.in-addr.arpa';
}

// 🔵 Rota 1: Buscar reverso
app.post('/buscar-reverso', async (req, res) => {
  const { cidr } = req.body;
  if (!cidr) return res.status(400).json({ error: 'CIDR não informado' });

  try {
    const ips = listIps(cidr);
    const resultados = [];

    for (const ip of ips) {
      const ptr = await resolvePtr(ip);
      resultados.push({ ip, ptr });
    }

    res.json({ cidr, resultados });
  } catch (error) {
    console.error(`⚠️ Erro em /buscar-reverso:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// 🟠 Rota 2: Gravar manualmente
app.post('/gravar', async (req, res) => {
  const { registros, domain_id } = req.body;

  if (!registros || !Array.isArray(registros) || !domain_id) {
    return res.status(400).json({ error: 'Registros ou domain_id não informados corretamente' });
  }

  const ttl = parseInt(process.env.TTL);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const { ip, ptr } of registros) {
      if (!ptr) continue;

      const name = ipToReverse(ip);

      await connection.query(
        'INSERT INTO records (name, content, type, ttl, domain_id, auth) VALUES (?, ?, ?, ?, ?, ?)',
        [name, ptr, 'PTR', ttl, domain_id, 1]
      );
    }

    await connection.commit();
    res.json({ message: '✅ Registros gravados com sucesso' });
  } catch (error) {
    await connection.rollback();
    console.error(`⚠️ Erro em /gravar:`, error.message);
    res.status(500).json({ error: 'Erro ao gravar no banco: ' + error.message });
  } finally {
    connection.release();
  }
});

// 🟢 Rota 3: Importar direto
app.post('/importar', async (req, res) => {
  const { cidr, reverse_zone, domain_id } = req.body;

  if (!domain_id || (!cidr && !reverse_zone)) {
    return res.status(400).json({ error: 'CIDR ou Reverse Zone e domain_id são obrigatórios' });
  }

  const ttl = parseInt(process.env.TTL);
  let ips = [];

  try {
    if (cidr) {
      if (!CIDR.isValidCIDR(cidr)) {
        throw new Error('Bloco CIDR inválido!');
      }
      ips = listIps(cidr);
    } else if (reverse_zone) {
      const base = reverse_zone.replace('.in-addr.arpa', '').split('.').reverse().join('.');
      const cidrGenerated = `${base}.0/24`;
      if (!CIDR.isValidCIDR(cidrGenerated)) {
        throw new Error('Reverse Zone inválida ou mal formatada!');
      }
      ips = listIps(cidrGenerated);
    } else {
      throw new Error('Nenhuma entrada válida fornecida!');
    }
  } catch (error) {
    console.error(`⚠️ Erro ao processar CIDR/ReverseZone:`, error.message);
    return res.status(400).json({ error: error.message });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const ip of ips) {
      try {
        const ptr = await resolvePtr(ip);
        if (ptr) {
          const name = ipToReverse(ip);

          const [rows] = await connection.query(
            'SELECT id FROM records WHERE name = ? AND type = "PTR" LIMIT 1',
            [name]
          );

          if (rows.length > 0) {
            await connection.query(
              'UPDATE records SET content = ?, ttl = ?, auth = 1 WHERE id = ?',
              [ptr, ttl, rows[0].id]
            );
          } else {
            await connection.query(
              'INSERT INTO records (name, content, type, ttl, domain_id, auth) VALUES (?, ?, ?, ?, ?, ?)',
              [name, ptr, 'PTR', ttl, domain_id, 1]
            );
          }
        }
      } catch (err) {
        console.error(`⚠️ Erro processando IP ${ip}:`, err.message);
      }
    }

    await connection.commit();
    res.json({ message: `✅ Importação concluída!` });
  } catch (error) {
    await connection.rollback();
    console.error(`⚠️ Erro em /importar:`, error.message);
    res.status(500).json({ error: 'Erro ao importar: ' + error.message });
  } finally {
    connection.release();
  }
});

app.listen(PORT, () => {
  console.log(`✅ Webservice rodando na porta ${PORT}`);
});
