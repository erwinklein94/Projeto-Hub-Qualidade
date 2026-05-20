# Controle de Qualidade de Subcomponentes

Site estático para GitHub Pages, com importação local de planilhas `.xlsx`, dashboards de estoque, inspeções realizadas e cruzamento geral por **subcomponente/material + lote**.

O site **inicia zerado**. Nenhuma informação de estoque ou inspeção fica embutida no projeto. Os dashboards só são preenchidos depois que você importar uma planilha no mesmo modelo combinado.

## Estrutura

```text
.
├── index.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
└── .nojekyll
```

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos e pastas desta pasta para a raiz do repositório.
3. No GitHub, abra **Settings > Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha a branch `main` e a pasta `/root`.
6. Salve e aguarde o link do GitHub Pages ficar disponível.

## Abas do painel

- **Importar planilha**: carrega a planilha `.xlsx` no mesmo padrão.
- **Dashboard geral**: cruza estoque e inspeções por **subcomponente/material + lote**, mostrando cobertura, pendências, NC e diferenças entre saldo em estoque e QTD Estoque registrada na inspeção.
- **Dashboard de estoque**: visão exclusiva das entradas e saldo estimado.
- **Dashboard de inspeções realizadas**: visão exclusiva dos registros executados.
- **Cards por subcomponente**: resumo consolidado por item.

## Como usar

1. Abra o site publicado no GitHub Pages.
2. Entre na aba **Importar planilha**.
3. Arraste o arquivo `.xlsx` ou clique em **Selecionar arquivo .xlsx**.
4. Depois da leitura, o site muda para o **Dashboard geral** e libera as demais visões com os dados importados.

A importação acontece no navegador. Os dados da planilha não são enviados para servidor e não ficam salvos dentro do repositório.

## Modelo esperado da planilha

Aba de estoque, preferencialmente chamada `Estoque`, com cabeçalhos como:

- Data
- Fábrica
- Subcomponente
- Lote
- Quantidade Entrada
- Amostragem
- Data da Inspeção

Aba de inspeções realizadas, preferencialmente chamada `Executados` ou com nome contendo `Inspeções`, com cabeçalhos como:

- Dia Inspeção
- Semana
- Material
- Fornecedor
- Lote
- QTD Estoque
- QTD Amostra
- QTD Inspecionado
- QTD NC
- Status

## Teste local

Este projeto não depende de build. Você pode abrir o `index.html` diretamente, mas a importação da planilha precisa que a biblioteca XLSX carregue pela internet.

Para simular melhor o GitHub Pages, use um servidor estático simples:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```
