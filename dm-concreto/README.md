# Controle de Qualidade de DM de Concreto

Site estático para GitHub Pages, sem backend e sem etapa de build.

## Como usar

1. Publique os arquivos na raiz do repositório do GitHub Pages.
2. Abra o site publicado.
3. Entre na aba **Importar planilha**.
4. Importe uma planilha `.xlsx`, `.xls` ou `.csv` no mesmo modelo do arquivo de controle de dormentes de concreto.

O painel inicia zerado por padrão. Os dados ficam apenas no navegador durante a sessão e não são enviados para nenhum servidor.

## Estrutura

```text
index.html
assets/
  css/
    styles.css
  js/
    app.js
.nojekyll
README.md
```

## Modelo esperado da planilha

Primeira aba com dois blocos:

- **Produção - Cavan Santa Lucia**: Data de fabricação, Lote, Projeto, Tipo de Dormente, Total da Produção, Série - Ensaio de Liberação.
- **Reprovados - Cavan Santa Lucia**: Semana, Data de Produção, Período de Inspeção, Lote, Projeto, Tipo, Molde, Cavidade, Motivo Detalhado, Motivo Indicador, Total de Refugos da Semana.

## Observação

A leitura de arquivos Excel usa SheetJS via CDN. Para importar planilhas, o usuário precisa abrir o site com internet ativa ou hospedar a biblioteca localmente.
