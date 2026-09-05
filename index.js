const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Conexão com a Caderneta Digital (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Teste para ver se o motor está vivo
app.get('/', (req, res) => {
  res.send('O Motor do NhaCarro está a funcionar perfeitamente!');
});

// Endpoint para alimentar o Painel de Gestão (Dashboard)
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Motor a rodar na porta ${PORT}`));
