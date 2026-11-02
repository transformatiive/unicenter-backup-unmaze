document.addEventListener('DOMContentLoaded', function () {
  var selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.row-check').forEach(function (cb) {
        cb.checked = selectAll.checked;
      });
    });
  }

  // Linha clicável -> abre o detalhe (exceto ao clicar na checkbox, link ou botão).
  document.querySelectorAll('tr[data-href]').forEach(function (tr) {
    tr.addEventListener('click', function (e) {
      if (e.target.closest('input, a, button, label')) return;
      window.location = tr.getAttribute('data-href');
    });
  });
});

function prepareExport(scope) {
  var idsField = document.getElementById('export-ids');
  if (scope === 'selected') {
    var checked = Array.prototype.slice
      .call(document.querySelectorAll('.row-check:checked'))
      .map(function (cb) { return cb.value; });
    if (checked.length === 0) {
      alert('Seleciona pelo menos um registo, ou usa "Criar lote com todos os resultados".');
      return false;
    }
    idsField.value = checked.join(',');
  } else {
    idsField.value = '';
  }
  return true;
}
