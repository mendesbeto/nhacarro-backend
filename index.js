const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// Permite conexões de qualquer dispositivo/app
app.use(cors());
app.use(express.json());

// Conexão com a base de dados Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Teste de saúde da API
app.get('/', (req, res) => {
  res.send('O Motor do NhaCarro está a funcionar perfeitamente em Bissau!');
});

// Endpoint 1: Pedir uma corrida
app.post('/pedir-corrida', async (req, res) => {
  const { passageiroId, latOrigem, lngOrigem, latDestino, lngDestino, valorTotal, formaPagamento } = req.body;
  const valorComissao = (valorTotal || 2500) * 0.12; // 12% de comissão

  try {
    const result = await pool.query(
      `INSERT INTO corridas (passageiro_id, origem_coords, destino_coords, valor_total, valor_comissao, forma_pagamento, status)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, 'SOLICITADA')
       RETURNING id, criado_em`,
      [
        passageiroId || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 
        lngOrigem || -15.5843, 
        latOrigem || 11.8632, 
        lngDestino || -15.5900, 
        latDestino || 11.8580, 
        valorTotal || 2500, 
        valorComissao, 
        formaPagamento || 'DINHEIRO'
      ]
    );

    res.json({ mensagem: 'Corrida solicitada com sucesso!', corrida: result.rows[0] });
  } catch (err) {
    console.error('Erro no banco de dados:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// Endpoint 2: Alimentar o Painel de Gestão (Dashboard)
app.get('/estatisticas-admin', async (req, res) => {
  try {
    const corridasRes = await pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(valor_comissao), 0) AS comissoes FROM corridas');
    const motoristasRes = await pool.query("SELECT COUNT(*) AS total FROM usuarios WHERE tipo_perfil = 'MOTORISTA' AND status_conta = 'ATIVO'");
    const ultimasCorridasRes = await pool.query('SELECT * FROM corridas ORDER BY criado_em DESC LIMIT 10');

    res.json({
      totalCorridas: corridasRes.rows[0].total,
      totalComissoes: parseFloat(corridasRes.rows[0].comissoes),
      motoristasAtivos: motoristasRes.rows[0].total,
      ultimasCorridas: ultimasCorridasRes.rows
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Endpoint para registar novos utilizadores (Passageiros e Motoristas)
app.post('/registar-usuario', async (req, res) => {
  const { nome, telefone, tipoPerfil } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nome, telefone, tipo_perfil, status_conta, saldo_carteira)
       VALUES ($1, $2, $3, 'ATIVO', $4)
       ON CONFLICT (telefone) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id, nome, telefone, tipo_perfil, saldo_carteira`,
      [nome, telefone, tipoPerfil || 'PASSAGEIRO', tipoPerfil === 'MOTORISTA' ? 5000.00 : 0.00]
    );

    res.json({ mensagem: 'Utilizador registado com sucesso!', usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Motor a rodar na porta ${PORT}`));
