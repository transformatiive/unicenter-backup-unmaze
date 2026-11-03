/*
 * Administração > Ficheiros originais.
 * Carregar os CSV originais Unmaze, comparar com a base de dados e preencher
 * campos vazios. Só administradores. Nunca apaga nem substitui valores.
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const fonte = require('../lib/fonte');
const cache = require('../lib/cache');
const { pool } = require('../db');

const router = express.Router();
const MAX_BYTES = 400 * 1024 * 1024; // 400 MB por ficheiro

router.get('/', async (req, res, next) => {
  try {
    const [loaded, comp, runs] = await Promise.all([fonte.loadedSummary(), fonte.lastCompare(), fonte.fills()]);
    res.render('admin/fonte', {
      loaded,
      comp,
      runs,
      msg: typeof req.query.msg === 'string' ? req.query.msg.slice(0, 300) : null,
      err: typeof req.query.err === 'string' ? req.query.err.slice(0, 300) : null,
    });
  } catch (err) {
    next(err);
  }
});

/* Recebe um CSV (multipart), guarda-o num ficheiro temporário e carrega-o. */
router.post('/carregar', (req, res) => {
  let bb;
  try {
    bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
  } catch (e) {
    return res.redirect('/admin/fonte?err=Escolha um ficheiro CSV.');
  }
  const tmp = path.join(os.tmpdir(), `fonte-${crypto.randomBytes(8).toString('hex')}.csv`);
  let fileName = '';
  let tooBig = false;
  let gotFile = false;
  let writeDone = null;

  bb.on('file', (name, file, info) => {
    gotFile = true;
    fileName = path.basename(info.filename || 'ficheiro.csv');
    const out = fs.createWriteStream(tmp);
    writeDone = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
    file.on('limit', () => { tooBig = true; });
    file.pipe(out);
  });

  bb.on('close', async () => {
    const cleanup = () => fs.promises.unlink(tmp).catch(() => {});
    try {
      if (!gotFile) return res.redirect('/admin/fonte?err=Escolha um ficheiro CSV.');
      await writeDone;
      if (tooBig) {
        await cleanup();
        return res.redirect('/admin/fonte?err=Ficheiro demasiado grande (máximo 400 MB).');
      }
      const r = await fonte.loadFile(tmp, fileName);
      await cleanup();
      await pool.query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [
        req.session.user.id, 'fonte_upload', JSON.stringify({ ficheiro: fileName, ...r }),
      ]);
      // eslint-disable-next-line no-console
      console.log('[fonte] carregado', JSON.stringify({ ficheiro: fileName, linhas: r.linhas, novas: r.novas }));
      const extra = r.ignoradas.length ? ` Colunas sem par na base de dados: ${r.ignoradas.join(', ')}.` : '';
      return res.redirect(`/admin/fonte?msg=${encodeURIComponent(
        `${fileName}: ${r.linhas.toLocaleString('pt-PT')} linhas lidas, ${r.novas.toLocaleString('pt-PT')} novas, ${r.jaExistiam.toLocaleString('pt-PT')} já estavam carregadas.${extra}`,
      )}`);
    } catch (err) {
      await cleanup();
      // eslint-disable-next-line no-console
      console.error('[fonte] carregamento falhou:', err.message);
      return res.redirect(`/admin/fonte?err=${encodeURIComponent(`Não foi possível carregar: ${err.message}`.slice(0, 300))}`);
    }
  });
  req.pipe(bb);
  return undefined;
});

router.post('/comparar', async (req, res, next) => {
  try {
    const last = await fonte.lastCompare();
    if (last && last.estado === 'a_calcular' && Date.now() - new Date(last.criado_em).getTime() < 30 * 60 * 1000) {
      return res.redirect('/admin/fonte?msg=A comparação já está a correr.');
    }
    await fonte.startCompare(req.session.user.id);
    return res.redirect('/admin/fonte?msg=Comparação iniciada. A página atualiza sozinha.');
  } catch (err) {
    return next(err);
  }
});

router.post('/preencher', async (req, res, next) => {
  try {
    if (String(req.body.confirm || '').trim().toUpperCase() !== 'PREENCHER') {
      return res.redirect('/admin/fonte?err=Para preencher, escreva PREENCHER na caixa de confirmação.');
    }
    let cols = req.body.cols || [];
    if (!Array.isArray(cols)) cols = [cols];
    cols = cols.map(String).filter((c) => fonte.FILLABLE.includes(c));
    if (!cols.length) return res.redirect('/admin/fonte?err=Escolha pelo menos uma coluna.');
    const running = (await fonte.fills()).find((r) => r.estado === 'a_correr');
    if (running) return res.redirect('/admin/fonte?msg=Já há um preenchimento a correr.');
    await fonte.startFill(req.session.user.id, cols);
    cache.clear();
    return res.redirect('/admin/fonte?msg=Preenchimento iniciado. A página atualiza sozinha.');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
