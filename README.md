# 🦺 Sistema de Controle de EPIs — LSG Sky Chefs

Sistema web para gestão de Equipamentos de Proteção Individual,
com integração ao Google Sheets via proxy Vercel (contorna bloqueios corporativos).

---

## 📁 Estrutura do Projeto

```
epi-control/
│
├── api/
│   └── gas.js              ← Proxy serverless Vercel → Google Apps Script
│
├── src/
│   ├── main.jsx            ← Ponto de entrada React
│   └── App.jsx             ← Aplicação principal
│
├── public/
│   └── logo lsg.png        ← Logo da LSG Sky Chefs (coloque aqui)
│
├── index.html              ← HTML base
├── vite.config.js          ← Configuração do Vite
├── package.json            ← Dependências
├── vercel.json             ← Configuração de deploy Vercel
└── Codigo_Apps_Script.gs   ← Script para colar no Google Apps Script
```

---

## 🚀 Deploy passo a passo

### ETAPA 1 — Configurar o Google Apps Script

1. Abra sua planilha:
   `https://docs.google.com/spreadsheets/d/1UmtuYXLFAVGhihO_rhZSda4b-BsXVe0UM4zn3wlGfS0`

2. No menu: **Extensões → Apps Script**

3. Apague o código padrão e cole o conteúdo de `Codigo_Apps_Script.gs`

4. Clique em **Salvar** (ícone de disquete)

5. Clique em **Implantar → Nova implantação**
   - Tipo: **App da Web**
   - Descrição: `EPI Control v1`
   - Executar como: **Eu (seu e-mail)**
   - Quem pode acessar: **Qualquer pessoa**

6. Clique em **Implantar** e **autorize** o acesso quando solicitado

7. **Copie a URL gerada** — ela terá o formato:
   ```
   https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec
   ```

---

### ETAPA 2 — Subir o projeto no GitHub

1. Crie um repositório novo no GitHub (pode ser privado)

2. Coloque todos os arquivos deste projeto no repositório

3. Certifique-se de que o arquivo `logo lsg.png` está dentro da pasta `public/`

4. Faça o commit e push para o GitHub

---

### ETAPA 3 — Configurar o Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login com sua conta GitHub

2. Clique em **Add New Project** e importe o repositório

3. Na tela de configuração, **antes de fazer deploy**, vá em:
   **Environment Variables** e adicione:

   | Nome      | Valor                                          |
   |-----------|------------------------------------------------|
   | `GAS_URL` | `https://script.google.com/macros/s/XXX/exec`  |

   *(cole a URL do Apps Script que você copiou na Etapa 1)*

4. Clique em **Deploy**

5. Aguarde o build terminar — o Vercel fornecerá uma URL do tipo:
   ```
   https://epi-control-lsg.vercel.app
   ```

---

### ETAPA 4 — Preparar a planilha

A aba da planilha deve se chamar exatamente **`EPIs`**.

O sistema criará o cabeçalho automaticamente na primeira vez que você
salvar um EPI. Mas se quiser criar manualmente, a estrutura é:

| ID | Nome do EPI | CA | Local | Quantidade | Mínimo |
|----|-------------|----|----|----|----|

- **Local** deve ser exatamente `Almoxarifado` ou `Segurança do Trabalho`
- **Quantidade** e **Mínimo** são números inteiros

---

## 🔑 Acesso ao sistema

- Senha padrão: `seguranca2024`
- Para alterar, edite a linha no arquivo `src/App.jsx`:
  ```js
  const ADMIN_PASSWORD = "seguranca2024";
  ```
  Depois faça commit e o Vercel atualiza automaticamente.

---

## ⚙️ Como o proxy funciona

```
Browser (rede corporativa)
        │
        │  GET/POST /api/gas
        ▼
   Vercel Serverless (api/gas.js)
        │
        │  GET/POST → GAS_URL (variável de ambiente)
        ▼
   Google Apps Script
        │
        ▼
   Google Sheets
```

O browser **nunca** faz chamada direta ao Google Apps Script.
Toda comunicação passa pelo servidor Vercel, contornando qualquer
bloqueio de rede corporativa.

---

## 🔄 Atualizar após mudanças

Qualquer alteração no código: faça commit no GitHub →
o Vercel detecta e faz o redeploy automaticamente em ~1 minuto.

---

## 🛠️ Executar localmente (desenvolvimento)

```bash
# Instalar dependências
npm install

# Criar arquivo .env.local com a URL do GAS
echo "GAS_URL=https://script.google.com/macros/s/XXX/exec" > .env.local

# Iniciar servidor de desenvolvimento
npm run dev
```

Acesse: `http://localhost:5173`
