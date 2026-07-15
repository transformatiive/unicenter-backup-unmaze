const express = require('express');

const router = express.Router();

/*
 * PLACEHOLDER — área de eliminação de dados para compliance RGPD.
 * A funcionalidade real (critérios de eliminação, fluxo de aprovação,
 * eliminação definitiva vs soft-delete, etc.) será implementada a partir
 * das specs de uma app equivalente já existente para este cliente.
 */
router.get('/', (req, res) => {
  res.render('gdpr/placeholder');
});

module.exports = router;
