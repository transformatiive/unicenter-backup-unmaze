function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_admin) {
    return next();
  }
  return res.status(403).render('error', { message: 'Não tens permissões para aceder a esta área.' });
}

module.exports = { requireAuth, requireAdmin };
