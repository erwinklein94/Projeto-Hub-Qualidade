# Ajuste visual Rumo + Zoom out — Hub de Qualidade

Este pacote aplica no projeto unificado o mesmo padrão visual Rumo usado nos outros sites, já com uma interface mais compacta para que o usuário veja mais informações na mesma tela.

## O que foi alterado

- Página inicial do Hub com cards menores, mais atalhos visíveis e links locais para `dm-concreto/` e `subcomponentes/`.
- Logo e favicon Rumo localizados em `assets/brand`, evitando dependência de imagem externa.
- Tema claro Rumo como padrão visual, mantendo o botão para alternar para tema escuro.
- Painel DM de Concreto compactado: cabeçalho, filtros, abas, KPIs, gráficos, tabelas e seção semanal.
- Painel Subcomponentes compactado: cabeçalho, abas, KPIs, filtros, cards, gráficos, tabelas e listas comparativas.
- Cache bust em CSS/JS para GitHub Pages carregar a nova versão.

## Segurança

Não houve alteração nas regras de cálculo, importação de planilhas, dados ou lógica principal dos painéis. As mudanças são visuais e de organização de tela.
