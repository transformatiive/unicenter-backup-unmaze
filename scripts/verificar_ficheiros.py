#!/usr/bin/env python3
"""
Calcula, a partir dos ficheiros originais Unmaze (CSV), as mesmas "impressões
digitais" por coluna que src/lib/verificacao.js calcula na base de dados.
Se os números de uma coluna forem iguais, todos os valores dessa coluna são
iguais nos dois lados, linha a linha. Só imprime números, nenhum dado pessoal.

Uso: python3 scripts/verificar_ficheiros.py ficheiro1.csv [ficheiro2.csv ...] > resultado.json
"""
import csv, hashlib, json, re, sys, unicodedata

csv.field_size_limit(10**9)
KEY = 'chavealunounmaze'


def sanitize(name, i):
    s = unicodedata.normalize('NFD', name.strip().lower())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^a-z0-9_]+', '_', s).strip('_')
    if not s:
        s = 'col_%d' % i
    if s[0].isdigit():
        s = 'c_' + s
    return s


def h(text):
    return int(hashlib.md5(text.encode('utf-8')).hexdigest()[:8], 16)


def main(paths):
    cols = None
    total = {}
    groups = {}
    rows = 0
    for p in paths:
        with open(p, newline='', encoding='utf-8-sig') as fh:
            r = csv.reader(fh)
            header = [sanitize(x, i) for i, x in enumerate(next(r))]
            these = [c for c in header if c != 'id' and not c.startswith('col_')]
            if cols is None:
                cols = these
                for c in cols:
                    total[c] = 0
                    groups[c] = {}
            idx = {c: header.index(c) for c in cols}
            k = idx[KEY]
            for row in r:
                rows += 1
                key = row[k]
                b = hashlib.md5(key.encode('utf-8')).hexdigest()[0]
                for c in cols:
                    v = h(key + '|' + row[idx[c]])
                    total[c] += v
                    groups[c][b] = groups[c].get(b, 0) + v
    print(json.dumps({'linhas': rows,
                      'colunas': {c: str(total[c]) for c in cols},
                      'grupos': {c: {b: str(v) for b, v in sorted(groups[c].items())} for c in cols}}))


if __name__ == '__main__':
    main(sys.argv[1:])
