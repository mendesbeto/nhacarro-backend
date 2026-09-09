const express = require('express');
const cors = require('cors');

// Configuração do Pool para aceitar a ligação do Supabase/Pooler sem recusa
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());


// Configuração otimizada para o Supavisor / Pooler do Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

app.get('/', (req, res) => {
  res.send('O Motor do NhaCarro está operacional com suporte a tempo real!');
});

// 1. REGISTAR NOVO UTILIZADOR
// Endpoint de Registo de Utilizador (Corrigido para evitar Erro 500)
app.post('/registar-usuario', async (req, res) => {
  const { nome, telefone, tipoPerfil } = req.body;
  
  console.log('--- TENTATIVA DE REGISTO ---');
  console.log(`Nome: ${nome} | Telefone: ${telefone} | Perfil: ${tipoPerfil}`);

  const perfilFormatado = (tipoPerfil || 'PASSAGEIRO').toUpperCase();
  const nomeFormatado = nome || 'Passageiro Bissau';

  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nome, telefone, tipo_perfil, status_conta, saldo_carteira)
       VALUES ($1, $2, $3, 'ATIVO', $4)
       ON CONFLICT (telefone) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id, nome, telefone, tipo_perfil, saldo_carteira`,
      [
        nomeFormatado, 
        telefone, 
        perfilFormatado, 
        perfilFormatado === 'MOTORISTA' ? 5000.00 : 0.00
      ]
    );

    console.log('REGISTO BEM SUCEDIDO:', result.rows[0]);
    res.status(200).json({ mensagem: 'Utilizador registado com sucesso!', usuario: result.rows[0] });
  } catch (err) {
    // Exibe o erro detalhado no log do Render
    console.error('ERRO NO SUPABASE (DETALHADO):', err.stack || err);
    res.status(500).json({ erro: err.message, detalhe: err.detail });
  }
});

// 2. SOLICITAR CORRIDA (PASSAGEIRO)
app.post('/pedir-corrida', async (req, res) => {
  const { passageiroId, latOrigem, lngOrigem, latDestino, lngDestino, enderecoOrigem, enderecoDestino, categoria, valorTotal, formaPagamento } = req.body;
  const valorComissao = (valorTotal || 2500) * 0.12;

  try {
    const result = await pool.query(
      `INSERT INTO corridas (passageiro_id, origem_coords, destino_coords, endereco_origem, endereco_destino, categoria, valor_total, valor_comissao, forma_pagamento, status)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, $9, $10, $11, 'SOLICITADA')
       RETURNING id, status, criado_em`,
      [
        passageiroId,
        lngOrigem || -15.5843, latOrigem || 11.8632,
        lngDestino || -15.5900, latDestino || 11.8580,
        enderecoOrigem || 'Origem Bissau', enderecoDestino || 'Destino Bissau',
        categoria || 'TAXI_TRADICIONAL', valorTotal || 2500, valorComissao, formaPagamento || 'DINHEIRO'
      ]
    );
    res.json({ mensagem: 'Corrida solicitada! A aguardar motorista.', corrida: result.rows[0] });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// 3. ATUALIZAR STATUS DA CORRIDA (MOTORISTA: ACEITAR, INICIAR, FINALIZAR)
app.post('/atualizar-status-corrida', async (req, res) => {
  const { corridaId, motoristaId, novoStatus } = req.body;

  try {
    const result = await pool.query(
      `UPDATE corridas 
       SET status = $1, motorista_id = COALESCE($2, motorista_id), atualizado_em = NOW()
       WHERE id = $3 RETURNING *`,
      [novoStatus, motoristaId, corridaId]
    );

    // Se a corrida for CONCLUIDA, deduz a comissão de 12% da carteira do motorista
    if (novoStatus === 'CONCLUIDA' && result.rows.length > 0) {
      const corrida = result.rows[0];
      await pool.query(
        `UPDATE usuarios SET saldo_carteira = saldo_carteira - $1 WHERE id = $2`,
        [corrida.valor_comissao, corrida.motorista_id]
      );
    }

    res.json({ mensagem: `Status alterado para ${novoStatus}`, corrida: result.rows[0] });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// 4. TRANSMITIR POSIÇÃO GPS DO MOTORISTA
app.post('/atualizar-posicao-gps', async (req, res) => {
  const { motoristaId, lat, lng, disponivel } = req.body;

  try {
    await pool.query(
      `INSERT INTO posicoes_motoristas (motorista_id, coordenadas, disponivel, ultima_atualizacao)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, NOW())
       ON CONFLICT (motorista_id) DO UPDATE 
       SET coordenadas = EXCLUDED.coordenadas, disponivel = EXCLUDED.disponivel, ultima_atualizacao = NOW()`,
      [motoristaId, lng, lat, disponivel ?? true]
    );
    res.json({ status: 'Posição GPS atualizada' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// 5. PAINEL DE GESTÃO (DASHBOARD)
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Motor a rodar na porta ${PORT}`));
