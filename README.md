# Controle de qualidade - projeto unificado

Este projeto junta os dois painéis em um único código, mantendo cada site separado em uma pasta própria.

## Estrutura

```text
controle-qualidade-unificado/
├── index.html                 # Página inicial azul escuro com os dois botões
├── subcomponentes/            # Site de Subcomponentes com assets e dados próprios
└── dm-concreto/               # Site de Controle de Qualidade de DM de Concreto
```

## Como usar

Abra o arquivo `index.html` da raiz ou publique a pasta inteira no GitHub Pages/servidor estático.

Na página inicial:

- **Subcomponentes** abre `./subcomponentes/`
- **DM de Concreto** abre `./dm-concreto/`

Os projetos continuam separados para evitar conflito entre os arquivos `assets/css/styles.css` e `assets/js/app.js` de cada painel.
